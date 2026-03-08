"""
services/pension_health_engine.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PMS — Phase 2B  |  Pension Health Score & Insurance Toggle

Computes a composite Pension Health Score (PHS, 0–1000) from
live behavioral signals and uses it to toggle the worker's
linked insurance policy between ACTIVE and PAUSED.

Score components:
    Deposit Frequency   — 20 pts per LOCKED deposit, max 300
    Income Verification — verified_ratio × 200
    Pension Ratio       — pension_vault / total × 250
    Liquid Buffer       — 150 pts if liquid_vault ≥ ₹200
    Streak Bonus        — consecutive days × 14 pts, max 100

Insurance gate:
    score ≥ 800  →  ACTIVE
    score <  800  →  PAUSED

DB reads:   users        ← get_user()
            transactions ← get_verified_income_ratio(),
                           get_recent_deposit_streak()
DB writes:  users        ← update_insurance_status()
            notifications ← create_notification()  (insurance warning)

Prototype removals:
    ✗  self.ledger = [10 identical synthetic entries]  (fake data)
    ✗  self.user = {"vault_a_pension": 3000.0, ...}    (hardcoded)
    ✗  score += 200  (hardcoded "fully verified")
    ✗  if deposit_days >= 7: score += 100  (total count, not streak)
    ✗  penalty = amount * 0.8  (dimensionally wrong — rupees ≠ score points)
    ✗  while True / input() demo loop
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import logging
import os

from database.db_helpers import (
    get_user,
    get_verified_income_ratio,
    get_recent_deposit_streak,
    update_insurance_status,
    create_notification,
)
from database.mongo_connection import get_transactions_collection

logger = logging.getLogger(__name__)

# ── Score weights ─────────────────────────────────────────────────────────────
_THRESHOLD           = int(os.getenv("INSURANCE_SCORE_THRESHOLD", "800"))
_MAX_SCORE           = 1000
_W_DEPOSIT_FREQ      = 300
_W_INCOME_VERIF      = 200
_W_PENSION_RATIO     = 250
_W_LIQUID_BUFFER     = 150
_W_STREAK_BONUS      = 100
_LIQUID_BUFFER_MIN   = 200.0   # ₹ threshold for full buffer points
_STREAK_PT_PER_DAY   = 14      # 7 days streak ≈ 98 pts → near full bonus


class PensionHealthService:
    """
    Behavior-based insurance eligibility scorer.

    compute_health_score() is the canonical entry point — called:
      • After every deposit
      • After every withdrawal
      • Daily by cron

    simulate_withdrawal() lets the frontend show a warning BEFORE
    the worker commits to a large withdrawal.
    """

    # ── Core computation (pure — no DB calls, easy to unit-test) ─────────────

    def _compute_from_values(
        self,
        pension_vault: float,
        liquid_vault: float,
        deposit_count: int,
        verified_ratio: float,
        streak: int,
    ) -> float:
        """
        Compute the raw score from explicit inputs.

        Used for both live scoring (with DB values) and withdrawal
        simulation (with hypothetical post-withdrawal values).
        """
        score = 0.0

        # 1. Deposit frequency: 20 pts per deposit, capped
        score += min(deposit_count * 20, _W_DEPOSIT_FREQ)

        # 2. Income verification ratio
        score += verified_ratio * _W_INCOME_VERIF

        # 3. Pension vault ratio (locked savings proportion)
        total = pension_vault + liquid_vault
        if total > 0:
            score += (pension_vault / total) * _W_PENSION_RATIO

        # 4. Liquid buffer (emergency readiness)
        if liquid_vault >= _LIQUID_BUFFER_MIN:
            score += _W_LIQUID_BUFFER

        # 5. Streak bonus — consecutive active saving days
        score += min(streak * _STREAK_PT_PER_DAY, _W_STREAK_BONUS)

        return round(min(score, _MAX_SCORE), 2)

    def _deposit_count(self, pension_id: str) -> int:
        """Count total LOCKED deposits for a worker from the transactions collection."""
        return get_transactions_collection().count_documents({
            "pension_id": pension_id,
            "status":     "LOCKED",
            "type":       {"$in": ["deposit", "cash_bridge", "payer_income"]},
        })

    # ── Public API ────────────────────────────────────────────────────────────

    def compute_health_score(self, pension_id: str) -> dict:
        """
        Compute, persist, and return the Pension Health Score.

        Fires an in-app insurance warning notification if the worker's
        status just transitioned from ACTIVE → PAUSED.

        Returns:
        {
            "pension_id":          str,
            "score":               float,   # 0–1000
            "insurance_status":    str,     # "ACTIVE" | "PAUSED"
            "threshold":           int,
            "component_breakdown": {
                "deposit_frequency":   float,
                "income_verification": float,
                "pension_ratio":       float,
                "liquid_buffer":       float,
                "streak_bonus":        float,
            },
            "deposit_count":  int,
            "verified_ratio": float,
            "streak_days":    int,
            "pension_vault":  float,
            "liquid_vault":   float,
        }
        """
        user = get_user(pension_id)
        if user is None:
            raise ValueError(f"Worker '{pension_id}' not found")

        pension_vault  = user["pension_vault"]
        liquid_vault   = user["liquid_vault"]
        prev_status    = user.get("insurance_status", "PAUSED")

        verified_ratio = get_verified_income_ratio(pension_id)
        streak         = get_recent_deposit_streak(pension_id)
        dep_count      = self._deposit_count(pension_id)

        score  = self._compute_from_values(
            pension_vault, liquid_vault, dep_count, verified_ratio, streak
        )
        status = "ACTIVE" if score >= _THRESHOLD else "PAUSED"

        update_insurance_status(pension_id, score, status)

        # Warn worker if insurance just got paused
        if prev_status == "ACTIVE" and status == "PAUSED":
            create_notification(
                pension_id=pension_id,
                notification_type="insurance_warning",
                title="⚠️ Insurance Coverage Paused",
                message=(
                    f"Your Pension Health Score dropped to {score:.0f} "
                    f"(minimum {_THRESHOLD} for active coverage). "
                    "Keep saving daily to restore it."
                ),
                channel="in_app",
            )
            logger.warning(
                "[Health] Insurance PAUSED: pension_id=%s score=%.2f",
                pension_id, score,
            )

        # Component breakdown for frontend transparency
        total = pension_vault + liquid_vault
        pension_ratio_pct = (pension_vault / total) if total > 0 else 0.0

        breakdown = {
            "deposit_frequency":   round(min(dep_count * 20, _W_DEPOSIT_FREQ), 2),
            "income_verification": round(verified_ratio * _W_INCOME_VERIF, 2),
            "pension_ratio":       round(pension_ratio_pct * _W_PENSION_RATIO, 2),
            "liquid_buffer":       float(_W_LIQUID_BUFFER) if liquid_vault >= _LIQUID_BUFFER_MIN else 0.0,
            "streak_bonus":        round(min(streak * _STREAK_PT_PER_DAY, _W_STREAK_BONUS), 2),
        }

        logger.info(
            "[Health] Score: pension_id=%s score=%.2f status=%s "
            "streak=%d deposits=%d verified=%.2f",
            pension_id, score, status, streak, dep_count, verified_ratio,
        )

        return {
            "pension_id":          pension_id,
            "score":               score,
            "insurance_status":    status,
            "threshold":           _THRESHOLD,
            "component_breakdown": breakdown,
            "deposit_count":       dep_count,
            "verified_ratio":      round(verified_ratio, 4),
            "streak_days":         streak,
            "pension_vault":       pension_vault,
            "liquid_vault":        liquid_vault,
        }

    def simulate_withdrawal(self, pension_id: str, amount: float) -> dict:
        """
        Estimate the score impact of a proposed withdrawal WITHOUT executing it.

        Simulates what the vault balances would be after the withdrawal
        (liquid first, then pension), then recomputes the full score.

        This replaces the prototype's broken `penalty = amount * 0.8` formula
        which subtracted a rupee amount from a dimensionless 0–1000 score.

        Returns:
        {
            "pension_id":          str,
            "requested_amount":    float,
            "current_score":       float,
            "projected_score":     float,
            "score_delta":         float,   # negative = score drops
            "current_status":      str,
            "projected_status":    str,
            "insurance_risk":      bool,    # True if ACTIVE → PAUSED
            "liquid_vault_after":  float,
            "pension_vault_after": float,
            "warning":             str | None,
        }
        """
        if amount <= 0:
            raise ValueError(f"Simulation amount must be positive, got ₹{amount}")

        user = get_user(pension_id)
        if user is None:
            raise ValueError(f"Worker '{pension_id}' not found")

        liquid  = user["liquid_vault"]
        pension = user["pension_vault"]
        total   = round(liquid + pension, 2)

        if amount > total:
            raise ValueError(
                f"Insufficient funds: ₹{amount} requested, ₹{total} available"
            )

        # Simulate vault drain (same logic as execute_withdrawal)
        liquid_debit  = min(amount, liquid)
        pension_debit = round(amount - liquid_debit, 2)
        hypo_liquid   = round(liquid  - liquid_debit,  2)
        hypo_pension  = round(pension - pension_debit, 2)

        # Fetch behavioral signals — unchanged by the simulation
        verified_ratio = get_verified_income_ratio(pension_id)
        streak         = get_recent_deposit_streak(pension_id)
        dep_count      = self._deposit_count(pension_id)

        current_score   = self._compute_from_values(
            pension, liquid, dep_count, verified_ratio, streak
        )
        projected_score = self._compute_from_values(
            hypo_pension, hypo_liquid, dep_count, verified_ratio, streak
        )

        current_status   = "ACTIVE" if current_score   >= _THRESHOLD else "PAUSED"
        projected_status = "ACTIVE" if projected_score >= _THRESHOLD else "PAUSED"
        insurance_risk   = (current_status == "ACTIVE" and projected_status == "PAUSED")

        if insurance_risk:
            warning = (
                f"⚠️ This withdrawal would drop your Pension Health Score from "
                f"{current_score:.0f} to {projected_score:.0f}, "
                "pausing your free insurance coverage."
            )
        elif projected_score < current_score:
            warning = (
                f"Your score will decrease from {current_score:.0f} "
                f"to {projected_score:.0f} after this withdrawal."
            )
        else:
            warning = None

        logger.info(
            "[Health] Simulation: pension_id=%s amount=₹%.2f "
            "score %.2f → %.2f insurance_risk=%s",
            pension_id, amount, current_score, projected_score, insurance_risk,
        )

        return {
            "pension_id":          pension_id,
            "requested_amount":    amount,
            "current_score":       current_score,
            "projected_score":     projected_score,
            "score_delta":         round(projected_score - current_score, 2),
            "current_status":      current_status,
            "projected_status":    projected_status,
            "insurance_risk":      insurance_risk,
            "liquid_vault_after":  hypo_liquid,
            "pension_vault_after": hypo_pension,
            "warning":             warning,
        }

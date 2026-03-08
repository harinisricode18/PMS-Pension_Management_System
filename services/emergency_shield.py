"""
services/emergency_shield.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PMS — Phase 2B  |  Emergency Shield Service

Processes every incoming deposit with an 80/20 split:
    80% → pension_vault  (locked, long-term growth)
    20% → liquid_vault   (accessible emergency buffer)

Also acts as the pre-flight gatekeeper before a withdrawal is
submitted to WithdrawalGovernanceService — telling the frontend
whether Dual-Key approval will be required.

DB reads:   users        ← get_user()  (live vault balances)
DB writes:  users        ← deposit_split()  (pension_vault + liquid_vault)
            transactions ← inside deposit_split()  (LOCKED entry)
            notifications ← create_notification()

Prototype removals:
    ✗  self.users = {"W-1092": {...}}    (hardcoded dict)
    ✗  self.PENSION_RATIO = 0.80         (now env-var configurable)
    ✗  Sequential vault mutation         (atomic via deposit_split())
    ✗  print() output throughout
    ✗  while True / input() demo loop
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import logging
import os
from typing import Optional

from database.db_helpers import (
    get_user,
    deposit_split,
    create_notification,
)

logger = logging.getLogger(__name__)

# ── Split ratios (override via .env) ─────────────────────────────────────────
_PENSION_RATIO   = float(os.getenv("PENSION_SPLIT_RATIO", "0.80"))
_LIQUID_RATIO    = float(os.getenv("LIQUID_SPLIT_RATIO",  "0.20"))
_MIN_DEPOSIT     = float(os.getenv("MINIMUM_DEPOSIT_AMOUNT", "5.0"))

assert abs(_PENSION_RATIO + _LIQUID_RATIO - 1.0) < 1e-9, (
    "PENSION_SPLIT_RATIO + LIQUID_SPLIT_RATIO must equal 1.0"
)


class EmergencyShieldService:
    """
    Deposit processor and withdrawal eligibility gatekeeper.

    process_deposit() is the single entry point for ALL deposit flows:
        - Self-initiated app deposits  (POST /deposit)
        - Payer-verified deposits      (LedgerService.confirm_payment)
        - Agent cash bridge deposits   (DigitalBridgeService.confirm_cash_deposit)

    Note: LedgerService and DigitalBridgeService call deposit_split()
    directly via db_helpers for atomic multi-collection transactions.
    Standalone app deposits route through this service class.
    """

    def process_deposit(
        self,
        pension_id: str,
        amount: float,
        source_verified: bool = False,
        related_token_id: Optional[str] = None,
        related_agent_id: Optional[str] = None,
    ) -> dict:
        """
        Apply the 80/20 split to an incoming deposit.

        Args:
            pension_id:       Worker's pension ID (from JWT session).
            amount:           Total deposit amount.
            source_verified:  True if payer/agent QR confirmed; False if self-reported.
            related_token_id: Token that initiated this deposit (if any).
            related_agent_id: Agent ID for cash bridge deposits (if any).

        Returns:
        {
            "pension_id":          str,
            "total_deposited":     float,
            "pension_credit":      float,   # 80% (or configured ratio)
            "liquid_credit":       float,   # 20%
            "pension_vault_after": float,
            "liquid_vault_after":  float,
            "total_savings_after": float,
            "transaction_id":      str,
            "source_verified":     bool,
            "split_ratios":        {"pension": float, "liquid": float},
        }

        Raises:
            ValueError  — amount below minimum or worker not found
            RuntimeError — DB write failure
        """
        if amount < _MIN_DEPOSIT:
            raise ValueError(
                f"Deposit ₹{amount} is below the minimum of ₹{_MIN_DEPOSIT}"
            )

        user = get_user(pension_id)
        if user is None:
            raise ValueError(f"Worker '{pension_id}' not found")

        # Atomic 80/20 split — raises RuntimeError on DB failure
        result = deposit_split(
            pension_id=pension_id,
            total_amount=amount,
            source_verified=source_verified,
            related_token_id=related_token_id,
            related_agent_id=related_agent_id,
        )

        total_after = round(
            result["pension_vault_after"] + result["liquid_vault_after"], 2
        )

        logger.info(
            "[Shield] Deposit processed: pension_id=%s amount=₹%.2f "
            "pension=₹%.2f liquid=₹%.2f total_after=₹%.2f verified=%s",
            pension_id, amount,
            result["pension_credit"], result["liquid_credit"],
            total_after, source_verified,
        )

        create_notification(
            pension_id=pension_id,
            notification_type="deposit_confirmed",
            title="Deposit Confirmed ✅",
            message=(
                f"₹{result['pension_credit']:.2f} secured in your pension savings. "
                f"₹{result['liquid_credit']:.2f} added to your emergency fund."
            ),
            channel="in_app",
        )

        return {
            "pension_id":          pension_id,
            "total_deposited":     amount,
            "pension_credit":      result["pension_credit"],
            "liquid_credit":       result["liquid_credit"],
            "pension_vault_after": result["pension_vault_after"],
            "liquid_vault_after":  result["liquid_vault_after"],
            "total_savings_after": total_after,
            "transaction_id":      result["transaction_id"],
            "source_verified":     source_verified,
            "split_ratios":        {"pension": _PENSION_RATIO, "liquid": _LIQUID_RATIO},
        }

    def check_withdrawal_eligibility(self, pension_id: str, amount: float) -> dict:
        """
        Pre-flight check — does the withdrawal require Dual-Key approval?

        Does NOT execute the withdrawal. Called by the frontend before
        showing the withdrawal confirmation dialog, so the UI can render
        a nominee approval warning if required.

        Returns:
        {
            "pension_id":        str,
            "requested_amount":  float,
            "liquid_vault":      float,
            "pension_vault":     float,
            "total_available":   float,
            "instant_eligible":  bool,   # True → frictionless
            "dual_key_required": bool,   # True → nominee OTP needed
            "sufficient_funds":  bool,
            "message":           str,
        }
        """
        user = get_user(pension_id)
        if user is None:
            raise ValueError(f"Worker '{pension_id}' not found")

        liquid  = user["liquid_vault"]
        pension = user["pension_vault"]
        total   = round(liquid + pension, 2)

        if amount > total:
            return {
                "pension_id":        pension_id,
                "requested_amount":  amount,
                "liquid_vault":      liquid,
                "pension_vault":     pension,
                "total_available":   total,
                "instant_eligible":  False,
                "dual_key_required": False,
                "sufficient_funds":  False,
                "message": (
                    f"Insufficient funds. Available: ₹{total:.2f}, "
                    f"requested: ₹{amount:.2f}."
                ),
            }

        instant  = amount <= liquid
        dual_key = amount > liquid

        if instant:
            msg = (
                f"₹{amount:.2f} is within your liquid fund (₹{liquid:.2f}). "
                "Withdrawal will be processed instantly."
            )
        else:
            pension_draw = round(amount - liquid, 2)
            msg = (
                f"₹{amount:.2f} exceeds your liquid fund (₹{liquid:.2f}). "
                f"₹{pension_draw:.2f} will be drawn from pension savings — "
                "your nominee's approval is required."
            )

        logger.info(
            "[Shield] Eligibility check: pension_id=%s amount=₹%.2f "
            "instant=%s dual_key=%s",
            pension_id, amount, instant, dual_key,
        )

        return {
            "pension_id":        pension_id,
            "requested_amount":  amount,
            "liquid_vault":      liquid,
            "pension_vault":     pension,
            "total_available":   total,
            "instant_eligible":  instant,
            "dual_key_required": dual_key,
            "sufficient_funds":  True,
            "message":           msg,
        }

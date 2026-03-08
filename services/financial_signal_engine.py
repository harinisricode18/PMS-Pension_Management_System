"""
services/financial_signal_engine.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PMS — Phase 2B  |  Financial Signal Processing Service

Converts raw daily income records into a safe, adaptive savings
target using an Exponential Moving Average whose smoothing factor
(alpha) adjusts inversely to income volatility.

Core formula:
    S_t = α × Y_t  +  (1 − α) × S_{t-1}

DB reads:   income_records      ← get_income_history()
            users.last_savings_target ← get_user()
DB writes:  users.last_savings_target ← update_user_savings_target()
            income_records            ← record_income()

Prototype removals:
    ✗  stable_df / chaotic_df  (undefined global DataFrames → crashed)
    ✗  current_target = 20.0   (hardcoded seed → now read from DB)
    ✗  processed_stable / processed_chaotic prints
    ✗  Module-level code that executed on import
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import logging
import os
from datetime import datetime, timezone
from typing import Optional

import numpy as np
import pandas as pd

from database.db_helpers import (
    get_user,
    get_income_history,
    update_user_savings_target,
    record_income,
)

logger = logging.getLogger(__name__)

# ── Tunable constants (override via environment) ──────────────────────────────
_WINDOW_DAYS    = int(os.getenv("FSP_WINDOW_DAYS", "7"))
_HISTORY_DAYS   = int(os.getenv("FSP_HISTORY_DAYS", "30"))
_TARGET_FLOOR   = float(os.getenv("FSP_TARGET_FLOOR", "10.0"))
_TARGET_CEILING = float(os.getenv("FSP_TARGET_CEILING", "100.0"))
_COLD_START     = float(os.getenv("FSP_COLD_START_SEED", "20.0"))

# Alpha lookup table — std_dev threshold → smoothing factor
# High volatility → low alpha (react slowly, smooth out chaos)
_ALPHA_TABLE = [
    (100.0, 0.05),
    (60.0,  0.10),
    (20.0,  0.15),
]
_ALPHA_STABLE = 0.20   # fallback for low-volatility / stable earners


class FinancialSignalService:
    """
    Adaptive EMA savings target calculator.

    Called once per day per active worker (cron job) and immediately
    after any new income record is inserted (POST /income).
    """

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _dynamic_alpha(self, window: np.ndarray) -> float:
        """
        Derive smoothing factor from std deviation of the rolling window.
        Preserves the exact prototype logic; extracted into a testable method.
        """
        if len(window) < 2:
            return 0.10          # not enough data — use conservative default
        std_dev = float(np.std(window))
        for threshold, alpha in _ALPHA_TABLE:
            if std_dev > threshold:
                return alpha
        return _ALPHA_STABLE

    def _run_ema(
        self,
        incomes: list[float],
        seed: float,
    ) -> tuple[float, float, float]:
        """
        Run the full EMA pass over a list of income values (oldest → newest).

        Returns:
            (final_target, alpha_last, std_dev_last)
        """
        current = seed
        alpha_last = _ALPHA_STABLE
        std_dev_last = 0.0

        for i, income in enumerate(incomes):
            window_start = max(0, i - _WINDOW_DAYS + 1)
            window = np.array(incomes[window_start : i + 1], dtype=float)

            alpha = self._dynamic_alpha(window)
            std_dev_last = float(np.std(window)) if len(window) > 1 else 0.0

            new_target = (alpha * income) + ((1 - alpha) * current)
            new_target = float(np.clip(new_target, _TARGET_FLOOR, _TARGET_CEILING))

            current = new_target
            alpha_last = alpha

        return current, alpha_last, std_dev_last

    # ── Public API ────────────────────────────────────────────────────────────

    def calculate_safe_savings(self, pension_id: str) -> dict:
        """
        Compute and persist today's Safe Savings Target for a worker.

        Returns a JSON-ready dict:
        {
            "pension_id":       str,
            "safe_target":      float,   # what the worker should save today
            "alpha_used":       float,
            "income_today":     float,
            "std_dev_window":   float,
            "survival_minimum": float,
            "records_used":     int,
        }

        Raises ValueError if the worker does not exist.
        """
        user = get_user(pension_id)
        if user is None:
            raise ValueError(f"Worker '{pension_id}' not found")

        survival_min = user.get("survival_minimum", 150.0)
        seed         = user.get("last_savings_target") or _COLD_START

        records = get_income_history(pension_id, days=_HISTORY_DAYS)

        if not records:
            logger.info(
                "[FSP] No history for %s — returning cold-start target ₹%.2f",
                pension_id, seed,
            )
            return {
                "pension_id":       pension_id,
                "safe_target":      round(seed, 2),
                "alpha_used":       0.10,
                "income_today":     0.0,
                "std_dev_window":   0.0,
                "survival_minimum": survival_min,
                "records_used":     0,
            }

        # records are sorted oldest-first by get_income_history
        incomes     = [float(r["income"]) for r in records]
        income_today = incomes[-1]

        ema_raw, alpha_last, std_dev_last = self._run_ema(incomes, seed)

        # Survival buffer: never suggest saving more than the day's surplus
        safe_surplus = max(income_today - survival_min, 0.0)
        final_target = round(min(ema_raw, safe_surplus), 2)
        final_target = max(final_target, 0.0)

        # Persist S_t so the next run seeds correctly
        update_user_savings_target(pension_id, final_target)

        logger.info(
            "[FSP] pension_id=%s income=₹%.2f ema_raw=₹%.2f "
            "buffer=₹%.2f safe_target=₹%.2f alpha=%.2f",
            pension_id, income_today, ema_raw,
            safe_surplus, final_target, alpha_last,
        )

        return {
            "pension_id":       pension_id,
            "safe_target":      final_target,
            "alpha_used":       alpha_last,
            "income_today":     income_today,
            "std_dev_window":   round(std_dev_last, 4),
            "survival_minimum": survival_min,
            "records_used":     len(records),
        }

    def record_daily_income(
        self,
        pension_id: str,
        amount: float,
        date: Optional[datetime] = None,
        source: str = "self_reported",
        notes: Optional[str] = None,
    ) -> dict:
        """
        Persist a daily income entry and immediately recompute the target.

        Called by POST /income.

        Returns:
        {
            "income_record":  {...},
            "updated_target": {...},   # result of calculate_safe_savings()
        }
        """
        if amount < 0:
            raise ValueError(f"Income amount cannot be negative, got {amount}")

        income_doc = record_income(
            pension_id=pension_id,
            amount=amount,
            date=date or datetime.now(timezone.utc),
            source=source,
            notes=notes,
        )

        updated_target = self.calculate_safe_savings(pension_id)

        logger.info(
            "[FSP] Income logged: pension_id=%s amount=₹%.2f source=%s "
            "→ new target ₹%.2f",
            pension_id, amount, source, updated_target["safe_target"],
        )

        return {
            "income_record":  income_doc,
            "updated_target": updated_target,
        }

"""
services/pension_projection.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PMS — Phase 3  |  Retirement Income Projection Engine

Estimates a worker's monthly pension income at retirement age (60)
by compounding the current pension_vault balance at an NPS-like
8% annual return.

Design decisions:
  • Only pension_vault is used — liquid_vault is excluded by design.
    The 80/20 deposit split already ring-fences pension_vault as the
    long-term, immovable retirement corpus; using liquid savings in
    a 20-year projection would misrepresent the worker's retirement
    position and encourage over-reliance on the withdrawable buffer.
  • Retirement age is fixed at 60 — aligns with India's NPS exit norm.
  • Payout assumption: 20-year drawdown (age 60–80), yielding a simple
    monthly pension = corpus / 240. This is deliberately conservative
    and avoids annuity complexity unsuitable for informal-sector workers.
  • Workers already ≥ 60 receive a "current corpus" estimate based on
    their live pension_vault with no further compounding applied.

Calculation model:
    FV  = pension_vault × (1 + r) ^ t      r=0.08, t=years_to_retirement
    MP  = FV / 240                          240 = 20 years × 12 months

DB reads:   users  ←  get_user()
DB writes:  none   —  pure read-and-compute

Architecture: routes → this service → database (db_helpers only)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import logging
import os
from datetime import datetime, timezone

from database.db_helpers import get_user

logger = logging.getLogger(__name__)

# ── Projection constants ──────────────────────────────────────────────────────
_RETIREMENT_AGE:    int   = 60
_ANNUAL_RETURN:     float = float(os.getenv("PROJECTION_ANNUAL_RETURN", "0.08"))
_PAYOUT_MONTHS:     int   = int(os.getenv("PROJECTION_PAYOUT_MONTHS", "240"))  # 20 yrs


class PensionProjectionService:
    """
    Retirement income estimator for informal-sector workers.

    project_retirement_income() is the sole public method — it is
    stateless and safe to call on every dashboard load.

    No DB writes occur here: the projection is always recomputed
    live from the latest pension_vault balance and date_of_birth.
    """

    # ── Internal helpers (pure functions — no I/O, easy to unit-test) ────────

    @staticmethod
    def _current_age(date_of_birth: datetime) -> int:
        """
        Calculate age in whole years using UTC-aware datetime arithmetic.

        Deliberately avoids timezone-naive comparisons to prevent
        off-by-one errors around midnight on the worker's birthday.
        """
        today = datetime.now(timezone.utc).date()
        dob   = (
            date_of_birth.date()
            if isinstance(date_of_birth, datetime)
            else date_of_birth
        )
        age = today.year - dob.year - (
            (today.month, today.day) < (dob.month, dob.day)
        )
        return age

    @staticmethod
    def _project_corpus(
        current_vault: float,
        years: int,
        annual_rate: float = _ANNUAL_RETURN,
    ) -> float:
        """
        Compound growth formula:  FV = PV × (1 + r) ^ t

        Returns 0.0 immediately if years ≤ 0 — no compounding for
        workers already at or past retirement age.
        """
        if years <= 0 or current_vault <= 0:
            return round(current_vault, 2)
        return round(current_vault * (1 + annual_rate) ** years, 2)

    @staticmethod
    def _monthly_pension(corpus: float, payout_months: int = _PAYOUT_MONTHS) -> float:
        """
        Derive a simple monthly drawdown from the retirement corpus.

        Formula: corpus / payout_months  (240 months = 20-year horizon)

        Returns 0.0 if corpus is zero (new worker with no savings yet).
        """
        if corpus <= 0 or payout_months <= 0:
            return 0.0
        return round(corpus / payout_months, 2)

    # ── Public API ────────────────────────────────────────────────────────────

    def project_retirement_income(self, pension_id: str) -> dict:
        """
        Estimate the worker's monthly pension income at age 60.

        Steps:
        1. Fetch the worker document via get_user().
        2. Validate required fields (date_of_birth, pension_vault).
        3. Compute current_age and years_remaining.
        4. Project the pension_vault corpus to retirement using 8% p.a.
        5. Divide the corpus by 240 to derive estimated monthly pension.
        6. Return a structured dict suitable for direct API serialisation.

        Raises:
            ValueError  — worker not found, or data integrity issue
                          (missing date_of_birth or negative vault).

        Returns:
        {
            "pension_id":                  str,
            "current_age":                 int,
            "retirement_age":              int,   # always 60
            "years_remaining":             int,   # 0 if already ≥ 60
            "current_pension_vault":       float, # ₹ today
            "projected_retirement_corpus": float, # ₹ at age 60
            "estimated_monthly_pension":   float, # ₹ per month
            "annual_return_assumed":       float, # 0.08
            "payout_horizon_months":       int,   # 240
            "projection_note":             str,   # human-readable caveat
        }
        """
        # ── 1. Fetch worker ───────────────────────────────────────────────────
        user = get_user(pension_id)
        if user is None:
            raise ValueError(f"Worker '{pension_id}' not found.")

        # ── 2. Validate required fields ───────────────────────────────────────
        date_of_birth = user.get("date_of_birth")
        if date_of_birth is None:
            raise ValueError(
                f"Worker '{pension_id}' has no date_of_birth on record. "
                "Cannot compute retirement projection."
            )

        pension_vault: float = user.get("pension_vault", 0.0)
        if pension_vault < 0:
            raise ValueError(
                f"Worker '{pension_id}' has an invalid pension_vault "
                f"balance: ₹{pension_vault}. Cannot project."
            )

        # ── 3. Age and time-to-retirement ─────────────────────────────────────
        current_age      = self._current_age(date_of_birth)
        years_remaining  = max(0, _RETIREMENT_AGE - current_age)

        # ── 4. Project corpus ─────────────────────────────────────────────────
        projected_corpus = self._project_corpus(pension_vault, years_remaining)

        # ── 5. Monthly pension estimate ───────────────────────────────────────
        monthly_pension  = self._monthly_pension(projected_corpus)

        # ── 6. Contextual note ────────────────────────────────────────────────
        if current_age >= _RETIREMENT_AGE:
            note = (
                f"You have reached retirement age. "
                f"Your current pension vault of ₹{pension_vault:,.2f} would support "
                f"approximately ₹{monthly_pension:,.2f}/month over "
                f"{_PAYOUT_MONTHS // 12} years."
            )
        else:
            note = (
                f"Projection assumes {_ANNUAL_RETURN * 100:.0f}% annual compounding "
                f"on pension vault only (liquid vault excluded) over {years_remaining} year(s). "
                f"Estimated monthly payout assumes a {_PAYOUT_MONTHS // 12}-year drawdown "
                f"from age {_RETIREMENT_AGE}. Figures are indicative — actual NPS returns vary."
            )

        logger.info(
            "[Projection] pension_id=%s age=%d years_remaining=%d "
            "vault=₹%.2f corpus=₹%.2f monthly=₹%.2f",
            pension_id, current_age, years_remaining,
            pension_vault, projected_corpus, monthly_pension,
        )

        return {
            "pension_id":                  pension_id,
            "current_age":                 current_age,
            "retirement_age":              _RETIREMENT_AGE,
            "years_remaining":             years_remaining,
            "current_pension_vault":       pension_vault,
            "projected_retirement_corpus": projected_corpus,
            "estimated_monthly_pension":   monthly_pension,
            "annual_return_assumed":       _ANNUAL_RETURN,
            "payout_horizon_months":       _PAYOUT_MONTHS,
            "projection_note":             note,
        }

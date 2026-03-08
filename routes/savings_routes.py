"""
routes/savings_routes.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PMS — Phase 3  |  Savings & Deposit Routes

Endpoints:
    GET  /user/{pensionId}              — full worker profile (frontend compat)
    POST /deposit                       — self-initiated deposit (80/20 split)
    POST /income                        — record daily income + recompute EMA
    GET  /savings-target/{pension_id}   — fetch current EMA savings target

Protected by JWT (all routes require Authorization: Bearer).

Service calls:
    GET  /user         → db_helpers.get_user()
    POST /deposit      → EmergencyShieldService.process_deposit()
    POST /income       → FinancialSignalService.record_daily_income()
    GET  /savings-target → FinancialSignalService.calculate_safe_savings()
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import logging
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from auth_utils import get_current_user
from database.db_helpers import get_user
from api_models import DepositRequest, RecordIncomeRequest
from services.emergency_shield import EmergencyShieldService
from services.financial_signal_engine import FinancialSignalService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Savings & Deposits"])

# ── Service singletons (stateless; safe to instantiate once) ──────────────────
_shield = EmergencyShieldService()
_fsp    = FinancialSignalService()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _calculate_age(date_of_birth: datetime) -> int:
    """Return current age in years from a datetime date-of-birth."""
    today = datetime.now(timezone.utc)
    dob   = date_of_birth.replace(tzinfo=timezone.utc) if date_of_birth.tzinfo is None \
            else date_of_birth
    age   = today.year - dob.year
    if (today.month, today.day) < (dob.month, dob.day):
        age -= 1
    return max(age, 0)


def _build_user_response(user: dict) -> dict:
    """
    Assemble the /user/:pensionId response.

    Adds totalSavings (legacy frontend compat) and currentAge so the
    React dashboard doesn't need any changes.
    """
    pension_vault = user.get("pension_vault", 0.0)
    liquid_vault  = user.get("liquid_vault",  0.0)
    total_savings = round(pension_vault + liquid_vault, 2)

    # Map insurance_status → legacy accountStatus values the frontend expects
    insurance_status = user.get("insurance_status", "PAUSED")
    account_status   = "Active" if insurance_status == "ACTIVE" else "At Risk"

    dob      = user.get("date_of_birth", datetime.now(timezone.utc))
    curr_age = _calculate_age(dob)

    return {
        # Identity
        "pension_id":   user.get("pension_id"),
        "pensionId":    user.get("pension_id"),   # legacy camelCase alias
        "name":         user.get("name"),
        "phone":        user.get("phone"),
        "nominee_phone": user.get("nominee_phone"),
        "dateOfBirth":  dob.isoformat() if isinstance(dob, datetime) else str(dob),
        # Vaults
        "pension_vault": pension_vault,
        "liquid_vault":  liquid_vault,
        "totalSavings":  total_savings,           # legacy field
        # Health
        "pension_health_score": user.get("pension_health_score", 0.0),
        "insurance_status":     insurance_status,
        "accountStatus":        account_status,   # legacy field
        # FSP
        "last_savings_target": user.get("last_savings_target", 20.0),
        # Computed
        "currentAge": curr_age,
    }


# ── GET /user/{pensionId} ─────────────────────────────────────────────────────

@router.get(
    "/user/{pension_id}",
    summary="Get worker profile (frontend compatible)",
)
async def get_user_profile(
    pension_id:     str,
    current_user:   str = Depends(get_current_user),
):
    """
    Returns the full worker profile including vault balances and computed fields.

    Enforces ownership: a JWT for worker A cannot fetch worker B's profile.
    """
    if current_user != pension_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view your own profile.",
        )

    user = get_user(pension_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Worker '{pension_id}' not found.",
        )

    return {"success": True, "data": _build_user_response(user)}


# ── POST /deposit ─────────────────────────────────────────────────────────────

@router.post(
    "/deposit",
    summary="Self-initiated deposit — applies 80/20 vault split",
)
async def deposit(
    body:         DepositRequest,
    current_user: str = Depends(get_current_user),
):
    """
    Process an incoming deposit for the authenticated worker.

    80% goes to the locked pension vault; 20% to the liquid emergency fund.
    An in-app notification is generated automatically.

    Returns vault snapshots and the transaction ID.
    """
    result = _shield.process_deposit(
        pension_id=current_user,
        amount=body.amount,
        source_verified=False,
    )

    # Augment with legacy field for any frontend code that reads newBalance
    result["newBalance"] = result["total_savings_after"]
    result["success"]    = True

    logger.info(
        "[Savings] Deposit: pension_id=%s amount=₹%.2f txn=%s",
        current_user, body.amount, result["transaction_id"],
    )
    return result


# ── POST /income ──────────────────────────────────────────────────────────────

@router.post(
    "/income",
    summary="Record daily income and recompute EMA savings target",
)
async def record_income(
    body:         RecordIncomeRequest,
    current_user: str = Depends(get_current_user),
):
    """
    Persist a daily income entry and immediately recompute the adaptive
    savings target for the authenticated worker.

    Income of ₹0 is valid — it triggers the Guardian Agent's zero-income
    tracking (Grace Mode evaluation happens via GET /guardian-status).
    """
    date_dt: datetime | None = None
    if body.income_date is not None:
        date_dt = datetime(
            body.income_date.year, body.income_date.month, body.income_date.day, tzinfo=timezone.utc
        )

    result = _fsp.record_daily_income(
        pension_id=current_user,
        amount=body.amount,
        date=date_dt,
        source=body.source,
        notes=body.notes,
    )
    result["success"] = True
    return result


# ── GET /savings-target/{pension_id} ─────────────────────────────────────────

@router.get(
    "/savings-target/{pension_id}",
    summary="Get the current EMA-computed savings target for a worker",
)
async def get_savings_target(
    pension_id:   str,
    current_user: str = Depends(get_current_user),
):
    """
    Returns today's adaptive savings target, alpha value, and income window stats.
    Does NOT persist the result — use POST /income to update and persist.
    """
    if current_user != pension_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view your own savings target.",
        )

    result = _fsp.calculate_safe_savings(pension_id)
    result["success"] = True
    return result

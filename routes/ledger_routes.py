"""
routes/ledger_routes.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PMS — Phase 3  |  Ledger / Payer Verification Routes

Endpoints:
    POST /ledger/token              — worker generates payer QR token
    POST /ledger/validate           — payer validates token (no money moved)
    POST /confirm-payment           — payer confirms payment → LOCKED txn
    GET  /transactions/{pension_id} — transaction history (frontend compat)
    GET  /annual-summary/{pension_id} — annual totals + projections

Two actors use these routes:
  • Worker  — /ledger/token  (authenticated via JWT)
  • Payer   — /ledger/validate and /confirm-payment
              (the payer scans a QR, no worker session; payer_id is optional)

Service calls:
    POST /ledger/token    → LedgerService.generate_payment_token()
    POST /ledger/validate → LedgerService.validate_token()
    POST /confirm-payment → LedgerService.confirm_payment()
    GET  /transactions    → LedgerService.get_worker_ledger()
    GET  /annual-summary  → LedgerService.get_worker_ledger()  (same call,
                            different response slice)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status

from auth_utils import get_current_user
from database.db_helpers import get_user
from api_models import (
    ConfirmPaymentRequest,
    GeneratePaymentTokenRequest,
    ValidateTokenRequest,
)
from services.ledger_protocol import LedgerService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Ledger & Payer Verification"])

_ledger = LedgerService()

# Retirement age — used for projection math in /annual-summary
_RETIREMENT_AGE = 60
_ANNUAL_RETURN  = 0.08


def _calculate_age(dob: datetime) -> int:
    today = datetime.now(timezone.utc)
    dob   = dob.replace(tzinfo=timezone.utc) if dob.tzinfo is None else dob
    age   = today.year - dob.year
    if (today.month, today.day) < (dob.month, dob.day):
        age -= 1
    return max(age, 0)


# ── POST /ledger/token ────────────────────────────────────────────────────────

@router.post(
    "/ledger/token",
    summary="Worker generates a payer-verification QR token",
)
async def generate_payment_token(
    body:         GeneratePaymentTokenRequest,
    current_user: str = Depends(get_current_user),
):
    """
    Worker opens the app and requests a QR token to show to their payer.

    The returned `token_id` is displayed as a QR code.  The payer scans
    it and calls POST /ledger/validate, then POST /confirm-payment.

    Tokens expire after 10 minutes.
    """
    result = _ledger.generate_payment_token(
        pension_id=current_user,
        expected_amount=body.expected_amount,
    )
    result["success"] = True
    return result


# ── POST /ledger/validate ─────────────────────────────────────────────────────

@router.post(
    "/ledger/validate",
    summary="Payer validates a token before entering the payment amount",
)
async def validate_token(body: ValidateTokenRequest):
    """
    Payer-facing endpoint (no JWT required — payer is not a registered worker).

    Returns the worker's name so the payer can confirm they are paying the
    right person before entering the amount.

    Does NOT consume the token.
    """
    result = _ledger.validate_token(token_id=body.token_id)
    result["success"] = True
    return result


# ── POST /confirm-payment ─────────────────────────────────────────────────────

@router.post(
    "/confirm-payment",
    summary="Payer confirms payment — atomically LOCKS income in the ledger",
)
async def confirm_payment(body: ConfirmPaymentRequest):
    """
    Payer-facing endpoint (no JWT required).

    Atomically:
    1. Claims the token (PENDING → USED) — prevents duplicate confirmations.
    2. Credits the worker's vaults (80% pension / 20% liquid).
    3. Inserts a LOCKED transaction record.
    4. Writes a payer-verified income record for the FSP engine.

    Returns vault snapshots and the transaction_id.
    """
    result = _ledger.confirm_payment(
        token_id=body.token_id,
        amount=body.amount,
        method=body.method,
        payer_id=body.payer_id,
    )

    logger.info(
        "[Ledger] Payment confirmed via API: token=%s amount=₹%.2f txn=%s",
        body.token_id, body.amount, result.get("transaction_id"),
    )
    return result


# ── GET /transactions/{pensionId} ─────────────────────────────────────────────

@router.get(
    "/transactions/{pension_id}",
    summary="Transaction history — paginated, newest first",
)
async def get_transactions(
    pension_id:   str,
    limit:        int = Query(default=50, ge=1, le=200),
    current_user: str = Depends(get_current_user),
):
    """
    Returns the worker's transaction history (deposits, withdrawals, cash bridges).

    Response shape matches what the existing React /transactions page expects:
    `{ success, data: [ { _id, pensionId, amount, type, date, status }, ... ] }`
    """
    if current_user != pension_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view your own transactions.",
        )

    ledger = _ledger.get_worker_ledger(pension_id=pension_id, limit=limit)

    # Shape the response exactly as the existing React frontend expects
    return {
        "success": True,
        "data":    ledger["transactions"],
    }


# ── GET /annual-summary/{pensionId} ──────────────────────────────────────────

@router.get(
    "/annual-summary/{pension_id}",
    summary="Annual deposit totals and retirement projection",
)
async def get_annual_summary(
    pension_id:   str,
    current_user: str = Depends(get_current_user),
):
    """
    Returns annual savings totals, NPS status, and retirement projections.

    Response shape matches the existing React /annual-summary page:
    ```
    {
        annualSavings, remainingToMinimum, yearsLeft,
        projectedCorpus, estimatedMonthlyPension, accountStatus
    }
    ```
    """
    if current_user != pension_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view your own annual summary.",
        )

    user = get_user(pension_id)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Worker '{pension_id}' not found.",
        )

    ledger       = _ledger.get_worker_ledger(pension_id=pension_id, limit=1)
    annual_total = ledger["annual_total"]
    remaining    = ledger["remaining_to_minimum"]
    status_str   = ledger["account_status"]

    # Retirement projection
    dob           = user.get("date_of_birth", datetime.now(timezone.utc))
    current_age   = _calculate_age(dob)
    years_left    = max(_RETIREMENT_AGE - current_age, 0)
    annual_contrib = annual_total if annual_total >= 1000.0 else 1000.0

    projected_corpus = 0.0
    if years_left > 0:
        projected_corpus = annual_contrib * (
            (pow(1 + _ANNUAL_RETURN, years_left) - 1) / _ANNUAL_RETURN
        )

    monthly_pension = projected_corpus / (20 * 12) if projected_corpus > 0 else 0.0

    return {
        "success":                True,
        "annualSavings":          round(annual_total, 2),
        "remainingToMinimum":     round(remaining, 2),
        "yearsLeft":              years_left,
        "projectedCorpus":        round(projected_corpus),
        "estimatedMonthlyPension": round(monthly_pension),
        "accountStatus":          status_str,
    }

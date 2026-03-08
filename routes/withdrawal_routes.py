"""
routes/withdrawal_routes.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PMS — Phase 3  |  Withdrawal Routes

Endpoints:
    POST /withdraw              — initiate withdrawal (instant or Dual-Key)
    POST /withdraw/verify       — nominee submits OTP to release funds
    POST /withdraw/check        — pre-flight eligibility (no funds moved)

Protected by JWT.

Service calls:
    POST /withdraw        → WithdrawalGovernanceService.request_withdrawal()
    POST /withdraw/verify → WithdrawalGovernanceService.verify_withdrawal_otp()
    POST /withdraw/check  → EmergencyShieldService.check_withdrawal_eligibility()

Flow explanation:
    If the requested amount ≤ liquid_vault → approved instantly.
    If it requires pension vault draw → OTP sent to nominee's phone,
    response contains request_id.  Nominee enters OTP via POST /withdraw/verify.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from auth_utils import get_current_user
from api_models import OTPVerifyRequest, WithdrawRequest, WithdrawalEligibilityRequest
from services.dual_key_governance import WithdrawalGovernanceService
from services.emergency_shield import EmergencyShieldService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Withdrawals"])

_governance = WithdrawalGovernanceService()
_shield     = EmergencyShieldService()


# ── POST /withdraw ────────────────────────────────────────────────────────────

@router.post(
    "/withdraw",
    summary="Initiate a withdrawal — instant or triggers Dual-Key OTP flow",
)
async def withdraw(
    body:         WithdrawRequest,
    current_user: str = Depends(get_current_user),
):
    """
    Request a withdrawal for the authenticated worker.

    **Instant path** (amount ≤ liquid vault):
    Returns `approved: true` and vault snapshots.

    **Dual-Key path** (amount draws from pension vault):
    Returns `approved: false, dual_key_required: true` with a `request_id`.
    The worker's nominee receives an OTP by SMS.
    Call POST /withdraw/verify with the `request_id` and OTP to release funds.

    The `newBalance` field in the instant-path response is included for
    backward compatibility with the existing React frontend.
    """
    result = _governance.request_withdrawal(
        pension_id=current_user,
        amount=body.amount,
    )

    # Legacy frontend compat — /withdraw used to return newBalance
    if result.get("approved"):
        total_after = round(
            result.get("liquid_vault_after", 0.0) +
            result.get("pension_vault_after", 0.0), 2
        )
        result["newBalance"] = total_after

    result["success"] = True

    logger.info(
        "[Withdrawal] pension_id=%s amount=₹%.2f approved=%s dual_key=%s",
        current_user, body.amount,
        result.get("approved"), result.get("dual_key_required"),
    )
    return result


# ── POST /withdraw/verify ─────────────────────────────────────────────────────

@router.post(
    "/withdraw/verify",
    summary="Nominee submits OTP to approve a large withdrawal",
)
async def verify_withdrawal_otp(
    body:         OTPVerifyRequest,
    current_user: str = Depends(get_current_user),
):
    """
    Complete the Dual-Key withdrawal flow.

    The nominee (or the worker acting on the nominee's behalf) submits the
    6-digit OTP that was sent by SMS when the withdrawal was initiated.

    - Up to 5 incorrect attempts are allowed; the request is then permanently
      failed and a new withdrawal must be initiated.
    - OTP expires after 5 minutes regardless.

    Returns vault snapshots and transaction_id on success.
    Returns `approved: false` with a descriptive message on failure.
    """
    result = _governance.verify_withdrawal_otp(
        request_id=body.request_id,
        otp_entered=body.otp_entered,
    )

    if result.get("approved"):
        total_after = round(
            result.get("liquid_vault_after", 0.0) +
            result.get("pension_vault_after", 0.0), 2
        )
        result["newBalance"] = total_after

    result["success"] = True

    logger.info(
        "[Withdrawal] OTP verify: request_id=%s approved=%s",
        body.request_id, result.get("approved"),
    )
    return result


# ── POST /withdraw/check ──────────────────────────────────────────────────────

@router.post(
    "/withdraw/check",
    summary="Pre-flight eligibility check — no funds are moved",
)
async def check_withdrawal_eligibility(
    body:         WithdrawalEligibilityRequest,
    current_user: str = Depends(get_current_user),
):
    """
    Ask whether a proposed withdrawal amount can be processed instantly
    or requires Dual-Key approval, without actually moving any funds.

    The React frontend should call this endpoint before rendering the
    withdrawal confirmation dialog, so it can show a nominee-approval
    warning when needed.
    """
    result = _shield.check_withdrawal_eligibility(
        pension_id=current_user,
        amount=body.amount,
    )
    result["success"] = True
    return result

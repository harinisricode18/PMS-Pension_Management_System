"""
routes/health_routes.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PMS — Phase 3  |  Pension Health Score Routes

Endpoints:
    GET  /health-score/{pension_id}            — compute & return PHS
    POST /health-score/{pension_id}/simulate   — score impact preview
                                                 before a withdrawal

Protected by JWT.

Service calls:
    GET  /health-score          → PensionHealthService.compute_health_score()
    POST /health-score/simulate → PensionHealthService.simulate_withdrawal()
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from auth_utils import get_current_user
from api_models import SimulateWithdrawalRequest
from services.pension_health_engine import PensionHealthService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Pension Health"])

_health = PensionHealthService()


# ── GET /health-score/{pension_id} ────────────────────────────────────────────

@router.get(
    "/health-score/{pension_id}",
    summary="Compute the Pension Health Score and update insurance status",
)
async def get_health_score(
    pension_id:   str,
    current_user: str = Depends(get_current_user),
):
    """
    Computes (and persists) the worker's Pension Health Score (0–1000).

    Score determines whether the linked insurance policy is ACTIVE or PAUSED.
    A transition from ACTIVE → PAUSED automatically sends an in-app warning.

    Response includes a `component_breakdown` dict so the frontend can render
    a transparent score explanation to the worker.

    This endpoint is called:
    - After every deposit (triggered by EmergencyShield route response handler)
    - After every withdrawal
    - On-demand by the worker from the dashboard
    """
    if current_user != pension_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view your own health score.",
        )

    result = _health.compute_health_score(pension_id)
    result["success"] = True

    logger.info(
        "[Health] Score fetched via API: pension_id=%s score=%.2f status=%s",
        pension_id, result["score"], result["insurance_status"],
    )
    return result


# ── POST /health-score/{pension_id}/simulate ──────────────────────────────────

@router.post(
    "/health-score/{pension_id}/simulate",
    summary="Preview the score impact of a proposed withdrawal — no funds moved",
)
async def simulate_withdrawal_impact(
    pension_id:   str,
    body:         SimulateWithdrawalRequest,
    current_user: str = Depends(get_current_user),
):
    """
    Simulate what the Pension Health Score would be *after* a proposed
    withdrawal, without executing the withdrawal.

    The frontend should call this before the withdrawal confirmation dialog to
    show the worker a concrete warning such as:

    > "This withdrawal would drop your score from 850 to 720 and pause your
    > free insurance coverage."

    Returns `insurance_risk: true` when the proposed amount would transition
    the worker's insurance from ACTIVE → PAUSED.
    """
    if current_user != pension_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only simulate withdrawals for your own account.",
        )

    result = _health.simulate_withdrawal(
        pension_id=pension_id,
        amount=body.amount,
    )
    result["success"] = True
    return result

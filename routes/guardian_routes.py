"""
routes/guardian_routes.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PMS — Phase 3  |  Guardian Agent Routes

Endpoints:
    GET /guardian-status/{pension_id}   — evaluate worker state for today
    GET /notifications/{pension_id}     — unread in-app notification inbox

Protected by JWT.

Service calls:
    GET /guardian-status   → GuardianAgentService.evaluate_worker_state()
    GET /notifications     → GuardianAgentService.get_notification_inbox()

The Guardian Agent evaluates the worker's context for today:
    REST_DAY | BONUS_WORK_ON_REST | GRACE_MODE | ZERO_INCOME_PENDING | ACTIVE_WORK_DAY

When GRACE_MODE is detected (≥ 3 consecutive zero-income days), the daily
savings target is set to ₹0 and the worker's reliability score is frozen.

This endpoint is called:
  - By the daily cron job (APScheduler) for all active workers
  - On-demand by the React dashboard to refresh the home screen nudge card
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from auth_utils import get_current_user
from services.guardian_agent import GuardianAgentService
from ws_manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Guardian Agent"])

_guardian = GuardianAgentService()


# ── GET /guardian-status/{pension_id} ────────────────────────────────────────

@router.get(
    "/guardian-status/{pension_id}",
    summary="Evaluate and return today's Guardian state for a worker",
)
async def get_guardian_status(
    pension_id:   str,
    current_user: str = Depends(get_current_user),
):
    """
    Runs the full Guardian Agent evaluation for the authenticated worker.

    Determines today's state based on:
    - Day of week and configured rest days
    - Income reported today
    - Consecutive zero-income days (from the DB — survives restarts)

    If Grace Mode is active, the user_facing_target is 0.0 and the worker
    is notified empathetically without penalty.

    Also generates and persists an in-app notification (either
    `savings_target` or `grace_mode` type).

    After evaluation, a GUARDIAN_ALERT WebSocket event is broadcast to the
    worker's active connections so the mobile app can refresh the nudge card
    in real-time without polling.
    """
    if current_user != pension_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only check your own guardian status.",
        )

    result = _guardian.evaluate_worker_state(pension_id)
    result["success"] = True

    # Push the nudge card update to the mobile app in real-time
    await ws_manager.broadcast(
        pension_id=pension_id,
        payload={
            "event": "GUARDIAN_ALERT",
            "payload": {
                "pension_id":         pension_id,
                "state":              result["state"],
                "grace_mode":         result["grace_mode"],
                "user_facing_target": result["user_facing_target"],
                "message":            result["message"],
            },
        },
    )

    logger.info(
        "[Guardian] Status via API: pension_id=%s state=%s grace=%s",
        pension_id, result["state"], result["grace_mode"],
    )
    return result


# ── GET /notifications/{pension_id} ──────────────────────────────────────────

@router.get(
    "/notifications/{pension_id}",
    summary="Return unread in-app notifications for a worker",
)
async def get_notifications(
    pension_id:   str,
    current_user: str = Depends(get_current_user),
):
    """
    Returns the worker's unread in-app notification inbox.

    Notifications are created by:
    - GuardianAgentService (daily nudge, grace mode alert)
    - EmergencyShieldService (deposit confirmed)
    - WithdrawalGovernanceService (OTP dispatch, withdrawal approved)
    - PensionHealthService (insurance paused warning)
    - DigitalBridgeService (cash deposit confirmed)

    The React dashboard polls this endpoint on mount to display the
    notification bell indicator and inbox drawer.
    """
    if current_user != pension_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only view your own notifications.",
        )

    notifications = _guardian.get_notification_inbox(pension_id)

    return {
        "success": True,
        "count":   len(notifications),
        "data":    notifications,
    }

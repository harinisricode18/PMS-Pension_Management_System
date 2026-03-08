"""
routes/agent_routes.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PMS — Phase 3  |  Digital Bridge / Agent Cash Routes

Endpoints:
    POST /agent/generate-token   — worker generates cash QR for the agent
    POST /agent/validate         — agent validates a worker's token (pre-check)
    POST /agent/confirm-cash     — agent confirms cash received → settlement
    WebSocket /ws/notifications/{pension_id}  (defined here, uses ws_manager)

Three-actor flow:
    1. Worker → POST /agent/generate-token (JWT-protected)
       Gets a 5-min QR token for the cash amount.

    2. Agent  → POST /agent/validate (no JWT — agent has agent_id credential)
       Validates token + checks agent float before accepting cash.

    3. Agent  → POST /agent/confirm-cash (no JWT)
       Atomic settlement: agent float debited, worker vaults credited,
       LOCKED transaction written, token consumed.
       The `websocket_event` payload from the service is broadcast to the
       worker's mobile app via the WebSocket room.

Service calls:
    POST /agent/generate-token → DigitalBridgeService.generate_cash_token()
    POST /agent/validate       → DigitalBridgeService.validate_agent_token()
    POST /agent/confirm-cash   → DigitalBridgeService.confirm_cash_deposit()
    WebSocket                  → ws_manager (broadcast)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import logging

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect

from auth_utils import get_current_user
from api_models import AgentConfirmCashRequest, AgentValidateTokenRequest, GenerateCashTokenRequest
from services.digital_bridge import DigitalBridgeService
from ws_manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Agent / Digital Bridge"])

_bridge = DigitalBridgeService()


# ── POST /agent/generate-token ────────────────────────────────────────────────

@router.post(
    "/agent/generate-token",
    summary="Worker generates a 5-min cash QR token to show the agent",
)
async def generate_cash_token(
    body:         GenerateCashTokenRequest,
    current_user: str = Depends(get_current_user),
):
    """
    Worker opens the app, enters the cash amount, and receives a 6-char QR
    token to show to the local retail agent (Kirana / Business Correspondent).

    Token expires in 5 minutes. Only one active token per flow is needed.

    Returns the token_id, amount, and ISO expiry timestamp.
    """
    result = _bridge.generate_cash_token(
        pension_id=current_user,
        amount=body.amount,
    )
    result["success"] = True

    logger.info(
        "[Agent] Cash token generated: pension_id=%s token=%s amount=₹%.2f",
        current_user, result["token_id"], body.amount,
    )
    return result


# ── POST /agent/validate ──────────────────────────────────────────────────────

@router.post(
    "/agent/validate",
    summary="Agent validates a worker QR token before accepting cash",
)
async def validate_agent_token(body: AgentValidateTokenRequest):
    """
    Agent-facing endpoint (no JWT — agent identifies with agent_id).

    Validates:
    1. Agent exists, is active, and meets the minimum trust score (0.3).
    2. Token is PENDING and not expired.
    3. Agent has sufficient digital float to honour the amount.

    Returns worker name and amount so the agent can confirm the right person
    before accepting cash. Does NOT consume the token.
    """
    result = _bridge.validate_agent_token(
        agent_id=body.agent_id,
        token_id=body.token_id,
    )
    result["success"] = True
    return result


# ── POST /agent/confirm-cash ──────────────────────────────────────────────────

@router.post(
    "/agent/confirm-cash",
    summary="Agent confirms cash received — atomic three-way settlement",
)
async def confirm_cash_deposit(body: AgentConfirmCashRequest):
    """
    Agent-facing endpoint (no JWT — agent identifies with agent_id).

    Triggers the atomic settlement:
    - Agent's digital float is debited.
    - Worker's pension_vault (80%) and liquid_vault (20%) are credited.
    - A LOCKED transaction record is inserted.
    - The QR token is consumed (one-time use).

    After settlement, the `websocket_event` payload from the service
    is broadcast to the worker's mobile app in real-time via WebSocket,
    triggering the simultaneous success animation on both devices.
    """
    result = _bridge.confirm_cash_deposit(
        agent_id=body.agent_id,
        token_id=body.token_id,
    )

    # ── WebSocket broadcast ───────────────────────────────────────────────────
    # The service layer already assembled the correct payload.
    # This route's only job is to broadcast it; no payload construction here.
    ws_event = result.get("websocket_event")
    if ws_event:
        pension_id = result.get("pension_id")
        await ws_manager.broadcast(
            pension_id=pension_id,
            payload=ws_event,
        )
        logger.info(
            "[Agent] WS broadcast sent: pension_id=%s event=%s",
            pension_id, ws_event.get("event"),
        )

    logger.info(
        "[Agent] Cash deposit confirmed: agent=%s token=%s amount=₹%.2f txn=%s",
        body.agent_id, body.token_id,
        result.get("amount"), result.get("transaction_id"),
    )
    return result


# ── WebSocket /ws/notifications/{pension_id} ──────────────────────────────────

@router.websocket("/ws/notifications/{pension_id}")
async def websocket_notifications(
    pension_id: str,
    websocket:  WebSocket,
):
    """
    Persistent WebSocket channel for a single worker.

    The worker's mobile app (and optionally the web dashboard) connects here
    on login to receive real-time push events:

    | Event                 | Trigger                                          |
    |-----------------------|--------------------------------------------------|
    | DEPOSIT_CONFIRMED     | Agent cash settlement via POST /agent/confirm-cash|
    | GUARDIAN_ALERT        | Guardian Agent state evaluation                  |
    | WITHDRAWAL_APPROVED   | Dual-Key OTP verified                            |
    | INSURANCE_WARNING     | Score drops below threshold                      |

    Payload shape (all events):
    ```json
    {
        "event":   "DEPOSIT_CONFIRMED",
        "payload": { ... event-specific fields ... }
    }
    ```

    Authentication: the pension_id in the URL path is used to route messages.
    In production, add token-based auth by accepting a `?token=<jwt>` query
    parameter and verifying it before calling ws_manager.connect().

    The server sends a `CONNECTED` heartbeat immediately on connection so the
    client can confirm the socket is live before waiting for events.
    """
    await ws_manager.connect(pension_id=pension_id, websocket=websocket)

    # Immediate confirmation so the client knows the socket is live
    await ws_manager.broadcast(
        pension_id=pension_id,
        payload={
            "event":   "CONNECTED",
            "payload": {
                "pension_id": pension_id,
                "message":   "Notification channel established.",
            },
        },
    )

    try:
        # Keep the connection alive; client messages are ignored (server-push only)
        while True:
            await websocket.receive_text()

    except WebSocketDisconnect:
        ws_manager.disconnect(pension_id=pension_id, websocket=websocket)
        logger.info("[WS] Client disconnected: pension_id=%s", pension_id)

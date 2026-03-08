"""
services/digital_bridge.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PMS — Phase 2B  |  Digital Bridge Service

Converts physical cash into digital pension credit via a local
retail agent (Kirana store / Business Correspondent).

Three-actor flow:
    1. Worker     → generate_cash_token()   — QR on phone
    2. Agent      → validate_agent_token()  — scan QR, see worker info
    3. Agent      → confirm_cash_deposit()  — receive cash → atomic settlement

Atomic settlement (execute_agent_cash_bridge):
    • Debit  agent.digital_float
    • Credit worker.pension_vault  (80%)
    • Credit worker.liquid_vault   (20%)
    • Insert LOCKED transaction    (source_verified=True)
    • Mark token USED

DB reads:   tokens     ← fetch_valid_token()
            agents     ← get_agents_collection()
            users      ← get_user()
DB writes:  tokens     ← store_token()  /  mark inside cash_bridge
            agents     ← float debit inside execute_agent_cash_bridge
            users      ← vault credit inside execute_agent_cash_bridge
            transactions ← LOCKED entry inside execute_agent_cash_bridge
            notifications ← create_notification()

Prototype removals:
    ✗  QRTokenManager class with self.tokens = {}  (in-memory)
    ✗  self.users / self.agents dicts (hardcoded)
    ✗  Sequential vault mutation     (atomic via execute_agent_cash_bridge)
    ✗  print("WebSocket fires…")     (caller broadcasts WS event from return value)
    ✗  while True / input() demo loop
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import logging

from database.db_helpers import (
    get_user,
    store_token,
    fetch_valid_token,
    execute_agent_cash_bridge,
    create_notification,
)
from database.mongo_connection import get_agents_collection

logger = logging.getLogger(__name__)

_TOKEN_EXPIRY_MINUTES   = 5
_MIN_AGENT_TRUST_SCORE  = 0.3    # agents below this are blocked


class DigitalBridgeService:
    """
    Cash-to-digital handshake service.

    The FastAPI route layer is responsible for broadcasting the
    `websocket_event` payload returned by confirm_cash_deposit()
    to both the worker's mobile app and the agent's POS dashboard.
    """

    def generate_cash_token(self, pension_id: str, amount: float) -> dict:
        """
        Worker opens the app, enters the cash amount, receives a 6-char QR token.

        Args:
            pension_id: Worker's pension ID (from JWT session).
            amount:     Cash the worker intends to hand to the agent.

        Returns:
        {
            "token_id":       str,   # 6-char uppercase code (shown as QR)
            "pension_id":     str,
            "amount":         float,
            "expires_at":     str,   # ISO 8601
            "expiry_minutes": int,
        }

        Raises ValueError if worker not found or amount ≤ 0.
        """
        if amount <= 0:
            raise ValueError(f"Deposit amount must be positive, got ₹{amount}")

        user = get_user(pension_id)
        if user is None:
            raise ValueError(f"Worker '{pension_id}' not found")

        token = store_token(
            pension_id=pension_id,
            amount=amount,
            token_type="qr_deposit",
            expiry_minutes=_TOKEN_EXPIRY_MINUTES,
        )

        logger.info(
            "[Bridge] Token generated: pension_id=%s token_id=%s amount=₹%.2f",
            pension_id, token["token_id"], amount,
        )

        return {
            "token_id":       token["token_id"],
            "pension_id":     pension_id,
            "amount":         amount,
            "expires_at":     token["expires_at"].isoformat(),
            "expiry_minutes": _TOKEN_EXPIRY_MINUTES,
        }

    def validate_agent_token(self, agent_id: str, token_id: str) -> dict:
        """
        Agent scans the worker's QR before accepting cash.

        Validates:
          1. Agent exists, is active, and meets trust threshold.
          2. Token is PENDING and not expired.
          3. Agent has sufficient digital float to honour the amount.

        Returns:
        {
            "valid":       bool,
            "token_id":    str,
            "worker_name": str,
            "pension_id":  str,
            "amount":      float,
            "agent_float": float,
            "can_process": bool,   # False if agent float insufficient
            "message":     str,
        }
        — or —
        {
            "valid":   False,
            "message": str,
        }
        """
        # ── Validate agent ────────────────────────────────────────────────
        agent = get_agents_collection().find_one(
            {"agent_id": agent_id}, {"_id": 0}
        )

        if agent is None:
            logger.warning("[Bridge] Unknown agent: %s", agent_id)
            return {"valid": False, "message": "Agent account not recognised."}

        if not agent.get("is_active", False):
            return {"valid": False, "message": "Agent account is currently inactive."}

        trust = agent.get("trust_score", 1.0)
        if trust < _MIN_AGENT_TRUST_SCORE:
            logger.warning(
                "[Bridge] Low-trust agent blocked: agent_id=%s score=%.2f",
                agent_id, trust,
            )
            return {
                "valid":   False,
                "message": "Agent trust score too low. Contact your PMS coordinator.",
            }

        # ── Validate token ────────────────────────────────────────────────
        token = fetch_valid_token(token_id)
        if token is None:
            logger.warning(
                "[Bridge] Agent %s scanned invalid token: %s", agent_id, token_id
            )
            return {
                "valid":   False,
                "message": "Token is invalid, already used, or expired. "
                           "Ask the worker to generate a new token.",
            }

        amount      = token["amount"]
        pension_id  = token["pension_id"]
        user        = get_user(pension_id)
        worker_name = user.get("name", "Unknown Worker") if user else "Unknown Worker"
        float_ok    = agent["digital_float"] >= amount

        logger.info(
            "[Bridge] Token validated: agent=%s token=%s worker=%s "
            "amount=₹%.2f float_ok=%s",
            agent_id, token_id, worker_name, amount, float_ok,
        )

        return {
            "valid":       True,
            "token_id":    token_id,
            "worker_name": worker_name,
            "pension_id":  pension_id,
            "amount":      amount,
            "agent_float": agent["digital_float"],
            "can_process": float_ok,
            "message": (
                f"Collect ₹{amount:.2f} cash from {worker_name}."
                if float_ok
                else (
                    f"Insufficient agent float: ₹{agent['digital_float']:.2f} "
                    f"available, ₹{amount:.2f} required."
                )
            ),
        }

    def confirm_cash_deposit(self, agent_id: str, token_id: str) -> dict:
        """
        Agent confirms cash received → atomic three-way settlement.

        The return value includes a `websocket_event` dict.
        The FastAPI route broadcasts this to both the worker's app and the
        agent's POS dashboard for the simultaneous success animation.

        Returns:
        {
            "success":             bool,
            "transaction_id":      str,
            "pension_id":          str,
            "agent_id":            str,
            "amount":              float,
            "pension_credit":      float,
            "liquid_credit":       float,
            "pension_vault_after": float,
            "liquid_vault_after":  float,
            "websocket_event": {
                "event":   "DEPOSIT_CONFIRMED",
                "payload": {...},
            },
        }

        Raises ValueError if token is invalid/used/expired.
        """
        token = fetch_valid_token(token_id)
        if token is None:
            raise ValueError(
                f"Token '{token_id}' is invalid, already used, or expired."
            )

        pension_id = token["pension_id"]
        amount     = token["amount"]

        if amount <= 0:
            raise ValueError(f"Token carries invalid amount: ₹{amount}")

        # Atomic: agent float debit + worker 80/20 credit + LOCKED transaction
        result = execute_agent_cash_bridge(
            pension_id=pension_id,
            agent_id=agent_id,
            amount=amount,
            token_id=token_id,
        )

        create_notification(
            pension_id=pension_id,
            notification_type="deposit_confirmed",
            title="Cash Deposit Confirmed ✅",
            message=(
                f"₹{amount:.2f} digitised via agent. "
                f"₹{result['pension_credit']:.2f} in pension, "
                f"₹{result['liquid_credit']:.2f} in emergency fund."
            ),
            channel="in_app",
        )

        ws_payload = {
            "pension_id":          pension_id,
            "agent_id":            agent_id,
            "amount":              amount,
            "pension_credit":      result["pension_credit"],
            "liquid_credit":       result["liquid_credit"],
            "pension_vault_after": result["pension_vault_after"],
            "liquid_vault_after":  result["liquid_vault_after"],
            "transaction_id":      result["transaction_id"],
        }

        logger.info(
            "[Bridge] Settlement complete: pension_id=%s agent_id=%s "
            "amount=₹%.2f txn=%s",
            pension_id, agent_id, amount, result["transaction_id"],
        )

        return {
            "success":             True,
            "transaction_id":      result["transaction_id"],
            "pension_id":          pension_id,
            "agent_id":            agent_id,
            "amount":              amount,
            "pension_credit":      result["pension_credit"],
            "liquid_credit":       result["liquid_credit"],
            "pension_vault_after": result["pension_vault_after"],
            "liquid_vault_after":  result["liquid_vault_after"],
            "websocket_event":     {"event": "DEPOSIT_CONFIRMED", "payload": ws_payload},
        }

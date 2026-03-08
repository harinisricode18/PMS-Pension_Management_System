"""
ws_manager.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PMS — Phase 3  |  WebSocket Connection Manager

Manages per-pension_id WebSocket rooms.

Each worker's mobile app connects to:
    ws://<host>/ws/notifications/{pension_id}

When a service event fires (deposit confirmed, withdrawal approved,
Guardian alert), the relevant route calls:
    await ws_manager.broadcast(pension_id, payload_dict)

The DigitalBridgeService.confirm_cash_deposit() already returns a
`websocket_event` dict in its response.  The agent_routes module
extracts that payload and broadcasts it here.

Design notes:
  • One pension_id may have multiple active sockets (worker's phone
    + the web dashboard).  All receive the same broadcast.
  • Disconnected sockets are removed on send failure so the set never
    grows unbounded.
  • This module has NO imports from routes/ or services/ — it is
    a pure infrastructure utility used by both.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import asyncio
import json
import logging
from collections import defaultdict
from typing import Any, Dict, Set

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """
    Registry of active WebSocket connections, keyed by pension_id.

    Public surface:
        connect(pension_id, websocket)    — register a new connection
        disconnect(pension_id, websocket) — remove a connection
        broadcast(pension_id, payload)    — async send to all sockets for a worker
        broadcast_multi(ids, payload)     — send to multiple pension_ids (agent POS)
    """

    def __init__(self) -> None:
        # pension_id → set of active WebSocket connections
        self._rooms: Dict[str, Set[WebSocket]] = defaultdict(set)

    # ── Connection lifecycle ──────────────────────────────────────────────────

    async def connect(self, pension_id: str, websocket: WebSocket) -> None:
        """Accept and register a WebSocket connection."""
        await websocket.accept()
        self._rooms[pension_id].add(websocket)
        logger.info(
            "[WS] Connected: pension_id=%s total_connections=%d",
            pension_id, len(self._rooms[pension_id]),
        )

    def disconnect(self, pension_id: str, websocket: WebSocket) -> None:
        """Remove a connection from its room. Cleans up empty rooms."""
        self._rooms[pension_id].discard(websocket)
        if not self._rooms[pension_id]:
            del self._rooms[pension_id]
        logger.info("[WS] Disconnected: pension_id=%s", pension_id)

    # ── Broadcasting ──────────────────────────────────────────────────────────

    async def broadcast(self, pension_id: str, payload: Dict[str, Any]) -> None:
        """
        Send a JSON payload to all active connections for a pension_id.

        Dead connections are removed silently so they don't accumulate.
        """
        sockets = list(self._rooms.get(pension_id, set()))
        if not sockets:
            logger.debug(
                "[WS] No active connections for pension_id=%s — broadcast skipped",
                pension_id,
            )
            return

        message = json.dumps(payload, default=str)
        dead: list[WebSocket] = []

        for ws in sockets:
            try:
                await ws.send_text(message)
            except Exception as exc:
                logger.warning(
                    "[WS] Send failed for pension_id=%s — removing dead socket: %s",
                    pension_id, exc,
                )
                dead.append(ws)

        for ws in dead:
            self.disconnect(pension_id, ws)

        logger.debug(
            "[WS] Broadcast sent: pension_id=%s recipients=%d",
            pension_id, len(sockets) - len(dead),
        )

    async def broadcast_multi(
        self, pension_ids: list[str], payload: Dict[str, Any]
    ) -> None:
        """Broadcast the same payload to multiple pension_ids concurrently."""
        await asyncio.gather(
            *(self.broadcast(pid, payload) for pid in pension_ids),
            return_exceptions=True,
        )

    # ── Introspection ─────────────────────────────────────────────────────────

    def active_connections(self, pension_id: str) -> int:
        """Return the number of active connections for a pension_id."""
        return len(self._rooms.get(pension_id, set()))

    def total_connections(self) -> int:
        """Return total active connections across all rooms."""
        return sum(len(v) for v in self._rooms.values())


# ── Module-level singleton ────────────────────────────────────────────────────
# Imported by routes that need to broadcast and by the WS endpoint itself.
ws_manager = ConnectionManager()

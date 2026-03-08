"""
services/guardian_agent.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PMS — Phase 2B  |  Guardian Agent Service

Monitors worker activity context, decides the worker's state for
the day, and generates an empathetic, actionable notification.
When inactive workers are detected, Grace Mode suspends targets
and freezes the reliability score.

DB reads:   income_records  ← get_income_history(), get_recent_zero_income_days()
            users           ← get_user()  (rest_days, last_savings_target)
DB writes:  notifications   ← create_notification()

Prototype removals:
    ✗  apply_guardian_with_rest_days(df, ...)  (batch DataFrame function)
    ✗  processed_chaotic global (undefined → crashed)
    ✗  console input() onboarding loop
    ✗  pd.DataFrame output with print()
    ✗  consecutive_zero_days in-memory counter (lost on restart)
    ✗  rest_days_list from stdin
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import logging
import os
from datetime import datetime, timezone
from typing import Optional

from database.db_helpers import (
    get_user,
    get_income_history,
    get_recent_zero_income_days,
    create_notification,
    get_unread_notifications,
)

logger = logging.getLogger(__name__)

# ── State constants ───────────────────────────────────────────────────────────
STATE_REST_DAY     = "REST_DAY"
STATE_BONUS_WORK   = "BONUS_WORK_ON_REST"
STATE_GRACE_MODE   = "GRACE_MODE"
STATE_ZERO_PENDING = "ZERO_INCOME_PENDING"
STATE_ACTIVE       = "ACTIVE_WORK_DAY"

_GRACE_TRIGGER = int(os.getenv("GUARDIAN_GRACE_DAYS", "3"))
_LLM_ENABLED   = os.getenv("LLM_ENABLED", "false").lower() == "true"
_ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY", "")

# ── Deterministic message templates ──────────────────────────────────────────
_MESSAGES = {
    STATE_REST_DAY:     "Enjoy your {day} off! 🌴 No savings targets today.",
    STATE_BONUS_WORK:   "Working on your {day} off? Great hustle! "
                        "Let's secure ₹{target} for the future.",
    STATE_GRACE_MODE:   "It's been a tough few days. We've paused your targets "
                        "and protected your score. Rest up — we're here when you're back. 🛡️",
    STATE_ZERO_PENDING: "No earnings today? Remember, just ₹3/day keeps your yearly "
                        "NPS active. Let's hit it hard tomorrow! 🎯",
    STATE_ACTIVE:       "Good day at work! Let's secure ₹{target} for the future.",
}


class GuardianAgentService:
    """
    Context-aware daily nudge and Grace Mode manager.

    Evaluates one worker at a time; called per worker by a daily cron job
    and after every income record insertion.
    """

    # ── State detection (pure — no DB calls, easy to unit-test) ──────────────

    def _determine_state(
        self,
        day_of_week: str,
        income_today: float,
        consecutive_zeros: int,
        rest_days: list,
    ) -> str:
        """Map inputs to one of the five Guardian states."""
        on_rest = day_of_week in rest_days

        if on_rest and income_today == 0.0:
            return STATE_REST_DAY

        if on_rest and income_today > 0.0:
            return STATE_BONUS_WORK

        if income_today == 0.0:
            return STATE_GRACE_MODE if consecutive_zeros >= _GRACE_TRIGGER else STATE_ZERO_PENDING

        return STATE_ACTIVE

    # ── Message generation ────────────────────────────────────────────────────

    def _deterministic_message(
        self, state: str, day: str, target: float
    ) -> str:
        """Template-based message. Never fails regardless of environment."""
        template = _MESSAGES.get(state, _MESSAGES[STATE_ACTIVE])
        return template.format(day=day, target=round(target, 2))

    def _llm_message(
        self,
        state: str,
        worker_name: str,
        income_today: float,
        target: float,
        consecutive_zeros: int,
        day_of_week: str,
    ) -> Optional[str]:
        """
        Optional Claude-powered empathetic message.

        Returns None if LLM is disabled, the API key is absent,
        or the API call fails.  Caller always falls back to template.
        """
        if not _LLM_ENABLED or not _ANTHROPIC_KEY:
            return None

        state_desc = {
            STATE_GRACE_MODE:   f"{consecutive_zeros} consecutive days without income — Grace Mode active",
            STATE_ZERO_PENDING: "No income recorded today",
            STATE_REST_DAY:     f"Planned rest day ({day_of_week})",
            STATE_BONUS_WORK:   f"Working on rest day ({day_of_week}), income ₹{income_today:.2f}",
            STATE_ACTIVE:       f"Active work day, income ₹{income_today:.2f}",
        }.get(state, state)

        prompt = (
            f"You are a supportive financial wellness coach for {worker_name}, "
            f"an informal daily-wage worker in India using a micro-pension savings app.\n\n"
            f"Situation: {state_desc}.\n"
            f"Suggested savings target for today: ₹{target:.2f}.\n\n"
            f"Write ONE short motivational message (1–2 sentences, under 120 characters). "
            f"Be warm, practical, and culturally sensitive. Use simple English. "
            f"Do not use the word 'pension' — say 'future savings'."
        )

        try:
            import anthropic
            client   = anthropic.Anthropic(api_key=_ANTHROPIC_KEY)
            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=100,
                messages=[{"role": "user", "content": prompt}],
            )
            text = response.content[0].text.strip()
            logger.debug("[Guardian] LLM message for %s: %s", worker_name, text)
            return text
        except Exception as exc:
            logger.warning("[Guardian] LLM call failed (%s) — using template", exc)
            return None

    def generate_guardian_message(self, state_data: dict) -> str:
        """
        Public message entry-point.
        Tries LLM first; gracefully falls back to deterministic template.

        state_data keys:
            state, worker_name, income_today, target,
            consecutive_zero_days, day_of_week
        """
        llm = self._llm_message(
            state=state_data["state"],
            worker_name=state_data.get("worker_name", "Friend"),
            income_today=state_data.get("income_today", 0.0),
            target=state_data.get("target", 0.0),
            consecutive_zeros=state_data.get("consecutive_zero_days", 0),
            day_of_week=state_data.get("day_of_week", "today"),
        )
        if llm:
            return llm

        return self._deterministic_message(
            state=state_data["state"],
            day=state_data.get("day_of_week", "today"),
            target=state_data.get("target", 0.0),
        )

    # ── Main evaluation ───────────────────────────────────────────────────────

    def evaluate_worker_state(self, pension_id: str) -> dict:
        """
        Full Guardian evaluation for a single worker.

        Returns a JSON-ready dict:
        {
            "pension_id":            str,
            "state":                 str,    # STATE_* constant
            "grace_mode":            bool,
            "user_facing_target":    float,  # 0.0 when grace/rest
            "message":               str,
            "day_of_week":           str,
            "income_today":          float,
            "consecutive_zero_days": int,
            "notification_id":       str,
        }
        """
        user = get_user(pension_id)
        if user is None:
            raise ValueError(f"Worker '{pension_id}' not found")

        rest_days    = user.get("rest_days", [])
        target       = user.get("last_savings_target", 20.0)
        worker_name  = user.get("name", "Friend")
        today_dow    = datetime.now(timezone.utc).strftime("%A")   # e.g. "Monday"

        # Today's income — use last record from today, 0.0 if none reported yet
        records      = get_income_history(pension_id, days=1)
        income_today = float(records[-1]["income"]) if records else 0.0

        # Persistent consecutive-zero counter — reads from DB, survives restarts
        consec_zeros = get_recent_zero_income_days(pension_id, days=_GRACE_TRIGGER + 1)

        state     = self._determine_state(today_dow, income_today, consec_zeros, rest_days)
        is_grace  = state in (STATE_GRACE_MODE, STATE_REST_DAY)
        ui_target = 0.0 if is_grace else round(target, 2)

        state_data = {
            "state":                state,
            "worker_name":          worker_name,
            "income_today":         income_today,
            "target":               ui_target,
            "consecutive_zero_days": consec_zeros,
            "day_of_week":          today_dow,
        }
        message   = self.generate_guardian_message(state_data)
        notif_type = "grace_mode" if is_grace else "savings_target"

        notif = create_notification(
            pension_id=pension_id,
            notification_type=notif_type,
            title="Grace Mode Active" if is_grace else "Daily Savings Update",
            message=message,
            channel="in_app",
        )

        logger.info(
            "[Guardian] pension_id=%s state=%s grace=%s target=₹%.2f "
            "zeros=%d",
            pension_id, state, is_grace, ui_target, consec_zeros,
        )

        return {
            "pension_id":            pension_id,
            "state":                 state,
            "grace_mode":            is_grace,
            "user_facing_target":    ui_target,
            "message":               message,
            "day_of_week":           today_dow,
            "income_today":          income_today,
            "consecutive_zero_days": consec_zeros,
            "notification_id":       notif.get("_id", ""),
        }

    def get_notification_inbox(self, pension_id: str) -> list[dict]:
        """
        Return unread in-app notifications for the worker.
        Called by GET /notifications/:pensionId.
        """
        return get_unread_notifications(pension_id)

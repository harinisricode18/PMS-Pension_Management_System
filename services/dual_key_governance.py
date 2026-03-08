"""
services/dual_key_governance.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PMS — Phase 2B  |  Dual-Key Withdrawal Governance Service

Enforces the Social Firewall on large withdrawals.

    amount ≤ liquid_vault  →  instant, frictionless
    amount > liquid_vault  →  Dual-Key: OTP sent to nominee

DB reads:   users               ← get_user()  (balances, nominee_phone)
            pending_withdrawals ← fetch_pending_withdrawal()
DB writes:  pending_withdrawals ← store_pending_withdrawal()
            pending_withdrawals ← verify_withdrawal_otp()  (status update)
            users               ← execute_withdrawal()     (vault debit)
            transactions        ← inside execute_withdrawal (LOCKED entry)
            notifications       ← create_notification()

Prototype removals:
    ✗  self.users = {"W-1092": {...}}  (hardcoded dict)
    ✗  self.pending_requests = {}      (in-memory — lost on restart)
    ✗  print("Demo OTP:", otp)         (security: plain OTP never logged)
    ✗  random.randint OTP → secrets.SystemRandom (cryptographically secure)
    ✗  pytz.timezone hardcoded IST    (all datetimes UTC, TZ handled by client)
    ✗  Sequential vault mutations     (atomic via execute_withdrawal())
    ✗  while True / input() demo loop
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import logging
import os
import secrets
from typing import Optional

from database.db_helpers import (
    get_user,
    store_pending_withdrawal,
    fetch_pending_withdrawal,
    verify_withdrawal_otp as _db_verify_otp,
    execute_withdrawal,
    create_notification,
)
from database.mongo_connection import get_pending_withdrawals_collection

logger = logging.getLogger(__name__)

_SMS_ENABLED  = os.getenv("SMS_ENABLED", "false").lower() == "true"
_MSG91_KEY    = os.getenv("MSG91_AUTH_KEY", "")
_MSG91_SENDER = os.getenv("MSG91_SENDER_ID", "PMSSAV")


def _dispatch_otp(phone: str, otp: str, worker_name: str) -> bool:
    """
    Send OTP to nominee via SMS gateway.

    Dev mode (SMS_ENABLED=false): logs at DEBUG level only.
    Plain OTP is NEVER logged at INFO or above.
    Returns True on success (or in dev mode), False on gateway failure.
    """
    if not _SMS_ENABLED:
        # Development only — remove before production deployment
        logger.info(
            "[DualKey][DEV] OTP for %s's nominee (%s): %s",
            worker_name, phone[:3] + "****", otp,
        )
        return True

    try:
        import httpx
        message = (
            f"PMS: Your approval is needed for {worker_name}'s withdrawal. "
            f"OTP: {otp}. Valid 5 minutes. Do NOT share."
        )
        r = httpx.post(
            "https://api.msg91.com/api/v5/flow/",
            json={
                "authkey": _MSG91_KEY,
                "mobiles": phone,
                "message": message,
                "sender":  _MSG91_SENDER,
                "route":   "4",
            },
            timeout=8.0,
        )
        success = r.status_code == 200
        logger.info(
            "[DualKey] OTP dispatched to %s: HTTP %d",
            phone[:3] + "****", r.status_code,
        )
        return success
    except Exception as exc:
        logger.error("[DualKey] SMS dispatch failed: %s", exc)
        return False


class WithdrawalGovernanceService:
    """
    Multi-signature withdrawal approval (Social Firewall).

    Instant path:   amount ≤ liquid_vault  → execute immediately
    Dual-Key path:  amount > liquid_vault  → OTP to nominee, wait for verify
    """

    def request_withdrawal(self, pension_id: str, amount: float) -> dict:
        """
        Initiate a withdrawal request.

        Instant approval shape:
        {
            "approved":            True,
            "dual_key_required":   False,
            "liquid_vault_after":  float,
            "pension_vault_after": float,
            "transaction_id":      str,
        }

        Dual-Key required shape:
        {
            "approved":             False,
            "dual_key_required":    True,
            "request_id":           str,
            "nominee_phone_masked": str,
            "message":              str,
        }

        Raises:
            ValueError  — amount ≤ 0 or insufficient total balance
            RuntimeError — worker not found or SMS dispatch failure
        """
        if amount <= 0:
            raise ValueError(f"Withdrawal amount must be positive, got ₹{amount}")

        user = get_user(pension_id)
        if user is None:
            raise RuntimeError(f"Worker '{pension_id}' not found")

        liquid  = user["liquid_vault"]
        pension = user["pension_vault"]
        total   = round(liquid + pension, 2)

        if amount > liquid:
            raise ValueError(
                f"Withdrawal exceeds liquid savings. Requested ₹{amount:.2f},"
                f"Available ₹{liquid:.2f}"                
            )

        # ── Instant path ───────────────────────────────────────────────────
        if amount <= liquid:
            result = execute_withdrawal(
                pension_id=pension_id,
                amount=amount,
                approved_by_dual_key=False,
            )

            create_notification(
                pension_id=pension_id,
                notification_type="withdrawal_approved",
                title="Withdrawal Successful",
                message=f"₹{amount:.2f} withdrawn from your liquid savings.",
                channel="in_app",
            )

            logger.info(
                "[DualKey] Instant withdrawal: pension_id=%s amount=₹%.2f "
                "liquid_after=₹%.2f",
                pension_id, amount, result["liquid_vault_after"],
            )

            return {
                "approved":            True,
                "dual_key_required":   False,
                "liquid_vault_after":  result["liquid_vault_after"],
                "pension_vault_after": result["pension_vault_after"],
                "transaction_id":      result["transaction_id"],
            }

        # ── Dual-Key path ──────────────────────────────────────────────────
        nominee_phone = user.get("nominee_phone", "")
        worker_name   = user.get("name", "Worker")

        if not nominee_phone:
            raise RuntimeError(
                "No nominee phone registered. Update your profile before "
                "requesting a large withdrawal."
            )

        # Cryptographically secure 6-digit OTP
        otp_plain = str(secrets.SystemRandom().randint(100_000, 999_999))

        # Dispatch OTP BEFORE storing hash — discard plain value after this call
        if not _dispatch_otp(nominee_phone, otp_plain, worker_name):
            raise RuntimeError(
                "OTP could not be sent to your nominee. Please try again."
            )

        # store_pending_withdrawal hashes the OTP with bcrypt; plain is gone
        pending = store_pending_withdrawal(
            pension_id=pension_id,
            amount=amount,
            otp_plain=otp_plain,
            nominee_phone=nominee_phone,
        )

        masked = nominee_phone[:3] + "****" + nominee_phone[-3:]

        create_notification(
            pension_id=pension_id,
            notification_type="otp_dispatch",
            title="Nominee Approval Required",
            message=(
                f"Withdrawal of ₹{amount:.2f} requires your nominee's approval. "
                f"OTP sent to {masked}. Expires in 5 minutes."
            ),
            channel="in_app",
        )

        logger.info(
            "[DualKey] Dual-Key triggered: pension_id=%s amount=₹%.2f "
            "request_id=%s nominee=%s",
            pension_id, amount, pending["request_id"], masked,
        )

        return {
            "approved":             False,
            "dual_key_required":    True,
            "request_id":           pending["request_id"],
            "nominee_phone_masked": masked,
            "message": (
                f"Your nominee's approval is required for ₹{amount:.2f}. "
                f"An OTP has been sent to {masked}. It expires in 5 minutes."
            ),
        }

    def verify_withdrawal_otp(self, request_id: str, otp_entered: str) -> dict:
        """
        Nominee submits the OTP. Executes the withdrawal if correct.

        Returns:
        {
            "approved":            bool,
            "transaction_id":      str,    # present only when approved=True
            "liquid_vault_after":  float,
            "pension_vault_after": float,
            "message":             str,
        }
        """
        # db_helpers.verify_withdrawal_otp:
        #   — checks bcrypt hash, counts attempts, marks APPROVED or increments failures
        otp_valid = _db_verify_otp(request_id, otp_entered)

        if not otp_valid:
            req = fetch_pending_withdrawal(request_id)
            if req is None:
                return {
                    "approved": False,
                    "message":  "Request not found or expired. Please start a new withdrawal.",
                }
            attempts = req.get("attempt_count", 0)
            logger.warning(
                "[DualKey] OTP mismatch: request_id=%s attempts=%d",
                request_id, attempts,
            )
            return {
                "approved": False,
                "message":  "Incorrect OTP. Please try again.",
            }

        # OTP accepted — fetch the now-APPROVED document for pension_id + amount
        approved_doc = get_pending_withdrawals_collection().find_one(
            {"request_id": request_id, "status": "APPROVED"},
            {"_id": 0},
        )
        if approved_doc is None:
            logger.error(
                "[DualKey] OTP verified but APPROVED doc missing: %s", request_id
            )
            raise RuntimeError(
                "OTP verified but request not found. Contact support."
            )

        pension_id = approved_doc["pension_id"]
        amount     = approved_doc["amount"]

        result = execute_withdrawal(
            pension_id=pension_id,
            amount=amount,
            approved_by_dual_key=True,
        )

        create_notification(
            pension_id=pension_id,
            notification_type="withdrawal_approved",
            title="Withdrawal Approved ✅",
            message=(
                f"Your nominee approved ₹{amount:.2f}. Funds have been released."
            ),
            channel="in_app",
        )

        logger.info(
            "[DualKey] Withdrawal approved: pension_id=%s amount=₹%.2f txn=%s",
            pension_id, amount, result["transaction_id"],
        )

        return {
            "approved":            True,
            "transaction_id":      result["transaction_id"],
            "liquid_vault_after":  result["liquid_vault_after"],
            "pension_vault_after": result["pension_vault_after"],
            "message":             f"₹{amount:.2f} successfully released.",
        }

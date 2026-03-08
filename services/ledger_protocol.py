"""
services/ledger_protocol.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PMS — Phase 2B  |  Source-Verified Ledger Service

Implements the payer-led income verification flow.  A payer
(employer / customer) scans the worker's QR, confirms the
payment amount, and the transaction is permanently LOCKED —
establishing a source-verified income trail for credit scoring.

DB reads:   users        ← get_user()
            tokens       ← fetch_valid_token()
DB writes:  tokens       ← store_token(), mark_token_used()
            transactions ← deposit_split()  (source_verified=True)
            income_records ← record_income() (source="payer_verified")

Prototype removals:
    ✗  tokens = {}  (global in-memory dict — destroyed on restart)
    ✗  ledger = []  (global list — transactions collection replaces it)
    ✗  worker_id = "W001" hardcoded in /generate
    ✗  ngrok import + hardcoded auth token  (security issue — rotated)
    ✗  HTML string responses from FastAPI routes
    ✗  FastAPI app instance (moved to routes/ledger_routes.py in Phase 3)
    ✗  pyngrok.ngrok.connect() at module level
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

"""

import logging
from typing import Optional

from database.db_helpers import (
    get_user,
    store_token,
    fetch_valid_token,
    mark_token_used,
    deposit_split,
    record_income,
    get_transaction_history,
    get_annual_deposit_total,
)

logger = logging.getLogger(__name__)

_PAYER_TOKEN_EXPIRY_MINUTES = 10   # payer has 10 min from QR generation
_ANNUAL_NPS_MINIMUM         = 1000.0   # ₹1 000/year to keep NPS account Active


class LedgerService:
    """
    Payer-led income verification service.

    Three-step flow:
        1. generate_payment_token()  — worker generates QR on phone
        2. validate_token()          — payer scans QR, sees worker info
        3. confirm_payment()         — payer enters amount → LOCKED in DB

    The frontend /transactions and /annual-summary pages are served
    by get_worker_ledger().
    """

    def generate_payment_token(
        self, pension_id: str, expected_amount: float = 0.0
    ) -> dict:
        """
        Worker requests a payer-verification QR token.

        Args:
            pension_id:       Worker's pension ID (from JWT session).
            expected_amount:  Amount the worker expects to receive.
                              Payer may override this during confirm_payment().

        Returns:
        {
            "token_id":       str,   # 6-char code displayed as QR
            "pension_id":     str,
            "amount":         float,
            "expires_at":     str,   # ISO 8601
        }

        Raises ValueError if worker not found.
        """
        user = get_user(pension_id)
        if user is None:
            raise ValueError(f"Worker '{pension_id}' not found")

        token = store_token(
            pension_id=pension_id,
            amount=expected_amount,
            token_type="payer_verify",
            expiry_minutes=_PAYER_TOKEN_EXPIRY_MINUTES,
        )

        logger.info(
            "[Ledger] Token generated: pension_id=%s token_id=%s amount=₹%.2f",
            pension_id, token["token_id"], expected_amount,
        )

        return {
            "token_id":   token["token_id"],
            "pension_id": pension_id,
            "amount":     expected_amount,
            "expires_at": token["expires_at"].isoformat(),
        }

    def validate_token(self, token_id: str) -> dict:
        """
        Payer scans the QR — validate before asking for the amount.

        Returns worker name and token metadata so the payer can confirm
        they are paying the right person.

        Returns:
        {
            "valid":       bool,
            "token_id":    str,
            "worker_name": str,
            "pension_id":  str,
            "expires_at":  str,
        }
        — or —
        {
            "valid":  False,
            "reason": str,
        }
        """
        token = fetch_valid_token(token_id)
        if token is None:
            logger.warning("[Ledger] Invalid or expired token: %s", token_id)
            return {
                "valid":  False,
                "reason": "Token is invalid, already used, or expired. "
                          "Ask the worker to generate a new one.",
            }

        user        = get_user(token["pension_id"])
        worker_name = user.get("name", "Unknown Worker") if user else "Unknown Worker"

        return {
            "valid":       True,
            "token_id":    token["token_id"],
            "worker_name": worker_name,
            "pension_id":  token["pension_id"],
            "expires_at":  token["expires_at"].isoformat(),
        }

    def confirm_payment(
        self,
        token_id: str,
        amount: float,
        method: str = "CASH",
        payer_id: Optional[str] = None,
    ) -> dict:
        """
        Payer confirms payment → income LOCKED in transactions collection.

        Steps:
            1. Validate amount (pre-transaction, no DB cost).
            2. Open a single MongoDB transaction session.
            3. Inside the session — atomically:
               a. Claim the token with a PENDING→USED status swap using
                  find_one_and_update with a filter on status="PENDING".
                  If the swap returns None the token was already consumed
                  (race condition / retry) — abort immediately.
               b. Credit pension_vault (80%) and liquid_vault (20%) with
                  a single $inc on the user document.
               c. Insert the LOCKED transaction record.
            4. Outside the transaction — insert the income_record.
               This is a soft write: it feeds the FSP / Guardian engines
               but is not a financial-state mutation, so a failure here
               must not roll back the vault credit that the payer already
               triggered. Log a warning and continue.

        Idempotency guarantee:
            Step 3a uses find_one_and_update with filter {status: "PENDING"}.
            A token can only transition PENDING→USED once. Any concurrent or
            retried request that reaches step 3a after the first success will
            get None back and raise ValueError before touching the vaults —
            making duplicate deposits structurally impossible within the same
            transaction boundary.

        Args:
            token_id:  Token from the worker's QR.
            amount:    Actual amount paid.
            method:    "CASH" or "UPI".
            payer_id:  Optional payer identifier for future trust scoring.

        Returns:
        {
            "success":             bool,
            "transaction_id":      str,
            "pension_vault_after": float,
            "liquid_vault_after":  float,
            "pension_credit":      float,
            "liquid_credit":       float,
            "source_verified":     bool,
            "method":              str,
        }

        Raises:
            ValueError      — amount out of range, token invalid/used/expired.
            RuntimeError    — user not found, or DB write failure.
        """

        method = method.upper()   # normalize frontend input        
        # ── 1. Pre-flight validation (no DB cost) ─────────────────────────
        if amount <= 0:
            raise ValueError(f"Payment amount must be positive, got ₹{amount}")
        if amount > 50_000:
            raise ValueError(
                f"₹{amount} exceeds single-transaction limit of ₹50,000. "
                "Contact support for large transactions."
            )

        # ── 2. Eagerly validate the token before opening a session ────────
        # This is a read-only check; it does not consume the token.
        # The actual atomic claim happens inside the transaction at step 3a.
        # This early check surfaces the common "already used / expired" case
        # cheaply, without holding a transaction open during the round-trip.
        token = fetch_valid_token(token_id)
        if token is None:
            raise ValueError(
                f"Token '{token_id}' is invalid, already used, or expired."
            )

        pension_id     = token["pension_id"]

        # Income should not be auto-saved
        pension_credit = 0
        liquid_credit  = amount
        # pension_credit = round(amount * 0.80, 2)
        # liquid_credit  = round(amount - pension_credit, 2)  # exact complement

        # ── 3. Atomic transaction: claim token + credit vaults + record ───
        from database.mongo_connection import mongo_transaction, get_db
        from models.schemas import TransactionDocument, _now
        import uuid

        try:
            with mongo_transaction() as (session, db):

                # 3a. Atomically claim the token — PENDING → USED.
                #     The filter on status="PENDING" means this update
                #     succeeds at most once across all concurrent requests.
                claimed_token = db["tokens"].find_one_and_update(
                    {
                        "token_id": token_id.upper(),
                        "status":   "PENDING",
                        "expires_at": {"$gt": _now()},
                    },
                    {"$set": {"status": "USED"}},
                    session=session,
                    return_document=False,  # we don't need the updated doc
                )
                if claimed_token is None:
                    # Another request (race or retry) already consumed this token.
                    raise ValueError(
                        f"Token '{token_id}' was already used or expired "
                        "during processing. No deposit was recorded."
                    )

                # 3b. Credit both vaults atomically with a single $inc.
                '''
                updated_user = db["users"].find_one_and_update(
                    {"pension_id": pension_id},
                    {
                        "$inc": {
                            "pension_vault": pension_credit,
                            "liquid_vault":  liquid_credit,
                        },
                        "$set": {"updated_at": _now()},
                    },
                    return_document=True,
                    projection={"pension_vault": 1, "liquid_vault": 1, "_id": 0},
                    session=session,
                )
                '''
                updated_user = db["users"].find_one(
                    {"pension_id": pension_id},
                    projection={"pension_vault": 1, "liquid_vault": 1, "_id": 0},
                    session=session,
                )

                if updated_user is None:
                    raise RuntimeError(
                        f"User '{pension_id}' not found during vault credit."
                    )

                pension_after = updated_user["pension_vault"]
                liquid_after  = updated_user["liquid_vault"]

                # 3c. Insert the immutable LOCKED transaction record.
                txn_doc = TransactionDocument(
                    pension_id=pension_id,
                    amount=amount,
                    type="payer_income",
                    status="LOCKED",
                    source_verified=True,
                    related_token_id=token_id,
                    pension_vault_after=pension_after,
                    liquid_vault_after=liquid_after,
                    notes=f"Payer QR confirmation. Method: {method}. "
                          f"Payer: {payer_id or 'anonymous'}",
                ).to_dict()
                txn_result = db["transactions"].insert_one(txn_doc, session=session)
                transaction_id = str(txn_result.inserted_id)

        except ValueError:
            raise  # re-raise clean validation errors as-is
        except Exception as exc:
            logger.error(
                "[Ledger] Transaction aborted: token=%s pension_id=%s error=%s",
                token_id, pension_id, exc,
            )
            print("CONFIRM PAYMENT ERROR:", exc)
            raise RuntimeError(
                "Payment confirmation failed due to a database error. "
                "No funds were moved. Please retry."
            ) from exc

        # ── 4. Income record — outside the transaction (non-financial) ────
        # A failure here must NOT roll back the vault credit that the payer
        # already triggered. We log a warning and continue so the API layer
        # can return a successful response to the payer's device.
        try:
            record_income(
                pension_id=pension_id,
                amount=amount,
                source="payer_verified",
                verified_by_payer_id=payer_id,
                notes=f"Confirmed via QR token. Method: {method}",
            )
        except Exception as exc:
            logger.warning(
                "[Ledger] Income record write failed after successful vault credit: "
                "token=%s pension_id=%s error=%s. FSP engine may miss this entry "
                "until reconciliation.",
                token_id, pension_id, exc,
            )

        logger.info(
            "[Ledger] Payment confirmed: pension_id=%s amount=₹%.2f "
            "method=%s token=%s txn=%s",
            pension_id, amount, method, token_id, transaction_id,
        )

        return {
            "success":             True,
            "transaction_id":      transaction_id,
            "pension_vault_after": pension_after,
            "liquid_vault_after":  liquid_after,
            "pension_credit":      pension_credit,
            "liquid_credit":       liquid_credit,
            "source_verified":     True,
            "method":              method,
        }

    def get_worker_ledger(self, pension_id: str, limit: int = 50) -> dict:
        """
        Return transaction history + annual summary for a worker.

        Feeds both:
          - React /transactions/:pensionId page (transaction list)
          - React /annual-summary/:pensionId   (Dashboard projections)

        Returns:
        {
            "pension_id":           str,
            "transactions":         list[dict],
            "annual_total":         float,
            "account_status":       str,    # "Active" | "At Risk"
            "remaining_to_minimum": float,
        }
        """
        transactions  = get_transaction_history(pension_id, limit=limit)
        annual_total  = get_annual_deposit_total(pension_id)
        remaining     = max(_ANNUAL_NPS_MINIMUM - annual_total, 0.0)
        status        = "Active" if annual_total >= _ANNUAL_NPS_MINIMUM else "At Risk"

        logger.info(
            "[Ledger] Ledger fetched: pension_id=%s txns=%d annual=₹%.2f status=%s",
            pension_id, len(transactions), annual_total, status,
        )

        return {
            "pension_id":           pension_id,
            "transactions":         transactions,
            "annual_total":         round(annual_total, 2),
            "account_status":       status,
            "remaining_to_minimum": round(remaining, 2),
        }

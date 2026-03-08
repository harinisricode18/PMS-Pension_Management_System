"""
database/db_helpers.py
─────────────────────────────────────────────────────────────────────────────
PMS — Pension Management System
Phase 2A: Reusable Data Access Functions

This module provides a clean API that all service modules will call
instead of using pymongo directly. Every function here:

  1. Accepts typed parameters (no raw dict construction in service code)
  2. Returns plain Python dicts or None — never pymongo Cursor objects
  3. Is documented with which service module uses it
  4. Uses the mongo_transaction() context manager for any multi-doc writes

Services import from here:
    from database.db_helpers import get_income_history, update_vault_balances
─────────────────────────────────────────────────────────────────────────────
"""

import logging
import bcrypt
import uuid
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Optional

from pymongo import DESCENDING

from database.mongo_connection import (
    get_users_collection,
    get_income_records_collection,
    get_transactions_collection,
    get_tokens_collection,
    get_pending_withdrawals_collection,
    get_agents_collection,
    get_notifications_collection,
    mongo_transaction,
)
from models.schemas import (
    UserDocument, IncomeRecordDocument, TransactionDocument,
    TokenDocument, PendingWithdrawalDocument, AgentDocument,
    NotificationDocument, _now, _minutes_from_now
)

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# SECTION A — USER OPERATIONS
# Used by: all modules, all frontend endpoints
# ─────────────────────────────────────────────────────────────────────────────

def get_user(pension_id: str) -> Optional[dict]:
    """
    Fetch a single user document by pension_id.
    Returns None if not found.

    Replaces the hardcoded:
        users = {"W-1092": {"name": "Raju", "vault_a_pension": 367.58, ...}}
    in ALL service modules.
    """
    doc = get_users_collection().find_one(
        {"pension_id": pension_id},
        {"_id": 0}   # Exclude MongoDB internal _id from returned dict
    )
    return doc


def create_user(
    name: str,
    date_of_birth: datetime,
    phone: str,
    password_plain: str,
    nominee_phone: str,
    survival_minimum: float = 150.0,
    rest_days: list = None,
) -> dict:
    """
    Register a new worker. Generates pension_id, hashes the password.
    Returns the created document (without password_hash).

    Used by: /register endpoint (replaces existing server.js logic in Python).
    """
    pension_id   = "PP-" + secrets.token_hex(4).upper()
    password_hash = bcrypt.hashpw(password_plain.encode(), bcrypt.gensalt()).decode()

    user = UserDocument(
        pension_id=pension_id,
        name=name,
        date_of_birth=date_of_birth,
        phone=phone,
        password_hash=password_hash,
        nominee_phone=nominee_phone,
        survival_minimum=survival_minimum,
        rest_days=rest_days or [],
    )
    doc = user.to_dict()
    get_users_collection().insert_one(doc)

    # Return safe version (no password_hash)
    doc.pop("password_hash", None)
    doc.pop("_id", None)
    return doc


def update_user_savings_target(pension_id: str, new_target: float) -> bool:
    """
    Persist the latest EMA savings target for a worker.
    Called at the end of each FSP Engine run.

    Replaces: in-memory state loss between sessions (Module 1 critical fix).
    """
    result = get_users_collection().update_one(
        {"pension_id": pension_id},
        {"$set": {
            "last_savings_target": round(new_target, 2),
            "updated_at": _now()
        }}
    )
    return result.modified_count == 1


def update_insurance_status(pension_id: str, score: float, status: str) -> bool:
    """
    Cache the latest Pension Health Score and insurance status.
    Called by Module 7 after every score recomputation.
    """
    result = get_users_collection().update_one(
        {"pension_id": pension_id},
        {"$set": {
            "pension_health_score": round(score, 2),
            "insurance_status": status,
            "updated_at": _now()
        }}
    )
    return result.modified_count == 1


# ─────────────────────────────────────────────────────────────────────────────
# SECTION B — INCOME RECORDS
# Used by: Module 1 (FSP Engine), Module 2 (Guardian Agent)
# ─────────────────────────────────────────────────────────────────────────────

def record_income(
    pension_id: str,
    amount: float,
    date: Optional[datetime] = None,
    source: str = "self_reported",
    verified_by_payer_id: Optional[str] = None,
    notes: Optional[str] = None,
) -> dict:
    """
    Insert a single daily income record.

    Replaces the implicit data in chaotic_df / stable_df DataFrames
    from Modules 1 and 2. Every income entry — whether self-reported
    or payer-verified — must flow through this function.
    """
    doc = IncomeRecordDocument(
        pension_id=pension_id,
        date=date or _now(),
        income=amount,
        source=source,
        verified_by_payer_id=verified_by_payer_id,
        notes=notes,
    ).to_dict()

    result = get_income_records_collection().insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def get_income_history(pension_id: str, days: int = 30) -> list[dict]:
    """
    Fetch the last `days` days of income records for a worker,
    sorted oldest-first (required for sequential EMA computation).

    This is the PRIMARY replacement for:
        stable_df / chaotic_df  (Module 1)
        processed_chaotic       (Module 2)

    Returns a list of dicts, each containing at minimum:
        {"date": <datetime>, "income": <float>, "source": <str>}

    Module 1 (FSP Engine) calls this to build the rolling 7/30-day window.
    Module 2 (Guardian Agent) calls this to check consecutive zero days.
    """
    cutoff = _now() - timedelta(days=days)
    cursor = get_income_records_collection().find(
        {
            "pension_id": pension_id,
            "date": {"$gte": cutoff}
        },
        {"_id": 0, "date": 1, "income": 1, "source": 1}
    ).sort("date", 1)   # Ascending: oldest first, for EMA iteration

    return list(cursor)


def get_recent_zero_income_days(pension_id: str, days: int = 3) -> int:
    """
    Returns the count of consecutive zero-income days up to today.
    Used by Module 2 (Guardian Agent) to decide if Grace Mode should activate.

    Replaces the in-memory consecutive_zero_days counter that reset on restart.
    """
    cutoff = _now() - timedelta(days=days)
    records = get_income_records_collection().find(
        {
            "pension_id": pension_id,
            "date": {"$gte": cutoff}
        },
        {"_id": 0, "date": 1, "income": 1}
    ).sort("date", DESCENDING)   # Newest first for consecutive count

    consecutive = 0
    for record in records:
        if record["income"] == 0.0:
            consecutive += 1
        else:
            break   # Stop at first non-zero day
    return consecutive


# ─────────────────────────────────────────────────────────────────────────────
# SECTION C — VAULT OPERATIONS (Atomic)
# Used by: Module 4, 5, 6
# ─────────────────────────────────────────────────────────────────────────────

def deposit_split(
    pension_id: str,
    total_amount: float,
    source_verified: bool = False,
    related_token_id: Optional[str] = None,
    related_agent_id: Optional[str] = None,
) -> dict:
    """
    Execute an 80/20 vault split for an incoming deposit.
    ATOMIC: updates pension_vault and liquid_vault in a single $inc operation,
    then records the transaction — all inside a MongoDB session/transaction.

    This is the production replacement for:
        process_smart_deposit() in emergency_shield.py

    Returns:
        {
            "pension_vault_after": float,
            "liquid_vault_after":  float,
            "pension_credit":      float,
            "liquid_credit":       float,
            "transaction_id":      str
        }

    Raises ValueError if amount <= 0.
    Raises RuntimeError on DB write failure.
    """
    if total_amount <= 0:
        raise ValueError(f"Deposit amount must be positive, got {total_amount}")

    pension_credit = round(total_amount * 0.80, 2)
    liquid_credit  = round(total_amount - pension_credit, 2)   # Ensures exact sum

    with mongo_transaction() as (session, db):
        # Step 1: Atomically credit both vaults in a single update
        result = db["users"].find_one_and_update(
            {"pension_id": pension_id},
            {
                "$inc": {
                    "pension_vault": pension_credit,
                    "liquid_vault":  liquid_credit,
                },
                "$set": {"updated_at": _now()}
            },
            return_document=True,   # Returns the UPDATED document
            projection={"pension_vault": 1, "liquid_vault": 1, "_id": 0},
            session=session
        )

        if result is None:
            raise RuntimeError(f"User '{pension_id}' not found during deposit_split")

        pension_after = result["pension_vault"]
        liquid_after  = result["liquid_vault"]

        # Step 2: Record the immutable transaction entry
        txn_doc = TransactionDocument(
            pension_id=pension_id,
            amount=total_amount,
            type="deposit",
            status="LOCKED",
            source_verified=source_verified,
            related_token_id=related_token_id,
            related_agent_id=related_agent_id,
            pension_vault_after=pension_after,
            liquid_vault_after=liquid_after,
        ).to_dict()

        txn_result = db["transactions"].insert_one(txn_doc, session=session)

    return {
        "pension_vault_after": pension_after,
        "liquid_vault_after":  liquid_after,
        "pension_credit":      pension_credit,
        "liquid_credit":       liquid_credit,
        "transaction_id":      str(txn_result.inserted_id),
    }


def execute_withdrawal(
    pension_id: str,
    amount: float,
    approved_by_dual_key: bool = False,
) -> dict:
    """
    Execute a withdrawal. Drains liquid_vault first; if insufficient,
    drains the remainder from pension_vault (requires dual_key approval).

    ATOMIC: Uses a MongoDB transaction so partial vault drains are safe.

    This replaces the sequential dict mutations in:
        dual_key_governance.py → verify_spouse_otp() fund release block

    Returns:
        {"liquid_vault_after": float, "pension_vault_after": float, "transaction_id": str}

    Raises:
        ValueError  — if amount > total available balance
        PermissionError — if pension draw required but dual_key not approved
    """
    user = get_user(pension_id)
    if user is None:
        raise RuntimeError(f"User '{pension_id}' not found")

    liquid  = user["liquid_vault"]
    pension = user["pension_vault"]
    total   = round(liquid + pension, 2)

    if amount > total:
        raise ValueError(f"Insufficient funds: requested ₹{amount}, available ₹{total}")

    # Determine how much comes from each vault
    liquid_debit  = min(amount, liquid)
    pension_debit = round(amount - liquid_debit, 2)

    if pension_debit > 0 and not approved_by_dual_key:
        raise PermissionError(
            "Drawing from pension vault requires Dual-Key approval."
        )

    with mongo_transaction() as (session, db):
        result = db["users"].find_one_and_update(
            {"pension_id": pension_id},
            {
                "$inc": {
                    "pension_vault": -pension_debit,
                    "liquid_vault":  -liquid_debit,
                },
                "$set": {"updated_at": _now()}
            },
            return_document=True,
            projection={"pension_vault": 1, "liquid_vault": 1, "_id": 0},
            session=session
        )

        txn_doc = TransactionDocument(
            pension_id=pension_id,
            amount=amount,
            type="withdrawal",
            status="LOCKED",
            pension_vault_after=result["pension_vault"],
            liquid_vault_after=result["liquid_vault"],
            notes=f"liquid_debit={liquid_debit}, pension_debit={pension_debit}",
        ).to_dict()

        txn_result = db["transactions"].insert_one(txn_doc, session=session)

    return {
        "liquid_vault_after":  result["liquid_vault"],
        "pension_vault_after": result["pension_vault"],
        "transaction_id": str(txn_result.inserted_id),
    }


def execute_agent_cash_bridge(
    pension_id: str,
    agent_id: str,
    amount: float,
    token_id: str,
) -> dict:
    """
    Atomic cash-to-digital handshake for the Digital Bridge (Module 6).

    In a single transaction:
    1. Debit agent's digital_float
    2. Credit worker's pension_vault and liquid_vault (via 80/20 split)
    3. Record the transaction as type="cash_bridge", source_verified=True
    4. Update agent's total_cash_processed counter

    Raises:
        ValueError if agent has insufficient float
        RuntimeError if agent or user not found
    """
    agent = get_agents_collection().find_one({"agent_id": agent_id})
    if agent is None:
        raise RuntimeError(f"Agent '{agent_id}' not found")
    if agent["digital_float"] < amount:
        raise ValueError(
            f"Agent '{agent_id}' has insufficient float: "
            f"₹{agent['digital_float']} < ₹{amount}"
        )

    pension_credit = round(amount * 0.80, 2)
    liquid_credit  = round(amount - pension_credit, 2)

    with mongo_transaction() as (session, db):
        # Debit agent float
        db["agents"].update_one(
            {"agent_id": agent_id},
            {
                "$inc": {
                    "digital_float": -amount,
                    "total_cash_processed": amount,
                    "total_transactions_processed": 1,
                },
                "$set": {"updated_at": _now()}
            },
            session=session
        )

        # Credit worker vaults (80/20)
        updated_user = db["users"].find_one_and_update(
            {"pension_id": pension_id},
            {
                "$inc": {
                    "pension_vault": pension_credit,
                    "liquid_vault":  liquid_credit,
                },
                "$set": {"updated_at": _now()}
            },
            return_document=True,
            projection={"pension_vault": 1, "liquid_vault": 1, "_id": 0},
            session=session
        )

        if updated_user is None:
            raise RuntimeError(f"User '{pension_id}' not found during cash bridge")

        # Record transaction
        txn_doc = TransactionDocument(
            pension_id=pension_id,
            amount=amount,
            type="cash_bridge",
            status="LOCKED",
            source_verified=True,
            related_agent_id=agent_id,
            related_token_id=token_id,
            pension_vault_after=updated_user["pension_vault"],
            liquid_vault_after=updated_user["liquid_vault"],
        ).to_dict()

        txn_result = db["transactions"].insert_one(txn_doc, session=session)

        # Mark the token as USED
        db["tokens"].update_one(
            {"token_id": token_id},
            {"$set": {"status": "USED"}},
            session=session
        )

    return {
        "pension_vault_after": updated_user["pension_vault"],
        "liquid_vault_after":  updated_user["liquid_vault"],
        "pension_credit":      pension_credit,
        "liquid_credit":       liquid_credit,
        "transaction_id":      str(txn_result.inserted_id),
    }


# ─────────────────────────────────────────────────────────────────────────────
# SECTION D — TOKEN OPERATIONS
# Used by: Module 3 (Ledger Protocol), Module 6 (Digital Bridge)
# ─────────────────────────────────────────────────────────────────────────────

def _generate_token_id(length: int = 6) -> str:
    """Generate a random uppercase alphanumeric token ID."""
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def store_token(
    pension_id: str,
    amount: float,
    token_type: str = "qr_deposit",
    expiry_minutes: int = 5,
) -> dict:
    """
    Create and persist a new QR / verification token.

    Replaces:
        self.tokens[token_id] = {...}   in QRTokenManager.__init__

    Returns the created token document (including token_id for QR display).
    """
    token_id = _generate_token_id()

    # Ensure uniqueness (retry on collision — collision probability is tiny)
    tokens_col = get_tokens_collection()
    while tokens_col.find_one({"token_id": token_id, "status": "PENDING"}):
        token_id = _generate_token_id()

    doc = TokenDocument(
        token_id=token_id,
        pension_id=pension_id,
        amount=amount,
        token_type=token_type,
        expires_at=_minutes_from_now(expiry_minutes),
    ).to_dict()

    tokens_col.insert_one(doc)
    doc.pop("_id", None)
    return doc


def fetch_valid_token(token_id: str) -> Optional[dict]:
    """
    Fetch a PENDING, non-expired token by its ID.
    Returns None if not found, already used, or expired.

    Replaces:
        QRTokenManager.fetch_token()  in digital_bridge.py
        tokens[token]                 in ledger_protocol.py
    """
    return get_tokens_collection().find_one(
        {
            "token_id": token_id.upper(),
            "status": "PENDING",
            "expires_at": {"$gt": _now()}
        },
        {"_id": 0}
    )


def mark_token_used(token_id: str) -> bool:
    """
    Mark a token as USED. Called after successful confirmation.
    Returns True if the update was applied.

    Replaces:
        QRTokenManager.mark_used()    in digital_bridge.py
        token_data["status"] = "USED" in ledger_protocol.py
    """
    result = get_tokens_collection().update_one(
        {"token_id": token_id.upper(), "status": "PENDING"},
        {"$set": {"status": "USED"}}
    )
    return result.modified_count == 1


# ─────────────────────────────────────────────────────────────────────────────
# SECTION E — PENDING WITHDRAWAL OPERATIONS
# Used by: Module 4 (Dual-Key Governance)
# ─────────────────────────────────────────────────────────────────────────────

def store_pending_withdrawal(
    pension_id: str,
    amount: float,
    otp_plain: str,
    nominee_phone: str,
) -> dict:
    """
    Persist a new withdrawal request and its OTP hash.

    The plain OTP is NEVER stored — only its bcrypt hash.
    The plain OTP must be dispatched to nominee_phone before this function
    is called, then discarded from memory.

    Replaces:
        self.pending_requests[request_id] = {...}  in DualKeyGovernanceEngine
    """
    otp_hash = bcrypt.hashpw(otp_plain.encode(), bcrypt.gensalt()).decode()

    doc = PendingWithdrawalDocument(
        pension_id=pension_id,
        amount=amount,
        otp_hash=otp_hash,
        nominee_phone=nominee_phone,
    ).to_dict()

    get_pending_withdrawals_collection().insert_one(doc)
    doc.pop("_id", None)
    doc.pop("otp_hash", None)   # Never return the hash to callers
    return doc


def fetch_pending_withdrawal(request_id: str) -> Optional[dict]:
    """
    Fetch an active (PENDING, non-expired) withdrawal request.

    Returns None if not found, already resolved, or expired (TTL deleted it).

    Replaces:
        req = self.pending_requests.get(request_id)
        if not req or req["status"] != "PENDING": ...
    """
    return get_pending_withdrawals_collection().find_one(
        {
            "request_id": request_id,
            "status": "PENDING",
            "expires_at": {"$gt": _now()}
        },
        {"_id": 0}
    )


def verify_withdrawal_otp(request_id: str, otp_entered: str) -> bool:
    """
    Verify the OTP entered by the nominee.

    Steps:
    1. Fetch the pending request
    2. Check attempt_count (max 5 to prevent brute-force)
    3. Verify otp_entered against stored bcrypt hash
    4. On success: mark APPROVED
    5. On failure: increment attempt_count; mark FAILED if max reached

    Returns True if OTP matches and request transitions to APPROVED.

    Replaces:
        DualKeyGovernanceEngine.verify_spouse_otp()
    """
    col = get_pending_withdrawals_collection()
    req = col.find_one({"request_id": request_id, "status": "PENDING", "expires_at": {"$gt": _now()}})

    if req is None:
        logger.warning("Withdrawal OTP verify: request_id '%s' not found or expired", request_id)
        return False

    MAX_ATTEMPTS = 5
    if req["attempt_count"] >= MAX_ATTEMPTS:
        col.update_one({"request_id": request_id}, {"$set": {"status": "FAILED"}})
        logger.warning("Withdrawal OTP: max attempts exceeded for request_id '%s'", request_id)
        return False

    otp_matches = bcrypt.checkpw(otp_entered.encode(), req["otp_hash"].encode())

    if otp_matches:
        col.update_one(
            {"request_id": request_id},
            {"$set": {"status": "APPROVED"}}
        )
        return True
    else:
        col.update_one(
            {"request_id": request_id},
            {"$inc": {"attempt_count": 1}}
        )
        # Auto-fail after max attempts
        updated = col.find_one({"request_id": request_id})
        if updated and updated["attempt_count"] >= MAX_ATTEMPTS:
            col.update_one({"request_id": request_id}, {"$set": {"status": "FAILED"}})
        return False


# ─────────────────────────────────────────────────────────────────────────────
# SECTION F — TRANSACTION QUERIES
# Used by: Module 7, frontend /transactions endpoint
# ─────────────────────────────────────────────────────────────────────────────

def get_transaction_history(pension_id: str, limit: int = 50) -> list[dict]:
    """
    Fetch the most recent transactions for a worker — newest first.
    Used by the React frontend's /transactions/:pensionId page.

    The returned field names match what the frontend currently expects:
        {_id, pensionId, amount, type, date}
    with additional vault snapshot fields.
    """
    cursor = get_transactions_collection().find(
        {"pension_id": pension_id},
        {
            "_id": 1,
            "pension_id": 1,
            "amount": 1,
            "type": 1,
            "status": 1,
            "source_verified": 1,
            "created_at": 1,
        }
    ).sort("created_at", DESCENDING).limit(limit)

    results = []
    for doc in cursor:
        doc["_id"] = str(doc["_id"])
        # Map to frontend-compatible field names
        doc["pensionId"] = doc.pop("pension_id")
        doc["date"]      = doc.pop("created_at")
        results.append(doc)
    return results


def get_annual_deposit_total(pension_id: str, year: Optional[int] = None) -> float:
    """
    Sum all LOCKED deposits for a given year (defaults to current year).
    Used by the /annual-summary endpoint consumed by the React Dashboard.
    """
    year = year or datetime.now(timezone.utc).year
    start = datetime(year, 1, 1, tzinfo=timezone.utc)
    end   = datetime(year + 1, 1, 1, tzinfo=timezone.utc)

    pipeline = [
        {"$match": {
            "pension_id": pension_id,
            "type": {"$in": ["deposit", "cash_bridge", "payer_income"]},
            "status": "LOCKED",
            "created_at": {"$gte": start, "$lt": end}
        }},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}}
    ]
    result = list(get_transactions_collection().aggregate(pipeline))
    return result[0]["total"] if result else 0.0


def get_verified_income_ratio(pension_id: str) -> float:
    """
    Returns the fraction of LOCKED transactions that are source_verified.
    Used by Module 7 (Pension Health Engine) for the verification score component.

    Replaces the hardcoded:
        score += 200  # fully verified
    """
    pipeline = [
        {"$match": {"pension_id": pension_id, "status": "LOCKED",
                    "type": {"$in": ["deposit", "cash_bridge", "payer_income"]}}},
        {"$group": {
            "_id": None,
            "total": {"$sum": 1},
            "verified": {"$sum": {"$cond": ["$source_verified", 1, 0]}}
        }}
    ]
    result = list(get_transactions_collection().aggregate(pipeline))
    if not result or result[0]["total"] == 0:
        return 0.0
    return result[0]["verified"] / result[0]["total"]


def get_recent_deposit_streak(pension_id: str) -> int:
    """
    Returns the number of consecutive calendar days (ending today) on which
    the worker made at least one LOCKED deposit.

    Replaces the incorrect streak check in Module 7 that counted total ledger
    length instead of a true consecutive streak.
    """
    records = list(get_transactions_collection().find(
        {
            "pension_id": pension_id,
            "status": "LOCKED",
            "type": {"$in": ["deposit", "cash_bridge", "payer_income"]}
        },
        {"_id": 0, "created_at": 1}
    ).sort("created_at", DESCENDING).limit(90))   # Look back max 90 days

    if not records:
        return 0

    today     = _now().date()
    day_set   = {r["created_at"].date() for r in records}
    streak    = 0
    check_day = today

    while check_day in day_set:
        streak    += 1
        check_day  = check_day - timedelta(days=1)

    return streak


# ─────────────────────────────────────────────────────────────────────────────
# SECTION G — NOTIFICATIONS
# Used by: Module 2 (Guardian), Module 4 (Dual-Key)
# ─────────────────────────────────────────────────────────────────────────────

def create_notification(
    pension_id: str,
    notification_type: str,
    title: str,
    message: str,
    channel: str = "in_app",
) -> dict:
    """
    Persist a notification event. This replaces all print() statements
    in Guardian Agent and Dual-Key Governance that output messages
    to the console.

    The in_app notifications are retrieved by the frontend via a future
    GET /notifications/:pensionId endpoint.
    """
    doc = NotificationDocument(
        pension_id=pension_id,
        notification_type=notification_type,
        title=title,
        message=message,
        channel=channel,
    ).to_dict()

    result = get_notifications_collection().insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def get_unread_notifications(pension_id: str) -> list[dict]:
    """Fetch all unread in-app notifications for the frontend notification inbox."""
    cursor = get_notifications_collection().find(
        {"pension_id": pension_id, "read": False, "channel": "in_app"},
        {"_id": 1, "title": 1, "message": 1, "notification_type": 1, "created_at": 1}
    ).sort("created_at", DESCENDING)

    results = []
    for doc in cursor:
        doc["_id"] = str(doc["_id"])
        results.append(doc)
    return results

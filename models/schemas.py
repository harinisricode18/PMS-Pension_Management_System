"""
models/schemas.py
─────────────────────────────────────────────────────────────────────────────
PMS — Pension Management System
Phase 2A: MongoDB Collection Schema Definitions

This file defines the document structure for every collection as Python
dataclasses. They serve as:
  1. Human-readable schema documentation
  2. Factory functions for creating well-formed documents
  3. Type-safe contracts between services and the database layer

These are NOT ORM models — the project uses raw pymongo.
The dataclasses are used to construct dicts that are inserted into MongoDB.

Schema Overview
─────────────────────────────────────────────────────────────────────────────
Collection          Primary Key      TTL     Used By
────────────────────────────────────────────────────────────────────────────
users               pension_id       —       All modules + Frontend
income_records      _id (auto)       —       Module 1, 2
transactions        _id (auto)       —       Module 3, 4, 5, 6 + Frontend
tokens              token_id         5 min   Module 3, 6
pending_withdrawals request_id       5 min   Module 4
agents              agent_id         —       Module 6
notifications       _id (auto)       —       Module 2, 4
─────────────────────────────────────────────────────────────────────────────
"""

from dataclasses import dataclass, field, asdict
from datetime import datetime, timedelta, timezone
from typing import Optional, Literal, List
import uuid


def _now() -> datetime:
    """UTC-aware current timestamp."""
    return datetime.now(timezone.utc)


def _minutes_from_now(minutes: int) -> datetime:
    return _now() + timedelta(minutes=minutes)


# ═══════════════════════════════════════════════════════════════════════════════
# COLLECTION 1: users
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class UserDocument:
    """
    Collection: users
    ─────────────────────────────────────────────────────────────────────────
    The core identity and financial state document for every registered worker.

    Design Notes:
    - pension_id (e.g. "PP-ABC12345") is the primary application key.
      It is generated on registration and is what the frontend stores in
      localStorage and uses in every API call.
    - The vault split (pension_vault + liquid_vault) replaces the single
      totalSavings field from the existing frontend server. The frontend's
      /user/:pensionId endpoint must return both vaults plus a computed
      totalSavings = pension_vault + liquid_vault for backward compatibility.
    - last_savings_target is written by Module 1 (FSP Engine) after each
      daily computation and read as the seed S_{t-1} on the next run.
    - survival_minimum is set during onboarding and used by Module 1 to
      ensure the suggested savings target never exceed income - minimum.
    - rest_days is set during onboarding and consumed by Module 2 (Guardian).
    - nominee_phone holds the registered contact for Module 4 (Dual-Key OTP).
    - pension_health_score is computed by Module 7 and cached here to avoid
      re-computation on every API call.
    - account_status mirrors the frontend's existing "Active" / "At Risk"
      field but is now driven by the Pension Health Score threshold.
    """
    pension_id:            str                          # "PP-ABC12345" — generated on register
    name:                  str                          # Worker's full name
    date_of_birth:         datetime                     # For retirement projection (age 60 lock)
    phone:                 str                          # Primary contact (unique)
    password_hash:         str                          # bcrypt hash — never stored plain
    nominee_phone:         str                          # For Dual-Key OTP dispatch (Module 4)

    # Financial state — updated atomically by Emergency Shield (Module 5)
    pension_vault:         float = 0.0                  # 80% of every deposit — locked
    liquid_vault:          float = 0.0                  # 20% of every deposit — accessible

    # FSP Engine state (Module 1)
    last_savings_target:   float = 20.0                 # S_{t-1} — seed for next EMA computation

    # Guardian Agent configuration (Module 2)
    rest_days:             List[str]  = field(default_factory=list)   # e.g. ["Sunday"]
    survival_minimum:      float = 150.0                # Daily minimum expense floor (₹)

    # Pension Health score (Module 7) — cached, recomputed after every deposit/withdrawal
    pension_health_score:  float = 0.0
    insurance_status:      str   = "PAUSED"             # "ACTIVE" | "PAUSED"

    # Account lifecycle
    account_status:        str   = "At Risk"            # Backward-compat with frontend
    created_at:            datetime = field(default_factory=_now)
    updated_at:            datetime = field(default_factory=_now)

    def to_dict(self) -> dict:
        d = asdict(self)
        # Ensure datetimes are UTC-aware for MongoDB
        return d

    @property
    def total_savings(self) -> float:
        """Backward-compatible totalSavings for frontend API responses."""
        return round(self.pension_vault + self.liquid_vault, 2)


# ═══════════════════════════════════════════════════════════════════════════════
# COLLECTION 2: income_records
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class IncomeRecordDocument:
    """
    Collection: income_records
    ─────────────────────────────────────────────────────────────────────────
    One document per income entry per worker. This is the raw data stream
    that feeds Module 1 (FSP Engine) and Module 2 (Guardian Agent).

    Design Notes:
    - A worker may have zero income on a given day; income = 0.0 is valid
      and important — it's what triggers Guardian's Grace Mode evaluation.
    - source indicates how the income was recorded:
        "self_reported"   — worker typed it into the app (unverified)
        "payer_verified"  — payer scanned the worker's QR (Module 3, LOCKED)
        "agent_verified"  — cash verified via agent handshake (Module 6)
    - verified_by_payer_id links to the payer who confirmed this income,
      enabling the trust score calculation described in the PDF.
    - The FSP Engine queries this collection with:
        find({pension_id: X, date: {$gte: 30_days_ago}}).sort({date: -1})
    - The Guardian Agent queries for zero-income days with:
        find({pension_id: X, income: 0.0, date: {$gte: 3_days_ago}})
    """
    pension_id:            str
    date:                  datetime                      # The calendar day this income was earned
    income:                float                         # Amount earned that day (may be 0.0)
    source: Literal[
        "self_reported",
        "payer_verified",
        "agent_verified"
    ] = "self_reported"
    verified_by_payer_id:  Optional[str] = None         # Links to agents or payer identity
    notes:                 Optional[str] = None         # Optional context ("rain day", etc.)
    created_at:            datetime = field(default_factory=_now)

    def to_dict(self) -> dict:
        return asdict(self)


# ═══════════════════════════════════════════════════════════════════════════════
# COLLECTION 3: transactions
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class TransactionDocument:
    """
    Collection: transactions
    ─────────────────────────────────────────────────────────────────────────
    Immutable audit ledger of every financial event in the system.
    Once a document is inserted with status "LOCKED", it must never be
    updated or deleted — this collection is the financial ground truth.

    Design Notes:
    - type covers all event categories:
        "deposit"         — cash or digital deposit via Emergency Shield
        "withdrawal"      — approved withdrawal from liquid or pension vault
        "cash_bridge"     — cash converted via Digital Bridge (Module 6)
        "payer_income"    — income payment from payer via Ledger Protocol (Module 3)
        "vault_transfer"  — internal move between pension_vault and liquid_vault

    - status:
        "PENDING"  — initiated but not yet confirmed
        "LOCKED"   — confirmed and immutable (this is the Hard Floor concept)
        "FAILED"   — attempted but rejected (NSF, expired token, etc.)

    - vault_snapshot stores the worker's vault balances AFTER this transaction,
      allowing point-in-time balance reconstruction without replaying the ledger.

    - source_verified indicates whether the income behind a deposit was
      validated by a payer/agent QR scan (true) or self-reported (false).
      Module 7 uses this ratio for the income verification score component.

    - The frontend /transactions/:pensionId endpoint reads from this collection,
      filtering by pension_id and sorting by created_at DESC.
    """
    pension_id:      str
    amount:          float
    type: Literal[
        "deposit",
        "withdrawal",
        "cash_bridge",
        "payer_income",
        "vault_transfer"
    ]
    status: Literal["PENDING", "LOCKED", "FAILED"] = "LOCKED"
    source_verified: bool  = False                      # True if payer/agent QR verified
    related_agent_id: Optional[str] = None             # For cash_bridge transactions
    related_token_id: Optional[str] = None             # Token that triggered this txn
    pension_vault_after: Optional[float] = None        # Snapshot of pension_vault post-txn
    liquid_vault_after:  Optional[float] = None        # Snapshot of liquid_vault post-txn
    notes:           Optional[str] = None
    created_at:      datetime = field(default_factory=_now)

    def to_dict(self) -> dict:
        return asdict(self)


# ═══════════════════════════════════════════════════════════════════════════════
# COLLECTION 4: tokens
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class TokenDocument:
    """
    Collection: tokens
    ─────────────────────────────────────────────────────────────────────────
    Short-lived one-time tokens for QR-based flows.

    A TTL index on expires_at means MongoDB automatically removes expired
    documents — no background cleanup job needed.

    token_type distinguishes two flows:
        "qr_deposit"   — worker → agent cash handshake (Module 6, Digital Bridge)
        "payer_verify" — employer/payer verifies income (Module 3, Ledger Protocol)

    Design Notes:
    - token_id is a 6-char uppercase code (for QR / manual entry by agent).
      In production this should be extended to 8+ chars or a signed JWT.
    - status transitions: PENDING → USED (success) or PENDING → EXPIRED (auto TTL)
    - amount is stored at token creation time to prevent amount tampering
      between token generation and confirmation.
    """
    token_id:    str                                    # 6-char uppercase (e.g. "A3BF9C")
    pension_id:  str                                    # Worker who generated the token
    amount:      float                                  # Amount to be deposited/verified
    token_type: Literal["qr_deposit", "payer_verify"] = "qr_deposit"
    status: Literal["PENDING", "USED", "EXPIRED"] = "PENDING"
    expires_at:  datetime = field(
        default_factory=lambda: _minutes_from_now(5)   # Hard 5-minute expiry
    )
    created_at:  datetime = field(default_factory=_now)

    def to_dict(self) -> dict:
        return asdict(self)


# ═══════════════════════════════════════════════════════════════════════════════
# COLLECTION 5: pending_withdrawals
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class PendingWithdrawalDocument:
    """
    Collection: pending_withdrawals
    ─────────────────────────────────────────────────────────────────────────
    Holds a withdrawal request between OTP generation and nominee verification.

    TTL index on expires_at auto-purges the document after 5 minutes,
    which is the equivalent of "OTP Expired" from Module 4's current logic.

    Design Notes:
    - request_id is a UUID4 string, used as the correlation key between
      the initial withdrawal request and the nominee's OTP verification.
    - otp_hash stores the bcrypt hash of the OTP — never the plain OTP.
      The plain OTP is dispatched to the nominee's phone and never stored.
    - attempt_count tracks OTP entry attempts.  After 5 failed attempts,
      status is set to "FAILED" to prevent brute-force.
    - status transitions: PENDING → APPROVED or PENDING → FAILED
      Expired documents are automatically removed by the TTL index.
    """
    request_id:    str = field(default_factory=lambda: str(uuid.uuid4()))
    pension_id:    str  = ""
    amount:        float = 0.0
    otp_hash:      str  = ""                           # bcrypt hash of the 6-digit OTP
    nominee_phone: str  = ""                           # Phone the OTP was sent to
    status: Literal["PENDING", "APPROVED", "FAILED"] = "PENDING"
    attempt_count: int  = 0                            # Increment on each OTP entry attempt
    expires_at:    datetime = field(
        default_factory=lambda: _minutes_from_now(5)
    )
    created_at:    datetime = field(default_factory=_now)

    def to_dict(self) -> dict:
        return asdict(self)


# ═══════════════════════════════════════════════════════════════════════════════
# COLLECTION 6: agents
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class AgentDocument:
    """
    Collection: agents
    ─────────────────────────────────────────────────────────────────────────
    Retail cash-acceptance agents (Kirana stores, Business Correspondents).

    Design Notes:
    - digital_float is the agent's current digital balance available to
      credit workers. Debited during cash handshake, replenished when the
      agent deposits cash at a partner bank.
    - trust_score (0.0 – 1.0) is computed from the agent's transaction
      history: confirmations vs. cancellations, dispute rate, etc.
      Module 6 can gate transactions for agents below a minimum trust level.
    - total_transactions_processed and total_cash_processed enable the
      trust score calculation and agent analytics.
    - agent_id format: "AGT-XXXXXXXX" (8 hex chars).
    """
    agent_id:                    str
    name:                        str
    phone:                       str
    location:                    str                   # Area / pincode for geographic routing
    digital_float:               float = 0.0
    trust_score:                 float = 1.0           # Starts at max; degrades on disputes
    total_transactions_processed: int   = 0
    total_cash_processed:        float  = 0.0
    is_active:                   bool   = True
    created_at:                  datetime = field(default_factory=_now)
    updated_at:                  datetime = field(default_factory=_now)

    def to_dict(self) -> dict:
        return asdict(self)


# ═══════════════════════════════════════════════════════════════════════════════
# COLLECTION 7: notifications
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class NotificationDocument:
    """
    Collection: notifications
    ─────────────────────────────────────────────────────────────────────────
    Persistent log of every notification dispatched to a worker or nominee.

    This serves two purposes:
    1. Audit trail — when was the worker notified about Grace Mode, OTP, etc.
    2. In-app notification inbox — the frontend can display unread notifications.

    notification_type covers all system events:
        "savings_target"    — Guardian Agent's daily savings nudge
        "grace_mode"        — Guardian activated, targets paused
        "otp_dispatch"      — OTP sent to nominee for Dual-Key approval
        "deposit_confirmed" — Successful vault credit confirmation
        "withdrawal_approved" — Dual-Key approved
        "insurance_warning" — Pension Health Score dropped below threshold

    channel:
        "in_app"   — stored here, displayed in frontend inbox
        "sms"      — dispatched via SMS gateway (MSG91, Twilio)
        "whatsapp" — dispatched via WhatsApp Business API
    """
    pension_id:         str
    notification_type: Literal[
        "savings_target",
        "grace_mode",
        "otp_dispatch",
        "deposit_confirmed",
        "withdrawal_approved",
        "insurance_warning"
    ]
    title:   str
    message: str
    channel: Literal["in_app", "sms", "whatsapp"] = "in_app"
    read:    bool = False
    created_at: datetime = field(default_factory=_now)

    def to_dict(self) -> dict:
        return asdict(self)

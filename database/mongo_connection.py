"""
database/mongo_connection.py
─────────────────────────────────────────────────────────────────────────────
PMS — Pension Management System
Phase 2A: MongoDB Connection and Collection Access Layer

This module is the SINGLE source of truth for all database connectivity.
Every service module must import from here — never instantiate MongoClient
directly in a service file.

Environment Variables Required (.env):
    MONGO_URI       — full connection string (e.g. mongodb://localhost:27017)
    MONGO_DB_NAME   — database name (e.g. "pension_management_system")

Usage:
    from database.mongo_connection import get_db, get_users_collection
    users_col = get_users_collection()
    user = users_col.find_one({"pension_id": "PP-ABC12345"})
─────────────────────────────────────────────────────────────────────────────
"""

import os
import logging
from contextlib import contextmanager
from functools import lru_cache

from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError
from dotenv import load_dotenv

# ─── Load environment ─────────────────────────────────────────────────────────
load_dotenv()

MONGO_URI     = os.getenv("MONGO_URI", "mongodb://localhost:27017")
MONGO_DB_NAME = os.getenv("MONGO_DB_NAME", "pension_management_system")

logger = logging.getLogger(__name__)


# ─── Client singleton ─────────────────────────────────────────────────────────

_client: MongoClient | None = None


def get_client() -> MongoClient:
    """
    Returns the MongoClient singleton.
    Creates it on first call; subsequent calls return the cached instance.
    Raises RuntimeError if the server is unreachable.
    """
    global _client
    if _client is None:
        try:
            _client = MongoClient(
                MONGO_URI,
                serverSelectionTimeoutMS=5000,   # fail fast on startup
                connectTimeoutMS=5000,
                socketTimeoutMS=10_000,
                maxPoolSize=50,                  # connection pool for concurrent requests
                retryWrites=True,                # auto-retry transient write errors
            )
            # Trigger an actual connection to validate credentials / reachability
            _client.admin.command("ping")
            logger.info("MongoDB connected: %s / %s", MONGO_URI, MONGO_DB_NAME)
        except (ConnectionFailure, ServerSelectionTimeoutError) as exc:
            _client = None
            raise RuntimeError(
                f"Cannot connect to MongoDB at '{MONGO_URI}'. "
                f"Check MONGO_URI and ensure mongod is running. Detail: {exc}"
            ) from exc
    return _client


def get_db():
    """Returns the primary database object."""
    return get_client()[MONGO_DB_NAME]


def close_connection():
    """
    Cleanly close the connection pool.
    Call this on application shutdown (FastAPI lifespan shutdown event).
    """
    global _client
    if _client:
        _client.close()
        _client = None
        logger.info("MongoDB connection closed.")


# ─── Collection accessors ─────────────────────────────────────────────────────
# Each function returns the named collection from the active database.
# Using functions (not module-level variables) ensures the client is
# always initialised before any collection is accessed.

def get_users_collection():
    """
    Collection: users
    Primary identity and vault balance store for every registered worker.
    Used by: all modules that need to look up or update a worker's profile.
    """
    return get_db()["users"]


def get_income_records_collection():
    """
    Collection: income_records
    One document per day-of-income per worker. Source of truth for the
    Financial Signal Engine (EMA) and Guardian Agent (inactivity detection).
    """
    return get_db()["income_records"]


def get_transactions_collection():
    """
    Collection: transactions
    Immutable ledger of every deposit, withdrawal, and vault transfer.
    Used by: Emergency Shield, Dual-Key Governance, Ledger Protocol.
    Also consumed directly by the React frontend (/transactions/:pensionId).
    """
    return get_db()["transactions"]


def get_tokens_collection():
    """
    Collection: tokens
    Short-lived QR / verification tokens.  A TTL index on expires_at
    automatically purges expired documents — no manual cleanup needed.
    Used by: Digital Bridge (QR cash deposit), Ledger Protocol (payer QR).
    """
    return get_db()["tokens"]


def get_pending_withdrawals_collection():
    """
    Collection: pending_withdrawals
    Stores a withdrawal request while waiting for the nominee's OTP.
    TTL index auto-expires requests after 5 minutes.
    Used by: Dual-Key Governance Engine.
    """
    return get_db()["pending_withdrawals"]


def get_agents_collection():
    """
    Collection: agents
    Retail cash-acceptance agents (e.g. Kirana stores).
    Tracks each agent's digital float balance and trust score.
    Used by: Digital Bridge.
    """
    return get_db()["agents"]


def get_notifications_collection():
    """
    Collection: notifications
    Persistent notification log (OTP sent, Grace Mode, nudges, etc.)
    Used by: Guardian Agent (empathetic outreach), Dual-Key (OTP dispatch log).
    """
    return get_db()["notifications"]


# ─── Index creation ───────────────────────────────────────────────────────────

def create_all_indexes():
    """
    Idempotent index creation.
    Safe to call on every application startup — MongoDB skips existing indexes.
    Call this once from your FastAPI lifespan startup event.

    Index rationale is documented inline.
    """
    db = get_db()

    # ── users ─────────────────────────────────────────────────────────────────
    users = db["users"]
    # Primary lookup key used by every API endpoint and every service module
    users.create_index([("pension_id", ASCENDING)], unique=True, name="idx_pension_id")
    # Login lookup (name + pensionId pair)
    users.create_index([("phone", ASCENDING)], unique=True, name="idx_phone")

    # ── income_records ────────────────────────────────────────────────────────
    ir = db["income_records"]
    # FSP engine queries: get last 30 days for a specific worker
    ir.create_index([("pension_id", ASCENDING), ("date", DESCENDING)], name="idx_income_pid_date")
    # Guardian Agent: find workers with zero income in last 72 hours (cron job)
    ir.create_index([("date", DESCENDING)], name="idx_income_date")

    # ── transactions ──────────────────────────────────────────────────────────
    txn = db["transactions"]
    # Frontend /transactions/:pensionId — sorted newest first
    txn.create_index([("pension_id", ASCENDING), ("created_at", DESCENDING)], name="idx_txn_pid_date")
    # Annual summary query: filter by type + year
    txn.create_index([("pension_id", ASCENDING), ("type", ASCENDING), ("created_at", DESCENDING)], name="idx_txn_pid_type_date")
    # Ledger Protocol: find LOCKED income records by worker
    txn.create_index([("pension_id", ASCENDING), ("status", ASCENDING)], name="idx_txn_status")

    # ── tokens ────────────────────────────────────────────────────────────────
    tokens = db["tokens"]
    # Lookup by token_id when agent/payer scans the QR
    tokens.create_index([("token_id", ASCENDING)], unique=True, name="idx_token_id")
    # TTL index: MongoDB automatically deletes documents when expires_at is reached
    tokens.create_index([("expires_at", ASCENDING)], expireAfterSeconds=0, name="idx_token_ttl")

    # ── pending_withdrawals ───────────────────────────────────────────────────
    pw = db["pending_withdrawals"]
    # Dual-Key: look up a pending request by its UUID
    pw.create_index([("request_id", ASCENDING)], unique=True, name="idx_pw_request_id")
    # TTL: auto-expire OTP requests after 300 seconds (5 minutes)
    pw.create_index([("expires_at", ASCENDING)], expireAfterSeconds=0, name="idx_pw_ttl")
    # Find pending requests for a specific worker (e.g. block duplicate requests)
    pw.create_index([("pension_id", ASCENDING), ("status", ASCENDING)], name="idx_pw_pid_status")

    # ── agents ────────────────────────────────────────────────────────────────
    agents = db["agents"]
    agents.create_index([("agent_id", ASCENDING)], unique=True, name="idx_agent_id")

    # ── notifications ─────────────────────────────────────────────────────────
    notif = db["notifications"]
    notif.create_index([("pension_id", ASCENDING), ("created_at", DESCENDING)], name="idx_notif_pid_date")
    notif.create_index([("read", ASCENDING), ("pension_id", ASCENDING)], name="idx_notif_unread")

    logger.info("All MongoDB indexes verified / created.")


# ─── Transaction context manager ─────────────────────────────────────────────

@contextmanager
def mongo_transaction():
    """
    Context manager for multi-document atomic operations.

    Use for any operation that modifies more than one document field
    across potentially more than one collection (vault debits, splits, etc.).

    IMPORTANT: MongoDB transactions require a replica set or sharded cluster.
    For local development with a single mongod, start it as a 1-node replica set:
        mongod --replSet rs0
        # then in mongosh: rs.initiate()

    Usage:
        with mongo_transaction() as (session, db):
            db["users"].update_one(
                {"pension_id": pid},
                {"$inc": {"pension_vault": pension_delta, "liquid_vault": liquid_delta}},
                session=session
            )
            db["transactions"].insert_one(txn_doc, session=session)
        # If any operation raises, the entire block is rolled back automatically.

    On exception, the transaction is aborted and the exception is re-raised.
    """
    client = get_client()
    session = client.start_session()
    try:
        with session.start_transaction():
            yield session, get_db()
            # If we reach here without exception, commit is implicit on context exit
    except Exception:
        # Transaction is aborted automatically when the session context exits
        # due to an exception — no explicit abort needed with pymongo >= 3.9
        raise
    finally:
        session.end_session()

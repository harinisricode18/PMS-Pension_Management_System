"""
routes/auth_routes.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PMS — Phase 3  |  Authentication Routes

Endpoints:
    POST /register   — create a new worker account
    POST /login      — verify credentials, return JWT

These two routes are NOT protected by JWT (they are the entry
points for obtaining a token).

Service calls:
    /register → db_helpers.create_user()   (direct DB helper —
                no service class wraps registration)
    /login    → db_helpers.get_user()  +  auth_utils.verify_password()
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status

from auth_utils import create_access_token, verify_password
from database.db_helpers import create_user, get_user
from api_models import LoginRequest, RegisterRequest

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Authentication"])


# ── POST /register ────────────────────────────────────────────────────────────

@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    summary="Register a new worker account",
)
async def register(body: RegisterRequest):
    """
    Create a new worker account.

    - Generates a unique `pensionId` (PP-XXXXXXXX format)
    - Hashes the password with bcrypt before storing
    - Does NOT return a JWT — the user must log in separately

    Returns the created profile (no password hash).
    """
    # Convert date → UTC-aware datetime for MongoDB
    dob_dt = datetime(
        body.date_of_birth.year,
        body.date_of_birth.month,
        body.date_of_birth.day,
        tzinfo=timezone.utc,
    )

    user = create_user(
        name=body.name,
        date_of_birth=dob_dt,
        phone=body.phone,
        password_plain=body.password,
        nominee_phone=body.nominee_phone,
        survival_minimum=body.survival_minimum,
        rest_days=body.rest_days,
    )

    logger.info("[Auth] Registered new worker: pension_id=%s", user["pension_id"])

    return {
        "success":    True,
        "message":    "User Registered Successfully",
        "pensionId":  user["pension_id"],
        # Return the full profile so the frontend can pre-populate the dashboard
        "user":       user,
    }


# ── POST /login ───────────────────────────────────────────────────────────────

@router.post(
    "/login",
    summary="Log in and obtain a JWT access token",
)
async def login(body: LoginRequest):
    """
    Verify worker credentials and return a signed JWT.

    The token should be stored by the frontend and sent as:
        Authorization: Bearer <token>
    on all subsequent requests to protected endpoints.

    Raises 401 if name, pension_id, or password don't match.
    """
    user = get_user(body.pension_id)

    # Deliberate: use the same 401 for every failure mode to prevent
    # user enumeration attacks (don't reveal which field was wrong).
    invalid = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid Pension ID, name, or password.",
    )

    if user is None:
        logger.warning("[Auth] Login failed — pension_id not found: %s", body.pension_id)
        raise invalid

    if user.get("name", "").lower() != body.name.lower():
        logger.warning("[Auth] Login failed — name mismatch: %s", body.pension_id)
        raise invalid

    if not verify_password(body.password, user.get("password_hash", "")):
        logger.warning("[Auth] Login failed — bad password: %s", body.pension_id)
        raise invalid

    token = create_access_token(pension_id=body.pension_id)

    logger.info("[Auth] Login successful: pension_id=%s", body.pension_id)

    return {
        "success":    True,
        "message":    "Login successful",
        "pensionId":  body.pension_id,
        "token":      token,
        "token_type": "bearer",
    }

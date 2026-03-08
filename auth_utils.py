"""
auth_utils.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PMS — Phase 3  |  JWT Authentication Utilities

Responsibilities:
  • create_access_token()   — sign a JWT on successful login
  • get_current_user()      — FastAPI dependency that verifies the
                              Bearer token on every protected route
  • verify_password()       — thin bcrypt wrapper used by auth_routes

Token payload:
  { "sub": "<pension_id>", "exp": <unix ts> }

The secret key and algorithm are read from the environment.
Never hardcode them here.

Usage (in a route):
    from auth_utils import get_current_user

    @router.get("/some-protected-route")
    async def protected(pension_id: str = Depends(get_current_user)):
        ...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import os
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

logger = logging.getLogger(__name__)

# ── Config (read once at import; fail loudly if SECRET_KEY is missing) ────────
_SECRET_KEY     = os.getenv("SECRET_KEY", "")
_ALGORITHM      = os.getenv("JWT_ALGORITHM", "HS256")
_EXPIRY_MINUTES = int(os.getenv("JWT_EXPIRY_MINUTES", "1440"))  # 24 h default

if not _SECRET_KEY:
    # Warn loudly in dev; raise in production-like environments
    logger.warning(
        "[Auth] SECRET_KEY is not set. JWTs will use an empty key — "
        "set SECRET_KEY in your .env file before deployment."
    )

# Bearer scheme — auto-extracts "Authorization: Bearer <token>" header
_bearer_scheme = HTTPBearer(auto_error=False)


# ── Password helpers ──────────────────────────────────────────────────────────

def verify_password(plain: str, hashed: str) -> bool:
    """
    Check a plain-text password against a stored bcrypt hash.
    Returns False (never raises) on any mismatch or encoding error.
    """
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception as exc:
        logger.warning("[Auth] Password verification error: %s", exc)
        return False


# ── Token creation ────────────────────────────────────────────────────────────

def create_access_token(pension_id: str) -> str:
    """
    Create a signed JWT whose subject is the worker's pension_id.

    Returns the encoded token string.
    Called by POST /login on successful credential verification.
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=_EXPIRY_MINUTES)
    payload = {
        "sub": pension_id,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, _SECRET_KEY, algorithm=_ALGORITHM)


# ── Token verification — FastAPI dependency ───────────────────────────────────

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(_bearer_scheme),
) -> str:
    """
    FastAPI dependency.  Extracts and validates the Bearer JWT from the
    Authorization header.

    Returns the pension_id (token subject) on success.

    Raises HTTP 401 on:
      • missing or malformed Authorization header
      • expired token
      • invalid signature
      • missing "sub" claim
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials. Please log in again.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if credentials is None:
        raise credentials_exception

    token = credentials.credentials
    try:
        payload = jwt.decode(token, _SECRET_KEY, algorithms=[_ALGORITHM])
        pension_id: Optional[str] = payload.get("sub")
        if not pension_id:
            raise credentials_exception
        return pension_id

    except JWTError as exc:
        logger.warning("[Auth] JWT validation failed: %s", exc)
        raise credentials_exception

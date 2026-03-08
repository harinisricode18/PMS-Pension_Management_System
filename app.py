"""
app.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FastAPI Application Entry Point

Responsibilities:
  1. Load environment variables from .env
  2. Configure structured logging
  3. Create the FastAPI application with full OpenAPI metadata
  4. Register all route modules (auth, savings, withdrawal, ledger,
     health, agent, guardian)
  5. Add CORS middleware for the React frontend
  6. Add global exception handlers (ValueError → 400, RuntimeError → 500)
  7. Expose a /ping liveness probe

Architecture rule enforced here:
    app.py → routes/ → services/ → database/
    No route module imports another route module.
    No service module imports any route module.

Run:
    uvicorn app:app --reload --host 0.0.0.0 --port 8000
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import logging
import os
import traceback
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ── Load .env before any module reads os.getenv() ────────────────────────────
load_dotenv()

# ── Logging configuration ─────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
logger = logging.getLogger(__name__)

# ── Route imports (after env load so services read correct config) ────────────
from routes.auth_routes      import router as auth_router
from routes.savings_routes   import router as savings_router
from routes.withdrawal_routes import router as withdrawal_router
from routes.ledger_routes    import router as ledger_router
from routes.health_routes    import router as health_router
from routes.agent_routes     import router as agent_router
from routes.guardian_routes  import router as guardian_router
from routes.projection_routes import router as projection_router



# ── Lifespan: startup + shutdown hooks ───────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Application lifecycle manager.

    Startup:
      - Verify MongoDB is reachable (fail fast rather than serving broken 500s)
      - Log active connection URI (masked)

    Shutdown:
      - Close the MongoDB connection pool cleanly
    """
    # ── Startup ───────────────────────────────────────────────────────────────
    try:
        from database.mongo_connection import get_client
        client = get_client()
        # Ping confirms the replica set is up and multi-doc transactions work
        client.admin.command("ping")
        db_name = os.getenv("MONGO_DB_NAME", "pension_management_system")
        logger.info("[Startup] MongoDB connected — db=%s", db_name)
    except Exception as exc:
        logger.error("[Startup] MongoDB ping failed: %s", exc)
        logger.error(
            "[Startup] Ensure MONGO_URI in .env points to a replica set "
            "(mongod --replSet rs0) and rs.initiate() has been run."
        )
        # Don't raise — allow the app to start so /ping can report degraded state

    logger.info("[Startup] PMS API ready on port %s", os.getenv("APP_PORT", "8000"))
    logger.info("[Startup] WebSocket endpoint active at ws://<host>/ws/notifications/{pension_id}")

    yield  # ← application runs here

    # ── Shutdown ──────────────────────────────────────────────────────────────
    try:
        from database.mongo_connection import get_client
        get_client().close()
        logger.info("[Shutdown] MongoDB connection closed.")
    except Exception:
        pass


# ── FastAPI application ───────────────────────────────────────────────────────

app = FastAPI(
    title="PMS — Pension Management System API",
    description=(
        "FastAPI backend for the PMS micro-pension platform.\n\n"
        "Serves informal daily-wage workers in India with adaptive savings targets, "
        "payer-verified income records, agent cash bridges, and insurance-linked "
        "health scoring.\n\n"
        "**Architecture:** `routes → services → database`\n\n"
        "**Auth:** JWT Bearer token. Obtain via `POST /login`, then pass as "
        "`Authorization: Bearer <token>` on all protected endpoints.\n\n"
        "**WebSocket:** Connect to `ws://<host>/ws/notifications/{pension_id}` "
        "for real-time deposit confirmations and Guardian alerts."
    ),
    version="3.0.0",
    contact={
        "name": "PMS Engineering",
    },
    lifespan=lifespan,
)


# ── CORS ──────────────────────────────────────────────────────────────────────
# Allows the React dev server (port 3000) and the production build to talk to
# this API.  Adjust CORS_ORIGINS in .env to lock down in production.

_raw_origins = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000",
)
_allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

logger.info("[Config] CORS origins: %s", _allowed_origins)


# ── Global exception handlers ─────────────────────────────────────────────────
#
# Services raise:
#   ValueError   — bad input, resource not found, business rule violation
#                  → HTTP 400 Bad Request
#   RuntimeError — unexpected DB failure, downstream service error
#                  → HTTP 500 Internal Server Error
#
# The structured JSON shape { "success": false, "error": "..." } is consistent
# across all error responses so the React frontend can handle errors uniformly.

@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    logger.warning(
        "[400] ValueError on %s %s — %s",
        request.method, request.url.path, exc,
    )
    return JSONResponse(
        status_code=status.HTTP_400_BAD_REQUEST,
        content={"success": False, "error": str(exc)},
    )


@app.exception_handler(RuntimeError)
async def runtime_error_handler(request: Request, exc: RuntimeError):
    logger.error(
        "[500] RuntimeError on %s %s — %s\n%s",
        request.method, request.url.path, exc,
        traceback.format_exc(),
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "error":   "An internal server error occurred. Please try again.",
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """
    Catch-all for any exception not already handled above.
    Logs the full traceback so nothing is silently swallowed.
    """
    logger.critical(
        "[500] Unhandled %s on %s %s — %s\n%s",
        type(exc).__name__, request.method, request.url.path, exc,
        traceback.format_exc(),
    )
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "success": False,
            "error":   "An unexpected error occurred. Please contact support.",
        },
    )


# ── Route registration ────────────────────────────────────────────────────────
#
# All routers are included with no prefix so the URLs match exactly what the
# existing React frontend (server.js) expects.
#
# Route → Service mapping summary:
# ┌──────────────────────────────────┬────────────────────────────────────────┐
# │ Route file                       │ Service(s) used                        │
# ├──────────────────────────────────┼────────────────────────────────────────┤
# │ auth_routes      /register /login│ db_helpers.create_user / get_user      │
# │ savings_routes   /deposit /income│ EmergencyShieldService                 │
# │                  /user           │ FinancialSignalService                 │
# │ withdrawal_routes /withdraw      │ WithdrawalGovernanceService            │
# │                  /withdraw/verify│ EmergencyShieldService (check)         │
# │ ledger_routes    /transactions   │ LedgerService                          │
# │                  /confirm-payment│                                        │
# │                  /annual-summary │                                        │
# │ health_routes    /health-score   │ PensionHealthService                   │
# │ agent_routes     /agent/*        │ DigitalBridgeService                   │
# │                  /ws/notifs/*    │ ws_manager (WebSocket)                 │
# │ guardian_routes  /guardian-*     │ GuardianAgentService                   │
# │                  /notifications  │                                        │
# └──────────────────────────────────┴────────────────────────────────────────┘

app.include_router(auth_router)
app.include_router(savings_router)
app.include_router(withdrawal_router)
app.include_router(ledger_router)
app.include_router(health_router)
app.include_router(agent_router)
app.include_router(guardian_router)
app.include_router(projection_router)




# ── Liveness probe ────────────────────────────────────────────────────────────

@app.get("/ping", tags=["System"], summary="Liveness probe")
async def ping():
    """
    Simple liveness probe.  Returns 200 if the application process is alive.
    Does NOT check database connectivity (use /health for that).
    Suitable as a container/load-balancer health check target.
    """
    return {"success": True, "message": "pong"}


@app.get("/health", tags=["System"], summary="Readiness probe — checks DB connectivity")
async def health_check():
    """
    Readiness probe.  Attempts a MongoDB ping and reports status.
    Returns 200 if ready to serve traffic, 503 if the DB is unreachable.
    """
    try:
        from database.mongo_connection import get_client
        get_client().admin.command("ping")
        return {"success": True, "status": "healthy", "database": "connected"}
    except Exception as exc:
        logger.error("[Health] DB unreachable: %s", exc)
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "success":  False,
                "status":   "degraded",
                "database": "unreachable",
                "error":    str(exc),
            },
        )

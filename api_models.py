"""
models.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PMS — Phase 3  |  Pydantic Request & Response Models

All HTTP request bodies are validated here before reaching the
service layer.  Response models ensure the API contract is
explicit and version-stable.

Design rules:
  • Request models validate and coerce inputs; they do NOT call
    any service or DB function.
  • Response models are plain BaseModel subclasses used for
    documentation and OpenAPI schema generation.
  • No business logic lives here — this file only describes shapes.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

from datetime import date, datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator, model_validator


# ══════════════════════════════════════════════════════════════════════════════
# AUTH
# ══════════════════════════════════════════════════════════════════════════════

class RegisterRequest(BaseModel):
    """POST /register — worker onboarding."""
    name:             str   = Field(..., min_length=2, max_length=100)
    date_of_birth:    date  = Field(..., description="ISO date, e.g. 1990-06-15")
    phone:            str   = Field(..., min_length=10, max_length=15)
    password:         str   = Field(..., min_length=6, max_length=128)
    nominee_phone:    str   = Field(..., min_length=10, max_length=15)
    survival_minimum: float = Field(default=150.0, ge=0.0,
                                    description="Daily minimum expense floor (₹)")
    rest_days: List[str]    = Field(
        default_factory=list,
        description='e.g. ["Sunday"] — days with no savings target',
    )

    @field_validator("rest_days")
    @classmethod
    def validate_rest_days(cls, v: list) -> list:
        valid = {
            "Monday", "Tuesday", "Wednesday", "Thursday",
            "Friday", "Saturday", "Sunday",
        }
        for day in v:
            if day not in valid:
                raise ValueError(
                    f"'{day}' is not a valid day name. "
                    f"Use full English names, e.g. 'Sunday'."
                )
        return v


class LoginRequest(BaseModel):
    """POST /login — credential verification."""
    name:       str = Field(..., min_length=2, max_length=100)
    pension_id: str = Field(..., pattern=r"^PP-[A-F0-9]{8}$",
                            description="e.g. PP-ABC12345")
    password:   str = Field(..., min_length=1)


# ══════════════════════════════════════════════════════════════════════════════
# SAVINGS / DEPOSIT
# ══════════════════════════════════════════════════════════════════════════════

class DepositRequest(BaseModel):
    """POST /deposit — self-initiated worker deposit."""
    amount: float = Field(..., gt=0, description="Deposit amount in ₹")


class RecordIncomeRequest(BaseModel):
    """POST /income — record daily income and recompute savings target."""
    amount: float          = Field(..., ge=0, description="Daily income in ₹ (0 is valid)")
    source: str            = Field(default="self_reported")
    income_date:   Optional[date] = Field(
        default=None,
        description="Defaults to today (UTC) if omitted",
    )
    notes: Optional[str]   = Field(default=None, max_length=500)


# ══════════════════════════════════════════════════════════════════════════════
# WITHDRAWAL
# ══════════════════════════════════════════════════════════════════════════════

class WithdrawRequest(BaseModel):
    """POST /withdraw — initiate a withdrawal (may trigger Dual-Key flow)."""
    amount: float = Field(..., gt=0, description="Withdrawal amount in ₹")


class OTPVerifyRequest(BaseModel):
    """POST /withdraw/verify — nominee submits OTP to approve large withdrawal."""
    request_id:  str = Field(..., min_length=36, max_length=36,
                              description="UUID returned by POST /withdraw")
    otp_entered: str = Field(..., min_length=6, max_length=6,
                              description="6-digit OTP sent to nominee's phone")

    @field_validator("otp_entered")
    @classmethod
    def must_be_digits(cls, v: str) -> str:
        if not v.isdigit():
            raise ValueError("OTP must contain exactly 6 digits.")
        return v


class WithdrawalEligibilityRequest(BaseModel):
    """POST /withdraw/check — pre-flight eligibility check (no funds moved)."""
    amount: float = Field(..., gt=0)


# ══════════════════════════════════════════════════════════════════════════════
# LEDGER / PAYER VERIFICATION
# ══════════════════════════════════════════════════════════════════════════════

class GeneratePaymentTokenRequest(BaseModel):
    """POST /ledger/token — worker generates a payer QR token."""
    expected_amount: float = Field(default=0.0, ge=0.0,
                                   description="Expected payment amount (hint only)")


class ConfirmPaymentRequest(BaseModel):
    """POST /confirm-payment — payer confirms the income amount."""
    token_id: str   = Field(..., min_length=6, max_length=6,
                             description="6-char code from the worker's QR")
    amount:   float = Field(..., gt=0, le=50_000,
                             description="Actual payment amount in ₹")
    method:   str   = Field(default="CASH",
                             description='"CASH" or "UPI"')
    payer_id: Optional[str] = Field(default=None, max_length=100)

    @field_validator("method")
    @classmethod
    def validate_method(cls, v: str) -> str:
        if v.upper() not in {"CASH", "UPI"}:
            raise ValueError('method must be "CASH" or "UPI"')
        return v.upper()


class ValidateTokenRequest(BaseModel):
    """POST /ledger/validate — payer validates a token before entering amount."""
    token_id: str = Field(..., min_length=6, max_length=6)


# ══════════════════════════════════════════════════════════════════════════════
# AGENT / DIGITAL BRIDGE
# ══════════════════════════════════════════════════════════════════════════════

class GenerateCashTokenRequest(BaseModel):
    """POST /agent/generate-token — worker generates a cash QR for the agent."""
    amount: float = Field(..., gt=0, description="Cash amount to hand to agent (₹)")


class AgentConfirmCashRequest(BaseModel):
    """POST /agent/confirm-cash — agent confirms cash received → atomic settlement."""
    agent_id: str = Field(..., min_length=1, max_length=50,
                           description="Agent's registered agent_id")
    token_id: str = Field(..., min_length=6, max_length=6,
                           description="Token from worker's QR")


class AgentValidateTokenRequest(BaseModel):
    """POST /agent/validate — agent scans QR to check token before taking cash."""
    agent_id: str = Field(..., min_length=1, max_length=50)
    token_id: str = Field(..., min_length=6, max_length=6)


# ══════════════════════════════════════════════════════════════════════════════
# HEALTH / SIMULATION
# ══════════════════════════════════════════════════════════════════════════════

class SimulateWithdrawalRequest(BaseModel):
    """POST /health-score/{pension_id}/simulate — score impact without executing."""
    amount: float = Field(..., gt=0, description="Proposed withdrawal amount in ₹")


# ══════════════════════════════════════════════════════════════════════════════
# SHARED RESPONSE ENVELOPE
# ══════════════════════════════════════════════════════════════════════════════

class SuccessResponse(BaseModel):
    """Generic success envelope used when there is no meaningful payload."""
    success: bool = True
    message: str  = "OK"


class ErrorResponse(BaseModel):
    """Structured error response returned by global exception handlers."""
    success: bool = False
    error:   str


class UserResponse(BaseModel):
    """
    GET /user/{pensionId} — full profile returned to the React frontend.

    Includes both new vault fields AND the legacy totalSavings field so
    the existing frontend continues to work without modification.
    """
    # Identity
    pension_id:   str
    name:         str
    phone:        str
    nominee_phone: str

    # Vaults (new — split view)
    pension_vault: float
    liquid_vault:  float
    totalSavings:  float       # computed: pension_vault + liquid_vault

    # Health
    pension_health_score: float
    insurance_status:     str   # "ACTIVE" | "PAUSED"
    account_status:       str   # "Active" | "At Risk" (legacy frontend compat)

    # FSP
    last_savings_target: float

    # Computed presentation fields
    currentAge: int

    class Config:
        # Allow extra fields from the DB document to pass through without error
        extra = "ignore"

# ══════════════════════════════════════════════════════════════════════════════
# RETIREMENT PROJECTION
# ══════════════════════════════════════════════════════════════════════════════

class RetirementProjectionResponse(BaseModel):
    """
    GET /retirement-projection — estimated monthly pension at age 60.
    """
    success:                        bool
    pension_id:                     str
    current_age:                    int
    retirement_age:                 int
    years_remaining:                int
    current_pension_vault:          float
    projected_retirement_corpus:    float
    estimated_monthly_pension:      float
    annual_return_assumed:          float
    payout_horizon_months:          int
    projection_note:                str
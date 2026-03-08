"""
routes/projection_routes.py
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PMS — Phase 3  |  Retirement Projection Routes

Endpoints:
    GET  /retirement-projection   — estimate monthly pension at age 60
                                    for the currently authenticated worker

Protected by JWT.  A worker may only view their own projection.

Service calls:
    GET /retirement-projection  →  PensionProjectionService.project_retirement_income()

Architecture note:
    This route is intentionally read-only.  No DB writes occur in this
    module — the projection is a pure view over live data.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
"""

import logging

from fastapi import APIRouter, Depends, HTTPException, status

from api_models import RetirementProjectionResponse
from auth_utils import get_current_user
from services.pension_projection import PensionProjectionService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Retirement Projection"])

_projection = PensionProjectionService()


# ── GET /retirement-projection ────────────────────────────────────────────────

@router.get(
    "/retirement-projection",
    response_model=RetirementProjectionResponse,
    summary="Estimate the worker's monthly pension income at retirement age (60)",
)
async def get_retirement_projection(
    current_user: str = Depends(get_current_user),
):
    """
    Projects the authenticated worker's estimated monthly pension income
    at age 60 by compounding the current `pension_vault` balance at 8% p.a.
    (aligned with India's NPS long-term return assumption).

    **Projection model:**
    ```
    corpus = pension_vault × (1 + 0.08) ^ years_remaining
    monthly_pension = corpus / 240          # 20-year drawdown
    ```

    **Key design rules enforced:**
    - Only `pension_vault` is used — `liquid_vault` is excluded.
    - Retirement age is fixed at 60.
    - Workers already aged ≥ 60 receive a current-corpus estimate
      with `years_remaining = 0` and no additional compounding.

    **Response fields:**
    | Field                          | Description                                 |
    |-------------------------------|---------------------------------------------|
    | `current_age`                  | Worker's age today                          |
    | `years_remaining`              | Years until age 60 (0 if already ≥ 60)     |
    | `current_pension_vault`        | Live pension vault balance (₹)              |
    | `projected_retirement_corpus`  | Estimated corpus at age 60 (₹)              |
    | `estimated_monthly_pension`    | Corpus ÷ 240 (₹/month)                      |
    | `annual_return_assumed`        | 0.08 (8% p.a.)                              |
    | `payout_horizon_months`        | 240 (20-year drawdown horizon)              |
    | `projection_note`              | Human-readable caveat displayed in the UI   |

    This endpoint is designed for the React dashboard's "Future Outlook" card.
    It is safe to call on every page load — no state is mutated.
    """
    pension_id = current_user

    result = _projection.project_retirement_income(pension_id)
    result["success"] = True

    logger.info(
        "[Projection] API call: pension_id=%s age=%d monthly_est=₹%.2f",
        pension_id,
        result["current_age"],
        result["estimated_monthly_pension"],
    )
    return result

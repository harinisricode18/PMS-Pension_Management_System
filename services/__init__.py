"""
services/__init__.py
─────────────────────────────────────────────────────────────
Convenience imports for Phase 3 (FastAPI route layer).

Usage in a route file:
    from services import (
        FinancialSignalService,
        GuardianAgentService,
        LedgerService,
        WithdrawalGovernanceService,
        EmergencyShieldService,
        DigitalBridgeService,
        PensionHealthService,
    )

    fsp_service      = FinancialSignalService()
    guardian_service = GuardianAgentService()
    ...
─────────────────────────────────────────────────────────────
"""

from services.financial_signal_engine import FinancialSignalService
from services.guardian_agent          import GuardianAgentService
from services.ledger_protocol         import LedgerService
from services.dual_key_governance     import WithdrawalGovernanceService
from services.emergency_shield        import EmergencyShieldService
from services.digital_bridge          import DigitalBridgeService
from services.pension_health_engine   import PensionHealthService

__all__ = [
    "FinancialSignalService",
    "GuardianAgentService",
    "LedgerService",
    "WithdrawalGovernanceService",
    "EmergencyShieldService",
    "DigitalBridgeService",
    "PensionHealthService",
]

"""
database/migration_map.py
─────────────────────────────────────────────────────────────────────────────
PMS — Pension Management System
Phase 2A: Module → Database Interaction Map + Migration Notes

This file is a living reference document. It explains:
1. Which collections each service module reads and writes.
2. Exactly which in-memory variables in each module must be replaced,
   and with which db_helpers function.

This is the primary input document for Phase 2B (service refactoring).
─────────────────────────────────────────────────────────────────────────────
"""


# ─────────────────────────────────────────────────────────────────────────────
# MODULE → COLLECTION INTERACTION MAP
# ─────────────────────────────────────────────────────────────────────────────
#
#  Module                   READS                           WRITES
#  ─────────────────────────────────────────────────────────────────────────────
#  1. FSP Engine            income_records                  users.last_savings_target
#                           users.last_savings_target
#
#  2. Guardian Agent        income_records                  notifications
#                           users.rest_days
#                           users.survival_minimum
#
#  3. Ledger Protocol       tokens                          tokens
#                           users                           transactions
#                                                           income_records
#
#  4. Dual-Key Governance   users (vault balances)          pending_withdrawals
#                           pending_withdrawals             users (vault debit)
#                                                           transactions
#                                                           notifications
#
#  5. Emergency Shield      users (vault balances)          users (vault credit)
#                                                           transactions
#
#  6. Digital Bridge        tokens                          tokens
#                           agents                          agents (float debit)
#                           users                           users (vault credit)
#                                                           transactions
#
#  7. Pension Health Engine transactions                    users.pension_health_score
#                           users (vault balances)          users.insurance_status
#                                                           notifications (if score drops)
#
#  Frontend (existing)      users                           users (via deposit/withdraw)
#                           transactions                    transactions
# ─────────────────────────────────────────────────────────────────────────────


# ─────────────────────────────────────────────────────────────────────────────
# MIGRATION REFERENCE — Module by Module
# ─────────────────────────────────────────────────────────────────────────────

MIGRATION_MAP = {

    # ──────────────────────────────────────────────────────────────────────────
    "MODULE_1_FINANCIAL_SIGNAL_ENGINE": {
        "file": "services/financial_signal_engine.py",
        "replacements": [
            {
                "remove": "stable_df  (undefined global DataFrame)",
                "replace_with": "get_income_history(pension_id, days=30)",
                "note": (
                    "Returns a list of dicts [{date, income, source}, ...] sorted oldest-first. "
                    "Convert to DataFrame with pd.DataFrame(records) for EMA computation."
                )
            },
            {
                "remove": "chaotic_df  (undefined global DataFrame)",
                "replace_with": "get_income_history(pension_id, days=30)",
                "note": "Same as above — stable vs chaotic is a runtime characteristic, not a separate dataset."
            },
            {
                "remove": "current_target = 20.0  (hardcoded seed)",
                "replace_with": "user['last_savings_target']  via  get_user(pension_id)",
                "note": (
                    "Seeds the EMA from the last stored S_{t-1}. "
                    "If the field is None (first run), fall back to 20.0."
                )
            },
            {
                "remove": "processed_stable / processed_chaotic print output",
                "replace_with": "update_user_savings_target(pension_id, new_target)  after each day",
                "note": "Persist S_t after every computation so the next run starts correctly."
            },
        ],
        "trigger": "Called daily per worker via a scheduled task (Celery beat / APScheduler).",
    },

    # ──────────────────────────────────────────────────────────────────────────
    "MODULE_2_GUARDIAN_AGENT": {
        "file": "services/guardian_agent.py",
        "replacements": [
            {
                "remove": "processed_chaotic  (undefined global DataFrame)",
                "replace_with": "get_income_history(pension_id, days=10)",
                "note": "Fetches recent income records; Guardian operates on a short window."
            },
            {
                "remove": "consecutive_zero_days  (in-memory counter, resets on restart)",
                "replace_with": "get_recent_zero_income_days(pension_id, days=3)",
                "note": "Counts consecutive zero-income days from the DB; survives restarts."
            },
            {
                "remove": "rest_days_list  (collected from console input())",
                "replace_with": "user['rest_days']  via  get_user(pension_id)",
                "note": "Rest days are stored in the user document during onboarding."
            },
            {
                "remove": "msg = f'...'  (string in DataFrame column)",
                "replace_with": "create_notification(pension_id, 'savings_target' | 'grace_mode', ...)",
                "note": "Notifications are persisted and surfaced in the frontend inbox."
            },
            {
                "remove": "apply_guardian_with_rest_days(processed_chaotic.copy(), ...)",
                "replace_with": "run_guardian_for_worker(pension_id)  — one worker at a time via cron",
                "note": "Production Guardian runs as a scheduled task across all active workers."
            },
        ],
        "trigger": "Cron job: runs once per day per active worker. Also triggered on income record insert.",
    },

    # ──────────────────────────────────────────────────────────────────────────
    "MODULE_3_LEDGER_PROTOCOL": {
        "file": "services/ledger_protocol.py",
        "replacements": [
            {
                "remove": "tokens = {}  (global in-memory dict)",
                "replace_with": "store_token(pension_id, amount, token_type='payer_verify')",
                "note": "TTL index auto-expires after 10 minutes (or 5 for cash bridge)."
            },
            {
                "remove": "ledger = []  (global in-memory list)",
                "replace_with": "Transactions are written by deposit_split() — no separate ledger list needed.",
                "note": "The transactions collection IS the ledger. LOCKED status = immutable."
            },
            {
                "remove": "worker_id = 'W001'  (hardcoded in /generate)",
                "replace_with": "pension_id from JWT-authenticated session",
                "note": "JWT middleware must be added to all FastAPI routes."
            },
            {
                "remove": "ngrok + hardcoded auth token",
                "replace_with": "Remove entirely; deploy behind real domain or ngrok via env var",
                "note": "The ngrok token must be rotated immediately as it is exposed in source."
            },
            {
                "remove": "HTML string responses from FastAPI endpoints",
                "replace_with": "JSON responses; React frontend handles rendering",
                "note": "Frontend already uses axios to consume JSON from port 5000."
            },
        ],
        "trigger": "On-demand: worker initiates via mobile app; payer scans QR to confirm.",
    },

    # ──────────────────────────────────────────────────────────────────────────
    "MODULE_4_DUAL_KEY_GOVERNANCE": {
        "file": "services/dual_key_governance.py",
        "replacements": [
            {
                "remove": "self.users = {'W-1092': {...}}  (hardcoded dict)",
                "replace_with": "get_user(pension_id)",
                "note": "Live DB read for every request — never cached in memory."
            },
            {
                "remove": "self.pending_requests = {}  (in-memory dict)",
                "replace_with": "store_pending_withdrawal(pension_id, amount, otp_plain, nominee_phone)",
                "note": "TTL index on pending_withdrawals auto-expires after 5 minutes."
            },
            {
                "remove": "print(f'(Demo OTP: {otp})')  (security issue)",
                "replace_with": "Dispatch OTP via SMS gateway ONLY; never log or print the plain OTP",
                "note": "Use MSG91 or Twilio. Store only bcrypt hash via store_pending_withdrawal()."
            },
            {
                "remove": "user['vault_b_liquid'] -= amount  (sequential mutation)",
                "replace_with": "execute_withdrawal(pension_id, amount, approved_by_dual_key=True)",
                "note": "Single atomic MongoDB transaction — both vaults updated in one operation."
            },
            {
                "remove": "req['status'] = 'APPROVED'  (in-memory update)",
                "replace_with": "verify_withdrawal_otp(request_id, otp_entered)",
                "note": "Handles attempt counting, bcrypt verification, and status update atomically."
            },
        ],
        "trigger": "On-demand: worker requests withdrawal exceeding liquid vault limit.",
    },

    # ──────────────────────────────────────────────────────────────────────────
    "MODULE_5_EMERGENCY_SHIELD": {
        "file": "services/emergency_shield.py",
        "replacements": [
            {
                "remove": "self.users = {'W-1092': {...}}  (hardcoded dict)",
                "replace_with": "get_user(pension_id)",
                "note": "Fetch live balances before every deposit."
            },
            {
                "remove": "user['vault_a_pension'] += pension_allocation (sequential mutation)",
                "replace_with": "deposit_split(pension_id, amount, source_verified, ...)",
                "note": "Atomic $inc on both vaults + transaction record in one MongoDB session."
            },
            {
                "remove": "PENSION_RATIO = 0.80  (module constant)",
                "replace_with": "os.getenv('PENSION_SPLIT_RATIO', 0.80)  (configurable)",
                "note": "Future: per-worker split ratio based on age tier."
            },
            {
                "remove": "check_instant_withdrawal_eligibility() comparing to in-memory dict",
                "replace_with": "Read live liquid_vault from get_user() then compare",
                "note": "The function logic is correct; just the data source needs to change."
            },
        ],
        "trigger": "On every deposit event, regardless of source (app, agent, payer QR).",
    },

    # ──────────────────────────────────────────────────────────────────────────
    "MODULE_6_DIGITAL_BRIDGE": {
        "file": "services/digital_bridge.py",
        "replacements": [
            {
                "remove": "self.tokens = {}  in QRTokenManager",
                "replace_with": "store_token() / fetch_valid_token() / mark_token_used()",
                "note": "All token lifecycle functions are in db_helpers. QRTokenManager class can be removed."
            },
            {
                "remove": "self.users = {'W-1092': {...}}  (hardcoded)",
                "replace_with": "get_user(pension_id)",
                "note": "Live DB read."
            },
            {
                "remove": "self.agents = {'A-001': {...}}  (hardcoded)",
                "replace_with": "agents_collection.find_one({'agent_id': agent_id})",
                "note": "Agents are real documents in the agents collection."
            },
            {
                "remove": "agent['digital_float'] -= amount; worker['pension_vault'] += amount  (sequential)",
                "replace_with": "execute_agent_cash_bridge(pension_id, agent_id, amount, token_id)",
                "note": (
                    "Full atomic transaction: agent float debit + 80/20 vault credit + "
                    "transaction record + token mark-used in one session."
                )
            },
            {
                "remove": "print('(WebSocket fires...)')",
                "replace_with": "FastAPI WebSocket broadcast to worker_id and agent_id rooms",
                "note": "Requires WebSocket endpoint implementation (Phase 2C scope)."
            },
        ],
        "trigger": "On-demand: worker generates QR, walks to agent, agent scans and confirms cash.",
    },

    # ──────────────────────────────────────────────────────────────────────────
    "MODULE_7_PENSION_HEALTH_ENGINE": {
        "file": "services/pension_health_score.py",
        "replacements": [
            {
                "remove": "self.ledger = [{'amount': 400, 'status': 'LOCKED'} for _ in range(10)]",
                "replace_with": "Query transactions collection via get_transaction_history() + get_recent_deposit_streak()",
                "note": "All 10 identical entries were synthetic. Real data drives the score."
            },
            {
                "remove": "self.user = {'name': 'Raju', 'vault_a_pension': 3000.0, ...}",
                "replace_with": "get_user(pension_id)",
                "note": "Live vault balances from DB."
            },
            {
                "remove": "score += 200  # fully verified  (hardcoded constant)",
                "replace_with": "score += get_verified_income_ratio(pension_id) * 200",
                "note": "Proportional to actual verification rate from the transactions collection."
            },
            {
                "remove": "if deposit_days >= 7: score += 100  (total count, not streak)",
                "replace_with": "streak = get_recent_deposit_streak(pension_id); score += min(streak * 14, 100)",
                "note": "True consecutive streak, capped at 100 points."
            },
            {
                "remove": "penalty = amount * 0.8  (dimensionally wrong formula)",
                "replace_with": (
                    "Simulate the post-withdrawal vault state, recompute the score with those "
                    "hypothetical values, and return the delta. No magic multiplier."
                ),
                "note": (
                    "The correct approach: "
                    "hypothetical_pension = pension_vault - pension_debit; "
                    "hypothetical_liquid = liquid_vault - liquid_debit; "
                    "projected_score = compute_score_from_values(hypothetical_pension, hypothetical_liquid, ...)"
                )
            },
            {
                "remove": "engine = PensionHealthEngine()  (hardcoded constructor)",
                "replace_with": "compute_score(pension_id)  — stateless function taking pension_id",
                "note": "Score is always recomputed from live DB data; never cached in the class instance."
            },
        ],
        "trigger": (
            "Recompute after every deposit, withdrawal, or daily cron. "
            "Result written to users.pension_health_score via update_insurance_status()."
        ),
    },
}


# ─────────────────────────────────────────────────────────────────────────────
# FRONTEND COMPATIBILITY NOTES
# ─────────────────────────────────────────────────────────────────────────────

FRONTEND_COMPATIBILITY = {
    "existing_api_calls": [
        "POST /register         → {name, dateOfBirth, phone, password}",
        "POST /login            → {name, pensionId, password}",
        "GET  /user/:pensionId  → returns {name, totalSavings, accountStatus, currentAge, ...}",
        "POST /deposit          → {pensionId, amount}",
        "POST /withdraw         → {pensionId, amount}",
        "GET  /transactions/:pensionId",
        "GET  /annual-summary/:pensionId → {annualSavings, remainingToMinimum, yearsLeft, projectedCorpus, estimatedMonthlyPension, accountStatus}",
        "GET  /admin/overview",
    ],
    "schema_compatibility_notes": [
        "totalSavings in frontend = pension_vault + liquid_vault in new schema. "
        "The /user/:pensionId response must compute and return totalSavings = round(pension_vault + liquid_vault, 2).",

        "accountStatus in frontend ('Active'/'At Risk') maps to insurance_status ('ACTIVE'/'PAUSED') "
        "in the new schema. The API response must translate: ACTIVE→'Active', PAUSED→'At Risk'.",

        "The frontend /transactions page renders {type, amount, date} — the transactions collection "
        "provides exactly these fields (as 'type', 'amount', 'created_at' aliased to 'date').",

        "The /annual-summary endpoint uses get_annual_deposit_total() which queries the new "
        "transactions collection with the same logic the existing server.js uses.",

        "The frontend uses localStorage.setItem('pensionId', ...) — the pensionId field in the "
        "new users collection maps to the existing pensionId field exactly (no rename needed).",

        "New fields added to /user/:pensionId response (additive, non-breaking): "
        "pension_vault, liquid_vault, pension_health_score, insurance_status, last_savings_target.",
    ],
    "new_endpoints_for_future_features": [
        "GET  /health-score/:pensionId  → {score, insurance_status, component_breakdown}",
        "GET  /savings-target/:pensionId → {target, alpha_used, income_window_std}",
        "POST /income/:pensionId        → {amount, source, date}",
        "POST /qr-token                 → {token_id, expires_at}",
        "POST /qr-confirm/:token_id     → {amount, method}",
        "POST /agent/scan/:token_id     → agent validates token",
        "POST /agent/confirm/:token_id  → triggers execute_agent_cash_bridge()",
        "POST /withdraw/request         → triggers Dual-Key flow",
        "POST /withdraw/verify          → {request_id, otp}",
        "GET  /notifications/:pensionId → unread in-app notifications",
    ]
}

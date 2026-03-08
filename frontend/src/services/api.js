/**
 * services/api.js
 * ─────────────────────────────────────────────────────────────
 * PMS Frontend — Centralized API Service Layer
 *
 * All HTTP calls to the FastAPI backend live here.
 * Components and hooks never call fetch() directly.
 *
 * Auth token is read from localStorage and injected automatically.
 * All errors are normalized to { success: false, error: string }.
 * ─────────────────────────────────────────────────────────────
 */

const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ── Token helpers ─────────────────────────────────────────────────────────────

export const getToken = () => localStorage.getItem("pms_token");
export const setToken = (token) => localStorage.setItem("pms_token", token);
export const clearToken = () => localStorage.removeItem("pms_token");

export const getPensionId = () => localStorage.getItem("pms_pension_id");
export const setPensionId = (id) => localStorage.setItem("pms_pension_id", id);
export const clearPensionId = () => localStorage.removeItem("pms_pension_id");

// ── Core fetch wrapper ────────────────────────────────────────────────────────

async function request(path, options = {}) {
  const token = getToken();

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers,
    });

    const data = await res.json();

    if (!res.ok) {
      return {
        success: false,
        error: data?.error || data?.detail || `HTTP ${res.status}`,
      };
    }

    return data;
  } catch (err) {
    return { success: false, error: "Network error. Please check your connection." };
  }
}

const get = (path) => request(path, { method: "GET" });
const post = (path, body) =>
  request(path, { method: "POST", body: JSON.stringify(body) });


// ════════════════════════════════════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════════════════════════════════════

/**
 * POST /register
 * @param {{ name, date_of_birth, phone, password, nominee_phone, survival_minimum, rest_days }} body
 * @returns {{ success, pensionId, user }}
 */
export const register = (body) => post("/register", body);

/**
 * POST /login
 * @param {{ name, pension_id, password }} body
 * @returns {{ success, pensionId, token, token_type }}
 */
export const login = (body) => post("/login", body);


// ════════════════════════════════════════════════════════════════════════════
// USER PROFILE
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /user/{pensionId}
 * Full worker profile: vaults, health score, insurance status.
 * @param {string} pensionId
 * @returns {{ success, data: UserProfile }}
 */
export const getUserProfile = (pensionId) => get(`/user/${pensionId}`);

/**
 * GET /savings-target/{pensionId}
 * Current EMA-computed adaptive savings target.
 * @param {string} pensionId
 * @returns {{ success, safe_savings_target, alpha, ... }}
 */
export const getSavingsTarget = (pensionId) => get(`/savings-target/${pensionId}`);


// ════════════════════════════════════════════════════════════════════════════
// DEPOSITS
// ════════════════════════════════════════════════════════════════════════════

/**
 * POST /deposit
 * Self-initiated deposit → 80% pension vault, 20% liquid vault.
 * @param {{ amount: number }} body
 * @returns {{ success, pension_vault_after, liquid_vault_after, total_savings_after, transaction_id }}
 */
export const deposit = (body) => post("/deposit", body);


// ════════════════════════════════════════════════════════════════════════════
// INCOME
// ════════════════════════════════════════════════════════════════════════════

/**
 * POST /income
 * Record today's daily income → triggers EMA recompute.
 * @param {{ amount, source?, income_date?, notes? }} body
 * @returns {{ success, safe_savings_target, ... }}
 */
export const recordIncome = (body) => post("/income", body);


// ════════════════════════════════════════════════════════════════════════════
// WITHDRAWALS
// ════════════════════════════════════════════════════════════════════════════

/**
 * POST /withdraw/check
 * Pre-flight: is amount instantly withdrawable, or does it trigger Dual-Key?
 * @param {{ amount: number }} body
 * @returns {{ success, eligible, dual_key_required, liquid_vault, ... }}
 */
export const checkWithdrawalEligibility = (body) => post("/withdraw/check", body);

/**
 * POST /withdraw
 * Initiate a withdrawal.
 * Instant path: returns approved: true + vault snapshots.
 * Dual-Key path: returns approved: false, dual_key_required: true, request_id.
 * @param {{ amount: number }} body
 */
export const initiateWithdrawal = (body) => post("/withdraw", body);

/**
 * POST /withdraw/verify
 * Nominee submits OTP to approve a large withdrawal.
 * @param {{ request_id: string, otp_entered: string }} body
 */
export const verifyWithdrawalOTP = (body) => post("/withdraw/verify", body);


// ════════════════════════════════════════════════════════════════════════════
// LEDGER / PAYER
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /transactions/{pensionId}
 * Full transaction history for the worker.
 * @param {string} pensionId
 */
export const getTransactions = (pensionId) => get(`/transactions/${pensionId}`);

/**
 * GET /annual-summary/{pensionId}
 * Annual totals + retirement projection.
 * @param {string} pensionId
 */
export const getAnnualSummary = (pensionId) => get(`/annual-summary/${pensionId}`);

/**
 * POST /ledger/token
 * Worker generates a payer QR token.
 * @param {{ expected_amount?: number }} body
 */
export const generatePaymentToken = (body) => post("/ledger/token", body);

/**
 * POST /confirm-payment
 * Payer confirms income. No JWT required on this endpoint.
 * @param {{ token_id, amount, method, payer_id? }} body
 */
export const confirmPayment = (body) => post("/confirm-payment", body);


// ════════════════════════════════════════════════════════════════════════════
// AGENT / DIGITAL BRIDGE
// ════════════════════════════════════════════════════════════════════════════

/**
 * POST /agent/generate-token
 * Worker generates a 5-min cash QR token to show the local agent.
 * @param {{ amount: number }} body
 */
export const generateCashToken = (body) => post("/agent/generate-token", body);

/**
 * POST /agent/confirm-cash
 * Agent confirms cash received → atomic settlement.
 * @param {{ agent_id, token_id }} body
 */
export const agentConfirmCash = (body) => post("/agent/confirm-cash", body);


// ════════════════════════════════════════════════════════════════════════════
// HEALTH SCORE
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /health-score/{pensionId}
 * Compute and return Pension Health Score (0–1000) + insurance status.
 * @param {string} pensionId
 */
export const getHealthScore = (pensionId) => get(`/health-score/${pensionId}`);

/**
 * POST /health-score/{pensionId}/simulate
 * Preview score impact of a proposed withdrawal before moving funds.
 * @param {string} pensionId
 * @param {{ amount: number }} body
 */
export const simulateWithdrawal = (pensionId, body) =>
  post(`/health-score/${pensionId}/simulate`, body);


// ════════════════════════════════════════════════════════════════════════════
// GUARDIAN AGENT
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /guardian-status/{pensionId}
 * Evaluate today's Guardian state: ACTIVE_WORK_DAY | REST_DAY | GRACE_MODE | etc.
 * Also triggers a WebSocket GUARDIAN_ALERT broadcast.
 * @param {string} pensionId
 */
export const getGuardianStatus = (pensionId) => get(`/guardian-status/${pensionId}`);

/**
 * GET /notifications/{pensionId}
 * Unread in-app notification inbox.
 * @param {string} pensionId
 */
export const getNotifications = (pensionId) => get(`/notifications/${pensionId}`);


// ════════════════════════════════════════════════════════════════════════════
// RETIREMENT PROJECTION
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /retirement-projection
 * Estimated monthly pension at age 60 based on current corpus + growth rate.
 */
export const getRetirementProjection = () => get("/retirement-projection");


// ════════════════════════════════════════════════════════════════════════════
// WEBSOCKET
// ════════════════════════════════════════════════════════════════════════════

/**
 * createWebSocket(pensionId, onMessage)
 * Opens a WebSocket to ws://<host>/ws/notifications/{pensionId}.
 * Returns the WebSocket instance so the caller can close it on unmount.
 *
 * Events received:
 *   { event: "GUARDIAN_ALERT",   payload: { state, grace_mode, user_facing_target, message } }
 *   { event: "DEPOSIT_CONFIRMED", payload: { amount, transaction_id, vault_split } }
 *   { event: "WITHDRAWAL_OTP",   payload: { request_id } }
 *   { event: "INSURANCE_PAUSED", payload: { health_score } }
 *
 * @param {string} pensionId
 * @param {(data: object) => void} onMessage
 * @returns {WebSocket}
 */
export const createWebSocket = (pensionId, onMessage) => {
  const wsBase = (import.meta.env.VITE_API_URL || "http://localhost:8000")
    .replace(/^http/, "ws");
  const ws = new WebSocket(`${wsBase}/ws/notifications/${pensionId}`);

  ws.onopen = () => console.log("[WS] Connected:", pensionId);
  ws.onclose = () => console.log("[WS] Disconnected");
  ws.onerror = (e) => console.error("[WS] Error:", e);

  ws.onmessage = (evt) => {
    try {
      const data = JSON.parse(evt.data);
      onMessage(data);
    } catch {
      console.warn("[WS] Non-JSON message:", evt.data);
    }
  };

  return ws;
};

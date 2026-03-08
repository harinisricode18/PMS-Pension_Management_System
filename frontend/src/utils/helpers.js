/**
 * utils/helpers.js
 * ─────────────────────────────────────────────────────────────
 * Shared utility functions for PMS frontend.
 * ─────────────────────────────────────────────────────────────
 */

/**
 * Format a number as Indian Rupee currency.
 * e.g. 12345.6 → "₹12,345.60"
 */
export function formatRupee(amount, decimals = 2) {
  if (amount === null || amount === undefined) return "₹0.00";
  return `₹${Number(amount).toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * Compute vault split preview for a given deposit amount.
 * Returns { pension, liquid } in rupees.
 */
export function computeVaultSplit(amount) {
  const pension = Math.floor(amount * 0.8 * 100) / 100;
  const liquid  = Math.round((amount - pension) * 100) / 100;
  return { pension, liquid };
}

/**
 * Format a Date or ISO string as a human-readable relative time.
 * e.g. "2 hours ago", "Yesterday", "3 Mar 2025"
 */
export function formatRelativeTime(dateInput) {
  if (!dateInput) return "";
  const date = new Date(dateInput);
  const now  = new Date();
  const diff = now - date; // ms

  const minutes = Math.floor(diff / 60_000);
  const hours   = Math.floor(diff / 3_600_000);
  const days    = Math.floor(diff / 86_400_000);

  if (minutes < 1)  return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24)   return `${hours}h ago`;
  if (days === 1)   return "Yesterday";
  if (days < 7)     return `${days} days ago`;

  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * Guardian state → display config mapping.
 * Returns { emoji, label, bgClass, textClass, borderClass }
 */
export function getGuardianStateDisplay(state) {
  const map = {
    ACTIVE_WORK_DAY: {
      emoji: "💼", label: "Work Day",
      bgClass: "bg-indigo-50", textClass: "text-indigo-700", borderClass: "border-indigo-200",
    },
    REST_DAY: {
      emoji: "🌿", label: "Rest Day",
      bgClass: "bg-blue-50", textClass: "text-blue-700", borderClass: "border-blue-200",
    },
    GRACE_MODE: {
      emoji: "🤝", label: "Grace Mode",
      bgClass: "bg-amber-50", textClass: "text-amber-700", borderClass: "border-amber-200",
    },
    BONUS_WORK_ON_REST: {
      emoji: "⭐", label: "Bonus Work Day",
      bgClass: "bg-emerald-50", textClass: "text-emerald-700", borderClass: "border-emerald-200",
    },
    ZERO_INCOME_PENDING: {
      emoji: "📝", label: "Enter Income",
      bgClass: "bg-slate-50", textClass: "text-slate-600", borderClass: "border-slate-200",
    },
  };
  return map[state] ?? map.ACTIVE_WORK_DAY;
}

/**
 * Transaction type → display config.
 */
export function getTxnDisplay(type) {
  const map = {
    DEPOSIT:           { emoji: "💰", label: "Deposit",          color: "text-emerald-600" },
    WITHDRAWAL:        { emoji: "💸", label: "Withdrawal",        color: "text-red-500"     },
    INCOME_VERIFIED:   { emoji: "✅", label: "Income Verified",   color: "text-indigo-600"  },
    INCOME_SELF:       { emoji: "📈", label: "Income Recorded",   color: "text-blue-600"    },
    AGENT_DEPOSIT:     { emoji: "🤝", label: "Agent Deposit",     color: "text-emerald-600" },
    OTP_WITHDRAWAL:    { emoji: "🔐", label: "Dual-Key Withdraw", color: "text-amber-600"   },
  };
  return map[type] ?? { emoji: "📋", label: type, color: "text-slate-600" };
}

/**
 * Health score → label and color.
 */
export function getHealthLabel(score) {
  if (score >= 700) return { label: "Excellent", color: "#10b981", bgClass: "bg-emerald-50 text-emerald-700" };
  if (score >= 400) return { label: "Good",      color: "#f59e0b", bgClass: "bg-amber-50 text-amber-700"    };
  return                   { label: "At Risk",   color: "#ef4444", bgClass: "bg-red-50 text-red-700"        };
}

/**
 * Countdown timer helper.
 * Given a target Date, returns { minutes, seconds, expired }.
 */
export function getCountdown(expiryDate) {
  const diff = new Date(expiryDate) - new Date();
  if (diff <= 0) return { minutes: 0, seconds: 0, expired: true };
  const minutes = Math.floor(diff / 60_000);
  const seconds = Math.floor((diff % 60_000) / 1_000);
  return { minutes, seconds, expired: false };
}

/**
 * Validate pension ID format: PP-XXXXXXXX (8 hex chars).
 */
export function isValidPensionId(id) {
  return /^PP-[A-F0-9]{8}$/.test(id?.toUpperCase() ?? "");
}

/**
 * Clamp a number between min and max.
 */
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

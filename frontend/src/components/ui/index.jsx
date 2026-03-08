/**
 * components/ui/index.jsx
 * ─────────────────────────────────────────────────────────────
 * PMS Design System — Core Reusable UI Components
 *
 * Design direction: "Warm Terracotta + Deep Indigo"
 * — Feels trustworthy, human, and financial-grade.
 * — Large touch targets for low-literacy users.
 * — High contrast, simple icons, reassuring language.
 * ─────────────────────────────────────────────────────────────
 */

import { motion, AnimatePresence } from "framer-motion";

// ════════════════════════════════════════════════════════════════
// BUTTON
// Primary, secondary, danger variants. Large touch targets.
// ════════════════════════════════════════════════════════════════

const buttonVariants = {
  primary:   "bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-lg shadow-indigo-200",
  secondary: "bg-amber-50 hover:bg-amber-100 active:bg-amber-200 text-indigo-800 border border-amber-200",
  danger:    "bg-red-500 hover:bg-red-600 active:bg-red-700 text-white shadow-lg shadow-red-200",
  ghost:     "bg-transparent hover:bg-indigo-50 text-indigo-600",
  success:   "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-200",
};

export function Button({
  children,
  variant = "primary",
  loading = false,
  disabled = false,
  fullWidth = false,
  size = "md",
  onClick,
  type = "button",
  className = "",
}) {
  const sizes = {
    sm: "py-2 px-4 text-sm",
    md: "py-3.5 px-6 text-base",
    lg: "py-4 px-8 text-lg",
  };

  return (
    <motion.button
      type={type}
      whileTap={{ scale: disabled || loading ? 1 : 0.97 }}
      onClick={onClick}
      disabled={disabled || loading}
      className={`
        ${buttonVariants[variant]}
        ${sizes[size]}
        ${fullWidth ? "w-full" : ""}
        rounded-2xl font-semibold tracking-wide
        transition-all duration-150
        disabled:opacity-50 disabled:cursor-not-allowed
        flex items-center justify-center gap-2
        ${className}
      `}
    >
      {loading && (
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      {children}
    </motion.button>
  );
}


// ════════════════════════════════════════════════════════════════
// CARD
// White rounded card with optional shadow and press animation.
// ════════════════════════════════════════════════════════════════

export function Card({ children, className = "", onClick, padding = "p-5" }) {
  return (
    <motion.div
      whileTap={onClick ? { scale: 0.98 } : {}}
      onClick={onClick}
      className={`
        bg-white rounded-3xl shadow-sm border border-slate-100
        ${padding} ${onClick ? "cursor-pointer" : ""}
        ${className}
      `}
    >
      {children}
    </motion.div>
  );
}


// ════════════════════════════════════════════════════════════════
// VAULT CARD
// Visual split display: pension (80%) and liquid (20%) vaults.
// The most important UI element in the app.
// ════════════════════════════════════════════════════════════════

export function VaultCard({ pensionVault = 0, liquidVault = 0, animateOnMount = true }) {
  const total = pensionVault + liquidVault;

  return (
    <Card className="bg-gradient-to-br from-indigo-600 to-indigo-800 border-0 text-white" padding="p-6">
      <p className="text-indigo-200 text-sm font-medium mb-1 tracking-wide uppercase">
        Total Savings
      </p>
      <motion.p
        initial={animateOnMount ? { opacity: 0, y: 10 } : false}
        animate={{ opacity: 1, y: 0 }}
        className="text-4xl font-bold mb-5 tracking-tight"
      >
        ₹{total.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </motion.p>

      {/* Split bar */}
      <div className="w-full h-3 rounded-full bg-indigo-900/50 mb-3 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: total > 0 ? `${(pensionVault / total) * 100}%` : "80%" }}
          transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
          className="h-full bg-amber-400 rounded-full"
        />
      </div>

      <div className="flex justify-between text-sm">
        <div>
          <p className="text-amber-300 font-semibold">🔒 Pension Vault (80%)</p>
          <p className="text-white font-bold text-lg">
            ₹{pensionVault.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="text-right">
          <p className="text-emerald-300 font-semibold">💧 Liquid Fund (20%)</p>
          <p className="text-white font-bold text-lg">
            ₹{liquidVault.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>
    </Card>
  );
}


// ════════════════════════════════════════════════════════════════
// BALANCE DISPLAY
// Large centered rupee amount with label.
// ════════════════════════════════════════════════════════════════

export function BalanceDisplay({ amount, label, color = "text-indigo-700", size = "4xl" }) {
  return (
    <div className="text-center">
      <p className="text-slate-500 text-sm mb-1">{label}</p>
      <motion.p
        key={amount}
        initial={{ scale: 0.95, opacity: 0.6 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`font-bold ${color} text-${size}`}
      >
        ₹{Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
      </motion.p>
    </div>
  );
}


// ════════════════════════════════════════════════════════════════
// INPUT FIELD
// Large text input, accessible, with label and error.
// ════════════════════════════════════════════════════════════════

export function InputField({
  label,
  name,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
  prefix,
  suffix,
  required = false,
  disabled = false,
  inputMode,
  className = "",
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={name} className="text-sm font-semibold text-slate-700">
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative flex items-center">
        {prefix && (
          <span className="absolute left-4 text-slate-500 font-semibold text-lg select-none">
            {prefix}
          </span>
        )}
        <input
          id={name}
          name={name}
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          required={required}
          inputMode={inputMode}
          className={`
            w-full rounded-2xl border py-3.5 text-slate-800 text-base
            placeholder-slate-400 bg-slate-50
            focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent
            disabled:bg-slate-100 disabled:cursor-not-allowed
            transition-all duration-150
            ${prefix ? "pl-10 pr-4" : "px-4"}
            ${suffix ? "pr-10" : ""}
            ${error ? "border-red-400 bg-red-50" : "border-slate-200"}
          `}
        />
        {suffix && (
          <span className="absolute right-4 text-slate-500 text-sm select-none">{suffix}</span>
        )}
      </div>
      <AnimatePresence>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="text-red-500 text-xs"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}


// ════════════════════════════════════════════════════════════════
// OTP INPUT
// 6 individual digit boxes. Auto-advances, paste-aware.
// ════════════════════════════════════════════════════════════════

import { useRef } from "react";

export function OTPInput({ value, onChange, disabled = false }) {
  const digits = value.split("");
  const inputs = useRef([]);

  const handleChange = (i, char) => {
    if (!/^\d?$/.test(char)) return; // digits only
    const next = [...digits];
    next[i] = char;
    onChange(next.join(""));
    if (char && i < 5) inputs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i, e) => {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    onChange(pasted.padEnd(6, "").slice(0, 6));
    inputs.current[Math.min(pasted.length, 5)]?.focus();
  };

  return (
    <div className="flex gap-3 justify-center" onPaste={handlePaste}>
      {Array.from({ length: 6 }).map((_, i) => (
        <input
          key={i}
          ref={(el) => (inputs.current[i] = el)}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[i] || ""}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          disabled={disabled}
          className={`
            w-12 h-14 text-center text-2xl font-bold rounded-2xl border-2
            text-indigo-800 bg-slate-50
            focus:outline-none focus:border-indigo-500 focus:bg-white
            transition-all duration-100
            ${digits[i] ? "border-indigo-400 bg-indigo-50" : "border-slate-200"}
            disabled:opacity-50
          `}
        />
      ))}
    </div>
  );
}


// ════════════════════════════════════════════════════════════════
// NOTIFICATION TOAST
// Top-right slide-in toasts driven by NotificationContext.
// ════════════════════════════════════════════════════════════════

const toastStyles = {
  success: "bg-emerald-50 border-emerald-300 text-emerald-800",
  error:   "bg-red-50 border-red-300 text-red-800",
  warning: "bg-amber-50 border-amber-300 text-amber-800",
  info:    "bg-indigo-50 border-indigo-300 text-indigo-800",
};

const toastIcons = {
  success: "✅",
  error:   "❌",
  warning: "⚠️",
  info:    "ℹ️",
};

export function NotificationToast({ toast, onDismiss }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 80, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 80, scale: 0.9 }}
      className={`
        flex items-start gap-3 p-4 rounded-2xl border shadow-lg
        max-w-xs w-full cursor-pointer
        ${toastStyles[toast.type] || toastStyles.info}
      `}
      onClick={() => onDismiss(toast.id)}
    >
      <span className="text-xl flex-shrink-0">{toastIcons[toast.type]}</span>
      <div className="flex-1 min-w-0">
        {toast.title && <p className="font-semibold text-sm">{toast.title}</p>}
        {toast.message && <p className="text-xs mt-0.5 opacity-80">{toast.message}</p>}
      </div>
    </motion.div>
  );
}


// ════════════════════════════════════════════════════════════════
// HEALTH SCORE RING
// SVG circular progress ring for Pension Health Score (0–1000).
// ════════════════════════════════════════════════════════════════

export function HealthScoreRing({ score = 0, size = 120 }) {
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(score / 1000, 1);
  const offset = circumference * (1 - progress);

  const color =
    score >= 700 ? "#10b981" :
    score >= 400 ? "#f59e0b" :
    "#ef4444";

  const label =
    score >= 700 ? "Excellent" :
    score >= 400 ? "Good" :
    "At Risk";

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox="0 0 100 100">
        {/* Track */}
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        {/* Progress */}
        <motion.circle
          cx="50" cy="50" r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: "easeOut" }}
          style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
        />
        {/* Score text */}
        <text x="50" y="47" textAnchor="middle" className="text-xl font-bold" fill={color}
          style={{ fontSize: "20px", fontWeight: "700" }}>
          {score}
        </text>
        <text x="50" y="61" textAnchor="middle" fill="#94a3b8"
          style={{ fontSize: "9px" }}>
          / 1000
        </text>
      </svg>
      <span className="text-xs font-semibold" style={{ color }}>{label}</span>
    </div>
  );
}


// ════════════════════════════════════════════════════════════════
// SECTION HEADER
// Consistent page/section title style.
// ════════════════════════════════════════════════════════════════

export function SectionHeader({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between mb-4">
      <div>
        <h2 className="text-lg font-bold text-slate-800">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}


// ════════════════════════════════════════════════════════════════
// LOADING SPINNER
// Full-screen or inline loading state.
// ════════════════════════════════════════════════════════════════

export function LoadingSpinner({ fullScreen = false, message = "Loading..." }) {
  const inner = (
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      <p className="text-slate-500 text-sm">{message}</p>
    </div>
  );

  if (!fullScreen) return inner;

  return (
    <div className="fixed inset-0 bg-white/80 flex items-center justify-center z-50">
      {inner}
    </div>
  );
}


// ════════════════════════════════════════════════════════════════
// EMPTY STATE
// Friendly empty state with icon and message.
// ════════════════════════════════════════════════════════════════

export function EmptyState({ emoji = "📭", title, description }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <span className="text-5xl">{emoji}</span>
      <p className="font-semibold text-slate-700">{title}</p>
      {description && <p className="text-sm text-slate-400 max-w-xs">{description}</p>}
    </div>
  );
}

/**
 * utils/animations.js
 * ─────────────────────────────────────────────────────────────
 * Shared Framer Motion animation variants for PMS.
 * Import these into any component needing animations.
 * ─────────────────────────────────────────────────────────────
 */

// ── Page transitions ──────────────────────────────────────────────────────────

export const pageVariants = {
  initial:  { opacity: 0, y: 16 },
  animate:  { opacity: 1, y: 0 },
  exit:     { opacity: 0, y: -8 },
};

export const pageTransition = { duration: 0.2, ease: "easeOut" };


// ── Card animations ───────────────────────────────────────────────────────────

export const cardVariants = {
  hidden:  { opacity: 0, y: 20, scale: 0.97 },
  visible: { opacity: 1, y: 0,  scale: 1 },
};

// Use with staggerChildren for lists
export const containerVariants = {
  hidden:  {},
  visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } },
};

export const itemVariants = {
  hidden:  { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } },
};


// ── Vault split animation ─────────────────────────────────────────────────────
// Used on DepositPage after a successful deposit.
// Two coins fly left (pension) and right (liquid).

export const vaultSplitVariants = {
  coin: {
    initial:  { scale: 1, x: 0,    opacity: 1 },
    pension:  { scale: 0.8, x: -60, opacity: 0.8, transition: { duration: 0.6, ease: "easeInOut" } },
    liquid:   { scale: 0.8, x: 60,  opacity: 0.8, transition: { duration: 0.6, ease: "easeInOut" } },
  },
  label: {
    initial:  { opacity: 0, y: 10 },
    animate:  { opacity: 1, y: 0,  transition: { delay: 0.5, duration: 0.3 } },
  },
};


// ── Success burst ─────────────────────────────────────────────────────────────
// Big checkmark that scales up then settles.

export const successVariants = {
  circle: {
    initial:  { scale: 0 },
    animate:  { scale: 1, transition: { type: "spring", stiffness: 200, damping: 12 } },
  },
  checkmark: {
    initial:  { pathLength: 0 },
    animate:  { pathLength: 1, transition: { delay: 0.2, duration: 0.4, ease: "easeOut" } },
  },
};


// ── Guardian shield pulse ─────────────────────────────────────────────────────
// Active insurance: gentle pulse. Paused: dim heartbeat.

export const shieldVariants = {
  active: {
    scale: [1, 1.06, 1],
    transition: { repeat: Infinity, duration: 2.5, ease: "easeInOut" },
  },
  paused: {
    opacity: [1, 0.55, 1],
    transition: { repeat: Infinity, duration: 1.8, ease: "easeInOut" },
  },
};


// ── Toast ─────────────────────────────────────────────────────────────────────

export const toastVariants = {
  initial: { opacity: 0, x: 80,  scale: 0.9 },
  animate: { opacity: 1, x: 0,   scale: 1, transition: { duration: 0.25, ease: "easeOut" } },
  exit:    { opacity: 0, x: 80,  scale: 0.9, transition: { duration: 0.2 } },
};


// ── Health score ring ─────────────────────────────────────────────────────────

export const ringVariants = {
  initial: { strokeDashoffset: 276.46 },  // full circumference (r=44, 2πr ≈ 276)
  animate: (pct) => ({
    strokeDashoffset: 276.46 * (1 - pct),
    transition: { duration: 1.2, ease: "easeOut", delay: 0.3 },
  }),
};


// ── OTP digit fill ────────────────────────────────────────────────────────────

export const otpDigitVariants = {
  empty:  { scale: 1,    borderColor: "#e2e8f0" },
  filled: { scale: [1, 1.15, 1], borderColor: "#6366f1", transition: { duration: 0.15 } },
};


// ── Number counter ────────────────────────────────────────────────────────────
// Used for animated balance changes.

export const counterTransition = { type: "spring", stiffness: 100, damping: 20 };


// ── QR token countdown ────────────────────────────────────────────────────────

export const qrContainerVariants = {
  initial: { opacity: 0, scale: 0.85 },
  animate: { opacity: 1, scale: 1, transition: { duration: 0.4, ease: "backOut" } },
  exit:    { opacity: 0, scale: 0.85 },
};

export const qrPulseVariants = {
  animate: {
    boxShadow: [
      "0 0 0 0px rgba(99, 102, 241, 0.4)",
      "0 0 0 12px rgba(99, 102, 241, 0)",
    ],
    transition: { repeat: Infinity, duration: 2 },
  },
};

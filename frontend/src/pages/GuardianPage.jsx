import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import * as api from "../services/api";
import { getGuardianStateDisplay } from "../utils/helpers";

// ── Insurance Shield ──────────────────────────────────────────────────────────
function InsuranceShield({ isActive }) {
  return (
    <div className="text-center py-4">
      <motion.div
        animate={isActive
          ? { scale: [1, 1.06, 1], transition: { repeat: Infinity, duration: 2.5, ease: "easeInOut" } }
          : { opacity: [1, 0.5, 1], transition: { repeat: Infinity, duration: 1.8, ease: "easeInOut" } }
        }
        className={`w-28 h-28 rounded-full flex items-center justify-center mx-auto mb-3
          ${isActive ? "bg-emerald-100 shadow-lg shadow-emerald-200" : "bg-amber-100"}`}
      >
        <span className="text-6xl">{isActive ? "🛡️" : "⚠️"}</span>
      </motion.div>
      <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold ${isActive ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
        <span className={`w-2 h-2 rounded-full ${isActive ? "bg-emerald-500" : "bg-amber-500"} animate-pulse`} />
        Insurance {isActive ? "Active" : "Paused"}
      </div>
      {!isActive && (
        <p className="text-slate-500 text-xs mt-2 max-w-xs mx-auto">
          Keep saving consistently to reactivate your free insurance coverage
        </p>
      )}
    </div>
  );
}

// ── Health Score Ring ─────────────────────────────────────────────────────────
function HealthScoreRing({ score = 0 }) {
  const r = 60, circ = 2 * Math.PI * r;
  const color = score >= 700 ? "#10b981" : score >= 400 ? "#f59e0b" : "#ef4444";
  const label = score >= 700 ? "Excellent" : score >= 400 ? "Good" : "At Risk";
  const track = score >= 700 ? "bg-emerald-50 text-emerald-700" : score >= 400 ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-700";

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="160" height="160" viewBox="0 0 140 140">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#e2e8f0" strokeWidth="10" />
        <motion.circle
          cx="70" cy="70" r={r}
          fill="none" stroke={color} strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ * (1 - score / 1000) }}
          transition={{ duration: 1.4, ease: "easeOut", delay: 0.3 }}
          style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
        />
        <text x="70" y="62" textAnchor="middle" fill={color}
          style={{ fontSize: "28px", fontFamily: "Sora", fontWeight: "800" }}>{score}</text>
        <text x="70" y="78" textAnchor="middle" fill="#94a3b8"
          style={{ fontSize: "11px" }}>out of 1000</text>
        <text x="70" y="93" textAnchor="middle" fill={color}
          style={{ fontSize: "10px", fontWeight: "700" }}>{label}</text>
      </svg>
    </div>
  );
}

// ── Score Breakdown ───────────────────────────────────────────────────────────
const BREAKDOWN_META = {
  deposit_consistency: { label: "Deposit Consistency", emoji: "📊", max: 400 },
  balance_stability:   { label: "Balance Stability",   emoji: "⚖️",  max: 300 },
  withdrawal_penalty:  { label: "Withdrawal Behavior", emoji: "💸",  max: 200, invert: true },
  bonus_points:        { label: "Bonus Points",         emoji: "⭐",  max: 100 },
};

function ScoreBreakdown({ breakdown = {} }) {
  const entries = Object.entries(BREAKDOWN_META);
  return (
    <div className="space-y-3">
      <p className="text-sm font-bold text-slate-700 mb-2">What makes up your score</p>
      {entries.map(([key, meta], i) => {
        const raw = breakdown[key] ?? 0;
        const pct = Math.min(100, (Math.abs(raw) / meta.max) * 100);
        const color = meta.invert
          ? raw > 50 ? "bg-red-400" : "bg-emerald-400"
          : raw >= meta.max * 0.7 ? "bg-emerald-400" : raw >= meta.max * 0.4 ? "bg-amber-400" : "bg-red-400";
        return (
          <motion.div key={key}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            className="bg-white rounded-2xl border border-slate-100 p-3"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span>{meta.emoji}</span>
                <p className="text-sm font-semibold text-slate-700">{meta.label}</p>
              </div>
              <p className="text-sm font-bold text-slate-500">{Math.abs(raw)}<span className="text-slate-300">/{meta.max}</span></p>
            </div>
            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.7, ease: "easeOut", delay: 0.2 + i * 0.08 }}
                className={`h-full rounded-full ${color}`}
              />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

// ── Guardian State Card ───────────────────────────────────────────────────────
function StateCard({ state, graceMode, target, message }) {
  const d = getGuardianStateDisplay(state);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-3xl border p-5 ${d.bgClass} ${d.borderClass}`}
    >
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-2xl bg-white/60 flex items-center justify-center text-2xl flex-shrink-0">
          {d.emoji}
        </div>
        <div>
          <p className={`text-xs font-bold tracking-widest uppercase mb-1 ${d.textClass}`}>{d.label}</p>
          <p className={`text-sm font-medium ${d.textClass} opacity-80`}>{message}</p>
          {!graceMode && target > 0 && (
            <div className={`mt-2 inline-flex items-center gap-1 bg-white/60 rounded-xl px-3 py-1 ${d.textClass} text-xs font-bold`}>
              💰 Today's target: ₹{target}
            </div>
          )}
          {graceMode && (
            <p className={`mt-2 text-xs ${d.textClass} opacity-60`}>
              Grace mode active — targets paused, no penalties
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Tips Section ──────────────────────────────────────────────────────────────
function ScoreTips({ score }) {
  const tips = score >= 700 ? [
    "🎯 Keep depositing daily to maintain your score",
    "📈 Your insurance is active — great job!",
    "🌱 Consistent saving grows your pension faster",
  ] : score >= 400 ? [
    "💡 Deposit even small amounts daily to improve",
    "⚠️ Reduce withdrawal frequency to boost score",
    "🎯 Aim for 5 deposits in the next 7 days",
  ] : [
    "🚨 Start depositing daily — even ₹20 helps!",
    "💙 Grace mode available during tough periods",
    "📞 Contact your agent for support",
  ];

  return (
    <div className="bg-white rounded-2xl border border-slate-100 p-4">
      <p className="text-sm font-bold text-slate-700 mb-3">How to improve your score</p>
      <div className="space-y-2">
        {tips.map((t, i) => (
          <motion.div key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 + i * 0.1 }}
            className="flex items-start gap-2 text-sm text-slate-600"
          >
            <span className="flex-shrink-0">{t.slice(0, 2)}</span>
            <span>{t.slice(2)}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export default function GuardianPage() {
  const { pensionId, user } = useAuth();
  const [guardian, setGuardian] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pensionId) return;
    Promise.all([
      api.getGuardianStatus(pensionId),
      api.getHealthScore(pensionId),
    ]).then(([g, h]) => {
      if (g?.success !== false) setGuardian(g);
      if (h?.success !== false) setHealth(h);
      setLoading(false);
    });
  }, [pensionId]);

  const score = health?.health_score ?? user?.pension_health_score ?? 0;
  const isActive = (health?.insurance_status ?? user?.insurance_status) === "ACTIVE";
  const breakdown = health?.component_breakdown ?? {};

  if (loading) return (
    <div className="space-y-4">
      <div className="shimmer rounded-3xl h-32" />
      <div className="shimmer rounded-3xl h-48" />
      <div className="shimmer rounded-3xl h-24" />
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 font-display">Guardian 🛡️</h1>
        <p className="text-slate-500 text-sm mt-1">Your financial health overview</p>
      </div>

      {/* Guardian state */}
      {guardian && (
        <StateCard
          state={guardian.state}
          graceMode={guardian.grace_mode}
          target={guardian.user_facing_target}
          message={guardian.message}
        />
      )}

      {/* Insurance shield */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-card py-2">
        <InsuranceShield isActive={isActive} />
      </div>

      {/* Health score */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-card p-6 text-center">
        <p className="text-slate-500 text-xs font-semibold uppercase tracking-wide mb-4">Pension Health Score</p>
        <HealthScoreRing score={score} />
        <p className="text-xs text-slate-400 mt-3">Updated after each deposit or withdrawal</p>
      </div>

      {/* Score breakdown */}
      {Object.keys(breakdown).length > 0 && <ScoreBreakdown breakdown={breakdown} />}

      {/* Tips */}
      <ScoreTips score={score} />
    </div>
  );
}

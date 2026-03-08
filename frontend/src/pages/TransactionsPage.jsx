import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import * as api from "../services/api";
import { formatRupee, formatRelativeTime, getTxnDisplay } from "../utils/helpers";

const FILTERS = ["All", "Deposits", "Withdrawals", "Verified"];

function FilterTabs({ active, onChange }) {
  return (
    <div className="flex overflow-x-auto gap-2 pb-1 no-scrollbar">
      {FILTERS.map((f) => (
        <button
          key={f}
          onClick={() => onChange(f)}
          className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-bold transition-all ${active === f ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}
        >
          {f}
        </button>
      ))}
    </div>
  );
}

function TxnRow({ t, index }) {
  const type = t.type || t.transaction_type || "";
  const d = getTxnDisplay(type);
  const isDeposit = type.includes("DEPOSIT") || type.includes("INCOME");
  const isLocked = t.is_locked || type === "PENSION_DEPOSIT";
  const vault = t.vault_type || (isLocked ? "pension" : "liquid");

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="flex items-center gap-3 bg-white rounded-2xl border border-slate-100 px-4 py-3.5"
    >
      <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-xl flex-shrink-0">
        {d.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-slate-700 truncate">{d.label}</p>
          {isLocked && (
            <span className="text-[10px] font-bold bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-md flex-shrink-0">🔒 LOCKED</span>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-0.5">
          {formatRelativeTime(t.date || t.timestamp)}
          {vault && <span className="ml-1.5 capitalize">· {vault}</span>}
        </p>
      </div>
      <div className="text-right">
        <p className={`font-bold font-display text-sm ${isDeposit ? "text-emerald-600" : "text-red-500"}`}>
          {isDeposit ? "+" : "-"}{formatRupee(Math.abs(t.amount || 0))}
        </p>
        {t.source_verified && (
          <p className="text-[10px] text-emerald-500 font-semibold">✓ Verified</p>
        )}
      </div>
    </motion.div>
  );
}

export default function TransactionsPage() {
  const { pensionId, user } = useAuth();
  const [txns, setTxns] = useState([]);
  const [summary, setSummary] = useState(null);
  const [filter, setFilter] = useState("All");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pensionId) return;
    Promise.all([
      api.getTransactions(pensionId),
      api.getAnnualSummary(pensionId),
    ]).then(([t, s]) => {
      const arr = t?.transactions || t?.data || (Array.isArray(t) ? t : []);
      setTxns(arr);
      if (s) setSummary(s);
      setLoading(false);
    });
  }, [pensionId]);

  const filtered = txns.filter((t) => {
    const type = t.type || t.transaction_type || "";
    if (filter === "Deposits") return type.includes("DEPOSIT");
    if (filter === "Withdrawals") return type.includes("WITHDRAW");
    if (filter === "Verified") return t.source_verified;
    return true;
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 font-display">History 📋</h1>
        <p className="text-slate-500 text-sm mt-1">All your transactions</p>
      </div>

      {/* Annual summary */}
      {(summary || user) && (
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-emerald-50 rounded-2xl border border-emerald-100 p-4">
            <p className="text-emerald-600 text-xs font-bold mb-1">💰 Total Saved</p>
            <p className="text-emerald-800 font-bold text-xl font-display">
              {formatRupee(summary?.total_deposited ?? (user?.pension_vault ?? 0) + (user?.liquid_vault ?? 0))}
            </p>
          </div>
          <div className="bg-red-50 rounded-2xl border border-red-100 p-4">
            <p className="text-red-500 text-xs font-bold mb-1">💸 Total Withdrawn</p>
            <p className="text-red-700 font-bold text-xl font-display">
              {formatRupee(summary?.total_withdrawn ?? 0)}
            </p>
          </div>
        </div>
      )}

      <FilterTabs active={filter} onChange={setFilter} />

      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map((i) => <div key={i} className="shimmer rounded-2xl h-16" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-5xl mb-3">📭</p>
          <p className="text-slate-600 font-semibold">No transactions found</p>
          <p className="text-slate-400 text-sm mt-1">
            {filter === "All" ? "Make your first deposit to get started!" : `No ${filter.toLowerCase()} yet`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((t, i) => <TxnRow key={t._id || i} t={t} index={i} />)}
        </div>
      )}
    </div>
  );
}

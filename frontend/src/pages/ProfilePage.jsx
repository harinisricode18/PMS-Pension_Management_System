import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { formatRupee } from "../utils/helpers";

function InfoRow({ label, value, mono = false }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
      <p className="text-slate-500 text-sm">{label}</p>
      <p className={`text-slate-800 text-sm font-semibold ${mono ? "font-mono text-indigo-700" : ""}`}>{value || "—"}</p>
    </div>
  );
}

export default function ProfilePage() {
  const { user, pensionId, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-slate-800 font-display">Profile 👤</h1>
      </div>

      {/* Avatar card */}
      <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-3xl p-6 text-white text-center">
        <div className="w-20 h-20 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-3 text-4xl">
          {user?.name?.[0] || "?"}
        </div>
        <h2 className="text-xl font-bold font-display">{user?.name}</h2>
        <p className="font-mono text-indigo-200 text-sm mt-1">{pensionId}</p>
        <div className={`mt-3 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${user?.insurance_status === "ACTIVE" ? "bg-emerald-500/30 text-emerald-200" : "bg-amber-500/30 text-amber-200"}`}>
          {user?.insurance_status === "ACTIVE" ? "🛡️ Insurance Active" : "⚠️ Insurance Paused"}
        </div>
      </div>

      {/* Account info */}
      <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-card">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Account Info</p>
        <InfoRow label="Pension ID" value={pensionId} mono />
        <InfoRow label="Phone" value={user?.phone} />
        <InfoRow label="Nominee Phone" value={user?.nominee_phone} />
        <InfoRow label="Age" value={user?.currentAge ? `${user.currentAge} years` : null} />
        <InfoRow label="Account Status" value={user?.accountStatus || "Active"} />
      </div>

      {/* Vault summary */}
      <div className="bg-white rounded-3xl border border-slate-100 p-5 shadow-card">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Savings</p>
        <InfoRow label="Pension Vault 🔒" value={formatRupee(user?.pension_vault ?? 0)} />
        <InfoRow label="Liquid Vault 💧" value={formatRupee(user?.liquid_vault ?? 0)} />
        <InfoRow label="Total Savings" value={formatRupee((user?.pension_vault ?? 0) + (user?.liquid_vault ?? 0))} />
        <InfoRow label="Health Score" value={user?.pension_health_score ?? 0} />
      </div>

      {/* Logout */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={handleLogout}
        className="w-full border-2 border-red-200 text-red-500 font-bold py-4 rounded-2xl hover:bg-red-50 transition-all"
      >
        Sign Out
      </motion.button>
    </div>
  );
}

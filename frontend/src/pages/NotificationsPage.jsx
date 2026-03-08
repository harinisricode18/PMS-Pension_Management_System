import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import * as api from "../services/api";
import { formatRelativeTime } from "../utils/helpers";

const TYPE_META = {
  savings_target:   { emoji: "💰", color: "border-l-indigo-400",  bg: "bg-indigo-50"  },
  grace_mode:       { emoji: "🤝", color: "border-l-amber-400",   bg: "bg-amber-50"   },
  deposit:          { emoji: "✅", color: "border-l-emerald-400", bg: "bg-emerald-50" },
  withdrawal:       { emoji: "💸", color: "border-l-red-300",     bg: "bg-red-50"     },
  insurance_paused: { emoji: "⚠️", color: "border-l-amber-400",  bg: "bg-amber-50"   },
  income_verified:  { emoji: "📊", color: "border-l-blue-400",    bg: "bg-blue-50"    },
  otp_sent:         { emoji: "🔐", color: "border-l-purple-400",  bg: "bg-purple-50"  },
  agent_deposit:    { emoji: "🤝", color: "border-l-emerald-400", bg: "bg-emerald-50" },
  default:          { emoji: "🔔", color: "border-l-slate-300",   bg: "bg-slate-50"   },
};

function groupByDate(notifications) {
  const groups = {};
  notifications.forEach((n) => {
    const d = new Date(n.created_at || n.timestamp || n.date || Date.now());
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    let label;
    if (d.toDateString() === today.toDateString()) label = "Today";
    else if (d.toDateString() === yesterday.toDateString()) label = "Yesterday";
    else label = d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    if (!groups[label]) groups[label] = [];
    groups[label].push(n);
  });
  return groups;
}

function NotificationItem({ n, index }) {
  const type = n.type || n.notification_type || "default";
  const meta = TYPE_META[type] || TYPE_META.default;
  const isUnread = !n.read;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className={`flex items-start gap-3 p-4 rounded-2xl border-l-4 ${meta.color} ${meta.bg} ${isUnread ? "ring-1 ring-indigo-200" : ""}`}
    >
      <span className="text-xl flex-shrink-0 mt-0.5">{meta.emoji}</span>
      <div className="flex-1 min-w-0">
        {n.title && <p className={`text-sm font-bold ${isUnread ? "text-slate-800" : "text-slate-600"}`}>{n.title}</p>}
        <p className={`text-sm ${isUnread ? "text-slate-700" : "text-slate-500"} mt-0.5 line-clamp-2`}>
          {n.message || n.body || ""}
        </p>
        <p className="text-xs text-slate-400 mt-1">
          {formatRelativeTime(n.created_at || n.timestamp)}
        </p>
      </div>
      {isUnread && <div className="w-2 h-2 bg-indigo-500 rounded-full flex-shrink-0 mt-1.5" />}
    </motion.div>
  );
}

export default function NotificationsPage() {
  const { pensionId } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pensionId) return;
    api.getNotifications(pensionId).then((res) => {
      const arr = res?.notifications || res?.data || (Array.isArray(res) ? res : []);
      setNotifications(arr);
      setLoading(false);
    });
  }, [pensionId]);

  const groups = groupByDate(notifications);
  const unreadCount = notifications.filter((n) => !n.read).length;

  if (loading) return (
    <div className="space-y-3">
      <div className="shimmer rounded-2xl h-8 w-40" />
      {[1, 2, 3, 4].map((i) => <div key={i} className="shimmer rounded-2xl h-20" />)}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 font-display">Notifications 🔔</h1>
          {unreadCount > 0 && (
            <p className="text-indigo-600 text-sm font-semibold mt-0.5">{unreadCount} unread</p>
          )}
        </div>
      </div>

      {notifications.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16"
        >
          <span className="text-6xl block mb-4">🎉</span>
          <p className="text-slate-700 font-bold text-lg font-display">You're all caught up!</p>
          <p className="text-slate-400 text-sm mt-2">No notifications yet. Start saving to see updates here.</p>
        </motion.div>
      ) : (
        Object.entries(groups).map(([label, items]) => (
          <div key={label}>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{label}</p>
            <div className="space-y-2">
              {items.map((n, i) => (
                <NotificationItem key={n._id || i} n={n} index={i} />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

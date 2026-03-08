/**
 * context/NotificationContext.jsx
 * ─────────────────────────────────────────────────────────────
 * Global notification state.
 * Combines:
 *   - In-app toast queue (UI overlays)
 *   - Inbox notifications from GET /notifications
 *   - Real-time WebSocket push events
 *
 * Provides: { toasts, inbox, unreadCount, addToast, loadInbox }
 * ─────────────────────────────────────────────────────────────
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { useAuth } from "./AuthContext";
import * as api from "../services/api";

const NotificationContext = createContext(null);

let toastId = 0;

export function NotificationProvider({ children }) {
  const { pensionId, isAuthenticated } = useAuth();
  const [toasts, setToasts]   = useState([]);  // { id, type, title, message }
  const [inbox, setInbox]     = useState([]);   // raw API notification objects
  const wsRef                 = useRef(null);

  // ── Toast queue ────────────────────────────────────────────────────────────
  const addToast = useCallback(({ type = "info", title, message, duration = 4000 }) => {
    const id = ++toastId;
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
  }, []);

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Inbox ──────────────────────────────────────────────────────────────────
  const loadInbox = useCallback(async () => {
    if (!pensionId) return;
    const res = await api.getNotifications(pensionId);
    if (res.success && Array.isArray(res.notifications)) {
      setInbox(res.notifications);
    }
  }, [pensionId]);

  const unreadCount = inbox.filter((n) => !n.read).length;

  // ── WebSocket ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated || !pensionId) return;

    const ws = api.createWebSocket(pensionId, (data) => {
      const { event, payload } = data;

      switch (event) {
        case "GUARDIAN_ALERT":
          if (payload.grace_mode) {
            addToast({ type: "warning", title: "Grace Mode Active", message: payload.message });
          } else {
            addToast({ type: "info", title: "Daily Target", message: payload.message });
          }
          break;

        case "DEPOSIT_CONFIRMED":
          addToast({
            type: "success",
            title: "Deposit Confirmed! 🎉",
            message: `₹${payload.amount} added — ₹${payload.vault_split?.pension} to pension, ₹${payload.vault_split?.liquid} liquid.`,
            duration: 6000,
          });
          break;

        case "WITHDRAWAL_OTP":
          addToast({
            type: "warning",
            title: "OTP Sent to Nominee",
            message: "Ask your nominee to check their phone.",
            duration: 8000,
          });
          break;

        case "INSURANCE_PAUSED":
          addToast({
            type: "error",
            title: "Insurance Paused ⚠️",
            message: `Health score dropped to ${payload.health_score}. Keep saving to reactivate.`,
            duration: 8000,
          });
          break;

        default:
          break;
      }

      // Refresh inbox on any push
      loadInbox();
    });

    wsRef.current = ws;
    return () => ws.close();
  }, [isAuthenticated, pensionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initial inbox load
  useEffect(() => {
    if (isAuthenticated) loadInbox();
  }, [isAuthenticated, loadInbox]);

  return (
    <NotificationContext.Provider
      value={{ toasts, inbox, unreadCount, addToast, dismissToast, loadInbox }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider");
  return ctx;
};

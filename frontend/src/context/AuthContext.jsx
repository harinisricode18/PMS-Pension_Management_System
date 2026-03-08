/**
 * context/AuthContext.jsx
 * ─────────────────────────────────────────────────────────────
 * Global authentication state.
 * Provides: { user, token, pensionId, login, logout, isLoading }
 *
 * On mount, restores session from localStorage so the worker
 * doesn't have to log in again after closing the app.
 * ─────────────────────────────────────────────────────────────
 */

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import * as api from "../services/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken]       = useState(() => api.getToken());
  const [pensionId, setPId]     = useState(() => api.getPensionId());
  const [user, setUser]         = useState(null);
  const [isLoading, setLoading] = useState(!!api.getToken()); // true if restoring session

  // Restore session on mount
  useEffect(() => {
    if (!token || !pensionId) {
      setLoading(false);
      return;
    }
    api.getUserProfile(pensionId).then((res) => {
      if (res.success) setUser(res.data);
      else handleLogout(); // token expired or invalid
      setLoading(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleLogin = useCallback(async (credentials) => {
    const res = await api.login(credentials);
    if (!res.success) return res;

    api.setToken(res.token);
    api.setPensionId(res.pensionId);
    setToken(res.token);
    setPId(res.pensionId);

    const profile = await api.getUserProfile(res.pensionId);
    if (profile.success) setUser(profile.data);

    return { success: true };
  }, []);

  const handleLogout = useCallback(() => {
    api.clearToken();
    api.clearPensionId();
    setToken(null);
    setPId(null);
    setUser(null);
  }, []);

  // Called after deposit/withdrawal to refresh vault balances
  const refreshUser = useCallback(async () => {
    if (!pensionId) return;
    const res = await api.getUserProfile(pensionId);
    if (res.success) setUser(res.data);
  }, [pensionId]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        pensionId,
        isLoading,
        isAuthenticated: !!token,
        login: handleLogin,
        logout: handleLogout,
        refreshUser,
        setUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

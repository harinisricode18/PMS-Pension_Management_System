/**
 * hooks/index.js
 * ─────────────────────────────────────────────────────────────
 * Custom React hooks for PMS data fetching and business logic.
 * Each hook encapsulates one data domain.
 * ─────────────────────────────────────────────────────────────
 */

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationContext";
import * as api from "../services/api";


// ════════════════════════════════════════════════════════════════
// useUserProfile — fetches and caches the worker's full profile
// Returns: { user, loading, error, refresh }
// ════════════════════════════════════════════════════════════════

export function useUserProfile() {
  const { pensionId, user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(!user);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (user) { setLoading(false); return; }
    if (!pensionId) return;
    setLoading(true);
    api.getUserProfile(pensionId).then((res) => {
      if (!res.success) setError(res.error);
      setLoading(false);
    });
  }, [pensionId, user]);

  return { user, loading, error, refresh: refreshUser };
}


// ════════════════════════════════════════════════════════════════
// useSavingsTarget — loads today's EMA-computed target
// Returns: { target, alpha, loading, refresh }
// ════════════════════════════════════════════════════════════════

export function useSavingsTarget() {
  const { pensionId } = useAuth();
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!pensionId) return;
    setLoading(true);
    const res = await api.getSavingsTarget(pensionId);
    if (res.success !== false) setData(res);
    setLoading(false);
  }, [pensionId]);

  useEffect(() => { fetch(); }, [fetch]);

  return {
    target: data?.safe_savings_target ?? 0,
    alpha:  data?.alpha ?? null,
    raw:    data,
    loading,
    refresh: fetch,
  };
}


// ════════════════════════════════════════════════════════════════
// useDeposit — handles deposit flow + vault split animation
// ════════════════════════════════════════════════════════════════

export function useDeposit() {
  const { refreshUser } = useAuth();
  const { addToast } = useNotifications();
  const [loading, setLoading]     = useState(false);
  const [result, setResult]       = useState(null);   // last deposit result
  const [error, setError]         = useState(null);

  const executeDeposit = useCallback(async (amount) => {
    setLoading(true);
    setError(null);
    const res = await api.deposit({ amount });
    setLoading(false);

    if (!res.success) {
      setError(res.error);
      addToast({ type: "error", title: "Deposit Failed", message: res.error });
      return null;
    }

    setResult(res);
    await refreshUser();
    return res;
  }, [refreshUser, addToast]);

  return { executeDeposit, loading, result, error };
}


// ════════════════════════════════════════════════════════════════
// useWithdrawal — handles dual-key flow
// ════════════════════════════════════════════════════════════════

export function useWithdrawal() {
  const { refreshUser } = useAuth();
  const { addToast } = useNotifications();

  const [step, setStep]   = useState("input");  // input | otp | success
  const [requestId, setRequestId] = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [result, setResult]       = useState(null);

  const initiateWithdraw = useCallback(async (amount) => {
    setLoading(true);
    setError(null);
    const res = await api.initiateWithdrawal({ amount });
    setLoading(false);

    if (!res.success) {
      setError(res.error);
      return;
    }

    if (res.approved) {
      setResult(res);
      setStep("success");
      await refreshUser();
      addToast({ type: "success", title: "Withdrawal Successful", message: `₹${amount} transferred.` });
    } else if (res.dual_key_required) {
      setRequestId(res.request_id);
      setStep("otp");
      addToast({ type: "info", title: "OTP Sent", message: "Your nominee will receive an OTP." });
    }
  }, [refreshUser, addToast]);

  const verifyOTP = useCallback(async (otp) => {
    if (!requestId) return;
    setLoading(true);
    setError(null);
    const res = await api.verifyWithdrawalOTP({ request_id: requestId, otp_entered: otp });
    setLoading(false);

    if (!res.success) { setError(res.error); return; }

    if (res.approved) {
      setResult(res);
      setStep("success");
      await refreshUser();
    } else {
      setError(res.message || "OTP verification failed.");
    }
  }, [requestId, refreshUser]);

  const reset = useCallback(() => {
    setStep("input");
    setRequestId(null);
    setError(null);
    setResult(null);
  }, []);

  return { step, requestId, loading, error, result, initiateWithdraw, verifyOTP, reset };
}


// ════════════════════════════════════════════════════════════════
// useGuardianStatus — loads today's guardian evaluation
// ════════════════════════════════════════════════════════════════

export function useGuardianStatus() {
  const { pensionId } = useAuth();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    if (!pensionId) return;
    setLoading(true);
    const res = await api.getGuardianStatus(pensionId);
    if (res.success !== false) setData(res);
    setLoading(false);
  }, [pensionId]);

  useEffect(() => { fetch(); }, [fetch]);

  return {
    state:          data?.state ?? null,
    graceMode:      data?.grace_mode ?? false,
    targetAmount:   data?.user_facing_target ?? 0,
    message:        data?.message ?? "",
    loading,
    refresh: fetch,
  };
}


// ════════════════════════════════════════════════════════════════
// useHealthScore — loads and caches PHS
// ════════════════════════════════════════════════════════════════

export function useHealthScore() {
  const { pensionId } = useAuth();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!pensionId) return;
    api.getHealthScore(pensionId).then((res) => {
      if (res.success !== false) setData(res);
      setLoading(false);
    });
  }, [pensionId]);

  return {
    score:           data?.health_score ?? 0,
    insuranceStatus: data?.insurance_status ?? "PAUSED",
    breakdown:       data?.component_breakdown ?? {},
    loading,
  };
}


// ════════════════════════════════════════════════════════════════
// useTransactions — paginated transaction history
// ════════════════════════════════════════════════════════════════

export function useTransactions() {
  const { pensionId } = useAuth();
  const [transactions, setTxns] = useState([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    if (!pensionId) return;
    api.getTransactions(pensionId).then((res) => {
      if (Array.isArray(res.transactions)) setTxns(res.transactions);
      else if (Array.isArray(res)) setTxns(res);
      setLoading(false);
    });
  }, [pensionId]);

  return { transactions, loading };
}


// ════════════════════════════════════════════════════════════════
// useRetirementProjection — fetches retirement projection
// ════════════════════════════════════════════════════════════════

export function useRetirementProjection() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getRetirementProjection().then((res) => {
      if (res.success) setData(res);
      setLoading(false);
    });
  }, []);

  return {
    monthlyPension:      data?.estimated_monthly_pension ?? 0,
    corpus:              data?.projected_retirement_corpus ?? 0,
    yearsRemaining:      data?.years_remaining ?? 0,
    annualReturn:        data?.annual_return_assumed ?? 0.08,
    loading,
  };
}


// ════════════════════════════════════════════════════════════════
// useCashToken — agent cash deposit flow
// ════════════════════════════════════════════════════════════════

export function useCashToken() {
  const [token, setToken]     = useState(null);
  const [expiry, setExpiry]   = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState(null);

  const generateToken = useCallback(async (amount) => {
    setLoading(true);
    setError(null);
    const res = await api.generateCashToken({ amount });
    setLoading(false);

    if (!res.success) { setError(res.error); return; }

    setToken(res.token_id);
    setExpiry(new Date(res.expires_at));
  }, []);

  const reset = useCallback(() => {
    setToken(null);
    setExpiry(null);
    setError(null);
  }, []);

  return { token, expiry, loading, error, generateToken, reset };
}

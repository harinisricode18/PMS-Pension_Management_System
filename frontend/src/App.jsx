import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { NotificationProvider } from "./context/NotificationContext";
import { lazy, Suspense } from "react";
import { AppLayout } from "./layouts/AppLayout";

const LoginPage         = lazy(() => import("./pages/LoginPage"));
const RegisterPage      = lazy(() => import("./pages/RegisterPage"));
const DashboardPage     = lazy(() => import("./pages/DashboardPage"));
const DepositPage       = lazy(() => import("./pages/DepositPage"));
const IncomePage        = lazy(() => import("./pages/IncomePage"));
const WithdrawPage      = lazy(() => import("./pages/WithdrawPage"));
const TransactionsPage  = lazy(() => import("./pages/TransactionsPage"));
const GuardianPage      = lazy(() => import("./pages/GuardianPage"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const ProfilePage       = lazy(() => import("./pages/ProfilePage"));

// PUBLIC — no auth required
const PayerPage         = lazy(() => import("./pages/PayerPage"));

function LoadingFull() {
  return (
    <div style={{ position:"fixed",inset:0,background:"#f8fafc",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,fontFamily:"Nunito,sans-serif" }}>
      <div style={{ width:40,height:40,border:"4px solid #e0e7ff",borderTopColor:"#4f46e5",borderRadius:"50%",animation:"spin 0.8s linear infinite" }} />
      <p style={{ color:"#94a3b8",fontSize:14,fontWeight:600 }}>Loading…</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <LoadingFull />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function PublicRoute({ children }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <LoadingFull />;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Suspense fallback={<LoadingFull />}>
      <Routes>
        {/* ── Public routes (no login) ── */}
        <Route path="/login"    element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/register" element={<PublicRoute><RegisterPage /></PublicRoute>} />

        {/* 
          /pay/:tokenId — Payer's payment page.
          Fully public — no auth, no redirect.
          Opened when payer scans the worker's QR code.
          Matches schema: tokens.token_type = "payer_verify"
          Calls POST /confirm-payment (no JWT required per schema design notes)
        */}
        <Route path="/pay/:tokenId" element={<PayerPage />} />

        {/* ── Protected routes ── */}
        <Route path="/dashboard"     element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/deposit"       element={<ProtectedRoute><DepositPage /></ProtectedRoute>} />
        <Route path="/income"        element={<ProtectedRoute><IncomePage /></ProtectedRoute>} />
        <Route path="/withdraw"      element={<ProtectedRoute><WithdrawPage /></ProtectedRoute>} />
        <Route path="/transactions"  element={<ProtectedRoute><TransactionsPage /></ProtectedRoute>} />
        <Route path="/guardian"      element={<ProtectedRoute><GuardianPage /></ProtectedRoute>} />
        <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
        <Route path="/profile"       element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />

        <Route path="/"  element={<Navigate to="/dashboard" replace />} />
        <Route path="*"  element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <div style={{ minHeight:"100vh",background:"#f8fafc",fontFamily:"'Nunito',sans-serif",color:"#1e293b" }}>
      <BrowserRouter>
        <AuthProvider>
          <NotificationProvider>
            <AppRoutes />
          </NotificationProvider>
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}

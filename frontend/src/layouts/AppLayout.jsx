/**
 * layouts/AppLayout.jsx — Desktop website layout
 * Pure inline styles. Zero Tailwind.
 */

import { Link, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationContext";
import { NotificationToast } from "../components/ui";

const C = {
  indigo700:"#4338ca", indigo600:"#4f46e5", indigo50:"#eef2ff", indigo100:"#e0e7ff",
  slate800:"#1e293b", slate700:"#334155", slate500:"#64748b", slate400:"#94a3b8",
  slate200:"#e2e8f0", slate100:"#f1f5f9", slate50:"#f8fafc", white:"#ffffff",
  red500:"#ef4444",
};

const NAV = [
  { path:"/dashboard",    label:"Dashboard",    emoji:"🏠" },
  { path:"/deposit",      label:"Save",         emoji:"💰" },
  { path:"/income",       label:"Income",       emoji:"📈" },
  { path:"/transactions", label:"Transactions", emoji:"📋" },
  { path:"/profile",      label:"Profile",      emoji:"👤" },
];

export function AppLayout({ children }) {
  const { user, logout } = useAuth();
  const { toasts, dismissToast, unreadCount } = useNotifications();
  const { pathname } = useLocation();
  const firstName = user?.name?.split(" ")[0] || "Friend";

  return (
    <div style={{ minHeight:"100vh", background:C.slate50, fontFamily:"Nunito,sans-serif", color:C.slate800 }}>

      {/* ── Top Navigation Bar ── */}
      <header style={{
        position:"sticky", top:0, zIndex:50,
        background:"rgba(255,255,255,0.97)",
        backdropFilter:"blur(12px)",
        borderBottom:`1px solid ${C.slate100}`,
        boxShadow:"0 1px 0 0 #f1f5f9, 0 2px 8px -2px rgba(0,0,0,0.04)",
      }}>
        <div style={{
          maxWidth:1200, margin:"0 auto",
          padding:"0 32px",
          height:64,
          display:"flex", alignItems:"center", gap:0,
        }}>
          {/* Logo */}
          <Link to="/dashboard" style={{ display:"flex",alignItems:"center",gap:10,textDecoration:"none",marginRight:40,flexShrink:0 }}>
            <div style={{ width:36,height:36,borderRadius:10,background:"linear-gradient(135deg,#4f46e5,#818cf8)",display:"flex",alignItems:"center",justifyContent:"center" }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M10 2L17 5.5v6c0 4.2-3 7.5-7 8.5-4-1-7-4.3-7-8.5v-6L10 2z" fill="white" fillOpacity="0.9"/>
                <path d="M7 10l2.5 2.5 4-4" stroke="#4f46e5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize:16,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.slate800,lineHeight:1.1 }}>PMS</div>
              <div style={{ fontSize:9,fontWeight:700,color:C.slate400,textTransform:"uppercase",letterSpacing:"0.08em" }}>Pension System</div>
            </div>
          </Link>

          {/* Nav links */}
          <nav style={{ display:"flex",alignItems:"center",gap:4,flex:1 }}>
            {NAV.map(({ path,label,emoji }) => {
              const active = pathname===path || (path!=="/dashboard" && pathname.startsWith(path));
              return (
                <Link key={path} to={path} style={{
                  display:"flex", alignItems:"center", gap:6,
                  padding:"8px 14px", borderRadius:10,
                  fontSize:14, fontWeight:active?700:600,
                  color: active ? C.indigo600 : C.slate500,
                  background: active ? C.indigo50 : "transparent",
                  textDecoration:"none",
                  transition:"all 0.15s",
                  position:"relative",
                }}>
                  <span style={{ fontSize:15 }}>{emoji}</span>
                  {label}
                  {active && (
                    <motion.div layoutId="nav-underline"
                      style={{ position:"absolute",bottom:-17,left:8,right:8,height:2,borderRadius:99,background:C.indigo600 }} />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Right section */}
          <div style={{ display:"flex",alignItems:"center",gap:10,marginLeft:"auto",flexShrink:0 }}>
            {/* Guardian */}
            <Link to="/guardian" style={{ width:36,height:36,borderRadius:10,background:C.indigo50,border:`1px solid ${C.indigo100}`,display:"flex",alignItems:"center",justifyContent:"center",textDecoration:"none",fontSize:16 }}>🛡️</Link>

            {/* Notifications */}
            <Link to="/notifications" style={{ position:"relative",width:36,height:36,borderRadius:10,background:C.slate50,border:`1px solid ${C.slate100}`,display:"flex",alignItems:"center",justifyContent:"center",textDecoration:"none",fontSize:16 }}>
              🔔
              {unreadCount>0 && (
                <span style={{ position:"absolute",top:-4,right:-4,background:C.red500,color:C.white,fontSize:9,fontWeight:800,minWidth:16,height:16,borderRadius:99,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 3px" }}>
                  {unreadCount>9?"9+":unreadCount}
                </span>
              )}
            </Link>

            {/* User avatar */}
            <div style={{ display:"flex",alignItems:"center",gap:8,padding:"4px 12px 4px 6px",borderRadius:10,background:C.slate50,border:`1px solid ${C.slate100}`,cursor:"default" }}>
              <div style={{ width:28,height:28,borderRadius:8,background:"linear-gradient(135deg,#4f46e5,#818cf8)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:"white",fontFamily:"Sora,sans-serif" }}>
                {firstName[0]?.toUpperCase()}
              </div>
              <span style={{ fontSize:13,fontWeight:700,color:C.slate700 }}>{firstName}</span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Page content ── */}
      <main style={{ maxWidth:1200, margin:"0 auto", padding:"28px 32px" }}>
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity:0, y:10 }}
            animate={{ opacity:1, y:0 }}
            exit={{ opacity:0, y:-6 }}
            transition={{ duration:0.18, ease:"easeOut" }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── Toasts ── */}
      <div style={{ position:"fixed",top:76,right:24,zIndex:200,display:"flex",flexDirection:"column",gap:8,maxWidth:320 }}>
        <AnimatePresence>
          {toasts.map(t => <NotificationToast key={t.id} toast={t} onDismiss={dismissToast} />)}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** AuthLayout — centered card for Login/Register */
export function AuthLayout({ children }) {
  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#312e81 0%,#4338ca 45%,#818cf8 100%)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:24, fontFamily:"Nunito,sans-serif" }}>
      {/* Decorative blobs */}
      <div style={{ position:"absolute",top:0,left:0,width:300,height:300,borderRadius:"50%",background:"rgba(255,255,255,0.05)",transform:"translate(-40%,-40%)",pointerEvents:"none" }} />
      <div style={{ position:"absolute",bottom:0,right:0,width:200,height:200,borderRadius:"50%",background:"rgba(255,255,255,0.05)",transform:"translate(30%,30%)",pointerEvents:"none" }} />

      <motion.div initial={{ y:40,opacity:0 }} animate={{ y:0,opacity:1 }} transition={{ duration:0.4,ease:[0.22,1,0.36,1] }}
        style={{ background:"white",borderRadius:28,boxShadow:"0 32px 80px rgba(0,0,0,0.2)",padding:"44px 48px",width:"100%",maxWidth:480,position:"relative" }}>
        {children}
      </motion.div>
    </div>
  );
}

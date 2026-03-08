/**
 * LoginPage.jsx — Desktop card layout, pure inline styles.
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";

const C = {
  indigo600:"#4f46e5", indigo50:"#eef2ff",
  slate800:"#1e293b", slate700:"#334155", slate500:"#64748b", slate400:"#94a3b8",
  slate200:"#e2e8f0", slate100:"#f1f5f9", slate50:"#f8fafc",
  red600:"#dc2626", red50:"#fef2f2", red100:"#fee2e2",
  white:"#ffffff",
};

const inputStyle = {
  width:"100%", border:`1.5px solid ${C.slate200}`, borderRadius:12,
  background:C.slate50, padding:"13px 16px", fontSize:15, fontWeight:600,
  color:C.slate800, fontFamily:"Nunito,sans-serif", outline:"none",
  transition:"border-color 0.15s, background 0.15s",
  boxSizing:"border-box",
};

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom:18 }}>
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6 }}>
        <label style={{ fontSize:13,fontWeight:700,color:C.slate700 }}>{label}</label>
        {hint && <span style={{ fontSize:11,color:C.slate400 }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ name:"", pension_id:"", password:"" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setLoading(true);
    const res = await login(form);
    setLoading(false);
    if (!res.success) {
      setError(typeof res.error==="string" ? res.error : res.error?.detail?.[0]?.msg || "Invalid credentials.");
    } else navigate("/dashboard");
  };

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#312e81 0%,#4338ca 45%,#818cf8 100%)", display:"flex", alignItems:"center", justifyContent:"center", padding:24, fontFamily:"Nunito,sans-serif" }}>

      {/* Decorative blobs */}
      <div style={{ position:"fixed",top:0,left:0,width:350,height:350,borderRadius:"50%",background:"rgba(255,255,255,0.05)",transform:"translate(-40%,-40%)",pointerEvents:"none" }} />
      <div style={{ position:"fixed",bottom:0,right:0,width:250,height:250,borderRadius:"50%",background:"rgba(255,255,255,0.05)",transform:"translate(30%,30%)",pointerEvents:"none" }} />

      <div style={{ display:"flex",gap:64,alignItems:"center",width:"100%",maxWidth:960,position:"relative",zIndex:1 }}>

        {/* Left: branding */}
        <motion.div initial={{ opacity:0,x:-30 }} animate={{ opacity:1,x:0 }} transition={{ duration:0.4 }}
          style={{ flex:1,color:"white" }}>
          <div style={{ display:"flex",alignItems:"center",gap:14,marginBottom:32 }}>
            <div style={{ width:56,height:56,borderRadius:16,background:"rgba(255,255,255,0.2)",border:"1px solid rgba(255,255,255,0.3)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 8px 24px -4px rgba(0,0,0,0.2)" }}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path d="M14 2L23 6.5v8c0 5.6-4 10.5-9 12-5-1.5-9-6.4-9-12v-8L14 2z" fill="white" fillOpacity="0.9"/>
                <path d="M10 14l3 3 5.5-5.5" stroke="#4338ca" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <div style={{ fontSize:28,fontWeight:800,fontFamily:"Sora,sans-serif",lineHeight:1 }}>PMS</div>
              <div style={{ fontSize:12,color:"rgba(165,180,252,0.8)",fontWeight:600,marginTop:2 }}>Pension Management System</div>
            </div>
          </div>
          <h1 style={{ fontSize:36,fontWeight:800,fontFamily:"Sora,sans-serif",lineHeight:1.2,margin:"0 0 16px" }}>
            Secure your<br />retirement today
          </h1>
          <p style={{ fontSize:15,color:"rgba(199,210,254,0.85)",lineHeight:1.7,maxWidth:380 }}>
            Track your pension savings, record daily income, and manage your financial future — all in one place.
          </p>
          <div style={{ display:"flex",flexDirection:"column",gap:10,marginTop:28 }}>
            {[["🔒","80% locked pension vault for retirement"],["💧","20% liquid fund for emergencies"],["🛡️","Guardian system protects your savings"]].map(([emoji,text])=>(
              <div key={text} style={{ display:"flex",alignItems:"center",gap:10,fontSize:14,color:"rgba(199,210,254,0.85)",fontWeight:600 }}>
                <span style={{ fontSize:18 }}>{emoji}</span>{text}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Right: form card */}
        <motion.div initial={{ opacity:0,y:32 }} animate={{ opacity:1,y:0 }} transition={{ duration:0.45,ease:[0.22,1,0.36,1] }}
          style={{ background:C.white,borderRadius:24,boxShadow:"0 32px 80px rgba(0,0,0,0.22)",padding:"40px 44px",width:"100%",maxWidth:440,flexShrink:0 }}>

          <div style={{ marginBottom:28 }}>
            <h2 style={{ fontSize:24,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.slate800,margin:0 }}>Welcome back</h2>
            <p style={{ fontSize:14,color:C.slate400,marginTop:4 }}>Sign in to your pension account</p>
          </div>

          {error && (
            <motion.div initial={{ opacity:0,y:-8 }} animate={{ opacity:1,y:0 }}
              style={{ background:C.red50,border:`1px solid ${C.red100}`,borderRadius:12,padding:"12px 16px",fontSize:13,color:C.red600,marginBottom:20,display:"flex",alignItems:"center",gap:8 }}>
              ⚠️ {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit}>
            <Field label="Full Name">
              <input value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Ramu Kumar" required autoComplete="name" style={inputStyle} />
            </Field>
            <Field label="Pension ID" hint="Format: PP-XXXXXXXX">
              <input value={form.pension_id} onChange={e=>setForm(p=>({...p,pension_id:e.target.value.toUpperCase()}))} placeholder="PP-ABC12345" required style={{ ...inputStyle,fontFamily:"'JetBrains Mono',monospace",letterSpacing:"0.08em",textTransform:"uppercase" }} />
            </Field>
            <Field label="Password">
              <div style={{ position:"relative" }}>
                <input type={showPass?"text":"password"} value={form.password} onChange={e=>setForm(p=>({...p,password:e.target.value}))} placeholder="Your password" required autoComplete="current-password" style={{ ...inputStyle,paddingRight:48 }} />
                <button type="button" onClick={()=>setShowPass(!showPass)}
                  style={{ position:"absolute",right:14,top:"50%",transform:"translateY(-50%)",background:"transparent",border:"none",cursor:"pointer",fontSize:16,color:C.slate400,padding:0 }}>
                  {showPass?"🙈":"👁️"}
                </button>
              </div>
            </Field>

            <motion.button whileTap={{ scale:0.97 }} type="submit" disabled={loading}
              style={{ width:"100%",background:"linear-gradient(135deg,#4f46e5,#6366f1)",color:C.white,fontSize:16,fontWeight:800,padding:"14px 24px",borderRadius:14,border:"none",cursor:loading?"wait":"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 8px 24px -4px rgba(79,70,229,0.45)",opacity:loading?0.7:1,fontFamily:"Nunito,sans-serif",marginTop:8 }}>
              {loading ? <><span style={{ width:18,height:18,border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"white",borderRadius:"50%",animation:"spin 0.8s linear infinite",display:"inline-block" }} /> Signing in…</> : "Sign In →"}
            </motion.button>
          </form>

          <p style={{ textAlign:"center",fontSize:13,color:C.slate400,marginTop:20 }}>
            New worker?{" "}
            <Link to="/register" style={{ color:C.indigo600,fontWeight:800,textDecoration:"none" }}>Create Account →</Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}

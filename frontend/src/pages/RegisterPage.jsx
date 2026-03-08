/**
 * RegisterPage.jsx — Desktop layout, pure inline styles.
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import * as api from "../services/api";

const DAYS = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"];
const DAY_SHORT = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

const C = {
  indigo600:"#4f46e5", indigo50:"#eef2ff", indigo100:"#e0e7ff",
  slate800:"#1e293b", slate700:"#334155", slate600:"#475569",
  slate500:"#64748b", slate400:"#94a3b8", slate200:"#e2e8f0", slate100:"#f1f5f9", slate50:"#f8fafc",
  red600:"#dc2626", red50:"#fef2f2", red100:"#fee2e2",
  emerald600:"#059669", emerald50:"#ecfdf5",
  white:"#ffffff",
};
const inputStyle = {
  width:"100%", border:`1.5px solid ${C.slate200}`, borderRadius:12, background:C.slate50,
  padding:"12px 16px", fontSize:14, fontWeight:600, color:C.slate800,
  fontFamily:"Nunito,sans-serif", outline:"none", boxSizing:"border-box",
};

export default function RegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pensionId, setPensionId] = useState("");
  const [form, setForm] = useState({ name:"",phone:"",date_of_birth:"",password:"",confirm_password:"",nominee_phone:"",survival_minimum:"150",rest_days:[] });

  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  const toggleDay = d => setForm(p=>({ ...p, rest_days: p.rest_days.includes(d)?p.rest_days.filter(x=>x!==d):[...p.rest_days,d] }));

  const nextStep = e => {
    e.preventDefault();
    if (form.password!==form.confirm_password){ setError("Passwords don't match"); return; }
    if (form.password.length<6){ setError("Password must be at least 6 characters"); return; }
    setError(""); setStep(2);
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true); setError("");
    const res = await api.register({ name:form.name,phone:form.phone,date_of_birth:form.date_of_birth,password:form.password,nominee_phone:form.nominee_phone,survival_minimum:parseFloat(form.survival_minimum)||150,rest_days:form.rest_days });
    setLoading(false);
    if (!res.success){ setError(res.error||"Registration failed."); return; }
    setPensionId(res.pensionId); setStep(3);
  };

  const btnStyle = { background:"linear-gradient(135deg,#4f46e5,#6366f1)", color:C.white, fontSize:15, fontWeight:800, padding:"13px 24px", borderRadius:12, border:"none", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:8, boxShadow:"0 8px 24px -4px rgba(79,70,229,0.45)", fontFamily:"Nunito,sans-serif" };

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#312e81 0%,#4338ca 45%,#818cf8 100%)", display:"flex", alignItems:"center", justifyContent:"center", padding:24, fontFamily:"Nunito,sans-serif" }}>
      <div style={{ position:"fixed",top:0,left:0,width:350,height:350,borderRadius:"50%",background:"rgba(255,255,255,0.05)",transform:"translate(-40%,-40%)",pointerEvents:"none" }} />

      <div style={{ display:"flex",gap:56,alignItems:"flex-start",width:"100%",maxWidth:960,position:"relative",zIndex:1 }}>

        {/* Left branding */}
        <motion.div initial={{ opacity:0,x:-30 }} animate={{ opacity:1,x:0 }} style={{ flex:1,color:"white",paddingTop:20 }}>
          <div style={{ fontSize:28,fontWeight:800,fontFamily:"Sora,sans-serif",marginBottom:12 }}>Join PMS</div>
          <p style={{ fontSize:15,color:"rgba(199,210,254,0.85)",lineHeight:1.7,maxWidth:360 }}>
            Create your pension account in 2 simple steps. Start building your retirement fund today.
          </p>
          {/* Step indicators */}
          <div style={{ marginTop:32,display:"flex",flexDirection:"column",gap:16 }}>
            {[{ s:1,title:"Personal Details",sub:"Name, phone, and password" },{ s:2,title:"Preferences",sub:"Rest days and nominee" }].map(({ s,title,sub })=>(
              <div key={s} style={{ display:"flex",alignItems:"center",gap:12 }}>
                <div style={{ width:32,height:32,borderRadius:"50%",background:step>=s?"rgba(255,255,255,0.9)":"rgba(255,255,255,0.15)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                  {step>s ? <span style={{ fontSize:16 }}>✓</span> :
                    <span style={{ fontSize:14,fontWeight:800,color:step===s?C.indigo600:"rgba(255,255,255,0.5)" }}>{s}</span>}
                </div>
                <div>
                  <div style={{ fontSize:14,fontWeight:700,color:step>=s?"white":"rgba(255,255,255,0.4)" }}>{title}</div>
                  <div style={{ fontSize:12,color:"rgba(199,210,254,0.65)" }}>{sub}</div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Right form card */}
        <motion.div initial={{ opacity:0,y:32 }} animate={{ opacity:1,y:0 }} transition={{ duration:0.4,ease:[0.22,1,0.36,1] }}
          style={{ background:C.white,borderRadius:24,boxShadow:"0 32px 80px rgba(0,0,0,0.22)",padding:"40px 44px",width:"100%",maxWidth:480,flexShrink:0 }}>

          {step<3 && (
            <div style={{ marginBottom:28 }}>
              <div style={{ display:"flex",gap:6,marginBottom:12 }}>
                {[1,2].map(s=>(
                  <div key={s} style={{ flex:1,height:4,borderRadius:99,background:s<=step?C.indigo600:C.slate200,transition:"background 0.3s" }} />
                ))}
              </div>
              <div style={{ fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:C.slate400 }}>
                Step {step} of 2 — {step===1?"Personal Details":"Preferences"}
              </div>
            </div>
          )}

          {error && (
            <div style={{ background:C.red50,border:`1px solid ${C.red100}`,borderRadius:12,padding:"12px 16px",fontSize:13,color:C.red600,marginBottom:18,display:"flex",alignItems:"center",gap:8 }}>
              ⚠️ {error}
            </div>
          )}

          <AnimatePresence mode="wait">
            {step===1 && (
              <motion.form key="s1" initial={{ opacity:0,x:20 }} animate={{ opacity:1,x:0 }} exit={{ opacity:0,x:-20 }} transition={{ duration:0.2 }} onSubmit={nextStep}>
                <h2 style={{ fontSize:20,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.slate800,marginBottom:20 }}>Personal Details</h2>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }}>
                  <div style={{ gridColumn:"1/-1" }}>
                    <label style={{ fontSize:13,fontWeight:700,color:C.slate700,display:"block",marginBottom:6 }}>Full Name *</label>
                    <input value={form.name} onChange={e=>set("name",e.target.value)} placeholder="e.g. Ramu Kumar" required style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize:13,fontWeight:700,color:C.slate700,display:"block",marginBottom:6 }}>Phone *</label>
                    <input type="tel" inputMode="numeric" value={form.phone} onChange={e=>set("phone",e.target.value)} placeholder="10-digit number" required style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize:13,fontWeight:700,color:C.slate700,display:"block",marginBottom:6 }}>Date of Birth *</label>
                    <input type="date" value={form.date_of_birth} onChange={e=>set("date_of_birth",e.target.value)} required style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize:13,fontWeight:700,color:C.slate700,display:"block",marginBottom:6 }}>Password *</label>
                    <input type="password" value={form.password} onChange={e=>set("password",e.target.value)} placeholder="Min 6 characters" required style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ fontSize:13,fontWeight:700,color:C.slate700,display:"block",marginBottom:6 }}>Confirm Password *</label>
                    <input type="password" value={form.confirm_password} onChange={e=>set("confirm_password",e.target.value)} placeholder="Repeat password" required style={inputStyle} />
                  </div>
                </div>
                <button type="submit" style={{ ...btnStyle,width:"100%",marginTop:20 }}>Next →</button>
              </motion.form>
            )}

            {step===2 && (
              <motion.form key="s2" initial={{ opacity:0,x:20 }} animate={{ opacity:1,x:0 }} exit={{ opacity:0,x:-20 }} transition={{ duration:0.2 }} onSubmit={handleSubmit}>
                <h2 style={{ fontSize:20,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.slate800,marginBottom:20 }}>Preferences</h2>
                <div style={{ marginBottom:18 }}>
                  <label style={{ fontSize:13,fontWeight:700,color:C.slate700,display:"block",marginBottom:4 }}>Nominee Phone *</label>
                  <p style={{ fontSize:12,color:C.slate400,marginBottom:8 }}>Your nominee approves large withdrawals for your safety</p>
                  <input type="tel" inputMode="numeric" value={form.nominee_phone} onChange={e=>set("nominee_phone",e.target.value)} placeholder="Spouse / family member" required style={inputStyle} />
                </div>
                <div style={{ marginBottom:18 }}>
                  <label style={{ fontSize:13,fontWeight:700,color:C.slate700,display:"block",marginBottom:4 }}>Daily Survival Minimum (₹)</label>
                  <p style={{ fontSize:12,color:C.slate400,marginBottom:8 }}>Food, travel and daily essentials</p>
                  <input type="number" inputMode="numeric" value={form.survival_minimum} onChange={e=>set("survival_minimum",e.target.value)} placeholder="150" style={inputStyle} />
                </div>
                <div style={{ marginBottom:20 }}>
                  <label style={{ fontSize:13,fontWeight:700,color:C.slate700,display:"block",marginBottom:4 }}>Rest Days</label>
                  <p style={{ fontSize:12,color:C.slate400,marginBottom:10 }}>No savings target on selected days</p>
                  <div style={{ display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6 }}>
                    {DAYS.map((d,i)=>(
                      <button key={d} type="button" onClick={()=>toggleDay(d)}
                        style={{ padding:"8px 4px",borderRadius:8,fontSize:11,fontWeight:800,border:"none",cursor:"pointer",fontFamily:"Nunito,sans-serif",background:form.rest_days.includes(d)?C.indigo600:C.slate100,color:form.rest_days.includes(d)?"white":C.slate600,transition:"all 0.15s" }}>
                        {DAY_SHORT[i]}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display:"flex",gap:10 }}>
                  <button type="button" onClick={()=>setStep(1)} style={{ flex:1,padding:"13px",borderRadius:12,border:`2px solid ${C.slate200}`,background:"transparent",color:C.slate600,fontWeight:800,cursor:"pointer",fontFamily:"Nunito,sans-serif",fontSize:14 }}>← Back</button>
                  <button type="submit" disabled={loading} style={{ ...btnStyle,flex:2,opacity:loading?0.7:1 }}>
                    {loading?<><span style={{ width:16,height:16,border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"white",borderRadius:"50%",animation:"spin 0.8s linear infinite",display:"inline-block" }}/>Creating…</>:"Create Account 🎉"}
                  </button>
                </div>
              </motion.form>
            )}

            {step===3 && (
              <motion.div key="s3" initial={{ opacity:0,scale:0.92 }} animate={{ opacity:1,scale:1 }} style={{ textAlign:"center",padding:"12px 0" }}>
                <motion.div initial={{ scale:0 }} animate={{ scale:1 }} transition={{ type:"spring",stiffness:200,damping:12 }}
                  style={{ width:88,height:88,borderRadius:"50%",background:C.emerald50,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 20px",fontSize:44 }}>🎉</motion.div>
                <h2 style={{ fontSize:22,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.slate800,marginBottom:6 }}>Account Created!</h2>
                <p style={{ fontSize:14,color:C.slate400,marginBottom:24 }}>Your pension journey has begun. Save your ID!</p>
                <div style={{ background:C.indigo50,border:`1px solid ${C.indigo100}`,borderRadius:16,padding:"20px 24px",marginBottom:24 }}>
                  <div style={{ fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:"#818cf8",marginBottom:8 }}>Your Pension ID</div>
                  <div style={{ fontSize:26,fontWeight:800,fontFamily:"'JetBrains Mono',monospace",color:C.indigo600,letterSpacing:"0.08em" }}>{pensionId}</div>
                  <div style={{ fontSize:12,color:C.slate400,marginTop:10,lineHeight:1.5 }}>📌 Screenshot this screen. You'll need this ID every time you log in.</div>
                </div>
                <button onClick={()=>navigate("/login")} style={{ ...btnStyle,width:"100%" }}>Go to Login →</button>
              </motion.div>
            )}
          </AnimatePresence>

          {step<3 && (
            <p style={{ textAlign:"center",fontSize:13,color:C.slate400,marginTop:18 }}>
              Already registered? <Link to="/login" style={{ color:C.indigo600,fontWeight:800,textDecoration:"none" }}>Sign In</Link>
            </p>
          )}
        </motion.div>
      </div>
    </div>
  );
}

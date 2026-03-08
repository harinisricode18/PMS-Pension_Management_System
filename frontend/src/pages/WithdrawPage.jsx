/**
 * WithdrawPage.jsx — Desktop layout, pure inline styles.
 */

import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import * as api from "../services/api";
import { formatRupee } from "../utils/helpers";

const C = {
  indigo600:"#4f46e5",indigo50:"#eef2ff",indigo100:"#e0e7ff",
  emerald600:"#059669",emerald500:"#10b981",emerald50:"#ecfdf5",emerald100:"#d1fae5",
  amber600:"#d97706",amber50:"#fffbeb",amber100:"#fef3c7",
  red600:"#dc2626",red500:"#ef4444",red50:"#fef2f2",red100:"#fee2e2",
  slate800:"#1e293b",slate700:"#334155",slate600:"#475569",
  slate500:"#64748b",slate400:"#94a3b8",slate200:"#e2e8f0",slate100:"#f1f5f9",slate50:"#f8fafc",
  white:"#ffffff",
};
const card = { background:C.white, borderRadius:20, border:`1px solid ${C.slate100}`, boxShadow:"0 2px 12px -2px rgba(79,70,229,0.07)" };
const btnPrimary = { background:"linear-gradient(135deg,#4f46e5,#6366f1)",color:C.white,fontSize:15,fontWeight:800,padding:"14px 24px",borderRadius:14,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 8px 24px -4px rgba(79,70,229,0.45)",fontFamily:"Nunito,sans-serif",width:"100%" };

function OTPInput({ value, onChange, disabled }) {
  const digits = value.padEnd(6," ").split("").slice(0,6);
  const inputs = useRef([]);
  const handleKey = (i,e) => { if(e.key==="Backspace"&&!digits[i]?.trim()&&i>0) inputs.current[i-1]?.focus(); };
  const handleChange = (i,char) => {
    if (!/^\d?$/.test(char)) return;
    const next=[...digits]; next[i]=char;
    onChange(next.join("").trimEnd());
    if(char&&i<5) inputs.current[i+1]?.focus();
  };
  const handlePaste = e => {
    e.preventDefault();
    const p=e.clipboardData.getData("text").replace(/\D/g,"").slice(0,6);
    onChange(p); inputs.current[Math.min(p.length,5)]?.focus();
  };
  return (
    <div style={{ display:"flex",gap:10,justifyContent:"center" }} onPaste={handlePaste}>
      {Array.from({length:6}).map((_,i)=>{
        const filled=digits[i]&&digits[i]!==" ";
        return (
          <input key={i} ref={el=>inputs.current[i]=el} type="text" inputMode="numeric" maxLength={1}
            value={filled?digits[i]:""} onChange={e=>handleChange(i,e.target.value)} onKeyDown={e=>handleKey(i,e)} disabled={disabled}
            style={{ width:52,height:60,textAlign:"center",fontSize:26,fontWeight:800,fontFamily:"Sora,sans-serif",borderRadius:14,border:`2px solid ${filled?C.indigo600:C.slate200}`,background:filled?C.indigo50:C.slate50,color:filled?C.indigo800:C.slate800,outline:"none" }} />
        );
      })}
    </div>
  );
}

export default function WithdrawPage() {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState("input");
  const [amount, setAmount] = useState("");
  const [eligibility, setEligibility] = useState(null);
  const [checking, setChecking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [requestId, setRequestId] = useState(null);
  const [otp, setOtp] = useState("");
  const checkTimer = useRef(null);
  const liquid = user?.liquid_vault??0;

  const checkEligibility = async amt => {
    if (!amt||parseFloat(amt)<=0){ setEligibility(null); return; }
    if (parseFloat(amt)>liquid){ setEligibility({ eligible:false,reason:"Exceeds liquid vault balance" }); return; }
    setChecking(true);
    const res = await api.checkWithdrawalEligibility({ amount:parseFloat(amt) });
    setChecking(false);
    if (res?.success!==false) setEligibility(res);
  };

  const handleAmountChange = v => {
    setAmount(v); setError(""); setEligibility(null);
    clearTimeout(checkTimer.current);
    checkTimer.current = setTimeout(()=>checkEligibility(v),600);
  };

  const handleWithdraw = async () => {
    setLoading(true); setError("");
    const res = await api.initiateWithdrawal({ amount:parseFloat(amount) });
    setLoading(false);
    if (!res.success){ setError(res.error||"Withdrawal failed"); return; }
    if (res.approved){ await refreshUser(); setStep("success"); }
    else if (res.dual_key_required){ setRequestId(res.request_id); setStep("otp"); }
  };

  const handleVerifyOTP = async () => {
    if (otp.length!==6){ setError("Enter the full 6-digit OTP"); return; }
    setLoading(true); setError("");
    const res = await api.verifyWithdrawalOTP({ request_id:requestId,otp_entered:otp });
    setLoading(false);
    if (!res.success){ setError(res.error||"OTP failed"); return; }
    if (res.approved){ await refreshUser(); setStep("success"); }
    else { setError(res.message||"Incorrect OTP."); setOtp(""); }
  };

  const steps = ["input","confirm","otp","success"];
  const stepIdx = steps.indexOf(step);

  return (
    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,maxWidth:900,alignItems:"start" }}>

      {/* Left: main flow */}
      <div style={{ ...card,padding:"28px 32px" }}>
        {/* Step progress */}
        {step!=="success" && (
          <div style={{ display:"flex",gap:6,marginBottom:24 }}>
            {["Amount","Review","Verify","Done"].map((lbl,i)=>(
              <div key={lbl} style={{ flex:1 }}>
                <div style={{ height:4,borderRadius:99,background:i<=stepIdx?C.indigo600:C.slate200,transition:"background 0.3s",marginBottom:4 }} />
                <div style={{ fontSize:10,fontWeight:700,color:i<=stepIdx?C.indigo600:C.slate400,textTransform:"uppercase",letterSpacing:"0.06em" }}>{lbl}</div>
              </div>
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">

          {/* INPUT */}
          {step==="input" && (
            <motion.div key="input" initial={{ opacity:0,x:20 }} animate={{ opacity:1,x:0 }} exit={{ opacity:0,x:-20 }} transition={{ duration:0.2 }} style={{ display:"flex",flexDirection:"column",gap:16 }}>
              <div>
                <label style={{ fontSize:13,fontWeight:700,color:C.slate700,display:"block",marginBottom:8 }}>Withdrawal Amount</label>
                <div style={{ position:"relative",marginBottom:12 }}>
                  <span style={{ position:"absolute",left:16,top:"50%",transform:"translateY(-50%)",fontSize:24,fontWeight:800,color:C.slate400 }}>₹</span>
                  <input type="number" inputMode="numeric" value={amount} onChange={e=>handleAmountChange(e.target.value)} placeholder="0" max={liquid}
                    style={{ width:"100%",border:`1.5px solid ${C.slate200}`,borderRadius:14,background:C.slate50,paddingLeft:48,paddingRight:16,paddingTop:16,paddingBottom:16,fontSize:32,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.slate800,outline:"none",boxSizing:"border-box" }} />
                </div>
                <div style={{ display:"flex",gap:8 }}>
                  {[0.25,0.5,0.75,1].map(f=>(
                    <button key={f} onClick={()=>handleAmountChange(String(Math.floor(liquid*f)))}
                      style={{ flex:1,padding:"8px 4px",borderRadius:10,fontSize:12,fontWeight:800,border:`1.5px solid ${C.slate200}`,background:C.white,color:C.slate600,cursor:"pointer",fontFamily:"Nunito,sans-serif" }}>
                      {f*100}%
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ background:C.blue50||"#eff6ff",border:`1px solid ${"#dbeafe"}`,borderRadius:12,padding:"12px 16px",fontSize:13,color:"#2563eb",display:"flex",gap:8 }}>
                ℹ️ <span>Only your <strong>liquid vault</strong> is withdrawable. Pension vault is locked until retirement.</span>
              </div>

              {checking && <div style={{ fontSize:13,color:C.slate400,textAlign:"center" }}>Checking eligibility…</div>}
              {eligibility&&!checking && (
                <motion.div initial={{ opacity:0,y:4 }} animate={{ opacity:1,y:0 }}
                  style={{ borderRadius:12,padding:"12px 16px",border:`1px solid ${eligibility.eligible?C.emerald100:C.red100}`,background:eligibility.eligible?C.emerald50:C.red50,fontSize:14,fontWeight:600,color:eligibility.eligible?C.emerald600:C.red500,display:"flex",gap:8 }}>
                  {eligibility.eligible?(eligibility.dual_key_required?"⚠️ Nominee Approval Required":"✅ Instant withdrawal — no approval needed"):`❌ ${eligibility.reason||"Not eligible"}`}
                </motion.div>
              )}

              {error && <div style={{ background:C.red50,border:`1px solid ${C.red100}`,borderRadius:12,padding:"12px 16px",fontSize:13,color:C.red500,display:"flex",gap:8 }}>⚠️ {error}</div>}

              <button onClick={()=>{ if(!amount||parseFloat(amount)<=0||parseFloat(amount)>liquid){ setError("Enter a valid amount within your liquid vault"); return; } setStep("confirm"); }}
                disabled={!amount||parseFloat(amount)<=0||parseFloat(amount)>liquid} style={{ ...btnPrimary,opacity:!amount||parseFloat(amount)<=0||parseFloat(amount)>liquid?0.5:1 }}>
                Continue →
              </button>
            </motion.div>
          )}

          {/* CONFIRM */}
          {step==="confirm" && (
            <motion.div key="confirm" initial={{ opacity:0,x:20 }} animate={{ opacity:1,x:0 }} exit={{ opacity:0,x:-20 }} transition={{ duration:0.2 }} style={{ display:"flex",flexDirection:"column",gap:16 }}>
              <div style={{ background:"linear-gradient(135deg,#fef2f2,#fee2e2)",borderRadius:18,padding:"24px",textAlign:"center" }}>
                <div style={{ fontSize:12,color:C.red500,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:8 }}>Withdrawing</div>
                <div style={{ fontSize:48,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.red600 }}>{formatRupee(parseFloat(amount),0)}</div>
                <div style={{ fontSize:13,color:C.red500,marginTop:4 }}>from your liquid vault</div>
              </div>
              {eligibility?.dual_key_required && (
                <div style={{ background:C.amber50,border:`1px solid ${C.amber100}`,borderRadius:12,padding:"12px 16px",fontSize:13,color:C.amber600,display:"flex",gap:8 }}>
                  🔐 <div><strong>Dual-Key Required.</strong> Your nominee will receive a 6-digit OTP to approve this.</div>
                </div>
              )}
              {error && <div style={{ background:C.red50,border:`1px solid ${C.red100}`,borderRadius:12,padding:"12px 16px",fontSize:13,color:C.red500,display:"flex",gap:8 }}>⚠️ {error}</div>}
              <div style={{ display:"flex",gap:10 }}>
                <button onClick={()=>setStep("input")} style={{ flex:1,padding:14,borderRadius:12,border:`2px solid ${C.slate200}`,background:"transparent",color:C.slate600,fontWeight:800,cursor:"pointer",fontFamily:"Nunito,sans-serif",fontSize:14 }}>← Back</button>
                <button onClick={handleWithdraw} disabled={loading} style={{ flex:2,background:"linear-gradient(135deg,#dc2626,#ef4444)",color:C.white,fontSize:15,fontWeight:800,padding:"14px",borderRadius:12,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 8px 24px -4px rgba(220,38,38,0.4)",fontFamily:"Nunito,sans-serif",opacity:loading?0.7:1 }}>
                  {loading?<><span style={{ width:16,height:16,border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"white",borderRadius:"50%",animation:"spin 0.8s linear infinite",display:"inline-block" }}/>Processing…</>:"Confirm Withdraw"}
                </button>
              </div>
            </motion.div>
          )}

          {/* OTP */}
          {step==="otp" && (
            <motion.div key="otp" initial={{ opacity:0,x:20 }} animate={{ opacity:1,x:0 }} exit={{ opacity:0,x:-20 }} transition={{ duration:0.2 }} style={{ display:"flex",flexDirection:"column",gap:20 }}>
              <div style={{ textAlign:"center" }}>
                <div style={{ width:72,height:72,borderRadius:"50%",background:C.amber50,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 14px",fontSize:36 }}>🔐</div>
                <div style={{ fontSize:20,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.slate800,marginBottom:6 }}>Nominee OTP</div>
                <div style={{ fontSize:14,color:C.slate400 }}>A 6-digit OTP has been sent to your nominee's phone</div>
              </div>
              <OTPInput value={otp} onChange={setOtp} disabled={loading} />
              {error && <div style={{ background:C.red50,border:`1px solid ${C.red100}`,borderRadius:12,padding:"12px 16px",fontSize:13,color:C.red500,textAlign:"center" }}>{error}</div>}
              <button onClick={handleVerifyOTP} disabled={loading||otp.length<6} style={{ ...btnPrimary,opacity:loading||otp.length<6?0.6:1 }}>
                {loading?<><span style={{ width:16,height:16,border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"white",borderRadius:"50%",animation:"spin 0.8s linear infinite",display:"inline-block" }}/>Verifying…</>:"Verify & Withdraw"}
              </button>
            </motion.div>
          )}

          {/* SUCCESS */}
          {step==="success" && (
            <motion.div key="success" initial={{ opacity:0,scale:0.92 }} animate={{ opacity:1,scale:1 }} style={{ textAlign:"center",padding:"20px 0",display:"flex",flexDirection:"column",gap:16 }}>
              <motion.div initial={{ scale:0 }} animate={{ scale:1 }} transition={{ type:"spring",stiffness:200,damping:12 }}
                style={{ width:88,height:88,borderRadius:"50%",background:"linear-gradient(135deg,#d1fae5,#a7f3d0)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",fontSize:44 }}>✅</motion.div>
              <div>
                <div style={{ fontSize:24,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.slate800,marginBottom:4 }}>Withdrawal Successful!</div>
                <div style={{ fontSize:14,color:C.slate400 }}>{formatRupee(parseFloat(amount))} transferred</div>
              </div>
              <div style={{ background:C.emerald50,border:`1px solid ${C.emerald100}`,borderRadius:16,padding:"18px 24px",textAlign:"left" }}>
                <div style={{ fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:C.emerald500,marginBottom:6 }}>Updated Liquid Vault</div>
                <div style={{ fontSize:32,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.emerald600 }}>{formatRupee(user?.liquid_vault??0,0)}</div>
              </div>
              <button onClick={()=>navigate("/dashboard")} style={{ ...btnPrimary }}>Back to Dashboard</button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Right: info panel */}
      <div style={{ display:"flex",flexDirection:"column",gap:16 }}>
        <div style={{ ...card,padding:"20px 24px" }}>
          <div style={{ fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:C.slate400,marginBottom:14 }}>Vault Balances</div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
            <div style={{ background:C.emerald50,borderRadius:14,padding:"14px 16px",border:`1px solid ${C.emerald100}` }}>
              <div style={{ fontSize:11,fontWeight:700,color:C.emerald600,marginBottom:6 }}>💧 Available</div>
              <div style={{ fontSize:22,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.emerald600 }}>{formatRupee(liquid,0)}</div>
              <div style={{ fontSize:11,color:C.emerald500,marginTop:3 }}>Liquid vault</div>
            </div>
            <div style={{ background:C.slate50,borderRadius:14,padding:"14px 16px",border:`1px solid ${C.slate100}`,opacity:0.75 }}>
              <div style={{ fontSize:11,fontWeight:700,color:C.amber600,marginBottom:6 }}>🔒 Locked</div>
              <div style={{ fontSize:22,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.slate600 }}>{formatRupee(user?.pension_vault??0,0)}</div>
              <div style={{ fontSize:11,color:C.slate400,marginTop:3 }}>Until age 60</div>
            </div>
          </div>
        </div>

        <div style={{ ...card,padding:"20px 24px" }}>
          <div style={{ fontSize:13,fontWeight:700,color:C.slate700,marginBottom:12 }}>📋 Withdrawal Rules</div>
          {[
            ["⚡","Instant","Small withdrawals (below threshold) are instant"],
            ["🔐","Dual-Key","Large withdrawals need your nominee's OTP approval"],
            ["💧","Liquid Only","Only liquid vault (20% of savings) is withdrawable"],
            ["🛡️","Protected","Your pension vault is safe until retirement"],
          ].map(([emoji,title,desc])=>(
            <div key={title} style={{ display:"flex",gap:10,marginBottom:12 }}>
              <span style={{ fontSize:18,flexShrink:0 }}>{emoji}</span>
              <div>
                <div style={{ fontSize:13,fontWeight:700,color:C.slate700 }}>{title}</div>
                <div style={{ fontSize:12,color:C.slate400,marginTop:2 }}>{desc}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

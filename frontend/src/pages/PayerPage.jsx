/**
 * PayerPage.jsx — PUBLIC PAGE (no authentication required)
 * ─────────────────────────────────────────────────────────────────────────────
 * Route: /pay/:tokenId
 *
 * This page is opened when a payer (employer/customer) scans the worker's QR code.
 * No PMS account or login is needed to access this page.
 *
 * Flow:
 *   1. Page loads → reads :tokenId from URL params
 *   2. Shows worker details (fetched from token if backend supports it, else shows generic)
 *   3. Payer selects: CASH or PAYTM
 *      CASH  → Payer enters amount → confirms → POST /confirm-payment
 *      PAYTM → Simulation UI → enter amount → "processing" animation → POST /confirm-payment
 *   4. On success → POST message to opener window (if exists) → show success screen
 *
 * API:
 *   POST /confirm-payment  { token_id, amount, method: "cash"|"paytm", payer_id? }
 *   (No JWT header needed — public endpoint as per schema design notes)
 *
 * Pure inline styles — zero dependency on app CSS/Tailwind.
 */

import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import * as api from "../services/api";
import { formatRupee } from "../utils/helpers";

// ─── Design tokens (self-contained — don't rely on parent app styles) ─────────
const C = {
  indigo700:"#4338ca",indigo600:"#4f46e5",indigo500:"#6366f1",indigo50:"#eef2ff",indigo100:"#e0e7ff",
  emerald700:"#047857",emerald600:"#059669",emerald500:"#10b981",emerald50:"#ecfdf5",emerald100:"#d1fae5",
  amber600:"#d97706",amber50:"#fffbeb",amber100:"#fef3c7",
  paytm:"#00B9F1",paytmDark:"#0097C9",
  slate800:"#1e293b",slate700:"#334155",slate600:"#475569",
  slate500:"#64748b",slate400:"#94a3b8",slate200:"#e2e8f0",slate100:"#f1f5f9",slate50:"#f8fafc",
  red600:"#dc2626",red500:"#ef4444",red50:"#fef2f2",red100:"#fee2e2",
  white:"#ffffff",
};

const card = { background:C.white,borderRadius:24,border:`1px solid ${C.slate100}`,boxShadow:"0 4px 24px -4px rgba(79,70,229,0.1),0 1px 8px rgba(0,0,0,0.05)" };
const btnBase = { fontSize:16,fontWeight:800,padding:"15px 24px",borderRadius:14,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:10,fontFamily:"Nunito,sans-serif",width:"100%",transition:"all 0.15s" };
const inputStyle = { width:"100%",border:`2px solid ${C.slate200}`,borderRadius:14,background:C.slate50,paddingLeft:52,paddingRight:16,paddingTop:16,paddingBottom:16,fontSize:32,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.slate800,outline:"none",boxSizing:"border-box" };

// ─── Paytm simulation UI ──────────────────────────────────────────────────────
function PaytmSim({ amount, onAmountChange, onConfirm, loading }) {
  const [simStep, setSimStep] = useState("enter"); // enter | upi | processing
  const [upiId, setUpiId] = useState("");

  const handlePay = async () => {
    if (!upiId.includes("@")) { return; }
    setSimStep("processing");
    // Simulate 2.5s processing animation, then confirm
    await new Promise(r => setTimeout(r, 2500));

    const result = await onConfirm();
    if (!result) {
      setSimStep("enter");
    }
  };

  return (
    <AnimatePresence mode="wait">
      {simStep === "enter" && (
        <motion.div key="enter" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} style={{ display:"flex",flexDirection:"column",gap:16 }}>
          {/* Paytm header */}
          <div style={{ background:"linear-gradient(135deg,#00B9F1,#0097C9)",borderRadius:16,padding:"20px 24px",color:C.white,textAlign:"center" }}>
            <div style={{ fontSize:28,fontWeight:900,fontFamily:"sans-serif",letterSpacing:"-0.5px",marginBottom:4 }}>Paytm</div>
            <div style={{ fontSize:13,opacity:0.85 }}>Secure Payment Gateway · Simulation</div>
          </div>

          <div>
            <label style={{ fontSize:13,fontWeight:700,color:C.slate700,display:"block",marginBottom:8 }}>Payment Amount</label>
            <div style={{ position:"relative" }}>
              <span style={{ position:"absolute",left:16,top:"50%",transform:"translateY(-50%)",fontSize:24,fontWeight:800,color:C.slate400 }}>₹</span>
              <input type="number" inputMode="numeric" value={amount} onChange={e => onAmountChange(e.target.value)} placeholder="0" style={inputStyle} />
            </div>
          </div>

          <button onClick={() => { if (parseFloat(amount)>0) setSimStep("upi"); }}
            disabled={!amount||parseFloat(amount)<=0}
            style={{ ...btnBase,background:"linear-gradient(135deg,#00B9F1,#0097C9)",color:C.white,opacity:!amount||parseFloat(amount)<=0?0.5:1,boxShadow:"0 8px 24px -4px rgba(0,185,241,0.4)" }}>
            Proceed to Pay →
          </button>
        </motion.div>
      )}

      {simStep === "upi" && (
        <motion.div key="upi" initial={{ opacity:0,y:12 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0 }} style={{ display:"flex",flexDirection:"column",gap:16 }}>
          {/* Summary row */}
          <div style={{ background:C.slate50,borderRadius:14,padding:"14px 18px",display:"flex",justifyContent:"space-between",alignItems:"center" }}>
            <div style={{ fontSize:13,color:C.slate500,fontWeight:600 }}>Paying to worker</div>
            <div style={{ fontSize:22,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.paytmDark }}>₹{parseFloat(amount).toLocaleString("en-IN")}</div>
          </div>

          {/* UPI input */}
          <div>
            <label style={{ fontSize:13,fontWeight:700,color:C.slate700,display:"block",marginBottom:6 }}>Your UPI ID</label>
            <input type="text" value={upiId} onChange={e => setUpiId(e.target.value)} placeholder="yourname@paytm / phone@upi"
              style={{ ...inputStyle,fontSize:16,paddingLeft:16,fontFamily:"Nunito,sans-serif",fontWeight:600 }} />
            <div style={{ fontSize:12,color:C.slate400,marginTop:6 }}>This is a simulation — any UPI ID format accepted</div>
          </div>

          {/* Payment methods (visual only) */}
          <div style={{ border:`1px solid ${C.slate100}`,borderRadius:14,overflow:"hidden" }}>
            {[
              { icon:"📱",label:"Paytm Wallet",sub:"Instant payment",selected:true },
              { icon:"🏦",label:"UPI / Net Banking",sub:"via your bank",selected:false },
            ].map((m,i) => (
              <div key={m.label} style={{ display:"flex",alignItems:"center",gap:14,padding:"14px 18px",borderBottom:i===0?`1px solid ${C.slate100}`:"none",background:m.selected?"#f0f9ff":C.white }}>
                <span style={{ fontSize:22 }}>{m.icon}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14,fontWeight:700,color:C.slate800 }}>{m.label}</div>
                  <div style={{ fontSize:12,color:C.slate400 }}>{m.sub}</div>
                </div>
                <div style={{ width:18,height:18,borderRadius:"50%",border:`2px solid ${m.selected?C.paytm:C.slate200}`,background:m.selected?C.paytm:"transparent",display:"flex",alignItems:"center",justifyContent:"center" }}>
                  {m.selected && <div style={{ width:8,height:8,borderRadius:"50%",background:C.white }} />}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display:"flex",gap:10 }}>
            <button onClick={() => setSimStep("enter")}
              style={{ flex:1,padding:14,borderRadius:12,border:`2px solid ${C.slate200}`,background:"transparent",color:C.slate600,fontWeight:800,cursor:"pointer",fontFamily:"Nunito,sans-serif",fontSize:14 }}>
              ← Back
            </button>
            <button onClick={handlePay} disabled={!upiId.includes("@")}
              style={{ ...btnBase,flex:2,background:"linear-gradient(135deg,#00B9F1,#0097C9)",color:C.white,boxShadow:"0 8px 24px -4px rgba(0,185,241,0.4)",opacity:!upiId.includes("@")?0.5:1 }}>
              Pay ₹{parseFloat(amount||0).toLocaleString("en-IN")} →
            </button>
          </div>
        </motion.div>
      )}

      {simStep === "processing" && (
        <motion.div key="proc" initial={{ opacity:0,scale:0.9 }} animate={{ opacity:1,scale:1 }} style={{ textAlign:"center",padding:"40px 0" }}>
          <div style={{ position:"relative",width:80,height:80,margin:"0 auto 20px" }}>
            <div style={{ width:80,height:80,border:`6px solid ${C.slate100}`,borderTopColor:C.paytm,borderRadius:"50%",animation:"spin 0.9s linear infinite" }} />
            <div style={{ position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"center",fontSize:28 }}>📱</div>
          </div>
          <div style={{ fontSize:18,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.slate800,marginBottom:6 }}>Processing payment…</div>
          <div style={{ fontSize:13,color:C.slate500 }}>Connecting to Paytm servers</div>
          <div style={{ display:"flex",justifyContent:"center",gap:6,marginTop:16 }}>
            {[0,1,2].map(i => (
              <motion.div key={i} animate={{ scale:[1,1.5,1] }} transition={{ duration:0.8,delay:i*0.2,repeat:Infinity }}
                style={{ width:8,height:8,borderRadius:"50%",background:C.paytm }} />
            ))}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─── PAYER PAGE ───────────────────────────────────────────────────────────────
export default function PayerPage() {
  const { tokenId } = useParams();
  const [step, setStep] = useState("loading"); // loading | choose | cash | paytm | success | error | expired
  const [method, setMethod] = useState(null); // "cash" | "paytm"
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [tokenInfo, setTokenInfo] = useState(null);

  // On mount: validate token (try to fetch from a token-info endpoint if it exists)
  useEffect(() => {
    if (!tokenId) { setStep("error"); return; }
    // The schema shows tokens have 5-min TTL. If backend has GET /token/:id, use it.
    // Fallback: just show the payment page (token validity checked on confirm).
    setTimeout(() => setStep("choose"), 600);
    // In a real implementation:
    // api.getTokenInfo(tokenId).then(r => {
    //   if (!r.success || r.status === "EXPIRED") setStep("expired");
    //   else { setTokenInfo(r); setAmount(String(r.amount || "")); setStep("choose"); }
    // });
  }, [tokenId]);

  const handleConfirmPayment = async () => {
    if (!amount || parseFloat(amount) <= 0) { 
    setError("Enter a valid amount"); 
    return false; 
    }
    setSubmitting(true); 
    setError("");
    const res = await api.confirmPayment({
      token_id: tokenId,
      amount: parseFloat(amount),
      method: method === "cash" ? "CASH" : "UPI",
    });
    setSubmitting(false);
    if (!res || res.success === false) {
      if (res?.error?.includes("expired") || res?.error?.includes("EXPIRED")) { setStep("expired"); return; }
      setError(res?.error || "Payment failed. Please try again.");
      return;
    }
    // Notify opener window (if worker has the PMS app open in another tab/window)
    try {
      window.opener?.postMessage({ type:"PMS_PAYMENT_CONFIRMED", payload:{ amount:parseFloat(amount), method } }, window.location.origin);
    } catch {}
    setStep("success");
  };

  const quickAmounts = [50, 100, 150, 200, 300, 500];

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(160deg,#312e81 0%,#4338ca 60%,#818cf8 100%)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:20, fontFamily:"Nunito,sans-serif" }}>
      {/* BG blobs */}
      <div style={{ position:"fixed",top:0,left:0,width:300,height:300,borderRadius:"50%",background:"rgba(255,255,255,0.05)",transform:"translate(-40%,-40%)",pointerEvents:"none" }} />
      <div style={{ position:"fixed",bottom:0,right:0,width:200,height:200,borderRadius:"50%",background:"rgba(255,255,255,0.05)",transform:"translate(30%,30%)",pointerEvents:"none" }} />

      {/* PMS header badge */}
      <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:24,color:"rgba(255,255,255,0.9)" }}>
        <div style={{ width:36,height:36,borderRadius:10,background:"rgba(255,255,255,0.2)",border:"1px solid rgba(255,255,255,0.3)",display:"flex",alignItems:"center",justifyContent:"center" }}>
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M10 2L17 5.5v6c0 4.2-3 7.5-7 8.5-4-1-7-4.3-7-8.5v-6L10 2z" fill="white" fillOpacity="0.9"/>
            <path d="M7 10l2.5 2.5 4-4" stroke="#4f46e5" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <div>
          <div style={{ fontSize:15,fontWeight:800,fontFamily:"Sora,sans-serif",lineHeight:1 }}>PMS Payment</div>
          <div style={{ fontSize:10,opacity:0.7,fontWeight:600 }}>Secure · Verified Income</div>
        </div>
      </div>

      {/* Main card */}
      <motion.div initial={{ opacity:0,y:32 }} animate={{ opacity:1,y:0 }} transition={{ duration:0.35,ease:[0.22,1,0.36,1] }}
        style={{ ...card,width:"100%",maxWidth:420,padding:"32px 32px" }}>

        <AnimatePresence mode="wait">
          {/* LOADING */}
          {step === "loading" && (
            <motion.div key="ld" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} style={{ textAlign:"center",padding:"40px 0" }}>
              <div style={{ width:48,height:48,border:`4px solid ${C.indigo100}`,borderTopColor:C.indigo600,borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 14px" }} />
              <div style={{ fontSize:15,fontWeight:600,color:C.slate500 }}>Loading payment details…</div>
            </motion.div>
          )}

          {/* CHOOSE METHOD */}
          {step === "choose" && (
            <motion.div key="choose" initial={{ opacity:0,y:12 }} animate={{ opacity:1,y:0 }} exit={{ opacity:0 }} style={{ display:"flex",flexDirection:"column",gap:18 }}>
              <div style={{ textAlign:"center",marginBottom:4 }}>
                <div style={{ fontSize:13,fontWeight:700,color:C.slate400,marginBottom:4 }}>Token</div>
                <div style={{ fontSize:22,fontWeight:800,fontFamily:"'JetBrains Mono',monospace",color:C.indigo600,letterSpacing:"0.12em" }}>{tokenId}</div>
              </div>
              <div style={{ background:C.indigo50,border:`1px solid ${C.indigo100}`,borderRadius:14,padding:"12px 16px",fontSize:13,color:C.indigo600,fontWeight:600,textAlign:"center" }}>
                🛡️ Secure one-time payment link · Expires in 5 minutes
              </div>
              <div style={{ fontSize:15,fontWeight:700,color:C.slate700,textAlign:"center" }}>Choose payment method</div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:14 }}>
                <motion.button whileHover={{ y:-2 }} whileTap={{ scale:0.97 }} onClick={() => { setMethod("cash"); setStep("cash"); }}
                  style={{ padding:"24px 16px",borderRadius:20,border:`2px solid ${C.slate200}`,background:C.white,cursor:"pointer",textAlign:"center",fontFamily:"Nunito,sans-serif" }}>
                  <div style={{ fontSize:40,marginBottom:8 }}>💵</div>
                  <div style={{ fontSize:16,fontWeight:800,color:C.slate800 }}>Cash</div>
                  <div style={{ fontSize:11,color:C.slate400,marginTop:4,lineHeight:1.4 }}>Pay with physical cash</div>
                </motion.button>
                <motion.button whileHover={{ y:-2 }} whileTap={{ scale:0.97 }} onClick={() => { setMethod("paytm"); setStep("paytm"); }}
                  style={{ padding:"24px 16px",borderRadius:20,border:`2px solid ${C.paytm}30`,background:"#f0fbff",cursor:"pointer",textAlign:"center",fontFamily:"Nunito,sans-serif" }}>
                  <div style={{ fontSize:40,marginBottom:8 }}>📱</div>
                  <div style={{ fontSize:16,fontWeight:800,color:C.paytmDark }}>Paytm</div>
                  <div style={{ fontSize:11,color:"#0097c9aa",marginTop:4,lineHeight:1.4 }}>UPI / wallet payment</div>
                </motion.button>
              </div>
            </motion.div>
          )}

          {/* CASH PAYMENT */}
          {step === "cash" && (
            <motion.div key="cash" initial={{ opacity:0,x:20 }} animate={{ opacity:1,x:0 }} exit={{ opacity:0,x:-20 }} style={{ display:"flex",flexDirection:"column",gap:16 }}>
              <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:4 }}>
                <button onClick={() => setStep("choose")} style={{ width:32,height:32,borderRadius:"50%",background:C.slate50,border:`1px solid ${C.slate200}`,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center" }}>←</button>
                <div>
                  <div style={{ fontSize:17,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.slate800 }}>💵 Cash Payment</div>
                  <div style={{ fontSize:12,color:C.slate400 }}>Enter the amount being paid</div>
                </div>
              </div>

              <div style={{ position:"relative" }}>
                <span style={{ position:"absolute",left:16,top:"50%",transform:"translateY(-50%)",fontSize:24,fontWeight:800,color:C.slate400 }}>₹</span>
                <input type="number" inputMode="numeric" value={amount} onChange={e => { setAmount(e.target.value); setError(""); }} placeholder="0" autoFocus style={inputStyle} />
              </div>

              <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8 }}>
                {quickAmounts.map(a => (
                  <button key={a} onClick={() => setAmount(String(a))}
                    style={{ padding:"9px",borderRadius:10,fontSize:13,fontWeight:800,border:`1.5px solid ${parseFloat(amount)===a?C.indigo600:C.slate200}`,background:parseFloat(amount)===a?C.indigo600:C.white,color:parseFloat(amount)===a?C.white:C.slate600,cursor:"pointer",fontFamily:"Nunito,sans-serif" }}>
                    ₹{a}
                  </button>
                ))}
              </div>

              {/* Receipt preview */}
              {amount && parseFloat(amount) > 0 && (
                <motion.div initial={{ opacity:0,y:4 }} animate={{ opacity:1,y:0 }}
                  style={{ background:C.emerald50,border:`1px solid ${C.emerald100}`,borderRadius:14,padding:"16px 18px" }}>
                  <div style={{ fontSize:12,fontWeight:700,color:C.emerald600,marginBottom:10 }}>Payment Summary</div>
                  <div style={{ display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:14,color:C.slate600 }}>
                    <span>Amount</span><span style={{ fontWeight:700 }}>₹{parseFloat(amount).toLocaleString("en-IN")}</span>
                  </div>
                  <div style={{ display:"flex",justifyContent:"space-between",marginBottom:6,fontSize:14,color:C.slate600 }}>
                    <span>Method</span><span style={{ fontWeight:700 }}>💵 Cash</span>
                  </div>
                  <div style={{ display:"flex",justifyContent:"space-between",fontSize:14,color:C.slate600 }}>
                    <span>Recorded as</span><span style={{ fontWeight:700,color:C.emerald700 }}>payer_verified ✓</span>
                  </div>
                </motion.div>
              )}

              {error && <div style={{ background:C.red50,border:`1px solid ${C.red100}`,borderRadius:12,padding:"11px 15px",fontSize:13,color:C.red500,display:"flex",gap:8 }}>⚠️ {error}</div>}

              <button onClick={handleConfirmPayment} disabled={submitting || !amount || parseFloat(amount) <= 0}
                style={{ ...btnBase,background:"linear-gradient(135deg,#059669,#10b981)",color:C.white,boxShadow:"0 8px 24px -4px rgba(5,150,105,0.4)",opacity:submitting||!amount||parseFloat(amount)<=0?0.5:1 }}>
                {submitting ? <><span style={{ width:20,height:20,border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"white",borderRadius:"50%",animation:"spin 0.8s linear infinite",display:"inline-block" }}/>Confirming…</> : `Confirm ₹${parseFloat(amount||0).toLocaleString("en-IN")} Cash →`}
              </button>
            </motion.div>
          )}

          {/* PAYTM PAYMENT */}
          {step === "paytm" && (
            <motion.div key="paytm" initial={{ opacity:0,x:20 }} animate={{ opacity:1,x:0 }} exit={{ opacity:0,x:-20 }} style={{ display:"flex",flexDirection:"column",gap:16 }}>
              <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:4 }}>
                <button onClick={() => setStep("choose")} style={{ width:32,height:32,borderRadius:"50%",background:C.slate50,border:`1px solid ${C.slate200}`,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center" }}>←</button>
                <div>
                  <div style={{ fontSize:17,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.slate800 }}>📱 Paytm Payment</div>
                  <div style={{ fontSize:12,color:C.slate400 }}>Simulation mode</div>
                </div>
              </div>

              {error && <div style={{ background:C.red50,border:`1px solid ${C.red100}`,borderRadius:12,padding:"11px 15px",fontSize:13,color:C.red500,display:"flex",gap:8 }}>⚠️ {error}</div>}

              <PaytmSim
                amount={amount}
                onAmountChange={v => { setAmount(v); setError(""); }}
                onConfirm={handleConfirmPayment}
                loading={submitting}
              />
            </motion.div>
          )}

          {/* SUCCESS */}
          {step === "success" && (
            <motion.div key="success" initial={{ opacity:0,scale:0.9 }} animate={{ opacity:1,scale:1 }} transition={{ type:"spring",stiffness:180,damping:14 }}
              style={{ textAlign:"center",padding:"16px 0",display:"flex",flexDirection:"column",gap:18,alignItems:"center" }}>
              <motion.div initial={{ scale:0 }} animate={{ scale:1 }} transition={{ type:"spring",stiffness:240,damping:12,delay:0.1 }}
                style={{ width:96,height:96,borderRadius:"50%",background:"linear-gradient(135deg,#d1fae5,#6ee7b7)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:52 }}>
                ✅
              </motion.div>
              <div>
                <div style={{ fontSize:24,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.slate800,marginBottom:6 }}>Payment Confirmed!</div>
                <div style={{ fontSize:16,color:C.slate500 }}>
                  {formatRupee(parseFloat(amount))} paid via {method === "cash" ? "💵 Cash" : "📱 Paytm"}
                </div>
              </div>
              <div style={{ background:C.emerald50,border:`1px solid ${C.emerald100}`,borderRadius:16,padding:"16px 24px",fontSize:14,color:C.emerald700,fontWeight:600,lineHeight:1.5 }}>
                🛡️ Worker's income has been recorded as <strong>payer-verified</strong> in the PMS system.
                <br />This payment contributes to their pension health score.
              </div>
              <div style={{ fontSize:12,color:C.slate400,fontWeight:600 }}>
                This payment link has been used and is now invalid.
              </div>
            </motion.div>
          )}

          {/* EXPIRED */}
          {step === "expired" && (
            <motion.div key="exp" initial={{ opacity:0 }} animate={{ opacity:1 }} style={{ textAlign:"center",padding:"32px 0",display:"flex",flexDirection:"column",gap:14,alignItems:"center" }}>
              <div style={{ fontSize:56 }}>⏰</div>
              <div style={{ fontSize:20,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.slate800 }}>Link Expired</div>
              <div style={{ fontSize:14,color:C.slate400,lineHeight:1.5 }}>This payment link has expired or already been used. Ask the worker to generate a new QR code.</div>
            </motion.div>
          )}

          {/* ERROR */}
          {step === "error" && (
            <motion.div key="err" initial={{ opacity:0 }} animate={{ opacity:1 }} style={{ textAlign:"center",padding:"32px 0",display:"flex",flexDirection:"column",gap:14,alignItems:"center" }}>
              <div style={{ fontSize:56 }}>❌</div>
              <div style={{ fontSize:20,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.slate800 }}>Invalid Link</div>
              <div style={{ fontSize:14,color:C.slate400 }}>This payment link is invalid. Please ask the worker to share a new one.</div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Footer */}
      <div style={{ marginTop:20,fontSize:12,color:"rgba(255,255,255,0.5)",textAlign:"center" }}>
        Secured by PMS · Pension Management System<br />
        Payments are recorded on the worker's pension account
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:0.7; transform:scale(1.3); } }
      `}</style>
    </div>
  );
}

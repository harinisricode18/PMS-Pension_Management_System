/**
 * IncomePage.jsx
 * Two modes:
 *   1. VERIFIED INCOME — generates a payer QR. Payer scans → /pay/<token_id>
 *   2. SELF ENTERED    — worker types income manually (source: "self_reported")
 *
 * API used:
 *   POST /ledger/token  → { token_id, expires_at }   [generatePaymentToken]
 *   POST /income        → { safe_savings_target, ... } [recordIncome]
 *
 * Pure inline styles.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import * as api from "../services/api";
import { formatRupee } from "../utils/helpers";

const C = {
  indigo700:"#4338ca",indigo600:"#4f46e5",indigo500:"#6366f1",indigo50:"#eef2ff",indigo100:"#e0e7ff",
  emerald700:"#047857",emerald600:"#059669",emerald500:"#10b981",emerald50:"#ecfdf5",emerald100:"#d1fae5",
  amber600:"#d97706",amber50:"#fffbeb",amber100:"#fef3c7",
  violet700:"#6d28d9",violet600:"#7c3aed",violet50:"#f5f3ff",violet100:"#ede9fe",
  blue600:"#2563eb",blue50:"#eff6ff",blue100:"#dbeafe",
  slate800:"#1e293b",slate700:"#334155",slate600:"#475569",
  slate500:"#64748b",slate400:"#94a3b8",slate200:"#e2e8f0",slate100:"#f1f5f9",slate50:"#f8fafc",
  red500:"#ef4444",red50:"#fef2f2",red100:"#fee2e2",
  white:"#ffffff",
};
const card = { background:C.white,borderRadius:20,border:`1px solid ${C.slate100}`,boxShadow:"0 2px 12px -2px rgba(79,70,229,0.07),0 1px 4px rgba(0,0,0,0.04)" };
const LABEL = { fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em" };
const btnBase = { fontSize:15,fontWeight:800,padding:"14px 24px",borderRadius:14,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontFamily:"Nunito,sans-serif",width:"100%" };

function Countdown({ expiresAt, onExpire }) {
  const [secs, setSecs] = useState(() => Math.max(0, Math.floor((new Date(expiresAt) - Date.now()) / 1000)));
  useEffect(() => {
    if (secs <= 0) { onExpire?.(); return; }
    const t = setTimeout(() => setSecs(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secs, onExpire]);
  const m = Math.floor(secs / 60), s = secs % 60;
  const urgent = secs < 60;
  return (
    <span style={{ fontFamily:"'JetBrains Mono',monospace",fontWeight:800,fontSize:18,color:urgent?C.red500:C.emerald600 }}>
      {m}:{String(s).padStart(2,"0")}
    </span>
  );
}

// ─── Verified Income Panel ────────────────────────────────────────────────────
function VerifiedIncomePanel() {
  const [step, setStep] = useState("idle"); // idle | generating | qr | success | expired
  const [tokenId, setTokenId] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [expectedAmt, setExpectedAmt] = useState("");
  const [paidData, setPaidData] = useState(null);
  const [error, setError] = useState("");

  const payerUrl = tokenId
    ? `${window.location.origin}/pay/${tokenId}`
    : null;

  // Listen for postMessage from the payer window
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.type === "PMS_PAYMENT_CONFIRMED") {
        setPaidData(e.data.payload);
        setStep("success");
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const handleGenerate = async () => {
    setError(""); setStep("generating");
    const body = expectedAmt && parseFloat(expectedAmt) > 0 ? { expected_amount: parseFloat(expectedAmt) } : {};
    const res = await api.generatePaymentToken(body);
    if (!res || res.success === false) { setError(res?.error || "Failed to generate QR"); setStep("idle"); return; }
    setTokenId(res.token_id);
    setExpiresAt(res.expires_at);
    setStep("qr");
  };

  const reset = () => { setStep("idle"); setTokenId(null); setExpiresAt(null); setExpectedAmt(""); setPaidData(null); setError(""); };

  return (
    <div style={{ display:"flex",flexDirection:"column",gap:16 }}>
      {/* Banner */}
      <div style={{ background:"linear-gradient(135deg,#f5f3ff,#ede9fe)",border:`1px solid ${C.violet100}`,borderRadius:14,padding:"14px 18px",display:"flex",gap:12,alignItems:"flex-start" }}>
        <span style={{ fontSize:22,flexShrink:0 }}>⭐</span>
        <div>
          <div style={{ fontSize:14,fontWeight:700,color:C.violet600,marginBottom:3 }}>Boosts your Pension Health Score</div>
          <div style={{ fontSize:12,color:C.violet700,lineHeight:1.5 }}>When your payer scans & pays, income is recorded as <strong>payer_verified</strong> — the highest trust level in the system.</div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {step === "idle" && (
          <motion.div key="idle" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }} style={{ display:"flex",flexDirection:"column",gap:14 }}>
            <div>
              <label style={{ fontSize:13,fontWeight:700,color:C.slate700,display:"block",marginBottom:6 }}>
                Expected Amount <span style={{ color:C.slate400,fontWeight:400 }}>(optional)</span>
              </label>
              <div style={{ position:"relative" }}>
                <span style={{ position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:18,fontWeight:800,color:C.slate400 }}>₹</span>
                <input type="number" inputMode="numeric" value={expectedAmt} onChange={e => setExpectedAmt(e.target.value)} placeholder="Leave blank — payer can enter any amount"
                  style={{ width:"100%",border:`1.5px solid ${C.slate200}`,borderRadius:12,background:C.slate50,paddingLeft:36,paddingRight:16,paddingTop:12,paddingBottom:12,fontSize:16,fontWeight:700,fontFamily:"Sora,sans-serif",color:C.slate800,outline:"none",boxSizing:"border-box" }} />
              </div>
            </div>
            {error && <div style={{ background:C.red50,border:`1px solid ${C.red100}`,borderRadius:12,padding:"11px 15px",fontSize:13,color:C.red500,display:"flex",gap:8 }}>⚠️ {error}</div>}
            <motion.button whileTap={{ scale:0.97 }} onClick={handleGenerate}
              style={{ ...btnBase,background:"linear-gradient(135deg,#7c3aed,#a78bfa)",boxShadow:"0 8px 24px -4px rgba(124,58,237,0.4)",color:C.white }}>
              🔲 Generate QR Code
            </motion.button>
          </motion.div>
        )}

        {step === "generating" && (
          <motion.div key="gen" initial={{ opacity:0 }} animate={{ opacity:1 }} style={{ textAlign:"center",padding:"40px 0" }}>
            <div style={{ width:48,height:48,border:`4px solid ${C.violet100}`,borderTopColor:C.violet600,borderRadius:"50%",animation:"spin 0.8s linear infinite",margin:"0 auto 12px" }} />
            <div style={{ fontSize:14,color:C.slate500,fontWeight:600 }}>Generating secure QR…</div>
          </motion.div>
        )}

        {step === "qr" && tokenId && (
          <motion.div key="qr" initial={{ opacity:0,scale:0.9 }} animate={{ opacity:1,scale:1 }} transition={{ type:"spring",stiffness:200,damping:16 }}
            style={{ display:"flex",flexDirection:"column",gap:16,alignItems:"center" }}>
            {/* QR block */}
            <div style={{ ...card,padding:24,textAlign:"center",width:"100%",maxWidth:300 }}>
              <div style={{ ...LABEL,color:C.slate400,marginBottom:14 }}>Show to your payer</div>
              <div style={{ display:"flex",justifyContent:"center",marginBottom:14 }}>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(payerUrl)}&bgcolor=ffffff&color=312e81&margin=10`}
                  alt="Payment QR" width={200} height={200}
                  style={{ borderRadius:14,border:`4px solid ${C.indigo100}` }}
                />
              </div>

              {/* Token fallback */}
              <div style={{ background:C.violet50,border:`1px solid ${C.violet100}`,borderRadius:12,padding:"10px 16px",marginBottom:12 }}>
                <div style={{ ...LABEL,color:C.violet600,marginBottom:4,fontSize:9 }}>Token Code (type manually)</div>
                <div style={{ fontSize:28,fontWeight:800,fontFamily:"'JetBrains Mono',monospace",color:C.violet600,letterSpacing:"0.15em" }}>{tokenId}</div>
              </div>

              {/* Link */}
              <div style={{ background:C.slate50,border:`1px solid ${C.slate200}`,borderRadius:10,padding:"8px 12px",fontSize:11,fontFamily:"monospace",color:C.indigo600,wordBreak:"break-all",marginBottom:12 }}>
                {payerUrl}
              </div>
              <button onClick={() => { navigator.clipboard?.writeText(payerUrl); }}
                style={{ fontSize:12,fontWeight:700,color:C.indigo600,background:C.indigo50,border:"none",borderRadius:8,padding:"6px 14px",cursor:"pointer",fontFamily:"Nunito,sans-serif" }}>
                📋 Copy Link
              </button>
            </div>

            {/* Countdown + polling */}
            <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:8 }}>
              <div style={{ display:"flex",alignItems:"center",gap:8,fontSize:13,color:C.slate500,fontWeight:600 }}>
                ⏱ Expires in: {expiresAt && <Countdown expiresAt={expiresAt} onExpire={() => setStep("expired")} />}
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:8,fontSize:13,color:C.emerald600,fontWeight:600 }}>
                <div style={{ width:8,height:8,borderRadius:"50%",background:C.emerald500,boxShadow:`0 0 0 3px ${C.emerald100}`,animation:"pulse 1.5s ease-in-out infinite" }} />
                Waiting for payer to pay…
              </div>
            </div>

            <button onClick={reset}
              style={{ fontSize:13,color:C.slate400,background:"transparent",border:"none",cursor:"pointer",textDecoration:"underline" }}>
              Cancel &amp; generate new
            </button>
          </motion.div>
        )}

        {step === "success" && (
          <motion.div key="success" initial={{ opacity:0,scale:0.9 }} animate={{ opacity:1,scale:1 }} transition={{ type:"spring",stiffness:180,damping:14 }}
            style={{ textAlign:"center",display:"flex",flexDirection:"column",gap:16,alignItems:"center",padding:"12px 0" }}>
            <motion.div initial={{ scale:0 }} animate={{ scale:1 }} transition={{ type:"spring",stiffness:220,damping:12,delay:0.1 }}
              style={{ width:88,height:88,borderRadius:"50%",background:"linear-gradient(135deg,#d1fae5,#a7f3d0)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:44 }}>✅</motion.div>
            <div>
              <div style={{ fontSize:22,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.slate800 }}>Payment Verified!</div>
              {paidData?.amount && <div style={{ fontSize:15,color:C.slate500,marginTop:4 }}>{formatRupee(paidData.amount)} confirmed by payer</div>}
              {paidData?.method && <div style={{ fontSize:13,color:C.slate400,marginTop:4 }}>via {paidData.method === "cash" ? "💵 Cash" : "📱 Paytm"}</div>}
            </div>
            <div style={{ background:C.emerald50,border:`1px solid ${C.emerald100}`,borderRadius:14,padding:"12px 20px",fontSize:13,color:C.emerald700,fontWeight:600 }}>
              🛡️ Recorded as payer_verified · Health score boost applied
            </div>
            <button onClick={reset} style={{ ...btnBase,background:"linear-gradient(135deg,#7c3aed,#a78bfa)",color:C.white,boxShadow:"0 8px 24px -4px rgba(124,58,237,0.4)" }}>
              Generate Another QR
            </button>
          </motion.div>
        )}

        {step === "expired" && (
          <motion.div key="exp" initial={{ opacity:0 }} animate={{ opacity:1 }}
            style={{ textAlign:"center",padding:"32px 0",display:"flex",flexDirection:"column",gap:14,alignItems:"center" }}>
            <div style={{ fontSize:52 }}>⏰</div>
            <div style={{ fontSize:18,fontWeight:700,color:C.slate700 }}>QR Code Expired</div>
            <div style={{ fontSize:13,color:C.slate400 }}>Tokens are valid for 5 minutes for security.</div>
            <button onClick={reset} style={{ ...btnBase,background:"linear-gradient(135deg,#7c3aed,#a78bfa)",color:C.white,boxShadow:"0 8px 24px -4px rgba(124,58,237,0.4)" }}>
              Generate New QR
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Self-entered Panel ───────────────────────────────────────────────────────
function SelfEnteredPanel() {
  const { pensionId } = useAuth();
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [prevTarget, setPrevTarget] = useState(null);
  const [newTarget, setNewTarget] = useState(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!pensionId) return;
    api.getSavingsTarget(pensionId).then(r => { if (r?.safe_savings_target != null) setPrevTarget(r.safe_savings_target); });
  }, [pensionId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (amount === "") { setError("Enter an amount (₹0 is fine)"); return; }
    setLoading(true); setError("");
    const res = await api.recordIncome({ amount: parseFloat(amount), notes: notes || undefined });
    setLoading(false);
    if (!res.success) { setError(res.error || "Failed to record income"); return; }
    if (res.safe_savings_target != null) setNewTarget(res.safe_savings_target);
    setSubmitted(true);
  };

  const quickAmounts = [0, 200, 300, 400, 500, 600, 800, 1000];

  if (submitted) return (
    <motion.div initial={{ opacity:0,x:20 }} animate={{ opacity:1,x:0 }} style={{ display:"flex",flexDirection:"column",gap:16 }}>
      <div style={{ textAlign:"center",padding:"16px 0" }}>
        <motion.div initial={{ scale:0 }} animate={{ scale:1 }} transition={{ type:"spring",stiffness:200,damping:12 }}
          style={{ width:80,height:80,borderRadius:"50%",background:C.emerald50,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 12px",fontSize:40 }}>✅</motion.div>
        <div style={{ fontSize:22,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.slate800 }}>Income Recorded!</div>
        <div style={{ fontSize:14,color:C.slate400,marginTop:4 }}>₹{parseFloat(amount).toLocaleString("en-IN")} logged</div>
        <div style={{ display:"inline-block",marginTop:8,background:C.amber50,color:C.amber600,fontSize:12,fontWeight:700,borderRadius:99,padding:"4px 14px" }}>📝 Self-reported</div>
      </div>
      {newTarget != null && (
        <div style={{ ...card,overflow:"hidden" }}>
          <div style={{ background:C.indigo50,borderBottom:`1px solid ${C.indigo100}`,padding:"10px 18px" }}>
            <div style={{ ...LABEL,color:C.indigo500 }}>Savings Target Updated</div>
          </div>
          <div style={{ padding:"16px 20px",display:"grid",gridTemplateColumns:"1fr auto 1fr",alignItems:"center",gap:12 }}>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:11,color:C.slate400,marginBottom:4 }}>Before</div>
              <div style={{ fontSize:22,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.slate400 }}>{formatRupee(prevTarget??0,0)}</div>
            </div>
            <div style={{ width:28,height:28,borderRadius:"50%",background:C.indigo50,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:C.indigo600 }}>→</div>
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:11,color:C.indigo500,marginBottom:4,fontWeight:700 }}>New</div>
              <div style={{ fontSize:24,fontWeight:800,fontFamily:"Sora,sans-serif",color:newTarget>(prevTarget??0)?C.emerald600:C.red500 }}>{formatRupee(newTarget,0)}</div>
            </div>
          </div>
        </div>
      )}
      <div style={{ display:"flex",gap:10 }}>
        <button onClick={()=>{ setSubmitted(false); setAmount(""); setNotes(""); setNewTarget(null); }}
          style={{ flex:1,padding:13,borderRadius:12,border:`2px solid ${C.slate200}`,background:"transparent",color:C.slate600,fontWeight:800,cursor:"pointer",fontFamily:"Nunito,sans-serif",fontSize:14 }}>Log Another</button>
        <button onClick={()=>window.history.back()}
          style={{ ...btnBase,flex:2,background:"linear-gradient(135deg,#4f46e5,#6366f1)",color:C.white,boxShadow:"0 8px 24px -4px rgba(79,70,229,0.4)" }}>Done ✓</button>
      </div>
    </motion.div>
  );

  return (
    <form onSubmit={handleSubmit} style={{ display:"flex",flexDirection:"column",gap:14 }}>
      <div style={{ background:C.amber50,border:`1px solid ${C.amber100}`,borderRadius:12,padding:"12px 16px",fontSize:13,color:C.amber600,display:"flex",gap:8 }}>
        <span style={{ fontSize:16,flexShrink:0 }}>⚠️</span>
        <span>Self-reported income is <strong>not verified</strong>. Use Verified Income for a health score boost.</span>
      </div>
      <div>
        <label style={{ fontSize:13,fontWeight:700,color:C.slate700,display:"block",marginBottom:6 }}>Today's Earnings</label>
        <div style={{ position:"relative",marginBottom:10 }}>
          <span style={{ position:"absolute",left:14,top:"50%",transform:"translateY(-50%)",fontSize:22,fontWeight:800,color:C.slate400 }}>₹</span>
          <input type="number" inputMode="numeric" value={amount} onChange={e=>{ setAmount(e.target.value); setError(""); }} placeholder="0"
            style={{ width:"100%",border:`1.5px solid ${C.slate200}`,borderRadius:14,background:C.slate50,paddingLeft:44,paddingRight:16,paddingTop:14,paddingBottom:14,fontSize:28,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.slate800,outline:"none",boxSizing:"border-box" }} />
        </div>
        <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8 }}>
          {quickAmounts.map(a => {
            const active = parseFloat(amount) === a && !(amount === "" && a !== 0);
            return (
              <button key={a} type="button" onClick={() => setAmount(String(a))}
                style={{ padding:"9px 4px",borderRadius:10,fontSize:13,fontWeight:800,border:`1.5px solid ${active?C.indigo600:C.slate200}`,background:active?C.indigo600:C.white,color:active?C.white:C.slate600,cursor:"pointer",fontFamily:"Nunito,sans-serif",transition:"all 0.15s" }}>
                {a===0?"₹0":`₹${a}`}
              </button>
            );
          })}
        </div>
        <div style={{ fontSize:12,color:C.slate400,marginTop:8 }}>Enter ₹0 if no work today — no penalty!</div>
      </div>
      <div>
        <label style={{ fontSize:13,fontWeight:700,color:C.slate700,display:"block",marginBottom:6 }}>Notes <span style={{ fontWeight:400,color:C.slate400 }}>(optional)</span></label>
        <input type="text" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="e.g. Rainy day, less work" maxLength={100}
          style={{ width:"100%",border:`1.5px solid ${C.slate200}`,borderRadius:12,background:C.slate50,padding:"11px 16px",fontSize:14,color:C.slate700,fontFamily:"Nunito,sans-serif",outline:"none",boxSizing:"border-box" }} />
      </div>
      {error && <div style={{ background:C.red50,border:`1px solid ${C.red100}`,borderRadius:12,padding:"11px 15px",fontSize:13,color:C.red500,display:"flex",gap:8 }}>⚠️ {error}</div>}
      <button type="submit" disabled={loading||amount===""} style={{ ...btnBase,background:"linear-gradient(135deg,#4f46e5,#6366f1)",color:C.white,boxShadow:"0 8px 24px -4px rgba(79,70,229,0.4)",opacity:loading||amount===""?0.6:1 }}>
        {loading ? <><span style={{ width:18,height:18,border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"white",borderRadius:"50%",animation:"spin 0.8s linear infinite",display:"inline-block" }}/>Saving…</> : "Record Income →"}
      </button>
    </form>
  );
}

// ─── INCOME PAGE ──────────────────────────────────────────────────────────────
export default function IncomePage() {
  const [mode, setMode] = useState("verified");

  return (
    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,maxWidth:900,alignItems:"start" }}>
      {/* LEFT */}
      <div style={{ display:"flex",flexDirection:"column",gap:18 }}>
        <div>
          <h2 style={{ fontSize:22,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.slate800,margin:0 }}>Record Income</h2>
          <p style={{ fontSize:14,color:C.slate400,marginTop:4 }}>Log today's earnings to keep your savings target accurate.</p>
        </div>

        {/* Mode tabs */}
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
          {[
            { id:"verified",icon:"🔲",label:"Verified Income",sub:"Payer scans QR · Health score boost",accent:C.violet600 },
            { id:"self",icon:"✏️",label:"Self Entered",sub:"Type income manually · No verification",accent:C.indigo600 },
          ].map(({ id,icon,label,sub,accent }) => (
            <motion.button key={id} whileHover={{ y:-2 }} whileTap={{ scale:0.97 }} onClick={() => setMode(id)}
              style={{ padding:"16px 18px",borderRadius:16,border:`2px solid ${mode===id?accent:C.slate200}`,background:mode===id?`${accent}12`:C.white,cursor:"pointer",textAlign:"left",transition:"all 0.15s",fontFamily:"Nunito,sans-serif" }}>
              <div style={{ fontSize:22,marginBottom:6 }}>{icon}</div>
              <div style={{ fontSize:14,fontWeight:800,color:mode===id?accent:C.slate700,marginBottom:2 }}>{label}</div>
              <div style={{ fontSize:11,color:mode===id?`${accent}aa`:C.slate400,lineHeight:1.4 }}>{sub}</div>
            </motion.button>
          ))}
        </div>

        <div style={{ ...card,padding:"24px 28px" }}>
          <AnimatePresence mode="wait">
            {mode === "verified" ? (
              <motion.div key="v" initial={{ opacity:0,x:12 }} animate={{ opacity:1,x:0 }} exit={{ opacity:0,x:-12 }} transition={{ duration:0.18 }}>
                <VerifiedIncomePanel />
              </motion.div>
            ) : (
              <motion.div key="s" initial={{ opacity:0,x:12 }} animate={{ opacity:1,x:0 }} exit={{ opacity:0,x:-12 }} transition={{ duration:0.18 }}>
                <SelfEnteredPanel />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* RIGHT: explainer */}
      <div style={{ display:"flex",flexDirection:"column",gap:18,position:"sticky",top:88 }}>
        <div style={{ ...card,padding:"22px 26px" }}>
          <div style={{ ...LABEL,color:C.slate400,marginBottom:14 }}>How {mode==="verified"?"QR Verification":"Self-Entry"} Works</div>
          {mode === "verified" ? (
            <div>
              {[
                { n:"1",title:"Generate QR",body:"Creates a secure token (5-min expiry) linking to your account.",c:C.violet600,bg:"#f5f3ff" },
                { n:"2",title:"Payer Scans",body:"No app needed — any phone camera opens the payment page directly.",c:C.blue600,bg:C.blue50 },
                { n:"3",title:"Cash or Paytm",body:"Payer selects Cash (enters amount) or Paytm (simulation). Amount confirmed.",c:C.emerald600,bg:C.emerald50 },
                { n:"4",title:"Auto Recorded",body:"Income saved as payer_verified — highest trust, maximum health score impact.",c:C.indigo600,bg:C.indigo50 },
              ].map(({ n,title,body,c,bg },i,arr) => (
                <div key={n} style={{ display:"flex",gap:14,paddingBottom:i<arr.length-1?18:0,position:"relative" }}>
                  {i<arr.length-1 && <div style={{ position:"absolute",left:14,top:30,width:2,height:"calc(100% - 14px)",background:C.slate100 }} />}
                  <div style={{ width:28,height:28,borderRadius:"50%",background:bg,border:`2px solid ${c}20`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:800,color:c,flexShrink:0,zIndex:1 }}>{n}</div>
                  <div>
                    <div style={{ fontSize:14,fontWeight:700,color:C.slate800,marginBottom:2 }}>{title}</div>
                    <div style={{ fontSize:12,color:C.slate500,lineHeight:1.5 }}>{body}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
              {[
                { emoji:"📝",title:"Type your income",body:"Enter what you earned today. Even ₹0 is fine — signals a rest day." },
                { emoji:"🤖",title:"Smart target adjusts",body:"FSP Engine reads your last 30 days and recalculates your savings goal." },
                { emoji:"⚠️",title:"No verification bonus",body:"Self-reported income doesn't get the payer-verified health score boost." },
              ].map(({ emoji,title,body }) => (
                <div key={title} style={{ display:"flex",gap:12,padding:"12px 14px",background:C.slate50,borderRadius:12 }}>
                  <span style={{ fontSize:20,flexShrink:0 }}>{emoji}</span>
                  <div>
                    <div style={{ fontSize:13,fontWeight:700,color:C.slate700,marginBottom:2 }}>{title}</div>
                    <div style={{ fontSize:12,color:C.slate500,lineHeight:1.5 }}>{body}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Comparison */}
        <div style={{ ...card,padding:"20px 24px" }}>
          <div style={{ ...LABEL,color:C.slate400,marginBottom:14 }}>Income Type Comparison</div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:0,border:`1px solid ${C.slate100}`,borderRadius:14,overflow:"hidden" }}>
            {[
              { label:"🔲 Verified",items:["Health score boost","Payer confirmed","Trusted by system","Better credit rating"],c:C.violet600,bg:"#faf5ff",active:mode==="verified" },
              { label:"✏️ Self-entered",items:["No extra steps","Instant recording","Works always","No score bonus"],c:C.indigo600,bg:C.indigo50,active:mode==="self" },
            ].map(({ label,items,c,bg,active }) => (
              <div key={label} style={{ background:active?bg:C.white,padding:"14px 16px",borderRight:label.includes("Verified")?`1px solid ${C.slate100}`:"none",transition:"background 0.2s" }}>
                <div style={{ fontSize:12,fontWeight:800,color:c,marginBottom:10 }}>{label}</div>
                {items.map(it => (
                  <div key={it} style={{ fontSize:11,color:C.slate600,marginBottom:5,display:"flex",gap:5 }}>
                    <span style={{ color:active?c:C.slate300 }}>•</span>{it}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div style={{ background:C.blue50,border:`1px solid ${C.blue100}`,borderRadius:14,padding:"14px 18px",display:"flex",gap:10,fontSize:12,color:C.blue600,alignItems:"flex-start" }}>
          <span style={{ fontSize:18,flexShrink:0 }}>🔒</span>
          <span>QR tokens expire in <strong>5 minutes</strong> and are single-use. Once paid, the token is invalidated automatically.</span>
        </div>
      </div>
    </div>
  );
}

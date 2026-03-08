/**
 * DepositPage.jsx — Desktop layout, pure inline styles.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import * as api from "../services/api";
import { formatRupee, computeVaultSplit } from "../utils/helpers";

const C = {
  indigo600:"#4f46e5",indigo50:"#eef2ff",indigo100:"#e0e7ff",
  emerald600:"#059669",emerald500:"#10b981",emerald50:"#ecfdf5",emerald100:"#d1fae5",
  amber600:"#d97706",amber400:"#fbbf24",amber50:"#fffbeb",amber100:"#fef3c7",
  slate800:"#1e293b",slate700:"#334155",slate600:"#475569",
  slate500:"#64748b",slate400:"#94a3b8",slate200:"#e2e8f0",slate100:"#f1f5f9",slate50:"#f8fafc",
  red500:"#ef4444",red50:"#fef2f2",red100:"#fee2e2",
  white:"#ffffff",
};
const card = { background:C.white, borderRadius:20, border:`1px solid ${C.slate100}`, boxShadow:"0 2px 12px -2px rgba(79,70,229,0.07),0 1px 4px rgba(0,0,0,0.04)" };
const inputLg = { width:"100%",border:`1.5px solid ${C.slate200}`,borderRadius:14,background:C.slate50,paddingLeft:44,paddingRight:16,paddingTop:16,paddingBottom:16,fontSize:32,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.slate800,outline:"none",boxSizing:"border-box" };
const btnPrimary = { background:"linear-gradient(135deg,#4f46e5,#6366f1)",color:C.white,fontSize:15,fontWeight:800,padding:"14px 24px",borderRadius:14,border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",gap:8,boxShadow:"0 8px 24px -4px rgba(79,70,229,0.45)",fontFamily:"Nunito,sans-serif",width:"100%" };

function SplitPreview({ amount }) {
  if (!amount||parseFloat(amount)<=0) return null;
  const { pension, liquid } = computeVaultSplit(parseFloat(amount));
  return (
    <motion.div initial={{ opacity:0,y:6 }} animate={{ opacity:1,y:0 }} style={{ borderRadius:16,overflow:"hidden",border:`1px solid ${C.slate100}` }}>
      <div style={{ height:6,background:C.emerald500,position:"relative" }}>
        <motion.div initial={{ width:0 }} animate={{ width:"80%" }} transition={{ duration:0.6,ease:"easeOut" }}
          style={{ position:"absolute",left:0,top:0,height:"100%",background:C.amber400 }} />
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",background:C.white }}>
        {[
          { label:"🔒 Pension (80%)",value:pension,color:C.amber600,bg:C.amber50,sub:"Locked for retirement" },
          { label:"💧 Liquid (20%)", value:liquid, color:C.emerald600,bg:C.emerald50,sub:"Emergency access" },
        ].map(({ label,value,color,bg,sub })=>(
          <div key={label} style={{ padding:"16px 20px",borderRight:label.includes("Pension")?`1px solid ${C.slate100}`:"none",background:bg }}>
            <div style={{ fontSize:11,fontWeight:800,color,marginBottom:6 }}>{label}</div>
            <div style={{ fontSize:20,fontWeight:800,fontFamily:"Sora,sans-serif",color }}>{formatRupee(value,0)}</div>
            <div style={{ fontSize:11,color:C.slate400,marginTop:3 }}>{sub}</div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function SuccessModal({ amount, onDone }) {
  const { pension, liquid } = computeVaultSplit(parseFloat(amount));
  return (
    <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} style={{ position:"fixed",inset:0,background:"rgba(0,0,0,0.45)",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:24 }}>
      <motion.div initial={{ scale:0.85,opacity:0,y:20 }} animate={{ scale:1,opacity:1,y:0 }} transition={{ type:"spring",stiffness:180,damping:14 }}
        style={{ background:C.white,borderRadius:24,padding:40,maxWidth:420,width:"100%",textAlign:"center",boxShadow:"0 32px 80px rgba(0,0,0,0.22)" }}>
        <motion.div initial={{ scale:0 }} animate={{ scale:1 }} transition={{ type:"spring",stiffness:250,damping:12,delay:0.1 }}
          style={{ width:80,height:80,borderRadius:"50%",background:"linear-gradient(135deg,#d1fae5,#a7f3d0)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px" }}>
          <svg width="36" height="36" fill="none" viewBox="0 0 36 36" stroke="#059669" strokeWidth="2.5"><path d="M8 18l7 7 13-13" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </motion.div>
        <h3 style={{ fontSize:24,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.slate800,marginBottom:6 }}>Deposit Saved!</h3>
        <p style={{ fontSize:14,color:C.slate400,marginBottom:24 }}>{formatRupee(parseFloat(amount))} added to your pension</p>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:24 }}>
          {[{ label:"🔒 Pension",val:pension,bg:C.amber50,c:C.amber600 },{ label:"💧 Liquid",val:liquid,bg:C.emerald50,c:C.emerald600 }].map(({ label,val,bg,c })=>(
            <div key={label} style={{ background:bg,borderRadius:14,padding:16 }}>
              <div style={{ fontSize:11,fontWeight:800,color:c,marginBottom:6 }}>{label}</div>
              <div style={{ fontSize:18,fontWeight:800,fontFamily:"Sora,sans-serif",color:c }}>{formatRupee(val,0)}</div>
            </div>
          ))}
        </div>
        <button onClick={onDone} style={{ ...btnPrimary }}>Done ✓</button>
      </motion.div>
    </motion.div>
  );
}

export default function DepositPage() {
  const { user, pensionId, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState("direct");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showSuccess, setShowSuccess] = useState(false);
  const [token, setToken] = useState(null);
  const [tokenExpiry, setTokenExpiry] = useState(null);
  const [target, setTarget] = useState(null);

  useEffect(() => {
    if (!pensionId) return;
    api.getSavingsTarget(pensionId).then(r => {
      if (r?.safe_savings_target){ setTarget(r.safe_savings_target); setAmount(String(Math.ceil(r.safe_savings_target))); }
    });
  }, [pensionId]);

  const handleDeposit = async () => {
    if (!amount||parseFloat(amount)<=0){ setError("Enter a valid amount"); return; }
    setLoading(true); setError("");
    const res = await api.deposit({ amount:parseFloat(amount) });
    setLoading(false);
    if (!res.success){ setError(res.error||"Deposit failed"); return; }
    await refreshUser(); setShowSuccess(true);
  };

  const handleToken = async () => {
    if (!amount||parseFloat(amount)<=0){ setError("Enter a valid amount"); return; }
    setLoading(true); setError("");
    const res = await api.generateCashToken({ amount:parseFloat(amount) });
    setLoading(false);
    if (!res.success){ setError(res.error||"Failed to generate code"); return; }
    setToken(res.token_id); setTokenExpiry(res.expires_at);
  };

  const quickAmounts = [50,100,200,500];
  if (target&&!quickAmounts.includes(Math.ceil(target))) quickAmounts.unshift(Math.ceil(target));

  return (
    <>
      {showSuccess && <SuccessModal amount={amount} onDone={()=>{ setShowSuccess(false); navigate("/dashboard"); }} />}
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:24,maxWidth:900 }}>

        {/* Left: form */}
        <div style={{ display:"flex",flexDirection:"column",gap:18 }}>
          {/* Balance */}
          <div style={{ background:"linear-gradient(135deg,#eef2ff,#ede9fe)",borderRadius:20,padding:"20px 24px",border:`1px solid ${C.indigo100}`,display:"flex",justifyContent:"space-between",alignItems:"center" }}>
            <div>
              <div style={{ fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",color:"#818cf8",marginBottom:4 }}>Your Total Savings</div>
              <div style={{ fontSize:28,fontWeight:800,fontFamily:"Sora,sans-serif",color:"#312e81" }}>{formatRupee((user?.pension_vault??0)+(user?.liquid_vault??0),0)}</div>
            </div>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontSize:12,color:C.slate400,marginBottom:2 }}>Liquid available</div>
              <div style={{ fontSize:22,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.emerald600 }}>{formatRupee(user?.liquid_vault??0,0)}</div>
            </div>
          </div>

          {/* Info */}
          <div style={{ background:C.indigo50,border:`1px solid ${C.indigo100}`,borderRadius:14,padding:"12px 16px",display:"flex",gap:10,fontSize:13,color:C.indigo600 }}>
            <span style={{ fontSize:18,flexShrink:0 }}>💡</span>
            <span>Every deposit auto-splits: <strong>80% pension (locked)</strong> + <strong>20% liquid (emergency)</strong></span>
          </div>

          {/* Mode tabs */}
          <div style={{ display:"flex",background:C.slate100,borderRadius:14,padding:4,gap:4 }}>
            {[["direct","📱 Direct Deposit"],["agent","🤝 Via Agent"]].map(([m,lbl])=>(
              <button key={m} onClick={()=>{ setMode(m); setToken(null); setError(""); }}
                style={{ flex:1,padding:"10px",borderRadius:10,fontSize:13,fontWeight:800,border:"none",cursor:"pointer",fontFamily:"Nunito,sans-serif",background:mode===m?C.white:"transparent",color:mode===m?"#4338ca":C.slate500,boxShadow:mode===m?"0 1px 4px rgba(0,0,0,0.08)":"none",transition:"all 0.15s" }}>
                {lbl}
              </button>
            ))}
          </div>

          {/* Amount input */}
          {!token && (
            <div>
              <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8 }}>
                <label style={{ fontSize:13,fontWeight:700,color:C.slate700 }}>Amount</label>
                {target && <button onClick={()=>setAmount(String(Math.ceil(target)))} style={{ fontSize:11,fontWeight:800,color:C.indigo600,background:C.indigo50,border:"none",borderRadius:99,padding:"4px 12px",cursor:"pointer" }}>Suggested ₹{Math.ceil(target)}</button>}
              </div>
              <div style={{ position:"relative",marginBottom:12 }}>
                <span style={{ position:"absolute",left:16,top:"50%",transform:"translateY(-50%)",fontSize:22,fontWeight:800,color:C.slate400 }}>₹</span>
                <input type="number" inputMode="numeric" value={amount} onChange={e=>{ setAmount(e.target.value); setError(""); }} placeholder="0" style={inputLg} />
              </div>
              <div style={{ display:"flex",gap:8,flexWrap:"wrap" }}>
                {quickAmounts.slice(0,5).map(a=>(
                  <button key={a} onClick={()=>setAmount(String(a))}
                    style={{ padding:"8px 16px",borderRadius:10,fontSize:13,fontWeight:800,border:`1.5px solid ${parseFloat(amount)===a?C.indigo600:C.slate200}`,background:parseFloat(amount)===a?C.indigo600:C.white,color:parseFloat(amount)===a?C.white:C.slate600,cursor:"pointer",fontFamily:"Nunito,sans-serif",transition:"all 0.15s" }}>
                    ₹{a}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Agent token */}
          {token && (
            <div style={{ textAlign:"center",padding:"20px 0" }}>
              <p style={{ fontSize:14,color:C.slate500,marginBottom:16 }}>Show this code to your agent</p>
              <div style={{ display:"inline-flex",alignItems:"center",justifyContent:"center",width:160,height:160,borderRadius:24,border:`4px solid ${C.indigo600}`,background:C.indigo50,marginBottom:12 }}>
                <div>
                  <div style={{ fontSize:36,fontWeight:800,fontFamily:"'JetBrains Mono',monospace",color:C.indigo700,letterSpacing:"0.1em" }}>{token}</div>
                  <div style={{ fontSize:11,color:C.indigo400,marginTop:4 }}>6-digit code</div>
                </div>
              </div>
            </div>
          )}

          {/* Agent instructions */}
          {mode==="agent"&&!token && (
            <div style={{ background:C.amber50,border:`1px solid ${C.amber100}`,borderRadius:16,padding:"16px 20px" }}>
              <p style={{ fontSize:14,fontWeight:700,color:C.amber600,marginBottom:10 }}>How agent deposit works</p>
              {["Enter the cash amount","Generate a code and show it to your agent","Hand over the cash","Agent confirms → credited instantly"].map((s,i)=>(
                <div key={i} style={{ display:"flex",gap:10,marginBottom:8 }}>
                  <div style={{ width:20,height:20,borderRadius:"50%",background:C.amber100,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:C.amber600,flexShrink:0 }}>{i+1}</div>
                  <span style={{ fontSize:13,color:C.amber600 }}>{s}</span>
                </div>
              ))}
            </div>
          )}

          {error && <div style={{ background:C.red50,border:`1px solid ${C.red100}`,borderRadius:12,padding:"12px 16px",fontSize:13,color:C.red500,display:"flex",gap:8 }}>⚠️ {error}</div>}

          {mode==="direct" ? (
            <button onClick={handleDeposit} disabled={loading||!amount||parseFloat(amount)<=0} style={{ ...btnPrimary,opacity:loading||!amount?0.6:1,cursor:loading?"wait":"pointer" }}>
              {loading?<><span style={{ width:18,height:18,border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"white",borderRadius:"50%",animation:"spin 0.8s linear infinite",display:"inline-block" }}/>Processing…</>:<>Deposit Now →</>}
            </button>
          ) : token ? (
            <button onClick={()=>{ setToken(null); setTokenExpiry(null); }} style={{ ...btnPrimary,background:C.slate100,color:C.slate600,boxShadow:"none" }}>Generate New Code</button>
          ) : (
            <button onClick={handleToken} disabled={loading||!amount||parseFloat(amount)<=0} style={{ ...btnPrimary,background:"linear-gradient(135deg,#059669,#10b981)",boxShadow:"0 8px 24px -4px rgba(5,150,105,0.4)",opacity:loading||!amount?0.6:1 }}>
              {loading?<><span style={{ width:18,height:18,border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"white",borderRadius:"50%",animation:"spin 0.8s linear infinite",display:"inline-block" }}/>Generating…</>:"Generate Agent Code 🤝"}
            </button>
          )}
        </div>

        {/* Right: split preview */}
        <div style={{ display:"flex",flexDirection:"column",gap:18 }}>
          <SplitPreview amount={amount} />
          {(!amount||parseFloat(amount)<=0) && (
            <div style={{ ...card,padding:24,textAlign:"center",color:C.slate400 }}>
              <div style={{ fontSize:40,marginBottom:10 }}>💡</div>
              <p style={{ fontSize:14,fontWeight:600 }}>Enter an amount to see how it splits between your pension and liquid vaults.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

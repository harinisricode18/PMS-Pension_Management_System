/**
 * DashboardPage.jsx — Desktop website layout
 * Pure inline styles — no Tailwind dependency whatsoever.
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, useMotionValue, useSpring } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import * as api from "../services/api";
import {
  formatRupee, formatRelativeTime, getTxnDisplay,
} from "../utils/helpers";

// ─── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  indigo900:"#312e81", indigo700:"#4338ca", indigo600:"#4f46e5", indigo500:"#6366f1",
  indigo100:"#e0e7ff", indigo50:"#eef2ff",
  emerald600:"#059669", emerald500:"#10b981", emerald50:"#ecfdf5",
  amber500:"#f59e0b", amber400:"#fbbf24", amber50:"#fffbeb",
  red500:"#ef4444", red50:"#fef2f2",
  slate800:"#1e293b", slate700:"#334155", slate600:"#475569",
  slate500:"#64748b", slate400:"#94a3b8", slate300:"#cbd5e1",
  slate200:"#e2e8f0", slate100:"#f1f5f9", slate50:"#f8fafc",
  white:"#ffffff",
};
const card = { background:C.white, borderRadius:20, border:`1px solid ${C.slate100}`, boxShadow:"0 2px 12px -2px rgba(79,70,229,0.07),0 1px 4px rgba(0,0,0,0.04)" };
const LABEL = { fontSize:11, fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", color:C.slate400 };

// ─── Animated rupee counter ─────────────────────────────────────────────────
function AnimatedRupee({ value, size=42, color=C.white }) {
  const ref = useRef(null);
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { stiffness:55, damping:18 });
  useEffect(() => { motionVal.set(value); }, [value, motionVal]);
  useEffect(() => spring.on("change", v => {
    if (ref.current) ref.current.textContent = "₹" + new Intl.NumberFormat("en-IN",{minimumFractionDigits:0,maximumFractionDigits:0}).format(v);
  }), [spring]);
  return <span ref={ref} style={{ fontSize:size, fontWeight:800, fontFamily:"Sora,sans-serif", color, lineHeight:1.1 }}>₹0</span>;
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
function Skel({ h=80, r=16 }) {
  return <div style={{ height:h, borderRadius:r, background:`linear-gradient(90deg,${C.slate100} 0%,${C.slate200} 50%,${C.slate100} 100%)`, backgroundSize:"200% 100%", animation:"shimmer 1.4s ease-in-out infinite" }} />;
}

// ─── Vault Hero Card ─────────────────────────────────────────────────────────
function VaultCard({ pension=0, liquid=0 }) {
  const total = pension + liquid;
  const pPct = total > 0 ? (pension/total)*100 : 80;
  return (
    <div style={{ borderRadius:24, overflow:"hidden", position:"relative",
      background:"linear-gradient(135deg,#312e81 0%,#4338ca 50%,#6366f1 100%)",
      boxShadow:"0 20px 60px -12px rgba(79,70,229,0.5),0 8px 24px -8px rgba(0,0,0,0.15)",
      padding:"32px 36px", color:C.white }}>
      {/* Decorative rings */}
      <div style={{ position:"absolute",right:-50,top:-50,width:220,height:220,borderRadius:"50%",border:"1px solid rgba(255,255,255,0.07)",pointerEvents:"none" }} />
      <div style={{ position:"absolute",right:20,bottom:-40,width:140,height:140,borderRadius:"50%",background:"rgba(255,255,255,0.04)",pointerEvents:"none" }} />

      <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:8 }}>
        <span style={{ ...LABEL, color:"rgba(165,180,252,0.9)" }}>Total Savings</span>
        <span style={{ fontSize:11,fontWeight:700,background:"rgba(255,255,255,0.15)",padding:"4px 12px",borderRadius:99,color:"rgba(255,255,255,0.85)" }}>Active</span>
      </div>

      <AnimatedRupee value={total} size={56} color={C.white} />

      {/* Bar */}
      <div style={{ margin:"20px 0 8px",height:8,borderRadius:99,background:"rgba(255,255,255,0.2)",overflow:"hidden" }}>
        <motion.div initial={{ width:0 }} animate={{ width:`${pPct}%` }}
          transition={{ duration:1.1,ease:[0.22,1,0.36,1],delay:0.3 }}
          style={{ height:"100%",borderRadius:99,background:"linear-gradient(90deg,#fbbf24,#f59e0b)" }} />
      </div>
      <div style={{ display:"flex",gap:16,marginBottom:24 }}>
        {[["#fbbf24","rgba(253,230,138,0.8)",`Pension ${Math.round(pPct)}%`],
          ["#10b981","rgba(110,231,183,0.8)",`Liquid ${Math.round(100-pPct)}%`]].map(([dot,tc,lbl])=>(
          <div key={lbl} style={{ display:"flex",alignItems:"center",gap:6 }}>
            <div style={{ width:8,height:8,borderRadius:"50%",background:dot }} />
            <span style={{ fontSize:11,color:tc,fontWeight:600 }}>{lbl}</span>
          </div>
        ))}
      </div>

      {/* Vault cells */}
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
        {[
          { label:"Pension Vault",value:pension,sub:"Locked until age 60",dot:"#fbbf24",tc:"rgba(253,230,138,0.9)",icon:"🔒" },
          { label:"Liquid Vault", value:liquid, sub:"Emergency access",   dot:"#10b981",tc:"rgba(110,231,183,0.9)",icon:"💧" },
        ].map(({ label,value,sub,dot,tc,icon }) => (
          <div key={label} style={{ background:"rgba(255,255,255,0.1)",borderRadius:16,padding:"14px 18px",border:"1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:8 }}>
              <div style={{ width:7,height:7,borderRadius:"50%",background:dot }} />
              <span style={{ fontSize:11,fontWeight:700,color:tc }}>{icon} {label}</span>
            </div>
            <div style={{ fontSize:24,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.white }}>{formatRupee(value,0)}</div>
            <div style={{ fontSize:11,color:"rgba(255,255,255,0.35)",marginTop:3,fontWeight:600 }}>{sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Nudge card ───────────────────────────────────────────────────────────────
function NudgeCard({ state, graceMode, target, message }) {
  if (!state) return null;
  const map = {
    ACTIVE_WORK_DAY:    { bg:"#eef2ff",border:"#c7d2fe",text:"#4338ca",emoji:"💼" },
    REST_DAY:           { bg:"#eff6ff",border:"#bfdbfe",text:"#1d4ed8",emoji:"🌙" },
    GRACE_MODE:         { bg:"#fffbeb",border:"#fde68a",text:"#b45309",emoji:"🌤️" },
    BONUS_WORK_ON_REST: { bg:"#ecfdf5",border:"#a7f3d0",text:"#065f46",emoji:"⭐" },
    ZERO_INCOME_PENDING:{ bg:C.slate50, border:C.slate200,text:C.slate600,emoji:"📝" },
  };
  const c = map[state]||map.ACTIVE_WORK_DAY;
  const label = state.replace(/_/g," ").toLowerCase().replace(/\b\w/g,l=>l.toUpperCase());
  return (
    <motion.div initial={{ opacity:0,y:10 }} animate={{ opacity:1,y:0 }} transition={{ delay:0.15 }}
      style={{ background:c.bg,border:`1px solid ${c.border}`,borderRadius:16,padding:"14px 20px",display:"flex",alignItems:"center",gap:14 }}>
      <div style={{ width:44,height:44,borderRadius:12,background:"rgba(255,255,255,0.65)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0 }}>{c.emoji}</div>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:10,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.1em",color:c.text,marginBottom:3 }}>{label}</div>
        <div style={{ fontSize:14,fontWeight:600,color:c.text,opacity:0.85 }}>{message||"Have a great day!"}</div>
      </div>
      {!graceMode && target>0 && (
        <div style={{ background:"rgba(255,255,255,0.65)",borderRadius:99,padding:"5px 14px",fontSize:13,fontWeight:800,color:c.text,whiteSpace:"nowrap",flexShrink:0 }}>
          Save ₹{Math.ceil(target)}/day
        </div>
      )}
    </motion.div>
  );
}

// ─── Health ring ──────────────────────────────────────────────────────────────
function HealthRing({ score=0, insuranceStatus }) {
  const color = score>=700?C.emerald500:score>=400?C.amber500:C.red500;
  const label = score>=700?"Excellent":score>=400?"Good":"At Risk";
  const bgColor = score>=700?C.emerald50:score>=400?C.amber50:C.red50;
  const isActive = insuranceStatus==="ACTIVE";
  const r=36; const circ=2*Math.PI*r;
  return (
    <Link to="/guardian" style={{ textDecoration:"none",display:"block" }}>
      <motion.div whileHover={{ y:-2 }} style={{ ...card,padding:"20px 24px",display:"flex",alignItems:"center",gap:20,cursor:"pointer" }}>
        <div style={{ width:88,height:88,borderRadius:20,background:bgColor,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
          <svg width="80" height="80" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r={r} fill="none" stroke={C.slate200} strokeWidth="6"/>
            <motion.circle cx="40" cy="40" r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
              strokeDasharray={circ} initial={{ strokeDashoffset:circ }}
              animate={{ strokeDashoffset:circ*(1-score/1000) }}
              transition={{ duration:1.4,ease:[0.22,1,0.36,1],delay:0.4 }}
              style={{ transform:"rotate(-90deg)",transformOrigin:"50% 50%" }} />
            <text x="40" y="36" textAnchor="middle" fill={color} style={{ fontSize:"15px",fontFamily:"Sora,sans-serif",fontWeight:"800" }}>{score}</text>
            <text x="40" y="50" textAnchor="middle" fill={C.slate400} style={{ fontSize:"9px" }}>/1000</text>
          </svg>
        </div>
        <div style={{ flex:1 }}>
          <div style={{ ...LABEL,marginBottom:4 }}>Pension Health</div>
          <div style={{ fontSize:26,fontWeight:800,fontFamily:"Sora,sans-serif",color,lineHeight:1.2 }}>{label}</div>
          <div style={{ display:"flex",alignItems:"center",gap:6,marginTop:8,fontSize:13,fontWeight:700,color:isActive?C.emerald600:C.amber500 }}>
            <span>{isActive?"🛡️":"⚠️"}</span>
            <span>Insurance {isActive?"Active":"Paused"}</span>
          </div>
        </div>
        <span style={{ fontSize:20,color:C.slate300 }}>›</span>
      </motion.div>
    </Link>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user, pensionId } = useAuth();
  const navigate = useNavigate();
  const [guardian, setGuardian] = useState(null);
  const [projection, setProjection] = useState(null);
  const [txns, setTxns] = useState([]);
  const [txLoading, setTxLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (!pensionId) return;
    Promise.all([api.getGuardianStatus(pensionId), api.getRetirementProjection()])
      .then(([g,p]) => {
        if (g?.success!==false) setGuardian(g);
        if (p?.success) setProjection(p);
        setDataLoading(false);
      });
    api.getTransactions(pensionId).then(r => {
      setTxns(r?.transactions||r?.data||(Array.isArray(r)?r:[]));
      setTxLoading(false);
    });
  }, [pensionId]);

  const pension = user?.pension_vault??0;
  const liquid  = user?.liquid_vault??0;
  const score   = user?.pension_health_score??0;
  const ins     = user?.insurance_status??"PAUSED";

  const actions = [
    { label:"Save Money",      sub:"Make a deposit",    icon:"💰", grad:"linear-gradient(135deg,#4f46e5,#818cf8)", sh:"0 8px 24px -4px rgba(79,70,229,0.4)",   path:"/deposit" },
    { label:"Record Income",   sub:"Log today's work",  icon:"📈", grad:"linear-gradient(135deg,#059669,#34d399)", sh:"0 8px 24px -4px rgba(5,150,105,0.4)",    path:"/income" },
    { label:"Withdraw",        sub:"Emergency funds",   icon:"💸", grad:"linear-gradient(135deg,#d97706,#fbbf24)", sh:"0 8px 24px -4px rgba(217,119,6,0.4)",    path:"/withdraw" },
  ];

  return (
    <div style={{ display:"grid",gridTemplateColumns:"1fr 320px",gap:24,alignItems:"start" }}>

      {/* LEFT */}
      <div style={{ display:"flex",flexDirection:"column",gap:20 }}>
        <motion.div initial={{ opacity:0,y:20 }} animate={{ opacity:1,y:0 }}>
          <VaultCard pension={pension} liquid={liquid} />
        </motion.div>

        {dataLoading ? <Skel h={72} r={16}/> : (
          <NudgeCard state={guardian?.state} graceMode={guardian?.grace_mode} target={guardian?.user_facing_target} message={guardian?.message} />
        )}

        {/* Actions */}
        <div>
          <div style={{ fontSize:17,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.slate800,marginBottom:14 }}>Quick Actions</div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14 }}>
            {actions.map(a => (
              <motion.button key={a.path} whileHover={{ y:-3 }} whileTap={{ scale:0.95 }} onClick={() => navigate(a.path)}
                style={{ background:a.grad,boxShadow:a.sh,borderRadius:20,padding:"22px 16px",color:C.white,textAlign:"center",cursor:"pointer",border:"none",width:"100%",display:"flex",flexDirection:"column",alignItems:"center",gap:10,fontFamily:"Nunito,sans-serif" }}>
                <span style={{ fontSize:36 }}>{a.icon}</span>
                <div>
                  <div style={{ fontSize:15,fontWeight:800,fontFamily:"Sora,sans-serif" }}>{a.label}</div>
                  <div style={{ fontSize:11,color:"rgba(255,255,255,0.65)",fontWeight:600,marginTop:2 }}>{a.sub}</div>
                </div>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Transactions */}
        <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} transition={{ delay:0.2 }}
          style={{ ...card,padding:"24px 28px" }}>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16 }}>
            <span style={{ fontSize:17,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.slate800 }}>Recent Activity</span>
            <Link to="/transactions" style={{ fontSize:13,fontWeight:700,color:C.indigo600,textDecoration:"none" }}>View all →</Link>
          </div>
          {txLoading ? (
            <div style={{ display:"flex",flexDirection:"column",gap:10 }}>{[1,2,3].map(i=><Skel key={i} h={58} r={12}/>)}</div>
          ) : txns.length===0 ? (
            <div style={{ textAlign:"center",padding:"32px 0",color:C.slate400 }}>
              <div style={{ fontSize:40,marginBottom:8 }}>📭</div>
              <div style={{ fontSize:14,fontWeight:600 }}>No transactions yet. Start saving!</div>
            </div>
          ) : txns.slice(0,5).map((t,i) => {
            const d = getTxnDisplay(t.type||t.transaction_type);
            const amt = t.amount||0;
            const isDep = (t.type||t.transaction_type||"").includes("DEPOSIT");
            return (
              <motion.div key={t._id||i} initial={{ opacity:0,x:-10 }} animate={{ opacity:1,x:0 }} transition={{ delay:0.05*i }}
                style={{ display:"flex",alignItems:"center",gap:14,padding:"13px 0",borderBottom:i<txns.slice(0,5).length-1?`1px solid ${C.slate100}`:"none" }}>
                <div style={{ width:42,height:42,borderRadius:12,background:isDep?C.emerald50:C.red50,display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,flexShrink:0 }}>{d.emoji}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14,fontWeight:700,color:C.slate700 }}>{d.label}</div>
                  <div style={{ fontSize:12,color:C.slate400,marginTop:2 }}>{formatRelativeTime(t.date||t.timestamp)}</div>
                </div>
                <div style={{ fontSize:15,fontWeight:800,fontFamily:"Sora,sans-serif",color:isDep?C.emerald600:C.red500 }}>{isDep?"+":"−"}{formatRupee(Math.abs(amt),0)}</div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>

      {/* RIGHT SIDEBAR */}
      <div style={{ display:"flex",flexDirection:"column",gap:18,position:"sticky",top:88 }}>
        <motion.div initial={{ opacity:0,x:20 }} animate={{ opacity:1,x:0 }} transition={{ delay:0.1 }}>
          <HealthRing score={score} insuranceStatus={ins} />
        </motion.div>

        {/* Retirement */}
        {projection && (
          <motion.div initial={{ opacity:0,x:20 }} animate={{ opacity:1,x:0 }} transition={{ delay:0.18 }}
            style={{ ...card,padding:"20px 24px",background:"linear-gradient(135deg,#eef2ff,#ede9fe)",border:"1px solid #e0e7ff",position:"relative",overflow:"hidden" }}>
            <div style={{ position:"absolute",right:16,top:12,fontSize:48,opacity:0.15 }}>🌅</div>
            <div style={{ ...LABEL,color:C.indigo500,marginBottom:6 }}>Retirement Projection</div>
            <div style={{ fontSize:30,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.indigo900 }}>{formatRupee(projection.estimated_monthly_pension,0)}</div>
            <div style={{ fontSize:13,color:C.slate500,marginTop:2 }}>per month at age 60</div>
            {projection.years_remaining>0 && (
              <div style={{ fontSize:12,color:C.indigo500,marginTop:8,fontWeight:600 }}>
                {projection.years_remaining} years to retirement 💪
              </div>
            )}
          </motion.div>
        )}

        {/* Breakdown */}
        <motion.div initial={{ opacity:0,x:20 }} animate={{ opacity:1,x:0 }} transition={{ delay:0.22 }}
          style={{ ...card,padding:"20px 24px" }}>
          <div style={{ ...LABEL,marginBottom:14 }}>Vault Breakdown</div>
          {[
            { label:"Pension Vault",value:pension,color:"#fbbf24",pct:"80%" },
            { label:"Liquid Vault", value:liquid, color:"#10b981",pct:"20%" },
          ].map(({ label,value,color,pct }) => (
            <div key={label} style={{ marginBottom:14 }}>
              <div style={{ display:"flex",justifyContent:"space-between",marginBottom:6 }}>
                <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                  <div style={{ width:8,height:8,borderRadius:"50%",background:color }} />
                  <span style={{ fontSize:13,fontWeight:700,color:C.slate600 }}>{label}</span>
                </div>
                <span style={{ fontSize:13,fontWeight:800,fontFamily:"Sora,sans-serif",color:C.slate700 }}>{formatRupee(value,0)}</span>
              </div>
              <div style={{ height:6,borderRadius:99,background:C.slate100 }}>
                <div style={{ height:"100%",borderRadius:99,background:color,width:pct }} />
              </div>
            </div>
          ))}
        </motion.div>

        {/* Nav links */}
        <motion.div initial={{ opacity:0,x:20 }} animate={{ opacity:1,x:0 }} transition={{ delay:0.26 }}
          style={{ ...card,padding:"16px 20px" }}>
          <div style={{ ...LABEL,marginBottom:12 }}>Navigate</div>
          {[
            { to:"/transactions",label:"Transaction History",emoji:"📋" },
            { to:"/guardian",    label:"Guardian Status",   emoji:"🛡️" },
            { to:"/notifications",label:"Notifications",    emoji:"🔔" },
            { to:"/profile",     label:"My Profile",        emoji:"👤" },
          ].map(({ to,label,emoji },i,arr) => (
            <Link key={to} to={to} style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:i<arr.length-1?`1px solid ${C.slate100}`:"none",textDecoration:"none",color:C.slate700,fontSize:14,fontWeight:600 }}>
              <span style={{ fontSize:18 }}>{emoji}</span>
              <span style={{ flex:1 }}>{label}</span>
              <span style={{ color:C.slate300,fontSize:16 }}>›</span>
            </Link>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

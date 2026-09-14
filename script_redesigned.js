/* ================================================================
   CONFIG
   ================================================================ */



 const CONFIG = {
  API_URL: "http://127.0.0.1:8000/api/nodes/latest",
  POST_API: "http://127.0.0.1:8000/api/sensor-data",
  POLL_INTERVAL_MS: 4000,
};

const NODE_LABELS = { /* "A1":"Shaft A-12" */ };

/* ================================================================
   RISK ENGINE  (ported 1:1 from evaluate_node_risk.py)
   ================================================================ */
function evaluateNodeRisk(cur, prev) {
  const n = v => (typeof v==='number'&&isFinite(v))?v:0;
  cur = { temperature:n(cur.temperature), co_gas_level:n(cur.co_gas_level),
          vibration:n(cur.vibration), distance_mm:n(cur.distance_mm),
          roof_load_kg:n(cur.roof_load_kg), pitch:n(cur.pitch), roll:n(cur.roll) };

  if (cur.distance_mm>=8000 && cur.roof_load_kg<=0.1 && cur.pitch===0)
    return { risk_score:0, anomaly_flag:"OFFLINE", prediction:"Hardware tampered or disconnected." };

  let risk=0; const msgs=[];
  if (cur.temperature>40)      { risk+=40; msgs.push("Critical heat detected"); }
  else if (cur.temperature>35) { risk+=20; msgs.push("Heat levels rising"); }
  if (cur.co_gas_level>2000)   { risk+=50; msgs.push("Toxic CO levels (Asphyxiation risk)"); }
  else if (cur.co_gas_level>1000){ risk+=30; msgs.push("Poor ventilation (CO building up)"); }
  if (cur.vibration>1.0)       { risk+=50; msgs.push("Severe seismic instability"); }
  else if (cur.vibration>0.5)  { risk+=20; msgs.push("Abnormal structural rumbling"); }
  if (cur.distance_mm>0&&cur.distance_mm<1000){ risk+=40; msgs.push("Roof sagging dangerously low"); }
  if (cur.roof_load_kg>4.0)    { risk+=30; msgs.push("Support beams exceeding safe load capacity"); }
  if (cur.temperature>38&&cur.co_gas_level>1500){ risk=100; msgs.push("ACTIVE FIRE PREDICTION"); }
  if ((Math.abs(cur.pitch)>10||Math.abs(cur.roll)>10)&&cur.roof_load_kg>4.0)
    { risk=100; msgs.push("IMMINENT ROOF COLLAPSE PREDICTED"); }
  if (prev) {
    if (cur.co_gas_level - prev.co_gas_level > 500)  { risk+=50; msgs.push("SUDDEN GAS LEAK (Toxic seam breached)"); }
    if (cur.roof_load_kg - prev.roof_load_kg > 1.5)  { risk=100; msgs.push("RAPID ROOF DROP (Evacuate instantly)"); }
    if (cur.temperature  - prev.temperature  > 5.0)  { risk+=30; msgs.push("Flash heating (Friction/Electrical fire starting)"); }
  }
  const final=Math.min(risk,100);
  let flag = final>=90?"CRITICAL": final>=70?"HAZARD": final>=40?"WARNING":"NORMAL";
  if (flag==="NORMAL"&&!msgs.length) msgs.push("Conditions stable. No immediate threats.");
  return { risk_score:final, anomaly_flag:flag, prediction:msgs.join(" | ") };
}

/* ================================================================
   ALERT TIER ENGINE  (mirrors trigger_alerts.py tiers exactly)
   ================================================================ */
const CONTACTS = [
  { role:"Shift Supervisor", phone:"+91-9876543210" },
  { role:"Chief Engineer",   phone:"+91-8765432109" },
  { role:"Safety Officer",   phone:"+91-7654321098" },
  { role:"Rescue Team Lead", phone:"+91-6543210987" },
];

function tierActions(flag) {
  switch(flag) {
    case "WARNING":  return { chip:"TIER 1", color:"var(--warn)",   detail:"Yellow dashboard banner · LED pulse on node · Logged to audit trail. No personnel paged." };
    case "HAZARD":   return { chip:"TIER 2", color:"var(--hazard)", detail:"Buzzer + red dashboard alert · SMS → Shift Supervisor, Chief Engineer." };
    case "CRITICAL": return { chip:"TIER 3", color:"var(--crit)",   detail:"Evacuation alarm ACTIVATED · SMS → Supervisor, Safety Officer · Auto-call → Chief Engineer, Rescue Team · Email → all contacts." };
    case "OFFLINE":  return { chip:"FAULT",  color:"var(--offline)","detail":"Hardware fault on dashboard. No OFFLINE branch in trigger_alerts() yet — nobody paged." };
    default:         return { chip:"CLEAR",  color:"var(--safe)",   detail:"Conditions returned to safe range. Logged only." };
  }
}

/* ================================================================
   SIMULATION / STATE
   ================================================================ */
let NODES = [
  { id:"SEAM-A12", name:"Shaft A-12"       },
  { id:"SEAM-B04", name:"Gallery B-04"     },
  { id:"SEAM-C07", name:"Gallery C-07"     },
  { id:"VENT-D02",  name:"Ventilation D-02" },
];

const clamp = (v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const drift  = (v,s,lo,hi)=>clamp(v+(Math.random()-.5)*s,lo,hi);

const state={};
const vibeHistory={};  // node_id -> [{t, machineVibe, structureRisk}]

function initState(id) {
  state[id] = {
    current:{ temperature:27+Math.random()*4, co_gas_level:80+Math.random()*100,
              vibration:0.1+Math.random()*.15, distance_mm:2200+Math.random()*800,
              roof_load_kg:0.8+Math.random()*.8, pitch:(Math.random()-.5)*2, roll:(Math.random()-.5)*2 },
    previous:null, lastFlag:"NORMAL"
  };
  vibeHistory[id]=[];
}
NODES.forEach(n=>initState(n.id));

function stepNode(id) {
  const s=state[id], p={...s.current}, rng=Math.random();
  let n={
    temperature:   drift(p.temperature,   1.2, 18, 34),
    co_gas_level:  drift(p.co_gas_level,   40, 20, 400),
    vibration:     drift(p.vibration,     0.06, 0.02, 0.4),
    distance_mm:   drift(p.distance_mm,    60, 1800, 3200),
    roof_load_kg:  drift(p.roof_load_kg,  0.15, 0.3, 2.2),
    pitch:         drift(p.pitch,          0.6, -4, 4),
    roll:          drift(p.roll,           0.6, -4, 4),
  };
  if      (rng<.045){ n.temperature=38+Math.random()*5; n.co_gas_level=1600+Math.random()*500; }
  else if (rng<.08) { n.co_gas_level=p.co_gas_level+600+Math.random()*300; }
  else if (rng<.11) { n.pitch=12+Math.random()*6; n.roof_load_kg=4.5+Math.random(); }
  else if (rng<.14) { n.roof_load_kg=p.roof_load_kg+2+Math.random(); }
  else if (rng<.16) { n={temperature:24,co_gas_level:30,vibration:.03,distance_mm:8200,roof_load_kg:.05,pitch:0,roll:0}; }
  // inject occasional vibration spike so the chart has interesting data
  if (Math.random()<.12) n.vibration=clamp(n.vibration+Math.random()*.8,0,1.5);
  s.previous=p; s.current=n;
  // record vibration history
  const vh=vibeHistory[id];
  vh.push({ t:Date.now(), machineVibe:n.vibration, structureRisk:Math.min(n.vibration*1.4,1.5) });
  if(vh.length>CONFIG.VIBE_HISTORY) vh.shift();
}

/* ================================================================
   LIVE POLLING
   ================================================================ */
let liveMode=false, autoRefresh=true, soundOn=true;

async function fetchLatest() {
  if(!autoRefresh) return;
  try {
    const res=await fetch(CONFIG.API_URL,{cache:"no-store"});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload=await res.json();
    const rows=Array.isArray(payload)?payload:(payload.nodes||payload.data||[]);
    if(!rows.length) throw new Error("Empty");
    console.log("Live payload:",rows);
    applyLiveRows(rows); liveMode=true;
  } catch(err) {
    console.warn("API unreachable, simulating.",err);
    liveMode=false;
    NODES.forEach(n=>stepNode(n.id));
  }
  render();
}

function applyLiveRows(rows) {
  NODES=rows.map(r=>({ id:r.node_id??r.id, name:r.name||NODE_LABELS[r.node_id??r.id]||(r.node_id??r.id) }));
  rows.forEach(r=>{
    const id=r.node_id??r.id;
    if(!state[id]) initState(id);
    const s=state[id];
    s.previous=s.current;
    s.current={
      temperature:r.temperature, co_gas_level:r.co_gas_level,
      vibration:r.vibration, distance_mm:r.distance_mm,
      roof_load_kg:r.roof_load_kg, pitch:r.pitch, roll:r.roll,
      _serverResult:(r.risk_score!==undefined&&r.anomaly_flag)
        ?{risk_score:r.risk_score,anomaly_flag:r.anomaly_flag,prediction:r.prediction||""}:null,
    };
    // update vibe history from live data too
    const vh=vibeHistory[id]||(vibeHistory[id]=[]);
    const vib=typeof r.vibration==='number'?r.vibration:0;
    vh.push({t:Date.now(),machineVibe:vib,structureRisk:Math.min(vib*1.4,1.5)});
    if(vh.length>CONFIG.VIBE_HISTORY) vh.shift();
  });
}

async function sendTestReading() {
  const id=selectedNode||NODES[0]?.id||"TEST";
  const payload={node_id:id,
    temperature:+(24+Math.random()*18).toFixed(1),
    co_gas_level:Math.round(50+Math.random()*2200),
    vibration:+(0.05+Math.random()*1.3).toFixed(2),
    distance_mm:Math.round(400+Math.random()*3200),
    roof_load_kg:+(0.3+Math.random()*4.8).toFixed(2),
    pitch:+((Math.random()-.5)*24).toFixed(1),
    roll:+((Math.random()-.5)*24).toFixed(1),
  };
  try {
    const res=await fetch(CONFIG.POST_API,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    setTimeout(fetchLatest,600);
  } catch(e){ console.warn("Test reading failed",e); }
}

/* ================================================================
   FLAG META
   ================================================================ */
const FM={
  NORMAL:  {color:"var(--safe)",   bg:"var(--safe-bg)",   label:"NORMAL",  icon:"✓"},
  WARNING: {color:"var(--warn)",   bg:"var(--warn-bg)",   label:"WARNING", icon:"⚠"},
  HAZARD:  {color:"var(--hazard)", bg:"var(--hazard-bg)", label:"HAZARD",  icon:"⚠"},
  CRITICAL:{color:"var(--crit)",   bg:"var(--crit-bg)",   label:"CRITICAL",icon:"🔴"},
  OFFLINE: {color:"var(--offline)",bg:"var(--offline-bg)",label:"OFFLINE", icon:"✖"},
};
const ORDER=["OFFLINE","CRITICAL","HAZARD","WARNING","NORMAL"];
const alertLog=[];
let selectedNode=NODES[0].id;

/* ================================================================
   NOTIFICATIONS  (toast + evac banner + sound)
   ================================================================ */
const toastEl=document.getElementById("toastContainer");
const evacEl=document.getElementById("evacBanner");

function showToast(flag,nodeName,score,prediction) {
  const m=FM[flag];
  const t=document.createElement("div");
  t.className="toast";
  t.style.borderLeftColor=m.color;
  t.innerHTML=`
    <div class="toast-head" style="color:${m.color}">
      ${m.icon} ${m.label} — ${nodeName}
      <span style="margin-left:auto;font-family:var(--mono);font-size:11px">${Math.round(score)}%</span>
      <button class="toast-dismiss" onclick="dismissToast(this)">×</button>
    </div>
    <div class="toast-body">${prediction.split(" | ")[0]||"Conditions changed."}</div>
  `;
  toastEl.prepend(t);
  setTimeout(()=>dismissToast(t.querySelector(".toast-dismiss")),8000);
}
function dismissToast(btn) {
  const toast=btn.closest(".toast");
  if(!toast) return;
  toast.classList.add("dismissing");
  setTimeout(()=>toast.remove(),300);
}

let audioCtx=null;
function beep(flag) {
  if(!soundOn) return;
  try {
    if(!audioCtx) audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    const osc=audioCtx.createOscillator();
    const gain=audioCtx.createGain();
    osc.connect(gain); gain.connect(audioCtx.destination);
    const freqMap={CRITICAL:880,HAZARD:660,WARNING:440,OFFLINE:220};
    osc.frequency.value=freqMap[flag]||440;
    osc.type=flag==="CRITICAL"?"sawtooth":"sine";
    gain.gain.setValueAtTime(0.3,audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.6);
    osc.start(); osc.stop(audioCtx.currentTime+.6);
  } catch(e){}
}

/* ================================================================
   ROUTE PLANNER
   ================================================================ */
const TUNNEL_GRAPH={
  "SEAM-A12":["SEAM-B04","VENT-D02"],
  "SEAM-B04":["SEAM-A12","SEAM-C07"],
  "SEAM-C07":["SEAM-B04","VENT-D02"],
  "VENT-D02": ["SEAM-A12","SEAM-C07"],
};
function bfs(from,to) {
  if(from===to) return [from];
  const visited=new Set([from]), queue=[[from]];
  while(queue.length) {
    const path=queue.shift(), node=path[path.length-1];
    for(const nb of (TUNNEL_GRAPH[node]||[])) {
      if(!visited.has(nb)) { visited.add(nb); const np=[...path,nb]; if(nb===to) return np; queue.push(np); }
    }
  }
  return null;
}

/* ================================================================
   VIBRATION CHART
   ================================================================ */
const vibCanvas=document.getElementById("vibCanvas");
const vibCtx=vibCanvas.getContext("2d");

function resizeCanvas() {
  const wrap=vibCanvas.parentElement;
  vibCanvas.width=wrap.clientWidth; vibCanvas.height=wrap.clientHeight;
}
resizeCanvas();
window.addEventListener("resize",resizeCanvas);

function drawVibeChart(id) {
  const W=vibCanvas.width, H=vibCanvas.height;
  vibCtx.clearRect(0,0,W,H);
  vibCtx.fillStyle="#0a0e14"; vibCtx.fillRect(0,0,W,H);

  const vh=vibeHistory[id]||[];
  if(vh.length<2){ vibCtx.fillStyle="#4a5568"; vibCtx.font="12px monospace"; vibCtx.fillText("Collecting data…",W/2-55,H/2); return; }

  const maxVal=2.0;
  const pad={t:14,b:24,l:36,r:10};
  const cw=W-pad.l-pad.r, ch=H-pad.t-pad.b;

  // grid lines
  vibCtx.strokeStyle="#1e293b"; vibCtx.lineWidth=1;
  [0,.5,1,1.5,2].forEach(v=>{
    const y=pad.t+ch-(v/maxVal)*ch;
    vibCtx.beginPath(); vibCtx.moveTo(pad.l,y); vibCtx.lineTo(pad.l+cw,y); vibCtx.stroke();
    vibCtx.fillStyle="#4a5568"; vibCtx.font="9px monospace";
    vibCtx.fillText(v.toFixed(1),2,y+3);
  });

  // find peak for annotation
  let peakIdx=0, peakVal=0;
  vh.forEach((pt,i)=>{ if(pt.machineVibe>peakVal){peakVal=pt.machineVibe;peakIdx=i;} });

  function drawLine(key,color) {
    vibCtx.beginPath(); vibCtx.strokeStyle=color; vibCtx.lineWidth=2; vibCtx.lineJoin="round";
    vh.forEach((pt,i)=>{
      const x=pad.l+(i/(vh.length-1))*cw;
      const y=pad.t+ch-(Math.min(pt[key],maxVal)/maxVal)*ch;
      i===0?vibCtx.moveTo(x,y):vibCtx.lineTo(x,y);
    });
    vibCtx.stroke();
    // filled area under the line
    vibCtx.save();
    vibCtx.beginPath(); vibCtx.strokeStyle="none";
    vh.forEach((pt,i)=>{
      const x=pad.l+(i/(vh.length-1))*cw;
      const y=pad.t+ch-(Math.min(pt[key],maxVal)/maxVal)*ch;
      i===0?vibCtx.moveTo(x,y):vibCtx.lineTo(x,y);
    });
    vibCtx.lineTo(pad.l+cw,pad.t+ch); vibCtx.lineTo(pad.l,pad.t+ch); vibCtx.closePath();
    const grad=vibCtx.createLinearGradient(0,pad.t,0,pad.t+ch);
    const hex=color.replace("var(--","").replace(")","");
    grad.addColorStop(0, color==="#3b82f6"?"rgba(59,130,246,.22)":"rgba(239,68,68,.18)");
    grad.addColorStop(1,"rgba(0,0,0,0)");
    vibCtx.fillStyle=grad; vibCtx.fill();
    vibCtx.restore();
  }
  drawLine("machineVibe","#3b82f6");
  drawLine("structureRisk","#ef4444");

  // peak annotation
  if(vh.length>1) {
    const px=pad.l+(peakIdx/(vh.length-1))*cw;
    const py=pad.t+ch-(Math.min(peakVal,maxVal)/maxVal)*ch;
    vibCtx.strokeStyle="#f59e0b"; vibCtx.lineWidth=1; vibCtx.setLineDash([3,3]);
    vibCtx.beginPath(); vibCtx.moveTo(px,pad.t); vibCtx.lineTo(px,pad.t+ch); vibCtx.stroke();
    vibCtx.setLineDash([]);
    vibCtx.fillStyle="#f59e0b"; vibCtx.font="bold 10px monospace";
    vibCtx.fillText(`⬆ ${peakVal.toFixed(2)}g`,px+4,py-4);
    // peak time label
    const peakTime=new Date(vh[peakIdx].t).toLocaleTimeString([],{hour12:false});
    document.getElementById("vibePeakLabel").textContent=`Peak: ${peakVal.toFixed(2)}g @ ${peakTime}`;
  }

  // time axis labels
  const oldest=new Date(vh[0].t).toLocaleTimeString([],{hour12:false,hour:"2-digit",minute:"2-digit",second:"2-digit"});
  document.getElementById("vibeTimeOld").textContent=oldest;
  document.getElementById("vibeTimeNew").textContent="now";
}

/* ================================================================
   RENDER
   ================================================================ */
function render() {
 try {
  const results=NODES.map(nd=>{
    const s=state[nd.id]||{ current:{temperature:0,co_gas_level:0,vibration:0,distance_mm:0,roof_load_kg:0,pitch:0,roll:0}, previous:null, lastFlag:"NORMAL" };
    const result=(s.current&&s.current._serverResult)||evaluateNodeRisk(s.current,s.previous);
    return {nd,s,result};
  });

  // ── state-change detection: alerts & notifications ──────────
  results.forEach(({nd,s,result})=>{
    if(s.lastFlag!==result.anomaly_flag) {
      const actions=tierActions(result.anomaly_flag);
      alertLog.unshift({time:new Date(),node:nd.name,id:nd.id,flag:result.anomaly_flag,score:result.risk_score,prediction:result.prediction,actions});
      if(alertLog.length>50) alertLog.pop();
      // fire notifications for non-normal transitions
      if(result.anomaly_flag!=="NORMAL") {
        showToast(result.anomaly_flag,nd.name,result.risk_score,result.prediction);
        beep(result.anomaly_flag);
      }
    }
    s.lastFlag=result.anomaly_flag;
  });

  // ── counts ──────────────────────────────────────────────────
  const cnt={NORMAL:0,WARNING:0,HAZARD:0,CRITICAL:0,OFFLINE:0};
  let worst="NORMAL";
  results.forEach(({result})=>{
    cnt[result.anomaly_flag]++;
    if(ORDER.indexOf(result.anomaly_flag)<ORDER.indexOf(worst)) worst=result.anomaly_flag;
  });
  document.getElementById("s-total").textContent=NODES.length;
  document.getElementById("s-normal").textContent=cnt.NORMAL;
  document.getElementById("s-warn").textContent=cnt.WARNING;
  document.getElementById("s-hazard").textContent=cnt.HAZARD;
  document.getElementById("s-crit").textContent=cnt.CRITICAL;
  document.getElementById("s-offline").textContent=cnt.OFFLINE;

  // ── evacuation banner ────────────────────────────────────────
  const hasCrit=cnt.CRITICAL>0;
  evacEl.classList.toggle("hidden",!hasCrit);
  if(hasCrit) {
    const critNodes=results.filter(r=>r.result.anomaly_flag==="CRITICAL").map(r=>r.nd.name).join(", ");
    document.getElementById("evacMsg").textContent=`IMMEDIATE EVACUATION — ${critNodes}`;
  }

  // ── active alerts bar ────────────────────────────────────────
  const alertBar=document.getElementById("activeAlertsBar");
  const alertList=document.getElementById("activeAlertsList");
  const active=results.filter(r=>["CRITICAL","HAZARD"].includes(r.result.anomaly_flag));
  alertBar.classList.toggle("visible",active.length>0);
  alertList.innerHTML=active.map(({nd,result})=>{
    const m=FM[result.anomaly_flag];
    return `<div class="active-alert-row">
      <span class="active-alert-node" style="color:${m.color}">${m.icon} ${nd.name}</span>
      <span style="font-family:var(--mono);font-size:11px;color:${m.color}">${Math.round(result.risk_score)}%</span>
      <span class="active-alert-pred">${result.prediction.split(" | ")[0]}</span>
    </div>`;
  }).join("");

  // ── node selector tabs ───────────────────────────────────────
  const tabsEl=document.getElementById("nodeTabs");
  tabsEl.innerHTML=results.map(({nd,result})=>{
    const m=FM[result.anomaly_flag];
    const active=nd.id===selectedNode?"active":"";
    return `<button class="sel-tab ${active}" data-id="${nd.id}"
      style="${active?`background:${m.bg};border-color:${m.color};color:${m.color}`:""}
      " onclick="selectNode('${nd.id}')">${m.icon} ${nd.name}</button>`;
  }).join("");

  // ── mine map ─────────────────────────────────────────────────
  results.forEach(({nd,result})=>{
    const m=FM[result.anomaly_flag];
    const dot=document.getElementById(`md-${nd.id}`);
    const ring=document.getElementById(`pr-${nd.id}`);
    if(dot){ dot.setAttribute("fill",m.color); dot.onclick=()=>selectNode(nd.id); }
    if(ring){ ring.setAttribute("fill",m.color); ring.classList.toggle("pulsing",result.anomaly_flag!=="NORMAL"); }
  });

  // ── map legend ───────────────────────────────────────────────
  document.getElementById("mapLegend").innerHTML=Object.values(FM).map(m=>
    `<span><span class="ldot" style="background:${m.color}"></span>${m.label}</span>`).join("");

  // ── connection badge ─────────────────────────────────────────
  document.getElementById("connBadge").textContent=liveMode?"LIVE":"SIMULATED";
  document.getElementById("connBadge").style.color=liveMode?"var(--safe)":"var(--text-faint)";
  document.getElementById("connDot").style.background=liveMode?"var(--safe)":"var(--offline)";
  document.getElementById("apiStatus").textContent=liveMode?"Connected":"Disconnected";
  document.getElementById("apiStatus").style.color=liveMode?"var(--safe)":"var(--crit)";
  document.getElementById("lastUpdate").textContent=new Date().toLocaleTimeString([],{hour12:false});

  // ── center panel: selected node detail ───────────────────────
  const sel=results.find(r=>r.nd.id===selectedNode)||results[0];
  if(sel) renderNodeDetail(sel.nd,sel.s,sel.result);

  // ── alert history (right column) ─────────────────────────────
  const scroll=document.getElementById("alertsScroll");
  if(alertLog.length===0) {
    scroll.innerHTML=`<p style="color:var(--text-faint);font-size:12px">No alerts yet.</p>`;
  } else {
    scroll.innerHTML=alertLog.slice(0,20).map(e=>{
      const m=FM[e.flag];
      return `<div class="alert-item" style="border-left-color:${m.color}">
        <div class="alert-item-head">
          <span class="alert-item-time">${e.time.toLocaleTimeString([],{hour12:false})}</span>
          <span class="alert-item-node" style="color:${m.color}">${e.node}</span>
          <span class="alert-chip" style="background:${m.bg};color:${m.color}">${e.actions.chip} · ${m.label}</span>
          <span style="font-family:var(--mono);font-size:10px;color:${m.color}">${Math.round(e.score)}%</span>
        </div>
        <div class="alert-item-pred">${e.prediction}</div>
        <div class="alert-dispatch-text">${e.actions.detail}</div>
      </div>`;
    }).join("");
  }

  // ── vibration chart for selected node ────────────────────────
  drawVibeChart(selectedNode||(NODES[0]?.id));

 } catch(err) {
   console.error("render() failed:",err);
   document.getElementById("connBadge").textContent="RENDER ERROR";
   document.getElementById("connBadge").style.color="var(--crit)";
 }
}

/* ── Node detail panel ───────────────────────────────────────── */
const fmt   = (v,d)=>(typeof v==='number'&&isFinite(v))?v.toFixed(d):"—";
const fmtI  = v=>(typeof v==='number'&&isFinite(v))?Math.round(v):"—";

function barColor(pct) {
  if(pct>80) return "var(--crit)";
  if(pct>60) return "var(--hazard)";
  if(pct>40) return "var(--warn)";
  return "var(--safe)";
}

function renderNodeDetail(nd,s,result) {
  const c=s.current||{};
  const m=FM[result.anomaly_flag];

  document.getElementById("nodePanelTitle").textContent=`${nd.name} — ${nd.id}`;

  // risk banner
  const rb=document.getElementById("riskBanner");
  rb.style.borderColor=m.color; rb.style.background=m.bg;
  const rc=document.getElementById("riskCircle");
  rc.style.borderColor=m.color; rc.style.color=m.color;
  document.getElementById("riskVal").textContent=Math.round(result.risk_score);
  const rf=document.getElementById("riskFlag");
  rf.textContent=`${m.icon} ${m.label}`; rf.style.color=m.color;
  document.getElementById("riskTime").textContent=`Updated: ${new Date().toLocaleTimeString([],{hour12:false})}`;

  // predictions
  const preds=result.prediction.split(" | ").filter(Boolean);
  document.getElementById("predsList").innerHTML=preds.map(p=>{
    const isCrit=/COLLAPSE|FIRE|EVACUATE|COLLAPSE/.test(p);
    return `<div class="pred-item" style="border-left-color:${isCrit?"var(--crit)":m.color}">
      <span style="color:${isCrit?"var(--crit)":m.color};font-size:15px">${isCrit?"🔴":"⚡"}</span>
      <span>${p}</span>
    </div>`;
  }).join("")||`<div class="pred-calm">No warnings — conditions stable.</div>`;

  // telemetry cells
  const sensors=[
    {key:"temperature", label:"Temperature", val:fmt(c.temperature,1),unit:"°C", max:50, thresh:35},
    {key:"co_gas_level",label:"CO Gas",      val:fmtI(c.co_gas_level), unit:"ppm",max:3000,thresh:1000},
    {key:"vibration",   label:"Vibration",   val:fmt(c.vibration,3),   unit:"g",  max:1.5, thresh:0.5},
    {key:"distance_mm", label:"Roof Gap",    val:fmtI(c.distance_mm),  unit:"mm", max:4000,thresh:1000,low:true},
    {key:"roof_load_kg",label:"Load",        val:fmt(c.roof_load_kg,2),unit:"kg", max:6,   thresh:4.0},
    {key:"pitch",       label:"Pitch",       val:fmt(c.pitch,1),       unit:"°",  max:20,  thresh:10},
    {key:"roll",        label:"Roll",        val:fmt(c.roll,1),        unit:"°",  max:20,  thresh:10},
  ];
  document.getElementById("teleGrid").innerHTML=sensors.map(s=>{
    const raw=typeof c[s.key]==='number'?c[s.key]:0;
    const pct=Math.min(Math.abs(raw)/s.max*100,100);
    const breach=s.low?(raw<s.thresh&&raw>0):(raw>s.thresh);
    const fc=breach?"var(--crit)":barColor(pct);
    return `<div class="tele-cell ${breach?"breach":""}">
      <div class="tele-key">${s.label}</div>
      <div class="tele-val" style="color:${breach?"var(--crit)":"var(--text)"}">${s.val}<span style="font-size:11px;color:var(--text-muted);margin-left:2px">${s.unit}</span></div>
      <div class="tele-bar"><div class="tele-bar-fill" style="width:${pct}%;background:${fc}"></div></div>
    </div>`;
  }).join("");
}

/* ── Select a node ───────────────────────────────────────────── */
function selectNode(id) {
  selectedNode=id;
  // reset vibe chart old-time label
  render();
}

/* ── Route planner ───────────────────────────────────────────── */
document.getElementById("routeBtn").addEventListener("click",()=>{
  const to=document.getElementById("routeTo").value;
  const from=selectedNode;
  if(from===to){ document.getElementById("routeResult").textContent="Already at this location."; return; }
  const path=bfs(from,to);
  const nameOf=id=>NODES.find(n=>n.id===id)?.name||id;
  if(!path){ document.getElementById("routeResult").textContent="No route found."; return; }
  document.getElementById("routeResult").textContent="→ "+path.map(nameOf).join(" → ");
});

/* ── Contacts ────────────────────────────────────────────────── */
document.getElementById("contactList").innerHTML=CONTACTS.map(c=>`
  <div class="contact-row2">
    <span class="contact-role">${c.role}</span>
    <span class="contact-phone">${c.phone}</span>
  </div>`).join("");

document.getElementById("manualAlertBtn").addEventListener("click",()=>{
  const sel=NODES.find(n=>n.id===selectedNode);
  const s=state[selectedNode];
  const result=s?(s.current&&s.current._serverResult)||evaluateNodeRisk(s.current,s.previous):{risk_score:0,anomaly_flag:"WARNING",prediction:"Manual alert"};
  showToast("HAZARD",sel?.name||selectedNode,result.risk_score,"Manual alert triggered by operator.");
  beep("HAZARD");
  alertLog.unshift({time:new Date(),node:sel?.name||selectedNode,id:selectedNode,flag:"HAZARD",score:result.risk_score,prediction:"MANUAL ALERT by operator.",actions:tierActions("HAZARD")});
  render();
});

/* ── Controls ────────────────────────────────────────────────── */
document.getElementById("refreshBtn").addEventListener("click",fetchLatest);
document.getElementById("testReadingBtn").addEventListener("click",sendTestReading);

const autoBtn=document.getElementById("autoBtn");
autoBtn.addEventListener("click",()=>{
  autoRefresh=!autoRefresh;
  autoBtn.textContent=`⏱ Auto: ${autoRefresh?"ON":"OFF"}`;
  autoBtn.classList.toggle("active-toggle",autoRefresh);
});

const audioBtn=document.getElementById("audioBtn");
audioBtn.addEventListener("click",()=>{
  soundOn=!soundOn;
  audioBtn.textContent=`🔊 Sound: ${soundOn?"ON":"OFF"}`;
});

/* ── Clock & polling ─────────────────────────────────────────── */
function updateClock() { document.getElementById("clock").textContent=new Date().toLocaleTimeString([],{hour12:false}); }

fetchLatest();
updateClock();
setInterval(fetchLatest,CONFIG.POLL_INTERVAL_MS);
setInterval(updateClock,1000);
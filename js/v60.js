/* =====================================================================
   v60
     1. Timed moves (wall sits, planks…): a countdown instead of reps
     2. Pop-up forms stay above the phone keyboard (Log a run, Stairs…)
     3. "Your week": change which day each workout is on, in one place
   ===================================================================== */
(function(){
const $id = id => document.getElementById(id);
const coarse = () => !!(window.matchMedia && matchMedia("(pointer:coarse)").matches);
const fmtS = s => { s = Math.max(0, Math.round(s)); const m = Math.floor(s/60), r = s%60; return m ? `${m}:${String(r).padStart(2,"0")}` : `${r}s`; };

/* ---------------------------------------------------------------------------
   1. Timed moves
   --------------------------------------------------------------------------- */
let run = null;            // {n, round, sid, end, total}
function cell(i){ const e = sessEx()[i]; if(!e||!wkSession) return {}; const c = (wkSession.entries[e.n]||[])[wkSession.round-1]; return {e, c}; }
function targetOf(e, c){ return (c && c.tgt) || e.d || 60; }
function beep(){
  try{ navigator.vibrate && navigator.vibrate([250,120,250,120,400]); }catch(e){}
  try{ const A = window.AudioContext||window.webkitAudioContext; if(!A) return; const a = new A(), o = a.createOscillator(), g = a.createGain();
    o.frequency.value = 880; o.connect(g); g.connect(a.destination); g.gain.setValueAtTime(.18, a.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, a.currentTime+.6); o.start(); o.stop(a.currentTime+.6); }catch(e){}
}
function logSec(i, sec){
  const {e, c} = cell(i); if(!c) return;
  c.sec = Math.max(0, Math.round(sec)); c.reps = c.sec ? 1 : 0;
  save(); persistSession(false);
  try{ paintTotals(); paintRoundTabs(); }catch(err){}
  paintTimed();
}
window.tmAdj = function(i, d){
  const {e, c} = cell(i); if(!c) return;
  if(run && run.n===e.n) return;
  c.tgt = Math.max(5, Math.min(3600, targetOf(e,c) + d)); save(); paintTimed();
};
window.tmStart = function(i){
  const {e, c} = cell(i); if(!c) return;
  if(run && run.n===e.n){ tmStop(i); return; }
  if(run){ toast("Another timer is running — stop it first"); return; }
  const total = targetOf(e,c);
  run = {n:e.n, round:wkSession.round, sid:wkSession.sid, end:Date.now()+total*1000, total};
  wkSession.tmRun = run; save();                 // a reload mid-countdown picks it back up
  try{ if(typeof restStop==="function") restStop(); }catch(err){}
  paintTimed(); tick();
};
window.tmStop = function(i){
  if(!run) return;
  const held = run.total - Math.max(0, (run.end - Date.now())/1000);
  const r = run; run = null; if(wkSession) delete wkSession.tmRun;
  const {e} = cell(i);
  if(wkSession && wkSession.sid===r.sid && e && e.n===r.n){ logSec(i, held); toast(`Held ${fmtS(held)} — logged`); }
};
window.tmDid = function(i){ const {e, c} = cell(i); if(!c) return; logSec(i, targetOf(e,c)); toast(`${fmtS(targetOf(e,c))} logged`); };
window.tmClear = function(i){ logSec(i, 0); };
function tick(){
  if(!run) return;
  const left = (run.end - Date.now())/1000;
  if(left <= 0){
    const r = run; run = null; beep(); if(wkSession) delete wkSession.tmRun;
    if(wkSession && wkSession.sid===r.sid){
      const i = sessEx().findIndex(x=>x.n===r.n);
      const keep = wkSession.round; wkSession.round = r.round;
      if(i>-1) logSec(i, r.total);
      wkSession.round = keep; paintTimed();
      toast(`⏱ Time! ${fmtS(r.total)} logged`);
    }
    return;
  }
  const el = document.querySelector(`.ex-timed[data-n="${CSS.escape(run.n)}"] .tm-t`);
  if(el) el.textContent = fmtS(Math.ceil(left));
  const ring = document.querySelector(`.ex-timed[data-n="${CSS.escape(run.n)}"] .tm-face`);
  if(ring) ring.style.setProperty("--p", (1 - left/run.total).toFixed(3));
  setTimeout(tick, 200);
}
// coming back to the app after the timer would have ended still logs it
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="visible" && run) tick(); });

function paintTimed(){
  if(!wkSession) return;
  if(!run && wkSession.tmRun && wkSession.tmRun.sid===wkSession.sid){ run = wkSession.tmRun; setTimeout(tick, 50); }
  const EX = sessEx(), R = wkSession.round-1, last = baseSess(wkSession.id);
  EX.forEach((e,i)=>{
    if(e.t!=="s") return;
    const inp = $id("wsRep"+i); const row = inp ? inp.closest(".ex") : null;
    if(!row) return;
    row.classList.add("ex-timed"); row.dataset.n = e.n; row.dataset.i = i;
    const c = (wkSession.entries[e.n]||[])[R] || {};
    const tgt = targetOf(e,c), on = run && run.n===e.n && run.round===wkSession.round;
    const left = on ? Math.max(0,(run.end-Date.now())/1000) : tgt;
    const lastSec = (last.entries[e.n]||{}).sec || ((doneSess(wkSession.id).slice().reverse().find(h=>h.entries&&h.entries[e.n]&&h.entries[e.n].sec)||{entries:{}}).entries[e.n]||{}).sec;
    const lt = row.querySelector(".ex-last");
    if(lt) lt.innerHTML = lastSec ? `Last time <b>${fmtS(lastSec)}</b> · goal ${fmtS(tgt)}` : `Goal <b>${fmtS(tgt)}</b>`;
    let box = row.querySelector(".tm");
    const ctl = row.querySelector(".ex-ctl");
    // the rep controls stay in the page (hidden) — other parts of the app find the row through them
    if(ctl) ctl.style.display = "none";
    if(!box){ box = document.createElement("div"); box.className = "tm"; if(ctl) ctl.after(box); else row.appendChild(box); }
    box.innerHTML = c.sec && !on
      ? `<div class="tm-done">✓ Held ${fmtS(c.sec)}</div>
         <div class="tm-row"><span class="tm-link" onclick="tmStart(${i})">↻ Go again</span><span class="tm-link" onclick="tmClear(${i})">Clear</span></div>`
      : `<div class="tm-row">
           <div class="stepbtn" onclick="tmAdj(${i},-15)">−</div>
           <div class="tm-face${on?" on":""}" style="--p:${on?(1-left/run.total).toFixed(3):0}"><span class="tm-t">${fmtS(on?Math.ceil(left):tgt)}</span><em>${on?"hold it":"time limit"}</em></div>
           <div class="stepbtn plus" onclick="tmAdj(${i},15)">+</div>
         </div>
         <div class="tm-row">
           <button class="b ${on?"b-ghost":"b-primary"} tm-go" onclick="tmStart(${i})">${on?"■ Stop & log":"▶ Start timer"}</button>
           ${on?"":`<span class="tm-link" onclick="tmDid(${i})">Did it without the timer</span>`}
         </div>`;
  });
  try{ if(typeof paintDoneAll==="function") paintDoneAll(); }catch(e){}
}
window.paintTimed = paintTimed;

/* Turn moves you already have (like Wall Squats) into timed ones, right from the workout */
window.openTimedPicker = function(){
  const w = wkSession && wkById(wkSession.id); const body = $id("nodeBody"); if(!w || !body) return;
  const draw = () => {
    body.innerHTML = `<h2 style="margin:0 0 4px">⏱ Timed moves</h2>
      <p class="thin" style="margin:0 0 10px">Switch on any move you do for time — like wall squats or planks — and set the time limit.
        You'll get a countdown instead of reps.</p>
      ${w.ex.map((e,i)=>`<div class="pp-row${e.t==="s"?" on":""}" style="${e.t==="s"?"border-color:#12c98a;background:rgba(18,201,138,.08)":""}">
        <b style="flex:1">${esc(e.n)}</b>
        ${e.t==="s"?`<span class="stepbtn" onclick="tpAdj(${i},-15)">−</span><span class="tp-s">${fmtS(e.d||60)}</span><span class="stepbtn plus" onclick="tpAdj(${i},15)">+</span>`:""}
        <span class="tp-sw${e.t==="s"?" on":""}" onclick="tpToggle(${i})"><i></i></span></div>`).join("")}
      <div class="btns"><button class="b b-primary" style="width:100%" onclick="closeAll();renderSession()">Done</button></div>`;
  };
  window.tpToggle = i => { const e = w.ex[i];
    if(e.t==="s"){ e.t = e.was || "r"; e.d = e.dr || 10; delete e.was; delete e.dr; }
    else { e.was = e.t; e.dr = e.d; e.t = "s"; e.d = 60; }
    save(); draw(); };
  window.tpAdj = (i, d) => { const e = w.ex[i]; e.d = Math.max(5, Math.min(3600, (e.d||60)+d)); save(); draw(); };
  draw(); openSheet("node");
};
const _renderSession60 = renderSession;
renderSession = function(){
  const r = _renderSession60.apply(this, arguments);
  paintTimed(); if(run) tick();
  try{ const add = [...document.querySelectorAll("#wkBody button")].find(x=>/\+ Add a move/.test(x.textContent));
    if(false && add && !document.querySelector(".tp-open")){   // v62: replaced by the ⋯ menu on each move const t = document.createElement("button"); t.className = "b b-ghost tp-open";
      t.textContent = "⏱ Timed moves"; t.onclick = openTimedPicker; add.style.flex = "1"; t.style.flex = "1";
      add.parentElement.style.gap = "8px"; add.parentElement.appendChild(t); } }catch(e){}
  return r; };
// the + / − / typing handlers belong to rep moves; a timed row never shows them
const _paintTotals60 = paintTotals;
paintTotals = function(){ const r = _paintTotals60.apply(this, arguments);
  document.querySelectorAll("#wkBody .ex-timed .chase, #wkBody .ex-timed .delta").forEach(x=>x.style.display="none"); return r; };

/* ---------------------------------------------------------------------------
   2. Pop-up forms stay above the keyboard
   --------------------------------------------------------------------------- */
function kb(){
  const vv = window.visualViewport; if(!vv) return;
  const k = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
  document.documentElement.style.setProperty("--kb", (k>60?k:0)+"px");
  document.documentElement.style.setProperty("--vvh", Math.round(vv.height)+"px");
  document.body.classList.toggle("kbopen", k>60);
}
if(window.visualViewport){ visualViewport.addEventListener("resize", kb); visualViewport.addEventListener("scroll", kb); }
document.addEventListener("focusin", e=>{
  const s = e.target.closest && e.target.closest(".sheet"); if(!s) return;
  setTimeout(()=>{ kb(); try{ e.target.scrollIntoView({block:"center", behavior:"smooth"}); }catch(err){} }, 320);
});
document.addEventListener("focusout", ()=>setTimeout(kb, 150));

/* ---------------------------------------------------------------------------
   3. Your week — move a workout to another day
   --------------------------------------------------------------------------- */
function weekCard(){
  const today = DOW[new Date().getDay()];
  const CT = window.CARDIO_TYPES || [];
  const cols = DOW.map(d=>{
    const ws = WK.filter(w=>(w.days||[]).includes(d));
    const cs = CT.filter(c=>((prefs.cardioDays||{})[c.type]||[]).includes(d));
    return `<div class="wkd${d===today?" today":""}"><span>${d[0]}</span>
      ${ws.length||cs.length ? ws.map(w=>`<i style="background:${w.bg};border-color:${w.fg}88" title="${esc(w.name)}">${w.icon}</i>`).join("")
        + cs.map(c=>`<i style="background:${(CTYPE[c.type]||{c:"#b58cff"}).c}22;border-color:${(CTYPE[c.type]||{c:"#b58cff"}).c}88" title="${c.label}">${(CTYPE[c.type]||{i:"🏃"}).i}</i>`).join("") : `<em>rest</em>`}</div>`;
  }).join("");
  return `<div class="card wkweek">
    <div class="card-head"><span class="card-title">Your week</span><span class="link" onclick="openSchedule()">Change days</span></div>
    <div class="wkweek-row">${cols}</div>
  </div>`;
}
window.openSchedule = function(){
  const body = $id("nodeBody"); if(!body) return;
  const draft = Object.fromEntries(WK.map(w=>[w.id, (w.days||[]).slice()]));
  const CT = window.CARDIO_TYPES || [];
  const cdraft = Object.fromEntries(CT.map(c=>[c.type, ((prefs.cardioDays||{})[c.type]||[]).slice()]));
  const ccol = t => (CTYPE[t]||{c:"#b58cff"}).c, cic = t => (CTYPE[t]||{i:"🏃"}).i;
  const draw = () => {
    body.innerHTML = `<h2 style="margin:0 0 4px">Change your days</h2>
      <p class="thin" style="margin:0 0 10px">Tap a day to put a workout or cardio on it, or take it off. This is your plan for every week.</p>
      <div class="sch">
        <div class="sch-row sch-head">${DOW.map(d=>`<b>${d}</b>`).join("")}</div>
        ${WK.map(w=>`<div class="sch-n">${w.icon} ${esc(w.name)}</div><div class="sch-row">
          ${DOW.map(d=>{ const on = draft[w.id].includes(d);
            return `<span class="sch-c${on?" on":""}" style="${on?`background:${w.fg};border-color:${w.fg}`:""}" onclick="schTap('${w.id}','${d}')">${on?"✓":""}</span>`; }).join("")}</div>`).join("")}
        <div class="dp-sec" style="margin:14px 2px 2px">CARDIO</div>
        ${CT.map(c=>`<div class="sch-n">${cic(c.type)} ${c.label}</div><div class="sch-row">
          ${DOW.map(d=>{ const on = cdraft[c.type].includes(d);
            return `<span class="sch-c${on?" on":""}" style="${on?`background:${ccol(c.type)};border-color:${ccol(c.type)}`:""}" onclick="schTapC('${c.type}','${d}')">${on?"✓":""}</span>`; }).join("")}</div>`).join("")}
      </div>
      <div class="wk-note" style="padding:12px 0 0">Just this once on a different day? No change needed — do it any day and it counts for that week.</div>
      <div class="btns">
        <button class="b b-ghost" onclick="closeAll()">Cancel</button>
        <button class="b b-primary" onclick="schSave()">Save my week</button>
      </div>`;
  };
  window.schTapC = (t, d) => { const a = cdraft[t]; const i = a.indexOf(d); if(i>-1) a.splice(i,1); else a.push(d);
    a.sort((x,y)=>DOW.indexOf(x)-DOW.indexOf(y)); draw(); };
  window.schTap = (id, d) => { const a = draft[id]; const i = a.indexOf(d); if(i>-1) a.splice(i,1); else a.push(d);
    a.sort((x,y)=>DOW.indexOf(x)-DOW.indexOf(y)); draw(); };
  window.schSave = () => {
    const empty = WK.filter(w=>!draft[w.id].length);
    if(empty.length){ toast(`${empty[0].name} needs at least one day`); return; }
    const old = Object.fromEntries(WK.map(w=>[w.id, {days:(w.days||[]).slice(), perWeek:w.perWeek}]));
    const changed = [];
    const oldC = JSON.parse(JSON.stringify(prefs.cardioDays||{}));
    if(JSON.stringify(oldC)!==JSON.stringify(Object.fromEntries(Object.entries(cdraft).filter(([,v])=>v.length)))){
      prefs.cardioDays = Object.fromEntries(Object.entries(cdraft).filter(([,v])=>v.length)); changed.push("Cardio days updated"); }
    WK.forEach(w=>{ const nd = draft[w.id]; if(nd.join()!==(w.days||[]).join()){ changed.push(`${w.name} → ${nd.join(", ")}`); w.days = nd.slice(); w.perWeek = nd.length; } });
    save(); closeAll(); renderWorkouts();
    if(changed.length) toastUndo(changed.length===1 ? changed[0] : `${changed.length} workouts moved`, ()=>{
      WK.forEach(w=>{ if(old[w.id]){ w.days = old[w.id].days; w.perWeek = old[w.id].perWeek; } }); prefs.cardioDays = oldC; save(); renderWorkouts(); });
    else toast("No changes");
  };
  draw(); openSheet("node");
};
const _renderWorkouts60 = renderWorkouts;
renderWorkouts = function(){
  const r = _renderWorkouts60.apply(this, arguments);
  try{
    const body = $id("wkBody"), b = $id("wkBack");
    if(body && !(b && b.style.display!=="none") && !body.querySelector(".wkweek")){
      const h = document.createElement("div"); h.innerHTML = weekCard();
      const cal = body.querySelector(".mcal");
      if(cal) cal.after(h.firstElementChild); else body.appendChild(h.firstElementChild);
    }
  }catch(e){ console.warn(e); }
  return r;
};
})();

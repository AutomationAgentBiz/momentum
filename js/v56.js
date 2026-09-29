/* =====================================================================
   v56 — fixes from the "normal person" walk-through
     1. Rest timer stops when the workout ends or you leave, hides under sheets
     2. Phone back inside a project goes to the Projects list
     3. Unfinished sessions: clear labels, Resume instead of a second Start,
        and a "Tidy unfinished" review you choose (every change can be undone)
     4. Finish screen after a workout
     5. Ask: Undo on every change, even when the AI falls back to the built-in brain
     6. Log a run: day picker, typing works straight away
     7. Small wording fixes (first +, rest button, Health count)
   Nothing here deletes data on its own.
   ===================================================================== */
(function(){
const $id = id => document.getElementById(id);
const fmtDay = key => { try{ const r=dayLabel(key); if(r==="Today"||r==="Yesterday") return r;
  return new Date(key+"T12:00:00").toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"}); }catch(e){ return key; } };

/* ---------------------------------------------------------------------------
   1. Rest timer
   --------------------------------------------------------------------------- */
function stopRest(){ try{ if(typeof restStop==="function") restStop(); }catch(e){} }
const _go56 = go;
go = function(v){ const from = (typeof curView==="function") ? curView() : null;
  if(from && v !== from) stopRest();
  return _go56.apply(this, arguments); };

const _finish56 = finishWorkout;
finishWorkout = function(){
  const w = wkSession ? wkById(wkSession.id) : null;
  const before = w ? baseSess(w.id) : null;
  const sid = wkSession && wkSession.sid;
  const r = _finish56.apply(this, arguments);
  stopRest();
  try{
    if(w && !wkSession){
      const rec = (wkHist[w.id]||[]).find(h=>h && sid && h.sid===sid) || doneSess(w.id).slice(-1)[0];
      if(rec && !rec.partial) setTimeout(()=>showFinish(w, rec, before), 250);
    }
  }catch(e){ console.warn(e); }
  return r;
};
const _leave56 = leaveWorkout;
leaveWorkout = async function(){ stopRest(); return _leave56.apply(this, arguments); };

/* ---------------------------------------------------------------------------
   2. Projects: opening one keeps its own back arrow, so phone-back lands on the list
   --------------------------------------------------------------------------- */
const _openProject56 = openProject;
openProject = function(id){
  if((typeof curView==="function"?curView():"") !== "projects"){ _go56("projects"); }
  const realGo = go; go = function(v){ if(v==="projects") return; return realGo.apply(this, arguments); };
  try{ return _openProject56(id); } finally { go = realGo; }
};

/* ---------------------------------------------------------------------------
   3. Unfinished sessions
   --------------------------------------------------------------------------- */
const partials = id => (wkHist[id]||[]).filter(h=>h && h.partial && !(wkSession && h.sid && h.sid===wkSession.sid));
const allPartials = () => WK.flatMap(w=>partials(w.id).map(h=>({w,h})));
const setsIn = h => (h.logged!=null ? h.logged : Object.values(h.entries||{}).filter(v=>v&&+v.reps>0).length);
const repsIn = h => Object.values(h.entries||{}).reduce((a,v)=>a+(+(v&&v.reps)||0),0);
/* a partial on a day you also finished that workout is a leftover copy */
const isDupe = (w,h) => doneSess(w.id).some(x=>x.d===h.d);

const _sessionListCard = sessionListCard;
sessionListCard = function(w){
  let html = _sessionListCard(w); if(!html) return html;
  const done = doneSess(w.id).length, un = partials(w.id).length;
  html = html.replace(/<span class="link">\d+ logged<\/span>/,
    `<span class="link">${done} finished${un?` · ${un} unfinished`:""}</span>`);
  html = html.replace(/ · still in progress/g, ` · <b style="color:#ff9d4d">unfinished</b>`);
  if(un){
    html = html.replace(`<div class="wk-note" style="padding:0 16px 10px;font-size:11.5px">`,
      `<div class="unfin-note">${un} unfinished session${un===1?"":"s"} — started but never finished, so they don't count.
        <span onclick="openTidy('${w.id}')">Review them ›</span></div>
       <div class="wk-note" style="padding:0 16px 10px;font-size:11.5px">`);
  }
  return html;
};

window.openTidy = function(onlyId){
  const list = allPartials().filter(x=>!onlyId || x.w.id===onlyId);
  const body = $id("nodeBody"); if(!body) return;
  if(!list.length){ closeAll(); toast("No unfinished sessions left"); return; }
  const dupes = list.filter(x=>isDupe(x.w,x.h));
  body.innerHTML = `<h2 style="margin:0 0 4px">Unfinished sessions</h2>
    <p class="thin" style="margin:0 0 6px">These were started but never finished, so they don't count toward your progress.
      Keep them, count them as done, or remove them. Every choice can be undone.</p>
    ${dupes.length?`<button class="b b-ghost" style="width:100%;margin:6px 0 2px" onclick="tidyDupes('${onlyId||""}')">
      Remove the ${dupes.length} leftover cop${dupes.length===1?"y":"ies"} (you finished that workout the same day)</button>`:""}
    ${list.map(({w,h})=>`<div class="dd-card" style="border-color:${w.fg}66">
      <div class="dd-top"><span class="dd-ic" style="background:${w.bg}">${w.icon}</span>
        <b>${esc(w.name)}<br><span class="dd-sum">${fmtDay(h.d)} · ${repsIn(h)} reps${isDupe(w,h)?" · finished copy exists":""}</span></b></div>
      <div class="wk-row" style="padding:10px 0 0">
        <button class="b b-ghost" onclick="tidyOne('${w.id}','${h.sid||h.d}','remove','${onlyId||""}')">Remove</button>
        <button class="b b-blue" onclick="tidyOne('${w.id}','${h.sid||h.d}','count','${onlyId||""}')">Count it as done</button>
      </div></div>`).join("")}
    <div class="btns"><button class="b b-ghost" style="width:100%" onclick="closeAll()">Keep them all for now</button></div>`;
  openSheet("node");
};
function refreshWk(onlyId){
  save(); renderWorkouts();
  const b=$id("wkBack"); if(onlyId && b && b.style.display!=="none") openWorkout(onlyId,1);
}
window.tidyOne = function(wid, key, what, onlyId){
  const list = wkHist[wid]||[];
  const i = list.findIndex(h=>h && (h.sid||h.d)===key); if(i<0){ toast("That one's already gone"); return; }
  const snap = JSON.parse(JSON.stringify(list[i]));
  if(what==="remove") list.splice(i,1); else list[i].partial = false;
  refreshWk(onlyId);
  if(allPartials().filter(x=>!onlyId||x.w.id===onlyId).length) openTidy(onlyId||null); else closeAll();
  toastUndo(what==="remove" ? `Removed ${fmtDay(snap.d)}` : `Counted ${fmtDay(snap.d)} as done`, ()=>{
    const l = wkHist[wid] = wkHist[wid]||[];
    const j = l.findIndex(h=>h && (h.sid||h.d)===key);
    if(j>-1) l[j] = snap; else { l.push(snap); l.sort((a,b)=>String(a.d||"").localeCompare(String(b.d||""))); }
    refreshWk(onlyId);
  });
};
window.tidyDupes = function(onlyId){
  const snap = JSON.stringify(wkHist);
  let n = 0;
  WK.forEach(w=>{ if(onlyId && w.id!==onlyId) return;
    wkHist[w.id] = (wkHist[w.id]||[]).filter(h=>{
      const drop = h && h.partial && !(wkSession && h.sid===wkSession.sid) && doneSess(w.id).some(x=>x.d===h.d);
      if(drop) n++; return !drop; }); });
  refreshWk(onlyId);
  if(allPartials().filter(x=>!onlyId||x.w.id===onlyId).length) openTidy(onlyId||null); else closeAll();
  toastUndo(`Removed ${n} leftover cop${n===1?"y":"ies"}`, ()=>{ const back = JSON.parse(snap);
    Object.keys(back).forEach(k=>wkHist[k]=back[k]); refreshWk(onlyId); });
};

/* "Throw it away" used to leave its record behind as a ghost "in progress" session. */
dropUnfinished = async function(){
  if(!wkSession) return;
  if(!await ask("Throw away the sets you logged?\n\nYou'll get an Undo for a few seconds.","Throw it away",1)) return;
  const sess = JSON.parse(JSON.stringify(wkSession)), wid = wkSession.id;
  const list = wkHist[wid]||[], i = list.findIndex(h=>h && h.sid===wkSession.sid);
  const rec = i>-1 ? list.splice(i,1)[0] : null;
  wkSession = null; stopRest(); save(); renderWorkouts();
  toastUndo("Thrown away", ()=>{ wkSession = sess; if(rec){ (wkHist[wid]=wkHist[wid]||[]).splice(Math.max(0,i),0,rec); }
    save(); renderWorkouts(); });
};

/* History header said "Last 5 sessions" over every session, and "never done"
   while unfinished ones existed. */
const _openWorkout56 = openWorkout;
openWorkout = function(id, historyOnly){
  const r = _openWorkout56.apply(this, arguments);
  try{
    const w = wkById(id); const n = doneSess(id).length, un = partials(id).length;
    if(historyOnly){
      const t = document.querySelector("#wkBody .card .card-title");
      if(t && /Last 5 sessions/.test(t.textContent)) t.textContent = n ? `${n} finished session${n===1?"":"s"}` : "No finished sessions yet";
    } else if(!n && un && $id("wkSub")){
      $id("wkSub").textContent = `Not finished yet — ${un} unfinished session${un===1?"":"s"} in History`;
    }
    if(!historyOnly) firstPlusHint = true;
  }catch(e){}
  return r;
};

/* Today card: the workout you're in the middle of says Resume, not Start. */
const _todayCard = todayCard;
todayCard = function(){
  let html = _todayCard();
  if(wkSession && sessTotals && sessTotals().logged){
    const id = wkSession.id;
    html = html.replace(new RegExp(`(onclick="openWorkout\\('${id}'\\)"[\\s\\S]*?<div class="crbtn take"[^>]*>)\\s*(Start|Again)`),
      `$1Resume`);
  }
  const un = allPartials().length;
  if(un) html = html.replace(/<\/div>\s*$/, `<div class="unfin-note" style="margin:0 16px 12px">${un} unfinished session${un===1?"":"s"} from before.
      <span onclick="openTidy()">Review ›</span></div></div>`);
  return html;
};

/* Parking a workout with the phone's back button: say it once, not every time. */
const _innerBack56 = window.innerBack;
window.innerBack = function(){
  const v = (document.querySelector(".view.active")||{}).id || "";
  if(v==="view-workouts" && wkSession && !(window.inCardioScreen && inCardioScreen())){
    const b=$id("wkBack");
    if(b && b.style.display!=="none"){
      save(); stopRest(); renderWorkouts();
      if(!wkSession._told){ wkSession._told = 1; toast("Workout kept open — it's at the top when you want it"); }
      return true;
    }
  }
  return _innerBack56 ? _innerBack56() : false;
};

/* ---------------------------------------------------------------------------
   4. Finish screen
   --------------------------------------------------------------------------- */
function showFinish(w, rec, before){
  const body = $id("nodeBody"); if(!body) return;
  const reps = repsIn(rec), was = before && before.entries ? repsIn(before) : 0;
  const diff = reps - was, pct = was ? Math.round(diff/was*100) : null;
  const rows = w.ex.map(e=>{ const a=(rec.entries||{})[e.n]||{reps:0,wt:0}, b=before&&before.entries?before.entries[e.n]:null;
    const d = b ? (+a.reps||0)-(+b.reps||0) : null;
    return `<div class="dd-row"><span>${esc(e.n)}</span><em>${a.reps||0} reps${a.wt?` · ${a.wt} lb`:""}${
      d==null?"":d>0?` <span style="color:#4fd6a5">▲${d}</span>`:d<0?` <span style="color:#ff8f8f">▼${-d}</span>`:` <span style="color:var(--ink3)">=</span>`}</em></div>`; }).join("");
  const headline = pct==null ? "First one logged — next time you'll have something to beat."
    : diff>0 ? `You beat last time by ${diff} reps (+${pct}%). 🔥`
    : diff===0 ? "Matched last time exactly. Solid." : `${-diff} reps short of last time — still counts.`;
  body.innerHTML = `<div style="text-align:center;padding:4px 0 6px">
      <div style="font-size:34px">${w.icon}</div>
      <h2 style="margin:4px 0 2px">${esc(w.name)} — done</h2>
      <div class="dd-sum">${fmtDay(rec.d)}</div></div>
    <div class="mc-stats" style="grid-template-columns:repeat(3,1fr)">
      <div><b style="color:${w.fg}">${reps}</b><span>reps</span></div>
      <div><b>${was||"—"}</b><span>last time</span></div>
      <div><b style="color:${diff>0?"#4fd6a5":diff<0?"#ff8f8f":"var(--ink)"}">${pct==null?"—":(diff>0?"+":"")+pct+"%"}</b><span>change</span></div></div>
    <p style="text-align:center;font-weight:800;margin:4px 0 8px">${headline}</p>
    <div class="dd-card">${rows}</div>
    <div class="btns"><button class="b b-primary" style="width:100%" onclick="closeAll()">Nice</button></div>`;
  openSheet("node");
}
window.showFinish = showFinish;

/* First tap on + jumps to your usual count — say so, the first few times. */
let firstPlusHint = true;
const _repStep56 = repStep;
repStep = function(i, d){
  let before = 0;
  try{ const e=sessEx()[i]; before = ((wkSession.entries[e.n]||[])[wkSession.round-1]||{}).reps||0; }catch(e){}
  const r = _repStep56.apply(this, arguments);
  try{
    if(d>0 && before===0 && firstPlusHint){
      let n = 0; try{ n = +localStorage.getItem("momentum.plusHint")||0; }catch(e){}
      if(n < 3){ const e=sessEx()[i]; toast(`Filled in your usual ${defReps(e)} — tap + or − to adjust, or type it`);
        try{ localStorage.setItem("momentum.plusHint", n+1); }catch(e){} }
      firstPlusHint = false;
    }
  }catch(e){}
  return r;
};

/* ---------------------------------------------------------------------------
   6. Log a run
   --------------------------------------------------------------------------- */
window.openCardioAdd = function(){
  const d = $id("cdDay"); const today = ymd(new Date());
  if(d){ d.max = today; if(!d.value) d.value = today; }
  openSheet("cardioAdd");
  // wait for the slide-up to finish, otherwise the first keys you type go nowhere
  setTimeout(()=>{ const m=$id("cdMi"); if(m) try{ m.focus({preventScroll:true}); }catch(e){ m.focus(); } }, 380);
};

/* ---------------------------------------------------------------------------
   7. Health: the "things logged" count matches the tiles you can see
   --------------------------------------------------------------------------- */
const _renderHealth56 = renderHealth;
renderHealth = async function(){
  const r = await _renderHealth56.apply(this, arguments);
  try{
    const tiles = document.querySelectorAll("#view-health .htiles .htile").length;
    const link = [...document.querySelectorAll("#view-health .card-head .link")].find(l=>/logged$/.test(l.textContent.trim()));
    if(link){ const n = parseInt(link.textContent)||0; const m = Math.max(n, tiles);
      link.textContent = `${m} ${m===1?"thing":"things"} logged today`; }
  }catch(e){}
  return r;
};


/* ---------------------------------------------------------------------------
   8. Tracker: "New tracker" as a normal button at the top
   --------------------------------------------------------------------------- */
const _renderTracker56 = renderTracker;
renderTracker = function(){
  const r = _renderTracker56.apply(this, arguments);
  try{ const box=$id("trackerBody");
    if(box && !box.querySelector(".newtrk")){
      const b=document.createElement("button"); b.className="newtrk"; b.innerHTML="✦ New tracker";
      b.onclick=()=>openTrackerAI(); box.insertBefore(b, box.firstChild); } }catch(e){}
  return r;
};
})();

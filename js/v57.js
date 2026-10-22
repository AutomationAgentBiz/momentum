/* =====================================================================
   v57 — Do two workouts together (e.g. Legs & Back + Arms & Shoulders)
   Each workout keeps its own session, its own history, its own "beat last
   time". You switch between them with one tap at the top. Finish saves both.
   The second session rides inside the first (wkSession.pair), so it is saved
   and synced with everything else — no new storage, nothing to migrate.
   ===================================================================== */
(function(){
const $id = id => document.getElementById(id);
const setsLogged = s => Object.values((s&&s.entries)||{}).reduce((a,list)=>a+(list||[]).filter(c=>c&&+c.reps>0).length,0);
function newSess(id){
  const w = wkById(id); if(!w) return null;
  const last = baseSess(id), rounds = Math.max(1, w.rounds||1);
  const s = {id, sid:"s"+Date.now().toString(36)+Math.random().toString(36).slice(2,5), round:1, rounds,
             forDay: (wkSession && wkSession.forDay) || ymd(new Date()), entries:{}};
  w.ex.forEach(e=>{ s.entries[e.n]=[]; for(let r=0;r<rounds;r++) s.entries[e.n].push({reps:0, wt:(last.entries[e.n]||{}).wt||0}); });
  return s;
}
const paired = () => !!(wkSession && wkSession.pair);

/* ---- switch between the two ---- */
function swapOnly(){ const a = wkSession, b = a.pair; delete a.pair; b.pair = a; wkSession = b; }
window.switchPair = function(){
  if(!paired()) return;
  try{ if(typeof restStop==="function") restStop(); }catch(e){}
  persistSession(false);                         // what you just did is written down first
  (window.__pairY = window.__pairY || {})[wkSession.id] = window.scrollY||0;   // remember where you were on this one
  swapOnly(); save(); renderSession();
  const y = (window.__pairY||{})[wkSession.id]||0; requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo(0,y)));
};

/* ---- start two together ---- */
window.startPair = async function(a, b){
  if(!a || !b || a===b){ toast("Pick two different workouts"); return; }
  if(wkSession && wkSession.id!==a && wkSession.id!==b && sessTotals().logged){
    const other = wkById(wkSession.id);
    const yes = await ask(`You've got ${sessTotals().logged} set${sessTotals().logged===1?"":"s"} open on ${other?other.name:"another workout"}.\n\nSave that to your history first?`, "Save it");
    if(!yes) return;
    finishWorkout();
    if(wkSession) return;
  }
  // keep whatever you've already started; build only what's missing
  if(wkSession && wkSession.id===b){ const t=a; a=b; b=t; }
  if(!(wkSession && wkSession.id===a)){
    if(wkSession && !sessTotals().logged) wkSession = null;
    wkSession = newSess(a);
  }
  if(!wkSession.pair || wkSession.pair.id!==b) wkSession.pair = newSess(b);
  try{ $id("wkTabs").parentElement.style.display="none"; }catch(e){}
  closeAll(); save(); go("workouts");
  try{ if(!$id("wkBack") || $id("wkBack").style.display==="none") wkListScroll = window.scrollY||0; }catch(e){}
  renderSession(); window.scrollTo(0,0);
  toast(`Doing ${wkById(a).name} + ${wkById(b).name} — tap the top bar to switch`);
};

window.openPairPicker = function(preset){
  const body = $id("nodeBody"); if(!body) return;
  let pick = preset ? [preset] : (wkSession && sessTotals().logged ? [wkSession.id] : []);
  const draw = () => {
    body.innerHTML = `<h2 style="margin:0 0 4px">Do two together</h2>
      <p class="thin" style="margin:0 0 10px">Pick two. Each one keeps its own history and "beat last time" —
        you just switch between them with one tap while you train.</p>
      ${WK.map(w=>{ const on = pick.includes(w.id);
        return `<div class="pp-row${on?" on":""}" style="${on?`border-color:${w.fg};background:${w.bg}`:""}" onclick="pairTap('${w.id}')">
          <span class="dd-ic" style="background:${w.bg}">${w.icon}</span><b>${esc(w.name)}</b>
          <span class="pp-chk" style="${on?`background:${w.fg};border-color:${w.fg}`:""}">${on?"✓":""}</span></div>`; }).join("")}
      <div class="btns">
        <button class="b b-ghost" onclick="closeAll()">Cancel</button>
        <button class="b b-blue" ${pick.length===2?"":"disabled style=\"opacity:.45\""} onclick="pairGo()">Start both</button>
      </div>`;
  };
  window.pairTap = id => { if(pick.includes(id)) pick = pick.filter(x=>x!==id); else { if(pick.length>=2){ toast("Two at a time — untick one first"); return; } pick.push(id); } draw(); };
  window.pairGo = () => { if(pick.length===2) startPair(pick[0], pick[1]); };
  draw(); openSheet("node");
};

/* ---- the switch bar at the top of a live session ---- */
const _renderSession57 = renderSession;
renderSession = function(){
  const r = _renderSession57.apply(this, arguments);
  try{
    const body = $id("wkBody"); if(!body || !wkSession) return r;
    const cur = wkById(wkSession.id);
    try{ $id("wkTabs").parentElement.style.display="none"; $id("wkTitle").textContent = cur.name;
         $id("wkBack").style.display="flex";
         if(paired()) $id("wkSub").textContent = `Together with ${wkById(wkSession.pair.id).name}`; }catch(e){}
    if(paired()){
      const other = wkById(wkSession.pair.id);
      const bar = document.createElement("div"); bar.className = "pairbar";
      const pill = (w, s, on) => `<div class="pp-pill${on?" on":""}" style="${on?`border-color:${w.fg};background:${w.bg}`:""}" ${on?"":`onclick="switchPair()"`}>
          <span>${w.icon}</span><div><b style="${on?`color:${w.fg}`:""}">${esc(w.name)}</b><em>${setsLogged(s)} set${setsLogged(s)===1?"":"s"}${on?" · now":" · tap to switch"}</em></div></div>`;
      bar.innerHTML = `<div class="pp-lbl">DOING TWO TOGETHER</div>
        <div class="pp-pills">${pill(cur, wkSession, true)}${pill(other, wkSession.pair, false)}</div>`;
      body.insertBefore(bar, body.firstChild);
    } else {
      const add = document.createElement("div"); add.className = "pp-add";
      add.innerHTML = `＋ Add a second workout to do alongside ${esc(cur?cur.name:"this")}`;
      add.onclick = () => openPairPicker(wkSession.id);
      body.insertBefore(add, body.firstChild);
    }
  }catch(e){ console.warn(e); }
  return r;
};

/* keep the "N sets · now" count live as you log */
const _paintTotals57 = paintTotals;
paintTotals = function(){
  const r = _paintTotals57.apply(this, arguments);
  try{ const em = document.querySelector(".pairbar .pp-pill.on em");
    if(em && wkSession){ const n = setsLogged(wkSession); em.textContent = `${n} set${n===1?"":"s"} · now`; } }catch(e){}
  return r;
};

/* tapping the other workout anywhere just switches to it */
const _openWorkout57 = openWorkout;
openWorkout = function(id, historyOnly){
  if(!historyOnly && paired() && wkSession.pair.id===id){
    switchPair(); return; }
  return _openWorkout57.apply(this, arguments);
};

/* ---- finish: saves both, one summary ---- */
const _finish57 = finishWorkout;
finishWorkout = function(){
  if(!paired()) return _finish57.apply(this, arguments);
  const A = wkSession, B = A.pair;
  const la = sessTotals().logged;
  wkSession = B; const lb = sessTotals().logged; wkSession = A;
  if(!la && !lb){ toast("Log at least one set first"); return; }
  delete A.pair; delete B.pair;
  window.__finishCollect = [];
  wkSession = A; if(la) _finish57(); else wkSession = null;
  wkSession = B; if(lb) _finish57(); else wkSession = null;
  save(); renderWorkouts();
  const names = [la?wkById(A.id).name:null, lb?wkById(B.id).name:null].filter(Boolean);
  toast(`Saved — ${names.join(" + ")}`);
  setTimeout(()=>{ const got = window.__finishCollect || []; window.__finishCollect = null;
    if(got.length>1) showFinishMany(got); else if(got.length===1) showFinish(...got[0]); }, 450);
};

const repsOnly = (w, entries) => Object.entries(entries||{}).reduce((a,[n,v])=>{ const e=(w.ex||[]).find(x=>x.n===n);
  return a + (e && e.t==="s" ? 0 : (+(v&&v.reps)||0)); }, 0);
function finishBlock([w, rec, before]){
  const reps = repsOnly(w, rec.entries);
  const was = before && before.entries ? repsOnly(w, before.entries) : 0;
  const diff = reps - was, pct = was ? Math.round(diff/was*100) : null;
  return `<div class="dd-card" style="border-color:${w.fg}66">
    <div class="dd-top"><span class="dd-ic" style="background:${w.bg}">${w.icon}</span><b>${esc(w.name)}</b>
      <span class="dd-sum" style="color:${w.fg}">${reps} reps</span></div>
    <div class="dd-row"><span>Last time</span><em>${was||"—"}</em></div>
    <div class="dd-row"><span>Change</span><em style="color:${diff>0?"#4fd6a5":diff<0?"#ff8f8f":"#fff"}">${
      pct==null?"first one — sets the mark":diff>0?`▲ ${diff} reps (+${pct}%)`:diff<0?`▼ ${-diff} reps`:"matched"}</em></div></div>`;
}
window.showFinishMany = function(list){
  const body = $id("nodeBody"); if(!body) return;
  const beat = list.filter(([w,rec,before])=>before&&before.entries&&repsOnly(w,before.entries)>0&&
    repsOnly(w,rec.entries) > repsOnly(w,before.entries)).length;
  body.innerHTML = `<div style="text-align:center;padding:4px 0 6px">
      <div style="font-size:30px">${list.map(x=>x[0].icon).join(" ")}</div>
      <h2 style="margin:4px 0 2px">Both done</h2>
      <div class="dd-sum">${beat?`You beat last time on ${beat} of ${list.length} 🔥`:"Saved to each workout's history"}</div></div>
    ${list.map(finishBlock).join("")}
    <div class="btns"><button class="b b-primary" style="width:100%" onclick="closeAll()">Nice</button></div>`;
  openSheet("node");
};

/* ---- leaving: same question, about both ---- */
const _leave57 = leaveWorkout;
leaveWorkout = async function(){
  if(!paired()) return _leave57.apply(this, arguments);
  try{ if(typeof restStop==="function") restStop(); }catch(e){}
  const back=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo(0,wkListScroll||0)));
  const A = wkSession, n = setsLogged(A) + setsLogged(A.pair);
  if(!n){ wkSession = null; save(); renderWorkouts(); back(); return true; }
  const names = `${wkById(A.id).name} + ${wkById(A.pair.id).name}`;
  const keep = await ask(`You've logged ${n} set${n===1?"":"s"} across ${names}.\n\nSave both to your history now?\n\n(Cancel keeps them open for later.)`, "Save both");
  if(keep){ finishWorkout(); back(); return true; }
  save(); renderWorkouts(); back();
  toast("Kept open — they're at the top of Workouts");
  return true;
};

/* ---- throwing one away keeps the other going ---- */
const _drop57 = dropUnfinished;
dropUnfinished = async function(){
  const pair = wkSession && wkSession.pair;
  await _drop57.apply(this, arguments);
  if(pair && !wkSession){ delete pair.pair; wkSession = pair; save(); renderWorkouts(); }
};

/* ---- Workouts page: the open card names both; Today says Resume on both ---- */
const _unfinishedCard57 = unfinishedCard;
unfinishedCard = function(){
  if(paired() && !setsLogged(wkSession) && setsLogged(wkSession.pair)) swapOnly();   // show the half that has sets
  let html = _unfinishedCard57();
  if(paired() && html){
    const a = wkById(wkSession.id), b = wkById(wkSession.pair.id);
    html = html.replace(`You started <b>${esc(a.name)}</b>`, `You started <b>${esc(a.name)}</b> + <b>${esc(b.name)}</b>`)
               .replace(/Unfinished workout</, "Unfinished workouts<");
  }
  return html;
};
const _todayCard57 = todayCard;
todayCard = function(){
  let html = _todayCard57();
  if(paired()){
    const id = wkSession.pair.id;
    html = html.replace(new RegExp(`(onclick="openWorkout\\('${id}'\\)"[\\s\\S]*?<div class="crbtn take"[^>]*>)\\s*(Start|Again)`), `$1Resume`);
  }
  return html;
};
const _renderWorkouts57 = renderWorkouts;
renderWorkouts = function(){
  const r = _renderWorkouts57.apply(this, arguments);
  try{
    const body = $id("wkBody"); const b = $id("wkBack");
    if(body && !(b && b.style.display!=="none") && !body.querySelector(".pp-start") && !paired()){
      const btn = document.createElement("button"); btn.className = "pp-start";
      btn.innerHTML = `<span>⇄</span> Do two workouts together`;
      btn.onclick = () => openPairPicker();
      const anchor = body.querySelector(".coachsq") ? body.querySelector(".coachsq").closest(".card") : null;
      if(anchor && anchor.nextSibling) body.insertBefore(btn, anchor.nextSibling); else body.appendChild(btn);
    }
  }catch(e){ console.warn(e); }
  return r;
};
})();

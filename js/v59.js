/* =====================================================================
   v59 — Today's full workout
   Pick everything you'll do today — lifting (Abs, Legs, Arms…) and cardio
   (treadmill, stairs…). It becomes a checklist that follows you: on the
   Workouts page, at the top of every workout, and on the "done" screen, so
   the treadmill miles and stair floors don't get forgotten.
   The plan lives in prefs (already saved and synced). Logged sets and runs are
   stored exactly where they always were — the plan only points at them.
   ===================================================================== */
(function(){
const $id = id => document.getElementById(id);
const todayKey = () => ymd(new Date());
const CARDIO = [
  {type:"Treadmill", unit:"mi", label:"Treadmill"},
  {type:"Stairs",    unit:"fl", label:"Stair climber"},
  {type:"Run",       unit:"mi", label:"Run (outside)"},
  {type:"Walk",      unit:"mi", label:"Walk"},
  {type:"Bike",      unit:"mi", label:"Bike"},
];
const cOpt = t => CARDIO.find(c=>c.type===t) || {type:t, unit:"mi", label:t};
const cIcon = t => (CTYPE[t]||{i:"🏃"}).i;
const cCol  = t => (CTYPE[t]||{c:"#b58cff"}).c;

function plan(){ const p = prefs.wkPlan; return (p && p.d===todayKey() && Array.isArray(p.items) && p.items.length) ? p : null; }
window.dayPlan = plan;
const liveIds = () => wkSession ? [wkSession.id].concat(wkSession.pair ? [wkSession.pair.id] : []) : [];
function state(it, p){
  if(it.k==="wk"){
    if(doneSess(it.id).some(h=>h.d===p.d)) return "done";
    return liveIds().includes(it.id) ? "live" : "todo";
  }
  if(cardio.some(c=>c.d===p.d && c.type===it.type)) return "done";
  return (p.skip||[]).includes(it.type) ? "skip" : "todo";
}
function cardioDoneText(type, d){
  const list = cardio.filter(c=>c.d===d && c.type===type);
  const fl = list.reduce((a,c)=>a+(+c.floors||0),0), mi = list.reduce((a,c)=>a+(+c.mi||0),0);
  return fl ? `${fl} floors` : `${Math.round(mi*100)/100} mi`;
}
function itemName(it){ return it.k==="wk" ? ((wkById(it.id)||{}).name||"Workout") : cOpt(it.type).label; }
function itemIcon(it){ return it.k==="wk" ? ((wkById(it.id)||{}).icon||"🏋️") : cIcon(it.type); }
function counts(p){
  const st = p.items.map(it=>state(it,p));
  return {st, done: st.filter(s=>s==="done"||s==="skip").length, total: p.items.length};
}

/* ---------------------------------------------------------------------------
   Plan picker
   --------------------------------------------------------------------------- */
window.openDayPlan = function(){
  const body = $id("nodeBody"); if(!body) return;
  const dow = DOW[new Date().getDay()];
  const remembered = (prefs.wkPlanByDow||{})[dow];
  // what your week says for today (lifting + cardio); if nothing is scheduled, what you did last time on this day
  const scheduled = WK.filter(w=>(w.days||[]).includes(dow)).map(w=>({k:"wk", id:w.id}))
    .concat(CARDIO.filter(c=>((prefs.cardioDays||{})[c.type]||[]).includes(dow)).map(c=>({k:"cd", type:c.type})));
  let pick = plan() ? plan().items.slice()
    : scheduled.length ? scheduled
    : remembered ? remembered.filter(it=>it.k!=="wk" || wkById(it.id)) : [];
  const has = it => pick.some(x=>x.k===it.k && (x.k==="wk" ? x.id===it.id : x.type===it.type));
  const draw = () => {
    body.innerHTML = `<h2 style="margin:0 0 4px">Today's full workout</h2>
      <p class="thin" style="margin:0 0 6px">Tick everything you'll do today. It becomes a checklist that stays with you
        until it's all logged.${!plan() && scheduled.length ? ` Already ticked what's on your week for ${dow}.` : ""}</p>
      <div class="dp-sec">LIFTING</div>
      ${WK.map(w=>{ const on = has({k:"wk",id:w.id});
        return `<div class="pp-row${on?" on":""}" style="${on?`border-color:${w.fg};background:${w.bg}`:""}" onclick="dpTap('wk','${w.id}')">
          <span class="dd-ic" style="background:${w.bg}">${w.icon}</span><b>${esc(w.name)}</b>
          <span class="pp-chk" style="${on?`background:${w.fg};border-color:${w.fg}`:""}">${on?"✓":""}</span></div>`; }).join("")}
      <div class="dp-sec">CARDIO</div>
      ${CARDIO.map(c=>{ const on = has({k:"cd",type:c.type}), col = cCol(c.type);
        return `<div class="pp-row${on?" on":""}" style="${on?`border-color:${col};background:${col}1f`:""}" onclick="dpTap('cd','${c.type}')">
          <span class="dd-ic" style="background:${col}22">${cIcon(c.type)}</span><b>${c.label}<span class="dp-u">${c.unit==="fl"?"floors":"miles"}</span></b>
          <span class="pp-chk" style="${on?`background:${col};border-color:${col}`:""}">${on?"✓":""}</span></div>`; }).join("")}
      <div class="btns">
        <button class="b b-ghost" onclick="closeAll()">Cancel</button>
        <button class="b b-blue" ${pick.length?"":"disabled style=\"opacity:.45\""} onclick="dpSave()">Set today's workout</button>
      </div>`;
  };
  window.dpTap = (k, v) => {
    const it = k==="wk" ? {k, id:v} : {k, type:v};
    if(has(it)) pick = pick.filter(x=>!(x.k===it.k && (k==="wk" ? x.id===v : x.type===v)));
    else pick.push(it);
    draw();
  };
  window.dpSave = () => {
    if(!pick.length) return;
    const old = plan();
    // lifting first, in the order you have your workouts; cardio after
    const items = WK.filter(w=>pick.some(x=>x.k==="wk"&&x.id===w.id)).map(w=>({k:"wk",id:w.id}))
      .concat(CARDIO.filter(c=>pick.some(x=>x.k==="cd"&&x.type===c.type)).map(c=>({k:"cd",type:c.type})));
    prefs.wkPlan = {d: todayKey(), items, skip: old ? (old.skip||[]) : []};
    prefs.wkPlanByDow = Object.assign({}, prefs.wkPlanByDow||{}, {[DOW[new Date().getDay()]]: items});
    save(); closeAll(); refresh();
    toast("Today's workout is set — it'll stay with you until everything's logged");
  };
  draw(); openSheet("node");
};
window.clearDayPlan = function(){
  const old = prefs.wkPlan; prefs.wkPlan = null; save(); refresh();
  toastUndo("Today's list cleared", ()=>{ prefs.wkPlan = old; save(); refresh(); });
};
window.skipDayItem = function(type){
  const p = plan(); if(!p) return;
  p.skip = (p.skip||[]).concat(type); save(); refresh();
  toastUndo(`Skipped ${cOpt(type).label} today`, ()=>{ p.skip = (p.skip||[]).filter(t=>t!==type); save(); refresh(); });
};
function refresh(){
  const live = !!document.querySelector("#wkBody #wsRep0");
  try{ if(live) renderSession(); else if((document.querySelector(".view.active")||{}).id==="view-workouts") renderWorkouts(); }catch(e){}
}

/* ---------------------------------------------------------------------------
   Quick log for cardio (treadmill miles, stair floors)
   --------------------------------------------------------------------------- */
window.CARDIO_TYPES = CARDIO;
window.openCdQuick = function(type){
  const body = $id("nodeBody"); if(!body) return;
  if(!type || !CARDIO.some(c=>c.type===type)){
    const lastAny = [...cardio].sort((a,b)=>String(b.d).localeCompare(String(a.d)))[0];
    type = (lastAny && CARDIO.some(c=>c.type===lastAny.type)) ? lastAny.type : "Treadmill";
  }
  const o = cOpt(type), p = plan(), d = p ? p.d : todayKey();
  const last = [...cardio].filter(c=>c.type===type).sort((a,b)=>String(b.d).localeCompare(String(a.d)))[0];
  const fl = o.unit==="fl";
  // only carry numbers over when you're switching type inside this same open form — never from an earlier entry,
  // and never miles into floors (or back)
  const openNow = $id("node").classList.contains("on") && $id("cqAmt");
  const prevFl = openNow && /floor/i.test((document.querySelector('#nodeBody label.f')||{}).textContent||"");
  const keepAmt = openNow && prevFl===(o.unit==="fl") ? $id("cqAmt").value : "";
  const keepMin = openNow ? ($id("cqMin")||{}).value||"" : "", keepDay = openNow ? ($id("cqDay")||{}).value||"" : "";
  body.innerHTML = `<h2 style="margin:0 0 8px">Log cardio</h2>
    <div class="cq-types">${CARDIO.map(c=>`<span class="cq-t${c.type===type?" on":""}" style="${c.type===type?`border-color:${cCol(c.type)};background:${cCol(c.type)}22`:""}" onclick="openCdQuick('${c.type}')">${cIcon(c.type)} ${c.label}</span>`).join("")}</div>
    <p class="thin" style="margin:10px 0 10px">${last ? `Last time: ${fl?(last.floors||0)+" floors":last.mi+" mi"}${last.min?` in ${last.min} min`:""} (${dayLabel(last.d)}).` : "First one — this sets the mark."}</p>
    <div class="two">
      <div><label class="f">${fl?"Floors":"Miles"}</label>
        <input class="f" id="cqAmt" type="number" inputmode="decimal" step="${fl?1:0.1}" min="0" placeholder="${fl?"e.g. 40":"e.g. 2.5"}"></div>
      <div><label class="f">Minutes <span style="opacity:.6">(optional)</span></label>
        <input class="f" id="cqMin" type="number" inputmode="numeric" step="1" min="0" placeholder="optional"></div>
    </div>
    <label class="f">Day</label>
    <div class="cq-days"><span class="chip" onclick="cqDay(0)">Today</span><span class="chip" onclick="cqDay(1)">Yesterday</span>
      <input class="f" id="cqDay" type="date" max="${todayKey()}" value="${d}" oninput="cqDay()"></div>
    <div class="btns">
      <button class="b b-ghost" onclick="closeAll()">Cancel</button>
      <button class="b b-blue" onclick="cdQuickSave('${type}')">Save</button>
    </div>`;
  if(keepAmt && $id("cqAmt")) $id("cqAmt").value = keepAmt;
  if(keepMin && $id("cqMin")) $id("cqMin").value = keepMin;
  if(keepDay && $id("cqDay")) $id("cqDay").value = keepDay;
  if(!$id("node").classList.contains("on")) openSheet("node");
  cqDay();
  if(!(window.matchMedia && matchMedia("(pointer:coarse)").matches)) setTimeout(()=>{ const a=$id("cqAmt"); if(a) try{ a.focus({preventScroll:true}); }catch(e){ a.focus(); } }, 380);
};
window.cqDay = function(back){ const el=$id("cqDay"); if(!el) return;
  if(back!=null){ const x=new Date(); x.setDate(x.getDate()-back); el.value=ymd(x); }
  document.querySelectorAll(".cq-days .chip").forEach((c,i)=>{ const x=new Date(); x.setDate(x.getDate()-i); c.classList.toggle("on", el.value===ymd(x)); }); };
window.cdQuickSave = function(type){
  const o = cOpt(type), fl = o.unit==="fl";
  const amt = parseFloat(($id("cqAmt")||{}).value), min = Math.max(0, Math.round(parseFloat(($id("cqMin")||{}).value)||0));
  if(!(amt>0)){ toast(fl ? "How many floors?" : "How many miles?"); return; }
  const p = plan(); let d = (($id("cqDay")||{}).value) || (p ? p.d : todayKey());
  if(d > todayKey()){ toast("That day is in the future"); return; }
  const rec = {id:newId(), ago:0, d, type, mi: fl ? 0 : +amt.toFixed(2), min};
  if(fl) rec.floors = Math.round(amt);
  cardio.push(rec);
  if(p && p.skip) p.skip = p.skip.filter(t=>t!==type);
  save(); closeAll(); refresh();
  toastUndo(`${cIcon(type)} ${fl?rec.floors+" floors":rec.mi+" mi"} logged${d!==todayKey()?" for "+dayLabel(d):""}`, ()=>{ cardio = cardio.filter(c=>c.id!==rec.id); save(); refresh(); });
  setTimeout(nudgeAllDone, 300);
};
function nudgeAllDone(){
  const p = plan(); if(!p) return;
  const c = counts(p);
  if(c.done===c.total && !p.cheered){ p.cheered = true; save(); toast("Full workout done — everything's logged 🔥"); }
}

/* ---------------------------------------------------------------------------
   The checklist card on the Workouts page
   --------------------------------------------------------------------------- */
function planCard(){
  const p = plan();
  if(!p){
    return `<div class="card dp-card dp-empty">
      <div class="card-head"><span class="card-title">Today's full workout</span></div>
      <div class="wk-note" style="padding:0 16px 10px">Pick everything for today — lifting and cardio — and get a checklist
        so nothing goes unlogged.</div>
      <div class="wk-row" style="padding:0 16px 14px"><button class="b b-blue" style="width:100%" onclick="openDayPlan()">Plan today's workout</button></div>
    </div>`;
  }
  const c = counts(p), allDone = c.done===c.total;
  const liftLeft = p.items.filter((it,i)=>it.k==="wk" && c.st[i]!=="done");
  const cardioLeft = p.items.filter((it,i)=>it.k==="cd" && c.st[i]==="todo");
  const rows = p.items.map((it,i)=>{
    const s = c.st[i], w = it.k==="wk" ? wkById(it.id) : null, col = w ? w.fg : cCol(it.type);
    let right;
    if(s==="done") right = `<span class="dp-ok">✓ ${it.k==="cd" ? cardioDoneText(it.type,p.d) : "Done"}</span>`;
    else if(s==="skip") right = `<span class="dp-skip">Skipped</span>`;
    else if(it.k==="wk") right = `<button class="b ${s==="live"?"b-primary":"b-blue"} dp-btn" onclick="openWorkout('${it.id}')">${s==="live"?"Resume":"Start"}</button>`;
    else right = `<button class="b b-blue dp-btn" onclick="openCdQuick('${it.type}')">Log</button>`;
    return `<div class="dp-row ${s}">
      <span class="dd-ic" style="background:${col}22">${itemIcon(it)}</span>
      <div class="dp-mid"><b>${esc(itemName(it))}</b>${s==="todo"&&it.k==="cd"?`<span class="dp-sk" onclick="skipDayItem('${it.type}')">skip today</span>`:""}${s==="live"?`<span class="dp-live">in progress</span>`:""}</div>
      ${right}</div>`;
  }).join("");
  return `<div class="card dp-card${allDone?" alldone":""}">
    <div class="card-head"><span class="card-title">Today's full workout</span>
      <span class="link" onclick="openDayPlan()">Edit</span></div>
    <div class="dp-prog"><i style="width:${Math.round(c.done/c.total*100)}%"></i></div>
    <div class="dp-count">${allDone ? "Everything's logged — full workout done 🔥" : `${c.done} of ${c.total} done`}</div>
    ${rows}
    ${!allDone && !liftLeft.length && cardioLeft.length ? `<div class="dp-warn">Don't forget: ${cardioLeft.map(it=>cOpt(it.type).label.toLowerCase()).join(" and ")}</div>` : ""}
    ${liftLeft.length>=2 && !(wkSession&&wkSession.pair) ? `<div class="pp-add" style="margin:4px 16px 14px;width:auto" onclick="openPairPicker()">⇄ Do two of these together</div>` : ""}
  </div>`;
}
const _renderWorkouts59 = renderWorkouts;
renderWorkouts = function(){
  const r = _renderWorkouts59.apply(this, arguments);
  try{
    const body = $id("wkBody"), b = $id("wkBack");
    if(body && !(b && b.style.display!=="none") && !body.querySelector(".dp-card")){
      const holder = document.createElement("div"); holder.innerHTML = planCard();
      const card = holder.firstElementChild;
      const cal = body.querySelector(".mcal");
      if(cal) cal.before(card); else body.insertBefore(card, body.firstChild);   // first thing you see
      // stairs can be logged from the cardio card too
      const cc = $id("cardioCard");
      if(cc){ cc.querySelectorAll('button[onclick="openCardioAdd()"]').forEach(b=>{ b.textContent = "+ Log cardio"; b.setAttribute("onclick","openCdQuick()"); }); }
    }
  }catch(e){ console.warn(e); }
  return r;
};

/* ---------------------------------------------------------------------------
   The same list, small, at the top of every workout
   --------------------------------------------------------------------------- */
const _renderSession59 = renderSession;
renderSession = function(){
  const r = _renderSession59.apply(this, arguments);
  try{
    const p = plan(), body = $id("wkBody"); if(!p || !body || !wkSession) return r;
    const c = counts(p);
    const chips = p.items.map((it,i)=>{
      const s = c.st[i], here = it.k==="wk" && it.id===wkSession.id;
      const tap = it.k==="wk" ? (here ? "" : `onclick="openWorkout('${it.id}')"`) : (s==="done" ? "" : `onclick="openCdQuick('${it.type}')"`);
      return `<span class="dp-chip ${s}${here?" here":""}" ${tap}>${itemIcon(it)} ${esc(itemName(it))}${s==="done"?" ✓":s==="skip"?" –":""}</span>`;
    }).join("");
    const strip = document.createElement("div"); strip.className = "dp-strip";
    strip.innerHTML = `<div class="pp-lbl">TODAY · ${c.done} OF ${c.total} DONE</div><div class="dp-chips">${chips}</div>`;
    body.insertBefore(strip, body.firstChild);
  }catch(e){ console.warn(e); }
  return r;
};

/* ---------------------------------------------------------------------------
   After you finish a workout: what's still on today's list
   --------------------------------------------------------------------------- */
const _finish59 = finishWorkout;
finishWorkout = function(){
  const ids = wkSession ? [wkSession.id].concat(wkSession.pair ? [wkSession.pair.id] : []) : [];
  const r = _finish59.apply(this, arguments);
  try{ const p = plan(); if(p){ let add = false;
    ids.forEach(id=>{ if(!p.items.some(it=>it.k==="wk"&&it.id===id) && doneSess(id).some(h=>h.d===p.d)){ p.items.unshift({k:"wk", id}); add = true; } });
    if(add) save(); } }catch(e){}
  setTimeout(()=>{
    try{
      const p = plan(); if(!p) return;
      const c = counts(p);
      const sheet = $id("node"), body = $id("nodeBody");
      if(!sheet || !sheet.classList.contains("on") || !body || body.querySelector(".dp-next")) return;
      const left = p.items.filter((it,i)=>c.st[i]==="todo" || c.st[i]==="live");
      const box = document.createElement("div"); box.className = "dp-next";
      box.innerHTML = left.length
        ? `<div class="pp-lbl">STILL ON TODAY'S LIST</div>${left.map(it=>`<div class="dp-row todo">
            <span class="dd-ic" style="background:${(it.k==="wk"?(wkById(it.id)||{}).fg:cCol(it.type))}22">${itemIcon(it)}</span>
            <div class="dp-mid"><b>${esc(itemName(it))}</b></div>
            <button class="b b-blue dp-btn" onclick="closeAll();${it.k==="wk"?`openWorkout('${it.id}')`:`setTimeout(()=>openCdQuick('${it.type}'),250)`}">${it.k==="wk"?"Start":"Log"}</button></div>`).join("")}`
        : `<div class="dp-count" style="color:#4fd6a5;padding:6px 0">Everything on today's list is logged 🔥</div>`;
      const btns = body.querySelector(".btns");
      if(btns) btns.before(box); else body.appendChild(box);
    }catch(e){ console.warn(e); }
  }, 750);
  setTimeout(nudgeAllDone, 900);
  return r;
};
})();

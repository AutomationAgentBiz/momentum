/* ================= Momentum v55 — Workouts, one page =================
   - Strength and cardio on one page; cardio gets the same month squares, with
     the miles written in them (1M, 2.5M).
   - A month calendar at the top: what you did each day, and a clear ✕ for a
     workout you skipped that week.
   - Tap any day (top calendar or a workout's squares) to see what you did.
   - Reorder your workouts, and reorder the moves inside one, even mid-workout.
   - The phone's back button steps back one screen inside a page.
   Nothing here deletes or rewrites saved sessions or runs.
*/
(function(){
"use strict";


const $id = x => document.getElementById(x);
const fmtMi = mi => { const n = Math.round((+mi||0)*10)/10; return (n%1===0 ? n.toFixed(0) : n.toFixed(1)) + "M"; };
const shortDate = key => new Date(key+"T12:00:00").toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"});
const cardioOn = key => cardio.filter(c=>c.d===key);
const cardioMiOn = key => cardioOn(key).reduce((a,c)=>a+(+c.mi||0),0);

/* The first day you ever logged anything. Days before it can't be "missed". */
function firstUseKey(){
  let k = null;
  Object.values(wkHist||{}).forEach(list=>(list||[]).forEach(h=>{ if(h && h.d && (!k || h.d<k)) k=h.d; }));
  (cardio||[]).forEach(c=>{ if(c.d && (!k || c.d<k)) k=c.d; });
  return k;
}
const weekStartKey = dt => { const s=new Date(dt); s.setDate(s.getDate()-s.getDay()); return ymd(s); };
/* A scheduled day counts as missed only if the day has passed and you didn't do
   that workout at any point in the same week — making it up another day is fine. */
function missedOn(w, dt, key, today, first){
  if(!first || key < first || key >= today) return false;
  if(!(w.days||[]).includes(DOW[dt.getDay()])) return false;
  const ws = weekStartKey(dt), we = ymd(new Date(new Date(ws+"T12:00:00").getTime()+6*864e5));
  return !doneSess(w.id).some(h=>h.d && h.d>=ws && h.d<=we);
}

/* ---------------------------------------------------------------------------
   Month calendar at the top of Workouts
   --------------------------------------------------------------------------- */
let calOffset = 0;
function monthCalendar(){
  const now = new Date(), today = ymd(now), first = firstUseKey();
  const m0 = new Date(now.getFullYear(), now.getMonth()+calOffset, 1);
  const mEnd = new Date(m0.getFullYear(), m0.getMonth()+1, 0);
  let trained=0, sessions=0, miles=0, missed=0;
  const cells = [];
  for(let i=0;i<m0.getDay();i++) cells.push(`<div class="mc-cell empty"></div>`);
  for(let d=1; d<=mEnd.getDate(); d++){
    const dt = new Date(m0.getFullYear(), m0.getMonth(), d), key = ymd(dt);
    const did = WK.filter(w=>doneSess(w.id).some(h=>h.d===key));
    const mi = cardioMiOn(key);
    const miss = WK.filter(w=>missedOn(w, dt, key, today, first));
    const future = key > today;
    const due = future ? WK.filter(w=>(w.days||[]).includes(DOW[dt.getDay()])) : [];
    if(did.length || mi){ trained++; }
    sessions += did.length; miles += mi; missed += miss.length;
    const dots = did.map(w=>`<i class="mc-dot" style="background:${w.fg}" title="${esc(w.name)}"></i>`).join("");
    const cls = ["mc-cell", did.length||mi ? "did" : "", miss.length && !did.length && !mi ? "miss" : "",
                 key===today ? "today" : "", future ? "future" : ""].filter(Boolean).join(" ");
    const bg = did.length ? `style="background:linear-gradient(160deg,${did[0].fg}33,${did[0].fg}14);border-color:${did[0].fg}88"` :
               mi ? `style="background:linear-gradient(160deg,#b58cff33,#b58cff12);border-color:#b58cff88"` : "";
    cells.push(`<div class="${cls}" ${bg} onclick="openWkDay('${key}')">
      <span class="mc-n">${d}</span>
      ${miss.length && !did.length && !mi ? `<span class="mc-x">✕</span>` : ``}
      <div class="mc-dots">${dots}</div>
      ${mi ? `<span class="mc-mi">${fmtMi(mi)}</span>` : ``}
      ${due.length && !did.length ? `<span class="mc-due" style="border-color:${due[0].fg}88"></span>` : ``}
    </div>`);
  }
  const label = m0.toLocaleDateString(undefined,{month:"long", year: m0.getFullYear()===now.getFullYear()?undefined:"numeric"});
  const streak = trainStreak();
  return `<div class="card mcal">
    <div class="mc-head">
      <div class="mc-nav" onclick="wkCalMove(-1)">‹</div>
      <div class="mc-title">${label}</div>
      <div class="mc-nav${calOffset>=0?" off":""}" onclick="wkCalMove(1)">›</div>
    </div>
    <div class="mc-stats">
      <div><b style="color:#4fd6a5">${trained}</b><span>days trained</span></div>
      <div><b>${sessions}</b><span>workouts</span></div>
      <div><b style="color:#d4bfff">${miles?fmtMi(miles).replace("M"," mi"):"0 mi"}</b><span>cardio</span></div>
      <div><b style="color:${missed?'#ff9d9d':'var(--ink3)'}">${missed}</b><span>missed</span></div>
    </div>
    <div class="mc-dow">${DOW.map(d=>`<span>${d[0]}</span>`).join("")}</div>
    <div class="mc-grid">${cells.join("")}</div>
    <div class="mc-key">
      ${WK.map(w=>`<span><i style="background:${w.fg}"></i>${esc(w.name)}</span>`).join("")}
      <span><i style="background:#b58cff"></i>Cardio (miles)</span>
      <span><em class="kx">✕</em>Missed</span>
    </div>
    ${streak>1 ? `<div class="mc-streak">🔥 ${streak} weeks in a row with every workout done</div>` : ``}
  </div>`;
}
window.wkCalMove = d => { if(d>0 && calOffset>=0) return; calOffset+=d; renderWorkouts(); };
/* Full weeks (before this one) where every workout hit its weekly target. */
function trainStreak(){
  if(!WK.length) return 0;
  let n=0; const now=new Date();
  for(let k=1;k<52;k++){
    const s=new Date(now); s.setDate(s.getDate()-s.getDay()-7*k);
    const ws=ymd(s), we=ymd(new Date(s.getTime()+6*864e5));
    const ok = WK.every(w=>doneSess(w.id).filter(h=>h.d>=ws&&h.d<=we).length >= Math.max(1, w.perWeek||(w.days||[]).length||1));
    if(ok) n++; else break;
  }
  return n;
}

/* ---------------------------------------------------------------------------
   Tap a day → what happened
   --------------------------------------------------------------------------- */
window.openWkDay = function(key){
  const dt = new Date(key+"T12:00:00"), today = ymd(new Date()), first = firstUseKey();
  const did = WK.map(w=>({w, h: doneSess(w.id).filter(h=>h.d===key)})).filter(x=>x.h.length);
  const runs = cardioOn(key);
  const miss = WK.filter(w=>missedOn(w, dt, key, today, first));
  const due = key>=today ? WK.filter(w=>(w.days||[]).includes(DOW[dt.getDay()])) : [];
  const sessHTML = ({w,h}) => h.map(s=>{
    const rows = Object.entries(s.entries||{}).filter(([,v])=>v && +v.reps>0);
    const reps = rows.reduce((a,[,v])=>a+(+v.reps||0),0);
    return `<div class="dd-card" style="border-color:${w.fg}66">
      <div class="dd-top"><span class="dd-ic" style="background:${w.bg}">${w.icon}</span>
        <b>${esc(w.name)}</b><span class="dd-sum" style="color:${w.fg}">${reps} reps</span></div>
      ${rows.map(([n,v])=>{
        const per = s.rounds && s.rounds[n] ? s.rounds[n].map(r=>+r.reps||0).filter(Boolean) : [];
        return `<div class="dd-row"><span>${esc(n)}</span><em>${per.length>1?per.join(" + ")+" = ":""}${v.reps}${v.wt?` × ${v.wt} lb`:""}</em></div>`;
      }).join("") || `<div class="dd-row"><span>No sets saved</span></div>`}
    </div>`;}).join("");
  $id("nodeBody").innerHTML = `
    <h2>${shortDate(key)}</h2>
    ${did.map(sessHTML).join("")}
    ${runs.map(c=>{ const t=CTYPE[c.type]||{i:"🏃",c:"#b58cff"};
      return `<div class="dd-card" style="border-color:${t.c}66" onclick="closeAll();openRun(${c.id})">
        <div class="dd-top"><span class="dd-ic" style="background:${t.c}22">${t.i}</span><b>${esc(c.type)}</b>
        <span class="dd-sum" style="color:${t.c}">${fmtMi(c.mi)} · ${c.min} min</span></div>
        <div class="dd-row"><span>Pace</span><em>${pace(c.mi,c.min)}</em></div></div>`; }).join("")}
    ${miss.map(w=>`<div class="dd-card miss"><div class="dd-top"><span class="dd-ic miss">✕</span>
        <b>${esc(w.name)}</b><span class="dd-sum">missed this week</span></div></div>`).join("")}
    ${due.length && !did.length ? `<div class="wk-note" style="padding:10px 0">Scheduled: ${due.map(w=>esc(w.name)).join(", ")}</div>` : ``}
    ${!did.length && !runs.length && !miss.length && !due.length ? `<div class="wk-note" style="padding:12px 0">Rest day — nothing logged.</div>` : ``}
    <div class="btns"><button class="b b-ghost" style="width:100%" onclick="closeAll()">Close</button></div>`;
  closeAll(); openSheet("node");
};

/* ---------------------------------------------------------------------------
   Each workout's own month squares: tap a day, softer ✕ for missed
   --------------------------------------------------------------------------- */
monthGrid = function(w, offset){
  const now=new Date(), today=ymd(now), first=firstUseKey();
  const m0=new Date(now.getFullYear(), now.getMonth()+(offset||0), 1);
  const mEnd=new Date(m0.getFullYear(), m0.getMonth()+1, 0);
  const done=new Set(doneSess(w.id).map(h=>h.d).filter(Boolean));
  const target=Math.max(1, w.perWeek || (w.days?w.days.length:1));
  const rows=[]; let week=[], count=0;
  for(let i=0;i<m0.getDay();i++) week.push(null);
  for(let d=1; d<=mEnd.getDate(); d++){
    const dt=new Date(m0.getFullYear(), m0.getMonth(), d), key=ymd(dt);
    const hit=done.has(key), due=(w.days||[]).includes(DOW[dt.getDay()]);
    const state = hit ? "did" : missedOn(w,dt,key,today,first) ? "missed" : (due && key>=today ? "due" : "off");
    if(hit) count++;
    week.push({key,d,state,today:key===today});
    if(week.length===7){ rows.push(week); week=[]; }
  }
  if(week.length){ while(week.length<7) week.push(null); rows.push(week); }
  const cell = c => {
    if(!c) return `<div class="wg-cell empty"></div>`;
    const st = c.state==="did" ? `style="background:${w.fg};border-color:${w.fg};box-shadow:0 0 8px ${w.fg}55"`
             : c.state==="due" ? `style="border-color:${w.fg}88;border-style:dashed"` : "";
    return `<div class="wg-cell ${c.state}${c.today?" today":""}" ${st} onclick="openWkDay('${c.key}')">
      ${c.state==="missed"?`<span class="wg-x">✕</span>`:`<span class="wg-n">${c.d}</span>`}</div>`;
  };
  const weekTick = wk => { const n=wk.filter(c=>c&&c.state==="did").length;
    return n>=target ? `<span class="wtick ok" style="color:${w.fg}">✓</span>` : n ? `<span class="wtick part">${n}/${target}</span>` : `<span class="wtick"></span>`; };
  return `<div class="mgrid wg">
    <div class="mgrid-head"><span class="mg-month">${m0.toLocaleDateString(undefined,{month:"long"})}</span>
      <span class="mg-count" style="color:${count?w.fg:'var(--ink3)'}">${count} <em>session${count===1?"":"s"}</em></span></div>
    <div class="wg-row wg-dow">${DOW.map(d=>`<span>${d[0]}</span>`).join("")}<span class="wkh">week</span></div>
    ${rows.map(wk=>`<div class="wg-row">${wk.map(cell).join("")}${weekTick(wk)}</div>`).join("")}
    <div class="mg-key"><span><i style="background:${w.fg};border-color:${w.fg}"></i>Done</span>
      <span><em class="kx">✕</em>Missed</span><span><i style="border-color:${w.fg}88;border-style:dashed"></i>Coming up</span>
      <span style="color:var(--ink3)">Tap a day to see it</span></div>
  </div>`;
};

/* Cardio's squares: same look, miles written in the square. */
function cardioGrid(){
  const now=new Date(), today=ymd(now);
  const m0=new Date(now.getFullYear(), now.getMonth(), 1), mEnd=new Date(now.getFullYear(), now.getMonth()+1, 0);
  const rows=[]; let week=[], days=0, mi=0;
  for(let i=0;i<m0.getDay();i++) week.push(null);
  for(let d=1; d<=mEnd.getDate(); d++){
    const key=ymd(new Date(m0.getFullYear(), m0.getMonth(), d)), m=cardioMiOn(key);
    if(m){ days++; mi+=m; }
    week.push({key,d,m,today:key===today});
    if(week.length===7){ rows.push(week); week=[]; }
  }
  if(week.length){ while(week.length<7) week.push(null); rows.push(week); }
  const cell = c => !c ? `<div class="wg-cell empty"></div>`
    : `<div class="wg-cell ${c.m?"did":"off"}${c.today?" today":""}" ${c.m?`style="background:#b58cff;border-color:#b58cff;box-shadow:0 0 8px #b58cff55"`:""} onclick="openWkDay('${c.key}')">
        ${c.m?`<span class="wg-mi">${fmtMi(c.m)}</span>`:`<span class="wg-n">${c.d}</span>`}</div>`;
  const weekMi = wk => { const n=wk.reduce((a,c)=>a+(c&&c.m||0),0); return n?`<span class="wtick part" style="color:#d4bfff">${fmtMi(n)}</span>`:`<span class="wtick"></span>`; };
  return {days, mi, html:`<div class="mgrid wg">
    <div class="mgrid-head"><span class="mg-month">${m0.toLocaleDateString(undefined,{month:"long"})}</span>
      <span class="mg-count" style="color:${days?'#d4bfff':'var(--ink3)'}">${days} <em>day${days===1?"":"s"} · ${fmtMi(mi).replace("M"," mi")}</em></span></div>
    <div class="wg-row wg-dow">${DOW.map(d=>`<span>${d[0]}</span>`).join("")}<span class="wkh">week</span></div>
    ${rows.map(wk=>`<div class="wg-row">${wk.map(cell).join("")}${weekMi(wk)}</div>`).join("")}
  </div>`};
}
function cardioCard(){
  const g = cardioGrid();
  const wkMi = cardio.filter(c=>daysAgo(c)<7).reduce((a,c)=>a+(+c.mi||0),0);
  const last = [...cardio].sort((a,b)=>String(b.d||"").localeCompare(String(a.d||"")))[0];
  return `<div class="card wk" id="cardioCard">
    <div class="wk-head">
      <div class="icon" style="background:#1f1733">🏃</div>
      <div class="wk-t"><b>Cardio</b><span style="color:#b58cff">Jogs, runs, walks, rides · ${fmtMi(wkMi).replace("M"," mi")} this week</span></div>
      <div style="text-align:right"><div style="font-size:13px;font-weight:800;color:var(--ink2)">${last?agoLabel(daysAgo(last)):"never"}</div>
        <div style="font-size:9px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink3);font-weight:800;margin-top:2px">Last run</div></div>
    </div>
    ${g.html}
    <div class="wk-row">
      <button class="b b-ghost" onclick="openCardioScreen()">History</button>
      <button class="b b-blue" onclick="openCardioAdd()">+ Log a run</button>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------------------
   One Workouts page (no Strength / Cardio tabs)
   --------------------------------------------------------------------------- */
let cardioScreen = false, reorderWk = false;
window.inCardioScreen = () => cardioScreen;
const _renderWorkouts = renderWorkouts;
renderWorkouts = function(){
  if(cardioScreen) return renderCardioScreen();
  wkTab = "strength";
  _renderWorkouts();
  const tabs = $id("wkTabs"); if(tabs) tabs.parentElement.style.display = "none";
  $id("wkSub").textContent = "Strength and cardio · tap any day to see it";
  const body = $id("wkBody"); if(!body) return;
  // month calendar first
  body.insertAdjacentHTML("afterbegin", monthCalendar());
  // cardio card right after the workout cards, before "+ Add a workout"
  const addBtn = [...body.querySelectorAll("button")].find(b=>/Add a workout/.test(b.textContent));
  const cardioHTML = cardioCard();
  if(addBtn) addBtn.insertAdjacentHTML("beforebegin", cardioHTML); else body.insertAdjacentHTML("beforeend", cardioHTML);
  // order controls
  const cards = [...body.querySelectorAll(".card.wk")].filter(c=>c.id!=="cardioCard");
  cards.forEach((c,i)=>{
    const w = WK[i]; if(!w) return;
    if(reorderWk){
      const ctl = document.createElement("div"); ctl.className = "ordctl";
      ctl.innerHTML = `<span class="ordn">#${i+1}</span>
        <span class="ordb${i===0?" off":""}" onclick="moveWorkout(${i},-1)">▲</span>
        <span class="ordb${i===WK.length-1?" off":""}" onclick="moveWorkout(${i},1)">▼</span>`;
      c.insertBefore(ctl, c.firstChild);
    }
  });
  const btn = document.createElement("button");
  btn.className = "b " + (reorderWk ? "b-blue" : "b-ghost"); btn.style.cssText = "width:100%;height:46px;margin-bottom:10px";
  btn.textContent = reorderWk ? "Done ordering" : "↕ Change the order of workouts";
  btn.onclick = () => { reorderWk = !reorderWk; renderWorkouts(); };
  if(addBtn) addBtn.insertAdjacentElement("beforebegin", btn); else body.appendChild(btn);
};
window.moveWorkout = function(i, d){
  const j = i + d; if(j<0 || j>=WK.length) return;
  const x = WK[i]; WK[i] = WK[j]; WK[j] = x;
  save(); renderWorkouts();
  toast(`${x.name} is now #${j+1}`);
};

/* Cardio history as its own screen inside Workouts, with the back arrow. */
window.openCardioScreen = function(){ cardioScreen = true; try{ wkListScroll = window.scrollY||0; }catch(e){} renderCardioScreen(); window.scrollTo(0,0); };
function renderCardioScreen(){
  $id("wkTitle").textContent = "Cardio";
  $id("wkBack").style.display = "flex";
  const tabs = $id("wkTabs"); if(tabs) tabs.parentElement.style.display = "none";
  _renderCardio();
  $id("wkBody").insertAdjacentHTML("afterbegin", `<div class="card">${cardioGrid().html}</div>`);
}
const _renderCardio = renderCardio;
renderCardio = function(){ if(cardioScreen) renderCardioScreen(); else renderWorkouts(); };

const _leaveWorkout = leaveWorkout;
leaveWorkout = async function(){
  if(cardioScreen){ cardioScreen = false; renderWorkouts();
    requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo(0, wkListScroll||0))); return true; }
  return _leaveWorkout();
};

/* ---------------------------------------------------------------------------
   Reorder moves inside a workout, even in the middle of it
   --------------------------------------------------------------------------- */
let reorderEx = false;
const _renderSession55 = renderSession;
renderSession = function(){
  _renderSession55();
  try{
    const w = wkById(wkSession.id); if(!w) return;
    const exEls = [...document.querySelectorAll("#wkBody .ex")];
    const listCard = exEls.length ? exEls[0].closest(".card") : null;
    if(!listCard) return;
    const head = listCard.querySelector(".card-head .link");
    if(head){ head.textContent = reorderEx ? "done" : "↕ reorder"; head.style.cursor="pointer";
      head.onclick = () => { reorderEx = !reorderEx; renderSession(); }; }
    if(reorderEx){
      exEls.forEach((el,i)=>{
        if(i >= w.ex.length) return;                    // one-off moves added today stay where they are
        const ctl = document.createElement("div"); ctl.className = "ordctl ex";
        ctl.innerHTML = `<span class="ordn">${i+1}</span>
          <span class="ordb${i===0?" off":""}" onclick="moveMove(${i},-1)">▲</span>
          <span class="ordb${i===w.ex.length-1?" off":""}" onclick="moveMove(${i},1)">▼</span>`;
        el.insertBefore(ctl, el.firstChild);
      });
    }
  }catch(e){ console.warn(e); }
};
window.moveMove = function(i, d){
  const w = wkById(wkSession.id); if(!w) return;
  const j = i + d; if(j<0 || j>=w.ex.length) return;
  const x = w.ex[i]; w.ex[i] = w.ex[j]; w.ex[j] = x;       // sets are stored by name, so nothing you logged moves or is lost
  save(); renderSession();
};

/* ---------------------------------------------------------------------------
   Phone back button: step back inside the page first
   --------------------------------------------------------------------------- */
window.innerBack = function(){
  const v = (document.querySelector(".view.active")||{}).id || "";
  if(v === "view-workouts"){
    const b = $id("wkBack");
    if(b && b.style.display !== "none"){
      if(cardioScreen){ leaveWorkout(); return true; }
      // In a live workout, step out and keep it parked — nothing is lost, and no pop-up.
      if(wkSession){ save(); renderWorkouts(); toast("Workout kept open — tap it to carry on"); return true; }
      leaveWorkout(); return true;
    }
  }
  if(v === "view-projects"){
    const b = $id("prBack");
    if(b && b.style.display !== "none"){ renderProjects(); return true; }
  }
  return false;
};

/* A workout started from the list should leave cardio mode. */
const _openWorkout = openWorkout;
openWorkout = function(id, historyOnly){ cardioScreen = false; return _openWorkout(id, historyOnly); };

/* the unfinished workout card at the top still sits above the calendar */
if(document.readyState !== "loading"){ try{ if((document.querySelector(".view.active")||{}).id==="view-workouts") renderWorkouts(); }catch(e){} }
})();

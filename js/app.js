const $ = id => document.getElementById(id);
function toast(msg){ const el=$("toast"); el.innerHTML=esc(msg); el.classList.add("on");
  clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove("on"),2100); }

/* Browser confirm()/prompt() are blocked inside preview panels and some
   installed-app contexts, which silently kills any action behind them.
   These do the same job in-app so buttons always work. */
let _askResolve=null;
function ask(msg, okLabel, danger){
  return new Promise(res=>{
    _askResolve=res;
    $("cfText").innerHTML=esc(msg).replace(/\n/g,"<br>");
    const ok=$("cfOk"); ok.textContent=okLabel||"Yes, do it";
    ok.className="b "+(danger?"b-danger":"b-primary");
    openSheet("confirmSheet");
  });
}
function askDone(v){
  const r=_askResolve; _askResolve=null;
  closeAll();
  if(r) r(v);
}
function askText(msg, placeholder, prefill){
  return new Promise(res=>{
    _askResolve=res;
    $("ptText").textContent=msg;
    $("ptInput").value=prefill==null?"":String(prefill);
    $("ptInput").placeholder=placeholder||"";
    openSheet("promptSheet");
    setTimeout(()=>$("ptInput").focus(),320);
  });
}
function askTextDone(ok){
  const r=_askResolve; _askResolve=null;
  const v=$("ptInput").value.trim();
  closeAll();
  if(r) r(ok?v:null);
}

/* Look-ups that can't crash. A record that's already gone just says so. */
function getTask(id){
  const t=tasks.find(x=>x.id===id);
  if(!t) toast("That one's already gone");
  return t||null;
}

/* Anything that can lose data offers a way back for 8 seconds. */
let undoFn=null;
function toastUndo(msg, fn){
  undoFn=fn;
  const el=$("toast");
  el.innerHTML=`<span>${esc(msg)}</span><span class="undo" onclick="doUndo()">UNDO</span>`;
  el.classList.add("on");
  clearTimeout(el._t);
  el._t=setTimeout(()=>{ el.classList.remove("on"); undoFn=null; },8000);
}
function doUndo(){
  if(!undoFn) return;
  const f=undoFn; undoFn=null;
  $("toast").classList.remove("on");
  f(); save();
  toast("Put back");
}
function esc(s){ return (s||"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }

/* ================= WHEN SOMETHING BREAKS =================
   Until now, if the app threw on your phone at seven in the morning, nobody ever
   found out — which is how a button that deleted tasks survived to v46. Crashes
   are written down here, they ride along with sync so they reach your other
   device, and Settings shows them with a Copy button. No personal data goes in:
   the message, where it happened, and which build. */
let errLog = [];
function logError(kind, msg, stack){
  try{
    const build = (typeof BUILD!=="undefined") ? BUILD : "?";
    const dev   = (typeof sync!=="undefined" && sync.device) ? sync.device : "";
    const view  = (document.querySelector(".view.active")||{}).id || "";
    const e = {
      id: newId(), t: Date.now(), kind,
      msg: String(msg||"unknown").slice(0,300),
      at: String(stack||"").split("\n").slice(0,4).map(s=>s.trim()).join(" | ").slice(0,500),
      build, view, device: dev, n: 1,
    };
    /* the same crash on every repaint would otherwise fill the whole log */
    const dup = errLog.find(x=>x.msg===e.msg && x.at===e.at);
    if(dup){ dup.n=(dup.n||1)+1; dup.t=e.t; } else errLog.push(e);
    if(errLog.length>30) errLog=errLog.slice(-30);
    try{ save(); }catch(_){}
    try{ renderSettings(); }catch(_){}
  }catch(_){ /* never let the error handler become the error */ }
}
window.addEventListener("error", ev=>{
  logError("crash", ev && ev.message, (ev && ev.error && ev.error.stack) || (ev && ev.filename+":"+ev.lineno));
});
window.addEventListener("unhandledrejection", ev=>{
  const r = ev && ev.reason;
  logError("promise", (r && r.message) || r, r && r.stack);
});

/* ---- ids that two devices can't both hand out ------------------------------
   Everything used to be numbered from a shared counter (nextId, noteId, cid).
   Both devices start that counter at the same number, so a task added on the
   phone and a task added on the computer between syncs were both given, say,
   500 — and the merge, which matches on id, kept one and destroyed the other.
   Time plus a random tail makes a collision vanishingly unlikely without
   changing anything about the ids you already have. */
let _idLast = 0;
function newId(){
  const t = Date.now() - 1735689600000;              // ms since 2025-01-01
  let id = t * 4096 + Math.floor(Math.random() * 4096);
  if(id <= _idLast) id = _idLast + 1;                // never repeat within a session
  _idLast = id;
  return id;
}

/* ================= NAV ================= */
const IC={
  overview:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  today:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  planner:'<circle cx="12" cy="5" r="2.4"/><circle cx="5" cy="18" r="2.4"/><circle cx="19" cy="18" r="2.4"/><path d="M12 7.4v4.2M12 11.6L6.6 16.3M12 11.6l5.4 4.7"/>',
  categories:'<rect x="3" y="3" width="7" height="7" rx="1.6"/><rect x="14" y="3" width="7" height="7" rx="1.6"/><rect x="3" y="14" width="7" height="7" rx="1.6"/><rect x="14" y="14" width="7" height="7" rx="1.6"/>',
  tasks:'<path d="M4 7l2 2 4-4"/><path d="M4 17l2 2 4-4"/><path d="M13 7h7M13 17h7"/>',
  routines:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  tracker:'<path d="M12 3s5.5 5.3 5.5 9.2A5.5 5.5 0 0 1 12 18a5.5 5.5 0 0 1-5.5-5.8C6.5 8.3 12 3 12 3z"/><path d="M9.6 12.6a2.6 2.6 0 0 0 2.6 2.6"/>',
  projects:'<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  workouts:'<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11"/>',
  notes:'<path d="M5 3h9l5 5v13H5z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
  progress:'<path d="M3 20h18M6 20V10M11 20V4M16 20v-7M21 20v-3"/>',
  whynot:'<circle cx="12" cy="12" r="9"/><path d="M9.6 9.2a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.7-.9 1.3v.5"/><path d="M12 16.6h.01"/>',
  meals:'<path d="M5 3v9a3 3 0 0 0 6 0V3M8 12v9M16 3c-1.4 1.4-2 3.4-2 5.5s.6 4.1 2 5.5V3zM16 14v7"/>',
  health:'<path d="M20.4 5.6a5 5 0 0 0-7.1 0L12 6.9l-1.3-1.3a5 5 0 1 0-7.1 7.1L12 21l8.4-8.3a5 5 0 0 0 0-7.1z"/>',
  settings:'<circle cx="12" cy="12" r="3.2"/><path d="M19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.4-2.3 1a7.6 7.6 0 0 0-2.6-1.5L14 2h-4l-.5 2.6a7.6 7.6 0 0 0-2.6 1.5l-2.3-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.4 2.3-1a7.6 7.6 0 0 0 2.6 1.5L10 22h4l.5-2.6a7.6 7.6 0 0 0 2.6-1.5l2.3 1 2-3.4z"/>',
  v2:'<path d="M12 3v18M3 12h18"/>',
  improve:'<path d="M12 3l1.9 5.2L19 10l-5.1 1.8L12 17l-1.9-5.2L5 10l5.1-1.8z"/><path d="M19 15l.7 1.9L21.5 18l-1.8.6L19 21l-.7-1.9L16.5 18l1.8-.6z"/>'
};
const NAV=[
  {k:"overview",  label:"Overview", live:1},
  {k:"today",     label:"Today",         live:1},
  {k:"calendar",  label:"Calendar",  live:1},
  {k:"planner",   label:"Problem Solver", live:1},
  {sec:"Your stuff"},
  {k:"categories",label:"Categories", live:1},
  {k:"tasks",     label:"Tasks", live:1},
  {k:"routines",  label:"Routines", live:1},
  {k:"tracker",   label:"Tracker",        live:1},
  {k:"projects",  label:"Projects",  live:1},
  {k:"workouts",  label:"Workouts",       live:1},
  {k:"meals",     label:"Meals",          live:1},
  {k:"health",    label:"Health",         live:1},
  {sec:"Looking back"},
  {k:"whynot",    label:"Why Not",        live:1},
  {k:"notes",     label:"Notes", live:1},
  {k:"progress",  label:"Progress", live:1},
  {sec:"Setup"},
  {k:"settings",  label:"Settings",       live:1},
  {sec:"Feedback"},
  {k:"v2",        label:"V2 Ideas",       live:1},
  {k:"improve",   label:"Improve This App", live:1}
];
function buildNav(){
  $("navList").innerHTML = NAV.map(n=>{
    if(n.sec) return `<div class="navsec">${n.sec}</div>`;
    const ideas = n.k==="improve" ? Object.values(improve).reduce((a,t)=>a+(t.ideas||0),0) : 0;
    return `<div class="navitem${n.live?"":" soon"}" ${n.live?`data-view="${n.k}" onclick="go('${n.k}')"`:``}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${IC[n.k]||""}</svg>
      ${n.label}${ideas?`<span class="tag" style="background:rgba(167,139,250,.2);color:#c4b0ff;border-color:rgba(167,139,250,.45)">${ideas}</span>`:``}${n.live?``:`<span class="tag">SOON</span>`}</div>`;
  }).join("");
}
/* every page gets the same footer, generated from the menu — no page can be missed */
function mountImproveButtons(){
  Object.keys(PAGES).forEach(k=>{
    if(k==="improve"||k==="planner") return;                 // planner has its own compact chip
    const view=$("view-"+k); if(!view) return;
    let host=$("impfoot-"+k);
    if(!host){ host=document.createElement("div"); host.className="wrap"; host.id="impfoot-"+k;
      host.style.paddingBottom="46px"; view.appendChild(host); }
    if(host.querySelector(".improve")) return;
    const d=document.createElement("div");
    d.className="improve"; d.dataset.page=k;
    d.innerHTML=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3l1.9 5.2L19 10l-5.1 1.8L12 17l-1.9-5.2L5 10l5.1-1.8z"/><path d="M19 15l.7 1.9L21.5 18l-1.8.6L19 21l-.7-1.9L16.5 18l1.8-.6z"/></svg>
      <div><b>Improve ${PAGES[k].n}</b><span>Something off here? Tell me and I'll tell you what it'd break.</span></div>
      <div class="cnt2" style="display:none"></div>`;
    d.onclick=()=>openImprove(k);
    host.appendChild(d);
  });
  refreshImproveCounts();
}

/* ---- the back button ----------------------------------------------------
   Android's back used to walk straight out of the app, one screen at a time.
   Now it closes whatever's open, then goes to Today, and only leaves after you
   press it twice — with a warning in between.

   It works by keeping one spare entry in the browser's history: every time back
   eats it, we quietly put another one back.                                   */
let _backArmed=false, _backTimer=null;
function pushBackTrap(){ try{ window.history.pushState({momentum:1},""); }catch(e){} }
function sheetIsOpen(){
  return !!document.querySelector(".sheet.on, .scrim.on")
      || (document.getElementById("lockScreen")||{}).style?.display==="flex";
}
window.addEventListener("popstate", ()=>{
  /* the lock screen is not something back should get you past */
  if(lock.pin && $("lockScreen") && $("lockScreen").style.display==="flex"){ pushBackTrap(); return; }
  if(sheetIsOpen()){ closeAll(); pushBackTrap(); return; }
  const cur=(document.querySelector(".view.active")||{}).id||"";
  if(cur && cur!=="view-today"){ go(typeof navBack==="function" ? navBack() : "today"); pushBackTrap(); return; }
  if(_backArmed) return;               // second press: let the browser have it
  _backArmed=true;
  pushBackTrap();
  toast("Press back again to leave Momentum");
  clearTimeout(_backTimer);
  _backTimer=setTimeout(()=>{ _backArmed=false; }, 2500);
});
pushBackTrap();

/* ---- private mode -------------------------------------------------------
   One switch instead of four settings in three places. Off means: nothing this
   app does causes a byte to leave the device.                                */
function privateModeOn(){
  return !!hlPrefs.aiOff && !AI.key && !sync.on && !notif.on;
}
async function togglePrivateMode(){
  if(privateModeOn()){
    if(!await ask("Turn private mode off?\n\nThis doesn't switch anything back on by itself — "
      + "you turn each piece back on as you want it.","Turn it off")) return;
    hlPrefs.aiOff=false; save(); renderSettings();
    toast("Private mode off. Nothing was re-enabled — switch things on as you need them.");
    return;
  }
  if(!await ask("Turn everything off?\n\n• Health AI — no more weekly readings or health questions\n"
    + "• Planner AI — falls back to the built-in questions\n"
    + "• Sync — your phone and computer stop sharing\n"
    + "• Notifications and the watch inbox — stop\n\n"
    + "Your data stays exactly where it is. Nothing is deleted.","Turn it all off","danger")) return;
  hlPrefs.aiOff=true;
  AI.key=""; AI.on=false; AI.ok=null;
  try{ window.localStorage.removeItem("momentum.aikey"); }catch(e){}
  sync.on=false; saveSync&&saveSync();
  notif.on=false;
  save(); renderSettings();
  toast("Private mode on — nothing leaves this device");
}

/* Turning sync off leaves whatever was already uploaded sitting there. This
   actually clears it. */
/* Read the record back. Anything that changed how much data you have is in here
   with a time and a before/after, so a disappearance can be traced instead of guessed. */
function showDataLog(){
  const rows=[...dataLog].reverse();
  $("nodeBody").innerHTML=`<h2>What changed my data</h2>
    <p style="font-size:12.5px;color:var(--ink3);margin:6px 0 0">Every merge, erase and log, newest first.
      A number in red means something went down.</p>
    ${rows.length?rows.map(r=>`<div class="lg">
      <div class="lm" style="flex:1;min-width:0">
        <b>${esc(r.what)}</b>
        <span>${new Date(r.t).toLocaleString()} · ${r.counts?`${r.counts.tasks} tasks · ${r.counts.plans} plans · ${r.counts.cardio} cardio · ${r.counts.workouts} workouts`:""}</span>
        ${r.diff?`<span style="color:${Object.values(r.diff).some(v=>String(v).startsWith("-"))?"#ff8aa0":"#4fd6a5"}">
          ${Object.entries(r.diff).map(([k,v])=>`${k} ${v}`).join(" · ")}</span>`:``}
      </div></div>`).join("")
    :`<div class="wk-note" style="padding:14px 0">Nothing recorded yet. From now on every merge and erase lands here.</div>`}
    <div class="btns"><button class="b b-ghost" style="width:100%" onclick="closeAll()">Close</button></div>`;
  closeAll(); openSheet("node");
}

async function eraseOnlineCopy(){
  if(!sync.room){ toast("There's nothing online — sync was never set up"); return; }
  if(!await ask("Erase the copy of your data stored on your Netlify site?\n\n"
    + "Everything on this device is kept. Any other device still using this code "
    + "will find nothing there.","Erase it","danger")) return;
  const base=(sync.url||"/.netlify/functions/sync").replace(/\/$/,"");
  let ok=false;
  try{
    const r=await fetch(base+"?room="+encodeURIComponent(sync.room),
      {method:"POST", headers:{"content-type":"application/json"},
       body:JSON.stringify({blob:null, wipe:true, at:Date.now()})});
    ok=r.ok;
  }catch(e){ ok=false; }
  /* The inbox is a second store and has to be drained separately, or a pending
     message would come straight back after the wipe. */
  try{ await fetch(inboxURLFull()+"?room="+encodeURIComponent(sync.room)+"&drain=1",{cache:"no-store"}); }catch(e){}
  toast(ok ? "Erased. Nothing of yours is stored online now."
           : "Couldn't reach your site — nothing was erased. Try again when you have signal.");
}

/* ---- PIN lock -----------------------------------------------------------
   Honest about what this is: it stops a person who picks up your unlocked phone
   from reading your app. It is NOT encryption — someone technical with your
   unlocked phone could still get at the stored data. Only the hash is kept, so
   the PIN itself is never written down anywhere.                              */
let lock = { pin:"", tries:0 };
/* Three times now something has gone missing and I've had to guess afterwards.
   This writes down every event that changes how much data you have, so next time
   there's a record instead of a theory. */
let dataLog = [];
const dataSizes = () => ({
  tasks:(typeof tasks!=="undefined"?tasks:[]).length,
  plans:(typeof WEBS!=="undefined"?WEBS:[]).length,
  cardio:(typeof cardio!=="undefined"?cardio:[]).length,
  workouts:Object.values(typeof wkHist!=="undefined"?wkHist:{}).reduce((a,h)=>a+(h||[]).length,0),
  notes:(typeof notes!=="undefined"?notes:[]).length
});
function logChange(what, before){
  try{
    const after=dataSizes();
    const diff={};
    Object.keys(after).forEach(k=>{ const d=after[k]-((before&&before[k])??after[k]); if(d) diff[k]=d>0?"+"+d:String(d); });
    dataLog.push({ t:Date.now(), what, counts:after, ...(Object.keys(diff).length?{diff}:{}) });
    if(dataLog.length>80) dataLog=dataLog.slice(-80);
  }catch(e){}
}            // pin here is a hash, never the digits
let _pinEntry="", _pinNew=null;

async function pinHash(digits){
  const data=new TextEncoder().encode("momentum-pin:"+digits);
  const buf=await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,"0")).join("");
}
function paintPin(){
  const n=_pinEntry.length;
  $("pinDots").innerHTML=Array.from({length:Math.max(4,n)},(_,i)=>`<i class="${i<n?"on":""}"></i>`).join("");
}
function buildPinPad(){
  $("pinPad").innerHTML=[1,2,3,4,5,6,7,8,9,"",0,"⌫"].map(k=>
    k==="" ? `<button class="blank"></button>`
           : `<button onclick="pinTap('${k}')">${k}</button>`).join("");
  paintPin();
}
async function pinTap(k){
  if(k==="⌫"){ _pinEntry=_pinEntry.slice(0,-1); paintPin(); return; }
  if(_pinEntry.length>=6) return;
  _pinEntry+=k; paintPin();
  if(_pinEntry.length>=4) setTimeout(pinTry,120);
}
async function pinTry(){
  if(_pinNew!==null) return pinSetStep();
  const h=await pinHash(_pinEntry);
  if(h===lock.pin){ _pinEntry=""; lock.tries=0; $("lockScreen").style.display="none"; return; }
  if(_pinEntry.length<6) return;             // 4, 5 and 6 digit PINs all allowed
  lock.tries++;
  _pinEntry=""; paintPin();
  const m=$("lockMsg"); m.className="bad";
  m.textContent = lock.tries>=5 ? "Still wrong. Take a breath." : "That's not it — try again";
}
function showLock(){
  if(!lock.pin) return;
  buildPinPad();
  $("lockMsg").className=""; $("lockMsg").textContent="Enter your PIN";
  _pinEntry=""; _pinNew=null; paintPin();
  $("lockScreen").style.display="flex";
}
/* Setting or changing it: type twice, and they have to match. */
async function pinSetStep(){
  if(_pinNew===""){ _pinNew=_pinEntry; _pinEntry="";
    $("lockMsg").className=""; $("lockMsg").textContent="Type it once more"; paintPin(); return; }
  if(_pinEntry!==_pinNew){
    _pinNew=""; _pinEntry="";
    $("lockMsg").className="bad"; $("lockMsg").textContent="They didn't match — start again"; paintPin(); return;
  }
  lock.pin=await pinHash(_pinNew);
  _pinNew=null; _pinEntry="";
  save(); $("lockScreen").style.display="none"; renderSettings();
  toast("PIN set — you'll need it next time you open Momentum");
}
function startPinSetup(){
  buildPinPad();
  _pinNew=""; _pinEntry="";
  $("lockMsg").className=""; $("lockMsg").textContent="Choose a PIN — 4 to 6 digits";
  paintPin();
  $("lockScreen").style.display="flex";
}
async function removePin(){
  if(!await ask("Take the PIN off? Momentum will open straight away for anyone holding this device.","Remove it","danger")) return;
  lock.pin=""; lock.tries=0; save(); renderSettings(); toast("PIN removed");
}
/* Lock again when the app goes to the background, so it isn't left standing open. */
document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState==="hidden" && lock.pin) setTimeout(showLock,0);
});

function openDrawer(){ $("drawer").classList.add("on"); $("scrim").classList.add("on"); }
/* ---- search across everything ---------------------------------------------
   Tasks had a search box; routines, projects and notes had none, so the only
   way to find one was to remember which page it lived on and scroll. */
function navSearch(q){
  const box=$("navResults"); if(!box) return;
  const s=(q||"").trim().toLowerCase();
  if(s.length<2){ box.innerHTML=""; return; }
  const hit=(txt)=>(txt||"").toLowerCase().includes(s);
  const out=[];
  tasks.filter(t=>!t.routine).filter(t=>hit(t.name)||hit(t.notes)).slice(0,8)
    .forEach(t=>out.push({k:"Task", x:t.name, go:`closeAll();openDetail(${t.id})`}));
  tasks.filter(t=>t.routine).filter(t=>hit(t.name)||hit(t.notes)).slice(0,5)
    .forEach(t=>out.push({k:"Routine", x:t.name, go:`closeAll();openDetail(${t.id})`}));
  PROJECTS.filter(p=>hit(p.name)||hit(p.goal)||hit(p.notes)).slice(0,5)
    .forEach(p=>out.push({k:"Project", x:p.name, go:`closeAll();openProject('${p.id}')`}));
  notes.filter(n=>hit(n.text)).slice(0,5)
    .forEach(n=>out.push({k:"Note", x:(n.text||"").slice(0,60), go:`closeAll();go('notes')`}));
  if(!out.length){
    box.innerHTML=`<div class="nrempty">Nothing matches “${esc(q)}”.</div>`;
    return;
  }
  box.innerHTML=out.slice(0,18).map(r=>
    `<div class="nr" tabindex="0" role="button" onclick="${r.go}"><div class="nrx">${esc(r.x)}</div><div class="nrk">${r.k}</div></div>`
  ).join("");
}
/* Where you were on each page. Jumping back to the top every time you came back
   from a detail screen meant re-scrolling past everything to find your place. */
const scrollMem={};
function rememberScroll(){
  const cur=(document.querySelector(".view.active")||{}).id;
  if(cur) scrollMem[cur]=window.scrollY||document.documentElement.scrollTop||0;
}
function restoreScroll(view){
  const y=scrollMem["view-"+view]||0;
  /* after the page has been drawn, or the browser clamps it to the old height */
  requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo(0,y)));
}
function go(view){
  rememberScroll();
  try{ sessionStorage.setItem("momentum.view", view); }catch(e){}
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
  $("view-"+view).classList.add("active");
  document.querySelectorAll(".navitem[data-view]").forEach(n=>n.classList.toggle("on", n.dataset.view===view));
  closeAll();
  /* Today and Projects were the only main screens with no repaint here, so
     coming back to them could show a list that was out of date. */
  if(view==="today"){ render(); renderUpcoming(); renderCarry(); renderDayNote(); }
  if(view==="projects") renderProjects();
  if(view==="workouts") renderWorkouts();
  if(view==="health") renderHealth();
  if(view==="improve") renderImprove();
  if(view==="categories") renderCategories();
  if(view==="whynot") renderWhyNot();
  if(view==="calendar") renderCal();
  if(view==="overview") renderOverview();
  if(view==="tasks"){ renderTasks(); paintSelBar(); }
  else { const _b=$("tkBar"); if(_b) _b.classList.remove("on"); }   // the select bar belongs to Tasks only
  if(view==="routines") renderRoutines();
  if(view==="notes") renderNotes();
  if(view==="progress") renderProgress();
  if(view==="v2") renderV2();
  if(view==="settings") renderSettings();
  mountImproveButtons();
  if(view==="meals") renderMeals();
  if(view==="planner"){ setTimeout(fitView,60); renderStartPicks(); resumeLastWeb(); autoSaveWeb(); renderRail(); }
  if(view==="tracker") renderTracker();
  restoreScroll(view);
}
function closeAll(){
  $("scrim").classList.remove("on");
  $("drawer").classList.remove("on");
  document.querySelectorAll(".sheet").forEach(s=>s.classList.remove("on"));
}
function openSheet(id){
  $("scrim").classList.add("on");
  const s=$(id); s.classList.add("on");
  // the last row of buttons sticks to the bottom of the sheet — on a phone a long
  // sheet used to leave Approve/Save half off the edge
  const pad=s.querySelector(".sheet-pad"); if(!pad) return;
  pad.querySelectorAll(".btns.stuck").forEach(b=>b.classList.remove("stuck"));
  pad.classList.remove("has-stuck");
  const rows=[...pad.children].filter(e=>e.classList&&e.classList.contains("btns"));
  /* Pinning the LAST row to the bottom is right for a sheet whose last row is
     its Save/Approve bar. On the task detail sheet, which has four rows of
     actions, it floated "+ Note / Solve this" on top of Edit and Delete — so a
     tap on Edit opened Add-a-note instead. Only pin when the sheet really is a
     form with one action bar at the end. */
  if(rows.length && rows.length<=2){
    rows[rows.length-1].classList.add("stuck");
    pad.classList.add("has-stuck");
  }
  s.scrollTop=0;
}
function openSettings(){ go("settings"); }
function paintAIBadge(){
  const b=$("modeBadge"); if(!b) return;
  const state = !AI.on ? "off" : AI.ok===false ? "broken" : AI.ok===true ? "live" : "untested";
  b.textContent = {off:"BUILT-IN BRAIN", broken:"KEY NOT WORKING", live:"LIVE AI", untested:"KEY NOT TESTED"}[state];
  b.style.background = {off:"rgba(255,122,26,.14)", broken:"rgba(255,77,77,.16)",
                        live:"rgba(18,201,138,.16)", untested:"rgba(255,122,26,.14)"}[state];
  b.style.color      = AI.on ? "#4fd6a5" : "#ff9d4d";
  b.style.border     = "1px solid " + (AI.on ? "rgba(18,201,138,.4)" : "rgba(255,122,26,.32)");
}

/* ================= TODAY ================= */
const CATS = {
  shynex:   {label:"Business · Shynex App",  icon:"📞", bg:"#0f1d33", fg:"#5b9dff"},
  marketing:{label:"Business · Marketing",   icon:"📣", bg:"#0f1d33", fg:"#5b9dff"},
  automate: {label:"Business · Automation",  icon:"🤖", bg:"#101b2e", fg:"#7fb0ff"},
  growth:   {label:"Business · Growth",      icon:"📈", bg:"#101b2e", fg:"#7fb0ff"},
  ops:      {label:"Business · Ops",         icon:"🗂", bg:"#101b2e", fg:"#7fb0ff"},
  hiring:   {label:"Business · Hiring",      icon:"👤", bg:"#0f1d33", fg:"#5b9dff"},
  credit:   {label:"Important Personal · Credit", icon:"🛡️", bg:"#1c1533", fg:"#a78bfa"},
  legal:    {label:"Important Personal · Legal",  icon:"⚖️", bg:"#1c1533", fg:"#a78bfa"},
  admin:    {label:"Personal · Admin",       icon:"📋", bg:"#1a1a2e", fg:"#9db2d6"},
  app:      {label:"Personal · App",         icon:"📱", bg:"#1a1a2e", fg:"#9db2d6"},
  house:    {label:"Personal · House",       icon:"🔧", bg:"#1a1a2e", fg:"#9db2d6"},
  print3d:  {label:"3D Print · Ideas",       icon:"🖨️", bg:"#2a1a0b", fg:"#ff9d4d"},
  clean:    {label:"Home · Clean Routine",   icon:"🧹", bg:"#0d2620", fg:"#2fd39a"},
  grooming: {label:"Home · Grooming",        icon:"✂️", bg:"#0d2620", fg:"#2fd39a"},
  cardio:   {label:"Health · Cardio",        icon:"🏃", bg:"#2a1119", fg:"#ff5f7e"},
  workout:  {label:"Health · Workout",       icon:"🏋️", bg:"#2a1119", fg:"#ff5f7e"},
  water:    {label:"Health · Water",         icon:"💧", bg:"#0b2130", fg:"#4fc3f7"},
  meds:     {label:"Health · Meds",          icon:"💊", bg:"#1c1533", fg:"#c4a8ff"},
  fuel:     {label:"Health · Fuel",          icon:"🍳", bg:"#2a1a0b", fg:"#ff9d4d"}
};
let tasks = [
/* ---------- ROUTINES & TRACKERS ---------- */
  {id:1,name:"Morning jog — 2 miles",cat:"cardio",time:"06:30",est:25,done:false,routine:true,freq:"Mon/Wed",streak:0,target:1,unit:"time",count:0,log:[],makeup:false,notes:"First thing in the morning. Jog or bike."},
  {id:2,name:"Morning jog — 1 mile",cat:"cardio",time:"07:00",est:15,done:false,routine:true,freq:"Weekends",streak:0,target:1,unit:"time",count:0,log:[],makeup:false,notes:"Easy weekend mile."},
  {id:3,name:"Medication",cat:"meds",time:"08:00",est:0,done:false,routine:true,freq:"Weekdays",streak:0,target:2,unit:"dose",count:0,log:[],makeup:false,notes:"Lowered to twice a day, weekdays only."},
  {id:4,name:"Water",cat:"water",time:"08:00",est:0,done:false,routine:true,freq:"Every day",streak:0,target:8,unit:"glass",count:0,log:[],makeup:false,notes:"Water intake."},
  {id:5,name:"Protein",cat:"fuel",time:"12:00",est:0,done:false,routine:true,freq:"Every day",streak:0,target:3,unit:"serving",count:0,log:[],makeup:false,notes:"Three servings. Shake counts."},
  {id:6,name:"Vitamins",cat:"fuel",time:"08:00",est:0,done:false,routine:true,freq:"Every day",streak:0,target:1,unit:"time",count:0,log:[],makeup:false,notes:""},
  {id:7,name:"Supplements",cat:"fuel",time:"08:00",est:0,done:false,routine:true,freq:"Every day",streak:0,target:1,unit:"time",count:0,log:[],makeup:false,notes:""},
  {id:10,name:"Clean shower",cat:"clean",time:"17:00",est:20,done:false,routine:true,freq:"Saturdays",streak:0,target:1,unit:"time",count:0,log:[],makeup:true,notes:"Day is my guess — change it if Saturday is wrong."},
  {id:11,name:"Clean toilet",cat:"clean",time:"17:20",est:10,done:false,routine:true,freq:"Saturdays",streak:0,target:1,unit:"time",count:0,log:[],makeup:true,notes:"Day is my guess."},
  {id:12,name:"Clean sink",cat:"clean",time:"17:30",est:10,done:false,routine:true,freq:"Saturdays",streak:0,target:1,unit:"time",count:0,log:[],makeup:true,notes:"Day is my guess."},
  {id:13,name:"Wash bed sheets",cat:"clean",time:"10:00",est:30,done:false,routine:true,freq:"Sundays",streak:0,target:1,unit:"time",count:0,log:[],makeup:true,notes:"Day is my guess."},
  {id:14,name:"Vacuum under bed",cat:"clean",time:"10:30",est:15,done:false,routine:true,freq:"Sundays",streak:0,target:1,unit:"time",count:0,log:[],makeup:true,notes:"Day is my guess."},
  {id:15,name:"Wash cars",cat:"clean",time:"11:00",est:45,done:false,routine:true,freq:"Saturdays",streak:0,target:1,unit:"time",count:0,log:[],makeup:true,notes:"You flagged this list for automating or outsourcing — this is a good candidate."},
  {id:16,name:"Cut hair",cat:"grooming",time:"18:00",est:25,done:false,routine:true,freq:"Fridays",streak:0,target:1,unit:"time",count:0,log:[],makeup:true,notes:"You wrote 'Friday and ?' — pick the second day and change the frequency."},
  {id:17,name:"Shave and trim",cat:"grooming",time:"07:15",est:10,done:false,routine:true,freq:"Mon/Wed/Fri",streak:0,target:1,unit:"time",count:0,log:[],makeup:false,notes:"Days are my guess."},
  {id:20,name:"Post on LSA",cat:"marketing",time:"09:00",est:15,done:false,routine:true,freq:"Mondays",streak:0,target:1,unit:"time",count:0,log:[],makeup:true,notes:"Weekly."},
  {id:21,name:"Post in FB groups",cat:"marketing",time:"09:15",est:20,done:false,routine:true,freq:"Mon/Wed/Fri",streak:0,target:1,unit:"time",count:0,log:[],makeup:true,notes:"Every 2-3 days."},
  {id:22,name:"Flyer & sign distribution",cat:"marketing",time:"13:00",est:90,done:false,routine:true,freq:"Every day",streak:0,target:1,unit:"time",count:0,log:[],makeup:true,paused:true,notes:"You listed this under routine IDEAS, so it starts paused. Unpause on the Routines page when you're ready."},

/* ---------- BUSINESS ---------- */
  {id:100,proj:"pcall",name:"Add true people search to call flow",cat:"shynex",time:"09:00",est:180,done:false,routine:false,streak:0,sched:false,pri:"Should",makeup:true,log:[],notes:""},
  {id:101,proj:"pcall",name:"Add Google Maps to call flow",cat:"shynex",time:"09:00",est:150,done:false,routine:false,streak:0,sched:false,pri:"Should",makeup:true,log:[],notes:""},
  {id:110,proj:"psign",name:"Finish sign location app",cat:"shynex",time:"09:00",est:240,done:false,routine:false,streak:0,sched:false,pri:"Must",makeup:true,log:[],notes:""},
  {id:111,proj:"psign",name:"Finish sign trigger app",cat:"shynex",time:"09:00",est:180,done:false,routine:false,streak:0,sched:false,pri:"Must",makeup:true,log:[],notes:""},
  {id:112,proj:"psign",name:"AI to organize locations by day",cat:"automate",time:"09:00",est:180,done:false,routine:false,streak:0,sched:false,pri:"Should",blockedBy:110,makeup:true,log:[],notes:"One or two routes per city, scheduled, and no repeats within X time."},
  {id:113,proj:"psign",name:"Set up voicemail for signs number",cat:"ops",time:"09:00",est:45,done:false,routine:false,streak:0,sched:false,pri:"Should",makeup:true,log:[],notes:"Open question from your list: use the cleaning number or add AI?"},
  {id:114,proj:"psign",name:"AI to reply to sign & flyer hires",cat:"automate",time:"09:00",est:180,done:false,routine:false,streak:0,sched:false,pri:"Should",makeup:true,log:[],notes:""},
  {id:120,proj:"pflyer",name:"Make flyer offer",cat:"marketing",time:"09:00",est:60,done:false,routine:false,streak:0,sched:false,pri:"Must",makeup:true,log:[],notes:"Your example: 5th and 10th cleaning free if they switch from another company."},
  {id:121,proj:"pflyer",name:"Make flyers",cat:"marketing",time:"09:00",est:120,done:false,routine:false,streak:0,sched:false,pri:"Must",blockedBy:120,makeup:true,log:[],notes:"Needs the offer decided first."},
  {id:122,proj:"pflyer",name:"Plan daily flyer & sign distribution",cat:"marketing",time:"09:00",est:60,done:false,routine:false,streak:0,sched:false,pri:"Should",blockedBy:121,makeup:true,log:[],notes:"This turns into the routine that's currently paused."},
  {id:130,proj:"pauto",name:"Automate weekly LSA posting",cat:"automate",time:"09:00",est:120,done:false,routine:false,streak:0,sched:false,pri:"Should",blockedBy:141,makeup:true,log:[],notes:""},
  {id:131,proj:"pauto",name:"Automate FB group posting",cat:"automate",time:"09:00",est:120,done:false,routine:false,streak:0,sched:false,pri:"Should",makeup:true,log:[],notes:"Every 2-3 days."},
  {id:140,name:"Stash passwords & emails somewhere safe",cat:"ops",time:"09:00",est:60,done:false,routine:false,streak:0,sched:false,pri:"Must",makeup:true,log:[],notes:""},
  {id:141,name:"Turn on LSA",cat:"marketing",time:"09:00",est:45,done:false,routine:false,streak:0,sched:false,pri:"Must",makeup:true,log:[],notes:"Blocks the LSA automation."},
  {id:142,name:"Organize all files on computer",cat:"ops",time:"09:00",est:120,done:false,routine:false,streak:0,sched:false,pri:"Nice",makeup:true,log:[],notes:""},
  {id:143,name:"AI content with kling.ai",cat:"marketing",time:"09:00",est:120,done:false,routine:false,streak:0,sched:false,pri:"Should",makeup:true,log:[],notes:"Decide how the videos get made and what they are actually used for."},
  {id:144,name:"After-hours AI + pricing automation",cat:"automate",time:"09:00",est:240,done:false,routine:false,streak:0,sched:false,pri:"Should",makeup:true,log:[],notes:"Shynex house cleaning, before and after business hours, with pricing."},
  {id:145,name:"Give the lead cleaner access to the work app",cat:"ops",time:"09:00",est:45,done:false,routine:false,streak:0,sched:false,pri:"Must",makeup:true,log:[],notes:"Addresses, reminders and notifications."},
  {id:146,name:"Creative way to post in FB groups",cat:"marketing",time:"09:00",est:60,done:false,routine:false,streak:0,sched:false,pri:"Should",makeup:true,log:[],notes:"Something that actually gets engagement."},
  {id:147,name:"Increase customer value",cat:"growth",time:"09:00",est:90,done:false,routine:false,streak:0,sched:false,pri:"Should",makeup:true,log:[],notes:"Your list so far: AC cleaning, stove and fridge inside/under/behind, fridge vent, windows, baseboards, floor detail, window seals, smoke detector batteries, washer and dryer, dryer lint trap, deck cleaning, basic car detailing (outsource to 3rd-party pros where you are not the expert). Come up with more."},
  {id:148,name:"Plan to open more locations",cat:"growth",time:"09:00",est:120,done:false,routine:false,streak:0,sched:false,pri:"Should",makeup:true,log:[],notes:"Goal is ranking higher."},
  {id:149,name:"Decide whether to hire a VA",cat:"hiring",time:"09:00",est:60,done:false,routine:false,streak:0,sched:false,pri:"Should",makeup:true,log:[],notes:"What would it actually save in time, and what is the ROI?"},


/* ---------- PERSONAL ---------- */
  {id:310,proj:"papp",name:"Add API to command center app",cat:"app",time:"09:00",est:240,done:false,routine:false,streak:0,sched:false,pri:"Should",makeup:true,log:[],notes:"So it stays organized and holds you accountable."},
  {id:311,proj:"papp",name:"Finish habit tracking in command center",cat:"app",time:"09:00",est:180,done:false,routine:false,streak:0,sched:false,pri:"Should",makeup:true,log:[],notes:""},
  {id:321,name:"Organize YouTube Music playlists",cat:"admin",time:"09:00",est:45,done:false,routine:false,streak:0,sched:false,pri:"Nice",makeup:true,log:[],notes:""},
  {id:322,name:"Organize shed",cat:"house",time:"09:00",est:120,done:false,routine:false,streak:0,sched:false,pri:"Nice",makeup:true,log:[],notes:""},
  {id:323,name:"Change bathroom lights",cat:"house",time:"09:00",est:30,done:false,routine:false,streak:0,sched:false,pri:"Should",makeup:true,log:[],notes:""},
  {id:324,name:"Put cabinet together for 3D printer",cat:"house",time:"09:00",est:90,done:false,routine:false,streak:0,sched:false,pri:"Should",makeup:true,log:[],notes:""},

/* ---------- 3D PRINT IDEAS ---------- */
  {id:400,proj:"pprint",name:"Boiler room organizer",cat:"print3d",time:"09:00",est:120,done:false,routine:false,streak:0,sched:false,pri:"Nice",makeup:true,log:[],notes:""},
  {id:401,proj:"pprint",name:"Desk",cat:"print3d",time:"09:00",est:180,done:false,routine:false,streak:0,sched:false,pri:"Nice",makeup:true,log:[],notes:""},
  {id:402,proj:"pprint",name:"Stop shirts stretching out",cat:"print3d",time:"09:00",est:90,done:false,routine:false,streak:0,sched:false,pri:"Nice",makeup:true,log:[],notes:"Collar or hanger insert."},
  {id:403,proj:"pprint",name:"Dish organizer",cat:"print3d",time:"09:00",est:90,done:false,routine:false,streak:0,sched:false,pri:"Nice",makeup:true,log:[],notes:""},
  {id:404,proj:"pprint",name:"Utensil organizer",cat:"print3d",time:"09:00",est:90,done:false,routine:false,streak:0,sched:false,pri:"Nice",makeup:true,log:[],notes:""},
  {id:405,proj:"pprint",name:"Under bathroom sink organizer",cat:"print3d",time:"09:00",est:90,done:false,routine:false,streak:0,sched:false,pri:"Nice",makeup:true,log:[],notes:""},
  {id:406,proj:"pprint",name:"Shelf organizer",cat:"print3d",time:"09:00",est:90,done:false,routine:false,streak:0,sched:false,pri:"Nice",makeup:true,log:[],notes:""}
];
let nextId = 500;
const upcoming = [];
/* One task with a missing time used to throw here and take the whole Today page
   down with it. A dash is a better outcome than a blank screen. */
const fmtTime = t => { if(typeof t!=="string"||!t.includes(":")) return "—";
  let [h,m]=t.split(":").map(Number);
  if(!Number.isFinite(h)||!Number.isFinite(m)) return "—";
  const ap=h>=12?"PM":"AM"; h=h%12||12; return h+":"+String(m).padStart(2,"0")+" "+ap; };

function render(){
  tasks.sort((a,b)=> (a.order??0)-(b.order??0));
  const day = tasks.filter(onToday);
  const L=$("taskList"); L.innerHTML="";
  if(!day.length) L.innerHTML='<div class="empty">Nothing on the board. Tap Add Task to start your day.</div>';
  day.forEach(t=>{
    const c=catOf(t.cat), row=document.createElement("div");
    const counter = isCounter(t);
    row.className="task"+(t.done&&!counter?" done":"")+(counter&&t.done?" hit":""); row.dataset.id=t.id;
    const grip=`<div class="grip"><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.7"/><circle cx="15" cy="6" r="1.7"/><circle cx="9" cy="12" r="1.7"/><circle cx="15" cy="12" r="1.7"/><circle cx="9" cy="18" r="1.7"/><circle cx="15" cy="18" r="1.7"/></svg></div>`;
    const streak = t.routine&&t.streak?`<span class="streak">🔥 ${t.streak} ${t.streak===1?"day":"days"}</span>`:``;

    if(counter){
      const pct=Math.min(100,Math.round(t.count/t.target*100));
      row.style.setProperty("--pipc",c.fg);
      row.style.setProperty("--pipg",c.fg+"66");
      row.innerHTML=`${grip}
        <div class="icon" style="background:${c.bg}">${c.icon}</div>
        <div class="tmid">
          <div style="display:flex;align-items:baseline;gap:7px;flex-wrap:wrap">
            <div class="tname">${esc(t.name)}</div>
            <div class="cnt" style="color:${(isCapped(t)&&t.count>t.target)?'#ff5f7e':t.done?'#12c98a':c.fg}">${t.count}<small>/${t.target}</small></div>
            ${t.count>t.target?`<span class="over${isCapped(t)?" bad":""}">+${Math.round((t.count-t.target)*100)/100} over${isCapped(t)?" your limit":""}</span>`:``}
            ${streak}
          </div>
          <div class="tcat" style="color:${c.fg}">${unitOf(t)} · ${pct}%</div>
          ${/* One dot per unit is right for 2 doses or 8 glasses. For a step
                 target it drew EIGHT THOUSAND dots — unusable and slow. Anything
                 above a dozen gets a bar instead. */
            t.target<=PIP_MAX
            ? `<div class="pips">${Array.from({length:t.target},(_,i)=>
                `<div class="pip${i<Math.floor(t.count)?" on":(i<t.count?" pip-half":"")}" data-i="${i}"></div>`).join("")}</div>`
            : `<div class="bigbar"><i style="width:${Math.min(100,pct)}%;background:${t.done?'#12c98a':c.fg}"></i></div>`}
        </div>
        <div class="steps">
          <div class="stepbtn minus${t.count?"":" off"}">−</div>
          <div class="stepbtn half" title="Add a half">½</div>
          <div class="stepbtn plus${t.done?" full":""}">${t.done?"✓":"+"}</div>
        </div>`;
      row.querySelectorAll(".pip").forEach(p=>{
        p.onclick=e=>{ e.stopPropagation(); const i=+p.dataset.i;
          setCount(t.id, t.count===i+1 ? i : i+1); };
      });
      row.querySelector(".stepbtn.minus").onclick=e=>{ e.stopPropagation();
        if(!t.count){ toast(`${t.name} is already at 0`); return; }
        /* if you're sitting on a half, take the half off first rather than
           jumping past it to the whole number below */
        const step = (t.count % 1) ? (t.count % 1) : stepFor(t);
        setCount(t.id, t.count-step); };
      row.querySelector(".stepbtn.half").onclick=e=>{ e.stopPropagation();
        setCount(t.id, t.count+0.5); };
      row.querySelector(".stepbtn.plus").onclick=e=>{ e.stopPropagation();
        if(t.count>=t.target){ toast(`${t.name} target already hit`); return; }
        setCount(t.id, t.count+stepFor(t)); };
    } else {
      row.innerHTML=`${grip}
        <div class="icon" style="background:${c.bg}">${c.icon}</div>
        <div class="tmid"><div class="tname">${esc(t.name)}</div>
          <div class="tcat" style="color:${c.fg}">${c.label}${noteBadge(t)}</div>
          ${projTag(t)}${staleBadge(t)}</div>
        <div class="tright">${streak}<span class="ttime">${fmtTime(t.time)}</span></div>
        <div class="check${t.done?" on":""}"><svg viewBox="0 0 24 24" fill="none" stroke="#04170f" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>`;
      row.querySelector(".check").onclick=e=>{e.stopPropagation();toggleDone(t.id);};
    }
    row.querySelector(".tname").onclick=()=>openDetail(t.id);
    row.querySelector(".icon").onclick=()=>openDetail(t.id);
    row.querySelector(".grip").addEventListener("pointerdown",e=>startDrag(e,row));
    L.appendChild(row);
  });
  const total=day.length,done=day.filter(t=>t.done).length,pct=total?Math.round(done/total*100):0;
  $("dNum").textContent=done; $("dOf").textContent="of "+total;
  $("dDone").textContent=done; $("dLeft").textContent=total-done;
  $("dRout").textContent=day.filter(t=>t.routine&&t.done).length+" of "+day.filter(t=>t.routine).length;
  $("dPct").textContent=pct+"%";
  $("dRing").style.strokeDashoffset=201-(201*pct/100);
  $("planCount").textContent=done+" of "+total+" done";
  $("dMsg").innerHTML=pct===100?"<b>Cleared</b> Day is done. Well earned."
                    :pct>=50?"<b>On track</b> Past halfway. Keep the pressure on."
                    :pct>0?"<b>Locked in</b> "+(total-done)+" still on the board.":"<b style=\"color:#7fb0ff\">Ready</b> "+(total-done)+" on the board — start with one.";
  /* This panel used to read `23 + today's done` out of a hardcoded 45 — numbers
     that had nothing to do with your data and never changed. It now counts the
     real week. */
  const [wLo,wHi]=weekBounds(0);
  const wTot=scheduledIn(wLo,wHi), wDone=completedIn(wLo,wHi);
  $("wNum").textContent=wDone;
  $("wOf").textContent="of "+wTot;
  $("wDone").textContent=wDone;
  $("wPend").textContent=Math.max(0,wTot-wDone);
  $("wRing").style.strokeDashoffset=201-(201*(wTot?wDone/wTot:0));
  /* v53: this line was fixed text ("53% of the week cleared") that never changed. */
  if($("wMsg")){ const wp=wTot?Math.round(wDone/wTot*100):0;
    $("wMsg").innerHTML = !wTot ? "<b>Open week</b> Nothing with a date this week yet."
      : wp>=100 ? "<b>Cleared</b> Everything this week is done."
      : `<b>${wp>=50?"On track":"Building"}</b> ${wp}% of the week cleared.`; }
  /* Keep the two lists that depend on the same data in step with it. */
  renderPull(); renderUpcoming();
}
/* This card read from `upcoming`, an array that is created empty and never
   written to, so it has always been blank. It now shows what is actually
   scheduled over the next week. */
function renderUpcoming(){
  const box=$("upcoming"); if(!box) return;
  const groups=[];
  for(let i=1;i<=7;i++){
    const key=offsetDay(i);
    const items=tasks.filter(t=>!t.routine && t.date===key && !t.done)
                     .sort((a,b)=>(a.time||"").localeCompare(b.time||""));
    if(items.length) groups.push({key,items});
  }
  if(!groups.length){
    box.innerHTML=`<div class="empty" style="padding:14px 16px 4px">Nothing booked for the next week yet.
      Open any task and tap <b>Schedule this</b>, or let <b>Plan My Week</b> place them for you.</div>`;
    return;
  }
  box.innerHTML=groups.slice(0,4).map(g=>{
    const label = g.key===offsetDay(1) ? "Tomorrow" : dLabel(new Date(g.key+"T12:00:00"));
    const rows=g.items.slice(0,5).map(t=>{const c=catOf(t.cat);
      return `<div class="up" onclick="openDetail(${t.id})">
        <div class="icon" style="background:${c.bg}">${c.icon}</div>
        <div class="un">${esc(t.name)}</div><div class="ut">${fmtTime(t.time)}</div></div>`;}).join("");
    const more=g.items.length>5?`<div class="up" style="color:var(--ink3);font-size:11.5px;padding-left:16px">+ ${g.items.length-5} more</div>`:``;
    return `<div class="daylabel">${label} · ${g.items.length}</div>${rows}${more}`;
  }).join("");
}
/* Work you've written down but not put on a day. Without this the Today screen
   only ever showed routines, because nothing else had a date. */
function renderPull(){
  const box=$("pullBox"); if(!box) return;
  const rank={Must:0,Should:1,Nice:2};
  const pool=tasks.filter(t=>!t.routine && !t.done && !t.date && statusOf(t)!=="Blocked" && statusOf(t)!=="Waiting")
    .sort((a,b)=>(rank[priOf(a)]??3)-(rank[priOf(b)]??3) || (a.order??0)-(b.order??0));
  if(!pool.length){ box.innerHTML=""; return; }
  const show=pool.slice(0,5);
  box.innerHTML=`
    <div class="card">
      <div class="card-head"><span class="card-title">Put something on today</span>
        <span class="link" onclick="go('tasks')">${pool.length} waiting</span></div>
      ${show.map(t=>{const c=catOf(t.cat), p=t.proj?projById(t.proj):null;
        return `<div class="lg">
          <div class="icon" style="background:${c.bg}">${c.icon}</div>
          <div class="lm" onclick="openDetail(${t.id})" tabindex="0" role="button"><b>${esc(t.name)}</b>
            <span>${p?`${p.icon} ${esc(p.name)} · `:``}${t.est||30} min</span></div>
          <div class="crbtn take" style="flex:none" onclick="addToToday(${t.id})">+ Today</div>
        </div>`;}).join("")}
    </div>`;
}
function addToToday(id){
  const t=getTask(id); if(!t) return;
  refreshToday();
  const before={date:t.date??null, sched:t.sched};
  t.date=TODAY_KEY; t.sched=true;
  t.order=tasks.reduce((m,x)=>Math.max(m, Number.isFinite(x.order)?x.order:0),0)+1;
  save(); render(); renderCal(); renderTasks();
  toastUndo("On today: "+t.name, ()=>{
    t.date=before.date; t.sched=before.sched;
    render(); renderCal(); renderTasks();
  });
}
/* ===== V1 DATA LAYER =====
   Every write goes through save(). Storage is probed once and guarded, so if the
   browser won't allow it the app still runs exactly as before, in memory. */
let STORE_OK=false, SAVE_KEY="momentum.v1", SCHEMA=2;
const BUILD="v54 · Sep 27 · beat-last-time bars, reps not percentages";   // shown in Settings and the menu — bump this every release
(function probe(){ try{ const k="__m"; window.localStorage.setItem(k,"1"); window.localStorage.removeItem(k); STORE_OK=true; }catch(e){ STORE_OK=false; } })();

const SAVED=["tasks","nextId","PROJECTS","carryover","dayNote","missLog","WEBS","commitments",
             "notes","noteId","improve","cardio","cid","meals","wkHist","weekOffset","V2","workHours","prefs",
             "wkSession",   // the workout you're in the middle of — losing this lost a whole session
             "lastRollKey", "prepDone", "hlPrefs", "notif", "lock", "dataLog", "exLoad",
             "errLog",    // crashes, so a problem on the phone is visible on the computer
             "history",   // the tracker dot grids — used to reset on every reload
             "WK",        // workout definitions, including any you build yourself
             "P"];        // the Problem Solver web you're in the middle of
let saveTimer=null;
/* Set just before we deliberately replace or clear what's in storage and reload.
   Without it the close-handler below would write the current in-memory data
   straight back over the top, and Erase / Restore would silently do nothing. */
let HOLD_SAVE=false;
/* One writer, used by both save() and saveNow().
   The old code set STORE_OK=false the first time a write threw. Nothing ever set
   it back, nothing told you, and every edit for the rest of the session was
   quietly dropped — you only found out when you reopened the app. A failed write
   is now reported once and retried on the next save. */
let SAVE_WARNED=false;
function writeBlob(){
  const blob={}; SAVED.forEach(k=>{ try{ blob[k]=eval(k); }catch(e){} });
  blob._v=SCHEMA; blob._at=Date.now();
  try{
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(blob));
    if(SAVE_WARNED){ SAVE_WARNED=false; toast("Saving again — your data is safe"); }
    return true;
  }catch(e){
    const full = /quota|exceeded|full/i.test(String(e&&e.name)+String(e&&e.message));
    if(!SAVE_WARNED){
      SAVE_WARNED=true;
      toast(full ? "⚠️ Can't save — this device's storage is full. Export your data from Settings before closing."
                 : "⚠️ Can't save right now. Export your data from Settings before closing.");
    }
    return false;
  }
}
function save(){
  if(!STORE_OK || HOLD_SAVE) return;
  clearTimeout(saveTimer);
  saveTimer=setTimeout(writeBlob,400);
}
/* Write right now, no waiting. Used when the app is about to disappear —
   you closed the tab, switched apps, or the phone locked. Without this a tap
   in the last fraction of a second would never reach disk. */
function saveNow(){
  if(!STORE_OK || HOLD_SAVE) return;
  clearTimeout(saveTimer);
  writeBlob();
}
window.addEventListener("pagehide", saveNow);
/* Send this device up as it closes. sendBeacon survives the page going away —
   a normal fetch would be cut off half-sent. */
window.addEventListener("pagehide", ()=>{
  try{
    if(!sync.on || !sync.room || HOLD_SAVE) return;
    const body=localBlob(); if(!body) return;
    const at=localStamp()||Date.now();
    if(at<=sync.lastAt) return;                 // nothing new since last time
    const u=sync.url.replace(/\/$/,"")+"?room="+encodeURIComponent(sync.room);
    navigator.sendBeacon(u, new Blob([JSON.stringify({at, device:sync.device, blob:body})],
      {type:"application/json"}));
    sync.lastAt=at; saveSync();
  }catch(e){}
});
window.addEventListener("beforeunload", saveNow);
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="hidden") saveNow(); });
/* Keep a copy of anything we are about to fail to read. Storage is the only
   place this data exists, so "we couldn't parse it" must never turn into
   "we threw it away". The first backup taken is kept — a later failure won't
   overwrite the good copy with a worse one. */
function backupRaw(raw, why){
  try{
    const key=SAVE_KEY+".backup";
    if(!window.localStorage.getItem(key)) window.localStorage.setItem(key, raw);
    window.localStorage.setItem(SAVE_KEY+".backup.why", why+" · "+new Date().toISOString());
  }catch(e){}
}
let LOAD_PROBLEM=null;   // surfaced to you after boot instead of failing silently
function loadSaved(){
  if(!STORE_OK) return false;
  const raw=(()=>{ try{ return window.localStorage.getItem(SAVE_KEY); }catch(e){ return null; } })();
  if(!raw) return false;
  try{
    const blob=JSON.parse(raw);
    /* This used to be `removeItem(SAVE_KEY); return false` — one bumped version
       number and every task, note and project was deleted with no way back.
       A version we don't recognise is now backed up and then read as best we
       can: every field below is already guarded, so unknown extras are ignored
       and missing ones simply keep their defaults. */
    if(blob._v!==SCHEMA){
      backupRaw(raw, "saved with schema v"+blob._v+", app expects v"+SCHEMA);
      LOAD_PROBLEM="This data was saved by a different version of Momentum. It's been loaded as best it can, and the original is backed up.";
    }
    migrateCats(blob);
    if(blob.tasks) tasks=blob.tasks;
    if(blob.nextId) nextId=blob.nextId;
    if(blob.PROJECTS) PROJECTS=blob.PROJECTS;
    if(blob.carryover) carryover=blob.carryover;
    if(blob.dayNote) dayNote=blob.dayNote;
    if(blob.missLog) missLog=blob.missLog;
    if(blob.WEBS) WEBS=blob.WEBS;
    if(blob.commitments) commitments=blob.commitments;
    if(blob.notes) notes=blob.notes;
    if(blob.noteId) noteId=blob.noteId;
    if(blob.improve) improve=blob.improve;
    if(blob.cardio) cardio=blob.cardio;
    if(blob.meals) meals=blob.meals;
    if(blob.wkHist) wkHist=blob.wkHist;
    if(blob.wkSession && blob.wkSession.id) wkSession=blob.wkSession;
    if(blob.lastRollKey) lastRollKey=blob.lastRollKey;
    if(blob.prepDone) prepDone=blob.prepDone;
    if(blob.exLoad) exLoad=blob.exLoad;
    if(blob.hlPrefs) hlPrefs=Object.assign(hlPrefs, blob.hlPrefs);
    /* Anything saved under a brand name gets renamed on the way in, so an old
       save doesn't put it back on screen. */
    if(Array.isArray(hlPrefs.meds)) hlPrefs.meds.forEach(m=>{
      if(m && /adderall|vyvanse|ritalin|concerta|dexedrine/i.test(m.name||"")) m.name="Medication";
      /* older saves predate the daily limit — two doses is the sensible default */
      if(m && m.dailyMax==null) m.dailyMax = (+m.amount||0)*2 || null;
    });
    if(blob.notif) notif=Object.assign(notif, blob.notif);
    /* Without this the PIN was saved and then never read back, so the lock
       screen never appeared after a reload — a lock that locks nothing. */
    if(blob.lock) lock=Object.assign(lock, blob.lock);
    if(Array.isArray(blob.dataLog)) dataLog=blob.dataLog;
    if(Array.isArray(blob.errLog)) errLog=blob.errLog;
    if(blob.V2) V2=blob.V2;
    /* weekOffset is deliberately NOT restored — opening the app should always
       land you on this week, not wherever you were browsing last time. */
    if(blob.workHours) workHours=blob.workHours;
    if(blob.prefs) prefs=Object.assign(prefs,blob.prefs);
    /* Dates don't survive being written to storage — they come back as plain
       text. Turn them back into real dates or the Tracker grid can't tell what
       day a dot belongs to. */
    if(blob.history){ Object.keys(blob.history).forEach(k=>{
      history[k]=(blob.history[k]||[]).map(d=>({...d, date:(d.date instanceof Date)?d.date:new Date(d.date)}))
                                      .filter(d=>!isNaN(d.date)); }); }
    if(blob.WK && blob.WK.length) WK.length=0, blob.WK.forEach(w=>WK.push(w));
    if(blob.P && blob.P.nodes) P=blob.P;
    return true;
  }catch(e){
    /* We could not read what is in storage. Previously this returned false, the
       app carried on with its built-in sample list, and the very next save()
       wrote that sample list straight over the top of the real data. Now the
       bytes are kept, saving is held, and you are told. */
    backupRaw(raw, "could not be read: "+(e&&e.message||e));
    HOLD_SAVE=true;
    LOAD_PROBLEM="Momentum couldn't read your saved data, so it has stopped saving to avoid writing over it. Your original data is backed up — go to Settings › Your data.";
    return false;
  }
}
/* categories got renamed between builds — move old keys onto the closest new one
   so nothing you typed is lost, and anything unknown falls back safely */
const CAT_MAP={finance:"ops", projects:"house", movement:"cardio", print:"print3d",
               marketing:"marketing", hiring:"hiring", credit:"credit", clean:"clean",
               water:"water", meds:"meds", fuel:"fuel", cardio:"cardio", workout:"workout"};
function migrateCats(blob){
  const fix=o=>{ if(o && o.cat && !CATS[o.cat]) o.cat = CAT_MAP[o.cat] || "admin"; };
  (blob.tasks||[]).forEach(fix);
  (blob.carryover||[]).forEach(fix);
  (blob.missLog||[]).forEach(fix);
}

function toggleAiOnAsk(){
  prefs.aiOnAsk=!prefs.aiOnAsk; save(); renderSettings();
  toast(prefs.aiOnAsk ? "AI will wait to be asked" : "AI can suggest on its own again");
}
async function wipeSaved(){
  if(!await ask("Erase everything and start over from your original lists?\n\nThis can't be undone — back up first if you want to keep anything.","Erase everything",1)) return;
  HOLD_SAVE=true;   // stop the close-handler writing it all back on the way out
  try{ window.localStorage.removeItem(SAVE_KEY); }catch(e){}
  location.reload();
}

/* ================= SYNC BETWEEN YOUR DEVICES =================
   Your data lives on each device. To get the phone and the computer level,
   they both talk to one small box online that holds the latest copy.

   Two rules keep this safe:
   1. Nothing goes anywhere until you turn it on and set a code.
   2. If both devices changed since the last sync, it stops and asks you —
      it will never quietly throw away a day's work.

   The code is a shared secret, not a login. Same code on both devices. */
const SYNC_STORE="momentum.sync";
let sync={on:false, url:"/.netlify/functions/sync", room:"", lastAt:0, lastRun:0, note:"", device:""};

function loadSync(){
  try{ const raw=localStorage.getItem(SYNC_STORE); if(raw) Object.assign(sync, JSON.parse(raw)); }catch(e){}
  if(!sync.device) sync.device = (navigator.userAgent.match(/iPhone|iPad|Android/)?"Phone":"Computer")
                                 + "-" + Math.random().toString(36).slice(2,6);
}
function saveSync(){ try{ localStorage.setItem(SYNC_STORE, JSON.stringify(sync)); }catch(e){} }
function newRoomCode(){ const a="ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({length:12},()=>a[Math.floor(Math.random()*a.length)]).join(""); }

const localBlob   = () => { try{ return localStorage.getItem(SAVE_KEY)||""; }catch(e){ return ""; } };
const localStamp  = () => { try{ return (JSON.parse(localBlob())||{})._at||0; }catch(e){ return 0; } };
const blobCount   = b => { try{ const j=typeof b==="string"?JSON.parse(b):b;
  return `${(j.tasks||[]).length} tasks, ${(j.PROJECTS||[]).length} projects`; }catch(e){ return "unreadable"; } };
const whenWords   = t => { if(!t) return "never";
  const m=Math.round((Date.now()-t)/60000);
  if(m<1) return "just now"; if(m<60) return m+" min ago";
  const h=Math.round(m/60); if(h<24) return h+" hr ago";
  return Math.round(h/24)+" days ago"; };

async function syncFetch(method, body){
  const u = sync.url.replace(/\/$/,"") + "?room=" + encodeURIComponent(sync.room);
  const r = await fetch(u, {method,
    headers:{"content-type":"application/json"},
    body: body?JSON.stringify(body):undefined});
  if(!r.ok) throw new Error("HTTP "+r.status);
  const txt=await r.text();
  try{ return JSON.parse(txt); }
  catch(e){ throw new Error("That address didn't answer with data — is the sync piece deployed?"); }
}

/* ================= MERGING TWO DEVICES =================
   The old way swapped the whole file and asked you to pick a winner, which meant
   work done on the other device was thrown away. This merges instead.

   It's a three-way merge. We keep a copy of what both devices last agreed on —
   the "base" — so we can tell the difference between "this is new" and "this was
   deleted". Without the base, a merge resurrects everything you delete.

     in base, gone here      -> you deleted it, keep it gone
     in base, gone there     -> they deleted it, keep it gone
     not in base, here only  -> you just made it, keep it
     not in base, there only -> they just made it, keep it
     on both and different   -> whichever device saved more recently wins
*/
const BASE_KEY = SAVE_KEY + ".base";
/* Returns the raw text, NOT an object — mergeBlobs parses it itself. Handing it
   an object made JSON.parse throw, which quietly turned the base into "nothing",
   which made every deletion come back from the dead. */
function readBase(){
  try{ return window.localStorage.getItem(BASE_KEY) || null; }catch(e){ return null; }
}
function writeBase(blobStr){
  try{ window.localStorage.setItem(BASE_KEY, blobStr); }catch(e){}
}
/* Anything with an id merges item by item. Everything else is a single value and
   just takes the newer side. */
/* id-stamped lists merge item by item. missLog and V2 are NOT id-stamped, so
   they are deliberately left out and take a whole side instead. */
/* carryover was missing from this list. It carries ids like everything else, so
   leaving it out meant Still Owed took one whole side and the other device's
   carried-forward tasks were dropped. */
const MERGE_LISTS = ["tasks","WEBS","notes","PROJECTS","commitments","cardio","carryover","errLog"];
const MERGE_MAPS  = ["history","wkHist","improve","prepDone","exLoad"];
const KEEP_MAX    = ["nextId","noteId"];

function byId(list){
  const m=new Map();
  (list||[]).forEach(x=>{ if(x && x.id!=null) m.set(String(x.id), x); });
  return m;
}
/* Not every list in the app carries ids — the Why Not log and the V2 list don't.
   Matching them item by item produced an empty list, which quietly deleted them.
   If either side isn't id-stamped, take a whole side instead of dropping both. */
const idStamped = l => Array.isArray(l) && l.every(x=>x && x.id!=null);

/* Key order depends on how an object was built, so two copies of the same thing
   can stringify differently. Sort the keys before comparing. */
function stableStr(v){
  if(v===null || typeof v!=="object") return JSON.stringify(v)??"null";
  if(Array.isArray(v)) return "["+v.map(stableStr).join(",")+"]";
  return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+stableStr(v[k])).join(",")+"}";
}
const sameItem = (x,y) => stableStr(x)===stableStr(y);

function mergeList(baseL, mineL, theirsL, mineNewer){
  if(!idStamped(mineL) || !idStamped(theirsL)){
    const a=Array.isArray(mineL)?mineL:null, c=Array.isArray(theirsL)?theirsL:null;
    if(a && c) return mineNewer ? a : c;
    return a || c || [];
  }
  const B=byId(baseL), A=byId(mineL), C=byId(theirsL);
  const haveBase = Array.isArray(baseL);
  const out=[], seen=new Set(), rescued=[];
  const freshId = () => (typeof newId==="function") ? newId()
    : (Date.now()-1735689600000)*4096 + Math.floor(Math.random()*4096);
  const decide=(id)=>{
    const inB=B.has(id), a=A.get(id), c=C.get(id);
    if(a && c){
      /* This used to be `mineNewer ? a : c` — decided purely on which DEVICE
         saved last, never on what actually changed. So a device that had not
         been touched at all could overwrite real work done on the other one,
         just by saving a moment later: tick something off on the phone, and an
         idle laptop would put the tick back.
         The base is what both devices last agreed on, so comparing each side
         against it says who actually edited this item. */
      const b=B.get(id);
      if(!b){
        /* Both devices have this id, but it wasn't there when they last agreed —
           so each of them created something new and the old shared counter gave
           the two of them the same number. Anything made before this build can
           still be carrying such a clash, so keep both rather than losing one. */
        if(haveBase && !sameItem(a,c)) rescued.push({...c, id:freshId()});
        return mineNewer ? a : c;                   // no agreed copy to compare against
      }
      const iChanged = !sameItem(a,b), theyChanged = !sameItem(c,b);
      if(iChanged && !theyChanged) return a;        // only this device edited it
      if(!iChanged && theyChanged) return c;        // only the other device edited it
      return mineNewer ? a : c;                     // both edited it — newer device wins
    }
    if(a && !c) return inB ? null : a;                   // gone there: deleted, unless it's new here
    if(!a && c) return inB ? null : c;                   // gone here: deleted, unless it's new there
    return null;
  };
  /* Keep the order you see on screen: this device first, then anything from the
     other device that this one hasn't seen. */
  (mineL||[]).forEach(x=>{ const id=String(x&&x.id); if(seen.has(id))return; seen.add(id);
    const v=decide(id); if(v) out.push(v); });
  (theirsL||[]).forEach(x=>{ const id=String(x&&x.id); if(seen.has(id))return; seen.add(id);
    const v=decide(id); if(v) out.push(v); });
  return out.concat(rescued);      // anything saved from an id clash
}
/* Workout history and tracker history are stored per item as a list of days.
   Replacing one device's list with the other's throws away every session the
   other device recorded — which is exactly how a workout logged on the phone
   vanished. These get combined day by day instead. */
function dayKey(row){
  if(!row || typeof row!=="object") return JSON.stringify(row);
  if(row.id!=null) return "id:"+row.id;
  if(row.d) return "d:"+row.d;
  if(row.date) return "d:"+String(new Date(row.date).toISOString().slice(0,10));
  if(row.ymd) return "d:"+row.ymd;
  return "j:"+JSON.stringify(row);
}
function mergeDayList(a, c, mineNewer){
  if(!Array.isArray(a)) return Array.isArray(c)?c:[];
  if(!Array.isArray(c)) return a;
  const m=new Map();
  /* put the losing side down first so the winning side overwrites a clash,
     while days only one device knows about still survive */
  (mineNewer?c:a).forEach(r=>m.set(dayKey(r), r));
  (mineNewer?a:c).forEach(r=>m.set(dayKey(r), r));
  const out=[...m.values()];
  out.sort((x,y)=>String(dayKey(x)).localeCompare(String(dayKey(y))));
  return out;
}
function mergeMap(baseM, mineM, theirsM, mineNewer){
  const out={}, keys=new Set([...Object.keys(mineM||{}), ...Object.keys(theirsM||{})]);
  keys.forEach(k=>{
    const inB = baseM && Object.prototype.hasOwnProperty.call(baseM,k);
    const a = mineM && Object.prototype.hasOwnProperty.call(mineM,k);
    const c = theirsM && Object.prototype.hasOwnProperty.call(theirsM,k);
    if(a && c){
      if(Array.isArray(mineM[k]) || Array.isArray(theirsM[k])){
        out[k] = mergeDayList(mineM[k], theirsM[k], mineNewer);
        return;
      }
      /* Same fix as mergeList: prefer whichever side actually changed. */
      const b = inB ? baseM[k] : undefined;
      if(inB){
        const iChanged=!sameItem(mineM[k],b), theyChanged=!sameItem(theirsM[k],b);
        if(iChanged && !theyChanged){ out[k]=mineM[k]; return; }
        if(!iChanged && theyChanged){ out[k]=theirsM[k]; return; }
      }
      out[k] = mineNewer ? mineM[k] : theirsM[k];
      return;
    }
    if(a && !c){ if(!inB) out[k]=mineM[k]; return; }
    if(!a && c){ if(!inB) out[k]=theirsM[k]; return; }
  });
  return out;
}
function mergeBlobs(baseStr, mineStr, theirsStr, mineAt, theirsAt){
  let base=null, mine=null, theirs=null;
  try{ mine=JSON.parse(mineStr); }catch(e){ return theirsStr; }
  try{ theirs=JSON.parse(theirsStr); }catch(e){ return mineStr; }
  try{ base=baseStr?JSON.parse(baseStr):null; }catch(e){ base=null; }
  const mineNewer = (mineAt||0) >= (theirsAt||0);
  const out = mineNewer ? {...theirs, ...mine} : {...mine, ...theirs};

  /* Everything that isn't an id-stamped list or a map — dayNote, prefs, notif,
     workHours, lock, hlPrefs, lastRollKey and so on — used to take a whole side
     based on which device saved last. Same trap as the lists: a device that
     never touched a setting could put the old value back. Where the base tells
     us only one side actually changed, that side wins regardless of the clock. */
  if(base){
    const skip = new Set([...MERGE_LISTS, ...MERGE_MAPS, ...KEEP_MAX, "meals", "P", "_v", "_at"]);
    new Set([...Object.keys(mine), ...Object.keys(theirs)]).forEach(k=>{
      if(skip.has(k)) return;
      const inB = Object.prototype.hasOwnProperty.call(base,k);
      const inA = Object.prototype.hasOwnProperty.call(mine,k);
      const inC = Object.prototype.hasOwnProperty.call(theirs,k);
      if(!inB || !inA || !inC) return;
      const iChanged=!sameItem(mine[k],base[k]), theyChanged=!sameItem(theirs[k],base[k]);
      if(iChanged && !theyChanged) out[k]=mine[k];
      else if(!iChanged && theyChanged) out[k]=theirs[k];
    });
  }

  MERGE_LISTS.forEach(k=>{
    if(!Array.isArray(mine[k]) && !Array.isArray(theirs[k])) return;
    out[k]=mergeList(base&&base[k], mine[k], theirs[k], mineNewer);
  });
  MERGE_MAPS.forEach(k=>{
    if(!mine[k] && !theirs[k]) return;
    out[k]=mergeMap(base&&base[k], mine[k], theirs[k], mineNewer);
  });
  /* ids must never go backwards or two devices start handing out the same one */
  KEEP_MAX.forEach(k=>{ out[k]=Math.max(+mine[k]||0, +theirs[k]||0) || out[k]; });

  /* meals.hist is a list of days inside a single object, so the generic
     "take the newer side" rule would drop the other device's days. */
  try{
    if(mine.meals && theirs.meals){
      out.meals = mineNewer ? {...theirs.meals, ...mine.meals} : {...mine.meals, ...theirs.meals};
      if(Array.isArray(mine.meals.hist) || Array.isArray(theirs.meals.hist))
        out.meals.hist = mergeDayList(mine.meals.hist, theirs.meals.hist, mineNewer);
    }
  }catch(e){}

  /* Why-Not reasons aren't id-stamped, so they took a whole side and the other
     device's reasons were dropped. One reason per day, so merge them by day. */
  try{
    if(Array.isArray(mine.missLog) || Array.isArray(theirs.missLog))
      out.missLog = mergeDayList(mine.missLog, theirs.missLog, mineNewer);
  }catch(e){}

  /* The plan you have open: keep whichever canvas is further along rather than
     blanking one device's work in progress. */
  const pn=(o)=>(o && o.P && Array.isArray(o.P.nodes)) ? o.P.nodes.length : -1;
  if(pn(theirs) > pn(mine)) out.P = theirs.P; else if(pn(mine) >= 0) out.P = mine.P;

  out._v = mine._v || theirs._v;
  out._at = Math.max(+mine._at||0, +theirs._at||0);
  return JSON.stringify(out);
}

/* Merge, save, send the result back up so both ends match, then redraw. */
async function syncMerge(remote, quiet){
  const _before=dataSizes();
  const mineStr=localBlob();
  const merged=mergeBlobs(readBase(), mineStr, remote.blob, localStamp(), remote.at);
  /* A copy of this device exactly as it was, before anything was combined.
     Settings › Restore can read it if a merge ever goes wrong. */
  try{ window.localStorage.setItem(SAVE_KEY+".aside", mineStr); }catch(e){}
  try{
    HOLD_SAVE=true;
    /* the other device may have sent its key along */
    let body=merged;
    try{ const j=JSON.parse(body);
      if(j._aikey && j._aikey.key){
        AI.provider=j._aikey.provider||AI.provider; AI.model=j._aikey.model||AI.model;
        AI.key=j._aikey.key; AI.on=true; AI.ok=null; saveKey();
        delete j._aikey; body=JSON.stringify(j);
      }
    }catch(e){}
    window.localStorage.setItem(SAVE_KEY, body);
    writeBase(body);
    let at=Date.now();
    try{ const r=await pushBlob(body, at); at=r.at; }catch(e){}
    /* Counted from the merged blob rather than memory, because the page reloads
       straight after this and memory is about to be replaced. */
    try{ const m=JSON.parse(body);
      const after={ tasks:(m.tasks||[]).length, plans:(m.WEBS||[]).length, cardio:(m.cardio||[]).length,
        workouts:Object.values(m.wkHist||{}).reduce((a,h)=>a+(h||[]).length,0), notes:(m.notes||[]).length };
      const diff={}; Object.keys(after).forEach(k=>{ const d=after[k]-(_before[k]??after[k]); if(d) diff[k]=d>0?"+"+d:String(d); });
      dataLog.push({ t:Date.now(), what:"merged with "+(remote.device||"other device"), counts:after,
                     ...(Object.keys(diff).length?{diff}:{}) });
      if(dataLog.length>80) dataLog=dataLog.slice(-80);
      m.dataLog=dataLog; body=JSON.stringify(m);
      window.localStorage.setItem(SAVE_KEY, body); writeBase(body);
    }catch(e){}
    sync.lastAt=at; sync.lastRun=at; sync.note="Merged with your other device";
    sync.justPulled=true; saveSync();
  }catch(e){ HOLD_SAVE=false; if(!quiet) toast("Couldn't merge — "+e.message); return "merge failed"; }
  location.reload();
  return "Merged";
}

/* Ask once, then decide. Returns a short line for the user. */
async function syncNow(quiet){
  if(!sync.on || !sync.room) return "Sync is off";
  let remote;
  try{ remote = await syncFetch("GET"); }
  catch(e){ sync.note="Couldn't reach sync — "+e.message; saveSync(); renderSettings&&renderSettings();
            if(!quiet) toast(sync.note); return sync.note; }

  const mine=localStamp(), theirs=(remote&&remote.at)||0;
  const iChanged = mine > sync.lastAt;
  const theyChanged = theirs > sync.lastAt;

  if(!theirs){                                   // nothing up there yet
    writeBase(localBlob());
    return syncPush(quiet, "First copy sent up");
  }
  /* Both moved. No question, no picking — combine them. */
  if(theyChanged && iChanged && theirs!==mine) return syncMerge(remote, quiet);
  /* Even when only one side moved, merge rather than overwrite. If this device
     has something the other never saw, a straight overwrite would erase it. */
  if(theyChanged){ return syncMerge(remote, quiet); }
  if(iChanged)   { writeBase(localBlob()); return syncPush(quiet, "Sent your changes up"); }
  sync.lastRun=Date.now(); sync.note="Already level"; saveSync();
  if(!quiet) toast("Already up to date");
  renderSettings&&renderSettings();
  return "Already level";
}

/* The API key lives in its own slot, apart from your tasks, so it never travels
   by accident — not in a backup, not in a sync. That's deliberate: the room code
   is the only lock on sync, and a key someone else gets hold of costs you money.
   Turn this on and it rides along, so you set the key once instead of twice. */
function syncKeyIn(){ return !!sync.carryKey; }
function toggleCarryKey(){
  sync.carryKey=!sync.carryKey; saveSync(); renderSettings();
  toast(sync.carryKey ? "Your API key will sync too" : "Your API key stays on this device");
  if(sync.carryKey) syncPush(true,"Sent up with the key");
}

/* Send a copy up, and make sure it actually lands.
   The box online keeps whichever copy carries the later stamp, and those stamps
   come from each device's own clock. A phone running even a few hours behind had
   every push answered with "older" and silently dropped — it could never get a
   word in, so nothing typed on it ever reached the other device. If that comes
   back, stamp it just past whatever is up there and send once more. */
async function pushBlob(body, at){
  let r = await syncFetch("POST",{at, device:sync.device, blob:body});
  if(r && r.skipped==="older" && r.at){
    at = (+r.at||0) + 1;
    r = await syncFetch("POST",{at, device:sync.device, blob:body});
  }
  return {res:r, at};
}
async function syncPush(quiet, msg){
  let body=localBlob(); if(!body) return "Nothing to send";
  /* v53: the Claude key no longer rides along with sync. It lives on the
     Netlify site as ANTHROPIC_API_KEY, so no device needs a copy. */
  let at=localStamp()||Date.now();
  try{ const r=await pushBlob(body, at); at=r.at; }
  catch(e){ sync.note="Couldn't send — "+e.message; saveSync(); if(!quiet) toast(sync.note); return sync.note; }
  sync.lastAt=at; sync.lastRun=Date.now(); sync.note=msg||"Sent"; saveSync();
  if(!quiet) toast(msg||"Sent up");
  renderSettings&&renderSettings();
  return msg||"Sent";
}

/* Replace what's on this device with the copy from the other one, then reload
   so every screen is drawn from the new data. HOLD_SAVE stops the close-handler
   writing the old data back over it on the way out. */
function applyRemote(remote){
  try{
    HOLD_SAVE=true;
    let blob=remote.blob;
    // if the other device sent its key along, take it and put it where it belongs
    try{ const j=JSON.parse(blob);
      if(j._aikey && j._aikey.key){
        AI.provider=j._aikey.provider||AI.provider;
        AI.model=j._aikey.model||AI.model;
        AI.key=j._aikey.key; AI.on=true; AI.ok=null;   // untested on this device
        saveKey();
        delete j._aikey; blob=JSON.stringify(j);
      }
    }catch(e){}
    localStorage.setItem(SAVE_KEY, blob);
    sync.lastAt=remote.at; sync.lastRun=Date.now(); sync.note="Pulled from "+(remote.device||"your other device");
    /* Booting re-stamps the file, which would make this device look changed when
       all it did was accept the other one's copy — and that would trip a false
       clash on the very next sync. Re-level the mark once we're back up. */
    sync.justPulled=true;
    saveSync();
  }catch(e){ HOLD_SAVE=false; toast("Couldn't save what came down"); return; }
  location.reload();
}

/* The old "which one should win?" screen is gone. It asked you to decide
   something you had no way of deciding, and threw away one side either way.
   Devices merge on their own now — see syncMerge above. */

/* Turning it on: make a code here, or type the one from the other device. */
function syncStart(){
  if(!sync.room) sync.room=newRoomCode();
  sync.on=true; saveSync(); renderSettings();
  syncNow(true).then(n=>{ toast(n); renderSettings(); });
}
function syncStop(){ sync.on=false; sync.note="Turned off"; saveSync(); renderSettings(); toast("Sync off — nothing leaves this device"); }
async function syncSetCode(){
  const v=await askText("Type the code from your other device","8 letters and numbers");
  if(v===null) return;
  const code=(v||"").trim().toUpperCase().replace(/[^A-Z0-9]/g,"");
  if(code.length<6){ toast("That doesn't look like a code"); return; }
  sync.room=code; sync.lastAt=0; sync.on=true; saveSync(); renderSettings();
  toast("Code set — syncing"); syncNow(false).then(()=>renderSettings());
}
function syncSetUrl(v){ sync.url=(v||"").trim()||"/.netlify/functions/sync"; sync.note=""; saveSync(); }
function copyText(txt){
  const fb=()=>{const ta=document.createElement("textarea");ta.value=txt;document.body.appendChild(ta);
    ta.select();try{document.execCommand("copy")}catch(e){}ta.remove();};
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(txt).catch(fb); else fb();
}
function copyRoom(){ copyText(sync.room); toast("Code copied — type it on your other device"); }

/* ================= THE INBOX =================
   Things your phone or watch dropped off while you weren't looking. Draining it
   is deterministic — same rules as if you'd tapped the buttons yourself. A model
   is never involved in changing your data. */
const inboxURL = () => (sync.url||"").replace(/\/sync\/?$/,"/inbox").replace(/\/$/,"");

/* The app itself is happy with a relative path, but anything OUTSIDE the app —
   a browser address bar, Tasker, HTTP Shortcuts, the watch — needs the full
   thing. Copying "/.netlify/functions/inbox?..." gives a link that goes
   nowhere, which is exactly what it looked like. */
const inboxURLFull = () => {
  const u = inboxURL();
  return /^https?:\/\//i.test(u) ? u : location.origin + (u.startsWith("/") ? u : "/" + u);
};

/* One tap that walks the whole chain: drop a glass of water in the box exactly
   the way a watch would, then collect it. If this works, the address is good and
   anything failing after this is the automation app, not Momentum. */
/* Finished addresses, with the Tasker variable that fills in the number already
   built in. Editing a long address by hand on a phone is miserable and easy to get
   wrong, so nothing here needs editing — you paste it and it's done.

   `metric` is what Momentum calls the reading; `hc` is what Health Connect calls
   the same thing, and whether it lands in longValues or doubleValues depends on
   whether it's a whole number or a decimal. */
const TASKER_LINKS=[
  {label:"Steps",              metric:"steps",            hc:"longValues.Steps_count_total"},
  {label:"Resting heart rate", metric:"restingHeartRate", hc:"doubleValues.RestingHeartRate_bpm_avg"},
  {label:"Average heart rate", metric:"heartRate",        hc:"doubleValues.HeartRate_bpm_avg"},
  {label:"Weight",             metric:"weight",           hc:"doubleValues.Weight_weight_avg"},
  {label:"Blood oxygen",       metric:"bloodOxygen",      hc:"doubleValues.OxygenSaturation_percentage_avg"}
];
function copyTasker(i){
  const t=TASKER_LINKS[i]; if(!t) return;
  if(!sync.room){ toast("Turn sync on first"); return; }
  const url = t.metric==="steps"
    ? `${inboxURLFull()}?room=${sync.room}&do=steps&n=%healthconnectresult.${t.hc}`
    : `${inboxURLFull()}?room=${sync.room}&do=metric&type=${t.metric}&value=%healthconnectresult.${t.hc}`;
  copyText(url);
  toast(`${t.label} copied — paste it into Tasker and change nothing`);
}

async function testInbox(){
  if(!sync.on || !sync.room){ toast("Turn sync on first"); return; }
  toast("Testing…");
  try{
    const r = await fetch(inboxURLFull()+"?room="+encodeURIComponent(sync.room)+"&do=water&n=1",
      {cache:"no-store"});
    const j = await r.json().catch(()=>({}));
    if(!r.ok){ toast("The inbox refused it: "+(j.error||("HTTP "+r.status))); return; }
  }catch(e){ toast("Couldn't reach the inbox — "+e.message); return; }
  const got = await drainInbox(true);
  if(got==="unreachable"){ toast("Dropped it off, but couldn't collect it"); return; }
  if(got==="empty"){ toast("Dropped it off but the box was empty — tell Claude"); return; }
  toast("Worked — water went up by one");
}

async function drainInbox(quiet){
  if(!sync.on || !sync.room) return "Sync is off";
  let box;
  try{
    const r=await fetch(inboxURL()+"?room="+encodeURIComponent(sync.room)+"&drain=1",
      {cache:"no-store"});
    if(!r.ok) throw new Error("HTTP "+r.status);
    box=await r.json();
  }catch(e){ if(!quiet) toast("Couldn't reach the inbox — "+e.message); return "unreachable"; }

  const items=(box&&box.items)||[];
  if(!items.length){ if(!quiet) toast("Nothing waiting"); return "empty"; }

  const done=[];
  let hcPending=0;
  items.forEach(it=>{
    try{
      if(it.kind==="water"){
        const t=tasks.find(x=>x.routine && /water/i.test(x.name));
        if(t){ t.count=(t.count||0)+(+it.n||1); t.done=t.count>=t.target;
               done.push(`water +${+it.n||1}`); }
      }
      else if(it.kind==="steps"){
        let t=tasks.find(x=>x.routine && /step/i.test(x.name));
        if(!t){
          /* Nowhere to put steps yet — make the counter rather than dropping the
             number on the floor. It behaves like any routine you'd add yourself. */
          t={id:newId(), name:"Steps", cat:"cardio", routine:true, freq:"Every day",
             time:"08:00", est:0, target:8000, unit:"step", count:0, done:false,
             streak:0, sched:true, makeup:false,
             notes:"Made automatically the first time your watch sent a step count."};
          tasks.push(t); history[t.id]=[];
          done.push("a Steps counter");
        }
        t.count=Math.max(t.count||0, +it.n||0); t.done=t.count>=t.target;
        done.push(`${it.n} steps`);
      }
      else if(it.kind==="run"){
        const dup=cardio.some(c=>c.d===(it.d||ymd(new Date())) && Math.abs(c.mi-it.mi)<0.05 && Math.abs(c.min-it.min)<2);
        if(!dup){
          cardio.push({id:newId(), ago:0, d:it.d||ymd(new Date()),
            type:CTYPE[it.type]?it.type:"Jog",
            mi:+(+it.mi).toFixed(2), min:Math.round(it.min),
            hr:it.hr?Math.round(it.hr):null, hrMax:it.hrMax?Math.round(it.hrMax):null,
            kcal:it.kcal?Math.round(it.kcal):null,
            hrSeries:Array.isArray(it.hrSeries)?it.hrSeries.map(Number).filter(v=>v>0):[],
            src:"watch"});
          done.push(`${(+it.mi).toFixed(2)} mi run`);
        }
      }
      else if(it.kind==="metric"){
        /* Health Connect readings. Written straight to the health store — they
           never touch the main app state, so a day of heart rate costs nothing. */
        const rows=Array.isArray(it.rows)?it.rows:[it];
        rows.forEach(r=>{ try{ HEALTH.putMeasurement({...r, src:"healthconnect"}); }catch(e){} });
        hcPending += rows.length;
      }
      else if(it.kind==="event"){
        try{ HEALTH.putEvent({...it, src:"healthconnect"}); }catch(e){}
        done.push(`${it.kind==="med"?"a dose":it.kind} from your phone`);
      }
      else if(it.kind==="note"){
        notes.push({id:newId(), t:"From your watch", b:String(it.text||"").slice(0,2000), d:TODAY_KEY});
        done.push("a note");
      }
    }catch(e){}
  });
  if(hcPending){
    done.push(`${hcPending} health reading${hcPending===1?"":"s"}`);
    // roll today up again now the new readings are in
    setTimeout(()=>HEALTH.summarise(ymd(new Date())).then(r=>HEALTH.putDaily(r)), 400);
  }
  if(done.length){
    save(); render(); renderTracker(); renderNotes();
    if(wkTab==="cardio" && $("wkBody")) renderCardio();
    if(document.getElementById("view-health").classList.contains("active")) setTimeout(renderHealth,500);
    toast("From your watch: "+done.join(", "));
  }
  return done.length ? done.join(", ") : "nothing usable";
}

/* Plain-English check so you know whether the sync piece is actually live. */
async function syncTest(){
  const box=$("syncTest"); if(box) box.textContent="Checking…";
  try{
    const r=await syncFetch("GET");
    const msg = r && r.at ? `Working. There's a copy up there from ${whenWords(r.at)} (${blobCount(r.blob)}).`
                          : "Working. Nothing stored up there yet — hit Sync now to send this device up.";
    if(box) box.textContent=msg; return msg;
  }catch(e){
    const msg="Not reachable: "+e.message+" — the app still works, this only affects syncing.";
    if(box) box.textContent=msg; return msg;
  }
}

/* ===== task statuses ===== */
const STATUS=["Open","Waiting","Blocked","Done"];
function statusOf(t){
  if(t.done) return "Done";
  if(t.status==="Waiting") return "Waiting";
  if(t.blockedBy && !tasks.some(x=>x.id===t.blockedBy)) t.blockedBy=null;   // blocker no longer exists
  const b=t.blockedBy?tasks.find(x=>x.id===t.blockedBy):null;
  if(t.status==="Blocked" || (b && !b.done)) return "Blocked";
  return "Open";
}
const isActionable = t => !t.done && statusOf(t)==="Open";
const statusTone = s => ({Open:"#7fb0ff",Waiting:"#ffb26b",Blocked:"#ff8f8f",Done:"#4fd6a5"})[s];

/* ===== notes: one store, attachable to anything ===== */
let notes=[], noteId=1;
/* {id, text, kind:'project'|'task'|'web'|'free', ref, when, pin} */
function noteAdd(text,kind,ref,pin){
  const n={id:newId(),text:text.trim(),kind:kind||"free",ref:ref||null,
           when:new Date().toLocaleDateString(undefined,{month:"short",day:"numeric"}),pin:!!pin};
  notes.unshift(n); save(); return n;
}
function notesFor(kind,ref){ return notes.filter(n=>n.kind===kind&&String(n.ref)===String(ref)); }
function projectNotes(pid){
  const ts=projTasks(pid).map(t=>String(t.id));
  const ws=WEBS.filter(w=>w.proj===pid).map(w=>w.id);
  return notes.filter(n=>(n.kind==="project"&&n.ref===pid)||(n.kind==="task"&&ts.includes(String(n.ref)))||(n.kind==="web"&&ws.includes(n.ref)));
}
/* Resume Here = a pinned note. One per thing, newest wins. */
function resumeOf(kind,ref){ return notesFor(kind,ref).find(n=>n.pin)||null; }
function setResume(kind,ref,text){
  notesFor(kind,ref).filter(n=>n.pin).forEach(n=>n.pin=false);
  if(text.trim()) noteAdd(text,kind,ref,true);
  save();
}

/* ===== V2 parking lot ===== */
let V2=[
  {t:"Real push notifications",w:"Needs an installed app or a server — a web page can't notify you when it's closed."},
  {t:"Voice input on the calendar assistant",w:"Browser speech API; straightforward once V1 is stable."},
  {t:"Sub-tasks / checklists inside a task",w:"Useful for big project tasks. Adds a nesting level, so not in V1."},
  {t:"Recurring tasks that aren't daily routines",w:"e.g. 'invoice on the 1st of each month'."},
  {t:"Time tracking and focus timers",w:"Deliberately left out of V1."},
  {t:"Sharing a project with someone else",w:"Needs accounts and a server."},
  {t:"Attachments and photos on tasks and notes",w:"Storage question — needs a real backend."}
];
function v2Add(t,w){ V2.push({t,w:w||"Captured from use."}); save(); }

/* Never let an unknown category key crash a page. Old saved data, a renamed
   category, a typo — all land on this instead of undefined. */
const CAT_FALLBACK={label:"Uncategorized", icon:"•", bg:"#1a212c", fg:"#8d99ab"};
const catOf = k => CATS[k] || CAT_FALLBACK;

const isCounter = t => t.routine && t.target > 1;
function plural(w,n){
  if(n===1) return w;
  if(/\s/.test(w) && /s$/i.test(w)) return w;      // "1k steps" is already plural
  if(/(s|x|z|ch|sh)$/i.test(w)) return w+"es";
  if(/[^aeiou]y$/i.test(w)) return w.slice(0,-1)+"ies";
  return w+"s";
}
const unitOf = (t,n) => plural(t.unit||"time", n===undefined?t.target:n);
function offsetDay(n){ const d=new Date(); d.setDate(d.getDate()+n);
  return new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,10); }

/* ===== PROJECTS LAYER =====
   Sits underneath what already exists. tasks[] stays the one source of truth —
   a project never holds its own copy, it filters the same array. */

// One source of truth for "is this on Today". Backwards compatible:
//   routines show every day · a dated task shows on its date · an undated task falls back to sched
const ymd = d => new Date(d.getTime()-d.getTimezoneOffset()*6e4).toISOString().slice(0,10);
/* This was a const worked out once when the page loaded. Leave the app open over
   midnight — which is exactly what happens on a phone — and every date decision
   in here was still answering for yesterday: new tasks were stamped with
   yesterday's date, Today showed the wrong list, and the header kept the old
   date. It is now refreshed by refreshToday(), which the rollover check calls
   before it decides anything. */
let TODAY_KEY = ymd(new Date());
/* Re-reads the clock. Returns true if the date actually moved on. */
function refreshToday(){
  const k = ymd(new Date());
  if(k === TODAY_KEY) return false;
  TODAY_KEY = k;
  try{ $("todayDate").textContent = new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"}); }catch(e){}
  return true;
}
const FREQ_DAYS={"Every day":[0,1,2,3,4,5,6],"Weekdays":[1,2,3,4,5],"Weekends":[0,6],"Mon/Wed/Fri":[1,3,5],
  "Mon/Wed":[1,3],"Tue/Thu":[2,4],"Mondays":[1],"Tuesdays":[2],"Wednesdays":[3],"Thursdays":[4],
  "Fridays":[5],"Saturdays":[6],"Sundays":[0]};
const dueOn = (t,dow) => !t.paused && (FREQ_DAYS[t.freq]||[0,1,2,3,4,5,6]).includes(dow);
/* Skipping one day. Pausing a routine is a commitment and it stops the streak
   idea entirely; most days you just aren't doing this one thing, and that
   shouldn't cost you a run you've built up. */
const isSkippedOn = (t,key) => Array.isArray(t.skips) && t.skips.includes(key);
const isSkippedToday = t => isSkippedOn(t, TODAY_KEY);
const onToday = t => t.routine ? (dueOn(t,new Date().getDay()) && !isSkippedOn(t,TODAY_KEY)) : (t.date ? t.date===TODAY_KEY : t.sched!==false);
const onDay = (t,key) => t.routine ? (dueOn(t,new Date(key+"T12:00:00").getDay()) && !isSkippedOn(t,key)) : (t.date ? t.date===key : (key===TODAY_KEY && t.sched!==false));
function skipToday(id){
  const t=getTask(id); if(!t) return;
  t.skips = Array.isArray(t.skips) ? t.skips : [];
  if(t.skips.includes(TODAY_KEY)){
    t.skips = t.skips.filter(k=>k!==TODAY_KEY);
    save(); closeAll(); render(); renderRoutines(); renderCal(); renderOverview();
    toast(`${t.name} is back on today`);
    return;
  }
  t.skips.push(TODAY_KEY);
  if(t.skips.length>90) t.skips=t.skips.slice(-90);      // don't grow for ever
  save(); closeAll(); render(); renderRoutines(); renderCal(); renderOverview();
  toastUndo(`Skipped today: ${t.name} — your streak is untouched`, ()=>{
    t.skips=t.skips.filter(k=>k!==TODAY_KEY);
    render(); renderRoutines(); renderCal(); renderOverview();
  });
}
const isUnscheduled = t => !t.routine && !t.date && t.sched===false;

// Top-level categories are derived from the existing CATS labels ("Business · Finance").
// Nothing duplicated — rename a label and this follows.
function catGroups(){
  const g={};
  Object.entries(CATS).forEach(([k,v])=>{
    const parts=v.label.split(" · "), top=parts[0], sub=parts[1]||parts[0];
    if(!g[top]) g[top]={name:top, fg:v.fg, bg:v.bg, subs:[]};
    g[top].subs.push({key:k, sub, ...v});
  });
  return g;
}
const topCatOf = key => catOf(key).label.split(" · ")[0];

let PROJECTS=[
  {id:"pcall",   name:"Shynex Call Flow",      cat:"Business", icon:"📞",
   goal:"Call flow doing the lookup work for me — people search and maps built in.", status:"Planning", notes:""},
  {id:"psign",   name:"Sign System",           cat:"Business", icon:"📍",
   goal:"Signs going out on scheduled routes without me touching it, and hires answered automatically.", status:"Active",
   notes:"The location app is the piece everything else waits on."},
  {id:"pflyer",  name:"Flyers & Distribution", cat:"Business", icon:"📄",
   goal:"An offer worth switching for, printed, and a daily distribution routine running.", status:"Planning",
   notes:"Offer first, then design, then the routine."},
  {id:"pauto",   name:"Posting Automations",   cat:"Business", icon:"🤖",
   goal:"LSA and FB group posts going out on their own.", status:"Planning",
   notes:"LSA has to be turned on before the automation is worth building."},
  {id:"papp",    name:"Command Center App",    cat:"Personal", icon:"📱",
   goal:"This app running on real AI with habit tracking finished.", status:"Active", notes:""},
  {id:"pprint",  name:"3D Print Ideas",        cat:"3D Print", icon:"🖨️",
   goal:"Print the organizers instead of buying them.", status:"Planning", notes:"All low priority — good fill-in work."}
];
const projById = id => PROJECTS.find(p=>p.id===id);
const projTasks = id => tasks.filter(t=>t.proj===id);           // live, never a copy
const projDone  = id => projTasks(id).filter(t=>t.done).length;
function projLastWorked(id){
  const ts=projTasks(id);
  if(!ts.length) return null;
  const vals=ts.map(t=>t.lastWorked==null?999:t.lastWorked);
  return Math.min(...vals);
}
function projTag(t){
  if(!t.proj) return "";
  const p=projById(t.proj); if(!p) return "";
  return `<div style="margin-top:5px"><span class="ptag">${p.icon} ${esc(p.name)}</span></div>`;
}

/* demo suggestion — keyword match, swapped for a real model later */
function suggestProject(name, catKey){
  const s=name.toLowerCase();
  const rules=[
    {p:"psign",  k:/sign|route|runner|drop ?off|distribut|installer|location app|trigger app|voicemail/},
    {p:"pflyer", k:/flyer|offer|5th and 10th|switch.*compan/},
    {p:"pauto",  k:/automat|auto[- ]?post|schedule.*post|posting/},
    {p:"pcall",  k:/call flow|people search|google maps|shynex call/},
    {p:"pcredit",k:/credit|experian|equifax|transunion|dispute|bureau|chase|score|collection/},
    {p:"plegal", k:/\bsue\b|lawsuit|restraining|court|attorney|lawyer/},
    {p:"papp",   k:/command center|habit track|momentum app|this app/},
    {p:"pprint", k:/3d ?print|filament|organizer|\bstl\b/}
  ];
  for(const r of rules) if(r.k.test(s) && projById(r.p)) return r.p;
  return null;                       // no guess is better than a wrong guess
}

const noteBadge = t => (t.log&&t.log.length) ? `<span class="notebadge">📝 ${t.log.length}</span>` : "";

/* how long since you actually touched it */
function staleBadge(t){
  if(t.done || !t.lastWorked || t.lastWorked < 7) return "";
  const cold = t.lastWorked >= 14;
  return `<div style="margin-top:6px"><span class="stale${cold?" cold":""}">🕓 ${t.lastWorked} days since you touched this</span></div>`;
}

function toggleDone(id){
  const t=getTask(id); if(!t) return;
  /* Deleting and counters both offered a way back; ticking something off — the
     single most-tapped thing in the app — did not. A mis-tap on a routine also
     moved the streak, so the undo has to put that back too. */
  const was={done:t.done, streak:t.streak, count:t.count};
  t.done=!t.done;
  /* A counter's "done" is worked out from its count, so flipping the flag on its
     own leaves the two disagreeing — the row says finished while the dots say
     none. Anything that marks a counter done moves the count to match. */
  if(isCounter(t)) t.count = t.done ? t.target : 0;
  if(t.routine) t.streak=t.done?t.streak+1:Math.max(0,t.streak-1);
  save(); render(); renderNotif(); renderTasks(); renderCal(); renderRoutines();
  const back=()=>{ Object.assign(t,was); save(); render(); renderNotif(); renderTasks(); renderCal(); renderRoutines(); };
  if(t.done) toastUndo(t.routine?`🔥 ${t.streak} day streak — ${t.name}`:"Done: "+t.name, back);
  else toastUndo("Reopened: "+t.name, back);
}

/* counter routines: hit the target, keep the streak */
function setCount(id,v){
  const t=getTask(id); if(!t) return;
  const was=t.done, prevCount=t.count;
  /* halves are allowed; round to the nearest half so floating point can't
     leave you on 1.4999999999.
     The old ceiling was a flat 99 — fine for glasses of water, disastrous for a
     step count, where one tap of + or − crushed 7,039 down to 99. */
  const ceiling = Math.max(99, (t.target||0)*3);
  t.count=Math.max(0,Math.min(ceiling,Math.round(v*2)/2));
  t.done=t.count>=t.target;
  if(t.done&&!was) t.streak++;
  if(!t.done&&was) t.streak=Math.max(0,t.streak-1);
  save(); render(); renderTracker(); renderNotif();
  const drop = t.count < prevCount;
  if(t.done&&!was) toast(`🔥 ${t.streak} day streak — ${t.name} hit`);
  else if(drop) toastUndo(`${t.name}: ${prevCount} → ${t.count} of ${t.target}`,
    ()=>{ t.count=prevCount; t.done=t.count>=t.target; if(was&&!t.done) t.streak++; render(); renderTracker(); renderNotif(); });
  else if(t.count>0) toast(`${t.name}: ${t.count} of ${t.target} ${unitOf(t)}`);
}
/* This used to delete the task outright and then push a display-only stub into
   `upcoming`, which is a permanently empty array — so it threw halfway through
   and the task was gone for good, with its notes, project and history. It now
   does the obvious thing: moves the date forward a day and keeps the task. */
function pushTomorrow(id){
  const t=getTask(id); if(!t) return;
  if(t.routine){ toast(`${t.name} is a routine — it comes back on its own next due day`); return; }
  const before={date:t.date??null, sched:t.sched};
  t.date=offsetDay(1); t.sched=true;
  save(); closeAll(); render(); renderUpcoming(); renderCal(); renderTasks(); renderCarry();
  toastUndo("Moved to tomorrow: "+t.name, ()=>{
    t.date=before.date; t.sched=before.sched;
    render(); renderUpcoming(); renderCal(); renderTasks(); renderCarry();
  });
}
function delTask(id){
  const t=getTask(id); if(!t) return;
  const snap=JSON.parse(JSON.stringify(t));
  const freed=tasks.filter(x=>x.blockedBy===id);      // anything waiting on it is now unblocked, not orphaned
  freed.forEach(x=>x.blockedBy=null);
  tasks=tasks.filter(x=>x.id!==id);
  /* The tracker grid for a deleted counter used to be left behind in history{}
     for ever — invisible, never cleaned up, and growing the saved blob towards
     the storage limit. Held on the side so Undo can put it back. */
  const histSnap = history[id];
  delete history[id];
  /* Same for a half-finished carry-over entry pointing at a task that no longer exists. */
  const carrySnap = carryover.filter(c=>c.id===id);
  if(carrySnap.length) carryover=carryover.filter(c=>c.id!==id);
  save(); closeAll(); render(); renderTasks(); renderProjects(); renderCal(); renderTracker(); renderCarry();
  toastUndo(freed.length ? `Deleted: ${t.name} — ${freed.length} unblocked` : "Deleted: "+t.name,
    ()=>{ tasks.push(snap); freed.forEach(x=>x.blockedBy=id);
      if(histSnap) history[id]=histSnap;
      carrySnap.forEach(c=>carryover.push(c));
      render(); renderTasks(); renderProjects(); renderCal(); renderTracker(); renderCarry(); }); }
/* Where this task came from, if it came out of the Problem Solver. It points at
   the real conversation rather than copying it, so if you ask two more questions
   next week this says five, not three. */
function originCard(t){
  if(!t.from || !t.from.web) return "";
  const w=WEBS.find(x=>x.id===t.from.web);
  if(!w) return `<div class="notes" style="border-color:rgba(255,157,77,.3)">
    <b style="color:#ff9d4d;font-size:11px;letter-spacing:.12em;text-transform:uppercase">From Problem Solver</b><br>
    <span style="color:var(--ink3)">That web has been deleted. Anything you'd asked was copied into the notes below.</span></div>`;
  const nodes=w.nodes||[];
  const owner=nodes.find(n=>n.id===t.from.node);
  const thread=nodes.find(n=>n.type==="thread" && n.parent===t.from.node);
  const qas=thread?nodes.filter(n=>n.type==="qa"&&n.parent===thread.id):[];
  const point=qas.find(q=>q.point);
  const what = owner&&owner.type==="solution" ? `Route ${owner.num} — ${esc(owner.title)}` : `The combined plan`;
  return `<div class="notes" style="border-color:rgba(79,195,247,.32);background:rgba(79,195,247,.05)">
    <b style="color:#4fc3f7;font-size:11px;letter-spacing:.12em;text-transform:uppercase">From Problem Solver</b><br>
    <span style="color:var(--ink2)">${what}</span>
    <div style="font-size:11.5px;color:var(--ink3);margin-top:3px">on "${esc((t.from.seed||"").slice(0,60))}"</div>
    ${point?`<div style="margin-top:9px;padding:9px;border-radius:9px;background:rgba(255,157,77,.1);
       border:1px solid rgba(255,157,77,.3)">
       <div style="font-size:9.5px;font-weight:900;letter-spacing:.12em;color:#ff9d4d">THE POINT</div>
       <div style="font-size:12.5px;color:#ffc79a;margin-top:4px;line-height:1.5">${esc(stripTags(point.a).slice(0,180))}</div></div>`:``}
    <div class="crbtn take" style="margin-top:10px;display:inline-block;background:#0d2330;color:#8fd6f7;
         border:1px solid rgba(79,195,247,.4)" onclick="openFromTask('${t.from.web}',${t.from.node})">
      ${qas.length?`💬 ${qas.length} question${qas.length===1?"":"s"} asked ›`:`Open the web ›`}</div>
  </div>`;
}
/* Jump from a task back to the exact route it came from, conversation and all. */
async function openFromTask(webId, nodeId){
  closeAll();
  await openWeb(webId);
  const n=P.nodes.find(x=>x.id===nodeId);
  if(!n) return;
  const t=webThread(nodeId);
  if(t){ t.open=true; drawWeb(); setTimeout(fitView,100); openThread(nodeId); }
  else openNode(n);
}

/* The detail sheet used to print the word "Today" for every task, whatever its
   real date — so an unscheduled task and one set for next Friday both claimed to
   be on today's list. */
function schedLabel(t){
  if(t.routine) return `${t.freq}${t.time?` · ${fmtTime(t.time)}`:``}`;
  if(!t.date) return "Not scheduled";
  const when = t.date===TODAY_KEY ? "Today"
             : t.date===offsetDay(1) ? "Tomorrow"
             : t.date===offsetDay(-1) ? "Yesterday"
             : dLabel(new Date(t.date+"T12:00:00"));
  const late = t.date<TODAY_KEY && !t.done ? " · not done" : "";
  return `${when}${t.time?` · ${fmtTime(t.time)}`:``}${late}`;
}
function openDetail(id){
  const t=getTask(id); if(!t) return;
  const c=catOf(t.cat);
  $("detailBody").innerHTML=`
    ${resumeBanner("task",t.id)}
    <div style="display:flex;align-items:center;gap:11px;margin-top:4px">
      <div class="icon" style="background:${c.bg};width:42px;height:42px;border-radius:12px;font-size:19px">${c.icon}</div>
      <div><h2 style="margin:0">${esc(t.name)}</h2>
      <div style="font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${c.fg};margin-top:3px">${c.label}</div></div>
    </div>
    <div style="margin-top:14px">
      <div class="meta"><span class="k">Status</span><span class="v" style="color:${t.done?'#12c98a':'#8d99ab'}">${t.done?"Completed":"Not done yet"}</span></div>
      <div class="meta"><span class="k">Scheduled</span><span class="v">${schedLabel(t)}</span></div>
      ${t.due?`<div class="meta"><span class="k">Deadline</span>
        <span class="v" style="color:${(t.due<TODAY_KEY&&!t.done)?'#ff8f8f':'#ffb26b'}">${dLabel(new Date(t.due+"T12:00:00"))}${(t.due<TODAY_KEY&&!t.done)?" · overdue":""}</span></div>`:``}
      ${t.est?`<div class="meta"><span class="k">Estimated</span><span class="v">${t.est} min</span></div>`:``}
      ${t.routine?`<div class="meta"><span class="k">Routine</span><span class="v">${t.freq}</span></div>
      <div class="meta"><span class="k">Streak</span><span class="v">🔥 ${t.streak} ${t.streak===1?"day":"days"}</span></div>`:``}
      ${t.proj&&projById(t.proj)?`<div class="meta"><span class="k">Project</span>
        <span class="v" style="color:#7fb0ff;cursor:pointer" onclick="closeAll();openProject('${t.proj}')">${projById(t.proj).icon} ${esc(projById(t.proj).name)} ›</span></div>`:``}
      ${t.lastWorked?`<div class="meta"><span class="k">Last worked on</span><span class="v" style="color:${t.lastWorked>=14?'#ff8080':t.lastWorked>=7?'#ff9d4d':'#8d99ab'}">${t.lastWorked} days ago</span></div>`:``}
      ${isCounter(t)?`<div class="meta"><span class="k">Daily target</span><span class="v">${t.target} ${unitOf(t)}</span></div>
      <div class="meta"><span class="k">So far today</span><span class="v" style="color:${t.done?'#12c98a':catOf(t.cat).fg}">${t.count} of ${t.target}</span></div>`:``}
      <div class="notes"><b style="color:var(--ink3);font-size:11px;letter-spacing:.12em;text-transform:uppercase">About this</b><br>${esc(t.notes)||"—"}</div>
      ${originCard(t)}

      <label class="f" style="margin-top:16px">Progress notes${(t.log&&t.log.length)?` · ${t.log.length}`:``}</label>
      <div class="logs">
        ${(t.log&&t.log.length)? t.log.map((l,i)=>`<div class="logrow">
            <div class="ld">${esc(l.d)}</div>
            <div class="lt">${esc(l.t)}</div>
            <div class="lx" onclick="delLog(${t.id},${i})">✕</div>
          </div>`).join("")
        : `<div style="font-size:13px;color:var(--ink3);padding:6px 0 2px;line-height:1.5">
             Nothing yet. Jot down where you left off — "got half the application done", "waiting on their callback".</div>`}
      </div>
      <textarea class="f" id="logInput" rows="2" style="margin-top:10px" placeholder="What happened with this one?"></textarea>
      <button class="b b-ghost" style="margin-top:8px;width:100%" onclick="addLog(${t.id})">+ Add note</button>
    </div>
    ${isCounter(t)?`
    <div class="btns">
      <button class="b b-ghost" onclick="setCount(${t.id},${Math.max(0,t.count-1)});closeAll()">− One</button>
      <button class="b b-blue" onclick="setCount(${t.id},${t.count+1});closeAll()">+ One ${t.unit}</button>
    </div>
    <div class="btns" style="margin-top:9px">
      <button class="b b-ghost" onclick="setCount(${t.id},0);closeAll()">Reset to 0</button>
      <button class="b b-primary" onclick="setCount(${t.id},${t.target});closeAll()">Hit the target</button>
    </div>
    <div class="btns" style="margin-top:9px">
      <button class="b b-ghost" onclick="go('tracker')">See history</button>
      <button class="b b-danger" onclick="delTask(${t.id})">Delete</button>
    </div>`:`
    <div class="btns">
      <button class="b ${t.done?'b-ghost':'b-primary'}" onclick="toggleDone(${t.id});closeAll()">${t.done?"Mark not done":"✓ Complete"}</button>
      ${t.routine
        ? `<button class="b b-soft" onclick="skipToday(${t.id})">${isSkippedToday(t)?"Put back on today":"Not today"}</button>`
        : `<button class="b b-soft" onclick="pushTomorrow(${t.id})">Push to tomorrow</button>`}
    </div>
    ${t.routine?``:`
    <div class="btns" style="margin-top:9px">
      <!-- There was no way to give a task a day from the task itself. The only
           route was the Calendar, five steps away, which is why nothing ever
           got scheduled. -->
      <button class="b b-soft" style="width:100%" onclick="closeAll();calTaskMenu(${t.id})">📅 ${t.date?"Change day":"Schedule this"}</button>
    </div>`}
    <div class="btns" style="margin-top:9px">
      <button class="b b-ghost" onclick="openRoutineEdit(${t.id})">Edit</button>
      <button class="b b-danger" onclick="delTask(${t.id})">Delete</button>
    </div>`}
    <label class="f">Status</label>
    <div class="chips">
      ${["Open","Waiting","Blocked"].map(s=>`<span class="chip${statusOf(t)===s?" on":""}" onclick="setStatus(${t.id},'${s}')">${s}</span>`).join("")}
    </div>
    <div style="font-size:11.5px;color:var(--ink3);line-height:1.5;margin-top:8px">
      Waiting and Blocked are skipped by the scheduler — it moves to the next thing you can actually do.</div>
    <div class="btns" style="margin-top:14px">
      <button class="b b-soft" style="width:100%" onclick="openResume('task',${t.id},'${esc(t.name).replace(/'/g,"")}')">📌 Save where I left off</button>
    </div>
    <div class="btns" style="margin-top:9px">
      <button class="b b-ghost" onclick="openNoteEditor(null,'task',${t.id})">+ Note</button>
      <button class="b b-violet" onclick="solveTask(${t.id})">🕸 Solve this</button>
    </div>`;
  openSheet("detail");
}
let isRoutine=false,freq="Every day";
const FREQS=["Every day","Weekdays","Weekends","Mon/Wed/Fri","Mon/Wed","Tue/Thu","Mondays","Tuesdays","Wednesdays","Thursdays","Fridays","Saturdays","Sundays"];
/* Which day a new task is for. "today" is the default because that is what the
   form used to do silently; the difference is that you can now say otherwise. */
let aWhen="today", aWhenPicked="";
function buildWhenChips(){
  const box=$("aWhenChips"); if(!box) return;
  const opts=[["today","Today"],["tomorrow","Tomorrow"],["pick", aWhenPicked?dLabel(new Date(aWhenPicked+"T12:00:00")):"Pick a day"],["none","No date"]];
  box.innerHTML=opts.map(([k,l])=>`<span class="chip${aWhen===k?" on":""}" onclick="pickWhen('${k}')">${l}</span>`).join("");
  $("aWhenDate").style.display = aWhen==="pick" ? "block" : "none";
  /* The button used to say "Add to today" whatever you'd chosen. */
  const btn=$("addBtn");
  if(btn) btn.textContent = isRoutine ? "Add routine"
    : aWhen==="today" ? "Add to today"
    : aWhen==="tomorrow" ? "Add to tomorrow"
    : aWhen==="pick" ? (aWhenPicked ? "Add to "+dLabel(new Date(aWhenPicked+"T12:00:00")) : "Pick a day first")
    : "Add without a date";
}
function pickWhen(kind, val){
  if(kind==="pick" && val){ aWhenPicked=val; aWhen="pick"; buildWhenChips(); return; }
  aWhen=kind;
  if(kind==="pick"){ buildWhenChips(); setTimeout(()=>{ try{ $("aWhenDate").showPicker(); }catch(e){ $("aWhenDate").focus(); } },30); return; }
  buildWhenChips();
}
/* The day the When row currently means. null = deliberately unscheduled. */
function whenDate(){
  if(aWhen==="today") return TODAY_KEY;
  if(aWhen==="tomorrow") return offsetDay(1);
  if(aWhen==="pick") return aWhenPicked || TODAY_KEY;
  return null;
}
function buildForm(){
  $("aCat").innerHTML=Object.entries(CATS).map(([k,v])=>`<option value="${k}">${v.icon}  ${v.label}</option>`).join("");
  $("freqChips").innerHTML=FREQS.map(f=>`<span class="chip${f===freq?" on":""}" onclick="pickFreq('${f}')">${f}</span>`).join("");
  buildWhenChips();
}
function pickFreq(f){ freq=f; buildForm(); }
function toggleRoutine(){
  isRoutine=!isRoutine;
  $("aSw").classList.toggle("on",isRoutine);
  $("freqBox").style.display=isRoutine?"block":"none";
  /* A routine repeats on a frequency, so a single day makes no sense for it. */
  $("aWhenBox").style.display=isRoutine?"none":"block";
  buildWhenChips();
  syncMakeup();
}
function syncMakeup(){
  const counter = isRoutine && (+$("aTarget").value||1) > 1;
  $("makeupRow").style.display = counter ? "none" : "flex";
}
function openAdd(asTracker){
  if(asTracker && !isRoutine) toggleRoutine();
  $("addTitle").textContent = asTracker ? "New tracker" : "New task";
  if(asTracker && +$("aTarget").value<2) $("aTarget").value=8;
  syncProjPicker(); syncSuggest();
  openSheet("add"); setTimeout(()=>$("aName").focus(),300);
}
function saveTask(){
  const name=$("aName").value.trim();
  if(!name){ $("aName").focus(); toast("Give the task a name first"); return; }
  refreshToday();                                   // never stamp yesterday's date on a new task
  const target = isRoutine ? Math.max(1,Math.min(20,+$("aTarget").value||1)) : 1;
  const due = $("aDue").value || null;
  const t={id:newId(),name,cat:$("aCat").value,time:$("aTime").value||"09:00",est:+$("aEst").value||30,
           done:false,routine:isRoutine,freq,streak:0,notes:$("aNotes").value.trim(),
           target, unit:($("aUnit").value.trim()||"time"), count:0, log:[],
           makeup: target>1 ? false : $("aMakeup").classList.contains("on"),
           proj: $("aProj").value || null,
           pri: $("aPri").value, due,
           /* sched was never written, so this task disagreed with every task
              already saved, which uses sched to mean "has a day". */
           date: isRoutine ? null : whenDate(), sched: isRoutine ? false : !!whenDate(),
           order: tasks.reduce((m,x)=>Math.max(m, Number.isFinite(x.order)?x.order:0), 0)+1,
           blockedBy:null};
  tasks.push(t);
  /* The whole list used to be re-sorted by time and renumbered on every add,
     which silently threw away the order you had dragged things into. */
  if(isCounter(t)){ history[t.id]=[]; for(let i=34;i>=1;i--){const d=new Date();d.setDate(d.getDate()-i);history[t.id].push({date:d,v:0});} }
  resetAddForm();
  if(isRoutine) toggleRoutine();
  pendingProject=null;
  save();
  closeAll(); render(); renderTracker(); renderProjects(); renderCategories(); renderCal(); renderTasks(); renderRoutines();
  const pn = t.proj ? projById(t.proj) : null;
  /* A deadline already in the past is nearly always a mistyped date — say so
     rather than silently filing a task that is born overdue. */
  if(due && due < TODAY_KEY) toast(`Added: ${name} — note that deadline has already passed`);
  else toast(isCounter(t) ? `Added: ${name} — now on Tracker too` : pn ? `Added to ${pn.name}` : "Added: "+name);
}
/* Every field, not just three of them. Leaving Time, Est. minutes, Priority and
   Project loaded with the last task's values meant the next thing you added
   quietly inherited settings you never chose. */
function resetAddForm(){
  $("aName").value=""; $("aNotes").value=""; $("aUnit").value=""; $("aTarget").value=1; $("aDue").value="";
  $("aTime").value="09:00"; $("aEst").value=30; $("aPri").value="Should";
  $("aMakeup").classList.add("on");
  if($("aProj")) $("aProj").value="";
  const sg=$("aSuggest"); if(sg) sg.style.display="none";
  aWhen="today"; aWhenPicked=""; $("aWhenDate").value=""; buildWhenChips();
}
let drag=null;
function startDrag(e,row){
  e.preventDefault();
  const rows=[...$("taskList").children];
  drag={row,startY:e.clientY,index:rows.indexOf(row)};
  row.classList.add("dragging"); row.setPointerCapture(e.pointerId);
  document.addEventListener("pointermove",onDrag);
  document.addEventListener("pointerup",endDrag,{once:true});
}
function onDrag(e){
  if(!drag) return;
  drag.row.style.transform=`translateY(${e.clientY-drag.startY}px)`;
  const list=$("taskList"),rows=[...list.children].filter(r=>r!==drag.row);
  const d=drag.row.getBoundingClientRect(),dmid=d.top+d.height/2;
  for(const r of rows){
    const b=r.getBoundingClientRect(),mid=b.top+b.height/2;
    if(dmid>mid && r.compareDocumentPosition(drag.row)&Node.DOCUMENT_POSITION_PRECEDING){
      list.insertBefore(drag.row,r.nextSibling); drag.startY=e.clientY; drag.row.style.transform=""; break;}
    if(dmid<mid && r.compareDocumentPosition(drag.row)&Node.DOCUMENT_POSITION_FOLLOWING){
      list.insertBefore(drag.row,r); drag.startY=e.clientY; drag.row.style.transform=""; break;}
  }
}
function endDrag(){
  if(!drag) return;
  document.removeEventListener("pointermove",onDrag);
  drag.row.classList.remove("dragging"); drag.row.style.transform="";
  const ids=[...$("taskList").children].map(r=>+r.dataset.id);
  tasks.forEach(t=>{ const i=ids.indexOf(t.id); if(i>-1) t.order=i; });
  drag=null;
  save();          // the new order was only ever held in memory before this
  render();
}
/* A drag that ends in a cancel (a phone call arriving, the browser taking the
   pointer back) left a move listener attached to the document for good. */
document.addEventListener("pointercancel", ()=>{ if(drag) endDrag(); });

/* ================= BRAINDUMP =================
   Demo brain again — keyword sorting, not a real model. */
const SORT_RULES=[
  {c:"water",    k:/water|hydrat|drink/i},
  {c:"meds",     k:/\bmeds?\b|medication|pill|prescription/i},
  {c:"fuel",     k:/protein|shake|vitamin|supplement|meal|eat|lunch|dinner|breakfast|grocer/i},
  {c:"cardio",   k:/run|jog|walk|mile|cardio|bike|ride/i},
  {c:"workout",  k:/workout|lift|gym|push[- ]?up|pull[- ]?up|curl|press|chest|back|legs|arms|shoulder|abs|core/i},
  {c:"credit",   k:/credit|experian|equifax|transunion|dispute|bureau|chase|score|collection/i},
  {c:"legal",    k:/\bsue\b|lawsuit|restraining|lawyer|attorney|court|legal/i},
  {c:"shynex",   k:/call flow|shynex|people search|trigger app|location app/i},
  {c:"automate", k:/automat|\bai\b|bot|auto[- ]?reply|workflow|integrat/i},
  {c:"marketing",k:/post|market|\bads?\b|facebook|\bfb\b|group|instagram|flyer|lsa|google|review|seo|lead|sign/i},
  {c:"hiring",   k:/hire|hiring|\bva\b|assistant|interview|candidate|resume|crew|subcontract/i},
  {c:"growth",   k:/location|expand|upsell|value|price|pricing|revenue|rank/i},
  {c:"print3d",  k:/3d|print|filament|organizer|stl/i},
  {c:"app",      k:/command center|habit track|this app|momentum/i},
  {c:"ops",      k:/password|email|file|organize.*computer|backup|voicemail|access/i},
  {c:"clean",    k:/clean|vacuum|laundry|dish|trash|mop|sheet|shower|toilet|sink|wash/i},
  {c:"grooming", k:/hair|shave|trim|beard/i},
  {c:"house",    k:/shed|light|cabinet|garage|yard|fix|repair|build/i}
];
function guessCat(line){
  for(const r of SORT_RULES) if(r.k.test(line)) return r.c;
  return "admin";
}
function guessRoutine(line){ return /every day|daily|each day|every morning|every night|weekly/i.test(line); }
let dumpDraft=[];

function openBraindump(){ closeAll(); $("bdResult").innerHTML=""; openSheet("braindump"); setTimeout(()=>$("bdText").focus(),320); }
async function sortDump(){
  const lines=$("bdText").value.split("\n").map(s=>s.trim()).filter(Boolean);
  if(!lines.length){ $("bdText").focus(); toast("Type a few lines first"); return; }
  dumpDraft=lines.map((l,i)=>{const txt=l.replace(/^[-•*]\s*/,""),cat=guessCat(l);
    return {i,text:txt,cat,proj:suggestProject(txt,cat)||"",routine:guessRoutine(l),keep:true};});
  if(AI.on){
    $("bdResult").innerHTML=`<div style="padding:16px 0;font-size:13px;color:var(--ink2)"><span class="thinkdot"></span> Sorting…</div>`;
    const cats=Object.entries(CATS).map(([k,v])=>`${k} = ${v.label}`).join("\n");
    const projs=PROJECTS.map(p=>`${p.id} = ${p.name} (${p.cat})`).join("\n");
    const r=await callAI(
      `Sort each line into one category key and optionally one project id.
CATEGORIES:\n${cats}\nPROJECTS:\n${projs}
Reply with one line per input, in the same order, formatted exactly: categoryKey|projectIdOrNone
Nothing else.`, lines.join("\n"), 600);
    if(r){ const rows=r.split("\n").map(x=>x.trim()).filter(Boolean);
      rows.forEach((row,i)=>{ if(!dumpDraft[i]) return;
        const [c,pr]=row.split("|").map(x=>(x||"").trim());
        if(CATS[c]) dumpDraft[i].cat=c;
        if(pr && projById(pr)) dumpDraft[i].proj=pr; }); }
  }
  $("bdResult").innerHTML=`
    <div style="margin-top:18px;padding-top:16px;border-top:1px solid var(--line)">
      <div style="font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--ink3);margin-bottom:10px">
        Sorted ${dumpDraft.length} item${dumpDraft.length>1?"s":""} — change any category</div>
      ${dumpDraft.map(d=>{const c=catOf(d.cat);
        return `<div class="bdrow" id="bd${d.i}">
          <div class="icon" style="background:${c.bg};width:30px;height:30px;border-radius:9px;font-size:13px">${c.icon}</div>
          <div style="flex:1;min-width:0">
            <div style="font-size:13.5px;font-weight:600">${esc(d.text)}</div>
            <div style="display:flex;gap:5px;flex-wrap:wrap;margin-top:5px">
              <select onchange="dumpDraft[${d.i}].cat=this.value"
                style="background:#0f141b;border:1px solid #2c374a;color:${c.fg};border-radius:7px;
                       font-size:10.5px;font-weight:700;padding:4px 6px;font-family:inherit;outline:none;max-width:100%">
                ${Object.entries(CATS).map(([k,v])=>`<option value="${k}"${k===d.cat?" selected":""}>${v.label}</option>`).join("")}
              </select>
              <select onchange="dumpDraft[${d.i}].proj=this.value"
                style="background:#0f141b;border:1px solid ${d.proj?'#7c5cf0':'#2c374a'};color:${d.proj?'#c4b0ff':'var(--ink3)'};border-radius:7px;
                       font-size:10.5px;font-weight:700;padding:4px 6px;font-family:inherit;outline:none;max-width:100%">
                <option value="">No project</option>
                ${PROJECTS.map(p=>`<option value="${p.id}"${p.id===d.proj?" selected":""}>${p.icon} ${p.name}</option>`).join("")}
              </select>
            </div>
          </div>
          <div class="crbtn drop" onclick="dropDump(${d.i})">✕</div>
        </div>`;}).join("")}
      <button class="b b-primary" style="width:100%;margin-top:14px" onclick="commitDump()">Add them all to today</button>
    </div>`;
}
function dropDump(i){ dumpDraft[i].keep=false; const el=$("bd"+i); if(el) el.style.display="none"; }
function commitDump(){
  const keep=dumpDraft.filter(d=>d.keep);
  if(!keep.length){ toast("Nothing left to add"); return; }
  refreshToday();
  let ord = tasks.reduce((m,x)=>Math.max(m, Number.isFinite(x.order)?x.order:0), 0);
  keep.forEach((d,i)=>{
    const hh=String(Math.min(20,9+i)).padStart(2,"0");
    /* date and sched were both missing here, so a braindumped task had no day at
       all: it sat on Today for ever, was counted as "unscheduled" on the Tasks
       page at the same time, and never rolled over properly. */
    tasks.push({id:newId(),name:d.text.charAt(0).toUpperCase()+d.text.slice(1),cat:d.cat,time:hh+":00",est:30,
                done:false,routine:d.routine,freq:"Every day",streak:0,notes:"Added from a braindump.",
                target:1,unit:"time",count:0,log:[],makeup:true,proj:d.proj||null,
                pri:"Should", due:null, blockedBy:null,
                date: d.routine ? null : TODAY_KEY, sched: d.routine ? false : true,
                order: ++ord,
                src:"braindump", added:TODAY_KEY});
  });
  $("bdText").value=""; dumpDraft=[];
  save();
  closeAll(); render(); renderProjects(); renderCategories(); renderTasks(); renderCal(); renderRoutines(); go("today");
  const inProj=keep.filter(d=>d.proj).length;
  toast(`${keep.length} added and sorted${inProj?` · ${inProj} into projects`:``}`);
}

/* ================= CARRY OVER FROM YESTERDAY =================
   Rule: only things you can actually make up get offered.
   Counters (water, meds, steps, protein) reset every day — they never carry. */
/* `missed` = how many days it's been sitting there. It does NOT go away on its own —
   only doing it or hitting ✕ clears it. */
let carryover = [];

const missLabel = n => n<=1 ? "Yesterday" : n<7 ? n+" days back" : n<14 ? "Over a week" : n+" days back";
const missTone  = n => n>=7 ? "cold" : n>=3 ? "warm" : "";

function renderCarry(){
  const box=$("carryBox");
  const list=carryover.filter(c=>c.makeup).sort((a,b)=>b.missed-a.missed);
  if(!list.length){ box.innerHTML=""; return; }
  const worst=list[0].missed;
  box.innerHTML=`<div class="carry">
    <div class="carry-head">
      <div class="k">⏮ Still owed · ${list.length}</div>
      <div class="m">${worst>=7
        ? `One of these has been sitting for ${worst} days. It stays here until you do it or clear it.`
        : `You didn't finish ${list.length} thing${list.length>1?"s":""}. Want to knock ${list.length>1?"them":"it"} out today?`}</div>
    </div>
    ${list.map(c=>{const cc=catOf(c.cat);const tone=missTone(c.missed);
      return `<div class="cr">
        <div class="icon" style="background:${cc.bg}">${cc.icon}</div>
        <div class="cm"><b>${esc(c.name)}</b>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:3px">
            <span style="color:${cc.fg};font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase">${cc.label}</span>
            <span class="miss ${tone}">${c.missed}× · ${missLabel(c.missed)}</span>
          </div>
        </div>
        <div class="crbtn take" onclick="takeCarry(${c.id})">Today</div>
        <div class="crbtn drop" onclick="dropCarry(${c.id})">✕</div>
      </div>`;}).join("")}
    <div class="carry-foot">
      <button class="b b-soft" onclick="takeAllCarry()">Move all to today</button>
    </div>
    <div class="carry-note">These roll forward every day until you finish them or hit ✕ — nothing quietly disappears.<br>
      Routines are never listed. They come back on their own next due day, and a missed one just resets its streak.</div>
  </div>`;
}
function takeCarry(id){
  const c=carryover.find(x=>x.id===id); if(!c){ toast("Already handled"); return; }
  carryover=carryover.filter(x=>x.id!==id);
  const entry={d:"Today",t:`Pulled forward after ${c.missed} missed day${c.missed>1?"s":""}.`};
  /* The original task is still there — put that one back on today rather than
     pushing a second copy of it under a new id. */
  const existing=tasks.find(t=>t.id===c.id);
  if(existing){
    existing.date=TODAY_KEY; existing.sched=true; existing.done=false;
    existing.log=[...(existing.log||[]), entry];
  } else {
    tasks.push(Object.assign({},c,{id:newId(),done:false,target:1,unit:"time",count:0,
      date:TODAY_KEY, sched:true, order:tasks.reduce((m,t)=>Math.max(m,t.order??0),0)+1,
      log:[...(c.log||[]), entry]}));
  }
  save(); render(); renderCarry(); renderTasks(); renderCal(); toast("On today's list: "+c.name);
}
function dropCarry(id){
  const c=carryover.find(x=>x.id===id); if(!c){ toast("Already cleared"); return; }
  carryover=carryover.filter(x=>x.id!==id);
  save(); renderCarry();
  toastUndo("Cleared: "+c.name, ()=>{ carryover.push(c); renderCarry(); });
}
function takeAllCarry(){ [...carryover].forEach(c=>takeCarry(c.id)); toast("All moved to today"); }

/* what happens at midnight: anything unfinished joins the debt, counters just reset */
/* ---- ARCHIVE FIRST, THEN START THE NEW DAY ----
   This existed but was never called from anywhere, so no day ever actually
   turned over: water and pill counters climbed forever, routine streaks never
   broke, and nothing joined Still Owed on its own. Everything below runs in one
   order — write the day down, then clear it. Never the other way round. */
let lastRollKey = null;      // the last date we finished rolling. saved.

/* One day's record, written before anything is cleared. */
function archiveDay(key){
  const kcal = meals.today.reduce((a,m)=>a+(+m.kcal||0),0);
  const prot = meals.today.reduce((a,m)=>a+(+m.p||0),0);
  if(meals.today.length || kcal){
    meals.hist = meals.hist || [];
    if(!meals.hist.some(h=>h.d===key)){
      meals.hist.push({ d:key, ago:0, kcal, p:prot,
                        items: meals.today.map(m=>({n:m.n,kcal:m.kcal,p:m.p,slot:m.slot})) });
    }
    if(meals.hist.length>120) meals.hist.shift();
  }
  // counters go into the health record so the graphs have real history
  try{
    tasks.filter(t=>t.routine && isCounter(t) && t.count>0).forEach(t=>{
      HEALTH.putMeasurement({ type: /water/i.test(t.name) ? "waterOz"
                                  : /step/i.test(t.name) ? "steps" : "counter:"+t.name,
        value:t.count, unit:t.unit||"", day:key, t:key+"T23:59:00", src:"calculated" });
    });
    if(kcal) HEALTH.putMeasurement({type:"caloriesIn",value:kcal,unit:"kcal",day:key,t:key+"T23:59:00",src:"calculated"});
    if(prot) HEALTH.putMeasurement({type:"proteinG",value:prot,unit:"g",day:key,t:key+"T23:59:00",src:"calculated"});
    HEALTH.summarise(key).then(r=>HEALTH.putDaily(r));
  }catch(e){}
}

/* Clear the board for a new day. Only ever runs after archiveDay. */
/* `endedKey` is the day that just finished. This used to test onToday(), which
   only worked by accident while TODAY_KEY was frozen at page load: now that the
   date is kept current, "on today" means the new day, and yesterday's unfinished
   tasks would never be picked up at all. Ask about the day that ended. */
function startNewDay(endedKey){
  const ended = endedKey || lastRollKey || TODAY_KEY;
  const wasOnThatDay = t => t.date ? t.date===ended : t.sched!==false;
  tasks.filter(t=>!t.routine && wasOnThatDay(t) && !t.done && t.makeup!==false).forEach(t=>{
    /* Matched on name before, so two different tasks both called "Follow up"
       collapsed into one entry and the second one's notes, project and priority
       were thrown away. Tasks are matched on id, which is what identifies them. */
    const ex=carryover.find(c=>c.id===t.id);
    if(ex){ ex.missed++; Object.assign(ex, t, {missed:ex.missed}); }
    else carryover.push(Object.assign({},t,{missed:1}));
    /* Take it off the day it missed. Without this the task stayed on Today as
       well as appearing in Still Owed, and pulling it forward then created a
       second copy of the same task. */
    t.date=null; t.sched=false;
  });
  tasks.filter(t=>t.routine).forEach(t=>{
    // was it actually due on the day that just ended, and not skipped on purpose?
    if(!t.done && !t.paused && onDay(t, ended)) t.streak=0;   // a missed routine breaks the run
    t.count=0; t.done=false;
  });
  meals.today=[];
  dayNote={text:"",tags:[]};
  prepDone={};
}

/* Kept for anything that still calls it by the old name. */
function rollOverDay(){ const k=lastRollKey||ymd(new Date()); archiveDay(k); startNewDay(k); render(); renderCarry(); }

/* The thing that actually drives it. Safe to call as often as you like — it does
   nothing unless the date has genuinely moved on. Handles the app being left open
   through midnight, closed overnight, or shut for a week. */
function checkRollover(){
  const today = ymd(new Date());
  /* Bring TODAY_KEY (and the date in the header) up to date first — everything
     below, and every date test in the rest of the app, reads it. */
  const dateMoved = refreshToday();
  if(!lastRollKey){ lastRollKey = today; save(); return false; }
  if(lastRollKey === today){
    /* Same day as the last roll, but the clock may still have crossed midnight
       while the app sat open on a screen drawn yesterday. Repaint if so. */
    if(dateMoved){ render(); renderCarry(); renderCal(); renderTasks(); renderOverview(); }
    return false;
  }
  if(today < lastRollKey){
    /* The clock went backwards — a timezone change flying west, or the phone
       correcting itself. Don't roll, don't archive, just re-anchor. */
    lastRollKey = today; save(); return false;
  }
  // archive the day that just ended, then step forward through anything missed
  const endedKey = lastRollKey;
  archiveDay(endedKey);
  let gap = 0, cur = new Date(lastRollKey+"T12:00:00");
  const end = new Date(today+"T12:00:00");
  while(cur < end && gap < 400){ cur.setDate(cur.getDate()+1); gap++; }
  startNewDay(endedKey);
  lastRollKey = today;
  save();
  render(); renderCarry(); renderMeals && renderMeals(); renderTracker && renderTracker();
  if(gap>1) toast(`Welcome back — ${gap} days rolled over, nothing lost`);
  return true;
}

/* ================= HEALTH DATA LAYER =================
   Health readings live in IndexedDB, not in the big localStorage blob. A year of
   heart-rate samples is tens of thousands of rows — putting those in the same
   JSON as your tasks would make every save slow and eventually blow the storage
   limit. Momentum's own state is untouched by anything in here.

   Three stores:
     measurements  a timestamped reading   {id, type, value, unit, t, day, src}
     events        a point in time         {id, kind, name, amount, unit, t, day, note}
     daily         one rolled-up row a day {date, steps, restingHR, ...}

   Every record carries where it came from, per the data-accuracy rule:
   healthconnect | manual | ai-meal | imported | calculated  */
const HEALTH = (() => {
  const DB="momentum-health", VER=1;
  const SRC=["healthconnect","manual","ai-meal","imported","calculated"];
  let _db=null, _broken=false;

  function open(){
    if(_db) return Promise.resolve(_db);
    if(_broken) return Promise.resolve(null);
    return new Promise(res=>{
      let req;
      try{ req=indexedDB.open(DB,VER); }catch(e){ _broken=true; return res(null); }
      req.onupgradeneeded=e=>{
        const db=e.target.result;
        if(!db.objectStoreNames.contains("measurements")){
          const m=db.createObjectStore("measurements",{keyPath:"id"});
          m.createIndex("day","day"); m.createIndex("type","type");
          m.createIndex("type_day",["type","day"]);
        }
        if(!db.objectStoreNames.contains("events")){
          const ev=db.createObjectStore("events",{keyPath:"id"});
          ev.createIndex("day","day"); ev.createIndex("kind","kind");
          ev.createIndex("kind_day",["kind","day"]);
        }
        if(!db.objectStoreNames.contains("daily")) db.createObjectStore("daily",{keyPath:"date"});
      };
      req.onsuccess=e=>{ _db=e.target.result; res(_db); };
      req.onerror=()=>{ _broken=true; res(null); };   // private mode etc — app carries on
    });
  }
  function tx(store, mode){
    return open().then(db=>{
      if(!db) return null;
      try{ return db.transaction(store,mode).objectStore(store); }catch(e){ return null; }
    });
  }
  const wrap = r => new Promise(res=>{ if(!r) return res(null);
    r.onsuccess=()=>res(r.result); r.onerror=()=>res(null); });

  /* A stable id keeps Health Connect from landing the same reading twice. If the
     source gives us its own id we use it; otherwise the type+timestamp is enough
     to spot a duplicate. */
  const mid = m => m.srcId ? `hc:${m.srcId}` : `${m.type}:${m.t}`;
  const eid = e => e.srcId ? `hc:${e.srcId}` : `${e.kind}:${e.t}:${(e.name||"").slice(0,20)}`;

  /* v53: t is stored in UTC, so t.slice(0,10) filed anything logged after
     6pm in Colorado under tomorrow's date — it vanished from Today. */
  const localDayOf = t => { const d=new Date(t); return isNaN(d) ? String(t).slice(0,10) : ymd(d); };
  async function putMeasurement(m){
    const st=await tx("measurements","readwrite"); if(!st) return null;
    const t = m.t || new Date().toISOString();
    const rec={ id: mid({...m,t}), type:m.type, value:+m.value, unit:m.unit||"",
                t, day: m.day || localDayOf(t),
                src: SRC.includes(m.src)?m.src:"manual",
                ...(m.extra?{extra:m.extra}:{}) };
    await wrap(st.put(rec));
    return rec;
  }
  async function putEvent(e){
    const st=await tx("events","readwrite"); if(!st) return null;
    const t = e.t || new Date().toISOString();
    const rec={ id: eid({...e,t}), kind:e.kind, name:e.name||"", amount:e.amount??null,
                unit:e.unit||"", t, day: e.day || localDayOf(t),
                note:e.note||"", src: SRC.includes(e.src)?e.src:"manual",
                ...(e.extra?{extra:e.extra}:{}) };
    await wrap(st.put(rec));
    return rec;
  }
  async function byDay(store, day){
    const st=await tx(store,"readonly"); if(!st) return [];
    return (await wrap(st.index("day").getAll(day))) || [];
  }
  async function range(store, from, to){
    const st=await tx(store,"readonly"); if(!st) return [];
    const all=(await wrap(st.getAll()))||[];
    return all.filter(r=>r.day>=from && r.day<=to);
  }
  async function putDaily(row){
    const st=await tx("daily","readwrite"); if(!st) return null;
    await wrap(st.put(row)); return row;
  }
  async function getDaily(date){
    const st=await tx("daily","readonly"); if(!st) return null;
    return await wrap(st.get(date));
  }
  async function dailyRange(from,to){
    const st=await tx("daily","readonly"); if(!st) return [];
    const all=(await wrap(st.getAll()))||[];
    return all.filter(r=>r.date>=from && r.date<=to).sort((a,b)=>a.date.localeCompare(b.date));
  }
  async function count(store){
    const st=await tx(store,"readonly"); if(!st) return 0;
    return (await wrap(st.count())) || 0;
  }
  async function wipe(){
    for(const s of ["measurements","events","daily"]){
      const st=await tx(s,"readwrite"); if(st) await wrap(st.clear());
    }
  }

  /* The one shape the AI is ever given. Built from what's actually there —
     anything the device didn't record is simply absent, never zero. */
  async function summarise(date){
    const ms=await byDay("measurements",date);
    const evs=await byDay("events",date);
    const pick=t=>ms.filter(m=>m.type===t).map(m=>m.value);
    const avg=a=>a.length?Math.round(a.reduce((x,y)=>x+y,0)/a.length):undefined;
    const hr=pick("heartRate");
    const bp=ms.filter(m=>m.type==="bloodPressure");
    const out={ date };
    const set=(k,v)=>{ if(v!==undefined && v!==null && !(Array.isArray(v)&&!v.length)) out[k]=v; };
    set("steps", pick("steps").length?Math.max(...pick("steps")):undefined);
    set("restingHeartRate", avg(pick("restingHeartRate")));
    set("averageHeartRate", avg(hr));
    set("heartRateMin", hr.length?Math.min(...hr):undefined);
    set("heartRateMax", hr.length?Math.max(...hr):undefined);
    set("bloodPressureReadings", bp.map(b=>({sys:b.value, dia:(b.extra&&b.extra.dia)||null, t:b.t})));
    if(bp.length) set("averageBloodPressure",
      {sys:avg(bp.map(b=>b.value)), dia:avg(bp.map(b=>(b.extra&&b.extra.dia)||0).filter(Boolean))});
    set("weight", pick("weight").slice(-1)[0]);
    set("sleepHours", pick("sleepHours").slice(-1)[0]);
    set("stress", pick("stress").length?Math.round(pick("stress").reduce((a,b)=>a+b,0)/pick("stress").length*10)/10:undefined);
    set("activeMinutes", pick("activeMinutes").reduce((a,b)=>a+b,0)||undefined);
    set("runningMiles", +(pick("distanceMiles").reduce((a,b)=>a+b,0)).toFixed(2)||undefined);
    set("caloriesBurned", pick("caloriesBurned").reduce((a,b)=>a+b,0)||undefined);
    set("hrv", avg(pick("hrv")));
    set("bloodOxygen", avg(pick("bloodOxygen")));
    set("respiratoryRate", avg(pick("respiratoryRate")));
    const byKind=k=>evs.filter(e=>e.kind===k)
      .map(e=>({name:e.name, amount:e.amount, unit:e.unit, t:e.t, ...(e.note?{note:e.note}:{})}));
    set("medications", byKind("med"));
    set("caffeine", byKind("caffeine"));
    set("supplements", byKind("supplement"));
    set("symptoms", evs.filter(e=>e.kind==="symptom")
      .map(e=>({name:e.name, severity:e.amount, t:e.t, ...(e.note?{note:e.note}:{})})));
    const caf=byKind("caffeine").reduce((a,c)=>a+(+c.amount||0),0);
    if(caf) out.caffeineMg=caf;
    return out;
  }

  return { open, putMeasurement, putEvent, byDay, range, putDaily, getDaily,
           dailyRange, summarise, count, wipe, SOURCES:SRC };
})();

/* ================= HEALTH: LOGGING & DASHBOARD =================
   Everything you tap here becomes a record in the health store, never in the big
   localStorage blob. Presets exist so a daily dose is one tap, not a form. */
let hlPrefs = {
  /* Deliberately generic. Nothing in this app needs the brand name of a
     prescription, and it shows up on screen, in exports and in AI payloads. */
  /* dailyMax is YOUR limit, not a medical opinion. The app only ever reports
     your own number back to you — it never suggests changing a dose. */
  meds:[{name:"Medication", amount:15, unit:"mg", dailyMax:30}],
  caffeine:[{name:"Coffee", amount:120, unit:"mg", size:"12 oz"},
            {name:"Energy drink", amount:200, unit:"mg", size:"16 oz"},
            {name:"Pre-workout", amount:200, unit:"mg", size:"1 scoop"},
            {name:"Tea", amount:47, unit:"mg", size:"8 oz"}],
  supps:[{name:"Creatine", amount:5, unit:"g"},
         {name:"L-citrulline", amount:6, unit:"g"},
         {name:"Beta-alanine", amount:3.2, unit:"g"},
         {name:"Taurine", amount:2, unit:"g"},
         {name:"HMB", amount:3, unit:"g"},
         {name:"Magnesium", amount:400, unit:"mg"},
         {name:"Multivitamin", amount:1, unit:"serving"}],
  waterSizes:[8,12,16,24],
  waterGoalOz:120
};
const SYMPTOMS=["Dizzy","Lightheaded","Headache","Heart racing","Palpitations","Tired",
                "Weak","Shaky","Short of breath","Nausea","Poor focus","Anxious"];

let hlToday = { measurements:[], events:[], summary:{} };

const clockOf = iso => new Date(iso).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"});

async function refreshHealthToday(){
  const day=ymd(new Date());
  hlToday.measurements = await HEALTH.byDay("measurements", day);
  hlToday.events       = await HEALTH.byDay("events", day);
  hlToday.summary      = await HEALTH.summarise(day);
  await HEALTH.putDaily(hlToday.summary);      // today's rollup stays current
}

/* Personal baseline over the last N days, from the daily rollups. Generic ranges
   don't tell you much; what your own numbers usually look like does. */
async function baseline(metric, days){
  const to=ymd(new Date()), d=new Date(); d.setDate(d.getDate()-days);
  const rows=await HEALTH.dailyRange(ymd(d), to);
  const vals=rows.map(r=>r[metric]).filter(v=>typeof v==="number");
  if(vals.length<3) return null;         // not enough to mean anything yet
  return { avg: Math.round(vals.reduce((a,b)=>a+b,0)/vals.length*10)/10, n: vals.length };
}

async function renderHealth(){
  await refreshHealthToday();
  const s=hlToday.summary, ev=hlToday.events;
  const water=tasks.find(t=>t.routine && /water/i.test(t.name));
  const steps=tasks.find(t=>t.routine && /step/i.test(t.name));
  const kcal=meals.today.reduce((a,m)=>a+(+m.kcal||0),0);
  const prot=meals.today.reduce((a,m)=>a+(+m.p||0),0);
  const meds=ev.filter(e=>e.kind==="med");
  const caf=ev.filter(e=>e.kind==="caffeine");
  const cafMg=caf.reduce((a,c)=>a+(+c.amount||0),0);
  const symp=ev.filter(e=>e.kind==="symptom");
  const todayRun=cardio.filter(c=>c.d===ymd(new Date()));
  const rhrBase=await baseline("restingHeartRate",30);

  /* A tile only appears when there's something in it. Nothing is shown as zero
     just because the device didn't report it. */
  const tile=(label,val,sub,tone)=>val==null?"":`<div class="htile">
      <b style="color:${tone||'var(--ink)'}">${val}</b>
      <span>${label}</span>${sub?`<em>${sub}</em>`:``}</div>`;

  $("hlDate").textContent=new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"});
  /* Over your own limit is the one thing on this page that gets to shout. It sits
     above everything else so you can't scroll past it. It states the number and
     stops — no advice about what to do, that's between you and your doctor. */
  const capAlerts=hlPrefs.meds.map(m=>({m, s:medDayState(m,ev)})).filter(x=>x.s.over);
  $("hlBody").innerHTML=`
    ${capAlerts.map(({m,s})=>`<div class="card capalert">
      <div class="card-pad">
        <b>Over your daily limit — ${esc(m.name)}</b>
        <p>${s.total} ${esc(m.unit)} logged today. Your limit is ${m.dailyMax} ${esc(m.unit)},
           so that's <b>${s.overBy} ${esc(m.unit)} over</b> across ${s.count} dose${s.count===1?"":"s"}.</p>
        <p class="thin">Momentum records what you logged. If a time is wrong you can tap it in
           today's log and fix it — and anything about the dose itself is a conversation for your doctor.</p>
      </div>
    </div>`).join("")}
    <div class="card">
      <div class="card-head"><span class="card-title">Today</span>
        <span class="link">${(n=>`${n} ${n===1?"thing":"things"} logged`)(hlToday.measurements.length+ev.length+(water&&water.count?1:0)+(kcal?1:0))}</span></div>
      <div class="htiles">
        ${tile("Steps", steps?steps.count.toLocaleString():(s.steps?s.steps.toLocaleString():null), steps?`of ${steps.target.toLocaleString()}`:"")}
        ${tile("Water", water?`${water.count}`:null, water?`of ${water.target} ${water.unit||"oz"}`:"", "#4fc3f7")}
        ${tile("Protein", prot?prot:null, `of ${meals.pTarget} g`, "#4fd6a5")}
        ${tile("Calories", kcal?kcal.toLocaleString():null, `of ${meals.kcalTarget.toLocaleString()}`, "#ff9d4d")}
        ${tile("Sleep", s.sleepHours?`${Math.floor(s.sleepHours)}h ${Math.round((s.sleepHours%1)*60)}m`:null,"","#a78bfa")}
        ${tile("Resting HR", s.restingHeartRate||null, rhrBase?`30-day avg ${rhrBase.avg}`:"", "#ff5f7e")}
        ${tile("Stress", s.stress!=null?s.stress:null, "of 5 · today's average", "#ffb26b")}
        ${tile("Last BP", s.averageBloodPressure?`${s.averageBloodPressure.sys}/${s.averageBloodPressure.dia}`:null,"","#ff5f7e")}
        ${tile("Caffeine", cafMg?`${cafMg}`:null,"mg","#c9a227")}
        ${tile("Weight", s.weight||null,"lb")}
        ${tile("Medication", meds.length?"✓":null, meds.map(m=>clockOf(m.t)).join(", "), "#4fd6a5")}
        ${tile("Workout", todayRun.length?`${todayRun.reduce((a,c)=>a+c.mi,0).toFixed(1)} mi`:null,"","#ff5f7e")}
      </div>
      ${(!hlToday.measurements.length && !ev.length && !kcal) ? `<div class="wk-note" style="padding:2px 16px 14px">
        Nothing logged today yet. Use the buttons below — most of them are one tap.</div>`:``}
    </div>

    <div class="card">
      <div class="card-head"><span class="card-title">Make sense of it</span>
        <span class="vtag" style="background:rgba(52,168,131,.16);color:#4fd6a5;border:1px solid rgba(52,168,131,.4)">PRIVATE AI</span></div>
      <div class="wk-row">
        <button class="b b-violet" onclick="openAskHealth()">Ask Health</button>
        <button class="b b-blue" onclick="weeklyHealthReview()">Weekly review</button>
      </div>
      <div class="wk-row" style="padding-top:0">
        <button class="b b-ghost" style="width:100%" onclick="renderSignals()">🔍 Health Signals — what goes with what</button>
      </div>
      <div class="wk-row" style="padding-top:0">
        <button class="b b-ghost" onclick="renderTimeline()">Timeline</button>
        <button class="b b-ghost" onclick="renderNotifSettings()">Notifications</button>
      </div>
      <div class="wk-row" style="padding-top:0">
        <button class="b b-ghost" style="width:100%" onclick="openHealthPrivacy()">Privacy &amp; export</button>
      </div>
      <div class="wk-note" id="hlPing" style="padding:10px 16px 4px">
        ${healthAIState.ok===true?`Working — using ${esc(healthAIState.model||"your site's AI")}.`
         :healthAIState.ok===false?`Not working: ${esc(healthAIState.lastError)}`
         :`Health AI runs on your own server, separate from the rest of Momentum.`}</div>
      <div class="wk-row" style="padding-top:6px">
        <button class="b b-ghost" style="width:100%" onclick="healthPing()">Is Health AI working?</button>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><span class="card-title">Log something</span><span class="link">One tap where it can be</span></div>
      <div class="hquick">
        ${hlPrefs.meds.map((m,i)=>{
          const s=medDayState(m,ev);
          return `<div class="qbtn med${s.over?" over":s.at?" atcap":""}">
          <b>${esc(m.name)}</b><span>${m.amount} ${esc(m.unit)} is a full dose</span>
          ${m.dailyMax?`<div class="cap ${s.over?"bad":s.at?"warn":""}">
            <div class="capbar"><i style="width:${Math.min(100,s.pct)}%"></i></div>
            <div class="capnum">${s.total} of ${m.dailyMax} ${esc(m.unit)} today${
              s.over?` · <b>${s.overBy} over</b>`:s.at?" · at your limit":""}</div>
          </div>`:``}
          <div class="dose">
            <div class="stepbtn" onclick="dmStep('med',${i},-0.5)">−</div>
            <div class="amt" id="dose-med-${i}">${m.amount} ${esc(m.unit)}<small>full dose</small></div>
            <div class="stepbtn plus" onclick="dmStep('med',${i},0.5)">+</div>
          </div>
          <button class="doselog" onclick="logMedPreset(${i})">LOG IT</button>
          <div class="caplink" onclick="editMedCap(${i})">Daily limit: ${m.dailyMax?m.dailyMax+" "+esc(m.unit):"none"} · change</div>
        </div>`;}).join("")}
        <div class="qbtn" onclick="openHealthSheet('caffeine')"><b>Caffeine</b><span>Coffee, energy…</span></div>
        <div class="qbtn" onclick="openHealthSheet('water')"><b>Water</b><span>+8 · +12 · +16 · +24</span></div>
        <div class="qbtn" onclick="openHealthSheet('supp')"><b>Supplements</b><span>${hlPrefs.supps.length} saved</span></div>
        <div class="qbtn warn" onclick="openHealthSheet('symptom')"><b>Symptom</b><span>How you feel</span></div>
        <div class="qbtn" onclick="openHealthSheet('bp')"><b>Blood pressure</b><span>Type a reading</span></div>
        <div class="qbtn" onclick="openHealthSheet('body')"><b>Weight &amp; body</b><span>Weight, waist, body fat</span></div>
        <div class="qbtn" onclick="openHealthSheet('sleep')"><b>Sleep</b><span>Last night</span></div>
        <div class="qbtn" onclick="openHealthSheet('stress')"><b>Stress</b><span>1 tap · 1 to 5</span></div>
      </div>
    </div>

    ${ev.length?`<div class="card">
      <div class="card-head"><span class="card-title">Today's log</span><span class="link">${ev.length}</span></div>
      ${[...ev].sort((a,b)=>a.t.localeCompare(b.t)).map(e=>`<div class="lg">
        <div class="icon" style="background:${EVCOL[e.kind]||'#1a212c'}22;font-size:15px">${EVICON[e.kind]||"•"}</div>
        <div class="lm"><b>${esc(e.name)}${e.amount!=null&&e.kind!=="symptom"?` · ${e.amount}${e.unit?" "+esc(e.unit):""}`:``}</b>
          <span><span class="tedit" onclick="editEventTime('${e.id}')">${clockOf(e.t)} ✎</span>${e.kind==="symptom"&&e.amount?` · severity ${e.amount}/5`:``}${e.note?` · ${esc(e.note)}`:``}</span></div>
        <div class="lx" onclick="delHealthEvent('${e.id}')">✕</div>
      </div>`).join("")}
    </div>`:``}

    ${symp.length?`<div class="card" style="border-color:rgba(255,157,77,.35)">
      <div class="wk-note" style="padding:12px 16px">You logged ${symp.length} symptom${symp.length===1?"":"s"} today.
      Momentum records patterns — it doesn't diagnose. Anything severe, sudden, or that keeps coming back
      is worth taking to a doctor rather than an app.</div>
    </div>`:``}
  `;
}
const EVICON={med:"💊",caffeine:"☕",supplement:"🧪",symptom:"⚠️"};
const EVCOL ={med:"#4fd6a5",caffeine:"#c9a227",supplement:"#a78bfa",symptom:"#ff9d4d"};

/* ---- dose stepper -------------------------------------------------------
   Half a dose is a real thing, so the step is 0.5 rather than 1 and it never
   drops below a half. Painting is done in place: re-rendering the page on every
   tap is what made the workout weight box impossible to type in. */
let doseMult = {};
const dmKey = (kind,i) => kind+":"+i;
const dmGet = (kind,i) => doseMult[dmKey(kind,i)] || 1;
const doseList = kind => kind==="med" ? hlPrefs.meds
                       : kind==="caf" ? hlPrefs.caffeine
                       : hlPrefs.supps;
const dmAmount = (base,mult) => Math.round((base||0)*mult*1000)/1000;
const dmLabel  = x => x===0.5 ? "half" : x===1 ? "full" : x+"×";

function dmStep(kind,i,d){
  const k=dmKey(kind,i);
  const v=Math.round(((doseMult[k]||1)+d)*2)/2;          // snap to halves
  doseMult[k]=Math.min(10, Math.max(0.5, v));
  paintDose(kind,i);
}
function dmReset(kind,i){ delete doseMult[dmKey(kind,i)]; }

function paintDose(kind,i){
  const el=document.getElementById("dose-"+kind+"-"+i);
  if(!el) return;
  const p=doseList(kind)[i]; if(!p) return;
  const m=dmGet(kind,i);
  const txt=dmAmount(p.amount,m)+(p.unit?" "+p.unit:"");
  el.innerHTML = el.dataset.plain ? esc(txt)
    : `${esc(txt)}<small>${dmLabel(m)} dose</small>`;
}

/* Health and Today were keeping separate books — water bumped the routine
   counter, medication and supplements didn't. Now everything goes through here.
   \b guards matter: /med/ alone would happily match "Meditation". */
function bumpRoutine(match, n){
  const t=tasks.find(t=>t.routine && match.test(t.name||""));
  if(!t) return null;
  t.count=Math.max(0, Math.round(((t.count||0)+n)*100)/100);
  t.done = t.target ? t.count>=t.target : t.count>0;
  return t;
}
const MED_RE  = /\bmed(s|icine|ication)?\b|\bdose\b|\bpill/i;
/* Some routines are a goal you want to beat (water, protein) and some are a
   ceiling you don't want to cross. Only the second kind turns red. */
const isCapped = t => !!t && (t.hardCap===true || MED_RE.test(t.name||""));
/* Above this many, dots stop being readable and start being a wall. */
const PIP_MAX = 12;
/* Tapping + eight thousand times isn't a plan. Big targets move in useful jumps. */
const stepFor = t => t.target>2000 ? 500 : t.target>200 ? 50 : t.target>PIP_MAX ? 5 : 1;
const SUPP_RE = /\bsupp(lement)?s?\b|\bvitamin/i;
const CAF_RE  = /\bcaffeine\b|\bcoffee\b/i;

/* How much of one medication is on the books for a given day, against the limit
   you set for yourself. Matching is by name so two different medications keep
   separate limits. */
function medDayState(m, events){
  const rows=(events||[]).filter(e=>e.kind==="med" && (e.name||"")===m.name);
  const total=Math.round(rows.reduce((a,e)=>a+(+e.amount||0),0)*100)/100;
  const max=+m.dailyMax||0;
  return { total, count:rows.length, max,
           pct: max? (total/max)*100 : 0,
           at:   max? total===max : false,
           over: max? total>max   : false,
           overBy: max? Math.round((total-max)*100)/100 : 0 };
}

async function editMedCap(i){
  const m=hlPrefs.meds[i]; if(!m) return;
  const v=await askText(`Daily limit for ${m.name}`,
    `In ${m.unit}. Two ${m.amount} ${m.unit} doses is ${m.amount*2} ${m.unit}. Leave empty for no limit.`,
    m.dailyMax==null?"":String(m.dailyMax));
  if(v===null) return;
  const n=parseFloat(v);
  m.dailyMax = (v.trim()==="" || !Number.isFinite(n) || n<=0) ? null : n;
  save(); renderHealth();
  toast(m.dailyMax ? `Limit set to ${m.dailyMax} ${m.unit} a day` : "Limit removed");
}

async function logMedPreset(i){
  const m=hlPrefs.meds[i]; if(!m) return;
  const mult=dmGet("med",i), amt=dmAmount(m.amount,mult);
  /* Warn at the moment it matters, with the real numbers — then log it anyway if
     that's what happened. A record that quietly refuses inconvenient entries is
     worse than useless. */
  const st=medDayState(m, hlToday.events);
  if(st.max && st.total+amt > st.max){
    const after=Math.round((st.total+amt)*100)/100;
    if(!await ask(`That puts you at ${after} ${m.unit} today.\n\n`
      + `Your daily limit is ${st.max} ${m.unit} — ${Math.round((after-st.max)*100)/100} ${m.unit} over.`,
      "Log it anyway")) return;
  }
  await HEALTH.putEvent({kind:"med", name:m.name, amount:amt, unit:m.unit, src:"manual"});
  const t=bumpRoutine(MED_RE, mult);
  dmReset("med",i);
  save(); render(); renderTracker(); renderHealth();
  toast(`${m.name} ${amt}${m.unit} logged`
    + (t ? ` · ${t.count} of ${t.target} today` : "")
    + ` at ${new Date().toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"})}`);
}
/* ---- fixing the time on something you logged late ------------------------
   You take it at 11 and remember at 1. The record should say 11.
   The stored id is derived from the timestamp, so moving the time means writing
   a new record and dropping the old one — not editing in place. */
let _editEv=null;
function editEventTime(id){
  const e=(hlToday.events||[]).find(x=>x.id===id);
  if(!e){ toast("Can't find that entry"); return; }
  _editEv=e;
  const d=new Date(e.t);
  const hh=String(d.getHours()).padStart(2,"0"), mm=String(d.getMinutes()).padStart(2,"0");
  $("hlSheetBody").innerHTML=`<h2>When did you take it?</h2>
    <p style="font-size:12.5px;color:var(--ink3);margin:6px 0 0">
      ${esc(e.name)}${e.amount!=null?` · ${e.amount}${e.unit?" "+esc(e.unit):""}`:""} —
      logged at ${clockOf(e.t)}.</p>
    <div class="chips" style="margin-top:12px">
      <span class="chip" onclick="evtShift(-15)">15 min earlier</span>
      <span class="chip" onclick="evtShift(-30)">30 min earlier</span>
      <span class="chip" onclick="evtShift(-60)">1 hour earlier</span>
      <span class="chip" onclick="evtShift(-120)">2 hours earlier</span>
    </div>
    <label class="f" style="margin-top:14px">Or set it exactly</label>
    <input class="f" id="evTime" type="time" value="${hh}:${mm}">
    <div class="btns"><button class="b b-ghost" onclick="closeAll()">Cancel</button>
      <button class="b b-primary" onclick="saveEventTime($('evTime').value)">Save</button></div>`;
  openSheet("hlSheet");
}
function evtShift(mins){
  const el=$("evTime"); if(!el||!_editEv) return;
  const d=new Date(_editEv.t); d.setMinutes(d.getMinutes()+mins);
  el.value=String(d.getHours()).padStart(2,"0")+":"+String(d.getMinutes()).padStart(2,"0");
  saveEventTime(el.value);
}
async function saveEventTime(hhmm){
  const e=_editEv; if(!e) return;
  const m=/^(\d{1,2}):(\d{2})$/.exec(String(hhmm||""));
  if(!m){ toast("Need a time like 11:00"); return; }
  const d=new Date(e.t); d.setHours(+m[1], +m[2], 0, 0);
  if(d.getTime() > Date.now()+60000){ toast("That's in the future"); return; }
  const t=d.toISOString();
  const st=await HEALTH.open();
  if(st){ try{ st.transaction("events","readwrite").objectStore("events").delete(e.id); }catch(err){} }
  await HEALTH.putEvent({ kind:e.kind, name:e.name, amount:e.amount, unit:e.unit,
                          note:e.note, src:e.src, t, day:ymd(d) });
  _editEv=null; closeAll();
  setTimeout(renderHealth,150);
  toast(`Moved to ${clockOf(t)}`);
}

async function delHealthEvent(id){
  const st=await HEALTH.open(); if(!st) return;
  try{ st.transaction("events","readwrite").objectStore("events").delete(id); }catch(e){}
  setTimeout(renderHealth,150); toast("Removed");
}

function openHealthSheet(kind){
  const B=$("hlSheetBody");
  /* v53: stress. Samsung doesn't share its stress score with other apps, so this
     is one tap from you — and the watch inbox accepts "stress" if a way turns up. */
  if(kind==="stress"){
    const faces=[["1","😌","Calm"],["2","🙂","Fine"],["3","😐","Some"],["4","😣","High"],["5","😫","Maxed"]];
    B.innerHTML=`<h2>How stressed are you right now?</h2>
      <div class="stressrow">${faces.map(f=>`<div class="stressbtn" onclick="logStress(${f[0]})"><b>${f[1]}</b><span>${f[0]} · ${f[2]}</span></div>`).join("")}</div>
      <div class="wk-note" style="padding:12px 0 0">One tap saves it. Log it a few times a day and Health Signals can
        start showing what goes with high-stress days (sleep, caffeine, workouts).</div>
      <div class="btns"><button class="b b-ghost" style="width:100%" onclick="closeAll()">Close</button></div>`;
    closeAll(); openSheet("hlSheet"); return;
  }
  /* Each saved item gets its own − / + so you can take half of something, or two
     of it, without editing the preset. */
  const chips=(list,fn,kind)=>`<div class="chipwrap">`+list.map((x,i)=>`<div class="chipdose">
      <div class="stepbtn" onclick="dmStep('${kind}',${i},-0.5)">−</div>
      <div class="nm">${esc(x.name)}</div>
      <div class="amt" id="dose-${kind}-${i}" data-plain="1">${x.amount}${esc(x.unit||"")}</div>
      <div class="stepbtn plus" onclick="dmStep('${kind}',${i},0.5)">+</div>
      <button class="add" onclick="${fn}(${i})">Log</button>
    </div>`).join("")+`</div>`;
  if(kind==="caffeine"){
    B.innerHTML=`<h2>Caffeine</h2>
      <p style="font-size:12.5px;color:var(--ink3);margin:6px 0 0">Tap a saved one, or add your own below.</p>
      <div class="chips" style="margin-top:12px">${chips(hlPrefs.caffeine,"logCaffeinePreset","caf")}</div>
      <label class="f" style="margin-top:14px">Something else</label>
      <div class="two">
        <div style="flex:2"><input class="f" id="hcName" placeholder="e.g. Cold brew"></div>
        <div style="flex:1"><input class="f" id="hcMg" type="number" inputmode="numeric" placeholder="mg"></div>
      </div>
      <input class="f" id="hcSize" placeholder="Size — optional, e.g. 16 oz" style="margin-top:8px">
      <div class="btns"><button class="b b-ghost" onclick="closeAll()">Cancel</button>
        <button class="b b-primary" onclick="logCaffeineCustom()">Log it</button></div>`;
  }
  if(kind==="water"){
    const w=tasks.find(t=>t.routine && /water/i.test(t.name));
    B.innerHTML=`<h2>Water</h2>
      <p style="font-size:12.5px;color:var(--ink3);margin:6px 0 0">
        ${w?`${w.count} of ${w.target} ${w.unit||"oz"} so far today.`:"No water routine yet — logging one will make it."}</p>
      <div class="chips" style="margin-top:14px">
        ${hlPrefs.waterSizes.map(oz=>`<span class="chip" onclick="logWater(${oz})">+${oz} oz</span>`).join("")}
      </div>
      ${w && /glass|cup/i.test(w.unit||"") ? `<div class="wk-note" style="padding:12px 0 0">
        Your water routine counts <b>${esc(w.unit)}</b>, not ounces — so ounces get converted
        at ${OZ_PER_GLASS} oz each. Cleaner to just switch it over.</div>
        <div class="btns" style="margin-top:9px"><button class="b b-blue" style="width:100%"
          onclick="switchWaterToOz()">Track water in ounces instead</button></div>`:``}
      <label class="f" style="margin-top:14px">A different amount</label>
      <div class="dose">
        <div class="stepbtn" onclick="hwStep(-4)">−</div>
        <div style="flex:1"><input class="f" id="hwOz" type="number" inputmode="numeric" placeholder="ounces" style="text-align:center"></div>
        <div class="stepbtn plus" onclick="hwStep(4)">+</div>
      </div>
      <div class="two" style="margin-top:8px">
        <div style="flex:1"><button class="b b-blue" style="width:100%" onclick="logWater(+$('hwOz').value)">Add</button></div>
        <div style="flex:1"><button class="b b-ghost" style="width:100%" onclick="logWater(-Math.abs(+$('hwOz').value))">Take off</button></div>
      </div>
      <div class="btns"><button class="b b-ghost" style="width:100%" onclick="closeAll()">Done</button></div>`;
  }
  if(kind==="supp"){
    B.innerHTML=`<h2>Supplements</h2>
      <p style="font-size:12.5px;color:var(--ink3);margin:6px 0 0">Tap what you took. Momentum tracks it —
        it won't tell you to change a dose.</p>
      <div class="chips" style="margin-top:12px">${chips(hlPrefs.supps,"logSuppPreset","supp")}</div>
      <label class="f" style="margin-top:14px">Something else</label>
      <div class="two">
        <div style="flex:2"><input class="f" id="hsName" placeholder="Name"></div>
        <div style="flex:1"><input class="f" id="hsAmt" type="number" inputmode="decimal" placeholder="amount"></div>
        <div style="flex:1"><input class="f" id="hsUnit" placeholder="g / mg"></div>
      </div>
      <div class="btns"><button class="b b-ghost" onclick="closeAll()">Cancel</button>
        <button class="b b-primary" onclick="logSuppCustom()">Log it</button></div>`;
  }
  if(kind==="symptom"){
    B.innerHTML=`<h2>How are you feeling?</h2>
      <p style="font-size:12.5px;color:var(--ink3);margin:6px 0 0">Pick one, then how strong it is.</p>
      <div class="chips" style="margin-top:12px" id="hySym">
        ${SYMPTOMS.map(x=>`<span class="chip" onclick="pickSymptom(this,'${x}')">${x}</span>`).join("")}
      </div>
      <label class="f" style="margin-top:14px">Or type it</label>
      <input class="f" id="hyOther" placeholder="Something else">
      <label class="f" style="margin-top:12px">How strong · 1 barely, 5 severe</label>
      <div class="chips" id="hySev">
        ${[1,2,3,4,5].map(n=>`<span class="chip${n===2?" on":""}" onclick="pickSev(this,${n})">${n}</span>`).join("")}
      </div>
      <label class="f" style="margin-top:12px">Anything worth noting</label>
      <textarea class="f" id="hyNote" rows="2" placeholder="Optional — what you were doing, how long it lasted"></textarea>
      <div class="btns"><button class="b b-ghost" onclick="closeAll()">Cancel</button>
        <button class="b b-primary" onclick="logSymptom()">Log it</button></div>`;
  }
  if(kind==="bp"){
    B.innerHTML=`<h2>Blood pressure</h2>
      <div class="two" style="margin-top:12px">
        <div><label class="f">Top number</label><input class="f" id="hbSys" type="number" inputmode="numeric" placeholder="118"></div>
        <div><label class="f">Bottom</label><input class="f" id="hbDia" type="number" inputmode="numeric" placeholder="76"></div>
        <div><label class="f">Pulse</label><input class="f" id="hbPul" type="number" inputmode="numeric" placeholder="optional"></div>
      </div>
      <div class="btns"><button class="b b-ghost" onclick="closeAll()">Cancel</button>
        <button class="b b-primary" onclick="logBP()">Save reading</button></div>
      <div class="wk-note" style="padding:12px 0 0">Take it sitting, arm supported, after a few minutes still —
        that's what makes readings comparable to each other.</div>`;
  }
  if(kind==="body"){
    B.innerHTML=`<h2>Weight &amp; body</h2>
      <p style="font-size:12.5px;color:var(--ink3);margin:6px 0 0">Fill in whatever you measured. Blanks are skipped.</p>
      <div class="two" style="margin-top:12px">
        <div><label class="f">Weight (lb)</label><input class="f" id="hbWt" type="number" inputmode="decimal"></div>
        <div><label class="f">Body fat %</label><input class="f" id="hbBf" type="number" inputmode="decimal"></div>
      </div>
      <div class="two">
        <div><label class="f">Waist (in)</label><input class="f" id="hbWa" type="number" inputmode="decimal"></div>
        <div><label class="f">Chest (in)</label><input class="f" id="hbCh" type="number" inputmode="decimal"></div>
        <div><label class="f">Arms (in)</label><input class="f" id="hbAr" type="number" inputmode="decimal"></div>
      </div>
      <div class="btns"><button class="b b-ghost" onclick="closeAll()">Cancel</button>
        <button class="b b-primary" onclick="logBody()">Save</button></div>`;
  }
  if(kind==="sleep"){
    B.innerHTML=`<h2>Last night's sleep</h2>
      <div class="two" style="margin-top:12px">
        <div><label class="f">Went to bed</label><input class="f" id="hzFrom" type="time" value="23:00"></div>
        <div><label class="f">Woke up</label><input class="f" id="hzTo" type="time" value="07:00"></div>
      </div>
      <div class="wk-note" style="padding:10px 0 0">If your watch records sleep it'll come in on its own —
        this is for nights it missed.</div>
      <div class="btns"><button class="b b-ghost" onclick="closeAll()">Cancel</button>
        <button class="b b-primary" onclick="logSleep()">Save</button></div>`;
  }
  closeAll(); openSheet("hlSheet");
}

let _sym={name:"",sev:2};
function pickSymptom(el,name){
  document.querySelectorAll("#hySym .chip").forEach(c=>c.classList.remove("on"));
  el.classList.add("on"); _sym.name=name;
}
function pickSev(el,n){
  document.querySelectorAll("#hySev .chip").forEach(c=>c.classList.remove("on"));
  el.classList.add("on"); _sym.sev=n;
}
async function logSymptom(){
  const name=($("hyOther").value.trim())||_sym.name;
  if(!name){ toast("Pick one or type it"); return; }
  await HEALTH.putEvent({kind:"symptom", name, amount:_sym.sev, unit:"severity",
                         note:$("hyNote").value.trim(), src:"manual"});
  _sym={name:"",sev:2}; closeAll(); renderHealth(); toast("Logged — hope it passes");
}
async function logCaffeinePreset(i){
  const c=hlPrefs.caffeine[i]; if(!c) return;
  const mult=dmGet("caf",i), amt=dmAmount(c.amount,mult);
  await HEALTH.putEvent({kind:"caffeine", name:c.name, amount:amt, unit:c.unit,
                         note:c.size||"", src:"manual"});
  bumpRoutine(CAF_RE, mult);
  dmReset("caf",i);
  save(); render(); renderTracker();
  closeAll(); renderHealth(); toast(`${c.name} · ${amt} mg`);
}
async function logCaffeineCustom(){
  const n=$("hcName").value.trim(), mg=+$("hcMg").value;
  if(!n||!mg){ toast("Need a name and the caffeine in mg"); return; }
  await HEALTH.putEvent({kind:"caffeine", name:n, amount:mg, unit:"mg",
                         note:$("hcSize").value.trim(), src:"manual"});
  closeAll(); renderHealth(); toast(`${n} · ${mg} mg`);
}
async function logSuppPreset(i){
  const x=hlPrefs.supps[i]; if(!x) return;
  const mult=dmGet("supp",i), amt=dmAmount(x.amount,mult);
  await HEALTH.putEvent({kind:"supplement", name:x.name, amount:amt, unit:x.unit, src:"manual"});
  bumpRoutine(SUPP_RE, mult);
  dmReset("supp",i);
  save(); render(); renderTracker(); renderHealth();
  toast(`${x.name} · ${amt}${esc(x.unit||"")} logged`);
}
async function logSuppCustom(){
  const n=$("hsName").value.trim(); if(!n){ toast("Name it first"); return; }
  await HEALTH.putEvent({kind:"supplement", name:n, amount:+$("hsAmt").value||null,
                         unit:$("hsUnit").value.trim(), src:"manual"});
  closeAll(); renderHealth(); toast(`${n} logged`);
}
/* Water goes through the existing routine counter so the Tracker and streaks keep
   working exactly as they do — the health record is written alongside, not instead. */
const OZ_PER_GLASS = 8;
/* Water is logged in ounces here, but your existing routine might count glasses.
   Adding 16 to an 8-glass target would be nonsense, so the counter gets whatever
   unit it actually uses while the health record always keeps the true ounces. */
/* Nudge the ounces box in 4 oz steps — half a standard glass. */
function hwStep(d){
  const el=$("hwOz"); if(!el) return;
  el.value=Math.max(0, (+el.value||0)+d);
}
async function logWater(oz){
  if(!oz){ toast("How many ounces?"); return; }
  /* A negative amount is a correction, not a drink — it walks the counter back
     without inventing a health record that says you drank minus eight ounces. */
  if(oz<0){
    const w=tasks.find(t=>t.routine && /water/i.test(t.name));
    if(!w){ toast("Nothing logged yet"); return; }
    const inG = /glass|cup/i.test(w.unit||"");
    w.count=Math.max(0, Math.round(((w.count||0)+(inG?oz/OZ_PER_GLASS:oz))*100)/100);
    w.done=w.count>=w.target;
    save(); render(); renderTracker(); renderHealth();
    toast(`Took off ${Math.abs(oz)} oz · ${w.count} of ${w.target} ${w.unit||""}`);
    return;
  }
  let w=tasks.find(t=>t.routine && /water/i.test(t.name));
  if(!w){
    w={id:newId(), name:"Water", cat:"water", routine:true, freq:"Every day", time:"08:00",
       est:0, target:hlPrefs.waterGoalOz, unit:"oz", count:0, done:false, streak:0,
       sched:true, makeup:false, notes:"Made when you first logged water from Health."};
    tasks.push(w); history[w.id]=[];
  }
  const inGlasses = /glass|cup/i.test(w.unit||"");
  const add = inGlasses ? oz/OZ_PER_GLASS : oz;
  w.count=Math.round(((w.count||0)+add)*100)/100; w.done=w.count>=w.target;
  await HEALTH.putMeasurement({type:"waterOz", value:oz, unit:"oz", src:"manual"});
  save(); render(); renderTracker(); renderHealth();
  toast(inGlasses ? `+${oz} oz · ${w.count} of ${w.target} ${w.unit}`
                  : `+${oz} oz · ${w.count} of ${w.target}`);
}
/* One tap to move the old glasses counter onto ounces, which is what the health
   side speaks. Nothing is lost — today's glasses convert across. */
async function switchWaterToOz(){
  const w=tasks.find(t=>t.routine && /water/i.test(t.name)); if(!w) return;
  if(!/glass|cup/i.test(w.unit||"")){ toast("Already in ounces"); return; }
  if(!await ask(`Switch water tracking from glasses to ounces?\n\nToday's ${w.count} `
    + `${w.unit} becomes ${Math.round(w.count*OZ_PER_GLASS)} oz, and your goal becomes `
    + `${hlPrefs.waterGoalOz} oz.`,"Switch it")) return;
  w.count=Math.round(w.count*OZ_PER_GLASS); w.unit="oz"; w.target=hlPrefs.waterGoalOz;
  w.done=w.count>=w.target;
  save(); render(); renderTracker(); renderHealth();
  toast("Water is now in ounces");
}
async function logBP(){
  const sys=+$("hbSys").value, dia=+$("hbDia").value, pul=+$("hbPul").value;
  if(!sys||!dia){ toast("Need both numbers"); return; }
  await HEALTH.putMeasurement({type:"bloodPressure", value:sys, unit:"mmHg",
                               src:"manual", extra:{dia, ...(pul?{pulse:pul}:{})}});
  if(pul) await HEALTH.putMeasurement({type:"heartRate", value:pul, unit:"bpm", src:"manual"});
  closeAll(); renderHealth();
  /* No judgement on the number itself — that's a conversation for a doctor, not
     a toast message. */
  toast(`Saved ${sys}/${dia}`);
}
async function logBody(){
  const put=async(id,type,unit)=>{ const v=+$(id).value; if(v>0)
    await HEALTH.putMeasurement({type, value:v, unit, src:"manual"}); };
  await put("hbWt","weight","lb"); await put("hbBf","bodyFatPct","%");
  await put("hbWa","waistIn","in"); await put("hbCh","chestIn","in"); await put("hbAr","armsIn","in");
  closeAll(); renderHealth(); toast("Saved");
}
async function logStress(n){
  await HEALTH.putMeasurement({type:"stress", value:+n, unit:"of 5", src:"manual"});
  closeAll(); renderHealth(); toast(`Stress ${n}/5 logged`);
}
async function logSleep(){
  const a=$("hzFrom").value, b=$("hzTo").value;
  if(!a||!b){ toast("Need both times"); return; }
  const [ah,am]=a.split(":").map(Number), [bh,bm]=b.split(":").map(Number);
  let hrs=(bh+bm/60)-(ah+am/60); if(hrs<=0) hrs+=24;      // crossed midnight
  await HEALTH.putMeasurement({type:"sleepHours", value:Math.round(hrs*100)/100, unit:"h",
                               src:"manual", extra:{from:a, to:b}});
  closeAll(); renderHealth();
  toast(`${Math.floor(hrs)}h ${Math.round((hrs%1)*60)}m logged`);
}

/* ================= HEALTH AI =================
   Its own road to the server, entirely separate from callAI. Claude never sees
   health data; OpenAI never sees tasks, projects or routines. */
const HEALTH_FN = () => (sync.url||"/.netlify/functions/sync").replace(/\/sync\/?$/,"/health").replace(/\/$/,"");
let healthAIState = { ok:null, lastError:"", model:"" };

async function healthAI(task, payload){
  if(hlPrefs.aiOff) return {error:"Health AI is switched off in Privacy. Nothing was sent."};
  if(task==="meal" && hlPrefs.mealPhotoAI===false)
    return {error:"Meal photos are switched off in Privacy. Nothing was sent."};
  try{
    const r=await fetch(HEALTH_FN(), {method:"POST", headers:{"content-type":"application/json","x-momentum-room":sync.room||""},
      body:JSON.stringify({task, payload})});
    const j=await r.json().catch(()=>({error:"The server didn't answer with data"}));
    if(j.error){ healthAIState.ok=false; healthAIState.lastError=j.error; return {error:j.error}; }
    healthAIState.ok=true; healthAIState.lastError=""; if(j.model) healthAIState.model=j.model;
    return j;
  }catch(e){
    healthAIState.ok=false; healthAIState.lastError=e.message;
    return {error:"Couldn't reach the health service — "+e.message};
  }
}
async function healthPing(){
  const box=$("hlPing"); if(box) box.textContent="Checking…";
  const r=await healthAI("ping",{});
  const msg = r.error ? "Not working: "+r.error
            : r.ok===false ? "Not working: "+(r.error||"unknown")
            : `Working — using ${r.model}.`;
  if(box) box.textContent=msg;
  renderHealth();
  return msg;
}

/* ---- the week, worked out in code ----
   Every number below is calculated here. The model is only ever asked what it
   makes of them, never to do the arithmetic. */
function avgOf(a){ return a.length ? Math.round(a.reduce((x,y)=>x+y,0)/a.length*10)/10 : null; }
function weekWindow(off){ const [a,b]=weekBounds(off); return {from:a,to:b}; }

/* Totals each day against each medication's own limit, so a week reads as
   "over on 2 of 6 days" rather than one undifferentiated pile of doses. */
function medCapStats(meds){
  const byName={};
  meds.forEach(e=>{
    const n=e.name||"";
    (byName[n] = byName[n] || {})[e.day] = Math.round((((byName[n]||{})[e.day]||0) + (+e.amount||0))*100)/100;
  });
  let overDays=0, worst=null, limitedDays=0, limit=null, unit="";
  Object.entries(byName).forEach(([name,days])=>{
    const pre=hlPrefs.meds.find(m=>m.name===name);
    const max=+(pre&&pre.dailyMax)||0;
    if(!max) return;
    limit=max; unit=(pre&&pre.unit)||"";
    Object.entries(days).forEach(([day,total])=>{
      limitedDays++;
      if(total>max){ overDays++;
        if(!worst||total>worst.total) worst={day, total, over:Math.round((total-max)*100)/100}; }
    });
  });
  return { medDailyLimit: limit, medLimitUnit: unit,
           medDaysOverLimit: overDays, medDaysWithLimit: limitedDays,
           medWorstDay: worst };
}

async function weeklyHealthStats(){
  const wk=weekWindow(0), lastWk=weekWindow(-1);
  const base=(()=>{ const d=new Date(); d.setDate(d.getDate()-28); return {from:ymd(d), to:wk.to}; })();

  const rows      = await HEALTH.dailyRange(wk.from, wk.to);
  const rowsLast  = await HEALTH.dailyRange(lastWk.from, lastWk.to);
  const rowsBase  = await HEALTH.dailyRange(base.from, base.to);
  const evs       = await HEALTH.range("events", wk.from, wk.to);
  const evsLast   = await HEALTH.range("events", lastWk.from, lastWk.to);

  const num=(rs,k)=>rs.map(r=>r[k]).filter(v=>typeof v==="number");
  const bpOf=rs=>rs.map(r=>r.averageBloodPressure).filter(Boolean);
  const block=(rs,ev)=>{
    const bp=bpOf(rs);
    const caff=ev.filter(e=>e.kind==="caffeine");
    const meds=ev.filter(e=>e.kind==="med");
    const days=new Set(rs.map(r=>r.date));
    return {
      days: rs.length,
      steps: num(rs,"steps").reduce((a,b)=>a+b,0) || null,
      /* Per-day as well as total. Mid-week, comparing a 3-day total against a
         full week says "down 40,000 steps" when nothing is actually down. */
      stepsPerDay: rs.length ? Math.round(num(rs,"steps").reduce((a,b)=>a+b,0)/rs.length) : null,
      restingHR: avgOf(num(rs,"restingHeartRate")),
      avgHR: avgOf(num(rs,"averageHeartRate")),
      sleepHours: avgOf(num(rs,"sleepHours")),
      weight: num(rs,"weight").slice(-1)[0] ?? null,
      runningMiles: Math.round(num(rs,"runningMiles").reduce((a,b)=>a+b,0)*10)/10 || null,
      caloriesIn: avgOf(num(rs,"caloriesIn")),
      proteinG: avgOf(num(rs,"proteinG")),
      waterOz: avgOf(num(rs,"waterOz")),
      bp: bp.length ? { sys: avgOf(bp.map(b=>b.sys)), dia: avgOf(bp.map(b=>b.dia)),
                        sysRange:[Math.min(...bp.map(b=>b.sys)), Math.max(...bp.map(b=>b.sys))],
                        readings: bp.length } : null,
      caffeineMgPerDay: caff.length ? Math.round(caff.reduce((a,c)=>a+(+c.amount||0),0)/Math.max(1,days.size)) : null,
      medDoses: meds.length,
      medDaysLogged: new Set(meds.map(m=>m.day)).size,
      /* Days you went past the limit you set for yourself. Reported as a count,
         never as a judgement or a suggestion to change anything. */
      ...medCapStats(meds),
      medTimes: meds.map(m=>new Date(m.t).toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit",hour12:false})).sort(),
      supplements: [...new Set(ev.filter(e=>e.kind==="supplement").map(e=>e.name))],
      symptoms: ev.filter(e=>e.kind==="symptom")
        .map(e=>({name:e.name, severity:e.amount, day:e.day,
                  time:new Date(e.t).toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit",hour12:false})}))
    };
  };

  const thisW=block(rows,evs), lastW=block(rowsLast,evsLast);
  const baseline={
    days: rowsBase.length,
    restingHR: avgOf(num(rowsBase,"restingHeartRate")),
    sleepHours: avgOf(num(rowsBase,"sleepHours")),
    weight: avgOf(num(rowsBase,"weight")),
    stepsPerDay: rowsBase.length ? Math.round(num(rowsBase,"steps").reduce((a,b)=>a+b,0)/rowsBase.length) : null
  };
  const workouts = Object.entries(wkHist).map(([id,h])=>{
    const inWk=h.filter(x=>x.d && x.d>=wk.from && x.d<=wk.to);
    const w=wkById(id);
    return inWk.length ? {name:w?w.name:id, sessions:inWk.length,
                          volume:inWk.reduce((a,x)=>a+(x.vol||0),0)} : null;
  }).filter(Boolean);

  const delta=(a,b)=> (typeof a==="number"&&typeof b==="number") ? Math.round((a-b)*10)/10 : null;
  return {
    window: {thisWeek:[wk.from,wk.to], lastWeek:[lastWk.from,lastWk.to], baselineDays:28},
    thisWeek: thisW, lastWeek: lastW, fourWeekBaseline: baseline,
    workouts,
    changes: {
      restingHR: delta(thisW.restingHR, lastW.restingHR),
      restingHRvsBaseline: delta(thisW.restingHR, baseline.restingHR),
      sleepHours: delta(thisW.sleepHours, lastW.sleepHours),
      stepsPerDay: delta(thisW.stepsPerDay, lastW.stepsPerDay),
      weight: delta(thisW.weight, lastW.weight),
      caffeine: delta(thisW.caffeineMgPerDay, lastW.caffeineMgPerDay),
      runningMiles: delta(thisW.runningMiles, lastW.runningMiles)
    },
    dataGaps: (()=>{ const g=[];
      if(!thisW.restingHR) g.push("no resting heart rate this week");
      if(!thisW.sleepHours) g.push("no sleep logged this week");
      if(!thisW.bp) g.push("no blood pressure readings this week");
      if(thisW.days<7) g.push(`this week is only ${thisW.days} day${thisW.days===1?"":"s"} in so far — `
        + `totals are compared per day, not week against week`);
      return g; })()
  };
}

/* The numbers show immediately whether or not the AI answers. That's the point
   of calculating them here — the review is never blocked on a network call. */
async function weeklyHealthReview(){
  $("hlSheetBody").innerHTML=`<h2>Working out your week…</h2>
    <div class="wk-note" style="padding:14px 0"><span class="spin"></span> Adding up the numbers first.</div>`;
  closeAll(); openSheet("hlSheet");
  const st=await weeklyHealthStats();
  const t=st.thisWeek, l=st.lastWeek, c=st.changes;
  const arrow=(v,goodDown)=>v==null?"":`<span style="color:${(goodDown? v<0 : v>0)?'#4fd6a5':v===0?'var(--ink3)':'#ff9d4d'}">
    ${v>0?"↑":v<0?"↓":"–"} ${Math.abs(v)}</span>`;
  const row=(label,val,extra)=>val==null?"":`<div class="meta"><span class="k">${label}</span>
    <span class="v">${val}${extra?` ${extra}`:``}</span></div>`;

  const numbers=`
    <div class="card" style="margin-top:12px">
      <div class="card-head"><span class="card-title">The numbers</span>
        <span class="link">${st.window.thisWeek[0]} – ${st.window.thisWeek[1]}</span></div>
      <div style="padding:0 16px 12px">
        ${row("Blood pressure", t.bp?`${t.bp.sys}/${t.bp.dia}`:null, t.bp?`avg of ${t.bp.readings}`:"")}
        ${row("Resting HR", t.restingHR, arrow(c.restingHR,true)+" on last week")}
        ${row("Steps", t.steps?t.steps.toLocaleString():null,
              t.stepsPerDay?`${t.stepsPerDay.toLocaleString()}/day ${arrow(c.stepsPerDay,false)}`:"")}
        ${row("Running", t.runningMiles?`${t.runningMiles} mi`:null, arrow(c.runningMiles,false))}
        ${row("Sleep", t.sleepHours?`${Math.floor(t.sleepHours)}h ${Math.round((t.sleepHours%1)*60)}m`:null, "average")}
        ${row("Weight", t.weight, arrow(c.weight,true))}
        ${row("Calories", t.caloriesIn?`${t.caloriesIn}`:null, "a day")}
        ${row("Protein", t.proteinG?`${t.proteinG} g`:null, "a day")}
        ${row("Water", t.waterOz?`${t.waterOz} oz`:null, "a day")}
        ${row("Caffeine", t.caffeineMgPerDay?`${t.caffeineMgPerDay} mg`:null, "a day")}
        ${row("Medication", t.medDoses?`${t.medDoses} dose${t.medDoses===1?"":"s"}`:null, `on ${t.medDaysLogged} of 7 days`)}
        ${t.medDailyLimit ? `<div class="meta"><span class="k">Over your limit</span>
          <span class="v" style="color:${t.medDaysOverLimit?'#ff8aa0':'#4fd6a5'}">
            ${t.medDaysOverLimit} of ${t.medDaysWithLimit} day${t.medDaysWithLimit===1?"":"s"}
            ${t.medDaysOverLimit&&t.medWorstDay?` · worst ${t.medWorstDay.total} ${t.medLimitUnit} on ${t.medWorstDay.day.slice(5)}`:``}</span></div>`:``}
        ${row("Workouts", st.workouts.length?st.workouts.map(w=>`${w.name} ×${w.sessions}`).join(", "):null)}
        ${row("Symptoms", t.symptoms.length?`${t.symptoms.length} logged`:null)}
        ${row("Supplements", t.supplements.length?t.supplements.join(", "):null)}
      </div>
      ${st.dataGaps.length?`<div class="wk-note" style="padding:0 16px 13px">
        <b style="color:#ff9d4d">Thin in places:</b> ${st.dataGaps.join(", ")}. Anything below is weaker for it.</div>`:``}
    </div>`;

  $("hlSheetBody").innerHTML=`<h2>Your week</h2>
    <div style="font-size:12.5px;color:var(--ink3);margin-top:4px">Numbers calculated here. Reading below from OpenAI.</div>
    ${numbers}
    <div class="wk-note" style="padding:10px 0"><span class="spin"></span> Asking for a read on it…</div>`;

  const r=await healthAI("weekly", st);
  const readout = r.error
    ? `<div class="card" style="border-color:rgba(255,157,77,.4)">
        <div class="wk-note" style="padding:12px 16px"><b style="color:#ff9d4d">No reading this time.</b><br>
        ${esc(r.error)}<br><br>The numbers above are worked out on your device and are unaffected.</div></div>`
    : `<div class="card"><div class="card-head"><span class="card-title">What it makes of it</span>
        <span class="vtag" style="background:rgba(52,168,131,.16);color:#4fd6a5;border:1px solid rgba(52,168,131,.4)">PRIVATE AI</span></div>
        <div class="ansbox" style="margin:0 16px 14px">${r.html}</div></div>`;

  $("hlSheetBody").innerHTML=`<h2>Your week</h2>
    <div style="font-size:12.5px;color:var(--ink3);margin-top:4px">Numbers calculated on your device. Reading from OpenAI.</div>
    ${numbers}${readout}
    <div class="wk-note" style="padding:0 2px 10px">Tracking and patterns only — not a medical opinion.
      Anything that worries you belongs with a doctor.</div>
    <div class="btns"><button class="b b-ghost" style="width:100%" onclick="closeAll()">Close</button></div>`;
}

/* ---- Ask Health ----
   Only the period the question is about goes up, not the whole store. */
let hAskChat=[];
function askWindowFor(q){
  const s=(q||"").toLowerCase();
  if(/today|right now/.test(s)) return 1;
  if(/yesterday/.test(s)) return 2;
  if(/week/.test(s)) return 14;
  if(/month/.test(s)) return 31;
  if(/3 ?months|90|quarter/.test(s)) return 90;
  if(/year|6 ?months/.test(s)) return 180;
  return 30;
}
async function askHealthData(days){
  const to=ymd(new Date()), d=new Date(); d.setDate(d.getDate()-days);
  const from=ymd(d);
  const daily=await HEALTH.dailyRange(from,to);
  const evs=await HEALTH.range("events", from, to);
  /* Daily rollups, not raw samples. A month of continuous heart rate is tens of
     thousands of rows; the rollups say the same thing in a few dozen. */
  return {
    from, to, days,
    daily: daily.slice(-95),
    events: evs.slice(-300).map(e=>({kind:e.kind, name:e.name, amount:e.amount, unit:e.unit,
      day:e.day, time:new Date(e.t).toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit",hour12:false})})),
    cardio: cardio.filter(c=>c.d>=from).map(c=>({d:c.d,type:c.type,mi:c.mi,min:c.min,hr:c.hr||null}))
  };
}
function openAskHealth(){ drawAskHealth(); closeAll(); openSheet("hlSheet");
  setTimeout(()=>{const i=$("haInput"); if(i) i.focus();},320); }
function drawAskHealth(){
  $("hlSheetBody").innerHTML=`<h2>Ask Health</h2>
    <div style="font-size:12px;color:var(--ink3);line-height:1.5;margin-top:4px">
      Runs on Claude (or OpenAI if that is the only key set), through your own server. It sees your health numbers only —
      never your tasks, projects or notes.</div>
    <div id="haChat" style="margin-top:12px;max-height:44vh;overflow:auto">
      ${hAskChat.length ? hAskChat.map(m=>`<div class="bub ${m.r}">${m.r==="ai"?m.t:esc(m.t)}</div>`).join("")
        : `<div class="chips">${["How has my blood pressure changed?",
             "What happens to my heart rate after I take my medication?",
             "Am I sleeping better?","How much caffeine have I been drinking?",
             "What was different on the days I felt dizzy?",
             "Anything unusual this month?"]
             .map(q=>`<span class="chip" onclick="askHealthQ(this.textContent)">${q}</span>`).join("")}</div>`}
    </div>
    <textarea class="f" id="haInput" rows="2" placeholder="Ask about your own numbers…" style="margin-top:12px"></textarea>
    <div class="btns">
      <button class="b b-ghost" onclick="hAskChat=[];drawAskHealth()">Clear</button>
      <button class="b b-primary" onclick="askHealthQ()">Ask</button>
    </div>
    <div class="wk-note" style="padding:8px 2px 0">It can spot patterns. It can't diagnose,
      and it won't tell you to change a prescription.</div>`;
}
async function askHealthQ(preset){
  const q=(preset||$("haInput").value||"").trim();
  if(!q) return;
  if($("haInput")) $("haInput").value="";
  hAskChat.push({r:"you", t:q});
  hAskChat.push({r:"ai", t:`<i style="color:#8d99ab">Looking…</i>`});
  drawAskHealth();
  const days=askWindowFor(q);
  const data=await askHealthData(days);
  const history=hAskChat.slice(0,-2).slice(-6)
    .map(m=>`${m.r==="you"?"Me":"You"}: ${stripTags(m.t).slice(0,300)}`).join("\n");
  const r=await healthAI("ask", {question:q, window:`last ${days} days`, data, history});
  hAskChat[hAskChat.length-1] = { r:"ai",
    t: r.error ? `<b style="color:#ff8f8f">Couldn't answer.</b><br>${esc(r.error)}` : r.html };
  drawAskHealth();
}

/* ================= NOTIFICATIONS =================
   A page can't wake itself up. Anything that has to arrive when Momentum is shut
   goes through the browser's push service, which is why this needs the server
   piece rather than a timer in the app. */
const PUSH_FN = () => (sync.url||"/.netlify/functions/sync").replace(/\/sync\/?$/,"/push").replace(/\/$/,"");
let notif = { on:false, weekly:"on", meds:"off", water:"off",
              weeklyHour:19, medHour:9, waterHour:15, endpoint:"" };

function b64ToU8(b64){
  const pad="=".repeat((4 - b64.length % 4) % 4);
  const raw=atob((b64+pad).replace(/-/g,"+").replace(/_/g,"/"));
  return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
}
async function pushCall(payload){
  if(!sync.room) return {error:"Turn on Sync first — notifications use the same code to know which device is yours."};
  try{
    const r=await fetch(PUSH_FN()+"?room="+encodeURIComponent(sync.room),
      {method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(payload)});
    return await r.json();
  }catch(e){ return {error:"Couldn't reach the notification service — "+e.message}; }
}
async function enableNotifications(){
  if(!("serviceWorker" in navigator) || !("PushManager" in window))
    return toast("This browser can't do notifications");
  const perm=await Notification.requestPermission();
  if(perm!=="granted"){ toast(perm==="denied"
    ? "Blocked. You'd need to allow notifications for this site in your browser settings."
    : "Not allowed yet"); return; }
  const k=await pushCall({do:"key"});
  if(k.error||!k.publicKey){ toast(k.error||"Couldn't get set up"); return; }
  const reg=await navigator.serviceWorker.ready;
  let sub;
  try{
    sub=await reg.pushManager.subscribe({userVisibleOnly:true,
      applicationServerKey:b64ToU8(k.publicKey)});
  }catch(e){ toast("Couldn't subscribe: "+e.message); return; }
  const r=await pushCall({do:"subscribe", sub:sub.toJSON(), device:sync.device||"this device"});
  if(r.error){ toast(r.error); return; }
  notif.on=true; notif.endpoint=sub.endpoint;
  await savePushPrefs();
  save(); renderNotifSettings();
  toast("Notifications on for this device");
}
async function disableNotifications(){
  try{
    const reg=await navigator.serviceWorker.ready;
    const sub=await reg.pushManager.getSubscription();
    if(sub){ await pushCall({do:"unsubscribe", endpoint:sub.endpoint}); await sub.unsubscribe(); }
  }catch(e){}
  notif.on=false; notif.endpoint="";
  save(); renderNotifSettings(); toast("Notifications off for this device");
}
async function savePushPrefs(){
  return pushCall({do:"prefs", prefs:{
    weekly:notif.weekly, meds:notif.meds, water:notif.water,
    weeklyHour:notif.weeklyHour, medHour:notif.medHour, waterHour:notif.waterHour,
    tzOffsetHours: -Math.round(new Date().getTimezoneOffset()/60)
  }});
}
async function testNotification(){
  const r=await pushCall({do:"test", title:"Momentum", body:"That's what a notification looks like.", url:"/#health"});
  toast(r.error ? r.error : r.ok===false ? (r.error||"No devices signed up") : `Sent to ${r.sent} device${r.sent===1?"":"s"}`);
}
function setNotif(k,v){ notif[k]=v; save(); savePushPrefs(); renderNotifSettings(); }

function renderNotifSettings(){
  const opt=(k,cur)=>["off","on"].map(v=>`<span class="chip${cur===v?" on":""}"
    onclick="setNotif('${k}','${v}')">${v==="on"?"On":"Off"}</span>`).join("");
  const hourPick=(k,cur)=>`<select class="f" style="width:auto;display:inline-block;padding:6px 8px"
    onchange="setNotif('${k}',+this.value)">${Array.from({length:24},(_,h)=>
    `<option value="${h}"${cur===h?" selected":""}>${h%12===0?12:h%12}${h<12?"am":"pm"}</option>`).join("")}</select>`;
  $("hlSheetBody").innerHTML=`<h2>Notifications</h2>
    <div style="font-size:12.5px;color:var(--ink3);line-height:1.55;margin-top:6px">
      These arrive even when Momentum is closed. They're sent from your own site — nobody else is involved.</div>
    ${!notif.on ? `<div class="btns" style="margin-top:14px">
        <button class="b b-primary" style="width:100%" onclick="enableNotifications()">Turn on for this device</button></div>`
      : `<div class="card" style="margin-top:14px">
        <div class="card-head"><span class="card-title">On for this device</span>
          <span class="link" style="color:#4fd6a5">${esc(sync.device||"this device")}</span></div>
        <div class="wk-row"><button class="b b-ghost" onclick="testNotification()">Send me a test</button>
          <button class="b b-danger" onclick="disableNotifications()">Turn off</button></div>
      </div>
      <div class="card">
        <div class="card-head"><span class="card-title">Weekly health review</span></div>
        <div class="chips" style="padding:2px 16px 6px">${opt("weekly",notif.weekly)}</div>
        <div style="padding:0 16px 12px;font-size:12px;color:var(--ink3)">Sunday at ${hourPick("weeklyHour",notif.weeklyHour)}</div>
      </div>
      <div class="card">
        <div class="card-head"><span class="card-title">Medication not logged</span></div>
        <div class="chips" style="padding:2px 16px 6px">${opt("meds",notif.meds)}</div>
        <div style="padding:0 16px 12px;font-size:12px;color:var(--ink3)">Nudge at ${hourPick("medHour",notif.medHour)} if nothing's logged</div>
      </div>
      <div class="card">
        <div class="card-head"><span class="card-title">Water behind your usual</span></div>
        <div class="chips" style="padding:2px 16px 6px">${opt("water",notif.water)}</div>
        <div style="padding:0 16px 12px;font-size:12px;color:var(--ink3)">Check at ${hourPick("waterHour",notif.waterHour)}</div>
      </div>`}
    <div class="wk-note" style="padding:14px 2px 0">
      <b>Worth knowing:</b> these land on the hour, not to the minute — hourly is the finest schedule the
      free plan runs. And each one arrives at most once a day, so nothing turns into a stream.</div>
    <div class="btns" style="margin-top:10px"><button class="b b-ghost" style="width:100%" onclick="closeAll()">Close</button></div>`;
  closeAll(); openSheet("hlSheet");
}

/* Notifications deep-link into a screen. */
function handleDeepLink(){
  const h=(location.hash||"").replace("#","");
  if(!h) return;
  /* Clear it first. If whatever we open below throws, the address shouldn't be
     left carrying a link that fires again on the next reload.
     window.history, not history — the app has its own global called `history`
     for the tracker grids, and it shadows the browser's one. */
  try{ window.history.replaceState(null,"",location.pathname); }catch(e){}
  if(h.indexOf("health")!==0) return;
  go("health");
  if(h==="health-weekly")  setTimeout(()=>{ try{ weeklyHealthReview(); }catch(e){} },500);
  if(h==="health-timeline") setTimeout(()=>{ try{ renderTimeline(); }catch(e){} },500);
}

/* ================= HEALTH TIMELINE =================
   Everything that happened in a day, in the order it happened. Relationships are
   much easier to see down a single column than across five separate screens. */
async function healthTimeline(day){
  day=day||ymd(new Date());
  const ms=await HEALTH.byDay("measurements", day);
  const evs=await HEALTH.byDay("events", day);
  const items=[];
  const at=(t,icon,title,sub,tone)=>items.push({t, icon, title, sub, tone});

  evs.forEach(e=>{
    if(e.kind==="med")        at(e.t,"💊",`${e.name} — ${e.amount}${e.unit}`, e.note||"", "#4fd6a5");
    if(e.kind==="caffeine")   at(e.t,"☕",`${e.name} — ${e.amount} mg caffeine`, e.note||"", "#c9a227");
    if(e.kind==="supplement") at(e.t,"🧪",`${e.name}${e.amount?` — ${e.amount}${e.unit}`:""}`, "", "#a78bfa");
    if(e.kind==="symptom")    at(e.t,"⚠️",`${e.name}`, `severity ${e.amount}/5${e.note?" · "+e.note:""}`, "#ff9d4d");
  });
  ms.forEach(m=>{
    if(m.type==="bloodPressure") at(m.t,"🩺",`Blood pressure — ${m.value}/${(m.extra&&m.extra.dia)||"?"}`,"","#ff5f7e");
    if(m.type==="weight")        at(m.t,"⚖️",`Weight — ${m.value} lb`,"");
    if(m.type==="waterOz")       at(m.t,"💧",`Water — ${m.value} oz`,"","#4fc3f7");
    if(m.type==="stress")        at(m.t,"🧠",`Stress ${m.value} of 5`,"","#ffb26b");
    if(m.type==="sleepHours")    at(m.t,"😴",`Slept ${Math.floor(m.value)}h ${Math.round((m.value%1)*60)}m`,
      (m.extra&&m.extra.from)?`${m.extra.from} to ${m.extra.to}`:"", "#a78bfa");
    if(m.type==="restingHeartRate") at(m.t,"❤️",`Resting heart rate — ${m.value} bpm`,"","#ff5f7e");
  });
  (meals.today||[]).filter(m=>m.t).forEach(m=>
    at(m.t,"🍽",`${m.n}`, `${m.kcal} cal · ${m.p}g protein${m.src==="ai-meal"?" · from a photo":""}`, "#ff9d4d"));
  cardio.filter(c=>c.d===day).forEach(c=>
    at(`${day}T${String(12).padStart(2,"0")}:00:00`,"🏃",`${c.type} — ${c.mi} mi`,
       `${c.min} min · ${pace(c.mi,c.min)}${c.hr?` · avg ${c.hr} bpm`:""}`, "#ff5f7e"));
  Object.entries(wkHist).forEach(([id,h])=>h.filter(x=>x.d===day).forEach(x=>{
    const w=wkById(id);
    at(`${day}T18:00:00`,"🏋️",`${w?w.name:"Workout"}`, `volume ${x.vol}`, "#5b9dff"); }));

  /* Heart rate is hundreds of samples a day — the timeline shows where it peaked
     rather than a row for every reading. */
  const hr=ms.filter(m=>m.type==="heartRate");
  if(hr.length>4){
    const peak=hr.reduce((a,b)=>b.value>a.value?b:a);
    at(peak.t,"📈",`Heart rate peaked at ${peak.value} bpm`,
       `${hr.length} readings through the day`, "#ff5f7e");
  }
  return items.sort((a,b)=>String(a.t).localeCompare(String(b.t)));
}
let tlDay=null;
async function renderTimeline(day){
  tlDay = day || tlDay || ymd(new Date());
  $("hlSheetBody").innerHTML=`<h2>Timeline</h2>
    <div class="wk-note" style="padding:14px 0"><span class="spin"></span> Putting the day in order…</div>`;
  closeAll(); openSheet("hlSheet");
  const items=await healthTimeline(tlDay);
  const isToday = tlDay===ymd(new Date());
  const shift=n=>{ const d=new Date(tlDay+"T12:00:00"); d.setDate(d.getDate()+n); return ymd(d); };
  $("hlSheetBody").innerHTML=`<h2>Timeline</h2>
    <div class="wk-row" style="padding:10px 0 0">
      <button class="b b-ghost" onclick="renderTimeline('${shift(-1)}')">‹ Day before</button>
      <button class="b b-ghost" ${isToday?"disabled style='opacity:.4'":""} onclick="renderTimeline('${shift(1)}')">Day after ›</button>
    </div>
    <div style="font-size:12.5px;color:var(--ink3);margin-top:10px">
      ${new Date(tlDay+"T12:00:00").toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"})}</div>
    ${items.length ? `<div style="margin-top:12px">${items.map(i=>`
      <div class="tlrow">
        <div class="tltime">${new Date(i.t).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"})}</div>
        <div class="tldot" style="background:${i.tone||"#2a3442"}"></div>
        <div class="tlbody">
          <div class="tlt">${i.icon} ${esc(i.title)}</div>
          ${i.sub?`<div class="tls">${esc(i.sub)}</div>`:``}
        </div>
      </div>`).join("")}</div>`
    : `<div class="wk-note" style="padding:16px 0">Nothing logged on this day.</div>`}
    <div class="btns" style="margin-top:14px"><button class="b b-ghost" style="width:100%" onclick="closeAll()">Close</button></div>`;
}

/* ================= EXPORT =================
   Your data, in a shape a person or a spreadsheet can read. Nothing is filtered
   out behind your back — what you tick is what you get. */
let exPick={ range:30, measurements:true, events:true, daily:true, meals:true, cardio:true, workouts:true };
function openExport(){
  $("hlSheetBody").innerHTML=`<h2>Export your health data</h2>
    <p style="font-size:12.5px;color:var(--ink3);line-height:1.55;margin:6px 0 0">
      Everything stays on your device unless you send the file somewhere. Useful if you
      want to hand something to a doctor.</p>
    <label class="f" style="margin-top:14px">How far back</label>
    <div class="chips">${[7,30,90,180,365,3650].map(n=>`<span class="chip${exPick.range===n?" on":""}"
      onclick="exPick.range=${n};openExport()">${n>=3650?"Everything":n>=365?"1 year":n>=180?"6 months":n+" days"}</span>`).join("")}</div>
    <label class="f" style="margin-top:14px">What to include</label>
    <div class="chips">
      ${[["daily","Daily summaries"],["measurements","Every reading"],["events","Meds, caffeine, supplements, symptoms"],
         ["meals","Meals"],["cardio","Runs and walks"],["workouts","Workouts"]]
        .map(([k,l])=>`<span class="chip${exPick[k]?" on":""}" onclick="exPick.${k}=!exPick.${k};openExport()">${l}</span>`).join("")}
    </div>
    <div class="btns" style="margin-top:16px">
      <button class="b b-ghost" onclick="doExport('csv')">Download CSV</button>
      <button class="b b-primary" onclick="doExport('json')">Download JSON</button>
    </div>
    <div class="wk-note" style="padding:12px 0 0">CSV opens in a spreadsheet — one row per thing, with its
      timestamp, value, unit and where it came from. JSON keeps the full structure.</div>
    <div class="btns" style="margin-top:9px"><button class="b b-ghost" style="width:100%" onclick="closeAll()">Cancel</button></div>`;
  closeAll(); openSheet("hlSheet");
}
async function gatherExport(){
  const to=ymd(new Date()), d=new Date(); d.setDate(d.getDate()-exPick.range);
  const from=ymd(d);
  const out={ exported:new Date().toISOString(), from, to };
  if(exPick.daily)        out.daily        = await HEALTH.dailyRange(from,to);
  if(exPick.measurements) out.measurements = await HEALTH.range("measurements",from,to);
  if(exPick.events)       out.events       = await HEALTH.range("events",from,to);
  if(exPick.meals)        out.meals        = [...(meals.hist||[]).filter(h=>h.d>=from),
                                              {d:ymd(new Date()), items:meals.today}];
  if(exPick.cardio)       out.cardio       = cardio.filter(c=>c.d>=from);
  if(exPick.workouts)     out.workouts     = Object.entries(wkHist).flatMap(([id,h])=>
                            h.filter(x=>x.d>=from).map(x=>({workout:(wkById(id)||{}).name||id, ...x})));
  return out;
}
function csvEscape(v){ const s=String(v??""); return /[",\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s; }
async function doExport(fmt){
  toast("Building your file…");
  const data=await gatherExport();
  let blob, name;
  if(fmt==="json"){
    blob=new Blob([JSON.stringify(data,null,1)],{type:"application/json"});
    name=`momentum-health-${data.from}-to-${data.to}.json`;
  } else {
    /* One flat table. A doctor or a spreadsheet can read it without knowing
       anything about how the app stores things. */
    const rows=[["date","time","kind","name","value","unit","extra","source"]];
    (data.measurements||[]).forEach(m=>rows.push([m.day, new Date(m.t).toLocaleTimeString(),
      "measurement", m.type, m.value, m.unit, m.extra?JSON.stringify(m.extra):"", m.src]));
    (data.events||[]).forEach(e=>rows.push([e.day, new Date(e.t).toLocaleTimeString(),
      e.kind, e.name, e.amount??"", e.unit||"", e.note||"", e.src]));
    (data.cardio||[]).forEach(c=>rows.push([c.d,"", "cardio", c.type, c.mi, "mi",
      `${c.min} min${c.hr?`, avg HR ${c.hr}`:""}`, c.src||"manual"]));
    (data.workouts||[]).forEach(w=>rows.push([w.d,"", "workout", w.workout, w.vol, "volume","", "manual"]));
    (data.meals||[]).forEach(day=>(day.items||[]).forEach(m=>rows.push([day.d,
      m.t?new Date(m.t).toLocaleTimeString():"", "meal", m.n, m.kcal, "kcal",
      `${m.p||0}g protein`, m.src||"manual"])));
    (data.daily||[]).forEach(r=>rows.push([r.date,"","daily summary","", "","",
      JSON.stringify(r), "calculated"]));
    blob=new Blob([rows.map(r=>r.map(csvEscape).join(",")).join("\n")],{type:"text/csv"});
    name=`momentum-health-${data.from}-to-${data.to}.csv`;
  }
  const a=document.createElement("a");
  a.href=URL.createObjectURL(blob); a.download=name; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
  const n=(data.measurements||[]).length+(data.events||[]).length;
  closeAll(); toast(`Downloaded — ${n.toLocaleString()} records`);
}

/* ================= HEALTH PRIVACY ================= */
async function openHealthPrivacy(){
  const counts={ m:await HEALTH.count("measurements"), e:await HEALTH.count("events"), d:await HEALTH.count("daily") };
  const line=(l,v)=>`<div class="meta"><span class="k">${l}</span><span class="v">${v}</span></div>`;
  $("hlSheetBody").innerHTML=`<h2>Health privacy</h2>
    <div class="card" style="margin-top:12px">
      <div class="card-head"><span class="card-title">What's on this device</span></div>
      <div style="padding:0 16px 12px">
        ${line("Readings", counts.m.toLocaleString())}
        ${line("Meds, caffeine, symptoms", counts.e.toLocaleString())}
        ${line("Daily summaries", counts.d.toLocaleString())}
        ${line("Where it lives", "This device only")}
      </div>
      <div class="wk-note" style="padding:0 16px 13px">Health data is kept separately from the rest of Momentum
        and is <b>not</b> included when your devices sync. It stays here.</div>
    </div>

    <div class="card">
      <div class="card-head"><span class="card-title">What OpenAI can see</span>
        <span class="link" style="color:${hlPrefs.aiOff?'#ff9d4d':'#4fd6a5'}">${hlPrefs.aiOff?"Off":"On"}</span></div>
      <div style="padding:2px 16px 12px;font-size:12.5px;color:var(--ink2);line-height:1.6">
        Only when you tap <b>Ask Health</b>, <b>Weekly review</b> or take a <b>meal photo</b>. Nothing goes
        automatically.<br><br>
        It receives <b>daily summaries</b> — never your raw readings — plus meds, caffeine and symptoms for the
        period your question is about. It never sees your tasks, projects, notes or the Problem Solver.
      </div>
      <div class="switchrow" style="padding:4px 16px 6px" onclick="toggleMealPhotoAI()">
        <div style="flex:1"><b style="font-size:14px">Send meal photos for analysis</b>
          <div style="font-size:11.5px;color:var(--ink3);line-height:1.5;margin-top:3px">
            Off means the camera button won't send anything. You can still type meals in.</div></div>
        <div class="sw${hlPrefs.mealPhotoAI!==false?" on":""}"></div>
      </div>
      <div class="wk-row"><button class="b ${hlPrefs.aiOff?'b-primary':'b-danger'}" style="width:100%"
        onclick="toggleHealthAI()">${hlPrefs.aiOff?"Turn Health AI back on":"Disconnect Health AI"}</button></div>
      <div class="wk-note" style="padding:10px 16px 14px">Disconnecting only affects Health. Claude keeps running
        the rest of Momentum exactly as it does now.</div>
    </div>

    <div class="card">
      <div class="card-head"><span class="card-title">Clearing things out</span></div>
      <div class="wk-row"><button class="b b-ghost" style="width:100%" onclick="hAskChat=[];toast('Health chat cleared')">Delete the Health chat history</button></div>
      <div class="wk-row" style="padding-top:0"><button class="b b-ghost" style="width:100%" onclick="openExport()">Export it all first</button></div>
      <div class="wk-row" style="padding-top:0"><button class="b b-danger" style="width:100%" onclick="wipeHealth()">Erase all health data</button></div>
      <div class="wk-note" style="padding:10px 16px 14px">Erasing health data leaves your tasks, workouts and
        everything else untouched.</div>
    </div>
    <div class="btns"><button class="b b-ghost" style="width:100%" onclick="closeAll()">Close</button></div>`;
  closeAll(); openSheet("hlSheet");
}
function toggleHealthAI(){ hlPrefs.aiOff=!hlPrefs.aiOff; save(); openHealthPrivacy(); renderHealth();
  toast(hlPrefs.aiOff?"Health AI disconnected":"Health AI back on"); }
function toggleMealPhotoAI(){ hlPrefs.mealPhotoAI = hlPrefs.mealPhotoAI===false; save(); openHealthPrivacy(); }
async function wipeHealth(){
  if(!await ask("Erase every health reading, medication log, symptom and summary?\n\n"
    + "Your tasks, workouts, meals and everything else stay. This can't be undone — export first if you want a copy.",
    "Erase health data",1)) return;
  await HEALTH.wipe();
  closeAll(); renderHealth(); toast("Health data erased");
}

/* ================= MEAL PHOTO =================
   Shrink it here first — a phone photo is several megabytes and none of that
   extra detail helps identify a chicken breast. Smaller photo, faster answer,
   cheaper call. */
let mealShot=null, mealDraft=null;

function openMealCamera(){ $("mealFile").click(); }

async function shrinkImage(file, maxPx, quality){
  const url=URL.createObjectURL(file);
  const img=await new Promise((res,rej)=>{ const i=new Image();
    i.onload=()=>res(i); i.onerror=rej; i.src=url; });
  const scale=Math.min(1, maxPx/Math.max(img.width,img.height));
  const c=document.createElement("canvas");
  c.width=Math.round(img.width*scale); c.height=Math.round(img.height*scale);
  c.getContext("2d").drawImage(img,0,0,c.width,c.height);
  URL.revokeObjectURL(url);
  return c.toDataURL("image/jpeg", quality);
}

async function mealPhotoPicked(input){
  const f=input.files && input.files[0]; if(!f) return;
  input.value="";
  try{ mealShot=await shrinkImage(f, 1024, 0.7); }
  catch(e){ toast("Couldn't read that photo"); return; }
  drawMealShot("<span class='spin'></span> Looking at your plate…");
  closeAll(); openSheet("hlSheet");
  const r=await healthAI("meal", {image:mealShot});
  if(r.error){ drawMealShot(`<b style="color:#ff8f8f">Couldn't read the photo.</b><br>${esc(r.error)}
    <br><br>You can still type the meal in by hand.`); return; }
  mealDraft=r.result;
  drawMealDraft();
}
function drawMealShot(msg){
  $("hlSheetBody").innerHTML=`<h2>Meal photo</h2>
    ${mealShot?`<img src="${mealShot}" style="width:100%;border-radius:12px;margin-top:12px;max-height:38vh;object-fit:cover">`:``}
    <div class="wk-note" style="padding:14px 0">${msg}</div>
    <div class="btns"><button class="b b-ghost" style="width:100%" onclick="closeAll()">Close</button></div>`;
}
const CONF={high:{t:"High confidence",c:"#4fd6a5"},medium:{t:"Medium confidence",c:"#ff9d4d"},low:{t:"Low confidence",c:"#ff8f8f"}};

function drawMealDraft(){
  const d=mealDraft; if(!d) return;
  const conf=CONF[d.confidence]||CONF.low;
  const items=d.items||[];
  const tot=d.totals||{};
  $("hlSheetBody").innerHTML=`<h2>What I think this is</h2>
    ${mealShot?`<img src="${mealShot}" style="width:100%;border-radius:12px;margin-top:10px;max-height:26vh;object-fit:cover">`:``}
    <div style="margin-top:10px"><span class="vtag" style="background:${conf.c}22;color:${conf.c};border:1px solid ${conf.c}66">${conf.t}</span></div>

    ${d.question?`<div class="card" style="margin-top:12px;border-color:rgba(255,157,77,.45);background:rgba(255,157,77,.06)">
      <div style="padding:12px 14px">
        <div style="font-size:10px;font-weight:900;letter-spacing:.12em;color:#ff9d4d">IT'S NOT SURE</div>
        <div style="font-size:13.5px;line-height:1.5;margin-top:6px">${esc(d.question)}</div>
        <div style="font-size:11.5px;color:var(--ink3);margin-top:7px">Correct the numbers below and it's sorted.</div>
      </div></div>`:``}

    <label class="f" style="margin-top:14px">What it saw — edit anything</label>
    <div id="mdItems">${items.map((it,i)=>`<div class="exrow" style="margin-bottom:6px">
      <input class="f" value="${esc(it.name)}" oninput="mealDraft.items[${i}].name=this.value">
      <input class="f rp" type="number" inputmode="numeric" value="${it.kcal||0}"
             oninput="mealDraft.items[${i}].kcal=+this.value||0;retotalMeal()" title="calories">
      <input class="f rp" type="number" inputmode="numeric" value="${it.protein||0}"
             oninput="mealDraft.items[${i}].protein=+this.value||0;retotalMeal()" title="protein g">
      <div class="xx" onclick="mealDraft.items.splice(${i},1);retotalMeal();drawMealDraft()">✕</div>
    </div>
    <div style="font-size:10.5px;color:var(--ink3);margin:-2px 0 9px 26px">${esc(it.portion||"")} · ${it.kcal||0} kcal · ${it.protein||0}g protein</div>`).join("")}</div>
    <div style="font-size:10px;color:#5d6878;letter-spacing:.05em">NAME · CALORIES · PROTEIN</div>

    <div class="sess-sum" style="padding:14px 0 6px">
      <div class="ss"><b style="color:#ff9d4d" id="mdKcal">${tot.kcal||0}</b><span>Calories</span></div>
      <div class="ss"><b style="color:#4fd6a5" id="mdProt">${tot.protein||0}</b><span>Protein g</span></div>
      <div class="ss"><b>${tot.carbs||0}</b><span>Carbs g</span></div>
      <div class="ss"><b>${tot.fat||0}</b><span>Fat g</span></div>
    </div>
    ${tot.fiber?`<div style="font-size:11.5px;color:var(--ink3)">Fibre about ${tot.fiber} g</div>`:``}

    <div class="wk-note" style="padding:10px 0 0">This is an estimate from a picture, not a weighed measurement.
      Fix anything that looks off before saving — what you save is what gets tracked.</div>
    <div class="btns" style="margin-top:12px">
      <button class="b b-ghost" onclick="openMealCamera()">Retake</button>
      <button class="b b-primary" onclick="saveMealFromPhoto()">Save meal</button>
    </div>
    <div class="btns" style="margin-top:9px">
      <button class="b b-ghost" style="width:100%" onclick="closeAll()">Throw it away</button>
    </div>`;
}
function retotalMeal(){
  const it=mealDraft.items||[];
  const sum=k=>it.reduce((a,x)=>a+(+x[k]||0),0);
  mealDraft.totals={kcal:sum("kcal"), protein:sum("protein"), carbs:sum("carbs"), fat:sum("fat"), fiber:sum("fiber")};
  const k=$("mdKcal"), p=$("mdProt");
  if(k) k.textContent=mealDraft.totals.kcal;
  if(p) p.textContent=mealDraft.totals.protein;
}
function saveMealFromPhoto(){
  const d=mealDraft; if(!d||!(d.items||[]).length){ toast("Nothing to save"); return; }
  retotalMeal();
  const name=d.items.map(i=>i.name).filter(Boolean).slice(0,3).join(", ") || "Meal from a photo";
  meals.today.push({id:newId(), slot:mealSlotNow(), n:name,
    kcal:d.totals.kcal, p:d.totals.protein, t:new Date().toISOString(),
    src:"ai-meal", conf:d.confidence,
    items:d.items.map(i=>({n:i.name, portion:i.portion, kcal:i.kcal, p:i.protein}))});
  save();
  HEALTH.putMeasurement({type:"caloriesIn", value:d.totals.kcal, unit:"kcal", src:"ai-meal"});
  if(d.totals.protein) HEALTH.putMeasurement({type:"proteinG", value:d.totals.protein, unit:"g", src:"ai-meal"});
  /* Foods you photograph often become one-tap next time. */
  d.items.forEach(i=>{ if(!i.name) return;
    hlPrefs.foods = hlPrefs.foods || [];
    const ex=hlPrefs.foods.find(f=>f.n.toLowerCase()===i.name.toLowerCase());
    if(ex){ ex.seen=(ex.seen||1)+1; ex.kcal=i.kcal; ex.p=i.protein; }
    else hlPrefs.foods.push({n:i.name, kcal:i.kcal, p:i.protein, seen:1});
    hlPrefs.foods.sort((a,b)=>(b.seen||0)-(a.seen||0));
    hlPrefs.foods=hlPrefs.foods.slice(0,40);
  });
  save();
  mealDraft=null; mealShot=null;
  closeAll(); renderMeals(); renderHealth();
  toast(`Saved · ${d.totals.kcal} kcal, ${d.totals.protein}g protein`);
}
/* Anything you photograph more than once turns into a one-tap button. */
function logFoodPreset(i){
  const f=(hlPrefs.foods||[])[i]; if(!f) return;
  meals.today.push({id:newId(), slot:mealSlotNow(), n:f.n, kcal:f.kcal||0, p:f.p||0,
                    t:new Date().toISOString(), src:"manual"});
  f.seen=(f.seen||1)+1;
  save(); renderMeals();
  toast(`${f.n} · ${f.kcal} kcal`);
}
function mealSlotNow(){ const h=new Date().getHours();
  return h<11?"Breakfast":h<15?"Lunch":h<21?"Dinner":"Snack"; }

/* ================= HEALTH SIGNALS =================
   Relationships worked out here, in code, from your own numbers. Nothing in this
   file says one thing caused another — it can't know that, and neither can a
   model. Each signal carries how many days it rests on so you can judge it.

   Minimum sizes are enforced. A "pattern" from two days isn't a pattern. */
const SIG_MIN_SIDE = 3;      // days needed on each side of a comparison
const SIG_MIN_DOSE = 4;      // doses needed before comparing heart rate windows

const mean = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : null;
const r1 = v => Math.round(v*10)/10;

/* Heart rate around a point in time, straight from the samples. This is the one
   that needs your watch running all day — with workout-only readings there'd be
   nothing in the windows and it says so instead of guessing. */
async function hrAround(events, beforeH, afterFromH, afterToH){
  if(events.length < SIG_MIN_DOSE) return {n:events.length, tooFew:true};
  const days=[...new Set(events.map(e=>e.day))];
  const all=[];
  for(const d of days){
    const ms=await HEALTH.byDay("measurements", d);
    all.push(...ms.filter(m=>m.type==="heartRate"));
  }
  if(!all.length) return {n:events.length, noHR:true};
  const before=[], after=[];
  events.forEach(e=>{
    const t0=new Date(e.t).getTime();
    all.forEach(m=>{
      const dt=(new Date(m.t).getTime()-t0)/3600000;
      if(dt<0 && dt>=-beforeH) before.push(m.value);
      if(dt>=afterFromH && dt<=afterToH) after.push(m.value);
    });
  });
  if(before.length<5 || after.length<5) return {n:events.length, thin:true, before:before.length, after:after.length};
  return { n:events.length, before:r1(mean(before)), after:r1(mean(after)),
           beforeN:before.length, afterN:after.length, diff:r1(mean(after)-mean(before)) };
}

/* Split days by a condition and compare a metric across the two groups. */
function splitCompare(rows, test, metric){
  const yes=rows.filter(test).map(r=>r[metric]).filter(v=>typeof v==="number");
  const no =rows.filter(r=>!test(r)).map(r=>r[metric]).filter(v=>typeof v==="number");
  if(yes.length<SIG_MIN_SIDE || no.length<SIG_MIN_SIDE) return null;
  return { yes:r1(mean(yes)), no:r1(mean(no)), diff:r1(mean(yes)-mean(no)),
           nYes:yes.length, nNo:no.length };
}

async function healthSignals(days){
  days=days||90;
  const to=ymd(new Date()), d=new Date(); d.setDate(d.getDate()-days);
  const from=ymd(d);
  const rows=await HEALTH.dailyRange(from,to);
  const evs =await HEALTH.range("events", from, to);
  const out=[];
  const add=(text,detail,n)=>out.push({text, detail, n});

  if(rows.length < 7){
    return { signals:[], note:`Only ${rows.length} day${rows.length===1?"":"s"} of data so far. `
      + `Signals need a couple of weeks before they mean anything — keep logging.`, days:rows.length };
  }

  // sleep against resting heart rate
  const sleepHR=splitCompare(rows, r=>r.sleepHours>=7, "restingHeartRate");
  if(sleepHR) add(
    `On days after <b>7 hours or more</b> of sleep, your resting heart rate averaged `
    + `<b>${Math.abs(sleepHR.diff)} bpm ${sleepHR.diff<0?"lower":"higher"}</b>.`,
    `${sleepHR.yes} bpm on ${sleepHR.nYes} longer-sleep days vs ${sleepHR.no} on ${sleepHR.nNo} shorter ones.`,
    sleepHR.nYes+sleepHR.nNo);

  // caffeine against sleep
  const cafSleep=splitCompare(rows, r=>r.sleepHours<6.5, "caffeineMg");
  if(cafSleep && cafSleep.diff>0) add(
    `Your caffeine ran <b>${Math.abs(cafSleep.diff)} mg higher</b> on days following your shortest nights.`,
    `${cafSleep.yes} mg after ${cafSleep.nYes} nights under 6.5 hours vs ${cafSleep.no} mg otherwise.`,
    cafSleep.nYes+cafSleep.nNo);

  // steps on running days
  const runDays=new Set(cardio.filter(c=>c.d>=from).map(c=>c.d));
  const runSteps=splitCompare(rows, r=>runDays.has(r.date), "steps");
  if(runSteps && Math.abs(runSteps.diff)>300) add(
    `You averaged <b>${Math.abs(Math.round(runSteps.diff)).toLocaleString()} ${runSteps.diff>0?"more":"fewer"} steps</b> on days you ran.`,
    `${Math.round(runSteps.yes).toLocaleString()} on ${runSteps.nYes} running days vs ${Math.round(runSteps.no).toLocaleString()} on ${runSteps.nNo} others.`,
    runSteps.nYes+runSteps.nNo);

  // blood pressure direction
  const bp=rows.filter(r=>r.averageBloodPressure).map(r=>({d:r.date,s:r.averageBloodPressure.sys}));
  if(bp.length>=8){
    const half=Math.floor(bp.length/2);
    const early=mean(bp.slice(0,half).map(x=>x.s)), late=mean(bp.slice(half).map(x=>x.s));
    const shift=r1(late-early);
    if(Math.abs(shift)>=2) add(
      `Your top blood pressure number has been <b>trending ${shift<0?"down":"up"}</b> across these ${days} days.`,
      `${r1(early)} average over the first half of your readings, ${r1(late)} over the second. ${bp.length} readings total.`,
      bp.length);
  }

  // protein on strength days
  const liftDays=new Set(Object.values(wkHist).flat().filter(h=>h.d&&h.d>=from).map(h=>h.d));
  const protLift=splitCompare(rows, r=>liftDays.has(r.date), "proteinG");
  if(protLift && Math.abs(protLift.diff)>5) add(
    `You ate <b>${Math.abs(Math.round(protLift.diff))} g ${protLift.diff>0?"more":"less"} protein</b> on lifting days.`,
    `${Math.round(protLift.yes)} g on ${protLift.nYes} training days vs ${Math.round(protLift.no)} g on ${protLift.nNo} others.`,
    protLift.nYes+protLift.nNo);

  // symptoms against the days they landed on
  const sympDays=[...new Set(evs.filter(e=>e.kind==="symptom").map(e=>e.day))];
  if(sympDays.length>=3){
    const onSymp=rows.filter(r=>sympDays.includes(r.date));
    const off=rows.filter(r=>!sympDays.includes(r.date));
    const bpOn=onSymp.map(r=>r.averageBloodPressure&&r.averageBloodPressure.sys).filter(Boolean);
    const bpOff=off.map(r=>r.averageBloodPressure&&r.averageBloodPressure.sys).filter(Boolean);
    if(bpOn.length>=3 && bpOff.length>=3){
      const diff=r1(mean(bpOn)-mean(bpOff));
      if(Math.abs(diff)>=3) add(
        `On the ${sympDays.length} days you logged a symptom, your blood pressure averaged `
        + `<b>${Math.abs(diff)} ${diff<0?"lower":"higher"}</b> than on other days.`,
        `${r1(mean(bpOn))} vs ${r1(mean(bpOff))}. Worth mentioning to a doctor rather than reading into here.`,
        bpOn.length+bpOff.length);
    }
    const slOn=onSymp.map(r=>r.sleepHours).filter(v=>typeof v==="number");
    const slOff=off.map(r=>r.sleepHours).filter(v=>typeof v==="number");
    if(slOn.length>=3 && slOff.length>=3){
      const diff=r1(mean(slOn)-mean(slOff));
      if(Math.abs(diff)>=0.5) add(
        `Symptom days followed <b>${Math.abs(diff)} hours ${diff<0?"less":"more"} sleep</b> on average.`,
        `${r1(mean(slOn))} h before symptom days vs ${r1(mean(slOff))} h otherwise.`, slOn.length+slOff.length);
    }
  }

  // medication: heart rate before the dose vs 1–4 hours after
  const meds=evs.filter(e=>e.kind==="med");
  const medHR=await hrAround(meds, 2, 1, 4);
  if(medHR.tooFew) add(
    `Not enough doses logged yet to compare heart rate around your medication.`,
    `${medHR.n} logged. It needs at least ${SIG_MIN_DOSE}.`, medHR.n);
  else if(medHR.noHR || medHR.thin) add(
    `Not enough heart-rate readings around your doses to compare yet.`,
    `Your watch needs to be recording through the day for this one.`, medHR.n);
  else add(
    `In the <b>1–4 hours after</b> your medication, your heart rate averaged <b>${medHR.after} bpm</b>, `
    + `against <b>${medHR.before} bpm</b> in the two hours before — a difference of `
    + `<b>${medHR.diff>0?"+":""}${medHR.diff}</b>.`,
    `Across ${medHR.n} doses, ${medHR.beforeN} readings before and ${medHR.afterN} after. `
    + `This is what happened alongside your doses. It doesn't show what caused it, and it isn't a reason to change anything you've been prescribed.`,
    medHR.n);

  // caffeine and medication close together
  const caf=evs.filter(e=>e.kind==="caffeine");
  const overlapDays=[...new Set(meds.filter(m=>caf.some(c=>c.day===m.day &&
    Math.abs(new Date(c.t)-new Date(m.t))/3600000 <= 2)).map(m=>m.day))];
  if(overlapDays.length>=SIG_MIN_SIDE && rows.length-overlapDays.length>=SIG_MIN_SIDE){
    const pmHR=async(dayList)=>{ const v=[];
      for(const d of dayList){ const ms=await HEALTH.byDay("measurements",d);
        ms.filter(m=>m.type==="heartRate").forEach(m=>{ const h=new Date(m.t).getHours();
          if(h>=12&&h<18) v.push(m.value); }); }
      return v; };
    const on=await pmHR(overlapDays);
    const offDays=rows.map(r=>r.date).filter(d=>!overlapDays.includes(d));
    const off=await pmHR(offDays);
    if(on.length>=10 && off.length>=10){
      const diff=r1(mean(on)-mean(off));
      if(Math.abs(diff)>=1) add(
        `Your afternoon heart rate averaged <b>${Math.abs(diff)} bpm ${diff>0?"higher":"lower"}</b> on days when `
        + `caffeine and your medication landed <b>within two hours</b> of each other.`,
        `${r1(mean(on))} bpm across ${overlapDays.length} overlap days vs ${r1(mean(off))} on ${offDays.length} others, midday to 6pm.`,
        overlapDays.length+offDays.length);
    }
  }

  return { signals: out, days: rows.length,
    note: out.length ? "" : `Nothing stood out across ${rows.length} days. That's a fine answer — it means nothing's swinging much.` };
}

/* ---- personal baselines, 7 / 30 / 90 ---- */
async function baselines(metric){
  const out={};
  for(const n of [7,30,90]){
    const to=ymd(new Date()), d=new Date(); d.setDate(d.getDate()-n);
    const rows=await HEALTH.dailyRange(ymd(d),to);
    const vals=rows.map(r=>r[metric]).filter(v=>typeof v==="number");
    out[n]= vals.length>=3 ? {avg:r1(mean(vals)), n:vals.length} : null;
  }
  return out;
}

async function renderSignals(){
  $("hlSheetBody").innerHTML=`<h2>Health Signals</h2>
    <div class="wk-note" style="padding:14px 0"><span class="spin"></span> Going through your numbers…</div>`;
  closeAll(); openSheet("hlSheet");
  const r=await healthSignals(90);
  const rhr=await baselines("restingHeartRate");
  const wt=await baselines("weight");
  const baseRow=(label,b,unit)=>{
    const parts=[7,30,90].map(n=>b[n]?`<span style="color:var(--ink2)">${n}d</span> ${b[n].avg}`:null).filter(Boolean);
    return parts.length?`<div class="meta"><span class="k">${label}</span>
      <span class="v" style="font-size:12px">${parts.join(" · ")}${unit?" "+unit:""}</span></div>`:"";
  };
  $("hlSheetBody").innerHTML=`<h2>Health Signals</h2>
    <div style="font-size:12.5px;color:var(--ink3);line-height:1.5;margin-top:4px">
      Worked out on your device from ${r.days} days. These are things that happened
      <b>alongside</b> each other — not proof one caused the other.</div>
    ${r.note?`<div class="wk-note" style="padding:14px 0">${r.note}</div>`:``}
    ${r.signals.map(s=>`<div class="card" style="margin-top:12px">
      <div style="padding:13px 16px">
        <div style="font-size:14px;line-height:1.55">${s.text}</div>
        <div style="font-size:11.5px;color:var(--ink3);line-height:1.5;margin-top:8px">${s.detail}</div>
        <div style="font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;
             color:${s.n>=20?'#4fd6a5':s.n>=10?'#ff9d4d':'#ff8f8f'};margin-top:8px">
          based on ${s.n} ${s.n>=20?"days — reasonably solid":s.n>=10?"days — early days":"days — treat as a hint"}</div>
      </div></div>`).join("")}
    ${(rhr[30]||wt[30])?`<div class="card" style="margin-top:12px">
      <div class="card-head"><span class="card-title">Your own baselines</span></div>
      <div style="padding:0 16px 12px">
        ${baseRow("Resting HR",rhr,"bpm")}
        ${baseRow("Weight",wt,"lb")}
      </div>
      <div class="wk-note" style="padding:0 16px 13px">Compared against your own averages, not a population chart.</div>
    </div>`:``}
    <div class="wk-note" style="padding:12px 2px 0">Patterns, not diagnoses. Nothing here is a reason to change
      a prescription — that's a conversation for whoever prescribes it.</div>
    <div class="btns"><button class="b b-ghost" style="width:100%" onclick="closeAll()">Close</button></div>`;
}

/* ================= DAY NOTE ================= */
const BLOCKERS=["Work ran long","Sick","Low energy","Family stuff","Traveling","Something broke","Weather","Money","Slept in","Just didn't"];
let dayNote={text:"",tags:[]};

function renderDayNote(){
  const box=$("dnBox"), has=dayNote.text||dayNote.tags.length;
  $("dnLink").textContent = has?"Edit":"Add";
  box.innerHTML = has
    ? `<div class="dn-box filled">
         ${dayNote.text?`<div class="txt">${esc(dayNote.text)}</div>`:``}
         ${dayNote.tags.length?`<div class="dn-tags">${dayNote.tags.map(t=>`<span class="dn-tag">${esc(t)}</span>`).join("")}</div>`:``}
       </div>`
    : `<div class="dn-box"><div class="ph">Nothing logged. Tap here if something threw your day off — you'll be glad you wrote it down when you look back.</div></div>`;
  box.firstElementChild.onclick=openDayNote;
}
function openDayNote(){
  $("blList").innerHTML=BLOCKERS.map(b=>
    `<span class="bl${dayNote.tags.includes(b)?" on":""}" onclick="toggleBlocker(this,'${b}')">${b}</span>`).join("");
  $("dnText").value=dayNote.text;
  openSheet("daynote");
}
function toggleBlocker(el,b){
  el.classList.toggle("on");
  dayNote.tags = dayNote.tags.includes(b) ? dayNote.tags.filter(x=>x!==b) : [...dayNote.tags,b];
}
function saveDayNote(){
  dayNote.text=$("dnText").value.trim();
  closeAll(); renderDayNote();
  toast(dayNote.text||dayNote.tags.length ? "Logged for today" : "Nothing to save");
}
function clearDayNote(){ const snap=JSON.parse(JSON.stringify(dayNote));
  dayNote={text:"",tags:[]}; save(); closeAll(); renderDayNote();
  toastUndo("Cleared", ()=>{ dayNote=snap; renderDayNote(); }); }

/* ================= TRACKER ================= */
/* 34 days of past history + today live from the task list */
const history = {};
function seedHistory(){
  tasks.filter(t=>t.routine).forEach(t=>{
    if(history[t.id] && history[t.id].length) return;   // never wipe real history
    const days=[]; for(let i=34;i>=1;i--){ const d=new Date(); d.setDate(d.getDate()-i); days.push({date:d,v:0}); }
    history[t.id]=days;
  });
}
let trackerHelp=false;
const MON3=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function toggleGridHelp(){ trackerHelp=!trackerHelp; renderTracker(); }
function renderTracker(){
  const box=$("trackerBody"); if(!box) return;
  const list=tasks.filter(isCounter);
  const checkboxes=tasks.filter(t=>t.routine && !isCounter(t) && !t.paused);
  const footer = checkboxes.length ? `<div class="card"><div class="card-head"><span class="card-title">Not counted</span>
      <span class="link" onclick="go('routines')">Routines ›</span></div>
      <div class="wk-note" style="padding:0 16px 14px">${checkboxes.length} routine${checkboxes.length===1?"":"s"} are
      simple done-or-not, so they don't get a card here — ${checkboxes.slice(0,4).map(t=>esc(t.name)).join(", ")}${
      checkboxes.length>4?`, +${checkboxes.length-4} more`:``}. Give one a target above 1 and it shows up.</div></div>` : "";
  if(!list.length){ box.innerHTML='<div class="card"><div class="empty">No counting routines yet.<br>Add a routine and set <b>Times per day</b> above 1.</div></div>'+footer; return; }

  /* People kept reading the grid as a calendar month. It isn't — it's one square
     per day since the routine started. Saying so up front beats explaining it. */
  const legend = `<div class="card" style="border-color:rgba(61,132,255,.3)">
      <div class="card-head"><span class="card-title">Reading the squares</span>
        <span class="link" onclick="toggleGridHelp()" id="gridHelpLink">${trackerHelp?"Hide":"What is this?"}</span></div>
      ${trackerHelp?`<div class="wk-note" style="padding:2px 16px 14px;line-height:1.6">
        Each square is <b>one day</b>, with the <b>date written on it</b>. Rows run Sunday to Saturday,
        like a calendar. The first square is the day you started the routine; the one with the
        outline is <b>today</b>. When a new month starts, its name is written on the 1st.<br><br>
        <b style="color:#4fd6a5">Solid</b> — you hit the target that day<br>
        <b style="color:#4fd6a5;opacity:.5">Faded</b> — you did some, not all<br>
        <b style="color:var(--ink3)">Empty</b> — nothing logged<br><br>
        The four numbers underneath come from those same squares: <b>Streak</b> is how many
        days in a row right now, <b>Best run</b> is the longest you've ever managed,
        <b>Days hit</b> is how many squares are solid, and <b>Avg/day</b> is the average.
      </div>`:``}
    </div>`;

  box.innerHTML = legend + list.map(t=>{
    const c=catOf(t.cat);
    const days=[...(history[t.id]||[]).map(d=>({...d, date:(d.date instanceof Date)?d.date:new Date(d.date)})),
                {date:new Date(), v:t.count, today:true}];
    const pct=Math.min(100,Math.round(t.count/t.target*100));
    const hit=days.filter(d=>d.v>=t.target).length;
    const avg=(days.reduce((a,d)=>a+d.v,0)/days.length);
    // best streak across the window
    let best=0,run=0; days.forEach(d=>{ if(d.v>=t.target){run++;best=Math.max(best,run);} else run=0; });
    const capped=isCapped(t);
    const overDays=days.filter(d=>d.v>t.target).length;
    const cells=days.map(d=>{
      const f=d.v/t.target, over=d.v>t.target;
      const cls = d.v>=t.target ? "" : f>0 ? "part" : "";
      /* on a routine with a ceiling, a day you went over is its own thing —
         it isn't a win and it shouldn't look like one */
      const style = (capped && over)
        ? `background:#ff5f7e;border-color:#ff5f7e;box-shadow:0 0 8px rgba(255,95,126,.45)`
        : d.v>=t.target
        ? `background:${c.fg};border-color:${c.fg};box-shadow:0 0 8px ${c.fg}55`
        : f>0 ? `background:${c.fg};opacity:${(0.20+f*0.45).toFixed(2)};border-color:transparent` : "";
      const dd=(d.date instanceof Date && !isNaN(d.date))?d.date:null;
      const first=dd&&dd.getDate()===1;
      return `<div class="gd ${cls}${d.today?" today":""}${first?" m1":""}" style="${style}" title="${dd?dd.toDateString()+" · ":""}${d.v}/${t.target}${capped&&over?" — over":""}"><span>${dd?(first?MON3[dd.getMonth()]:dd.getDate()):""}</span></div>`;
    }).join("");
    // pad the front so columns line up with the weekday letters
    const firstDay = (days[0] && days[0].date instanceof Date && !isNaN(days[0].date)) ? days[0].date.getDay() : 0;
    const pad='<div style="aspect-ratio:1"></div>'.repeat(firstDay);
    return `<div class="card">
      <div class="tk-top">
        <div class="icon" style="background:${c.bg}">${c.icon}</div>
        <div class="tk-name"><b>${esc(t.name)}</b><span style="color:${c.fg}">${t.target} ${unitOf(t)} a day</span></div>
        <div class="tk-big"><b style="color:${t.done?'#12c98a':c.fg}">${t.count}<span style="color:var(--ink3);font-size:13px">/${t.target}</span></b>
          <small style="${(capped&&t.count>t.target)?'color:#ff8aa0':''}">${t.count>t.target?`+${Math.round((t.count-t.target)*100)/100} over`:t.done?"hit today":"today"}</small></div>
      </div>
      <div class="tk-bar"><i style="width:${pct}%;background:${t.done?'linear-gradient(90deg,#0ea472,#16d494)':c.fg}"></i></div>
      <div class="gspan">${(()=>{const a=days[0]&&days[0].date, b=new Date(); return (a instanceof Date&&!isNaN(a))?`${MON3[a.getMonth()]} ${a.getDate()} → today (${MON3[b.getMonth()]} ${b.getDate()}) · one square per day`:"one square per day";})()}</div>
      <div class="gdays"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>
      <div class="grid">${pad}${cells}</div>
      <div class="tk-legend">
        <span><i style="background:${c.fg}"></i>${capped?"At the limit":"Hit it"}</span>
        <span><i style="background:${c.fg};opacity:.4"></i>Partial</span>
        <span><i style="background:#151b24;border:1px solid #212a36"></i>${capped?"None":"Missed"}</span>
        ${capped?`<span><i style="background:#ff5f7e"></i>Over</span>`:``}
      </div>
      ${capped?`<div class="wk-note" style="padding:2px 16px 12px;font-size:11.5px">
        <b style="color:${overDays?'#ff8aa0':'#4fd6a5'}">${overDays}</b> day${overDays===1?"":"s"}
        over your limit of ${t.target} ${unitOf(t)} in this stretch${overDays?" — the red squares.":"."}
      </div>`:``}
      <div class="tgt">
        <div style="flex:1;min-width:0">
          <div class="tgl">Daily target</div>
          <div class="tgv">${t.target} <span>${unitOf(t)} a day</span></div>
        </div>
        <div class="stepbtn${t.target<=2?" off":""}" onclick="bumpTarget(${t.id},-1)">−</div>
        <div class="stepbtn plus" onclick="bumpTarget(${t.id},1)">+</div>
        <div class="crbtn take" style="background:#1e2734;color:#7fb0ff;border:1px solid #2c374a;height:34px"
             onclick="openRoutineEdit(${t.id})">Edit</div>
      </div>
      <div class="tk-stats">
        <div class="tk-stat"><b style="color:${c.fg}">🔥 ${t.streak}</b><span>Streak</span></div>
        <div class="tk-stat"><b>${best}</b><span>Best run</span></div>
        <div class="tk-stat"><b>${hit}<span style="color:var(--ink3);font-size:11px">/${days.length}</span></b><span>Days hit</span></div>
        <div class="tk-stat"><b>${avg.toFixed(1)}</b><span>Avg / day</span></div>
      </div>
    </div>`;
  }).join("") + footer;
}

/* ================= WORKOUTS ================= */
/* The four lifting workouts. t:"w" means it takes weight, t:"r" is reps only.
   d is the default rep count — the first tap of + jumps straight to it so you
   aren't counting up from one. rounds is how many times you go through the
   whole list in one session. */
const WK=[
  {id:"cb",name:"Chest & Back",icon:"🫁",fg:"#5b9dff",bg:"#0f1d33",perWeek:1,days:["Tue"],rounds:2,ex:[
    {n:"Standard Push-Ups",t:"r",d:25},
    {n:"Wide Front Pull-Ups",t:"r",d:10},
    {n:"Military Push-Ups",t:"r",d:20},
    {n:"Reverse Grip Chin-Ups",t:"r",d:10},
    {n:"Wide Fly Push-Ups",t:"r",d:15},
    {n:"Closed Grip Overhand Pull-Ups",t:"r",d:8},
    {n:"Decline Push-Ups",t:"r",d:15},
    {n:"Heavy Pants",t:"w",d:12},
    {n:"Diamond Push-Ups",t:"r",d:12},
    {n:"Lawnmowers",t:"w",d:12},
    {n:"Dive-Bomber Push-Ups",t:"r",d:12},
    {n:"Back Flys",t:"w",d:12}]},
  {id:"sa",name:"Arms & Shoulders",icon:"💪",fg:"#ff5f7e",bg:"#2a1119",perWeek:1,days:["Thu"],rounds:1,ex:[
    {n:"Alternating Shoulder Press",t:"w",d:12},
    {n:"In & Out Bicep Curls",t:"w",d:12},
    {n:"Two-Arm Tricep Kickbacks",t:"w",d:12},
    {n:"Deep Swimmer's Press",t:"w",d:10},
    {n:"Full Supination Concentration Curls",t:"w",d:10},
    {n:"Chair Dips",t:"r",d:15},
    {n:"Upright Rows",t:"w",d:12},
    {n:"Static Arm Curls",t:"w",d:10},
    {n:"Flip-Grip Twist Tricep Kickbacks",t:"w",d:10},
    {n:"Two-Angle Shoulder Flys",t:"w",d:10},
    {n:"Crouching Cohen Curls",t:"w",d:10},
    {n:"Lying Down Tricep Extensions",t:"w",d:12},
    {n:"In & Out Straight-Arm Shoulder Flys",t:"w",d:10},
    {n:"Congdon Curls",t:"w",d:10},
    {n:"Side Tri-Rises",t:"r",d:12}]},
  {id:"lb",name:"Legs & Back",icon:"🦵",fg:"#2fd39a",bg:"#0d2620",perWeek:1,days:["Fri"],rounds:1,ex:[
    {n:"Balance Lunges",t:"w",d:12},
    {n:"Calf-Raise Squats",t:"w",d:15},
    {n:"Reverse Grip Chin-Ups",t:"r",d:10},
    {n:"Super Skaters",t:"r",d:15},
    {n:"Wall Squats",t:"r",d:1},
    {n:"Wide Front Pull-Ups",t:"r",d:10},
    {n:"Step Back Lunges",t:"w",d:12},
    {n:"Alternating Side Lunges",t:"r",d:12},
    {n:"Closed Grip Overhand Pull-Ups",t:"r",d:8},
    {n:"Single Leg Wall Squat",t:"r",d:1},
    {n:"Deadlift Squats",t:"w",d:12},
    {n:"Switch Grip Pull-Ups",t:"r",d:8},
    {n:"Three-Way Lunges",t:"r",d:8},
    {n:"Sneaky Lunges",t:"r",d:12},
    {n:"Reverse Grip Chin-Ups — 2nd set",t:"r",d:8},
    {n:"Screamer Lunges",t:"r",d:12},
    {n:"Wide Front Pull-Ups — 2nd set",t:"r",d:8},
    {n:"Groucho Walk",t:"r",d:1},
    {n:"Closed Grip Overhand Pull-Ups — 2nd set",t:"r",d:6},
    {n:"Calf Raises",t:"w",d:20},
    {n:"Switch Grip Pull-Ups — 2nd set",t:"r",d:6}]},
  {id:"core",name:"Abs",icon:"🔥",fg:"#ff9d4d",bg:"#2a1a0b",perWeek:2,days:["Mon","Wed"],rounds:1,ex:[
    {n:"In & Outs",t:"r",d:25},
    {n:"Seated Bicycles — Forward",t:"r",d:25},
    {n:"Seated Bicycles — Reverse",t:"r",d:25},
    {n:"Crunchy Frog",t:"r",d:25},
    {n:"Wide Leg Sit-Ups",t:"r",d:25},
    {n:"Fifer Scissors",t:"r",d:25},
    {n:"V-Up / Roll-Up Combo",t:"r",d:25},
    {n:"Oblique V-Ups",t:"r",d:25},
    {n:"Leg Climbs — Left",t:"r",d:12},
    {n:"Leg Climbs — Right",t:"r",d:12},
    {n:"Mason Twist",t:"w",d:50}]}
];

/* Warm up and stretch. Same block for every lifting day, a separate one for
   cardio. Ticking them off is optional — they're a plan, not another chore. */
const PREP={
  lift:{
    warm:[["Jog in place","2 min"],["Jumping jacks","30"],["Side-to-side hops","30"],
          ["Arm circles — forward then back","20 each"],["Shoulder rolls","15"],
          ["Wrist and neck rolls","10 each"],["Hip circles","10 each way"],["Bodyweight squats","15"]],
    cool:[["Chest doorway stretch","30 sec each"],["Cross-body shoulder stretch","30 sec each"],
          ["Overhead tricep stretch","30 sec each"],["Wall bicep stretch","30 sec each"],
          ["Lat stretch — hang or reach","30 sec each"],["Standing forward fold","45 sec"],
          ["Quad stretch","30 sec each"],["Kneeling hip flexor","45 sec each"],
          ["Hamstring stretch","45 sec each"],["Calf stretch on a wall","30 sec each"],
          ["Child's pose","60 sec"]]
  },
  cardio:{
    warm:[["Brisk walk → light jog","2–3 min"],
          ["Front-to-back leg swings","10 each leg"],
          ["Side-to-side leg swings","10 each leg"],
          ["Bodyweight squats","10"],
          ["Walking lunges","6 each leg"],
          ["Calf raises","15"],
          ["Ankle circles","10 each direction"],
          ["High knees","15–20 sec"]],
    cool:[["Easy walk","3–5 min"],
          ["Standing calf stretch","30 sec each leg"],
          ["Standing quad stretch","30 sec each leg"],
          ["Hamstring stretch","30 sec each leg"],
          ["Butterfly stretch","30–45 sec"],
          ["Hip-flexor lunge stretch","30 sec each side"],
          ["Figure-4 / glute stretch","30 sec each side"]]
  }
};
/* ---- load on a bodyweight move ------------------------------------------
   A vest, bands, dumbbells, a plate or ankle weights. It is recorded and shown,
   and it deliberately does NOT change any total: 25 push-ups scores 25 whether
   or not you were carrying 30 lb. Every chart and every "% of last time" keeps
   reading the same number it always has, so nothing already logged re-scores.
   What it buys you is honesty in history — "25 push-ups" in June and "25
   push-ups in a 30 lb vest" in September stop looking like the same workout. */
const KIT={
  vest : {lbl:"Vest",      tag:"VEST",  cls:"k-vest",  num:1, def:20},
  db   : {lbl:"Dumbbells", tag:"DB",    cls:"k-db",    num:1, def:25},
  plate: {lbl:"Plate",     tag:"PLATE", cls:"k-plate", num:1, def:25},
  ankle: {lbl:"Ankle",     tag:"ANKLE", cls:"k-ankle", num:1, def:5},
  band : {lbl:"Bands",     tag:"BANDS", cls:"k-band",  num:0, levels:["Light","Medium","Heavy"]}
};
const KIT_ORDER=["vest","db","plate","ankle","band"];
/* What you used on a move last time, offered as a one-tap shortcut. It is never
   applied on its own — the app does not get to claim you wore a vest. */
let exLoad={};
let prepDone={};    // "lift-warm-3" -> true, just for today
const defReps = e => (e && e.d) || 1;

const wkById = id => WK.find(w=>w.id===id);
const DOW=["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
let wkHist={};      // id -> [{ago, vol, entries:{}}]  most recent last
let wkSession=null;

function seedWorkouts(){ WK.forEach(w=>{ if(!wkHist[w.id]) wkHist[w.id]=[]; }); }
/* How many days ago a logged session was. It used to store a fixed number that
   never moved, so a workout from last week still read "today" forever. Anything
   with a real date on it now gets worked out properly; older records fall back
   to the number they were saved with. */
function daysAgo(rec){
  if(!rec) return null;
  if(rec.d){ const then=new Date(rec.d+"T12:00:00"), now=new Date();
    if(!isNaN(then)) return Math.max(0, Math.round((now - then)/864e5)); }
  return rec.ago==null ? null : rec.ago;
}
/* ---- counting by the week, not by the day ----
   A workout set for Thursday still counts if you did it on Monday. What matters
   is how many times you got it done this week, not which square it landed on. */
function sessionsThisWeek(id){
  const [a,b]=weekBounds(0);
  /* a session still in progress is kept and shown, but doesn't tick the week off
     until you finish it — otherwise starting one would count as doing one */
  return (wkHist[id]||[]).filter(h=>h.d && !h.partial && h.d>=a && h.d<=b);
}
const weekTarget = w => Math.max(1, w.perWeek || (w.days?w.days.length:1));
const weekDone   = w => sessionsThisWeek(w.id).length;
const weekMet    = w => weekDone(w) >= weekTarget(w);
function doneDaysThisWeek(id){
  return new Set(sessionsThisWeek(id).map(h=>DOW[new Date(h.d+"T12:00:00").getDay()]));
}
/* The last 7 days, for logging a session you did earlier in the week. */
function recentDays(){
  return Array.from({length:7},(_,i)=>{ const d=new Date(); d.setDate(d.getDate()-i);
    return {key:ymd(d), label:i===0?"Today":i===1?"Yesterday":DOW[d.getDay()]}; });
}
/* Finished sessions only. A session still in progress lives in the same list so
   it can't be lost, but everything that reads history for comparison, charts or
   "last done" must skip it. */
const doneSess = id => (wkHist[id]||[]).filter(h=>h && !h.partial);
const lastSess = id => doneSess(id).slice(-1)[0] || {ago:null,vol:0,entries:{}};
/* v53: the session you're compared against. A finished session that barely has
   anything in it (a few test taps) isn't a real "last time" — comparing against
   it produced numbers like 45333%. Needs at least a quarter of the usual reps. */
const sessReps = h => Object.values((h&&h.entries)||{}).reduce((a,v)=>a+(+v.reps||0),0);
const realSess = id => { const w=wkById(id);
  const usual = w ? w.ex.reduce((a,e)=>a+defReps(e),0)*Math.max(1,w.rounds||1) : 0;
  const min = Math.max(5, usual*0.25);
  return doneSess(id).filter(h=>sessReps(h)>=min); };
const baseSess = id => realSess(id).slice(-1)[0] || {ago:null,vol:0,entries:{}};
function agoLabel(d){
  if(d==null) return "never";
  if(d===0) return "today"; if(d===1) return "yesterday";
  if(d<7) return d+" days ago"; if(d<14) return "last week";
  if(d<60) return Math.round(d/7)+" weeks ago";
  return Math.round(d/30)+" months ago";
}
function dateFromAgo(d){ const x=new Date(); x.setDate(x.getDate()-d);
  return x.toLocaleDateString(undefined,{month:"short",day:"numeric"}); }

/* ---- the month at a glance ----------------------------------------------
   The card used to show a bar per session, which answers "how hard was that one"
   — a question you can only ask once there's a stack of them. What you actually
   want from the card is "how much did I train this month", so it's a calendar
   month instead: one square a day, filled on the days you trained.

   Same shape as the Tracker grid on purpose. One visual language to learn, not two.
   The bar chart still lives in History, where the detail belongs. */
function monthGrid(w, offset){
  const now=new Date();
  const first=new Date(now.getFullYear(), now.getMonth()+(offset||0), 1);
  const last =new Date(first.getFullYear(), first.getMonth()+1, 0);
  const done=new Set(doneSess(w.id).map(h=>h.d).filter(Boolean));
  const today=ymd(now);
  const sched=new Set(w.days||[]);        // e.g. ["Mon","Wed"]
  const target=Math.max(1, w.perWeek || (w.days?w.days.length:1));

  /* Laid out a week per row, so the row itself can carry a verdict: a tick at the
     end of any week where you hit your target. That answers "did I get my full
     workout that week" without a number on every square. */
  const rows=[]; let week=[], count=0, madeUp=0, missed=0;
  for(let i=0;i<first.getDay();i++) week.push(null);
  for(let d=1; d<=last.getDate(); d++){
    const dt=new Date(first.getFullYear(), first.getMonth(), d);
    const key=ymd(dt), dow=DOW[dt.getDay()];
    const hit=done.has(key), due=sched.has(dow), past=key<today;
    let state = hit ? (due?"did":"madeup") : (due ? (past?"missed":"due") : "off");
    if(hit) count++;
    if(state==="madeup") madeUp++;
    if(state==="missed") missed++;
    week.push({key, d, dow, state, today:key===today, dt});
    if(week.length===7){ rows.push(week); week=[]; }
  }
  if(week.length){ while(week.length<7) week.push(null); rows.push(week); }

  const cellHTML=c=>{
    if(!c) return '<div style="aspect-ratio:1"></div>';
    const s=c.state;
    const style = s==="did"    ? `background:${w.fg};border-color:${w.fg};box-shadow:0 0 7px ${w.fg}55`
                : s==="madeup" ? `background:${w.fg};border-color:${w.fg};opacity:.6`
                : s==="missed" ? `border-color:rgba(255,95,126,.65);background:rgba(255,95,126,.08)`
                : s==="due"    ? `border-color:${w.fg}66;border-style:dashed`
                : "";
    const tip=`${c.dt.toLocaleDateString(undefined,{weekday:'long',month:'short',day:'numeric'})}`
      + (s==="did"?" — done":s==="madeup"?" — made up":s==="missed"?" — missed":s==="due"?" — scheduled":"");
    return `<div class="gd${c.today?" today":""}" style="${style}" title="${tip}">${
      s==="madeup"?'<i class="mk-up"></i>':""}</div>`;
  };
  /* a week counts as complete once it holds as many sessions as the target */
  const weekTick=wk=>{
    const real=wk.filter(c=>c && (c.state==="did"||c.state==="madeup"));
    if(!real.length) return `<span class="wtick"></span>`;
    const anyPast=wk.some(c=>c && c.key<=today);
    return real.length>=target
      ? `<span class="wtick ok" style="color:${w.fg}" title="Week complete — ${real.length} of ${target}">✓</span>`
      : `<span class="wtick part" title="${real.length} of ${target} this week">${real.length}/${target}</span>`;
  };

  const label=first.toLocaleDateString(undefined,{month:"long"});
  return `<div class="mgrid">
    <div class="mgrid-head">
      <span class="mg-month">${label}</span>
      <span class="mg-count" style="color:${count?w.fg:'var(--ink3)'}">${count}
        <em>session${count===1?"":"s"}</em></span>
    </div>
    <div class="mg-row mg-head-row">${DOW.map(d=>`<span class="mg-dl">${d[0]}</span>`).join("")}<span class="wtick"></span></div>
    ${rows.map(wk=>`<div class="mg-row">${wk.map(cellHTML).join("")}${weekTick(wk)}</div>`).join("")}
    <div class="mg-key">
      <span><i style="background:${w.fg};border-color:${w.fg}"></i>Done</span>
      <span><i style="background:${w.fg};opacity:.6;border-color:${w.fg}"></i>Made up</span>
      <span><i style="border-color:rgba(255,95,126,.65);background:rgba(255,95,126,.08)"></i>Missed</span>
      <span><i style="border-color:${w.fg}66;border-style:dashed"></i>Coming up</span>
    </div>
  </div>`;
}

/* Something to beat. A plain percentage doesn't land the way "best ever" does,
   so the strongest true thing gets said first. */
function beatBadge(w,last,prev,pct){
  const all=realSess(w.id).map(sessReps);
  const best=Math.max(0,...all.slice(0,-1)), lastN=all[all.length-1]||0;
  if(lastN>0 && lastN>best && all.length>1)
    return `<span class="beat best">★ Best ever</span> ${lastN.toLocaleString()} reps — your highest yet.`;
  if(pct>0)  return `<span class="beat up">▲ +${pct}%</span> more reps than the time before. Keep it there.`;
  if(pct===0) return `<span class="beat lvl">= Level</span> same as last time.`;
  return `<span class="beat dn">▼ ${pct}%</span> down on last time. One session doesn't mean much.`;
}

function chartFor(w,big){
  const h=doneSess(w.id); if(!h.length) return "";
  const max=Math.max(...h.map(s=>s.vol))||1;
  let out="";
  h.forEach((s,i)=>{
    const prev=h[i-1];
    if(prev && daysAgo(prev) - daysAgo(s) > 35) out+=`<div class="gapmark" title="long gap">⋯</div>`;
    const pct=Math.max(6,Math.round(s.vol/max*100));
    const drop = prev && s.vol < prev.vol;
    const col = drop ? "#ff7a7a" : w.fg;
    out+=`<div class="bar" title="${dateFromAgo(daysAgo(s))} · ${s.vol.toLocaleString()}">
      ${big?`<div class="vv" style="color:${col}">${(s.vol/1000>=1?(s.vol/1000).toFixed(1)+"k":s.vol)}</div>`:``}
      <i style="height:${pct}%;background:linear-gradient(180deg,${col},${col}44)"></i>
      <em>${dateFromAgo(daysAgo(s)).replace(" ago","")}</em></div>`;
  });
  return out;
}

let wkTab="strength";
function setTab(t){ wkTab=t; renderWorkouts(); }
function renderTabs(){
  $("wkTabs").innerHTML=[["strength","Strength"],["cardio","Cardio"]]
    .map(([k,l])=>`<div class="tb${wkTab===k?" on":""}" onclick="setTab('${k}')">${l}</div>`).join("");
}

/* What's actually on for today, before the full list. Anything already covered
   this week shows as covered — that's the point of counting by the week. */
function todayCard(){
  const today=DOW[new Date().getDay()];
  const dueToday=WK.filter(w=>w.days.includes(today));
  const owed=WK.filter(w=>!weekMet(w) && !dueToday.includes(w));
  const row=(w,note,tone)=>`<div class="lg" style="cursor:pointer" onclick="openWorkout('${w.id}')">
      <div class="icon" style="background:${w.bg}">${w.icon}</div>
      <div class="lm"><b>${esc(w.name)}</b><span style="color:${tone}">${note}</span></div>
      <div class="crbtn take" style="background:${w.bg};color:${w.fg};border:1px solid ${w.fg}55">
        ${weekMet(w)?"Again":"Start"}</div>
    </div>`;
  let body="";
  if(dueToday.length){
    body += dueToday.map(w=>weekMet(w)
      ? row(w, `Already done this week — ${[...doneDaysThisWeek(w.id)].join(", ")}`, "#4fd6a5")
      : row(w, weekDone(w) ? `${weekDone(w)} of ${weekTarget(w)} done — one more` : "Due today", "#ff9d4d")
    ).join("");
  } else {
    body += `<div class="wk-note" style="padding:2px 16px 12px">Nothing scheduled today. Rest day —
      unless you want to pull one forward from below.</div>`;
  }
  if(owed.length){
    body += `<div class="wk-note" style="padding:2px 16px 12px">
      <b style="color:#ff9d4d">Still owed this week:</b> ${owed.map(w=>esc(w.name)+
        (weekTarget(w)>1?` (${weekDone(w)}/${weekTarget(w)})`:"")).join(", ")}</div>`;
  }
  const allMet = WK.every(weekMet);
  return `<div class="card" style="border-color:${allMet?'rgba(18,201,138,.45)':'rgba(61,132,255,.35)'};position:relative">
    <div class="coachsq" onclick="coachMe()" title="AI Coach">
      <span>✨</span>AI Coach</div>
    <div class="card-head">
      <span class="card-title">Today · ${new Date().toLocaleDateString(undefined,{weekday:"long"})}</span>
      <span class="link" style="color:${allMet?'#4fd6a5':'#7fb0ff'}">
        ${WK.filter(weekMet).length} of ${WK.length} done this week</span></div>
    ${body}
  </div>`;
}

/* Hands your actual numbers to the model and asks for a read. Advice only —
   it can't change a workout or log a session, same rule as everywhere else. */
async function coachMe(){
  $("nodeBody").innerHTML=`<h2>Reading your training…</h2>
    <div class="wk-note" style="padding:14px 0"><span class="spin"></span> Looking at your sessions, volume and cardio.</div>`;
  closeAll(); openSheet("node");
  let html=null, live=false;
  if(AI.on){
    const r=await callAI(
      `You are a straight-talking strength and conditioning coach. Look at this training log and give a short,
specific read. Name actual workouts and moves. Say what's going well, what's slipping, and the single most
useful change. If something looks like a red flag (a lift going backwards for weeks, a workout never done,
cardio with no easy days) say so plainly. No filler, no motivational speech. Reply in simple HTML:
<p>, <b>, <ul><li>. Under 220 words.`,
      trainingContext(), 900);
    if(r){ html=r; live=true; }
  }
  if(!html) html=coachFallback();
  $("nodeBody").innerHTML=`<h2>Your training</h2>
    <div style="margin:8px 0 0">${live?aiBadge():fellBack()}</div>
    <div class="ansbox" style="margin-top:10px">${html}</div>
    <div class="btns" style="margin-top:12px">
      <button class="b b-ghost" onclick="closeAll()">Close</button>
      <button class="b b-violet" onclick="coachMe()">Ask again</button></div>`;
}
/* No key, or the call failed — this reads the same numbers with plain rules,
   and says so rather than pretending a model looked at it. */
function coachFallback(){
  const out=[];
  const never=WK.filter(w=>!doneSess(w.id).length);
  if(never.length) out.push(`<b>Never logged:</b> ${never.map(w=>esc(w.name)).join(", ")}. Those are guesses until you record one.`);
  const behind=WK.filter(w=>!weekMet(w));
  if(behind.length) out.push(`<b>Behind this week:</b> ${behind.map(w=>`${esc(w.name)} (${weekDone(w)}/${weekTarget(w)})`).join(", ")}.`);
  const stale=WK.filter(w=>{const a=daysAgo(lastSess(w.id)); return a!=null && a>10;});
  if(stale.length) out.push(`<b>Not touched in over a week:</b> ${stale.map(w=>esc(w.name)).join(", ")}. Expect the numbers to dip when you go back — log it honestly.`);
  const dropping=WK.filter(w=>{const h=doneSess(w.id); const l=h[h.length-1], p=h.length>1?h[h.length-2]:null;
    return l&&p&&p.vol&&(l.vol-p.vol)/p.vol < -0.1;});
  if(dropping.length) out.push(`<b>Volume falling:</b> ${dropping.map(w=>esc(w.name)).join(", ")} came in more than 10% under the session before. One dip is nothing; three in a row means sleep, food or too much cardio.`);
  const wkMi=cardio.filter(c=>daysAgo(c)<7).reduce((a,c)=>a+c.mi,0);
  out.push(`<b>This week:</b> ${WK.filter(weekMet).length} of ${WK.length} lifting sessions met, ${wkMi.toFixed(1)} miles of cardio.`);
  if(!out.length) out.push("Not enough logged yet to say anything useful. Get two or three sessions in.");
  return "<ul><li>"+out.join("</li><li>")+"</li></ul>";
}

function renderWorkouts(){
  /* This used to start with wkSession=null, which quietly threw away whatever
     you'd logged the moment anything redrew this page. Now an unfinished
     session survives and shows up as a card at the top. */
  $("wkTitle").textContent="Workouts";
  $("wkBack").style.display="none";
  $("wkTabs").parentElement.style.display="block";
  renderTabs();
  if(wkTab==="cardio") return renderCardio();
  $("wkSub").textContent="Your splits · reps, weight and where you're trending";
  const today=DOW[new Date().getDay()];
  $("wkBody").innerHTML = unfinishedCard() + todayCard() + WK.map(w=>{
    const last=lastSess(w.id), lastAgo=daysAgo(last), stale=lastAgo==null || lastAgo > (w.perWeek>=3?4:10);
    /* v53: compare the last two REAL sessions, in reps — a few test taps no
       longer count as "the time before", and pounds aren't multiplied in. */
    const _ds=realSess(w.id); const prev = _ds.length>1 ? _ds[_ds.length-2] : null;
    const _lr = _ds.length ? _ds[_ds.length-1] : null;
    const pct = (prev && sessReps(prev) && _lr) ? Math.round((sessReps(_lr)-sessReps(prev))/sessReps(prev)*100) : null;
    return `<div class="card wk">
      <div class="wk-head">
        <div class="icon" style="background:${w.bg}">${w.icon}</div>
        <div class="wk-t"><b>${w.name}</b>
          <span style="color:${w.fg}">${w.ex.length} moves${(w.rounds||1)>1?` × ${w.rounds} rounds`:``} · ${w.perWeek}× a week</span></div>
        <div style="text-align:right">
          <div style="font-size:13px;font-weight:800;color:${stale?'#ff8f8f':'var(--ink2)'}">${agoLabel(lastAgo)}</div>
          <div style="font-size:9px;letter-spacing:.09em;text-transform:uppercase;color:var(--ink3);font-weight:800;margin-top:2px">Last done</div>
        </div>
      </div>
      <div class="weekplan">${(()=>{const did=doneDaysThisWeek(w.id);
        return DOW.map(d=>{const sched=w.days.includes(d), done=did.has(d);
          return `<div class="wd${sched?" on":""}${d===today?" today":""}${done?" did":""}">
            <b>${d[0]}</b><i>${done?"✓":sched?"●":"·"}</i></div>`;}).join("");})()}</div>
      <div class="wk-note" style="padding:2px 16px 0;display:flex;align-items:center;gap:8px">
        <span style="font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;
              color:${weekMet(w)?'#4fd6a5':'var(--ink3)'}">
          ${weekMet(w)?"✓ Done this week":`${weekDone(w)} of ${weekTarget(w)} this week`}</span>
        <span style="flex:1"></span>
        <span class="qa-btn" onclick="logPast('${w.id}')">Log one I already did</span>
      </div>
      ${monthGrid(w)}
      ${lastAgo==null?`<div class="wk-note">No sessions logged yet. Hit Start and the charts fill in as you go.</div>`
             :stale?`<div class="wk-note"><b>⚠ Been a while.</b> Expect the numbers to dip — that's normal, just log it honestly.</div>`
             :pct==null?`<div class="wk-note">First one logged. The next session gets compared against this.</div>`
             :`<div class="wk-note">${beatBadge(w,last,prev,pct)}</div>`}
      <div class="wk-row">
        <button class="b b-ghost" onclick="editWorkout('${w.id}')">Edit</button>
        <button class="b b-ghost" onclick="openWorkout('${w.id}',1)">History</button>
        <button class="b b-blue" onclick="openWorkout('${w.id}')">Start${today&&w.days.includes(today)?" — today":""}</button>
      </div>
    </div>`;
  }).join("") + `
    <button class="b b-ghost" style="width:100%;height:50px" onclick="openNewWorkout()">+ Add a workout</button>`;
}

/* ---- fixing a session after the fact -------------------------------------
   You log the wrong day, or a session you didn't really do. Until now there was
   no way to take it back — history was append-only. */
function sessionListCard(w){
  const list=[...(wkHist[w.id]||[])].reverse();
  if(!list.length) return "";
  return `<div class="card">
    <div class="card-head"><span class="card-title">Every session</span>
      <span class="link">${doneSess(w.id).length} logged</span></div>
    <div class="wk-note" style="padding:0 16px 10px;font-size:11.5px">
      Tap a date to move it. ✕ removes it — you get one chance to undo.</div>
    ${list.map(h=>`<div class="lg">
      <div class="icon" style="background:${w.bg};font-size:14px">${w.icon}</div>
      <div class="lm" style="flex:1;min-width:0">
        <b><span class="tedit" onclick="editSessionDate('${w.id}','${h.sid||h.d}')">${
          h.d ? new Date(h.d+"T12:00:00").toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"}) : "no date"} ✎</span></b>
        <span>${(h.vol||0).toLocaleString()} total${loadedCount(h)?` · ${loadedCount(h)} loaded`:""}${h.partial?" · still in progress":""}${h.backfilled?" · added later":""}</span></div>
      <div class="lx" onclick="delSession('${w.id}','${h.sid||h.d}')">✕</div>
    </div>`).join("")}
  </div>`;
}
const sessKey = h => h.sid || h.d;
/* How many moves you were carrying something on that day. */
const loadedCount = h => Object.values((h&&h.entries)||{}).filter(x=>x&&x.ld&&x.ld.kit).length;
async function delSession(wid, key){
  const list=wkHist[wid]||[];
  const i=list.findIndex(h=>sessKey(h)===key);
  if(i<0){ toast("That one's already gone"); return; }
  const snap=list[i], at=i;
  list.splice(i,1);
  save(); renderWorkouts(); openWorkout(wid,1);
  toastUndo(`Removed ${snap.d||"that session"}`, ()=>{
    (wkHist[wid]=wkHist[wid]||[]).splice(at,0,snap);
    save(); renderWorkouts(); openWorkout(wid,1);
  });
}
async function editSessionDate(wid, key){
  const list=wkHist[wid]||[];
  const h=list.find(x=>sessKey(x)===key);
  if(!h){ toast("That one's gone"); return; }
  const v=await askText(`Move this session`, `Date as YYYY-MM-DD — it's on ${h.d||"no date"}`);
  if(v===null) return;
  const d=v.trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d) || isNaN(new Date(d+"T12:00:00"))){ toast("Needs to look like 2026-08-24"); return; }
  if(d>ymd(new Date())){ toast("That's in the future"); return; }
  h.d=d;
  list.sort((a,b)=>String(a.d||"").localeCompare(String(b.d||"")));
  save(); renderWorkouts(); openWorkout(wid,1);
  toast(`Moved to ${new Date(d+"T12:00:00").toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"})}`);
}

let wkListScroll=0;
function openWorkout(id,historyOnly){
  /* the position in the workout list, so History → back doesn't dump you at the top */
  if(!$("wkBack") || $("wkBack").style.display==="none") wkListScroll=window.scrollY||0;
  const w=wkById(id), last=baseSess(id);
  const _dh=doneSess(id); const prev = _dh.length>1 ? _dh[_dh.length-2] : null;
  $("wkTabs").parentElement.style.display="none";
  $("wkTitle").textContent=w.name;
  $("wkSub").textContent = historyOnly ? "Every session, oldest to newest"
                                       : `Last done ${agoLabel(daysAgo(last))} · tap through the moves`;
  $("wkBack").style.display="flex";
  window.scrollTo(0,0);

  if(historyOnly){
    $("wkBody").innerHTML=`<div class="card">
      <div class="card-head"><span class="card-title">Last 5 sessions</span><span class="link">${w.name}</span></div>
      <div class="chart" style="height:120px">${chartFor(w,1)}</div>
      <div class="wk-note" style="padding-top:12px">Each bar is total work that day — reps for bodyweight, reps × weight for anything loaded.
        <b>⋯</b> means a long gap. Red bars are sessions that went backwards.</div>
      <div class="sess-sum">
        <div class="ss"><b style="color:${w.fg}">${last.vol.toLocaleString()}</b><span>Last total</span></div>
        <div class="ss"><b>${(Math.max(0,...doneSess(id).map(s=>s.vol))).toLocaleString()}</b><span>Your best</span></div>
        <div class="ss"><b>${agoLabel(daysAgo(last))}</b><span>Last done</span></div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><span class="card-title">Where each move stands</span></div>
      ${w.ex.concat(Object.keys(last.entries||{})
          .filter(k=>!w.ex.some(x=>x.n===k))
          .map(k=>({n:k,t:(last.entries[k]||{}).wt?"w":"r",once:1})))
        .map(e=>{const a=last.entries[e.n]||{reps:0,wt:0}, b=prev?prev.entries[e.n]:null;
        const d=b? Math.round(((e.t==="w"?a.reps*a.wt:a.reps)-(e.t==="w"?b.reps*b.wt:b.reps))/((e.t==="w"?b.reps*b.wt:b.reps)||1)*100):0;
        return `<div class="ex"><div class="ex-top"><div class="ex-n">${esc(e.n)}${a.ld?loadPill(a.ld, e.t==="w"):``}${e.once?`<span class="tag-once">one-off</span>`:``}</div>
          <div class="ex-last">${a.reps} reps${e.t==="w"?` × ${a.wt} lb`:``}</div></div>
          <div class="delta ${d>0?"up":d<0?"down":"same"}">${d>0?"▲":d<0?"▼":"—"} ${d>0?"+":""}${d}% vs the time before</div>
        </div>`;}).join("")}
    </div>
    ${sessionListCard(w)}`;
    return;
  }

  // live session
  if(wkSession && wkSession.id===id && sessTotals().logged){
    renderSession(); return;              // same workout, still unfinished — pick it back up
  }
  if(wkSession && wkSession.id!==id && sessTotals().logged){
    const other=wkById(wkSession.id);
    ask(`You've still got ${sessTotals().logged} set${sessTotals().logged===1?"":"s"} logged on ${other?other.name:"another workout"}.\n\nSave that first?`,"Save it")
      .then(yes=>{
        if(yes) finishWorkout(); else { wkSession=null; save(); }
        // only move on once the old session is actually put away, so a failure
        // here can't bounce you between the same two questions forever
        if(wkSession && sessTotals().logged){ toast("Couldn't save that one — it's still here"); return; }
        setTimeout(()=>openWorkout(id),150);
      });
    return;
  }
  const rounds=Math.max(1, w.rounds||1);
  /* sid identifies this session for its whole life, so writing it down as you go
     updates one record instead of leaving a trail of copies. */
  wkSession={id, sid:"s"+Date.now().toString(36), round:1, rounds, forDay:ymd(new Date()), entries:{}};
  w.ex.forEach(e=>{
    wkSession.entries[e.n]=[];
    for(let r=0;r<rounds;r++) wkSession.entries[e.n].push({reps:0, wt:(last.entries[e.n]||{}).wt||0});
  });
  save();
  renderSession();
}

/* Add up a whole session across every round. Weighted moves count reps × weight,
   bodyweight moves just count reps. */
/* The moves on screen right now: the workout's own list, plus anything you
   added mid-session for today only. Everything that walks the exercise list
   goes through here so a one-off counts exactly like a regular move. */
function sessEx(){
  const w=wkSession && wkById(wkSession.id);
  if(!w) return [];
  return w.ex.concat(wkSession.extra||[]);
}
function sessTotals(){
  let vol=0, logged=0; const EX=sessEx();
  EX.forEach(e=>{ (wkSession.entries[e.n]||[]).forEach(c=>{
    vol += e.t==="w" ? c.reps*c.wt : c.reps;
    if(c.reps) logged++;
  });});
  return {vol, logged, slots:EX.length*wkSession.rounds};
}

/* The warm up / stretch block. Ticks are for today only — they're a plan to
   follow, not something that goes on your record. */
/* Folded away by default — it's a checklist you open when you need it, not a
   wall of text sitting between you and your numbers. */
let prepOpen={};
function prepCard(kind, phase){
  const list=PREP[kind][phase]; if(!list) return "";
  const isWarm = phase==="warm";
  const title = kind==="cardio"
      ? (isWarm ? "Before your jog" : "After your jog")
      : (isWarm ? "Warm up first" : "Stretch it out after");
  const note  = isWarm ? "Do it every time — this is the part people skip."
                       : "Do these while you're still warm. It's what keeps you going next week.";
  const key=`${kind}-${phase}`;
  const open=!!prepOpen[key];
  const doneN=list.filter((_,i)=>prepDone[`${key}-${i}`]).length;
  const all=doneN===list.length;
  return `<div class="card">
    <div class="card-head" style="cursor:pointer" onclick="togglePrepOpen('${key}','${kind}')">
      <span class="card-title">${isWarm?"🔥":"🧘"} ${title}</span>
      <span class="link" style="color:${all?'#4fd6a5':'#8d99ab'}">
        ${all?"✓ all done":`${doneN}/${list.length}`} <span class="caret${open?" up":""}">▾</span></span>
    </div>
    ${open ? list.map((x,i)=>{const k=`${key}-${i}`; const on=!!prepDone[k];
      return `<div class="prep" onclick="togglePrep('${k}','${kind}')">
        <div style="width:19px;height:19px;flex:0 0 19px;border-radius:6px;
             background:${on?'#12c98a':'transparent'};border:1.5px solid ${on?'#12c98a':'#2b3543'};
             display:flex;align-items:center;justify-content:center;font-size:11px;color:#04150e">${on?'✓':''}</div>
        <div style="flex:1;font-size:13.5px;color:${on?'#5d6878':'#e6edf7'};
             text-decoration:${on?'line-through':'none'}">${esc(x[0])}</div>
        <div style="font-size:11px;font-weight:800;color:var(--ink3);letter-spacing:.04em">${esc(x[1])}</div>
      </div>`;}).join("") + `<div class="wk-note" style="padding:8px 16px 13px">${note}</div>
      ${doneN?`<div class="wk-row" style="padding-top:0">
        <button class="b b-ghost" style="width:100%" onclick="clearPrep('${key}','${kind}')">Clear the ticks</button></div>`:``}`
    : `<div class="wk-note" style="padding:2px 16px 13px">${list.length} things · tap to open</div>`}
  </div>`;
}
function togglePrepOpen(key, kind){ prepOpen[key]=!prepOpen[key]; repaintPrep(kind); }
function togglePrep(k, kind){ prepDone[k]=!prepDone[k]; repaintPrep(kind); }
function clearPrep(key, kind){
  Object.keys(prepDone).forEach(k=>{ if(k.startsWith(key+"-")) delete prepDone[k]; });
  repaintPrep(kind);
}
function repaintPrep(kind){
  if(kind==="cardio") renderCardio(); else if(wkSession) renderSession();
}

function renderSession(){
  const w=wkById(wkSession.id), last=baseSess(wkSession.id), EX=sessEx();
  const R=wkSession.round-1;
  const t=sessTotals(), lastVol=last.vol;
  const pct=Math.round(t.vol/(lastVol||1)*100);

  $("wkBody").innerHTML=`
    <div class="card">
      <div class="card-head"><span class="card-title">This session</span>
        <span class="link" id="wsPct" style="color:${pct>=100?'#4fd6a5':pct>=70?'#ff9d4d':'#8d99ab'}">${lastVol?pct+"% of last time":"first time — no comparison yet"}</span></div>
      <div class="tk-bar" style="margin-bottom:10px"><i id="wsBar" style="width:${Math.min(100,pct)}%;
        background:${pct>=100?'linear-gradient(90deg,#0ea472,#16d494)':w.fg}"></i></div>
      <div class="sess-sum" style="padding-top:0">
        <div class="ss"><b style="color:${w.fg}" id="wsVol">${t.vol.toLocaleString()}</b><span>Total now</span></div>
        <div class="ss"><b>${lastVol.toLocaleString()}</b><span>Last time</span></div>
        <div class="ss"><b id="wsDone">${t.logged}<span style="color:var(--ink3);font-size:11px">/${t.slots}</span></b><span>Sets logged</span></div>
      </div>
    </div>

    ${prepCard("lift","warm")}

    ${wkSession.rounds>1?`<div class="card"><div class="wk-row" style="padding:12px 16px;gap:8px">
      ${Array.from({length:wkSession.rounds},(_,r)=>{
        const filled=EX.filter(e=>(wkSession.entries[e.n]||[])[r]&&wkSession.entries[e.n][r].reps>0).length;
        return `<button class="b rtab${r===R?" on":""}" onclick="setRound(${r+1})"
          style="flex:1">Round ${r+1}${filled?` · ${filled}`:``}</button>`;}).join("")}
    </div>
    <div class="wk-note" style="padding:0 16px 13px">Go through the whole list, then come back and do it again on Round 2. Logging them apart shows you where you faded.</div></div>`:``}

    <div class="card">
      <div class="card-head"><span class="card-title">${w.name}${wkSession.rounds>1?` · Round ${wkSession.round}`:``}</span>
        <span class="link">type it or tap</span></div>
      ${EX.map((e,i)=>{
        const c=wkSession.entries[e.n][R], l=last.entries[e.n]||{reps:0,wt:0};
        const lastTxt = l.reps ? `Last time <b>${l.reps}${e.t==="w"?` × ${l.wt}`:``}</b>${wkSession.rounds>1?" total":""}` : "First time";
        return `<div class="ex">
          <div class="ex-top"><div class="ex-n">${esc(e.n)}<span id="wsKit${i}">${loadPill(loadOf(e.n), e.t==="w")}</span>${e.once?`<span class="tag-once">today only</span>`:``}</div>
            <div class="ex-last">${lastTxt}${e.once?`<span class="xrm" onclick="rmSessionMove(${i})">✕</span>`:``}</div></div>
          <div class="chase" id="wsChase${i}">${chaseHTML(i)}</div>
          <div class="ex-ctl">
            <div class="stepbtn${c.reps?"":" off"}" onclick="repStep(${i},-1)">−</div>
            <div class="repbox"><input type="number" inputmode="numeric" min="0" step="1" id="wsRep${i}"
                 style="color:${c.reps?w.fg:'#5d6878'}" value="${c.reps||''}" placeholder="0"
                 onfocus="this.select()" oninput="setReps(${i},this.value)"
                 onblur="setReps(${i},this.value,1)"><span>reps</span></div>
            <div class="stepbtn plus" onclick="repStep(${i},1)">+</div>
            <div class="addload${loadOf(e.n)?" on":""}" id="wsLd_b${i}" onclick="toggleLoad(${i})"
                 title="Vest, bands, dumbbells…">${loadOf(e.n)?"✎":"⊕"}</div>
            ${e.t==="w"?`<div class="wtgrp">
                 <div class="stepbtn sm" onclick="wtStep(${i},-5)">−</div>
                 <div class="wbox"><input type="number" inputmode="decimal" step="5" min="0" id="wsWt${i}"
                      value="${c.wt||""}" placeholder="0" onfocus="this.select()" oninput="setWt(${i},this.value)"><em>LB</em></div>
                 <div class="stepbtn sm plus" onclick="wtStep(${i},5)">+</div></div>`:``}
          </div>
          ${loadPanel(i,e)}
          <div class="delta ${""}" id="wsDelta${i}"></div>
        </div>`;}).join("")}

      <div class="wk-row" style="padding:0 16px 14px">
        <button class="b b-ghost" style="width:100%" onclick="openAddMove()">+ Add a move</button>
      </div>
    </div>

    ${prepCard("lift","cool")}

    <div class="card">
      <div class="card-head"><span class="card-title">Logging this for</span>
        <span class="link">${esc(dayLabel(wkSession.forDay))}</span></div>
      <div class="chips" style="padding:0 16px 12px">
        ${recentDays().map(d=>`<span class="chip${wkSession.forDay===d.key?" on":""}"
          onclick="setSessionDay('${d.key}')">${d.label}</span>`).join("")}
      </div>
      <div class="wk-note" style="padding:0 16px 14px">Did it Monday but only logging it now? Pick the day —
        it counts for that day, and toward this week either way.</div>
    </div>
    <div class="card"><div class="wk-row" style="padding:14px 16px">
      <button class="b b-ghost" onclick="leaveWorkout()">Back</button>
      <button class="b b-primary" onclick="finishWorkout()">Finish workout</button>
    </div></div>`;
  EX.forEach((e,i)=>paintDelta(i));
}
function setRound(r){ wkSession.round=r; save(); renderSession(); window.scrollTo(0,0); }
const dayLabel = key => { const r=recentDays().find(x=>x.key===key);
  return r ? r.label : new Date(key+"T12:00:00").toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"}); };
function setSessionDay(key){ wkSession.forDay=key; save(); renderSession(); }

/* Log a workout you already did, without stepping through every move. Useful
   when you trained and only remembered to record it two days later. */
function logPast(id){
  const w=wkById(id); if(!w){ toast("That workout is gone"); return; }
  $("nodeBody").innerHTML=`<h2>Log ${esc(w.name)}</h2>
    <p style="font-size:12.5px;color:var(--ink3);line-height:1.55;margin:8px 0 0">
      Which day did you do it? It'll go in with your usual numbers, and you can open it afterwards to correct anything.</p>
    <div class="chips" style="margin-top:14px">
      ${recentDays().map(d=>`<span class="chip" onclick="logPastOn('${id}','${d.key}')">${d.label}</span>`).join("")}
    </div>
    <div class="btns" style="margin-top:14px">
      <button class="b b-ghost" style="width:100%" onclick="closeAll()">Cancel</button></div>`;
  closeAll(); openSheet("node");
}
function logPastOn(id, key){
  const w=wkById(id); if(!w) return;
  const last=lastSess(id);
  const entries=Object.fromEntries(w.ex.map(e=>{
    const l=last.entries[e.n]||{};
    const row={reps:(l.reps||defReps(e))*(w.rounds||1), wt:l.wt||0};
    if(l.ld && l.ld.kit) row.ld=Object.assign({},l.ld);
    return [e.n,row];
  }));
  let vol=0; w.ex.forEach(e=>{ const c=entries[e.n];
    vol += e.t==="w" ? c.reps*c.wt : c.reps; });
  wkHist[id]=wkHist[id]||[];
  /* Backfilling the same day twice should correct it, not stack up copies. */
  const dup=wkHist[id].findIndex(h=>h && h.d===key && !h.partial);
  const rec={ago:0, d:key, vol:Math.round(vol), entries, partial:false, backfilled:true};
  if(dup>-1) wkHist[id][dup]=rec; else wkHist[id].push(rec);
  wkHist[id].sort((a,b)=>String(a.d||"").localeCompare(String(b.d||"")));
  /* This used to keep six and drop the oldest — so backfilling a week of
     sessions quietly deleted the ones you entered first. */
  if(wkHist[id].length>400) wkHist[id]=wkHist[id].slice(-400);
  save(); closeAll(); renderWorkouts();
  const total=wkHist[id].filter(h=>!h.partial).length;
  toast(`Saved — ${w.name} on ${dayLabel(key)}. ${total} session${total===1?"":"s"} logged in total.`);
}

/* Repaint one row and the totals without rebuilding the page. Rebuilding is
   what used to throw you out of the weight box after a single digit. */
/* The numbers under a move: what you did in the earlier rounds of this session,
   and whether you're on track to match the round before. Rebuilt on every tap. */
function chaseHTML(i){
  const e=sessEx()[i]; if(!e) return "";
  const sets=wkSession.entries[e.n]||[], R=wkSession.round-1;
  if(!sets[R]) return "";
  const fmt=x=>`${x.reps}${e.t==="w"&&x.wt?` × ${x.wt}`:``}`;
  const earlier=sets.slice(0,R).map((x,ri)=>x.reps?`R${ri+1} <b>${fmt(x)}</b>`:`R${ri+1} —`);
  if(!earlier.length) return "";
  const beat = sets[R-1] && sets[R-1].reps ? sets[R-1] : null;
  const cur = sets[R];
  let verdict="";
  if(beat){
    const gap=beat.reps-cur.reps;
    verdict = `<span class="sep">·</span><span style="color:${gap<=0?'#4fd6a5':'#ff9d4d'}">`
            + (gap<=0 ? (gap<0?`${-gap} more than R${R}`:`matched R${R}`) : `${gap} to match R${R}`) + `</span>`;
  }
  return earlier.join('<span class="sep">·</span>') + verdict;
}
function paintChase(i){ const el=document.getElementById("wsChase"+i); if(el) el.innerHTML=chaseHTML(i); }
function paintDelta(i){
  const e=sessEx()[i], last=baseSess(wkSession.id); if(!e) return;
  const c=(wkSession.entries[e.n]||[])[wkSession.round-1]; if(!c) return;
  const l=last.entries[e.n]||{reps:0,wt:0};
  const el=document.getElementById("wsDelta"+i); if(!el) return;
  if(!c.reps){ el.textContent=""; el.className="delta"; return; }
  const now = e.t==="w" ? c.reps*c.wt : c.reps;
  const then= e.t==="w" ? l.reps*l.wt : l.reps;
  if(!then){ el.className="delta same"; el.textContent="First time logged — this sets the mark"; return; }
  const d=Math.round((now-then)/(then||1)*100);
  el.className="delta "+(d>0?"up":d<0?"down":"same");
  el.textContent=`${d>0?"▲":d<0?"▼":"—"} ${d>0?"+":""}${d}% vs last time`;
}
function paintTotals(){
  const w=wkById(wkSession.id), last=baseSess(wkSession.id);
  const t=sessTotals(), pct=Math.round(t.vol/(last.vol||1)*100);
  const v=document.getElementById("wsVol"), p=document.getElementById("wsPct"),
        b=document.getElementById("wsBar"), d=document.getElementById("wsDone");
  if(v) v.textContent=t.vol.toLocaleString();
  if(d) d.innerHTML=`${t.logged}<span style="color:var(--ink3);font-size:11px">/${t.slots}</span>`;
  if(p){ p.textContent= last.vol ? pct+"% of last time" : "first time — no comparison yet";
         p.style.color = pct>=100?'#4fd6a5':pct>=70?'#ff9d4d':'#8d99ab'; }
  if(b){ b.style.width=Math.min(100,pct)+"%";
         b.style.background = pct>=100?'linear-gradient(90deg,#0ea472,#16d494)':w.fg; }
}
/* ---- a session writes itself down as you go ------------------------------
   It used to exist only in the in-progress slot until you pressed Finish, so a
   Finish that failed — or never happened — meant the whole workout was gone with
   nothing to show for it. Now the first set you log creates the record and every
   tap updates it. Finish just marks it done.

   Half-finished sessions are kept but flagged, so they show in your history
   without counting toward the week until you actually finish them. */
function persistSession(done){
  if(!wkSession || !wkSession.sid) return null;
  const t=sessTotals();
  const w=wkById(wkSession.id); if(!w) return null;
  /* Nothing logged: don't invent a record — but if one already exists (you
     logged something and then took the move back off), rewrite it rather than
     leaving a stale copy behind. */
  if(!t.logged && !done &&
     !((wkHist[wkSession.id]||[]).some(h=>h && h.sid===wkSession.sid))) return null;
  const entries=Object.fromEntries(sessEx().map(e=>{
    const sets=wkSession.entries[e.n]||[];
    const row={ reps:sets.reduce((a,c)=>a+(+c.reps||0),0),
                wt: sets.reduce((m,c)=>Math.max(m,+c.wt||0),0) };
    const L=loadOf(e.n);
    if(L && L.kit) row.ld={kit:L.kit, lb:+L.lb||0, lvl:L.lvl==null?1:L.lvl};
    return [e.n,row];
  }));
  wkHist[wkSession.id]=wkHist[wkSession.id]||[];
  const list=wkHist[wkSession.id];
  const rec={ sid:wkSession.sid, d:wkSession.forDay||ymd(new Date()), ago:0,
              vol:t.vol, logged:t.logged, entries,
              rounds:wkSession.rounds, partial: !done };
  const at=list.findIndex(h=>h && h.sid===wkSession.sid);
  if(at>-1) list[at]=Object.assign({}, list[at], rec); else list.push(rec);
  save();
  return rec;
}

function repStep(i,d){
  const w=wkById(wkSession.id), e=sessEx()[i]; if(!e) return;
  const c=(wkSession.entries[e.n]||[])[wkSession.round-1]; if(!c) return;
  // straight to the usual count on the first tap, then one at a time
  c.reps = (d>0 && c.reps===0) ? defReps(e) : Math.max(0, c.reps+d);
  const r=document.getElementById("wsRep"+i);
  if(r){ r.value=c.reps||""; r.style.color = c.reps? w.fg : '#5d6878'; }
  const minus=r&&r.parentElement.previousElementSibling;
  if(minus) minus.classList.toggle("off", !c.reps);
  paintDelta(i); paintChase(i); paintTotals(); paintRoundTabs();
  save(); persistSession(false);   // into history immediately, not just the scratch slot
}
/* Type the rep count straight in instead of tapping + forty times. While
   you're typing we don't rewrite the box — that's what used to kick the cursor
   out after one digit. It gets tidied on the way out. */
function setReps(i,v,leaving){
  const w=wkById(wkSession.id), e=sessEx()[i]; if(!e) return;
  const c=(wkSession.entries[e.n]||[])[wkSession.round-1]; if(!c) return;
  let n=Math.round(parseFloat(String(v==null?"":v).replace(/[^0-9.]/g,"")));
  if(isNaN(n)) n=0;
  c.reps=Math.max(0,Math.min(9999,n));
  const r=document.getElementById("wsRep"+i);
  if(r){ r.style.color = c.reps? w.fg : '#5d6878'; if(leaving) r.value=c.reps||""; }
  const minus=r&&r.parentElement&&r.parentElement.previousElementSibling;
  if(minus) minus.classList.toggle("off", !c.reps);
  paintDelta(i); paintChase(i); paintTotals(); paintRoundTabs();
  save(); persistSession(false);
}
function setWt(i,v){
  const e=sessEx()[i]; if(!e) return;
  if(!wkSession.entries[e.n] || !wkSession.entries[e.n][wkSession.round-1]) return;
  wkSession.entries[e.n][wkSession.round-1].wt=Math.max(0,+v||0);
  paintDelta(i); paintChase(i); paintTotals(); save(); persistSession(false);
}
function wtStep(i,d){
  const e=sessEx()[i]; if(!e) return;
  const c=(wkSession.entries[e.n]||[])[wkSession.round-1]; if(!c) return;
  c.wt=Math.max(0, Math.round((c.wt+d)*10)/10);
  const box=document.getElementById("wsWt"+i); if(box) box.value=c.wt;
  paintDelta(i); paintChase(i); paintTotals(); save(); persistSession(false);
}
function paintRoundTabs(){
  if(!wkSession || wkSession.rounds<2) return;
  const EX=sessEx();
  document.querySelectorAll('#wkBody .wk-row .b[onclick^="setRound"]').forEach((btn,r)=>{
    const filled=EX.filter(e=>(wkSession.entries[e.n]||[])[r]&&wkSession.entries[e.n][r].reps>0).length;
    btn.textContent=`Round ${r+1}${filled?` · ${filled}`:``}`;
  });
}
/* ---- load on a move: pill, button, panel ---------------------------------
   Tap the dashed ⊕ at the end of a row and the panel drops in. Nothing appears
   on a row you never load. Weighted moves get the label only — the pounds are
   already sitting in the weight box right underneath. */
const loadOf = n => (wkSession && wkSession.load && wkSession.load[n]) || null;
function loadText(L){
  const k=L&&KIT[L.kit]; if(!k) return "";
  return k.num ? `${k.tag} · ${(+L.lb||0)} lb` : `${k.tag} · ${(k.levels[L.lvl]||k.levels[1])}`;
}
/* On a weighted move the number is on screen twice if we repeat it, so the pill
   is just the label there. */
function loadPill(L, weighted){
  const k=L&&KIT[L.kit]; if(!k) return "";
  const txt = (weighted && k.num) ? k.tag : loadText(L);
  return `<span class="kitbadge ${k.cls}">${txt}</span>`;
}
function loadPanel(i,e){
  const n=e.n;
  if(!(wkSession.loadOpen&&wkSession.loadOpen[n])) return "";
  const L=loadOf(n)||{}, k=KIT[L.kit], prev=exLoad[n];
  const same = prev && L.kit===prev.kit &&
               (KIT[prev.kit]&&KIT[prev.kit].num ? (+prev.lb===+L.lb) : (prev.lvl===L.lvl));
  const weighted = e.t==="w";
  return `<div class="loadline">
    ${(prev && prev.kit && !same)?`<div class="lastload" onclick="useLastLoad(${i})">
      <div class="ll">Last time · ${esc(loadText(prev))}</div><div class="lr">Use it</div></div>`:``}
    <div class="kitrow">
      <div class="kit${L.kit?"":" on"}" data-k="none" onclick="setKit(${i},'')">Bodyweight</div>
      ${KIT_ORDER.map(c=>`<div class="kit${L.kit===c?" on":""}" data-k="${c}"
        onclick="setKit(${i},'${c}')">${KIT[c].lbl}</div>`).join("")}
    </div>
    ${(k&&k.num&&!weighted)?`<div class="loadamt"><label>How much</label>
      <div class="stepbtn sm" onclick="loadBump(${i},-5)">−</div>
      <div class="wbox"><input type="number" inputmode="decimal" step="5" min="0" id="wsLd${i}"
           value="${+L.lb||""}" placeholder="0" onfocus="this.select()"
           oninput="setLoadLb(${i},this.value)"><em>LB</em></div>
      <div class="stepbtn sm plus" onclick="loadBump(${i},5)">+</div></div>`:``}
    ${(k&&k.num&&weighted)?`<div class="wk-note" style="padding:8px 0 0">The pounds stay in the weight box below —
      this just records what the weight was.</div>`:``}
    ${(L.kit==="band")?`<div class="loadamt"><label>How strong</label>
      <div class="kitrow">${KIT.band.levels.map((lv,x)=>`<div class="kit${(L.lvl==null?1:L.lvl)===x?" on":""}"
        data-k="band" onclick="setBandLvl(${i},${x})">${lv}</div>`).join("")}</div></div>
      <div class="wk-note" style="padding:9px 0 0">Bands have no honest pound number, so they go down by strength.
        Recorded and shown in history; your totals don't move.</div>`:``}
    ${(L.kit&&L.kit!=="band")?`<div class="wk-note" style="padding:9px 0 0">Recorded and shown in history. It does not
      change your totals or the "% of last time" — those still count reps.</div>`:``}
  </div>`;
}
function repaintLoad(i,e){
  const pill=document.getElementById("wsKit"+i);
  if(pill) pill.innerHTML=loadPill(loadOf(e.n), e.t==="w");
  const btn=document.getElementById("wsLd_b"+i);
  if(btn){ const on=!!(loadOf(e.n)&&loadOf(e.n).kit);
           btn.classList.toggle("on", on); btn.textContent = on ? "✎" : "⊕"; }
}
function toggleLoad(i){
  const e=sessEx()[i]; if(!e) return;
  wkSession.loadOpen=wkSession.loadOpen||{};
  wkSession.loadOpen[e.n]=!wkSession.loadOpen[e.n];
  save(); renderSession();
  if(wkSession.loadOpen[e.n]) setTimeout(()=>{
    const el=document.getElementById("wsRep"+i);
    if(el&&el.closest(".ex")) el.closest(".ex").scrollIntoView({behavior:"smooth",block:"center"});
  },60);
}
/* Remembering it for next time is the whole point of the shortcut, so every
   change writes to both the session and the memory. */
function rememberLoad(n){
  const L=loadOf(n);
  if(L&&L.kit) exLoad[n]={kit:L.kit, lb:+L.lb||0, lvl:L.lvl==null?1:L.lvl};
  else delete exLoad[n];
}
function setKit(i,k){
  const e=sessEx()[i]; if(!e) return;
  wkSession.load=wkSession.load||{};
  if(!k){ delete wkSession.load[e.n]; }
  else {
    const cur=wkSession.load[e.n]||{};
    wkSession.load[e.n]={ kit:k,
      lb: (+cur.lb||0) || (exLoad[e.n]&&exLoad[e.n].kit===k ? +exLoad[e.n].lb||0 : 0) || KIT[k].def || 0,
      lvl: cur.lvl==null ? (exLoad[e.n]&&exLoad[e.n].kit===k ? exLoad[e.n].lvl : 1) : cur.lvl };
  }
  rememberLoad(e.n); save(); persistSession(false); renderSession();
}
function setLoadLb(i,v){
  const e=sessEx()[i], L=e&&loadOf(e.n); if(!L) return;
  L.lb=Math.max(0,Math.min(999,+v||0));
  rememberLoad(e.n); repaintLoad(i,e); save(); persistSession(false);
}
function loadBump(i,d){
  const e=sessEx()[i], L=e&&loadOf(e.n); if(!L) return;
  L.lb=Math.max(0,Math.round(((+L.lb||0)+d)*10)/10);
  const box=document.getElementById("wsLd"+i); if(box) box.value=L.lb||"";
  rememberLoad(e.n); repaintLoad(i,e); save(); persistSession(false);
}
function setBandLvl(i,x){
  const e=sessEx()[i], L=e&&loadOf(e.n); if(!L) return;
  L.lvl=x; rememberLoad(e.n); save(); persistSession(false); renderSession();
}
function useLastLoad(i){
  const e=sessEx()[i], prev=e&&exLoad[e.n]; if(!prev||!prev.kit) return;
  wkSession.load=wkSession.load||{};
  wkSession.load[e.n]={kit:prev.kit, lb:+prev.lb||0, lvl:prev.lvl==null?1:prev.lvl};
  save(); persistSession(false); renderSession();
  toast(`${e.n} — ${loadText(prev)}`);
}

/* ---- adding a move in the middle of a workout ---------------------------
   You're on Arms & Shoulders and you decide to throw in push-ups. Two choices:
   just today, which lives on the session and disappears with it, or every time,
   which joins the workout properly so it's there next week too. Either way it
   logs, counts toward the total and shows up in history like any other move. */
let amType="r", amKeep=0;
function openAddMove(){
  if(!wkSession){ toast("Start the workout first"); return; }
  amType="r"; amKeep=0;
  $("nodeBody").innerHTML=`<h2>Add a move</h2>
    <p style="font-size:12.5px;color:var(--ink3);line-height:1.55;margin:8px 0 14px">
      Something you're doing in this workout that isn't on the list.</p>
    <label class="f">What is it</label>
    <input class="f" id="amName" placeholder="Push-Ups" autocomplete="off" spellcheck="false">
    <label class="f" style="margin-top:12px">How it's counted</label>
    <div class="chips">
      <span class="chip on" id="amR" onclick="setMoveType('r')">Reps only</span>
      <span class="chip" id="amW" onclick="setMoveType('w')">Reps × weight</span>
    </div>
    <label class="f" style="margin-top:12px">Usual reps</label>
    <input class="f" id="amDef" type="number" inputmode="numeric" min="1" value="10"
           title="What the + button jumps to on the first tap">
    <label class="f" style="margin-top:12px">Keep it?</label>
    <div class="chips">
      <span class="chip on" id="amOnce" onclick="setMoveScope(0)">Just today</span>
      <span class="chip" id="amKeep" onclick="setMoveScope(1)">Every time</span>
    </div>
    <div class="wk-note" style="padding:10px 0 0" id="amHint">Today only — it counts for this session and then it's gone.</div>
    <div class="btns" style="margin-top:14px">
      <button class="b b-ghost" onclick="closeAll()">Cancel</button>
      <button class="b b-primary" onclick="addMove()">Add it</button></div>`;
  closeAll(); openSheet("node");
  setTimeout(()=>{ const n=$("amName"); if(n) n.focus(); },140);
}
function setMoveType(t){ amType=t;
  const a=$("amR"), b=$("amW");
  if(a) a.classList.toggle("on", t==="r");
  if(b) b.classList.toggle("on", t==="w"); }
function setMoveScope(k){ amKeep=k?1:0;
  const a=$("amOnce"), b=$("amKeep"), h=$("amHint");
  if(a) a.classList.toggle("on", !amKeep);
  if(b) b.classList.toggle("on", !!amKeep);
  if(h) h.textContent = amKeep
    ? "Added to this workout for good — it'll be waiting next time. You can take it off again under Edit."
    : "Today only — it counts for this session and then it's gone."; }
function addMove(){
  if(!wkSession){ closeAll(); return; }
  const w=wkById(wkSession.id); if(!w){ closeAll(); return; }
  const n=($("amName").value||"").trim();
  if(!n){ $("amName").focus(); toast("Give it a name"); return; }
  if(sessEx().some(e=>e.n.toLowerCase()===n.toLowerCase())){ toast("That one's already on the list"); return; }
  const d=Math.max(1,Math.min(999,+$("amDef").value||10));
  const last=baseSess(wkSession.id), carry=(last.entries[n]||{}).wt||0;
  wkSession.entries[n]=[];
  for(let r=0;r<wkSession.rounds;r++) wkSession.entries[n].push({reps:0, wt:carry});
  if(amKeep) w.ex.push({n, t:amType, d});
  else (wkSession.extra=wkSession.extra||[]).push({n, t:amType, d, once:1});
  save(); closeAll(); renderSession();
  toast(amKeep ? `${n} added to ${w.name}` : `${n} added for today`);
  const at=sessEx().findIndex(e=>e.n===n);
  setTimeout(()=>{ const el=document.getElementById("wsRep"+at);
    if(el && el.closest(".ex")) el.closest(".ex").scrollIntoView({behavior:"smooth",block:"center"}); },80);
}
/* Taking a today-only move back off. Anything you logged against it goes with
   it, and the session record is rewritten straight away. */
function rmSessionMove(i){
  const e=sessEx()[i];
  if(!e || !e.once){ toast("Take that one off under Edit"); return; }
  const k=e.n;
  wkSession.extra=(wkSession.extra||[]).filter(x=>x.n!==k);
  delete wkSession.entries[k];
  save(); persistSession(false); renderSession();
  toast("Removed "+k);
}

/* You logged sets and then tried to leave. Nothing gets binned quietly —
   this is the whole reason a session used to vanish. */
async function leaveWorkout(){
  const back=()=>requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo(0,wkListScroll)));
  if(!wkSession){ renderWorkouts(); back(); return true; }
  const t=sessTotals();
  if(!t.logged){ wkSession=null; save(); renderWorkouts(); back(); return true; }
  const w=wkById(wkSession.id);
  const keep=await ask(`You've logged ${t.logged} set${t.logged===1?"":"s"} of ${w?w.name:"this workout"}.\n\nSave it to your history?`,
    "Save it");
  if(keep){ finishWorkout(); back(); return true; }
  // they said no — but it stays parked, not deleted, so it's still there later
  save(); renderWorkouts(); back();
  toast("Left it unfinished — it'll be waiting when you come back");
  return true;
}
/* Anything unfinished shows at the top of the Workouts page so it can't be
   forgotten about. */
function unfinishedCard(){
  if(!wkSession) return "";
  const w=wkById(wkSession.id); if(!w) return "";
  const t=sessTotals();
  if(!t.logged) return "";
  return `<div class="card" style="border-color:rgba(255,157,77,.5);background:rgba(255,157,77,.06)">
    <div class="card-head"><span class="card-title" style="color:#ff9d4d">Unfinished workout</span>
      <span class="link" style="color:#ff9d4d">${t.logged} set${t.logged===1?"":"s"} logged</span></div>
    <div class="wk-note" style="padding:0 16px 12px">You started <b>${esc(w.name)}</b> and didn't finish it.
      Nothing's lost — pick it back up or save what you did.</div>
    <div class="wk-row">
      <button class="b b-ghost" onclick="dropUnfinished()">Throw it away</button>
      <button class="b b-blue" onclick="renderSession()">Pick it back up</button>
    </div>
    <div class="wk-row" style="padding-top:0">
      <button class="b b-primary" style="width:100%" onclick="finishWorkout()">Save it to my history</button>
    </div>
  </div>`;
}
async function dropUnfinished(){
  if(!await ask("Throw away the sets you logged?\n\nThis can't be undone.","Throw it away",1)) return;
  wkSession=null; save(); renderWorkouts(); toast("Cleared");
}

function finishWorkout(){
  const w=wkById(wkSession.id), last=lastSess(wkSession.id);
  const t=sessTotals();
  /* Guard on sets logged, not on volume. Volume is reps × weight, so a session
     where you hadn't typed a weight scored zero and Finish quietly refused to
     save it — you'd tap the button, nothing would happen, and the whole workout
     was gone. Bodyweight sessions are real sessions. */
  if(!t.logged){ toast("Log at least one set first"); return; }
  const pct=Math.round((t.vol-last.vol)/(last.vol||1)*100);
  /* Stored two ways: entries is the whole session added up, so history and the
     Last: line keep working exactly as before. rounds keeps the round-by-round
     detail underneath it. */
  const entries=Object.fromEntries(w.ex.map(e=>{
    const sets=wkSession.entries[e.n];
    return [e.n,{reps:sets.reduce((a,c)=>a+c.reps,0),
                 wt:Math.max(...sets.map(c=>c.wt))}];
  }));
  wkHist[w.id]=wkHist[w.id]||[];
  /* This session has been writing itself down since the first set, so finish by
     updating that record — pushing a second one would leave a duplicate. */
  const rec=persistSession(true);
  if(!rec){
    wkHist[w.id].push({ago:0, d:wkSession.forDay||ymd(new Date()), vol:Math.round(t.vol), entries, partial:false});
  } else {
    rec.vol=Math.round(t.vol); rec.entries=entries; rec.partial=false;
    rec.rounds=wkSession.entries ? JSON.parse(JSON.stringify(wkSession.entries)) : null;
  }
  wkHist[w.id].sort((a,b)=>String(a.d||"").localeCompare(String(b.d||"")));
  /* The old cap kept six sessions and threw the rest away, so your history could
     never go back further than six workouts. Keeping the lot; the chart takes
     the recent slice it needs. */
  if(wkHist[w.id].length>400) wkHist[w.id]=wkHist[w.id].slice(-400);
  const when=wkSession.forDay||ymd(new Date());
  wkSession=null;
  save(); renderWorkouts();
  const total=(wkHist[w.id]||[]).filter(h=>!h.partial).length;
  toast(`Saved — ${w.name}, ${t.logged} set${t.logged===1?"":"s"} on ${dayLabel(when)}. `
      + `${total} session${total===1?"":"s"} logged in total.`);
}

/* ================= EDIT A WORKOUT =================
   Change which days it lands on, rename it, add or drop moves. Your logged
   sessions are kept — only the plan changes. */
let editingWorkout=null;
function editWorkout(id){
  const w=wkById(id); if(!w){ toast("That workout is gone"); return; }
  editingWorkout=id;
  newEx=w.ex.map(e=>({n:e.n,t:e.t,d:e.d||10}));
  $("ewTitle").textContent="Edit "+w.name;
  $("ewName").value=w.name;
  $("ewIcon").value=w.icon;
  $("ewDays").innerHTML=DOW.map(d=>`<span class="chip${w.days.includes(d)?" on":""}" onclick="this.classList.toggle('on')">${d}</span>`).join("");
  $("ewRounds").value=w.rounds||1;
  $("ewKeep").textContent=`${doneSess(id).length} logged session${doneSess(id).length===1?"":"s"} stay exactly as they are.`;
  drawEwRows();
  closeAll(); openSheet("editWorkout");
}
/* One row per move. The arrows shuffle it up and down the list so the order on
   screen is the order you actually do them in. */
function exRowHTML(e,i,redraw){
  return `<div class="exrow">
    <div class="ord">
      <div class="ob${i===0?" off":""}" onclick="moveEx(${i},-1,'${redraw}')">▲</div>
      <div class="ob${i===newEx.length-1?" off":""}" onclick="moveEx(${i},1,'${redraw}')">▼</div>
    </div>
    <input class="f" value="${esc(e.n)}" placeholder="Move ${i+1}" oninput="newEx[${i}].n=this.value">
    <input class="f rp" type="number" inputmode="numeric" min="1" value="${e.d||""}" placeholder="reps"
           title="Usual reps for this move" oninput="newEx[${i}].d=+this.value||0">
    <div class="tg${e.t==="w"?" w":""}" onclick="newEx[${i}].t=newEx[${i}].t==='w'?'r':'w';window['${redraw}']()">${e.t==="w"?"Weight":"Reps"}</div>
    <div class="xx" onclick="rmExAt(${i},'${redraw}')">✕</div></div>`;
}
function moveEx(i,d,redraw){
  const j=i+d; if(j<0||j>=newEx.length) return;
  const [row]=newEx.splice(i,1); newEx.splice(j,0,row); window[redraw]();
}
function rmExAt(i,redraw){ newEx.splice(i,1); if(!newEx.length) newEx.push({n:"",t:"r",d:10}); window[redraw](); }
function drawEwRows(){ $("ewRows").innerHTML=newEx.map((e,i)=>exRowHTML(e,i,"drawEwRows")).join(""); }
function addEwRow(){ newEx.push({n:"",t:"r",d:10}); drawEwRows(); }
function saveWorkoutEdit(){
  const w=wkById(editingWorkout); if(!w){ closeAll(); return; }
  const name=$("ewName").value.trim();
  if(!name){ $("ewName").focus(); toast("Needs a name"); return; }
  const days=[...document.querySelectorAll("#ewDays .chip.on")].map(c=>c.textContent);
  const ex=newEx.filter(e=>e.n.trim()).map(e=>({n:e.n.trim(),t:e.t,d:Math.max(1,+e.d||10)}));
  if(!ex.length){ toast("Keep at least one move"); return; }
  const oldDays=w.days.join("/");
  w.name=name; w.icon=$("ewIcon").value||w.icon;
  w.days=days.length?days:w.days; w.perWeek=w.days.length; w.ex=ex;
  w.rounds=Math.max(1,Math.min(5,+$("ewRounds").value||1));
  save(); closeAll(); renderWorkouts();
  toast(oldDays!==w.days.join("/") ? `${w.name} → ${w.days.join(", ")}` : "Saved");
}
function deleteWorkout(){
  const w=wkById(editingWorkout); if(!w) return;
  const snap=JSON.parse(JSON.stringify(w)), hist=wkHist[w.id];
  const i=WK.findIndex(x=>x.id===w.id);
  WK.splice(i,1); delete wkHist[w.id];
  save(); closeAll(); renderWorkouts();
  toastUndo("Deleted: "+w.name, ()=>{ WK.splice(i,0,snap); wkHist[snap.id]=hist; save(); renderWorkouts(); });
}

/* ================= CARDIO ================= */
const CTYPE={Jog:{i:"🏃",c:"#ff5f7e"},Run:{i:"⚡",c:"#ff9d4d"},Walk:{i:"🚶",c:"#2fd39a"},Bike:{i:"🚲",c:"#5b9dff"},Hike:{i:"🥾",c:"#a78bfa"}};
let cardio=[];
let cid=20;
const pace=(mi,min)=>{ if(!mi) return "—"; const p=min/mi; const m=Math.floor(p);
  return m+":"+String(Math.round((p-m)*60)).padStart(2,"0")+" /mi"; };

/* Miles this week against last week. One measure over two periods, so it's one
   colour — last week sits back, this week comes forward. Two bars, both labelled;
   nothing else on it. */
function cardioWeek(off){
  const [a,b]=weekBounds(off);
  return cardio.filter(c=>c.d && c.d>=a && c.d<=b);
}
const weekMiles = off => cardioWeek(off).reduce((a,c)=>a+(+c.mi||0),0);
/* Weeks in a row with at least one session, counting back from this one. This
   week only breaks the run once it's over — a quiet Monday isn't a failure. */
function cardioStreak(){
  let n=0;
  if(cardioWeek(0).length) n=1;
  for(let i=1;i<52;i++){ if(cardioWeek(-i).length) n++; else break; }
  return n;
}
function weekCompare(){
  const now=weekMiles(0), before=weekMiles(-1);
  const max=Math.max(now,before,1);
  const diff=now-before;
  const runsNow=cardioWeek(0).length;
  const streak=cardioStreak();
  const bar=(label,val,strong)=>`
    <div class="cmp">
      <div class="cmp-l">${label}</div>
      <div class="cmp-track"><i style="width:${Math.max(2,Math.round(val/max*100))}%;
        background:#ff5f7e;opacity:${strong?1:.38}"></i></div>
      <div class="cmp-v" style="color:${strong?'#ff5f7e':'var(--ink3)'}">${val.toFixed(1)}</div>
    </div>`;
  let read;
  if(!before && !now) read=`Log a jog and this fills in.`;
  else if(!before)    read=`First week with anything logged. Next week has something to beat.`;
  else if(diff>0.05)  read=`<b style="color:#4fd6a5">${diff.toFixed(1)} miles ahead</b> of last week.`;
  else if(diff<-0.05) read=`<b style="color:#ff9d4d">${Math.abs(diff).toFixed(1)} miles behind</b> last week — ${
                            (Math.abs(diff)/ (before||1) < .25) ? "close enough to catch." : "still time."}`;
  else                read=`Level with last week.`;
  return `<div class="card">
    <div class="card-head"><span class="card-title">This week vs last</span>
      <span class="link" style="color:${streak>1?'#4fd6a5':'var(--ink3)'}">
        ${streak>1?`🔥 ${streak} weeks running`:streak===1?"week 1":"no streak yet"}</span></div>
    <div style="padding:2px 16px 4px">
      <div style="display:flex;align-items:baseline;gap:8px">
        <b style="font-size:31px;font-weight:800;color:#ff5f7e;letter-spacing:-.02em">${now.toFixed(1)}</b>
        <span style="font-size:12px;color:var(--ink3)">miles this week · ${runsNow} session${runsNow===1?"":"s"}</span>
      </div>
    </div>
    <div style="padding:8px 16px 4px">
      ${bar("Last week",before,false)}
      ${bar("This week",now,true)}
    </div>
    <div class="wk-note" style="padding:6px 16px 14px">${read}</div>
  </div>`;
}

function renderCardio(){
  $("wkSub").textContent="Jogs, rides and walks · distance and pace over time";
  const sorted=[...cardio].sort((a,b)=>daysAgo(b)-daysAgo(a));
  const jogs=sorted.filter(c=>c.type==="Jog"||c.type==="Run");
  const week=cardio.filter(c=>daysAgo(c)<7);
  const wkMi=week.reduce((a,c)=>a+c.mi,0);
  const best=jogs.length?jogs.reduce((a,c)=>(c.min/c.mi)<(a.min/a.mi)?c:a):null;
  const max=Math.max(...sorted.map(c=>c.mi),1);

  /* Order on purpose: your numbers first, then the checklists you open before
     and after, then logging at the bottom where you land once you're back. */
  $("wkBody").innerHTML=`
    ${weekCompare()}
    <div class="card">
      <div class="card-head"><span class="card-title">Distance · last ${sorted.length}</span><span class="link">Miles</span></div>
      <div class="chart" style="height:100px">${sorted.map(c=>{
        const col=CTYPE[c.type].c;
        return `<div class="bar" title="${c.type} · ${c.mi} mi">
          <div class="vv" style="color:${col}">${c.mi}</div>
          <i style="height:${Math.max(8,Math.round(c.mi/max*100))}%;background:linear-gradient(180deg,${col},${col}44)"></i>
          <em>${daysAgo(c)===0?"today":daysAgo(c)+"d"}</em></div>`;}).join("")}</div>
      <div class="wk-note" style="padding-top:12px">Taller bar = longer session.</div>
    </div>

    ${prepCard("cardio","warm")}
    ${prepCard("cardio","cool")}

    <div class="card">
      <div class="card-head"><span class="card-title">Recent</span>
        <span class="link">${cardio.length} logged</span></div>
      ${sorted.slice().reverse().map(c=>{const t=CTYPE[c.type];
        return `<div class="lg" style="cursor:pointer" onclick="openRun(${c.id})">
          <div class="icon" style="background:${t.c}22">${t.i}</div>
          <div class="lm"><b>${c.type} · ${c.mi} mi${c.hr?` · ${c.hr} bpm`:``}${c.src==="watch"?` ⌚`:``}</b><span>${daysAgo(c)===0?"Today":daysAgo(c)===1?"Yesterday":daysAgo(c)+" days ago"} · ${c.min} min</span></div>
          <div class="lr"><b style="color:${t.c}">${pace(c.mi,c.min)}</b><span>Pace</span></div>
          <div class="lx" onclick="event.stopPropagation();delCardio(${c.id})">✕</div>
        </div>`;}).join("")}
      <div class="wk-row"><button class="b b-blue" onclick="openSheet('cardioAdd')">+ Log a run</button></div>
    </div>`;
}
/* Heart rate over one run. One series, so no legend — the title names it.
   2px line, recessive axes, no number on every point. Drag across to read a
   value; nothing else on the chart competes with the line. */
function hrChart(c){
  const s=(c.hrSeries||[]).filter(v=>v>0);
  if(s.length<3) return "";
  const W=300,H=100,PAD=6;
  const lo=Math.min(...s), hi=Math.max(...s);
  const span=Math.max(1,hi-lo);
  const x=i=>PAD+(i/(s.length-1))*(W-PAD*2);
  const y=v=>H-PAD-((v-lo)/span)*(H-PAD*2);
  const d=s.map((v,i)=>`${i?"L":"M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const avg=Math.round(s.reduce((a,b)=>a+b,0)/s.length);
  return `<div class="hrwrap">
    <div class="hr-read" id="hrRead"><b>${avg}</b> bpm average · drag to read</div>
    <svg class="hrsvg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
         onpointermove="hrProbe(event,this)" onpointerleave="hrReset(${avg})">
      <line x1="0" y1="${y(avg).toFixed(1)}" x2="${W}" y2="${y(avg).toFixed(1)}"
            stroke="#2a3442" stroke-width="1" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"/>
      <path d="${d}" fill="none" stroke="#ff5f7e" stroke-width="2"
            stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
      <circle id="hrDot" r="0" fill="#ff5f7e" stroke="#0f141b" stroke-width="2"/>
    </svg>
    <div class="hr-ax"><span>${lo} bpm</span><span>${c.min} min</span><span>${hi} bpm</span></div>
  </div>`;
}
let _hrData=[];
function hrProbe(ev, svg){
  if(!_hrData.length) return;
  const r=svg.getBoundingClientRect();
  const f=Math.min(1,Math.max(0,(ev.clientX-r.left)/r.width));
  const i=Math.round(f*(_hrData.length-1));
  const el=document.getElementById("hrRead");
  if(el) el.innerHTML=`<b>${_hrData[i]}</b> bpm · ${Math.round(f*100)}% through`;
  const dot=document.getElementById("hrDot");
  if(dot){ const lo=Math.min(..._hrData), hi=Math.max(..._hrData), span=Math.max(1,hi-lo);
    dot.setAttribute("cx",(6+(i/(_hrData.length-1))*288).toFixed(1));
    dot.setAttribute("cy",(100-6-((_hrData[i]-lo)/span)*88).toFixed(1));
    dot.setAttribute("r","4"); }
}
function hrReset(avg){
  const el=document.getElementById("hrRead");
  if(el) el.innerHTML=`<b>${avg}</b> bpm average · drag to read`;
  const dot=document.getElementById("hrDot"); if(dot) dot.setAttribute("r","0");
}

function openRun(id){
  const c=cardio.find(x=>x.id===id); if(!c){ toast("That one's gone"); return; }
  _hrData=(c.hrSeries||[]).filter(v=>v>0);
  const t=CTYPE[c.type]||{i:"🏃",c:"#ff5f7e"};
  const hrs=_hrData.length?{lo:Math.min(..._hrData),hi:Math.max(..._hrData),
    avg:Math.round(_hrData.reduce((a,b)=>a+b,0)/_hrData.length)}:null;
  $("nodeBody").innerHTML=`
    <div class="nlabel" style="color:${t.c};font-size:10px">${c.src==="watch"?"FROM YOUR WATCH":"LOGGED BY HAND"}</div>
    <h2 style="font-size:19px">${t.i} ${esc(c.type)} · ${c.mi} mi</h2>
    <div style="font-size:12px;color:var(--ink3);margin-top:3px">${agoLabel(daysAgo(c))}</div>
    <div class="sess-sum" style="padding:14px 0 4px">
      <div class="ss"><b style="color:${t.c}">${c.mi}</b><span>Miles</span></div>
      <div class="ss"><b>${c.min}</b><span>Minutes</span></div>
      <div class="ss"><b style="font-size:14px">${pace(c.mi,c.min)}</b><span>Pace</span></div>
    </div>
    ${(c.hr||hrs)?`<div class="sess-sum" style="padding:4px 0 10px">
      <div class="ss"><b style="color:#ff5f7e">${c.hr||(hrs&&hrs.avg)||"—"}</b><span>Avg BPM</span></div>
      <div class="ss"><b>${c.hrMax||(hrs&&hrs.hi)||"—"}</b><span>Peak</span></div>
      <div class="ss"><b>${c.kcal||"—"}</b><span>Calories</span></div>
    </div>`:``}
    ${hrs?`<label class="f" style="margin-top:6px">Heart rate through the run</label>${hrChart(c)}`
        :`<div class="wk-note" style="padding:10px 0">No heart rate on this one.
           Runs that come in from your watch carry it automatically.</div>`}
    <div class="btns" style="margin-top:14px">
      <button class="b b-ghost" onclick="closeAll()">Close</button>
      <button class="b b-danger" onclick="delCardio(${c.id});closeAll()">Delete</button>
    </div>`;
  closeAll(); openSheet("node");
}

function saveCardio(){
  const mi=+$("cdMi").value, min=+$("cdMin").value;
  if(!mi||!min){ toast("Need distance and time"); return; }
  const _cb=dataSizes();
  cardio.push({id:newId(),ago:0,d:ymd(new Date()),type:$("cdType").value,mi:+mi.toFixed(2),min});
  logChange("you logged cardio", _cb);
  closeAll(); renderCardio(); $("cdMi").value=""; $("cdMin").value="";
  toast(`Logged ${mi} mi at ${pace(mi,min)}`);
}
function delCardio(id){ const snap=cardio.find(c=>c.id===id); if(!snap) return;
  cardio=cardio.filter(c=>c.id!==id); save(); renderCardio();
  toastUndo("Removed that "+snap.type.toLowerCase(), ()=>{ cardio.push(snap); renderCardio(); }); }

/* ================= MEALS ================= */
const SLOTS=["Breakfast","Lunch","Dinner","Snack"];
let meals={kcalTarget:2400, pTarget:160, id:1, today:[], hist:[]};

function renderMeals(){
  const box=$("mlBody"); if(!box) return;
  const kcal=meals.today.reduce((a,m)=>a+m.kcal,0);
  const prot=meals.today.reduce((a,m)=>a+m.p,0);
  const pct=Math.round(kcal/meals.kcalTarget*100);
  const ppct=Math.round(prot/meals.pTarget*100);
  /* meals.hist is written by archiveDay at rollover; today is added on the end
     for the chart only. It used to be the ONLY entry, so the 7-day chart was one
     bar pretending to be a week. */
  const hist=[...(meals.hist||[]).slice(-6), {ago:0, d:ymd(new Date()), kcal}];
  const hmax=Math.max(...hist.map(h=>h.kcal),meals.kcalTarget);

  box.innerHTML=`
    <div class="card">
      <div class="card-head"><span class="card-title">Today</span>
        <span class="link" style="color:${pct>110?'#ff8f8f':pct>=85?'#4fd6a5':'#8d99ab'}">${pct}% of target</span></div>
      <div class="tk-bar"><i style="width:${Math.min(100,pct)}%;background:${pct>110?'#ff6b6b':'linear-gradient(90deg,#0ea472,#16d494)'}"></i></div>
      <div class="macro">
        <div class="mc"><b style="color:#4fd6a5">${kcal.toLocaleString()}</b><span>Calories</span></div>
        <div class="mc"><b style="color:var(--ink3);font-size:13px">${meals.kcalTarget.toLocaleString()}</b><span>Target</span></div>
        <div class="mc"><b style="color:${ppct>=100?'#4fd6a5':'#5b9dff'}">${prot}<span style="color:var(--ink3);font-size:11px">g</span></b><span>Protein</span></div>
        <div class="mc"><b style="color:var(--ink3);font-size:13px">${meals.kcalTarget-kcal>0?(meals.kcalTarget-kcal).toLocaleString():0}</b><span>Left</span></div>
      </div>
    </div>
    <div class="card">
      <div class="card-head"><span class="card-title">Last 7 days</span><span class="link">Calories</span></div>
      <div class="chart" style="height:100px">${hist.map(h=>{
        const over=h.kcal>meals.kcalTarget*1.1, col=over?"#ff7a7a":daysAgo(h)===0?"#16d494":"#5b9dff";
        return `<div class="bar" title="${h.kcal} kcal">
          <div class="vv" style="color:${col}">${(h.kcal/1000).toFixed(1)}k</div>
          <i style="height:${Math.max(8,Math.round(h.kcal/hmax*100))}%;background:linear-gradient(180deg,${col},${col}44)"></i>
          <em>${daysAgo(h)===0?"today":daysAgo(h)+"d"}</em></div>`;}).join("")}</div>
      <div class="wk-note" style="padding-top:12px">Red means you went 10% over target that day.</div>
    </div>
    <div class="card">
      <div class="card-head"><span class="card-title">What you ate</span><span class="link">${meals.today.length} ${meals.today.length===1?"entry":"entries"}</span></div>
      ${SLOTS.map(s=>{const items=meals.today.filter(m=>m.slot===s); if(!items.length) return "";
        return `<div class="slot">${s} · ${items.reduce((a,m)=>a+m.kcal,0)} kcal</div>
        ${items.map(m=>`<div class="lg">
          <div class="icon" style="background:#0d2620">🍽️</div>
          <div class="lm"><b>${esc(m.n)}</b><span>${m.p}g protein</span></div>
          <div class="lr"><b style="color:#4fd6a5">${m.kcal}</b><span>kcal</span></div>
          <div class="lx" onclick="delMeal(${m.id})">✕</div></div>`).join("")}`;}).join("")}
      ${!meals.today.length?`<div class="empty">Nothing logged yet today.</div>`:``}
      <div class="wk-row">
        <button class="b b-violet" onclick="openMealCamera()">📷 Photo</button>
        <button class="b b-primary" onclick="openSheet('mealAdd')">+ Log food</button>
      </div>
      ${(hlPrefs.foods&&hlPrefs.foods.length)?`<div class="card-pad" style="padding-top:0">
        <div style="font-size:10px;font-weight:900;letter-spacing:.12em;color:var(--ink3)">EAT OFTEN</div>
        <div class="chips" style="margin-top:8px">
          ${hlPrefs.foods.slice(0,8).map((f,i)=>`<span class="chip" onclick="logFoodPreset(${i})">${esc(f.n)} · ${f.kcal}</span>`).join("")}
        </div></div>`:``}
    </div>`;
}
function saveMeal(){
  const n=$("mlName").value.trim(), kcal=+$("mlKcal").value;
  if(!n||!kcal){ toast("Need a name and calories"); return; }
  meals.today.push({id:newId(),slot:$("mlSlot").value,n,kcal,p:+$("mlP").value||0,
                    t:new Date().toISOString()});
  $("mlName").value=""; $("mlKcal").value=""; $("mlP").value="";
  save();                       // this was missing — every meal was lost on reload
  closeAll(); renderMeals(); toast(`Logged ${n} · ${kcal} kcal`);
}
function delMeal(id){ const snap=meals.today.find(m=>m.id===id); if(!snap) return;
  meals.today=meals.today.filter(m=>m.id!==id); save(); renderMeals();
  toastUndo("Removed: "+snap.n, ()=>{ meals.today.push(snap); save(); renderMeals(); }); }

/* ================= BUILD YOUR OWN WORKOUT ================= */
let newEx=[{n:"",t:"r",d:10},{n:"",t:"r",d:10},{n:"",t:"r",d:10}];
function openNewWorkout(){ newEx=[{n:"",t:"r",d:10},{n:"",t:"r",d:10},{n:"",t:"r",d:10}];
  const r=$("wkRounds"); if(r) r.value=1;
  drawExRows(); openSheet("wkAdd"); }
function drawExRows(){ $("exRows").innerHTML=newEx.map((e,i)=>exRowHTML(e,i,"drawExRows")).join(""); }
function toggleExType(i){ newEx[i].t = newEx[i].t==="w"?"r":"w"; drawExRows(); }
function rmEx(i){ rmExAt(i,'drawExRows'); }
function addExRow(){ newEx.push({n:"",t:"r",d:10}); drawExRows(); }
function saveWorkout(){
  const name=$("wkName").value.trim();
  const ex=newEx.filter(e=>e.n.trim()).map(e=>({n:e.n.trim(),t:e.t,d:Math.max(1,+e.d||10)}));
  if(!name){ $("wkName").focus(); toast("Name it first"); return; }
  if(!ex.length){ toast("Add at least one move"); return; }
  const days=[...document.querySelectorAll("#wkDays .chip.on")].map(c=>c.textContent);
  const id="w"+Date.now().toString(36);
  const pal=[["#ff5f7e","#2a1119"],["#5b9dff","#0f1d33"],["#2fd39a","#0d2620"],["#ff9d4d","#2a1a0b"],["#a78bfa","#1c1533"]];
  const p=pal[WK.length%pal.length];
  const rounds=Math.max(1,Math.min(5,+($("wkRounds")||{}).value||1));
  WK.push({id,name,icon:$("wkIcon").value||"🏋️",fg:p[0],bg:p[1],perWeek:days.length||1,
           days:days.length?days:["Mon"],rounds,ex});
  wkHist[id]=[{ago:0,vol:0,entries:Object.fromEntries(ex.map(e=>[e.n,{reps:0,wt:0}]))}];
  $("wkName").value="";
  save();
  closeAll(); wkTab="strength"; renderWorkouts();
  toast(`${name} added — ${ex.length} moves${rounds>1?`, ${rounds} rounds`:``}`);
}

/* ---- Add Task ↔ project picker. aCat is left completely alone. ---- */
let pendingProject=null;
function syncProjPicker(){
  const sel=$("aProj"); if(!sel) return;
  const keep=pendingProject || sel.value;
  const top=topCatOf($("aCat").value);
  const inCat=PROJECTS.filter(p=>p.cat===top), other=PROJECTS.filter(p=>p.cat!==top);
  sel.innerHTML=`<option value="">— None (standalone task) —</option>`
    + (inCat.length?`<optgroup label="${top}">${inCat.map(p=>`<option value="${p.id}">${p.icon} ${p.name}</option>`).join("")}</optgroup>`:``)
    + (other.length?`<optgroup label="Other categories">${other.map(p=>`<option value="${p.id}">${p.icon} ${p.name}</option>`).join("")}</optgroup>`:``);
  if(keep && projById(keep)) sel.value=keep;
  pendingProject=null;
}
let sugTimer=null;
function syncSuggest(){
  const box=$("aSuggest"); if(!box) return;
  const name=$("aName").value.trim();
  if(!name || $("aProj").value){ box.style.display="none"; return; }
  let id=suggestProject(name,$("aCat").value);
  // ask the model once you've stopped typing, if the keyword guess found nothing
  if(AI.on && !id && name.length>6 && !prefs.aiOnAsk){
    clearTimeout(sugTimer);
    sugTimer=setTimeout(async()=>{
      if($("aName").value.trim()!==name || $("aProj").value) return;
      const r=await callAI(
        `Which project does this task belong to? Reply with ONLY the project id, or the word none.\nPROJECTS:\n`
        + PROJECTS.map(p=>`${p.id} = ${p.name} — ${p.goal}`).join("\n"),
        name, 20);
      const pid=(r||"").trim().replace(/[^\w-]/g,"");
      if(projById(pid) && $("aName").value.trim()===name && !$("aProj").value) showSuggest(pid,true);
    }, 700);
  }
  if(!id){
    // nothing from the keyword guess — offer to ask, rather than asking on its own
    if(AI.on && prefs.aiOnAsk && name.length>6){
      box.style.display="block";
      box.innerHTML=`<div class="sugg" style="cursor:pointer" onclick="askProjectSuggest()">
        <div class="sg-l">ASK AI WHERE THIS GOES</div>
        <div class="sg-n" style="color:#c4b0ff">Tap and it'll pick a project</div></div>`;
      return;
    }
    box.style.display="none"; return; }
  showSuggest(id,false); }

/* Only runs when you tap it. This is the "suggest only when I ask" setting —
   nothing reaches the model until you say so. */
async function askProjectSuggest(){
  const box=$("aSuggest"), name=$("aName").value.trim(); if(!name) return;
  box.innerHTML=`<div class="sugg"><div class="sg-l">ASKING…</div></div>`;
  const r=await callAI(
    `Which project does this task belong to? Reply with ONLY the project id, or the word none.\nPROJECTS:\n`
    + PROJECTS.map(p=>`${p.id} = ${p.name} — ${p.goal}`).join("\n"),
    name, 20);
  const pid=(r||"").trim().replace(/[^\w-]/g,"");
  if(projById(pid)) showSuggest(pid,true);
  else { box.innerHTML=`<div class="sugg"><div class="sg-l">NOTHING OBVIOUS</div>
    <div class="sg-n" style="color:var(--ink3)">Pick a project above, or leave it loose</div></div>`; }
}

function showSuggest(id,fromAI){
  const box=$("aSuggest"), p=projById(id); if(!p) return;
  box.style.display="block";
  box.innerHTML=`<div class="sugg">
    <div style="flex:1;min-width:0">
      <div class="sl">Suggested project${fromAI?" · AI":""}</div>
      <div class="sn">${p.icon} ${esc(p.name)}</div>
    </div>
    <div class="crbtn take" onclick="acceptSuggest('${id}')">Use it</div>
    <div class="crbtn drop" onclick="this.parentElement.parentElement.style.display='none'">✕</div>
  </div>`;
}
function acceptSuggest(id){ $("aProj").value=id; $("aSuggest").style.display="none"; toast("Set to "+projById(id).name); }

/* ---- task → Problem Solver handoff (never wipes a web without asking) ---- */
let solveSource=null;
async function solveTask(id){
  const t=getTask(id); if(!t) return;
  const hasWeb = P.nodes && P.nodes.length;
  if(hasWeb && !await ask("You've got a web open in Problem Solver. Start a new one for this task?","Start fresh")) return;
  solveSource={task:t.id, proj:t.proj||null, web:null};
  closeAll();
  resetPlanner();
  $("seedInput").value = t.name + (t.notes?" — "+t.notes:"");
  picks=[String(t.id)]; renderStartPicks();
  go("planner");
  toast("Loaded into Problem Solver — hit Build the web");
}

/* ================= EDIT A ROUTINE / TRACKER =================
   Streak, history, notes and project all survive. Only the settings change. */
let editingRoutine=null;
function bumpTarget(id,d){
  const t=getTask(id); if(!t) return;
  // floor of 2 on this control: at 1 it stops being a counter and the card would
  // vanish off Tracker, which reads exactly like losing your data.
  const nt=Math.max(2,Math.min(50,(t.target||1)+d));
  if(nt===t.target){
    if(d<0) toast(`${t.name} can't go below 2 here — use Edit to turn it into a plain checkbox`);
    return;
  }
  const before={target:t.target, count:t.count, done:t.done};
  t.target=nt;
  // deliberately NOT clamping count — lowering the goal must never erase what you logged
  t.done=t.count>=t.target;
  save(); render(); renderTracker(); renderRoutines();
  const over = t.count>nt;
  toastUndo(`${t.name} → ${nt} ${plural(t.unit,nt)} a day${over?` · your ${t.count} logged are safe`:``}`,
    ()=>{ Object.assign(t,before); render(); renderTracker(); renderRoutines(); });
}
function openRoutineEdit(id){
  const t=getTask(id); if(!t) return;
  editingRoutine=id;
  $("erTitle").textContent="Edit "+t.name;
  $("erName").value=t.name;
  $("erTarget").value=t.target||1;
  $("erUnit").value=t.unit||"time";
  $("erTime").value=t.time;
  $("erEst").value=t.est||0;
  $("erNotes").value=t.notes||"";
  $("erCat").innerHTML=Object.entries(CATS).map(([k,v])=>`<option value="${k}"${k===t.cat?" selected":""}>${v.icon}  ${v.label}</option>`).join("");
  $("erFreq").innerHTML=FREQS.map(f=>`<option${f===t.freq?" selected":""}>${f}</option>`).join("");
  $("erKeep").textContent=`Streak of ${t.streak} and ${(history[t.id]||[]).length} days of history stay exactly as they are.`;
  $("erFreqBox").style.display=t.routine?"block":"none";
  closeAll(); openSheet("editRoutine");
}
async function saveRoutineEdit(){
  const t=tasks.find(x=>x.id===editingRoutine); if(!t){ toast("That one is gone"); closeAll(); return; }
  const name=$("erName").value.trim();
  if(!name){ $("erName").focus(); toast("Needs a name"); return; }
  const oldTarget=t.target;
  t.name=name;
  t.cat=$("erCat").value;
  t.time=$("erTime").value||t.time;
  t.est=+$("erEst").value||0;
  t.notes=$("erNotes").value.trim();
  if(t.routine){
    const nt=Math.max(1,Math.min(50,+$("erTarget").value||1));
    if(oldTarget>1 && nt===1 && !await ask(
      `Setting ${t.name} to 1 a day turns it into a plain checkbox and takes it off the Tracker page.\n\nYour ${t.count} logged and your ${t.streak}-day streak are kept either way.`,"Make it a checkbox")) return;
    t.freq=$("erFreq").value; t.target=nt; t.unit=$("erUnit").value.trim()||"time";
  }
  t.done=isCounter(t) ? (t.count||0)>=t.target : t.done;   // logged count is never trimmed
  save(); closeAll(); render(); renderTracker(); renderRoutines(); renderTasks(); renderOverview();
  toast(oldTarget!==t.target ? `${t.name} → ${t.target} ${unitOf(t)} a day` : "Saved");
}

/* ================= AI TRACKER BUILDER =================
   Slot filling, not a real model. It reads what you typed, then asks only for
   what it still needs. */
const UNITS=[["glass","glass|water|cup"],["oz","oz|ounce"],["bottle","bottle"],["dose","dose|pill|med|tablet|vitamin"],
  ["serving","serving|meal|portion|shake|protein"],["rep","rep|pushup|push-up|situp|squat|curl"],
  ["mile","mile|run|jog|walk"],["1k steps","step"],["page","page|read|chapter"],
  ["minute","minute|min|meditat|stretch|practice"],["session","session|round|set"],["hour","hour"]];
let tb=null;
function openTrackerAI(){
  tb={name:"",target:0,unit:"",freq:"",cat:"",chat:[],asked:[],ready:false,aiTried:false};
  tbSay("ai",`<div>What do you want to keep track of? Say it however it comes out — <i>"drink more water"</i>,
    <i>"2 pills a day"</i>, <i>"stretch every morning"</i>. I'll ask about anything I still need.</div>`);
  closeAll(); openSheet("trackerAI");
  setTimeout(()=>$("tbInput").focus(),320);
}
function tbSay(who,html){ tb.chat.push({who,html}); tbDraw(); }
function tbDraw(){
  $("tbChat").innerHTML=tb.chat.map(m=>`<div class="bub ${m.who}">${m.who==="you"?esc(m.html):m.html}</div>`).join("");
  const c=$("tbChat"); c.scrollTop=c.scrollHeight;
}
function tbChips(list,key){
  return `<div class="chips" style="margin-top:9px">${list.map(x=>
    `<span class="chip" onclick="tbPick('${key}','${x}')">${x}</span>`).join("")}</div>`;
}
function tbPick(key,val){
  if(key==="unit") tb.unit=val;
  if(key==="freq") tb.freq=val;
  if(key==="target") tb.target=+val;
  $("tbInput").value=val; tbSend();
}
function tbParse(s){
  const low=s.toLowerCase();
  if(!tb.target){ const m=low.match(/(\d+)\s*(?:x|times)?/); if(m && +m[1]>0 && +m[1]<=50) tb.target=+m[1]; }
  if(!tb.unit) for(const [u,rx] of UNITS) if(new RegExp(rx).test(low)){ tb.unit=u; break; }
  if(!tb.freq){
    if(/every ?day|daily|each day/.test(low)) tb.freq="Every day";
    else if(/weekday|work day|mon.*fri/.test(low)) tb.freq="Weekdays";
    else if(/weekend/.test(low)) tb.freq="Weekends";
    else if(/mon.*wed.*fri|3 ?(x|times) a week/.test(low)) tb.freq="Mon/Wed/Fri";
  }
  if(!tb.cat) tb.cat=guessCat(s);
  if(!tb.name){
    let n=s
      .replace(/^(i (want|need|would like|wanna|gotta) to\s*)/i,"")
      .replace(/^(track|keep track of|log|record|monitor|remember to|start)\s+/i,"")
      .replace(/^(my|the)\s+/i,"")
      .replace(/\b(\d+)\b/g,"")
      .replace(/\b(a|per|each|every|day|daily|times?|x|more)\b/gi,"")
      .replace(/[^\w\s'-]/g," ")
      .replace(/\s{2,}/g," ").trim();
    n=n.replace(/^(of|for|on|to)\s+/i,"").trim();
    if(n.length>1) tb.name=n.charAt(0).toUpperCase()+n.slice(1).replace(/\s{2,}/g," ").trim();
  }
}
function tbSend(){
  const v=$("tbInput").value.trim(); if(!v) return;
  tbSay("you",v); $("tbInput").value="";
  if(tb.ready){ if(tbEdit(v)) setTimeout(tbConfirm,420); return; }
  tbParse(v);
  setTimeout(tbNext,420);
}
/* corrections at the preview stage: "make it 10", "call it Water", "weekdays only" */
function tbEdit(s){
  const low=s.toLowerCase(); let hit=false;
  let m=low.match(/(?:call (?:it|them)|name it|rename to|call each one an?)\s+(.+)/);
  if(m){ const val=m[1].replace(/[.!]$/,"").trim();
    if(/call each one|call them/.test(low)) tb.unit=val.replace(/s$/,"");
    else tb.name=val.charAt(0).toUpperCase()+val.slice(1);
    hit=true; }
  m=low.match(/(?:make it|change to|set to|do)\s*(\d+)/) || (/^\d+$/.test(low)?[0,low]:null);
  if(m && +m[1]>0 && +m[1]<=50){ tb.target=+m[1]; hit=true; }
  for(const f of FREQS) if(low.includes(f.toLowerCase().split("/")[0])){ tb.freq=f; hit=true; break; }
  if(/weekday|work day/.test(low)){ tb.freq="Weekdays"; hit=true; }
  if(/weekend/.test(low)){ tb.freq="Weekends"; hit=true; }
  if(/every ?day|daily/.test(low)){ tb.freq="Every day"; hit=true; }
  for(const [u,rx] of UNITS) if(new RegExp("\\b("+rx+")\\b").test(low)){ tb.unit=u; hit=true; break; }
  if(!hit) tbSay("ai",`<div>I can change the <b>name</b>, the <b>number</b>, the <b>unit</b> or the <b>days</b>.
    Try "make it 10", "call it Hydration", "call them cups", or "weekdays only".</div>`);
  return hit;
}
async function tbNext(){
  // let the model fill in whatever it can infer before asking
  if(AI.on && !tb.aiTried && tb.chat.filter(m=>m.who==="you").length===1){
    tb.aiTried=true;
    const said=tb.chat.filter(m=>m.who==="you").map(m=>m.html).join(" ");
    const r=await callAI(
`They want to track something. Work out the details and reply with ONLY one line:
name|targetPerDay|unit|frequency
frequency must be one of: ${FREQS.join(", ")}
Use a sensible number and unit. If it's a simple yes/no habit use 1 and the unit "time".`,
      said, 80);
    if(r && r.includes("|")){
      const [n,t2,u,f]=r.split("|").map(x=>x.trim());
      if(n) tb.name=n.charAt(0).toUpperCase()+n.slice(1);
      const num=parseInt(t2,10); if(num>0&&num<=50) tb.target=num;
      if(u) tb.unit=u.replace(/s$/,"");
      if(FREQS.includes(f)) tb.freq=f;
    }
  }
  if(!tb.name){ tb.asked.push("name");
    return tbSay("ai",`<div>What should I call it on your list?</div>`); }
  if(!tb.target){ tb.asked.push("target");
    return tbSay("ai",`<div>How many <b>${tb.unit?plural(tb.unit,2):"times"}</b> a day are you aiming for?
      Say <b>1</b> if it's just a done-or-not-done thing.</div>${tbChips(["1","2","3","5","8","10"],"target")}`); }
  if(tb.target>1 && !tb.asked.includes("unit")){ tb.asked.push("unit");
    const guess=tb.unit;
    return tbSay("ai",`<div>What do you call one of them? That's the word on each marker.${guess?` I'd guess <b>${guess}</b>.`:``}</div>
      ${tbChips([...new Set([guess,"glass","dose","rep","serving","mile","session","page","minute"].filter(Boolean))],"unit")}`); }
  if(!tb.freq){ tb.asked.push("freq");
    return tbSay("ai",`<div>Which days?</div>${tbChips(FREQS,"freq")}`); }
  tbConfirm();
}
function tbConfirm(){
  if(!tb.unit) tb.unit="time";
  tb.ready=true;
  const c=catOf(tb.cat);
  tbSay("ai",`<span class="vtag" style="background:#12c98a22;color:#4fd6a5;border:1px solid #12c98a55">Ready</span>
    <div>Here's what I'll make. Change anything before I do.</div>
    <div class="tbcard">
      <div style="display:flex;align-items:center;gap:10px">
        <div class="icon" style="background:${c.bg};width:36px;height:36px;border-radius:10px;font-size:16px">${c.icon}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:750">${esc(tb.name)}</div>
          <div style="font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${c.fg};margin-top:3px">${c.label}</div>
        </div>
      </div>
      <div style="display:flex;gap:5px;margin-top:11px">${Array.from({length:Math.min(tb.target,12)},()=>
        `<div style="flex:1;height:14px;border-radius:4px;background:${c.fg};opacity:.3"></div>`).join("")}</div>
      <div style="font-size:12.5px;color:var(--ink2);margin-top:10px;line-height:1.5">
        <b style="color:#fff">${tb.target} ${plural(tb.unit,tb.target)}</b> a day · ${tb.freq}<br>
        ${tb.target>1?"Shows as tappable markers on Today and gets its own Tracker card."
                     :"Shows as a normal checkbox on Today."}</div>
    </div>
    <div class="btns" style="margin-top:12px">
      <button class="b b-ghost" onclick="tbRestart()">Start over</button>
      <button class="b b-primary" onclick="tbCreate()">Create it</button>
    </div>
    <div style="font-size:11.5px;color:var(--ink3);margin-top:9px">Or just tell me what to change — "make it 10", "call them cups", "weekdays only".</div>`);
}
function tbRestart(){ openTrackerAI(); }
function tbCreate(){
  const t={id:newId(),name:tb.name,cat:tb.cat,time:"08:00",est:0,done:false,routine:true,
    freq:tb.freq,streak:0,target:tb.target,unit:tb.unit,count:0,notes:"",log:[],
    makeup:false,paused:false,pri:"Should",date:null,blockedBy:null,proj:null};
  tasks.push(t);
  history[t.id]=[]; for(let i=34;i>=1;i--){const d=new Date();d.setDate(d.getDate()-i);history[t.id].push({date:d,v:0});}
  save(); closeAll(); render(); renderTracker(); renderRoutines(); renderOverview();
  go("tracker");
  toast(`${t.name} created — ${t.target} ${unitOf(t)} a day`);
}

/* ================= PROJECTS & CATEGORIES PAGES ================= */
const STATUSES=["Planning","Active","Blocked","Done"];
const statusColor = s => ({Planning:"#8d99ab",Active:"#4fd6a5",Blocked:"#ff8f8f",Done:"#5b9dff"})[s]||"#8d99ab";

function renderCategories(){
  const g=catGroups();
  $("catBody").innerHTML = Object.values(g).map(c=>{
    const keys=c.subs.map(s=>s.key);
    const ts=tasks.filter(t=>keys.includes(t.cat));
    const ps=PROJECTS.filter(p=>p.cat===c.name);
    return `<div class="card">
      <div class="tk-top">
        <div class="icon" style="background:${c.bg}">${c.subs[0].icon}</div>
        <div class="tk-name"><b>${c.name}</b>
          <span style="color:${c.fg}">${c.subs.length} categor${c.subs.length===1?"y":"ies"} · ${ps.length} project${ps.length===1?"":"s"} · ${ts.length} task${ts.length===1?"":"s"}</span></div>
      </div>
      <div class="chips" style="padding:0 16px 12px">
        ${c.subs.map(s=>`<span class="chip" style="cursor:default;color:${s.fg};border-color:${s.fg}44">${s.icon} ${s.sub}
          <b style="margin-left:5px;color:var(--ink3)">${tasks.filter(t=>t.cat===s.key).length}</b></span>`).join("")}
      </div>
      ${ps.length?`<div style="border-top:1px solid var(--line)">
        ${ps.map(p=>{const tot=projTasks(p.id).length,dn=projDone(p.id);
          return `<div class="ipg" onclick="openProject('${p.id}')">
            <div class="icon" style="background:${c.bg}">${p.icon}</div>
            <div class="im"><b>${esc(p.name)}</b><span>${dn} of ${tot} done · ${p.status}</span></div>
            <div class="ic">${tot?Math.round(dn/tot*100):0}%</div>
          </div>`;}).join("")}</div>`
      :`<div class="wk-note" style="padding:0 16px 14px">No projects here yet.</div>`}
    </div>`;
  }).join("") + `<button class="b b-ghost" style="width:100%;height:48px" onclick="openNewProject()">+ New project</button>`;
}

function renderProjects(){
  $("prTitle").textContent="Projects"; $("prSub").textContent="Grouped by category";
  $("prBack").style.display="none"; window.scrollTo(0,0);
  const g=catGroups();
  const groups={};
  PROJECTS.forEach(p=>{ (groups[p.cat]=groups[p.cat]||[]).push(p); });
  const body=Object.keys(groups).map(cat=>{
    const gc=g[cat]||{fg:"#8d99ab",bg:"#1a212c"};
    return `<div class="card">
      <div class="card-head"><span class="card-title">${cat}</span>
        <span class="link" style="color:${gc.fg}">${groups[cat].length} project${groups[cat].length===1?"":"s"}</span></div>
      ${groups[cat].map(p=>{
        const ts=projTasks(p.id), dn=ts.filter(t=>t.done).length, pct=ts.length?Math.round(dn/ts.length*100):0;
        const lw=projLastWorked(p.id);
        return `<div style="padding:2px 0">
          <div class="ipg" onclick="openProject('${p.id}')">
            <div class="icon" style="background:${gc.bg}">${p.icon}</div>
            <div class="im"><b>${esc(p.name)}</b>
              <span>${dn} of ${ts.length} done${lw!=null&&lw<999?` · touched ${lw===0?"today":lw+"d ago"}`:``}${webCount(p.id)?` · 🕸 ${webCount(p.id)}`:``}</span></div>
            <div class="ic" style="color:${statusColor(p.status)};border-color:${statusColor(p.status)}55;background:${statusColor(p.status)}1f">${p.status}</div>
          </div>
          <div class="tk-bar" style="margin:0 16px 10px"><i style="width:${pct}%;background:${pct===100?'linear-gradient(90deg,#0ea472,#16d494)':gc.fg}"></i></div>
        </div>`;}).join("")}
    </div>`;}).join("");
  $("prBody").innerHTML = body + `<button class="b b-ghost" style="width:100%;height:48px" onclick="openNewProject()">+ New project</button>`;
}

function openProject(id){
  const p=projById(id); if(!p){ toast("That project is gone"); renderProjects(); return; }
  const g=catGroups()[p.cat]||{fg:"#8d99ab",bg:"#1a212c"};
  const ts=projTasks(id), dn=ts.filter(t=>t.done).length, pct=ts.length?Math.round(dn/ts.length*100):0;
  const lw=projLastWorked(id);
  const today=ts.filter(onToday), back=ts.filter(t=>!onToday(t));
  $("prTitle").textContent=p.name; $("prSub").textContent=p.cat+" · "+p.status;
  $("prBack").style.display="flex"; window.scrollTo(0,0);
  go("projects");

  const row = t => {
    const c=catOf(t.cat);
    return `<div class="lg">
      <div class="icon" style="background:${c.bg}">${c.icon}</div>
      <div class="lm"><b style="${t.done?'color:var(--ink3);text-decoration:line-through':''}">${esc(t.name)}</b>
        <span>${c.label}${t.log&&t.log.length?` · 📝 ${t.log.length}`:``}${t.lastWorked!=null?` · ${t.lastWorked}d ago`:``}</span></div>
      ${onToday(t)?`<div class="crbtn take" style="background:#1e2734;color:#7fb0ff;border:1px solid #2c374a" onclick="openDetail(${t.id})">Open</div>`
                  :`<div class="crbtn take" onclick="scheduleTask(${t.id})">+ Today</div>
                    <div class="crbtn drop" onclick="openDetail(${t.id})">›</div>`}
    </div>`;};

  $("prBody").innerHTML=`
    <div class="card">
      <div class="tk-top">
        <div class="icon" style="background:${g.bg}">${p.icon}</div>
        <div class="tk-name"><b>${esc(p.name)}</b><span style="color:${g.fg}">${p.cat}</span></div>
        <div class="tk-big"><b style="color:${pct===100?'#12c98a':g.fg}">${pct}%</b><small>Done</small></div>
      </div>
      <div class="tk-bar"><i style="width:${pct}%;background:${pct===100?'linear-gradient(90deg,#0ea472,#16d494)':g.fg}"></i></div>
      <div class="macro">
        <div class="mc"><b style="color:#12c98a">${dn}</b><span>Complete</span></div>
        <div class="mc"><b>${ts.length-dn}</b><span>Remaining</span></div>
        <div class="mc"><b style="font-size:13px;color:${lw!=null&&lw>=14?'#ff8f8f':lw!=null&&lw>=7?'#ff9d4d':'var(--ink2)'}">${lw==null||lw>=999?"—":lw===0?"Today":lw+"d ago"}</b><span>Last worked</span></div>
        <div class="mc"><b style="font-size:13px;color:${statusColor(p.status)}">${p.status}</b><span>Status</span></div>
      </div>
    </div>

    ${resumeOf("project",p.id)?`<div class="card"><div style="padding:14px 16px">${resumeBanner("project",p.id)}</div></div>`:``}
    <div class="card">
      <div class="card-head"><span class="card-title">The goal</span></div>
      <div style="padding:0 16px 14px;font-size:14px;line-height:1.6;color:#cbd6e5">${esc(p.goal)||"—"}</div>
      ${p.notes?`<div style="padding:0 16px 15px;border-top:1px solid var(--line)">
        <div class="slot" style="padding:12px 0 5px">Notes</div>
        <div style="font-size:13.5px;line-height:1.6;color:var(--ink2)">${esc(p.notes)}</div></div>`:``}
      <div class="wk-row">
        <button class="b b-ghost" onclick="editProject('${p.id}')">Edit</button>
        <button class="b b-soft" onclick="openResume('project','${p.id}','${esc(p.name).replace(/'/g,"")}')">📌 Resume point</button>
      </div>
    </div>

    ${(()=>{const ns=projectNotes(p.id); return `<div class="card">
      <div class="card-head"><span class="card-title">Notes</span><span class="link">${ns.length}</span></div>
      ${ns.length?ns.map(n=>`<div class="lg" onclick="openNoteEditor(${n.id})" style="align-items:flex-start">
        <div class="icon" style="background:#141a24;margin-top:2px">${n.pin?"📌":n.kind==="web"?"🕸":n.kind==="task"?"✓":"📝"}</div>
        <div class="lm"><b style="font-weight:600;font-size:13px;white-space:normal;line-height:1.5">${esc(n.text)}</b>
          <span style="margin-top:4px">${n.when} · ${esc(noteLabel(n))}</span></div></div>`).join("")
      :`<div class="wk-note" style="padding:0 16px 12px">Nothing yet. Notes on this project, on its tasks, and from its Problem Solver webs all collect here.</div>`}
      <div class="wk-row"><button class="b b-ghost" onclick="openNoteEditor(null,'project','${p.id}')">+ Add a note</button></div>
    </div>`;})()}

    ${today.length?`<div class="card">
      <div class="card-head"><span class="card-title">On today's list</span><span class="link">${today.length}</span></div>
      ${today.map(row).join("")}
    </div>`:``}

    ${back.length?`<div class="card">
      <div class="card-head"><span class="card-title">Not scheduled yet</span><span class="link">${back.length}</span></div>
      ${back.map(row).join("")}
      <div class="wk-note" style="padding:10px 16px 14px">These are real tasks — they just aren't on Today yet. Hit <b>+ Today</b> to schedule one.</div>
    </div>`:``}

    ${(()=>{const ws=WEBS.filter(w=>w.proj===p.id); if(!ws.length) return `
      <div class="card">
        <div class="card-head"><span class="card-title">Problem Solver</span></div>
        <div class="wk-note" style="padding:0 16px 14px">No webs saved to this project yet. Open any task here and hit
          <b>🕸 Help me solve this</b> — the whole conversation gets tied back to this project.</div>
      </div>`;
      return `<div class="card">
        <div class="card-head"><span class="card-title">Problem Solver webs</span><span class="link">${ws.length}</span></div>
        ${ws.map(w=>{const picked=w.nodes.filter(n=>n.picked);
          return `<div class="lg" onclick="openWeb('${w.id}')">
            <div class="icon" style="background:#1c1533">🕸</div>
            <div class="lm"><b>${esc(w.seed.slice(0,44))}${w.seed.length>44?"…":""}</b>
              <span>${w.when} · ${w.nodes.filter(n=>n.type==="question").length} questions · ${w.nodes.filter(n=>n.type==="solution").length} routes${picked.length?` · <b style="color:#4fd6a5">${picked.length} picked</b>`:``}</span></div>
            <div class="crbtn take" style="background:#1e2734;color:#c4b0ff;border:1px solid rgba(167,139,250,.4)">Reopen</div>
          </div>`;}).join("")}
        <div class="wk-note" style="padding:10px 16px 14px">Reopening restores the whole web — questions, your answers, every route, and which ones you picked.</div>
      </div>`;})()}

    <div class="card"><div class="wk-row" style="padding:14px 16px">
      <button class="b b-blue" onclick="openAddForProject('${p.id}')">+ Add task to project</button>
    </div></div>`;
}

function setStatus(id,s){
  const t=getTask(id); if(!t) return;
  t.status = t.status===s ? "Open" : s;
  save(); render(); renderTasks(); renderCal(); openDetail(id);
  toast(`${t.name} → ${statusOf(t)}`);
}
function scheduleTask(id){
  const t=getTask(id); if(!t) return;
  t.sched=true; t.date=TODAY_KEY; t.order=999;
  tasks.sort((a,b)=>a.time.localeCompare(b.time)); tasks.forEach((x,i)=>x.order=i);
  render(); renderCal(); openProject(t.proj); toast("On today's list: "+t.name);
}
function openAddForProject(pid){
  const p=projById(pid);
  pendingProject=pid;
  openAdd(false);
  $("addTitle").textContent="New task · "+p.name;
}

/* create / edit a project */
let editingProject=null;
function openNewProject(){ editingProject=null; fillProjForm({}); openSheet("projSheet"); }
function editProject(id){ const p=projById(id); if(!p) return; editingProject=id; fillProjForm(p); openSheet("projSheet"); }
function fillProjForm(p){
  const cats=Object.keys(catGroups());
  $("pjTitle").textContent = p.id ? "Edit project" : "New project";
  $("pjName").value=p.name||""; $("pjIcon").value=p.icon||"📌"; $("pjGoal").value=p.goal||"";
  $("pjNotes").value=p.notes||"";
  $("pjCat").innerHTML=cats.map(c=>`<option${c===p.cat?" selected":""}>${c}</option>`).join("");
  $("pjStatus").innerHTML=STATUSES.map(s=>`<option${s===(p.status||"Planning")?" selected":""}>${s}</option>`).join("");
  $("pjDel").style.display = p.id ? "flex" : "none";
}
function saveProject(){
  const name=$("pjName").value.trim();
  if(!name){ $("pjName").focus(); toast("Name it first"); return; }
  const data={name, cat:$("pjCat").value, icon:$("pjIcon").value||"📌", goal:$("pjGoal").value.trim(),
              status:$("pjStatus").value, notes:$("pjNotes").value.trim()};
  if(editingProject){ Object.assign(projById(editingProject), data); closeAll(); openProject(editingProject); toast("Project updated"); }
  else { const id="p"+Date.now().toString(36); PROJECTS.push({id,...data}); closeAll(); renderProjects(); go("projects"); toast(name+" created"); }
  renderCategories();
}
function deleteProject(){
  if(!editingProject) return;
  const p=projById(editingProject);
  projTasks(p.id).forEach(t=>{ t.proj=null; if(!onToday(t)) t.sched=true; });  // tasks survive, they just go standalone
  PROJECTS=PROJECTS.filter(x=>x.id!==p.id);
  editingProject=null; closeAll(); render(); renderProjects(); renderCategories(); go("projects");
  toast(p.name+" deleted — its tasks kept");
}

/* ================= IMPROVE THIS APP =================
   Demo brain — but the wiring warnings below are real. They describe how this
   app is actually built, so the knock-on effects it flags genuinely exist. */
const PAGE_ICON={overview:"🧭",today:"☀️",calendar:"📅",planner:"🕸️",categories:"🗂",tasks:"✓",
  routines:"🔁",tracker:"💧",projects:"📍",workouts:"🏋️",meals:"🍳",whynot:"❓",notes:"📝",
  progress:"📈",settings:"⚙️",v2:"💡",improve:"✨"};
const PAGES=(()=>{const o={};NAV.filter(n=>n.k&&n.live).forEach(n=>{
  o[n.k]={n:n.label,i:PAGE_ICON[n.k]||"•",bg:"#141a24"};});return o;})();
let improve={};   // page -> {msgs:[], ideas:0}

const WIRE=[
 {k:/workout|\brep\b|reps|\bset\b|sets|weight|lbs|exercise|lift|split/i, v:"good", eff:"Medium", pri:"Medium",
  warn:"Each session's total is reps × weight for loaded moves and just reps for bodyweight. Every chart, the \"% of last time\" bar and the per-move ▲/▼ all read that one total. Change the formula and every past session gets re-scored.",
  better:"If you want sets tracked separately, add it as a third number rather than folding it into the total — then your old sessions stay comparable to the new ones."},
 {k:/water|glass|drop|pip|counter|count/i, v:"care", eff:"Medium", pri:"High",
  warn:"The water counter isn't just on Today. The same number feeds the Tracker card, its 5-week dot grid, the streak, best run and average. Change how counting works and all five move together.",
  better:"Safest version: leave the number alone and only change how it <i>looks</i> — bigger drops, swipe to add, whatever. The math underneath keeps working and nothing downstream breaks."},
 {k:/streak/i, v:"care", eff:"Medium", pri:"Medium",
  warn:"Streaks only move when a target gets hit — that's deliberate. Today and Tracker both read the same streak, and Tracker's \"best run\" is calculated from history. If streaks start moving for other reasons, best run stops matching what actually happened.",
  better:"If you want partial credit, add a second number (\"days showed up\") instead of loosening the streak. Then the streak stays honest and you still get credit for trying."},
 {k:/owed|carry|left ?over|missed|yesterday|debt/i, v:"care", eff:"Small", pri:"High",
  warn:"The Still Owed box is built to never clear itself — that was the whole point. It only empties when you do the thing or hit ✕. If we add auto-expiry, old stuff quietly vanishes again, which is the problem it was made to fix.",
  better:"Instead of expiring things, sort harder: anything past 14 days goes red and jumps to the top, or gets its own \"this is getting embarrassing\" section. Pressure without deletion."},
 {k:/tracker|grid|dot|chart/i, v:"good", eff:"Small", pri:"Medium",
  warn:"Tracker is read-only on purpose — every number on it comes from Today. As long as it stays a view and not a place you type into, changes here are cheap and safe.",
  better:"Keep it read-only. The moment Tracker gets its own log button you'll have water in two places and they'll drift apart."},
 {k:/workout|rep|weight|lbs|set|exercise|lift/i, v:"good", eff:"Medium", pri:"Medium",
  warn:"Each session's total is reps × weight for loaded moves and just reps for bodyweight. Every chart, the \"% of last time\" bar and the per-move ▲/▼ all read that one total. Change the formula and every past session gets re-scored.",
  better:"If you want a different score (like reps-only, or sets × reps), add it as a second line rather than replacing the total — then old sessions stay comparable."},
 {k:/cardio|run|jog|mile|pace|walk|bike/i, v:"good", eff:"Small", pri:"Medium",
  warn:"Cardio is self-contained right now — nothing else reads from it. That makes it the safest place in the app to change things.",
  better:"Worth thinking about: should a logged jog auto-check the \"1 mile run\" routine on Today? That'd be the one link worth building."},
 {k:/meal|calorie|kcal|protein|food|eat|macro/i, v:"good", eff:"Medium", pri:"Medium",
  warn:"Meals also stands alone. The only thing that overlaps is the Protein counter on Today — right now those two don't talk, so you'd be logging protein twice.",
  better:"Pick one to be the source of truth. My vote: log food on Meals, and have the Protein counter on Today fill itself in from it."},
 {k:/planner|problem ?solver|prompt|spider|web|node/i, v:"good", eff:"Big", pri:"Medium",
  warn:"Problem Solver is the only page running on a fake AI brain. Everything it produces is scripted. Any change to how smart it feels is really a change to whether we plug in a real API — that's the actual decision underneath.",
  better:"Split it in two: layout and flow changes are cheap and I can do them now. \"Make the answers better\" means wiring a real model, which needs a small server first."},
 {k:/braindump|dump|sort/i, v:"good", eff:"Small", pri:"Medium",
  warn:"Braindump sorts by keyword matching, not real understanding. It'll get obvious stuff right and miss anything worded oddly — that's why every line has a category dropdown you can override.",
  better:"Keep the override dropdown no matter what. Even with a real model behind it, you'll want the last word."},
 {k:/note|journal|got in the way|blocker/i, v:"good", eff:"Small", pri:"High",
  warn:"There are two kinds of note now: the day note (\"what got in the way\") and per-task progress notes. They're stored separately on purpose. Merging them sounds tidy but you'd lose the ability to see one task's whole history.",
  better:"Leave them split, but have Calendar pull both onto the same day view. Same result, no loss."},
 {k:/menu|nav|tab|drawer|hamburger/i, v:"care", eff:"Small", pri:"Low",
  warn:"The menu has 13 items and only 4 are built. That gap will feel worse as it grows, not better.",
  better:"Either group them harder or hide the SOON ones until they're real. A menu full of dead links trains you to stop looking at it."},
 {k:/color|dark|theme|font|look|ugly|design/i, v:"good", eff:"Small", pri:"Low",
  warn:"Colors are all set in one place at the top of the file, so a palette change is genuinely a five-minute job. The one catch: each category has its own color and they're used on Today, Tracker, Braindump and Workouts.",
  better:"Change the base palette freely. If you want new category colors, give me all of them at once so they stay a set."},
 {k:/delete|remove|get rid|too much|too long|getting long|clutter|simpl|busy|overwhelm|crowded|cramped/i, v:"good", eff:"Small", pri:"High",
  warn:"Nothing breaks by removing things — the risk runs the other way. This app has grown fast and Today is getting tall.",
  better:"Strongest move available to you right now. Tell me the two things you look at least and I'll cut them."},
 {k:/calendar/i, v:"good", eff:"Big", pri:"High",
  warn:"Calendar is the page everything else is waiting on. Day notes, completed tasks, missed tasks, workouts and meals all already store a date — they're just not being read back anywhere.",
  better:"Build it as a read-back page only, no editing. Every piece of data it needs already exists."},
 {k:/categor|project/i, v:"good", eff:"Big", pri:"High",
  warn:"Categories are currently hardcoded — 12 of them, fixed. \"Last worked on\" is a number I typed in, not something the app calculates. Making categories real means making them editable, and that touches Today, Braindump, Tracker and Workouts.",
  better:"Do it in two steps: first let categories be added and renamed, then make Projects a view that groups tasks by category and computes the real \"last touched\" date."},
 {k:/remind|notif|alert|push|alarm/i, v:"care", eff:"Big", pri:"Medium",
  warn:"A web page can't reliably send you a notification when it's closed. That's a browser limit, not a coding one. It needs to be a real installed app or have a server pushing to it.",
  better:"Two cheap stand-ins for now: badge things harder inside the app, or send yourself a daily summary. Real push comes when we leave the single-file version."},
 {k:/save|lost|refresh|gone|persist|data/i, v:"care", eff:"Medium", pri:"High",
  warn:"Right now nothing survives a refresh — every change lives in memory only. That's on purpose while we're designing, but it's the single biggest gap between this and a real app.",
  better:"This is the first thing to fix once the pages settle. Everything else is decoration until your data sticks around."}
];
const GENERIC={v:"good",eff:"Medium",pri:"Medium",
  warn:"Nothing else in the app reads from that directly, so it should be a contained change.",
  better:"Give me a bit more — what happens now, and what you'd want instead? The sharper you say it, the less I have to guess."};

function aiThink(text,page,turn){
  const ans = answerAbout(text);          // question? answer it. otherwise fall through to the change engine.
  if(ans) return ans;
  const hit = WIRE.find(w=>w.k.test(text)) || GENERIC;
  const neg = /don'?t like|hate|annoying|confus|stupid|bad|worse|wrong|broken|doesn'?t work|too many|too much/i.test(text);
  const add = /add|want|could you|can we|should have|need/i.test(text);
  const open = turn===0
    ? (neg ? "Fair. Let's look at what's actually behind that."
           : add ? "That's doable. Here's what it touches."
                 : "Got it. Here's my read.")
    : "Following on from that:";
  const V={good:["v-good","Worth doing"],care:["v-care","Doable — with a catch"],push:["v-push","I'd push back"]}[hit.v];
  return {
    meta:{eff:hit.eff,pri:hit.pri,v:hit.v},
    html:`<span class="vtag ${V[0]}">${V[1]}</span><span class="vtag v-eff">${hit.eff} job</span><span class="vtag v-eff">${hit.pri} priority</span>
      <div>${open}</div>
      <div style="margin-top:9px"><b>What it's wired to:</b> ${hit.warn}</div>
      <div style="margin-top:9px"><b>My suggestion:</b> ${hit.better}</div>`
  };
}

/* Problem Solver → back into a project. Deliberately simple: one clean task
   from the prompt's title, not an HTML parse of the whole answer. */
function solutionToTask(nodeId){
  const n=P.nodes.find(x=>x.id===nodeId); if(!n) return;
  const prompt=P.nodes.find(x=>x.id===n.parent);
  const src = solveSource && tasks.find(t=>t.id===solveSource.task);
  const name = (prompt?prompt.title:n.title).replace(/^[a-z]/,c=>c.toUpperCase());
  saveWeb(true);   // give the task something real to point back at
  const t={id:newId(), name, cat: catForNew(src, solveSource?solveSource.proj:null), time:"09:00", est:45,
    from:{web:P.savedId||null, node:n.id, seed:P.seed},
    done:false, routine:false, streak:0, notes:`From Problem Solver — ${n.angle||""} angle on "${P.seed}".`,
    target:1, unit:"time", count:0, makeup:true, sched:false,
    proj: solveSource?solveSource.proj:null,
    log:[{d:new Date().toLocaleDateString(undefined,{month:"short",day:"numeric"}), t:"Created from a Problem Solver answer."}]};
  tasks.push(t);
  closeAll(); render(); renderProjects(); renderCategories();
  const p=t.proj?projById(t.proj):null;
  toast(p?`Added to ${p.name} — not scheduled yet`:"Added as an unscheduled task");
}

/* ================= THE APP READING ITSELF =================
   Pages come from NAV. Numbers come from live data. Only how-to text is written
   by hand, and it lives here beside the feature it describes. If a page appears
   in the menu with no entry, selfCheck() says so instead of bluffing. */
const HOWTO={
  today:{what:"Your day. Tasks, counters, progress, the Still Owed box and the end-of-day check-in.",
    how:["Open the menu (☰ top left) → Today","Tap a checkbox to complete a task","Tap a task's name to open its details","Drag the dots on the left to reorder your day"]},
  tracker:{what:"History of your counting routines — water, meds, steps, protein. You log on Today, this shows it back.",
    how:["Menu → Tracker","Log on Today; this page only displays it","Daily target row: − and + change how many a day, keeping your streak","Edit on a card changes name, unit, days and category","New Tracker at the bottom builds one by chatting"]},
  planner:{what:"Problem Solver. Turns a rough problem into five sharper prompts, then blends the answers you pick into a plan.",
    how:["Menu → Problem Solver","Type the problem, or tap something under Pull from your app — braindump items, owed tasks, stuck work and projects are all listed","Pick several and they get combined into one problem","Hit Build the web","Answer the five questions it asks","Hit Build 5 better prompts, then Run all","Pick as many routes as you want, then Combine them into a plan"]},
  workouts:{what:"Two tabs — Strength (your splits, reps and weight) and Cardio (runs, rides and pace).",
    how:["Menu → Workouts","Tap Start on a split to log reps and weight","Cardio tab → Log a run for distance and time","+ Add a workout at the bottom of Strength builds your own"]},
  meals:{what:"Calories and protein against your daily targets, with a 7-day chart and everything you ate by meal.",
    how:["Menu → Meals","+ Log food takes a name, calories and protein","Targets live in Settings → Daily targets"]},
  projects:{what:"Projects grouped by category, each with a goal, status, its tasks and any Problem Solver webs tied to it.",
    how:["Menu → Projects","Tap a project to open it","+ Today schedules an unscheduled task","+ New project at the bottom"]},
  categories:{what:"The top level. Shows each category, its subcategories, and the projects underneath.",
    how:["Menu → Categories","Tap any project listed there to open it"]},
  whynot:{what:"Every task you missed and the reason you gave, plus a 5-week calendar and patterns.",
    how:["Menu → Why Not","Tap a day on the calendar to see what slipped","Review today now runs the check-in on demand"]},
  calendar:{what:"A Monday–Sunday week view of everything scheduled, plus an Unscheduled pile. AI can plan the week for you or take instructions in plain English.",
    how:["Menu → Calendar","Arrows in the header move between weeks","Tap any task to move it, complete it, or open its project","✨ Plan my week proposes a whole schedule — you approve it","💬 Talk to it takes plain English like \"Tuesday looks too busy\""]},
  overview:{what:"One screen summary — this week's completion, what needs you, active projects, health and routines.",
    how:["Menu → Overview","Tap anything to jump straight to it"]},
  tasks:{what:"Every task in one place, filterable by category, project, priority, status, scheduled or overdue.",
    how:["Menu → Tasks","Search at the top, chips to filter","Tap a task to open its details"]},
  routines:{what:"All your recurring things with frequency, next due, streak and history. Pause, edit or delete them here.",
    how:["Menu → Routines","Pause stops it appearing without losing the history","+ New routine at the bottom"]},
  notes:{what:"Every note, attached to a project, a task, a Problem Solver web, or standalone. Reassign any note later.",
    how:["Menu → Notes","Filter by what it's attached to","+ New note, then pick what it belongs to","Turn one into a resume point so it shows first when you come back"]},
  progress:{what:"This week against last, routine consistency, projects moved, most postponed, and where the work went.",
    how:["Menu → Progress","🤖 Weekly AI review at the bottom reviews the week and plans the next one"]},
  settings:{what:"Work hours, daily targets, check-in time, AI connection, backup and restore, and everything you need to erase your data.",
    how:["Menu → Settings","Back up downloads a file you can restore later","Erase has three partial options plus a full reset"]},
  v2:{what:"Ideas parked on purpose so V1 can ship.",
    how:["Menu → V2 Ideas","+ Park an idea to add one"]},
  improve:{what:"Your feedback on the app, grouped by page.",
    how:["Every page has Improve this page at the bottom","Or Menu → Improve This App to see them all"]}
};
const EXTRAS={
  routine:{n:"Routines & streaks",w:"A task you repeat. Keep it up and it builds a 🔥 streak.",
    h:["Add Task → turn on Make it a routine","Pick how often","Leave Times per day at 1 for a plain checkbox"]},
  editroutine:{n:"Changing a tracker's target",w:"Adjust how many a day without losing your streak or history.",
    h:["Tracker → the − and + on the Daily target row change it instantly","Or hit Edit on that card for name, unit, days and category","Streak and history are kept — only the settings change"]},
  aitracker:{n:"Building a tracker by talking",w:"Describe it roughly and it asks only for what it still needs.",
    h:["Tracker → New Tracker at the bottom","Say something like \"10 glasses of water a day\"","It fills in what it can and asks about the rest","Check the preview card, then Create it"]},
  counter:{n:"Counter routines",w:"A routine with a daily target, like 8 glasses of water. Shows as tappable pips.",
    h:["Add Task → Routine on → set Times per day above 1","Name the unit (glass, dose, rep)","It appears on Tracker automatically"]},
  owed:{n:"Still Owed",w:"Unfinished tasks roll forward every day and count how long they've been sitting. Nothing disappears on its own.",
    h:["It sits at the top of Today","Do today puts it back on your list","✕ clears it for good","Counters never carry over — those reset daily"]},
  braindump:{n:"Braindump",w:"Dump everything raw, one per line. It sorts each into a category and guesses a project.",
    h:["Menu → Quick Add → Braindump","One thing per line","Hit Sort it out, then override any category or project","Add them all to today"]},
  daynote:{n:"What got in the way",w:"A daily note for whatever threw your day off, with quick tap chips.",
    h:["On Today, under Today's Plan","Tap the box, pick chips or write your own"]},
  tasknotes:{n:"Progress notes",w:"Dated notes on a single task, so you know where you left off.",
    h:["Tap a task → scroll to Progress notes","Type and hit + Add note"]},
  review:{n:"End-of-day check-in",w:"Walks through everything unfinished and asks why, with suggestions based on the task.",
    h:["Purple 🌙 banner at the top of Today","Or Why Not → Review today now"]},
  solve:{n:"Help me solve this",w:"Sends a task into Problem Solver, and the whole web stays tied to its project.",
    h:["Tap a task → 🕸 Help me solve this at the bottom","Answers come back as tasks in the same project"]},
  resume:{n:"Resume Here",w:"A pinned note saying where you left off. Shows at the top when you come back.",
    h:["Open a task → 📌 Save where I left off","Or open a project → 📌 Resume point","It appears as an orange banner next time"]},
  status:{n:"Waiting & Blocked",w:"Statuses that tell the scheduler to skip a task. Blocked is automatic when something's waiting on another task.",
    h:["Open a task → Status → Waiting or Blocked","Plan My Week leaves them out and says why","Set a dependency in the calendar assistant: \"X before Y\""]},
  review:{n:"Weekly AI review",w:"Reviews what got done, missed, postponed and blocked, then proposes next week.",
    h:["Menu → Progress → 🤖 Weekly AI review","Approve and it runs Plan My Week on next week"]},
  saving:{n:"Saving your data",w:"Everything saves to the device you're on, automatically.",
    h:["It just happens — no button","Overview shows whether storage is working","The ↺ on Overview wipes it and restores the sample data"]},
  move:{n:"Moving tasks",w:"Reorder your day or push something to tomorrow.",
    h:["Drag the dots on the left of any row","Or tap the task → Push to tomorrow"]}
};

function appFacts(){
  const live=NAV.filter(n=>n.k&&n.live), soon=NAV.filter(n=>n.k&&!n.live);
  return {live,soon,
    liveNames:live.map(n=>n.label), soonNames:soon.map(n=>n.label),
    tasksToday:tasks.filter(onToday).length, tasksAll:tasks.length,
    counters:tasks.filter(isCounter), owed:carryover.length,
    projects:PROJECTS.length, cats:Object.keys(catGroups()),
    workouts:WK.length, webs:WEBS.length, misses:missLog.length};
}
function selfCheck(){
  return NAV.filter(n=>n.k&&n.live&&!HOWTO[n.k]).map(n=>n.label);
}
function findFeature(q){
  const s=q.toLowerCase();
  for(const n of NAV){ if(!n.k) continue;
    if(s.includes(n.label.toLowerCase()) || s.includes(n.k)) return {kind:"page",key:n.k,label:n.label,live:!!n.live}; }
  const alias={settings:["setting","settings","erase","delete everything","wipe","reset","start over","back up","backup","restore","work hours","api key"],
    planner:["problem solver","solver","spider","web","prompt"],whynot:["why not","reason","missed","excuse"],
    workouts:["workout","exercise","gym","lift","cardio","run","split","reps"],meals:["meal","calorie","food","protein","ate","eating","macro"],tracker:["tracker","water","glass","steps","medication","target","quantity","counter","how many a day"],
    projects:["project"],categories:["category","categories"],improve:["improve","feedback"],today:["today","my day","task list"]};
  const hasWord=(str,w)=> w.includes(" ") ? str.includes(w)
    : new RegExp("\\b"+w.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"\\w{0,3}\\b").test(str);
  for(const [k,ws] of Object.entries(alias)) for(const w of ws) if(hasWord(s,w)){
    const n=NAV.find(x=>x.k===k); if(n) return {kind:"page",key:k,label:n.label,live:!!n.live}; }
  for(const [k,e] of Object.entries(EXTRAS)){
    const words=e.n.toLowerCase().split(/[\s&]+/).filter(w=>w.length>3);
    if(words.some(w=>s.includes(w))||s.includes(k)) return {kind:"extra",key:k,...e}; }
  return null;
}
const askKind = s =>
  // "my numbers" beats everything — check it first
  /\bhow many\b|\bwhat'?s my\b|\bwhat are my\b|\bshow me my\b|\bmy (streak|streaks|progress|stats|numbers|totals)\b|\bam i\b|\bhow'?s my\b|\bhow am i doing\b|\bright now\b/i.test(s) ? "data"
  : /^(do|does|is there|are there|did you|have i got|do i have|does it have|can it|can i)\b/i.test(s) || /\bhave (a|an|the)\b/i.test(s) ? "exists"
  : /^(how do i|how can i|how to|how does|how do|where do i|where is|where's|where are|where can i|show me how|explain|walk me|tell me about|what does|what is|what's|what are)\b/i.test(s) || /\bhow (does|do) .+ work\b/i.test(s) ? "howto"
  : null;

function answerAbout(text){
  const kind=askKind(text); if(!kind) return null;
  const f=findFeature(text), F=appFacts();
  const head=(t,c)=>`<span class="vtag" style="background:${c}22;color:${c};border:1px solid ${c}55">${t}</span>`;
  const gaps=selfCheck();
  const gapNote=gaps.length?`<div style="margin-top:10px;font-size:12px;color:#ffb26b">⚠ Heads up: <b>${gaps.join(", ")}</b> ${gaps.length>1?"are":"is"} in the menu but I haven't been given how-to steps for ${gaps.length>1?"them":"it"} yet.</div>`:``;

  // --- your own numbers, read live
  if(kind==="data"){
    const lines=[];
    if(/task/i.test(text)){
      const pm=PROJECTS.map(p=>`${p.name}: ${projTasks(p.id).length} (${projDone(p.id)} done)`);
      lines.push(`<b>${F.tasksToday}</b> on today's list, <b>${F.tasksAll}</b> in the app all in.`, ...pm.map(x=>x)); }
    if(/water|streak|counter|routine|drink/i.test(text))
      F.counters.forEach(c=>lines.push(`<b>${c.name}</b> — ${c.count} of ${c.target} today, 🔥 ${c.streak} day streak.`));
    if(/project/i.test(text) && !/task/i.test(text)) PROJECTS.forEach(p=>lines.push(`<b>${p.name}</b> — ${projDone(p.id)}/${projTasks(p.id).length} done, ${p.status}.`));
    if(/workout|lift|gym/i.test(text)) WK.forEach(w=>lines.push(`<b>${w.name}</b> — last done ${agoLabel(daysAgo(lastSess(w.id)))}, ${w.ex.length} moves.`));
    if(/miss|why|reason|slip/i.test(text)){
      const c={}; missLog.forEach(m=>c[m.reason]=(c[m.reason]||0)+1);
      const r=Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,3);
      lines.push(`<b>${F.misses}</b> misses logged. Top reasons: ${r.map(x=>x[0]+" ("+x[1]+")").join(", ")}.`); }
    if(/owed|behind|late/i.test(text)) lines.push(`<b>${F.owed}</b> in Still Owed right now.`);
    if(!lines.length) lines.push(`Today: <b>${F.tasksToday}</b> tasks · <b>${F.owed}</b> owed · <b>${F.projects}</b> projects · <b>${F.workouts}</b> workouts · <b>${F.misses}</b> misses logged.`);
    const uniq=[...new Set(lines)];
    return {meta:{kind:"data"}, html:head("Your numbers","#12c98a")+
      `<div style="margin-top:4px">Read live from your app just now:</div>
       <ul>${uniq.map(l=>`<li>${l}</li>`).join("")}</ul>${gapNote}`};
  }

  // --- does it exist
  if(kind==="exists"){
    if(!f) return {meta:{kind:"exists"}, html:head("What's in here","#5b9dff")+
      `<div>I couldn't match that to anything specific. Here's what's actually built:</div>
       <ul><li><b>Working:</b> ${F.liveNames.join(", ")}</li>
       <li><b>In the menu but not built:</b> ${F.soonNames.join(", ")}</li></ul>
       <div style="margin-top:8px">Name one and I'll tell you how it works.</div>${gapNote}`};
    if(f.kind==="extra") return {meta:{kind:"exists"}, html:head("Yes — you have it","#12c98a")+
      `<div><b>${f.n}</b> — ${f.w}</div><div style="margin-top:9px"><b>How:</b></div><ul>${f.h.map(x=>`<li>${x}</li>`).join("")}</ul>${gapNote}`};
    if(!f.live) return {meta:{kind:"exists"}, html:head("Not built yet","#ff9d4d")+
      `<div><b>${f.label}</b> is in the menu marked SOON, but there's nothing behind it yet — tapping it does nothing.</div>
       <div style="margin-top:9px">Built and working right now: ${F.liveNames.join(", ")}.</div>${gapNote}`};
    const h=HOWTO[f.key];
    return {meta:{kind:"exists"}, html:head("Yes — it's built","#12c98a")+
      `<div><b>${f.label}</b> — ${h?h.what:"it's live in the menu."}</div>
       ${h?`<div style="margin-top:9px"><b>Getting there:</b></div><ul>${h.how.map(x=>`<li>${x}</li>`).join("")}</ul>`:``}${gapNote}`};
  }

  // --- how do I
  if(!f) return {meta:{kind:"howto"}, html:head("Not sure which part","#5b9dff")+
    `<div>Tell me which bit and I'll walk you through it. Working pages: <b>${F.liveNames.join(", ")}</b>.</div>
     <div style="margin-top:8px">Or ask about routines, counters, Still Owed, braindump, notes, the check-in, or moving tasks.</div>${gapNote}`};
  if(f.kind==="extra") return {meta:{kind:"howto"}, html:head("How to","#5b9dff")+
    `<div><b>${f.n}</b> — ${f.w}</div><ul>${f.h.map(x=>`<li>${x}</li>`).join("")}</ul>${gapNote}`};
  if(!f.live) return {meta:{kind:"howto"}, html:head("Can't yet","#ff9d4d")+
    `<div><b>${f.label}</b> isn't built — it's a placeholder in the menu. Nothing to walk you through yet.</div>${gapNote}`};
  const h=HOWTO[f.key];
  return {meta:{kind:"howto"}, html:head("How to","#5b9dff")+
    `<div><b>${f.label}</b> — ${h.what}</div><ul>${h.how.map(x=>`<li>${x}</li>`).join("")}</ul>${gapNote}`};
}

function threadOf(p){ if(!improve[p]) improve[p]={msgs:[],ideas:0}; return improve[p]; }
let improvePage="today";

function openImprove(page){
  improvePage=page; closeAll();
  const P=PAGES[page];
  $("impTitle").innerHTML=`Improve · <span style="color:#c4b0ff">${P.n}</span>`;
  drawChat();
  openSheet("improveSheet");
}
function drawChat(){
  const t=threadOf(improvePage);
  $("impChat").innerHTML = t.msgs.length
    ? t.msgs.map(m=>`<div class="bub ${m.who}">${m.who==="you"?esc(m.text):m.html}</div>`).join("")
    : `<div style="font-size:13px;color:var(--ink2);line-height:1.6;padding:6px 0">
         Two things I can do on <b style="color:#c4b0ff">${PAGES[improvePage].n}</b>:<br><br>
         <b style="color:#fff">Ask me about the app</b> — does it have X, how do I do Y, what are my numbers. I read the
         app itself, so I don't go out of date.<br><br>
         <b style="color:#fff">Tell me what to change</b> — I'll say if it's a good idea, what it might break, and how big a job it is.</div>`;
  $("impSug").style.display = t.msgs.length ? "none" : "flex";
  const c=$("impChat"); c.scrollTop=c.scrollHeight;
}
function impSuggest(el){ $("impInput").value=el.textContent; sendImprove(); }
function sendImprove(){
  const v=$("impInput").value.trim();
  if(!v){ $("impInput").focus(); return; }
  const t=threadOf(improvePage);
  const isQuestion=!!askKind(v);
  t.msgs.push({who:"you",text:v}); if(!isQuestion) t.ideas++;
  $("impInput").value=""; drawChat();
  const run=async()=>{
    const r=aiThink(v,improvePage,t.msgs.filter(m=>m.who==="you").length-1);
    if(AI.on && !isQuestion){
      const a=await callAI(APP_SYSTEM+`\n\nHe is giving feedback on the ${PAGES[improvePage]?PAGES[improvePage].n:improvePage} page of this app.
Say whether it's a good idea, what else in the app it would affect, and roughly how big a job it is.
Be honest if it's a bad idea.\n\nHIS DATA:\n`+appContext().slice(0,2000), v, 700);
      if(a){ t.msgs.push({who:"ai",html:aiBadge()+a,meta:r.meta});
        drawChat(); renderImprove(); refreshImproveCounts(); buildNav(); save(); return; }
    }
    t.msgs.push({who:"ai",html:r.html,meta:r.meta});
    drawChat(); renderImprove(); refreshImproveCounts(); buildNav(); save();
  };
  setTimeout(run,520);
}
function improveItems(){
  const out=[];
  Object.keys(improve).forEach(pg=>{
    const t=improve[pg]; if(!t) return;
    t.msgs.forEach((m,i)=>{
      if(m.who!=="you") return;
      const reply=t.msgs[i+1];
      if(!reply||!reply.meta||!reply.meta.v) return;      // questions aren't requests
      out.push({page:pg, text:m.text, v:reply.meta.v, eff:reply.meta.eff, pri:reply.meta.pri});
    });
  });
  return out;
}
const PRI_ORDER={High:0,Medium:1,Low:2};

function improveBrief(){
  const items=improveItems();
  if(!items.length) return "No feedback logged yet.";
  const byPage={}; items.forEach(i=>{(byPage[i.page]=byPage[i.page]||[]).push(i);});
  let s="# Momentum — change requests from real use\n\n";
  s+=`${items.length} request${items.length===1?"":"s"} across ${Object.keys(byPage).length} page${Object.keys(byPage).length===1?"":"s"}.\n\n`;
  s+="## Do these first (high priority)\n";
  const hi=items.filter(i=>i.pri==="High");
  s+= hi.length? hi.map(i=>`- **[${PAGES[i.page]?PAGES[i.page].n:i.page}]** ${i.text}  _(${i.eff} job, ${i.v==="care"?"has a catch":i.v==="push"?"AI pushed back":"clean"})_`).join("\n")+"\n\n"
              : "_none_\n\n";
  Object.keys(byPage).forEach(pg=>{
    s+=`## ${PAGES[pg]?PAGES[pg].n:pg}\n`;
    byPage[pg].sort((a,b)=>(PRI_ORDER[a.pri]??3)-(PRI_ORDER[b.pri]??3));
    byPage[pg].forEach(i=>{ s+=`- ${i.text}\n  - effort: ${i.eff} · priority: ${i.pri} · verdict: ${
      i.v==="good"?"worth doing":i.v==="care"?"doable, has a catch":"pushed back on"}\n`; });
    s+="\n";
  });
  s+="## Context\n- Single-file web app, runs offline, data saved on device.\n";
  s+=`- ${tasks.filter(t=>!t.routine).length} tasks, ${tasks.filter(t=>t.routine).length} routines, ${PROJECTS.length} projects.\n`;
  s+="- Pages: "+Object.values(PAGES).map(p=>p.n).join(", ")+".\n";
  s+="- Please keep every existing feature working and don't create duplicate data systems.\n";
  return s;
}

function improveSummary(){
  const items=improveItems();
  if(!items.length) return "";
  const hi=items.filter(i=>i.pri==="High"), care=items.filter(i=>i.v==="care");
  const small=items.filter(i=>i.eff==="Small"), big=items.filter(i=>i.eff==="Big");
  const byPage={}; items.forEach(i=>{byPage[i.page]=(byPage[i.page]||0)+1;});
  const worst=Object.entries(byPage).sort((a,b)=>b[1]-a[1])[0];
  const themes=[];
  const all=items.map(i=>i.text.toLowerCase()).join(" ");
  if(/too long|too much|clutter|busy|simpl|crowded|remove/.test(all)) themes.push("cutting things down");
  if(/save|lost|refresh|sync|data/.test(all)) themes.push("data and syncing");
  if(/ai|smart|real model|api/.test(all)) themes.push("making the AI real");
  if(/remind|notif|alert/.test(all)) themes.push("reminders");
  if(/colou?r|font|look|design|small|size/.test(all)) themes.push("look and feel");
  const bits=[];
  bits.push(`You've logged <b>${items.length}</b> change${items.length===1?"":"s"}. ${hi.length?`<b>${hi.length}</b> ${hi.length===1?"is":"are"} high priority.`:"None are urgent."}`);
  if(worst) bits.push(`Most of it sits on <b>${PAGES[worst[0]]?PAGES[worst[0]].n:worst[0]}</b> (${worst[1]}).`);
  if(themes.length) bits.push(`The running themes: <b>${themes.join("</b>, <b>")}</b>.`);
  if(small.length) bits.push(`<b>${small.length}</b> ${small.length===1?"is a small job":"are small jobs"} — those are the quickest wins.`);
  if(care.length) bits.push(`<b>${care.length}</b> touch${care.length===1?"es":""} something else in the app, so ${care.length===1?"it needs":"they need"} care.`);
  if(big.length) bits.push(`<b>${big.length}</b> ${big.length===1?"is a big job":"are big jobs"} — worth doing one at a time.`);
  return bits.map(b=>`<div style="padding:5px 0;border-bottom:1px solid var(--line);font-size:13.5px;line-height:1.6;color:#cbd6e5">• ${b}</div>`).join("");
}

function renderImprove(){
  const box=$("impBody"); if(!box) return;
  const items=improveItems();
  const pages=Object.keys(PAGES).filter(p=>improve[p]&&improve[p].ideas);
  const total=items.length;
  /* This page had no way to add a note to itself — every other page did.
     Sitting at the top because it's the reason you'd come here from the menu. */
  const composer = `<div class="card" style="border-color:rgba(167,139,250,.4)">
      <div class="card-head"><span class="card-title">Add a suggestion</span>
        <span class="link">Any page</span></div>
      <div style="padding:2px 16px 14px">
        <select class="f" id="impPagePick" style="margin-bottom:8px">
          ${Object.keys(PAGES).map(k=>`<option value="${k}"${k==="improve"?" selected":""}>${esc(PAGES[k].n)}</option>`).join("")}
        </select>
        <textarea class="f" id="impQuick" rows="3"
          placeholder="What's annoying you, or what would make this better?"></textarea>
        <div class="wk-row" style="padding:9px 0 0">
          <button class="b b-primary" style="width:100%" onclick="quickImprove()">Add it to the list</button>
        </div>
      </div>
    </div>`;
  box.innerHTML = composer + (!total
    ? `<div class="card"><div class="empty">Nothing flagged yet.<br><br>
        Every page has an <b style="color:#c4b0ff">Improve</b> button at the bottom.
        Use it whenever something annoys you — it all stacks up here, ready to hand off.</div></div>`
    : `<div class="card">
        <div class="card-head"><span class="card-title">What you've asked for</span><span class="link">${total}</span></div>
        <div class="macro">
          <div class="mc"><b style="color:#ff8f8f">${items.filter(i=>i.pri==="High").length}</b><span>High</span></div>
          <div class="mc"><b style="color:#4fd6a5">${items.filter(i=>i.eff==="Small").length}</b><span>Quick</span></div>
          <div class="mc"><b style="color:#ffb26b">${items.filter(i=>i.v==="care").length}</b><span>Careful</span></div>
          <div class="mc"><b style="color:#5b9dff">${pages.length}</b><span>Pages</span></div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><span class="card-title">The short version</span></div>
        <div style="padding:0 16px 15px">${improveSummary()}</div>
      </div>

      <div class="card">
        <div class="card-head"><span class="card-title">Hand it off</span></div>
        <div style="padding:0 16px 12px;font-size:13px;line-height:1.6;color:var(--ink2)">
          Copies everything as one organized brief — grouped by page, sorted by priority, with the app's context on the end.
          Paste it straight into Claude and it can work through the lot.</div>
        <div class="wk-row">
          <button class="b b-violet" onclick="copyBrief()">Copy for Claude</button>
          <button class="b b-ghost" onclick="showBrief()">Preview</button>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><span class="card-title">By page</span></div>
        ${pages.map(p=>{const P2=PAGES[p],t=improve[p];
          const last=[...t.msgs].reverse().find(m=>m.who==="you");
          const mine=items.filter(i=>i.page===p);
          const hi=mine.filter(i=>i.pri==="High").length;
          return `<div class="ipg" onclick="openImprove('${p}')">
            <div class="icon" style="background:${P2.bg}">${P2.i}</div>
            <div class="im"><b>${P2.n}</b><span>${esc(last?last.text:"")}</span></div>
            ${hi?`<div class="ic" style="color:#ff8f8f;border-color:rgba(255,77,77,.4);background:rgba(255,77,77,.14)">${hi} high</div>`:``}
            <div class="ic">${mine.length}</div>
          </div>`;}).join("")}
      </div>`);
}

/* Add a note from the Improve page itself, for any page you pick. Goes into the
   same list as the Improve button at the bottom of every page. */
function quickImprove(){
  const page=$("impPagePick") ? $("impPagePick").value : "improve";
  const txt=$("impQuick") ? $("impQuick").value.trim() : "";
  if(!txt){ toast("Write something first"); return; }
  if(!improve[page]) improve[page]={msgs:[],ideas:0};
  improve[page].msgs.push({who:"you", text:txt, at:Date.now()});
  improve[page].ideas=(improve[page].ideas||0)+1;
  save(); renderImprove(); refreshImproveCounts(); buildNav();
  toast("Added to "+(PAGES[page]?PAGES[page].n:page));
}
function copyBrief(){
  const txt=improveBrief();
  const done=()=>toast("Copied — paste it into Claude");
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done,fb); else fb();
  function fb(){const ta=document.createElement("textarea");ta.value=txt;document.body.appendChild(ta);ta.select();
    try{document.execCommand("copy")}catch(e){} ta.remove(); done();}
}
function showBrief(){
  $("nodeBody").innerHTML=`<h2>Your brief</h2>
    <p style="font-size:12.5px;color:var(--ink3);margin:4px 0 12px">This is exactly what gets copied.</p>
    <div class="codebox" style="max-height:52vh">${esc(improveBrief())}</div>
    <div class="btns"><button class="b b-ghost" onclick="closeAll()">Close</button>
    <button class="b b-violet" onclick="copyBrief()">Copy it</button></div>`;
  openSheet("node");
}

function refreshImproveCounts(){
  document.querySelectorAll(".improve[data-page]").forEach(el=>{
    const n=improve[el.dataset.page]?improve[el.dataset.page].ideas:0;
    const c=el.querySelector(".cnt2");
    if(c) c.textContent = n?n+(n>1?" NOTES":" NOTE"):"";
    if(c) c.style.display = n?"block":"none";
  });
}

/* ================= PLANNER ================= */
let P = { seed:"", nodes:[], nid:1, stage:0 };
const STAGES=["Idea","Questions","Answers","Prompts","Solutions"];
const W = {root:250, question:190, note:170, prompt:210, solution:230, thread:170, qa:215};

/* ---- follow-up conversations ----
   A "thread" node hangs off a route (or off your problem, for the combined
   plan). The individual question-and-answer pairs are "qa" nodes underneath it.
   They're stored once, as nodes, so nothing is duplicated — the conversation IS
   the branch. A closed thread hides its pairs so the web stays readable. */
const webThread   = ownerId => P.nodes.find(n=>n.type==="thread" && n.parent===ownerId);
const webQAs  = tid => P.nodes.filter(n=>n.type==="qa" && n.parent===tid);
const webQACount    = ownerId => { const t=webThread(ownerId); return t?webQAs(t.id).length:0; };
const webPoint    = ownerId => { const t=webThread(ownerId); if(!t) return null;
                                return webQAs(t.id).find(q=>q.point)||null; };
/* what actually gets drawn — pairs stay hidden until you open the thread */
function visibleNodes(){
  return P.nodes.filter(n=>{
    if(n.type!=="qa") return true;
    const t=P.nodes.find(x=>x.id===n.parent);
    return !!(t && t.open);
  });
}
const stripTags = h => String(h||"").replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim();

function renderStages(){
  $("stageBar").innerHTML = STAGES.map((s,i)=>{
    const cls = P.stage>i ? "done" : P.stage===i ? "on" : "";
    return `<div class="st ${cls}"><b>${P.stage>i?"✓":i+1}</b>${s}</div>`;
  }).join("");
}
function useSeed(el){ $("seedInput").value = el.textContent; }

/* ===== PULL A PROBLEM STRAIGHT OUT OF THE APP =====
   No copy-pasting. Everything you've dumped, owed, parked or projected is here. */
let picks=[], pickFilter="suggested", pickQ="";
const PICK_TABS=[["suggested","Suggested"],["braindump","Braindump"],["owed","Still owed"],
                 ["stuck","Stuck"],["unscheduled","Not scheduled"],["projects","Projects"],["all","Everything"]];

function pickPool(){
  const open=tasks.filter(t=>!t.routine&&!t.done);
  switch(pickFilter){
    case "braindump":   return open.filter(t=>t.src==="braindump"||/braindump/i.test(t.notes||""));
    case "owed":        return carryover.map(c=>({...c,_owed:true}));
    case "stuck":       return open.filter(t=>statusOf(t)!=="Open"||t.lastWorked>=14);
    case "unscheduled": return open.filter(t=>!t.date);
    case "projects":    return PROJECTS.map(p=>({id:"P"+p.id,name:p.name,cat:projTasks(p.id)[0]?projTasks(p.id)[0].cat:"ops",
                          _proj:p.id, notes:p.goal, est:0}));
    case "all":         return open;
    default: {          // suggested — the things most worth thinking about
      const score=t=>{ let s=0;
        if(t.src==="braindump") s+=40;
        if(statusOf(t)==="Blocked") s+=50;
        if(t.lastWorked>=14) s+=45;
        if(priOf(t)==="Must") s+=25;
        if((t.est||0)>=120) s+=30;
        const c=carryover.find(c=>c.name===t.name); if(c) s+=c.missed*8;
        if(t.proj) s+=10;
        return s; };
      return [...open].sort((a,b)=>score(b)-score(a)).slice(0,12);
    }
  }
}
function pickWhy(t){
  if(t._owed) return `owed ${t.missed}×`;
  if(t._proj) return `project · ${projTasks(t._proj).filter(x=>!x.done).length} open`;
  if(t.src==="braindump") return "from a braindump";
  const st=statusOf(t);
  if(st==="Blocked"){ const b=tasks.find(x=>x.id===t.blockedBy); return b?`blocked by ${b.name}`:"blocked"; }
  if(st==="Waiting") return "waiting on someone";
  if(t.lastWorked>=14) return `untouched ${t.lastWorked} days`;
  if((t.est||0)>=120) return `big — ${Math.round(t.est/60)} hrs`;
  if(priOf(t)==="Must") return "marked Must";
  return t.proj&&projById(t.proj) ? projById(t.proj).name : catOf(t.cat).label;
}
const pickKey = t => String(t._proj ? "P"+t._proj : t.id);

/* Every web you saved, right on the opening screen. Without this a web saved
   from the box above had nowhere to be found again — projects only ever showed
   the ones tied to a project. */
function renderSavedWebs(){
  const card=$("savedWebsCard"), list=$("savedWebsList"), cnt=$("savedWebsCount");
  if(!card||!list) return;
  if(!WEBS.length){ card.style.display="none"; return; }
  card.style.display="block";
  if(cnt) cnt.textContent=WEBS.length;
  const recent=[...WEBS].reverse();
  list.innerHTML=recent.map(w=>{
    const qs=(w.nodes||[]).filter(n=>n.type==="question").length;
    const rs=(w.nodes||[]).filter(n=>n.type==="solution").length;
    const pk=(w.nodes||[]).filter(n=>n.picked).length;
    const proj=w.proj?projById(w.proj):null;
    return `<div class="pickrow" onclick="openWeb('${w.id}')">
      <div class="icon" style="background:#1c1533">&#128376;</div>
      <div class="lm" style="flex:1;min-width:0">
        <b class="pn">${esc((w.seed||"Untitled").slice(0,46))}${(w.seed||"").length>46?"…":""}</b>
        <span>${esc(w.when||"")}${proj?" · "+esc(proj.name):""} · ${qs} questions · ${rs} routes${
          pk?` · <b style="color:#4fd6a5">${pk} picked</b>`:``}</span></div>
      <div class="crbtn take" onclick="event.stopPropagation();deleteWeb('${w.id}')"
           style="background:#231a1e;color:#ff8ea3;border:1px solid rgba(255,95,126,.35)">✕</div>
    </div>`;}).join("");
}
async function deleteWeb(id){
  const w=WEBS.find(x=>x.id===id); if(!w) return;
  const linked=tasks.filter(t=>t.from&&t.from.web===id);
  const qCount=(w.nodes||[]).filter(n=>n.type==="qa").length;
  const warn = linked.length
    ? `\n\n${linked.length} task${linked.length===1?"":"s"} came from this web.${
        qCount?` The ${qCount} question${qCount===1?"":"s"} you asked will be written into their notes so you don't lose them.`:``}`
    : ``;
  if(!await ask("Delete this saved web?\n\n"+(w.seed||"").slice(0,70)+warn,"Delete it",1)) return;
  /* Normally a task points at the live conversation instead of copying it. This
     is the one moment that has to break — the web is going, so the record gets
     written into the task rather than disappearing with it. */
  const stamp=new Date().toLocaleDateString(undefined,{month:"short",day:"numeric"});
  const restore=[];
  linked.forEach(t=>{
    const nodes=w.nodes||[];
    const th=nodes.find(n=>n.type==="thread" && n.parent===t.from.node);
    const qas=th?nodes.filter(n=>n.type==="qa"&&n.parent===th.id):[];
    restore.push({id:t.id, log:t.log?[...t.log]:[]});
    if(qas.length){
      t.log=t.log||[];
      [...qas].reverse().forEach(q=>t.log.unshift({d:stamp,
        t:`${q.point?"★ ":""}You asked: "${q.q}" — ${stripTags(q.a).slice(0,400)}`}));
    }
  });
  const i=WEBS.findIndex(x=>x.id===id), snap=WEBS[i];
  WEBS.splice(i,1); save(); renderSavedWebs(); renderProjects(); render();
  toastUndo(linked.length?`Deleted — questions saved onto ${linked.length} task${linked.length===1?"":"s"}`:"Deleted that web",
    ()=>{ WEBS.splice(i,0,snap);
      restore.forEach(r=>{ const t=tasks.find(x=>x.id===r.id); if(t) t.log=r.log; });
      save(); renderSavedWebs(); renderProjects(); render(); });
}
function renderStartPicks(){
  renderSavedWebs();
  const box=$("startPicks"); if(!box) return;
  const pool=pickPool().slice(0,6);
  box.innerHTML=`
    <div style="display:flex;align-items:center;gap:8px;margin-top:16px">
      <div style="flex:1;font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:var(--ink3)">
        Pull from your app</div>
      <div class="crbtn take" style="background:#1e2734;color:#c4b0ff;border:1px solid rgba(167,139,250,.4)"
           onclick="openPicker()">Browse all</div>
    </div>
    <div class="picklist" style="margin-top:9px">
      ${pool.length?pool.map(t=>{const c=catOf(t.cat),k=pickKey(t),on=picks.includes(k);
        return `<div class="pickrow${on?" on":""}" onclick="togglePick('${k}')">
          <div class="icon" style="background:${c.bg};width:28px;height:28px;border-radius:8px;font-size:12px">${t._proj?"📁":c.icon}</div>
          <div style="flex:1;min-width:0">
            <div class="pn">${esc(t.name)}</div>
            <div class="pw">${esc(pickWhy(t))}</div>
          </div>
          <div class="pcheck${on?" on":""}">${on?"✓":"+"}</div>
        </div>`;}).join("")
      :`<div style="font-size:12.5px;color:var(--ink3);padding:8px 0">Nothing to pull yet — braindump a few things and they'll show up here.</div>`}
    </div>
    ${picks.length?`<div style="font-size:11.5px;color:#c4b0ff;margin-top:10px">
      ${picks.length} picked — they'll be combined into one problem.
      <span style="color:var(--ink3);cursor:pointer;text-decoration:underline" onclick="picks=[];syncSeed()">clear</span></div>`:``}`;
}
function togglePick(k){
  picks = picks.includes(k) ? picks.filter(x=>x!==k) : [...picks,k];
  syncSeed();
}
function pickById(k){
  if(k.startsWith("P")){ const p=projById(k.slice(1)); return p?{name:p.name,notes:p.goal,_proj:p.id}:null; }
  const t=tasks.find(x=>String(x.id)===k); if(t) return t;
  const c=carryover.find(x=>String(x.id)===k); return c||null;
}
function syncSeed(){
  const items=picks.map(pickById).filter(Boolean);
  if(items.length===1){
    const t=items[0];
    $("seedInput").value = t.name + (t.notes?" — "+t.notes:"");
  } else if(items.length>1){
    $("seedInput").value = "I need to work out how to handle these together:\n"
      + items.map(t=>"• "+t.name+(t.notes?" ("+t.notes.slice(0,70)+")":"")).join("\n");
  } else $("seedInput").value="";
  // keep the web tied back to wherever it came from
  const first=items.find(t=>t.id&&!t._proj);
  solveSource = first ? {task:first.id, proj:first.proj||null, web:null}
              : items[0]&&items[0]._proj ? {task:null, proj:items[0]._proj, web:null} : solveSource;
  renderStartPicks(); if($("pkBody")) drawPicker();
}
function openPicker(){ pickQ=""; drawPicker(); openSheet("pickSheet"); }
function drawPicker(){
  const pool=pickPool().filter(t=>!pickQ||t.name.toLowerCase().includes(pickQ.toLowerCase()));
  $("pkBody").innerHTML=`
    <input class="f" id="pkQ" placeholder="Search…" value="${esc(pickQ)}" oninput="pickQ=this.value;drawPicker()">
    <div class="chips" style="margin-top:10px">
      ${PICK_TABS.map(([k,l])=>`<span class="chip${pickFilter===k?" on":""}" onclick="pickFilter='${k}';drawPicker()">${l}</span>`).join("")}
    </div>
    <div class="picklist" style="margin-top:12px;max-height:44vh;overflow:auto">
      ${pool.length?pool.map(t=>{const c=catOf(t.cat),k=pickKey(t),on=picks.includes(k);
        return `<div class="pickrow${on?" on":""}" onclick="togglePick('${k}')">
          <div class="icon" style="background:${c.bg};width:28px;height:28px;border-radius:8px;font-size:12px">${t._proj?"📁":c.icon}</div>
          <div style="flex:1;min-width:0"><div class="pn">${esc(t.name)}</div><div class="pw">${esc(pickWhy(t))}</div></div>
          <div class="pcheck${on?" on":""}">${on?"✓":"+"}</div>
        </div>`;}).join(""):`<div class="empty">Nothing here.</div>`}
    </div>
    <div class="btns">
      <button class="b b-ghost" onclick="picks=[];syncSeed();closeAll()">Clear</button>
      <button class="b b-violet" onclick="closeAll()">Use ${picks.length||""} ${picks.length===1?"item":"items"}</button>
    </div>`;
}
function resetPlanner(){
  P={seed:"",nodes:[],nid:1,stage:0};
  picks=[];
  railFresh=true;   // you asked for a blank canvas — don't reopen the last one behind your back
  solveSource=null;   // starting fresh — don't let the next Save overwrite the last web
  $("startwrap").classList.remove("hidden");
  $("seedInput").value="";
  renderStartPicks();
  drawWeb(); renderStages(); setCta(null); renderRail();
}

function addNode(o){ const n=Object.assign({id:P.nid++,x:0,y:0,parent:null},o); P.nodes.push(n); return n; }

/* ================= BUILDING A WEB WITHOUT THE AI =================
   Two routes in. Either lay it out yourself a node at a time, or paste a plan
   you already worked out in a conversation elsewhere and let Momentum draw it. */

function startBlankWeb(){
  const seed=($("seedInput").value||"").trim();
  if(!seed){ toast("Type what it's about first"); $("seedInput").focus(); return; }
  railFresh=false;
  P={seed, nodes:[], nid:1, stage:1};
  const r=addNode({type:"root", text:seed});
  layout();
  $("startwrap").classList.add("hidden");
  renderStages(); drawWeb(); updateCta(); renderRail(); setTimeout(fitView,80);
  toast("Blank web — tap the root to add your first question");
}

/* The format is deliberately plain text rather than JSON. Models wrap JSON in
   chatter and break it; a line starting with Q: survives almost anything. */
const WEB_PROMPT = `I'm going to paste our conversation into a planning app that draws it as a web.

Please summarise what we worked out using EXACTLY this format, nothing else — no
preamble, no markdown, no bullets:

ROOT: <the problem or goal in one line>
Q: <a question worth answering about it>
A: <what we established as the answer, or leave blank>
R: <a route or option that came out of it>
R: <another route>
Q: <the next question>
A: <its answer>
R: <a route>

Rules:
- One item per line, always starting with ROOT:, Q:, A: or R:
- A: belongs to the Q: directly above it
- R: hangs off the Q: above it
- Between 3 and 8 questions
- Keep each line under about 200 characters`;

function copyWebPrompt(){
  copyText(WEB_PROMPT);
  toast("Copied — paste that into Claude or ChatGPT");
}

/* Tolerant on purpose: anything that isn't a line we recognise is ignored, so a
   stray "Sure, here's that:" at the top costs nothing. */
function parseWebText(txt){
  const out={root:"", items:[]};
  let lastQ=null;
  (txt||"").split(/\r?\n/).forEach(raw=>{
    const line=raw.trim();
    if(!line) return;
    const m=line.match(/^(ROOT|Q|A|R)\s*[:.\-]\s*(.*)$/i);
    if(!m) return;
    const tag=m[1].toUpperCase(), body=m[2].trim();
    if(!body) return;
    if(tag==="ROOT"){ out.root=body; return; }
    if(tag==="Q"){ lastQ={q:body, a:"", routes:[]}; out.items.push(lastQ); return; }
    if(tag==="A" && lastQ){ lastQ.a = lastQ.a ? lastQ.a+" "+body : body; return; }
    if(tag==="R" && lastQ){ lastQ.routes.push(body); return; }
  });
  return out;
}

function openPasteWeb(){
  $("nodeBody").innerHTML=`<h2>Paste a plan from a chat</h2>
    <p style="font-size:13px;color:var(--ink2);line-height:1.6;margin:8px 0 0">
      Worked something out with Claude or ChatGPT? Ask it to write the summary in
      Momentum's format, paste it here, and this draws it as a web you can then
      change however you like.</p>
    <div class="wk-row" style="padding:12px 0 0">
      <button class="b b-violet" style="width:100%" onclick="copyWebPrompt()">
        1 · Copy the instructions to give the AI</button>
    </div>
    <label class="f" style="margin-top:14px">2 · Paste what it gives you back</label>
    <textarea class="f" id="pasteWeb" rows="8" placeholder="ROOT: Get more repeat customers
Q: Why don't one-time customers book again?
A: Nobody follows up after the first visit
R: Text a rebooking offer two days after each visit
R: Offer a discount for booking every two weeks"></textarea>
    <div class="btns" style="margin-top:10px">
      <button class="b b-ghost" onclick="closeAll()">Cancel</button>
      <button class="b b-blue" onclick="buildFromPaste()">Draw the web</button>
    </div>
    <div class="wk-note" style="padding:12px 0 0;font-size:11.5px">
      Lines starting <b>ROOT:</b> <b>Q:</b> <b>A:</b> <b>R:</b> are read; everything
      else is ignored, so a bit of chatter at the top does no harm.</div>`;
  closeAll(); openSheet("node");
}

function buildFromPaste(){
  const txt=$("pasteWeb") ? $("pasteWeb").value : "";
  const parsed=parseWebText(txt);
  if(!parsed.items.length && !parsed.root){
    toast("Couldn't find any ROOT: Q: A: or R: lines in that"); return;
  }
  const seed = parsed.root || ($("seedInput") && $("seedInput").value.trim()) || "Untitled plan";
  railFresh=false;
  P={seed, nodes:[], nid:1, stage:2};
  const r=addNode({type:"root", text:seed});
  parsed.items.forEach((it,i)=>{
    const q=addNode({type:"question", text:it.q, parent:r.id, num:i+1, answer:it.a||""});
    it.routes.forEach((rt,j)=>{
      addNode({type:"solution", parent:q.id, num:q.num, text:rt, title:rt,
               body:"", picked:false, angle:j});
    });
  });
  layout();
  solveSource=null;
  $("startwrap").classList.add("hidden");
  closeAll();
  renderStages(); drawWeb(); updateCta(); renderRail(); setTimeout(fitView,80);
  saveWeb(true);
  const rc=parsed.items.reduce((a,x)=>a+x.routes.length,0);
  toast(`Drew it — ${parsed.items.length} question${parsed.items.length===1?"":"s"}, ${rc} route${rc===1?"":"s"}`);
}
const kids = id => P.nodes.filter(n=>n.parent===id);
const root = () => P.nodes.find(n=>n.type==="root");

/* ---- layout: root at top, layers fan out below ---- */
function layout(){
  const r=root(); if(!r) return;
  r.x = -W.root/2; r.y = 0;
  const qs = P.nodes.filter(n=>n.type==="question");
  const gap = 40, qy = 250;
  let totalW = qs.length*W.question + (qs.length-1)*gap;
  let x = -totalW/2;
  qs.forEach((q,i)=>{ q.x = x; q.y = qy + (i%2)*46; x += W.question+gap; });

  /* Routes pasted in from a chat hang straight off their question rather than
     off a prompt, so they need placing here or they'd all pile up at 0,0. */
  qs.forEach(q=>{
    const rs=P.nodes.filter(n=>n.type==="solution" && n.parent===q.id);
    rs.forEach((sol,j)=>{
      sol.x = q.x - (W.solution-W.question)/2;
      sol.y = q.y + 170 + j*150;
    });
  });

  // notes hang directly off whatever they were added to
  P.nodes.filter(n=>n.type==="note").forEach(nt=>{
    const p = P.nodes.find(z=>z.id===nt.parent);
    const sibs = P.nodes.filter(z=>z.type==="note"&&z.parent===nt.parent);
    const i = sibs.indexOf(nt);
    if(p && p.type==="root"){ nt.x = p.x + W.root + 60; nt.y = p.y + i*110; }
    else if(p){ nt.x = p.x + 24; nt.y = p.y + 165 + i*104; }
    else { nt.x = -W.note/2; nt.y = 420 + i*104; }
  });

  const ps = P.nodes.filter(n=>n.type==="prompt");
  const pgap=52, py=640;
  let pw = ps.length*W.prompt + (ps.length-1)*pgap;
  let px = -pw/2;
  ps.forEach((p,i)=>{ p.x=px; p.y=py+(i%2)*40; px += W.prompt+pgap;
    const sol = kids(p.id).find(k=>k.type==="solution");
    if(sol){ sol.x = p.x - (W.solution-W.prompt)/2; sol.y = p.y + 190; }
  });

  // conversations sit under whatever they're about
  P.nodes.filter(n=>n.type==="thread").forEach(t=>{
    const p=P.nodes.find(z=>z.id===t.parent);
    if(p){ t.x = p.x + ((W[p.type]||190) - W.thread)/2; t.y = p.y + 175; }
    else { t.x = -W.thread/2; t.y = 900; }
    webQAs(t.id).forEach((q,i)=>{ q.x = t.x - (W.qa-W.thread)/2; q.y = t.y + 120 + i*128; });
  });
}

function drawWeb(){
  autoSaveWeb();                 // anything that redraws the web may have changed it
  const world=$("world"), svg=$("links");
  [...world.querySelectorAll(".node")].forEach(n=>n.remove());
  svg.innerHTML="";
  if(!P.nodes.length) return;
  layout();

  visibleNodes().forEach(n=>{
    const d=document.createElement("div");
    d.className="node n-"+n.type+(n.type==="question"&&n.answer?" answered":"")+(n.picked?" picked":"");
    d.style.left=n.x+"px"; d.style.top=n.y+"px"; d.style.width=(W[n.type]||190)+"px";
    d.dataset.id=n.id;
    let label="", body="", sub="";
    if(n.type==="root"){ label=`◆ Your problem`; body=esc(n.text); }
    if(n.type==="question"){ label=`Q${n.num}<span class="pill">${n.answer?"ANSWERED":"NEEDS YOU"}</span>`; body=esc(n.text);
      if(n.answer) sub=esc(n.answer); }
    if(n.type==="note"){ label=`Your note`;
      body = n.text ? esc(n.text) : `<span style="color:#5d6878;font-style:italic;font-weight:500">Tap to write it</span>`; }
    if(n.type==="prompt"){ label=`Prompt ${n.num}<span class="pill">${n.angle}</span>`; body=esc(n.title);
      sub = kids(n.id).length ? "Answer ready ↓" : "Tap to view · copy · run"; }
    if(n.type==="solution"){ label=`Route ${n.num}${n.picked?`<span class="pill" style="background:#0e2a1f;color:#4fd6a5">PICKED</span>`:``}`;
      body=esc(n.title); sub = n.picked ? "In your plan — tap to read or drop" : "Tap to read · pick as a route"; }
    if(n.type==="thread"){ const c=webQAs(n.id).length;
      label=`💬 ${c} asked`; body = n.open ? "Tap to fold up" : "Tap to see what you asked";
      sub = webPoint(n.parent) ? "★ has a takeaway" : ""; }
    if(n.type==="qa"){ label=`You asked${n.point?`<span class="pill" style="background:#2a1a0b;color:#ff9d4d">THE POINT</span>`:``}`;
      body=esc(n.q); sub=esc(stripTags(n.a).slice(0,90)+(stripTags(n.a).length>90?"…":"")); }
    d.innerHTML=`<div class="nlabel">${label}</div><div class="ntext">${body}</div>${sub?`<div class="nsub">${sub}</div>`:``}
                 ${(n.type==="root"||n.type==="question")?`<div class="nplus" title="Add your own note"><b>+</b>NOTE</div>`:``}`;
    const plus=d.querySelector(".nplus");
    if(plus) plus.addEventListener("pointerdown",e=>{e.stopPropagation();});
    if(plus) plus.onclick=e=>{e.stopPropagation(); addOwn(n.id);};
    d.addEventListener("pointerdown",e=>nodePointerDown(e,d,n));
    world.appendChild(d);
  });
  requestAnimationFrame(drawLinks);
  save();
}

function drawLinks(){
  const svg=$("links"); svg.innerHTML="";
  const map={};
  [...$("world").querySelectorAll(".node")].forEach(el=>map[el.dataset.id]=el);
  let minX=0,minY=0,maxX=0,maxY=0;
  P.nodes.forEach(n=>{ const el=map[n.id]; if(!el) return;
    minX=Math.min(minX,n.x); minY=Math.min(minY,n.y);
    maxX=Math.max(maxX,n.x+el.offsetWidth); maxY=Math.max(maxY,n.y+el.offsetHeight); });
  svg.setAttribute("width", (maxX-minX+400)); svg.setAttribute("height",(maxY-minY+400));
  svg.style.left="0px"; svg.style.top="0px";
  svg.setAttribute("viewBox",`${minX-200} ${minY-200} ${maxX-minX+400} ${maxY-minY+400}`);
  svg.style.transform=`translate(${minX-200}px,${minY-200}px)`;
  svg.setAttribute("width",(maxX-minX+400)); svg.setAttribute("height",(maxY-minY+400));

  const COL={question:"#3d84ff",note:"#ff7a1a",prompt:"#a78bfa",solution:"#12c98a",
             thread:"#4fc3f7",qa:"#4fc3f7"};
  P.nodes.forEach(n=>{
    if(n.parent==null) return;
    const p=P.nodes.find(x=>x.id===n.parent); if(!p) return;
    const pe=map[p.id], ce=map[n.id]; if(!pe||!ce) return;
    const x1=p.x+pe.offsetWidth/2, y1=p.y+pe.offsetHeight;
    const x2=n.x+ce.offsetWidth/2, y2=n.y;
    const dy=Math.max(40,(y2-y1)*0.55);
    const path=document.createElementNS("http://www.w3.org/2000/svg","path");
    path.setAttribute("d",`M ${x1} ${y1} C ${x1} ${y1+dy}, ${x2} ${y2-dy}, ${x2} ${y2}`);
    path.setAttribute("fill","none");
    path.setAttribute("stroke",COL[n.type]||"#3d84ff");
    path.setAttribute("stroke-width","1.6");
    path.setAttribute("stroke-opacity", n.type==="solution"?".55":".45");
    if(n.type==="prompt") path.setAttribute("stroke-dasharray","5 5");
    svg.appendChild(path);
    const dot=document.createElementNS("http://www.w3.org/2000/svg","circle");
    dot.setAttribute("cx",x2); dot.setAttribute("cy",y2); dot.setAttribute("r","3");
    dot.setAttribute("fill",COL[n.type]||"#3d84ff"); dot.setAttribute("fill-opacity",".8");
    svg.appendChild(dot);
  });
}

/* ---- pan / zoom ---- */
let view={x:0,y:0,s:1}, pointers=new Map(), panStart=null, pinchStart=null, nodeDrag=null;
function applyView(){ $("world").style.transform=`translate(${view.x}px,${view.y}px) scale(${view.s})`; }
function zoomBy(f, cx, cy){
  const c=$("canvas").getBoundingClientRect();
  cx = cx ?? c.width/2; cy = cy ?? c.height/2;
  const ns=Math.min(2.2,Math.max(.25,view.s*f));
  view.x = cx-(cx-view.x)*(ns/view.s);
  view.y = cy-(cy-view.y)*(ns/view.s);
  view.s=ns; applyView();
}
function fitView(){
  const els=[...$("world").querySelectorAll(".node")];
  const c=$("canvas").getBoundingClientRect();
  if(!els.length){ view={x:c.width/2,y:100,s:1}; applyView(); return; }
  let minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
  P.nodes.forEach(n=>{ const el=$("world").querySelector(`.node[data-id="${n.id}"]`); if(!el)return;
    minX=Math.min(minX,n.x); minY=Math.min(minY,n.y);
    maxX=Math.max(maxX,n.x+el.offsetWidth); maxY=Math.max(maxY,n.y+el.offsetHeight); });
  const pad=44, w=maxX-minX+pad*2, h=maxY-minY+pad*2;
  const s=Math.min(1.15, Math.min(c.width/w, c.height/h));
  view.s=Math.max(.2,s);
  view.x = c.width/2 - (minX+(maxX-minX)/2)*view.s;
  view.y = c.height/2 - (minY+(maxY-minY)/2)*view.s;
  applyView();
}
const cv=$("canvas");
cv.addEventListener("pointerdown",e=>{
  /* Anything that's a button floating over the canvas has to be left alone.
     If we capture the pointer here, the tap never turns into a click and the
     button looks broken — that's what happened to Save and Improve. */
  if(e.target.closest(".node,.zoom,.pl-cta,.startwrap,.savechip,.improve-mini,.stagebar,.webrail,button,input,textarea,.chip,.link")) return;
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===1) panStart={x:e.clientX-view.x,y:e.clientY-view.y};
  cv.setPointerCapture(e.pointerId);
});
cv.addEventListener("pointermove",e=>{
  if(pointers.has(e.pointerId)) pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(nodeDrag) return;
  if(pointers.size===2){
    const [a,b]=[...pointers.values()];
    const dist=Math.hypot(a.x-b.x,a.y-b.y), mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    const c=cv.getBoundingClientRect();
    if(!pinchStart) pinchStart={dist,s:view.s};
    else { const f=(dist/pinchStart.dist)*pinchStart.s/view.s; zoomBy(f, mid.x-c.left, mid.y-c.top); }
    panStart=null; return;
  }
  if(pointers.size===1&&panStart){ view.x=e.clientX-panStart.x; view.y=e.clientY-panStart.y; applyView(); }
});
function up(e){ pointers.delete(e.pointerId); if(pointers.size<2) pinchStart=null; if(!pointers.size) panStart=null; }
cv.addEventListener("pointerup",up); cv.addEventListener("pointercancel",up);
cv.addEventListener("wheel",e=>{
  /* The wheel zooms the web — but not when the pointer is over a panel that
     scrolls on its own. Swallowing it there meant the mouse wheel did nothing in
     the start panel and the plans rail on a desktop. */
  if(e.target.closest(".startwrap,.webrail,.sheet,textarea,select")) return;
  e.preventDefault(); const c=cv.getBoundingClientRect();
  zoomBy(e.deltaY<0?1.12:0.89, e.clientX-c.left, e.clientY-c.top); },{passive:false});

/* ---- node drag / tap ---- */
function nodePointerDown(e,el,n){
  if(e.target.classList.contains("nplus")) return;
  e.stopPropagation();
  el.setPointerCapture(e.pointerId);
  nodeDrag={n,el,sx:e.clientX,sy:e.clientY,ox:n.x,oy:n.y,moved:false};
  const mv=ev=>{
    const dx=(ev.clientX-nodeDrag.sx)/view.s, dy=(ev.clientY-nodeDrag.sy)/view.s;
    if(Math.abs(dx)>3||Math.abs(dy)>3) nodeDrag.moved=true;
    n.x=nodeDrag.ox+dx; n.y=nodeDrag.oy+dy;
    el.style.left=n.x+"px"; el.style.top=n.y+"px"; drawLinks();
  };
  const fin=()=>{ el.removeEventListener("pointermove",mv);
    if(!nodeDrag.moved) openNode(n); nodeDrag=null; };
  el.addEventListener("pointermove",mv);
  el.addEventListener("pointerup",fin,{once:true});
  el.addEventListener("pointercancel",fin,{once:true});
}

/* ---- the demo brain ---- */
function think(txt,ms){ $("thinkTxt").textContent=txt; $("thinking").classList.add("on");
  return new Promise(r=>setTimeout(()=>{ $("thinking").classList.remove("on"); r(); },ms)); }

/* Picks questions that react to the words you actually used.
   Still the demo brain — a real API swaps this one function out. */
const CORE_Q = [
  s=>`What does a win look like for "${s}"? Give me the finish line in one sentence.`,
  ()=>`What have you already tried, and what specifically happened when you did?`,
  ()=>`What's the hard limit you can't get around — money, hours, tools, or people?`
];
const TOPIC_Q = [
  {k:/ad|market|lead|customer|client|job|sale|sell|promo|social|facebook|fb|google/i,
   q:()=>`Where did your last few customers actually come from? Be specific.`},
  {k:/money|budget|cost|cheap|afford|price|pay|fund|cash|revenue|profit/i,
   q:()=>`What can you realistically spend on this per month, and what happens if it returns nothing for 90 days?`},
  {k:/credit|score|loan|bank|bureau|dispute|debt|financ/i,
   q:()=>`Which accounts or bureaus are involved, and where does each one stand right now?`},
  {k:/hire|hiring|va|assistant|employee|staff|team|contractor|freelanc/i,
   q:()=>`What exactly would this person take off your plate in their first week?`},
  {k:/app|build|code|software|site|website|tool|program|develop|3d|print/i,
   q:()=>`What has to work on day one, and what can honestly wait until later?`},
  {k:/fast|quick|deadline|asap|urgent|soon|week|month|time/i,
   q:()=>`What's the actual deadline, and what happens if you miss it?`},
  {k:/health|run|workout|weight|diet|fit|gym|train/i,
   q:()=>`What does your week look like right now, and where would this realistically fit?`},
  {k:/organiz|plan|habit|routine|focus|procrastinat|overwhelm|stuck|behind/i,
   q:()=>`When you've dropped this before, what was happening that week?`}
];
const FALLBACK_Q = [
  ()=>`Who else is affected by this, and what do they care about most?`,
  ()=>`What's the one thing that, if it goes sideways, sinks the whole thing?`,
  ()=>`What would make you say "that was worth it" 90 days from now?`
];
function shortTopic(s){
  const w=s.replace(/^(i want to|i need to|how do i|help me|i'm trying to|im trying to)\s*/i,"").split(/\s+/);
  return w.slice(0,7).join(" ") + (w.length>7?"…":"");
}
function makeQuestions(seed){
  const topic=shortTopic(seed), out=[];
  out.push(CORE_Q[0](topic));
  TOPIC_Q.forEach(t=>{ if(out.length<4 && t.k.test(seed)) out.push(t.q()); });
  out.push(CORE_Q[1]());
  out.push(CORE_Q[2]());
  let i=0;
  while(out.length<5 && i<FALLBACK_Q.length) out.push(FALLBACK_Q[i++]());
  return out.slice(0,5);
}
const ANGLES=["STRATEGY","STEP-BY-STEP","OPTIONS","RISK","EXPERT"];

async function startWeb(){
  const s=$("seedInput").value.trim();
  if(!s){ $("seedInput").focus(); toast("Type the idea or problem first"); return; }
  P.seed=s;
  picks=[];
  P.nodes=[]; P.nid=1;
  const r=addNode({type:"root",text:s});
  P.stage=1; renderStages();
  $("startwrap").classList.add("hidden");
  drawWeb(); fitView();
  await think(AI.on?"Asking a real model…":"Reading the problem…",900);
  let qList=null;
  if(AI.on){
    const r=await callAI(
      `You help someone think through a problem. Given their problem, ask exactly 5 short questions
that would let you give a genuinely useful answer. They should be the questions a sharp advisor asks —
specific to this problem, not generic. Reply with ONLY the 5 questions, one per line, no numbering, no preamble.`,
      `My problem: ${s}\n\nContext about me:\n${appContext().slice(0,2500)}`, 500);
    if(r){ const lines=r.split("\n").map(x=>x.replace(/^[-*\d.)\s]+/,"").trim()).filter(x=>x.length>8);
      if(lines.length>=3) qList=lines.slice(0,5); }
  }
  if(!qList){
    qList=makeQuestions(s);
    // Don't let a failed call hide behind plausible-looking questions
    if(AI.on) showAiFailBanner("These questions came from the built-in list, not the model.");
  } else hideAiFailBanner();
  for(let i=0;i<qList.length;i++){
    addNode({type:"question",text:qList[i],parent:r.id,num:i+1,answer:""});
    drawWeb(); fitView();
    await new Promise(r=>setTimeout(r,170));
  }
  P.stage=2; renderStages();
  setCta({label:"Answer the questions", disabled:true, cls:""});
  updateCta();
  toast("Tap each question to answer it");
}

/* A banner you can't miss, right on the canvas. The little chip in the header
   was too quiet — you can stare at built-in questions for a week and never
   notice the model never answered. */
function showAiFailBanner(what){
  let el=$("aiFail");
  if(!el){ el=document.createElement("div"); el.id="aiFail"; el.className="aifail";
    const cv=$("canvas"); if(!cv) return; cv.appendChild(el); }
  el.innerHTML=`<div style="flex:1;min-width:0">
      <b>AI didn't answer — ${esc(what)}</b>
      <span>${esc(aiPlainError(AI.lastError))}</span></div>
    <div class="crbtn take" style="background:#2a1119;color:#ff8f8f;border:1px solid rgba(255,95,126,.4)"
         onclick="go('settings')">Fix it</div>
    <div class="xx" style="cursor:pointer;padding:0 4px" onclick="hideAiFailBanner()">✕</div>`;
  el.style.display="flex";
}
function hideAiFailBanner(){ const el=$("aiFail"); if(el) el.style.display="none"; }

/* ================= ASKING FOLLOW-UPS =================
   You've read a route (or the blended plan) and you want to poke at it. This
   keeps that conversation attached to the thing it's about, so months later you
   can see what you wondered and what came back. */
let askingAbout=null;      // id of the node the conversation belongs to

function ensureThread(ownerId){
  let t=webThread(ownerId);
  if(!t) t=addNode({type:"thread", parent:ownerId, open:true});
  return t;
}
function toggleThread(id){
  const t=P.nodes.find(n=>n.id===id); if(!t) return;
  t.open=!t.open; save(); drawWeb(); setTimeout(fitView,80);
}

/* Everything the model needs to answer well, without you retyping a word. */
function threadBrief(ownerId){
  const owner=P.nodes.find(n=>n.id===ownerId);
  const L=[];
  L.push(`THE PROBLEM: ${P.seed}`);
  const qs=P.nodes.filter(n=>n.type==="question"&&n.answer);
  if(qs.length){ L.push(`\nWHAT HE TOLD ME:`);
    qs.forEach(q=>L.push(`- ${q.text}\n  ${q.answer}`)); }
  if(owner && owner.type==="solution"){
    const prompt=P.nodes.find(n=>n.id===owner.parent);
    L.push(`\nTHIS IS ABOUT ROUTE ${owner.num}${owner.angle?` (${owner.angle} angle)`:``}: ${owner.title}`);
    if(prompt) L.push(`The prompt behind it: ${prompt.body}`);
    L.push(`What the route said:\n${stripTags(owner.html).slice(0,1800)}`);
  } else {
    L.push(`\nTHIS IS ABOUT THE COMBINED PLAN he built from the routes he picked.`);
    const picked=P.nodes.filter(n=>n.type==="solution"&&n.picked);
    picked.forEach(p=>L.push(`- Route ${p.num}: ${p.title}\n  ${stripTags(p.html).slice(0,600)}`));
    if(draftPlan&&draftPlan.steps) L.push(`The steps:\n`+draftPlan.steps.map(x=>`- ${x.n} (${x.e} min)`).join("\n"));
  }
  const t=webThread(ownerId);
  const prev=t?webQAs(t.id):[];
  if(prev.length){ L.push(`\nWHAT HE ALREADY ASKED HERE:`);
    prev.forEach(q=>L.push(`Q: ${q.q}\nA: ${stripTags(q.a).slice(0,700)}`)); }
  return L.join("\n");
}

function openThread(ownerId){
  askingAbout=ownerId;
  drawThread();
  closeAll(); openSheet("threadSheet");
  setTimeout(()=>{ const i=$("thInput"); if(i) i.focus(); },320);
}
function drawThread(){
  const owner=P.nodes.find(n=>n.id===askingAbout);
  const t=webThread(askingAbout);
  const qas=t?webQAs(t.id):[];
  const what = owner && owner.type==="solution" ? `Route ${owner.num} — ${esc(owner.title)}`
             : `The combined plan`;
  $("thTitle").textContent = qas.length ? `${qas.length} question${qas.length===1?"":"s"} on this` : "Ask about this";
  $("thWhat").innerHTML = what;
  $("thBody").innerHTML = qas.length ? qas.map(q=>`
    <div class="qa${q.point?" pt":""}">
      <div class="qa-q">${esc(q.q)}</div>
      <div class="qa-a">${q.live===null?"":q.live?aiBadge():fellBack()}${q.a}</div>
      <div class="qa-row">
        <span class="qa-btn${q.point?" on":""}" onclick="markPoint(${q.id})">${q.point?"★ The point":"☆ Mark as the point"}</span>
        <span class="qa-btn" onclick="qaToTask(${q.id})">Make a task</span>
        <span class="qa-btn del" onclick="qaDelete(${q.id})">Delete</span>
      </div>
    </div>`).join("")
    : `<div class="wk-note" style="padding:2px 0 0">Nothing asked yet. Try "why that order?", "what would make this
       fail?", "what's the cheapest version of this?"</div>`;
}
async function thAsk(){
  const v=$("thInput").value.trim();
  if(!v){ $("thInput").focus(); return; }
  const owner=askingAbout;
  $("thInput").value="";
  const t=ensureThread(owner);
  const node=addNode({type:"qa", parent:t.id, q:v, a:`<p><i style="color:#8d99ab">Thinking…</i></p>`,
                      point:false, live:null});   // null = no verdict yet, so no badge
  drawThread(); drawWeb();
  let html=null, live=false;
  if(AI.on){
    const r=await callAI(
      `You are helping someone think harder about a plan they are working on. Answer their question directly
and specifically, using the situation below. Be concrete and brief — a few short paragraphs at most. If the
honest answer is "it depends", say what it depends on. Reply in simple HTML: <p>, <b>, <ul><li>. No preamble.`,
      `${threadBrief(owner)}\n\nHIS QUESTION: ${v}`, 900);
    if(r){ html=r; live=true; }
  }
  if(!html) html = `<p>${esc(followupFallback(v))}</p>`;
  node.a = html;          // just the answer — the LIVE AI / built-in badge is
  node.live = live;       // worked out when it's drawn, not baked into the text
  save(); drawThread(); drawWeb();
}
/* With no key (or a failed call) this is honest rather than clever — it points
   you back at what's already on screen instead of inventing an answer. */
function followupFallback(q){
  const l=q.toLowerCase();
  if(/why|reason/.test(l)) return "No model answered this one, so I can't reason about it. The route's own text above is the best thing to re-read — it usually carries its reasoning in the first paragraph.";
  if(/how long|time|how much/.test(l)) return "I can't estimate that without a model. Put your own guess on the step when you approve the plan — the app tracks whether the guess was right.";
  if(/risk|fail|wrong/.test(l)) return "No model answered. The usual killers are: it depends on someone else, it needs money you haven't set aside, or the first step is too big to start. Check the route against those three.";
  return "No model answered this one — connect a key in Settings and ask again, and it'll answer properly using your problem and this route.";
}
/* An answer made you realise something needs doing. You press this — it never
   happens on its own, so the plan can't drift while you're just reading. */
function qaToTask(id){
  const n=P.nodes.find(x=>x.id===id); if(!n) return;
  const t=P.nodes.find(x=>x.id===n.parent);
  const owner=t?P.nodes.find(x=>x.id===t.parent):null;
  saveWeb(true);                       // so the task can point back at a real web
  const src = solveSource && tasks.find(x=>x.id===solveSource.task);
  const pid = solveSource ? solveSource.proj : null;
  const name = n.q.replace(/\?+$/,"").replace(/^(why|how|what|should i|can i|is it)\s+/i,"")
                  .replace(/^[a-z]/,c=>c.toUpperCase()).slice(0,70);
  const task={id:newId(), name: name||"Follow up on a question", cat:catForNew(src,pid),
    time:"09:00", est:30, done:false, routine:false, streak:0,
    notes:`Came out of a question you asked on "${P.seed}".`,
    target:1, unit:"time", count:0, makeup:true, sched:false, proj:pid,
    from:{web:P.savedId||null, node:owner?owner.id:null, qa:n.id, seed:P.seed},
    log:[{d:new Date().toLocaleDateString(undefined,{month:"short",day:"numeric"}),
          t:`From your question: "${n.q}"`}]};
  tasks.push(task); save();
  closeAll(); render(); renderProjects(); renderCategories();
  toast(`Added "${task.name}" — not scheduled yet`);
}

function markPoint(id){
  const n=P.nodes.find(x=>x.id===id); if(!n) return;
  const t=P.nodes.find(x=>x.id===n.parent);
  webQAs(t.id).forEach(q=>{ if(q.id!==id) q.point=false; });   // only ever one
  n.point=!n.point; save(); drawThread(); drawWeb();
  toast(n.point?"Marked — this is what shows on the task":"Unmarked");
}
async function qaDelete(id){
  const n=P.nodes.find(x=>x.id===id); if(!n) return;
  if(!await ask("Delete this question and its answer?","Delete it",1)) return;
  const t=P.nodes.find(x=>x.id===n.parent);
  const i=P.nodes.indexOf(n); const snap=n;
  P.nodes.splice(i,1);
  if(t && !webQAs(t.id).length) P.nodes.splice(P.nodes.indexOf(t),1);   // empty thread goes too
  save(); drawThread(); drawWeb();
  toastUndo("Deleted", ()=>{ if(!P.nodes.includes(t)) P.nodes.push(t); P.nodes.splice(i,0,snap); save(); drawThread(); drawWeb(); });
}

/* One block of text another AI can pick up cold. Everything it needs, in order,
   so you can branch off somewhere else without touching what's here. */
function threadExport(ownerId){
  const owner=P.nodes.find(n=>n.id===ownerId);
  const t=webThread(ownerId), qas=t?webQAs(t.id):[];
  const L=[];
  L.push(`# Where I've got to`);
  L.push(`\n## The problem I'm working on\n${P.seed}`);
  const qs=P.nodes.filter(n=>n.type==="question"&&n.answer);
  if(qs.length){ L.push(`\n## What I said about my situation`);
    qs.forEach(q=>L.push(`**${q.text}**\n${q.answer}`)); }
  if(owner && owner.type==="solution"){
    const prompt=P.nodes.find(n=>n.id===owner.parent);
    L.push(`\n## The route I'm looking at — Route ${owner.num}${owner.angle?` (${owner.angle} angle)`:``}`);
    L.push(`**${owner.title}**`);
    if(prompt) L.push(`\n_The prompt that produced it:_\n> ${String(prompt.body).replace(/\n/g,"\n> ")}`);
    L.push(`\n### What it said\n${stripTags(owner.html)}`);
  } else {
    L.push(`\n## The plan I built from the routes I picked`);
    P.nodes.filter(n=>n.type==="solution"&&n.picked)
      .forEach(p=>L.push(`\n**Route ${p.num} — ${p.title}**\n${stripTags(p.html)}`));
    if(draftPlan&&draftPlan.steps) L.push(`\n### The steps\n`+draftPlan.steps.map(x=>`- ${x.n} (about ${x.e} min)`).join("\n"));
  }
  if(qas.length){ L.push(`\n## What I've already asked about it`);
    qas.forEach((q,i)=>{ L.push(`\n**${i+1}. ${q.q}**${q.point?"  _(this was the important one)_":""}`);
                         L.push(stripTags(q.a)); }); }
  L.push(`\n---\n\nThat's where I got to. Pick it up from here — I want to explore this further without changing the version I've already got. Ask me anything you need before answering.`);
  return L.join("\n");
}
function copyThreadOut(ownerId){
  const txt=threadExport(ownerId);
  copyText(txt);
  toast(`Copied ${Math.round(txt.length/100)/10}k characters — paste it into any AI`);
}
function showThreadExport(ownerId){
  $("nodeBody").innerHTML=`<h2>Copy for another AI</h2>
    <p style="font-size:12.5px;color:var(--ink3);line-height:1.55;margin:8px 0 12px">
      Everything below goes across in one block: your problem, what you told it, the route, and every question
      you've asked. Paste it anywhere and it'll understand the whole situation cold. Nothing you do over there
      touches this web.</p>
    <div class="codebox" style="max-height:44vh">${esc(threadExport(ownerId))}</div>
    <div class="btns"><button class="b b-ghost" onclick="openThread(${ownerId})">Back</button>
      <button class="b b-violet" onclick="copyThreadOut(${ownerId})">Copy it</button></div>`;
  closeAll(); openSheet("node");
}

function setCta(o){
  const b=$("plCta");
  if(!o){ b.classList.add("hidden"); return; }
  b.classList.remove("hidden");
  b.className="pl-cta"+(o.cls?" "+o.cls:"");
  b.textContent=o.label;
  b.disabled=!!o.disabled;
  b.onclick=o.onclick||null;
}
function updateCta(){
  const qs=P.nodes.filter(n=>n.type==="question");
  const done=qs.filter(q=>q.answer).length;
  if(P.nodes.some(n=>n.type==="prompt")){
    const sols=P.nodes.filter(n=>n.type==="solution").length;
    const ps=P.nodes.filter(n=>n.type==="prompt").length;
    const picked=P.nodes.filter(n=>n.type==="solution"&&n.picked).length;
    if(picked) setCta({label:`Combine ${picked} route${picked>1?"s":""} into a plan`, cls:"violet", onclick:combineRoutes});
    else if(sols<ps) setCta({label:`Run all ${ps} prompts`, cls:"violet", onclick:runAll});
    else setCta({label:"Compare & pick routes", cls:"violet", onclick:compareAll});
    return;
  }
  if(done<qs.length) setCta({label:`Answer questions · ${done}/${qs.length}`, disabled:true});
  else setCta({label:"Build 5 better prompts", cls:"violet", onclick:buildPrompts});
}

function openNode(n){
  if(n.type==="root"){
    $("nodeBody").innerHTML=`<h2>Your problem</h2>
      <p style="font-size:14.5px;line-height:1.6;color:#cbd6e5;margin:8px 0 0">${esc(n.text)}</p>
      <label class="f">Reword it</label>
      <textarea class="f" id="editRoot" rows="3">${esc(n.text)}</textarea>
      <div class="btns"><button class="b b-ghost" onclick="closeAll()">Close</button>
      <button class="b b-blue" onclick="n_saveRoot(${n.id})">Save</button></div>
      <div class="btns" style="margin-top:9px">
        <button class="b b-violet" style="width:100%" onclick="addContext(${n.id})">+ Add more context</button>
      </div>
      <div class="btns" style="margin-top:9px">
        <button class="b b-blue" style="width:100%" onclick="addOwnQuestion(${n.id})">+ Add a question of my own</button>
      </div>`;
    openSheet("node"); return;
  }
  if(n.type==="question"){
    $("nodeBody").innerHTML=`<div class="nlabel" style="color:#7fb0ff;font-size:10px">Question ${n.num}</div>
      <h2 style="font-size:18px;line-height:1.35">${esc(n.text)}</h2>
      <label class="f">Your answer</label>
      <textarea class="f" id="qAns" rows="4" placeholder="However much or little you know">${esc(n.answer||"")}</textarea>
      <div class="btns">
        <button class="b b-ghost" onclick="n_skip(${n.id})">Skip it</button>
        <button class="b b-blue" onclick="n_saveAns(${n.id})">Save answer</button>
      </div>
      <div class="btns" style="margin-top:9px">
        <button class="b b-violet" style="width:100%" onclick="addContext(${n.id})">+ Add more context</button>
      </div>
      <label class="f" style="margin-top:14px">Reword the question</label>
      <textarea class="f" id="qEdit" rows="2">${esc(n.text)}</textarea>
      <div class="btns" style="margin-top:9px">
        <button class="b b-ghost" onclick="n_saveQ(${n.id})">Save wording</button>
        <button class="b b-blue" onclick="addOwnRoute(${n.id})">+ Add a route</button>
      </div>
      <div class="btns" style="margin-top:9px">
        <button class="b b-danger" style="width:100%" onclick="n_delAsk(${n.id})">Remove this question</button>
      </div>`;
    openSheet("node"); setTimeout(()=>$("qAns").focus(),320); return;
  }
  if(n.type==="note"){
    $("nodeBody").innerHTML=`<h2>Your note</h2>
      <p style="font-size:13px;color:var(--ink2);margin:4px 0 0">Anything you want the prompts to know — context, a constraint, something the questions missed.</p>
      <label class="f">Note</label>
      <textarea class="f" id="noteTxt" rows="3" placeholder="Type it here…">${esc(n.text)}</textarea>
      <div class="btns"><button class="b b-danger" onclick="n_del(${n.id})">Delete</button>
      <button class="b b-blue" onclick="n_saveNote(${n.id})">Save note</button></div>`;
    openSheet("node"); setTimeout(()=>$("noteTxt").focus(),320); return;
  }
  if(n.type==="prompt"){
    const hasSol=kids(n.id).length>0;
    $("nodeBody").innerHTML=`<div class="nlabel" style="color:#c4b0ff;font-size:10px">Prompt ${n.num} · ${n.angle}</div>
      <h2 style="font-size:18px">${esc(n.title)}</h2>
      <p style="font-size:12.5px;color:var(--ink3);margin:2px 0 12px">${esc(n.why)}</p>
      <div class="codebox" id="pTxt">${esc(n.body)}</div>
      <div class="btns">
        <button class="b b-ghost" onclick="copyPrompt(${n.id})">Copy prompt</button>
        <button class="b b-violet" onclick="runPrompt(${n.id})">${hasSol?"Run again":"Get the answer"}</button>
      </div>
      ${hasSol?`<div class="btns" style="margin-top:9px"><button class="b b-primary" onclick="openNode(P.nodes.find(x=>x.id===${kids(n.id)[0].id}))">Read the answer</button></div>`:``}`;
    openSheet("node"); return;
  }
  if(n.type==="thread"){ toggleThread(n.id); openThread(n.parent); return; }
  if(n.type==="qa"){
    $("nodeBody").innerHTML=`<div class="nlabel" style="color:#4fc3f7;font-size:10px">You asked${n.point?" · THE POINT":""}</div>
      <h2 style="font-size:17px">${esc(n.q)}</h2>
      <div class="ansbox" style="margin-top:10px">${n.live===null?"":n.live?aiBadge():fellBack()}${n.a}</div>
      <div class="btns">
        <button class="b ${n.point?'b-ghost':'b-primary'}" onclick="markPoint(${n.id});closeAll()">${n.point?"Unmark":"★ This is the point"}</button>
        <button class="b b-ghost" onclick="qaToTask(${n.id})">Make a task</button>
      </div>
      <div class="btns" style="margin-top:9px">
        <button class="b b-ghost" style="width:100%" onclick="openThread(${(P.nodes.find(x=>x.id===n.parent)||{}).parent})">Back to the whole conversation</button>
      </div>`;
    openSheet("node"); return;
  }
  if(n.type==="solution"){
    $("nodeBody").innerHTML=`<div class="nlabel" style="color:#4fd6a5;font-size:10px">Answer to prompt ${n.num}</div>
      <h2 style="font-size:18px">${esc(n.title)}</h2>
      <div class="ansbox" style="margin-top:10px">${n.html}</div>
      <div class="btns">
        <button class="b ${n.picked?'b-ghost':'b-primary'}" onclick="toggleRoute(${n.id})">${n.picked?"Drop this route":"✓ Use this route"}</button>
        <button class="b b-ghost" onclick="solutionToTask(${n.id})">Just make a task</button>
      </div>
      <div class="btns" style="margin-top:9px">
        <button class="b b-blue" style="width:100%" onclick="openThread(${n.id})">💬 Ask about this${
          webQACount(n.id)?` · ${webQACount(n.id)} asked`:``}</button>
      </div>
      <div style="font-size:11.5px;color:var(--ink3);line-height:1.5;margin-top:10px">
        Pick as many routes as you want — you can take parts of Route 1 and Route 3 together. Nothing here gets deleted either way.
        ${solveSource&&solveSource.proj?`<br>All of it stays tied to <b style="color:#7fb0ff">${esc(projById(solveSource.proj)?projById(solveSource.proj).name:"")}</b>.`:``}</div>`;
    openSheet("node"); return;
  }
}
/* per-task progress notes */
function addLog(id){
  const t=getTask(id); if(!t) return;
  const v=$("logInput").value.trim();
  if(!v){ $("logInput").focus(); toast("Write the note first"); return; }
  t.log=t.log||[];
  t.log.unshift({d:new Date().toLocaleDateString(undefined,{month:"short",day:"numeric"}),t:v});
  t.lastWorked=0;
  render(); openDetail(id); toast("Note saved to "+t.name);
}
function delLog(id,i){
  const t=getTask(id); if(!t||!t.log) return;
  t.log.splice(i,1); render(); openDetail(id); toast("Note removed");
}

function n_saveRoot(id){ const n=P.nodes.find(x=>x.id===id); n.text=$("editRoot").value.trim()||n.text; P.seed=n.text; closeAll(); drawWeb(); }
function addContext(id){
  const n=P.nodes.find(x=>x.id===id);
  ctxNode=id;
  $("acWhat").textContent = n.type==="root" ? "the problem" : n.type==="prompt" ? `prompt ${n.num}` : `question ${n.num}`;
  $("acText").value="";
  closeAll(); openSheet("ctxSheet"); setTimeout(()=>$("acText").focus(),320);
}
function saveContext(asNote){
  const v=$("acText").value.trim(); if(!v){ toast("Add something first"); return; }
  const n=P.nodes.find(x=>x.id===ctxNode);
  addNode({type:"note",text:v,parent:n.id});
  if(asNote && solveSource){
    const wid = solveSource.web || (saveWeb(true), solveSource.web);
    noteAdd(v, wid?"web":"free", wid||null);
    renderNotes();
  }
  closeAll(); drawWeb(); fitView();
  toast(asNote?"Added to the web and saved as a note":"Added to the web");
}
let ctxNode=null;

function n_saveAns(id){ const n=P.nodes.find(x=>x.id===id); n.answer=$("qAns").value.trim(); save(); closeAll(); drawWeb(); updateCta();
  const qs=P.nodes.filter(x=>x.type==="question"), left=qs.filter(q=>!q.answer).length;
  toast(left? left+" question"+(left>1?"s":"")+" to go" : "All answered — build the prompts"); }
function n_skip(id){ const n=P.nodes.find(x=>x.id===id); n.answer="(skipped)"; closeAll(); drawWeb(); updateCta(); }
function n_saveNote(id){
  const n=P.nodes.find(x=>x.id===id), v=$("noteTxt").value.trim();
  if(!v){ P.nodes=P.nodes.filter(x=>x.id!==id); closeAll(); drawWeb(); toast("Empty note removed"); return; }
  n.text=v; closeAll(); drawWeb(); toast("Note added to the web");
}
function n_del(id){ P.nodes=P.nodes.filter(x=>x.id!==id&&x.parent!==id); closeAll(); drawWeb(); }
/* Hand-editing. The model is optional — you can lay the whole thing out yourself
   and only bring AI in when you actually want it. */
function addOwnQuestion(rootId){
  const n=addNode({type:"question", text:"New question — tap to write it",
                   parent:rootId, num:P.nodes.filter(x=>x.type==="question").length+1, answer:""});
  if(P.stage<2) P.stage=2;
  layout(); closeAll(); renderStages(); drawWeb(); updateCta(); saveWeb(true);
  setTimeout(()=>openNode(n),150);
}
function addOwnRoute(qId){
  const q=P.nodes.find(x=>x.id===qId); if(!q) return;
  const j=P.nodes.filter(n=>n.type==="solution"&&n.parent===qId).length;
  const n=addNode({type:"solution", parent:qId, num:q.num, text:"New route",
                   title:"New route", body:"", picked:false, angle:j});
  layout(); closeAll(); drawWeb(); updateCta(); saveWeb(true);
  setTimeout(()=>openNode(n),150);
}
function n_saveQ(id){
  const n=P.nodes.find(x=>x.id===id); if(!n) return;
  const v=($("qEdit")&&$("qEdit").value.trim())||"";
  if(v) n.text=v;
  closeAll(); drawWeb(); saveWeb(true); toast("Question updated");
}
async function n_delAsk(id){
  const n=P.nodes.find(x=>x.id===id); if(!n) return;
  const under=P.nodes.filter(x=>x.parent===id).length;
  if(!await ask(`Remove this question?${under?`\n\n${under} thing${under===1?"":"s"} hanging off it go too.`:""}`,
    "Remove it","danger")) return;
  const snap=P.nodes.filter(x=>x.id===id||x.parent===id);
  P.nodes=P.nodes.filter(x=>x.id!==id&&x.parent!==id);
  P.nodes.filter(x=>x.type==="question").forEach((q,i)=>q.num=i+1);
  layout(); closeAll(); drawWeb(); updateCta(); saveWeb(true);
  toastUndo("Question removed", ()=>{ snap.forEach(x=>P.nodes.push(x));
    P.nodes.filter(x=>x.type==="question").forEach((q,i)=>q.num=i+1);
    layout(); drawWeb(); updateCta(); saveWeb(true); });
}
function addOwn(parentId){
  const n=addNode({type:"note",text:"",parent:parentId});
  drawWeb(); setTimeout(()=>openNode(n),120);
}

/* ---- build the 5 prompts ---- */
function ctx(){
  const qs=P.nodes.filter(n=>n.type==="question"&&n.answer&&n.answer!=="(skipped)");
  const notes=P.nodes.filter(n=>n.type==="note");
  let s="CONTEXT I'VE GIVEN YOU:\n";
  qs.forEach(q=>{ s+="• "+q.text+"\n  → "+q.answer+"\n"; });
  notes.forEach(nt=>{ s+="• My own note: "+nt.text+"\n"; });
  return s;
}
const PROMPT_SPECS=[
  {angle:"STRATEGY", title:"Frame it as a strategist would",
   why:"Gives the model a role and a target so it stops answering in generalities.",
   build:c=>`You are a seasoned operator who has solved this exact type of problem many times.

MY SITUATION:
${P.seed}

${c}
WHAT I WANT FROM YOU:
1. Restate my real problem in one sentence — the one underneath what I said.
2. Give me the single highest-leverage move I should make first, and why that one.
3. Then the next three moves in order.
4. Tell me what I'm likely getting wrong about this.

Be specific to my situation. No generic advice. If something is missing, say what and assume the most common case.`},
  {angle:"STEP-BY-STEP", title:"Force a start-to-finish plan",
   why:"Removes vagueness by demanding an ordered, time-boxed sequence you can actually run.",
   build:c=>`Build me a step-by-step plan I can start today.

THE GOAL:
${P.seed}

${c}
FORMAT IT LIKE THIS:
- Number every step.
- For each step: what to do, roughly how long it takes, and how I know it's finished.
- Mark any step that depends on another one.
- Flag the two steps most people skip and regret.
- End with a one-week schedule showing what happens on which day.

Assume I'm doing this myself with the constraints listed above.`},
  {angle:"OPTIONS", title:"Lay out the real choices side by side",
   why:"Stops the model from picking one path and hiding the trade-offs from you.",
   build:c=>`Give me the realistic options here — not one recommendation.

THE DECISION:
${P.seed}

${c}
FOR EACH OPTION GIVE ME:
- Name and a one-line description
- What it costs me in money, time, and effort
- The best realistic outcome and the most likely outcome
- Who this option is right for and who it's wrong for

Then rank them for my specific situation and explain the ranking in three sentences. Include at least one option I probably haven't considered.`},
  {angle:"RISK", title:"Attack it before reality does",
   why:"A pre-mortem surfaces the failure you'd otherwise find the expensive way.",
   build:c=>`Play devil's advocate on this. Your job is to find where it breaks.

WHAT I'M PLANNING:
${P.seed}

${c}
DO THIS:
1. Assume it's 6 months from now and this failed badly. Write the story of how it failed.
2. List the top 5 failure points, ranked by how likely they are.
3. For each one: the early warning sign I'd see, and the cheapest way to prevent it.
4. Tell me the one assumption I'm making that, if wrong, ruins everything.

Be blunt. I'd rather hear it now than pay for it later.`},
  {angle:"EXPERT", title:"Get graded by someone who's done it",
   why:"Asking for a critique instead of an answer gets you sharper, less agreeable output.",
   build:c=>`Act as an expert reviewing my thinking, not as an assistant agreeing with me.

WHAT I'M WORKING ON:
${P.seed}

${c}
YOUR REVIEW SHOULD COVER:
- What I'm getting right (be brief)
- Where my thinking is shallow or wrong, and what a pro would think instead
- The question I should have asked but didn't
- What you'd do in my exact position, in the order you'd do it
- One resource, tool, or tactic I probably don't know about

Rate my current approach 1–10 and justify the number.`}
];

async function buildPrompts(){
  const r=root();
  P.nodes=P.nodes.filter(n=>n.type!=="prompt"&&n.type!=="solution");
  P.stage=3; renderStages();
  await think(AI.on?"Writing five sharper prompts…":"Rewriting your question five ways…",AI.on?400:1100);
  const c=ctx();
  let specs=null;
  if(AI.on){
    const raw=await callAI(
`Rewrite the user's problem as 5 genuinely different prompts, each taking a distinct angle:
1 STRATEGY, 2 STEP-BY-STEP, 3 OPTIONS, 4 RISK, 5 EXPERT.
Each prompt must be something they could paste into any AI and get a strong answer — specific to their
situation, using the context they gave, with a clear instruction about the shape of the answer.

Return exactly 5 blocks separated by a line containing only ---
Each block:
TITLE: a short label, under 8 words
WHY: one sentence on why this framing gets a better answer
PROMPT: the full prompt text, multiple lines allowed`,
      `THEIR PROBLEM: ${P.seed}\n\n${c}\n\nABOUT THEM:\n${appContext().slice(0,1800)}`, 2200);
    if(raw){
      const blocks=raw.split(/^---$/m).map(b=>b.trim()).filter(Boolean);
      if(blocks.length>=4){
        specs=blocks.slice(0,5).map((b,i)=>{
          const title=(b.match(/TITLE:\s*(.+)/i)||[])[1]||PROMPT_SPECS[i].title;
          const why=(b.match(/WHY:\s*(.+)/i)||[])[1]||PROMPT_SPECS[i].why;
          const body=(b.split(/PROMPT:\s*/i)[1]||"").trim()||PROMPT_SPECS[i].build(c);
          return {angle:ANGLES[i]||PROMPT_SPECS[i].angle, title:title.trim(), why:why.trim(), body};
        });
      }
    }
  }
  if(!specs) specs=PROMPT_SPECS.map(s=>({angle:s.angle,title:s.title,why:s.why,body:s.build(c)}));
  for(let i=0;i<specs.length;i++){
    const s=specs[i];
    addNode({type:"prompt",parent:r.id,num:i+1,angle:s.angle,title:s.title,why:s.why,body:s.body});
    drawWeb(); fitView();
    await new Promise(r=>setTimeout(r,AI.on?90:190));
  }
  P.stage=4; renderStages(); updateCta();
  toast("Five prompts ready — tap one to read or run it");
}

function copyPrompt(id){
  const n=P.nodes.find(x=>x.id===id);
  const done=()=>toast("Copied — paste it into any AI");
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(n.body).then(done,fallback);
  else fallback();
  function fallback(){ const ta=document.createElement("textarea"); ta.value=n.body; document.body.appendChild(ta);
    ta.select(); try{document.execCommand("copy");}catch(e){} ta.remove(); done(); }
}

const SOLUTION_TEMPLATES={
  STRATEGY:s=>`<b>The real problem underneath:</b> you're treating "${s}" as one big task when it's actually a sequencing problem — you have more moves available than you have attention.
<b>Highest-leverage first move:</b> pick the single channel or lever with the shortest feedback loop and run it hard for two weeks before touching anything else. Speed of learning beats breadth every time here.
<ul><li><b>Move 2 —</b> Write down what "working" looks like as a number, not a feeling.</li>
<li><b>Move 3 —</b> Kill or park everything that doesn't feed that number.</li>
<li><b>Move 4 —</b> Build one repeatable process around whatever produced the first win.</li></ul>
<b>What you're probably getting wrong:</b> assuming the bottleneck is effort. Based on what you told me, it's more likely a targeting problem — the work is fine, it's pointed slightly off.`,
  "STEP-BY-STEP":s=>`<b>Day 1 — Define the finish line (30 min).</b> One sentence, one number. Done when you can say it out loud without hedging.
<b>Day 1 — Inventory what you already have (45 min).</b> Assets, contacts, tools. Done when the list stops growing.
<b>Day 2 — Pick one path (20 min).</b> Depends on Day 1. Done when you've written why you rejected the others.
<b>Day 2–4 — Build the smallest working version (3 hrs).</b> Not polished. Working.
<b>Day 5 — Put it in front of one real person (1 hr).</b> ⚠️ This is the step most people skip and regret.
<b>Day 6 — Fix the top complaint only (2 hrs).</b> Ignore the rest for now.
<b>Day 7 — Decide: double down, adjust, or drop (30 min).</b> ⚠️ Second most-skipped step. Without it you drift.`,
  OPTIONS:s=>`<ul>
<li><b>Option A — Do it yourself, slow and cheap.</b> Costs time, not money. Best case: full control and you learn the system. Likely case: it takes 3× longer than you planned. Right for you if cash is tighter than hours.</li>
<li><b>Option B — Pay someone to compress the timeline.</b> Costs money up front. Best case: weeks saved. Likely case: you spend real time managing them anyway. Right if the deadline is hard.</li>
<li><b>Option C — Partner with someone who already has what you're missing.</b> Costs a share of the upside. Often the fastest route and the one people skip because it feels like giving something away.</li>
<li><b>Option D — Do nothing for 30 days and gather data first.</b> Sounds passive, frequently correct.</li></ul>
<b>Ranked for you:</b> C, then A, then B, then D. C wins because your main gap is access, not ability — and borrowed access is cheaper than built access.`,
  RISK:s=>`<b>Six months from now, how this failed:</b> you started strong, hit an unglamorous middle stretch with no visible progress, quietly stopped, and told yourself you'd come back to it.
<ul><li><b>1. Motivation cliff at week 3.</b> Early sign: you stop checking the number. Fix: tie one small daily action to something you already do.</li>
<li><b>2. Scope creep.</b> Early sign: your list gets longer, not shorter. Fix: cap it at three active items.</li>
<li><b>3. No feedback loop.</b> Early sign: you can't say if it's working. Fix: one metric, checked weekly.</li>
<li><b>4. Wrong first customer or audience.</b> Early sign: polite interest, no action. Fix: change who, not what.</li>
<li><b>5. Money runs out before proof does.</b> Early sign: you're funding it from savings. Fix: set the kill number now.</li></ul>
<b>Your riskiest assumption:</b> that once it's built, people will find it. They won't. Distribution needs its own plan.`,
  EXPERT:s=>`<b>What you're getting right:</b> you're being specific about the problem instead of asking "how do I succeed," and you're willing to be questioned. That already puts you ahead.
<b>Where the thinking is shallow:</b> you're optimizing the thing you can see rather than the thing that matters. A pro would spend the first week purely on figuring out where demand already exists, then aim at it.
<b>The question you should have asked:</b> "Who already has the outcome I want, and what did their first 90 days actually look like?"
<b>What I'd do in your position:</b> talk to five people who've done it, write down every place their story differs from your plan, then rebuild the plan around the overlaps.
<b>Something you probably don't know about:</b> the fastest wins here usually come from a channel that feels too small to bother with — the one with fifty of the right people rather than five thousand of the wrong ones.
<b>Rating: 6/10.</b> Solid instincts, right question, but the plan is still built on assumption instead of evidence. Fix that and it's an 8.`
};

async function runPrompt(id){
  const p=P.nodes.find(x=>x.id===id);
  closeAll();
  P.nodes=P.nodes.filter(n=>n.parent!==p.id||n.type!=="solution");
  drawWeb();
  await think(AI.on?`Asking the model · ${p.angle}…`:`Running prompt ${p.num} · ${p.angle}…`,AI.on?400:1200);
  let html=null;
  if(AI.on){
    const r=await callAI(APP_SYSTEM+"\n\nHIS DATA:\n"+appContext().slice(0,3000),
      p.body+"\n\nAnswer in simple HTML (<div>, <b>, <ul>, <li>). Under 250 words.", 1300);
    if(r) html=r;
  }
  addNode({type:"solution",parent:p.id,num:p.num,angle:p.angle,
           title:({STRATEGY:"The strategist's read","STEP-BY-STEP":"Your run sheet",OPTIONS:"The paths, ranked",RISK:"Where this breaks",EXPERT:"Honest critique"})[p.angle],
           html: html || SOLUTION_TEMPLATES[p.angle](P.seed)});
  drawWeb(); fitView(); updateCta();
  toast(`Answer ready for prompt ${p.num}`);
}
async function runAll(){
  const ps=P.nodes.filter(n=>n.type==="prompt");
  for(const p of ps){ if(kids(p.id).length) continue; await runPrompt(p.id); }
  toast("All five answered — compare and see which framing won");
}
function compareAll(){
  const ps=P.nodes.filter(n=>n.type==="prompt");
  const picked=P.nodes.filter(n=>n.type==="solution"&&n.picked);
  $("nodeBody").innerHTML=`<h2>Pick your routes</h2>
    <p style="font-size:13px;color:var(--ink2);line-height:1.55;margin:6px 0 12px">
    Same problem, five ways of asking. <b style="color:#fff">Take as many as you want</b> — Route 1 plus Route 3 is a
    perfectly good answer. I'll blend whatever you pick into one plan.</p>
    ${ps.map(p=>{const s=kids(p.id)[0];
      return `<div class="routecard${s&&s.picked?" on":""}">
        <div style="display:flex;align-items:flex-start;gap:10px">
          <div style="flex:1;min-width:0">
            <div style="font-size:9.5px;font-weight:900;letter-spacing:.14em;color:#c4b0ff">ROUTE ${p.num} · ${p.angle}</div>
            <div style="font-size:14px;font-weight:650;margin-top:4px">${esc(p.title)}</div>
            <div style="font-size:12px;color:var(--ink3);margin-top:4px;line-height:1.45">${esc(p.why)}</div>
            ${s?`<div style="font-size:12.5px;color:#7de3bd;margin-top:7px">✓ ${esc(s.title)}</div>`
               :`<div style="font-size:12px;color:#ff9d4d;margin-top:7px">Not run yet — no answer to use</div>`}
          </div>
          ${s?`<div class="rpick${s.picked?" on":""}" onclick="toggleRoute(${s.id},1)">${s.picked?"✓":"+"}</div>`:``}
        </div>
      </div>`;}).join("")}
    <div class="btns">
      <button class="b b-ghost" onclick="closeAll()">Close</button>
      <button class="b b-violet" onclick="combineRoutes()" ${picked.length?"":"disabled style='opacity:.4;pointer-events:none'"}>
        Combine ${picked.length||""} route${picked.length===1?"":"s"}</button>
    </div>
    <div class="btns" style="margin-top:9px">
      <button class="b b-ghost" style="width:100%" onclick="saveWeb()">Save this web to the project</button>
    </div>`;
  openSheet("node");
}

/* pick / unpick a route — reversible any time, nothing is destroyed */
function toggleRoute(id,fromCompare){
  const n=P.nodes.find(x=>x.id===id); if(!n) return;
  n.picked=!n.picked;
  save(); drawWeb(); updateCta();
  if(fromCompare) compareAll(); else closeAll();
  const c=P.nodes.filter(x=>x.picked).length;
  toast(n.picked ? `Route ${n.num} added — ${c} picked` : `Route ${n.num} dropped — ${c} left`);
}

/* ================= COMBINE PICKED ROUTES INTO ONE PLAN =================
   Demo brain. Each angle contributes the kind of step it's actually good at,
   then they get ordered so setup comes before execution. */
const ROUTE_STEPS={
  STRATEGY:[
    {n:"Write the finish line as one sentence with a number in it",e:20,ph:1},
    {n:"Pick the single highest-leverage move and commit to it for 2 weeks",e:30,ph:1},
    {n:"Park or kill everything that doesn't feed that number",e:30,ph:1}],
  "STEP-BY-STEP":[
    {n:"List what you already have — assets, contacts, tools",e:45,ph:1},
    {n:"Build the smallest version that actually works",e:180,ph:2},
    {n:"Put it in front of one real person",e:60,ph:2},
    {n:"Fix the top complaint only, ignore the rest",e:120,ph:3}],
  OPTIONS:[
    {n:"Write out the 3 realistic paths with real costs",e:45,ph:1},
    {n:"Rule out the two you won't take, in writing",e:20,ph:1},
    {n:"Find one person who already took the path you picked",e:45,ph:2}],
  RISK:[
    {n:"Write the failure story — how this dies in 6 months",e:30,ph:1},
    {n:"Set the kill number now, before you're attached",e:20,ph:1},
    {n:"Put one early-warning check on the calendar",e:15,ph:3}],
  EXPERT:[
    {n:"Talk to 3 people who've already done this",e:90,ph:2},
    {n:"Write down every place their story differs from your plan",e:30,ph:2},
    {n:"Rebuild the plan around the overlaps",e:60,ph:3}]
};
const PHASE=["","Set the target","Do the work","Check and adjust"];
let draftPlan=null;

async function combineRoutes(){
  const picked=P.nodes.filter(n=>n.type==="solution"&&n.picked);
  if(!picked.length){ toast("Pick at least one route first"); return; }

  if(AI.on){
    await think("Blending the routes you picked…",300);
    const answers=picked.map(s=>`--- ROUTE ${s.num} (${s.angle}) ---\n${s.html.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim()}`).join("\n\n");
    const raw=await callAI(
`Blend these answers into ONE practical action plan. Merge anything that overlaps — never repeat the same
step twice. Order it so setup comes before execution and checking comes last.

Return one step per line, nothing else, in this exact format:
phase|step|minutes|routeNumber
where phase is 1 (set the target), 2 (do the work) or 3 (check and adjust),
step is a short instruction starting with a verb,
minutes is a realistic whole number,
routeNumber is which route it came from.
Between 5 and 10 steps.`,
      `THE PROBLEM: ${P.seed}\n\n${answers}`, 1200);
    if(raw){
      const rows=raw.split("\n").map(l=>l.trim()).filter(l=>l.includes("|"));
      const parsed=rows.map(l=>{const [ph,n,mins,rn]=l.split("|").map(x=>x.trim());
        const num=parseInt(rn,10);
        const src=picked.find(s=>s.num===num)||picked[0];
        return {ph:Math.min(3,Math.max(1,parseInt(ph,10)||1)), n, e:Math.max(5,parseInt(mins,10)||30),
                num:src.num, from:src.angle, keep:true};
      }).filter(s=>s.n&&s.n.length>3);
      if(parsed.length>=3){
        parsed.sort((a,b)=>a.ph-b.ph);
        draftPlan={routes:picked.map(s=>({num:s.num,angle:s.angle,title:s.title})), steps:parsed};
        drawPlan(); openSheet("planSheet"); return;
      }
    }
  }

  const seen=new Set(), steps=[];
  picked.forEach(s=>{
    (ROUTE_STEPS[s.angle]||[]).forEach(st=>{
      const key=st.n.toLowerCase().slice(0,26);
      if(seen.has(key)) return;                 // overlap between routes gets merged, not repeated
      seen.add(key);
      steps.push({...st, from:s.angle, num:s.num, keep:true});
    });
  });
  steps.sort((a,b)=>a.ph-b.ph);
  draftPlan={routes:picked.map(s=>({num:s.num,angle:s.angle,title:s.title})), steps};
  drawPlan();
  openSheet("planSheet");
}
function drawPlan(){
  const d=draftPlan, keep=d.steps.filter(s=>s.keep);
  const mins=keep.reduce((a,s)=>a+s.e,0);
  $("plnBody").innerHTML=`
    <div style="margin-top:10px;padding:12px;border-radius:12px;background:#141a24;border:1px solid #2b3547">
      <div style="font-size:9.5px;font-weight:900;letter-spacing:.14em;color:#c4b0ff">BLENDED FROM</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
        ${d.routes.map(r=>`<span class="ptag" style="background:rgba(167,139,250,.14);color:#c4b0ff;border-color:rgba(167,139,250,.36)">Route ${r.num} · ${r.angle}</span>`).join("")}
      </div>
      <div style="font-size:12px;color:var(--ink3);margin-top:9px;line-height:1.5">
        ${d.routes.length>1?`Overlapping steps were merged, not repeated. `:``}${keep.length} step${keep.length===1?"":"s"} · about ${Math.round(mins/60*10)/10} hrs of work.
        Your original answers are untouched on the web.</div>
    </div>
    ${[1,2,3].map(ph=>{const g=d.steps.filter(s=>s.ph===ph); if(!g.length) return "";
      return `<div class="slot" style="padding:16px 0 6px">${PHASE[ph]}</div>
      ${g.map((s,i)=>{const idx=d.steps.indexOf(s);
        return `<div class="planrow${s.keep?"":" off"}">
          <div class="pk${s.keep?" on":""}" onclick="togglePlanStep(${idx})">${s.keep?"✓":""}</div>
          <div style="flex:1;min-width:0">
            <textarea class="plname" rows="1" oninput="draftPlan.steps[${idx}].n=this.value;grow(this)">${esc(s.n)}</textarea>
            <div style="font-size:10px;color:var(--ink3);margin-top:3px;letter-spacing:.04em">
              FROM ROUTE ${s.num} · ${s.from} · ~${s.e} min</div>
          </div>
        </div>`;}).join("")}`;}).join("")}
    <div class="btns" style="margin-top:14px">
      <button class="b b-blue" style="width:100%" onclick="openThread(root().id)">💬 Ask about this plan${
        root()&&webQACount(root().id)?` · ${webQACount(root().id)} asked`:``}</button>
    </div>
    <div style="font-size:11.5px;color:var(--ink3);line-height:1.5;margin-top:14px">
      Edit any step, untick what you don't want. Nothing becomes a task until you approve it.</div>`;
  $("plnCount").textContent=`${keep.length} step${keep.length===1?"":"s"}`;
  requestAnimationFrame(()=>$("plnBody").querySelectorAll(".plname").forEach(grow));
}
function grow(el){ el.style.height="auto"; el.style.height=el.scrollHeight+"px"; }
function togglePlanStep(i){ draftPlan.steps[i].keep=!draftPlan.steps[i].keep; drawPlan(); }

/* Where a brand-new task's category comes from: the task it grew out of, then
   the project it's going into, then plain Admin. "projects" used to be hard-coded
   here — it stopped being a real category and left tasks uncategorised. */
function catForNew(src, pid){
  if(src && CATS[src.cat]) return src.cat;
  const p = pid ? projById(pid) : null;
  if(p && CATS[p.cat]) return p.cat;
  const first = pid ? projTasks(pid).find(t=>CATS[t.cat]) : null;
  if(first) return first.cat;
  return "admin";
}
function approvePlan(){
  const keep=draftPlan.steps.filter(s=>s.keep&&s.n.trim());
  if(!keep.length){ toast("Nothing ticked"); return; }
  const src = solveSource && tasks.find(t=>t.id===solveSource.task);
  const pid = solveSource ? solveSource.proj : null;
  const stamp = new Date().toLocaleDateString(undefined,{month:"short",day:"numeric"});
  saveWeb(true);   // save first, so every task below can point back at a real web
  keep.forEach((s,i)=>{
    tasks.push({id:newId(), name:s.n.trim(), cat: catForNew(src, pid),
      from:{web:P.savedId||null, node:(root()||{}).id, seed:P.seed},
      time:String(Math.min(20,9+i)).padStart(2,"0")+":00", est:s.e,
      done:false, routine:false, streak:0, sched:false, makeup:true,
      target:1, unit:"time", count:0, proj:pid,
      notes:`From the combined plan on "${P.seed}".`,
      log:[{d:stamp, t:`Came from Route ${s.num} (${s.from}) in Problem Solver.`}]});
  });
  saveWeb(true);
  closeAll(); render(); renderProjects(); renderCategories();
  const p=pid?projById(pid):null;
  if(p){ openProject(pid); toast(`${keep.length} tasks added to ${p.name}`); }
  else { go("today"); toast(`${keep.length} tasks created — not scheduled yet`); }
}

/* ================= SAVED WEBS, TIED TO THE PROJECT ================= */
let WEBS=[];
function saveWeb(silent){
  if(!P.nodes.length){ toast("Nothing to save yet"); return; }
  const pid = solveSource ? solveSource.proj : null;
  /* P.savedId remembers which saved web this canvas IS, so pressing Save twice
     updates the same one instead of leaving copies behind. */
  const id = (solveSource && solveSource.web) || P.savedId;
  const rec = {
    id: id || "w"+Date.now().toString(36),
    proj: pid, task: solveSource?solveSource.task:null,
    seed: P.seed,
    when: new Date().toLocaleDateString(undefined,{month:"short",day:"numeric"}),
    nodes: JSON.parse(JSON.stringify(P.nodes)),
    nid: P.nid, stage: P.stage
  };
  const at=WEBS.findIndex(w=>w.id===rec.id);
  if(at>-1) WEBS[at]=rec; else WEBS.push(rec);
  if(solveSource) solveSource.web=rec.id;
  P.savedId=rec.id;
  save(); renderProjects(); renderSavedWebs(); renderRail();
  const chip=$("webSave"), txt=$("webSaveTxt");
  if(chip&&txt){ chip.classList.add("saved"); txt.textContent="Saved";
    setTimeout(()=>{chip.classList.remove("saved"); txt.textContent="Save";},2200); }
  if(!silent){ closeAll();
    toast(pid?`Saved to ${projById(pid).name} — reopen it any time from that project`:"Saved to Notes › webs"); }
}
/* The rail. Newest first, the one you're looking at highlighted, and it hides
   itself when there's nothing saved yet so a first-time canvas isn't cluttered. */
let railShut=false, railFresh=false;
function toggleRail(){
  railShut=!railShut;
  $("webRail").classList.toggle("shut", railShut);
  $("railArrow").textContent = railShut ? "›" : "‹";
  try{ sessionStorage.setItem("momentum.rail", railShut?"1":"0"); }catch(e){}
}
/* Save the working web as you go. Without this the rail was empty for anyone who
   built webs but never pressed Save — which turned out to be how the thing is
   actually used. Plans shouldn't need a deliberate save to be findable. */
let _webAuto=null, _webSig="";
function autoSaveWeb(){
  if(!P.nodes.length || !P.seed) return;
  const sig=P.seed+"|"+P.nodes.length+"|"+P.stage+"|"+P.nodes.filter(n=>n.picked).length;
  if(sig===_webSig) return;                    // nothing meaningful changed
  _webSig=sig;
  clearTimeout(_webAuto);
  _webAuto=setTimeout(()=>{ try{ saveWeb(true); }catch(e){} }, 1200);
}

function renderRail(){
  const rail=$("webRail"), inner=$("railInner");
  if(!rail||!inner) return;
  const cur = P.savedId || (solveSource && solveSource.web) || null;
  /* The one on the canvas right now counts as a plan even if it hasn't been
     written to the list yet. */
  const live = P.nodes.length && !WEBS.some(w=>w.id===cur);
  if(!WEBS.length && !live){ rail.style.display="none"; return; }
  rail.style.display="flex";
  inner.innerHTML = `<div class="railttl">Your plans</div>`
    + `<div class="railnew" onclick="resetPlanner()">+ New</div>`
    + (live?`<div class="railitem on">
        <b>${esc((P.seed||"Untitled").slice(0,70))}</b>
        <span>open now · saving…</span></div>`:``)
    + [...WEBS].reverse().map(w=>{
        const pk=(w.nodes||[]).filter(n=>n.picked).length;
        const qs=(w.nodes||[]).filter(n=>n.type==="question").length;
        return `<div class="railitem${w.id===cur?" on":""}" onclick="openWeb('${w.id}')">
          <b>${esc((w.seed||"Untitled").slice(0,70))}</b>
          <span>${esc(w.when||"")} · ${qs}q${pk?` · ${pk} picked`:""}</span>
        </div>`;
      }).join("");
}

/* Opening the Planner drops you back on the last plan you had open, rather than
   a blank canvas you have to go hunting from. */
function resumeLastWeb(){
  if(P.nodes.length || railFresh) return;                       // something already open
  const last = WEBS[WEBS.length-1];
  if(!last) return;
  P={seed:last.seed, nodes:JSON.parse(JSON.stringify(last.nodes)), nid:last.nid,
     stage:last.stage, savedId:last.id};
  solveSource={task:last.task, proj:last.proj, web:last.id};
  const sw=$("startwrap"); if(sw) sw.classList.add("hidden");
  renderStages(); drawWeb(); updateCta(); renderRail(); setTimeout(fitView,80);
}

async function openWeb(id){
  const w=WEBS.find(x=>x.id===id); if(!w){ toast("That web is gone"); return; }
  railFresh=false;
  if(P.nodes.length && P.seed!==w.seed && !await ask("Replace the web you have open?","Replace it")) return;
  P={seed:w.seed, nodes:JSON.parse(JSON.stringify(w.nodes)), nid:w.nid, stage:w.stage, savedId:w.id};
  solveSource={task:w.task, proj:w.proj, web:w.id};
  $("startwrap").classList.add("hidden");
  renderStages(); drawWeb(); updateCta(); renderRail(); go("planner"); setTimeout(fitView,80);
  toast("Reopened: "+w.seed.slice(0,32));
}
const webCount = pid => WEBS.filter(w=>w.proj===pid).length;

/* ================= END-OF-DAY REVIEW & THE WHY LOG ================= */
const REASONS=[
  {r:"Ran out of time",      i:"⏳"},
  {r:"No energy left",       i:"🔋"},
  {r:"Something urgent came up", i:"🚨"},
  {r:"Waiting on someone",   i:"📵"},
  {r:"Didn't feel like it",  i:"😑"},
  {r:"Forgot about it",      i:"🌫"},
  {r:"Too big to start",     i:"🧱"},
  {r:"Wrong time of day",    i:"🕐"},
  {r:"Missing what I need",  i:"🔧"},
  {r:"Wasn't actually important", i:"🤷"}
];
let missLog=[];        // {ymd,label,taskId,name,cat,proj,reason,note,time,missed}
let reviewQ=[], reviewAt=0, reviewDraft={};

const dLabel = d => d.toLocaleDateString(undefined,{month:"short",day:"numeric"});

/* suggestions react to the task itself — time, size, category, how often it's been bumped */
function suggestReasons(t){
  const out=[], hr=+String(t.time||"09:00").split(":")[0];
  const carry=carryover.find(c=>c.name===t.name);
  const missed=(carry?carry.missed:0)+(t.missed||0);
  if(missed>=3) out.push("Too big to start");
  if(hr>=15) out.push("Ran out of time");
  if(hr>=17) out.push("No energy left");
  if(hr<=8) out.push("Wrong time of day");
  if(t.est>=90) out.push("Too big to start");
  if(/call|contact|chase|candidate|va |client|hire/i.test(t.name)) out.push("Waiting on someone");
  if(/order|buy|filament|stakes|print|make/i.test(t.name)) out.push("Missing what I need");
  if(["workout","cardio","movement"].includes(t.cat)) out.push("No energy left");
  if(["clean","fuel"].includes(t.cat)) out.push("Didn't feel like it");
  // whatever they already logged on the day note is the most likely culprit
  dayNote.tags.forEach(tg=>{
    if(/work ran long|traveling/i.test(tg)) out.push("Ran out of time");
    if(/sick|low energy|slept in/i.test(tg)) out.push("No energy left");
    if(/family|something broke/i.test(tg)) out.push("Something urgent came up");
  });
  out.push("Forgot about it","Ran out of time");
  return [...new Set(out)].slice(0,5);
}

function pendingMisses(){
  return tasks.filter(t=>onToday(t) && !t.done && !isCounter(t))
    .concat(tasks.filter(t=>onToday(t) && isCounter(t) && t.count<t.target));
}
function renderNotif(){
  const box=$("notifBox"); if(!box) return;
  const n=pendingMisses().length;
  const doneToday = missLog.some(m=>m.ymd===ymd(new Date()));
  if(!n || doneToday){ box.innerHTML=""; return; }
  /* This card used to sit at the very top of Today all day long. Open the app at
     nine in the morning and the first thing it said was "9 things didn't get
     done today" — pendingMisses() is simply everything not ticked yet, which at
     nine in the morning is the entire day, untouched. It is an end-of-day
     check-in, so it now waits until the end of the day. */
  const hr=new Date().getHours(), due = hr>=prefs.notifHour || prefs.notifHour===0;
  if(!due){ box.innerHTML=""; return; }
  box.innerHTML=`<div class="notif" onclick="startReview()">
    <div class="nicon">🌙</div>
    <div style="flex:1;min-width:0">
      <div class="nk">End of day check-in</div>
      <div class="nm"><b>${n} thing${n>1?"s":""}</b> still open. Want to note why, while it's fresh?</div>
      <div class="nt">Takes a minute · skip it any day you like</div>
    </div>
    <div class="crbtn take" style="background:linear-gradient(180deg,#a78bfa,#7c5cf0);color:#fff">Review</div>
  </div>`;
}

/* Fires only when you tap the button, because "suggest only when I ask" is on.
   Same call as before — just no longer automatic. */
function askReasons(id){
  const t=reviewQ.find(x=>String(x.id)===String(id)); if(!t) return;
  if(aiReasons[t.id]==="pending") return;
  aiReasons[t.id]="pending"; drawReview();
  callAI(`Given a task someone didn't finish today, list the 5 most likely reasons, most likely first.
Each 2-5 words, plain and human. One per line, nothing else.`,
    `Task: ${t.name} (${catOf(t.cat).label}), was set for ${fmtTime(t.time)}, about ${t.est||30} min.
${dayNote.tags.length?"They already noted today: "+dayNote.tags.join(", "):""}
${t.blockedBy?"It is blocked by another task.":""}`, 200)
    .then(r=>{ const list=(r||"").split("\n").map(x=>x.replace(/^[-*\d.)\s]+/,"").trim()).filter(x=>x.length>2&&x.length<40);
      aiReasons[t.id]= list.length>=3 ? list.slice(0,5) : null;
      if(!Array.isArray(aiReasons[t.id])) toast("Couldn't reach AI — sticking with the built-in guesses");
      drawReview(); })
    .catch(()=>{ aiReasons[t.id]=null; toast("Couldn't reach AI"); drawReview(); });
}
function startReview(){
  reviewQ=pendingMisses(); reviewAt=0; reviewDraft={}; aiReasons={};
  if(!reviewQ.length){ toast("Nothing outstanding — good day"); return; }
  $("rvFoot").innerHTML=`<button class="b b-ghost" onclick="reviewStep(-1)">Back</button>
    <button class="b b-violet" onclick="reviewStep(1)">Next</button>`;
  closeAll(); drawReview(); openSheet("reviewSheet");
}
let aiReasons={};
function drawReview(){
  if(reviewAt>=reviewQ.length) return finishReview();
  const t=reviewQ[reviewAt], c=catOf(t.cat);
  const d=reviewDraft[t.id]||{reason:"",note:""};
  const sug=aiReasons[t.id]||suggestReasons(t);
  if(AI.on && !aiReasons[t.id] && !prefs.aiOnAsk){
    aiReasons[t.id]="pending";
    callAI(`Given a task someone didn't finish today, list the 5 most likely reasons, most likely first.
Each 2-5 words, plain and human. One per line, nothing else.`,
      `Task: ${t.name} (${catOf(t.cat).label}), was set for ${fmtTime(t.time)}, about ${t.est||30} min.
${dayNote.tags.length?"They already noted today: "+dayNote.tags.join(", "):""}
${t.blockedBy?"It is blocked by another task.":""}`, 200)
      .then(r=>{ if(r){ const list=r.split("\n").map(x=>x.replace(/^[-*\d.)\s]+/,"").trim()).filter(x=>x.length>2&&x.length<40);
        if(list.length>=3){ aiReasons[t.id]=list.slice(0,5); if(reviewQ[reviewAt]&&reviewQ[reviewAt].id===t.id) drawReview(); } }
        else aiReasons[t.id]=null; })
      .catch(()=>{ aiReasons[t.id]=null; });
  }
  $("rvBody").innerHTML=`
    <div class="rvprog"><i style="width:${Math.round(reviewAt/reviewQ.length*100)}%"></i></div>
    <div style="font-size:10px;font-weight:900;letter-spacing:.14em;color:var(--ink3);margin-top:10px">
      ${reviewAt+1} OF ${reviewQ.length}</div>
    <div style="display:flex;align-items:center;gap:11px;margin-top:9px">
      <div class="icon" style="background:${c.bg};width:40px;height:40px;border-radius:12px;font-size:18px">${c.icon}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:17px;font-weight:750;letter-spacing:-.01em">${esc(t.name)}</div>
        <div style="font-size:10.5px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${c.fg};margin-top:3px">
          ${c.label} · was set for ${fmtTime(t.time)}${isCounter(t)?` · got ${t.count} of ${t.target}`:``}</div>
      </div>
    </div>
    <label class="f">What got in the way — best guess</label>
    <div class="blockers">
      ${(Array.isArray(sug)?sug:suggestReasons(t)).map(r=>{const o=REASONS.find(x=>x.r===r)||{i:"💭"};
        return `<span class="bl${d.reason===r?" on":""}" onclick="pickReason('${t.id}','${r}')">${o.i} ${r}</span>`;}).join("")}
    </div>
    <div style="font-size:11px;color:var(--ink3);margin-top:8px;line-height:1.5">
      Those are guesses based on when it was set, how big it is, and what you already logged today. Pick one or write your own.</div>
    ${AI.on && prefs.aiOnAsk && !Array.isArray(aiReasons[t.id]) ? `<div class="chips" style="margin-top:8px">
      <span class="chip" style="border-color:rgba(167,139,250,.45);color:#c4b0ff"
            onclick="askReasons('${t.id}')">${aiReasons[t.id]==="pending"?"Asking…":"✨ Ask AI for better guesses"}</span>
    </div>`:``}
    <div class="chips" style="margin-top:10px">
      ${REASONS.filter(o=>!(Array.isArray(sug)?sug:[]).includes(o.r)).map(o=>
        `<span class="chip${d.reason===o.r?" on":""}" onclick="pickReason('${t.id}','${o.r}')">${o.i} ${o.r}</span>`).join("")}
    </div>
    <label class="f">In your words</label>
    <textarea class="f" id="rvNote" rows="2" placeholder="Optional — what actually happened">${esc(d.note)}</textarea>`;
}
function pickReason(id,r){
  const d=reviewDraft[id]||{reason:"",note:""};
  d.note=$("rvNote")?$("rvNote").value:d.note;
  d.reason = d.reason===r ? "" : r;
  reviewDraft[id]=d; drawReview();
}
function reviewStep(dir){
  const t=reviewQ[reviewAt];
  if(t){ const d=reviewDraft[t.id]||{reason:"",note:""};
    d.note=$("rvNote")?$("rvNote").value.trim():""; reviewDraft[t.id]=d; }
  reviewAt=Math.max(0,reviewAt+dir);
  drawReview();
}
function finishReview(){
  const d=new Date(), key=ymd(d), lbl=dLabel(d);
  let saved=0;
  reviewQ.forEach(t=>{
    const r=reviewDraft[t.id];
    if(!r||(!r.reason&&!r.note)) return;
    saved++;
    missLog.push({ymd:key,label:lbl,taskId:t.id,name:t.name,cat:t.cat,proj:t.proj||null,
                  time:t.time,reason:r.reason||"Own note",note:r.note||""});
    t.log=t.log||[];
    t.log.unshift({d:lbl,t:`Didn't happen — ${r.reason||""}${r.note?(r.reason?". ":"")+r.note:""}`});
  });
  const obs=dayPattern(reviewQ);
  $("rvBody").innerHTML=`
    <div style="text-align:center;padding:14px 0 4px;font-size:34px">🌙</div>
    <h2 style="text-align:center;margin:0">Logged</h2>
    <p style="text-align:center;font-size:13.5px;color:var(--ink2);line-height:1.55;margin:8px 0 0">
      ${saved} reason${saved===1?"":"s"} saved for ${lbl}. They're on each task and in <b style="color:#c4b0ff">Why Not</b>.</p>
    ${obs?`<div class="obs">${obs}</div>`:``}
    <div class="wk-note" style="padding:14px 0 0">Unfinished tasks still roll into <b>Still Owed</b> tomorrow — this doesn't clear them.</div>`;
  $("rvFoot").innerHTML=`<button class="b b-ghost" onclick="closeAll()">Done</button>
    <button class="b b-violet" onclick="closeAll();go('whynot')">See the log</button>`;
  render(); renderNotif(); renderWhyNot();
}
function dayPattern(list){
  const late=list.filter(t=>+String(t.time||"09:00").split(":")[0]>=15).length;
  if(late>=3 && late/list.length>0.5) return `<b>Pattern:</b> ${late} of these were set for after 3pm. Your afternoons are where things fall apart — worth moving the important ones earlier.`;
  const big=list.filter(t=>t.est>=90).length;
  if(big>=2) return `<b>Pattern:</b> ${big} of these need 90+ minutes. Long tasks keep losing. Try cutting them into 30-minute pieces.`;
  const cats={}; list.forEach(t=>cats[topCatOf(t.cat)]=(cats[topCatOf(t.cat)]||0)+1);
  const top=Object.entries(cats).sort((a,b)=>b[1]-a[1])[0];
  if(top&&top[1]>=3) return `<b>Pattern:</b> ${top[1]} of them were <b>${top[0]}</b>. That whole area is slipping, not just one task.`;
  return "";
}

/* seed a few weeks so the page has something to show */
function seedMissLog(){ /* starts empty — only real misses get logged */ }


/* ---- the Why Not page ---- */
let whyDay=null;
function renderWhyNot(){
  const box=$("wnBody"); if(!box) return;
  const counts={}; missLog.forEach(m=>counts[m.reason]=(counts[m.reason]||0)+1);
  const ranked=Object.entries(counts).sort((a,b)=>b[1]-a[1]);
  const max=ranked.length?ranked[0][1]:1;
  const byDay={}; missLog.forEach(m=>{ (byDay[m.ymd]=byDay[m.ymd]||[]).push(m); });

  // 5-week calendar
  const cells=[]; const today=new Date();
  for(let i=34;i>=0;i--){ const d=new Date(); d.setDate(d.getDate()-i); cells.push(d); }
  const pad='<div style="aspect-ratio:1"></div>'.repeat(cells[0].getDay());
  const grid=cells.map(d=>{
    const k=ymd(d), ms=byDay[k]||[], n=ms.length;
    const col = n===0 ? "" : n===1 ? "background:#ff7a1a;opacity:.35;border-color:transparent"
              : n===2 ? "background:#ff7a1a;opacity:.65;border-color:transparent"
              : "background:#ff4d4d;border-color:#ff4d4d";
    return `<div class="gd${k===ymd(today)?" today":""}${whyDay===k?" sel":""}" style="${col}"
      title="${dLabel(d)} · ${n} missed" onclick="pickWhyDay('${k}')"></div>`;}).join("");

  const worst=[...Object.entries(byDay)].sort((a,b)=>b[1].length-a[1].length)[0];
  const dayList = whyDay ? (byDay[whyDay]||[]) : null;

  box.innerHTML=`
    <div class="card">
      <div class="card-head"><span class="card-title">Last 5 weeks</span><span class="link">${missLog.length} logged</span></div>
      <div class="gdays"><span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span></div>
      <div class="grid">${pad}${grid}</div>
      <div class="tk-legend">
        <span><i style="background:#151b24;border:1px solid #212a36"></i>Clean</span>
        <span><i style="background:#ff7a1a;opacity:.5"></i>1–2 missed</span>
        <span><i style="background:#ff4d4d"></i>3+</span>
      </div>
      <div class="wk-note" style="padding:0 16px 14px">Tap a day to see what slipped and why.</div>
    </div>

    ${dayList?`<div class="card">
      <div class="card-head"><span class="card-title">${dLabel(new Date(whyDay+"T12:00:00"))}</span>
        <span class="link" onclick="pickWhyDay(null)">Clear</span></div>
      ${dayList.length?dayList.map(m=>{const c=catOf(m.cat);
        return `<div class="lg">
          <div class="icon" style="background:${c.bg}">${c.icon}</div>
          <div class="lm"><b>${esc(m.name)}</b><span>${fmtTime(m.time)} · ${c.label}</span></div>
          <div class="whytag">${esc(m.reason)}</div>
        </div>${m.note?`<div class="whynote">"${esc(m.note)}"</div>`:``}`;}).join("")
      :`<div class="empty">Nothing missed that day.</div>`}
    </div>`:``}

    <div class="card">
      <div class="card-head"><span class="card-title">Why things slip</span><span class="link">Ranked</span></div>
      ${ranked.length?ranked.map(([r,n])=>{const o=REASONS.find(x=>x.r===r)||{i:"•"};
        return `<div style="padding:9px 16px">
          <div style="display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600">
            <span>${o.i}</span><span style="flex:1">${esc(r)}</span>
            <b style="font-variant-numeric:tabular-nums;color:#ff9d4d">${n}×</b></div>
          <div class="tk-bar" style="margin:7px 0 0;height:5px"><i style="width:${Math.round(n/max*100)}%;background:linear-gradient(90deg,#ef7d18,#ffa04d)"></i></div>
        </div>`;}).join(""):`<div class="empty">Nothing logged yet.</div>`}
    </div>

    ${ranked.length?`<div class="card">
      <div class="card-head"><span class="card-title">What that tells you</span></div>
      <div style="padding:0 16px 15px">${whyInsights(ranked,byDay,worst)}</div>
    </div>`:``}

    <div class="card"><div class="wk-row" style="padding:14px 16px">
      <button class="b b-violet" onclick="startReview()">Review today now</button>
    </div></div>`;
}
function pickWhyDay(k){ whyDay = (whyDay===k)?null:k; renderWhyNot(); window.scrollTo(0,0); }
function whyInsights(ranked,byDay,worst){
  const out=[];
  const total=missLog.length;
  const top=ranked[0];
  out.push(`<b style="color:#ff9d4d">${top[0]}</b> is your number one, ${Math.round(top[1]/total*100)}% of everything you've missed.`);
  /* Older entries and anything added by hand may have no time on them — don't
     let one stray record take the whole page down. */
  const late=missLog.filter(m=>m.time && +String(m.time).split(":")[0]>=15).length;
  if(late/total>0.45) out.push(`${Math.round(late/total*100)}% of misses were scheduled after 3pm. Your mornings hold, your afternoons don't.`);
  const dows={}; Object.keys(byDay).forEach(k=>{const d=new Date(k+"T12:00:00");dows[DOW[d.getDay()]]=(dows[DOW[d.getDay()]]||0)+byDay[k].length;});
  const wd=Object.entries(dows).sort((a,b)=>b[1]-a[1])[0];
  if(wd) out.push(`<b>${wd[0]}</b> is your worst day — ${wd[1]} missed across the last five weeks.`);
  const cats={}; missLog.forEach(m=>cats[topCatOf(m.cat)]=(cats[topCatOf(m.cat)]||0)+1);
  const tc=Object.entries(cats).sort((a,b)=>b[1]-a[1])[0];
  if(tc) out.push(`Most of it sits in <b>${tc[0]}</b> (${tc[1]}).`);
  const clean=35-Object.keys(byDay).length;
  out.push(`${clean} of the last 35 days had nothing slip.`);
  return out.map(s=>`<div style="font-size:13.5px;line-height:1.6;color:#cbd6e5;padding:5px 0;border-bottom:1px solid var(--line)">• ${s}</div>`).join("");
}

/* ================= CALENDAR + WEEK PLANNING =================
   Same tasks[] as everywhere else. Scheduling only ever writes t.date. */
let weekOffset=0, planDraft=null, calChat=[];
let workHours={start:8,end:16,days:["Mon","Tue","Wed","Thu","Fri"]};   // 8-4 from your Clean Routine
let prefs={notifHour:20, provider:"Claude (Anthropic)", autoRun:false,
           aiOnAsk:true};   // AI keeps quiet until you tap for it
let commitments=[];            // {id, key, label, mins, part}
const PRI_W={Must:300,Should:150,Nice:50};
const priOf = t => t.pri || "Should";

function weekDays(off){
  const d=new Date(); const dow=(d.getDay()+6)%7;            // Monday = 0
  d.setDate(d.getDate()-dow+off*7);
  return Array.from({length:7},(_,i)=>{ const x=new Date(d); x.setDate(d.getDate()+i); return x; });
}
const dayName = d => DOW[d.getDay()];
const isWorkday = d => workHours.days.includes(dayName(d));

function dayTasks(key){ return tasks.filter(t=>!t.routine && t.date===key); }
function dayRoutines(d){ const dow=d?new Date(d+"T12:00:00").getDay():new Date().getDay();
  const key=d||TODAY_KEY;
  return tasks.filter(t=>t.routine && dueOn(t,dow) && !isSkippedOn(t,key)); }
function unscheduled(){ return tasks.filter(t=>!t.routine && !t.date); }
function dayLoad(key){ return dayTasks(key).filter(t=>!t.done).reduce((a,t)=>a+(t.est||30),0); }
function dayCommit(key){ return commitments.filter(c=>c.key===key).reduce((a,c)=>a+c.mins,0); }
function capacity(d){
  const base = isWorkday(d) ? (workHours.end-workHours.start)*60 : 360;  // weekends are shorter, not tiny
  const routines = dayRoutines(ymd(d)).reduce((a,t)=>a+(t.est||0),0);
  return Math.max(60, Math.round((base - routines - dayCommit(ymd(d))) * 0.75));   // 25% buffer for the unexpected
}
const loadPct = d => Math.round(dayLoad(ymd(d))/capacity(d)*100);
const blockers = t => t.blockedBy ? tasks.find(x=>x.id===t.blockedBy) : null;
const blocksWhat = id => tasks.filter(t=>t.blockedBy===id);

/* ---------- the week view ---------- */
function renderCal(){
  const box=$("calBody"); if(!box) return;
  const days=weekDays(weekOffset);
  $("calTitle").textContent = weekOffset===0?"This week":weekOffset===1?"Next week":weekOffset===-1?"Last week":dLabel(days[0]);
  $("calSub").textContent = `${dLabel(days[0])} – ${dLabel(days[6])}`;
  const un=unscheduled();

  box.innerHTML = days.map(d=>{
    const key=ymd(d), ts=dayTasks(key), pct=loadPct(d), cap=capacity(d), load=dayLoad(key);
    const today=key===TODAY_KEY, past=key<TODAY_KEY;
    const com=commitments.filter(c=>c.key===key);
    const tone = pct>100?"#ff6b6b":pct>80?"#ff9d4d":"#12c98a";
    return `<div class="card calday${today?" istoday":""}${past?" past":""}">
      <div class="cd-head">
        <div class="cd-day"><b>${dayName(d)}</b><span>${d.getDate()}</span></div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700">${today?"Today":dLabel(d)}${isWorkday(d)?"":" · off"}</div>
          <div style="font-size:10.5px;color:var(--ink3);margin-top:2px">${ts.filter(t=>!t.done).length} task${ts.filter(t=>!t.done).length===1?"":"s"} · ${load} of ${cap} min</div>
        </div>
        <div class="cd-load"><b style="color:${tone}">${pct}%</b></div>
      </div>
      <div class="tk-bar" style="margin:0 14px 8px;height:5px"><i style="width:${Math.min(100,pct)}%;background:${tone}"></i></div>
      ${com.map(c=>`<div class="commit">🔒 ${esc(c.label)} · ${c.mins} min</div>`).join("")}
      ${ts.length?ts.map(t=>calRow(t,key)).join(""):`<div class="cd-empty">Nothing scheduled</div>`}
      <div class="cd-rout">🔁 ${dayRoutines(key).length} routine${dayRoutines(key).length===1?"":"s"} · ${dayRoutines(key).reduce((a,t)=>a+(t.est||0),0)} min</div>
    </div>`;}).join("")
  + `<div class="card">
      <div class="card-head"><span class="card-title">Unscheduled</span><span class="link">${un.length}</span></div>
      ${un.length?un.map(t=>calRow(t,null)).join(""):`<div class="empty">Everything has a day. Nice.</div>`}
      <div class="wk-note" style="padding:8px 16px 14px">Real tasks with no date yet. Plan My Week will place them for you.</div>
    </div>`;
}
function calRow(t,key){
  const c=catOf(t.cat), p=t.proj?projById(t.proj):null;
  const bl=blockers(t), waiting = bl && !bl.done;
  const overdue = t.due && t.due<TODAY_KEY && !t.done;
  return `<div class="crow${t.done?" done":""}" onclick="calTaskMenu(${t.id})">
    <div class="icon" style="background:${c.bg};width:28px;height:28px;border-radius:8px;font-size:12px">${c.icon}</div>
    <div style="flex:1;min-width:0">
      <div class="cn">${esc(t.name)}</div>
      <div class="cm">${t.est||30}m
        ${p?` · ${p.icon} ${esc(p.name)}`:``}
        ${t.due?` · <span style="color:${overdue?'#ff8f8f':'#ffb26b'}">due ${dLabel(new Date(t.due+"T12:00:00"))}</span>`:``}
        ${waiting?` · <span style="color:#ff8f8f">waits on ${esc(bl.name)}</span>`:``}</div>
    </div>
    <span class="pri p-${priOf(t)}">${priOf(t)}</span>
  </div>`;
}

/* ---------- move / act on one task ---------- */
let calTask=null;
function calTaskMenu(id){
  const t=getTask(id); if(!t) return; calTask=id;
  const days=weekDays(weekOffset), p=t.proj?projById(t.proj):null;
  $("cmBody").innerHTML=`
    <h2 style="font-size:19px">${esc(t.name)}</h2>
    <div style="font-size:11px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;color:${catOf(t.cat).fg};margin-top:3px">
      ${catOf(t.cat).label} · ${priOf(t)} · ${t.est||30} min${t.due?` · due ${dLabel(new Date(t.due+"T12:00:00"))}`:``}</div>
    <label class="f">Move to</label>
    <div class="chips">
      ${days.map(d=>`<span class="chip${t.date===ymd(d)?" on":""}" onclick="moveTask(${id},'${ymd(d)}')">${dayName(d)} ${d.getDate()}</span>`).join("")}
      <span class="chip" onclick="moveTask(${id},null)">Unschedule</span>
    </div>
    <div class="btns">
      <button class="b b-ghost" onclick="pushWeek(${id})">Push a week</button>
      <button class="b ${t.done?'b-ghost':'b-primary'}" onclick="calComplete(${id})">${t.done?"Mark not done":"✓ Complete"}</button>
    </div>
    <div class="btns" style="margin-top:9px">
      ${p?`<button class="b b-blue" onclick="closeAll();openProject('${t.proj}')">Open project</button>`:``}
      <button class="b b-violet" onclick="closeAll();solveTask(${id})">🕸 Problem Solver</button>
    </div>
    <div class="btns" style="margin-top:9px">
      <button class="b b-ghost" style="width:100%" onclick="closeAll();openDetail(${id})">Full task details</button>
    </div>`;
  openSheet("calMenu");
}
/* Only ever writes date + sched. Category, project, notes, Problem Solver links,
   history and dependencies are untouched by design — reschedule can't orphan a task. */
function reschedule(t,key){ t.date=key; t.sched=!!key; }
function moveTask(id,key){
  const t=getTask(id); if(!t) return;
  reschedule(t,key);
  save(); closeAll(); render(); renderCal(); renderProjects();
  toast(key? `${t.name} → ${dLabel(new Date(key+"T12:00:00"))}` : `${t.name} unscheduled`);
}
function pushWeek(id){
  const t=getTask(id); if(!t) return;
  const base=t.date?new Date(t.date+"T12:00:00"):new Date();
  base.setDate(base.getDate()+7); moveTask(id,ymd(base));
}
function calComplete(id){ toggleDone(id); closeAll(); renderCal(); }

/* ================= PLAN MY WEEK ================= */
function planScore(t){
  let s=PRI_W[priOf(t)]||150;
  if(t.due){ const days=Math.round((new Date(t.due+"T12:00:00")-new Date())/864e5);
    s += days<=0?1200 : Math.max(0,900-days*90); }
  const blocks=blocksWhat(t.id).length; if(blocks) s+=350+blocks*60;
  const c=carryover.find(c=>c.name===t.name); if(c) s+=c.missed*25;
  if(["cardio","workout","water","meds","movement","fuel"].includes(t.cat)) s+=60;
  if(t.lastWorked>=14) s+=80;
  return s;
}
function planWeek(){
  const week=weekDays(weekOffset);                       // full Mon–Sun, for the date window
  const days=week.filter(d=>ymd(d)>=TODAY_KEY);          // only days we can still place on
  if(!days.length){ toast("That week's already gone"); return; }
  const lo=ymd(week[0]), hi=ymd(week[6]);
  const pool=tasks.filter(t=>!t.routine && !t.done && isActionable(t) && (!t.date || (t.date>=lo && t.date<=hi)));
  const parked=tasks.filter(t=>!t.routine && !t.done && !isActionable(t) && (!t.date || (t.date>=lo && t.date<=hi)));
  if(!pool.length){ toast("Nothing to place"); return; }

  const room={}; days.forEach(d=>room[ymd(d)]=capacity(d));
  const placed={}, moves=[], warn=[], overflow=[];
  const sorted=[...pool].sort((a,b)=>planScore(b)-planScore(a));

  // dependencies first, so a blocker never lands after the thing it blocks
  const ordered=[];
  const push=t=>{ if(ordered.includes(t)) return;
    const b=blockers(t); if(b && sorted.includes(b)) push(b);
    ordered.push(t); };
  sorted.forEach(push);

  ordered.forEach(t=>{
    const est=t.est||30;
    const b=blockers(t);
    const earliest = b && placed[b.id] ? placed[b.id] : ymd(days[0]);
    const latest = t.due || null;
    let target=null;
    for(const d of days){
      const k=ymd(d);
      if(k<earliest) continue;
      if(b && placed[b.id]===k) continue;             // not the same day as its blocker
      if(latest && k>latest) break;                   // don't sail past a deadline while room exists
      if(room[k]>=est){ target=k; break; }
    }
    if(!target && latest) for(const d of days){       // deadline is tight — take the best day before it anyway
      const k=ymd(d);
      if(k<earliest||k>latest) continue;
      if(!target || room[k]>room[target]) target=k;
    }
    if(!target){                       // the week is full — leave it unscheduled rather than overload a day
      overflow.push(t);
      if(t.date) moves.push({id:t.id,name:t.name,from:t.date,to:null,why:"week is full — back to Unscheduled"});
      return;
    }
    if(latest && target>latest) warn.push(`<b>${esc(t.name)}</b> lands after its ${dLabel(new Date(latest+"T12:00:00"))} deadline. Something has to give.`);
    room[target]-=est; placed[t.id]=target;
    if(t.date!==target) moves.push({id:t.id,name:t.name,from:t.date,to:target,why:planWhy(t,target,b)});
  });

  if(parked.length){
    const names=parked.slice(0,3).map(t=>esc(t.name)).join(", ");
    warn.push(`<b>${parked.length} blocked or waiting</b> — left out until their blockers are done (${names}${parked.length>3?`, +${parked.length-3} more`:``}).`);
  }
  if(overflow.length){
    const mins=overflow.reduce((a,t)=>a+(t.est||30),0);
    const weeks=Math.max(1,Math.round(mins/ (days.reduce((a,d)=>a+capacity(d),0)||1) *10)/10);
    warn.push(`<b>${overflow.length} didn't fit this week</b> — about ${Math.round(mins/60)} hrs, roughly ${weeks} more week${weeks>1?"s":""} of work. They stay in Unscheduled; run this again next week.`);
  }
  planDraft={moves,warn,room,days:days.map(d=>ymd(d))};
  drawPlan_week();
  openSheet("weekPlan");
}
function planWhy(t,key,b){
  const bits=[];
  if(t.due){ const dd=dLabel(new Date(t.due+"T12:00:00"));
    bits.push(key===t.due?`due that day`:`due ${dd}`); }
  if(b) bits.push(`has to follow ${b.name}`);
  const blocks=blocksWhat(t.id); if(blocks.length) bits.push(`${blocks.length} task${blocks.length>1?"s":""} waiting on it`);
  if(priOf(t)==="Must") bits.push("marked Must");
  if(priOf(t)==="Nice"&&!bits.length) bits.push("low priority, so it went where there was room");
  if(!bits.length) bits.push("first day with room for "+(t.est||30)+" min");
  return bits.join(" · ");
}
function drawPlan_week(){
  const d=planDraft;
  $("wpBody").innerHTML=`
    <p style="font-size:13px;color:var(--ink2);line-height:1.55;margin:6px 0 0">
      Deadlines first, then anything blocking other work, then Must, then routines and health, then the rest.
      Days are capped at 75% so there's room for whatever comes up — anything that doesn't fit stays unscheduled rather than
      cramming a day. <b style="color:#fff">Nothing has moved yet.</b></p>
    <div class="loadbars">
      ${d.days.map(k=>{const dt=new Date(k+"T12:00:00"),cap=capacity(dt);
        const used=cap-d.room[k], pct=Math.round(used/cap*100);
        const tone=pct>95?"#ff6b6b":pct>75?"#ff9d4d":"#12c98a";
        return `<div class="lb"><i style="height:${Math.max(4,Math.min(100,pct))}%;background:${tone}"></i>
          <em>${dayName(dt)[0]}</em><small>${pct}%</small></div>`;}).join("")}
    </div>
    ${d.moves.length?`<label class="f">${d.moves.length} change${d.moves.length===1?"":"s"}</label>
      ${d.moves.map((m,i)=>`<div class="mv">
        <div class="pk on" style="cursor:default">✓</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:13.5px;font-weight:650">${esc(m.name)}</div>
          <div style="font-size:11px;color:var(--ink3);margin-top:3px">
            ${m.from?dLabel(new Date(m.from+"T12:00:00")):"Unscheduled"} → <b style="color:#7fb0ff">${dLabel(new Date(m.to+"T12:00:00"))}</b></div>
          <div style="font-size:11px;color:#8d99ab;margin-top:3px;font-style:italic">${m.why}</div>
        </div></div>`).join("")}`
      :`<div class="empty">Everything's already where it should be.</div>`}
    ${d.warn.length?`<div class="obs" style="margin-top:14px">${d.warn.map(w=>`<div style="padding:3px 0">⚠ ${w}</div>`).join("")}</div>`:``}`;
}
function applyPlan(){
  planDraft.moves.forEach(m=>{ const t=tasks.find(x=>x.id===m.id); if(t) reschedule(t,m.to); });
  const n=planDraft.moves.length; planDraft=null; save();
  closeAll(); render(); renderCal(); renderProjects();
  toast(n?`${n} task${n===1?"":"s"} scheduled`:"Nothing to change");
}

/* ================= TALK TO MY CALENDAR ================= */
function calSay(who,html){ calChat.push({who,html}); drawCalChat(); }
function drawCalChat(){
  const c=$("caChat");
  c.innerHTML = calChat.length ? calChat.map(m=>`<div class="bub ${m.who}">${m.who==="you"?esc(m.html):m.html}</div>`).join("")
    : `<div style="font-size:13px;color:var(--ink2);line-height:1.6;padding:6px 0">
        I can see your week, your projects, deadlines, priorities and what depends on what.
        Tell me what changed or ask me why something's where it is.</div>`;
  $("caSug").style.display = calChat.length?"none":"flex";
  c.scrollTop=c.scrollHeight;
}
function openCalAssistant(){ closeAll(); drawCalChat(); openSheet("calAsk"); }
function caSuggest(el){ $("caInput").value=el.textContent; sendCal(); }

async function sendCal(){
  const v=$("caInput").value.trim(); if(!v) return;
  calSay("you",v); $("caInput").value="";
  const r=calBrain(v);
  if(r.draft){ planDraft=r.draft; calSay("ai",r.html); return; }
  const unmatched=/Didn't catch that/.test(r.html);
  if(unmatched && AI.on){
    calSay("ai",`<span class="thinkdot"></span> Thinking…`);
    const a=await callAI(APP_SYSTEM+"\n\nYou are looking at his calendar. You can explain and advise, but you cannot move anything — tell him what to tap instead.\n\nHIS DATA:\n"+appContext(), v, 800);
    calChat.pop();
    calSay("ai", a ? aiBadge()+a : fellBack()+r.html);
    return;
  }
  setTimeout(()=>calSay("ai",r.html),380);
}
function calBrain(text){
  const s=text.toLowerCase(), days=weekDays(weekOffset);
  const tag=(t,c)=>`<span class="vtag" style="background:${c}22;color:${c};border:1px solid ${c}55">${t}</span>`;
  const dayFrom=str=>days.find(d=>str.includes(dayName(d).toLowerCase())||str.includes(d.toLocaleDateString(undefined,{weekday:"long"}).toLowerCase()));

  /* --- questions: answer, change nothing --- */
  if(/^why\b/.test(s)){
    const t=tasks.find(x=>!x.routine&&x.date&&s.includes(x.name.toLowerCase().split(" ")[0]))
          || tasks.filter(x=>!x.routine&&x.date&&!x.done).sort((a,b)=>planScore(b)-planScore(a))[0];
    if(!t) return {html:tag("Answer","#5b9dff")+"<div>Point me at a task by name and I'll explain where it sits.</div>"};
    const b=blockers(t);
    return {html:tag("Answer only — nothing changed","#5b9dff")+
      `<div><b>${esc(t.name)}</b> is on ${t.date?dLabel(new Date(t.date+"T12:00:00")):"no day"} because:</div>
       <ul>${planWhy(t,t.date,b).split(" · ").map(x=>`<li>${x}</li>`).join("")}</ul>
       <div style="margin-top:8px">That day is at ${loadPct(new Date(t.date+"T12:00:00"))}% of capacity.</div>`};
  }
  if(/what should i (focus|do|start|work)|where do i start|what'?s first|most important/.test(s)){
    const top=tasks.filter(t=>!t.routine&&!t.done&&t.date).sort((a,b)=>planScore(b)-planScore(a)).slice(0,3);
    return {html:tag("Answer only — nothing changed","#5b9dff")+
      `<div>In this order:</div><ul>${top.map((t,i)=>{const b=blockers(t);
        return `<li><b>${esc(t.name)}</b> — ${planWhy(t,t.date,b)}${b&&!b.done?` <span style="color:#ff8f8f">(blocked until ${esc(b.name)} is done)</span>`:``}</li>`;}).join("")}</ul>`};
  }
  if(/how (busy|full|loaded)|capacity|too much this week|how'?s my week/.test(s)){
    return {html:tag("Answer only — nothing changed","#5b9dff")+
      `<div>Your week right now:</div><ul>${days.map(d=>{const p=loadPct(d);
        return `<li>${dayName(d)} — <b style="color:${p>100?'#ff8f8f':p>80?'#ffb26b':'#4fd6a5'}">${p}%</b> (${dayLoad(ymd(d))} of ${capacity(d)} min)</li>`;}).join("")}</ul>`};
  }

  /* --- a day is too busy --- */
  if(/too busy|overload|packed|too much on|lighten|slammed/.test(s)){
    const d=dayFrom(s)||days.map(x=>x).sort((a,b)=>loadPct(b)-loadPct(a))[0];
    const key=ymd(d);
    const cands=dayTasks(key).filter(t=>!t.done).sort((a,b)=>planScore(a)-planScore(b));
    const cap=capacity(d); let load=dayLoad(key);
    const moves=[];
    for(const t of cands){
      if(load<=cap*0.85) break;
      const target=days.find(x=>ymd(x)>key && dayLoad(ymd(x))+(t.est||30)<=capacity(x));
      if(!target) continue;
      moves.push({id:t.id,name:t.name,from:key,to:ymd(target),why:`lowest priority on ${dayName(d)} (${priOf(t)})`});
      load-=(t.est||30);
    }
    if(!moves.length) return {html:tag("Nothing to move","#ff9d4d")+
      `<div>${dayName(d)} is at ${loadPct(d)}% but everything on it is either high priority or the rest of the week is just as full. Want me to push something to next week instead?</div>`};
    return {html:tag("Proposed — not applied","#a78bfa")+
      `<div>${dayName(d)} was at <b>${loadPct(d)}%</b>. Moving the ${moves.length} lowest-priority item${moves.length>1?"s":""} brings it to about <b>${Math.round(load/cap*100)}%</b>:</div>
       ${mvList(moves)}${applyBar()}`, draft:{moves,warn:[],days:days.map(ymd)}};
  }

  /* --- a new commitment --- */
  if(/help my|got to|have to|appointment|meeting|busy on|can'?t work|blocked off|forgot/.test(s) && dayFrom(s)){
    const d=dayFrom(s), key=ymd(d);
    const mins=/all day/.test(s)?420:/morning|afternoon|evening/.test(s)?240:120;
    const label=text.replace(/^(i )?(forgot that |forgot |remember )?(i )?/i,"").slice(0,46);
    commitments.push({id:Date.now(),key,label,mins});
    const cap=capacity(d), over=dayLoad(key)-cap;
    const moves=[];
    if(over>0){
      let need=over;
      dayTasks(key).filter(t=>!t.done).sort((a,b)=>planScore(a)-planScore(b)).forEach(t=>{
        if(need<=0) return;
        const target=days.find(x=>ymd(x)>key && dayLoad(ymd(x))+(t.est||30)<=capacity(x));
        if(target){ moves.push({id:t.id,name:t.name,from:key,to:ymd(target),why:`making room for ${label}`}); need-=(t.est||30); }
      });
    }
    renderCal();
    return {html:tag(moves.length?"Proposed — not applied":"Noted","#a78bfa")+
      `<div>Blocked off <b>${esc(label)}</b> on ${dayName(d)} (${mins} min). ${moves.length?`That pushes ${dayName(d)} over, so:`:`${dayName(d)} still fits everything on it.`}</div>
       ${moves.length?mvList(moves)+applyBar():``}`, draft:moves.length?{moves,warn:[],days:days.map(ymd)}:null};
  }

  /* --- dependency: X before Y --- */
  if(/before|after|first|then|depends|blocked/.test(s)){
    // rank by how much of the task name actually appears, not just one shared word
    const scored=tasks.filter(t=>!t.routine).map(t=>{
      const nm=t.name.toLowerCase();
      const w=nm.split(/\s+/).filter(x=>x.length>3);
      const hits=w.filter(x=>s.includes(x));
      if(!hits.length) return null;
      const full=s.includes(nm)?10:0;
      const at=Math.min(...hits.map(x=>s.indexOf(x)));
      return {t, n:hits.length+full, at};
    }).filter(Boolean).sort((a,b)=>b.n-a.n || a.at-b.at);
    const named=scored.map(x=>x.t);
    if(named.length>=2){
      const i=scored.slice(0,2).sort((a,b)=>a.at-b.at);
      let [first,second]=[i[0].t,i[1].t];
      if(/after/.test(s)) [first,second]=[second,first];
      second.blockedBy=first.id;
      const moves=[];
      if(first.date&&second.date&&second.date<=first.date){
        const target=days.find(x=>ymd(x)>first.date);
        if(target) moves.push({id:second.id,name:second.name,from:second.date,to:ymd(target),why:`must follow ${first.name}`});
      }
      renderCal();
      return {html:tag(moves.length?"Proposed — not applied":"Noted","#a78bfa")+
        `<div>Got it — <b>${esc(second.name)}</b> now waits on <b>${esc(first.name)}</b>. I'll never schedule it first again.</div>
         ${moves.length?mvList(moves)+applyBar():`<div style="margin-top:8px">The current order already respects that.</div>`}`,
        draft:moves.length?{moves,warn:[],days:days.map(ymd)}:null};
    }
  }

  /* --- duration change --- */
  if(/take (two|2|three|3) days|will take|needs? (more|longer)|bigger than/.test(s)){
    const t=tasks.filter(x=>!x.routine).find(x=>x.name.toLowerCase().split(/\s+/).filter(w=>w.length>3).some(w=>s.includes(w)));
    if(t){ const old=t.est||30; t.est=Math.max(old*2,180); renderCal();
      return {html:tag("Updated","#12c98a")+
        `<div><b>${esc(t.name)}</b> is now budgeted at ${t.est} min instead of ${old}. ${t.date?`${dayName(new Date(t.date+"T12:00:00"))} is now at ${loadPct(new Date(t.date+"T12:00:00"))}%.`:``}
         Want me to re-plan the week around it?</div>`};
    }
  }

  /* --- protect a routine --- */
  if(/every morning|make sure i (have time|can)|protect|always leave/.test(s)){
    return {html:tag("Noted","#12c98a")+
      `<div>Routines are already protected — they run every day and I subtract their time from each day's capacity before I schedule anything else. Your ${dayRoutines().length} routines take ${dayRoutines().reduce((a,t)=>a+(t.est||0),0)} min a day off the top.</div>`};
  }

  /* --- push a category / low priority out --- */
  if(/next week|push|move.*(personal|health|home|business|nice|low)/.test(s)){
    const catHit=Object.keys(catGroups()).find(c=>s.includes(c.toLowerCase()));
    const cands=tasks.filter(t=>!t.routine&&!t.done&&t.date&&
      (catHit?topCatOf(t.cat)===catHit:priOf(t)==="Nice"));
    if(!cands.length) return {html:tag("Nothing matched","#ff9d4d")+`<div>I couldn't find anything ${catHit?`in ${catHit}`:`marked Nice`} that's scheduled. Try naming the category or task.</div>`};
    const moves=cands.map(t=>{const d=new Date(t.date+"T12:00:00"); d.setDate(d.getDate()+7);
      return {id:t.id,name:t.name,from:t.date,to:ymd(d),why:catHit?`${catHit}, pushed a week`:"marked Nice"};});
    return {html:tag("Proposed — not applied","#a78bfa")+
      `<div>Moving ${moves.length} ${catHit?catHit:"low-priority"} item${moves.length>1?"s":""} out a week:</div>${mvList(moves)}${applyBar()}`,
      draft:{moves,warn:[],days:days.map(ymd)}};
  }

  return {html:tag("Didn't catch that","#8d99ab")+`<div id="calFallback"></div>`+
    `<div>Try things like:</div><ul>
      <li>"Tuesday looks too busy, fix it"</li>
      <li>"I need the routes done before hiring"</li>
      <li>"Why is this on Thursday?"</li>
      <li>"I have to help my dad Wednesday afternoon"</li>
      <li>"Move low priority stuff to next week"</li>
      <li>"What should I focus on first?"</li></ul>`};
}
function mvList(moves){
  return `<div style="margin-top:10px">${moves.map(m=>`<div class="mv" style="border:0;padding:7px 0">
    <div style="flex:1;min-width:0">
      <div style="font-size:13px;font-weight:650">${esc(m.name)}</div>
      <div style="font-size:11px;color:var(--ink3);margin-top:2px">
        ${m.from?dLabel(new Date(m.from+"T12:00:00")):"Unscheduled"} → <b style="color:#7fb0ff">${dLabel(new Date(m.to+"T12:00:00"))}</b> · <i>${m.why}</i></div>
    </div></div>`).join("")}</div>`;
}
function applyBar(){
  return `<div class="btns" style="margin-top:12px">
    <button class="b b-primary" onclick="applyCal()">Apply changes</button>
    <button class="b b-ghost" onclick="adjustCal()">Adjust again</button>
    <button class="b b-danger" onclick="cancelCal()">Cancel</button></div>`;
}
function applyCal(){
  if(!planDraft) return;
  planDraft.moves.forEach(m=>{const t=tasks.find(x=>x.id===m.id); if(t) reschedule(t,m.to);});
  const n=planDraft.moves.length; planDraft=null; save();
  render(); renderCal();
  calSay("ai",`<span class="vtag" style="background:#12c98a22;color:#4fd6a5;border:1px solid #12c98a55">Applied</span><div>${n} change${n===1?"":"s"} made. Your calendar's updated — move anything by hand if I got it wrong.</div>`);
}
function adjustCal(){ planDraft=null; calSay("ai",`<span class="vtag" style="background:#5b9dff22;color:#5b9dff;border:1px solid #5b9dff55">Waiting</span><div>Nothing applied. Tell me what to change about it.</div>`); $("caInput").focus(); }
function cancelCal(){ planDraft=null; calSay("ai",`<span class="vtag" style="background:#8d99ab22;color:#8d99ab;border:1px solid #8d99ab55">Cancelled</span><div>Left everything as it was.</div>`); }

function seedNotes(){ /* your data now, not my samples */ }

function calWeek(d){ weekOffset+=d; renderCal(); window.scrollTo(0,0); }
function seedWeek(){ /* nothing pre-scheduled — use Plan My Week */ }



/* ================= OVERVIEW ================= */
function weekBounds(off){ const d=weekDays(off); return [ymd(d[0]),ymd(d[6])]; }
function completedIn(lo,hi){ return tasks.filter(t=>t.done&&!t.routine&&t.date&&t.date>=lo&&t.date<=hi).length; }
function scheduledIn(lo,hi){ return tasks.filter(t=>!t.routine&&t.date&&t.date>=lo&&t.date<=hi).length; }
const overdue = () => tasks.filter(t=>!t.done&&!t.routine&&t.due&&t.due<TODAY_KEY);

function renderOverview(){
  const box=$("ovBody"); if(!box) return;
  const [lo,hi]=weekBounds(0);
  const done=completedIn(lo,hi), sched=scheduledIn(lo,hi);
  const pct=sched?Math.round(done/sched*100):0;
  const od=overdue(), blocked=tasks.filter(t=>!t.done&&!t.routine&&statusOf(t)==="Blocked");
  const routDue=dayRoutines().length, routKept=dayRoutines().filter(t=>t.done).length;
  const counters=tasks.filter(isCounter);
  const attention=[
    ...od.map(t=>({t,why:`Overdue since ${dLabel(new Date(t.due+"T12:00:00"))}`,tone:"#ff8f8f"})),
    ...carryover.filter(c=>c.missed>=5).map(c=>({t:c,why:`${c.missed} days in Still Owed`,tone:"#ff8f8f"})),
    ...tasks.filter(t=>!t.done&&!t.routine&&t.lastWorked>=14).map(t=>({t,why:`Untouched ${t.lastWorked} days`,tone:"#ffb26b"})),
    ...blocked.map(t=>({t,why:`Blocked by ${(tasks.find(x=>x.id===t.blockedBy)||{}).name||"something"}`,tone:"#ffb26b"}))
  ].slice(0,6);

  box.innerHTML=`
    <div class="card"><div style="padding:13px 16px;display:flex;align-items:center;gap:10px">
      <div style="font-size:17px">${STORE_OK?"💾":"⚠️"}</div>
      <div style="flex:1;font-size:12px;line-height:1.5;color:${STORE_OK?'var(--ink3)':'#ffb26b'}">
        ${STORE_OK?(sync.on&&sync.room?`Saves on this device and syncs with your other devices${sync.lastRun?` (last sync ${whenWords(sync.lastRun)})`:``}.`:"Saves on this device. Turn on sync in Settings to use it on your phone too.")
                  :"Storage is blocked here, so this session runs in memory only — a refresh resets it. Open the file directly in a browser to keep your data."}</div>
      ${STORE_OK?`<div class="crbtn drop" onclick="wipeSaved()" title="Start over">↺</div>`:``}
    </div></div>
    <div class="card">
      <div class="card-head"><span class="card-title">This week</span><span class="link" style="color:${pct>=70?'#4fd6a5':pct>=40?'#ffb26b':'#ff8f8f'}">${pct}%</span></div>
      <div class="tk-bar"><i style="width:${pct}%;background:${pct>=70?'linear-gradient(90deg,#0ea472,#16d494)':'#ff9d4d'}"></i></div>
      <div class="macro">
        <div class="mc"><b style="color:#12c98a">${done}</b><span>Tasks done</span></div>
        <div class="mc"><b style="color:${routKept?'#4fd6a5':'var(--ink2)'}">${routKept}<span style="color:var(--ink3);font-size:11px">/${routDue}</span></b><span>Routines</span></div>
        <div class="mc"><b style="color:${od.length?'#ff8f8f':'var(--ink2)'}">${od.length}</b><span>Overdue</span></div>
        <div class="mc"><b style="color:${carryover.length?'#ffb26b':'var(--ink2)'}">${carryover.length}</b><span>Owed</span></div>
      </div>
    </div>

    ${attention.length?`<div class="card">
      <div class="card-head"><span class="card-title">Needs you</span><span class="link">${attention.length}</span></div>
      ${attention.map(a=>{const c=catOf(a.t.cat);
        return `<div class="lg" onclick="${a.t.id?`openDetail(${a.t.id})`:`go('today')`}">
          <div class="icon" style="background:${c.bg}">${c.icon}</div>
          <div class="lm"><b>${esc(a.t.name)}</b><span style="color:${a.tone}">${a.why}</span></div>
          <div class="crbtn drop">›</div></div>`;}).join("")}
    </div>`:``}

    <div class="card">
      <div class="card-head"><span class="card-title">Active projects</span><span class="link" onclick="go('projects')">All ›</span></div>
      ${PROJECTS.filter(p=>p.status!=="Done").map(p=>{
        const ts=projTasks(p.id), dn=ts.filter(t=>t.done).length, pp=ts.length?Math.round(dn/ts.length*100):0;
        const r=resumeOf("project",p.id);
        return `<div style="padding:2px 0" onclick="openProject('${p.id}')">
          <div class="ipg"><div class="icon" style="background:#141a24">${p.icon}</div>
            <div class="im"><b>${esc(p.name)}</b><span>${dn} of ${ts.length} done${r?` · ${esc(r.text.slice(0,34))}`:``}</span></div>
            <div class="ic">${pp}%</div></div>
          <div class="tk-bar" style="margin:0 16px 10px"><i style="width:${pp}%;background:${pp===100?'#12c98a':'#5b9dff'}"></i></div>
        </div>`;}).join("")}
    </div>

    <div class="card">
      <div class="card-head"><span class="card-title">Health today</span><span class="link" onclick="go('tracker')">Tracker ›</span></div>
      ${counters.map(t=>{const c=catOf(t.cat),pc=Math.round(t.count/t.target*100);
        return `<div class="lg"><div class="icon" style="background:${c.bg}">${c.icon}</div>
          <div class="lm"><b>${esc(t.name)}</b><span>${t.count} of ${t.target} ${unitOf(t)}</span></div>
          <div class="lr"><b style="color:${t.done?'#12c98a':c.fg}">${pc}%</b><span>🔥 ${t.streak}</span></div></div>`;}).join("")}
    </div>

    <div class="card">
      <div class="card-head"><span class="card-title">Routines</span><span class="link" onclick="go('routines')">Manage ›</span></div>
      ${dayRoutines().filter(t=>!isCounter(t)).map(t=>{const c=catOf(t.cat);
        return `<div class="lg"><div class="icon" style="background:${c.bg}">${c.icon}</div>
          <div class="lm"><b>${esc(t.name)}</b><span>${t.freq}</span></div>
          <div class="lr"><b style="color:${t.done?'#12c98a':'var(--ink3)'}">${t.done?"✓":"—"}</b><span>🔥 ${t.streak}</span></div></div>`;}).join("")}
    </div>`;
}

/* ================= TASKS — one master view ================= */
let tf={q:"",cat:"",proj:"",pri:"",status:"",when:""};
/* Which tasks the current filters let through. One place, so the count in the
   header and the rows underneath can never disagree. */
function filteredTasks(){
  let list=tasks.filter(t=>!t.routine);
  if(tf.q){ const q=tf.q.trim().toLowerCase();
    if(q) list=list.filter(t=>(t.name||"").toLowerCase().includes(q)||(t.notes||"").toLowerCase().includes(q)); }
  if(tf.cat) list=list.filter(t=>t.cat===tf.cat);
  /* "No project" is stored as the string "null", but a task that has never been
     given a project usually has no proj key at all — String(undefined) is
     "undefined", so this filter used to return nothing at all. */
  if(tf.proj) list=list.filter(t=> tf.proj==="null" ? !t.proj : String(t.proj)===tf.proj);
  if(tf.pri) list=list.filter(t=>priOf(t)===tf.pri);
  if(tf.status) list=list.filter(t=>statusOf(t)===tf.status);
  if(tf.when==="sched") list=list.filter(t=>!!t.date);
  if(tf.when==="unsched") list=list.filter(t=>!t.date);
  if(tf.when==="overdue") list=list.filter(t=>t.due&&t.due<TODAY_KEY&&!t.done);
  /* A comparator has to return 0 for equal items, or the sort order of tasks
     sharing a date is undefined and the list can reshuffle itself on a repaint. */
  list.sort((a,b)=>{
    if(!!a.done !== !!b.done) return a.done?1:-1;
    const ad=a.date||"9999-99-99", bd=b.date||"9999-99-99";
    if(ad!==bd) return ad<bd?-1:1;
    return (a.time||"").localeCompare(b.time||"") || (a.id-b.id);
  });
  return list;
}
/* Only the results. Typing in the search box repaints this and nothing else —
   rebuilding the whole panel destroyed the input mid-keystroke, so it lost
   focus and you could only ever type one character. */
function renderTaskRows(){
  const box=$("tkList"); if(!box) return;
  const list=filteredTasks();
  const head=$("tkCount"); if(head) head.textContent=`${list.length} task${list.length===1?"":"s"}`;
  box.innerHTML = list.length ? list.map(t=>{
    const c=catOf(t.cat),p=t.proj?projById(t.proj):null,st=statusOf(t);
    const b=t.blockedBy?tasks.find(x=>x.id===t.blockedBy):null;
    if(tkSelMode){
      const on=tkSel.has(t.id);
      return `<div class="lg picking" tabindex="0" role="button" onclick="toggleSel(${t.id})">
        <div class="pick${on?" on":""}">${on?"✓":""}</div>
        <div class="lm"><b style="${t.done?'color:var(--ink3);text-decoration:line-through':''}">${esc(t.name)}</b>
          <span>${p?`${p.icon} ${esc(p.name)} · `:``}${t.date?dLabel(new Date(t.date+"T12:00:00")):"unscheduled"} · ${priOf(t)}</span></div>
      </div>`;
    }
    return `<div class="lg" tabindex="0" role="button" onclick="openDetail(${t.id})">
      <div class="icon" style="background:${c.bg}">${c.icon}</div>
      <div class="lm"><b style="${t.done?'color:var(--ink3);text-decoration:line-through':''}">${esc(t.name)}</b>
        <span>${p?`${p.icon} ${esc(p.name)} · `:``}${t.date?dLabel(new Date(t.date+"T12:00:00")):"unscheduled"}${t.due?` · due ${dLabel(new Date(t.due+"T12:00:00"))}`:``}${b&&!b.done?` · waits on ${esc(b.name)}`:``}</span></div>
      <div style="display:flex;flex-direction:column;gap:4px;align-items:flex-end;flex:none">
        <span class="pri p-${priOf(t)}">${priOf(t)}</span>
        <span class="pri" style="background:${statusTone(st)}22;color:${statusTone(st)};border:1px solid ${statusTone(st)}55">${st}</span>
      </div></div>`;}).join("") : `<div class="empty">Nothing matches those filters.</div>`;
}
function renderTasks(){
  const box=$("tkBody"); if(!box) return;
  const pill=(k,v,l)=>`<span class="chip${tf[k]===v?" on":""}" onclick="setTF('${k}','${v}')">${l}</span>`;
  box.innerHTML=`
    <div class="card"><div class="card-pad">
      <input class="f" id="tkQ" type="search" aria-label="Search tasks" placeholder="Search tasks…" value="${esc(tf.q)}" oninput="tf.q=this.value;renderTaskRows()">
      <div class="chips" style="margin-top:10px">
        ${pill("when","","Any time")}${pill("when","sched","Scheduled")}${pill("when","unsched","Unscheduled")}${pill("when","overdue","Overdue")}
      </div>
      <div class="chips" style="margin-top:6px">
        ${pill("status","","Any status")}${STATUS.map(s=>pill("status",s,s)).join("")}
      </div>
      <div class="chips" style="margin-top:6px">
        ${pill("pri","","Any priority")}${["Must","Should","Nice"].map(s=>pill("pri",s,s)).join("")}
      </div>
      <div class="two" style="margin-top:10px">
        <div><select class="f" aria-label="Filter by category" onchange="tf.cat=this.value;renderTaskRows()">
          <option value="">All categories</option>
          ${Object.entries(CATS).map(([k,v])=>`<option value="${k}"${tf.cat===k?" selected":""}>${v.label}</option>`).join("")}
        </select></div>
        <div><select class="f" aria-label="Filter by project" onchange="tf.proj=this.value;renderTaskRows()">
          <option value="">All projects</option>
          ${PROJECTS.map(p=>`<option value="${p.id}"${tf.proj===p.id?" selected":""}>${p.icon} ${p.name}</option>`).join("")}
          <option value="null"${tf.proj==="null"?" selected":""}>No project</option>
        </select></div>
      </div>
    </div></div>
    <div class="card">
      <div class="card-head"><span class="card-title" id="tkCount"></span>
        <span style="display:flex;gap:14px;align-items:center">
          <span class="link" role="button" tabindex="0" onclick="toggleSelMode()">${tkSelMode?"Done":"Select"}</span>
          <span class="link" role="button" tabindex="0" onclick="clearTF()">Clear filters</span></span></div>
      <div id="tkList"></div>
    </div>`;
  renderTaskRows();
}

/* ---- acting on several tasks at once -------------------------------------
   Forty-one tasks and no way to touch more than one of them meant that putting
   a backlog onto a calendar was forty-one separate trips through the app. */
let tkSelMode=false, tkSel=new Set();
function toggleSelMode(){
  tkSelMode=!tkSelMode;
  if(!tkSelMode) tkSel.clear();
  renderTasks(); paintSelBar();
}
function toggleSel(id){
  if(tkSel.has(id)) tkSel.delete(id); else tkSel.add(id);
  renderTaskRows(); paintSelBar();
}
function selectAllShown(){
  const ids=filteredTasks().map(t=>t.id);
  const allOn=ids.every(i=>tkSel.has(i));
  if(allOn) ids.forEach(i=>tkSel.delete(i)); else ids.forEach(i=>tkSel.add(i));
  renderTaskRows(); paintSelBar();
}
function paintSelBar(){
  const bar=$("tkBar"); if(!bar) return;
  bar.classList.toggle("on", tkSelMode);
  if(!tkSelMode){ bar.innerHTML=""; return; }
  const n=tkSel.size;
  const shownIds=filteredTasks().map(t=>t.id);
  const allOn=shownIds.length && shownIds.every(i=>tkSel.has(i));
  bar.innerHTML=`
    <div class="selhead">
      <span>${n} selected</span>
      <span style="display:flex;gap:14px">
        <span class="link" role="button" tabindex="0" onclick="selectAllShown()">${allOn?"Select none":"Select all "+shownIds.length}</span>
        <span class="link" role="button" tabindex="0" onclick="toggleSelMode()">Done</span>
      </span>
    </div>
    <div class="selrow">
      <span class="chip" onclick="bulkDate('today')">Today</span>
      <span class="chip" onclick="bulkDate('tomorrow')">Tomorrow</span>
      <span class="chip" onclick="bulkPickDay()">Pick a day…</span>
      <span class="chip" onclick="bulkDate(null)">Unschedule</span>
      <span class="chip" onclick="bulkPri('Must')">Must</span>
      <span class="chip" onclick="bulkPri('Should')">Should</span>
      <span class="chip" onclick="bulkPri('Nice')">Nice</span>
      <span class="chip" onclick="bulkProject()">Project…</span>
      <span class="chip" onclick="bulkComplete()">✓ Complete</span>
      <span class="chip" style="color:#ff8f8f;border-color:#5a2b2b" onclick="bulkDelete()">Delete</span>
    </div>
    <input type="date" id="tkBulkDate" style="display:none" onchange="bulkDate(this.value)">`;
}
const selTasks = () => tasks.filter(t=>tkSel.has(t.id));
function needSel(){ if(!tkSel.size){ toast("Pick a few tasks first"); return true; } return false; }
function afterBulk(msg, undo){
  save(); renderTasks(); paintSelBar(); render(); renderCal(); renderProjects();
  toastUndo(msg, ()=>{ undo(); save(); renderTasks(); paintSelBar(); render(); renderCal(); renderProjects(); });
}
function bulkDate(kind){
  if(needSel()) return;
  refreshToday();
  const key = kind===null ? null : kind==="today" ? TODAY_KEY : kind==="tomorrow" ? offsetDay(1) : kind;
  const list=selTasks().filter(t=>!t.routine);
  if(!list.length){ toast("Routines repeat on a frequency — they can't be given a single day"); return; }
  const snap=list.map(t=>({t, date:t.date??null, sched:t.sched}));
  list.forEach(t=>{ t.date=key; t.sched=!!key; });
  afterBulk(`${list.length} task${list.length===1?"":"s"} ${key?("moved to "+(key===TODAY_KEY?"today":dLabel(new Date(key+"T12:00:00")))):"unscheduled"}`,
    ()=>snap.forEach(s=>{ s.t.date=s.date; s.t.sched=s.sched; }));
}
function bulkPickDay(){
  if(needSel()) return;
  const el=$("tkBulkDate"); if(!el) return;
  el.style.display="block";
  try{ el.showPicker(); }catch(e){ el.focus(); }
}
function bulkPri(p){
  if(needSel()) return;
  const list=selTasks(); const snap=list.map(t=>({t, pri:t.pri}));
  list.forEach(t=>t.pri=p);
  afterBulk(`${list.length} set to ${p}`, ()=>snap.forEach(s=>s.t.pri=s.pri));
}
async function bulkProject(){
  if(needSel()) return;
  const names=PROJECTS.map((p,i)=>`${i+1}. ${p.name}`).join("\n");
  const ans=await askText(`Which project? Type a number, or 0 for no project.\n\n${names}`,"e.g. 2");
  if(ans===null) return;
  const n=parseInt(String(ans).trim(),10);
  if(isNaN(n) || n<0 || n>PROJECTS.length){ toast("Didn't recognise that one"); return; }
  const pid = n===0 ? null : PROJECTS[n-1].id;
  const list=selTasks(); const snap=list.map(t=>({t, proj:t.proj??null}));
  list.forEach(t=>t.proj=pid);
  afterBulk(`${list.length} moved to ${pid?projById(pid).name:"no project"}`, ()=>snap.forEach(s=>s.t.proj=s.proj));
}
function bulkComplete(){
  if(needSel()) return;
  const list=selTasks().filter(t=>!t.done);
  if(!list.length){ toast("Those are all done already"); return; }
  const snap=list.map(t=>({t, done:t.done, streak:t.streak}));
  list.forEach(t=>{ t.done=true; if(t.routine) t.streak=(t.streak||0)+1; });
  afterBulk(`${list.length} marked done`, ()=>snap.forEach(s=>{ s.t.done=s.done; s.t.streak=s.streak; }));
}
async function bulkDelete(){
  if(needSel()) return;
  const list=selTasks();
  if(!await ask(`Delete ${list.length} task${list.length===1?"":"s"}?\n\nYou'll get an undo button for a few seconds.`,"Delete them",1)) return;
  const snap=list.map(t=>JSON.parse(JSON.stringify(t)));
  const hist={}; snap.forEach(s=>{ if(history[s.id]){ hist[s.id]=history[s.id]; delete history[s.id]; } });
  const ids=new Set(list.map(t=>t.id));
  const freed=tasks.filter(t=>ids.has(t.blockedBy)); freed.forEach(t=>t.blockedBy=null);
  tasks=tasks.filter(t=>!ids.has(t.id));
  tkSel.clear();
  afterBulk(`${snap.length} deleted`, ()=>{
    snap.forEach(s=>tasks.push(s));
    Object.keys(hist).forEach(k=>history[k]=hist[k]);
    freed.forEach(t=>{ const m=snap.find(s=>ids.has(s.id)); if(m) t.blockedBy=m.id; });
  });
}
/* Chips repaint the whole panel so their selected state updates; the search box
   keeps whatever you have typed because it is re-rendered from tf.q. */
function setTF(k,v){ tf[k]=v; renderTasks(); }
function clearTF(){ tf={q:"",cat:"",proj:"",pri:"",status:"",when:""}; renderTasks(); }

/* ================= ROUTINES ================= */
function nextDue(t){
  if(t.paused) return "Paused";
  const map={"Every day":[0,1,2,3,4,5,6],"Weekdays":[1,2,3,4,5],"Weekends":[0,6],"Mon/Wed/Fri":[1,3,5],
    "Mon/Wed":[1,3],"Tue/Thu":[2,4],"Mondays":[1],"Tuesdays":[2],"Wednesdays":[3],"Thursdays":[4],
    "Fridays":[5],"Saturdays":[6],"Sundays":[0]};
  const days=map[t.freq]||[0,1,2,3,4,5,6];
  if(days.includes(new Date().getDay())&&!t.done) return "Today";
  for(let i=1;i<=7;i++){ const d=new Date(); d.setDate(d.getDate()+i);
    if(days.includes(d.getDay())) return i===1?"Tomorrow":DOW[d.getDay()]; }
  return "—";
}
function renderRoutines(){
  const box=$("rtBody"); if(!box) return;
  const rs=tasks.filter(t=>t.routine);
  box.innerHTML=`
    <div class="card">
      <div class="card-head"><span class="card-title">All routines</span><span class="link">${rs.filter(t=>!t.paused).length} active</span></div>
      ${rs.map(t=>{const c=catOf(t.cat),h=history[t.id]||[];
        const hit=h.filter(x=>x.v>=(t.target||1)).length;
        return `<div style="padding:11px 16px;position:relative;border-top:1px solid var(--line)">
          <div style="display:flex;align-items:center;gap:11px">
            <div class="icon" style="background:${c.bg};opacity:${t.paused?.4:1}">${c.icon}</div>
            <div style="flex:1;min-width:0">
              <div style="font-size:14.5px;font-weight:700;${t.paused?'color:var(--ink3)':''}">${esc(t.name)}</div>
              <div style="font-size:11px;color:var(--ink3);margin-top:3px">${isSkippedToday(t)?`<span style="color:#ffb26b">Skipped today</span> · `:``}${t.freq} · next ${nextDue(t)}${isCounter(t)?` · ${t.target} ${unitOf(t)} a day`:``}</div>
            </div>
            <div style="text-align:right;flex:none">
              <div style="font-size:13px;font-weight:800;color:${t.paused?'var(--ink3)':'#ff9d4d'}">🔥 ${t.streak}</div>
              ${h.length?`<div style="font-size:9px;color:var(--ink3);letter-spacing:.06em;margin-top:2px">${hit}/${h.length} DAYS</div>`:``}
            </div>
          </div>
          ${isCounter(t)?`<div style="display:flex;gap:3px;margin-top:9px">${(h.slice(-21)).map(x=>{
            const f=x.v/t.target;
            return `<div style="flex:1;height:16px;border-radius:3px;background:${f>=1?c.fg:f>0?c.fg:'#1a212c'};opacity:${f>=1?1:f>0?.4:1}"></div>`;}).join("")}</div>`:``}
          <div style="display:flex;gap:7px;margin-top:10px">
            ${t.paused?``:`<div class="crbtn take" style="background:#1e2734;color:#ffb26b;border:1px solid #2c374a" onclick="skipToday(${t.id})">${isSkippedToday(t)?"Put back":"Not today"}</div>`}
            <div class="crbtn take" style="background:#1e2734;color:${t.paused?'#4fd6a5':'var(--ink2)'};border:1px solid #2c374a" onclick="pauseRoutine(${t.id})">${t.paused?"Resume":"Pause"}</div>
            <div class="crbtn take" style="background:#1e2734;color:#7fb0ff;border:1px solid #2c374a" onclick="openRoutineEdit(${t.id})">Edit</div>
            <div class="crbtn drop" onclick="delRoutine(${t.id})">✕</div>
          </div>
        </div>`;}).join("")}
      <div class="wk-row"><button class="b b-blue" onclick="openAdd(true)">+ New routine</button></div>
    </div>
    <div class="wk-note" style="padding:0 4px">Routines land on Today automatically on the days they're due. Pausing keeps the history but stops it appearing.</div>`;
}
function pauseRoutine(id){ const t=getTask(id); if(!t) return; t.paused=!t.paused;
  save(); render(); renderRoutines(); renderOverview(); toast(t.paused?"Paused: "+t.name:"Back on: "+t.name); }
async function delRoutine(id){ const t=getTask(id); if(!t) return;
  if(!await ask(`Delete ${t.name}? Its ${(history[id]||[]).length} days of history go too.\n\nYou'll get an undo button either way.`,"Delete it",1)) return;
  const snap=JSON.parse(JSON.stringify(t)), hist=history[id];
  const freed=tasks.filter(x=>x.blockedBy===id); freed.forEach(x=>x.blockedBy=null);
  tasks=tasks.filter(x=>x.id!==id); delete history[id];
  save(); render(); renderRoutines(); renderTracker();
  toastUndo("Deleted: "+t.name, ()=>{ tasks.push(snap); history[snap.id]=hist;
    freed.forEach(x=>x.blockedBy=id); render(); renderRoutines(); renderTracker(); }); }

/* ================= NOTES ================= */
let nf="all";
function noteLabel(n){
  if(n.kind==="project"){const p=projById(n.ref); return p?`${p.icon} ${p.name}`:"Project";}
  if(n.kind==="task"){const t=tasks.find(x=>String(x.id)===String(n.ref)); return t?`✓ ${t.name}`:"Task";}
  if(n.kind==="web"){const w=WEBS.find(x=>x.id===n.ref); return w?`🕸 ${w.seed.slice(0,28)}`:"Problem Solver";}
  return "Standalone";
}
function renderNotes(){
  const box=$("ntBody"); if(!box) return;
  let list=notes;
  if(nf!=="all") list=notes.filter(n=>n.kind===nf);
  const pill=(v,l)=>`<span class="chip${nf===v?" on":""}" onclick="nf='${v}';renderNotes()">${l}</span>`;
  box.innerHTML=`
    <div class="card"><div class="card-pad">
      <div class="chips">${pill("all","Everything")}${pill("project","Projects")}${pill("task","Tasks")}${pill("web","Problem Solver")}${pill("free","Standalone")}</div>
      <button class="b b-blue" style="width:100%;margin-top:12px" onclick="openNoteEditor()">+ New note</button>
    </div></div>
    <div class="card">
      <div class="card-head"><span class="card-title">${list.length} note${list.length===1?"":"s"}</span></div>
      ${list.length?list.map(n=>`<div class="lg" onclick="openNoteEditor(${n.id})" style="align-items:flex-start">
        <div class="icon" style="background:#141a24;margin-top:2px">${n.pin?"📌":"📝"}</div>
        <div class="lm"><b style="font-weight:600;font-size:13.5px;white-space:normal;line-height:1.5">${esc(n.text)}</b>
          <span style="margin-top:5px">${n.when} · ${esc(noteLabel(n))}${n.pin?" · RESUME POINT":""}</span></div>
        <div class="crbtn drop">›</div></div>`).join(""):`<div class="empty">No notes yet. They're where you leave yourself the context you'll need later.</div>`}
    </div>`;
}
let editingNote=null;
function openNoteEditor(id,kind,ref){
  editingNote=id||null;
  if(id && !notes.find(x=>x.id===id)){ toast("That note is gone"); renderNotes(); return; }
  const n=id?notes.find(x=>x.id===id):{text:"",kind:kind||"free",ref:ref||null,pin:false};
  $("neTitle").textContent=id?"Edit note":"New note";
  $("neText").value=n.text;
  $("nePin").classList.toggle("on",!!n.pin);
  const opts=[["free","Standalone",null],
    ...PROJECTS.map(p=>["project",`${p.icon} ${p.name}`,p.id]),
    ...tasks.filter(t=>!t.routine).map(t=>["task",`✓ ${t.name}`,t.id]),
    ...WEBS.map(w=>["web",`🕸 ${w.seed.slice(0,30)}`,w.id])];
  $("neAttach").innerHTML=opts.map(([k,l,r])=>
    `<option value="${k}|${r}"${(n.kind===k&&String(n.ref)===String(r))?" selected":""}>${esc(l)}</option>`).join("");
  $("neDel").style.display=id?"flex":"none";
  openSheet("noteSheet"); setTimeout(()=>$("neText").focus(),320);
}
function saveNote(){
  const txt=$("neText").value.trim();
  if(!txt){ toast("Write something first"); return; }
  const [kind,ref]=$("neAttach").value.split("|");
  const pin=$("nePin").classList.contains("on");
  const r=ref==="null"?null:ref;
  if(pin) notes.filter(n=>n.kind===kind&&String(n.ref)===String(r)&&n.id!==editingNote).forEach(n=>n.pin=false);
  if(editingNote){ const n=notes.find(x=>x.id===editingNote); Object.assign(n,{text:txt,kind,ref:r,pin}); }
  else noteAdd(txt,kind,r,pin);
  save(); closeAll(); renderNotes(); renderProjects(); renderOverview(); toast(pin?"Saved as your resume point":"Note saved");
}
function delNote(){
  const snap=notes.find(n=>n.id===editingNote); if(!snap){ closeAll(); return; }
  notes=notes.filter(n=>n.id!==editingNote);
  save(); closeAll(); renderNotes();
  toastUndo("Note deleted", ()=>{ notes.unshift(snap); renderNotes(); }); }

/* quick Resume Here from a task or project */
let resumeCtx=null;
function openResume(kind,ref,name){
  resumeCtx={kind,ref};
  const r=resumeOf(kind,ref);
  $("rsTitle").textContent="Where you left off";
  $("rsWhat").textContent=name;
  $("rsText").value=r?r.text:"";
  closeAll(); openSheet("resumeSheet"); setTimeout(()=>$("rsText").focus(),320);
}
function saveResume(){
  setResume(resumeCtx.kind,resumeCtx.ref,$("rsText").value);
  closeAll(); render(); renderProjects(); renderNotes(); renderOverview();
  if(resumeCtx.kind==="project") openProject(resumeCtx.ref);
  toast("Resume point saved");
}
function resumeBanner(kind,ref){
  const r=resumeOf(kind,ref); if(!r) return "";
  return `<div class="resume"><div class="rk">📌 Pick up here</div><div class="rt">${esc(r.text)}</div>
    <div class="rw">saved ${r.when}</div></div>`;
}

/* ================= PROGRESS ================= */
function renderProgress(){
  const box=$("pgBody"); if(!box) return;
  const [lo,hi]=weekBounds(0), [plo,phi]=weekBounds(-1);
  const dNow=completedIn(lo,hi), dPrev=completedIn(plo,phi);
  const sNow=scheduledIn(lo,hi)||1, sPrev=scheduledIn(plo,phi)||1;
  const pNow=Math.round(dNow/sNow*100), pPrev=Math.round(dPrev/sPrev*100);
  const delta=dNow-dPrev;
  const rs=tasks.filter(t=>t.routine&&!t.paused);
  const cats={}; tasks.filter(t=>!t.routine&&t.done).forEach(t=>{const k=topCatOf(t.cat);cats[k]=(cats[k]||0)+1;});
  const catMax=Math.max(...Object.values(cats),1);
  const postponed=[...carryover].sort((a,b)=>b.missed-a.missed).slice(0,5);
  const advanced=PROJECTS.map(p=>({p,dn:projDone(p.id),tot:projTasks(p.id).length})).filter(x=>x.dn>0);

  box.innerHTML=`
    <div class="card">
      <div class="card-head"><span class="card-title">This week vs last</span>
        <span class="link" style="color:${delta>=0?'#4fd6a5':'#ff8f8f'}">${delta>=0?"+":""}${delta}</span></div>
      <div style="display:flex;gap:10px;padding:0 16px 14px">
        <div class="wkcol"><div class="wkbar"><i style="height:${Math.min(100,pPrev)}%;background:#3b4554"></i></div>
          <b>${dPrev}</b><span>Last week</span><em>${pPrev}%</em></div>
        <div class="wkcol"><div class="wkbar"><i style="height:${Math.min(100,pNow)}%;background:linear-gradient(180deg,#16d494,#0ea472)"></i></div>
          <b style="color:#4fd6a5">${dNow}</b><span>This week</span><em>${pNow}%</em></div>
      </div>
      <!-- With nothing scheduled either week this used to read "Level with last
           week", which sounds like a result. It isn't one — there's no data. -->
      <div class="wk-note" style="padding:0 16px 14px">${
        (scheduledIn(lo,hi)===0 && scheduledIn(plo,phi)===0)
          ? `No one-time tasks had a date either week, so there's nothing to compare yet. Routines are counted below. Give a task a day and this fills in.`
          : delta>0?`Up ${delta} on last week.`:delta<0?`Down ${Math.abs(delta)} on last week.`:`Level with last week.`}</div>
    </div>

    <div class="card">
      <div class="card-head"><span class="card-title">Routine consistency</span></div>
      ${rs.map(t=>{const h=history[t.id]||[];const hit=h.filter(x=>x.v>=(t.target||1)).length;
        const pc=h.length?Math.round(hit/h.length*100):0;const c=catOf(t.cat);
        return `<div style="padding:9px 16px">
          <div style="display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600">
            <span>${c.icon}</span><span style="flex:1">${esc(t.name)}</span>
            <b style="color:${pc>=70?'#4fd6a5':pc>=40?'#ffb26b':'#ff8f8f'}">${pc}%</b></div>
          <div class="tk-bar" style="margin:7px 0 0;height:5px"><i style="width:${pc}%;background:${c.fg}"></i></div>
        </div>`;}).join("")}
    </div>

    ${advanced.length?`<div class="card">
      <div class="card-head"><span class="card-title">Projects moved</span></div>
      ${advanced.map(x=>`<div style="padding:9px 16px">
        <div style="display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600">
          <span>${x.p.icon}</span><span style="flex:1">${esc(x.p.name)}</span>
          <b style="color:#5b9dff">${x.dn}/${x.tot}</b></div>
        <div class="tk-bar" style="margin:7px 0 0;height:5px"><i style="width:${Math.round(x.dn/x.tot*100)}%;background:#5b9dff"></i></div>
      </div>`).join("")}
    </div>`:``}

    ${postponed.length?`<div class="card">
      <div class="card-head"><span class="card-title">Most postponed</span></div>
      ${postponed.map(c=>{const cc=catOf(c.cat);
        return `<div class="lg"><div class="icon" style="background:${cc.bg}">${cc.icon}</div>
          <div class="lm"><b>${esc(c.name)}</b><span>${cc.label}</span></div>
          <div class="whytag">${c.missed}× bumped</div></div>`;}).join("")}
    </div>`:``}

    <div class="card">
      <div class="card-head"><span class="card-title">Where the work went</span></div>
      ${Object.entries(cats).sort((a,b)=>b[1]-a[1]).map(([k,v])=>{const g=catGroups()[k]||{fg:"#8d99ab"};
        return `<div style="padding:9px 16px">
          <div style="display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:600">
            <span style="flex:1">${k}</span><b style="color:${g.fg}">${v}</b></div>
          <div class="tk-bar" style="margin:7px 0 0;height:5px"><i style="width:${Math.round(v/catMax*100)}%;background:${g.fg}"></i></div>
        </div>`;}).join("")||`<div class="empty">Nothing completed yet.</div>`}
    </div>

    <div class="card"><div class="wk-row" style="padding:14px 16px">
      <button class="b b-violet" onclick="weeklyReview()">🤖 Weekly AI review</button>
    </div></div>`;
}

/* ================= WEEKLY AI REVIEW — closes the loop ================= */
async function weeklyReview(){
  const [lo,hi]=weekBounds(0);
  const done=tasks.filter(t=>t.done&&!t.routine&&t.date>=lo&&t.date<=hi);
  const missed=tasks.filter(t=>!t.done&&!t.routine&&t.date&&t.date>=lo&&t.date<TODAY_KEY);
  const blocked=tasks.filter(t=>!t.done&&!t.routine&&statusOf(t)==="Blocked");
  const waiting=tasks.filter(t=>!t.done&&!t.routine&&statusOf(t)==="Waiting");
  const postponed=[...carryover].sort((a,b)=>b.missed-a.missed).slice(0,3);
  const moved=PROJECTS.filter(p=>projTasks(p.id).some(t=>t.done));
  const reasons={}; missLog.filter(m=>m.ymd>=lo).forEach(m=>reasons[m.reason]=(reasons[m.reason]||0)+1);
  const topReason=Object.entries(reasons).sort((a,b)=>b[1]-a[1])[0];
  const next=tasks.filter(t=>!t.done&&!t.routine&&isActionable(t)).sort((a,b)=>planScore(b)-planScore(a)).slice(0,5);
  const keptToday=dayRoutines().filter(t=>t.done).length;

  $("wrBody").innerHTML=`
    <p style="font-size:13px;color:var(--ink2);line-height:1.55;margin:6px 0 0">
      Week of ${dLabel(new Date(lo+"T12:00:00"))}. <b style="color:#fff">Nothing changes until you approve.</b></p>
    <div class="macro" style="padding:14px 0 4px">
      <div class="mc"><b style="color:#12c98a">${done.length}</b><span>Done</span></div>
      <div class="mc"><b style="color:#ff8f8f">${missed.length}</b><span>Missed</span></div>
      <div class="mc"><b style="color:#ffb26b">${blocked.length+waiting.length}</b><span>Stuck</span></div>
      <div class="mc"><b style="color:#5b9dff">${moved.length}</b><span>Projects moved</span></div>
    </div>
    <label class="f">What I see</label>
    <div class="ansbox" id="wrSee">
      <ul>
        <li>You finished <b>${done.length}</b> task${done.length===1?"":"s"}${moved.length?` across ${moved.length} project${moved.length===1?"":"s"}`:``}${
          keptToday?`, and kept <b>${keptToday}</b> of your ${dayRoutines().length} routines today`:``}.</li>
        ${missed.length?`<li><b>${missed.length}</b> slipped past their day.${topReason?` Most common reason: <b>${topReason[0]}</b> (${topReason[1]}×).`:``}</li>`:``}
        ${blocked.length?`<li><b>${blocked.length}</b> ${blocked.length===1?"task is":"tasks are"} blocked — I won't schedule ${blocked.length===1?"it":"them"} until the blocker's done.</li>`:``}
        ${postponed.length?`<li>Longest running: <b>${esc(postponed[0].name)}</b>, bumped ${postponed[0].missed} times. Worth cutting it down or dropping it.</li>`:``}
      </ul>
    </div>
    <label class="f">What I'd do next week</label>
    <div class="ansbox"><ul>
      ${next.map((t,i)=>`<li><b>${i+1}. ${esc(t.name)}</b> — ${planWhy(t,t.date,blockers(t))}</li>`).join("")}
    </ul></div>
    ${blocked.length?`<div class="obs" style="margin-top:12px"><b>Blocked first:</b> ${blocked.slice(0,3).map(t=>esc((tasks.find(x=>x.id===t.blockedBy)||{}).name||"?")).join(", ")} — those unlock the rest.</div>`:``}
    <div class="wk-note" style="padding-top:14px">Approving runs Plan My Week on next week using this ordering. You can move anything by hand afterwards.</div>`;
  openSheet("weekReview");
  if(AI.on){
    const a=await callAI(APP_SYSTEM+`\n\nYou are reviewing his week. Be specific and a bit blunt — name real tasks
and projects. Say what actually moved, what didn't and why, and what that pattern suggests. 4-6 bullets.`,
      `Week of ${lo}. Finished: ${done.map(t=>t.name).join(", ")||"nothing"}.
Missed: ${missed.map(t=>t.name).join(", ")||"nothing"}.
Blocked: ${blocked.map(t=>t.name).join(", ")||"none"}.
Reasons logged this week: ${Object.entries(reasons).map(([r,n])=>r+" x"+n).join(", ")||"none"}.
\n${appContext()}`, 900);
    if(a && $("wrSee")) $("wrSee").innerHTML=aiBadge()+a;
  }
}
function applyReview(){ closeAll(); weekOffset=1; go("calendar"); setTimeout(()=>planWeek(),260); }

async function parkIdea(){
  const t=await askText("What idea do you want to park?","e.g. sync between my phone and laptop");
  if(t){ v2Add(t); renderV2(); toast("Parked for V2"); }
}
function renderV2(){
  const box=$("v2Body"); if(!box) return;
  box.innerHTML=`
    <div class="card"><div class="card-pad">
      <div style="font-size:13.5px;line-height:1.6;color:var(--ink2)">
        Things worth building that <b style="color:#fff">aren't needed for V1 to work</b>. Parked here instead of
        bloating the app before you've actually used it.</div>
    </div></div>
    <div class="card">
      <div class="card-head"><span class="card-title">Parked</span><span class="link">${V2.length}</span></div>
      ${V2.map((v,i)=>`<div class="lg" style="align-items:flex-start">
        <div class="icon" style="background:#141a24;margin-top:2px">💡</div>
        <div class="lm"><b style="white-space:normal;line-height:1.4">${esc(v.t)}</b>
          <span style="white-space:normal;line-height:1.5;margin-top:4px">${esc(v.w)}</span></div>
        <div class="crbtn drop" onclick="V2.splice(${i},1);save();renderV2()">✕</div></div>`).join("")}
      <div class="wk-row"><button class="b b-ghost" onclick="parkIdea()">+ Park an idea</button></div>
    </div>
    <div class="card"><div class="card-pad">
      <div style="font-size:11px;font-weight:800;letter-spacing:.14em;color:var(--ink3);text-transform:uppercase">V1 priorities, in order</div>
      <div style="font-size:13.5px;line-height:1.8;color:#cbd6e5;margin-top:9px">
        1. Reliability<br>2. Data saving<br>3. Clean connections between what exists<br>4. Real AI<br>5. Usability</div>
    </div></div>`;
}

/* ================= SETTINGS ================= */
function lastSavedLabel(){
  if(!STORE_OK) return "not saving";
  try{ const b=JSON.parse(window.localStorage.getItem(SAVE_KEY)||"{}");
    if(!b._at) return "not yet";
    const m=Math.round((Date.now()-b._at)/60000);
    return m<1?"just now":m<60?m+" min ago":Math.round(m/60)+" hr ago";
  }catch(e){ return "unknown"; }
}
function renderSettings(){
  paintAIBadge();
  const box=$("stBody"); if(!box) return;
  const size=(()=>{ try{ return Math.round((window.localStorage.getItem(SAVE_KEY)||"").length/1024)+" KB"; }catch(e){ return "—"; } })();
  box.innerHTML=`
    <div class="card">
      <div class="card-head"><span class="card-title">Your data</span>
        <span class="link" style="color:${STORE_OK?'#4fd6a5':'#ff8f8f'}">${STORE_OK?"Saving":"Not saving"}</span></div>
      <div style="padding:0 16px 12px;font-size:13px;line-height:1.6;color:var(--ink2)">
        ${STORE_OK
          ? `Everything saves to this device automatically — no button to press. Last saved <b style="color:#fff">${lastSavedLabel()}</b> · ${size}.<br>
             ${sync.on
               ? `It also syncs with your other device — last sync <b style="color:#fff">${whenWords(sync.lastRun)}</b>.`
               : `It stays on this device. Turn on <b>Sync your devices</b> below to keep your phone and computer level.`}`
          : `This browser is blocking storage, so nothing is being saved. Everything resets on refresh.<br>
             Open the file directly in a browser and it'll save normally.`}
      </div>
      ${(()=>{const bad=tasks.filter(t=>!CATS[t.cat]); return bad.length?`
        <div style="margin:0 16px 12px;padding:11px;border-radius:11px;background:rgba(255,122,26,.1);
                    border:1px solid rgba(255,122,26,.3);font-size:12.5px;line-height:1.5;color:#ffc79a">
          <b style="color:#ff9d4d">${bad.length} task${bad.length===1?"":"s"} lost their category</b> in an update and show as
          Uncategorized. Open each one and pick a category, or erase and start fresh below.</div>`:``;})()}
      <div class="macro">
        <div class="mc"><b>${tasks.length}</b><span>Tasks</span></div>
        <div class="mc"><b>${PROJECTS.length}</b><span>Projects</span></div>
        <div class="mc"><b>${notes.length}</b><span>Notes</span></div>
        <div class="mc"><b>${WEBS.length}</b><span>Webs</span></div>
      </div>
      <div class="wk-row">
        <button class="b b-ghost" onclick="exportData()">Back up</button>
        <button class="b b-ghost" onclick="$('importFile').click()">Restore</button>
      </div>
      <input type="file" id="importFile" accept=".json" style="display:none" onchange="importData(this)">
      ${errLog.length ? `
        <div style="margin:4px 16px 14px;padding:12px;border-radius:11px;background:rgba(255,77,77,.09);
                    border:1px solid rgba(255,77,77,.28);font-size:12.5px;line-height:1.55;color:#ffc0c0">
          <b style="color:#ff8f8f">${errLog.reduce((a,e)=>a+(e.n||1),0)} problem${errLog.reduce((a,e)=>a+(e.n||1),0)===1?"":"s"} recorded</b><br>
          <span style="color:var(--ink3)">Something went wrong in the app. Copy this and send it on — it's how the bug gets fixed.</span>
          <div style="max-height:130px;overflow:auto;margin-top:8px;font-size:11px;color:var(--ink2);
                      font-family:ui-monospace,Menlo,monospace;line-height:1.5">
            ${errLog.slice(-6).reverse().map(e=>`<div style="margin-bottom:5px">
              ${new Date(e.t).toLocaleString()} · ${esc(e.view||"—")}${(e.n||1)>1?` · ×${e.n}`:``}<br>${esc(e.msg)}</div>`).join("")}
          </div>
          <div class="wk-row" style="margin-top:10px">
            <button class="b b-ghost" onclick="copyErrors()">Copy the details</button>
            <button class="b b-soft" onclick="clearErrors()">Clear</button>
          </div>
        </div>` : ``}
      ${(()=>{ const b=rescueInfo(); return b ? `
        <div style="margin:4px 16px 14px;padding:12px;border-radius:11px;background:rgba(255,122,26,.1);
                    border:1px solid rgba(255,122,26,.32);font-size:12.5px;line-height:1.55;color:#ffc79a">
          <b style="color:#ff9d4d">There is a rescued copy of your data</b><br>
          Momentum couldn't read your save at some point and kept the original rather than writing over it.<br>
          <span style="color:var(--ink3)">${esc(b.why)} · ${b.size}</span>
          <div class="wk-row" style="margin-top:10px">
            <button class="b b-ghost" onclick="downloadRescue()">Download it</button>
            <button class="b b-soft" onclick="restoreRescue()">Load it back in</button>
          </div>
        </div>` : ``; })()}
    </div>

    <div class="card">
      <div class="card-head"><span class="card-title">Privacy &amp; lock</span>
        <span class="link" style="color:${privateModeOn()?'#4fd6a5':'#8d99ab'}">${privateModeOn()?"Private":"Connected"}</span></div>

      <div class="wk-note" style="padding:2px 16px 10px">
        <b>PIN</b> — ${lock.pin?"on. Momentum asks for it when you open it.":"off. Anyone holding this device can read your data."}</div>
      <div class="wk-row">
        ${lock.pin?`<button class="b b-ghost" onclick="startPinSetup()">Change PIN</button>
                    <button class="b b-danger" onclick="removePin()">Remove PIN</button>`
                 :`<button class="b b-primary" style="width:100%" onclick="startPinSetup()">Set a PIN</button>`}
      </div>
      <div class="wk-note" style="padding:9px 16px 12px;font-size:11px;color:var(--ink3)">
        Straight about what this is: it stops someone picking up your unlocked phone and reading it.
        It isn't encryption — it won't stop someone technical with your unlocked phone.
        Forget it and the only way back in is Erase, then restore from a backup.</div>

      <div class="wk-note" style="padding:6px 16px 10px"><b>Private mode</b> — nothing leaves this device.
        No OpenAI, no Anthropic, no sync, no watch inbox, no notifications.</div>
      <div class="wk-row">
        <button class="b ${privateModeOn()?'b-danger':'b-primary'}" style="width:100%"
          onclick="togglePrivateMode()">${privateModeOn()?"Turn private mode off":"Turn private mode on"}</button>
      </div>
      <div class="wk-note" style="padding:9px 16px 12px;font-size:11px;color:var(--ink3)">
        Currently ${privateModeOn()?"on":"off"}: health AI ${hlPrefs.aiOff?"off":"<b>on</b>"} ·
        planner AI ${AI.key?"<b>on</b>":"off"} · sync ${sync.on?"<b>on</b>":"off"} ·
        notifications ${notif.on?"<b>on</b>":"off"}.</div>

      <div class="wk-row" style="padding-bottom:14px">
        <button class="b b-danger" style="width:100%" onclick="eraseOnlineCopy()">Erase the copy stored online</button>
      </div>
      <div class="wk-row" style="padding-bottom:14px">
        <button class="b b-ghost" style="width:100%" onclick="showDataLog()">What changed my data</button>
      </div>
      <div class="wk-note" style="padding:0 16px 14px;font-size:11px;color:var(--ink3)">
        Turning sync off stops new data going up, but what's already on your Netlify site stays there
        until it's overwritten. This wipes it now. Your device keeps everything.</div>
    </div>

    <div class="card">
      <div class="card-head"><span class="card-title">Version</span>
        <span class="link" style="color:#4fd6a5">${esc(BUILD)}</span></div>
      <div class="wk-note" style="padding:2px 16px 12px">If your phone is behaving differently from your computer,
        check this number matches on both. An installed app can sit on an old copy without saying so.</div>
      <div class="wk-row">
        <button class="b b-ghost" onclick="checkForUpdate(true)">Check for update</button>
        <button class="b b-blue" onclick="forceUpdate()">Force update now</button>
      </div>
      <div class="wk-note" style="padding:10px 16px 14px"><b>Force update</b> throws away the stored copy and
        reloads from your site. Your data is untouched — it's kept separately from the app itself.</div>
    </div>

    <div class="card">
      <div class="card-head"><span class="card-title">Sync your devices</span>
        <span class="link" style="color:${sync.on?'#4fd6a5':'#8d99ab'}">${sync.on?"On":"Off"}</span></div>
      ${!sync.on?`
        <div class="wk-note" style="padding:2px 16px 12px">Off. Everything stays on this device only.
          Turn it on and your phone and computer keep the same data.</div>
        <div class="wk-row">
          <button class="b b-primary" onclick="syncStart()">Turn on here</button>
          <button class="b b-ghost" onclick="syncSetCode()">I have a code</button>
        </div>
        <div class="wk-note" style="padding:10px 16px 14px">Start on one device, then type its code into the other.</div>
      `:`
        <div style="margin:2px 16px 12px;padding:12px;border-radius:11px;background:#0f141b;border:1px solid #2c374a">
          <div style="font-size:10px;font-weight:900;letter-spacing:.14em;color:var(--ink3)">YOUR CODE</div>
          <div style="font-size:23px;font-weight:800;letter-spacing:.22em;margin-top:5px;
                      font-variant-numeric:tabular-nums;color:#4fd6a5">${esc(sync.room)}</div>
          <div style="font-size:11.5px;color:var(--ink3);line-height:1.5;margin-top:7px">
            Type this into your other device to pair them. Anyone with the code can read your data — treat it like a password.</div>
        </div>
        <div class="wk-row">
          <button class="b b-ghost" onclick="copyRoom()">Copy code</button>
          <button class="b b-blue" onclick="syncNow(false).then(()=>renderSettings())">Sync now</button>
        </div>
        <div class="lg" style="cursor:default">
          <div class="lm"><b>Last sync</b><span>${whenWords(sync.lastRun)}${sync.note?" · "+esc(sync.note):""}</span></div>
          <div class="lr"><b style="color:${sync.on?'#4fd6a5':'#8d99ab'};font-size:12px">${esc(sync.device)}</b><span>This device</span></div>
        </div>
        <div class="card-pad" style="padding-top:0">
          <label class="f">Where it's stored</label>
          <input class="f" value="${esc(sync.url)}" onchange="syncSetUrl(this.value)">
          <div style="font-size:11.5px;color:var(--ink3);line-height:1.5;margin-top:7px">
            Leave this alone unless I've told you otherwise.</div>
        </div>
        <div class="wk-note" style="padding:4px 16px 10px;font-size:11.5px">
          Your Claude key is never sent through sync. It lives on your Netlify site, so every device can use AI without a copy.</div>
        ${sync.room.length<12?`<div class="wk-row"><button class="b b-soft" style="width:100%" onclick="lengthenRoom()">Make my code longer (safer)</button></div>`:``}
        <div class="wk-row">
          <button class="b b-ghost" onclick="syncTest()">Is it working?</button>
          <button class="b b-ghost" onclick="syncSetCode()">Use a different code</button>
        </div>
        <div class="wk-note" id="syncTest" style="padding:10px 16px 6px">Tap <b>Is it working?</b> for a straight answer.</div>
        <div class="wk-row"><button class="b b-danger" style="width:100%" onclick="syncStop()">Turn sync off</button></div>
        <div class="card-pad" style="padding-top:6px">
          <div style="font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:var(--ink3)">
            Watch &amp; phone inbox</div>
          <div style="font-size:11.5px;color:var(--ink3);line-height:1.5;margin-top:6px">
            Anything that can open a web address can feed Momentum. Paste these into your automation app —
            they're already filled in with your code.</div>
          <div class="codebox" style="margin-top:9px;font-size:11px">${esc(inboxURLFull())}?room=${esc(sync.room)}&do=water&n=1
${esc(inboxURLFull())}?room=${esc(sync.room)}&do=steps&n=8421</div>
          <div class="wk-row" style="padding:11px 0 0">
            <button class="b b-ghost" onclick="copyText(inboxURLFull()+'?room='+sync.room+'&do=water&n=1');toast('Water address copied')">Copy water</button>
            <button class="b b-ghost" onclick="copyText(inboxURLFull()+'?room='+sync.room+'&do=steps&n=STEPS');toast('Steps address copied')">Copy steps</button>
          </div>
          <!-- Complete, ready-to-paste addresses with the Tasker variable already in
               them. Nothing to edit afterwards — paste and it works. -->
          <div style="font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;
                      color:var(--ink3);margin-top:16px">Ready for Tasker</div>
          <div style="font-size:11.5px;color:var(--ink3);line-height:1.5;margin-top:5px">
            These are finished — the bit that fills in the number is already in there.
            Paste one straight into Tasker's URL box and change nothing.</div>
          <div class="chipwrap" style="margin-top:9px">
            ${TASKER_LINKS.map((t,i)=>`<span class="chip" onclick="copyTasker(${i})">${esc(t.label)}</span>`).join("")}
          </div>
          <div class="wk-row" style="padding:8px 0 0">
            <button class="b b-ghost" style="width:100%" onclick="testInbox()">Send myself a test glass of water</button>
          </div>
          <div class="wk-row" style="padding:8px 0 0">
            <button class="b b-blue" style="width:100%" onclick="drainInbox(false)">Check the inbox now</button>
          </div>
          <div style="font-size:11.5px;color:var(--ink3);line-height:1.5;margin-top:9px">
            It empties itself every time you open the app. Whoever has your code can post to it, so keep it to yourself.</div>
        </div>
        <div class="wk-note" style="padding:10px 16px 14px">It syncs when you open the app and when you close it.
          If both devices changed since last time, it stops and asks — it won't quietly pick one.</div>
      `}
    </div>

    <div class="card">
      <div class="card-head"><span class="card-title">Work hours</span><span class="link">Used by the scheduler</span></div>
      <div class="card-pad" style="padding-top:0">
        <div class="two">
          <div><label class="f">Start</label><input class="f" type="number" min="0" max="23" value="${workHours.start}" onchange="workHours.start=+this.value;save();renderCal();renderSettings()"></div>
          <div><label class="f">End</label><input class="f" type="number" min="1" max="24" value="${workHours.end}" onchange="workHours.end=+this.value;save();renderCal();renderSettings()"></div>
        </div>
        <label class="f">Work days</label>
        <div class="chips">${DOW.map(d=>`<span class="chip${workHours.days.includes(d)?" on":""}" onclick="toggleWorkday('${d}')">${d}</span>`).join("")}</div>
        <div style="font-size:11.5px;color:var(--ink3);line-height:1.5;margin-top:10px">
          Plan My Week fills work days to <b>75%</b> and leaves the rest as buffer. Non-work days get a lighter allowance.
          Routines and commitments come off the top first.</div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><span class="card-title">End-of-day check-in</span></div>
      <div class="card-pad" style="padding-top:0">
        <label class="f">Arrives at</label>
        <select class="f" onchange="prefs.notifHour=+this.value;save();renderNotif();renderSettings()">
          ${[17,18,19,20,21,22].map(x=>`<option value="${x}"${prefs.notifHour===x?" selected":""}>${x>12?x-12:x}:00 PM</option>`).join("")}
          <option value="0"${prefs.notifHour===0?" selected":""}>Always show it</option>
        </select>
        <div style="font-size:11.5px;color:var(--ink3);line-height:1.5;margin-top:9px">
          Right now it shows whenever something's unfinished so you can test it. Set a time and it holds until then.</div>
      </div>
    </div>

    <div class="card">
      <div class="card-head"><span class="card-title">When AI speaks up</span></div>
      <div class="switchrow" style="padding:4px 16px 6px" onclick="toggleAiOnAsk()">
        <div style="flex:1">
          <b style="font-size:14px">Only suggest when I ask</b>
          <div style="font-size:11.5px;color:var(--ink3);line-height:1.5;margin-top:3px">
            On: nothing goes to the model until you tap a button. Off: it offers a project while
            you type a task, and reasons at the end-of-day check-in, without being asked.</div>
        </div>
        <div class="sw${prefs.aiOnAsk?" on":""}" id="swAiAsk"></div>
      </div>
      <div class="wk-note" style="padding:4px 16px 14px">Buttons you press — Ask Momentum, the Problem Solver,
        the weekly review, sorting a braindump — always work either way. This only covers the ones that
        used to fire on their own.</div>
    </div>

    <div class="card">
      <div class="card-head"><span class="card-title">Daily targets</span></div>
      <div class="card-pad" style="padding-top:0"><div class="two">
        <div><label class="f">Calories</label><input class="f" type="number" step="50" value="${meals.kcalTarget}" onchange="meals.kcalTarget=+this.value;save();renderMeals&&renderMeals();renderSettings()"></div>
        <div><label class="f">Protein (g)</label><input class="f" type="number" step="5" value="${meals.pTarget}" onchange="meals.pTarget=+this.value;save();renderSettings()"></div>
      </div>
      <div style="font-size:11.5px;color:var(--ink3);line-height:1.5;margin-top:10px">
        Counter routines like water and steps set their own targets — open the routine and edit it there.</div></div>
    </div>

    <div class="card">
      <div class="card-head"><span class="card-title">AI connection</span>
        <span class="link" style="color:${!AI.on?'#ff9d4d':AI.ok===true?'#4fd6a5':AI.ok===false?'#ff8f8f':'#ff9d4d'}">${
          !AI.on?"No key":AI.ok===true?"Working":AI.ok===false?"Failing":"Not tested"}</span></div>
      <div style="margin:0 16px 12px;padding:12px;border-radius:11px;font-size:12.5px;line-height:1.55;
                  background:${AI.on?'rgba(18,201,138,.1)':'rgba(255,122,26,.1)'};
                  border:1px solid ${AI.on?'rgba(18,201,138,.32)':'rgba(255,122,26,.3)'};
                  color:${AI.on?'#9fe8c9':'#ffc79a'}">
        ${!AI.on
          ? `<b style="color:#ff9d4d">No key on this device.</b> The key is stored per device — setting it on your
             computer does not put it on your phone. Paste it below, or turn on <b>Send my API key too</b> under
             Sync and it'll come across on its own.`
          : AI.ok===true
          ? `<b style="color:#4fd6a5">Working.</b> A real call came back. Problem Solver, Braindump, Ask Momentum,
             the calendar assistant and the Improve chat all use Claude,
             and they can see your real tasks, projects and routines.`
          : AI.ok===false
          ? `<b style="color:#ff8f8f">There's a key here, but calls are failing.</b> That's why you're still seeing
             the built-in questions and answers. Here's what's wrong:`
          : `<b style="color:#ff9d4d">Key saved, not tested yet.</b> Hit <b>Test connection</b> below — until a real
             call comes back I won't claim it's working.`}
        ${AI.ok===false && AI.lastError?`
          <div style="margin-top:10px;padding:10px;border-radius:9px;background:rgba(0,0,0,.25)">
            <b style="color:#ff8f8f">${esc(aiPlainError(AI.lastError))}</b>
            <div style="font-size:11px;color:var(--ink3);margin-top:7px;word-break:break-word">
              Exact message: ${esc(AI.lastError.slice(0,200))}</div>
          </div>`:``}
      </div>
      <div style="margin:0 16px 12px;padding:12px;border-radius:11px;background:#0f141b;border:1px solid #212a36">
        <div style="font-size:9.5px;font-weight:900;letter-spacing:.14em;text-transform:uppercase;color:var(--ink3);margin-bottom:8px">
          What uses AI</div>
        ${[["Problem Solver — the questions",1],["Problem Solver — the 5 prompts",1],["Problem Solver — the answers",1],
           ["Problem Solver — blending routes",1],["Ask Momentum",1],["Braindump sorting",1],
           ["Improve chat",1],["Calendar assistant",1],["Weekly review",1],["End-of-day reasons",1],
           ["Tracker builder",1],["Project suggestions",1],["Week scheduling — deliberately not AI",0]]
          .map(([n,ai])=>`<div style="display:flex;align-items:center;gap:8px;font-size:12.5px;padding:3px 0;color:var(--ink2)">
            <span style="color:${!ai?'#5d6878':AI.on&&AI.ok===true?'#4fd6a5':'#ff9d4d'}">${
              !ai?'—':(AI.on&&AI.ok===true?'●':'○')}</span>${n}</div>`).join("")}
        <div style="font-size:11px;color:var(--ink3);line-height:1.5;margin-top:9px">
          Scheduling stays maths, not a model — so it can't invent a day or forget a deadline.</div>
      </div>
      <div class="card-pad" style="padding-top:0">
        <label class="f">Provider</label>
        <select class="f" id="setProv2" onchange="AI.provider=this.value;AI.model=MODELS[this.value][0];saveKey();renderSettings()">
          <option value="anthropic"${AI.provider==="anthropic"?" selected":""}>Claude (Anthropic)</option>

        </select>
        <label class="f">Model</label>
        <select class="f" id="setModel" onchange="AI.model=this.value;saveKey()">
          ${(MODELS[AI.provider]||[]).map(m=>`<option${AI.model===m?" selected":""}>${m}</option>`).join("")}
        </select>
        <label class="f">API key</label>
        <input class="f" id="setKey2" type="password" autocomplete="off" spellcheck="false"
               placeholder="${AI.provider==="anthropic"?"sk-ant-…":"sk-…"}" value="${AI.key?esc(AI.key):""}">
        <div class="wk-row" style="padding:14px 0 0">
          <button class="b b-blue" id="aiTest" onclick="testAI()">Test connection</button>
          ${AI.key?`<button class="b b-danger" onclick="forgetKey()">Remove key</button>`:``}
        </div>
        <div style="font-size:11.5px;color:var(--ink3);line-height:1.6;margin-top:14px">
          <b style="color:var(--ink2)">Where your key goes:</b> it's saved in this browser, on this device only.
          It is sent to api.anthropic.com and nowhere else —
          not to me, not to any server of mine. It's deliberately <b>left out of Back up</b> so it can't leak
          in a file you share.<br><br>
          Anyone with physical access to an unlocked phone could read it, same as a saved password. Remove it
          any time with the button above, and you can revoke it at the provider.
        </div>
      </div>
    </div>

    <div class="card" style="border-color:rgba(255,77,77,.32)">
      <div class="card-head"><span class="card-title" style="color:#ff8f8f">Erase</span></div>
      <div style="padding:0 16px 12px;font-size:12.5px;line-height:1.55;color:var(--ink2)">
        Back up first if there's anything you want to keep — none of this can be undone.</div>
      ${[["tasks","Tasks, projects & notes","Keeps workouts, meals and history"],
         ["fitness","Workouts, cardio & meals","Keeps tasks and projects"],
         ["history","History — misses, webs, feedback","Keeps everything you're actively using"]]
        .map(([k,t,s])=>`<div class="lg">
          <div class="icon" style="background:#241419">🗑</div>
          <div class="lm"><b>${t}</b><span>${s}</span></div>
          <div class="crbtn take" style="background:rgba(255,77,77,.14);color:#ff8f8f;border:1px solid rgba(255,77,77,.34)"
               onclick="wipePart('${k}')">Erase</div></div>`).join("")}
      <div class="wk-row" style="padding:12px 16px 15px">
        <button class="b b-danger" style="width:100%" onclick="wipeSaved()">Erase everything and start over</button>
      </div>
    </div>

    <div class="card"><div class="card-pad">
      <div style="font-size:11px;font-weight:800;letter-spacing:.14em;color:var(--ink3);text-transform:uppercase">About</div>
      <div style="font-size:13px;line-height:1.7;color:var(--ink2);margin-top:9px">
        <b style="color:#7fb0ff">Build ${BUILD}</b> · ${NAV.filter(n=>n.k&&n.live).length} pages live<br>
        One file, runs offline. ${sync.on?"Synced with your other device.":"Data stays on this device."}<br>
        Ideas you park go to <b style="color:#c4b0ff" onclick="go('v2')">V2 Ideas</b>.</div>
      <div style="margin-top:14px;padding:12px;border-radius:11px;background:#0f141b;border:1px solid #212a36;
                  font-size:12.5px;line-height:1.55;color:var(--ink2)">
        Just deployed a new version and still seeing the old one? Tap this — it clears the offline copy and reloads.
      </div>
      <button class="b b-blue" style="width:100%;margin-top:10px" onclick="forceUpdate()">Force update</button>
    </div></div>`;
}
/* (the old forceUpdate lived here — it called location.reload(true), and that
   "true" has been ignored by browsers for years, so it often did nothing at all.
   The working one is further down, next to the update check.) */
function toggleWorkday(d){
  workHours.days = workHours.days.includes(d) ? workHours.days.filter(x=>x!==d) : [...workHours.days,d];
  save(); renderCal(); renderSettings();
}
/* ---- the rescued copy -------------------------------------------------------
   backupRaw() keeps the bytes when a save can't be read. Without somewhere to
   get at them that copy would be invisible, which is barely better than losing
   it. These three put it in front of you in Settings. */
function rescueInfo(){
  try{
    const raw=window.localStorage.getItem(SAVE_KEY+".backup"); if(!raw) return null;
    const why=window.localStorage.getItem(SAVE_KEY+".backup.why")||"kept after a failed read";
    return { raw, why, size:(raw.length/1024).toFixed(1)+" KB" };
  }catch(e){ return null; }
}
function copyErrors(){
  const txt = errLog.map(e=>
    `${new Date(e.t).toISOString()} [${e.kind}] ${e.build} ${e.device} ${e.view}${(e.n||1)>1?` x${e.n}`:``}\n  ${e.msg}\n  ${e.at}`
  ).join("\n\n");
  copyText(`Momentum problem report\n${navigator.userAgent}\n\n${txt}`);
  toast("Copied — paste it wherever you're reporting this");
}
async function clearErrors(){
  if(!await ask(`Clear the ${errLog.length} recorded problem${errLog.length===1?"":"s"}?\n\nCopy them first if you haven't sent them on yet.`,"Clear them")) return;
  errLog=[]; save(); renderSettings(); toast("Cleared");
}
function downloadRescue(){
  const b=rescueInfo(); if(!b){ toast("Nothing to download"); return; }
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([b.raw],{type:"application/json"}));
  a.download="momentum-rescued.json"; a.click();
  toast("Rescued copy downloaded — keep it somewhere safe");
}
async function restoreRescue(){
  const b=rescueInfo(); if(!b) return;
  if(!await ask("Load the rescued copy back in?\n\nWhatever is on screen now will be replaced by it. Back up first if you're not sure.","Load it back in")) return;
  try{
    JSON.parse(b.raw);                       // refuse to install something unreadable
    HOLD_SAVE=true;
    window.localStorage.setItem(SAVE_KEY, b.raw);
    window.localStorage.removeItem(SAVE_KEY+".backup");
    window.localStorage.removeItem(SAVE_KEY+".backup.why");
    location.reload();
  }catch(e){ toast("That rescued copy is damaged — download it instead and send it on"); }
}
function exportData(){
  const blob={}; SAVED.forEach(k=>{ try{ blob[k]=eval(k); }catch(e){} }); blob._v=SCHEMA;
  // the API key is intentionally not included
  const a=document.createElement("a");
  a.href=URL.createObjectURL(new Blob([JSON.stringify(blob,null,1)],{type:"application/json"}));
  a.download="momentum-backup.json"; a.click();
  toast("Backup downloaded");
}
function importData(input){
  const f=input.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=async()=>{ try{
    const b=JSON.parse(r.result);
    if(b._v!==SCHEMA){ toast("That backup is from a different version"); return; }
    if(!await ask("Replace everything with this backup?","Restore it",1)) return;
    HOLD_SAVE=true;   // same reason as Erase — don't overwrite the backup on the way out
    try{ window.localStorage.setItem(SAVE_KEY, JSON.stringify(b)); }catch(e){}
    location.reload();
  }catch(e){ toast("Couldn't read that file"); } };
  r.readAsText(f); input.value="";
}
async function wipePart(k){
  const label={tasks:"tasks, projects and notes",fitness:"workouts, cardio and meals",history:"history"}[k];
  if(!await ask("Erase "+label+"?\n\nThis can't be undone.","Erase",1)) return;
  const _b=dataSizes();
  if(k==="tasks"){ tasks=tasks.filter(t=>t.routine); PROJECTS=[]; notes=[]; carryover=[]; }
  if(k==="fitness"){ wkHist={}; cardio=[]; meals.today=[]; meals.hist=[]; }
  if(k==="history"){ missLog=[]; WEBS=[]; improve={}; }
  logChange("you erased "+label, _b);
  save(); render(); renderCal(); renderProjects(); renderCategories(); renderTasks(); renderNotes();
  renderWhyNot(); renderProgress(); renderOverview(); renderSettings();
  toast("Erased: "+label);
}

/* ================= REAL AI =================
   Your key lives in this browser on this device and goes nowhere except
   straight to Anthropic. It is deliberately NOT included in backups. The Health
   section's OpenAI key is a different thing entirely and never comes near here —
   that one lives on the server. */
const AI_KEY_STORE="momentum.aikey";
/* on  = a key is present, so we should try
   ok  = the last real call actually came back. "on" alone was claiming LIVE AI
         while every call quietly failed, which is exactly how you end up staring
         at the same built-in questions and thinking the API is wired up. */
let AI={provider:"anthropic", key:"", model:"claude-sonnet-5", on:false, ok:null,
        lastError:"", lastErrorAt:0, fails:0};

/* Turn whatever the API said into something you can act on. */
function aiPlainError(msg){
  const m=(msg||"").toLowerCase();
  if(/failed to fetch|networkerror|load failed|typeerror/.test(m))
    return "The browser couldn't reach Anthropic at all. Usually no internet, or a blocker/VPN stopping the request.";
  if(/authentication|invalid x-api-key|401/.test(m))
    return "The key was rejected. Copy it again from console.anthropic.com — keys start with sk-ant- and can only be copied once.";
  if(/credit|billing|quota|payment/.test(m))
    return "Your Anthropic account is out of credit. Add a few dollars at console.anthropic.com → Billing.";
  if(/not_found|model/.test(m) && /model/.test(m))
    return "That model name isn't available on your account. Try claude-haiku-4-5.";
  if(/rate|429/.test(m))
    return "Too many requests just now. Wait a minute and try again.";
  if(/overloaded|529|500|502|503/.test(m))
    return "Anthropic's API is having trouble right now. Not your key — try again shortly.";
  if(/permission|403/.test(m))
    return "The key doesn't have permission for this. Check it's an API key, not something else.";
  return msg || "Unknown problem.";
}
const MODELS={
  anthropic:["claude-sonnet-5","claude-opus-5","claude-haiku-4-5"],
  openai:[]   // deliberately empty: OpenAI is health-only, and never from the browser
};
function loadKey(){
  try{ const raw=window.localStorage.getItem(AI_KEY_STORE);
    if(raw){ const k=JSON.parse(raw); AI=Object.assign(AI,k); AI.on=!!AI.key; }
    if(AI.ok===undefined) AI.ok=null;
    if(AI.provider!=="anthropic"){ AI.provider="anthropic"; AI.model="claude-sonnet-5"; }
  }catch(e){}
}
function saveKey(){
  setTimeout(paintAIBadge,0);
  try{ window.localStorage.setItem(AI_KEY_STORE,
    JSON.stringify({provider:AI.provider,key:AI.key,model:AI.model,ok:AI.ok})); }catch(e){}
  AI.on=!!AI.key;
}
function forgetKey(){
  AI.key=""; AI.on=false; AI.lastError="";
  try{ window.localStorage.removeItem(AI_KEY_STORE); }catch(e){}
  renderSettings(); toast("Key removed from this device");
}

/* Training, in a shape a model can actually reason about: what the plan is,
   what's been done, and which way the numbers are moving. */
function trainingContext(){
  const L=["\nTRAINING"];
  WK.forEach(w=>{
    const h=wkHist[w.id]||[], last=h.slice(-1)[0], prev=h.slice(-2)[0];
    const trend = last&&prev&&prev.vol ? Math.round((last.vol-prev.vol)/prev.vol*100) : null;
    L.push(`- ${w.name}: planned ${w.days.join("/")||"no day"} (${weekTarget(w)}× a week), ${w.ex.length} moves`
      + `${(w.rounds||1)>1?` × ${w.rounds} rounds`:``}. This week ${weekDone(w)}/${weekTarget(w)}.`
      + (last ? ` Last done ${agoLabel(daysAgo(last))}, volume ${last.vol}${trend!=null?` (${trend>=0?"+":""}${trend}% vs before)`:``}.`
              : ` Never logged.`));
    if(last && last.entries){
      const moves=Object.entries(last.entries).filter(([,v])=>v.reps)
        .map(([n,v])=>`${n} ${v.reps}${v.wt?`×${v.wt}lb`:``}`);
      if(moves.length) L.push(`   last session: ${moves.join(", ")}`);
    }
  });
  if(cardio.length){
    L.push("\nCARDIO (most recent first)");
    [...cardio].sort((a,b)=>daysAgo(a)-daysAgo(b)).slice(0,8).forEach(c=>
      L.push(`- ${c.type} ${c.mi} mi in ${c.min} min (${pace(c.mi,c.min)}), ${agoLabel(daysAgo(c))}`
        + (c.hr?`, avg HR ${c.hr}`:``)));
  }
  const wkMi=cardio.filter(c=>daysAgo(c)<7).reduce((a,c)=>a+c.mi,0);
  L.push(`This week: ${wkMi.toFixed(1)} cardio miles, ${WK.filter(weekMet).length}/${WK.length} lifting sessions met.`);
  return L.join("\n");
}

/* Everything the model needs to know about your app, kept short. */
function appContext(){
  const day=tasks.filter(onToday);
  const counters=tasks.filter(isCounter);
  const L=[];
  L.push(`TODAY IS ${new Date().toDateString()}. Work hours ${workHours.start}:00-${workHours.end}:00 on ${workHours.days.join(",")}.`);
  L.push(`\nPROJECTS (${PROJECTS.length}):`);
  PROJECTS.forEach(p=>{ const ts=projTasks(p.id);
    L.push(`- ${p.name} [${p.cat}] ${p.status} — ${ts.filter(t=>t.done).length}/${ts.length} done. Goal: ${p.goal||"none set"}`); });
  L.push(`\nOPEN TASKS (${tasks.filter(t=>!t.routine&&!t.done).length}):`);
  tasks.filter(t=>!t.routine&&!t.done).slice(0,45).forEach(t=>{
    const b=t.blockedBy?tasks.find(x=>x.id===t.blockedBy):null;
    L.push(`- ${t.name} | ${catOf(t.cat).label} | ${priOf(t)} | ${t.est||30}min | ${t.date?("on "+t.date):"unscheduled"}${
      t.proj&&projById(t.proj)?" | project: "+projById(t.proj).name:""}${t.due?" | due "+t.due:""}${
      b?` | BLOCKED until "${b.name}" is done`:""}${t.status==="Waiting"?" | WAITING":""}`); });
  L.push(`\nROUTINES (${tasks.filter(t=>t.routine).length}):`);
  tasks.filter(t=>t.routine).forEach(t=>L.push(`- ${t.name} | ${t.freq}${isCounter(t)?` | ${t.count}/${t.target} ${unitOf(t)} today`:` | ${t.done?"done":"not done"} today`} | streak ${t.streak}${t.paused?" | PAUSED":""}`));
  if(carryover.length){ L.push(`\nSTILL OWED:`); carryover.forEach(c=>L.push(`- ${c.name} (missed ${c.missed}x)`)); }
  if(notes.length){ L.push(`\nNOTES:`); notes.slice(0,12).forEach(n=>L.push(`- [${noteLabel(n)}]${n.pin?" RESUME POINT:":""} ${n.text}`)); }
  if(missLog.length){ const c={}; missLog.forEach(m=>c[m.reason]=(c[m.reason]||0)+1);
    L.push(`\nWHY THINGS GET MISSED: ${Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,4).map(x=>x[0]+" ("+x[1]+")").join(", ")}`); }
  L.push(`\nTHIS WEEK: ${weekDays(0).map(d=>DOW[d.getDay()]+" "+loadPct(d)+"%").join(" ")}`);
  L.push(trainingContext());
  return L.join("\n");
}

const APP_SYSTEM = `You are the assistant inside Momentum, Pete's personal organiser app.
You can see his real data below. Use it — never ask him to repeat something that's already there.

Rules:
- Be direct and specific. Short paragraphs. No filler, no "great question".
- Reference his actual tasks, projects and numbers by name.
- If something is blocked or waiting, say so rather than telling him to just do it.
- If you don't know, say so plainly.
- Reply in simple HTML only: <div>, <b>, <ul>, <li>, <br>. No markdown, no headings, no code fences.
- Keep it under 180 words unless he asks for detail.`;

async function callAI(system, user, maxTokens){
  if(!AI.on) return null;
  const t0=Date.now();
  try{
    let text="";
    if(AI.provider==="anthropic"){
      const r=await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"content-type":"application/json","x-api-key":AI.key,
          "anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({model:AI.model,max_tokens:maxTokens||900,system,
          messages:[{role:"user",content:user}]})
      });
      if(!r.ok) throw new Error((await r.text()).slice(0,200));
      const j=await r.json();
      text=(j.content||[]).map(c=>c.text||"").join("");
    } else {
      /* There used to be a browser-side OpenAI call here, sending a key as a
         Bearer token straight from the page. That's the pattern we're not having
         any more. OpenAI is health-only now and goes through the Netlify
         function, where the key lives as an environment variable and never
         reaches the browser. Claude is unaffected — it stays exactly as it was. */
      throw new Error("OpenAI isn't used here any more — Momentum's brain is Claude. "
                    + "OpenAI powers the Health section only, through the secure backend.");
    }
    AI.lastError=""; AI.ok=true; AI.fails=0;
    saveKey();
    setTimeout(paintAIBadge,0);
    console.log(`[Momentum AI] ${Date.now()-t0}ms`);
    return text.replace(/```html|```/g,"").trim();
  }catch(e){
    AI.lastError=e.message; AI.lastErrorAt=Date.now(); AI.ok=false; AI.fails++;
    saveKey();
    setTimeout(paintAIBadge,0);
    console.warn("[Momentum AI] failed, using the built-in brain:", e.message);
    // Say it out loud the first time, so a dead key can't hide behind generic answers
    if(AI.fails===1) setTimeout(()=>toast("AI call failed — "+aiPlainError(e.message).slice(0,60)),300);
    return null;
  }
}
async function testAI(){
  const btn=$("aiTest"); if(btn){ btn.textContent="Testing…"; btn.disabled=true; }
  const typed=($("setKey2").value||"").trim();
  AI.provider=$("setProv2").value; AI.model=$("setModel").value;
  // An empty box must never wipe a key that's already working — use Remove key for that
  if(typed) AI.key=typed;
  if(!AI.key){ toast("Paste a key first"); if(btn){btn.disabled=false;btn.textContent="Test connection";} return; }
  saveKey();
  const r=await callAI("Reply with exactly: OK","Say OK",20);
  if(btn){ btn.disabled=false; btn.textContent="Test connection"; }
  if(r){ AI.ok=true; toast("Connected — AI is live"); }
  else { AI.ok=false; toast("Not connected — " + aiPlainError(AI.lastError).slice(0,70)); }
  paintAIBadge();
  renderSettings();
}
/* Label every answer with where it actually came from — never claim it was the
   model when the call failed and the built-in brain answered. */
const aiBadge = () => `<span class="vtag" style="background:rgba(18,201,138,.16);color:#4fd6a5;border:1px solid rgba(18,201,138,.4)">LIVE AI</span>`;
const fellBack = () => AI.on
  ? `<span class="vtag" style="background:rgba(255,77,77,.14);color:#ff8f8f;border:1px solid rgba(255,77,77,.34)">AI UNREACHABLE — BUILT-IN ANSWER</span>`
  : `<span class="vtag" style="background:rgba(255,122,26,.14);color:#ff9d4d;border:1px solid rgba(255,122,26,.34)">BUILT-IN BRAIN</span>`;

/* ================= ASK MOMENTUM =================
   One front door. Routes to navigation, actions, live data, how-to, the calendar
   brain, or a change request — in that order. Still the demo brain, but it can
   see everything and it can actually do things. */
let askChat=[];
function openAsk(){ closeAll(); drawAsk(); openSheet("askSheet"); setTimeout(()=>$("askInput").focus(),320); }
function askSay(who,html){ askChat.push({who,html}); drawAsk(); }
function drawAsk(){
  const c=$("askChat"); if(!c) return;
  c.innerHTML = askChat.length ? askChat.map(m=>`<div class="bub ${m.who}">${m.who==="you"?esc(m.html):m.html}</div>`).join("")
    : `<div style="font-size:13px;color:var(--ink2);line-height:1.65;padding:6px 0">
        I can see everything in here — your <b style="color:#fff">${tasks.filter(t=>!t.routine).length} tasks</b>,
        <b style="color:#fff">${tasks.filter(t=>t.routine).length} routines</b>,
        <b style="color:#fff">${PROJECTS.length} projects</b>, your calendar, streaks and notes.<br><br>
        Ask me anything about the app or your own stuff, or just tell me to do something.</div>`;
  $("askSug").style.display = askChat.length?"none":"flex";
  c.scrollTop=c.scrollHeight;
}
function askSuggest(el){ $("askInput").value=el.textContent; sendAsk(); }
async function sendAsk(){
  const v=$("askInput").value.trim(); if(!v) return;
  askSay("you",v); $("askInput").value="";
  // actions stay deterministic — a model should never be the thing that edits your data
  const act=askAction(v);
  if(act){ askSay("ai",act); return; }
  if(AI.on){
    askSay("ai",`<span class="thinkdot"></span> Thinking…`);
    const r=await callAI(APP_SYSTEM+"\n\nHIS DATA:\n"+appContext(), v, 900);
    askChat.pop();
    askSay("ai", r ? aiBadge()+r : fellBack()+askBrain(v));
    return;
  }
  setTimeout(()=>askSay("ai", askBrain(v)), 380);
}
const did = t => `<span class="didit">✓ ${t}</span>`;
const tell = (t,c) => `<span class="vtag" style="background:${c}22;color:${c};border:1px solid ${c}55">${t}</span>`;

function findTask(s){
  const low=s.toLowerCase();
  const scored=tasks.map(t=>{
    const nm=t.name.toLowerCase();
    if(low.includes(nm)) return {t,n:20};
    const w=nm.split(/\s+/).filter(x=>x.length>3);
    const hits=w.filter(x=>low.includes(x));
    return hits.length?{t,n:hits.length}:null;
  }).filter(Boolean).sort((a,b)=>b.n-a.n);
  return scored.length?scored[0].t:null;
}

/* Just the parts that change data or navigate. Returns null if it isn't one. */
function askAction(text){
  const s=text.toLowerCase().trim();
  const navHit=Object.keys(PAGES).find(k=>
    new RegExp(`\\b(open|go to|show|take me to|jump to|view)\\b.*\\b${PAGES[k].n.toLowerCase().split(" ")[0]}`).test(s));
  if(navHit){ setTimeout(()=>{closeAll();go(navHit);},350);
    return tell("Opening","#5b9dff")+`<div>Taking you to <b>${PAGES[navHit].n}</b>.</div>`; }
  if(/\b(log|had|drank|took|ate|did)\b/.test(s)){
    const c=tasks.filter(isCounter).find(t=>s.includes(t.name.toLowerCase())||s.includes(t.unit.toLowerCase()));
    if(c){ const m=s.match(/(\d+)/); const n=m?+m[1]:1;
      setCount(c.id, Math.min(c.target, c.count+n));
      return did("Logged")+`<div><b>${esc(c.name)}</b> is now ${c.count} of ${c.target} ${unitOf(c)}.${
        c.done?` Target hit — streak is 🔥 ${c.streak}.`:` ${c.target-c.count} to go.`}</div>`; } }
  if(/\b(mark|finished|completed|done with|check off)\b/.test(s)){
    const t=findTask(s);
    if(t && !t.done){ toggleDone(t.id);
      return did("Done")+`<div><b>${esc(t.name)}</b> is checked off.${t.routine&&t.streak?` 🔥 ${t.streak} day streak.`:``}</div>`; } }
  if(/^(add|create|new)\b.*\b(task|todo|to-do)\b|^(remind me to|i need to|add)\s+/.test(s)){
    let name=text.replace(/^(add|create|new)\s+(a\s+)?(task|todo|to-do)?\s*(to|for|called|named)?\s*/i,"")
                 .replace(/^(remind me to|i need to)\s*/i,"").trim();
    if(name.length>2){
      const cat=guessCat(name), proj=suggestProject(name,cat);
      const t={id:newId(),name:name.charAt(0).toUpperCase()+name.slice(1),cat,time:"09:00",est:30,done:false,
        routine:false,streak:0,target:1,unit:"time",count:0,log:[],makeup:true,pri:"Should",
        date:TODAY_KEY,sched:true,proj:proj||null,notes:"Added by asking.",src:"asked",added:TODAY_KEY};
      tasks.push(t); save(); render(); renderCal(); renderTasks(); renderProjects();
      return did("Added")+`<div><b>${esc(t.name)}</b> — filed under ${catOf(cat).label}${
        proj?`, in <b>${esc(projById(proj).name)}</b>`:``}, on today's list.</div>`; } }
  if(/plan (my )?(week|the week)|schedule (my )?week|sort out my week/.test(s)){
    setTimeout(()=>{closeAll();go("calendar");planWeek();},400);
    return tell("Opening the planner","#a78bfa")+`<div>Working out the week now — you'll approve it before anything moves.</div>`; }
  if(/review (my )?day|end of day/.test(s)){
    setTimeout(()=>{closeAll();startReview();},400);
    return tell("Starting the check-in","#a78bfa")+`<div>Walking you through what's unfinished.</div>`; }
  if(/^(note|make a note|remember that|jot)\b/.test(s)){
    const txt=text.replace(/^(note|make a note|remember that|jot)\s*(that|down)?:?\s*/i,"").trim();
    if(txt.length>2){ noteAdd(txt,"free",null); renderNotes();
      return did("Noted")+`<div>Saved as a standalone note.</div>`; } }
  return null;
}

function askBrain(text){
  const s=text.toLowerCase().trim();
  const a=askAction(text); if(a) return a;

  /* ---- 1. take me somewhere ---- */
  const navHit=Object.keys(PAGES).find(k=>
    new RegExp(`\\b(open|go to|show|take me to|jump to|view)\\b.*\\b${PAGES[k].n.toLowerCase().split(" ")[0]}`).test(s));
  if(navHit){ setTimeout(()=>{closeAll();go(navHit);},350);
    return tell("Opening","#5b9dff")+`<div>Taking you to <b>${PAGES[navHit].n}</b>.</div>`; }

  /* ---- 2. do something ---- */
  // log a counter
  if(/\b(log|had|drank|took|ate|did)\b/.test(s)){
    const c=tasks.filter(isCounter).find(t=>s.includes(t.name.toLowerCase())||s.includes(t.unit.toLowerCase()));
    if(c){ const m=s.match(/(\d+)/); const n=m?+m[1]:1;
      setCount(c.id, Math.min(c.target, c.count+n));
      return did("Logged")+`<div><b>${esc(c.name)}</b> is now ${c.count} of ${c.target} ${unitOf(c)}.${
        c.done?` Target hit — streak is 🔥 ${c.streak}.`:` ${c.target-c.count} to go.`}</div>`; }
  }
  // complete something
  if(/\b(mark|finished|completed|done with|check off)\b/.test(s)){
    const t=findTask(s);
    if(t && !t.done){ toggleDone(t.id);
      return did("Done")+`<div><b>${esc(t.name)}</b> is checked off.${t.routine&&t.streak?` 🔥 ${t.streak} day streak.`:``}</div>`; }
  }
  // add a task
  if(/^(add|create|new)\b.*\b(task|todo|to-do)\b|^(remind me to|i need to|add)\s+/.test(s)){
    let name=text.replace(/^(add|create|new)\s+(a\s+)?(task|todo|to-do)?\s*(to|for|called|named)?\s*/i,"")
                 .replace(/^(remind me to|i need to)\s*/i,"").trim();
    if(name.length>2){
      const cat=guessCat(name), proj=suggestProject(name,cat);
      const t={id:newId(),name:name.charAt(0).toUpperCase()+name.slice(1),cat,time:"09:00",est:30,done:false,
        routine:false,streak:0,target:1,unit:"time",count:0,log:[],makeup:true,pri:"Should",
        date:TODAY_KEY,sched:true,proj:proj||null,notes:"Added by asking."};
      tasks.push(t); save(); render(); renderCal(); renderTasks(); renderProjects();
      return did("Added")+`<div><b>${esc(t.name)}</b> — filed under ${catOf(cat).label}${
        proj?`, in <b>${esc(projById(proj).name)}</b>`:``}, on today's list.</div>
        <div style="margin-top:8px;font-size:12px;color:var(--ink3)">Open it to change the priority, time or deadline.</div>`;
    }
  }
  // plan the week
  if(/plan (my )?(week|the week)|schedule (my )?week|sort out my week/.test(s)){
    setTimeout(()=>{closeAll();go("calendar");planWeek();},400);
    return tell("Opening the planner","#a78bfa")+`<div>Working out the week now — you'll get the proposal to approve before anything moves.</div>`;
  }
  // day review
  if(/review (my )?day|end of day|why didn't i/.test(s)){
    setTimeout(()=>{closeAll();startReview();},400);
    return tell("Starting the check-in","#a78bfa")+`<div>Walking you through what's unfinished.</div>`;
  }
  // note
  if(/^(note|make a note|remember that|jot)\b/.test(s)){
    const txt=text.replace(/^(note|make a note|remember that|jot)\s*(that|down)?:?\s*/i,"").trim();
    if(txt.length>2){ noteAdd(txt,"free",null); renderNotes();
      return did("Noted")+`<div>Saved as a standalone note. Open <b>Notes</b> to attach it to a project or task.</div>`; }
  }
  // still owed
  if(/still owed|what do i owe|behind on|overdue/.test(s)){
    const od=tasks.filter(t=>!t.done&&!t.routine&&t.due&&t.due<TODAY_KEY);
    if(!carryover.length&&!od.length) return tell("Answer","#12c98a")+`<div>Nothing owed and nothing overdue. You're clean.</div>`;
    return tell("Answer only","#5b9dff")+`<div>Outstanding right now:</div><ul>
      ${carryover.sort((a,b)=>b.missed-a.missed).map(c=>`<li><b>${esc(c.name)}</b> — ${c.missed}× missed</li>`).join("")}
      ${od.map(t=>`<li><b>${esc(t.name)}</b> — overdue since ${dLabel(new Date(t.due+"T12:00:00"))}</li>`).join("")}</ul>`;
  }

  /* ---- 3. what's in the app / how do I / my numbers ---- */
  const about=answerAbout(text);
  if(about) return about.html;

  /* ---- 4. calendar questions ---- */
  if(/week|schedule|calendar|busy|focus|first|why is|priorit/.test(s)){
    const r=calBrain(text);
    if(r.draft){ planDraft=r.draft;
      return r.html+`<div style="margin-top:8px;font-size:11.5px;color:var(--ink3)">Apply from the Calendar page if you want it.</div>`; }
    return r.html;
  }

  /* ---- 5. otherwise treat it as a change request, logged to Improve ---- */
  const t=threadOf("improve"); t.ideas++;
  const r=aiThink(text,"improve",0);
  t.msgs.push({who:"you",text},{who:"ai",html:r.html,meta:r.meta});
  renderImprove(); buildNav(); refreshImproveCounts(); save();
  return r.html+`<div style="margin-top:9px;font-size:11.5px;color:var(--ink3)">Logged to <b style="color:#c4b0ff">Improve This App</b> so it doesn't get lost.</div>`;
}

/* ================= KEEPING THE APP UP TO DATE =================
   An installed app caches itself, which is what makes it work with no signal.
   The cost is that it can sit on an old copy without telling you. This checks
   a tiny file on every open and says so plainly when there's something newer. */
function showUpdateBanner(newBuild){
  let el=$("updBar");
  if(!el){ el=document.createElement("div"); el.id="updBar"; el.className="updbar";
    document.body.appendChild(el); }
  el.innerHTML=`<div style="flex:1;min-width:0">
      <b>A newer version is ready</b>
      <span>You're on ${esc(BUILD)}${newBuild?` · newest is ${esc(newBuild)}`:``}</span></div>
    <div class="crbtn take" style="background:#0d2620;color:#4fd6a5;border:1px solid rgba(18,201,138,.45)"
         onclick="forceUpdate()">Update</div>
    <div class="xx" style="cursor:pointer;padding:0 6px" onclick="this.parentElement.remove()">✕</div>`;
  el.style.display="flex";
}

/* Throw away every cached copy and come back fresh. This is the button that
   gets you unstuck when the app is being stubborn. */
async function forceUpdate(){
  toast("Getting the newest version…");
  try{
    if("serviceWorker" in navigator){
      const regs=await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r=>r.unregister()));
    }
    if(window.caches){ const keys=await caches.keys(); await Promise.all(keys.map(k=>caches.delete(k))); }
  }catch(e){}
  // cache-busted address so the phone can't hand back the old page again
  const base=location.href.split("?")[0].split("#")[0];
  location.replace(base+"?fresh="+Date.now());
}

async function checkForUpdate(loud){
  try{
    const r=await fetch("version.json?t="+Date.now(), {cache:"no-store"});
    if(!r.ok) throw new Error("HTTP "+r.status);
    const j=await r.json();
    if(j.build && j.build!==BUILD){ showUpdateBanner(j.build);
      if(loud) toast("Newer version found — tap Update"); return j.build; }
    if(loud) toast("You're on the newest version ("+BUILD+")");
    return null;
  }catch(e){ if(loud) toast("Couldn't check — no connection?"); return null; }
}

/* ================= KEYBOARD ACCESS =================
   The app is built out of divs and spans carrying onclick handlers. That is
   fine for a thumb, but it left every one of them unreachable by keyboard —
   no tab stop, no way to activate. Rather than rewrite several hundred
   elements, anything clickable is given a tab stop and a button role as it
   appears, and Enter / Space activate whatever is focused. */
const NATIVELY_FOCUSABLE = new Set(["BUTTON","A","INPUT","SELECT","TEXTAREA","OPTION"]);
let _a11yQueued=false;
function markClickables(){
  _a11yQueued=false;
  try{
    document.querySelectorAll("[onclick]:not([tabindex])").forEach(el=>{
      if(NATIVELY_FOCUSABLE.has(el.tagName)) return;
      el.setAttribute("tabindex","0");
      if(!el.getAttribute("role")) el.setAttribute("role","button");
    });
  }catch(e){}
}
function queueA11y(){ if(_a11yQueued) return; _a11yQueued=true; requestAnimationFrame(markClickables); }
document.addEventListener("keydown", e=>{
  if(e.key!=="Enter" && e.key!==" " && e.key!=="Spacebar") return;
  const el=document.activeElement;
  if(!el || NATIVELY_FOCUSABLE.has(el.tagName)) return;
  if(!el.hasAttribute("onclick")) return;
  e.preventDefault();
  el.click();
});
/* Escape closes whatever is open, which is what every other app does. */
document.addEventListener("keydown", e=>{
  if(e.key!=="Escape") return;
  if($("lockScreen") && $("lockScreen").style.display==="flex") return;   // never dismiss the lock
  closeAll();
});
new MutationObserver(queueA11y).observe(document.body,{childList:true,subtree:true});

/* ================= BOOT ================= */
/* ORDER MATTERS HERE.
   This block used to draw Today, Tracker, Projects, Categories and the Add-task
   project picker BEFORE loadSaved() ran, and never drew them again afterwards.
   Every one of those screens was therefore painted from the built-in sample
   list: reopen the app and tasks you had ticked off came back unticked, and
   anything you had added since was missing until some other action happened to
   repaint. Load first, then draw once, from the real data. */
const RESTORED = loadSaved();
loadSync();
if(!RESTORED) seedNotes();
loadKey();

/* Give any task that has never been ordered a position, but never renumber
   tasks that already carry an order — that is the order you dragged them into. */
(function seedOrder(){
  let next = tasks.reduce((m,t)=>Math.max(m, Number.isFinite(t.order)?t.order:-1), -1);
  tasks.forEach(t=>{ if(!Number.isFinite(t.order)) t.order = ++next; });
})();
tasks.forEach(t=>{ if(isCounter(t)) t.done = t.count>=t.target; });

$("todayDate").textContent=new Date().toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"});
seedHistory(); seedWorkouts(); buildNav();
seedMissLog(); seedWeek();
buildForm(); syncProjPicker(); syncMakeup();
render(); renderUpcoming(); renderStages(); renderTracker(); renderDayNote(); renderCarry();
renderProjects(); renderCategories();
renderWhyNot(); renderNotif(); renderCal(); renderOverview(); renderTasks(); renderRoutines(); renderNotes(); renderProgress(); renderV2(); renderSettings(); renderMeals(); mountImproveButtons(); paintAIBadge(); renderStartPicks();
const _b=$("drBuild"); if(_b) _b.textContent=BUILD;
/* If loading had to fall back or hold saving, say so plainly rather than
   letting you discover it later by finding things missing. */
if(LOAD_PROBLEM) setTimeout(()=>toast(LOAD_PROBLEM), 900);
if("serviceWorker" in navigator && location.protocol.startsWith("http")){
  /* updateViaCache:"none" matters more than it looks. Without it the browser is
     allowed to serve sw.js from its own cache for up to a day, so a new version
     never installs and the app on your phone stays frozen on an old build. */
  navigator.serviceWorker.register("sw.js", {updateViaCache:"none"}).then(reg=>{
    reg.update().catch(()=>{});
    reg.addEventListener("updatefound", ()=>{
      const nw=reg.installing; if(!nw) return;
      nw.addEventListener("statechange", ()=>{
        if(nw.state==="installed" && navigator.serviceWorker.controller) showUpdateBanner();
      });
    });
  }).catch(()=>{});
  let _swReloaded=false;
  navigator.serviceWorker.addEventListener("controllerchange", ()=>{
    if(_swReloaded) return; _swReloaded=true; location.reload();
  });
}
if(!STORE_OK) console.log("Momentum: storage unavailable — running in memory for this session.");
save();
view={x:window.innerWidth/2,y:110,s:1}; applyView();
if(P.nodes && P.nodes.length){          // you left a web open — put it back
  $("startwrap").classList.add("hidden");
  renderStages(); drawWeb(); updateCta(); setTimeout(fitView,120);
}

/* Check for anything the other device sent up, a moment after the app is drawn
   so opening never feels slow. Quiet on purpose — it only speaks up if there's
   a clash or something went wrong. */
/* If there's a key we've never actually confirmed, check it once, quietly.
   Better to know now than to find out from a week of generic answers. */
/* The day has to turn over even if the app is just sitting there. Three nudges:
   once on open, whenever you come back to it, and a quiet minute timer. */
/* Before anything is drawn, so nothing flashes on screen first. */
showLock();

checkRollover();

/* Pull-to-refresh used to dump you back on the home screen, because a reload
   always started from the default view. The last page you were on is remembered
   for this session only — so a refresh stays put, but opening the app fresh
   still starts at the top. A deep link from a notification overrides it. */
try{
  const v=sessionStorage.getItem("momentum.view");
  if(v && $("view-"+v) && !location.hash) go(v);
}catch(e){}

setTimeout(handleDeepLink, 300);
/* Tapping a notification while Momentum is already open only changes the
   fragment — the page never reloads, so boot code won't run again. */
window.addEventListener("hashchange", handleDeepLink);
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="visible") checkRollover(); });
window.addEventListener("focus", ()=>checkRollover());
setInterval(checkRollover, 60000);

setTimeout(()=>checkForUpdate(false), 3000);

if(AI.on && AI.ok===null) setTimeout(()=>{
  callAI("Reply with exactly: OK","Say OK",20).then(()=>paintAIBadge()).catch(()=>{});
}, 2500);

if(sync.on && sync.room) setTimeout(()=>{
  if(sync.justPulled){ sync.justPulled=false; sync.lastAt=localStamp()||sync.lastAt; saveSync(); }
  syncNow(true).catch(()=>{});
  drainInbox(true).catch(()=>{});     // anything the watch left while you were away
}, 1200);

/* Keep the two in step without you thinking about it: while the app is open it
   checks every 45 seconds, and again the moment you come back to it. Merging is
   silent, so this can run as often as it likes. */
let _syncTick=null;
function startSyncLoop(){
  clearInterval(_syncTick);
  if(!sync.on || !sync.room) return;
  _syncTick=setInterval(()=>{
    if(document.visibilityState==="visible") syncNow(true).catch(()=>{});
  }, 45000);
}
startSyncLoop();
document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState==="visible" && sync.on && sync.room){
    syncNow(true).catch(()=>{});
    drainInbox(true).catch(()=>{});
  }
});

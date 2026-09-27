/* ================= Momentum v53 =================
   Loaded after app.js. Everything new lives here so the older code stays as it
   was and is easy to compare:
     1. Claude through your Netlify site (no key on the phone, none in sync)
     2. Five tabs at the bottom instead of eighteen menu items
     3. One + button
     4. Ask Momentum as a real page, on every page, able to make changes (with Undo)
     5. Morning plan and Sunday coach cards
     6. Workouts: rest timer and a next-weight nudge
     7. Home-screen shortcuts, back button that goes back, empty states
*/
(function(){
"use strict";


/* ---------------------------------------------------------------------------
   0. TEST COPY ON GITHUB PAGES
   The free test site has no server of its own, so it borrows the live site's
   (sync, AI, health). Its saved data is separate from the real app's, because
   it's a different web address. A banner makes it obvious which one you're in.
   --------------------------------------------------------------------------- */
const LIVE_FN = "https://bucolic-buttercream-de5eac.netlify.app/.netlify/functions/sync";
const IS_TEST = /github\.io$/i.test(location.hostname);
if(IS_TEST && (!sync.url || sync.url.charAt(0)==="/")){ sync.url = LIVE_FN; try{ saveSync(); }catch(e){} }
function testBanner(){
  if(!IS_TEST || document.getElementById("testBanner")) return;
  const b = document.createElement("div"); b.id = "testBanner";
  b.textContent = "TEST COPY — safe to play with. Your real app is on Netlify.";
  b.style.cssText = "position:sticky;top:0;z-index:130;text-align:center;padding:5px 10px;font-size:11px;font-weight:900;"
    + "letter-spacing:.08em;background:#ffb020;color:#1a1200;";
  document.body.insertBefore(b, document.body.firstChild);
}

/* ---------------------------------------------------------------------------
   1. CLAUDE THROUGH THE SITE
   --------------------------------------------------------------------------- */
const aiURL = () => (sync.url || "/.netlify/functions/sync").replace(/\/sync\/?$/, "/ai").replace(/\/$/, "");
AI.server = null;          // null = not checked yet, true = the site has ANTHROPIC_API_KEY, false = it doesn't

const _paintAIBadge = paintAIBadge;
paintAIBadge = function(){
  AI.on = !!AI.key || AI.server === true;
  try{ _paintAIBadge(); }catch(e){}
  const b = document.getElementById("modeBadge");
  if(b && AI.server === true && AI.ok !== false){
    b.textContent = "LIVE AI";
    b.style.background = "rgba(18,201,138,.16)"; b.style.color = "#4fd6a5";
    b.style.border = "1px solid rgba(18,201,138,.4)";
  }
};
saveKey = function(){
  setTimeout(paintAIBadge, 0);
  try{ window.localStorage.setItem(AI_KEY_STORE,
    JSON.stringify({provider:AI.provider, key:AI.key, model:AI.model, ok:AI.ok})); }catch(e){}
  AI.on = !!AI.key || AI.server === true;
};
const _forgetKey = forgetKey;
forgetKey = function(){ _forgetKey(); AI.on = AI.server === true; paintAIBadge(); renderSettings(); };

const _aiPlainError = aiPlainError;
aiPlainError = function(msg){
  const m = (msg || "").toLowerCase();
  if(/limit is used up|cap/.test(m)) return "Today's AI limit is used up. It resets at midnight UTC.";
  if(/turn on sync|no_room|sync code isn't in use/.test(m))
    return "AI goes through your site and needs sync on. Settings → Sync your devices → Turn on here.";
  if(/anthropic_api_key isn't set|no_key/.test(m))
    return "Your Netlify site doesn't have ANTHROPIC_API_KEY yet. Settings shows the steps.";
  return _aiPlainError(msg);
};

async function directCall(system, user, maxTokens, opts){
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{"content-type":"application/json","x-api-key":AI.key,
      "anthropic-version":"2023-06-01","anthropic-dangerous-direct-browser-access":"true"},
    body:JSON.stringify({model:(opts&&opts.model)||AI.model, max_tokens:maxTokens||900, system,
      messages:(opts&&opts.messages)||[{role:"user",content:user}]})
  });
  if(!r.ok) throw new Error((await r.text()).slice(0,200));
  const j = await r.json();
  return (j.content||[]).map(c=>c.text||"").join("");
}
async function serverCall(system, user, maxTokens, opts){
  const r = await fetch(aiURL(), {
    method:"POST",
    headers:{"content-type":"application/json","x-momentum-room":sync.room||""},
    body:JSON.stringify({model:(opts&&opts.model)||AI.model, max_tokens:maxTokens||900, system,
      user, messages:(opts&&opts.messages)||undefined})
  });
  const j = await r.json().catch(()=>({}));
  if(!r.ok){ const e = new Error(j.message || j.error || ("HTTP "+r.status)); e.code = j.error; throw e; }
  return j.text || "";
}

callAI = async function(system, user, maxTokens, opts){
  AI.on = !!AI.key || AI.server === true;
  if(!AI.on) return null;
  const t0 = Date.now();
  try{
    let text;
    if(AI.server === true && sync.room){
      try{ text = await serverCall(system, user, maxTokens, opts); }
      catch(e){
        // the site can't do it (no key yet, sync not set up) — use this device's key if it has one
        if(AI.key && /no_key|no_room|unknown_room/.test(e.code||"")) text = await directCall(system, user, maxTokens, opts);
        else throw e;
      }
    } else if(AI.key){
      text = await directCall(system, user, maxTokens, opts);
    } else {
      throw new Error(AI.server === true ? "Turn on sync — no_room" : "no_key");
    }
    AI.lastError=""; AI.ok=true; AI.fails=0; saveKey();
    console.log(`[Momentum AI] ${Date.now()-t0}ms`);
    return text.replace(/```html|```/g,"").trim();
  }catch(e){
    AI.lastError=e.message; AI.lastErrorAt=Date.now(); AI.ok=false; AI.fails=(AI.fails||0)+1; saveKey();
    console.warn("[Momentum AI] failed:", e.message);
    if(AI.fails===1 && !(opts&&opts.quiet)) setTimeout(()=>toast("AI call failed — "+aiPlainError(e.message).slice(0,70)),300);
    return null;
  }
};

/* Find out whether the site holds the key, and clear a stale "not working"
   badge by actually trying, instead of trusting an old failure forever. */
async function aiProbe(){
  if(hlPrefs && hlPrefs.aiOff){ AI.server=false; paintAIBadge(); return; }
  try{
    const r = await fetch(aiURL(), {cache:"no-store"});
    const j = await r.json();
    AI.server = !!j.ready;
  }catch(e){ AI.server = false; }
  AI.on = !!AI.key || AI.server === true;
  if(AI.on && AI.ok !== true){
    AI.ok = null; paintAIBadge();
    const r = await callAI("Reply with exactly: OK", "Say OK", 5, {model:"claude-haiku-4-5", quiet:true});
    AI.ok = !!r; saveKey();
  }
  paintAIBadge();
  const v = document.querySelector(".view.active");
  if(v && v.id==="view-settings") renderSettings();
  if(v && v.id==="view-think") drawThink();
}
window.aiProbe = aiProbe;

/* Move to a longer sync code without losing anything. */
window.lengthenRoom = async function(){
  if(!sync.on || !sync.room){ toast("Sync isn't on"); return; }
  if(!await ask("Switch to a longer, safer sync code?\n\nYour data moves to the new code. "
    + "Afterwards, type the new code into your other device (Settings → Sync → Use a different code).","Switch")) return;
  const old = sync.room;
  sync.room = newRoomCode(); saveSync();
  const res = await syncPush(true, "Moved to the new code");
  if(/couldn't/i.test(res||"")){ sync.room = old; saveSync(); toast("Couldn't reach your site — kept the old code"); renderSettings(); return; }
  try{
    const base = (sync.url||"/.netlify/functions/sync").replace(/\/$/,"");
    await fetch(base+"?room="+encodeURIComponent(old), {method:"POST", headers:{"content-type":"application/json"},
      body:JSON.stringify({blob:null, wipe:true, at:Date.now()})});
  }catch(e){}
  renderSettings();
  toast("New code: "+sync.room+" — type it into your other device");
};

/* Settings: say plainly where AI comes from, and how to finish setting it up. */
const _renderSettings = renderSettings;
renderSettings = function(){
  _renderSettings();
  const box = document.getElementById("stBody"); if(!box) return;
  const old = document.getElementById("v53ai"); if(old) old.remove();
  const c = document.createElement("div"); c.className = "card"; c.id = "v53ai";
  const live = AI.server === true;
  c.innerHTML = `<div class="card-head"><span class="card-title">Claude AI</span>
      <span class="link" style="color:${live&&AI.ok!==false?'#4fd6a5':'#ffb26b'}">${
        AI.server===null?"Checking…":live?(AI.ok===false?"Site key not answering":"Connected"):"Not on the site yet"}</span></div>
    ${live ? `<div class="aistat ok"><b>Your key lives on your Netlify site.</b> This device doesn't need a copy, and
        nothing about the key goes through sync.${sync.room?"":" <br><b>One thing left:</b> turn on sync below — AI checks your sync code so strangers can't use it."}
        ${AI.key?`<div class="wk-row" style="padding:10px 0 0"><button class="b b-ghost" style="width:100%" onclick="forgetKey()">Remove the old key from this device</button></div>`:``}</div>`
      : `<div class="aistat todo"><b>Move your key to the site (one time, about 2 minutes):</b>
        <ol>
          <li>Open <b>app.netlify.com</b> and click your Momentum site (<code>bucolic-buttercream-de5eac</code>).</li>
          <li>Click <b>Project configuration</b> → <b>Environment variables</b> → <b>Add a variable</b>.</li>
          <li>Key: <code>ANTHROPIC_API_KEY</code>. Value: your key from console.anthropic.com (starts with sk-ant-).</li>
          <li>Tick <b>Contains secret values</b>, then <b>Create variable</b>.</li>
          <li>Go to <b>Deploys</b> → <b>Trigger deploy</b> → <b>Deploy project</b> (so the site picks it up).</li>
        </ol>
        ${AI.key?"Until then, this device keeps using the key saved on it.":""}
        <div class="wk-row" style="padding:10px 0 0"><button class="b b-ghost" style="width:100%" onclick="aiProbe()">Check again</button></div></div>`}
  `;
  box.insertBefore(c, box.firstChild);
};

/* ---------------------------------------------------------------------------
   2. FIVE TABS
   --------------------------------------------------------------------------- */
const HUBS = [
  {k:"today",  label:"Today",  pages:[["today","Today"],["overview","This week"]]},
  {k:"plan",   label:"Plan",   pages:[["calendar","Calendar"],["tasks","Tasks"],["projects","Projects"],["routines","Routines"],["categories","Categories"]]},
  {k:"think",  label:"Ask",    pages:[["think","Ask Momentum"],["planner","Problem Solver"],["notes","Notes"]]},
  {k:"body",   label:"Body",   pages:[["workouts","Workouts"],["meals","Meals"],["health","Health"]]},
  {k:"review", label:"Review", pages:[["tracker","Tracker"],["progress","Progress"],["whynot","Why Not"]]}
];
const HUB_OF = {}; HUBS.forEach(h=>h.pages.forEach(p=>HUB_OF[p[0]]=h.k));
const lastIn = {};
const TAB_IC = {
  today:IC.today, plan:IC.calendar, body:IC.workouts, review:IC.progress
};
window.HUBS = HUBS;

function buildThinkView(){
  if(document.getElementById("view-think")) return;
  const v = document.createElement("div"); v.className = "view"; v.id = "view-think";
  v.innerHTML = `
    <div class="topbar">
      <div class="iconbtn" onclick="openDrawer()"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></div>
      <div class="titleblock">
        <div class="brand"><svg class="spark" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.2 6.1L20.4 10l-6.2 1.9L12 18l-2.2-6.1L3.6 10l6.2-1.9z"/></svg>Momentum</div>
        <h1>Ask Momentum</h1>
        <div class="date">Ask anything, or tell it what to do</div>
      </div>
      <div class="iconbtn" title="Clear the chat" onclick="clearThink()"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg></div>
    </div>
    <div class="wrap">
      <div id="thCtx"></div>
      <div class="card"><div class="chat" id="thChat"></div></div>
      <div class="qsug" id="thSug"></div>
      <div class="thnote" id="thNote"></div>
    </div>
    <div class="thbar"><div class="in">
      <textarea class="f" id="thInput" rows="1" placeholder="Ask, or tell it what to do…"
        onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendThink();}"></textarea>
      <button class="sendb" onclick="sendThink()" aria-label="Send">
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h15M13 6l6 6-6 6"/></svg></button>
    </div></div>`;
  const anchor = document.getElementById("view-planner");
  anchor.parentNode.insertBefore(v, anchor);
}

function buildTabbar(){
  if(document.getElementById("tabbar")) return;
  const t = document.createElement("div"); t.className = "tabbar"; t.id = "tabbar";
  t.innerHTML = `<div class="tbin">${HUBS.map(h=> h.k==="think"
    ? `<div class="tab think" data-hub="think" onclick="goHub('think')"><div class="orb">✦</div>${h.label}</div>`
    : `<div class="tab" data-hub="${h.k}" onclick="goHub('${h.k}')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${TAB_IC[h.k]||""}</svg>${h.label}</div>`).join("")}</div>`;
  document.body.appendChild(t);
}

function buildSubnavs(){
  HUBS.forEach(h=>{
    if(h.pages.length<2) return;
    h.pages.forEach(([k])=>{
      const v = document.getElementById("view-"+k); if(!v || v.querySelector(".subnav")) return;
      const s = document.createElement("div"); s.className = "subnav";
      s.innerHTML = h.pages.map(([pk,pl])=>`<span data-p="${pk}" class="${pk===k?"on":""}" onclick="go('${pk}')">${pl}</span>`).join("");
      const bar = v.querySelector(".topbar, .pl-bar");
      if(bar) bar.insertAdjacentElement("afterend", s); else v.insertBefore(s, v.firstChild);
    });
  });
}

window.goHub = function(k){
  const h = HUBS.find(x=>x.k===k); if(!h) return;
  const cur = curView();
  // tapping the tab you're already on goes back to its first page, like most apps
  const target = (HUB_OF[cur]===k) ? h.pages[0][0] : (lastIn[k] || h.pages[0][0]);
  go(target);
  window.scrollTo(0,0);
};
const curView = () => ((document.querySelector(".view.active")||{}).id||"view-today").replace("view-","");
window.curView = curView;

/* Back goes to the page you were on, not always to Today. */
let navStack = [], skipPush = false;
window.navBack = function(){
  const cur = curView();
  let v = null;
  while(navStack.length){ const x = navStack.pop(); if(x !== cur && document.getElementById("view-"+x)){ v = x; break; } }
  skipPush = true;
  return v || "today";
};

const _go = go;
go = function(view){
  if(!document.getElementById("view-"+view)) view = "today";
  const cur = curView();
  if(!skipPush && cur && cur !== view){ navStack.push(cur); if(navStack.length>40) navStack.shift(); }
  skipPush = false;
  if(view === "think"){
    rememberScrollSafe();
    document.querySelectorAll(".view").forEach(v=>v.classList.remove("active"));
    document.getElementById("view-think").classList.add("active");
    closeAll();
    try{ sessionStorage.setItem("momentum.view","think"); }catch(e){}
    drawThink();
    setTimeout(()=>{ const c=document.getElementById("thChat"); if(c) window.scrollTo(0, document.body.scrollHeight); }, 30);
  } else {
    _go(view);
  }
  afterGo(view);
};
function rememberScrollSafe(){ try{ rememberScroll(); }catch(e){} }

function afterGo(view){
  const hub = HUB_OF[view];
  if(hub) lastIn[hub] = view;
  document.querySelectorAll("#tabbar .tab").forEach(t=>t.classList.toggle("on", t.dataset.hub===hub));
  document.querySelectorAll(".view.active .subnav span").forEach(s=>s.classList.toggle("on", s.dataset.p===view));
  const pf = document.getElementById("plusFab");
  if(pf) pf.classList.toggle("on", !["think","planner","settings","tracker","workouts"].includes(view));
  const rc = document.getElementById("restChip");
  if(rc && view!=="workouts") rc.classList.remove("on");
  if(view==="progress") tidyProgress();
  if(view==="tracker") tidyTracker();
  if(view==="today") paintTodayCards();
}

/* The drawer becomes "More": search, then the three setup pages. */
function slimDrawer(){
  NAV.length = 0;
  NAV.push({sec:"Setup & feedback"},
    {k:"settings",label:"Settings",live:1},
    {k:"improve",label:"Improve This App",live:1},
    {k:"v2",label:"V2 Ideas",live:1});
  buildNav();
}
openAsk = function(){ closeAll(); thCtx = null; go("think"); };

/* ---------------------------------------------------------------------------
   3. ONE + BUTTON
   --------------------------------------------------------------------------- */
function buildPlus(){
  if(document.getElementById("plusFab")) return;
  const b = document.createElement("button"); b.className = "plusfab"; b.id = "plusFab";
  b.setAttribute("aria-label","Add something");
  b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`;
  b.onclick = openPlus;
  document.body.appendChild(b);
  const s = document.createElement("div"); s.className = "sheet"; s.id = "plusSheet";
  s.innerHTML = `<div class="handle"></div><div class="sheet-pad"><h2>Add</h2><div id="plusBody"></div></div>`;
  document.body.appendChild(s);
  // Today's old "+ Add task" button now opens the same menu
  const tf = document.querySelector("#view-today .fab"); if(tf) tf.style.display = "none";
}
function openPlus(){
  const counters = tasks.filter(t=>isCounter(t) && onToday(t) && !t.paused && t.count < t.target);
  document.getElementById("plusBody").innerHTML = `
    <div class="pluslist">
      <div class="plusopt" onclick="closeAll();openAdd(false)"><span class="pi">✅</span><b>Task</b><span>Something to get done once</span></div>
      <div class="plusopt" onclick="closeAll();openRoutine()"><span class="pi">🔁</span><b>Routine</b><span>Something you repeat</span></div>
      <div class="plusopt" onclick="closeAll();openBraindump()"><span class="pi">🧠</span><b>Braindump</b><span>Dump it all, it gets sorted</span></div>
      <div class="plusopt" onclick="closeAll();askAbout(null,'note: ')"><span class="pi">📝</span><b>Note</b><span>Jot something down</span></div>
    </div>
    ${counters.length?`<div style="font-size:10px;font-weight:900;letter-spacing:.14em;color:var(--ink3);margin-top:16px">QUICK LOG</div>
      <div class="quicklog">${counters.map(t=>`<span onclick="quickLog(${t.id},1)">+1 ${esc(t.name)} · ${t.count}/${t.target}</span>`).join("")}</div>`:``}
    <div class="btns"><button class="b b-violet" style="width:100%" onclick="closeAll();go('think')">✦ Just tell the assistant</button></div>`;
  closeAll(); openSheet("plusSheet");
}
window.openPlus = openPlus;
window.quickLog = function(id, n){
  const t = getTask(id); if(!t) return;
  setCount(id, t.count + n);
  closeAll();
  toast(`${t.name}: ${t.count} of ${t.target}`);
};

/* ---------------------------------------------------------------------------
   4. ASK MOMENTUM — a page, on every page, and it can make changes
   --------------------------------------------------------------------------- */
const TH_STORE = "momentum.think";
let thMsgs = [];
try{ thMsgs = JSON.parse(localStorage.getItem(TH_STORE)||"[]") || []; }catch(e){ thMsgs = []; }
let thCtx = null, thBusy = false;
function thSave(){ try{ localStorage.setItem(TH_STORE, JSON.stringify(thMsgs.slice(-40))); }catch(e){} }

const PAGE_HELP = {
  today:"Today: the plan for today. Routines with a number (water, meds, steps) have − ½ + buttons. Tap a row to open it. Anything not done can be reviewed in the evening check-in.",
  overview:"This week: the whole week at a glance — tasks done, routines kept, what's overdue or blocked, and active projects.",
  calendar:"Calendar: the week laid out by day. Plan My Week fills work days to about 75% and leaves the rest as buffer.",
  tasks:"Tasks: every one-time task. Filter, search, select several at once, set dates and priorities.",
  projects:"Projects: groups of tasks with a goal. Each shows how many of its tasks are done.",
  routines:"Routines: things that repeat. A routine with a target above 1 (like 8 glasses) becomes a counter and gets a card on the Tracker.",
  categories:"Categories: Category → Project → Task. Business, Important Personal, Personal and their sub-groups.",
  planner:"Problem Solver: type a problem, answer the questions it asks, and it builds a web of prompts and solutions. Plans save on their own and appear down the left edge.",
  notes:"Notes: everything you've noted, loose or attached to a task, project or web.",
  workouts:"Workouts: your lifting splits and cardio. Start a session, type or tap reps, weight in pounds. A rest timer starts after each set.",
  meals:"Meals: log food by typing it or taking a photo. Calories and protein against your targets.",
  health:"Health: steps, water, meds, sleep, blood pressure, stress. Watch data comes in through the inbox (Settings → Sync).",
  tracker:"Tracker: one card per counting routine. The grid is one square per day with the date on it; solid = hit the target, faded = some, empty = none. Streak, best run, days hit and daily average underneath.",
  progress:"Progress: this week against last week, how consistent each routine is, and which projects moved.",
  whynot:"Why Not: the reasons you gave when something didn't get done, ranked, so patterns show up.",
  settings:"Settings: your data, backups, privacy, PIN, sync between devices, work hours, and Claude AI.",
  v2:"V2 Ideas: ideas parked on purpose so the app doesn't get bloated.",
  improve:"Improve This App: every suggestion you've made about the app, grouped by page."
};

const THINK_SYSTEM = `You are the assistant inside Momentum, Pete's personal app for tasks, routines, projects, workouts and meals.
You can see his real data below. Use it — never ask him to repeat something that's already there.

How to answer:
- Plain, everyday words. Short. Specific. Use his task and project names.
- If something is blocked or waiting, say so.
- If he asks how the app works, explain it simply in steps.
- Reply in simple HTML only: <div>, <b>, <ul>, <li>, <br>. No markdown, no headings, no code fences.
- Under 170 words unless he asks for more.

Making changes:
When he asks you to DO something (add, finish, move, log, note, open a page), do it by adding ONE block at the very end:
<actions>[ ... ]</actions>
containing a JSON array. Allowed items:
{"type":"add_task","name":"...","date":"YYYY-MM-DD or null","est":30}
{"type":"complete","task":"exact task or routine name"}
{"type":"move","task":"exact task name","date":"YYYY-MM-DD"}
{"type":"log","counter":"exact counter routine name","amount":1}   (amount may be 0.5)
{"type":"note","text":"..."}
{"type":"open","page":"today|overview|calendar|tasks|projects|routines|categories|planner|notes|workouts|meals|health|tracker|progress|whynot|settings"}
Only include actions he actually asked for. Never invent tasks he didn't mention. Use names exactly as they appear in his data.
In the visible reply, say in one short line what you changed. The app shows an Undo button for each change.`;

function pageContext(k){
  if(!k) return "";
  const nm = (PAGES[k]&&PAGES[k].n) || k;
  let s = `\n\nHE IS LOOKING AT THE ${nm.toUpperCase()} PAGE RIGHT NOW. ${PAGE_HELP[k]||""}`;
  if(k==="tracker"){
    s += "\nCOUNTERS: " + tasks.filter(isCounter).map(t=>{
      const h=(history[t.id]||[]); const hit=h.filter(x=>x.v>=t.target).length;
      return `${t.name} ${t.count}/${t.target} today, hit ${hit} of ${h.length} past days, streak ${t.streak}`; }).join("; ");
  }
  return s;
}

function safeHTML(html){
  const ok = {DIV:1,B:1,STRONG:1,I:1,EM:1,UL:1,OL:1,LI:1,BR:1,P:1,SPAN:1};
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const walk = n => { [...n.childNodes].forEach(c=>{
    if(c.nodeType===1){
      if(!ok[c.tagName]){ c.replaceWith(document.createTextNode(c.textContent)); return; }
      [...c.attributes].forEach(a=>c.removeAttribute(a.name));
      walk(c);
    }
  }); };
  walk(doc.body.firstChild);
  return doc.body.firstChild.innerHTML;
}

function thSuggestions(){
  const blocked = tasks.filter(t=>!t.done && !t.routine && t.blockedBy).length;
  const k = thCtx;
  const list = k ? [`How does ${(PAGES[k]&&PAGES[k].n)||"this page"} work?`, "What's missing here?", "What should I do next?"]
    : ["Plan my day", "What should I do first?", "Log a glass of water",
       blocked?`Help me unstick my ${blocked} blocked tasks`:"What's overdue?",
       "Add a task to call the tint guy tomorrow", "How is my training going?", "Give me my weekly coach note"];
  return list.map(x=>`<span onclick="thSuggest(this)">${esc(x)}</span>`).join("");
}
window.thSuggest = el => { document.getElementById("thInput").value = el.textContent; sendThink(); };

function drawThink(){
  const c = document.getElementById("thChat"); if(!c) return;
  const ctx = document.getElementById("thCtx");
  ctx.innerHTML = thCtx ? `<span class="thctx">About: ${esc((PAGES[thCtx]&&PAGES[thCtx].n)||thCtx)} <i onclick="setThinkCtx(null)">✕</i></span>` : "";
  c.innerHTML = thMsgs.length ? thMsgs.map((m,i)=>{
    if(m.role==="user") return `<div class="bub you">${esc(m.text)}</div>`;
    const acts = (m.acts||[]).map((a,j)=>`<div class="actcard ${a.state==="undone"?"undone":a.state==="failed"?"failed":""}">
        <div class="at">${a.state==="failed"?"⚠️":a.state==="undone"?"↩":"✓"} ${esc(a.label)}</div>
        ${a.state==="done"&&a.undo?`<div class="ab" onclick="undoThink(${i},${j})">UNDO</div>`:``}</div>`).join("");
    return `<div class="bub ai">${m.html}</div>${acts}`;
  }).join("") : `<div style="font-size:13px;color:var(--ink2);line-height:1.65;padding:6px 2px">
      It can see your <b style="color:#fff">${tasks.filter(t=>!t.routine).length} tasks</b>,
      <b style="color:#fff">${tasks.filter(t=>t.routine).length} routines</b>,
      <b style="color:#fff">${PROJECTS.length} projects</b>, your workouts, calendar and notes.<br><br>
      Ask it anything, or tell it to do something — "move flyers to Tuesday", "I took half my meds", "add a task…".
      Changes it makes can be undone right here.</div>`;
  document.getElementById("thSug").innerHTML = thSuggestions();
  document.getElementById("thSug").style.display = thMsgs.length && !thCtx ? "none" : "flex";
  const note = document.getElementById("thNote");
  note.innerHTML = (AI.on) ? "" : `Using the built-in brain — it handles simple commands. For real answers, finish the Claude setup in <span class="link" onclick="go('settings')">Settings</span>.`;
}
window.drawThink = drawThink;
window.setThinkCtx = k => { thCtx = k; drawThink(); };
window.clearThink = () => { thMsgs = []; thSave(); drawThink(); };

/* Open the assistant already knowing which page you came from. */
window.askAbout = function(page, prefill){
  if(page==="health" && typeof openAskHealth==="function"){ openAskHealth(); return; }   // health stays on its own private road
  thCtx = page || null;
  go("think");
  const i = document.getElementById("thInput");
  if(i){ i.value = prefill || ""; setTimeout(()=>i.focus(), 60); }
};

window.sendThink = async function(textIn){
  const inp = document.getElementById("thInput");
  const text = (textIn || (inp&&inp.value) || "").trim(); if(!text || thBusy) return;
  if(inp) inp.value = "";
  thMsgs.push({role:"user", text}); drawThink();
  if(!AI.on){
    const html = askBrain(text);
    thMsgs.push({role:"assistant", html, raw:""}); thSave(); drawThink(); scrollThink(); return;
  }
  thBusy = true;
  thMsgs.push({role:"assistant", html:`<span class="thinkdot"></span> Thinking…`, raw:"", pending:true}); drawThink(); scrollThink();
  const history = thMsgs.filter(m=>!m.pending).slice(-12).map(m=>({role:m.role, content: m.role==="user" ? m.text : (m.raw||m.html||"")}))
    .filter(m=>m.content);
  // the API needs the conversation to start with him and alternate
  while(history.length && history[0].role!=="user") history.shift();
  const system = THINK_SYSTEM + pageContext(thCtx) + `\n\nTODAY'S DATE: ${TODAY_KEY}\n\nHIS DATA:\n` + appContext();
  const r = await callAI(system, text, 1400, {messages: history});
  thMsgs.pop();
  thBusy = false;
  if(!r){
    thMsgs.push({role:"assistant", html: fellBack() + askBrain(text), raw:""});
  } else {
    let acts = [];
    const m = r.match(/<actions>([\s\S]*?)<\/actions>/i);
    if(m){ try{ acts = JSON.parse(m[1].trim()); if(!Array.isArray(acts)) acts=[acts]; }catch(e){ acts = []; } }
    const shown = r.replace(/<actions>[\s\S]*?<\/actions>/ig, "").trim();
    const msg = {role:"assistant", html: aiBadge() + safeHTML(shown||"Done."), raw: r, acts: []};
    acts.slice(0,8).forEach(a=>msg.acts.push(runAction(a)));
    thMsgs.push(msg);
  }
  thSave(); drawThink(); scrollThink();
};
function scrollThink(){ setTimeout(()=>window.scrollTo({top:document.body.scrollHeight, behavior:"smooth"}), 40); }

function refreshAll(){
  save();
  ["render","renderTasks","renderCal","renderProjects","renderRoutines","renderNotes","renderCategories","renderNotif","renderTracker"]
    .forEach(f=>{ try{ if(typeof window[f]==="function") window[f](); }catch(e){} });
}
function findCounter(name){
  const s = String(name||"").toLowerCase();
  const list = tasks.filter(isCounter);
  return list.find(t=>t.name.toLowerCase()===s) || list.find(t=>s && (t.name.toLowerCase().includes(s) || s.includes(t.name.toLowerCase())))
      || list.find(t=>s.includes(String(t.unit||"").toLowerCase()) && t.unit);
}
function findTaskByName(name){
  const s = String(name||"").toLowerCase().trim(); if(!s) return null;
  return tasks.find(t=>t.name.toLowerCase()===s) || findTask(s);
}
const dateOk = d => /^\d{4}-\d{2}-\d{2}$/.test(String(d||""));
const niceDate = d => { try{ return new Date(d+"T12:00:00").toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"}); }catch(e){ return d; } };

function runAction(a){
  try{
    const type = a && a.type;
    if(type==="add_task"){
      const name = String(a.name||"").trim(); if(name.length<2) throw new Error("no name");
      const cat = guessCat(name), proj = suggestProject(name, cat);
      const date = dateOk(a.date) ? a.date : null;
      const t = {id:newId(), name:name.charAt(0).toUpperCase()+name.slice(1), cat, time:"09:00", est:+a.est||30, done:false,
        routine:false, streak:0, target:1, unit:"time", count:0, log:[], makeup:true, pri:"Should",
        date, sched:!!date, proj:proj||null, notes:"Added by the assistant.", src:"asked", added:TODAY_KEY};
      tasks.push(t); refreshAll();
      return {state:"done", label:`Added "${t.name}"${date?` for ${niceDate(date)}`:" (no date yet)"}`, undo:{k:"add", id:t.id}};
    }
    if(type==="complete"){
      const t = findTaskByName(a.task); if(!t) throw new Error(`couldn't find "${a.task}"`);
      if(t.done) return {state:"done", label:`"${t.name}" was already done`};
      const was = {done:t.done, streak:t.streak, count:t.count};
      t.done = true; if(isCounter(t)) t.count = t.target; if(t.routine) t.streak = t.streak+1;
      refreshAll();
      return {state:"done", label:`Checked off "${t.name}"`, undo:{k:"restore", id:t.id, was}};
    }
    if(type==="move"){
      const t = findTaskByName(a.task); if(!t) throw new Error(`couldn't find "${a.task}"`);
      if(!dateOk(a.date)) throw new Error("no date");
      if(t.routine) throw new Error(`"${t.name}" is a routine — change its days in Routines`);
      const was = {date:t.date, sched:t.sched};
      t.date = a.date; t.sched = true; refreshAll();
      return {state:"done", label:`Moved "${t.name}" to ${niceDate(a.date)}`, undo:{k:"restore", id:t.id, was}};
    }
    if(type==="log"){
      const t = findCounter(a.counter); if(!t) throw new Error(`no counter called "${a.counter}"`);
      const n = Math.round((+a.amount||1)*2)/2, prev = t.count;
      setCount(t.id, t.count + n);
      return {state:"done", label:`${t.name}: ${prev} → ${t.count} of ${t.target}`, undo:{k:"count", id:t.id, prev}};
    }
    if(type==="note"){
      const txt = String(a.text||"").trim(); if(txt.length<2) throw new Error("empty note");
      const n = noteAdd(txt, "free", null); try{ renderNotes(); }catch(e){}
      return {state:"done", label:`Noted: "${txt.slice(0,60)}${txt.length>60?"…":""}"`, undo:{k:"note", id:n.id}};
    }
    if(type==="open"){
      const p = String(a.page||""); if(!document.getElementById("view-"+p)) throw new Error("no such page");
      setTimeout(()=>go(p), 900);
      return {state:"done", label:`Opening ${(PAGES[p]&&PAGES[p].n)||p}`};
    }
    throw new Error("didn't understand that change");
  }catch(e){
    return {state:"failed", label:`Couldn't do that: ${e.message}`};
  }
}
window.undoThink = function(i, j){
  const a = thMsgs[i] && thMsgs[i].acts && thMsgs[i].acts[j]; if(!a || a.state!=="done" || !a.undo) return;
  const u = a.undo, t = u.id!=null ? getTask(u.id) : null;
  if(u.k==="add"){ tasks = tasks.filter(x=>x.id!==u.id); }
  else if(u.k==="restore" && t){ Object.assign(t, u.was); }
  else if(u.k==="count" && t){ setCount(t.id, u.prev); }
  else if(u.k==="note"){ notes = notes.filter(n=>n.id!==u.id); }
  a.state = "undone"; a.label = "Undone — " + a.label;
  refreshAll(); thSave(); drawThink(); toast("Put back");
};

/* "Ask about this page" next to "Improve …" at the foot of every page */
const _mountImproveButtons = mountImproveButtons;
mountImproveButtons = function(){
  _mountImproveButtons();
  Object.keys(PAGES).forEach(k=>{
    const host = document.getElementById("impfoot-"+k); if(!host || host.querySelector(".askpage")) return;
    if(["improve","v2"].includes(k)) return;
    const d = document.createElement("div"); d.className = "askpage";
    d.innerHTML = `<div class="o">✦</div><div><b>Ask about ${esc(PAGES[k].n)}</b><span>How it works, what's missing, or tell it what to change</span></div>`;
    d.onclick = () => askAbout(k);
    host.insertBefore(d, host.firstChild);
  });
};

/* ---------------------------------------------------------------------------
   5. MORNING PLAN + SUNDAY COACH NOTE (cards on Today)
   --------------------------------------------------------------------------- */
const dayFlag = k => { try{ return localStorage.getItem("momentum.v53."+k)===TODAY_KEY; }catch(e){ return false; } };
const setDayFlag = k => { try{ localStorage.setItem("momentum.v53."+k, TODAY_KEY); }catch(e){} };
function paintTodayCards(){
  const wrap = document.querySelector("#view-today .wrap"); if(!wrap) return;
  let box = document.getElementById("v53Cards");
  if(!box){ box = document.createElement("div"); box.id = "v53Cards"; wrap.insertBefore(box, wrap.firstChild); }
  const hr = new Date().getHours(), dow = new Date().getDay();
  let html = "";
  if(hr>=4 && hr<12 && !dayFlag("morning")) html += `<div class="v53card" onclick="planMyDay()">
      <div class="ic">☀️</div><div style="flex:1;min-width:0"><b>Plan my day</b>
      <span>The assistant puts today in order from your list, routines and calendar.</span></div>
      <div class="x" onclick="event.stopPropagation();dismissCard('morning')">✕</div></div>`;
  if((dow===0 || dow===1) && !dayFlag("weekly")) html += `<div class="v53card violet" onclick="weeklyCoach()">
      <div class="ic">📋</div><div style="flex:1;min-width:0"><b>Your weekly coach note</b>
      <span>One win, one slip, one thing to try next week — tasks, routines and workouts together.</span></div>
      <div class="x" onclick="event.stopPropagation();dismissCard('weekly')">✕</div></div>`;
  box.innerHTML = html;
}
window.dismissCard = k => { setDayFlag(k); paintTodayCards(); };
window.planMyDay = function(){
  setDayFlag("morning"); thCtx = null; go("think");
  sendThink("Plan my day. Put today's tasks and routines in a sensible order with rough times, starting from now. "
    + "Point out anything overdue or blocked, and suggest at most 2 unscheduled tasks worth adding today (ask before adding them).");
};
window.weeklyCoach = function(){
  setDayFlag("weekly"); thCtx = null; go("think");
  sendThink("Give me my weekly coach note for the week that just ended: one win, one slip, and one specific thing to try next week. "
    + "Cover tasks, routines and workouts. Keep it short.");
};

/* ---------------------------------------------------------------------------
   6. WORKOUTS: rest timer + next-weight nudge
   --------------------------------------------------------------------------- */
let restLeft = 0, restTimer = null;
const restLen = () => { try{ return +localStorage.getItem("momentum.rest") || 90; }catch(e){ return 90; } };
function buildRest(){
  if(document.getElementById("restChip")) return;
  const r = document.createElement("div"); r.className = "restchip"; r.id = "restChip";
  r.innerHTML = `<div><div class="rl">REST</div><b id="restT">1:30</b></div>
    <span class="rb" onclick="restAdd(30)">+30s</span><span class="rb" onclick="restCycle()" id="restLen">90s</span>
    <span class="rb" onclick="restStop()">Skip</span>`;
  document.body.appendChild(r);
}
function paintRest(){
  const r = document.getElementById("restChip"); if(!r) return;
  const m = Math.floor(Math.max(0,restLeft)/60), s = Math.max(0,restLeft)%60;
  document.getElementById("restT").textContent = restLeft>0 ? `${m}:${String(s).padStart(2,"0")}` : "Go";
  document.getElementById("restLen").textContent = restLen()+"s";
  r.classList.toggle("done", restLeft<=0);
}
function startRest(){
  if(curView()!=="workouts") return;
  restLeft = restLen(); clearInterval(restTimer);
  document.getElementById("restChip").classList.add("on"); paintRest();
  restTimer = setInterval(()=>{
    restLeft--; paintRest();
    if(restLeft===0){ try{ navigator.vibrate && navigator.vibrate([200,100,200]); }catch(e){}
      toast("Rest's up — next set"); }
    if(restLeft<-8) restStop();
  },1000);
}
window.restAdd = s => { restLeft += s; paintRest(); };
window.restStop = () => { clearInterval(restTimer); restLeft = 0; const r=document.getElementById("restChip"); if(r) r.classList.remove("on"); };
window.restCycle = () => { const opts=[60,90,120,180]; const n=opts[(opts.indexOf(restLen())+1)%opts.length];
  try{ localStorage.setItem("momentum.rest", n); }catch(e){} restLeft = n; paintRest(); };

function repsAt(i){
  try{ const e = sessEx()[i]; const c = (wkSession.entries[e.n]||[])[wkSession.round-1]; return c ? +c.reps||0 : 0; }catch(e){ return 0; }
}
const _repStep = repStep;
repStep = function(i, d){ const b = repsAt(i); _repStep(i, d); if(d>0 && b===0 && repsAt(i)>0) startRest(); };
const _setReps = setReps;
setReps = function(i, v, leaving){ const b = repsAt(i); _setReps(i, v, leaving); if(leaving && b===0 && repsAt(i)>0) startRest(); };

const _renderSession = renderSession;
renderSession = function(){
  _renderSession();
  try{
    const last = baseSess(wkSession.id), EX = sessEx(), rounds = wkSession.rounds||1;
    EX.forEach((e,i)=>{
      if(e.t!=="w") return;
      const l = last.entries[e.n]; if(!l || !l.wt) return;
      const hitAll = l.reps >= defReps(e)*rounds;
      const next = hitAll ? l.wt + 5 : l.wt;
      const row = document.getElementById("wsWt"+i); if(!row) return;
      const ex = row.closest(".ex"); const lastBox = ex && ex.querySelector(".ex-last"); if(!lastBox || lastBox.querySelector(".nextwt")) return;
      const tag = document.createElement("span"); tag.className = "nextwt";
      tag.textContent = hitAll ? `Try ${next} lb` : `Stay at ${next} lb`;
      tag.title = hitAll ? "You hit every rep last time — go up 5 lb" : "Last time fell short of your usual reps — stay here until you hit them all";
      tag.onclick = () => { const b=document.getElementById("wsWt"+i); if(b){ b.value=next; setWt(i,next); toast(`${e.n}: ${next} lb`); } };
      lastBox.appendChild(tag);
    });
  }catch(e){}
};

/* ---------------------------------------------------------------------------
   7. EMPTY STATES, PROBLEM SOLVER AUTOSAVE, SHORTCUTS
   --------------------------------------------------------------------------- */
function tidyProgress(){
  const box = document.getElementById("pgBody"); if(!box) return;
  const anyHist = Object.values(history||{}).some(h=>(h||[]).length);
  if(anyHist) return;
  box.querySelectorAll(".card").forEach(c=>{
    const t = c.querySelector(".card-title");
    if(t && /Routine consistency/i.test(t.textContent) && !c.querySelector(".v53empty")){
      [...c.children].forEach(ch=>{ if(!ch.classList.contains("card-head")) ch.style.display="none"; });
      const n = document.createElement("div"); n.className="v53empty";
      n.innerHTML = "Nothing logged yet, so every routine would read 0%. This fills in after a few days of check-offs on <b>Today</b>.";
      c.appendChild(n);
    }
  });
}
function tidyTracker(){
  const box = document.getElementById("trackerBody"); if(!box || box.querySelector(".v53empty")) return;
  const anyHist = tasks.filter(isCounter).some(t=>(history[t.id]||[]).some(d=>d.v>0));
  if(anyHist) return;
  const n = document.createElement("div"); n.className = "card";
  n.innerHTML = `<div class="v53empty" style="padding-top:14px">Nothing logged yet. Tap <b>+</b> or <b>½</b> on a counter on
    <b>Today</b> and its squares here start filling in, one per day.</div>`;
  box.insertBefore(n, box.firstChild);
}
const _renderProgress = renderProgress; renderProgress = function(){ _renderProgress(); if(curView()==="progress") tidyProgress(); };
const _renderTracker = renderTracker; renderTracker = function(){ _renderTracker(); if(curView()==="tracker") tidyTracker(); };

/* Problem Solver: save as you type, not only when the number of bubbles changes. */
let _webSig53 = "";
setInterval(()=>{
  try{
    if(curView()!=="planner" || !P.nodes.length || !P.seed) return;
    const sig = P.seed + "|" + P.stage + "|" + JSON.stringify(P.nodes);
    if(sig===_webSig53) return;
    _webSig53 = sig; saveWeb(true);
    const txt = document.getElementById("webSaveTxt"); if(txt) txt.textContent = "Saved";
  }catch(e){}
}, 3000);
document.addEventListener("visibilitychange", ()=>{ try{ if(document.visibilityState==="hidden" && P.nodes.length && P.seed) saveWeb(true); }catch(e){} });

/* Home-screen shortcuts: long-press the app icon → Log water / Took meds / Add a task / Ask */
function runShortcut(){
  let d = null;
  try{ d = new URLSearchParams(location.search).get("do"); }catch(e){}
  if(!d) return;
  try{ window.history.replaceState(window.history.state, "", location.pathname); }catch(e){}
  setTimeout(()=>{
    if(d==="water" || d==="meds"){
      const re = d==="water" ? /water/i : /med|pill|dose/i;
      const t = tasks.find(x=>isCounter(x) && re.test(x.name));
      if(t){ go("today"); setCount(t.id, t.count+1); toast(`${t.name}: ${t.count} of ${t.target}`); }
      else toast(d==="water" ? "No water counter found" : "No medication counter found");
    }
    if(d==="add") openAdd(false);
    if(d==="ask") go("think");
    if(d==="plus") openPlus();
  }, 700);
}


/* ---------------------------------------------------------------------------
   8. FIXES FROM THE BLIND TEST
   --------------------------------------------------------------------------- */
/* The built-in brain (used when AI isn't reachable) now understands "half",
   "meds", and dates like "tomorrow" or "friday" when adding a task. */
const WORDNUM = {half:0.5, a:1, an:1, one:1, two:2, three:3, four:4, five:5, six:6};
function amountIn(s){
  const m = s.match(/(\d+(?:\.\d+)?)/); if(m) return +m[1];
  if(/\b(one and a half|1 and a half)\b/.test(s)) return 1.5;
  for(const w in WORDNUM) if(new RegExp("\\b"+w+"\\b").test(s)) return WORDNUM[w];
  return 1;
}
function counterIn(s){
  const list = tasks.filter(isCounter);
  const alias = [[/\b(meds?|medicine|medication|pills?|dose)\b/, /med|pill|dose/i],[/\b(water|glass(es)?)\b/, /water/i],
    [/\bprotein\b/, /protein/i],[/\bsteps?\b/, /step/i]];
  for(const [re,nameRe] of alias){ if(re.test(s)){ const t = list.find(x=>nameRe.test(x.name)||nameRe.test(x.unit||"")); if(t) return t; } }
  return list.find(t=>s.includes(t.name.toLowerCase())) || null;
}
const DOWS = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
function dateIn(text){
  const s = text.toLowerCase(), d = new Date();
  let when = null, cut = null;
  let m;
  if((m = s.match(/\b(today|tonight)\b/))){ when = new Date(d); cut = m[0]; }
  else if((m = s.match(/\btomorrow\b/))){ when = new Date(d); when.setDate(d.getDate()+1); cut = m[0]; }
  else if((m = s.match(/\bnext week\b/))){ when = new Date(d); when.setDate(d.getDate()+(8-d.getDay())%7||7); cut = m[0]; }
  else if((m = s.match(/\b(on |this |next )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/))){
    const target = DOWS.indexOf(m[2]); let add = (target - d.getDay() + 7) % 7; if(add===0 || m[1]==="next ") add += (add===0?7:0);
    when = new Date(d); when.setDate(d.getDate()+add); cut = m[0]; }
  return when ? {date: ymd(when), cut} : null;
}
const _askAction = askAction;
askAction = function(text){
  const s = text.toLowerCase().trim();
  if(/\b(log|had|drank|drink|took|take|ate|did)\b/.test(s)){
    const c = counterIn(s);
    if(c){ const n = amountIn(s), prev = c.count;
      setCount(c.id, c.count + n);
      return did("Logged")+`<div><b>${esc(c.name)}</b>: ${prev} → ${c.count} of ${c.target} ${unitOf(c)}.${
        c.done?` Target hit — streak is 🔥 ${c.streak}.`:` ${Math.max(0,c.target-c.count)} to go.`}</div>`; }
  }
  if(/^(add|create|new)\b.*\b(task|todo|to-do)\b|^(remind me to|i need to|add)\s+/.test(s)){
    const dt = dateIn(text);
    let name = text;
    if(dt) name = name.replace(new RegExp("\\s*\\b"+dt.cut.replace(/\s+/g,"\\s+")+"\\b","i"),"");
    name = name.replace(/^(add|create|new)\s+(a\s+)?(task|todo|to-do)?\s*(to|for|called|named)?\s*/i,"")
               .replace(/^(remind me to|i need to)\s*/i,"").replace(/\s+(on|by|for)$/i,"").trim();
    if(name.length>2){
      const cat = guessCat(name), proj = suggestProject(name, cat);
      const date = dt ? dt.date : TODAY_KEY;
      const t = {id:newId(), name:name.charAt(0).toUpperCase()+name.slice(1), cat, time:"09:00", est:30, done:false,
        routine:false, streak:0, target:1, unit:"time", count:0, log:[], makeup:true, pri:"Should",
        date, sched:true, proj:proj||null, notes:"Added by asking.", src:"asked", added:TODAY_KEY};
      tasks.push(t); refreshAll();
      return did("Added")+`<div><b>${esc(t.name)}</b> — ${date===TODAY_KEY?"on today's list":"set for "+niceDate(date)}${
        proj?`, in <b>${esc(projById(proj).name)}</b>`:``}.</div>`;
    }
  }
  return _askAction(text);
};

/* Undo for changes made by the built-in brain too, not only the AI. */
const _sendThink = window.sendThink;
window.sendThink = async function(textIn){
  if(AI.on) return _sendThink(textIn);
  const snap = {tasks: JSON.stringify(tasks), notes: JSON.stringify(notes)};
  await _sendThink(textIn);
  const changed = JSON.stringify(tasks)!==snap.tasks || JSON.stringify(notes)!==snap.notes;
  const last = thMsgs[thMsgs.length-1];
  if(changed && last && last.role==="assistant"){
    last.acts = [{state:"done", label:"Change made", undo:{k:"snap", tasks:snap.tasks, notes:snap.notes}}];
    thSave(); drawThink();
  }
};
const _undoThink = window.undoThink;
window.undoThink = function(i, j){
  const a = thMsgs[i] && thMsgs[i].acts && thMsgs[i].acts[j];
  if(a && a.undo && a.undo.k==="snap" && a.state==="done"){
    tasks = JSON.parse(a.undo.tasks); notes = JSON.parse(a.undo.notes);
    a.state = "undone"; a.label = "Undone"; refreshAll(); thSave(); drawThink(); toast("Put back"); return;
  }
  _undoThink(i, j);
};

/* Keep the evening check-in count in step with the list right away. */
const _render = render;
render = function(){ _render(); try{ renderNotif(); paintBell(); }catch(e){} };

/* The bell: shows a dot only when something is waiting, and opens it. */
function paintBell(){
  const b = document.getElementById("bellBtn"); if(!b) return;
  const dot = b.querySelector(".dot");
  const due = (new Date().getHours() >= (prefs.notifHour||20)) && pendingMisses().length && !missLog.some(m=>m.ymd===ymd(new Date()));
  if(dot) dot.style.display = due ? "" : "none";
}
window.bellTap = function(){
  const n = pendingMisses().length;
  if((new Date().getHours() >= (prefs.notifHour||20)) && n) { startReview(); return; }
  toast(n ? `${n} still open today — the check-in opens at ${prefs.notifHour>12?prefs.notifHour-12+"pm":prefs.notifHour+"am"}` : "Nothing needs you right now");
};

/* + menu: "Routine" opens the routine form (not the tracker form), and full
   counters aren't offered for a quick +1. */
window.openRoutine = function(){ openAdd(false); if(!isRoutine) toggleRoutine();
  const t=document.getElementById("addTitle"); if(t) t.textContent="New routine"; };


/* ---------------------------------------------------------------------------
   9. WORKOUTS: "beat last time" in plain numbers
   Everything is counted in reps (weight is shown next to it, not multiplied in),
   compared round-for-round against your last real session.
   --------------------------------------------------------------------------- */
function lastRoundReps(e, R){
  const last = baseSess(wkSession.id);
  if(!last || !last.entries) return null;
  const perRound = last.rounds && last.rounds[e.n] && last.rounds[e.n][R];
  if(perRound && +perRound.reps>0) return {reps:+perRound.reps, wt:+perRound.wt||0};
  const tot = last.entries[e.n];
  if(!tot || !(+tot.reps>0)) return null;
  const rounds = Math.max(1, wkSession.rounds||1);
  return {reps:Math.round(tot.reps/rounds), wt:+tot.wt||0, approx: rounds>1};
}
function sessRepsNow(){
  let n=0; sessEx().forEach(e=>(wkSession.entries[e.n]||[]).forEach(c=>n+=(+c.reps||0))); return n;
}
function cmpCardHTML(){
  return `<div class="card cmpcard" id="wsCmp">
    <div class="card-head"><span class="card-title">Beat last time</span><span class="link" id="cmpTag"></span></div>
    <div class="cmprow" id="cmpLastRow"><div class="cl">Last time<small id="cmpLastWhen"></small></div>
      <div class="cbar"><i id="cmpLastBar"></i></div><b id="cmpLast">0</b></div>
    <div class="cmprow"><div class="cl">Today<small>so far</small></div>
      <div class="cbar"><i id="cmpNowBar" class="now"></i><s id="cmpLine"></s></div><b id="cmpNow">0</b></div>
    <div class="cmpmsg" id="cmpMsg"></div>
    <div class="cmpfoot"><span id="wsDone"></span> sets logged · all counted in reps</div>
  </div>`;
}
paintTotals = function(){
  const box = document.getElementById("wsCmp"); if(!box || !wkSession) return;
  const last = baseSess(wkSession.id), lastN = sessReps(last), now = sessRepsNow();
  const t = sessTotals();
  const max = Math.max(lastN, now, 1);
  const lastRow = document.getElementById("cmpLastRow");
  lastRow.style.display = lastN ? "" : "none";
  document.getElementById("cmpLast").textContent = lastN.toLocaleString();
  document.getElementById("cmpNow").textContent = now.toLocaleString();
  document.getElementById("cmpLastWhen").textContent = last.d ? new Date(last.d+"T12:00:00").toLocaleDateString(undefined,{month:"short",day:"numeric"}) : "";
  document.getElementById("cmpLastBar").style.width = (lastN/max*100)+"%";
  const nb = document.getElementById("cmpNowBar");
  nb.style.width = (now/max*100)+"%";
  const ahead = lastN && now > lastN, even = lastN && now === lastN;
  nb.className = "now" + (ahead||even ? " win" : "");
  const line = document.getElementById("cmpLine");
  line.style.display = lastN ? "" : "none"; line.style.left = (lastN/max*100)+"%";
  const tag = document.getElementById("cmpTag"), msg = document.getElementById("cmpMsg");
  if(!lastN){
    tag.textContent = "first real session"; tag.style.color = "#7fb0ff";
    msg.innerHTML = now ? `<b>${now}</b> reps so far. Whatever you finish with is the number to beat next time.`
                        : `No earlier session to compare with yet — today sets the mark.`;
  } else if(ahead){
    tag.textContent = `+${now-lastN} past it`; tag.style.color = "#4fd6a5";
    msg.innerHTML = `🔥 <b>${now-lastN} more reps</b> than last time. Every rep from here raises the bar.`;
  } else if(even){
    tag.textContent = "matched"; tag.style.color = "#4fd6a5";
    msg.innerHTML = `Matched last time exactly. <b>One more rep</b> beats it.`;
  } else {
    const pct = Math.round(now/lastN*100);
    tag.textContent = `${pct}% there`; tag.style.color = pct>=75 ? "#ff9d4d" : "#8d99ab";
    msg.innerHTML = `<b>${lastN-now} reps</b> to beat last time.`;
  }
  const d = document.getElementById("wsDone");
  if(d) d.innerHTML = `${t.logged}<span style="color:var(--ink3)">/${t.slots}</span>`;
};
paintDelta = function(i){
  const e = sessEx()[i]; if(!e || !wkSession) return;
  const R = wkSession.round-1, c = (wkSession.entries[e.n]||[])[R]; if(!c) return;
  const el = document.getElementById("wsDelta"+i); if(!el) return;
  const L = lastRoundReps(e, R);
  const rTxt = (wkSession.rounds||1)>1 ? ` in round ${R+1}` : "";
  if(!L){ el.className = "delta same"; el.textContent = c.reps ? "New — this sets the mark" : ""; return; }
  const wtNote = (e.t==="w" && c.wt && L.wt && c.wt!==L.wt) ? ` · ${c.wt>L.wt?"heavier":"lighter"} (${c.wt>L.wt?"+":""}${c.wt-L.wt} lb)` : "";
  if(!c.reps){ el.className = "delta same"; el.textContent = `Last time ${L.approx?"about ":""}${L.reps}${rTxt} — beat it`; return; }
  const gap = c.reps - L.reps;
  el.className = "delta " + (gap>0 ? "up" : gap<0 ? "down" : "same");
  el.textContent = gap>0 ? `▲ ${gap} more than last time (${L.reps})${wtNote}`
                 : gap<0 ? `${-gap} short of last time (${L.reps})${wtNote}`
                 : `= Matched last time (${L.reps})${wtNote} — one more beats it`;
};
const _renderSession53 = renderSession;
renderSession = function(){
  _renderSession53();
  try{
    const old = document.getElementById("wsPct"); const card = old && old.closest(".card");
    if(card){ card.outerHTML = cmpCardHTML(); }
    const R = wkSession.round-1;
    sessEx().forEach((e,i)=>{
      const rep = document.getElementById("wsRep"+i); const ex = rep && rep.closest(".ex");
      const lastBox = ex && ex.querySelector(".ex-last"); if(!lastBox) return;
      const L = lastRoundReps(e, R);
      const keep = [...lastBox.querySelectorAll(".xrm,.nextwt")];
      lastBox.innerHTML = L ? `Last time <b>${L.approx?"~":""}${L.reps}${e.t==="w"&&L.wt?` × ${L.wt} lb`:""}</b>` : "Nothing to beat yet";
      keep.forEach(k=>lastBox.appendChild(k));
      paintDelta(i);
    });
    paintTotals();
  }catch(err){ console.warn(err); }
};

/* ---------------------------------------------------------------------------
   START
   --------------------------------------------------------------------------- */
function start(){
  testBanner();
  buildThinkView();
  buildTabbar();
  buildSubnavs();
  buildPlus();
  buildRest();
  slimDrawer();
  try{ const b=document.getElementById("drBuild"); if(b) b.textContent = BUILD; }catch(e){}
  mountImproveButtons();
  let v = "today";
  try{ v = sessionStorage.getItem("momentum.view") || "today"; }catch(e){}
  if(!document.getElementById("view-"+v)) v = "today";
  skipPush = true;
  if(v==="think") go("think"); else afterGo(curView());
  paintTodayCards();
  paintBell();
  aiProbe();
  runShortcut();
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", start); else start();
})();

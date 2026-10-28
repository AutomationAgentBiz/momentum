/* =====================================================================
   v63 — a second schedule: the 4-day gym program
   ---------------------------------------------------------------------
   Nothing that already exists is touched. The four P90X workouts, their
   history, the day plan and every setting stay exactly as they are.

   What this adds is a switch at the top of the Strength tab with two
   programs on it:
        P90X at home   — the four workouts that were already there
        Gym · 4 day    — Upper A / Lower A / Upper B / Lower B

   Both programs live in the same WK list, tagged with `prog`. Nothing is
   ever removed from WK, so a sync between two devices can't lose a
   program. The list is filtered for the moment it draws and put straight
   back — see showOnly() below.

   History is keyed by workout id, so each program keeps its own and
   neither can overwrite the other.
   ===================================================================== */
(function(){
const $id = id => document.getElementById(id);
const yt  = q => "https://www.youtube.com/results?search_query=" + encodeURIComponent(q);

/* ---------------------------------------------------------------------
   The programs
   --------------------------------------------------------------------- */
const PROGS = [
  {k:"home", name:"P90X at home", sub:"What you've been doing"},
  {k:"gym",  name:"Gym · 4 day",  sub:"Machines and dumbbells"}
];
const progOf = w => (w && w.prog) || "home";          // untagged = the originals
window.curProg = window.curProg || "home";

/* The gym program. t:"w" means it takes weight. d is the rep count the +
   button jumps to on the first tap, lo is the pound the weight + jumps to —
   both the bottom of the suggested range, so you start honest and work up.
   sets is how many rounds that move gets: a 2-set move is finished after
   round 2 and gets marked as such on round 3. */
const E = (n,sets,rep,d,lo,hi,per,q) => ({n, t:"w", d, sets, rep, lo, hi, per:per||"", vid:yt(q)});
const GYM = [
 {id:"g-ua", name:"Upper Body A", icon:"🏋️", fg:"#a78bfa", bg:"#1c1533",
  prog:"gym", perWeek:1, days:["Mon"], rounds:3, ex:[
  E("Dumbbell Bench Press",         3,"8–12", 8,40,55,"each hand","dumbbell flat bench press proper form"),
  E("Chest-Supported Dumbbell Row", 3,"8–12", 8,40,55,"each hand","chest supported dumbbell row proper form"),
  E("Neutral-Grip Lat Pulldown",    3,"8–12", 8,80,120,"on the stack","neutral grip lat pulldown proper form"),
  E("Incline Dumbbell Press",       2,"8–12", 8,30,45,"each hand","incline dumbbell press proper form"),
  E("Dumbbell Biceps Curls",        2,"10–15",10,25,35,"each hand","standing dumbbell bicep curl proper form"),
  E("Rope Triceps Pushdown",        2,"10–15",10,35,60,"on the stack","rope triceps pushdown proper form")]},

 {id:"g-la", name:"Lower Body A", icon:"🦵", fg:"#38bdf8", bg:"#082535",
  prog:"gym", perWeek:1, days:["Tue"], rounds:3, ex:[
  E("Leg Press",                    3,"8–12", 8,90,180,"in plates, both sides together","45 degree leg press proper form"),
  E("Seated Leg Curl",              3,"10–15",10,50,90,"on the stack","seated leg curl proper form"),
  E("Leg Extension",                2,"10–15",10,50,90,"on the stack","leg extension machine proper form"),
  E("Standing Calf Raises",         3,"12–15",12,70,140,"on the stack","standing calf raise machine proper form"),
  E("Abdominal Crunch Machine",     2,"12–15",12,30,70,"on the stack","abdominal crunch machine proper form")]},

 {id:"g-ub", name:"Upper Body B", icon:"💪", fg:"#f472b6", bg:"#2d1020",
  prog:"gym", perWeek:1, days:["Thu"], rounds:3, ex:[
  E("Incline Dumbbell Press",       3,"8–12", 8,35,50,"each hand","incline dumbbell bench press proper form"),
  E("Seated Cable Row",             3,"8–12", 8,80,130,"on the stack","seated cable row proper form"),
  E("Machine Chest Press",          2,"8–12", 8,80,140,"on the stack","seated machine chest press proper form"),
  E("Dumbbell Lateral Raises",      3,"12–20",12,10,20,"each hand","dumbbell lateral raise proper form"),
  E("Reverse Pec Deck",             2,"12–20",12,40,80,"on the stack","reverse pec deck proper form"),
  E("Dumbbell Hammer Curls",        2,"10–12",10,25,40,"each hand","dumbbell hammer curl proper form"),
  E("Straight-Bar Triceps Pushdown",2,"10–15",10,35,65,"on the stack","straight bar triceps pushdown proper form")]},

 {id:"g-lb", name:"Lower Body B", icon:"🦿", fg:"#fbbf24", bg:"#2a1f06",
  prog:"gym", perWeek:1, days:["Fri"], rounds:3, ex:[
  E("Hack Squat Machine",           3,"8–12", 8, 0,0,"start with the empty sled","hack squat machine proper form"),
  E("Dumbbell Romanian Deadlift",   3,"8–12", 8,30,50,"each hand","dumbbell romanian deadlift proper form"),
  E("Seated Leg Curl",              2,"10–15",10,50,90,"on the stack","seated leg curl proper form"),
  E("Hip Thrust Machine",           2,"8–12", 8,70,140,"on the stack","hip thrust machine proper form"),
  E("Seated Calf Raises",           3,"12–15",12,45,90,"on the stack","seated calf raise proper form"),
  E("Cable Crunch",                 2,"12–15",12,30,60,"on the stack","kneeling cable crunch proper form")]}
];
/* The line under a move: reps and the pounds to aim for. The set count is a
   pill of its own so it can't be mistaken for "sets inside this round". */
function tipLine(e){
  const wt = e.hi ? `${e.lo}–${e.hi} lb${e.per?" "+e.per:""}` : (e.per||"");
  return `${e.rep} reps${wt?" · "+wt:""}`;
}

/* ---------------------------------------------------------------------
   Put them in, once, without disturbing anything already in WK.
   If Pete has edited one, his version wins — we never overwrite.
   --------------------------------------------------------------------- */
function installGym(){
  let added = 0;
  GYM.forEach(g=>{
    if(WK.some(w=>w.id===g.id)) return;
    WK.push(JSON.parse(JSON.stringify(g)));
    added++;
  });
  WK.forEach(w=>{ if(!wkHist[w.id]) wkHist[w.id]=[]; });
  return added;
}

/* The move's prescription and form video, looked up by name within the
   workout you're on. Edited or renamed moves simply have no tip. */
function tipFor(wid, name){
  const g = GYM.find(x=>x.id===wid); if(!g) return null;
  return g.ex.find(e=>e.n===name) || null;
}
window.gymTipFor = tipFor;

/* ---------------------------------------------------------------------
   Show one program while a screen draws, then put the list straight back.
   Rendering is synchronous, so nothing can observe the short list — and
   the finally block puts WK back even if a render throws.
   --------------------------------------------------------------------- */
function showOnly(prog, fn){
  const all = WK.slice();
  const keep = all.filter(w => progOf(w)===prog ||
                               (wkSession && w.id===wkSession.id) ||
                               (wkSession && wkSession.pair && w.id===wkSession.pair.id));
  if(keep.length===all.length) return fn();
  WK.length=0; keep.forEach(w=>WK.push(w));
  try { return fn(); }
  finally { WK.length=0; all.forEach(w=>WK.push(w)); }
}
window.wkShowOnly = showOnly;

/* ---------------------------------------------------------------------
   The switcher
   --------------------------------------------------------------------- */
function switcherHTML(){
  const counts = {};
  PROGS.forEach(p=>counts[p.k]=WK.filter(w=>progOf(w)===p.k).length);
  return `<div class="card progcard">
    <div class="progsw">
      ${PROGS.map(p=>`<div class="pb${curProg===p.k?" on":""}" onclick="setProgram('${p.k}')">
        <b>${p.name}</b><span>${counts[p.k]} workout${counts[p.k]===1?"":"s"} · ${p.sub}</span></div>`).join("")}
    </div>
  </div>`;
}

window.setProgram = function(k){
  if(k===curProg) return;
  if(wkSession && sessTotals().logged){
    toast("Finish or leave the workout you're in first");
    return;
  }
  curProg = k;
  if(k==="gym" && !prefs.gymStart) prefs.gymStart = ymd(new Date());
  /* A day plan built from the other program would show "Workout" with no
     name, so anything that isn't in this program drops out of it. */
  try{
    const p = prefs.wkPlan;
    if(p && Array.isArray(p.items)){
      const keep = p.items.filter(it => it.k!=="wk" || WK.some(w=>w.id===it.id && progOf(w)===k));
      if(keep.length!==p.items.length){ if(keep.length) p.items=keep; else delete prefs.wkPlan; }
    }
  }catch(e){}
  save();
  renderWorkouts();
  window.scrollTo(0,0);
  toast(k==="gym" ? "Gym program — Mon, Tue, Thu, Fri" : "Back to your P90X workouts");
};

/* How to run the gym program. Folded away by default so the workouts are
   the first thing you see — it's a reference, not something to read every
   time. Open or shut is remembered. */
window.toggleGymRules = function(){
  prefs.gymRules = !prefs.gymRules; save();
  const c=document.querySelector(".gymrules"), car=document.querySelector(".rulescard");
  if(c) c.style.display = prefs.gymRules ? "" : "none";
  if(car) car.classList.toggle("open", !!prefs.gymRules);
};
function rulesHTML(){
  const open = !!prefs.gymRules;
  return `<div class="card rulescard${open?" open":""}">
    <div class="card-head" onclick="toggleGymRules()" style="cursor:pointer">
      <span class="card-title">How to run this one</span>
      <span class="link">4 days · 45–60 min <i class="rulecar">▾</i></span></div>
    <div class="gymrules"${open?"":' style="display:none"'}>
      <div><b>Rounds</b><span>Go through the list three times. Moves marked <i>2 sets</i> you skip on round 3.</span></div>
      <div><b>Rest</b><span>2–3 minutes on the heavy ones, 60–120 seconds on the smaller moves.</span></div>
      <div><b>Effort</b><span>Stop most sets with 1–3 good reps still in you.</span></div>
      <div><b>Going up</b><span>Hit the top of the rep range on every set? Add a little weight next time.</span></div>
      <div><b>First week</b><span>Go light and get the form right. The suggested pounds are a starting guess, not a target.</span></div>
      <div class="warn"><b>Your shoulder</b><span>Skip anything that hurts and build back up slowly. Get it cleared before you push hard overhead.</span></div>
    </div>
  </div>`;
}

/* ---------------------------------------------------------------------
   Wrap the two screens
   --------------------------------------------------------------------- */
const _rw = renderWorkouts;
renderWorkouts = function(){
  if(typeof wkTab!=="undefined" && wkTab!=="strength") return _rw.apply(this, arguments);
  const self=this, args=arguments;
  const r = showOnly(curProg, ()=>_rw.apply(self, args));
  try{
    const body=$id("wkBody"), back=$id("wkBack");
    const onList = !(back && back.style.display!=="none");
    if(body && onList){
      if(curProg==="gym"){ clearPreStartMisses(body); body.insertAdjacentHTML("afterbegin", rulesHTML()); }
      body.insertAdjacentHTML("afterbegin", switcherHTML());
    }
  }catch(e){}
  return r;
};

/* The month grid marks a scheduled day you didn't train as missed. On the
   day you switch programs that would paint every past Mon/Tue/Thu/Fri red
   for a plan you had never started. Days before you took this program on
   are left blank. */
function clearPreStartMisses(body){
  const since = prefs.gymStart; if(!since) return;
  let cleared = 0;
  body.querySelectorAll(".mc-cell.miss").forEach(c=>{
    const m = /openWkDay\('([\d-]+)'\)/.exec(c.getAttribute("onclick")||"");
    if(!m || m[1] >= since) return;
    c.classList.remove("miss");
    const x = c.querySelector(".mc-x"); if(x) x.remove();
    cleared++;
  });
  if(!cleared) return;
  const stat = [...body.querySelectorAll(".mc-stats > div")]
    .find(d=>/missed/i.test((d.querySelector("span")||{}).textContent||""));
  if(stat){
    const b = stat.querySelector("b");
    const left = Math.max(0, (parseInt(b.textContent,10)||0) - cleared);
    b.textContent = left;
    b.style.color = left ? "#ff9d9d" : "var(--ink3)";
  }
}

/* Today's picker only offers the program you're on. */
if(typeof openDayPlan==="function"){
  const _odp = openDayPlan;
  window.openDayPlan = function(){ const self=this, a=arguments;
    return showOnly(curProg, ()=>_odp.apply(self, a)); };
}

/* A workout you build yourself joins the program you're looking at. */
if(typeof saveWorkout==="function"){
  const _sw = saveWorkout;
  window.saveWorkout = function(){
    const before = WK.length;
    const r = _sw.apply(this, arguments);
    try{ if(WK.length>before && curProg!=="home"){ WK[WK.length-1].prog=curProg; save(); } }catch(e){}
    return r;
  };
}

/* ---------------------------------------------------------------------
   In the session: what the plan says for this move, and a form video.
   --------------------------------------------------------------------- */
const _rs = renderSession;
renderSession = function(){
  const r = _rs.apply(this, arguments);
  try{
    if(!wkSession) return r;
    const EX = sessEx(), R = wkSession.round;
    EX.forEach((e,i)=>{
      const box = $id("wsRep"+i); if(!box) return;
      const row = box.closest(".ex"); if(!row) return;
      const t = tipFor(wkSession.id, e.n); if(!t) return;
      /* a 2-set move on round 3 is finished — say so loudly, because the
         only other clue was a rule on a different screen */
      const over = t.sets && R > t.sets;
      row.classList.toggle("exdone", !!over);
      if(!row.querySelector(".gymtip")){
        const top = row.querySelector(".ex-top"); if(!top) return;
        const el = document.createElement("div");
        el.className = "gymtip";
        el.innerHTML =
          `<b class="setpill${over?" off":""}">${over?"Done — only "+t.sets+" sets":t.sets+" sets"}</b>` +
          `<span>${tipLine(t)}</span>` +
          (t.vid ? `<a href="${t.vid}" target="_blank" rel="noopener noreferrer">How-to ▸</a>` : ``);
        top.after(el);
      } else {
        const pill = row.querySelector(".setpill");
        if(pill){ pill.classList.toggle("off", !!over);
          pill.textContent = over ? "Done — only "+t.sets+" sets" : t.sets+" sets"; }
      }
    });
    /* the note under the round tabs still said "do it again on Round 2" */
    const g = GYM.find(x=>x.id===wkSession.id);
    if(g){
      const n=[...document.querySelectorAll("#wkBody .wk-note")]
        .find(x=>/come back and do it again/i.test(x.textContent||""));
      if(n){
        const skip=g.ex.filter(e=>e.sets<R).length;
        const last = R >= wkSession.rounds;
        n.innerHTML = `You're on <b>round ${R} of ${wkSession.rounds}</b>. `
          + (last ? `Last one — finish the list and you're done.` : `Go through the whole list, then start round ${R+1}.`)
          + (skip ? ` <b>${skip} move${skip===1?" is":"s are"} already finished</b> — they're only 2 sets, so they're greyed out below. Skip them.` : ``);
      }
    }
  }catch(e){}
  return r;
};

/* ---------------------------------------------------------------------
   The counter at the top said 0/18 on a plan that only has 15 sets in it,
   so doing exactly what you were told could never reach the end. Workouts
   with per-move set counts now add theirs up instead.
   --------------------------------------------------------------------- */
const _st = sessTotals;
sessTotals = function(){
  const t = _st.apply(this, arguments);
  try{
    if(!wkSession) return t;
    const g = GYM.find(x=>x.id===wkSession.id);
    if(g && !(wkSession.extra||[]).length){
      t.slots = g.ex.reduce((a,e)=>a+(e.sets||wkSession.rounds),0);
    }
  }catch(e){}
  return t;
};

/* The reps + jumps to the bottom of the suggested range. The weight + used
   to start at 0 and climb in fives — sixteen taps to reach a lat pulldown.
   Now the first tap lands on the suggested starting weight. */
const _wt = wtStep;
wtStep = function(i,d){
  try{
    if(wkSession && d>0){
      const e = sessEx()[i];
      const c = e && (wkSession.entries[e.n]||[])[wkSession.round-1];
      const t = e && tipFor(wkSession.id, e.n);
      if(c && t && t.lo && !(+c.wt)){
        c.wt = t.lo;
        const box=$id("wsWt"+i); if(box) box.value=c.wt;
        if(typeof paintDelta==="function") paintDelta(i);
        if(typeof paintChase==="function") paintChase(i);
        if(typeof paintTotals==="function") paintTotals();
        save(); if(typeof persistSession==="function") persistSession(false);
        return;
      }
    }
  }catch(e){}
  return _wt.apply(this, arguments);
};

/* Reps logged with the weight still on zero. In a weights program that's
   the number that matters, so it gets a look before it's written down. */
if(typeof confirmFinish==="function"){
  const _cf = confirmFinish;
  window.confirmFinish = async function(){
    try{
      const g = wkSession && GYM.find(x=>x.id===wkSession.id);
      if(g){
        const bad = g.ex.filter(e=>{
          if(!e.lo) return false;
          const sets=(wkSession.entries[e.n]||[]);
          return sets.some(c=>c && +c.reps>0) && !sets.some(c=>c && +c.wt>0);
        }).map(e=>e.n);
        if(bad.length){
          const ok = await ask(`${bad.length} move${bad.length===1?" has":"s have"} reps but no weight:\n\n${bad.join("\n")}\n\nSave it like that?`, "Save anyway");
          if(!ok) return;
        }
      }
    }catch(e){}
    return _cf.apply(this, arguments);
  };
}

/* ---------------------------------------------------------------------
   Start up
   --------------------------------------------------------------------- */
try{
  const raw = localStorage.getItem(SAVE_KEY);
  if(raw){ const b=JSON.parse(raw); if(b && (b.curProg==="gym"||b.curProg==="home")) window.curProg=b.curProg; }
}catch(e){}
if(SAVED.indexOf("curProg")<0) SAVED.push("curProg");

const added = installGym();
if(added){ if(curProg==="gym" && !prefs.gymStart) prefs.gymStart=ymd(new Date()); save(); }
try{ if(typeof wkTab!=="undefined" && wkTab==="strength" && $id("wkBody")) renderWorkouts(); }catch(e){}
})();

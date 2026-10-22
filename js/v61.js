/* =====================================================================
   v61 — fixes from the second walk-through
   ===================================================================== */
(function(){
const $id = id => document.getElementById(id);

/* An open workout really is at the top of the Workouts page now */
const _rw61 = renderWorkouts;
renderWorkouts = function(){
  const r = _rw61.apply(this, arguments);
  try{
    const body = $id("wkBody"), b = $id("wkBack");
    if(body && !(b && b.style.display!=="none")){
      const un = [...body.querySelectorAll(".card")].find(c=>/Unfinished workout/i.test((c.querySelector(".card-title")||{}).textContent||""));
      if(un && body.firstElementChild!==un) body.insertBefore(un, body.firstElementChild);
    }
  }catch(e){}
  return r;
};

/* Finish with lots of moves still at 0 → a quick check first */
window.confirmFinish = async function(){
  if(!wkSession) return;
  const R = wkSession.round, EX = sessEx();
  const halves = [wkSession].concat(wkSession.pair ? [wkSession.pair] : []);
  let zero = 0, all = 0;
  halves.forEach(s=>{ const w = wkById(s.id); if(!w) return;
    w.ex.concat(s.extra||[]).forEach(e=>{ all++; if(!(s.entries[e.n]||[]).some(c=>c && +c.reps>0)) zero++; }); });
  if(zero && zero >= Math.ceil(all/2)){
    const ok = await ask(`${zero} of ${all} moves are still at 0.\n\nFinish anyway? They'll be saved as not done.`, "Finish anyway");
    if(!ok) return;
  }
  finishWorkout();
};
const _rs61 = renderSession;
renderSession = function(){
  const r = _rs61.apply(this, arguments);
  try{
    document.querySelectorAll('#wkBody button[onclick="finishWorkout()"]').forEach(btn=>btn.setAttribute("onclick","confirmFinish()"));
    // hold-and-drag is the way to reorder; the old ▲▼ link only added clutter
    document.querySelectorAll("#wkBody .card-head .link").forEach(l=>{ if(/^↕ reorder$/.test(l.textContent.trim())) l.style.display="none"; });
  }catch(e){}
  return r;
};

/* Today page: today's workout list shows up there too, so it isn't forgotten */
function todayWorkoutCard(){
  const p = typeof dayPlan==="function" ? dayPlan() : null;
  if(!p) return null;
  const st = p.items.map(it=> it.k==="wk" ? (doneSess(it.id).some(h=>h.d===p.d) ? 1 : 0)
                                         : (cardio.some(c=>c.d===p.d && c.type===it.type) || (p.skip||[]).includes(it.type) ? 1 : 0));
  const done = st.reduce((a,b)=>a+b,0), left = p.items.filter((it,i)=>!st[i]);
  const name = it => it.k==="wk" ? ((wkById(it.id)||{}).name||"Workout") : (it.type==="Stairs" ? "Stair climber" : it.type);
  const el = document.createElement("div"); el.className = "card twc" + (done===p.items.length ? " alldone" : "");
  el.innerHTML = `<div class="card-head"><span class="card-title">Today's workout</span>
      <span class="link" onclick="go('workouts')">${done} of ${p.items.length} done ›</span></div>
    <div class="dp-prog"><i style="width:${Math.round(done/p.items.length*100)}%"></i></div>
    <div class="dp-count">${left.length ? "Still to do: " + left.map(name).join(", ") : "Everything's logged 🔥"}</div>`;
  el.onclick = e => { if(!e.target.closest(".link")) go("workouts"); };
  return el;
}
const _render61 = render;
render = function(){
  const r = _render61.apply(this, arguments);
  try{
    const old = document.querySelector("#view-today .twc"); if(old) old.remove();
    const c = todayWorkoutCard(); const anchor = $id("carryBox");
    if(c && anchor) anchor.after(c);
  }catch(e){}
  return r;
};
try{ render(); }catch(e){}
})();

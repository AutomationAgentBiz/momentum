/* =====================================================================
   v62
     1. Each move gets a small ⋯ button: make it timed (set seconds), equipment,
        or take a today-only move off. No separate "Timed moves" list.
     2. Ask understands "move X to Tuesday" without the AI.
     3. Small layout fixes (floating + on Body pages, solid button bars, no jump
        when a move turns ✓ Done).
   ===================================================================== */
(function(){
const $id = id => document.getElementById(id);
const fmtS = s => { s = Math.max(0, Math.round(s)); const m = Math.floor(s/60), r = s%60; return m ? `${m}:${String(r).padStart(2,"0")}` : `${r}s`; };

/* ---------------------------------------------------------------------------
   1. The ⋯ menu on each move
   --------------------------------------------------------------------------- */
function moveRef(i){
  const e = sessEx()[i]; if(!e || !wkSession) return {};
  const w = wkById(wkSession.id);
  const own = w && w.ex.find(x=>x.n===e.n);                 // saved on the workout
  const once = (wkSession.extra||[]).find(x=>x.n===e.n);    // added just for today
  return {e, w, def: own || once, once: !own};
}
window.openMoveMenu = function(i){
  const {e, def, once} = moveRef(i); const body = $id("nodeBody"); if(!def || !body) return;
  const timed = def.t==="s";
  body.innerHTML = `<h2 style="margin:0 0 12px">${esc(e.n)}</h2>
    ${timed ? `
      <div class="mm-box">
        <div class="mm-l">⏱ Timed move — time limit</div>
        <div class="tm-row" style="margin-top:6px">
          <div class="stepbtn" onclick="mmAdj(${i},-15)">−</div>
          <div class="mm-s" id="mmS">${fmtS(def.d||60)}</div>
          <div class="stepbtn plus" onclick="mmAdj(${i},15)">+</div>
        </div>
      </div>
      <button class="b b-ghost mm-b" onclick="mmTimed(${i},false)">Count reps instead</button>`
    : `<button class="b b-primary mm-b" onclick="mmTimed(${i},true)">⏱ Make it timed</button>
       <div class="mm-hint">For holds like wall squats or planks — you get a countdown instead of reps.</div>`}
    ${timed ? "" : `<button class="b b-ghost mm-b" onclick="closeAll();toggleLoad(${i})">🏋️ Equipment — vest, bands, dumbbells</button>`}
    ${once ? `<button class="b b-ghost mm-b" style="color:#ff9d9d" onclick="closeAll();rmSessionMove(${i})">Remove (added just for today)</button>` : ""}
    <div class="btns"><button class="b b-ghost" style="width:100%" onclick="closeAll()">Close</button></div>`;
  openSheet("node");
};
window.mmTimed = function(i, on){
  const {def} = moveRef(i); if(!def) return;
  if(on){ def.was = def.t; def.dr = def.d; def.t = "s"; def.d = 60; }
  else { def.t = def.was && def.was!=="s" ? def.was : "r"; def.d = def.dr && def.dr<60 ? def.dr : 10; delete def.was; delete def.dr; }
  save(); renderSession(); openMoveMenu(i);
  toast(on ? `${def.n} is timed now — 1:00` : `${def.n} counts reps again`);
};
window.mmAdj = function(i, d){
  const {def} = moveRef(i); if(!def) return;
  def.d = Math.max(5, Math.min(3600, (def.d||60) + d));
  // today's goal follows the new limit unless you've already changed it in the workout
  (wkSession.entries[def.n]||[]).forEach(x=>{ if(x) delete x.tgt; });
  save(); const s = $id("mmS"); if(s) s.textContent = fmtS(def.d);
  try{ if(typeof paintTimed==="function") paintTimed(); }catch(e){}
};
function addDots(){
  if(!wkSession) return;
  sessEx().forEach((e,i)=>{
    const inp = $id("wsRep"+i); const row = inp && inp.closest(".ex"); if(!row) return;
    const top = row.querySelector(".ex-top"); if(!top || top.querySelector(".mm-dots")) return;
    const b = document.createElement("span"); b.className = "mm-dots"; b.textContent = "⋯"; b.title = "Timed, equipment…";
    b.onclick = ev => { ev.stopPropagation(); openMoveMenu(i); };
    top.appendChild(b);
  });
}
const _rs62 = renderSession;
renderSession = function(){ const r = _rs62.apply(this, arguments); try{ addDots(); }catch(e){} return r; };

/* ---------------------------------------------------------------------------
   2. "move flyers to Tuesday" — handled right here, no AI needed
   --------------------------------------------------------------------------- */
const DAYW = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
function dayFrom(s){
  s = s.toLowerCase().trim();
  const d = new Date();
  if(/^(today|tonight)$/.test(s)) return ymd(d);
  if(s==="tomorrow"){ d.setDate(d.getDate()+1); return ymd(d); }
  if(s==="next week"){ d.setDate(d.getDate()+((8-d.getDay())%7||7)); return ymd(d); }
  const m = s.match(/^(next |this )?(sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)[a-z]*$/);
  if(m){ const t = DAYW.findIndex(x=>x.startsWith(m[2])); let add = (t - d.getDay() + 7) % 7; if(add===0) add = 7;
    d.setDate(d.getDate()+add); return ymd(d); }
  return null;
}
function findTask(q){
  const words = q.toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(w=>w.length>2 && !["the","task","my"].includes(w));
  if(!words.length) return null;
  let best = null, score = 0;
  tasks.filter(t=>!t.routine && !t.done).forEach(t=>{
    const n = t.name.toLowerCase();
    const s = words.filter(w=>n.includes(w) || (w.endsWith("s") && n.includes(w.slice(0,-1)))).length / words.length;
    if(s > score){ score = s; best = t; }
  });
  return score >= 0.5 ? best : null;
}
const _askAction62 = askAction;
askAction = function(text){
  const m = text.trim().match(/^(?:please\s+)?(?:move|push|put|reschedule)\s+(.+)\s+(?:to|on|for|until)\s+(.+?)[.!]?$/i);
  if(m){
    const when = dayFrom(m[2]);
    if(when){
      const t = findTask(m[1]);
      if(t){ t.date = when; t.sched = true; save(); try{ refreshAll(); }catch(e){ try{ render(); }catch(_){} }
        return `<div style="font-weight:800;color:#4fd6a5;margin-bottom:4px">✓ Moved</div><div><b>${esc(t.name)}</b> is now on ${new Date(when+"T12:00:00").toLocaleDateString(undefined,{weekday:"long",month:"short",day:"numeric"})}.</div>`; }
      return `<div>I couldn't find a task matching "<b>${esc(m[1])}</b>". Try a word from its name.</div>`;
    }
  }
  return _askAction62(text);
};

/* ---------------------------------------------------------------------------
   3. Floating + stays off the Body pages, where every row has its own buttons
   --------------------------------------------------------------------------- */
const _go62 = go;
go = function(v){ const r = _go62.apply(this, arguments);
  document.body.classList.toggle("bodyview", ["workouts","meals","health"].includes(v)); return r; };
try{ document.body.classList.toggle("bodyview", ["workouts","meals","health"].includes(curView())); }catch(e){}
})();

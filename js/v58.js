/* =====================================================================
   v58 — workout comfort
     1. Leave the app mid-workout and come back to the same spot (not the top)
     2. A move you've logged is clearly marked done (green + ✓)
     3. Hold a move and drag it to reorder the workout
   Nothing here deletes or rewrites logged sets — they're stored by move name,
   so changing the order never touches them.
   ===================================================================== */
(function(){
const $id = id => document.getElementById(id);
const inLive = () => {
  const v = (document.querySelector(".view.active")||{}).id;
  return v==="view-workouts" && !!wkSession && !!document.querySelector("#wkBody #wsRep0");
};

/* ---------------------------------------------------------------------------
   1. Come back to the same spot
   --------------------------------------------------------------------------- */
const RKEY = "momentum.resume";
function topMove(){
  // the move nearest the top of the screen — survives small layout changes better than a pixel number
  const rows = [...document.querySelectorAll("#wkBody .ex[data-n]")];
  const r = rows.find(el=>el.getBoundingClientRect().bottom > 90);
  return r ? {n:r.dataset.n, off: Math.round(r.getBoundingClientRect().top)} : null;
}
function remember(){
  try{
    if(!inLive()) { const old = JSON.parse(localStorage.getItem(RKEY)||"null");
      if(old && old.view==="workouts" && !wkSession) localStorage.removeItem(RKEY); return; }
    localStorage.setItem(RKEY, JSON.stringify({view:"workouts", sid:wkSession.sid, id:wkSession.id,
      y: Math.round(window.scrollY||0), top: topMove(), at: Date.now()}));
  }catch(e){}
}
let scrollT = null;
window.addEventListener("scroll", ()=>{ clearTimeout(scrollT); scrollT = setTimeout(remember, 250); }, {passive:true});
document.addEventListener("visibilitychange", ()=>{ if(document.visibilityState==="hidden") remember(); });
window.addEventListener("pagehide", remember);

function putBack(st){
  const go2 = () => {
    let y = st.y||0;
    if(st.top && st.top.n){
      const el = [...document.querySelectorAll("#wkBody .ex[data-n]")].find(x=>x.dataset.n===st.top.n);
      if(el) y = window.scrollY + el.getBoundingClientRect().top - (st.top.off||0);
    }
    window.scrollTo(0, Math.max(0, y));
  };
  requestAnimationFrame(()=>requestAnimationFrame(go2));
  setTimeout(go2, 350);                         // again once fonts/images have settled
}
/* After a reload (the phone closed the tab, or sync pulled a newer copy) */
function resumeOnBoot(){
  try{
    const st = JSON.parse(localStorage.getItem(RKEY)||"null");
    if(!st || st.view!=="workouts" || !wkSession) return;
    if(Date.now() - (st.at||0) > 8*3600*1000) return;            // a fresh day starts at the top
    const pairSid = wkSession.pair && wkSession.pair.sid;
    if(st.sid!==wkSession.sid && st.sid!==pairSid) return;
    if(st.sid===pairSid && typeof switchPair==="function"){       // you were on the other half
      const a=wkSession, b=a.pair; delete a.pair; b.pair=a; wkSession=b; }
    go("workouts");
    renderSession();
    putBack(st);
  }catch(e){ console.warn(e); }
}
setTimeout(resumeOnBoot, 60);
/* Back from another app without a reload: if anything redrew the page and threw
   you to the top, put you back. */
let hiddenAt = null;
document.addEventListener("visibilitychange", ()=>{
  if(document.visibilityState==="hidden"){ hiddenAt = inLive() ? {y:window.scrollY, top:topMove()} : null; return; }
  const st = hiddenAt; hiddenAt = null;
  if(!st || st.y < 80) return;
  setTimeout(()=>{ if(inLive() && window.scrollY < 40) putBack(st); }, 500);
});

/* ---------------------------------------------------------------------------
   2. Done moves stand out
   --------------------------------------------------------------------------- */
function paintDoneAll(){
  try{
    if(!wkSession) return;
    const EX = sessEx(), R = (wkSession.round||1)-1;
    EX.forEach((e,i)=>{
      const inp = $id("wsRep"+i); if(!inp) return;
      const row = inp.closest(".ex"); if(!row) return;
      row.dataset.n = e.n; row.dataset.i = i;
      const c = (wkSession.entries[e.n]||[])[R];
      const done = !!(c && +c.reps>0);
      row.classList.toggle("exdone", done);
      let b = row.querySelector(".donebadge");
      if(done && !b){ b = document.createElement("span"); b.className="donebadge"; b.textContent="✓ Done";
        const nm = row.querySelector(".ex-n"); if(nm) nm.appendChild(b); }
      if(!done && b) b.remove();
    });
    // the round tab turns green when every move in it is logged
    document.querySelectorAll('#wkBody .rtab').forEach((btn,r)=>{
      const all = EX.length && EX.every(e=>(wkSession.entries[e.n]||[])[r] && +wkSession.entries[e.n][r].reps>0);
      btn.classList.toggle("rdone", !!all);
    });
  }catch(e){}
}
window.paintDoneAll = paintDoneAll;
const _paintTotals58 = paintTotals;
paintTotals = function(){ const r = _paintTotals58.apply(this, arguments); paintDoneAll(); return r; };

/* ---------------------------------------------------------------------------
   3. Hold and drag to reorder
   --------------------------------------------------------------------------- */
const HOLD_MS = 380, SLOP = 9;
let hold = null, drag = null;
function rowsNow(){ return [...document.querySelectorAll("#wkBody .ex[data-n]")]; }
function canDrag(row){
  const w = wkById(wkSession && wkSession.id); if(!w) return false;
  return w.ex.some(e=>e.n===row.dataset.n);       // one-off moves added just for today stay put
}
function startHold(row, x, y){
  cancelHold();
  hold = {row, x, y, t: setTimeout(()=>beginDrag(row, y), HOLD_MS)};
  row.classList.add("holding");
}
function cancelHold(){ if(hold){ clearTimeout(hold.t); hold.row.classList.remove("holding"); hold = null; } }
function beginDrag(row, y){
  hold && hold.row.classList.remove("holding"); hold = null;
  if(!canDrag(row)){ toast("Moves added just for today can't be moved"); return; }
  try{ navigator.vibrate && navigator.vibrate(25); }catch(e){}
  try{ if(document.activeElement && document.activeElement.blur) document.activeElement.blur(); }catch(e){}
  const r = row.getBoundingClientRect();
  drag = {row, startY:y, lastY:y, grab: y - r.top};
  row.classList.add("dragging");
  document.body.classList.add("dragmode");
  autoScroll();
}
function moveDrag(y){
  if(!drag) return;
  drag.lastY = y;
  const row = drag.row;
  row.style.transform = "";                               // measure from its real slot
  const base = row.getBoundingClientRect().top;
  // swap with a neighbour once the finger passes its middle
  const list = rowsNow().filter(canDrag);
  const i = list.indexOf(row);
  const prev = list[i-1], next = list[i+1];
  const fingerTop = y - drag.grab;
  if(next){ const nr = next.getBoundingClientRect(); if(fingerTop + row.offsetHeight > nr.top + nr.height/2){ next.after(row); } }
  if(prev){ const pr = prev.getBoundingClientRect(); if(fingerTop < pr.top + pr.height/2){ prev.before(row); } }
  const now = row.getBoundingClientRect().top;
  row.style.transform = `translateY(${fingerTop - now}px)`;
  void base;
}
function endDrag(){
  if(!drag) return;
  const row = drag.row; drag = null;
  row.classList.remove("dragging"); row.style.transform = "";
  document.body.classList.remove("dragmode");
  const w = wkById(wkSession && wkSession.id); if(!w) return;
  const order = rowsNow().map(r=>r.dataset.n).filter(n=>w.ex.some(e=>e.n===n));
  const before = w.ex.map(e=>e.n).join("|");
  if(order.length===w.ex.length && order.join("|")!==before){
    const byName = Object.fromEntries(w.ex.map(e=>[e.n,e]));
    const old = w.ex.slice();
    w.ex = order.map(n=>byName[n]);
    save(); renderSession();
    if(typeof toastUndo==="function") toastUndo("Order changed", ()=>{ w.ex = old; save(); renderSession(); });
  } else renderSession();
}
function autoScroll(){
  if(!drag) return;
  const y = drag.lastY, h = window.innerHeight, edge = 90;
  let d = 0;
  if(y < edge) d = -Math.ceil((edge - y)/6);
  else if(y > h - edge - 70) d = Math.ceil((y - (h - edge - 70))/6);
  if(d){ window.scrollBy(0, d); moveDrag(y); }
  requestAnimationFrame(autoScroll);
}
const isControl = el => !!(el.closest && el.closest("input,button,select,textarea,.stepbtn,.addload,.wtgrp,.ordb,.xrm,.loadpanel,.chase a"));

// touch (phone)
document.addEventListener("touchstart", e=>{
  if(!inLive() || e.touches.length!==1) return;
  const row = e.target.closest && e.target.closest("#wkBody .ex[data-n]");
  if(!row || isControl(e.target)) return;
  startHold(row, e.touches[0].clientX, e.touches[0].clientY);
}, {passive:true});
document.addEventListener("touchmove", e=>{
  const t = e.touches[0];
  if(hold && (Math.abs(t.clientX-hold.x)>SLOP || Math.abs(t.clientY-hold.y)>SLOP)) cancelHold();   // it's a scroll
  if(drag){ e.preventDefault(); moveDrag(t.clientY); }
}, {passive:false});
document.addEventListener("touchend", ()=>{ cancelHold(); endDrag(); });
document.addEventListener("touchcancel", ()=>{ cancelHold(); endDrag(); });
// the long-press menu on phones would get in the way while dragging
document.addEventListener("contextmenu", e=>{ if(drag || (hold && e.target.closest && e.target.closest("#wkBody .ex"))) e.preventDefault(); });
// mouse (computer)
document.addEventListener("mousedown", e=>{
  if(!inLive() || e.button!==0) return;
  const row = e.target.closest && e.target.closest("#wkBody .ex[data-n]");
  if(!row || isControl(e.target)) return;
  startHold(row, e.clientX, e.clientY);
});
document.addEventListener("mousemove", e=>{
  if(hold && (Math.abs(e.clientX-hold.x)>SLOP || Math.abs(e.clientY-hold.y)>SLOP)) cancelHold();
  if(drag){ e.preventDefault(); moveDrag(e.clientY); }
});
document.addEventListener("mouseup", ()=>{ cancelHold(); endDrag(); });

/* ---- draw: tag rows, paint done, add the "hold to move" hint ---- */
const _renderSession58 = renderSession;
renderSession = function(){
  const r = _renderSession58.apply(this, arguments);
  try{
    paintDoneAll();
    const head = [...document.querySelectorAll("#wkBody .card-head")].find(h=>h.parentElement.querySelector("#wsRep0"));
    if(head && !head.parentElement.querySelector(".holdhint")){
      const tip = document.createElement("div"); tip.className = "holdhint";
      tip.textContent = "Hold a move, then drag it to change the order";
      head.after(tip);
    }
  }catch(e){}
  return r;
};
if(inLive()) paintDoneAll();
})();

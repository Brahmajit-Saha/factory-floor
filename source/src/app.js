/* ---------- Page: controls, drag and drop, zoom and pan, live panels. Uses gen.js, logic.js, render.js. ---------- */
(function(){
const $=id=>document.getElementById(id);
const cv=$('cv'), c=cv.getContext('2d'), stage=$('stage');
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN');
const num=(n,d)=>Number(n).toLocaleString('en-IN',{maximumFractionDigits:d||0});

const S={
  cfg:cloneCfg(), seed:'OPS-1', round:1, fi:0, K:4, R:6, Pn:12,
  tOver:null, bOver:null,
  pool:null, poolKey:'', auto:null, floor:null, ctx:null, rows:null,
  target:0, budget:0, m:0.6, need:0,
  items:[], nextId:1, undo:[], sel:null, multi:new Set(), selMode:false, drag:null, paint:null, armed:null, trayRot:0,
  V:{mode:'iso',zoom:1,px:0,py:0,rot:0}, an:null, dirty:true, W:0, H:0, dpr:1,
  fx:fxEnabled(), t:0, born:new Map(), puffs:[], prev:new Map(), fxUntil:0, fxArm:false
};
const poolCache={};
function toast(msg,ms){ const t=$('toast'); t.textContent=msg; t.classList.add('on'); clearTimeout(toast.h); toast.h=setTimeout(()=>t.classList.remove('on'),ms||1800); }

/* ---------- lock and clock (driven from outside by the game shell) ---------- */
let LOCK=true, OVER=null;
const locked=()=>LOCK;
function setClock(label,clock,cls){ $('tLabel').textContent=label; $('tClock').textContent=clock; $('timer').className=cls||''; }
function setLock(on,over){ // over: null or {title,html} shown as an overlay on the floor
  const was=LOCK; LOCK=!!on; OVER=on?over||null:null;
  if(LOCK&&!was){ S.armed=null; S.paint=null; S.drag=null; S.sel=null; S.selMode=false; S.multi.clear(); sbox=null; pend=null; pan=null; }
  if(!LOCK||(OVER&&OVER.title!==showOverlay.last)) showOverlay.dismissed=false; showOverlay.last=OVER?OVER.title:null;
  const o=$('timesup'); if(OVER&&!showOverlay.dismissed){ $('tuTitle').textContent=OVER.title; $('tuBody').innerHTML=OVER.html; o.querySelector('.box').className='box '+(OVER.cls||''); o.classList.add('on'); } else o.classList.remove('on');
  S.dirty=true; if(S.an){ updateTray(); }
}
function showOverlay(){}
showOverlay.dismissed=false;
$('tuClose').onclick=()=>{ showOverlay.dismissed=true; $('timesup').classList.remove('on'); };
let emitT=null;
function emitChange(now){ if(!Builder.onChange) return; const send=()=>{ emitT=null; Builder.onChange({items:S.items.map(i=>({id:i.id,type:i.type,x:i.x,y:i.y,rot:i.rot})),an:{total:S.an.total,pts:S.an.pts,rate:S.an.rate,cost:S.an.cost,hl:hlOf(S.an.sim,null)}}); }; if(now){ clearTimeout(emitT); send(); } else { clearTimeout(emitT); emitT=setTimeout(send,700); } }

/* ---------- loading a floor ---------- */
function loadFloor(keepView){
  let g;
  if(S.lay){ // the admin assigned this player a floor: build only that one
    const k1=S.seed+'|one|'+S.lay; if(!poolCache[k1]) poolCache[k1]=generateOne(S.seed,S.lay-1);
    g={index:S.lay,floor:poolCache[k1]};
    S.auto=(S.tOver&&S.bOver)?{target:S.tOver,budget:S.bOver}:autoParams(S.use&&S.use.length?S.use.map(n=>generateOne(S.seed,n-1)):[g.floor],S.K,S.cfg);
  } else {
    const key=S.seed+'|'+S.Pn;
    if(!poolCache[key]) poolCache[key]=generatePool(S.seed,S.Pn);
    S.pool=poolCache[key];
    S.auto=autoParams(S.pool,S.K,S.cfg);
    g=floorFor(S.seed,S.pool,S.K,S.R,S.round,S.fi);
  }
  S.floor=g; S.rows=g.floor.rows; S.ctx=floorCtx(S.rows);
  S.target=Math.max(10,Math.min(S.cfg.targetMax,S.tOver||S.auto.target));
  S.budget=Math.max(1000,Math.min(S.cfg.budgetMax,S.bOver||S.auto.budget));
  S.m=roundM(S.seed,S.round,S.cfg);
  S.need=needSpace(FACTORIES[S.fi],S.target,S.m);
  S.nextId=S.items.reduce((a,i)=>Math.max(a,i.id),0)+1;
  S.undo=[]; S.sel=null; S.multi.clear(); sbox=null; S.drag=null; S.paint=null; S.armed=null;
  if(!keepView){ resize(); fitView(S.V,S.rows,S.W,S.H); focusIn(); }
  refresh();
}
function focusIn(){
  // start zoomed in on the inbound bay, where most of the building happens
  const V=S.V, ctx=S.ctx; let sx=0,sy=0; for(const i of ctx.inb){ sx+=i%N+.5; sy+=Math.floor(i/N)+.5; } sx/=ctx.inb.length; sy/=ctx.inb.length;
  const w=[sx,sy]; V.zoom=Math.min(4,V.zoom*1.9); const q=P(V,w[0],w[1],0); V.px+=S.W/2-q[0]; V.py+=S.H/2-q[1];
}
function refresh(){
  fxSync(S.fxArm); S.fxArm=false; const prevOver=S.an?S.an.overBelts:0;
  S.an=analyze(S.items,S.ctx,S.cfg,{target:S.target,budget:S.budget,need:S.need,m:S.m,f:FACTORIES[S.fi],tr:S.tr,D:S.D});
  if(S.an.overBelts>prevOver) toast('Too many belts on one piece. A machine takes 2 in and 2 out, storage 3 in and 3 out. The extra belt is ignored (red outline).',4200);
  S.liveKey=''; S.dirty=true; if(S.liveT!=null) setLive(S.liveT); updatePanels(); updateTray(); updateBubble();
}

/* ---------- panels ---------- */
function setBar(id,frac,cls,txt){ const b=$(id); b.querySelector('i').style.width=Math.max(0,Math.min(1,frac))*100+'%'; b.className='bar '+(cls||''); b.querySelector('b').textContent=txt; }
function updatePanels(){
  const a=S.an, T=S.target, f=FACTORIES[S.fi];
  $('ctxline').textContent=(S.who?S.who+' · ':'')+'Factory '+f+' · Round '+S.round+' of '+S.R+' · Floor '+S.floor.index+' ('+S.floor.floor.family+')';
  const near=Math.abs(a.rate-T)/T<=0.05;
  setBar('barRate',a.rate/(T*1.25),near?'good':(a.rate>0?'warn':''),'Line rate '+num(a.rate,1)+' / '+num(T)+' units/min');
  $('barRate').style.setProperty('--mark','80%');
  const bf=a.cost/S.budget; setBar('barBudget',bf,bf>0.97?'bad':bf>0.85?'warn':'good','Budget '+inr(a.cost)+' / '+inr(S.budget));
  const sf=a.capacity/S.need; setBar('barStore',sf,sf>=1?'good':(a.capacity>0?'warn':''),'Storage '+num(a.capacity)+' / '+num(S.need)+' space');
  $('hl').innerHTML=hlHtml(hlOf(a.sim,S.liveT),S.liveT!=null);
  $('checks').innerHTML=CHECK_NAMES.map((n,i)=>{ const v=a.checks[i]; return '<li class="'+(v>=.999?'ok':v>0?'part':'no')+'"><span>'+n+'</span><em>'+Math.round(v*100)+'%</em></li>'; }).join('');
  $('stages').innerHTML='<tr><th>Stage</th><th>Fed</th><th>Capacity</th><th>Running at</th></tr>'+a.stages.map(x=>'<tr class="'+(x.bottleneck&&x.placed?'bn':'')+'"><td>'+x.stage+'. '+x.name+'</td><td>'+x.fed+' / '+x.placed+'</td><td>'+num(x.cap,1)+'</td><td>'+num(x.flow,1)+(x.bottleneck?' ◂':'')+'</td></tr>').join('');
  $('facts').innerHTML='<div><span>Human-only production rate</span><b>'+num(a.human)+' units/min</b></div>'
    +'<div><span>Machine slots</span><b>'+a.slots+' (machines + belt motors)</b></div>'
    +'<div><span>Complete belts</span><b>'+a.completeBelts+'</b></div>'
    +(a.overBelts?'<div><span>Belts over the connection limit</span><b style="color:#ff8a7a">'+a.overBelts+' (ignored)</b></div>':'')
    +'<div><span>Cheapest possible build</span><b>'+inr(a.cheapest)+'</b></div>';
  const d=deliveries(f,S.target,S.m);
  $('simres').innerHTML=simPanel();
  $('deliv').innerHTML='<tr><th>Each minute</th><th>Units</th><th>Space</th></tr>'
    +d.rm.map(x=>'<tr><td>'+x.id+'</td><td>'+num(x.units)+'</td><td>'+num(x.space)+'</td></tr>').join('')
    +'<tr class="sum"><td>Raw material batch</td><td></td><td>'+num(d.rmSpace)+'</td></tr>'
    +'<tr><td>Finished goods (× m = '+S.m.toFixed(2)+')</td><td></td><td>'+num(d.fgSpace)+'</td></tr>'
    +'<tr class="sum"><td>Space needed</td><td></td><td>'+num(d.total)+'</td></tr>';
}
/* ---------- the two highlights: finished goods shipped (green) and raw material turned away (red, by type) ---------- */
function hlOf(sm,t){ // up to the round clock second t, or for the whole round when t is null
  if(!sm) return {fg:0,rm:0,types:[]};
  let fg=sm.shipped, rm=sm.lost;
  if(t!=null){ const idx=Math.min(sm.tl.length-1,Math.max(0,Math.floor(t))); fg=sm.tl[idx].shipped; rm=0; for(const e of sm.ev) if(e.type==='in'&&e.t<=t) rm+=e.lost||0; }
  return {fg,rm,types:(sm.mix||[]).map(x=>[x.id,rm*x.share])};
}
function hlHtml(h,live,bare){
  const li=h.types.map(x=>'<li><span>'+x[0]+'</span><b>'+num(x[1])+'</b></li>').join('');
  return '<div class="hlc fg"><small>Finished goods shipped</small><b>'+num(h.fg)+'</b><em>units</em></div>'
    +'<div class="hlc rm"><small>Raw material turned away</small><b>'+num(h.rm)+'</b><em>units sent back</em>'+(h.rm>0.5?'<ul>'+li+'</ul>':'')+'</div>'
    +(bare?'':'<p class="note" style="grid-column:1/-1;margin:0">'+(live?'Up to now on the round clock.':'Projected for the whole round.')+' Your points are added after the round: the judges mark layout and flow.</p>');
}
/* ---------- trucks on the round clock ---------- */
function simLabel(t){ t=Math.max(0,Math.floor(t)); return Math.floor(t/60)+':'+String(t%60).padStart(2,'0'); }
function setTrucks(tr,D){ // schedule from the shell: the admin/GM may change it any time during the round
  const sig=JSON.stringify([tr||null,Math.round(D||0)]); if(sig===S.trSig) return; S.trSig=sig; S.tr=tr||null; S.D=Math.round(D)||720; if(S.rows) refresh();
}
function setLive(t){ // seconds since the round started, or null when no round is running
  if(t==null){ if(S.liveT!=null){ S.liveT=null; $('simclock').style.display='none'; S.dirty=true; } return; }
  const sm=S.an&&S.an.sim; S.liveT=t; if(!sm){ return; }
  const idx=Math.min(sm.tl.length-1,Math.max(0,Math.floor(t)));
  const ev=sm.ev.filter(e=>t>=e.t&&t<e.t+5);
  const key=idx+'|'+ev.length; if(key!==S.liveKey){ S.liveKey=key; S.play={f:sm.tl[idx],ev}; const h=hlOf(sm,t); $('simclock').innerHTML='Round '+simLabel(t)+' · <span style="color:#3fe08f">FG shipped <b>'+num(h.fg)+'</b></span> · <span style="color:#ff8a7a">RM turned away <b>'+num(h.rm)+'</b></span>'; $('simclock').style.display='block'; S.dirty=true; }
}
function simPanel(){
  const sm=S.an.sim; if(!sm) return '';
  return '<tr><th>Truck schedule (whole round)</th><th>Units</th></tr>'
   +'<tr><td>Offered by delivery trucks</td><td>'+num(sm.delivered)+'</td></tr>'
   +'<tr><td>Accepted into storage or line</td><td>'+num(sm.accepted)+'</td></tr>'
   +'<tr><td>Turned away (no room)</td><td>'+num(sm.lost)+'</td></tr>'
   +'<tr class="sum"><td>Shipped out</td><td>'+num(sm.shipped)+'</td></tr>'
   +'<tr><td>Average shipped per minute</td><td>'+num(sm.rate,1)+'</td></tr>';
}
function updateTray(){
  const cnt={}; for(const it of S.items) cnt[it.type]=(cnt[it.type]||0)+1;
  document.querySelectorAll('.card').forEach(el=>{
    const t=el.dataset.type, d=S.cfg.pieces[t];
    el.querySelector('.n').textContent=cnt[t]?'×'+cnt[t]:'';
    el.classList.toggle('armed',S.armed===t);
    el.classList.toggle('cant',S.an.cost+d.cost>S.budget);
  });
  $('rotInfo').textContent=(S.trayRot*90)+'°';
  $('undo').disabled=!S.undo.length;
  multiPrune(); selPaint();
}

/* ---------- selected piece bubble ---------- */
function selItem(){ return S.sel==null?null:S.items.find(i=>i.id===S.sel)||null; }
function updateBubble(){
  const b=$('bubble'), it=selItem(); $('delSel').disabled=!it||locked();
  if(!it||S.drag){ b.style.display='none'; return; }
  const d=S.cfg.pieces[it.type], [w,h]=dims(d,it.rot), zz=S.V.mode==='flat'?0:2.8;
  const cs=[[it.x,it.y],[it.x+w,it.y],[it.x,it.y+h],[it.x+w,it.y+h]].map(q=>P(S.V,q[0],q[1],zz)), px=(Math.min(...cs.map(q=>q[0]))+Math.max(...cs.map(q=>q[0])))/2, py=Math.min(...cs.map(q=>q[1]));
  b.style.display='flex'; b.style.left=Math.round(px)+'px'; b.style.top=Math.round(py)+'px';
  $('bubTitle').textContent=d.name+' · drag to move';
}

/* ---------- canvas size and loop ---------- */
function resize(){
  const r=stage.getBoundingClientRect(); S.dpr=Math.min(2,window.devicePixelRatio||1);
  S.W=Math.max(100,Math.round(r.width)); S.H=Math.max(100,Math.round(r.height));
  cv.width=S.W*S.dpr; cv.height=S.H*S.dpr; cv.style.width=S.W+'px'; cv.style.height=S.H+'px'; S.dirty=true;
}
let animAt=0;
function frame(now){
  now=now||performance.now(); S.t=now/1000;
  const run=S.fx&&S.liveT!=null&&!!S.play; S.run=run;
  if(S.fx&&S.rows){
    if(run&&now-animAt>33){ animAt=now; S.anim=(now/1300)%1; S.dirty=true; }
    else if(now<S.fxUntil){ S.dirty=true; }
    else if(S.puffs.length||S.born.size){ S.puffs=[]; S.born.clear(); S.dirty=true; }
  }
  if(S.dirty&&S.rows){ S.dirty=false;
    const ghost=S.drag&&S.drag.cand?{item:S.drag.cand,ok:S.drag.ok,reason:S.drag.ok?'':S.drag.reason}:null;
    drawScene(c,S.V,S.W,S.H,{rows:S.rows,items:S.items,cfg:S.cfg,an:S.an,ctx:S.ctx,sel:S.sel,ghost,paintCells:S.paint?S.paint.cells:null,dpr:S.dpr,anim:S.anim||0,play:S.play,t:S.t,fx:S.fx,run:S.run,born:S.born,puffs:S.puffs});
    if(S.selMode||S.multi.size||sbox) drawMulti();
    updateBubble();
  }
  requestAnimationFrame(frame);
}

/* ---------- editing helpers ---------- */
function snapshot(){ S.undo.push(JSON.stringify(S.items)); if(S.undo.length>60) S.undo.shift(); }
function commit(){ S.fxArm=true; refresh(); emitChange(); }
/* a piece that was just put down drops in with a bounce and a puff of dust; one taken away goes with a poof */
function fxSync(effects){
  const now=performance.now()/1000, cur=new Map(S.items.map(i=>[i.id,i]));
  if(effects&&S.fx){ for(const it of S.items){ const o=S.prev.get(it.id); if(!o||o.x!==it.x||o.y!==it.y||o.rot!==it.rot||o.type!==it.type) S.born.set(it.id,now); }
    for(const [id,o] of S.prev) if(!cur.has(id)){ const [w,h]=dims(S.cfg.pieces[o.type],o.rot); S.puffs.push({x:o.x,y:o.y,w,h,t0:now}); }
    S.fxUntil=performance.now()+1200; }
  S.prev=new Map(S.items.map(i=>[i.id,{type:i.type,x:i.x,y:i.y,rot:i.rot}]));
}
function candAt(type,rot,sx,sy,touch){
  const d=S.cfg.pieces[type], [w,h]=dims(d,rot);
  const g=unP(S.V,sx,sy-(touch?44:0));
  return {type,rot,x:Math.round(g[0]-w/2),y:Math.round(g[1]-h/2)};
}
function overStage(x,y){ const r=stage.getBoundingClientRect(); return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom; }
function updateCand(d,cx,cy){
  const r=stage.getBoundingClientRect(); d.cx=cx; d.cy=cy;
  d.remove=false; if(!overStage(cx,cy)){ d.cand=null; return; }
  const type=d.type||d.item.type;
  if(d.grab){ const g=unP(S.V,cx-r.left,cy-r.top); d.cand={type,rot:d.rot,x:Math.round(g[0]+d.grab[0]),y:Math.round(g[1]+d.grab[1])}; }
  else d.cand=candAt(type,d.rot,cx-r.left,cy-r.top,d.touch);
  const chk=checkPlace(S.ctx,S.items,d.cand,S.cfg,S.budget,d.item?d.item.id:null);
  d.ok=chk.ok; d.reason=chk.reason; d.remove=false;
  if(d.kind==='move'){ const g=unP(S.V,cx-r.left,cy-r.top), gx=Math.floor(g[0]), gy=Math.floor(g[1]); // let go outside the factory outline: the piece is removed
    if(gx<0||gy<0||gx>=N||gy>=N||S.rows[gy][gx]==='.'){ d.remove=true; d.ok=false; d.reason='Release to remove'; } }
}
function placeCand(d){
  if(!d.cand) return false;
  if(!d.ok){ toast(d.reason); return false; }
  const it=Object.assign({},d.cand,{id:d.item?d.item.id:S.nextId++});
  S.items.push(it); S.sel=it.id; return true;
}
function rotateSel(){
  if(locked()) return; const it=selItem(); if(!it) return;
  const d=S.cfg.pieces[it.type], [w,h]=dims(d,it.rot), nr=(it.rot+1)%4, [w2,h2]=dims(d,nr);
  const bx=it.x+Math.round((w-w2)/2), by=it.y+Math.round((h-h2)/2);
  const tries=[[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]];
  for(const [dx,dy] of tries){
    const cand={type:it.type,rot:nr,x:bx+dx,y:by+dy};
    if(checkPlace(S.ctx,S.items,cand,S.cfg,S.budget,it.id).ok){ snapshot(); Object.assign(it,cand); commit(); return; }
  }
  toast('No room to rotate here');
}
function removeSel(){ if(locked()) return; const it=selItem(); if(!it) return; snapshot(); S.items=S.items.filter(i=>i.id!==it.id); S.sel=null; commit(); }
$('delSel').onclick=()=>removeSel();

/* ---------- select an area, then delete everything in it at once ---------- */
let sbox=null; // the box being dragged: {id,a,b,add,moved} with a and b in floor coordinates
function multiPrune(){ for(const id of [...S.multi]) if(!S.items.some(i=>i.id===id)) S.multi.delete(id); }
function selPaint(){
  const on=S.selMode&&!locked(), n=S.multi.size;
  $('selArea').classList.toggle('sel',on); $('selArea').textContent=on?'Selecting…':'Select area'; $('selArea').disabled=locked();
  $('delMulti').disabled=locked()||!n; $('delMulti').textContent=n?'Delete '+n+' selected':'Delete selected';
  if(on) cv.style.cursor='crosshair'; else if(cv.style.cursor==='crosshair') cv.style.cursor='';
}
function setSelMode(on){
  S.selMode=!!on&&!locked();
  if(S.selMode){ S.sel=null; S.armed=null; S.paint=null; updateTray(); if(!S.tipArea){ S.tipArea=1; toast('Drag a box over the floor to pick pieces, then press Delete selected. Tap a piece to add or drop it.',4200); } }
  else { S.multi.clear(); sbox=null; }
  selPaint(); updateBubble(); S.dirty=true;
}
function boxCells(b){ const cl=v=>Math.max(0,Math.min(N-1,Math.floor(v))); return {x0:cl(Math.min(b.a[0],b.b[0])),x1:cl(Math.max(b.a[0],b.b[0])),y0:cl(Math.min(b.a[1],b.b[1])),y1:cl(Math.max(b.a[1],b.b[1]))}; }
function itemsIn(r){ // ids of every piece with at least one cell inside the box
  const out=[]; for(const it of S.items){ for(const p of parts(it,S.cfg.pieces[it.type])) if(p.x>=r.x0&&p.x<=r.x1&&p.y>=r.y0&&p.y<=r.y1){ out.push(it.id); break; } } return out;
}
function finishSelBox(b,sx,sy){
  if(b.moved){ if(!b.add) S.multi.clear(); for(const id of itemsIn(boxCells(b))) S.multi.add(id); if(!S.multi.size) toast('No pieces in that box'); }
  else { const it=itemAt(sx,sy); if(it){ if(S.multi.has(it.id)) S.multi.delete(it.id); else S.multi.add(it.id); } else if(!b.add) S.multi.clear(); }
  selPaint(); S.dirty=true;
}
function removeMulti(){
  if(locked()||!S.multi.size) return; const ids=S.multi, n=ids.size;
  snapshot(); S.items=S.items.filter(i=>!ids.has(i.id)); S.multi=new Set(); S.sel=null; commit(); toast('Removed '+n+' piece'+(n>1?'s':'')+'. Undo brings them back.',2800);
}
function drawMulti(){
  const V=S.V; c.setTransform(S.dpr,0,0,S.dpr,0,0);
  let live=null, r=null;
  if(sbox&&sbox.moved){ r=boxCells(sbox); live=new Set(itemsIn(r));
    poly(c,[P(V,r.x0,r.y0),P(V,r.x1+1,r.y0),P(V,r.x1+1,r.y1+1),P(V,r.x0,r.y1+1)],'rgba(255,90,70,.16)',null);
    c.save(); c.setLineDash([7,5]); c.lineWidth=2; c.strokeStyle='#ff6a55'; c.beginPath(); [[r.x0,r.y0],[r.x1+1,r.y0],[r.x1+1,r.y1+1],[r.x0,r.y1+1]].forEach(([x,y],i)=>{ const q=P(V,x,y); i?c.lineTo(q[0],q[1]):c.moveTo(q[0],q[1]); }); c.closePath(); c.stroke(); c.restore(); }
  const all=new Set(S.multi); if(live) for(const id of live) all.add(id);
  for(const it of S.items) if(all.has(it.id)){ c.lineWidth=2.5; for(const q of parts(it,S.cfg.pieces[it.type])) poly(c,[P(V,q.x,q.y),P(V,q.x+1,q.y),P(V,q.x+1,q.y+1),P(V,q.x,q.y+1)],'rgba(255,90,70,.3)','#ff6a55'); c.lineWidth=1; }
  if(r){ const q=P(V,(r.x0+r.x1+1)/2,r.y0,0); pill(c,all.size+' selected',q[0],q[1]-12,'#c93b2a','#fff',Math.max(10,11*V.zoom)); }
}
$('selArea').onclick=()=>{ if(locked()){ toast('The floor is locked right now'); return; } setSelMode(!S.selMode); };
$('delMulti').onclick=()=>removeMulti();
function doRotate(){
  if(locked()) return;
  if(S.drag){ S.drag.rot=(S.drag.rot+1)%4; updateCand(S.drag,S.drag.cx,S.drag.cy); S.dirty=true; return; }
  if(selItem()) rotateSel(); else { S.trayRot=(S.trayRot+1)%4; updateTray(); toast('New pieces will be turned '+(S.trayRot*90)+'°'); }
}

/* ---------- belt painting: drag across the floor to lay a line of connectors ---------- */
function path4(a,b){ // 4-connected cells from a (excluded) to b (included)
  const out=[]; let x=a[0], y=a[1]; const dx=b[0]-x, dy=b[1]-y, sx=Math.sign(dx), sy=Math.sign(dy), nx=Math.abs(dx), ny=Math.abs(dy); let ix=0, iy=0;
  while(ix<nx||iy<ny){ if((0.5+ix)/nx<(0.5+iy)/ny){ x+=sx; ix++; } else { y+=sy; iy++; } out.push([x,y]); }
  return out;
}
function paintStart(sx,sy,touch,id,src){ S.paint={cells:[],keys:new Set(),pend:[],last:null,touch,id,src,reason:''}; paintMove(sx,sy); }
function paintMove(sx,sy){
  const P=S.paint; if(!P) return;
  const c=candAt('BC',0,sx,sy,P.touch), to=[c.x,c.y];
  const cells=P.last?path4(P.last,to):[to];
  for(const [x,y] of cells){
    const key=x+','+y; if(P.keys.has(key)) continue; P.keys.add(key);
    const cand={type:'BC',rot:0,x,y}, chk=checkPlace(S.ctx,S.items.concat(P.pend),cand,S.cfg,S.budget);
    P.cells.push({x,y,ok:chk.ok}); if(chk.ok) P.pend.push(Object.assign({id:-1-P.pend.length},cand)); else P.reason=chk.reason;
  }
  P.last=to; S.dirty=true;
}
function paintCommit(){
  const P=S.paint; S.paint=null; S.dirty=true; if(!P) return;
  if(!P.pend.length){ if(P.reason) toast(P.reason); return; }
  snapshot(); for(const it of P.pend){ it.id=S.nextId++; S.items.push(it); } S.sel=null; commit();
  const skipped=P.cells.length-P.pend.length; if(skipped>0) toast(skipped+' connector'+(skipped>1?'s':'')+' skipped: '+P.reason);
}

/* ---------- tray: drag a piece onto the floor ---------- */
document.querySelectorAll('.card').forEach(el=>{
  el.addEventListener('pointerdown',e=>{
    if(e.button>0) return; e.preventDefault();
    if(locked()){ toast('The floor is locked right now'); return; }
    if(S.selMode) setSelMode(false);
    const type=el.dataset.type;
    S.drag={kind:'new',type,rot:S.trayRot,touch:e.pointerType==='touch',sx:e.clientX,sy:e.clientY,moved:false,cand:null,ok:false,reason:'',id:e.pointerId};
    window.addEventListener('pointermove',onWinMove); window.addEventListener('pointerup',onWinUp); window.addEventListener('pointercancel',onWinUp);
  });
});
function onWinMove(e){
  const d=S.drag; if(!d||e.pointerId!==d.id) return;
  if(!d.moved&&Math.hypot(e.clientX-d.sx,e.clientY-d.sy)>8) d.moved=true;
  if(d.moved){ updateCand(d,e.clientX,e.clientY); S.dirty=true; }
}
function onWinUp(e){
  const d=S.drag; if(!d||e.pointerId!==d.id) return;
  window.removeEventListener('pointermove',onWinMove); window.removeEventListener('pointerup',onWinUp); window.removeEventListener('pointercancel',onWinUp);
  S.drag=null;
  if(d.kind==='new'){
    if(!d.moved){ S.armed=(S.armed===d.type)?null:d.type; if(S.armed) toast(d.type==='BC'?'Drag across the floor to lay connectors. Tap the piece again to stop.':'Tap the floor to place. Tap the piece again to stop.',2800); updateTray(); S.dirty=true; return; }
    if(e.type!=='pointercancel'){ updateCand(d,e.clientX,e.clientY); snapshot(); if(placeCand(d)){ commit(); if(d.type==='BC'&&!S.tipBC){ S.tipBC=1; toast('Tip: tap the Connector card, then drag across the floor to lay a whole line.',4200); } } else { S.undo.pop(); refresh(); } }
  } else if(d.kind==='move'){
    const overTray=document.elementFromPoint(e.clientX,e.clientY);
    if(overTray&&overTray.closest&&overTray.closest('#tray')&&e.type!=='pointercancel'){ S.sel=null; S.items=S.items.filter(i=>i.id!==d.item.id); commit(); toast('Removed'); return; }
    updateCand(d,e.clientX,e.clientY);
    if(e.type!=='pointercancel'&&d.remove){ S.sel=null; S.items=S.items.filter(i=>i.id!==d.item.id); commit(); toast('Removed'); return; }
    if(e.type!=='pointercancel'&&d.cand&&d.ok){ const it=Object.assign({},d.cand,{id:d.item.id}); S.items.push(it); S.sel=it.id; commit(); }
    else { S.items.push(d.orig); S.sel=d.orig.id; S.undo.pop(); if(d.cand&&!d.ok) toast(d.reason); refresh(); }
  }
  S.dirty=true;
}

/* ---------- canvas: pan, zoom, select, move, stamp ---------- */
const ptrs=new Map(); let pan=null, pend=null, pinch=null, rotDrag=null;
function localXY(e){ const r=stage.getBoundingClientRect(); return [e.clientX-r.left,e.clientY-r.top]; }
function itemAt(sx,sy){
  const g=unP(S.V,sx,sy), gx=Math.floor(g[0]), gy=Math.floor(g[1]);
  const occ=occupancy(S.items,S.cfg);
  if(gx>=0&&gy>=0&&gx<N&&gy<N){ const k=occ[gy*N+gx]; if(k>=0) return S.items[k]; }
  if(S.V.mode==='iso'){ // tall pieces: also try the cell just behind the click
    const g2=unP(S.V,sx,sy+14*S.V.zoom), x2=Math.floor(g2[0]), y2=Math.floor(g2[1]);
    if(x2>=0&&y2>=0&&x2<N&&y2<N){ const k=occ[y2*N+x2]; if(k>=0) return S.items[k]; }
  }
  return null;
}
cv.addEventListener('pointerdown',e=>{
  if(e.target!==cv) return; cv.setPointerCapture(e.pointerId);
  const [x,y]=localXY(e); ptrs.set(e.pointerId,{x,y,sx:x,sy:y,t:Date.now(),touch:e.pointerType==='touch'});
  if(ptrs.size===2){ const [a,b]=[...ptrs.values()]; pinch={d:Math.hypot(a.x-b.x,a.y-b.y),z:S.V.zoom,a:Math.atan2(b.y-a.y,b.x-a.x)}; pan=null; pend=null; rotDrag=null; sbox=null; S.paint=null; S.dirty=true; return; }
  if(ptrs.size>2) return;
  if(S.selMode&&!locked()&&e.button===0&&!e.shiftKey){ const g=unP(S.V,x,y); sbox={id:e.pointerId,a:g,b:g,add:e.ctrlKey||e.metaKey,moved:false}; S.dirty=true; return; }
  if(e.shiftKey){ rotDrag={id:e.pointerId,x,acc:0}; return; } // Shift + drag sideways turns the view
  const hit=locked()?null:itemAt(x,y);
  if(S.armed==='BC'&&e.button===0&&!locked()&&!hit){ paintStart(x,y,e.pointerType==='touch',e.pointerId,'canvas'); return; }
  const it=hit;
  if(it) pend={it,x,y,touch:e.pointerType==='touch',id:e.pointerId};
  else pan={x,y,px:S.V.px,py:S.V.py,id:e.pointerId,moved:false};
});
cv.addEventListener('pointermove',e=>{
  const p=ptrs.get(e.pointerId);
  if(!p){ if(e.pointerType==='mouse'&&!S.drag){ const [hx,hy]=localXY(e); cv.style.cursor=S.selMode?'crosshair':(!locked()&&itemAt(hx,hy))?'grab':''; } return; }
  const [x,y]=localXY(e); p.x=x; p.y=y;
  if(rotDrag&&rotDrag.id===e.pointerId){ rotDrag.acc+=x-rotDrag.x; rotDrag.x=x; if(Math.abs(rotDrag.acc)>70){ rotateView(rotDrag.acc>0?1:-1); rotDrag.acc=0; } return; }
  if(sbox&&sbox.id===e.pointerId){ sbox.b=unP(S.V,x,y); if(Math.hypot(x-p.sx,y-p.sy)>6) sbox.moved=true; S.dirty=true; return; }
  if(pinch&&ptrs.size===2){ const [a,b]=[...ptrs.values()]; const nd=Math.hypot(a.x-b.x,a.y-b.y); zoomAt((a.x+b.x)/2,(a.y+b.y)/2,pinch.z*nd/pinch.d,true);
    let da=Math.atan2(b.y-a.y,b.x-a.x)-pinch.a; while(da>Math.PI) da-=2*Math.PI; while(da<-Math.PI) da+=2*Math.PI;
    if(Math.abs(da)>0.8){ rotateView(da>0?1:-1); pinch.a+=da; } return; }
  if(S.paint&&S.paint.src==='canvas'&&S.paint.id===e.pointerId){ paintMove(x,y); return; }
  if(S.drag&&S.drag.kind==='move'&&S.drag.id===e.pointerId){ updateCand(S.drag,e.clientX,e.clientY); S.dirty=true; return; }
  if(pend&&pend.id===e.pointerId&&Math.hypot(x-pend.x,y-pend.y)>6){
    snapshot(); const it=pend.it; S.items=S.items.filter(i=>i.id!==it.id); S.sel=it.id;
    const g0=unP(S.V,pend.x,pend.y);
    S.drag={kind:'move',item:it,orig:Object.assign({},it),type:it.type,rot:it.rot,touch:pend.touch,id:e.pointerId,cand:null,ok:false,reason:'',grab:[it.x-g0[0],it.y-g0[1]]}; cv.style.cursor='grabbing';
    if(!S.tipMove){ S.tipMove=1; toast('Drop it on a free spot to move it, or on the cards at the bottom to remove it.',3600); }
    pend=null; updateCand(S.drag,e.clientX,e.clientY); refresh(); S.dirty=true; return;
  }
  if(pan&&pan.id===e.pointerId){ if(Math.hypot(x-pan.x,y-pan.y)>4) pan.moved=true; S.V.px=pan.px+(x-pan.x); S.V.py=pan.py+(y-pan.y); S.dirty=true; }
});
function endPtr(e){
  const p=ptrs.get(e.pointerId); if(!p) return; ptrs.delete(e.pointerId);
  if(rotDrag&&rotDrag.id===e.pointerId){ rotDrag=null; return; }
  if(pinch){ if(ptrs.size<2) pinch=null; pan=null; pend=null; return; }
  const [x,y]=localXY(e);
  if(sbox&&sbox.id===e.pointerId){ const bx=sbox; sbox=null; if(e.type==='pointerup') finishSelBox(bx,x,y); S.dirty=true; return; }
  if(S.paint&&S.paint.src==='canvas'&&S.paint.id===e.pointerId){ if(e.type==='pointercancel') S.paint=null; paintCommit(); return; }
  if(S.drag&&S.drag.kind==='move'&&S.drag.id===e.pointerId){ onMoveDrop(e); return; }
  if(pend&&pend.id===e.pointerId){ S.sel=pend.it.id; pend=null; updateBubble(); S.dirty=true; return; }
  if(pan&&pan.id===e.pointerId){
    const tap=!pan.moved; pan=null;
    if(tap&&e.type==='pointerup'){
      if(S.armed){
        const d={type:S.armed,rot:S.trayRot,touch:p.touch,cx:e.clientX,cy:e.clientY}; updateCand(d,e.clientX,e.clientY);
        snapshot(); if(placeCand(d)) commit(); else { S.undo.pop(); }
      } else { S.sel=null; updateBubble(); S.dirty=true; }
    }
  }
}
function onMoveDrop(e){
  const d=S.drag; S.drag=null; cv.style.cursor='';
  const t=document.elementFromPoint(e.clientX,e.clientY);
  if(t&&t.closest&&t.closest('#tray')&&e.type==='pointerup'){ S.sel=null; commit(); toast('Removed'); return; }
  updateCand(d,e.clientX,e.clientY);
  if(e.type==='pointerup'&&d.remove){ S.sel=null; commit(); toast('Removed'); return; }
  if(e.type==='pointerup'&&d.cand&&d.ok){ const it=Object.assign({},d.cand,{id:d.item.id}); S.items.push(it); S.sel=it.id; commit(); }
  else { S.items.push(d.orig); S.sel=d.orig.id; S.undo.pop(); if(d.cand&&!d.ok) toast(d.reason); refresh(); }
}
cv.addEventListener('pointerup',endPtr); cv.addEventListener('pointercancel',endPtr);
function zoomAt(sx,sy,z,abs){
  const V=S.V, nz=Math.max(0.2,Math.min(4,abs?z:V.zoom*z)), w=unP(V,sx,sy);
  V.zoom=nz; const q=P(V,w[0],w[1],0); V.px+=sx-q[0]; V.py+=sy-q[1]; S.dirty=true;
}
cv.addEventListener('contextmenu',e=>e.preventDefault());
cv.addEventListener('wheel',e=>{ e.preventDefault(); const [x,y]=localXY(e); zoomAt(x,y,Math.exp(-e.deltaY*0.0015)); },{passive:false});
$('zin').onclick=()=>zoomAt(S.W/2,S.H/2,1.3); $('zout').onclick=()=>zoomAt(S.W/2,S.H/2,1/1.3);
function rotateView(dir){ // quarter turn of the whole floor about the middle of the screen
  const V=S.V, w=unP(V,S.W/2,S.H/2), z0=V.zoom, f0=Object.assign({},V); fitView(f0,S.rows,S.W,S.H); const wasFit=z0<=f0.zoom*1.08; V.rot=((V.rot||0)+dir+4)%4; const q=P(V,w[0],w[1],0); V.px+=S.W/2-q[0]; V.py+=S.H/2-q[1];
  const f=Object.assign({},V); fitView(f,S.rows,S.W,S.H); if(wasFit){ V.zoom=f.zoom; V.px=f.px; V.py=f.py; } // not zoomed in: keep the whole floor on screen
  S.dirty=true;
}
$('vleft').onclick=()=>rotateView(-1); $('vright').onclick=()=>rotateView(1);
const fxb=$('fxBtn'); const fxPaint=()=>{ fxb.classList.toggle('off',!S.fx); fxb.title=S.fx?'Animations on (tap to turn off)':'Animations off (tap to turn on)'; }; fxPaint();
fxb.onclick=()=>{ S.fx=!S.fx; try{ localStorage.setItem('ffFx',S.fx?'1':'0'); }catch(e){} if(!S.fx){ S.born.clear(); S.puffs=[]; S.anim=null; } fxPaint(); S.dirty=true; toast(S.fx?'Animations on':'Animations off',1200); };
$('zfit').onclick=()=>{ fitView(S.V,S.rows,S.W,S.H); S.dirty=true; };
$('zin2')&&0;
$('modeBtn').onclick=()=>{ S.V.mode=S.V.mode==='iso'?'flat':'iso'; $('modeBtn').textContent=S.V.mode==='iso'?'Flat plan':'3D view'; fitView(S.V,S.rows,S.W,S.H); S.dirty=true; };

/* ---------- buttons and keys ---------- */
$('rot').onclick=doRotate; $('bubRot').onclick=rotateSel; $('bubDel').onclick=removeSel;
$('undo').onclick=()=>{ if(locked()) return; const s=S.undo.pop(); if(!s) return; S.items=JSON.parse(s); S.sel=null; commit(); };
let clearAt=0;
$('clear').onclick=()=>{ if(locked()) return; if(Date.now()-clearAt<3000){ snapshot(); S.items=[]; S.sel=null; commit(); clearAt=0; $('clear').textContent='Clear'; } else { clearAt=Date.now(); $('clear').textContent='Tap again'; setTimeout(()=>{ if(Date.now()-clearAt>=2900) $('clear').textContent='Clear'; },3000); } };
window.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT') return;
  if(e.key==='r'||e.key==='R') doRotate();
  else if(e.key==='q'||e.key==='Q') rotateView(-1);
  else if(e.key==='e'||e.key==='E') rotateView(1);
  else if(e.key==='Delete'||e.key==='Backspace') { if(S.multi.size) removeMulti(); else removeSel(); }
  else if(e.key==='Escape'){ if(S.selMode){ if(S.multi.size){ S.multi.clear(); sbox=null; selPaint(); } else setSelMode(false); } S.paint=null; S.armed=null; S.sel=null; if(S.drag&&S.drag.kind==='new'){ S.drag=null; } updateTray(); updateBubble(); S.dirty=true; }
  else if((e.ctrlKey||e.metaKey)&&e.key==='z'){ $('undo').click(); e.preventDefault(); }
});
$('scoreBtn').onclick=()=>{ $('side').classList.toggle('open'); setTimeout(()=>{ resize(); S.dirty=true; },30); };
$('sideClose').onclick=()=>{ $('side').classList.remove('open'); setTimeout(()=>{ resize(); S.dirty=true; },30); };

/* ---------- start ---------- */
window.addEventListener('resize',()=>{ resize(); S.dirty=true; });
new ResizeObserver(()=>{ resize(); S.dirty=true; }).observe(stage);
const Builder={onChange:null,
  load(o){ // {seed,pool,K,R,round,fi,target,budget,items,who}
    S.seed=o.seed; S.Pn=o.pool; S.K=o.K; S.R=o.R; S.round=o.round; S.fi=o.fi; S.lay=o.lay||0; S.use=o.use||null; S.tOver=o.target||null; S.bOver=o.budget||null;
    S.items=(o.items||[]).map(i=>({id:i.id,type:i.type,x:i.x,y:i.y,rot:i.rot})); S.who=o.who||''; S.V.mode='iso'; S.V.rot=0; $('modeBtn').textContent='Flat plan';
    resize(); loadFloor(); },
  setLock:setLock, setClock:setClock, setTrucks:setTrucks, setLive:setLive, hlOf:hlOf, hlHtml:hlHtml, resize(){ resize(); S.dirty=true; }, flush(){ if(emitT) emitChange(true); },
  get state(){ return S; }
};
window.Builder=Builder;
window.__ff={S,loadFloor,refresh,checkPlace,analyze,commit,snapshot};
requestAnimationFrame(frame);
})();

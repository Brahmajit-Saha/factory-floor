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
  items:[], nextId:1, undo:[], sel:null, drag:null, paint:null, armed:null, trayRot:0,
  V:{mode:'iso',zoom:1,px:0,py:0}, an:null, dirty:true, W:0, H:0, dpr:1
};
const poolCache={};
function toast(msg,ms){ const t=$('toast'); t.textContent=msg; t.classList.add('on'); clearTimeout(toast.h); toast.h=setTimeout(()=>t.classList.remove('on'),ms||1800); }

/* ---------- lock and clock (driven from outside by the game shell) ---------- */
let LOCK=true, OVER=null;
const locked=()=>LOCK;
function setClock(label,clock,cls){ $('tLabel').textContent=label; $('tClock').textContent=clock; $('timer').className=cls||''; }
function setLock(on,over){ // over: null or {title,html} shown as an overlay on the floor
  const was=LOCK; LOCK=!!on; OVER=on?over||null:null;
  if(LOCK&&!was){ S.armed=null; S.paint=null; S.drag=null; S.sel=null; pend=null; pan=null; }
  if(!LOCK||(OVER&&OVER.title!==showOverlay.last)) showOverlay.dismissed=false; showOverlay.last=OVER?OVER.title:null;
  const o=$('timesup'); if(OVER&&!showOverlay.dismissed){ $('tuTitle').textContent=OVER.title; $('tuBody').innerHTML=OVER.html; o.querySelector('.box').className='box '+(OVER.cls||''); o.classList.add('on'); } else o.classList.remove('on');
  S.dirty=true; if(S.an){ updateTray(); }
}
function showOverlay(){}
showOverlay.dismissed=false;
$('tuClose').onclick=()=>{ showOverlay.dismissed=true; $('timesup').classList.remove('on'); };
let emitT=null;
function emitChange(now){ if(!Builder.onChange) return; const send=()=>{ emitT=null; Builder.onChange({items:S.items.map(i=>({id:i.id,type:i.type,x:i.x,y:i.y,rot:i.rot})),an:{total:S.an.total,pts:S.an.pts,rate:S.an.rate,cost:S.an.cost}}); }; if(now){ clearTimeout(emitT); send(); } else { clearTimeout(emitT); emitT=setTimeout(send,700); } }

/* ---------- loading a floor ---------- */
function loadFloor(keepView){
  const key=S.seed+'|'+S.Pn;
  if(!poolCache[key]) poolCache[key]=generatePool(S.seed,S.Pn);
  S.pool=poolCache[key];
  S.auto=autoParams(S.pool,S.K,S.cfg);
  const g=floorFor(S.seed,S.pool,S.K,S.R,S.round,S.fi);
  S.floor=g; S.rows=g.floor.rows; S.ctx=floorCtx(S.rows);
  S.target=Math.max(10,Math.min(S.cfg.targetMax,S.tOver||S.auto.target));
  S.budget=Math.max(1000,Math.min(S.cfg.budgetMax,S.bOver||S.auto.budget));
  S.m=roundM(S.seed,S.round,S.cfg);
  S.need=needSpace(FACTORIES[S.fi],S.target,S.m);
  S.nextId=S.items.reduce((a,i)=>Math.max(a,i.id),0)+1;
  S.undo=[]; S.sel=null; S.drag=null; S.paint=null; S.armed=null;
  if(!keepView){ resize(); fitView(S.V,S.rows,S.W,S.H); focusIn(); }
  refresh();
}
function focusIn(){
  // start zoomed in on the inbound bay, where most of the building happens
  const V=S.V, ctx=S.ctx; let sx=0,sy=0; for(const i of ctx.inb){ sx+=i%N+.5; sy+=Math.floor(i/N)+.5; } sx/=ctx.inb.length; sy/=ctx.inb.length;
  const w=[sx,sy]; V.zoom=Math.min(4,V.zoom*1.9); const q=P(V,w[0],w[1],0); V.px+=S.W/2-q[0]; V.py+=S.H/2-q[1];
}
function refresh(){
  S.an=analyze(S.items,S.ctx,S.cfg,{target:S.target,budget:S.budget,need:S.need});
  S.dirty=true; updatePanels(); updateTray(); updateBubble();
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
  $('score').textContent=num(a.total,1);
  const rowsDef=[['Closeness to target',a.pts.close,S.cfg.weights.close],['Spending efficiency',a.pts.spend,S.cfg.weights.spend],['Storage planning',a.pts.store,S.cfg.weights.store],['Layout and flow',a.pts.layout,S.cfg.weights.layout]];
  $('breakdown').innerHTML=rowsDef.map(r=>'<div class="brow"><span>'+r[0]+'</span><div class="mini"><i style="width:'+(r[1]/r[2]*100)+'%"></i></div><em>'+num(r[1],1)+' / '+r[2]+'</em></div>').join('');
  $('checks').innerHTML=CHECK_NAMES.map((n,i)=>{ const v=a.checks[i]; return '<li class="'+(v>=.999?'ok':v>0?'part':'no')+'"><span>'+n+'</span><em>'+Math.round(v*100)+'%</em></li>'; }).join('');
  $('stages').innerHTML='<tr><th>Stage</th><th>Fed</th><th>Capacity</th></tr>'+a.stages.map(x=>'<tr class="'+(x.bottleneck&&x.placed?'bn':'')+'"><td>'+x.stage+'. '+x.name+'</td><td>'+x.fed+' / '+x.placed+'</td><td>'+num(x.cap,1)+(x.bottleneck?' ◂':'')+'</td></tr>').join('');
  $('facts').innerHTML='<div><span>Human-only production rate</span><b>'+num(a.human)+' units/min</b></div>'
    +'<div><span>Machine slots</span><b>'+a.slots+' (machines + belt motors)</b></div>'
    +'<div><span>Complete belts</span><b>'+a.completeBelts+'</b></div>'
    +'<div><span>Cheapest possible build</span><b>'+inr(a.cheapest)+'</b></div>';
  const d=deliveries(f,S.target,S.m);
  $('deliv').innerHTML='<tr><th>Each minute</th><th>Units</th><th>Space</th></tr>'
    +d.rm.map(x=>'<tr><td>'+x.id+'</td><td>'+num(x.units)+'</td><td>'+num(x.space)+'</td></tr>').join('')
    +'<tr class="sum"><td>Raw material batch</td><td></td><td>'+num(d.rmSpace)+'</td></tr>'
    +'<tr><td>Finished goods (× m = '+S.m.toFixed(2)+')</td><td></td><td>'+num(d.fgSpace)+'</td></tr>'
    +'<tr class="sum"><td>Space needed</td><td></td><td>'+num(d.total)+'</td></tr>';
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
}

/* ---------- selected piece bubble ---------- */
function selItem(){ return S.sel==null?null:S.items.find(i=>i.id===S.sel)||null; }
function updateBubble(){
  const b=$('bubble'), it=selItem();
  if(!it||S.drag){ b.style.display='none'; return; }
  const d=S.cfg.pieces[it.type], [w,h]=dims(d,it.rot), p=P(S.V,it.x+w/2,it.y,S.V.mode==='flat'?0:2.8);
  b.style.display='flex'; b.style.left=Math.round(p[0])+'px'; b.style.top=Math.round(p[1])+'px';
  $('bubTitle').textContent=d.name;
}

/* ---------- canvas size and loop ---------- */
function resize(){
  const r=stage.getBoundingClientRect(); S.dpr=Math.min(2,window.devicePixelRatio||1);
  S.W=Math.max(100,Math.round(r.width)); S.H=Math.max(100,Math.round(r.height));
  cv.width=S.W*S.dpr; cv.height=S.H*S.dpr; cv.style.width=S.W+'px'; cv.style.height=S.H+'px'; S.dirty=true;
}
function frame(){
  if(S.dirty&&S.rows){ S.dirty=false;
    const ghost=S.drag&&S.drag.cand?{item:S.drag.cand,ok:S.drag.ok,reason:S.drag.ok?'':S.drag.reason}:null;
    drawScene(c,S.V,S.W,S.H,{rows:S.rows,items:S.items,cfg:S.cfg,an:S.an,ctx:S.ctx,sel:S.sel,ghost,paintCells:S.paint?S.paint.cells:null,dpr:S.dpr});
    updateBubble();
  }
  requestAnimationFrame(frame);
}

/* ---------- editing helpers ---------- */
function snapshot(){ S.undo.push(JSON.stringify(S.items)); if(S.undo.length>60) S.undo.shift(); }
function commit(){ refresh(); emitChange(); }
function candAt(type,rot,sx,sy,touch){
  const d=S.cfg.pieces[type], [w,h]=dims(d,rot);
  const g=unP(S.V,sx,sy-(touch?44:0));
  return {type,rot,x:Math.round(g[0]-w/2),y:Math.round(g[1]-h/2)};
}
function overStage(x,y){ const r=stage.getBoundingClientRect(); return x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom; }
function updateCand(d,cx,cy){
  const r=stage.getBoundingClientRect(); d.cx=cx; d.cy=cy;
  if(!overStage(cx,cy)){ d.cand=null; return; }
  const type=d.type||d.item.type;
  d.cand=candAt(type,d.rot,cx-r.left,cy-r.top,d.touch);
  const chk=checkPlace(S.ctx,S.items,d.cand,S.cfg,S.budget,d.item?d.item.id:null);
  d.ok=chk.ok; d.reason=chk.reason;
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
    if(e.type!=='pointercancel'&&d.cand&&d.ok){ const it=Object.assign({},d.cand,{id:d.item.id}); S.items.push(it); S.sel=it.id; commit(); }
    else { S.items.push(d.orig); S.sel=d.orig.id; S.undo.pop(); if(d.cand&&!d.ok) toast(d.reason); refresh(); }
  }
  S.dirty=true;
}

/* ---------- canvas: pan, zoom, select, move, stamp ---------- */
const ptrs=new Map(); let pan=null, pend=null, pinch=null;
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
  if(ptrs.size===2){ const [a,b]=[...ptrs.values()]; pinch={d:Math.hypot(a.x-b.x,a.y-b.y),z:S.V.zoom}; pan=null; pend=null; S.paint=null; S.dirty=true; return; }
  if(ptrs.size>2) return;
  if(S.armed==='BC'&&e.button===0&&!locked()){ paintStart(x,y,e.pointerType==='touch',e.pointerId,'canvas'); return; }
  const it=(S.armed||locked())?null:itemAt(x,y);
  if(it) pend={it,x,y,touch:e.pointerType==='touch',id:e.pointerId};
  else pan={x,y,px:S.V.px,py:S.V.py,id:e.pointerId,moved:false};
});
cv.addEventListener('pointermove',e=>{
  const p=ptrs.get(e.pointerId); if(!p) return; const [x,y]=localXY(e); p.x=x; p.y=y;
  if(pinch&&ptrs.size===2){ const [a,b]=[...ptrs.values()]; const nd=Math.hypot(a.x-b.x,a.y-b.y); zoomAt((a.x+b.x)/2,(a.y+b.y)/2,pinch.z*nd/pinch.d,true); return; }
  if(S.paint&&S.paint.src==='canvas'&&S.paint.id===e.pointerId){ paintMove(x,y); return; }
  if(S.drag&&S.drag.kind==='move'&&S.drag.id===e.pointerId){ updateCand(S.drag,e.clientX,e.clientY); S.dirty=true; return; }
  if(pend&&pend.id===e.pointerId&&Math.hypot(x-pend.x,y-pend.y)>6){
    snapshot(); const it=pend.it; S.items=S.items.filter(i=>i.id!==it.id); S.sel=it.id;
    S.drag={kind:'move',item:it,orig:Object.assign({},it),type:it.type,rot:it.rot,touch:pend.touch,id:e.pointerId,cand:null,ok:false,reason:''};
    pend=null; updateCand(S.drag,e.clientX,e.clientY); refresh(); S.dirty=true; return;
  }
  if(pan&&pan.id===e.pointerId){ if(Math.hypot(x-pan.x,y-pan.y)>4) pan.moved=true; S.V.px=pan.px+(x-pan.x); S.V.py=pan.py+(y-pan.y); S.dirty=true; }
});
function endPtr(e){
  const p=ptrs.get(e.pointerId); if(!p) return; ptrs.delete(e.pointerId);
  if(pinch){ if(ptrs.size<2) pinch=null; pan=null; pend=null; return; }
  const [x,y]=localXY(e);
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
  const d=S.drag; S.drag=null;
  const t=document.elementFromPoint(e.clientX,e.clientY);
  if(t&&t.closest&&t.closest('#tray')&&e.type==='pointerup'){ S.sel=null; commit(); toast('Removed'); return; }
  updateCand(d,e.clientX,e.clientY);
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
  else if(e.key==='Delete'||e.key==='Backspace') { removeSel(); }
  else if(e.key==='Escape'){ S.paint=null; S.armed=null; S.sel=null; if(S.drag&&S.drag.kind==='new'){ S.drag=null; } updateTray(); updateBubble(); S.dirty=true; }
  else if((e.ctrlKey||e.metaKey)&&e.key==='z'){ $('undo').click(); e.preventDefault(); }
});
$('scoreBtn').onclick=()=>{ $('side').classList.toggle('open'); setTimeout(()=>{ resize(); S.dirty=true; },30); };
$('sideClose').onclick=()=>{ $('side').classList.remove('open'); setTimeout(()=>{ resize(); S.dirty=true; },30); };

/* ---------- start ---------- */
window.addEventListener('resize',()=>{ resize(); S.dirty=true; });
new ResizeObserver(()=>{ resize(); S.dirty=true; }).observe(stage);
const Builder={onChange:null,
  load(o){ // {seed,pool,K,R,round,fi,target,budget,items,who}
    S.seed=o.seed; S.Pn=o.pool; S.K=o.K; S.R=o.R; S.round=o.round; S.fi=o.fi; S.tOver=o.target||null; S.bOver=o.budget||null;
    S.items=(o.items||[]).map(i=>({id:i.id,type:i.type,x:i.x,y:i.y,rot:i.rot})); S.who=o.who||''; S.V.mode='iso'; $('modeBtn').textContent='Flat plan';
    resize(); loadFloor(); },
  setLock:setLock, setClock:setClock, resize(){ resize(); S.dirty=true; }, flush(){ if(emitT) emitChange(true); },
  get state(){ return S; }
};
window.Builder=Builder;
window.__ff={S,loadFloor,refresh,checkPlace,analyze,commit,snapshot};
requestAnimationFrame(frame);
})();

/* ---------- Read-only drawing of a floor (with or without a player's build) for the Game Master and Admin screens ---------- */
const VIEW={pools:{},one:{}};
function poolFor(meta){ const k=meta.seed+'|'+meta.pool; return VIEW.pools[k]||(VIEW.pools[k]=generatePool(meta.seed,meta.pool)); }
/* the floors the game really uses: the admin's chosen ones, or the whole pool when nothing was chosen */
function oneFloor(meta,n){ const P=VIEW.pools[meta.seed+'|'+meta.pool]; if(P&&P[n-1]) return P[n-1]; const k=meta.seed+'|'+n; return VIEW.one[k]||(VIEW.one[k]=generateOne(meta.seed,n-1)); }
function usedFloors(meta){ const u=useList(meta); return u.length?u.map(n=>oneFloor(meta,n)).filter(Boolean):poolFor(meta); }
function suggestFor(meta){ const k=meta.seed+'|'+meta.pool+'|'+(meta.use||'')+'|'+meta.K; if(VIEW.sug&&VIEW.sug.k===k) return VIEW.sug.v; const v=autoParams(usedFloors(meta),meta.K,cloneCfg()); VIEW.sug={k,v}; return v; }
function floorOf(meta,round,fi,lay){ if(lay){ const f=oneFloor(meta,lay); if(f&&!f.failed) return {index:lay,floor:f}; } return floorFor(meta.seed,poolFor(meta),meta.K,meta.rounds,round,fi); }
/* flat top-down thumbnail of a floor: bays green (in) and orange (out), obstacles grey */
function drawThumb(canvas,rows){
  const dpr=Math.min(2,window.devicePixelRatio||1), W=canvas.clientWidth||160, H=canvas.clientHeight||160; canvas.width=Math.round(W*dpr); canvas.height=Math.round(H*dpr);
  const c=canvas.getContext('2d'), n=rows.length, cs=Math.min(canvas.width,canvas.height)/n, ox=(canvas.width-cs*n)/2, oy=(canvas.height-cs*n)/2;
  c.fillStyle='#0D0430'; c.fillRect(0,0,canvas.width,canvas.height);
  const col={'+':'#5A44C8','#':'#9A94BC','I':'#3fe08f','O':'#ffb23e'};
  for(let y=0;y<n;y++) for(let x=0;x<n;x++){ const ch=rows[y][x]; if(ch==='.') continue; c.fillStyle=col[ch]||'#5A44C8'; c.fillRect(Math.floor(ox+x*cs),Math.floor(oy+y*cs),Math.ceil(cs),Math.ceil(cs)); }
}
function analyzeBuild(meta,round,fi,items,rp,lay){ // the same numbers the build screen shows, without drawing anything
  const cfg=cloneCfg(), g=floorOf(meta,round,fi,lay), rows=g.floor.rows, ctx=floorCtx(rows);
  const auto=suggestFor(meta), target=rp?rp.target:auto.target, budget=rp?rp.budget:auto.budget;
  const m=roundM(meta.seed,round,cfg), need=needSpace(FACTORIES[fi],target,m);
  const list=(items||[]).map(i=>({id:i.id,type:i.type,x:i.x,y:i.y,rot:i.rot}));
  const an=analyze(list,ctx,cfg,{target,budget,need,m,f:FACTORIES[fi],tr:rp?rp.tr:null,D:rp&&rp.minutes?roundTotalSec(rp):720});
  return {an,floor:g,rows,ctx,cfg,list,target,budget};
}
function drawBuild(canvas,meta,round,fi,items,rp,mode,lay,now,Vo){
  /* Vo (optional): a view the caller keeps between draws (zoom, pan, turn); its analysis is cached while Vo.key stays the same */
  let ab; if(Vo&&Vo.ab&&Vo.abKey===Vo.key) ab=Vo.ab; else { ab=analyzeBuild(meta,round,fi,items,rp,lay); if(Vo){ Vo.ab=ab; Vo.abKey=Vo.key; } }
  const {an,rows,ctx,cfg,list,target,budget}=ab, g=ab.floor;
  let play=null; if(now!=null&&rp&&rp.minutes&&an.sim){ const t=roundElapsedSec(rp,now), sm=an.sim; play={f:sm.tl[Math.min(sm.tl.length-1,t)],ev:sm.ev.filter(e=>t>=e.t&&t<e.t+5)}; }
  const r=canvas.getBoundingClientRect(), dpr=Math.min(2,window.devicePixelRatio||1), W=Math.max(100,Math.round(r.width)), H=Math.max(100,Math.round(r.height));
  canvas.width=W*dpr; canvas.height=H*dpr;
  let V; if(Vo){ V=Vo; V.mode=mode||V.mode||'iso'; if(!V.ready||(V.fit&&(V.W!==W||V.H!==H))){ fitView(V,rows,W,H); V.ready=true; V.fit=true; } V.W=W; V.H=H; V.rows=rows; }
  else { V={mode:mode||'iso',zoom:1,px:0,py:0}; fitView(V,rows,W,H); }
  drawScene(canvas.getContext('2d'),V,W,H,{rows,items:list,cfg,an:ab.an,ctx,sel:null,ghost:null,paintCells:null,dpr,play,t:now!=null?now/1000:0,fx:now!=null&&fxEnabled(),run:!!play,anim:now!=null?((now/1300)%1):0});
  return {an,floor:g,target,budget,rows};
}

/* a small hand-built sample layout for the demo's sample event: a few machines near the inbound bay, a storage unit and a packer by the outbound bay */
function sampleLayout(ctx,cfg,P,tilt){
  let id=1; const items=[], ok=it=>checkPlace(ctx,items,it,cfg,1e9).ok, an=l=>analyze(l,ctx,cfg,P);
  const around=(prev,type)=>{ const d=cfg.pieces[type]; for(let r=0;r<2;r++){ const w=r?d.h:d.w, h=r?d.w:d.h, pd=cfg.pieces[prev.type], pw=prev.rot%2?pd.h:pd.w, ph=prev.rot%2?pd.w:pd.h;
      for(let y=prev.y-h;y<=prev.y+ph;y++) for(let x=prev.x-w;x<=prev.x+pw;x++){ const it={id,type,x,y,rot:r}; if(ok(it)){ const k=an(items.concat([it])).machineOut.get(items.length); if(k&&k.fed){ items.push(Object.assign({},it,{id:id++})); return items[items.length-1]; } } } } return null; };
  let rm=null; outer: for(const i of ctx.inb){ const bx=i%50, by=(i-bx)/50; for(let y=by-2;y<=by+1;y++) for(let x=bx-2;x<=bx+1;x++){ const it={id,type:'M1',x,y,rot:0}; if(ok(it)&&an([it]).stages[0].fed){ items.push(Object.assign({},it,{id:id++})); rm=items[0]; break outer; } } }
  if(rm){ const as=around(rm,'M2'); if(tilt>0) around(rm,'M1'); if(as){ const wl=around(as,'M3'); if(tilt>1) around(as,'M2'); if(wl&&tilt>2) around(wl,'M3'); } }
  for(const i of ctx.inb){ const bx=i%50, by=(i-bx)/50; let done=false; for(let y=by-5;y<=by+1&&!done;y++) for(let x=bx-5;x<=bx+1&&!done;x++){ const it={id,type:'SL',x,y,rot:0}; if(ok(it)){ items.push(Object.assign({},it,{id:id++})); done=true; } } if(done) break; }
  for(const i of ctx.out){ const bx=i%50, by=(i-bx)/50; let done=false; for(let y=by-2;y<=by+1&&!done;y++) for(let x=bx-2;x<=bx+1&&!done;x++){ const it={id,type:'M4',x,y,rot:0}; if(ok(it)){ items.push(Object.assign({},it,{id:id++})); done=true; } } if(done) break; }
  return items.map(i=>({id:i.id,type:i.type,x:i.x,y:i.y,rot:i.rot}));
}

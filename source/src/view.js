/* ---------- Read-only drawing of a floor (with or without a player's build) for the Game Master and Admin screens ---------- */
const VIEW={pools:{}};
function poolFor(meta){ const k=meta.seed+'|'+meta.pool; return VIEW.pools[k]||(VIEW.pools[k]=generatePool(meta.seed,meta.pool)); }
function suggestFor(meta){ return autoParams(poolFor(meta),meta.K,cloneCfg()); }
function floorOf(meta,round,fi){ return floorFor(meta.seed,poolFor(meta),meta.K,meta.rounds,round,fi); }
function drawBuild(canvas,meta,round,fi,items,rp,mode){
  const cfg=cloneCfg(), g=floorOf(meta,round,fi), rows=g.floor.rows, ctx=floorCtx(rows);
  const auto=suggestFor(meta), target=rp?rp.target:auto.target, budget=rp?rp.budget:auto.budget;
  const m=roundM(meta.seed,round,cfg), need=needSpace(FACTORIES[fi],target,m);
  const list=(items||[]).map(i=>({id:i.id,type:i.type,x:i.x,y:i.y,rot:i.rot}));
  const an=analyze(list,ctx,cfg,{target,budget,need});
  const r=canvas.getBoundingClientRect(), dpr=Math.min(2,window.devicePixelRatio||1), W=Math.max(100,Math.round(r.width)), H=Math.max(100,Math.round(r.height));
  canvas.width=W*dpr; canvas.height=H*dpr;
  const V={mode:mode||'iso',zoom:1,px:0,py:0}; fitView(V,rows,W,H);
  drawScene(canvas.getContext('2d'),V,W,H,{rows,items:list,cfg,an,ctx,sel:null,ghost:null,paintCells:null,dpr});
  return {an,floor:g,target,budget};
}

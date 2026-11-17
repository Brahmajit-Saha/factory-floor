/* ---------- Game rules: pure functions, no DOM. Needs gen.js (N, rngFrom, generatePool, poolOrder, schedule) first. ---------- */
const FACTORIES = ['A','B','C','D'];
const MIX = {
  A:[['RM-A1',.33,1],['RM-A2',.42,1.5],['RM-A3',.25,2]],
  B:[['RM-B1',.33,1],['RM-B2',.26,2],['RM-B3',.41,1.5]],
  C:[['RM-C1',.23,1],['RM-C2',.46,2.5],['RM-C3',.31,1.2]],
  D:[['RM-D1',.38,1.2],['RM-D2',.28,2],['RM-D3',.34,1.5]]
};
const DEFAULTS = {
  seed:'OPS-1', pool:12, rounds:6, teamSize:4,
  target:null, budget:null, targetMax:1000, budgetMax:500000,
  pieces:{
    M1:{name:'RM Processor', kind:'machine', stage:1, w:2,h:2, out:40, cost:3200},
    M2:{name:'Assembler', kind:'machine', stage:2, w:3,h:3, out:50, cost:6000},
    M3:{name:'Robo Welder', kind:'machine', stage:3, w:4,h:3, out:40, cost:8000},
    M4:{name:'Packer', kind:'machine', stage:4, w:2,h:2, out:30, cost:3000},
    BM:{name:'Belt motor', kind:'motor', w:2,h:1, cost:500},
    BC:{name:'Belt connector', kind:'conn', w:1,h:1, cost:100},
    SS:{name:'Small storage', kind:'store', w:3,h:3, cap:40, cost:600},
    SM:{name:'Medium storage', kind:'store', w:5,h:3, cap:75, cost:1000},
    SL:{name:'Large storage', kind:'store', w:5,h:5, cap:150, cost:1800}
  },
  boost:0.10, boostCap:0.30,
  weights:{close:40, spend:20, store:20, layout:20},
  mMin:0.5, mMax:0.8, fill:0.36, bayUse:0.8, budgetFactor:1.33, humanRate:5
};
function cloneCfg(o){ return JSON.parse(JSON.stringify(o||DEFAULTS)); }

/* ----- space needed ----- */
function coef(f){ return MIX[f].reduce((a,m)=>a+m[1]*m[2],0); }
function roundM(seed,round,cfg){ const r=rngFrom(seed+'|m|'+round)(); return Math.round((cfg.mMin+(cfg.mMax-cfg.mMin)*r)*100)/100; }
function needSpace(f,T,m){ return T*coef(f)*(1+m); }
function largest(cfg){ let b=null; for(const k in cfg.pieces){ const d=cfg.pieces[k]; if(d.kind==='store'&&(!b||d.cap>b.cap)) b=d; } return b; }
function stageList(cfg){ const st={}; for(const k in cfg.pieces){ const d=cfg.pieces[k]; if(d.kind==='machine'){ (st[d.stage]=st[d.stage]||[]).push(d); } } return Object.keys(st).sort((x,y)=>x-y).map(n=>({stage:+n,defs:st[n]})); }
function stageBuy(T,cfg){ // cheapest machines to reach T in every stage: [{def,count,cost,cells}]
  return stageList(cfg).map(s=>{ let best=null; for(const d of s.defs){ const n=Math.ceil(T/d.out), c=n*d.cost; if(!best||c<best.cost) best={def:d,count:n,cost:c,cells:n*d.w*d.h}; } return best; });
}
function cheapestBuild(T,need,cfg){ const L=largest(cfg); return Math.round(stageBuy(T,cfg).reduce((a,x)=>a+x.cost,0)+Math.ceil(need/L.cap)*L.cost); }
function deliveries(f,T,m){
  const rm=MIX[f].map(x=>({id:x[0],units:T*x[1],space:T*x[1]*x[2]}));
  const rmSpace=rm.reduce((a,x)=>a+x.space,0);
  return {rm,rmSpace,fgSpace:rmSpace*m,total:rmSpace*(1+m)};
}

/* ----- automatic target and budget from a pool of floors ----- */
function autoParams(floors,K,cfg){
  const L=largest(cfg);
  const good=floors.filter(f=>!f.failed);
  const minPk=Math.min(...good.map(f=>f.stats.packed));
  const minBay=Math.min(...good.map(f=>Math.min(f.inb.len,f.out.len)));
  const fs=FACTORIES.slice(0,K);
  const worst=T=>Math.max(...fs.map(f=>cheapestBuild(T,needSpace(f,T,cfg.mMax),cfg)));
  const cells=T=>Math.max(...fs.map(f=>Math.ceil(needSpace(f,T,cfg.mMax)/L.cap)*L.w*L.h))+stageBuy(T,cfg).reduce((a,x)=>a+x.cells,0);
  // machines of the first and last stage touch a bay with their short side: count x width must fit the share of the shortest bay
  const edge=T=>{ const sb=stageBuy(T,cfg); return Math.max(...[sb[0],sb[sb.length-1]].map(x=>x.count*Math.min(x.def.w,x.def.h))); };
  const lim={ fill:T=>cells(T)<=cfg.fill*minPk, budget:T=>worst(T)*cfg.budgetFactor<=cfg.budgetMax, bays:T=>edge(T)<=cfg.bayUse*minBay };
  const maxT={}; for(const k in lim){ let T=10; while(T+10<=cfg.targetMax && lim[k](T+10)) T+=10; maxT[k]=T; }
  // belts at the bays lift the bay-edge limit, so the suggestion is bounded by floor fill and budget; maxT.bays is the rate reachable with machines touching the bays directly
  const T=Math.min(maxT.fill,maxT.budget);
  const limit=maxT.fill<=maxT.budget?'fill':'budget';
  const budget=Math.min(cfg.budgetMax,Math.ceil(worst(T)*cfg.budgetFactor/1000)*1000);
  return {target:T,budget,minPacked:minPk,minBay,cheapest:worst(T),limit,limits:maxT,direct:maxT.bays,edgeCells:edge(T)};
}

/* ----- floor context ----- */
function floorCtx(rows){
  const ok=new Uint8Array(N*N), walk=new Uint8Array(N*N), inb=[], out=[];
  for(let y=0;y<N;y++) for(let x=0;x<N;x++){
    const c=rows[y][x], i=y*N+x;
    if(c==='+'){ ok[i]=1; walk[i]=1; }
    else if(c==='I'){ walk[i]=1; inb.push(i); }
    else if(c==='O'){ walk[i]=1; out.push(i); }
  }
  return {rows,ok,walk,inb,out,inbSet:new Set(inb),outSet:new Set(out)};
}
function floorFor(seed,pool,K,R,round,fi){
  const P=pool.length, sched=schedule(poolOrder(seed,P),P,K,R);
  return {index:sched[round-1][fi], floor:pool[sched[round-1][fi]-1]};
}

/* ----- pieces ----- */
function dims(def,rot){
  if(def.kind==='motor') return rot%2?[1,2]:[2,1];
  return rot%2?[def.h,def.w]:[def.w,def.h];
}
function parts(it,def){
  const [w,h]=dims(def,it.rot), x=it.x, y=it.y;
  if(def.kind==='motor'){
    if(it.rot===0) return [{x,y,role:'blue'},{x:x+1,y,role:'green'}];
    if(it.rot===1) return [{x,y,role:'blue'},{x,y:y+1,role:'green'}];
    if(it.rot===2) return [{x,y,role:'green'},{x:x+1,y,role:'blue'}];
    return [{x,y,role:'green'},{x,y:y+1,role:'blue'}];
  }
  const c=[]; for(let j=0;j<h;j++) for(let i=0;i<w;i++) c.push({x:x+i,y:y+j,role:null}); return c;
}
function occupancy(items,cfg,skipId){
  const occ=new Int16Array(N*N).fill(-1);
  items.forEach((it,k)=>{ if(it.id===skipId) return; for(const p of parts(it,cfg.pieces[it.type])) if(p.x>=0&&p.y>=0&&p.x<N&&p.y<N) occ[p.y*N+p.x]=k; });
  return occ;
}
const D4=[[1,0],[-1,0],[0,1],[0,-1]];

/* ----- belts ----- */
function beltGraph(items,cfg){
  const bi=[]; items.forEach((it,k)=>{ const d=cfg.pieces[it.type]; if(d.kind==='motor'||d.kind==='conn') bi.push(k); });
  const cellMap=new Map(); // idx -> {b: index in bi, role}
  bi.forEach((k,b)=>{ const it=items[k], d=cfg.pieces[it.type]; for(const p of parts(it,d)) cellMap.set(p.y*N+p.x,{b,role:p.role,kind:d.kind}); });
  const par=bi.map((_,i)=>i); const find=a=>{ while(par[a]!==a){ par[a]=par[par[a]]; a=par[a]; } return a; };
  const edges=new Set(), edgeList=[]; const ports=bi.map(()=>({green:0,blue:0}));
  const addEdge=(a,b,pa,pb)=>{ if(a===b) return; const key=a<b?a+'_'+b:b+'_'+a; if(edges.has(key)) return; edges.add(key); edgeList.push([a,b]); if(pa) ports[a][pa]++; if(pb) ports[b][pb]++; par[find(a)]=find(b); };
  for(const [idx,c] of cellMap){
    const x=idx%N, y=(idx-x)/N;
    for(const [dx,dy] of D4){
      const nx=x+dx, ny=y+dy; if(nx<0||ny<0||nx>=N||ny>=N) continue;
      const n=cellMap.get(ny*N+nx); if(!n||n.b===c.b) continue;
      if(c.kind==='conn'&&n.kind==='conn') addEdge(c.b,n.b);
      else if(c.kind==='conn'&&n.kind==='motor') addEdge(c.b,n.b,null,n.role);
      else if(c.kind==='motor'&&n.kind==='conn') { /* handled from the connector side */ }
      else if(c.kind==='motor'&&n.kind==='motor'&&c.role==='green'&&n.role==='blue') addEdge(c.b,n.b,'green','blue');
    }
  }
  const comp=bi.map((_,i)=>find(i));
  // spacing violation: belt pieces of different components within one cell (corners included)
  let violation=false;
  for(const [idx,c] of cellMap){
    const x=idx%N, y=(idx-x)/N;
    for(let dy=-1;dy<=1&&!violation;dy++) for(let dx=-1;dx<=1;dx++){
      if(!dx&&!dy) continue; const nx=x+dx, ny=y+dy; if(nx<0||ny<0||nx>=N||ny>=N) continue;
      const n=cellMap.get(ny*N+nx); if(n&&comp[n.b]!==comp[c.b]){ violation=true; break; }
    }
    if(violation) break;
  }
  // components
  const groups=new Map(); bi.forEach((k,b)=>{ const r=comp[b]; if(!groups.has(r)) groups.set(r,[]); groups.get(r).push(b); });
  const belts=[];
  for(const [r,list] of groups){
    const set=new Set(list); const deg=new Map(list.map(b=>[b,0])); let ec=0;
    for(const [a,b] of edgeList) if(set.has(a)&&set.has(b)){ ec++; deg.set(a,deg.get(a)+1); deg.set(b,deg.get(b)+1); }
    const motors=list.filter(b=>cfg.pieces[items[bi[b]].type].kind==='motor');
    let complete=motors.length===2&&ec===list.length-1;
    if(complete) for(const b of list){ const isM=motors.includes(b); if(deg.get(b)>2||(isM&&deg.get(b)!==1)) complete=false; }
    if(complete){ const g=motors.reduce((a,b)=>a+(ports[b].green?1:0),0), bl=motors.reduce((a,b)=>a+(ports[b].blue?1:0),0); if(g!==1||bl!==1) complete=false; }
    const fm=motors.find(b=>ports[b].green), sm=motors.find(b=>ports[b].blue);
    belts.push({pieces:list.map(b=>bi[b]),motors:motors.map(b=>bi[b]),complete,first:fm!=null?bi[fm]:-1,second:sm!=null?bi[sm]:-1});
  }
  return {belts,violation,count:bi.length};
}

/* ----- placement check ----- */
function totalCost(items,cfg,skipId){ let c=0; for(const it of items) if(it.id!==skipId) c+=cfg.pieces[it.type].cost; return c; }
function checkPlace(ctx,items,cand,cfg,budget,skipId){
  const def=cfg.pieces[cand.type];
  const occ=occupancy(items,cfg,skipId);
  for(const p of parts(cand,def)){
    if(p.x<0||p.y<0||p.x>=N||p.y>=N) return {ok:false,reason:'Outside the floor'};
    const i=p.y*N+p.x, ch=ctx.rows[p.y][p.x];
    if(ch==='I'||ch==='O') return {ok:false,reason:'Docking bays must stay clear'};
    if(ch==='#') return {ok:false,reason:'Blocked by an obstacle'};
    if(!ctx.ok[i]) return {ok:false,reason:'Outside the outline'};
    if(occ[i]>=0) return {ok:false,reason:'Overlaps another piece'};
  }
  if(totalCost(items,cfg,skipId)+def.cost>budget) return {ok:false,reason:'Over budget'};
  if(def.kind==='motor'||def.kind==='conn'){
    const test=items.filter(it=>it.id!==skipId).concat([Object.assign({},cand,{id:-1})]);
    if(beltGraph(test,cfg).violation) return {ok:false,reason:'Belts must keep one empty cell apart'};
  }
  return {ok:true,reason:''};
}

/* ----- analysis and scoring ----- */
function bfsReach(ctx,occ,sources){
  const seen=new Uint8Array(N*N), q=[];
  for(const s of sources){ seen[s]=1; q.push(s); }
  let h=0;
  while(h<q.length){ const i=q[h++], x=i%N, y=(i-x)/N;
    for(const [dx,dy] of D4){ const nx=x+dx, ny=y+dy; if(nx<0||ny<0||nx>=N||ny>=N) continue; const j=ny*N+nx;
      if(seen[j]||!ctx.walk[j]||occ[j]>=0) continue; seen[j]=1; q.push(j); } }
  return seen;
}
const BAY_IN=-1, BAY_OUT=-2; // pseudo nodes a belt motor can touch
function analyze(items,ctx,cfg,P){
  // P = {target,budget,need,m,factory}
  const occ=occupancy(items,cfg), T=P.target;
  const defOf=it=>cfg.pieces[it.type];
  const cost=totalCost(items,cfg);
  const machines=[], stores=[], motors=[]; let beltPieces=0;
  items.forEach((it,k)=>{ const d=defOf(it); if(d.kind==='machine') machines.push(k); else if(d.kind==='store') stores.push(k); else if(d.kind==='motor'){ motors.push(k); beltPieces++; } else if(d.kind==='conn') beltPieces++; });
  const bg=beltGraph(items,cfg);
  // complete belts need each motor to touch a production machine, two different machines overall
  const touching=new Map(); // motor item index -> Set of machine item indexes
  for(const k of motors){ const s=new Set(); for(const p of parts(items[k],defOf(items[k]))) for(const [dx,dy] of D4){ const nx=p.x+dx, ny=p.y+dy; if(nx<0||ny<0||nx>=N||ny>=N) continue; const j=ny*N+nx, o=occ[j]; if(o>=0&&defOf(items[o]).kind==='machine') s.add(o); else if(ctx.inbSet.has(j)) s.add(BAY_IN); else if(ctx.outSet.has(j)) s.add(BAY_OUT); } touching.set(k,s); }
  const boostCount=new Map();
  let completeBelts=0, piecesInComplete=0;
  for(const b of bg.belts){
    if(b.complete){ const all=new Set(); let each=true; for(const m of b.motors){ const s=touching.get(m); if(!s.size) each=false; s.forEach(v=>all.add(v)); }
      if(!each||all.size<2) b.complete=false;
      else { completeBelts++; piecesInComplete+=b.pieces.length; all.forEach(v=>{ if(v>=0) boostCount.set(v,(boostCount.get(v)||0)+1); }); } }
  }
  // production chain: stage 1 beside inbound, each stage fed by the one before (touching, or a complete belt), stage 4 beside outbound
  const touchesSet=(k,set)=>{ for(const p of parts(items[k],defOf(items[k]))) for(const [dx,dy] of D4){ const nx=p.x+dx, ny=p.y+dy; if(nx<0||ny<0||nx>=N||ny>=N) continue; if(set.has(ny*N+nx)) return true; } return false; };
  const feeds=new Map(); // upstream machine k -> Set of downstream machines
  const addFeed=(u,v)=>{ if(u===v) return; if(!feeds.has(u)) feeds.set(u,new Set()); feeds.get(u).add(v); };
  for(const k of machines){ for(const p of parts(items[k],defOf(items[k]))) for(const [dx,dy] of D4){ const nx=p.x+dx, ny=p.y+dy; if(nx<0||ny<0||nx>=N||ny>=N) continue; const o=occ[ny*N+nx]; if(o>=0&&o!==k&&defOf(items[o]).kind==='machine'&&defOf(items[o]).stage===defOf(items[k]).stage+1) addFeed(k,o); } }
  const stageNums0=stageList(cfg).map(x=>x.stage), firstStage=stageNums0[0], lastStage0=stageNums0[stageNums0.length-1];
  const inFed=new Set(), outShip=new Set(); // machines fed by an inbound-bay belt / shipping through an outbound-bay belt
  for(const b of bg.belts) if(b.complete&&b.first>=0&&b.second>=0){ for(const u of touching.get(b.first)) for(const v of touching.get(b.second)){
    if(u===BAY_IN&&v>=0){ if(defOf(items[v]).stage===firstStage) inFed.add(v); }
    else if(v===BAY_OUT&&u>=0){ if(defOf(items[u]).stage===lastStage0) outShip.add(u); }
    else if(u>=0&&v>=0&&defOf(items[v]).stage===defOf(items[u]).stage+1) addFeed(u,v); } }
  const stageNums=stageList(cfg).map(x=>x.stage), lastStage=stageNums[stageNums.length-1];
  const fed=new Map();
  for(const k of machines) if(defOf(items[k]).stage===stageNums[0]&&(touchesSet(k,ctx.inbSet)||inFed.has(k))) fed.set(k,true);
  for(const sNo of stageNums.slice(1)){ for(const u of machines){ if(!fed.get(u)||defOf(items[u]).stage!==sNo-1) continue; const ds=feeds.get(u); if(ds) for(const v of ds) if(defOf(items[v]).stage===sNo) fed.set(v,true); } }
  const ships=k=>defOf(items[k]).stage!==lastStage||touchesSet(k,ctx.outSet)||outShip.has(k);
  const machineOut=new Map(); const stageInfo=stageNums.map(n=>({stage:n,name:cfg.pieces[Object.keys(cfg.pieces).find(t=>cfg.pieces[t].kind==='machine'&&cfg.pieces[t].stage===n)].name,placed:0,fed:0,cap:0}));
  for(const k of machines){ const d=defOf(items[k]), n=boostCount.get(k)||0, f=1+Math.min(cfg.boostCap,cfg.boost*n); const o=d.out*f; const live=!!fed.get(k)&&ships(k);
    machineOut.set(k,{out:o,boost:f-1,fed:live,why:!fed.get(k)?(d.stage===stageNums[0]?'Must touch the inbound bay or take a belt from it':'Not fed by the stage before'):(!ships(k)?'Must touch the outbound bay or send a belt to it':'')});
    const si=stageInfo.find(x=>x.stage===d.stage); si.placed++; if(live){ si.fed++; si.cap+=o; } }
  const minCap=Math.min(...stageInfo.map(x=>x.cap));
  stageInfo.forEach(x=>{ x.bottleneck=x.cap===minCap; x.cap=Math.round(x.cap*100)/100; });
  const rate=Math.round(minCap*100)/100;
  // reach
  const reachIn=bfsReach(ctx,occ,ctx.inb), reachOut=bfsReach(ctx,occ,ctx.out);
  const touchesReach=(k,reach)=>{ for(const p of parts(items[k],defOf(items[k]))) for(const [dx,dy] of D4){ const nx=p.x+dx, ny=p.y+dy; if(nx<0||ny<0||nx>=N||ny>=N) continue; if(reach[ny*N+nx]) return true; } return false; };
  const share=(list,fn,none)=>list.length?list.filter(fn).length/list.length:none;
  const aisle=ctx.out.some(i=>reachIn[i])?1:0;
  const storeIn=share(stores,k=>touchesReach(k,reachIn),0);
  const storeOut=share(stores,k=>touchesReach(k,reachOut),0);
  const machReach=share(machines,k=>touchesReach(k,reachIn),0);
  const beltShare=beltPieces?piecesInComplete/beltPieces:1;
  // storage connected to a bay: touches IN or OUT, or touches a unit that is connected
  const bayCells=new Set([...ctx.inb,...ctx.out]); const conn=new Set(); const q=[];
  for(const k of stores) if(touchesSet(k,bayCells)){ conn.add(k); q.push(k); }
  while(q.length){ const u=q.pop(); for(const p of parts(items[u],defOf(items[u]))) for(const [dx,dy] of D4){ const nx=p.x+dx, ny=p.y+dy; if(nx<0||ny<0||nx>=N||ny>=N) continue; const o=occ[ny*N+nx]; if(o>=0&&!conn.has(o)&&defOf(items[o]).kind==='store'){ conn.add(o); q.push(o); } } }
  const storeConn=share(stores,k=>conn.has(k),0);
  const checks=[aisle,storeIn,storeOut,machReach,beltShare,storeConn];
  const layout=checks.reduce((a,b)=>a+b,0)/6;
  // storage
  let capacity=0; for(const k of stores) capacity+=defOf(items[k]).cap;
  const fills=[]; let rem=P.need; for(const k of stores){ const c=defOf(items[k]).cap, f=Math.max(0,Math.min(c,rem)); rem-=f; fills.push({k,fill:f,cap:c}); }
  const cheapest=cheapestBuild(T,P.need,cfg);
  const close=Math.max(0,1-Math.abs(rate-T)/T);
  const spendEff=cost>0?Math.min(1,rate/T)*Math.min(1,cheapest/cost):0;
  const store=Math.min(1,capacity/P.need);
  const w=cfg.weights;
  const empty=items.length===0;
  const k0=empty?0:1; const pts={close:k0*w.close*close,spend:k0*w.spend*spendEff,store:k0*w.store*store,layout:k0*w.layout*layout};
  const total=empty?0:pts.close+pts.spend+pts.store+pts.layout;
  const slots=machines.length+motors.length;
  return {cost,rate,stages:stageInfo,machineOut,boostCount,belts:bg.belts,completeBelts,beltPieces,piecesInComplete,
    checks,layout,capacity,need:P.need,fills,cheapest,parts:{close,spendEff,store},pts,total,
    human:slots*cfg.humanRate,slots,reachIn,reachOut,counts:{machines:machines.length,stores:stores.length,motors:motors.length}};
}
const CHECK_NAMES=['Open aisle from inbound to outbound','Storage reachable from inbound','Storage reachable from outbound','Machines reachable from inbound','Belt pieces in complete belts','Storage connected to a bay'];

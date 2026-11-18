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
  limits:{machine:[2,2],store:[3,3]}, // belts that may flow into / out of one machine or storage unit
  weights:{close:40, spend:30, store:20, layout:10}, // layout and flow (2 judges x 5) is entered by hand after the round, so it is not part of the automatic score
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
/* direction of travel on each connector of a complete belt: cell index -> [dx,dy]. Material enters the first motor at its blue end,
   leaves at its green end, runs along the connectors and enters the second motor at its blue end. */
function beltFlows(items,cfg,belts){
  const flow=new Map();
  for(const b of belts){
    if(!b.complete||b.first<0||b.second<0||b.first===b.second) continue;
    const cells=new Map(); for(const k of b.pieces){ const it=items[k]; if(cfg.pieces[it.type].kind==='conn') cells.set(it.y*N+it.x,[it.x,it.y]); }
    if(!cells.size) continue;
    const m1=items[b.first], m2=items[b.second], gc=parts(m1,cfg.pieces[m1.type]).find(p=>p.role==='green'), bc=parts(m2,cfg.pieces[m2.type]).find(p=>p.role==='blue');
    if(!gc||!bc) continue;
    const dist=new Map(), q=[]; for(const [dx,dy] of D4){ const i=(gc.y+dy)*N+gc.x+dx; if(cells.has(i)&&!dist.has(i)){ dist.set(i,0); q.push(i); } }
    for(let h=0;h<q.length;h++){ const i=q[h], x=i%N, y=(i-x)/N; for(const [dx,dy] of D4){ const j=(y+dy)*N+x+dx; if(cells.has(j)&&!dist.has(j)){ dist.set(j,dist.get(i)+1); q.push(j); } } }
    for(const [i,dv] of dist){ const x=i%N, y=(i-x)/N; let dir=null;
      for(const [dx,dy] of D4){ const j=(y+dy)*N+x+dx; if(dist.get(j)===dv+1){ dir=[dx,dy]; break; } }
      if(!dir){ for(const [dx,dy] of D4) if(x+dx===bc.x&&y+dy===bc.y){ dir=[dx,dy]; break; } }
      if(dir) flow.set(i,dir); }
  }
  return flow;
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
/* ----- trucks. The schedule follows the round clock: a delivery truck every `e` seconds (60 by default, 10 s steps), and each delivery
   is collected by a shipping truck one interval later. The admin or game master can change the interval part-way through (tr.c = 't:e,...')
   and send extra trucks at any moment (tr.m = 't:i,t:o,...'; i = delivery, o = shipping). Storage and the line start empty. ----- */
const TRUCK={min:10,max:300,step:10,def:60};
function truckEvery(v){ v=Math.round((+v||TRUCK.def)/TRUCK.step)*TRUCK.step; return Math.max(TRUCK.min,Math.min(TRUCK.max,v)); }
function parsePairs(str){ return String(str==null?'':str).split(',').filter(Boolean).map(x=>x.split(':')); }
function truckPlan(tr,D,T){
  tr=tr||{}; const segs=[[0,truckEvery(tr.e)]]; parsePairs(tr.c).map(([a,b])=>[Math.round(+a),truckEvery(b)]).filter(q=>q[0]>=0).sort((a,b)=>a[0]-b[0]).forEach(q=>segs.push(q));
  const ev=[];
  segs.forEach(([st,e],i)=>{ const end=i+1<segs.length?segs[i+1][0]:Infinity;
    for(let t=st+e;t<end&&t<=D;t+=e){ ev.push({t,type:'in',units:T*e/60,auto:true}); if(t+e<=D) ev.push({t:t+e,type:'out',auto:true}); } });
  parsePairs(tr.m).forEach(([a,k])=>{ const t=Math.round(+a); if(!(t>=0&&t<=D)) return; if(k==='i') ev.push({t,type:'in',units:T,manual:true}); else if(k==='o') ev.push({t,type:'out',manual:true}); });
  ev.sort((a,b)=>a.t-b.t||(a.type==='out'?-1:1)-(b.type==='out'?-1:1));
  return ev;
}
/* the schedule after the admin or GM does something at round second `now` */
function truckAdd(tr,now,kind){ tr=Object.assign({e:TRUCK.def,c:'',m:''},tr||{}); const m=parsePairs(tr.m).map(x=>x.join(':')); m.push(Math.max(0,Math.round(now))+':'+kind); tr.m=m.join(','); return tr; }
function truckSetEvery(tr,now,e){ tr=Object.assign({e:TRUCK.def,c:'',m:''},tr||{}); e=truckEvery(e); const c=parsePairs(tr.c).map(x=>x.join(':')); c.push(Math.max(0,Math.round(now))+':'+e); tr.c=c.join(','); return tr; }
function truckNowEvery(tr,now){ tr=tr||{}; let e=truckEvery(tr.e); for(const [a,b] of parsePairs(tr.c).map(([a,b])=>[Math.round(+a),+b]).sort((x,y)=>x[0]-y[0])) if(a<=now) e=truckEvery(b); return e; }
function simulate(o){
  const D=Math.max(1,Math.round(o.D)), T=o.T, rps=Math.max(0,o.rate)/60, c=o.c, cf=o.cf, ns=o.stores.length, evs=o.events.map(e=>Object.assign({},e));
  const rm=new Array(ns).fill(0), fg=new Array(ns).fill(0); let dock=0, ei=0;
  let offered=0, accepted=0, shipped=0, produced=0, potential=0, stalled=0;
  const tl=[], free=i=>Math.max(0,o.stores[i].cap-rm[i]-fg[i]);
  for(let i=0;i<=D;i++){
    let ran=false;
    while(ei<evs.length&&evs[ei].t<=i){ const e=evs[ei++];
      if(e.type==='out'){ let u=0; for(const j of o.fgIdx){ u+=fg[j]/cf; fg[j]=0; } e.got=u; shipped+=u; }
      else { offered+=e.units; let room=Math.max(0,o.dockCap-dock); for(const j of o.rmIdx) room+=free(j)/c; const a=Math.min(e.units,room);
        let rest=a; for(const j of o.rmIdx){ const take=Math.min(rest,free(j)/c); rm[j]+=take*c; rest-=take; } const d1=Math.min(rest,Math.max(0,o.dockCap-dock)); dock+=d1; rest-=d1;
        e.got=a; e.lost=e.units-a; accepted+=a; } }
    if(i<D&&rps>0){
      let avail=dock; for(const j of o.rmIdx) avail+=rm[j]/c;
      const p=Math.min(rps,avail); let u=p;
      let room=0; for(const j of o.fgIdx) room+=free(j)/cf; u=Math.min(u,room+o.directCap/60); // finished goods go into storage first; what does not fit leaves by the outbound bay if the packer touches it
      potential+=p; stalled+=p-u;
      if(u>0){ ran=true; let take=Math.min(u,dock); dock-=take; let rest=u-take; for(const j of o.rmIdx){ const x=Math.min(rest,rm[j]/c); rm[j]-=x*c; rest-=x; }
        let st=u; for(const j of o.fgIdx){ const x=Math.min(st,free(j)/cf); fg[j]+=x*cf; st-=x; } shipped+=st; produced+=u; }
    }
    tl.push({rm:rm.slice(),fg:fg.slice(),dock,shipped,run:ran});
  }
  // a delivery can only ship if a later shipping truck comes after the line could have processed it at the target rate
  const outs=evs.filter(e=>e.type==='out'); let shippable=0;
  for(const e of evs) if(e.type==='in'&&outs.some(q=>q.t>=e.t+e.units/Math.max(T,1e-9)*60)) shippable+=e.units;
  return {tl,ev:evs,ks:o.stores.map(x=>x.k),D,delivered:offered,accepted,lost:offered-accepted,shipped,produced,potential,stalled,shippable,
    rate:shipped/(D/60),shipRatio:shippable>0?Math.min(1,shipped/shippable):0,acceptRatio:offered>0?accepted/offered:0,dockCap:o.dockCap};
}
/* Storage units whose sides touch along at least 2 cells and that do the same job (raw material or finished goods) act as one bigger unit.
   The first pass finds each store's job, the second pass runs with the merged groups. */
function storeGroups(items,cfg,a){
  const occ=occupancy(items,cfg), kd=k=>cfg.pieces[items[k].type].kind, st=[]; items.forEach((it,k)=>{ if(kd(k)==='store') st.push(k); }); if(st.length<2) return null;
  const par=new Map(st.map(k=>[k,k])), find=x=>{ while(par.get(x)!==x){ par.set(x,par.get(par.get(x))); x=par.get(x); } return x; };
  const job=k=>(a.roles.rm.has(k)?1:0)+(a.roles.fg.has(k)?2:0);
  for(const k of st){ const cnt=new Map(); for(const p of parts(items[k],cfg.pieces[items[k].type])) for(const [dx,dy] of D4){ const nx=p.x+dx, ny=p.y+dy; if(nx<0||ny<0||nx>=N||ny>=N) continue; const o=occ[ny*N+nx]; if(o>=0&&o!==k&&kd(o)==='store') cnt.set(o,(cnt.get(o)||0)+1); }
    for(const [o,n] of cnt) if(n>=2&&job(k)===job(o)){ const x=find(k), y=find(o); if(x!==y) par.set(Math.max(x,y),Math.min(x,y)); } }
  const mem=new Map(); for(const k of st){ const r=find(k); if(!mem.has(r)) mem.set(r,[]); mem.get(r).push(k); }
  const rep=new Map(), size=new Map(), groups=[]; for(const [r,list] of mem) if(list.length>1){ size.set(r,list.length); list.forEach(k=>rep.set(k,r)); groups.push({rep:r,members:list,cap:list.reduce((t,k)=>t+cfg.pieces[items[k].type].cap,0)}); }
  return groups.length?{rep,size,groups}:null;
}
function analyze(items,ctx,cfg,P){
  if(P&&P._rep!==undefined) return analyzeCore(items,ctx,cfg,P);
  const a=analyzeCore(items,ctx,cfg,Object.assign({},P,{_rep:null})), g=storeGroups(items,cfg,a);
  return g?analyzeCore(items,ctx,cfg,Object.assign({},P,{_rep:g})):a;
}
function analyzeCore(items,ctx,cfg,P){
  // P = {target,budget,need,m,factory}
  const occ=occupancy(items,cfg), T=P.target, GR=P._rep||null;
  const defOf=it=>cfg.pieces[it.type];
  const rp=k=>GR&&GR.rep.has(k)?GR.rep.get(k):k, gsz=k=>GR&&GR.size.get(rp(k))||1; // a merged group of storage units counts as one
  const edgeShare=(a,b)=>{ let n=0; for(const p of parts(items[a],defOf(items[a]))) for(const [dx,dy] of D4){ const nx=p.x+dx, ny=p.y+dy; if(nx<0||ny<0||nx>=N||ny>=N) continue; if(occ[ny*N+nx]===b) n++; } return n; };
  const cost=totalCost(items,cfg);
  const machines=[], stores=[], motors=[]; let beltPieces=0;
  items.forEach((it,k)=>{ const d=defOf(it); if(d.kind==='machine') machines.push(k); else if(d.kind==='store') stores.push(k); else if(d.kind==='motor'){ motors.push(k); beltPieces++; } else if(d.kind==='conn') beltPieces++; });
  const bg=beltGraph(items,cfg);
  // complete belts need each motor to touch a production machine, two different machines overall
  const touching=new Map(); // motor item index -> Set of machine item indexes
  for(const k of motors){ const s=new Set(); for(const p of parts(items[k],defOf(items[k]))) for(const [dx,dy] of D4){ const nx=p.x+dx, ny=p.y+dy; if(nx<0||ny<0||nx>=N||ny>=N) continue; const j=ny*N+nx, o=occ[j]; if(o>=0&&(defOf(items[o]).kind==='machine'||defOf(items[o]).kind==='store')) s.add(o); else if(ctx.inbSet.has(j)) s.add(BAY_IN); else if(ctx.outSet.has(j)) s.add(BAY_OUT); } touching.set(k,s); }
  const touchesSet=(k,set)=>{ for(const p of parts(items[k],defOf(items[k]))) for(const [dx,dy] of D4){ const nx=p.x+dx, ny=p.y+dy; if(nx<0||ny<0||nx>=N||ny>=N) continue; if(set.has(ny*N+nx)) return true; } return false; };
  const stageNums=stageList(cfg).map(x=>x.stage), firstStage=stageNums[0], lastStage=stageNums[stageNums.length-1];
  const kindOf=k=>k===BAY_IN?'I':k===BAY_OUT?'O':defOf(items[k]).kind, stageOf=k=>defOf(items[k]).stage;
  const canMove=(u,v)=>{ const a=kindOf(u), b=kindOf(v);
    if(a==='I') return (b==='machine'&&stageOf(v)===firstStage)||b==='store';
    if(b==='O') return (a==='machine'&&stageOf(u)===lastStage)||a==='store';
    if(a==='store') return b==='store'||(b==='machine'&&stageOf(v)===firstStage);
    if(a==='machine') return (b==='store'&&stageOf(u)===lastStage)||(b==='machine'&&stageOf(v)===stageOf(u)+1);
    return false; };
  const boostCount=new Map();
  let completeBelts=0, piecesInComplete=0, overBelts=0; const outCnt=new Map(), inCnt=new Map();
  for(const b of bg.belts){
    if(b.complete){ const all=new Set(); let each=true; for(const m of b.motors){ const s=touching.get(m); if(!s.size) each=false; s.forEach(v=>all.add(v)); }
      const U=b.first>=0?touching.get(b.first):new Set(), V=b.second>=0?touching.get(b.second):new Set(), oN=new Set(), iN=new Set();
      for(const u of U) for(const v of V) if(canMove(u,v)){ if(u>=0) oN.add(u); if(v>=0) iN.add(v); }
      const lim=k=>{ const l=cfg.limits&&cfg.limits[defOf(items[k]).kind]||[99,99], z=defOf(items[k]).kind==='store'?gsz(k):1; return [l[0]*z,l[1]*z]; };
      let over=false; for(const u of oN) if((outCnt.get(rp(u))||0)+1>lim(u)[1]) over=true; for(const v of iN) if((inCnt.get(rp(v))||0)+1>lim(v)[0]) over=true;
      if(!each||all.size<2) b.complete=false;
      else if(over){ b.complete=false; b.over=true; overBelts++; }
      else { const ou=new Set([...oN].map(rp)), iv=new Set([...iN].map(rp)); for(const u of ou) outCnt.set(u,(outCnt.get(u)||0)+1); for(const v of iv) inCnt.set(v,(inCnt.get(v)||0)+1); completeBelts++; piecesInComplete+=b.pieces.length; all.forEach(v=>{ if(v>=0&&defOf(items[v]).kind==='machine') boostCount.set(v,(boostCount.get(v)||0)+1); }); } }
  }
  // ----- the flow: inbound bay -> [storage] -> stage 1 -> ... -> last stage -> [storage] -> outbound bay -----
  const outs=new Map(), ins=new Map(), lseen=new Set(), arrows=[], aseen=new Set();
  const addLink=(u,v,via)=>{ if(u===v||!canMove(u,v)) return false; const key=u+'>'+v+via; if(lseen.has(key)) return false; lseen.add(key); if(!outs.has(u)) outs.set(u,[]); outs.get(u).push(v); if(!ins.has(v)) ins.set(v,[]); ins.get(v).push(u); return true; };
  const addArrow=(a,b)=>{ const key=a+'>'+b; if(aseen.has(key)) return; aseen.add(key); arrows.push({a,b}); };
  const contact=(k,node)=>{ for(const p of parts(items[k],defOf(items[k]))) for(const [dx,dy] of D4){ const nx=p.x+dx, ny=p.y+dy; if(nx<0||ny<0||nx>=N||ny>=N) continue; const j=ny*N+nx; if(node===BAY_IN?ctx.inbSet.has(j):node===BAY_OUT?ctx.outSet.has(j):occ[j]===node) return [[p.x,p.y],[nx,ny]]; } return null; };
  for(const k of machines.concat(stores)){
    const nodes=new Set();
    for(const p of parts(items[k],defOf(items[k]))) for(const [dx,dy] of D4){ const nx=p.x+dx, ny=p.y+dy; if(nx<0||ny<0||nx>=N||ny>=N) continue; const j=ny*N+nx;
      if(ctx.inbSet.has(j)) nodes.add(BAY_IN); else if(ctx.outSet.has(j)) nodes.add(BAY_OUT); else { const o=occ[j]; if(o>=0&&o!==k){ const kd=defOf(items[o]).kind; if(kd==='machine'||kd==='store'){ if(kd==='store'&&defOf(items[k]).kind==='store'&&edgeShare(k,o)<2) continue; nodes.add(o); } } } }
    for(const n of nodes){ const ct=contact(k,n); if(!ct) continue;
      if(addLink(n,k,'t')) addArrow(ct[1],ct[0]);
      if(addLink(k,n,'t')) addArrow(ct[0],ct[1]); }
  }
  for(const b of bg.belts) if(b.complete&&b.first>=0&&b.second>=0){
    for(const u of touching.get(b.first)) for(const v of touching.get(b.second)){
      if(addLink(u,v,'b')){ const c1=contact(b.first,u), c2=contact(b.second,v); if(c1) addArrow(c1[1],c1[0]); if(c2) addArrow(c2[0],c2[1]); } } }
  const reach=(starts,only)=>{ const seen=new Set(starts), q=[...starts]; while(q.length){ const u=q.pop(); for(const v of (outs.get(u)||[])){ if(seen.has(v)||(only&&!only(v))) continue; seen.add(v); q.push(v); } } return seen; };
  const fedSet=reach([BAY_IN]);
  const toO=new Set([BAY_OUT]); { const q=[BAY_OUT]; while(q.length){ const v=q.pop(); for(const u of (ins.get(v)||[])) if(!toO.has(u)){ toO.add(u); q.push(u); } } }
  const fed=new Map(); for(const k of machines) if(fedSet.has(k)) fed.set(k,true);
  const ships=k=>stageOf(k)!==lastStage||toO.has(k);
  const liveOf=k=>!!fed.get(k)&&ships(k);
  const machineOut=new Map(); const stageInfo=stageNums.map(n=>({stage:n,name:cfg.pieces[Object.keys(cfg.pieces).find(t=>cfg.pieces[t].kind==='machine'&&cfg.pieces[t].stage===n)].name,placed:0,fed:0,cap:0}));
  for(const k of machines){ const d=defOf(items[k]), n=boostCount.get(k)||0, f=1+Math.min(cfg.boostCap,cfg.boost*n); const o=d.out*f; const live=liveOf(k);
    machineOut.set(k,{out:o,boost:f-1,fed:live,why:!fed.get(k)?(d.stage===stageNums[0]?'Must touch the inbound bay, a storage unit fed from it, or take a belt from it':'Not fed by the stage before'):(!ships(k)?'Must touch the outbound bay or a storage unit that leads to it, or send a belt there':'')});
    const si=stageInfo.find(x=>x.stage===d.stage); si.placed++; if(live){ si.fed++; si.cap+=o; } }
  // storage roles: raw-material stores take the inbound deliveries and feed stage 1; finished-goods stores take the packer's output and feed the outbound bay
  const liveLast=machines.filter(k=>stageOf(k)===lastStage&&liveOf(k));
  const rmReach=reach([BAY_IN],v=>kindOf(v)==='store'), fgReach=reach(liveLast,v=>kindOf(v)==='store');
  const useRM=new Set(); { const q=[]; for(const sk of stores) if((outs.get(sk)||[]).some(v=>kindOf(v)==='machine'&&liveOf(v))){ useRM.add(sk); q.push(sk); }
    while(q.length){ const v=q.pop(); for(const u of (ins.get(v)||[])) if(kindOf(u)==='store'&&!useRM.has(u)){ useRM.add(u); q.push(u); } } }
  const rmStores=stores.filter(k=>rmReach.has(k)&&useRM.has(k)), fgStores=stores.filter(k=>fgReach.has(k)&&toO.has(k));
  const linked=new Set([...rmStores,...fgStores]);
  const firstLive=machines.filter(k=>stageOf(k)===firstStage&&liveOf(k));
  // ----- how much really flows. Every piece splits what it passes on evenly between the places it feeds; a place that cannot take its share
  // (a machine already at its own rate) hands the leftover to the others. A machine makes the lesser of what it gets and its own rate. -----
  const rmSet=new Set(rmStores), fgSet=new Set(fgStores), nid={}; const sx=new Map(), pre=[];
  const addE=(u,v)=>{ if(!sx.has(u)) sx.set(u,new Set()); sx.get(u).add(v); };
  for(const [u,list] of outs) for(const v of list){
    const ku=kindOf(u), kv=kindOf(v);
    if(u===BAY_IN){ if(kv==='machine') addE('I','m'+v); else if(kv==='store'&&rmSet.has(v)) addE('I','r'+rp(v)); }
    else if(ku==='store'){
      if(rmSet.has(u)){ if(kv==='machine'&&stageOf(v)===firstStage) addE('r'+rp(u),'m'+v); else if(kv==='store'&&rmSet.has(v)&&rp(u)!==rp(v)) addE('r'+rp(u),'r'+rp(v)); }
      if(fgSet.has(u)){ if(v===BAY_OUT) addE('f'+rp(u),'O'); else if(kv==='store'&&fgSet.has(v)&&rp(u)!==rp(v)) addE('f'+rp(u),'f'+rp(v)); } }
    else if(ku==='machine'){ if(kv==='machine') addE('m'+u,'m'+v); else if(v===BAY_OUT) addE('m'+u,'O'); else if(kv==='store'&&fgSet.has(v)) addE('m'+u,'f'+rp(v)); } }
  const mcap=id=>id[0]==='m'?machineOut.get(+id.slice(1)).out:Infinity;
  const post=[], stt=new Map(), dag=new Map();
  const dfs=u=>{ stt.set(u,1); const keep=[]; for(const v of (sx.get(u)||[])){ if(stt.get(v)===1) continue; keep.push(v); if(!stt.has(v)) dfs(v); } dag.set(u,keep); stt.set(u,2); post.push(u); };
  dfs('I');
  const capOut=new Map(); for(const u of post){ if(u==='O'){ capOut.set(u,Infinity); continue; } let t=0; for(const v of dag.get(u)) t+=capOut.get(v); capOut.set(u,u[0]==='m'?Math.min(mcap(u),t):t); }
  const rank=new Map(); const topo=post.slice().reverse(); for(const u of topo){ if(!rank.has(u)) rank.set(u,0); for(const v of dag.get(u)) rank.set(v,Math.max(rank.get(v)||0,rank.get(u)+1)); }
  topo.sort((x,y)=>rank.get(x)-rank.get(y)||dag.get(x).length-dag.get(y).length||(x<y?-1:1));
  const inflow=new Map(), rem=new Map(), sent=new Map(), alloc=new Map(); for(const u of post){ inflow.set(u,0); rem.set(u,capOut.get(u)); }
  const fill=(A,lims)=>{ const idx=lims.map((l,i)=>i).sort((x,y)=>lims[x]-lims[y]), out=lims.map(()=>0); let left=A; idx.forEach((i,j)=>{ const a=Math.min(lims[i],left/(idx.length-j)); out[i]=a; left-=a; }); return out; };
  for(const u of topo){ if(u==='O') continue; const kids=dag.get(u); if(!kids.length){ sent.set(u,0); continue; }
    const lims=kids.map(v=>Math.max(0,rem.get(v))); const A=u==='I'?lims.reduce((a,b)=>a+b,0):inflow.get(u); const out=fill(A,lims);
    kids.forEach((v,i)=>{ inflow.set(v,inflow.get(v)+out[i]); rem.set(v,rem.get(v)-out[i]); alloc.set(u+'>'+v,out[i]); }); sent.set(u,out.reduce((a,b)=>a+b,0)); }
  for(const k of machines){ const mo=machineOut.get(k), f=sent.get('m'+k)||0; mo.flow=Math.round(f*100)/100; }
  for(const x of stageInfo) x.flow=0; for(const k of machines){ const si=stageInfo.find(x=>x.stage===stageOf(k)); si.flow+=machineOut.get(k).flow; }
  let dockCap=0, directCap=0; for(const [key,v] of alloc){ const [u,w]=key.split('>'); if(u==='I'&&w[0]==='m') dockCap+=v; if(u[0]==='m'&&w==='O') directCap+=v; }
  const minFlow=Math.min(...stageInfo.map(x=>x.flow));
  stageInfo.forEach(x=>{ x.bottleneck=x.flow>0&&x.flow>=x.cap-0.005&&x.flow<=minFlow+0.005; x.cap=Math.round(x.cap*100)/100; x.flow=Math.round(x.flow*100)/100; });
  const rate=Math.round((inflow.get('O')||0)*100)/100;
  // reach
  const reachIn=bfsReach(ctx,occ,ctx.inb), reachOut=bfsReach(ctx,occ,ctx.out);
  const touchesReach=(k,reach)=>{ for(const p of parts(items[k],defOf(items[k]))) for(const [dx,dy] of D4){ const nx=p.x+dx, ny=p.y+dy; if(nx<0||ny<0||nx>=N||ny>=N) continue; if(reach[ny*N+nx]) return true; } return false; };
  const share=(list,fn,none)=>list.length?list.filter(fn).length/list.length:none;
  const aisle=ctx.out.some(i=>reachIn[i])?1:0;
  const storeIn=share(stores,k=>touchesReach(k,reachIn),0);
  const storeOut=share(stores,k=>touchesReach(k,reachOut),0);
  const machReach=share(machines,k=>touchesReach(k,reachIn),0);
  const beltShare=beltPieces?piecesInComplete/beltPieces:1;
  const storeConn=share(stores,k=>linked.has(k),0); // storage that really sits in the flow
  const checks=[aisle,storeIn,storeOut,machReach,beltShare,storeConn];
  const layout=checks.reduce((a,b)=>a+b,0)/6;
  // storage
  let capacity=0; for(const k of stores) capacity+=defOf(items[k]).cap;
  const units=stores.filter(k=>rp(k)===k).map(k=>({k,cap:stores.filter(q=>rp(q)===k).reduce((t,q)=>t+defOf(items[q]).cap,0)})); // each merged group is one unit
  const fills=units.map(u=>({k:u.k,fill:0,cap:u.cap})); // storage starts empty; the trucks fill it during the run
  const cheapest=cheapestBuild(T,P.need,cfg);
  // ----- the truck run -----
  const mRatio=P.m!=null?P.m:0.65, unitSpace=P.need/(T*(1+mRatio))||1;
  const D=P.D||720, events=P.events||truckPlan(P.tr,D,T);
  const sim=simulate({T,rate,D,events,c:unitSpace,cf:unitSpace*mRatio,stores:units,
    rmIdx:[...new Set(rmStores.map(rp))].map(k=>units.findIndex(u=>u.k===k)),fgIdx:[...new Set(fgStores.map(rp))].map(k=>units.findIndex(u=>u.k===k)),dockCap,directCap});
  sim.mix=(MIX[P.f]||[]).map(x=>({id:x[0],share:x[1]}));
  const over=Math.min(1,Math.max(0,(rate-T)/T));
  const close=T>0?sim.shipRatio*(1-over):0;
  const spendEff=cost>0?sim.shipRatio*Math.min(1,cheapest/cost):0;
  const store=sim.potential>0?0.6*sim.acceptRatio+0.4*(1-sim.stalled/sim.potential):0;
  const w=cfg.weights;
  const empty=items.length===0;
  const k0=empty?0:1; const pts={close:k0*w.close*close,spend:k0*w.spend*spendEff,store:k0*w.store*store,layout:0}; // layout points come from the judges
  const total=empty?0:pts.close+pts.spend+pts.store; // automatic part, out of 90
  const slots=machines.length+motors.length;
  const flows=beltFlows(items,cfg,bg.belts);
  return {flows,arrows,sim,overBelts,beltIn:inCnt,beltOut:outCnt,roles:{rm:new Set(rmStores),fg:new Set(fgStores)},groups:GR?GR.groups:[],groupOf:GR?GR.rep:new Map(),cost,rate,stages:stageInfo,machineOut,boostCount,belts:bg.belts,completeBelts,beltPieces,piecesInComplete,
    checks,layout,capacity,need:P.need,fills,cheapest,parts:{close,spendEff,store},pts,total,
    human:slots*cfg.humanRate,slots,reachIn,reachOut,counts:{machines:machines.length,stores:stores.length,motors:motors.length}};
}
const CHECK_NAMES=['Open aisle from inbound to outbound','Storage reachable from inbound','Storage reachable from outbound','Machines reachable from inbound','Belt pieces in complete belts','Storage linked into the flow'];

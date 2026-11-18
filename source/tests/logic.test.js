const fs=require('fs'),vm=require('vm');
const ctx={console,Math,JSON,Uint8Array,Int16Array,Set,Map};vm.createContext(ctx);
vm.runInContext(fs.readFileSync('src/gen.js','utf8')+fs.readFileSync('src/logic.js','utf8')+';this.X={N,FACTORIES,DEFAULTS,cloneCfg,coef,needSpace,roundM,autoParams,floorCtx,floorFor,generatePool,checkPlace,analyze,cheapestBuild,beltGraph,parts,deliveries,stageBuy,truckPlan,truckAdd,truckSetEvery,truckNowEvery,truckEvery,TRUCK,simulate}',ctx);
const X=ctx.X; let pass=0,fail=0;
const ok=(c,m)=>{ if(c){pass++;} else {fail++;console.log('FAIL',m);} };
const near=(a,b,e,m)=>ok(Math.abs(a-b)<=e,m+' got '+a+' want '+b);
const cfg=X.cloneCfg(), B=1e9;
const rows=[];for(let y=0;y<50;y++){let s='';for(let x=0;x<50;x++){ let c='.'; if(x>=5&&x<45&&y>=5&&y<45) c='+'; if(x===5&&y>=20&&y<28) c='I'; if(x===44&&y>=20&&y<28) c='O'; if(x===20&&y===34) c='#'; s+=c;} rows.push(s);}
const C=X.floorCtx(rows);
let id=1; const mk=(type,x,y,rot=0)=>({id:id++,type,x,y,rot});
const P={target:360,budget:265000,need:841};
const an=it=>X.analyze(it,C,cfg,P);
// numbers
near(X.coef('A'),1.46,0.001,'coef A'); near(X.needSpace('A',360,0.6),840.9,0.5,'need A');
ok(X.stageBuy(360,cfg).map(s=>s.count).join()==='9,8,9,12','stage buy at 360');
near(X.cheapestBuild(360,841,cfg),9*3200+8*6000+9*8000+12*3000+Math.ceil(841/150)*1800,0,'cheapest example');
// placement rules
ok(!X.checkPlace(C,[],mk('M2',3,10),cfg,B).ok,'outside outline');
ok(!X.checkPlace(C,[],mk('M1',5,22),cfg,B).ok,'on inbound bay');
ok(X.checkPlace(C,[],mk('M1',6,22),cfg,B).ok,'beside inbound ok');
ok(!X.checkPlace(C,[],mk('M1',19,33),cfg,B).ok,'obstacle');
ok(!X.checkPlace(C,[mk('M2',10,10)],mk('M1',11,11),cfg,B).ok,'overlap');
const ex=X.checkPlace(C,[mk('M2',10,10)],mk('M3',20,20),cfg,8000); ok(!ex.ok&&ex.reason==='Over budget','budget');
// chain: feeding
const rm=mk('M1',6,22), asm=mk('M2',8,22), wld=mk('M3',11,22);
let a=an([rm]); ok(a.stages[0].fed===1&&a.rate===0,'RM beside inbound is fed but chain incomplete rate 0');
a=an([mk('M1',12,22)]); ok(a.stages[0].fed===0,'RM away from inbound not fed');
a=an([rm,asm,wld]); ok(a.stages[1].fed===1&&a.stages[2].fed===1,'assembler and welder fed by touching');
a=an([rm,mk('M2',12,30)]); ok(a.stages[1].fed===0,'assembler not touching RM not fed');
a=an([rm,mk('M3',8,22)]); ok(a.stages[2].fed===0,'stage skipping not allowed');
// packer beside welder but away from outbound: no shipping
const pk=mk('M4',15,22);
a=an([rm,asm,wld,pk]); ok(a.stages[3].fed===0&&a.rate===0,'packer must touch outbound');
// full line with a long belt: welder -> belt -> packer beside outbound
const belt=[mk('BM',15,22,0)]; for(let x=17;x<=39;x++) belt.push(mk('BC',x,22)); belt.push(mk('BM',40,22,0));
const pk2=mk('M4',42,22);
const full=[rm,asm,wld,...belt,pk2];
a=an(full); ok(a.completeBelts===1,'long belt complete'); ok(a.stages.every(s=>s.fed===1),'all stages fed through belt');
near(a.stages[0].cap,40,0.01,'RM cap'); near(a.stages[2].cap,44,0.01,'welder boosted'); near(a.stages[3].cap,33,0.01,'packer boosted'); near(a.rate,33,0.01,'rate is bottleneck');
ok(a.stages[3].bottleneck&&!a.stages[0].bottleneck,'bottleneck flagged');
// reversed belt does not feed
const rb=[mk('BM',15,22,2)]; for(let x=17;x<=39;x++) rb.push(mk('BC',x,22)); rb.push(mk('BM',40,22,2));
a=an([rm,asm,wld,...rb,mk('M4',42,22)]); ok(a.completeBelts===1&&a.stages[3].fed===0&&a.rate===0,'wrong belt direction does not feed');
// more machines in a stage raise capacity but bottleneck rules
const two=[rm,mk('M1',6,24),asm,wld,...belt,pk2];
a=an(two); near(a.stages[0].cap,80,0.01,'two RMs cap'); near(a.rate,33,0.01,'rate still limited by packer');
// belt spacing and checks
const bA=[mk('BM',20,10,0),mk('BC',22,10),mk('BM',23,10,0)];
ok(!X.checkPlace(C,bA,mk('BC',25,11),cfg,B).ok,'diagonal touch of another belt blocked');
ok(X.checkPlace(C,bA,mk('BC',26,12),cfg,B).ok,'belt piece with a gap is fine');
ok(X.checkPlace(C,full,mk('BC',30,30),cfg,B).ok,'far belt piece ok');
// storage in the flow: raw-material store beside the inbound bay and the RM Processor, finished-goods store between packer and outbound bay
const rmS=mk('SS',6,19), fgS=mk('SS',41,19), lone=mk('SL',20,30);
const P3={target:30,budget:265000,need:30*X.coef('A')*1.65,m:0.65};
const an3=it=>X.analyze(it,C,cfg,P3);
a=an3(full); ok(a.checks[5]===0&&a.fills.length===0,'no storage, no storage check');
a=an3([...full,rmS,fgS]); ok(a.checks[5]===1,'stores in the chain are linked'); ok(a.fills.every(f=>f.fill===0),'storage starts empty');
a=an3([...full,rmS,fgS,lone]); near(a.checks[5],2/3,0.001,'a lonely store is not linked');
a=an3([rm,lone]); ok(a.checks[5]===0,'lonely store, no line: not linked');
a=an3([rmS]); ok(a.checks[5]===0,'a store beside the bay with no line behind it is not linked');
a=an3([...full,fgS]); ok(a.checks[5]===1,'finished-goods store linked');
// merged storage: units that share a side of 2+ cells and do the same job act as one big unit
{ const g=r=>r.groups||[];
  a=an3([...full,rmS,mk('SS',6,16)]); ok(g(a).length===1&&g(a)[0].members.length===2,'two same-job stores sharing 3 cells merge');
  ok(a.fills.length===1&&a.fills[0].cap===80,'merged group is one unit with pooled capacity 80: '+JSON.stringify(a.fills.map(f=>f.cap)));
  a=an3([...full,rmS,mk('SS',9,18)]); ok(g(a).length===1,'sharing exactly 2 cells still merges');
  a=an3([...full,rmS,mk('SS',9,17)]); ok(g(a).length===0,'sharing a single cell does not merge');
  a=an3([...full,rmS,mk('SS',9,16)]); ok(g(a).length===0,'touching only at a corner does not merge');
  a=an3([...full,rmS,fgS,mk('SS',41,16)]); ok(g(a).length===1&&g(a)[0].members.length===2&&a.fills.length===2,'finished-goods stores merge too (2 units: RM store + merged FG pair)');
  // different jobs never merge: an RM store next to a lonely (unused) store stays separate
  a=an3([...full,rmS,mk('SS',6,24)]); ok(g(a).length===0,'only same-job stores merge');
  // pooled capacity helps the truck run
  const one=an3([...full,rmS,fgS]).sim, two=an3([...full,rmS,mk('SS',6,16),fgS]).sim;
  ok(two.accepted>=one.accepted-1e-9,'a bigger merged unit never takes less: '+two.accepted+' vs '+one.accepted);
  // belt limit adds up: a merged pair of stores takes 6 belts in, a single store only 3
  // belt limit adds up across the merged units: 3 in per unit
  { const st=[mk('SS',20,30),mk('SS',20,33)]; const feeders=[];
    const belts=(y0)=>[mk('BM',17,y0,0),mk('BC',18,y0),mk('BM',19,y0,0)];
    const mkBelts=n=>{ const out=[]; for(let i=0;i<n;i++){ const y=30+i; out.push(...belts(y)); } return out; };
    const one=X.analyze([mk('SS',20,30),...mkBelts(4)],C,cfg,P3), two=X.analyze([...st,...mkBelts(4)],C,cfg,P3);
    ok(two.overBelts<=one.overBelts,'merged pair does not add over-limit belts: '+two.overBelts+' vs '+one.overBelts); }
  }
// the truck run (round clock in seconds; 12 min round, a truck every 60 s)
let sm=an3([...full,rmS,fgS]).sim;
ok(sm.tl.length===721,'one sample per second');
ok(sm.tl[0].rm.every(v=>v===0)&&sm.tl[0].fg.every(v=>v===0)&&sm.tl[0].shipped===0,'run starts with empty storage');
ok(sm.ev[0].type==='in'&&sm.ev[0].t===60,'first delivery truck arrives at 1:00');
ok(sm.ev.filter(e=>e.type==='out').length===11&&sm.ev.find(e=>e.type==='out').t===120,'shipping trucks from 2:00');
ok(sm.tl.slice(0,60).every(f=>f.shipped===0&&f.rm.every(v=>v===0)),'nothing moves in the first minute');
ok(sm.delivered===360&&sm.accepted<=sm.delivered+1e-9&&sm.shipped<=sm.accepted+1e-9,'delivered >= accepted >= shipped');
ok(sm.shipped>0&&sm.tl[sm.tl.length-1].shipped===sm.shipped,'something ships');
// the schedule
let pl=X.truckPlan(null,720,30); ok(pl.filter(e=>e.type==='in').length===12&&pl[0].t===60&&pl[0].units===30,'default plan: delivery every 60 s');
pl=X.truckPlan({e:30},720,30); ok(pl.filter(e=>e.type==='in').length===24&&pl[0].t===30&&pl[0].units===15,'30 s interval: twice as many trucks, half the load');
pl=X.truckPlan({e:60,c:'300:120'},720,30); const ins=pl.filter(e=>e.type==='in').map(e=>e.t); ok(ins.join()==='60,120,180,240,420,540,660','interval change at 5:00 restarts the countdown: '+ins.join());
pl=X.truckPlan({e:60,m:'90:i,200:o'},720,30); ok(pl.some(e=>e.t===90&&e.type==='in'&&e.manual&&e.units===30)&&pl.some(e=>e.t===200&&e.type==='out'&&e.manual),'manual trucks added at their moment');
ok(X.truckEvery(7)===10&&X.truckEvery(64)===60&&X.truckEvery(1000)===300&&X.truckEvery(undefined)===60,'interval snaps to 10 s steps within 10..300');
let tr=X.truckAdd(null,95.4,'i'); tr=X.truckAdd(tr,130,'o'); ok(tr.m==='95:i,130:o','truckAdd');
tr=X.truckSetEvery(tr,200,40); ok(tr.c==='200:40'&&X.truckNowEvery(tr,100)===60&&X.truckNowEvery(tr,250)===40,'truckSetEvery and the interval in force at a given second');
// no storage at all: only the dock of the RM Processor takes the delivery
sm=an3(full).sim; near(sm.dockCap,33,0.01,'direct dock capacity = what the machine really takes (line rate)'); ok(sm.accepted<=40*12+1e-6,'without storage only the machine intake is accepted');
// plenty of storage lets a faster line ship nearly everything
const bigP={target:30,budget:1e9,need:30*X.coef('A')*1.65,m:0.65};
let big=X.analyze([...full,mk('SL',6,17),mk('SL',39,17)],C,cfg,bigP); ok(big.sim.acceptRatio>0.99,'enough storage takes all deliveries');
ok(big.sim.shipRatio>0.85,'and the line ships most of it, got '+big.sim.shipRatio);
// flow arrows between linked pieces
a=an3([...full,rmS,fgS]); ok(a.arrows.length>=6,'arrows drawn at the links, got '+a.arrows.length);
ok(a.arrows.some(q=>q.a[0]===5&&q.b[0]===6),'arrow from the inbound bay into the RM Processor');
ok(a.arrows.some(q=>q.a[0]===43&&q.b[0]===44),'arrow from the packer into the outbound bay');
ok(a.arrows.some(q=>q.a[1]===22&&q.b[1]===21&&q.a[0]>=42),'arrow from the packer into its storage');
ok(a.arrows.some(q=>q.b[1]===22&&q.a[1]===21&&q.b[0]<=7),'arrow from the raw-material storage into the RM Processor');
ok(a.arrows.some(q=>q.a[0]===43&&q.b[0]===44&&q.a[1]<=21),'arrow from the finished-goods storage into the outbound bay');
ok(an3([rm,asm]).arrows.length>=2,'touching machines show arrows');

// empty and scoring basics
a=an([]); ok(a.total===0,'empty is 0'); ok(a.pts.layout===0,'empty has no layout points');
// full-score sanity on the chain
a=an(full); ok(a.total>0,'scores something');
// real floors
const pool=X.generatePool('OPS-1',12); ok(pool.every(f=>!f.failed),'pool ok');
for(const seed of ['OPS-1','ZZ','q7']){ const r=X.autoParams(X.generatePool(seed,12),4,cfg); ok(r.target===360&&r.budget>=260000&&r.budget<=270000,'auto '+seed+' '+JSON.stringify(r)); }
ok(pool.every(f=>f.rows.length===50&&f.rows.every(r=>r.length===50)),'50x50');
const seenF=[new Set(),new Set(),new Set(),new Set()]; for(let r=1;r<=6;r++){ const row=new Set(); for(let f=0;f<4;f++){ const g=X.floorFor('OPS-1',pool,4,6,r,f); ok(!seenF[f].has(g.index),'no repeat'); seenF[f].add(g.index); ok(!row.has(g.index),'distinct within round'); row.add(g.index);} }
for(let r=1;r<=10;r++){ const m=X.roundM('OPS-1',r,cfg); ok(m>=0.5&&m<=0.8,'m range'); }

// ---- belts to and from the bays
{ const chainTo=(pre)=>pre; 
  // inbound: RM away from the bay, fed by a belt from the bay
  const m1=mk('BM',6,22,2), c1=mk('BC',6,23), c2=mk('BC',6,24), m2=mk('BM',6,25,0), rmFar=mk('M1',8,25);
  const t=[m1,c1,c2,m2,rmFar];
  let acc=[]; let allOk=true; for(const it of t){ const r=X.checkPlace(C,acc,it,cfg,B); if(!r.ok){ allOk=false; console.log('  inbound belt place fail',it.type,it.x,it.y,r.reason); } acc.push(it); }
  ok(allOk,'inbound belt test pieces place');
  let a=an(t); ok(a.completeBelts===1,'inbound belt is complete '+a.completeBelts); ok(a.stages[0].fed===1,'RM fed by belt from inbound bay');
  a=an([rmFar]); ok(a.stages[0].fed===0,'same RM without the belt is not fed');
  a=an([m1,c1,c2,m2]); ok(a.completeBelts===0,'bay-to-bay belt with no machine is not complete');
  // outbound: Packer away from the bay, ships through a belt
  const pk=mk('M4',38,24), n1=mk('BM',40,24,2), d1=mk('BC',40,25), d2=mk('BC',40,26), d3=mk('BC',41,26), d4=mk('BC',42,26), n2=mk('BM',43,25,3);
  const t2=[pk,n1,d1,d2,d3,d4,n2]; acc=[]; allOk=true; for(const it of t2){ const r=X.checkPlace(C,acc,it,cfg,B); if(!r.ok){ allOk=false; console.log('  outbound belt place fail',it.type,it.x,it.y,r.reason); } acc.push(it); }
  ok(allOk,'outbound belt test pieces place');
  a=an(t2); ok(a.completeBelts===1,'outbound belt is complete '+a.completeBelts);
  const k=a.machineOut.get(0); ok(k&&!k.why.includes('outbound'),'Packer ships through the belt (not flagged for outbound) '+(k&&k.why));
  a=an([pk]); ok(a.machineOut.get(0).why.includes('outbound')||a.machineOut.get(0).why.includes('Not fed'),'Packer alone has a problem');
}
{ const r=X.autoParams(X.generatePool('OPS-1',12),4,cfg); ok(r.limit==='fill'&&r.direct===240&&r.minBay>=20,'suggestion limits '+JSON.stringify(r.limits)); }
{ // no corridor, neck or gap narrower than 5 cells on any generated floor
  const cx=Object.assign({},{});
  let narrow=0, n=0; for(const seed of ['OPS-1','ZZ','q7']){ for(const f of X.generatePool(seed,12)){ n++; const u=new Uint8Array(2500); f.rows.forEach((r,y)=>[...r].forEach((ch,x)=>{ if(ch==='+'||ch==='I'||ch==='O') u[y*50+x]=1; }));
    // free cell is fine if some 5x5 block of free cells covers it
    const cov=new Uint8Array(2500); for(let y=0;y+5<=50;y++) for(let x=0;x+5<=50;x++){ let all=true; for(let j=0;j<5&&all;j++) for(let i2=0;i2<5;i2++) if(!u[(y+j)*50+x+i2]){ all=false; break; } if(all) for(let j=0;j<5;j++) for(let i2=0;i2<5;i2++) cov[(y+j)*50+x+i2]=1; }
    for(let i2=0;i2<2500;i2++) if(u[i2]&&!cov[i2]){ narrow++; break; } } }
  ok(n===36&&narrow===0,'every floor has no corridor narrower than 5 cells ('+narrow+' of '+n+' floors have one)'); }
// ----- connection limits: a machine takes at most 2 belts in and 2 out, storage 3 and 3
{ const m1=mk('M1',10,20), a1=[mk('BM',12,20,0),...[14,15,16,17].map(x=>mk('BC',x,20)),mk('BM',18,20,0),mk('M2',20,19)];
  const b1=[mk('BM',10,18,3),...[14,15,16,17].map(y=>mk('BC',10,y)),mk('BM',10,12,3),mk('M2',9,9)];
  const c1=[mk('BM',10,22,1),...[24,25,26,27].map(y=>mk('BC',10,y)),mk('BM',10,28,1),mk('M2',9,30)];
  const items3=[m1,...a1,...b1,...c1]; let r=X.analyze(items3,C,cfg,P);
  ok(r.completeBelts===2&&r.overBelts===1,'third belt out of one machine is ignored: complete '+r.completeBelts+' over '+r.overBelts);
  ok(r.belts.filter(b=>b.over).length===1&&r.belts.filter(b=>b.complete).length===2,'belts flagged');
  const cfg1=X.cloneCfg(); cfg1.limits.machine=[1,1]; r=X.analyze(items3,C,cfg1,P); ok(r.completeBelts===1&&r.overBelts===2,'limit is configurable: '+r.completeBelts+'/'+r.overBelts);
  const cfg9=X.cloneCfg(); cfg9.limits.machine=[9,9]; r=X.analyze(items3,C,cfg9,P); ok(r.completeBelts===3&&r.overBelts===0,'higher limit allows all three');
  ok(X.cloneCfg().limits.machine.join()==='2,2'&&X.cloneCfg().limits.store.join()==='3,3','defaults: machine 2/2, storage 3/3'); }
// ---- split flow: a piece shares what it passes on evenly; leftovers go to targets that still have room
{ const cf2=X.cloneCfg(); delete cf2.pieces.M3; delete cf2.pieces.M4; cf2.pieces.M1.out=50; cf2.pieces.M2.out=60;
  const rw=[];for(let y=0;y<50;y++){let r='';for(let x=0;x<50;x++){ let c='.'; if(x>=5&&x<11&&y>=5&&y<45) c='+'; if(x===5&&y>=20&&y<28) c='I'; if(x===11&&y>=20&&y<28) c='O'; r+=c;} rw.push(r);}
  const C2=X.floorCtx(rw), P2={target:100,budget:1e9,need:300}, an2=it=>X.analyze(it,C2,cf2,P2), fl=(a,i)=>a.machineOut.get(i).flow;
  let q=an2([mk('M1',6,22),mk('M2',8,20),mk('M2',8,23)]);
  near(fl(q,0),50,0.01,'A runs at its own 50'); near(fl(q,1),25,0.01,'B1 gets half of A'); near(fl(q,2),25,0.01,'B2 gets half of A'); near(q.rate,50,0.01,'line rate stays 50 with two B machines');
  q=an2([mk('M1',6,22),mk('M2',8,20),mk('M2',8,23),mk('M1',6,24)]);
  near(fl(q,2),60,0.01,'B2 fed by two A machines is held to its own 60'); near(fl(q,1),40,0.01,'leftover goes to the other B'); near(q.rate,100,0.01,'rate 100');
  q=an2([mk('M1',6,22),mk('M2',8,20)]); near(q.rate,50,0.01,'one A one B: 50'); ok(q.stages[1].flow===50&&q.stages[1].cap===60,'stage flow vs capacity');
}
console.log('pass',pass,'fail',fail);

const fs=require('fs'),vm=require('vm');
const ctx={console,Math,JSON,Uint8Array,Int16Array,Set,Map};vm.createContext(ctx);
vm.runInContext(fs.readFileSync('src/gen.js','utf8')+fs.readFileSync('src/logic.js','utf8')+';this.X={N,FACTORIES,DEFAULTS,cloneCfg,coef,needSpace,roundM,autoParams,floorCtx,floorFor,generatePool,checkPlace,analyze,cheapestBuild,beltGraph,parts,deliveries,stageBuy}',ctx);
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
// storage connected to a bay
const s1=mk('SL',6,25), s2=mk('SL',11,25), s3=mk('SL',30,30);
a=an([s1,s2,s3]); near(a.checks[5],2/3,0.001,'storage connected share'); 
a=an([s1,s2]); ok(a.checks[5]===1,'chain of units from bay fully connected');
a=an([mk('SL',20,30)]); ok(a.checks[5]===0,'lonely unit not connected');
a=an([mk('SL',39,23)]); ok(a.checks[5]===1,'unit touching outbound connected');
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
console.log('pass',pass,'fail',fail);

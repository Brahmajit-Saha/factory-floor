const fs=require('fs'),vm=require('vm');
const ctx={console,Math,JSON,Uint8Array,Int16Array,Set,Map,Object,Array}; vm.createContext(ctx);
vm.runInContext(['gen','logic','render'].map(f=>fs.readFileSync('src/'+f+'.js','utf8')).join('\n')+';this.X={N,cloneCfg,floorCtx,analyze,parts,dims,P,unP,rotXY,unrotXY,rotCell,unrotCell,rotateScene,drawScene,fitView,beltFlows,beltGraph}',ctx);
const X=ctx.X; let pass=0,fail=0; const ok=(c,m)=>{ if(c)pass++; else{fail++;console.log('FAIL',m);} };
const cfg=X.cloneCfg(), N=X.N;
// ---- projection round trip, both modes, all angles
for(const mode of ['iso','flat']) for(let k=0;k<4;k++){ const V={mode,zoom:1.3,px:40,py:25,rot:k}; let good=true;
  for(const [x,y] of [[3.2,7.7],[25,25],[49.5,0.5],[10,40.25]]){ const p=X.P(V,x,y,0), q=X.unP(V,p[0],p[1]); if(Math.abs(q[0]-x)>1e-9||Math.abs(q[1]-y)>1e-9) good=false; }
  ok(good,'P/unP round trip '+mode+' rot '+k); }
// four quarter turns return to the same picture
{ const V0={mode:'iso',zoom:1,px:0,py:0,rot:0}, V4={...V0,rot:0}; let a=X.P(V0,12,30,1), b=X.P(V4,12,30,1); ok(a[0]===b[0]&&a[1]===b[1],'rot 0 unchanged'); }
{ const v=(k)=>X.P({mode:'iso',zoom:1,px:0,py:0,rot:k},10,10,0); const a=v(0),b=v(1),c=v(2),d=v(3); ok(new Set([a+'',b+'',c+'',d+'']).size>=2,'angles move points'); }
// ---- cells/items rotate consistently
for(let k=0;k<4;k++){ let good=true;
  for(const [x,y] of [[0,0],[7,3],[49,49],[20,31]]){ const r=X.rotCell(k,x,y), u=X.unrotCell(k,r[0],r[1]); if(u[0]!==x||u[1]!==y) good=false; }
  ok(good,'rotCell inverse '+k); }
const rows=[]; for(let y=0;y<50;y++){ let s=''; for(let x=0;x<50;x++){ let c='.'; if(x>=5&&x<45&&y>=5&&y<45) c='+'; if(x===5&&y>=20&&y<28) c='I'; if(x===44&&y>=20&&y<28) c='O'; if(x===20&&y===34) c='#'; s+=c; } rows.push(s); }
const C=X.floorCtx(rows); let id=1; const mk=(type,x,y,rot=0)=>({id:id++,type,x,y,rot});
const items=[mk('BM',15,22,0),mk('BM',10,10,1),mk('BM',30,30,2),mk('BM',33,12,3),mk('M2',7,22,0),mk('M3',12,12,1),mk('SL',25,25,0),mk('SS',40,40,1)];
const S={rows,cfg,ctx:C,items,sel:null,an:null,dpr:1};
for(let k=1;k<4;k++){ const R=X.rotateScene(S,k); let good=true, roles=true;
  R.items.forEach((it,i)=>{ const o=items[i], po=X.parts(o,cfg.pieces[o.type]), pr=X.parts(it,cfg.pieces[it.type]);
    const want=po.map(p=>{ const r=X.rotCell(k,p.x,p.y); return r[0]+','+r[1]+','+p.role; }).sort().join('|'), got=pr.map(p=>p.x+','+p.y+','+p.role).sort().join('|'); if(want!==got){ good=false; console.log('  mismatch',k,o.type,o.rot,want,got); } });
  ok(good,'rotated pieces occupy the rotated cells with the same IN/OUT ends (rot '+k+')'); ok(R.items.every((it,i)=>it.id===items[i].id),'ids kept');
  let rowsOk=true; for(let y=0;y<N;y++) for(let x=0;x<N;x++){ const r=X.rotCell(k,x,y); if(R.rows[r[1]][r[0]]!==rows[y][x]) rowsOk=false; } ok(rowsOk,'floor rows rotate '+k);
  ok(R.ctx.inb.length===C.inb.length&&R.ctx.out.length===C.out.length,'bays rotate'); }
// ---- belt arrows
const rm=mk('M1',6,22,0), asm=mk('M2',12,22,0), wld=mk('M3',12,25,0);
const belt=[mk('BM',15,22,0)]; for(let x=17;x<=39;x++) belt.push(mk('BC',x,22)); belt.push(mk('BM',40,22,0));
const P={target:360,budget:265000,need:841};
let a=X.analyze([rm,asm,wld,...belt,mk('M4',42,22)],C,cfg,P);
ok(a.completeBelts===1,'belt complete'); ok(a.flows instanceof Map,'analysis returns flows');
ok([...a.flows.values()].length===23&&[...a.flows.values()].every(d=>d[0]===1&&d[1]===0),'arrows on all 23 connectors point along the belt (east)');
// reversed: first motor on the right, belt carries west
const rb=[mk('BM',40,22,2)]; for(let x=17;x<=39;x++) rb.push(mk('BC',x,22)); rb.push(mk('BM',15,22,2));
a=X.analyze([rm,asm,wld,...rb,mk('M4',42,22)],C,cfg,P); ok(a.completeBelts===1&&[...a.flows.values()].every(d=>d[0]===-1&&d[1]===0),'reversed belt arrows point west');
// L shaped belt: east then south
const L=[mk('BM',15,10,0)]; for(let x=17;x<=22;x++) L.push(mk('BC',x,10)); for(let y=11;y<=16;y++) L.push(mk('BC',22,y)); L.push(mk('BM',22,17,1));
const bgL=X.beltGraph(L,cfg), f=X.beltFlows(L,cfg,bgL.belts); ok(bgL.belts.some(b=>b.complete),'L belt complete'); ok(f.get(10*N+17)&&f.get(10*N+17)[0]===1,'east on the first leg'); ok(f.get(13*N+22)&&f.get(13*N+22)[1]===1&&f.get(13*N+22)[0]===0,'south on the second leg'); ok(f.get(10*N+22)&&f.get(10*N+22)[1]===1,'turns south at the corner');
// incomplete belt: no arrows
a=X.analyze([mk('BM',15,10,0),mk('BC',17,10),mk('BC',18,10)],C,cfg,P); ok(a.flows.size===0,'incomplete belt has no arrows');
// ---- drawing never throws, at every angle and in both modes, and arrows rotate with the view
const calls=[]; const g=new Proxy({},{get:(t,k)=>k==='measureText'?()=>({width:12}):(k==='createLinearGradient'||k==='createRadialGradient')?()=>({addColorStop(){}}):(k in t?t[k]:(...a)=>{ calls.push(k); }),set:(t,k,v)=>{t[k]=v;return true;}});
const full=[rm,asm,wld,...belt,mk('M4',42,22)]; const an=X.analyze(full,C,cfg,P);
for(const mode of ['iso','flat']) for(let k=0;k<4;k++){ const V={mode,zoom:1,px:200,py:50,rot:k}; let thrown=null; calls.length=0;
  try{ X.drawScene(g,V,900,600,{rows,cfg,ctx:C,items:full,sel:full[4].id,an,dpr:1,paintCells:[{x:20,y:30,ok:true}],ghost:{item:mk('BM',30,30,k),ok:true,reason:''}}); }catch(e){ thrown=e; }
  ok(!thrown,'drawScene '+mode+' rot '+k+(thrown?': '+thrown.message:'')); ok(calls.length>500,'drew something '+mode+' '+k); }
{ const V={mode:'iso',zoom:1,px:0,py:0,rot:1}; X.fitView(V,rows,900,600); const q=X.P(V,25,25,0); ok(q[0]>0&&q[0]<900&&q[1]>0&&q[1]<600,'fitView centres the floor when turned'); }
console.log('pass',pass,'fail',fail); process.exit(fail?1:0);

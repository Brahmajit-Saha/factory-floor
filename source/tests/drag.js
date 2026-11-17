const puppeteer=require('/home/claude/smoke/node_modules/puppeteer-core');
(async()=>{
  const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--disable-gpu'],headless:'new'});
  const pg=await b.newPage(); await pg.setViewport({width:1280,height:800});
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e)));
  await pg.goto('file:///home/claude/ff2/dist/index.html?demo=1'); await new Promise(r=>setTimeout(r,500));
  await pg.evaluate(()=>{ window.__shell.show('app'); Builder.load({seed:'OPS-1',pool:12,K:4,R:6,round:1,fi:0,items:[]}); Builder.setLock(false); }); await new Promise(r=>setTimeout(r,300));
  let ok=0,bad=0; const t=(c,m)=>{ if(c)ok++; else{bad++;console.log('FAIL',m);} };
  // find a free 3x3 near the inbound bay in view, get its screen point
  const info=await pg.evaluate(()=>{ const S=window.__ff.S; const r=document.getElementById('stage').getBoundingClientRect(); const rows=S.rows;
    // choose free cell block closest to the stage centre
    let best=null,bd=1e9; for(let y=3;y<45;y++)for(let x=3;x<45;x++){ let f=true; for(let j=0;j<3&&f;j++)for(let i=0;i<3;i++) if(rows[y+j][x+i]!=='+'){f=false;break;} if(!f) continue;
      const p=window.P(S.V,x+1.5,y+1.5,0); const d=Math.hypot(p[0]-S.W/2,p[1]-S.H/2); if(d<bd){bd=d;best={x,y,sx:p[0]+r.left,sy:p[1]+r.top};} }
    const c=document.querySelector('.card[data-type="M2"]').getBoundingClientRect();
    return {best,card:[c.left+c.width/2,c.top+c.height/2]}; });
  await pg.mouse.move(...info.card); await pg.mouse.down(); await pg.mouse.move(info.best.sx+40,info.best.sy+40,{steps:6}); await pg.mouse.move(info.best.sx,info.best.sy,{steps:4}); await pg.mouse.up();
  let n=await pg.evaluate(()=>window.__ff.S.items.length); t(n===1,'dragged from tray places piece, items='+n);
  const it=await pg.evaluate(()=>{ const S=window.__ff.S; return {x:S.items[0].x,y:S.items[0].y}; });
  t(Math.abs(it.x-info.best.x)<=1&&Math.abs(it.y-info.best.y)<=1,'piece lands under pointer '+JSON.stringify(it)+' vs '+info.best.x+','+info.best.y);
  // move the piece by dragging it 5 cells to the right-down
  const mv=await pg.evaluate(()=>{ const S=window.__ff.S; const r=document.getElementById('stage').getBoundingClientRect(); const it=S.items[0]; const a=window.P(S.V,it.x+1.5,it.y+1.5,0); let t=null; for(let dy=-8;dy<=8&&!t;dy++)for(let dx=-8;dx<=8&&!t;dx++){ if(Math.abs(dx)+Math.abs(dy)<4) continue; const c={type:it.type,rot:it.rot,x:it.x+dx,y:it.y+dy}; if(window.__ff.checkPlace(S.ctx,S.items,c,S.cfg,S.budget,it.id).ok) t=c; }
    const b=window.P(S.V,t.x+1.5,t.y+1.5,0); return {a:[a[0]+r.left,a[1]+r.top],b:[b[0]+r.left,b[1]+r.top],x:it.x,y:it.y,tx:t.x,ty:t.y}; });
  await pg.mouse.move(...mv.a); await pg.mouse.down(); await pg.mouse.move(mv.a[0]+10,mv.a[1]+4,{steps:3}); await pg.mouse.move(...mv.b,{steps:6}); await pg.mouse.up();
  const after=await pg.evaluate(()=>{ const S=window.__ff.S; return {n:S.items.length,x:S.items[0].x,y:S.items[0].y,rate:S.an.rate}; });
  t(after.n===1&&Math.abs(after.x-mv.tx)<=1&&Math.abs(after.y-mv.ty)<=1,'piece moved '+JSON.stringify(after)+' from '+mv.x);
  // ---- belt painting: drag from the tray across the floor lays a line of connectors
  const line=await pg.evaluate(()=>{ const S=window.__ff.S; const r=document.getElementById('stage').getBoundingClientRect(); const rows=S.rows;
    let best=null,bd=1e9; for(let y=3;y<45;y++)for(let x=3;x<34;x++){ let f=true; if(S.items.some(q=>Math.abs(q.y-y)<=5)) continue; for(let i=0;i<14&&f;i++) if(rows[y][x+i]!=='+'||rows[y-1][x+i]==='I'){f=false;break;} if(!f) continue;
      const p=window.P(S.V,x+7,y+.5,0); const d=Math.hypot(p[0]-S.W/2,p[1]-S.H/2); if(d<bd){bd=d;best={x,y};} }
    const a=window.P(S.V,best.x+.5,best.y+.5,0), z=window.P(S.V,best.x+11.5,best.y+.5,0);
    const c=document.querySelector('.card[data-type="BC"]').getBoundingClientRect();
    return {x:best.x,y:best.y,a:[a[0]+r.left,a[1]+r.top],z:[z[0]+r.left,z[1]+r.top],card:[c.left+c.width/2,c.top+c.height/2]}; });
  await pg.mouse.move(...line.card); await pg.mouse.down(); await pg.mouse.move(line.a[0]+30,line.a[1]+20,{steps:6}); await pg.mouse.move(line.a[0],line.a[1],{steps:6}); await pg.mouse.up();
  let bc=await pg.evaluate(()=>window.__ff.S.items.filter(i=>i.type==='BC').length);
  t(bc===1,'dragging a connector card places one connector, got '+bc);
  await pg.evaluate(()=>{ const S=window.__ff.S; S.items=S.items.filter(i=>i.type!=='BC'); window.__ff.refresh(); });
  // armed mode: tap the card then drag on the floor
  await pg.mouse.click(...line.card); const armed=await pg.evaluate(()=>window.__ff.S.armed); t(armed==='BC','card tap arms connector');
  const a2=[line.a[0],line.a[1]], z2=[line.z[0],line.z[1]];
  await pg.mouse.move(...a2); await pg.mouse.down(); await pg.mouse.move(z2[0],z2[1],{steps:20}); await pg.mouse.up();
  const pan2=await pg.evaluate(()=>window.__ff.S.V.px); bc=await pg.evaluate(()=>window.__ff.S.items.filter(i=>i.type==='BC').length);
  t(bc>=10&&bc<=13,'armed connector painting by dragging on the floor, got '+bc);
  const rowsOk=await pg.evaluate(()=>{ const S=window.__ff.S; const ys=new Set(S.items.filter(i=>i.type==='BC').map(i=>i.y)); return [...ys].length<=2; }); t(rowsOk,'painted line stays on about one row');
  const belts=await pg.evaluate(()=>window.__ff.S.an.belts.length); t(belts===1,'painted connectors are one belt group, belts='+belts);
  t(Math.abs(pan2-await pg.evaluate(()=>window.__ff.S.V.px))<1,'painting did not pan the camera');
  await pg.evaluate(()=>document.getElementById('undo').click()); bc=await pg.evaluate(()=>window.__ff.S.items.filter(i=>i.type==='BC').length); t(bc===0,'one undo removes the whole painted stroke, left '+bc);
  await pg.evaluate(()=>{ const S=window.__ff.S; S.items=S.items.filter(i=>i.type!=='BC'); S.armed=null; window.__ff.refresh(); });
  // zoom with wheel changes zoom; pan drag moves camera
  const z0=await pg.evaluate(()=>window.__ff.S.V.zoom); await pg.mouse.move(400,350); await pg.mouse.wheel({deltaY:-300});
  const z1=await pg.evaluate(()=>window.__ff.S.V.zoom); t(z1>z0,'wheel zoom in '+z0+' -> '+z1);
  const p0=await pg.evaluate(()=>window.__ff.S.V.px); await pg.mouse.move(200,200); await pg.mouse.down(); await pg.mouse.move(260,210,{steps:4}); await pg.mouse.up();
  const p1=await pg.evaluate(()=>window.__ff.S.V.px); t(Math.abs(p1-p0-60)<2,'pan moved camera '+(p1-p0));
  // drop on tray removes
  const trayPt=await pg.evaluate(()=>{ const c=document.getElementById('tray').getBoundingClientRect(); return [c.left+c.width/2,c.top+c.height-6]; });
  const sel=await pg.evaluate(()=>{ const S=window.__ff.S; const r=document.getElementById('stage').getBoundingClientRect(); const it=S.items[0]; const a=window.P(S.V,it.x+1.5,it.y+1.5,0); return [a[0]+r.left,a[1]+r.top]; });
  await pg.mouse.move(...sel); await pg.mouse.down(); await pg.mouse.move(sel[0]+12,sel[1]+12,{steps:3}); await pg.mouse.move(...trayPt,{steps:6}); await pg.mouse.up();
  n=await pg.evaluate(()=>window.__ff.S.items.length); t(n===0,'dropped on tray removes, items='+n);
  t(errs.length===0,'no errors '+errs.join('|'));
  console.log('ok',ok,'bad',bad); await b.close();
})();

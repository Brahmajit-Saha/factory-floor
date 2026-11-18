const path=require('path'); const puppeteer=require('/home/claude/smoke/node_modules/puppeteer-core'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let ok=0,bad=0; const t=(c,m)=>{ if(c)ok++; else{bad++;console.log('FAIL',m);} };
(async()=>{
  const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--disable-gpu'],headless:'new'}); const errs=[];
  const p=await b.newPage(); await p.setViewport({width:1280,height:850}); p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('file://'+path.resolve(__dirname,'../dist/index.html')+'?demo=1'); await sleep(600);
  await p.click('#roleDemo'); await p.type('#inPass','787898'); await p.click('#loginGo'); await sleep(1300);
  // an open test floor with ten belts in a row, two machines and one storage unit apart from them
  await p.evaluate(()=>{ const f=window.__ff,S=f.S; const rows=[]; for(let y=0;y<50;y++){ let s=''; for(let x=0;x<50;x++){ let c='.'; if(x>=5&&x<45&&y>=5&&y<45) c='+'; s+=c; } rows.push(s); }
    S.rows=rows; S.ctx=window.floorCtx(rows); S.target=30; S.budget=265000; let id=1; const mk=(type,x,y,rot=0)=>({id:id++,type,x,y,rot});
    const it=[]; for(let x=10;x<20;x++) it.push(mk('BC',x,20)); it.push(mk('M1',10,24),mk('M2',14,24),mk('SS',30,30)); S.items=it; S.nextId=id; S.V.zoom=1; window.fitView(S.V,S.rows,S.W,S.H); f.refresh(); }); await sleep(300);
  const xy=(gx,gy)=>p.evaluate((gx,gy)=>{ const r=document.getElementById('cv').getBoundingClientRect(), q=window.P(window.__ff.S.V,gx,gy,0); return [r.left+q[0],r.top+q[1]]; },gx,gy);
  const st=()=>p.evaluate(()=>({n:window.__ff.S.items.length,m:window.__ff.S.multi.size,mode:window.__ff.S.selMode,undo:window.__ff.S.undo.length,del:document.getElementById('delMulti').textContent,dis:document.getElementById('delMulti').disabled}));
  const drag=async(a,c)=>{ const [x0,y0]=await xy(a[0],a[1]),[x1,y1]=await xy(c[0],c[1]); await p.mouse.move(x0,y0); await p.mouse.down(); await p.mouse.move((x0+x1)/2,(y0+y1)/2,{steps:4}); await p.mouse.move(x1,y1,{steps:4}); return [x1,y1]; };
  let s=await st(); t(s.n===13&&s.dis===true&&s.del==='Delete selected','starts with 13 pieces and a disabled delete button');
  await p.click('#selArea'); s=await st(); t(s.mode===true,'Select area turns the tool on');
  // drag a box over the first six belts only
  let [ex,ey]=await drag([10.2,19.4],[15.8,21.2]); await p.screenshot({path:'/tmp/area-drag.png'}); await p.mouse.up(); await sleep(150);
  s=await st(); t(s.m===6&&s.n===13,'box over six belts picks six: '+s.m); t(s.del==='Delete 6 selected'&&!s.dis,'button shows the count: '+s.del);
  await p.screenshot({path:'/tmp/area-picked.png'});
  // tap a picked belt drops it, tap a far piece adds it
  const [bx,by]=await xy(10.5,20.5); await p.mouse.click(bx,by); s=await st(); t(s.m===5,'tap on a picked belt removes it from the pick: '+s.m);
  const [sx,sy]=await xy(31.5,31.5); await p.mouse.click(sx,sy); s=await st(); t(s.m===6,'tap on the storage unit adds it: '+s.m);
  // delete all picked at once, one undo brings everything back
  await p.click('#delMulti'); await sleep(200); s=await st(); t(s.n===7&&s.m===0&&s.dis===true,'six pieces deleted together: '+s.n);
  const undoBefore=s.undo; await p.click('#undo'); await sleep(150); s=await st(); t(s.n===13,'one Undo restores all six: '+s.n);
  // new drag replaces; Delete key deletes; Escape clears then leaves the tool
  await drag([10.2,24.2],[17.8,26.8]); await p.mouse.up(); await sleep(100); s=await st(); t(s.m===2,'box over the two machines picks two: '+s.m);
  await p.keyboard.press('Delete'); await sleep(150); s=await st(); t(s.n===11&&s.m===0,'Delete key removes the picked pieces: '+s.n);
  await p.click('#undo'); await sleep(100);
  await drag([10.2,19.4],[12.8,21.2]); await p.mouse.up(); await p.keyboard.press('Escape'); s=await st(); t(s.m===0&&s.mode===true,'first Escape clears the pick');
  await p.keyboard.press('Escape'); s=await st(); t(s.mode===false,'second Escape leaves the tool');
  // pan still works with the tool off, and a rotated view still boxes the right pieces
  await p.click('#selArea'); await p.click('#vright'); await sleep(200);
  await drag([10.2,19.4],[15.8,21.2]); await p.mouse.up(); await sleep(100); s=await st(); t(s.m===6,'rotated view: box picks the same six belts: '+s.m);
  await p.screenshot({path:'/tmp/area-rot.png'});
  await p.click('#modeBtn'); await sleep(200); await p.keyboard.press('Escape'); await drag([10.2,19.4],[15.8,21.2]); await p.mouse.up(); await sleep(100); s=await st(); t(s.m===6,'flat plan: box picks six: '+s.m);
  await p.screenshot({path:'/tmp/area-flat.png'});
  t(errs.length===0,'no page errors '+errs.slice(0,2)); console.log('ok',ok,'bad',bad); await b.close();
})().catch(e=>{console.log('ERR',e.message);process.exit(1)});

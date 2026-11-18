const puppeteer=require('/home/claude/smoke/node_modules/puppeteer-core'); const sleep=ms=>new Promise(r=>setTimeout(r,ms)); let ok=0,bad=0; const t=(c,m)=>{ if(c)ok++; else{bad++;console.log('FAIL',m);} };
(async()=>{
  const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--disable-gpu'],headless:'new'}); const errs=[];
  const p=await b.newPage(); await p.setViewport({width:1280,height:850}); p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{ if(m.type()==='error'&&!/ERR_FILE_NOT_FOUND|favicon|config\.js/.test(m.text())) errs.push(m.text()); });
  await p.goto('file:///home/claude/ff2/dist/index.html?demo=1'); await sleep(600);
  await p.click('#roleDemo'); await p.type('#inPass','787898'); await p.click('#loginGo'); await sleep(1300);
  // plain test floor with a full line and storage at both ends
  await p.evaluate(()=>{ const f=window.__ff,S=f.S; const rows=[]; for(let y=0;y<50;y++){ let s=''; for(let x=0;x<50;x++){ let c='.'; if(x>=5&&x<45&&y>=5&&y<45) c='+'; if(x===5&&y>=20&&y<28) c='I'; if(x===44&&y>=20&&y<28) c='O'; s+=c; } rows.push(s); }
    S.rows=rows; S.ctx=window.floorCtx(rows); S.target=30; S.budget=265000; S.m=.65; S.need=30*1.46*1.65; let id=1; const mk=(type,x,y,rot=0)=>({id:id++,type,x,y,rot});
    const it=[mk('M1',6,22),mk('M2',8,22),mk('M3',11,22),mk('BM',15,22,0)]; for(let x=17;x<=39;x++) it.push(mk('BC',x,22)); it.push(mk('BM',40,22,0),mk('M4',42,22),mk('SL',6,17),mk('SL',39,17));
    S.items=it; S.nextId=id; S.V.zoom=1; window.fitView(S.V,S.rows,S.W,S.H); f.refresh(); }); await sleep(300);
  const S=()=>p.evaluate(()=>{ const s=window.__ff.S; const f=s.play&&s.play.f; return {liveT:s.liveT,rm:f?f.rm.reduce((a,b)=>a+b,0):null,fg:f?f.fg.reduce((a,b)=>a+b,0):null,shipped:f?f.shipped:null,ev:s.play?s.play.ev.map(e=>e.type+(e.manual?'*':'')):null,tr:__shell.DM.tr,evAll:s.an.sim.ev.length,man:s.an.sim.ev.filter(e=>e.manual).length,clock:document.getElementById('simclock').style.display}; });
  t((await S()).liveT==null,'idle demo: no live clock'); t(await p.evaluate(()=>window.__ff.S.an.fills.every(f=>f.fill===0)),'storage starts empty');
  t((await p.$eval('#runBtn',e=>1).catch(()=>0))===0,'no Run button any more');
  // start the demo round
  await p.click('#setupBtn'); await sleep(200); await p.click('#dmStart'); await sleep(400);
  const setT=async sec=>{ await p.evaluate(sec=>{ const tot=__shell.DM.minutes*60+(__shell.DM.tm.add||0); __shell.DM.tm.endAt=Date.now()+(tot-sec)*1000; __shell.DM.tm.state='running'; },sec); await sleep(450); return S(); };
  let a=await setT(5); t(a.liveT>=4&&a.liveT<=7,'live clock follows the round: '+a.liveT); t(a.rm===0&&a.fg===0&&a.clock==='block','empty storage and clock shown at 0:05');
  a=await setT(61); t(a.ev&&a.ev.includes('in'),'delivery truck visible just after 1:00: '+a.ev); t(a.rm>0,'raw material in storage after the truck: '+a.rm);
  a=await setT(119); t(a.fg>0,'finished goods wait in storage before the shipping truck: '+a.fg);
  a=await setT(121); t(a.ev&&a.ev.includes('out'),'shipping truck visible just after 2:00');
  a=await setT(180); t(a.shipped>0,'units shipped: '+a.shipped);
  // manual trucks and interval changes from the demo controls
  const te=()=>p.$eval('#dmTe',e=>e.textContent);
  t((await te())==='60 s','interval shows 60 s'); await setT(200);
  await p.click('#dmTIn'); await sleep(300); a=await S(); t(a.man===1&&a.ev&&a.ev.includes('in*'),'manual delivery truck arrives now: '+JSON.stringify(a.tr));
  await p.click('#dmTOut'); await sleep(300); a=await S(); t(a.man===2,'manual shipping truck added');
  await p.click('#dmTDown'); await sleep(300); t((await te())==='50 s','interval 50 s after -10 s'); await p.click('#dmTUp'); await p.click('#dmTUp'); await sleep(300); t((await te())==='70 s','interval 70 s after +20 s');
  a=await S(); t(a.tr.c.split(',').length===3,'changes recorded: '+a.tr.c);
  // editing the layout keeps the live view consistent
  await p.evaluate(()=>{ window.__ff.S.items.pop(); window.__ff.refresh(); }); await sleep(300); a=await S(); t(a.rm!==null&&a.clock==='block','live view survives an edit');
  // reset clears trucks
  await p.click('#dmReset'); await sleep(300); a=await S(); t(a.liveT==null&&a.tr===null,'reset clears the live clock and the schedule');
  await p.screenshot({path:'/tmp/run_after.png'});
  t(errs.length===0,'no page errors '+errs.join('|')); console.log('ok',ok,'bad',bad); await b.close(); process.exit(bad?1:0);
})().catch(e=>{ console.log('CRASH',e.stack); process.exit(2); });

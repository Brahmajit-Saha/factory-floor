const puppeteer=require('/home/claude/smoke/node_modules/puppeteer-core'); const sleep=ms=>new Promise(r=>setTimeout(r,ms)); let ok=0,bad=0; const t=(c,m)=>{ console.log(c?'  ok':'FAIL',m); if(c)ok++; else bad++; };
(async()=>{
  const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox'],headless:'new'}); const errs=[];
  const p=await b.newPage(); await p.setViewport({width:1280,height:850}); p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(m.type()==='error'&&!/favicon|config\.js|ERR_FILE_NOT_FOUND/.test(m.text())) errs.push(m.text()); });
  await p.goto('file:///home/claude/ff2/dist/index.html?demo=1'); await sleep(800);
  const vis=id=>p.$eval('#'+id,e=>e.classList.contains('on')); const txt=s=>p.$eval(s,e=>e.textContent);
  t(await p.$eval('#roleDemo',e=>getComputedStyle(e).display!=='none'),'Demo link on the login page');
  await p.click('#roleDemo'); t((await txt('#lbPass'))==='Demo passcode','label says Demo passcode'); t(await p.$eval('#lbEmail',e=>e.style.display==='none'),'no college id needed');
  await p.type('#inPass','123456789'); await p.click('#loginGo'); await sleep(300); t((await txt('#loginErr'))==='Wrong passcode','wrong passcode rejected');
  await p.$eval('#inPass',e=>e.value=''); await p.type('#inPass','787898'); await p.click('#loginGo'); await sleep(1200);
  t(await vis('app'),'demo opens the game screen'); t(await p.$eval('#setupBtn',e=>e.style.display!=='none'),'Setup button shown'); t(await p.evaluate(()=>!!window.Builder.state.rows),'a floor is loaded');
  t((await txt('#ctxline')).startsWith('Demo ·'),'header says Demo: '+await txt('#ctxline')); t((await txt('#tLabel'))==='Not started','timer not started'); t(await p.evaluate(()=>!document.getElementById('timesup').classList.contains('on')),'building is open before start');
  // setup sheet
  await p.click('#setupBtn'); await sleep(300); t(await vis('demoSetup'),'setup sheet opens');
  t((await p.$$eval('#dmLay option',o=>o.length))===13,'floor list: automatic + 12'); t((await p.$$eval('#dmFactory option',o=>o.length))===4,'four factories');
  await p.select('#dmK','2'); await p.evaluate(()=>document.getElementById('dmK').dispatchEvent(new Event('change'))); t((await p.$$eval('#dmFactory option',o=>o.length))===2,'team size 2 -> two factories');
  await p.select('#dmK','4'); await p.evaluate(()=>document.getElementById('dmK').dispatchEvent(new Event('change')));
  await p.select('#dmFactory','2'); await p.select('#dmRound','3'); await p.select('#dmLay','5'); await p.$eval('#dmTarget',e=>e.value=200); await p.$eval('#dmBudget',e=>e.value=150000);
  await p.click('#dmApply'); await sleep(800);
  const st=await p.evaluate(()=>{ const S=window.Builder.state; return [S.fi,S.round,S.floor.index,S.target,S.budget]; }); t(st.join()==='2,3,5,200,150000','loaded factory C, round 3, floor 5, target 200, budget 150000: '+st);
  t((await txt('#ctxline')).includes('Factory C')&&(await txt('#ctxline')).includes('Floor 5'),'header: '+await txt('#ctxline'));
  // place a piece, then time
  const placed=await p.evaluate(()=>{ const f=window.__ff,S=f.S; for(let y=0;y<50;y++) for(let x=0;x<50;x++){ const c={type:'M1',rot:0,x,y}; if(f.checkPlace(S.ctx,S.items,c,S.cfg,S.budget).ok){ f.snapshot(); S.items.push(Object.assign({id:S.nextId++},c)); f.commit(); return true; } } return false; }); t(placed,'placed a piece');
  t(await p.$eval('#delSel',e=>e.disabled),'Remove is disabled when nothing is selected');
  await p.evaluate(()=>{ const f=window.__ff; f.S.sel=f.S.items[0].id; f.S.dirty=true; }); await sleep(300); t(!(await p.$eval('#delSel',e=>e.disabled)),'Remove enabled once a piece is selected');
  await p.click('#delSel'); await sleep(300); t((await p.evaluate(()=>window.__ff.S.items.length))===0,'Remove deletes the selected piece'); t(await p.$eval('#delSel',e=>e.disabled),'Remove disabled again');
  await p.click('#undo'); await sleep(300); t((await p.evaluate(()=>window.__ff.S.items.length))===1,'Undo brings the piece back');
  await sleep(900); await p.click('#setupBtn'); await sleep(200); await p.$eval('#dmMin',e=>{ e.value=1; e.dispatchEvent(new Event('change')); }); await p.click('#dmStart'); await sleep(600);
  t((await txt('#tLabel'))==='Time left'&&/\d\d:\d\d/.test(await txt('#tClock')),'timer running '+await txt('#tClock')); t((await p.$eval('#dmStatus',e=>e.value)).startsWith('Time left'),'status field');
  await p.click('#dmPause'); await sleep(500); t((await txt('#tLabel'))==='Paused'&&await p.$eval('#timesup',e=>e.classList.contains('on')),'pause locks the floor'); await p.click('#dmPause'); await sleep(500); t((await txt('#tLabel'))==='Time left','resume'); 
  await p.click('#dmEnd'); await sleep(600); t((await txt('#tLabel'))==="Time's up"&&(await txt('#tuTitle'))==="Time's up",'end now locks with a score: '+(await txt('#tuBody')).slice(0,40));
  await p.click('#dmAdd1'); await sleep(600); t((await txt('#tLabel'))==='Time left'&&!(await p.$eval('#timesup',e=>e.classList.contains('on'))),'adding time re-opens'); await p.click('#dmCancel');
  // persistence and isolation
  await sleep(900); await p.reload(); await sleep(1500); t(await vis('app')&&(await txt('#ctxline')).startsWith('Demo ·'),'reload returns to the demo'); t(await p.evaluate(()=>window.Builder.state.items.length)===1,'build survived the reload');
  t(await p.evaluate(()=>Object.keys(localStorage).every(k=>!/^ff(\/|db)/.test(k))),'no game data written to the database store');
  // sign out then it asks again
  await p.click('#outBtn'); await sleep(400); t(await vis('login'),'sign out returns to login'); t(await p.$eval('#setupBtn',e=>e.style.display==='none'),'Setup button hidden again');
  // phone layout
  const q=await b.newPage(); await q.setViewport({width:390,height:780,isMobile:false,hasTouch:false}); q.on('pageerror',e=>errs.push(e.message)); await q.goto('file:///home/claude/ff2/dist/index.html?demo=1'); await sleep(600);
  await q.click('#roleDemo'); await q.type('#inPass','787898'); await q.click('#loginGo'); await sleep(1200);
  const hdr=await q.$eval('header.top',e=>({sw:e.scrollWidth,cw:e.clientWidth})); t(hdr.sw<=390&&hdr.cw<=390,'phone header fits the screen '+JSON.stringify(hdr)); await q.screenshot({path:'/tmp/demo_phone.png'});
  await q.click('#setupBtn'); await sleep(400); await q.screenshot({path:'/tmp/demo_setup_phone.png'}); await p.screenshot({path:'/tmp/demo_login.png'});
  t(errs.length===0,'no page errors: '+errs.join(' || ')); console.log('ok',ok,'bad',bad); await b.close(); process.exit(bad?1:0);
})().catch(e=>{ console.log('CRASH',e); process.exit(2); });

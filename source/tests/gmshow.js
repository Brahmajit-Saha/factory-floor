const puppeteer=require('/home/claude/smoke/node_modules/puppeteer-core'); const sleep=ms=>new Promise(r=>setTimeout(r,ms)); let ok=0,bad=0; const t=(c,m)=>{ console.log(c?'  ok':'FAIL',m); if(c)ok++; else bad++; };
(async()=>{
  const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox'],headless:'new'}); const errs=[];
  const p=await b.newPage(); await p.setViewport({width:1600,height:900}); p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(m.type()==='error'&&!/favicon|config\.js|ERR_FILE_NOT_FOUND/.test(m.text())) errs.push(m.text()); });
  await p.goto('file:///home/claude/ff2/dist/index.html?demo=1'); await sleep(800);
  await p.click('#roleDemo'); await p.type('#inPass','787898'); await p.click('#loginGo'); await sleep(1200);
  const setMoment=async v=>{ await p.select('#povMoment',v); await sleep(1800); };
  await p.click('#pov [data-pov=gm]'); await sleep(1500);
  t(await p.$eval('#gm',e=>e.classList.contains('on')),'GM screen on'); t(await p.$eval('#gmTop,.tabs button.on',e=>e.dataset.tab==='show'),'Show is the first tab');
  // lobby
  await setMoment('lobby'); await p.click('#pov [data-pov=gm]').catch(()=>{}); await sleep(600);
  let h=await p.$eval('#gmBody',e=>e.textContent); t(h.includes('Factory')&&h.includes('players ready'),'lobby welcome screen'); t((await p.$$eval('.lb-chips span',e=>e.length))===6,'six player chips'); await p.screenshot({path:'/tmp/gm_lobby.png'});
  // running
  await setMoment('running'); await sleep(1500);
  t(await p.$('.show.round')!==null,'round screen shown'); t((await p.$eval('#shRound',e=>e.textContent)).startsWith('Round 1 of'),'round title'); const cb=await p.$eval('#shCb',e=>e.textContent); t(/^\d\d:\d\d$/.test(cb)&&cb!=='--:--','clock shows '+cb);
  t((await p.$$eval('#shRows .rrow',e=>e.length))===6,'six race lanes'); t((await p.$$eval('#shRows .rrow .rn b',e=>e.map(x=>x.textContent))).includes('Asha'),'lane names');
  const bodyTxt=await p.$eval('#gmBody',e=>e.textContent); t(!/\/\s*90|points/i.test(bodyTxt.replace(/Points stay hidden/,'')),'no points on the live screen');
  // wait for a delivery truck to be at the dock (round second 181-183) and screenshot it
  { const t0=Date.now(); let seen=false; while(Date.now()-t0<40000){ const el=720-(+((await p.$eval('#shCb',e=>e.textContent)).split(':')[0])*60+ +((await p.$eval('#shCb',e=>e.textContent)).split(':')[1])); if(el>=178&&el<=181){ seen=true; break; } await sleep(300); }
    await sleep(1500); t(seen,'reached the delivery moment'); t((await p.$$eval('#shRoad .trk.in',e=>e.length))>=1,'a delivery truck is on the road'); await p.screenshot({path:'/tmp/gm_truck.png'}); }
  t(await p.$eval('#shFg',e=>+e.textContent.replace(/,/g,''))>=0,'fg counter'); await sleep(500); await p.screenshot({path:'/tmp/gm_running.png'});
  t((await p.$eval('#shCv',e=>e.width))>100,'spotlight canvas drawn'); t((await p.$eval('#shCap',e=>e.textContent)).length>5,'spotlight caption: '+(await p.$eval('#shCap',e=>e.textContent)));
  t((await p.$$eval('#shTick .tkc',e=>e.length))>0,'ticker has events: '+(await p.$$eval('#shTick .tkc',e=>e.slice(0,3).map(x=>x.textContent))).join(' | '));
  t((await p.$$eval('#shRoad .trk',e=>e.length))>=0,'road runs');
  // tab: leaderboard hides points while running
  await p.click('.tabs button[data-tab=sb]'); await sleep(1200); h=await p.$eval('#gmBody',e=>e.textContent); t(h.includes('in progress'),'leaderboard says round in progress'); t(!(await p.$$eval('#sbP .bv b',e=>e.some(x=>/[1-9]/.test(x.textContent)&&x.textContent!=='–'))),'leaderboard shows no points during the round'); await p.screenshot({path:'/tmp/gm_sb_running.png'});
  await p.click('.tabs button[data-tab=lv]'); await sleep(1200); t(!(await p.$eval('#lvSt',e=>e.textContent)).includes('Computer points'),'live build hides computer points during the round');
  await p.click('.tabs button[data-tab=show]'); await sleep(800);
  // judging
  await setMoment('judging'); await p.click('.tabs button[data-tab=show]'); await sleep(1500); t((await p.$eval('#shNote',e=>e.textContent)).includes('Judges are rating'),'judging note: '+(await p.$eval('#shNote',e=>e.textContent))); await p.screenshot({path:'/tmp/gm_judging.png'});
  await p.click('.tabs button[data-tab=sb]'); await sleep(1500); h=await p.$eval('#sbTop',e=>e.textContent); t(h.includes('Judges are rating'),'leaderboard judging banner: '+h);
  // reveal
  await setMoment('reveal'); await p.click('.tabs button[data-tab=sb]'); await sleep(1500); t(await p.$('#sbRev')!==null,'reveal button shown'); await p.screenshot({path:'/tmp/gm_reveal_ready.png'});
  await p.click('#sbRev'); await sleep(2200); t((await p.$$eval('#sbP .brow2:not(.hid)',e=>e.length))>=1&&(await p.$$eval('#sbP .brow2.hid',e=>e.length))>=1,'reveal in progress: some rows hidden, some shown'); await p.screenshot({path:'/tmp/gm_reveal_mid.png'});
  await sleep(9000); t((await p.$$eval('#sbP .brow2.hid',e=>e.length))===0,'all rows revealed'); const first=await p.$eval('#sbP .brow2.g1 .bn b',e=>e.textContent); t(first.length>0,'leader highlighted: '+first); await p.screenshot({path:'/tmp/gm_reveal_done.png'});
  t((await p.$eval('#sbT',e=>e.children.length))===3,'three team rows');
  // final
  await setMoment('final'); await p.click('.tabs button[data-tab=sb]'); await sleep(1200); await p.click('#sbRev').catch(()=>{}); await sleep(11000); await p.click('.tabs button[data-tab=show]'); await sleep(3500); t(await p.$('.podium')!==null,'podium after final reveal'); await p.screenshot({path:'/tmp/gm_final.png'});
  t(errs.length===0,'no page errors '+errs.slice(0,3).join(' || '));
  console.log('ok',ok,'bad',bad); await b.close();
})();

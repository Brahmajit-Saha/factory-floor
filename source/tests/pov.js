const puppeteer=require('/home/claude/smoke/node_modules/puppeteer-core'); const sleep=ms=>new Promise(r=>setTimeout(r,ms)); let ok=0,bad=0; const t=(c,m)=>{ console.log(c?'  ok':'FAIL',m); if(c)ok++; else bad++; };
(async()=>{
  const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox'],headless:'new'}); const errs=[];
  const p=await b.newPage(); await p.setViewport({width:1280,height:850}); p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(m.type()==='error'&&!/favicon|config\.js|ERR_FILE_NOT_FOUND/.test(m.text())) errs.push(m.text()); });
  await p.goto('file:///home/claude/ff2/dist/index.html?demo=1'); await sleep(800);
  const vis=id=>p.$eval('#'+id,e=>e.classList.contains('on')); const txt=s=>p.$eval(s,e=>e.textContent);
  t(await p.$eval('#pov',e=>getComputedStyle(e).display==='none'),'no POV bar on the login page');
  await p.click('#roleDemo'); await p.type('#inPass','787898'); await p.click('#loginGo'); await sleep(1200);
  t(await p.$eval('#pov',e=>getComputedStyle(e).display!=='none'),'POV bar shown in the demo'); t((await p.$$eval('#pov button[data-pov]',e=>e.map(x=>x.textContent))).join('|')==='Player|Admin|Game Master|Judge 1|Judge 2','five POV buttons');
  t(await p.$eval('#pov [data-pov=player]',e=>e.classList.contains('on')),'Player POV is active first'); t(await vis('app'),'player game screen');
  // admin
  await p.click('#pov [data-pov=admin]'); await sleep(1200); t(await vis('admin'),'Admin POV shows the admin console'); t(!(await vis('app')),'player screen hidden');
  const adTxt=await p.$eval('#admin',e=>e.textContent); t(['Asha','Bo','Cy','Dev','Esha','Farid'].every(n=>adTxt.includes(n)),'admin sees the six sample players'); t(adTxt.includes('Rated by both judges: 1 of 6'),'admin sees judging progress: '+(adTxt.match(/Rated by both judges[^.]*/)||[''])[0]);
  await p.screenshot({path:'/tmp/pov_admin.png'});
  // GM
  await p.click('#pov [data-pov=gm]'); await sleep(1200); t(await vis('gm'),'Game Master POV'); let gmTxt=await p.$eval('#gmBody',e=>e.textContent); t(gmTxt.includes('Asha')&&gmTxt.includes('Judges are rating'),'GM show lists players and the judging banner');
  await p.screenshot({path:'/tmp/pov_gm.png'});
  // judge 1
  await p.click('#pov [data-pov=judge1]'); await sleep(1500); t(await vis('judge')&&(await txt('#jgWho'))==='Judge 1','Judge 1 POV');
  t((await p.$$eval('#jgList button',e=>e.length))===6,'six players to rate'); t((await p.$$eval('#jgList button .st',e=>e.map(x=>x.textContent))).slice(0,2).join('|')==='4.5|3.5','Judge 1 sees their own marks from the sample');
  await p.screenshot({path:'/tmp/pov_judge1.png'});
  await p.click('#jgList button:nth-child(3)'); await sleep(400); await p.click('[data-jp="4"]'); await p.click('#jgSave'); await sleep(700);
  t((await p.$$eval('#jgList button .st',e=>e.map(x=>x.textContent)))[2]==='4','mark saved in the sample event');
  // judge 2 sees their own marks, not judge 1's
  await p.click('#pov [data-pov=judge2]'); await sleep(1500); t((await txt('#jgWho'))==='Judge 2','Judge 2 POV'); t((await p.$$eval('#jgList button .st',e=>e.map(x=>x.textContent))).slice(0,3).join('|')==='4|–|–','Judge 2 sees only their own marks');
  // the sample event is shared between the POVs: the GM sees the new mark
  await p.click('#pov [data-pov=gm]'); await sleep(1200); gmTxt=await p.$eval('#gmBody',e=>e.textContent); t(gmTxt.length>50,'GM view still works after judges');
  // reset sample
  await p.click('#povReset'); await sleep(2200); t(await vis('gm'),'reset keeps the same POV'); 
  // back to player; real demo store untouched
  await p.click('#pov [data-pov=player]'); await sleep(1000); t(await vis('app')&&await p.$eval('#setupBtn',e=>e.style.display!=='none'),'back to the player demo'); t(await p.evaluate(()=>!localStorage.getItem('ffdemo:tree')||!JSON.parse(localStorage.getItem('ffdemo:tree')).meta),'the sample event never touches the saved demo store');
  await p.click('#outBtn'); await sleep(500); t(await vis('login')&&await p.$eval('#pov',e=>getComputedStyle(e).display==='none'),'sign out hides the POV bar');
  t(errs.length===0,'no page errors '+JSON.stringify(errs.slice(0,3))); console.log('ok',ok,'bad',bad); await b.close(); process.exit(bad?1:0);
})();

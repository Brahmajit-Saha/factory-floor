const puppeteer=require('/home/claude/smoke/node_modules/puppeteer-core'); const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{ const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox'],headless:'new'}); const errs=[];
 const p=await b.newPage(); await p.setViewport({width:1600,height:900}); p.on('pageerror',e=>errs.push(e.message));
 await p.goto('file:///home/claude/ff2/dist/index.html?demo=1'); await sleep(800); await p.click('#roleDemo'); await p.type('#inPass','787898'); await p.click('#loginGo'); await sleep(1200);
 await p.click('#pov [data-pov=gm]'); await sleep(800);
 for(const N of (process.argv[2]||'12,30,60').split(',').map(Number)){
   await p.evaluate(n=>{ window.__shell.ST.sampleN=n; },N); await p.select('#povMoment','lobby'); await sleep(600); await p.select('#povMoment','running'); await p.click('.tabs button[data-tab=show]');
   const t0=Date.now(); await p.waitForSelector('#shRows .rrow',{timeout:20000}); const firstRows=Date.now()-t0; await sleep(6000);
   // frame pacing for 4 s
   const fp=await p.evaluate(()=>new Promise(res=>{ const d=[]; let last=performance.now(), end=last+4000; const f=n=>{ d.push(n-last); last=n; if(n<end) requestAnimationFrame(f); else res(d); }; requestAnimationFrame(f); }));
   fp.sort((a,b)=>a-b); const avg=fp.reduce((a,x)=>a+x,0)/fp.length, p95=fp[Math.floor(fp.length*.95)], worst=fp[fp.length-1];
   const info=await p.evaluate(()=>{ const box=document.getElementById('shRows'), rows=[...box.querySelectorAll('.rrow')]; const bh=box.clientHeight; const vis=rows.filter(r=>{ const m=new DOMMatrix(getComputedStyle(r).transform); return m.f+r.offsetHeight<=bh+1; }).length; return {dom:rows.length,visible:vis,boxH:bh,rowH:rows[0]?rows[0].offsetHeight:0,heading:document.querySelector('.sh-race h3').textContent,tick:document.querySelectorAll('#shTick .tkc').length}; });
   console.log('N='+N,JSON.stringify(info),'first rows after',firstRows,'ms; frames avg',avg.toFixed(1),'p95',p95.toFixed(1),'worst',worst.toFixed(1),'ms');
   await p.screenshot({path:'/tmp/stress_run_'+N+'.png'});
   await p.select('#povMoment','reveal'); await p.click('.tabs button[data-tab=sb]'); await sleep(2500);
   const sb=await p.evaluate(()=>{ const c=document.querySelector('#sbP').parentElement; return {rows:document.querySelectorAll('#sbP .brow2').length,scrollH:c.scrollHeight,clientH:c.clientHeight}; });
   console.log('   leaderboard',JSON.stringify(sb)); await p.screenshot({path:'/tmp/stress_sb_'+N+'.png'}); await p.click('.tabs button[data-tab=show]');
 }
 console.log('errors',errs.length,errs.slice(0,3)); await b.close(); })();

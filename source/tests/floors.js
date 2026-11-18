// Multi-client end-to-end: admin + game master + players against a fake Firebase server.
const puppeteer=require('/home/claude/smoke/node_modules/puppeteer-core'); const {makeBackend}=require('./fakesb.js'); const fs=require('fs');
// Supabase mode: pages get an in-page fake supabase-js whose calls are bridged to one shared in-process backend.
const IN_PAGE=`(()=>{ const handlers=[]; window.__sbHandlers=handlers; window.__sbEvent=m=>handlers.forEach(h=>h(m));
 const mk=(op,rows)=>{ const spec={op,f:[],lim:null,rows:rows||null}; const q={ select(){ spec.op=spec.op||'select'; return q; }, in(c,v){ spec.f.push(['in',c,v]); return q; }, eq(c,v){ spec.f.push(['eq',c,v]); return q; }, neq(c,v){ spec.f.push(['neq',c,v]); return q; }, like(c,v){ spec.f.push(['like',c,v]); return q; }, limit(n){ spec.lim=n; return q; }, then(res,rej){ return window.__sbq(JSON.stringify(spec)).then(r=>JSON.parse(r)).then(res,rej); } }; return q; };
 const FAKE={createClient(){ return { from(){ return { select(){ return mk('select'); }, upsert(r){ return mk('upsert',r); }, delete(){ return mk('delete'); } }; }, rpc:async fn=>JSON.parse(await window.__sbq(JSON.stringify({op:'rpc',fn}))), channel(){ const ch={ on(t,f,cb){ handlers.push(cb); return ch; }, subscribe(cb){ setTimeout(()=>cb&&cb('SUBSCRIBED'),0); return ch; } }; return ch; }, removeChannel(){} }; } }; Object.defineProperty(window,'supabase',{get:()=>FAKE,set:()=>{},configurable:true});
 window.FF_CONFIG={supabaseUrl:'http://x',supabaseKey:'k'}; })();`;
const sleep=ms=>new Promise(r=>setTimeout(r,ms)); let ok=0,bad=0; const t=(c,m)=>{ if(c){ok++;} else{bad++; console.log('FAIL',m);} };
(async()=>{
  const be=makeBackend(); const nodeClient=be.createClient(); const pages=[];
  const treeOf=()=>{ let tr={}; const rows=[...be.rows.values()].sort((a,b)=>a.path.split('/').length-b.path.split('/').length); for(const r of rows){ const s=r.path.split('/'); let t=tr; for(let i=0;i<s.length-1;i++){ t[s[i]]=t[s[i]]||{}; t=t[s[i]]; } t[s[s.length-1]]=r.value; } return tr; };
  const srv={ get tree(){ return {ff:treeOf()}; }, close(){} }; const T=()=>treeOf(); const URL='file:///home/claude/ff2/dist/index.html';
  be.listeners.push(m=>{ for(const p of pages) p.evaluate(x=>window.__sbEvent&&window.__sbEvent(x),m).catch(()=>{}); });
  const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox'],headless:'new'}); const errs=[];
  async function page(name,w,h){ const c=await b.createBrowserContext(); const p=await c.newPage(); pages.push(p); await p.exposeFunction('__sbq',async js=>{ const spec=JSON.parse(js); if(spec.op==='rpc') return JSON.stringify(await nodeClient.rpc(spec.fn)); const tb=nodeClient.from('ff_kv'); let q=spec.op==='select'?tb.select():spec.op==='upsert'?tb.upsert(spec.rows):tb.delete(); for(const [k,c,v] of spec.f) q=q[k](c,v); if(spec.lim) q=q.limit(spec.lim); return JSON.stringify(await q); }); await p.evaluateOnNewDocument(IN_PAGE); await p.setViewport({width:w||1280,height:h||800}); p.on('pageerror',e=>errs.push(name+' PAGEERR '+e.message)); p.on('console',m=>{ if(m.type()==='error'&&!/ERR_FILE_NOT_FOUND/.test(m.text())) errs.push(name+' CONSOLE '+m.text()); }); await p.goto(URL); await sleep(700); return p; }
  const vis=(p,id)=>p.$eval('#'+id,e=>e.classList.contains('on')); const txt=(p,sel)=>p.$eval(sel,e=>e.textContent);
  const waitFor=async(fn,ms)=>{ const t0=Date.now(); while(Date.now()-t0<(ms||8000)){ if(await fn()) return true; await sleep(120); } return false; };
  async function login(p,email,pass){ if(email){ await p.$eval('#inEmail',e=>e.value=''); await p.type('#inEmail',email); } await p.$eval('#inPass',e=>e.value=''); await p.type('#inPass',pass); await p.click('#loginGo'); await sleep(500); }
  // ---- admin: setup with 3 teams of 2, 5 rounds -> needs 10 floor plans
  const ad=await page('admin',1280,900); await ad.click('#roleAdmin'); await login(ad,null,'19990909'); t(await vis(ad,'admin'),'admin opens');
  t((await txt(ad,'#adConn'))==='Live database','header says Live database when not in demo mode: '+await txt(ad,'#adConn'));
  t(!(await ad.$('#adPool')),'old pool field is gone');
  await ad.$eval('#adPpt',e=>{ e.value=2; e.dispatchEvent(new Event('input')); }); await ad.$eval('#adRounds',e=>{ e.value='5'; e.dispatchEvent(new Event('input')); });
  await ad.$eval('#adTeams',e=>{ e.value='Alpha\nBeta\nGamma'; e.dispatchEvent(new Event('input')); }); await ad.click('#adSave'); await sleep(500);
  t((await txt(ad,'#adSaveMsg'))==='Saved.','setup saved');
  t(/Save the game setup|needs\s*10/.test(await txt(ad,'#flBody')),'floor panel states 10 needed: '+(await txt(ad,'#flBody')).slice(0,120));
  t(!(await ad.$('#flGrid')),'no gallery before generating');
  await ad.$eval('#flN',e=>e.value=13); await ad.click('#flGen'); await sleep(300);
  t(await waitFor(()=>ad.$('#flGrid').then(Boolean),30000),'gallery appears after generating');
  t(T().meta.pool===13&&T().meta.fp===1,'pool and flag saved '+T().meta.pool);
  t((await ad.$$('#flGrid .fl[data-n] canvas')).length===13,'13 thumbnails');
  t((await txt(ad,'#flCount')).includes('Selected 13 of 10'),'all selected by default: '+await txt(ad,'#flCount'));
  t(await ad.$eval('#flAssign',e=>e.disabled),'assign disabled while 13 selected');
  await ad.click('#flGrid input[data-n="2"]'); await ad.click('#flGrid input[data-n="9"]'); await ad.click('#flGrid input[data-n="13"]');
  t((await txt(ad,'#flCount')).includes('Selected 10 of 10'),'after deselecting three: '+await txt(ad,'#flCount')); t(!(await ad.$eval('#flAssign',e=>e.disabled)),'assign enabled at exactly 10');
  await ad.click('#flGrid canvas[data-n="4"]'); await sleep(500); t(await vis(ad,'flBig'),'floor opens enlarged'); t((await txt(ad,'#flBigT')).startsWith('Floor 4'),'enlarged title'); await ad.screenshot({path:'/tmp/fl_big.png'}); await ad.click('#flBigX');
  await ad.click('#flAssign'); await sleep(700);
  const meta=T().meta; t(meta.use==='1,3,4,5,6,7,8,10,11,12','chosen floors saved: '+meta.use);
  const grp=(meta.seq||'').split('|').map(x=>x.split(',').map(Number)); t(grp.length===2&&grp.every(g=>g.length===5),'two groups of five: '+meta.seq);
  t([...grp[0],...grp[1]].sort((a,b)=>a-b).join()===meta.use,'groups use exactly the chosen floors');
  t((await ad.$$('#flBody .fltab tr')).length===1+6,'assignment table: header + 3 teams x 2 players');
  await ad.screenshot({path:'/tmp/fl_admin.png',fullPage:true});
  // a changed selection is flagged until shuffled again
  await ad.click('#flGrid input[data-n="1"]'); await ad.click('#flGrid input[data-n="2"]'); t((await txt(ad,'#flAsMsg')).includes('Ready'),'changed selection flagged: '+await txt(ad,'#flAsMsg')); await ad.click('#flGrid input[data-n="1"]'); await ad.click('#flGrid input[data-n="2"]');
  await ad.click('#flAssign'); await sleep(600); const seq1=T().meta.seq; t(!!seq1,'shuffle again keeps a valid plan');
  // ---- players join
  const tid=Object.keys(T().meta.teams), team=n=>tid.find(k=>T().meta.teams[k]===n);
  const A=await page('A'), B=await page('B'), C=await page('C',390,780);
  async function join(p,email,name,tm){ await login(p,email,'123456789'); await waitFor(()=>vis(p,'join')); await p.type('#inName',name); await p.select('#inTeam',tm); await p.click('#joinForm button'); await sleep(600); }
  await join(A,'asha@ibsindia.org','Asha',team('Alpha')); await join(B,'bo@ibsindia.org','Bo',team('Alpha')); await join(C,'cy@ibsindia.org','Cy',team('Beta'));
  t(T().players.asha.ord===0&&T().players.bo.ord===1&&T().players.cy.ord===0,'seats stored: '+JSON.stringify(Object.values(T().players).map(p=>p.ord)));
  t((await ad.$eval('#adPlayers',e=>e.textContent)).includes('auto')===false,'admin players table shows floor numbers');
  // rules cards on the wait screen: desktop + phone
  t((await A.$$('#rulesWait .rcard')).length===9,'nine rule cards on the wait screen'); await A.screenshot({path:'/tmp/wait_desktop.png',fullPage:true});
  const gridCols=await A.$eval('#rulesWait',e=>getComputedStyle(e).display); t(gridCols==='grid','desktop shows a card grid: '+gridCols);
  const ph=await C.$eval('#rulesWait',e=>getComputedStyle(e).display+'|'+getComputedStyle(e).scrollSnapType); t(ph.startsWith('flex')&&ph.includes('x'),'phone shows a swipe carousel: '+ph);
  t(await C.$eval('#rulesWaitDots',e=>getComputedStyle(e).display==='flex'),'phone shows dots'); await C.screenshot({path:'/tmp/wait_phone.png'});
  await C.$eval('#rulesWait',e=>e.scrollTo({left:e.children[1].offsetLeft-12})); await sleep(500); t((await C.$$eval('#rulesWaitDots i',d=>d.findIndex(x=>x.classList.contains('on'))))===1,'dots follow the swipe');
  const ov=await C.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1); t(ov,'no sideways page scroll on phone');
  // ---- game master + start
  const gm=await page('GM',1400,850); await gm.click('#roleGm'); await login(gm,null,'11223456'); await sleep(500);
  await waitFor(()=>ad.$eval('#rfTarget',e=>+e.value>0).catch(()=>false),20000); const sug=await ad.$eval('#rfTarget',e=>+e.value); t(sug>=100&&sug<=1000,'suggested target from chosen floors '+sug);
  t((await txt(ad,'#rfSug')).includes('from your 10 chosen floors'),'suggestion says it uses the chosen floors');
  await ad.$eval('#rfMin',e=>e.value=1); await ad.click('[data-act=start]'); await sleep(900);
  t(await waitFor(()=>vis(A,'app')),'A in game');
  const M=await ad.evaluate(()=>window.__shell.ST.meta); const exp=(p,n)=>{ const seq=M.seq.split('|').map(x=>x.split(',').map(Number)); const ti=Object.keys(M.teams).indexOf(p.team); return seq[p.ord][(ti+n-1)%5]; };
  const P=T().players; const fl=async pg=>pg.evaluate(()=>window.Builder.state.floor.index);
  t(await fl(A)===exp(P.asha,1)&&await fl(B)===exp(P.bo,1)&&await fl(C)===exp(P.cy,1),'players load exactly the floor assigned: '+[await fl(A),await fl(B),await fl(C)]+' vs '+[exp(P.asha,1),exp(P.bo,1),exp(P.cy,1)]);
  t(await fl(A)!==await fl(B),'teammates have different floors');
  t((await txt(A,'#ctxline')).includes('Floor '+exp(P.asha,1)),'header shows the floor: '+await txt(A,'#ctxline'));
  t(await A.evaluate(()=>window.Builder.state.use&&window.Builder.state.use.length===10),'builder knows the chosen floors');
  // in-game Rules button
  await A.click('#rulesBtn'); await sleep(300); t(await vis(A,'rulesModal'),'Rules button opens the cards'); t((await A.$$('#rulesIn .rcard')).length===9,'nine cards in the modal'); await A.screenshot({path:'/tmp/rules_modal.png'});
  await A.click('#rulesClose'); await sleep(200); t(!(await vis(A,'rulesModal')),'Rules closes');
  await C.click('#rulesBtn'); await sleep(300); await C.screenshot({path:'/tmp/rules_phone.png'}); t(await C.$eval('#rulesModal .rbox',e=>{ const r=e.getBoundingClientRect(); return r.right<=window.innerWidth+1&&r.left>=-1; }),'phone modal fits the screen'); await C.click('#rulesClose');
  // GM layouts + live view use the assignment
  await gm.click('[data-tab=lay]'); await sleep(1200); const tiles=await gm.$$eval('.lay .tile',x=>x.length); t(tiles>=2&&(await gm.$$('canvas[data-lay]')).length===tiles,'GM layouts: one tile per floor in use ('+tiles+')');
  t((await gm.$eval('.lay',e=>e.textContent)).includes('Asha'),'GM tile lists player names'); await gm.screenshot({path:'/tmp/gm_lay2.png'});
  await gm.click('[data-tab=lv]'); await sleep(900); t((await gm.$eval('#lvCap',e=>e.textContent)).includes('Floor '),'GM live caption shows the floor: '+await gm.$eval('#lvCap',e=>e.textContent));
  // locked after round 1 starts
  await ad.screenshot({path:'/tmp/fl_locked.png',fullPage:true});
  t(await ad.$eval('#flGen',e=>e.disabled)&&await ad.$eval('#flAssign',e=>e.disabled),'floor controls lock after round 1 starts');
  // round 2 uses the next floor of the rotation
  await ad.click('[data-act=end]'); await sleep(600); await ad.$eval('#adRoundBody',e=>e.querySelector('[data-act=gen]').click()); await sleep(500); await ad.$eval('#rfMin',e=>e.value=1); await ad.click('[data-act=start]'); await sleep(1200);
  t(await waitFor(async()=>(await fl(A))===exp(P.asha,2)),'round 2 gives A the next floor in the rotation: '+await fl(A)+' vs '+exp(P.asha,2)); t(exp(P.asha,2)!==exp(P.asha,1),'A\'s floor changed');
  // export carries the floor numbers
  await ad.evaluate(()=>{ window.__blob=null; const o=URL.createObjectURL.bind(URL); URL.createObjectURL=b=>{ window.__blob=b; return o(b); }; });
  await ad.click('#adExport'); await sleep(800);
  const b64=await ad.evaluate(()=>new Promise(r=>{ if(!window.__blob) return r(null); const fr=new FileReader(); fr.onload=()=>r(fr.result.split(',')[1]); fr.readAsDataURL(window.__blob); })); t(!!b64,'export produced a file'); if(b64) fs.writeFileSync('/tmp/export_floors.xlsx',Buffer.from(b64,'base64'));
  // changing the seed clears the selection
  await ad.click('#adReset'); await sleep(300); await ad.click('#adReset'); await sleep(700);
  t(!T().meta,'reset wipes everything');
  t(errs.length===0,'no page errors: '+errs.join(' || ')); console.log('ok',ok,'bad',bad); await b.close(); srv.close(); process.exit(bad?1:0);
})().catch(e=>{ console.log('CRASH',e); process.exit(2); });

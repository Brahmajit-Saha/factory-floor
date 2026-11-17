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
  // ---- admin
  const ad=await page('admin',1280,900); await p_role(ad,'roleAdmin'); await login(ad,null,'19990909'); t(await vis(ad,'admin'),'admin opens');
  async function p_role(p,id){ await p.click('#'+id); }
  await ad.$eval('#adPpt',e=>{ e.value=2; e.dispatchEvent(new Event('input')); }); await ad.$eval('#adRounds',e=>{ e.value='5'; e.dispatchEvent(new Event('input')); });
  await ad.$eval('#adTeams',e=>{ e.value='Alpha\nBeta'; e.dispatchEvent(new Event('input')); }); await ad.click('#adSave'); await sleep(500);
  t((await txt(ad,'#adSaveMsg'))==='Saved.','admin saves setup');
  t(T().meta&&T().meta.ppt===2&&Object.keys(T().meta.teams).length===2,'meta in database '+JSON.stringify(T().meta));
  // ---- players log in before the game starts
  const A=await page('A'), B=await page('B'), C=await page('C'), D=await page('D');
  await login(A,'a@gmail.com','123456789'); t((await txt(A,'#loginErr')).includes('ibsindia.org'),'wrong domain rejected');
  await login(A,'asha@ibsindia.org','wrong'); t((await txt(A,'#loginErr'))==='Wrong password','wrong password rejected');
  async function join(p,email,name,team){ await login(p,email,'123456789'); await waitFor(()=>vis(p,'join')); await p.type('#inName',name); await p.select('#inTeam',team); await p.click('#joinForm button'); await sleep(600); }
  const tid=Object.keys(T().meta.teams); const alpha=tid.find(k=>T().meta.teams[k]==='Alpha'), beta=tid.find(k=>T().meta.teams[k]==='Beta');
  await join(A,'asha@ibsindia.org','Asha',alpha); t(await vis(A,'wait'),'A on wait screen'); t((await txt(A,'#waitH'))==='Game is starting kindly wait','lobby message: '+await txt(A,'#waitH'));
  await join(B,'bo@ibsindia.org','Bo',alpha); await join(C,'cy@ibsindia.org','Cy',beta);
  t(T().players.asha.fi===0&&T().players.bo.fi===1&&T().players.cy.fi===0,'factories by join order in team '+JSON.stringify(Object.values(T().players).map(p=>p.fi)));
  await login(D,'dee@ibsindia.org','123456789'); await waitFor(()=>vis(D,'join'));
  const full=await D.$$eval('#inTeam option',o=>o.map(x=>[x.textContent,x.disabled])); t(full.some(([n,d])=>/Alpha/.test(n)&&d),'full team disabled '+JSON.stringify(full));
  // ---- game master
  const gm=await page('GM',1400,850); await p_role(gm,'roleGm'); await login(gm,null,'wrong'); t((await txt(gm,'#loginErr'))==='Wrong passcode','GM wrong passcode'); await login(gm,null,'11223456'); t(await vis(gm,'gm'),'GM opens');
  await sleep(600); t((await gm.$eval('#gmBody',e=>e.textContent)).includes('Asha'),'GM scoreboard lists players');
  // ---- admin starts round 1
  await waitFor(()=>ad.$eval('#rfTarget',e=>+e.value>0).catch(()=>false),20000); const sug=await ad.$eval('#rfTarget',e=>+e.value); t(sug>=100&&sug<=1000,'suggested target filled '+sug);
  await ad.$eval('#rfMin',e=>e.value=1); await ad.click('[data-act=start]'); await sleep(900);
  t(T().game.phase==='round'&&T().game.round===1&&T().rounds[1].status==='running','round 1 running in db');
  t(await waitFor(()=>vis(A,'app')),'player A sees the game screen'); t(await vis(B,'app')&&await vis(C,'app'),'B and C too');
  t(await waitFor(async()=>/\d\d:\d\d/.test(await txt(A,'#tClock'))&&(await txt(A,'#tLabel'))==='Time left'),'player clock running '+await txt(A,'#tClock'));
  const ca=await txt(A,'#tClock'), cc=await txt(C,'#tClock'); t(Math.abs(parseInt(ca.slice(3))-parseInt(cc.slice(3)))<=1,'clocks agree across devices '+ca+' '+cc);
  t(await A.evaluate(()=>!!window.Builder.state.rows),'builder loaded a floor for A');
  const fA=await A.evaluate(()=>window.Builder.state.fi), fB=await B.evaluate(()=>window.Builder.state.fi); t(fA===0&&fB===1,'A and B get different factories '+fA+','+fB);
  // place a machine for A programmatically through the real commit path
  const placed=await A.evaluate(()=>{ const f=window.__ff,S=f.S; for(let y=0;y<50;y++) for(let x=0;x<50;x++){ const cand={type:'M1',rot:0,x,y}; if(f.checkPlace(S.ctx,S.items,cand,S.cfg,S.budget).ok){ f.snapshot(); S.items.push(Object.assign({id:S.nextId++},cand)); f.commit(); return [x,y,S.an.total]; } } return null; });
  t(placed!==null,'placed a piece'); await sleep(1500);
  t(T().builds&&T().builds[1]&&T().builds[1].asha&&JSON.parse(T().builds[1].asha.items).length===1,'A\'s build saved to db'); const sc=T().scores[1].asha.score; t(sc===Math.round(placed[2]*10)/10,'score saved matches panel '+sc+' vs '+placed[2]);
  // GM live build
  await gm.click('[data-tab=lv]'); await sleep(900); const cap=await gm.$eval('#lvCap',e=>e.textContent).catch(()=>''); t(cap.length>0,'GM live view caption '+cap);
  await gm.$$eval('#lvList button',bs=>{ const b=bs.find(x=>x.textContent.startsWith('Asha')); b&&b.click(); }); await sleep(800);
  t((await gm.$eval('#lvSt',e=>e.textContent)).includes('Score'),'GM live stats shown'); await gm.screenshot({path:'/tmp/gm_live.png'});
  await gm.click('[data-tab=lay]'); await sleep(900); t((await gm.$$('canvas[data-fi]')).length===4,'GM layouts: four floors'); await gm.screenshot({path:'/tmp/gm_lay.png'});
  // ---- pause / resume
  await ad.click('[data-act=pause]'); await sleep(700); t(T().rounds[1].status==='paused','paused in db'); t(await waitFor(async()=>(await txt(A,'#tLabel'))==='Paused'),'player clock shows Paused'); t(await A.$eval('#timesup',e=>e.classList.contains('on')),'paused overlay shown');
  const lockedTry=await A.evaluate(()=>{ const f=window.__ff,S=f.S; const n=S.items.length; return n; }); 
  await ad.click('[data-act=resume]'); await sleep(700); t(T().rounds[1].status==='running','resumed'); t(!(await A.$eval('#timesup',e=>e.classList.contains('on'))),'overlay gone after resume');
  // ---- end round
  await ad.click('[data-act=end]'); await sleep(900); t(await A.$eval('#timesup',e=>e.classList.contains('on')),'time\'s up overlay'); t((await A.$eval('#tuBody',e=>e.textContent)).includes('Please wait, the admin is setting up the next round'),'ended overlay carries wait message');
  t(await gm.$eval('#gmBar',e=>e.classList.contains('on')),'GM bar visible after round ends'); t((await gm.$eval('#gmBar',e=>e.textContent)).includes('setting up'),'GM bar text');
  await ad.click('[data-act=gen]'); await sleep(900); t(T().game.phase==='setup','phase setup'); t(await vis(A,'wait')&&(await txt(A,'#waitH'))==='Please wait, the admin is setting up the next round','players see setup message: '+await txt(A,'#waitH')); t(await vis(C,'wait'),'C waits too'); t((await txt(A,'#waitCard')).includes('Round 1 score'),'wait screen shows round result');
  // ---- round 2
  await waitFor(()=>ad.$eval('#rfTarget',e=>+e.value>0).catch(()=>false),20000); await ad.$eval('#rfTarget',e=>e.value=200); await ad.$eval('#rfBudget',e=>e.value=150000); await ad.click('[data-act=start]'); await sleep(900);
  t(T().rounds[2].target===200&&T().rounds[2].budget===150000,'round 2 parameters stored'); t(await waitFor(()=>vis(A,'app')),'A back on game screen for round 2'); t(await A.evaluate(()=>window.Builder.state.round===2&&window.Builder.state.target===200&&window.Builder.state.budget===150000),'builder uses round 2 params'); t(await A.evaluate(()=>window.Builder.state.items.length===0),'round 2 starts empty');
  // reload A mid-round: should resume at the same state
  await A.reload(); await sleep(1200); t(await waitFor(()=>vis(A,'app')),'A resumes after reload');
  // late join mid round
  const E=await page('E'); await join(E,'eve@ibsindia.org','Eve',beta); t(await waitFor(()=>vis(E,'app')),'late joiner enters running round');
  // ---- finish
  await ad.click('[data-act=end]'); await sleep(700); await ad.$eval('#adRoundBody',e=>e.querySelector('[data-act=gen]').click()); await sleep(500);
  await ad.evaluate(()=>{ window.__blob=null; const o=URL.createObjectURL.bind(URL); URL.createObjectURL=b=>{ window.__blob=b; return o(b); }; });
  await ad.click('#adExport'); await sleep(800);
  const b64=await ad.evaluate(()=>new Promise(r=>{ if(!window.__blob) return r(null); const fr=new FileReader(); fr.onload=()=>r(fr.result.split(',')[1]); fr.readAsDataURL(window.__blob); }));
  t(!!b64,'export produced a file'); if(b64) fs.writeFileSync('/tmp/export.xlsx',Buffer.from(b64,'base64'));
  await ad.screenshot({path:'/tmp/admin.png',fullPage:true});
  t(errs.length===0,'no page errors: '+errs.join(' || ')); console.log('ok',ok,'bad',bad); await b.close(); srv.close(); process.exit(bad?1:0);
})().catch(e=>{ console.log('CRASH',e); process.exit(2); });

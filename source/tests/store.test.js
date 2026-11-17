const fs=require('fs'),vm=require('vm'); const {start}=require('./fakefb.js');
globalThis.window={addEventListener(){}}; globalThis.location={search:''};
const store={}; const {makeBackend}=require('./fakesb.js');
let ls={}; globalThis.localStorage={getItem:k=>ls[k]===undefined?null:ls[k],setItem:(k,v)=>{ls[k]=String(v);}};
vm.runInThisContext(fs.readFileSync(__dirname+'/../src/store.js','utf8')+';globalThis.__S={MemoryStore,FirebaseStore,SupabaseStore,setIn,getIn,prune}');
let ok=0,bad=0; const t=(c,m)=>{ if(c)ok++; else{bad++;console.log('FAIL',m);} };
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const {MemoryStore,FirebaseStore,SupabaseStore,setIn,getIn}=globalThis.__S;
  // tree helpers follow Firebase rules
  let tr={}; tr=setIn(tr,'a/b/c',1); t(JSON.stringify(tr)==='{"a":{"b":{"c":1}}}','setIn nested'); tr=setIn(tr,'a/b/c',null); t(JSON.stringify(tr)==='{}','null removes and prunes empties '+JSON.stringify(tr));
  tr=setIn({},'x',{p:1,q:null,r:{}}); t(JSON.stringify(tr)==='{"x":{"p":1}}','prune inside values');
  async function exercise(name,st){
    await st.ready();
    await st.set('players/a',{name:'Asha',n:1}); t((await st.get('players/a')).name==='Asha',name+' set/get');
    await st.update('players/a',{n:2,'extra/deep':'x'}); const a=await st.get('players/a'); t(a.n===2&&a.extra.deep==='x'&&a.name==='Asha',name+' update merges, multi-path '+JSON.stringify(a));
    await sleep(60); const seen=[]; const off=st.on('players',v=>seen.push(v)); await sleep(150);
    t(seen.length===1&&seen[0].a.n===2,name+' on() delivers current value first');
    await st.set('players/b',{name:'Bo'}); await sleep(150); t(seen.length>=2&&seen[seen.length-1].b.name==='Bo',name+' on() sees child added');
    await st.update('players/b',{name:'Bob'}); await sleep(150); t(seen[seen.length-1].b.name==='Bob',name+' on() sees patch');
    await st.set('players',null); await sleep(150); t(seen[seen.length-1]===null,name+' on() sees parent removed');
    const n=seen.length; off(); await st.set('players/c',{z:1}); await sleep(150); t(seen.length===n,name+' off() stops callbacks');
    const deep=[]; const off2=st.on('r/1/layout',v=>deep.push(v)); await sleep(100); await st.set('r',{1:{layout:{i:'[]'}}}); await sleep(150); t(deep.length>=2&&deep[deep.length-1].i==='[]',name+' on() sees change made by an ancestor write');
    off2();
    await st.set('empty',[]); t((await st.get('empty'))===null,name+' empty arrays vanish');
    const nowd=Math.abs(st.now()-Date.now()); t(nowd<2000,name+' now() close to local clock '+nowd);
  }
  await exercise('memory',MemoryStore());
  const be=makeBackend(); const sbA=SupabaseStore('http://x','k',be); await exercise('supabase',sbA);
  // two supabase clients (separate devices) share the backend; clock offset from rpc
  const sbB=SupabaseStore('http://x','k',be); const seenB=[]; const offB=sbB.on('game',v=>seenB.push(v)); await sleep(100); await sbA.set('game',{phase:'round',round:3}); await sleep(150); t(seenB[seenB.length-1]&&seenB[seenB.length-1].round===3,'supabase: second device sees write'); await sbA.update('',{'rounds/1':{minutes:5},game:{phase:'setup',round:3}}); await sleep(150); t(seenB[seenB.length-1].phase==='setup','supabase: multi-path update reaches listener'); { const r=await sbB.get('rounds'); t(r&&r['1']&&r['1'].minutes===5,'supabase: get assembles rows under a path'); } offB();
  be.setNow(()=>Date.now()+7000); await sbB.ready(); t(Math.abs(sbB.now()-Date.now()-7000)<400,'supabase: clock offset from ff_now '+(sbB.now()-Date.now())); be.setNow(()=>Date.now());
  const fb=await start(0).catch(()=>null);
  const srv=await start(38211); const fs1=FirebaseStore(srv.url);
  await exercise('firebase',fs1);
  // clock offset: server says time is +5s ahead
  const realNow=Date.now; Date.now=()=>realNow()-5000; const fs2=FirebaseStore(srv.url); await fs2.ready(); const d=fs2.now()-realNow(); Date.now=realNow;
  t(Math.abs(d)<400,'clock offset corrects a device that is 5 s behind (residual '+d+' ms)');
  // two clients on the same server see each other
  const c1=FirebaseStore(srv.url), c2=FirebaseStore(srv.url); const got=[]; const off=c2.on('game',v=>got.push(v)); await sleep(150);
  await c1.set('game',{phase:'round',round:2}); await sleep(200); t(got[got.length-1]&&got[got.length-1].round===2,'second client sees first client write'); off();
  // offline: writing to a dead server rejects and flags offline
  const dead=FirebaseStore('http://localhost:1'); let rej=false; try{ await dead.set('x',1); }catch(e){ rej=true; } t(rej,'write to a dead server rejects');
  srv.close(); console.log('ok',ok,'bad',bad); process.exit(bad?1:0);
})();

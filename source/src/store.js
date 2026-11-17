/* ---------- Shared data store: one tree of JSON shared by every screen. ----------
   Two back ends with the same small API:
     MemoryStore    demo mode, tabs of one browser share it through localStorage
     FirebaseStore  Firebase Realtime Database over its REST + server-sent-events interface (no SDK, no keys)
   API: get(path) set(path,v) update(path,obj) remove(path) on(path,cb)->off  now()  ready()  status(cb)
   Values follow Firebase rules: null removes a node, empty objects and arrays vanish. */
const STORE_ROOT='ff';
const clone=v=>v===undefined?null:JSON.parse(JSON.stringify(v));
const segs=p=>String(p||'').split('/').filter(Boolean);
function getIn(tree,path){ let t=tree; for(const s of segs(path)){ if(t===null||typeof t!=='object'||!(s in t)) return null; t=t[s]; } return t===undefined?null:t; }
function prune(v){ // drop nulls and empty objects like Firebase does
  if(v===null||typeof v!=='object') return v;
  const o={}; let n=0; for(const k of Object.keys(v)){ const x=prune(v[k]); if(x!==null&&x!==undefined){ o[k]=x; n++; } }
  return n?o:null;
}
function setIn(tree,path,val){ // returns new root (mutates)
  const s=segs(path); val=prune(val===undefined?null:val);
  if(!s.length) return val===null?{}:val;
  let t=tree; for(let i=0;i<s.length-1;i++){ if(t[s[i]]===null||typeof t[s[i]]!=='object') t[s[i]]={}; t=t[s[i]]; }
  if(val===null) delete t[s[s.length-1]]; else t[s[s.length-1]]=val;
  return pruneTree(tree);
}
function pruneTree(t){ return prune(t)||{}; }

function MemoryStore(){
  const KEY='ffdemo:tree'; const subs=[]; let mem={}; let tree=read();
  function read(){ try{ const v=localStorage.getItem(KEY); if(v) return JSON.parse(v)||{}; }catch(e){} return mem; }
  function save(){ mem=tree; try{ localStorage.setItem(KEY,JSON.stringify(tree)); }catch(e){} }
  function notify(){ for(const s of subs.slice()){ const v=getIn(tree,s.path), j=JSON.stringify(v); if(j!==s.last){ s.last=j; s.cb(clone(v)); } } }
  try{ window.addEventListener('storage',e=>{ if(e.key===KEY){ tree=read(); notify(); } }); }catch(e){}
  const api={
    kind:'demo',
    async get(p){ tree=read(); return clone(getIn(tree,p)); },
    async set(p,v){ tree=read(); tree=setIn(tree,p,clone(v)); save(); notify(); },
    async update(p,o){ tree=read(); for(const k of Object.keys(o)) tree=setIn(tree,p+'/'+k,clone(o[k])); save(); notify(); },
    async remove(p){ return api.set(p,null); },
    on(p,cb){ const s={path:p,cb,last:undefined}; subs.push(s); setTimeout(()=>{ if(!subs.includes(s)) return; tree=read(); const v=getIn(tree,p); s.last=JSON.stringify(v); cb(clone(v)); },0); return ()=>{ const i=subs.indexOf(s); if(i>=0) subs.splice(i,1); }; },
    now(){ return Date.now(); },
    async ready(){ return true; },
    status(){ return ()=>{}; }
  };
  return api;
}

function FirebaseStore(baseUrl){
  const base=baseUrl.replace(/\/+$/,'');
  const url=p=>base+'/'+STORE_ROOT+(segs(p).length?'/'+segs(p).join('/'):'')+'.json';
  let offset=0, online=true; const statusCbs=[];
  const setOnline=v=>{ if(online!==v){ online=v; statusCbs.forEach(f=>f(v)); } };
  async function req(method,p,body,tries){
    tries=tries||3; let err;
    for(let i=0;i<tries;i++){
      try{
        const r=await fetch(url(p),{method,headers:body!==undefined?{'Content-Type':'application/json'}:undefined,body:body!==undefined?JSON.stringify(body):undefined});
        if(!r.ok) throw new Error('Database answered '+r.status+(r.status===401||r.status===403?' (check the database rules)':''));
        setOnline(true); const t=await r.text(); return t?JSON.parse(t):null;
      }catch(e){ err=e; setOnline(false); await new Promise(res=>setTimeout(res,300*(i+1))); }
    }
    throw err;
  }
  const api={
    kind:'firebase',
    async get(p){ const v=await req('GET',p); return v===undefined?null:v; },
    async set(p,v){ await req('PUT',p,v===undefined?null:v); },
    async update(p,o){ await req('PATCH',p,o); },
    async remove(p){ await req('DELETE',p); },
    on(p,cb){
      let es=null, val=null, got=false, dead=false, last=undefined, timer=null;
      const emit=()=>{ clearTimeout(timer); timer=setTimeout(()=>{ if(dead) return; const j=JSON.stringify(val); if(j!==last){ last=j; cb(clone(val)); } },0); };
      const open=()=>{
        if(dead) return;
        es=new EventSource(url(p));
        es.addEventListener('put',e=>{ try{ const m=JSON.parse(e.data); val=m.path==='/'?(m.data===undefined?null:m.data):applyAt(val,m.path,m.data); got=true; setOnline(true); emit(); }catch(x){} });
        es.addEventListener('patch',e=>{ try{ const m=JSON.parse(e.data); let v=val; for(const k of Object.keys(m.data||{})) v=applyAt(v,(m.path==='/'?'':m.path)+'/'+k,m.data[k]); val=v; got=true; emit(); }catch(x){} });
        es.addEventListener('cancel',()=>{ setOnline(false); });
        es.onopen=()=>setOnline(true);
        es.onerror=()=>{ setOnline(false); };
      };
      const applyAt=(tree,path,data)=>{ const t=(tree&&typeof tree==='object')?tree:{}; const r=setIn(t,path,data===undefined?null:data); return (r&&Object.keys(r).length)?r:null; };
      open();
      return ()=>{ dead=true; clearTimeout(timer); if(es) es.close(); };
    },
    now(){ return Date.now()+offset; },
    async ready(){ // measure the difference between this device's clock and the database server's clock
      const id='c'+Math.random().toString(36).slice(2,8); const samples=[];
      for(let i=0;i<3;i++){
        const t0=Date.now(); let sv=await req('PUT','clock/'+id,{'.sv':'timestamp'},2); if(typeof sv!=='number') sv=await req('GET','clock/'+id,undefined,2); const t1=Date.now();
        if(typeof sv==='number') samples.push({rtt:t1-t0,off:sv-(t0+t1)/2});
      }
      try{ await req('DELETE','clock/'+id,undefined,1); }catch(e){}
      if(samples.length){ samples.sort((a,b)=>a.rtt-b.rtt); offset=Math.round(samples[0].off); }
      return true;
    },
    status(cb){ statusCbs.push(cb); return ()=>{ const i=statusCbs.indexOf(cb); if(i>=0) statusCbs.splice(i,1); }; }
  };
  return api;
}

function createStore(){
  let dbUrl=null;
  try{ const q=new URLSearchParams(location.search); if(q.get('demo')==='1') return MemoryStore(); dbUrl=q.get('db'); }catch(e){}
  try{ if(!dbUrl&&window.FF_CONFIG&&window.FF_CONFIG.databaseURL) dbUrl=window.FF_CONFIG.databaseURL; }catch(e){}
  return dbUrl?FirebaseStore(dbUrl):MemoryStore();
}

// A tiny stand-in for Firebase Realtime Database's REST + streaming interface, for tests.
const http=require('http'); const RN=Date.now.bind(Date);
function start(port){
  let tree={}; const streams=[]; let writes=0, bytes=0;
  const segs=p=>p.split('/').filter(Boolean);
  const getIn=(t,s)=>{ for(const k of s){ if(t===null||typeof t!=='object'||!(k in t)) return null; t=t[k]; } return t; };
  const prune=v=>{ if(v===null||typeof v!=='object') return v; const o={}; let n=0; for(const k of Object.keys(v)){ const x=prune(v[k]); if(x!==null){ o[k]=x; n++; } } return n?o:null; };
  const setIn=(s,val)=>{ val=prune(val); if(!s.length){ tree=val||{}; return; } let t=tree; for(let i=0;i<s.length-1;i++){ if(t[s[i]]===undefined||t[s[i]]===null||typeof t[s[i]]!=='object') t[s[i]]={}; t=t[s[i]]; } if(val===null) delete t[s[s.length-1]]; else t[s[s.length-1]]=val; tree=prune(tree)||{}; };
  const sv=v=>{ if(v&&typeof v==='object'){ if(v['.sv']==='timestamp') return RN(); for(const k of Object.keys(v)) v[k]=sv(v[k]); } return v; };
  const send=(res,ev,data)=>{ res.write('event: '+ev+'\ndata: '+JSON.stringify(data)+'\n\n'); };
  function notify(changedSegs,kind,payload){ // kind put|patch relative to changedSegs
    for(const st of streams){
      const n=Math.min(st.s.length,changedSegs.length); let rel=true; for(let i=0;i<n;i++) if(st.s[i]!==changedSegs[i]) rel=false; if(!rel) continue;
      if(changedSegs.length>=st.s.length){ const r='/'+changedSegs.slice(st.s.length).join('/'); send(st.res,kind,{path:r==='/'?'/':r,data:payload}); }
      else send(st.res,'put',{path:'/',data:getIn(tree,st.s)});
    }
  }
  const server=http.createServer((req,res)=>{
    res.setHeader('Access-Control-Allow-Origin','*'); res.setHeader('Access-Control-Allow-Headers','*'); res.setHeader('Access-Control-Allow-Methods','GET,PUT,PATCH,DELETE,OPTIONS');
    if(req.method==='OPTIONS'){ res.writeHead(204); res.end(); return; }
    const u=new URL(req.url,'http://x'); const path=u.pathname.replace(/\.json$/,''); const s=segs(path);
    if(req.method==='GET'&&(req.headers.accept||'').includes('text/event-stream')){
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
      const st={s,res}; streams.push(st); send(res,'put',{path:'/',data:getIn(tree,s)}); req.on('close',()=>{ const i=streams.indexOf(st); if(i>=0) streams.splice(i,1); }); return;
    }
    if(req.method==='GET'){ res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify(getIn(tree,s))); return; }
    let body=''; req.on('data',d=>body+=d); req.on('end',()=>{
      writes++; bytes+=body.length;
      let data=body?JSON.parse(body):null; data=sv(data);
      if(req.method==='PUT'){ setIn(s,data); notify(s,'put',getIn(tree,s)); res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify(data)); }
      else if(req.method==='PATCH'){ for(const k of Object.keys(data)) setIn(s.concat(segs(k)),data[k]); notify(s,'patch',data); res.writeHead(200,{'Content-Type':'application/json'}); res.end(JSON.stringify(data)); }
      else if(req.method==='DELETE'){ setIn(s,null); notify(s,'put',null); res.writeHead(200,{'Content-Type':'application/json'}); res.end('null'); }
      else { res.writeHead(405); res.end(); }
    });
  });
  return new Promise(r=>server.listen(port,()=>r({url:'http://localhost:'+port,close:()=>{ streams.forEach(x=>x.res.end()); server.close(); },get tree(){return tree;},stats:()=>({writes,bytes}),reset:()=>{tree={};}})));
}
module.exports={start};

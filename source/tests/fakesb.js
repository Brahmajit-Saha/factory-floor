// In-process stand-in for the supabase-js client surface used by SupabaseStore (PostgREST subset + realtime fan-out).
function makeBackend(){
  const rows=new Map(); const channels=new Set(); let reqs=0, now=()=>Date.now();
  const listeners=[]; const emit=(m)=>{ listeners.forEach(f=>f(m)); for(const ch of channels){ for(const h of ch.handlers) setTimeout(()=>h(m),0); } };
  function Q(table,op){ this.op=op; this.f=[]; this.rowsIn=null; this.lim=null; this.opts=null; }
  Q.prototype.select=function(){ this.op=this.op||'select'; return this; };
  Q.prototype.in=function(c,v){ this.f.push(r=>v.includes(r[c])); return this; };
  Q.prototype.eq=function(c,v){ this.f.push(r=>r[c]===v); return this; };
  Q.prototype.neq=function(c,v){ this.f.push(r=>r[c]!==v); return this; };
  Q.prototype.like=function(c,v){ const re=new RegExp('^'+v.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/%/g,'.*')+'$'); this.f.push(r=>re.test(r[c])); return this; };
  Q.prototype.limit=function(n){ this.lim=n; return this; };
  Q.prototype.then=function(res,rej){ return Promise.resolve().then(()=>this.run()).then(res,rej); };
  Q.prototype.run=function(){
    reqs++;
    if(this.op==='select'){ let out=[...rows.values()].filter(r=>this.f.every(f=>f(r))).map(r=>({path:r.path,value:JSON.parse(JSON.stringify(r.value))})); if(this.lim) out=out.slice(0,this.lim); return {data:out,error:null}; }
    if(this.op==='upsert'){ for(const r of this.rowsIn){ const had=rows.has(r.path); const row={path:r.path,value:JSON.parse(JSON.stringify(r.value))}; rows.set(r.path,row); emit({eventType:had?'UPDATE':'INSERT',new:row,old:had?{path:r.path}:{}}); } return {data:null,error:null}; }
    if(this.op==='delete'){ for(const r of [...rows.values()]) if(this.f.every(f=>f(r))){ rows.delete(r.path); emit({eventType:'DELETE',new:{},old:{path:r.path}}); } return {data:null,error:null}; }
  };
  function createClient(){
    return {
      from(t){ return { select(){ const q=new Q(t,'select'); return q; }, upsert(r,o){ const q=new Q(t,'upsert'); q.rowsIn=r; q.opts=o; return q; }, delete(){ return new Q(t,'delete'); } }; },
      rpc: async(fn)=>fn==='ff_now'?{data:now(),error:null}:{data:null,error:{message:'no such function'}},
      channel(){ const ch={handlers:[],on(type,filter,cb){ ch.handlers.push(cb); return ch; },subscribe(cb){ channels.add(ch); setTimeout(()=>cb&&cb('SUBSCRIBED'),0); return ch; }}; return ch; },
      removeChannel(ch){ channels.delete(ch); }
    };
  }
  return {createClient,rows,listeners,stats:()=>({reqs}),setNow:f=>{now=f;}};
}
module.exports={makeBackend};

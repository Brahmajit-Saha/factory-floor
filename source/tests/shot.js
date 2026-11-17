const puppeteer=require('/home/claude/smoke/node_modules/puppeteer-core');
(async()=>{
  const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--disable-gpu'],headless:'new'});
  const pg=await b.newPage(); const W=+process.argv[2]||1280,H=+process.argv[3]||800;
  await pg.setViewport({width:W,height:H,deviceScaleFactor:1});
  const errs=[]; pg.on('pageerror',e=>errs.push(String(e))); pg.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
  await pg.goto('file:///home/claude/ff2/dist/index.html'); await new Promise(r=>setTimeout(r,600));
  // build a demo layout through the same code paths
  await pg.evaluate(()=>{
    const F=window.__ff,S=F.S,cfg=S.cfg,rows=S.rows; let id=1; const items=[];
    const free=(x,y,w,h)=>{ for(let j=0;j<h;j++)for(let i=0;i<w;i++){ if(rows[y+j][x+i]!=='+') return false; } return true; };
    const add=(type,x,y,rot)=>{ const it={id:id++,type,x,y,rot:rot||0}; if(F.checkPlace(S.ctx,items,it,cfg,1e9).ok){ items.push(it); return true; } return false; };
    // cluster near the middle: find a big free 22x12 region
    const around=(prev,type)=>{ const d=cfg.pieces[type]; for(let r=0;r<2;r++){ const [w,h]=[r?d.h:d.w,r?d.w:d.h]; const pd=cfg.pieces[prev.type], [pw,ph]=[prev.rot%2?pd.h:pd.w,prev.rot%2?pd.w:pd.h];
        for(let y=prev.y-h;y<=prev.y+ph;y++)for(let x=prev.x-w;x<=prev.x+pw;x++){ const it={id:id,type,x,y,rot:r}; if(F.checkPlace(S.ctx,items,it,cfg,1e9).ok){ const a1=F.analyze(items.concat([it]),S.ctx,cfg,{target:S.target,budget:S.budget,need:S.need}); const k=a1.machineOut.get(items.length); if(k&&k.fed){ items.push({...it,id:id++}); return items[items.length-1]; } } } } return null; };
    // RM Processor beside inbound
    let rm=null; const ib=S.ctx.inb; outer: for(const i of ib){ const bx=i%50, by=(i-bx)/50; for(let y=by-2;y<=by+1;y++)for(let x=bx-2;x<=bx+1;x++){ const it={id:id,type:'M1',x,y,rot:0}; if(F.checkPlace(S.ctx,items,it,cfg,1e9).ok&&F.analyze([it],S.ctx,cfg,{target:S.target,budget:S.budget,need:S.need}).stages[0].fed){ items.push({...it,id:id++}); rm=items[0]; break outer; } } }
    const rm2=rm&&around(rm,'M1'); const as=rm&&around(rm,'M2'); const as2=as&&around(as,'M2'); const wl=as&&around(as,'M3'); const wl2=wl&&around(wl,'M3');
    // storage chain from the inbound bay
    for(const i of S.ctx.inb){ const bx=i%50, by=(i-bx)/50; for(let y=by-5;y<=by+1;y++)for(let x=bx-5;x<=bx+1;x++){ const it={id,type:'SL',x,y,rot:0}; if(F.checkPlace(S.ctx,items,it,cfg,1e9).ok){ const k=items.length; items.push({...it,id:id++}); const a2=F.analyze(items,S.ctx,cfg,{target:S.target,budget:S.budget,need:S.need}); if(a2.checks[5]===1&&items.filter(q=>q.type==='SL').length<=2) { x=999; y=999; break; } else { items.pop(); id--; } } } if(items.filter(q=>q.type==='SL').length>=2) break; }
    // a Packer beside outbound, not yet linked
    for(const i of S.ctx.out){ const bx=i%50, by=(i-bx)/50; let done=false; for(let y=by-2;y<=by+1&&!done;y++)for(let x=bx-2;x<=bx+1&&!done;x++){ const it={id,type:'M4',x,y,rot:0}; if(F.checkPlace(S.ctx,items,it,cfg,1e9).ok){ items.push({...it,id:id++}); done=true; } } if(done) break; }
    S.items=items; S.nextId=id; S.sel=items[0]&&items[0].id; F.refresh();
  });
  await new Promise(r=>setTimeout(r,300));
  await pg.screenshot({path:'/tmp/ui_'+W+'.png'});
  console.log('errors',errs);
  await b.close();
})();

const puppeteer=require('/home/claude/smoke/node_modules/puppeteer-core'); const sleep=ms=>new Promise(r=>setTimeout(r,ms)); let ok=0,bad=0; const t=(c,m)=>{ if(c)ok++; else{bad++;console.log('FAIL',m);} };
(async()=>{
  const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--disable-gpu'],headless:'new'}); const errs=[];
  const p=await b.newPage(); await p.setViewport({width:1280,height:850}); p.on('pageerror',e=>errs.push(String(e)));
  await p.goto('file:///home/claude/ff2/dist/index.html?demo=1'); await sleep(500);
  await p.evaluate(()=>{ window.__shell.show('app'); Builder.load({seed:'OPS-1',pool:12,K:4,R:6,round:1,fi:0,items:[]}); Builder.setLock(false); }); await sleep(300);
  const place=()=>p.evaluate(()=>{ const f=window.__ff,S=f.S; const c0=window.unP(S.V,S.W/2,S.H/2); let best=null,bd=1e9; for(let y=3;y<47;y++) for(let x=3;x<47;x++){ const c={type:'M2',rot:0,x,y}; if(!f.checkPlace(S.ctx,S.items,c,S.cfg,S.budget).ok) continue; const d=Math.hypot(x-c0[0],y-c0[1]); if(d<bd){bd=d;best=c;} } S.items.push(Object.assign({id:S.nextId++},best)); f.refresh(); return S.items[S.items.length-1].id; });
  const pos=id=>p.evaluate(id=>{ const S=window.__ff.S, it=S.items.find(i=>i.id===id); const q=window.P(S.V,it.x+1.5,it.y+1.5,0), r=document.getElementById('stage').getBoundingClientRect(); return [q[0]+r.left,q[1]+r.top]; },id);
  const count=()=>p.evaluate(()=>window.__ff.S.items.length);
  // 1. drag out into the void: removed
  let id=await place(); let s=await pos(id); t(await count()===1,'one piece placed');
  const void_=await p.evaluate(()=>{ const S=window.__ff.S, r=document.getElementById('stage').getBoundingClientRect(); for(let sx=10;sx<S.W-80;sx+=20) for(let sy=20;sy<S.H-20;sy+=20){ const g=window.unP(S.V,sx,sy),x=Math.floor(g[0]),y=Math.floor(g[1]); if(x<0||y<0||x>=50||y>=50||S.rows[y][x]==='.') return [sx+r.left,sy+r.top]; } return null; });
  t(!!void_,'found void area on screen');
  await p.mouse.move(s[0],s[1]); await p.mouse.down(); await p.mouse.move(s[0]+20,s[1]+10,{steps:3}); await p.mouse.move(void_[0],void_[1],{steps:8});
  const mid=await p.evaluate(()=>{ const d=window.__ff.S.drag; return d&&d.reason; }); t(mid==='Release to remove','ghost says Release to remove, got '+mid);
  await p.mouse.up(); await sleep(200); t(await count()===0,'drop outside factory removes the piece'); 
  // undo brings it back
  await p.click('#undo'); await sleep(150); t(await count()===1,'undo restores it');
  // 2. invalid spot inside the floor still snaps back (not removed)
  id=(await p.evaluate(()=>window.__ff.S.items[0].id)); s=await pos(id);
  const bay=await p.evaluate(()=>{ const S=window.__ff.S, r=document.getElementById('stage').getBoundingClientRect(); const i=S.ctx.inb[0], x=i%50, y=(i-x)/50; const q=window.P(S.V,x+.5,y+.5,0); return [q[0]+r.left,q[1]+r.top]; });
  await p.mouse.move(s[0],s[1]); await p.mouse.down(); await p.mouse.move(s[0]+20,s[1]+10,{steps:3}); await p.mouse.move(bay[0],bay[1],{steps:8}); await p.mouse.up(); await sleep(200); t(await count()===1,'drop on a docking bay snaps back, not removed');
  // 3. no red cross label drawn on machines; bubble cross removes
  t(!(await p.evaluate(()=>document.body.innerText.includes('red ✕'))),'hint no longer mentions the red cross');
  s=await pos(await p.evaluate(()=>window.__ff.S.items[0].id)); await p.mouse.click(s[0],s[1]); await sleep(150);
  const bub=await p.evaluate(()=>{ const e=document.getElementById('bubDel'), r=e.getBoundingClientRect(); return {vis:!!e.offsetParent,x:r.left+r.width/2,y:r.top+r.height/2}; });
  t(bub.vis,'bubble cross visible when a piece is selected'); await p.mouse.click(bub.x,bub.y); await sleep(200); t(await count()===0,'bubble cross removes the selected piece');
  t(errs.length===0,'no page errors '+errs.join('|')); console.log('ok',ok,'bad',bad); await b.close(); process.exit(bad?1:0);
})().catch(e=>{ console.log('CRASH',e.stack); process.exit(2); });

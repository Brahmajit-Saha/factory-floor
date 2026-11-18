const puppeteer=require('/home/claude/smoke/node_modules/puppeteer-core'); const sleep=ms=>new Promise(r=>setTimeout(r,ms)); let ok=0,bad=0; const t=(c,m)=>{ if(c)ok++; else{bad++;console.log('FAIL',m);} };
(async()=>{
  const b=await puppeteer.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox','--disable-gpu'],headless:'new'}); const errs=[];
  const p=await b.newPage(); await p.setViewport({width:1280,height:850}); p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{ if(m.type()==='error'&&!/ERR_FILE_NOT_FOUND|favicon/.test(m.text())) errs.push(m.text()); });
  await p.goto('file:///home/claude/ff2/dist/index.html?demo=1'); await sleep(500);
  await p.evaluate(()=>{ window.__shell.show('app'); Builder.load({seed:'OPS-1',pool:12,K:4,R:6,round:1,fi:0,items:[]}); Builder.setLock(false); }); await sleep(300);
  // place a machine and a motor on free ground near the middle
  const placed=await p.evaluate(()=>{ const f=window.__ff,S=f.S; const out=[]; const put=(type,ox,oy)=>{ const c0=window.unP(S.V,S.W/2+ox,S.H/2+oy); let best=null,bd=1e9; for(let y=3;y<47;y++) for(let x=3;x<47;x++){ const c={type,rot:0,x,y}; if(!f.checkPlace(S.ctx,S.items,c,S.cfg,S.budget).ok) continue; const d=Math.hypot(x-c0[0],y-c0[1]); if(d<bd){bd=d;best=c;} } if(best){ S.items.push(Object.assign({id:S.nextId++},best)); out.push(S.items[S.items.length-1].id); } };
    put('M2',-60,0); put('BM',60,10); f.refresh(); return out; });
  t(placed.length===2,'placed two pieces '+placed);
  const rect=()=>p.evaluate(()=>{ const r=document.getElementById('stage').getBoundingClientRect(); return {l:r.left,t:r.top}; });
  const scr=(id,cx,cy)=>p.evaluate((id,cx,cy)=>{ const S=window.__ff.S, it=S.items.find(i=>i.id===id), d=S.cfg.pieces[it.type]; const dm=window.dims(d,it.rot); const x=cx===undefined?it.x+dm[0]/2:cx+dm[0]/2, y=cy===undefined?it.y+dm[1]/2:cy+dm[1]/2; const q=window.P(S.V,x,y,0), r=document.getElementById('stage').getBoundingClientRect(); return [q[0]+r.left,q[1]+r.top,it.x,it.y]; },id,cx,cy);
  const rot=()=>p.evaluate(()=>window.__ff.S.V.rot||0), sel=()=>p.evaluate(()=>window.__ff.S.sel);
  t(await p.$eval('#vleft',e=>!!e.offsetParent)&&await p.$eval('#vright',e=>!!e.offsetParent),'turn-view buttons visible');
  for(let k=0;k<4;k++){
    t((await rot())===k,'view angle is '+k);
    // tap selects each piece
    for(const id of placed){ const s=await scr(id); const top=await p.evaluate((x,y)=>{ const e=document.elementFromPoint(x,y); return e&&(e.id||e.className||e.tagName); },s[0],s[1]); await p.mouse.click(s[0],s[1]); await sleep(120); t((await sel())===id,'rot '+k+': tap selects piece '+id+' (sel '+await sel()+', element under pointer: '+top+', pt '+s.map(v=>Math.round(v))+', view '+JSON.stringify(await p.evaluate(()=>{const S=window.__ff.S;return {z:S.V.zoom,px:Math.round(S.V.px),py:Math.round(S.V.py),W:S.W,H:S.H,items:S.items.map(i=>i.type+i.x+','+i.y)}}))+')'); }
    // drag machine to a free target
    const id=placed[0]; const s0=await scr(id);
    const tgt=await p.evaluate(id=>{ const f=window.__ff,S=f.S; const it=S.items.find(i=>i.id===id); for(let dy=-10;dy<=10;dy++) for(let dx=-12;dx<=12;dx++){ if(Math.abs(dx)+Math.abs(dy)<6) continue; const cand={type:it.type,rot:it.rot,x:it.x+dx,y:it.y+dy}; if(f.checkPlace(S.ctx,S.items,cand,S.cfg,S.budget,it.id).ok) return cand; } return null; },id);
    const s1=await scr(id,tgt.x,tgt.y);
    await p.mouse.move(s0[0],s0[1]); await p.mouse.down(); await p.mouse.move(s0[0]+12,s0[1]+6,{steps:3}); await p.mouse.move(s1[0],s1[1],{steps:8}); await p.mouse.up(); await sleep(200);
    const after=await p.evaluate(id=>{ const it=window.__ff.S.items.find(i=>i.id===id); return it&&{x:it.x,y:it.y}; },id);
    t(after&&Math.abs(after.x-tgt.x)<=1&&Math.abs(after.y-tgt.y)<=1,'rot '+k+': machine moved to '+JSON.stringify(tgt)+' got '+JSON.stringify(after));
    await p.keyboard.press('Escape');
    if(k<3){ await p.click('#vright'); await sleep(150); }
  }
  // card armed: pressing a placed piece still moves it
  await p.click('.card[data-type="M1"]'); await sleep(150); t(await p.evaluate(()=>window.__ff.S.armed)==='M1','card armed');
  { const id=placed[1], s=await scr(id); await p.mouse.move(s[0],s[1]); await p.mouse.down(); await p.mouse.move(s[0]+30,s[1]+22,{steps:5}); const mid=await p.evaluate(()=>{ const d=window.__ff.S.drag; return !!d&&d.kind; }); await p.mouse.up(); await sleep(200); t(mid&&/move/.test(String(mid)),'armed card does not stop a placed piece being grabbed (drag kind '+mid+')'); }
  await p.keyboard.press('Escape');
  const r0=await rot(); await p.keyboard.press('e'); t((await rot())===(r0+1)%4,'E turns right'); await p.keyboard.press('q'); t((await rot())===r0,'Q turns back'); await p.click('#vleft'); t((await rot())===(r0+3)%4,'left button'); await p.click('#vright');
  { const c=await rect(); const r1=await rot(); await p.keyboard.down('Shift'); await p.mouse.move(c.l+60,c.t+60); await p.mouse.down(); await p.mouse.move(c.l+160,c.t+60,{steps:5}); await p.mouse.move(c.l+260,c.t+60,{steps:5}); await p.mouse.up(); await p.keyboard.up('Shift'); await sleep(150); t((await rot())!==r1,'Shift + drag turns the view ('+r1+' -> '+await rot()+')'); }
  { const cdp=await p.target().createCDPSession(); const c=await p.evaluate(()=>{ const r=document.getElementById('stage').getBoundingClientRect(); return {x:r.left+r.width/2,y:r.top+r.height/2}; }); const r1=await rot();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:c.x-80,y:c.y,id:1},{x:c.x+80,y:c.y,id:2}]});
    for(let a=0;a<=100;a+=10){ const g=a*Math.PI/180; await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:Math.round(c.x-80*Math.cos(g)),y:Math.round(c.y-80*Math.sin(g)),id:1},{x:Math.round(c.x+80*Math.cos(g)),y:Math.round(c.y+80*Math.sin(g)),id:2}]}); }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await sleep(200); const r2=await rot(); t(r2!==r1,'two-finger twist turns the view ('+r1+' -> '+r2+')'); }
  for(let k=0;k<4;k++){ await p.evaluate(k=>{ const S=window.__ff.S; S.V.rot=k; window.__ff.refresh(); },k); await sleep(250); await p.screenshot({path:'/tmp/rot'+k+'.png'}); }
  t(errs.length===0,'no page errors: '+errs.join(' || ')); console.log('ok',ok,'bad',bad); await b.close(); process.exit(bad?1:0);
})().catch(e=>{ console.log('CRASH',e.stack); process.exit(2); });

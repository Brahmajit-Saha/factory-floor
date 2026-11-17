/* ---------- Rendering: draws the floor and pieces on a 2D canvas context. No DOM. ---------- */
const SHADE={};
function shade(hex,f){
  const k=hex+'|'+f; if(SHADE[k]) return SHADE[k];
  const n=parseInt(hex.slice(1),16); const cl=v=>Math.max(0,Math.min(255,Math.round(v)));
  const h2=v=>('0'+cl(v).toString(16)).slice(-2);
  return SHADE[k]='#'+h2(((n>>16)&255)*f)+h2(((n>>8)&255)*f)+h2((n&255)*f);
}
const STYLE={
  M1:{c:'#2a9d8f'}, M2:{c:'#e0793a'}, M3:{c:'#3a6fb0'}, M4:{c:'#8b5fbf'},
  BM:{c:'#5b6670'}, BC:{c:'#e3b341'},
  SS:{c:'#b08556'}, SM:{c:'#b08556'}, SL:{c:'#c49a64'}
};
function P(V,x,y,z){
  z=z||0;
  if(V.mode==='flat'){ const s=12*V.zoom; return [V.px+x*s,V.py+y*s]; }
  const a=16*V.zoom,b=8*V.zoom; return [V.px+(x-y)*a, V.py+(x+y)*b-z*12*V.zoom];
}
function unP(V,sx,sy){
  if(V.mode==='flat'){ const s=12*V.zoom; return [(sx-V.px)/s,(sy-V.py)/s]; }
  const a=16*V.zoom,b=8*V.zoom,u=(sx-V.px)/a,v=(sy-V.py)/b; return [(u+v)/2,(v-u)/2];
}
function floorBounds(rows){
  let x0=N,y0=N,x1=-1,y1=-1;
  for(let y=0;y<N;y++) for(let x=0;x<N;x++) if(rows[y][x]!=='.'){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
  return {x0,y0,x1:x1+1,y1:y1+1};
}
function fitView(V,rows,W,H){
  const b=floorBounds(rows); V.zoom=1; V.px=0; V.py=0;
  const pts=[P(V,b.x0,b.y1,0),P(V,b.x1,b.y0,0),P(V,b.x0,b.y0,3),P(V,b.x1,b.y1,0)];
  const minX=Math.min(...pts.map(p=>p[0])),maxX=Math.max(...pts.map(p=>p[0])),minY=Math.min(...pts.map(p=>p[1])),maxY=Math.max(...pts.map(p=>p[1]));
  const z=Math.max(0.2,Math.min((W-24)/(maxX-minX),(H-24)/(maxY-minY)));
  V.zoom=z; const q=[P(V,b.x0,b.y1,0),P(V,b.x1,b.y0,0),P(V,b.x0,b.y0,3),P(V,b.x1,b.y1,0)];
  const mnX=Math.min(...q.map(p=>p[0])),mxX=Math.max(...q.map(p=>p[0])),mnY=Math.min(...q.map(p=>p[1])),mxY=Math.max(...q.map(p=>p[1]));
  V.px=(W-(mxX-mnX))/2-mnX; V.py=(H-(mxY-mnY))/2-mnY;
}
function poly(c,pts,fill,stroke){
  c.beginPath(); c.moveTo(pts[0][0],pts[0][1]); for(let i=1;i<pts.length;i++) c.lineTo(pts[i][0],pts[i][1]); c.closePath();
  if(fill){ c.fillStyle=fill; c.fill(); } if(stroke){ c.strokeStyle=stroke; c.stroke(); }
}
function box(c,V,x,y,w,h,z0,z1,col){
  if(V.mode==='flat'){ const p=P(V,x,y), s=12*V.zoom; c.fillStyle=col; c.fillRect(p[0],p[1],w*s,h*s); return; }
  const p0=P(V,x,y,z1),p1=P(V,x+w,y,z1),p2=P(V,x+w,y+h,z1),p3=P(V,x,y+h,z1);
  const q1=P(V,x+w,y,z0),q2=P(V,x+w,y+h,z0),q3=P(V,x,y+h,z0);
  poly(c,[p1,p2,q2,q1],shade(col,.6));
  poly(c,[p3,p2,q2,q3],shade(col,.8));
  poly(c,[p0,p1,p2,p3],shade(col,1.12));
}
function diamond(c,V,x,y,w,h,fill,stroke){
  if(V.mode==='flat'){ const p=P(V,x,y),s=12*V.zoom; if(fill){c.fillStyle=fill;c.fillRect(p[0],p[1],w*s,h*s);} if(stroke){c.strokeStyle=stroke;c.strokeRect(p[0],p[1],w*s,h*s);} return; }
  poly(c,[P(V,x,y),P(V,x+w,y),P(V,x+w,y+h),P(V,x,y+h)],fill,stroke);
}
function pill(c,txt,cx,cy,bg,fg,size){
  c.font='700 '+size+'px system-ui,sans-serif'; const w=c.measureText(txt).width+size*.9, h=size*1.55;
  c.fillStyle=bg; c.beginPath(); if(c.roundRect) c.roundRect(cx-w/2,cy-h/2,w,h,h/2); else c.rect(cx-w/2,cy-h/2,w,h); c.fill();
  c.fillStyle=fg; c.textAlign='center'; c.textBaseline='middle'; c.fillText(txt,cx,cy+.5);
}
function drawPiece(c,V,cfg,it,alpha,col2){
  const d=cfg.pieces[it.type], st=STYLE[it.type], ps=parts(it,d), [w,h]=dims(d,it.rot), x=it.x, y=it.y;
  c.globalAlpha=alpha;
  if(d.kind==='motor'){
    const th=0.4;
    for(const p of ps) box(c,V,p.x+.04,p.y+.04,.92,.92,0,th,p.role==='blue'?'#2f7fe0':'#2fae5a');
    const b=ps.find(p=>p.role==='blue'), g=ps.find(p=>p.role==='green');
    const A=P(V,b.x+.5,b.y+.5,th), B=P(V,g.x+.5,g.y+.5,th);
    const dx=B[0]-A[0], dy=B[1]-A[1], L=Math.hypot(dx,dy)||1, ux=dx/L, uy=dy/L, k=V.zoom*(V.mode==='flat'?7:7);
    const cx=(A[0]+B[0])/2, cy=(A[1]+B[1])/2;
    c.fillStyle='#fff'; c.beginPath(); c.moveTo(cx+ux*k,cy+uy*k); c.lineTo(cx-ux*k-uy*k*.8,cy-uy*k+ux*k*.8); c.lineTo(cx-ux*k+uy*k*.8,cy-uy*k-ux*k*.8); c.closePath(); c.fill();
  } else if(d.kind==='conn'){
    box(c,V,x+.12,y+.12,.76,.76,0,.28,st.c);
    box(c,V,x+.3,y+.3,.4,.4,.28,.34,'#fff3c4');
  } else if(d.kind==='machine'){
    if(it.type==='M1'){ // RM Processor: body with a hopper
      box(c,V,x,y,w,h,0,1.0,st.c); box(c,V,x+.15,y+.15,w-.3,h-.3,1.0,1.15,shade(st.c,.75));
      box(c,V,x+.25,y+.25,w*.45,h*.45,1.15,1.9,shade(st.c,1.25)); box(c,V,x+w-.65,y+h-.65,.45,.45,1.0,1.4,'#ffd34d');
    } else if(it.type==='M2'){ // Assembler
      box(c,V,x,y,w,h,0,1.4,st.c); box(c,V,x+.4,y+.4,w-.8,h-.8,1.4,1.7,shade(st.c,.72));
      box(c,V,x+.15,y+.15,.7,.7,1.4,2.2,'#8a949c'); box(c,V,x+w-.85,y+.15,.7,.7,1.4,1.9,'#8a949c');
    } else if(it.type==='M3'){ // Robo Welder
      box(c,V,x,y,w,h,0,1.2,st.c);
      box(c,V,x+w/2-.4,y+h/2-.4,.8,.8,1.2,2.3,'#9aa7b2');
      if(w>=h) box(c,V,x+.5,y+h/2-.22,w-1,.44,2.1,2.4,'#c3ccd4'); else box(c,V,x+w/2-.22,y+.5,.44,h-1,2.1,2.4,'#c3ccd4');
      box(c,V,x+.3,y+.3,.5,.5,1.2,1.5,'#ffd34d');
    } else { // Packer: body with cartons
      box(c,V,x,y,w,h,0,.9,st.c); box(c,V,x+.15,y+.15,w-.3,h-.3,.9,1.0,shade(st.c,.75));
      box(c,V,x+.2,y+.2,.7,.7,1.0,1.45,'#e8d9b5'); box(c,V,x+w-.9,y+h-.9,.7,.7,1.0,1.25,'#e8d9b5');
    }
  } else if(d.kind==='store'){
    if(it.type==='SL'){
      box(c,V,x,y,w,h,0,1.3,st.c); box(c,V,x-.15,y-.15,w+.3,h+.3,1.3,1.6,'#8e5d3b');
      box(c,V,x+w/2-.8,y+h-.02,1.6,.04,0,.9,'#4b3a2a');
    } else if(it.type==='SM'){
      box(c,V,x,y,w,h,0,1.05,st.c); box(c,V,x+.1,y+.1,w-.2,h-.2,1.05,1.18,shade(st.c,1.15));
      if(w>=h){ box(c,V,x+w/2-.12,y,.24,h,1.05,1.2,'#8e5d3b'); } else { box(c,V,x,y+h/2-.12,w,.24,1.05,1.2,'#8e5d3b'); }
    } else {
      box(c,V,x,y,w,h,0,.9,st.c); box(c,V,x+.1,y+.1,w-.2,h-.2,.9,1.0,shade(st.c,1.15));
      box(c,V,x+w/2-.12,y,.24,h,.9,1.02,'#8e5d3b');
    }
  }
  c.globalAlpha=1;
}
function depthKey(it,cfg){ const [w,h]=dims(cfg.pieces[it.type],it.rot); return (it.x+w)+(it.y+h); }
function obstacleHeight(x,y){ const n=(x*73856093^y*19349663)>>>0; return 0.9+(n%5)*0.12; }

function drawScene(c,V,W,H,S){
  c.setTransform(S.dpr||1,0,0,S.dpr||1,0,0);
  c.fillStyle='#120639'; c.fillRect(0,0,W,H);
  const rows=S.rows, cfg=S.cfg, flat=V.mode==='flat';
  const slab='#3a444b';
  // floor tiles and slab edges
  for(let y=0;y<N;y++) for(let x=0;x<N;x++){
    const ch=rows[y][x]; if(ch==='.') continue;
    if(!flat){
      if(y===N-1||rows[y+1][x]==='.') poly(c,[P(V,x,y+1),P(V,x+1,y+1),P(V,x+1,y+1,-.45),P(V,x,y+1,-.45)],shade(slab,.8));
      if(x===N-1||rows[y][x+1]==='.') poly(c,[P(V,x+1,y),P(V,x+1,y+1),P(V,x+1,y+1,-.45),P(V,x+1,y,-.45)],shade(slab,.6));
    }
  }
  for(let y=0;y<N;y++) for(let x=0;x<N;x++){
    const ch=rows[y][x]; if(ch==='.') continue;
    let col=((x+y)&1)?'#cdd2d4':'#c3c9cc';
    if(ch==='I') col=((x+y)&1)?'#f2b632':'#e5a826'; else if(ch==='O') col=((x+y)&1)?'#35c2ae':'#2cb09d';
    diamond(c,V,x,y,1,1,col,col);
  }
  if(S.reach){ // show unreachable-from-inbound nothing; reserved
  }
  // bay labels
  const bayLabel=(set,txt,bg)=>{ if(!set.length) return; let sx=0,sy=0; for(const i of set){ sx+=i%N+.5; sy+=Math.floor(i/N)+.5; } sx/=set.length; sy/=set.length; const p=P(V,sx,sy,.1); pill(c,txt,p[0],p[1],bg,'#fff',Math.max(9,11*V.zoom)); };
  bayLabel(S.ctx.inb,'IN','#a06d00'); bayLabel(S.ctx.out,'OUT','#13705f');
  // entities
  const ents=[];
  for(let y=0;y<N;y++) for(let x=0;x<N;x++) if(rows[y][x]==='#') ents.push({k:(x+1)+(y+1),o:[x,y]});
  S.items.forEach((it,i)=>ents.push({k:depthKey(it,cfg),it,i}));
  ents.sort((a,b)=>a.k-b.k);
  for(const e of ents){
    if(e.o){ const [x,y]=e.o, hz=obstacleHeight(x,y); box(c,V,x+.06,y+.06,.88,.88,0,flat?0:hz,'#5d6870'); if(flat){ c.fillStyle='#5d6870'; const p=P(V,x,y),s=12*V.zoom; c.fillRect(p[0],p[1],s,s);} }
    else drawPiece(c,V,cfg,e.it,1);
  }
  // selection outline
  const outline=(it,col)=>{ const d=cfg.pieces[it.type]; for(const p of parts(it,d)) diamond(c,V,p.x,p.y,1,1,null,col); };
  if(S.sel!=null){ const it=S.items.find(i=>i.id===S.sel); if(it){ c.lineWidth=2.5; outline(it,'#ffd34d'); c.lineWidth=1; } }
  // overlays: labels, badges, bars
  const z=V.zoom, fs=Math.max(8,10*z);
  S.items.forEach((it,k)=>{
    const d=cfg.pieces[it.type]; const [w,h]=dims(d,it.rot);
    if(d.kind==='machine'){
      const o=S.an.machineOut.get(k); const top={M1:1.9,M2:2.2,M3:2.4,M4:1.5}[it.type];
      const p=P(V,it.x+w/2,it.y+h/2,flat?0:top+.5);
      const boosted=o&&o.boost>0, live=!o||o.fed; pill(c,(live?'':'✕ ')+d.name+' · '+Math.round(o?o.out:d.out)+(boosted?' ▲':''),p[0],p[1],!live?'#a63a2b':boosted?'#1f7a43':'rgba(10,14,17,.82)','#fff',fs);
    } else if(d.kind==='store'){
      const f=S.an.fills.find(q=>q.k===k); const frac=f?f.fill/f.cap:0;
      const top=it.type==='SL'?1.6:it.type==='SM'?1.2:1.0; const p=P(V,it.x+w/2,it.y+h/2,flat?0:top+.5);
      const bw=Math.max(30,Math.min(54,w*10*z)), bh=Math.max(6,7*z);
      c.fillStyle='rgba(10,14,17,.88)'; c.fillRect(p[0]-bw/2-1.5,p[1]-bh/2-1.5,bw+3,bh+3);
      c.fillStyle='#2b353c'; c.fillRect(p[0]-bw/2,p[1]-bh/2,bw,bh);
      c.fillStyle=frac>=.999?'#3fd17f':'#4aa3ff'; c.fillRect(p[0]-bw/2,p[1]-bh/2,bw*frac,bh);
      if(z>=.55){ c.font='600 '+Math.max(8,9*z)+'px system-ui,sans-serif'; c.fillStyle='#fff'; c.textAlign='center'; c.textBaseline='bottom'; c.fillText(Math.round(f?f.fill:0)+'/'+d.cap,p[0],p[1]-bh/2-3); }
    }
  });
  // belt line being painted
  if(S.paintCells) for(const q of S.paintCells){ diamond(c,V,q.x,q.y,1,1,q.ok?'rgba(60,210,120,.55)':'rgba(240,80,60,.6)'); if(q.ok) drawPiece(c,V,cfg,{type:'BC',x:q.x,y:q.y,rot:0},.8); }
  // ghost
  const g=S.ghost;
  if(g){
    const d=cfg.pieces[g.item.type];
    for(const p of parts(g.item,d)) diamond(c,V,p.x,p.y,1,1,g.ok?'rgba(60,210,120,.55)':'rgba(240,80,60,.6)');
    drawPiece(c,V,cfg,g.item,.8);
    if(g.reason){ const [w,h]=dims(d,g.item.rot); const p=P(V,g.item.x+w/2,g.item.y,flat?0:3.2); pill(c,g.reason,p[0],p[1]-6,'#c93b2a','#fff',Math.max(10,11*z)); }
  }
}

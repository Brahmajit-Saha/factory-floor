/* ---------- Rendering: draws the floor and pieces on a 2D canvas context. No DOM. ---------- */
/* animations may be switched off by the player (the effects button) or by the phone's reduced-motion setting */
function fxEnabled(){ try{ return localStorage.getItem('ffFx')!=='0'&&!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches); }catch(e){ return true; } }
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
/* view angle: V.rot is 0..3 quarter turns (clockwise). rotXY/unrotXY turn grid points, rotCell/unrotCell turn whole cells. */
function rotXY(k,x,y){ return k===1?[N-y,x]:k===2?[N-x,N-y]:k===3?[y,N-x]:[x,y]; }
function unrotXY(k,u,v){ return k===1?[v,N-u]:k===2?[N-u,N-v]:k===3?[N-v,u]:[u,v]; }
function rotCell(k,x,y){ return k===1?[N-1-y,x]:k===2?[N-1-x,N-1-y]:k===3?[y,N-1-x]:[x,y]; }
function unrotCell(k,u,v){ return k===1?[v,N-1-u]:k===2?[N-1-u,N-1-v]:k===3?[N-1-v,u]:[u,v]; }
function P(V,x,y,z){
  z=(z||0)+(V.zo||0);
  if(V.rot){ const r=rotXY(V.rot,x,y); x=r[0]; y=r[1]; }
  if(V.mode==='flat'){ const s=12*V.zoom; return [V.px+x*s,V.py+y*s]; }
  const a=16*V.zoom,b=8*V.zoom; return [V.px+(x-y)*a, V.py+(x+y)*b-z*12*V.zoom];
}
function unP(V,sx,sy){
  let g;
  if(V.mode==='flat'){ const s=12*V.zoom; g=[(sx-V.px)/s,(sy-V.py)/s]; }
  else { const a=16*V.zoom,b=8*V.zoom,u=(sx-V.px)/a,v=(sy-V.py)/b; g=[(u+v)/2,(v-u)/2]; }
  return V.rot?unrotXY(V.rot,g[0],g[1]):g;
}
function floorBounds(rows){
  let x0=N,y0=N,x1=-1,y1=-1;
  for(let y=0;y<N;y++) for(let x=0;x<N;x++) if(rows[y][x]!=='.'){ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
  return {x0,y0,x1:x1+1,y1:y1+1};
}
function fitView(V,rows,W,H){
  const b=floorBounds(rows); V.zoom=1; V.px=0; V.py=0;
  const corners=[[b.x0,b.y0],[b.x1,b.y0],[b.x0,b.y1],[b.x1,b.y1]], pts=[]; for(const [cx,cy] of corners){ pts.push(P(V,cx,cy,0)); pts.push(P(V,cx,cy,3)); }
  const minX=Math.min(...pts.map(p=>p[0])),maxX=Math.max(...pts.map(p=>p[0])),minY=Math.min(...pts.map(p=>p[1])),maxY=Math.max(...pts.map(p=>p[1]));
  const z=Math.max(0.2,Math.min((W-24)/(maxX-minX),(H-24)/(maxY-minY)));
  V.zoom=z; const q=[]; for(const [cx,cy] of corners){ q.push(P(V,cx,cy,0)); q.push(P(V,cx,cy,3)); }
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
/* ---------- toy-factory models: chunky, bright, with moving parts while a run is live ---------- */
const TOY={M1:'#17b8a6',M2:'#ff8a3d',M3:'#3f8cff',M4:'#a46cf5',SS:'#f6e3b0',SM:'#f4c24d',SL:'#f7d774'};
const LAMP={run:'#3fe08f',wait:'#ffb23e',off:'#ff4d6d',ok:'#3fe08f'};
function cyl(c,V,cx,cy,r,z0,z1,col){
  if(V.mode==='flat'){ const p=P(V,cx,cy), s=12*V.zoom; c.fillStyle=col; c.beginPath(); c.arc(p[0],p[1],r*s,0,6.2832); c.fill(); return; }
  const t=P(V,cx,cy,z1), b=P(V,cx,cy,z0), rx=r*22.63*V.zoom, ry=r*11.31*V.zoom;
  const g=c.createLinearGradient(t[0]-rx,0,t[0]+rx,0); g.addColorStop(0,shade(col,.92)); g.addColorStop(.4,shade(col,1.1)); g.addColorStop(1,shade(col,.58));
  c.fillStyle=g; c.beginPath(); c.moveTo(t[0]-rx,t[1]); c.lineTo(b[0]-rx,b[1]); c.ellipse(b[0],b[1],rx,ry,0,Math.PI,0,true); c.lineTo(t[0]+rx,t[1]); c.closePath(); c.fill();
  c.fillStyle=shade(col,1.18); c.beginPath(); c.ellipse(t[0],t[1],rx,ry,0,0,6.2832); c.fill();
}
function dome(c,V,cx,cy,r,z,col){
  if(V.mode==='flat') return; const t=P(V,cx,cy,z), rx=r*22.63*V.zoom, ry=r*11.31*V.zoom;
  const g=c.createLinearGradient(t[0]-rx,0,t[0]+rx,0); g.addColorStop(0,shade(col,1.0)); g.addColorStop(.4,shade(col,1.2)); g.addColorStop(1,shade(col,.7));
  c.fillStyle=g; c.beginPath(); c.ellipse(t[0],t[1],rx,rx*.8,0,Math.PI,0); c.ellipse(t[0],t[1],rx,ry,0,0,Math.PI); c.closePath(); c.fill();
}
function gearAt(c,V,cx,cy,z,r,teeth,rot,col){
  const pts=[]; for(let i=0;i<teeth*2;i++){ const a=rot+i*Math.PI/teeth, rr=(i&1)?r*.68:r; pts.push(P(V,cx+Math.cos(a)*rr,cy+Math.sin(a)*rr,z)); }
  poly(c,pts,col,shade(col,.6)); const h=P(V,cx,cy,z+.02), q=Math.max(1.5,r*8*V.zoom); c.fillStyle='#31404a'; c.beginPath(); c.arc(h[0],h[1],q,0,6.2832); c.fill();
}
function rotRect(c,V,cx,cy,z,len,wid,ang,col){
  const ca=Math.cos(ang), sa=Math.sin(ang), pt=(a,b)=>P(V,cx+ca*a-sa*b,cy+sa*a+ca*b,z);
  poly(c,[pt(-len,-wid),pt(len,-wid),pt(len,wid),pt(-len,wid)],col,shade(col,.6));
}
function fyFace(c,V,y,x0,x1,z0,z1,col){ if(V.mode==='flat') return; poly(c,[P(V,x0,y,z1),P(V,x1,y,z1),P(V,x1,y,z0),P(V,x0,y,z0)],col); }
function fxFace(c,V,x,y0,y1,z0,z1,col){ if(V.mode==='flat') return; poly(c,[P(V,x,y0,z1),P(V,x,y1,z1),P(V,x,y1,z0),P(V,x,y0,z0)],col); }
function lamp(c,V,x,y,z,st,t,on){
  const col=LAMP[st]||LAMP.ok; cyl(c,V,x,y,.15,z,z+.22,'#2d363e');
  if(V.mode==='flat'){ return; } const q=P(V,x,y,z+.3), r=Math.max(2,4.4*V.zoom);
  const pulse=on&&st==='run'?.65+.35*Math.sin(t*6):(on&&st==='wait'?(Math.sin(t*3)>0?1:.45):1);
  c.globalAlpha=.28*pulse; c.fillStyle=col; c.beginPath(); c.arc(q[0],q[1],r*2.2,0,6.2832); c.fill(); c.globalAlpha=1;
  c.fillStyle=col; c.beginPath(); c.arc(q[0],q[1],r,0,6.2832); c.fill(); c.fillStyle='rgba(255,255,255,.7)'; c.beginPath(); c.arc(q[0]-r*.3,q[1]-r*.3,r*.35,0,6.2832); c.fill();
}
function spark(c,V,x,y,z,t){
  const q=P(V,x,y,z), r=(5+3*Math.abs(Math.sin(t*37)))*V.zoom, k=Math.sin(t*23)>-.2; if(!k||V.mode==='flat') return;
  c.fillStyle='#fff7b0'; c.beginPath(); for(let i=0;i<8;i++){ const a=i*Math.PI/4+t*9, rr=(i&1)?r*.4:r; c.lineTo(q[0]+Math.cos(a)*rr,q[1]+Math.sin(a)*rr); } c.closePath(); c.fill();
  c.fillStyle='#ffb02e'; c.beginPath(); c.arc(q[0],q[1],r*.38,0,6.2832); c.fill();
}
function gable(c,V,x,y,w,h,z0,zr,col){ /* roof whose ridge runs along the longer side */
  if(V.mode==='flat'){ const p=P(V,x,y),s=12*V.zoom; c.fillStyle=col; c.fillRect(p[0],p[1],w*s,h*s); return; }
  if(w>=h){ const ym=y+h/2;
    poly(c,[P(V,x,y,z0),P(V,x+w,y,z0),P(V,x+w,ym,zr),P(V,x,ym,zr)],shade(col,1.12));
    poly(c,[P(V,x+w,y,z0),P(V,x+w,y+h,z0),P(V,x+w,ym,zr)],shade(col,.62));
    poly(c,[P(V,x,y+h,z0),P(V,x+w,y+h,z0),P(V,x+w,ym,zr),P(V,x,ym,zr)],shade(col,.86));
  } else { const xm=x+w/2;
    poly(c,[P(V,x,y,z0),P(V,x,y+h,z0),P(V,xm,y+h,zr),P(V,xm,y,zr)],shade(col,1.12));
    poly(c,[P(V,x,y+h,z0),P(V,x+w,y+h,z0),P(V,xm,y+h,zr)],shade(col,.78));
    poly(c,[P(V,x+w,y,z0),P(V,x+w,y+h,z0),P(V,xm,y+h,zr),P(V,xm,y,zr)],shade(col,.62));
  }
}
function wheel(c,V,wx,wy,wz,r,rot){
  if(V.mode==='flat') return; const pts=[]; for(let i=0;i<12;i++){ const a=i*Math.PI/6; pts.push(P(V,wx+Math.cos(a)*r,wy,wz+Math.sin(a)*r)); } poly(c,pts,'#1b2127','#434d56');
  const h=P(V,wx,wy,wz), q=Math.max(2,r*9*V.zoom); c.fillStyle='#cfd6dc'; c.beginPath(); c.arc(h[0],h[1],q,0,6.2832); c.fill();
  c.strokeStyle='#6a747d'; c.lineWidth=Math.max(1,V.zoom); const a=rot||0, e=P(V,wx+Math.cos(a)*r*.7,wy,wz+Math.sin(a)*r*.7); c.beginPath(); c.moveTo(h[0],h[1]); c.lineTo(e[0],e[1]); c.stroke(); c.lineWidth=1;
}
/* FX: {t, run, on, st:'run'|'wait'|'off'|'ok', flow:[dx,dy]|null, fill:{fr,fg}|null} */
function drawPiece(c,V,cfg,it,alpha,col2,FX){
  const d=cfg.pieces[it.type], ps=parts(it,d), [w,h]=dims(d,it.rot), x=it.x, y=it.y, t=FX?FX.t:0, A=!!(FX&&FX.run&&FX.on), st=FX&&FX.st||'ok';
  const ax=w>=h, L=ax?w:h, Wd=ax?h:w, bx=(u,v,a,b,z0,z1,col)=>ax?box(c,V,x+u,y+v,a,b,z0,z1,col):box(c,V,x+v,y+u,b,a,z0,z1,col), pu=(u,v)=>ax?[x+u,y+v]:[x+v,y+u];
  c.globalAlpha=alpha;
  if(d.kind==='motor'){ // drive unit: dark base, blue IN end, green OUT end, a roller with stripes and a big arrow blue -> green
    const bl=ps.find(p=>p.role==='blue'), gr=ps.find(p=>p.role==='green'), horiz=bl.y===gr.y, hx=Math.min(bl.x,gr.x), hy=Math.min(bl.y,gr.y), sgn=horiz?Math.sign(gr.x-bl.x):Math.sign(gr.y-bl.y);
    for(const p of ps) box(c,V,p.x+.03,p.y+.03,.94,.94,0,.22,'#2b333b');
    box(c,V,bl.x+.1,bl.y+.1,.8,.8,.22,.6,'#3f8cff'); box(c,V,gr.x+.1,gr.y+.1,.8,.8,.22,.6,'#33c46b');
    box(c,V,bl.x+.2,bl.y+.2,.6,.6,.6,.68,'#8fbaff'); box(c,V,gr.x+.2,gr.y+.2,.6,.6,.6,.68,'#8be0ab');
    box(c,V,horiz?hx+.45:hx+.3,horiz?hy+.3:hy+.45,horiz?1.1:.4,horiz?.4:1.1,.22,.52,'#c9d1d8');
    for(let k=0;k<3;k++){ let ph=(k/3+(A?t*.9:0))%1; if(sgn<0) ph=1-ph; const a=.45+ph*1.0; if(horiz) box(c,V,hx+a-.04,hy+.3,.08,.4,.52,.55,'#6d7882'); else box(c,V,hx+.3,hy+a-.04,.4,.08,.52,.55,'#6d7882'); }
    const ux=gr.x-bl.x, uy=gr.y-bl.y, mx=(bl.x+gr.x)/2+.5, my=(bl.y+gr.y)/2+.5, qx=-uy, qy=ux, z=.72;
    const pt=(a,b2)=>P(V,mx+ux*a+qx*b2,my+uy*a+qy*b2,z);
    c.lineWidth=Math.max(1,1.3*V.zoom); poly(c,[pt(-.62,.11),pt(.12,.11),pt(.12,.36),pt(.7,0),pt(.12,-.36),pt(.12,-.11),pt(-.62,-.11)],'#ffffff','#14202e'); c.lineWidth=1;
  } else if(d.kind==='conn'){ // conveyor piece: dark belt between yellow rails, cleats and crates that travel the way material flows
    const f=FX&&FX.flow, hz=!f||f[0]!==0, sg=f?(hz?f[0]:f[1]):1;
    box(c,V,x,y,1,1,0,.16,'#262d34');
    if(hz){ box(c,V,x,y+.1,1,.74+.06,.16,.22,'#3b444d'); box(c,V,x,y+.02,1,.12,.16,.36,'#ffcc33'); box(c,V,x,y+.86,1,.12,.16,.36,'#ffcc33'); }
    else { box(c,V,x+.1,y,.8,1,.16,.22,'#3b444d'); box(c,V,x+.02,y,.12,1,.16,.36,'#ffcc33'); box(c,V,x+.86,y,.12,1,.16,.36,'#ffcc33'); }
    for(let k=0;k<3;k++){ let ph=(k/3+(A?t*.7:0))%1; if(sg<0) ph=1-ph; const a=ph*.9+.04; if(hz) box(c,V,x+a,y+.16,.07,.68,.22,.245,'#58636d'); else box(c,V,x+.16,y+a,.68,.07,.22,.245,'#58636d'); }
    if(A&&f){ for(let k=0;k<2;k++){ let ph=(t*.55+k*.5)%1; if(sg<0) ph=1-ph; const a=ph*.62+.04, cc=((it.x*7+it.y*3+k)&1)?'#ff9f43':'#5aa7ff'; if(hz) box(c,V,x+a,y+.3,.3,.4,.24,.52,cc); else box(c,V,x+.3,y+a,.4,.3,.24,.52,cc); } }
  } else if(d.kind==='machine'){
    const col=TOY[it.type]; box(c,V,x-.05,y-.05,w+.1,h+.1,0,.2,shade(col,.62));
    if(it.type==='M1'){ // RM Processor: window, bobbing hopper with falling grains, pipe and a turning gear
      box(c,V,x,y,w,h,.2,1.1,col); box(c,V,x+.1,y+.1,w-.2,h-.2,1.1,1.22,shade(col,.8));
      fyFace(c,V,y+h,x+.28,x+w-.28,.45,.9,'#1b2a33'); fyFace(c,V,y+h,x+.36,x+w-.36,.52,.83,A?'#ffe08a':'#4a6573'); fxFace(c,V,x+w,y+.28,y+h-.28,.45,.9,'#1b2a33'); fxFace(c,V,x+w,y+.36,y+h-.36,.52,.83,A?'#ffe08a':'#4a6573');
      const sv=V.zo||0; V.zo=sv+(A?Math.sin(t*10)*.035:0); box(c,V,x+.4,y+.4,w-.8,h-.8,1.22,1.6,shade(col,1.08)); box(c,V,x+.22,y+.22,w-.44,h-.44,1.6,2.0,shade(col,1.18)); box(c,V,x+.34,y+.34,w-.68,h-.68,2.0,2.04,'#1b2a33'); V.zo=sv;
      if(A) for(let i=0;i<3;i++){ const p=(t*1.3+i/3)%1; box(c,V,x+w/2-.09+(i-1)*.2,y+h/2-.09+(1-i)*.1,.18,.18,3.0-p*1.0,3.18-p*1.0,'#ffd34d'); }
      cyl(c,V,x+w-.28,y+.3,.15,1.22,2.1,'#d4dce3'); gearAt(c,V,x+.42,y+h-.42,1.24,.3,8,A?t*2.2:0,'#ffd34d'); lamp(c,V,x+w-.3,y+h-.3,1.22,st,t,A);
    } else if(it.type==='M2'){ // Assembler: turntable with a sweeping arm, two pistons
      box(c,V,x,y,w,h,.2,1.35,col); box(c,V,x+.14,y+.14,w-.28,h-.28,1.35,1.46,shade(col,.8));
      fyFace(c,V,y+h,x+.3,x+1.1,.45,.95,'#1b2a33'); fyFace(c,V,y+h,x+.38,x+1.02,.52,.88,A?'#ffe08a':'#4a6573'); fxFace(c,V,x+w,y+.3,y+1.1,.45,.95,'#1b2a33'); fxFace(c,V,x+w,y+.38,y+1.02,.52,.88,A?'#ffe08a':'#4a6573');
      const cx=x+w/2, cy=y+h/2; for(const [px,py,k] of [[x+.42,y+.42,0],[x+w-.42,y+.42,1]]){ cyl(c,V,px,py,.2,1.46,2.0,'#cfd8df'); const ext=A?.25+.3*(1+Math.sin(t*5+k*Math.PI)):.3; cyl(c,V,px,py,.1,2.0,2.0+ext,'#46525c'); }
      cyl(c,V,cx,cy,.95,1.46,1.62,'#8e99a3'); const ang=A?t*1.7:.7; rotRect(c,V,cx,cy,1.64,.78,.16,ang,'#e9eef2'); const ex=cx+Math.cos(ang)*.78, ey=cy+Math.sin(ang)*.78; box(c,V,ex-.16,ey-.16,.32,.32,1.64,1.98,'#ffd34d');
      cyl(c,V,cx,cy,.18,1.62,1.82,'#46525c'); lamp(c,V,x+w-.3,y+h-.3,1.46,st,t,A);
    } else if(it.type==='M3'){ // Robo Welder: gantry with a carriage that slides along the rail and throws sparks
      box(c,V,x,y,w,h,.2,1.2,col); box(c,V,x+.14,y+.14,w-.28,h-.28,1.2,1.3,shade(col,.8));
      if(ax){ fyFace(c,V,y+h,x+.4,x+1.3,.42,.9,'#1b2a33'); fyFace(c,V,y+h,x+.48,x+1.22,.5,.82,A?'#ffe08a':'#4a6573'); } else { fxFace(c,V,x+w,y+.4,y+1.3,.42,.9,'#1b2a33'); fxFace(c,V,x+w,y+.48,y+1.22,.5,.82,A?'#ffe08a':'#4a6573'); }
      bx(.9,Wd/2-.45,L-1.8,.9,1.3,1.45,'#2e3a44'); bx(.95,Wd/2-.38,L-1.9,.76,1.45,1.5,'#6c7a86');
      bx(.3,Wd/2-.18,.34,.36,1.3,2.5,'#dfe6ee'); bx(L-.64,Wd/2-.18,.34,.36,1.3,2.5,'#dfe6ee'); bx(.3,Wd/2-.17,L-.6,.34,2.5,2.78,'#ffd34d');
      const u=.55+(L-1.7)*(A?.5+.5*Math.sin(t*1.7):.5); bx(u,Wd/2-.3,.62,.6,2.02,2.5,'#f3f6f9'); bx(u+.2,Wd/2-.09,.22,.18,1.55,2.02,'#9aa7b2');
      if(A){ const q=pu(u+.31,Wd/2); spark(c,V,q[0],q[1],1.55,t); }
      const lp=pu(L-.32,Wd-.32); lamp(c,V,lp[0],lp[1],1.3,st,t,A);
    } else { // Packer: cartons slide along the deck and a press stamps them
      box(c,V,x,y,w,h,.2,1.0,col); box(c,V,x+.1,y+.1,w-.2,h-.2,1.0,1.1,shade(col,.8));
      bx(.12,Wd/2-.3,L-.24,.6,1.1,1.17,'#2d363e'); const p=A?(t*.7)%1:.3; bx(.15+p*(L-.85),Wd/2-.23,.55,.46,1.17,1.55,'#f0dcab'); bx(.15+p*(L-.85)+.2,Wd/2-.23,.12,.46,1.55,1.58,'#d1b36f');
      const dz=A?Math.abs(Math.sin(t*3.4))*.3:.15; bx(.2,.12,.14,.14,1.1,2.1,'#cfd8df'); bx(.2,Wd-.26,.14,.14,1.1,2.1,'#cfd8df'); bx(L/2-.18,.1,.5,Wd-.2,2.0-dz,2.12-dz,shade(col,1.35));
      if(ax){ fyFace(c,V,y+h,x+.35,x+.95,.4,.78,'#1b2a33'); fxFace(c,V,x+w,y+.35,y+h-.35,.4,.78,'#1b2a33'); } else { fxFace(c,V,x+w,y+.35,y+.95,.4,.78,'#1b2a33'); fyFace(c,V,y+h,x+.35,x+w-.35,.4,.78,'#1b2a33'); }
      const lp=pu(L-.3,Wd-.3); lamp(c,V,lp[0],lp[1],1.1,st,t,A);
    }
  } else if(d.kind==='store'){
    const fl=FX&&FX.fill, fr=fl?fl.fr:0, fg=fl?fl.fg:0;
    box(c,V,x-.05,y-.05,w+.1,h+.1,0,.16,'#7d6a4a');
    const gauge=(zb,zh)=>{ // level window on the long side facing the viewer: blue raw material, green finished goods
      const gx0=x+w-1.35, gx1=x+w-.55; fyFace(c,V,y+h,gx0-.06,gx1+.06,zb-.06,zb+zh+.06,'#2b3036'); fyFace(c,V,y+h,gx0,gx1,zb,zb+zh,'#10151a');
      if(fr>0) fyFace(c,V,y+h,gx0,gx1,zb,zb+zh*fr,'#4aa3ff'); if(fg>0) fyFace(c,V,y+h,gx0,gx1,zb+zh*fr,zb+zh*(fr+fg),'#3fd17f'); };
    if(it.type==='SS'){ // tank with a dome and a level tube
      const r=Math.min(w,h)/2-.12, cx=x+w/2, cy=y+h/2; cyl(c,V,cx,cy,r,.16,1.4,'#f6e3b0'); cyl(c,V,cx,cy,r+.04,.55,.7,'#e4572e'); dome(c,V,cx,cy,r,1.4,'#e4572e'); cyl(c,V,cx,cy,.14,1.4+r*.7,1.4+r*.7+.2,'#8a949c');
      box(c,V,x+w-.5,y+h-.5,.32,.32,.16,1.4,'#2b3036'); box(c,V,x+w-.44,y+h-.44,.2,.2,.2,1.36,'#10151a'); if(fr>0) box(c,V,x+w-.44,y+h-.44,.2,.2,.2,.2+1.16*fr,'#4aa3ff'); if(fg>0) box(c,V,x+w-.44,y+h-.44,.2,.2,.2+1.16*fr,.2+1.16*(fr+fg),'#3fd17f');
    } else if(it.type==='SM'){ // warehouse with a gabled roof, a door and a level window
      box(c,V,x,y,w,h,.16,1.3,'#f4c24d'); gable(c,V,x-.1,y-.1,w+.2,h+.2,1.3,2.0,'#e4572e'); fyFace(c,V,y+h,x+.4,x+1.5,.16,1.0,'#6b3a22'); for(let k=0;k<5;k++) fyFace(c,V,y+h,x+.4,x+1.5,.3+k*.16,.33+k*.16,'#8e5d3b'); gauge(.35,.7);
      if(A&&fg+fr>0){ const q=P(V,x+w-.4,y+h-.4,2.2); c.fillStyle='#fff'; c.globalAlpha=.6+.4*Math.sin(t*5); c.beginPath(); c.arc(q[0],q[1],2.4*V.zoom,0,6.2832); c.fill(); c.globalAlpha=alpha; }
    } else { // large hangar: tall roof, two doors, vents
      box(c,V,x,y,w,h,.16,1.7,'#f7d774'); gable(c,V,x-.12,y-.12,w+.24,h+.24,1.7,2.6,'#d7263d'); for(const dx of [.5,2.1]){ fyFace(c,V,y+h,x+dx,x+dx+1.3,.16,1.2,'#6b3a22'); for(let k=0;k<6;k++) fyFace(c,V,y+h,x+dx,x+dx+1.3,.3+k*.16,.33+k*.16,'#8e5d3b'); }
      gauge(.4,.95); cyl(c,V,x+1,y+1,.22,2.1,2.6,'#cfd8df'); cyl(c,V,x+w-1,y+1,.22,2.1,2.6,'#cfd8df'); const bq=P(V,x+w/2,y+h/2,2.8); if(V.mode!=='flat'){ c.fillStyle=A&&Math.sin(t*6)>0?'#ff4d6d':'#7a2433'; c.beginPath(); c.arc(bq[0],bq[1],3.4*V.zoom,0,6.2832); c.fill(); }
    }
  }
  c.globalAlpha=1;
}
/* IN / OUT tags on the two ends of a motor */
function motorTags(c,V,cfg,it,alpha){
  const d=cfg.pieces[it.type]; if(d.kind!=='motor') return; const z=V.zoom, fs=Math.max(7,8.5*z); c.globalAlpha=alpha==null?1:alpha;
  for(const p of parts(it,d)){ const q=P(V,p.x+.5,p.y+.5,V.mode==='flat'?0:1.0); pill(c,p.role==='blue'?'IN':'OUT',q[0],q[1],p.role==='blue'?'#1a56b0':'#177a3c','#fff',fs); }
  c.globalAlpha=1;
}
/* an arrow lying on the floor, pointing the way material moves; ph (0..1) slides it along so the flow looks alive */
function flowArrowAt(c,V,mx,my,dx,dy,ph,big){
  const qx=-dy, qy=dx, z=.36, sl=big?1:.8, off=((ph==null?.5:ph)-.5)*.5, al=ph==null?1:.45+.55*(1-Math.abs(2*ph-1));
  const pt=(a,b)=>P(V,mx+dx*(a*sl+off)+qx*b*sl,my+dy*(a*sl+off)+qy*b*sl,z);
  c.globalAlpha=al; c.lineWidth=Math.max(1,V.zoom); poly(c,[pt(-.32,.09),pt(.04,.09),pt(.04,.26),pt(.38,0),pt(.04,-.26),pt(.04,-.09),pt(-.32,-.09)],big?'#1f9d55':'#3b2aa8','#ffffff'); c.lineWidth=1; c.globalAlpha=1;
}
function flowArrow(c,V,x,y,dx,dy,ph){ flowArrowAt(c,V,x+.5,y+.5,dx,dy,ph,false); }
/* a toy delivery / shipping truck standing on a bay: cargo box with a stripe, cab with a windshield, wheels, headlights */
function truck(c,V,cx,cy,col,text,bg,FX){
  const t=FX?FX.t:0, on=!!(FX&&FX.on), sv=V.zo||0; V.zo=sv+(on?Math.sin(t*15)*.02:0);
  box(c,V,cx-1.2,cy-.58,2.4,1.16,.2,.34,'#222a31');
  box(c,V,cx-1.2,cy-.58,1.6,1.16,.34,1.4,col); box(c,V,cx-1.22,cy-.6,1.64,1.2,.7,.95,'#ffffff'); box(c,V,cx-1.24,cy-.62,1.68,1.24,.74,.9,shade(col,.8));
  box(c,V,cx+.4,cy-.54,.8,1.08,.34,1.0,shade(col,.8)); box(c,V,cx+.45,cy-.5,.5,1.0,1.0,1.08,shade(col,1.2));
  fxFace(c,V,cx+1.2,cy-.42,cy+.42,.6,.95,'#bfe6ff'); fxFace(c,V,cx+1.2,cy-.46,cy-.2,.36,.5,'#ffe27a'); fxFace(c,V,cx+1.2,cy+.2,cy+.46,.36,.5,'#ffe27a');
  const sp=on?-t*9:0; wheel(c,V,cx-.7,cy+.58,.3,.26,sp); wheel(c,V,cx+.75,cy+.58,.3,.26,sp);
  if(on&&V.mode!=='flat'){ for(let i=0;i<3;i++){ const ph=(t*.8+i/3)%1, q=P(V,cx-1.3-ph*.3,cy,.5+ph*1.3); c.globalAlpha=.4*(1-ph); c.fillStyle='#cfd6dc'; c.beginPath(); c.arc(q[0],q[1],(2+ph*5)*V.zoom,0,6.2832); c.fill(); } c.globalAlpha=1; }
  const q=P(V,cx,cy,V.mode==='flat'?0:2.2); pill(c,text,q[0],q[1],bg,'#fff',Math.max(9,11*V.zoom)); V.zo=sv;
}
function depthKey(it,cfg){ const [w,h]=dims(cfg.pieces[it.type],it.rot); return (it.x+w)+(it.y+h); }
function obstacleHeight(x,y){ const n=(x*73856093^y*19349663)>>>0; return 0.9+(n%5)*0.12; }

/* the scene as seen after V.rot quarter turns, so the drawing code below only ever draws one orientation */
function rotateScene(S,k){
  const g=[]; for(let v=0;v<N;v++) g.push(new Array(N).fill('.'));
  for(let y=0;y<N;y++) for(let x=0;x<N;x++){ const ch=S.rows[y][x]; if(ch==='.') continue; const r=rotCell(k,x,y); g[r[1]][r[0]]=ch; }
  const mapIdx=i=>{ const r=rotCell(k,i%N,Math.floor(i/N)); return r[1]*N+r[0]; };
  const mapItem=it=>{ const d=S.cfg.pieces[it.type], [w,h]=dims(d,it.rot), a=rotXY(k,it.x,it.y), b=rotXY(k,it.x+w,it.y+h); return Object.assign({},it,{x:Math.min(a[0],b[0]),y:Math.min(a[1],b[1]),rot:(it.rot+k)%4}); };
  const rv=(dx,dy)=>k===1?[-dy,dx]:k===2?[-dx,-dy]:k===3?[dy,-dx]:[dx,dy];
  let arV=null; if(S.an&&S.an.arrows) arV=S.an.arrows.map(q=>({a:rotCell(k,q.a[0],q.a[1]),b:rotCell(k,q.b[0],q.b[1])}));
  let fl=null; if(S.an&&S.an.flows){ fl=new Map(); for(const [i,dv] of S.an.flows) fl.set(mapIdx(i),rv(dv[0],dv[1])); }
  return Object.assign({},S,{rows:g.map(r=>r.join('')),items:S.items.map(mapItem),ctx:{inb:S.ctx.inb.map(mapIdx),out:S.ctx.out.map(mapIdx)},
    paintCells:S.paintCells?S.paintCells.map(q=>{ const r=rotCell(k,q.x,q.y); return {x:r[0],y:r[1],ok:q.ok}; }):null,
    ghost:S.ghost?Object.assign({},S.ghost,{item:mapItem(S.ghost.item)}):null, flowsV:fl,arrowsV:arV,
    puffs:S.puffs?S.puffs.map(q=>{ const a=rotXY(k,q.x,q.y), b=rotXY(k,q.x+q.w,q.y+q.h); return {x:Math.min(a[0],b[0]),y:Math.min(a[1],b[1]),w:Math.abs(b[0]-a[0]),h:Math.abs(b[1]-a[1]),t0:q.t0}; }):null,
    hOf:(u,v)=>{ const r=unrotCell(k,u,v); return obstacleHeight(r[0],r[1]); }});
}
function drawScene(c,V,W,H,S){
  if(V.rot) return drawScene(c,Object.assign({},V,{rot:0}),W,H,rotateScene(S,V.rot));
  c.setTransform(S.dpr||1,0,0,S.dpr||1,0,0);
  c.fillStyle='#120639'; c.fillRect(0,0,W,H);
  const rows=S.rows, cfg=S.cfg, flat=V.mode==='flat', T=S.t||0, fxOn=!!S.fx, runOn=fxOn&&!!S.run;
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
  // loading bays: bumper along the outer edge and chevrons showing which way goods move (they slide while a run is live)
  if(!flat) for(let y=0;y<N;y++) for(let x=0;x<N;x++){ const ch=rows[y][x]; if(ch!=='I'&&ch!=='O') continue;
    for(const [dx,dy] of D4){ const nx=x+dx, ny=y+dy; if(!(nx<0||ny<0||nx>=N||ny>=N)&&rows[ny][nx]!=='.') continue;
      const th=.18, bxx=dx>0?x+1-th:x, byy=dy>0?y+1-th:y, bw=dx?th:1, bh=dy?th:1; box(c,V,bxx,byy,bw,bh,0,.3,'#2b2f36'); box(c,V,bxx+(dx?0:.1),byy+(dy?0:.1),dx?th:.8,dy?th:.8,.3,.34,((x+y)&1)?'#ffd23f':'#ffffff');
      const ph=runOn?(T*.7)%1:.5, ia=-dx, ib=-dy, off=(ph-.5)*.5, al=runOn?.35+.65*(1-Math.abs(2*ph-1)):.85, mx=x+.5+ia*off, my=y+.5+ib*off, qx=-ib, qy=ia, pt=(a,b)=>P(V,mx+ia*a+qx*b,my+ib*a+qy*b,.03);
      c.globalAlpha=al; poly(c,[pt(-.3,-.34),pt(0,-.34),pt(.3,0),pt(0,.34),pt(-.3,.34),pt(0,0)],ch==='I'?'#fff3c2':'#ffffff'); c.globalAlpha=1; } }
  // bay labels
  const bayLabel=(set,txt,bg)=>{ if(!set.length) return; let sx=0,sy=0; for(const i of set){ sx+=i%N+.5; sy+=Math.floor(i/N)+.5; } sx/=set.length; sy/=set.length; const p=P(V,sx,sy,.1); pill(c,txt,p[0],p[1],bg,'#fff',Math.max(9,11*V.zoom)); };
  bayLabel(S.ctx.inb,'IN','#a06d00'); bayLabel(S.ctx.out,'OUT','#13705f');
  // entities
  const flows=S.flowsV||(S.an&&S.an.flows)||null;
  const ents=[];
  for(let y=0;y<N;y++) for(let x=0;x<N;x++) if(rows[y][x]==='#') ents.push({k:(x+1)+(y+1),o:[x,y]});
  S.items.forEach((it,i)=>ents.push({k:depthKey(it,cfg),it,i}));
  ents.sort((a,b)=>a.k-b.k);
  for(const e of ents){
    if(e.o){ const [x,y]=e.o, hz=(S.hOf||obstacleHeight)(x,y); box(c,V,x+.06,y+.06,.88,.88,0,flat?0:hz,'#5d6870'); if(flat){ c.fillStyle='#5d6870'; const p=P(V,x,y),s=12*V.zoom; c.fillRect(p[0],p[1],s,s);} }
    else { const it=e.it, d=cfg.pieces[it.type], fo={t:T,run:runOn,on:fxOn,st:'ok',flow:null,fill:null};
      if(d.kind==='machine'){ const mo=S.an&&S.an.machineOut&&S.an.machineOut.get(e.i); if(mo) fo.st=!mo.fed?'off':(runOn?((S.play&&S.play.f&&S.play.f.run)?'run':'wait'):'ok'); }
      else if(d.kind==='conn'){ fo.flow=flows?flows.get(it.y*N+it.x)||null:null; }
      else if(d.kind==='store'&&S.an&&S.an.sim&&S.play&&S.play.f){ const gm=S.an.groupOf&&S.an.groupOf.get(e.i), rep=gm!=null?gm:e.i, si=S.an.sim.ks.indexOf(rep), grp=gm!=null?S.an.groups.find(q=>q.rep===rep):null, capT=grp?grp.cap:d.cap;
        if(si>=0&&capT>0){ const rmv=S.play.f.rm[si], fgv=S.play.f.fg[si], fr=Math.min(1,rmv/capT); fo.fill={fr,fg:Math.min(1-fr,fgv/capT)}; } }
      const born=fxOn&&S.born?S.born.get(it.id):null; let drop=0; if(born!=null){ const a=(T-born)/.55; if(a>=0&&a<1){ drop=a<.6?2.4*Math.pow(1-a/.6,2):.22*Math.sin((a-.6)/.4*Math.PI);
          if(!flat&&drop>.02){ c.globalAlpha=.28; for(const p of parts(it,d)) diamond(c,V,p.x,p.y,1,1,'#000'); c.globalAlpha=1; } } }
      if(!flat) V.zo=drop; drawPiece(c,V,cfg,it,1,null,fo); V.zo=0;
      if(it.type==='BC'&&flows&&!runOn){ const f=flows.get(it.y*N+it.x); if(f) flowArrow(c,V,it.x,it.y,f[0],f[1],null); } }
  }
  // arrows where pieces hand material to each other (bay -> motor, motor -> machine, packer -> storage ...)
  const arr=S.arrowsV||(S.an&&S.an.arrows)||null;
  if(arr) for(const q of arr){ const ax=q.a[0]+.5, ay=q.a[1]+.5, bx=q.b[0]+.5, by=q.b[1]+.5, dx=bx-ax, dy=by-ay; flowArrowAt(c,V,(ax+bx)/2,(ay+by)/2,dx,dy,runOn?S.anim:null,true); }
  // belts that exceed the connection limit of a machine or storage unit: outlined in red
  if(S.an&&S.an.belts) for(const bt of S.an.belts) if(bt.over){ c.lineWidth=2; for(const k of bt.pieces){ const it=S.items[k]; if(!it) continue; for(const p of parts(it,cfg.pieces[it.type])) diamond(c,V,p.x,p.y,1,1,null,'#ff4b3a'); } c.lineWidth=1; }
  // selection outline
  const outline=(it,col)=>{ const d=cfg.pieces[it.type]; for(const p of parts(it,d)) diamond(c,V,p.x,p.y,1,1,null,col); };
  if(S.sel!=null){ const it=S.items.find(i=>i.id===S.sel); if(it){ c.lineWidth=2.5; outline(it,'#ffd34d'); c.lineWidth=1; } }
  // overlays: labels, badges, bars
  const z=V.zoom, fs=Math.max(8,10*z);
  S.items.forEach((it,k)=>{
    const d=cfg.pieces[it.type]; const [w,h]=dims(d,it.rot);
    if(d.kind==='store'){
      const gm=S.an.groupOf&&S.an.groupOf.get(k); if(gm!=null&&gm!==k) return; // merged units share one bar, drawn on the first of them
      const grp=gm!=null?S.an.groups.find(q=>q.rep===k):null, mem=grp?grp.members:[k];
      const si=S.an.sim?S.an.sim.ks.indexOf(k):-1, pf=S.play&&S.play.f; let rmv=0,fgv=0; if(pf&&si>=0){ rmv=pf.rm[si]; fgv=pf.fg[si]; }
      const capT=grp?grp.cap:d.cap; let cx=0,cy=0; for(const q of mem){ const it2=S.items[q], dd2=cfg.pieces[it2.type], [w2,h2]=dims(dd2,it2.rot); cx+=it2.x+w2/2; cy+=it2.y+h2/2; } cx/=mem.length; cy/=mem.length;
      if(grp){ c.lineWidth=2; for(const q of mem) outline(S.items[q],'#4aa3ff'); c.lineWidth=1; }
      const top=it.type==='SL'?1.6:it.type==='SM'?1.2:1.0; const p=P(V,cx,cy,flat?0:top+.5);
      const bw=Math.max(30,Math.min(54,(grp?Math.sqrt(mem.length)*w:w)*10*z)), bh=Math.max(6,7*z), fr=Math.min(1,rmv/capT), fg2=Math.min(1-fr,fgv/capT);
      c.fillStyle='rgba(10,14,17,.88)'; c.fillRect(p[0]-bw/2-1.5,p[1]-bh/2-1.5,bw+3,bh+3);
      c.fillStyle='#2b353c'; c.fillRect(p[0]-bw/2,p[1]-bh/2,bw,bh);
      c.fillStyle='#4aa3ff'; c.fillRect(p[0]-bw/2,p[1]-bh/2,bw*fr,bh);
      c.fillStyle='#3fd17f'; c.fillRect(p[0]-bw/2+bw*fr,p[1]-bh/2,bw*fg2,bh);
      if(z>=.55){ c.font='600 '+Math.max(8,9*z)+'px system-ui,sans-serif'; c.fillStyle='#fff'; c.textAlign='center'; c.textBaseline='bottom'; c.fillText(Math.round(rmv+fgv)+'/'+capT,p[0],p[1]-bh/2-3); }
    }
  });
  // delivery and shipping trucks during the run
  if(S.play&&S.play.ev) for(const e of S.play.ev){ const set=e.type==='in'?S.ctx.inb:S.ctx.out; if(!set.length) continue; let sx=0,sy=0; for(const i of set){ sx+=i%N+.5; sy+=Math.floor(i/N)+.5; } sx/=set.length; sy/=set.length;
    const tf={t:T,on:fxOn}; if(e.type==='in') truck(c,V,sx,sy,'#e5a826','+'+Math.round(e.units)+(e.lost>.5?' · '+Math.round(e.lost)+' turned away':''),e.lost>.5?'#a63a2b':'#a06d00',tf);
    else truck(c,V,sx,sy,'#2cb09d','−'+Math.round(e.got!=null?e.got:(e.units||0))+' shipped','#13705f',tf); }
  // dust where a piece landed, and a poof where one was taken away
  if(fxOn&&!flat){ const puff=(cx,cy,k,n,rr)=>{ for(let i=0;i<n;i++){ const a=i*6.2832/n+.4, q=P(V,cx+Math.cos(a)*rr*(.4+k),cy+Math.sin(a)*rr*(.4+k),.15+k*.5); c.globalAlpha=.55*(1-k); c.fillStyle='#efe8d6'; c.beginPath(); c.arc(q[0],q[1],(3+k*9)*V.zoom,0,6.2832); c.fill(); } c.globalAlpha=1; };
    if(S.born) for(const it of S.items){ const b=S.born.get(it.id); if(b==null) continue; const k=(T-b-.33)/.5; if(k>=0&&k<1){ const [w,h]=dims(cfg.pieces[it.type],it.rot); puff(it.x+w/2,it.y+h/2,k,8,Math.max(w,h)/2+.2); } }
    if(S.puffs) for(const q of S.puffs){ const k=(T-q.t0)/.5; if(k>=0&&k<1) puff(q.x+q.w/2,q.y+q.h/2,k,10,Math.max(q.w,q.h)/2+.1); } }
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

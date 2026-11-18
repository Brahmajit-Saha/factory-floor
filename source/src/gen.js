
/* ---------- Floor generation: pure functions, no DOM ---------- */
const N = 50;
const LIMITS = { usableMin:1805, usableMax:1995, obsMaxPct:0.06, bayMin:20, bayMax:24, distMin:45, distMax:65, packRects:12, packMinRect:20, packMin:1300, corridorMin:5 };

function xmur3(str){ let h=1779033703^str.length; for(let i=0;i<str.length;i++){h=Math.imul(h^str.charCodeAt(i),3432918353);h=h<<13|h>>>19;} return function(){h=Math.imul(h^h>>>16,2246822507);h=Math.imul(h^h>>>13,3266489909);return (h^=h>>>16)>>>0;}; }
function mulberry32(a){ return function(){ a|=0; a=a+0x6D2B79F5|0; let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t; return ((t^t>>>14)>>>0)/4294967296; }; }
function rngFrom(str){ return mulberry32(xmur3(str)()); }
const ri=(r,a,b)=>a+Math.floor(r()*(b-a+1));
function shuffle(a,r){ for(let i=a.length-1;i>0;i--){ const j=Math.floor(r()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; } return a; }

const newMask=v=>new Uint8Array(N*N).fill(v);
function fillRect(m,x0,y0,x1,y1,v){ for(let y=Math.max(0,y0);y<Math.min(N,y1);y++) for(let x=Math.max(0,x0);x<Math.min(N,x1);x++) m[y*N+x]=v; }
function count(m){ let c=0; for(let i=0;i<m.length;i++) if(m[i]) c++; return c; }
function transform(m,rot,flip){
  const o=new Uint8Array(N*N);
  for(let y=0;y<N;y++) for(let x=0;x<N;x++){
    let sx=flip?N-1-x:x, sy=y;
    for(let k=0;k<rot;k++){ const t=sx; sx=sy; sy=N-1-t; }
    o[y*N+x]=m[sy*N+sx];
  }
  return o;
}

const FAMILIES=[
  {name:'L-shape', make(r){ const m=newMask(1); const a=ri(r,18,30); const b=Math.max(8,Math.min(34,Math.round(520/a)+ri(r,-4,4))); fillRect(m,0,0,a,b,0); return m; }},
  {name:'T-shape', make(r){ const m=newMask(0); const h1=ri(r,14,22); const w=Math.max(16,Math.min(40,Math.round((1990-50*h1)/(50-h1))+ri(r,-3,3))); fillRect(m,0,0,50,h1,1); const x0=ri(r,0,50-w); fillRect(m,x0,h1,x0+w,50,1); return m; }},
  {name:'U-shape', make(r){ const m=newMask(1); const w=ri(r,14,24); const h=Math.max(10,Math.min(36,Math.round(520/w)+ri(r,-3,3))); const x0=ri(r,8,50-w-8); fillRect(m,x0,0,x0+w,h,0); return m; }},
  {name:'Cross', make(r){ const m=newMask(0); const a=ri(r,20,27); const b=Math.max(16,Math.min(40,Math.round((1990-50*a)/(50-a))+ri(r,-2,2))); const cx=Math.floor((50-a)/2), cy=Math.floor((50-b)/2); const x0=Math.max(0,Math.min(50-a,ri(r,cx-4,cx+4))); const y0=Math.max(0,Math.min(50-b,ri(r,cy-4,cy+4))); fillRect(m,x0,0,x0+a,50,1); fillRect(m,0,y0,50,y0+b,1); return m; }},
  {name:'Stepped', make(r){ const m=newMask(1); const a1=ri(r,20,30), b1=ri(r,8,14); const rem=Math.max(60,520-a1*b1); const a2=ri(r,8,a1-5); const b2=Math.min(38,b1+Math.round(rem/a2)); fillRect(m,0,0,a1,b1,0); fillRect(m,0,0,a2,b2,0); return m; }},
  {name:'Notched', make(r){ const m=newMask(1); const sides=shuffle(['T','B','L','R'],r).slice(0,3); for(const s of sides){ const w=ri(r,8,14), h=Math.max(6,Math.round(173/w)+ri(r,-1,1)), p=ri(r,6,50-w-6); if(s==='T') fillRect(m,p,0,p+w,h,0); else if(s==='B') fillRect(m,p,50-h,p+w,50,0); else if(s==='L') fillRect(m,0,p,h,p+w,0); else fillRect(m,50-h,p,50,p+w,0); } return m; }},
  {name:'Courtyard', make(r){ const m=newMask(1); const w=ri(r,16,26); const h=Math.max(12,Math.min(30,Math.round(520/w)+ri(r,-2,2))); const x0=ri(r,9,50-w-9), y0=ri(r,9,50-h-9); fillRect(m,x0,y0,x0+w,y0+h,0); return m; }},
  {name:'Offset wings', make(r){ const m=newMask(0); const wA=ri(r,28,38), hA=ri(r,32,42), wB=ri(r,28,38), hB=ri(r,32,42); fillRect(m,0,0,wA,hA,1); fillRect(m,50-wB,50-hB,50,50,1); return m; }},
  {name:'Hourglass', make(r){ const m=newMask(0); const t=ri(r,16,20); const w=Math.max(10,Math.min(30,Math.round((1990-100*t)/(50-2*t))+ri(r,-1,1))); fillRect(m,0,0,50,t,1); fillRect(m,0,50-t,50,50,1); const x0=ri(r,4,50-w-4); fillRect(m,x0,t,x0+w,50-t,1); return m; }},
  {name:'Chamfered', make(r){ const m=newMask(1); const c=ri(r,14,17); for(let y=0;y<c;y++) for(let x=0;x<c-y;x++){ m[y*N+x]=0; m[y*N+(N-1-x)]=0; m[(N-1-y)*N+x]=0; m[(N-1-y)*N+(N-1-x)]=0; } return m; }}
];

function outerOutside(mask){
  const out=new Uint8Array(N*N), q=[];
  const push=(x,y)=>{ if(x<0||y<0||x>=N||y>=N) return; const i=y*N+x; if(mask[i]||out[i]) return; out[i]=1; q.push(i); };
  for(let i=0;i<N;i++){ push(i,0); push(i,N-1); push(0,i); push(N-1,i); }
  while(q.length){ const i=q.pop(), x=i%N, y=(i-x)/N; push(x+1,y); push(x-1,y); push(x,y+1); push(x,y-1); }
  return out;
}
function pickBays(mask,r){
  const out=outerOutside(mask), runs=[];
  const inside=(x,y)=>x>=0&&y>=0&&x<N&&y<N&&mask[y*N+x]===1;
  const isOuter=(x,y)=>x<0||y<0||x>=N||y>=N||out[y*N+x]===1;
  for(const d of ['L','R']) for(let x=0;x<N;x++){ let s=-1; for(let y=0;y<=N;y++){ const ok=y<N&&inside(x,y)&&isOuter(d==='L'?x-1:x+1,y); if(ok&&s<0) s=y; if(!ok&&s>=0){ if(y-s>=LIMITS.bayMin) runs.push({d,fixed:x,a:s,b:y}); s=-1; } } }
  for(const d of ['U','D']) for(let y=0;y<N;y++){ let s=-1; for(let x=0;x<=N;x++){ const ok=x<N&&inside(x,y)&&isOuter(x,d==='U'?y-1:y+1); if(ok&&s<0) s=x; if(!ok&&s>=0){ if(x-s>=LIMITS.bayMin) runs.push({d,fixed:y,a:s,b:x}); s=-1; } } }
  if(runs.length<2) return null;
  const mk=R=>{ const len=Math.min(R.b-R.a,ri(r,LIMITS.bayMin,LIMITS.bayMax)); const s=ri(r,R.a,R.b-len); const cells=[]; for(let i=s;i<s+len;i++) cells.push((R.d==='L'||R.d==='R')?[R.fixed,i]:[i,R.fixed]); return {d:R.d,cells}; };
  for(let t=0;t<40;t++){
    const A=runs[Math.floor(r()*runs.length)];
    const others=runs.filter(q=>q.d!==A.d); if(!others.length) continue;
    const B=others[Math.floor(r()*others.length)];
    const inb=mk(A), outb=mk(B);
    const d=bfsDist(mask,inb.cells.map(c=>c[1]*N+c[0]),outb.cells.map(c=>c[1]*N+c[0]));
    if(d>=LIMITS.distMin+1&&d<=LIMITS.distMax-5) return {inb,out:outb};
  }
  return null;
}
function placeObstacles(mask,bayCells,r,target){
  const obs=new Uint8Array(N*N), near=new Uint8Array(N*N);
  for(const [bx,by] of bayCells) for(let dy=-2;dy<=2;dy++) for(let dx=-2;dx<=2;dx++){ const x=bx+dx,y=by+dy; if(x>=0&&y>=0&&x<N&&y<N) near[y*N+x]=1; }
  const free=Uint8Array.from(mask);
  const can=(x0,y0,w,h)=>{
    for(let y=y0;y<y0+h;y++) for(let x=x0;x<x0+w;x++){ if(x>=N||y>=N) return false; const i=y*N+x; if(!mask[i]||obs[i]||near[i]) return false; }
    // an obstacle may touch a wall or another obstacle, but may never leave a gap or corridor narrower than the minimum width
    fillRect(free,x0,y0,x0+w,y0+h,0);
    const ok=narrowCells(free,LIMITS.corridorMin)===0;
    if(!ok) fillRect(free,x0,y0,x0+w,y0+h,1);
    return ok;
  };
  let c=0, tries=0;
  while(c<target&&tries<600){
    tries++;
    const t=r(); let w,h;
    if(t<.40){w=1;h=1;} else if(t<.65){w=2;h=2;} else if(t<.90){ const L=ri(r,4,9); if(r()<.5){w=L;h=1;}else{w=1;h=L;} } else {w=3;h=3;}
    const x0=ri(r,0,N-w), y0=ri(r,0,N-h);
    if(can(x0,y0,w,h)){ fillRect(obs,x0,y0,x0+w,y0+h,1); c+=w*h; }
  }
  return c>=Math.max(40,Math.floor(target*0.8))?{obs,count:c}:null;
}
function bfsDist(usable,sources,targets){
  const dist=new Int16Array(N*N).fill(-1), q=[], tset=new Set(targets);
  for(const i of sources){ dist[i]=0; q.push(i); }
  let head=0;
  while(head<q.length){
    const i=q[head++]; if(tset.has(i)) return dist[i];
    const x=i%N, y=(i-x)/N;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+dx, ny=y+dy; if(nx<0||ny<0||nx>=N||ny>=N) continue; const j=ny*N+nx; if(!usable[j]||dist[j]>=0) continue; dist[j]=dist[i]+1; q.push(j); }
  }
  return -1;
}
function connectedCount(usable){
  let start=-1; for(let i=0;i<usable.length;i++) if(usable[i]){ start=i; break; }
  if(start<0) return 0;
  const seen=new Uint8Array(N*N), q=[start]; seen[start]=1; let c=0;
  while(q.length){ const i=q.pop(); c++; const x=i%N, y=(i-x)/N;
    for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){ const nx=x+dx, ny=y+dy; if(nx<0||ny<0||nx>=N||ny>=N) continue; const j=ny*N+nx; if(usable[j]&&!seen[j]){ seen[j]=1; q.push(j); } } }
  return c;
}
function maxRect(free){
  const h=new Int16Array(N); let best={area:0,x0:0,y0:0,x1:0,y1:0};
  for(let y=0;y<N;y++){
    for(let x=0;x<N;x++) h[x]=free[y*N+x]?h[x]+1:0;
    const st=[];
    for(let x=0;x<=N;x++){
      const cur=x<N?h[x]:0; let start=x;
      while(st.length&&st[st.length-1].h>cur){ const s=st.pop(); const area=s.h*(x-s.x); if(area>best.area) best={area,x0:s.x,x1:x,y0:y+1-s.h,y1:y+1}; start=s.x; }
      st.push({x:start,h:cur});
    }
  }
  return best;
}
function packRooms(free0){
  const free=Uint8Array.from(free0), areas=[];
  for(let k=0;k<LIMITS.packRects;k++){ const b=maxRect(free); if(b.area<LIMITS.packMinRect) break; areas.push(b.area); fillRect(free,b.x0,b.y0,b.x1,b.y1,0); }
  return areas;
}
/* narrowest point: every usable cell must lie inside some k×k square of usable cells, so no corridor, neck or gap is narrower than k */
function narrowCells(usable,k){
  const S=new Int32Array((N+1)*(N+1));
  for(let y=0;y<N;y++) for(let x=0;x<N;x++) S[(y+1)*(N+1)+x+1]=usable[y*N+x]+S[y*(N+1)+x+1]+S[(y+1)*(N+1)+x]-S[y*(N+1)+x];
  const cov=new Uint8Array(N*N);
  for(let y=0;y+k<=N;y++) for(let x=0;x+k<=N;x++){ const t=S[(y+k)*(N+1)+x+k]-S[y*(N+1)+x+k]-S[(y+k)*(N+1)+x]+S[y*(N+1)+x]; if(t===k*k) for(let j=0;j<k;j++) for(let i=0;i<k;i++) cov[(y+j)*N+x+i]=1; }
  let bad=0; for(let i=0;i<N*N;i++) if(usable[i]&&!cov[i]) bad++;
  return bad;
}
function evaluateFloor(mask,obs,bays,quick){
  const total=count(mask), obsC=count(obs), usableC=total-obsC;
  const usable=new Uint8Array(N*N); for(let i=0;i<N*N;i++) usable[i]=(mask[i]&&!obs[i])?1:0;
  const idx=c=>c[1]*N+c[0];
  const inI=bays.inb.cells.map(idx), outI=bays.out.cells.map(idx);
  const buildable=usableC-inI.length-outI.length;
  const conn=connectedCount(usable);
  const dist=bfsDist(usable,inI,outI);
  const baysOk=bays.inb.cells.length>=LIMITS.bayMin&&bays.out.cells.length>=LIMITS.bayMin&&bays.inb.d!==bays.out.d&&inI.every(i=>usable[i])&&outI.every(i=>usable[i]);
  const pass={
    area:usableC>=LIMITS.usableMin&&usableC<=LIMITS.usableMax,
    obs:obsC/usableC<=LIMITS.obsMaxPct,
    conn:conn===usableC,
    bays:baysOk,
    dist:dist>=LIMITS.distMin&&dist<=LIMITS.distMax,
    corr:narrowCells(usable,LIMITS.corridorMin)===0,
    pack:false
  };
  let rooms=[], packed=0;
  if(!(quick&&!(pass.area&&pass.obs&&pass.conn&&pass.bays&&pass.dist&&pass.corr))){
    const free=Uint8Array.from(usable); for(const i of inI) free[i]=0; for(const i of outI) free[i]=0;
    rooms=packRooms(free); packed=rooms.reduce((a,b)=>a+b,0); pass.pack=packed>=LIMITS.packMin;
  }
  return {usable:usableC,buildable,obsCount:obsC,obsPct:obsC/usableC,dist,rooms,packed,pass,all:Object.values(pass).every(Boolean)};
}
function toRows(mask,obs,bays){
  const g=[]; for(let y=0;y<N;y++){ let s=''; for(let x=0;x<N;x++){ const i=y*N+x; s+=!mask[i]?'.':obs[i]?'#':'+'; } g.push(s.split('')); }
  for(const [x,y] of bays.inb.cells) g[y][x]='I';
  for(const [x,y] of bays.out.cells) g[y][x]='O';
  return g.map(r=>r.join(''));
}
function generateFloor(seed,index,famIdx){
  const fam=FAMILIES[famIdx];
  for(let attempt=0;attempt<600;attempt++){
    const r=rngFrom(seed+'|'+index+'|'+attempt);
    let mask=fam.make(r); mask=transform(mask,ri(r,0,3),ri(r,0,1));
    const A=count(mask); if(A<1900||A>2080) continue;
    if(connectedCount(mask)!==A) continue;
    if(narrowCells(mask,LIMITS.corridorMin)>0) continue;
    const bays=pickBays(mask,r); if(!bays) continue;
    const o=placeObstacles(mask,[...bays.inb.cells,...bays.out.cells],r,Math.max(45,Math.min(110,A-1900))); if(!o) continue;
    const st=evaluateFloor(mask,o.obs,bays,true);
    if(st.all) return {n:index+1,family:fam.name,attempts:attempt+1,stats:st,rows:toRows(mask,o.obs,bays),inb:{d:bays.inb.d,len:bays.inb.cells.length},out:{d:bays.out.d,len:bays.out.cells.length}};
  }
  return {n:index+1,family:fam.name,failed:true,attempts:600};
}
function generatePool(seed,P){
  const famOrder=shuffle([...Array(FAMILIES.length).keys()],rngFrom(seed+'|families'));
  const floors=[]; for(let i=0;i<P;i++) floors.push(generateFloor(seed,i,famOrder[i%FAMILIES.length]));
  return floors;
}
/* one floor of the pool without building the others (same floor generatePool gives at that index) */
function generateOne(seed,index){
  const famOrder=shuffle([...Array(FAMILIES.length).keys()],rngFrom(seed+'|families'));
  return generateFloor(seed,index,famOrder[index%FAMILIES.length]);
}
function poolOrder(seed,P){ return shuffle([...Array(P).keys()],rngFrom(seed+'|order')); }
function schedule(order,P,K,R){
  const s=Math.floor(P/K), rows=[];
  for(let r=0;r<R;r++){ const row=[]; for(let k=0;k<K;k++) row.push(order[(r+k*s)%P]+1); rows.push(row); }
  return rows;
}

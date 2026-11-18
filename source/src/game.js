/* ---------- Game rules shared by every screen: logins, rounds, timer, standings, export tables. Pure functions, no DOM. ----------
   Database layout (under /ff):
     meta            {seed,rounds,pool,ppt,teams:{t1:'Name'},created}
     game            {phase:'lobby'|'round'|'setup'|'done', round:n, upd}
     rounds/n        {minutes,target,budget,status:'running'|'paused'|'ended',endAt,leftMs,startedAt}
     players/uid     {email,name,team,fi,joined,seen}
     builds/n/uid    {items:'json',score,pts:{close,spend,store,layout},rate,cost,t}   live, rewritten while building
     scores/n/uid    {score,pts,rate,cost}                                              final, written at round end (automatic part, out of 90)
     ratings/n/uid   {j1:{v,t},j2:{v,t}}                                                 each judge's layout-and-flow mark, 0 to 5 in steps of 0.5   */
const CREDS={ player:'123456789', admin:'19990909', gm:'11223456', demo:'787898', judge1:'24681357', judge2:'13572468' };
const JUDGES=2, RATE_MAX=5, RATE_STEP=0.5;
const DOMAIN='@ibsindia.org';
const SCORE_ROWS=[['close','Closeness to target (out of 40)'],['spend','Spending efficiency (out of 30)'],['store','Storage planning (out of 20)'],['layout','Layout and flow, from the judges (out of 10)']];

function cleanEmail(e){ return String(e||'').trim().toLowerCase(); }
function validEmail(e){ e=cleanEmail(e); const i=e.indexOf('@'); return i>0&&e.slice(i)===DOMAIN&&/^[a-z0-9._+-]+$/.test(e.slice(0,i)); }
function uidOf(e){ return cleanEmail(e).replace(/@.*$/,'').replace(/[^a-z0-9]/g,'_'); }
function judgeOf(pass){ return pass===CREDS.judge1?1:pass===CREDS.judge2?2:0; }
function checkLogin(role,email,pass){
  if(role==='judge') return judgeOf(pass)?'':'Wrong passcode';
  if(role==='player'){ if(!validEmail(email)) return 'Please use your college id ending in '+DOMAIN; if(pass!==CREDS.player) return 'Wrong password'; return ''; }
  return pass===CREDS[role]?'':'Wrong passcode';
}
function teamList(meta){ const t=(meta&&meta.teams)||{}; return Object.keys(t).sort((a,b)=>(+a.slice(1))-(+b.slice(1))).map(id=>({id,name:t[id]})); }
function usesTeams(meta){ return !!meta&&meta.ppt>1; }
function teamKey(meta,p){ return usesTeams(meta)?(p.team||''):('solo:'+(p.name||p.email)); }
function teamName(meta,p){ if(!usesTeams(meta)) return p.name||p.email; const t=(meta.teams||{})[p.team]; return t||'—'; }

/* seat inside the team (or overall order when there are no teams): the lowest free number, so a removed player's seat is reused.
   The factory (product mix A to D) follows the seat. */
function assignSeat(meta,players,newcomer){
  const same=Object.values(players||{}).filter(p=>p.email!==newcomer.email&&(usesTeams(meta)?p.team===newcomer.team:true));
  const used=new Set(same.map(p=>p.ord!=null?p.ord:(p.fi||0)));
  let o=0; while(used.has(o)) o++; return o;
}
function assignFactory(meta,players,newcomer,K){ return assignSeat(meta,players,newcomer)%K; }

/* ---------- floor plans: how many are needed, which were chosen, who plays which ----------
   meta.pool  number of floor plans generated from the seed (floor n is always the same for the same seed)
   meta.use   text '3,5,8,…' the chosen floor numbers (exactly layoutsNeeded)
   meta.seq   text 'a,b,c|d,e,f' one group of floor numbers per seat (player 1 of every team, player 2 of every team, …), each as long as the number of rounds
   Rule: a team's player in seat s plays, in round r, group s item (teamNumber + r - 1) mod rounds. Teammates never share a layout; every
   team's seat-s player plays every layout of group s exactly once over the rounds. Without teams there is a single group. */
const FF_MAXPOOL=90;
function layoutsNeeded(meta){ return Math.max(1,meta.ppt||1)*meta.rounds; }
function parseNums(t){ return String(t||'').split(',').map(x=>+x).filter(x=>x>0&&x===Math.floor(x)); }
function useList(meta){ return meta&&meta.use?parseNums(meta.use):[]; }
function seqList(meta){ return meta&&meta.seq?String(meta.seq).split('|').map(parseNums).filter(g=>g.length):[]; }
function ffRng(str){ let h=2166136261>>>0; for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619); } return ()=>{ h=(h+0x6D2B79F5)>>>0; let t=h; t=Math.imul(t^(t>>>15),t|1); t^=t+Math.imul(t^(t>>>7),t|61); return ((t^(t>>>14))>>>0)/4294967296; }; }
/* shuffle the chosen floors and cut them into one group per seat; returns the 'seq' text */
function shuffleAssign(use,ppt,R,token){
  const a=use.slice(), r=ffRng('ffshuf|'+token); for(let i=a.length-1;i>0;i--){ const j=Math.floor(r()*(i+1)); const t=a[i]; a[i]=a[j]; a[j]=t; }
  const out=[]; for(let s=0;s<Math.max(1,ppt);s++) out.push(a.slice(s*R,(s+1)*R).join(',')); return out.join('|');
}
/* floor number a player uses in a round, or 0 when the admin has not assigned floors (the game then rotates floors automatically) */
function layoutOf(meta,p,round){
  const seq=seqList(meta); if(!seq.length||!p||!round) return 0;
  const ord=p.ord!=null?p.ord:(p.fi||0);
  if(usesTeams(meta)){ const ti=Math.max(0,teamList(meta).findIndex(t=>t.id===p.team)), g=seq[ord%seq.length]; return g[(ti+round-1)%g.length]||0; }
  const g=seq[0]; return g[(ord+round-1)%g.length]||0;
}
/* every team's seats by round, for the admin table: [{label, seat, cells:[floor per round]}] */
function assignmentRows(meta){
  const seq=seqList(meta), R=meta.rounds, rows=[]; if(!seq.length) return rows;
  if(usesTeams(meta)){ teamList(meta).forEach((t,ti)=>{ for(let s=0;s<meta.ppt;s++){ const g=seq[s%seq.length]; rows.push({team:t.name,seat:s+1,cells:Array.from({length:R},(_,r)=>g[(ti+r)%g.length])}); } }); }
  else { const g=seq[0]; for(let i=0;i<Math.max(R,g.length);i++) rows.push({team:'',seat:i+1,cells:Array.from({length:R},(_,r)=>g[(i+r)%g.length])}); }
  return rows;
}

/* timer */
function roundLeftMs(r,now){
  if(!r) return 0;
  if(r.status==='running') return Math.max(0,r.endAt-now);
  if(r.status==='paused') return Math.max(0,r.leftMs);
  if(r.status==='ended') return 0;
  return r.minutes*60000;
}
function roundState(r,now){ // 'none'|'running'|'paused'|'ended'
  if(!r) return 'none'; if(r.status==='running'&&now>=r.endAt) return 'ended'; return r.status;
}
function startRound(minutes,target,budget,now,every){ return {minutes,target,budget,status:'running',startedAt:now,endAt:now+minutes*60000,leftMs:minutes*60000,add:0,every:every||60}; }
/* seconds since the round started, and its full length including any added time (the truck schedule runs on this clock) */
function roundTotalSec(r){ return r.minutes*60+(r.add||0); }
function roundElapsedSec(r,now){ return Math.max(0,Math.min(roundTotalSec(r),Math.round(roundTotalSec(r)-roundLeftMs(r,now)/1000))); }
function pauseRound(r,now){ return Object.assign({},r,{status:'paused',leftMs:Math.max(0,r.endAt-now)}); }
function resumeRound(r,now){ return Object.assign({},r,{status:'running',endAt:now+r.leftMs}); }
function addTime(r,sec,now){
  const ad=(r.add||0)+sec;
  if(r.status==='running') return Object.assign({},r,{endAt:r.endAt+sec*1000,add:ad});
  if(r.status==='paused') return Object.assign({},r,{leftMs:r.leftMs+sec*1000,add:ad});
  if(r.status==='ended') return Object.assign({},r,{status:'running',endAt:now+sec*1000,leftMs:sec*1000,add:ad});
  return r;
}
function endRound(r){ return Object.assign({},r,{status:'ended',leftMs:0}); }

/* judges' layout-and-flow marks */
function rateOk(v){ v=+v; return isFinite(v)&&v>=0&&v<=RATE_MAX&&Math.abs(v*2-Math.round(v*2))<1e-9; }
function ratingsOf(ratings,n,uid){ const r=ratings&&ratings[n]&&ratings[n][uid]||{}; const out=[]; for(let j=1;j<=JUDGES;j++){ const e=r['j'+j]; out.push(e&&rateOk(e.v)?+e.v:null); } return out; }
function judgePts(ratings,n,uid){ const a=ratingsOf(ratings,n,uid); return {pts:a.reduce((x,v)=>x+(v||0),0),count:a.filter(v=>v!=null).length,marks:a}; }
/* scores: use the final record if the round is over, else the live build */
function entryFor(n,uid,scores,builds){ const f=scores&&scores[n]&&scores[n][uid]; if(f) return f; const b=builds&&builds[n]&&builds[n][uid]; return b||null; }
function roundNumbers(rounds){ return Object.keys(rounds||{}).map(Number).sort((a,b)=>a-b); }

function standings(meta,players,rounds,scores,builds,ratings){
  const ns=roundNumbers(rounds);
  const rows=Object.keys(players||{}).map(uid=>{
    const p=players[uid]; const per={}, jc={}; let total=0, last=0;
    for(const n of ns){ const e=entryFor(n,uid,scores,builds), jp=judgePts(ratings,n,uid); const v=(e?+e.score||0:0)+jp.pts; per[n]=v; jc[n]=jp.count; total+=v; last=v; }
    return {uid,name:p.name||uid,email:p.email,team:teamName(meta,p),teamKey:teamKey(meta,p),fi:p.fi,per,jc,total,last};
  });
  rows.sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name)); rows.forEach((r,i)=>r.rank=i+1);
  const tm={};
  for(const r of rows){ const t=tm[r.teamKey]||(tm[r.teamKey]={key:r.teamKey,name:r.team,members:[],per:{},total:0,last:0}); t.members.push(r); }
  const teams=Object.values(tm).map(t=>{ const k=t.members.length; for(const n of ns) t.per[n]=t.members.reduce((a,m)=>a+m.per[n],0)/k; t.total=ns.reduce((a,n)=>a+t.per[n],0); t.last=ns.length?t.per[ns[ns.length-1]]:0; return t; });
  teams.sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name)); teams.forEach((t,i)=>t.rank=i+1);
  return {rounds:ns,players:rows,teams};
}
const r1=x=>Math.round(x*10)/10;

/* tables for the Excel file. Each sheet {name, rows:[[cell,…]]}; a cell is a value or {v,b:true} for bold */
function exportSheets(meta,players,rounds,scores,builds,factoriesLabel,ratings){
  const st=standings(meta,players,rounds,scores,builds,ratings), ns=st.rounds, B=v=>({v,b:true});
  const sheets=[]; const sum=[];
  sum.push([B('OPSPHERE Factory Floor — results')]); sum.push([]);
  sum.push([B('Players')]);
  sum.push([B('Rank'),B('Player'),B('College id'),B('Team'),B('Factory'),...ns.map(n=>B('Round '+n)),B('Total')]);
  for(const p of st.players) sum.push([p.rank,p.name,p.email,p.team,factoriesLabel(p.fi),...ns.map(n=>r1(p.per[n])),r1(p.total)]);
  if(usesTeams(meta)){
    sum.push([]); sum.push([B('Teams (average of members\' scores)')]);
    sum.push([B('Rank'),B('Team'),B('Members'),...ns.map(n=>B('Round '+n)),B('Total')]);
    for(const t of st.teams) sum.push([t.rank,t.name,t.members.map(m=>m.name).join(', '),...ns.map(n=>r1(t.per[n])),r1(t.total)]);
  }
  sum.push([]); sum.push([B('Rounds')]); sum.push([B('Round'),B('Minutes'),B('Target (units/min)'),B('Budget (₹)')]);
  for(const n of ns){ const r=rounds[n]; sum.push([n,r.minutes,r.target,r.budget]); }
  sheets.push({name:'Summary',rows:sum});
  const used={Summary:1};
  for(const p of st.players){
    let nm=(p.name||p.uid).replace(/[\[\]:*?\/\\]/g,' ').trim().slice(0,28)||p.uid; let base=nm, i=2; while(used[nm.toLowerCase()]||nm.toLowerCase()==='summary'){ nm=base.slice(0,26)+' '+i++; } used[nm.toLowerCase()]=1;
    const rows=[[B(p.name)],[B('College id'),p.email],[B('Team'),p.team],[B('Factory'),factoriesLabel(p.fi)],[]];
    rows.push([B('Scoring parameter'),...ns.map(n=>B('Round '+n)),B('Total')]);
    const ent=n=>entryFor(n,p.uid,scores,builds);
    for(const [k,label] of SCORE_ROWS){ const vals=ns.map(n=>{ if(k==='layout') return r1(judgePts(ratings,n,p.uid).pts); const e=ent(n); return e&&e.pts?r1(+e.pts[k]||0):0; }); rows.push([label,...vals,r1(vals.reduce((a,b)=>a+b,0))]); }
    for(let j=1;j<=JUDGES;j++) rows.push(['   Judge '+j+' (out of '+RATE_MAX+')',...ns.map(n=>{ const v=ratingsOf(ratings,n,p.uid)[j-1]; return v==null?'':v; })]);
    rows.push([B('Round score (out of 100)'),...ns.map(n=>B(r1(p.per[n]))),B(r1(p.total))]);
    rows.push([]);
    rows.push(['Line rate reached (units/min)',...ns.map(n=>{ const e=ent(n); return e?r1(+e.rate||0):0; })]);
    rows.push(['Round target (units/min)',...ns.map(n=>rounds[n].target)]);
    rows.push(['Money spent (₹)',...ns.map(n=>{ const e=ent(n); return e?Math.round(+e.cost||0):0; })]);
    rows.push(['Round budget (₹)',...ns.map(n=>rounds[n].budget)]);
    if(seqList(meta).length){ rows.push([]); rows.push(['Floor layout number',...ns.map(n=>layoutOf(meta,players[p.uid],n)||'')]); }
    sheets.push({name:nm,rows});
  }
  return sheets;
}

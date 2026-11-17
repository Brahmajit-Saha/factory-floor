/* ---------- Game rules shared by every screen: logins, rounds, timer, standings, export tables. Pure functions, no DOM. ----------
   Database layout (under /ff):
     meta            {seed,rounds,pool,ppt,teams:{t1:'Name'},created}
     game            {phase:'lobby'|'round'|'setup'|'done', round:n, upd}
     rounds/n        {minutes,target,budget,status:'running'|'paused'|'ended',endAt,leftMs,startedAt}
     players/uid     {email,name,team,fi,joined,seen}
     builds/n/uid    {items:'json',score,pts:{close,spend,store,layout},rate,cost,t}   live, rewritten while building
     scores/n/uid    {score,pts,rate,cost}                                              final, written at round end   */
const CREDS={ player:'123456789', admin:'19990909', gm:'11223456' };
const DOMAIN='@ibsindia.org';
const SCORE_ROWS=[['close','Closeness to target'],['spend','Spending efficiency'],['store','Storage planning'],['layout','Layout and flow']];

function cleanEmail(e){ return String(e||'').trim().toLowerCase(); }
function validEmail(e){ e=cleanEmail(e); const i=e.indexOf('@'); return i>0&&e.slice(i)===DOMAIN&&/^[a-z0-9._+-]+$/.test(e.slice(0,i)); }
function uidOf(e){ return cleanEmail(e).replace(/@.*$/,'').replace(/[^a-z0-9]/g,'_'); }
function checkLogin(role,email,pass){
  if(role==='player'){ if(!validEmail(email)) return 'Please use your college id ending in '+DOMAIN; if(pass!==CREDS.player) return 'Wrong password'; return ''; }
  return pass===CREDS[role]?'':'Wrong passcode';
}
function teamList(meta){ const t=(meta&&meta.teams)||{}; return Object.keys(t).sort((a,b)=>(+a.slice(1))-(+b.slice(1))).map(id=>({id,name:t[id]})); }
function usesTeams(meta){ return !!meta&&meta.ppt>1; }
function teamKey(meta,p){ return usesTeams(meta)?(p.team||''):('solo:'+(p.name||p.email)); }
function teamName(meta,p){ if(!usesTeams(meta)) return p.name||p.email; const t=(meta.teams||{})[p.team]; return t||'—'; }

/* factory (floor) for a newly joined player: join order within the team, or overall when there are no teams */
function assignFactory(meta,players,newcomer,K){
  const same=Object.values(players||{}).filter(p=>p.email!==newcomer.email&&(usesTeams(meta)?p.team===newcomer.team:true));
  return same.length%K;
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
function startRound(minutes,target,budget,now){ return {minutes,target,budget,status:'running',startedAt:now,endAt:now+minutes*60000,leftMs:minutes*60000}; }
function pauseRound(r,now){ return Object.assign({},r,{status:'paused',leftMs:Math.max(0,r.endAt-now)}); }
function resumeRound(r,now){ return Object.assign({},r,{status:'running',endAt:now+r.leftMs}); }
function addTime(r,sec,now){
  if(r.status==='running') return Object.assign({},r,{endAt:r.endAt+sec*1000});
  if(r.status==='paused') return Object.assign({},r,{leftMs:r.leftMs+sec*1000});
  if(r.status==='ended') return Object.assign({},r,{status:'running',endAt:now+sec*1000,leftMs:sec*1000});
  return r;
}
function endRound(r){ return Object.assign({},r,{status:'ended',leftMs:0}); }

/* scores: use the final record if the round is over, else the live build */
function entryFor(n,uid,scores,builds){ const f=scores&&scores[n]&&scores[n][uid]; if(f) return f; const b=builds&&builds[n]&&builds[n][uid]; return b||null; }
function roundNumbers(rounds){ return Object.keys(rounds||{}).map(Number).sort((a,b)=>a-b); }

function standings(meta,players,rounds,scores,builds){
  const ns=roundNumbers(rounds);
  const rows=Object.keys(players||{}).map(uid=>{
    const p=players[uid]; const per={}; let total=0, last=0;
    for(const n of ns){ const e=entryFor(n,uid,scores,builds); const v=e?+e.score||0:0; per[n]=v; total+=v; last=v; }
    return {uid,name:p.name||uid,email:p.email,team:teamName(meta,p),teamKey:teamKey(meta,p),fi:p.fi,per,total,last};
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
function exportSheets(meta,players,rounds,scores,builds,factoriesLabel){
  const st=standings(meta,players,rounds,scores,builds), ns=st.rounds, B=v=>({v,b:true});
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
    for(const [k,label] of SCORE_ROWS){ const vals=ns.map(n=>{ const e=ent(n); return e&&e.pts?r1(+e.pts[k]||0):0; }); rows.push([label,...vals,r1(vals.reduce((a,b)=>a+b,0))]); }
    rows.push([B('Round score (out of 100)'),...ns.map(n=>B(r1(p.per[n]))),B(r1(p.total))]);
    rows.push([]);
    rows.push(['Line rate reached (units/min)',...ns.map(n=>{ const e=ent(n); return e?r1(+e.rate||0):0; })]);
    rows.push(['Round target (units/min)',...ns.map(n=>rounds[n].target)]);
    rows.push(['Money spent (₹)',...ns.map(n=>{ const e=ent(n); return e?Math.round(+e.cost||0):0; })]);
    rows.push(['Round budget (₹)',...ns.map(n=>rounds[n].budget)]);
    sheets.push({name:nm,rows});
  }
  return sheets;
}

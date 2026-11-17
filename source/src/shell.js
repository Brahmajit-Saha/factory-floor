/* ---------- Shell: login, joining, waiting, admin console, Game Master display. Uses store.js, game.js, xlsx.js, view.js, Builder (app.js). ---------- */
(function(){
const $=id=>document.getElementById(id), db=createStore();
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN'), num=(n,d)=>Number(n).toLocaleString('en-IN',{maximumFractionDigits:d||0});
const mmss=ms=>{ const s=Math.ceil(ms/1000); return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0'); };
const SCREENS=['login','join','wait','app','admin','gm'];
function show(id){ SCREENS.forEach(s=>$(s).classList.toggle('on',s===id)); ST.screen=id; if(id==='app') setTimeout(()=>Builder.resize(),30); }
const ST={role:null,email:'',uid:'',meta:null,game:null,rounds:{},players:{},scores:{},got:{},offs:[],screen:'login',sig:'',bkey:'',bn:0,unsent:null,sending:false};
const KEYS={meta:'meta',game:'game',rounds:'rounds',players:'players',scores:'scores'};
const factoryLabel=i=>'Factory '+(FACTORIES[i]||'?');
const SESS='ffsess';

/* ---------- connection ---------- */
db.status(on=>$('net').classList.toggle('on',!on));
function subscribe(list,cb){
  for(const k of list){ ST.offs.push(db.on(KEYS[k],v=>{ ST[k]=(k==='meta'||k==='game')?v:(v||{}); ST.got[k]=1; cb(); })); }
}
function allGot(list){ return list.every(k=>ST.got[k]); }
function stopAll(){ ST.offs.forEach(f=>f()); ST.offs=[]; ST.got={}; ST.meta=null; ST.game=null; ST.rounds={}; ST.players={}; ST.scores={}; ST.bkey=''; ST.sig=''; }
function nowMs(){ return db.now(); }
function roundNow(){ const g=ST.game; if(!g||!g.round) return null; return ST.rounds[g.round]||null; }

/* ---------- login ---------- */
let loginRole='player';
function setRole(r){
  loginRole=r; const p=r==='player';
  $('lbEmail').style.display=p?'':'none'; $('lbPass').textContent=p?'Password':(r==='admin'?'Admin passcode':'Game Master passcode');
  $('loginGo').textContent=p?'Join game':(r==='admin'?'Open admin console':'Open Game Master display');
  $('roleAdmin').style.display=p?'':'none'; $('roleGm').style.display=p?'':'none'; $('rolePlayer').style.display=p?'none':'';
  $('loginErr').textContent=''; $('inPass').value='';
}
$('roleAdmin').onclick=()=>setRole('admin'); $('roleGm').onclick=()=>setRole('gm'); $('rolePlayer').onclick=()=>setRole('player');
$('loginForm').onsubmit=async e=>{
  e.preventDefault(); const email=$('inEmail').value, pass=$('inPass').value;
  const err=checkLogin(loginRole,email,pass); if(err){ $('loginErr').textContent=err; return; }
  $('loginErr').textContent=''; $('loginGo').disabled=true;
  try{ await db.ready(); }catch(x){ $('loginErr').textContent='Cannot reach the game server. Check the internet connection and try again.'; $('loginGo').disabled=false; return; }
  $('loginGo').disabled=false;
  const sess=loginRole==='player'?{role:'player',email:cleanEmail(email)}:{role:loginRole};
  try{ localStorage.setItem(SESS,JSON.stringify(sess)); }catch(x){}
  begin(sess);
};
function signOut(){ try{ localStorage.removeItem(SESS); }catch(x){} stopAll(); clearInterval(ST.hb); ST.role=null; setRole('player'); $('inPass').value=''; show('login'); }
['joinOut','waitOut','adOut','gmOut','outBtn'].forEach(id=>$(id).onclick=signOut);
function begin(sess){
  stopAll(); ST.role=sess.role;
  if(sess.role==='player'){ ST.email=sess.email; ST.uid=uidOf(sess.email); startPlayer(); }
  else if(sess.role==='admin') startAdmin(); else startGm();
}

/* ---------- player ---------- */
const PL=['meta','game','rounds','players','scores'];
function startPlayer(){
  show('wait'); waitScreen('Connecting…','');
  subscribe(PL,renderPlayer);
  clearInterval(ST.hb); ST.hb=setInterval(()=>{ if(ST.players[ST.uid]) db.update('players/'+ST.uid,{seen:nowMs()}).catch(()=>{}); },45000);
}
function waitScreen(h,p,card){
  $('waitH').textContent=h; $('waitP').textContent=p||''; $('waitCard').innerHTML=card||''; $('waitSpin').style.display=h==='Game over'?'none':'';
  const me=ST.players[ST.uid]; $('waitWho').innerHTML=me?'<span class="pill">'+esc(me.name)+'</span>'+(usesTeams(ST.meta)?'<span class="pill">'+esc(teamName(ST.meta,me))+'</span>':'')+'<span class="pill">'+esc(factoryLabel(me.fi))+'</span>':'';
  show('wait');
}
function resultCard(n){
  const meta=ST.meta, st=standings(meta,ST.players,ST.rounds,ST.scores,null), me=st.players.find(x=>x.uid===ST.uid); if(!me) return '';
  const tm=usesTeams(meta)?st.teams.find(t=>t.key===me.teamKey):null;
  return '<div class="card2" style="text-align:left"><div class="hint">Round '+n+' score</div><div style="font-size:42px;font-weight:800">'+num(me.per[n]||0,1)+' <span style="font-size:16px;color:var(--ink2)">/ 100</span></div>'
   +'<div class="hint">Total after '+st.rounds.length+' round'+(st.rounds.length>1?'s':'')+': <b>'+num(me.total,1)+'</b> · you are <b>#'+me.rank+'</b> of '+st.players.length+(tm?' · team <b>'+esc(tm.name)+'</b> is #'+tm.rank+' of '+st.teams.length:'')+'</div></div>';
}
function renderPlayer(){
  if(ST.role!=='player'||!allGot(PL)) return;
  const meta=ST.meta, me=ST.players[ST.uid];
  if(!meta||(!me&&usesTeams(meta)&&!teamList(meta).length)){ ST.sig='wait0'; return waitScreen('Game is starting kindly wait',''); }
  if(!me) return joinScreen();
  const g=ST.game||{phase:'lobby',round:0};
  if(g.phase==='lobby') return waitScreen('Game is starting kindly wait','');
  if(g.phase==='setup') return waitScreen('Please wait, the admin is setting up the next round','',resultCard(g.round));
  if(g.phase==='done') return waitScreen('Game over','Thank you for playing. Final result:',resultCard(g.round));
  const rp=ST.rounds[g.round]; if(!rp) return waitScreen('Please wait, the admin is setting up the next round','');
  ensureBuilder(g.round,me,rp); applyLock(true);
}
function joinScreen(){
  const meta=ST.meta; $('joinId').textContent=ST.email; $('joinErr').textContent='';
  const teams=usesTeams(meta); $('lbTeam').style.display=teams?'':'none';
  if(teams){
    const cnt={}; Object.values(ST.players).forEach(p=>{ cnt[p.team]=(cnt[p.team]||0)+1; });
    const keep=$('inTeam').value;
    $('inTeam').innerHTML='<option value="">Choose your team</option>'+teamList(meta).map(t=>{ const c=cnt[t.id]||0, full=c>=meta.ppt; return '<option value="'+t.id+'"'+(full?' disabled':'')+'>'+esc(t.name)+' ('+c+'/'+meta.ppt+(full?' · full':'')+')</option>'; }).join('');
    $('inTeam').value=keep;
  }
  if(ST.screen!=='join'){ show('join'); }
}
$('joinForm').onsubmit=async e=>{
  e.preventDefault(); const meta=ST.meta; if(!meta) return;
  const name=$('inName').value.trim().replace(/\s+/g,' '), team=$('inTeam').value;
  if(name.length<2){ $('joinErr').textContent='Please enter your name'; return; }
  if(usesTeams(meta)&&!team){ $('joinErr').textContent='Please choose your team'; return; }
  const rec={email:ST.email,name,joined:nowMs(),seen:nowMs()}; if(usesTeams(meta)) rec.team=team;
  rec.fi=assignFactory(meta,ST.players,rec,meta.K);
  try{
    await db.set('players/'+ST.uid,rec);
    if(usesTeams(meta)){ const all=await db.get('players')||{}; const mates=Object.keys(all).filter(u=>all[u].team===team).sort((a,b)=>all[a].joined-all[b].joined||(a<b?-1:1)); if(mates.indexOf(ST.uid)>=meta.ppt){ await db.remove('players/'+ST.uid); $('joinErr').textContent='That team just filled up. Please choose another.'; return; } }
  }catch(x){ $('joinErr').textContent='Could not join: '+x.message; }
};

/* builder wiring */
function ensureBuilder(n,me,rp){
  const key=[n,me.fi,ST.uid,ST.meta.seed,ST.meta.pool,rp.target,rp.budget].join('|');
  if(key===ST.bkey){ show('app'); return; }
  ST.bkey=key; ST.bn=n; ST.sig=''; show('app'); Builder.setLock(true,{title:'Loading',html:'<p>Loading your floor…</p>'});
  db.get('builds/'+n+'/'+ST.uid).then(b=>{
    if(ST.bkey!==key) return; let items=[]; try{ items=b&&b.items?JSON.parse(b.items):[]; }catch(x){}
    Builder.onChange=pushBuild;
    Builder.load({seed:ST.meta.seed,pool:ST.meta.pool,K:ST.meta.K,R:ST.meta.rounds,round:n,fi:me.fi,target:rp.target,budget:rp.budget,items,who:me.name});
    ST.sig=''; applyLock(true);
  }).catch(()=>{ ST.bkey=''; });
}
function pushBuild(d){
  if(!ST.bn||ST.role!=='player') return; const r1=x=>Math.round(x*10)/10, p=d.an.pts;
  ST.unsent={n:ST.bn,items:JSON.stringify(d.items),score:r1(d.an.total),pts:{close:r1(p.close),spend:r1(p.spend),store:r1(p.store),layout:r1(p.layout)},rate:r1(d.an.rate),cost:Math.round(d.an.cost)};
  flushUnsent();
}
async function flushUnsent(){
  const u=ST.unsent; if(!u||ST.sending) return; ST.sending=true; const t=nowMs(), id=ST.uid;
  try{ await db.update('',{['builds/'+u.n+'/'+id]:{items:u.items,t},['scores/'+u.n+'/'+id]:{score:u.score,pts:u.pts,rate:u.rate,cost:u.cost,t}}); if(ST.unsent===u) ST.unsent=null; }catch(x){}
  ST.sending=false; if(ST.unsent&&ST.unsent!==u) flushUnsent();
}
function applyLock(force){
  const g=ST.game, rp=roundNow(); if(!g||!rp||ST.screen!=='app'||!ST.bkey) return;
  const st=roundState(rp,nowMs()), left=roundLeftMs(rp,nowMs()), S=Builder.state, an=S.an;
  const lastRound=g.round>=ST.meta.rounds;
  let sig=st+(st==='ended'&&an?num(an.total,1):'');
  if(st==='running'){ Builder.setClock('Time left',mmss(left),left<=30000?'bad':left<=120000?'warn':'run'); }
  else if(st==='paused'){ Builder.setClock('Paused',mmss(left),'pause'); }
  else { Builder.setClock("Time's up",'00:00','end'); }
  if(!force&&sig===ST.sig) return; ST.sig=sig;
  if(st==='running') Builder.setLock(false);
  else if(st==='paused'){ Builder.flush(); Builder.setLock(true,{title:'Paused',cls:'paused',html:'<p>The admin has paused the game. Building resumes shortly.</p>'}); }
  else { Builder.flush(); const a=S.an;
    Builder.setLock(true,{title:"Time's up",html:'<div class="big">'+num(a?a.total:0,1)+' / 100</div><p>Line rate '+num(a?a.rate:0,1)+' of '+num(rp.target)+' units/min · spent '+inr(a?a.cost:0)+'. Your layout is submitted as it stands.</p><p>'+(lastRound?'That was the final round. Results will be shown shortly.':'Please wait, the admin is setting up the next round.')+'</p>'}); }
}
setInterval(()=>{ if(ST.role==='player'&&ST.screen==='app') applyLock(false); if(ST.unsent&&!ST.sending&&Date.now()%3000<260) flushUnsent(); },250);
window.addEventListener('beforeunload',()=>{ try{ Builder.flush(); }catch(x){} });

/* ---------- admin ---------- */
const AD=['meta','game','rounds','players','scores'];
function startAdmin(){ show('admin'); $('adRounds').innerHTML=[5,6,7,8,9,10].map(n=>'<option>'+n+'</option>').join(''); ST.adDirty=false; ST.adKey=''; subscribe(AD,renderAdmin); }
function parseTeams(text,old){
  const names=text.split(/\n/).map(x=>x.trim()).filter(Boolean); const seen={}; const out={}; let mx=0;
  Object.keys(old||{}).forEach(id=>{ mx=Math.max(mx,+id.slice(1)||0); });
  const byName={}; Object.keys(old||{}).forEach(id=>{ byName[old[id].toLowerCase()]=id; });
  for(const n of names){ const k=n.toLowerCase(); if(seen[k]) continue; seen[k]=1; const id=byName[k]||('t'+(++mx)); out[id]=n; }
  return out;
}
function fillSetup(force){
  if(!force&&ST.adDirty) return; const m=ST.meta, el=document.activeElement;
  const set=(id,v)=>{ if(el!==$(id)) $(id).value=v; };
  set('adSeed',m?m.seed:'OPS-'+Math.floor(1000+Math.random()*9000)); set('adRounds',m?m.rounds:6); set('adPool',m?m.pool:12); set('adPpt',m?m.ppt:1);
  set('adTeams',m?teamList(m).map(t=>t.name).join('\n'):'');
  $('adTeamsBox').style.display=(+$('adPpt').value>1)?'':'none';
  const started=Object.keys(ST.rounds).length>0; ['adSeed','adRounds','adPool'].forEach(id=>$(id).disabled=started);
}
['adSeed','adRounds','adPool','adPpt','adTeams'].forEach(id=>$(id).addEventListener('input',()=>{ ST.adDirty=true; $('adTeamsBox').style.display=(+$('adPpt').value>1)?'':'none'; $('adSaveMsg').textContent=''; }));
$('adSave').onclick=async()=>{
  const seed=($('adSeed').value||'').trim()||'OPS-1', rounds=Math.max(5,Math.min(10,+$('adRounds').value||6)), pool=Math.max(rounds,Math.min(20,+$('adPool').value||12)), ppt=Math.max(1,Math.min(8,+$('adPpt').value||1));
  const teams=parseTeams($('adTeams').value,(ST.meta&&ST.meta.teams)||{});
  if(ppt>1&&!Object.keys(teams).length){ $('adSaveMsg').textContent='Add at least one team name, one per line.'; $('adSaveMsg').className='hint badc'; return; }
  const meta={seed,rounds,pool,K:4,ppt,teams:ppt>1?teams:{},created:(ST.meta&&ST.meta.created)||nowMs()};
  try{
    await db.set('meta',meta); if(!ST.game) await db.set('game',{phase:'lobby',round:0,upd:nowMs()});
    ST.adDirty=false; $('adSaveMsg').textContent='Saved.'; $('adSaveMsg').className='hint ok';
  }catch(x){ $('adSaveMsg').textContent='Could not save: '+x.message; $('adSaveMsg').className='hint badc'; }
};
function renderAdmin(){
  if(ST.role!=='admin'||!allGot(AD)) return;
  const meta=ST.meta, g=ST.game||{phase:'lobby',round:0};
  $('adConn').textContent=db.kind==='firebase'?'Live database':'Demo mode (this browser only)';
  const ph={lobby:'Before round 1',round:'Round '+g.round,setup:'Between rounds',done:'Finished'}[g.phase]||g.phase; $('adPhase').textContent=ph;
  fillSetup(false); renderAdminRound(); renderAdminPlayers();
}
function renderAdminRound(){
  const meta=ST.meta, g=ST.game||{phase:'lobby',round:0}, body=$('adRoundBody');
  let key, html='';
  if(!meta){ key='nometa'; html='<p class="hint">Save the game setup above first.</p>'; }
  else if(g.phase==='done'){ key='done'; html='<p><b>The game is finished.</b> Use “Export results (Excel)” at the top to download the record.</p>'; }
  else if(g.phase==='round'){
    const rp=ST.rounds[g.round], st=roundState(rp,nowMs());
    if(!rp){ key='starting'; html='<p class="hint">Starting round '+g.round+'…</p>'; }
    else if(st==='ended'){
      key='ended'+g.round; const last=g.round>=meta.rounds, sd=standings(meta,ST.players,ST.rounds,ST.scores,null);
      html='<div class="stat"><b>Round '+g.round+' finished</b><span class="hint">Layouts are locked. Players see their score and are waiting.</span></div>'
        +(sd.players.length?'<p class="hint">Leader: <b>'+esc(sd.players[0].name)+'</b> with '+num(sd.players[0].total,1)+' points in total.</p>':'')
        +(last?'<button class="btn hz" data-act="finish">Finish game and show final results</button>':'<button class="btn hz" data-act="gen">Generate round '+(g.round+1)+'…</button>')
        +'<button class="btn" data-act="add5" style="margin-left:8px">Re-open for +5 min</button>';
    } else {
      key='live'+g.round+st;
      html='<div class="stat"><span>Round '+g.round+' of '+meta.rounds+'</span><b id="adClock">--:--</b><span id="adSt" class="hint"></span></div>'
        +'<p class="hint">Target '+num(rp.target)+' units/min · budget '+inr(rp.budget)+' · '+rp.minutes+' min</p>'
        +'<div class="row2"><button class="btn hz" data-act="'+(st==='paused'?'resume':'pause')+'">'+(st==='paused'?'Resume':'Pause')+'</button>'
        +'<button class="btn" data-act="add1">+1 min</button><button class="btn" data-act="add5">+5 min</button><button class="btn" data-act="end">End round now</button></div>';
    }
  } else { // lobby or setup: round form
    const n=g.phase==='lobby'?1:g.round+1; key='form'+n+g.phase;
    if(ST.adFormKey!==key){ ST.adFormKey=key; ST.adSug=null; }
    const prev=ST.rounds[n-1]; const sug=ST.adSug;
    html='<h3 style="margin:0 0 8px;font-size:15px">'+(g.phase==='lobby'?'Generate round 1':'Generate round '+n)+' of '+meta.rounds+'</h3>'
      +'<div class="g3"><label class="f">Round timer (minutes)<input id="rfMin" type="number" min="1" max="60" step="1" value="'+(prev?prev.minutes:12)+'"></label>'
      +'<label class="f">Production target (units/min)<input id="rfTarget" type="number" min="10" max="1000" step="10" value="'+(sug?sug.target:'')+'"></label>'
      +'<label class="f">Budget (₹)<input id="rfBudget" type="number" min="1000" max="500000" step="1000" value="'+(sug?sug.budget:'')+'"></label></div>'
      +'<p class="hint" id="rfSug">'+(sug?'Suggested: '+num(sug.target)+' units/min, limited by '+(sug.limit==='fill'?'how much of the hardest floor the line may fill':'the budget cap')+'; about '+num(sug.direct)+' units/min is reachable without belts at the bays. Suggested budget '+inr(sug.budget)+'. Target is capped at 1,000 and budget at ₹5,00,000.':'Working out suggested values from the floors…')+'</p>'
      +'<div class="row2"><button class="btn hz" data-act="start">Start round '+n+'</button><span class="hint" id="rfErr"></span></div>'
      +'<p class="hint">'+(g.phase==='lobby'?'Players are seeing “Game is starting kindly wait”.':'Players are seeing “Please wait, the admin is setting up the next round”.')+' Starting the round opens building for everyone at once.</p>';
    if(!sug&&meta){ setTimeout(()=>{ if(ST.adFormKey!==key||ST.adSug) return; try{ ST.adSug=suggestFor(meta); ST.adKey=''; renderAdminRound(); }catch(x){} },30); }
  }
  if(key!==ST.adKey){ ST.adKey=key; body.innerHTML=html; }
  const rp=roundNow(); if(rp&&g.phase==='round'){ const st=roundState(rp,nowMs()); if($('adClock')){ $('adClock').textContent=mmss(roundLeftMs(rp,nowMs())); $('adSt').textContent=st==='paused'?'Paused':'Running'; } }
}
function adminTick(){ if(ST.role!=='admin') return; const rp=roundNow(), g=ST.game; if(rp&&g&&g.phase==='round'){ const st=roundState(rp,nowMs()); const k=ST.adKey||''; if(st==='ended'&&!k.startsWith('ended')) { ST.adKey=''; renderAdminRound(); } else if($('adClock')){ $('adClock').textContent=mmss(roundLeftMs(rp,nowMs())); } } }
$('adRoundBody').addEventListener('click',async e=>{
  const b=e.target.closest('[data-act]'); if(!b) return; const act=b.dataset.act, g=ST.game||{phase:'lobby',round:0}, meta=ST.meta, now=nowMs();
  const rp=ST.rounds[g.round], n=g.round; const norm=r=>roundState(r,now)==='ended'?endRound(r):r;
  try{
    if(act==='gen'){ await db.set('game',{phase:'setup',round:g.round,upd:now}); }
    else if(act==='finish'){ await db.set('game',{phase:'done',round:g.round,upd:now}); }
    else if(act==='start'){
      const nx=g.phase==='lobby'?1:g.round+1, min=Math.round(+$('rfMin').value), tg=Math.round(+$('rfTarget').value), bu=Math.round(+$('rfBudget').value), er=$('rfErr');
      if(!(min>=1&&min<=60)){ er.textContent='Timer must be 1 to 60 minutes'; er.className='hint badc'; return; }
      if(!(tg>=10&&tg<=1000)){ er.textContent='Target must be 10 to 1,000 units/min'; er.className='hint badc'; return; }
      if(!(bu>=1000&&bu<=500000)){ er.textContent='Budget must be ₹1,000 to ₹5,00,000'; er.className='hint badc'; return; }
      await db.update('',{['rounds/'+nx]:startRound(min,tg,bu,now),game:{phase:'round',round:nx,upd:now}});
    }
    else if(act==='pause'&&rp) await db.set('rounds/'+n,pauseRound(norm(rp),now));
    else if(act==='resume'&&rp) await db.set('rounds/'+n,resumeRound(rp,now));
    else if(act==='add1'&&rp) await db.set('rounds/'+n,addTime(norm(rp),60,now));
    else if(act==='add5'&&rp) await db.set('rounds/'+n,addTime(norm(rp),300,now));
    else if(act==='end'&&rp) await db.set('rounds/'+n,endRound(rp));
  }catch(x){ alert('That did not go through: '+x.message); }
});
function ago(t){ if(!t) return '—'; const s=Math.max(0,Math.round((nowMs()-t)/1000)); return s<60?s+' s ago':s<3600?Math.round(s/60)+' min ago':Math.round(s/3600)+' h ago'; }
function renderAdminPlayers(){
  const meta=ST.meta; const st=standings(meta||{ppt:1},ST.players,ST.rounds,ST.scores,null), g=ST.game||{round:0};
  $('adCount').textContent=st.players.length+' joined';
  const teams=usesTeams(meta);
  $('adPlayers').innerHTML='<tr><th>#</th><th>Player</th><th>College id</th>'+(teams?'<th>Team</th>':'')+'<th>Factory</th><th class="r">Round '+(g.round||'–')+'</th><th class="r">Total</th><th>Last seen</th><th></th></tr>'
    +st.players.map(p=>'<tr><td>'+p.rank+'</td><td>'+esc(p.name)+'</td><td>'+esc(p.email)+'</td>'+(teams?'<td>'+esc(p.team)+'</td>':'')+'<td>'+esc(factoryLabel(p.fi))+'</td><td class="r">'+num(p.per[g.round]||0,1)+'</td><td class="r">'+num(p.total,1)+'</td><td>'+ago((ST.players[p.uid]||{}).seen)+'</td><td><button class="btn" data-rm="'+p.uid+'" style="height:28px">Remove</button></td></tr>').join('')
    ||'<tr><td colspan="9" class="hint">Nobody has joined yet.</td></tr>';
}
$('adPlayers').addEventListener('click',async e=>{ const b=e.target.closest('[data-rm]'); if(!b) return; if(b.dataset.sure!=='1'){ b.dataset.sure='1'; b.textContent='Sure?'; setTimeout(()=>{ b.dataset.sure=''; b.textContent='Remove'; },3000); return; } try{ await db.remove('players/'+b.dataset.rm); }catch(x){ alert(x.message); } });
$('adExport').onclick=()=>{
  if(!ST.meta){ alert('Nothing to export yet.'); return; }
  const sheets=exportSheets(ST.meta,ST.players,ST.rounds,ST.scores,null,factoryLabel); if(sheets.length&&Object.keys(ST.rounds).length===0){ alert('No rounds have been played yet, so the file will only list the players.'); }
  const blob=new Blob([buildXlsx(sheets)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); const d=new Date(); a.download='factory-floor-results-'+d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0')+'.xlsx'; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },500);
};
let resetAt=0;
$('adReset').onclick=async()=>{ if(Date.now()-resetAt>4000){ resetAt=Date.now(); $('adReset').textContent='Click again to wipe all players, rounds and scores'; $('adResetMsg').textContent='Export first if you need the record.'; setTimeout(()=>{ if(Date.now()-resetAt>=3900){ $('adReset').textContent='Reset whole game'; $('adResetMsg').textContent=''; } },4000); return; }
  resetAt=0; $('adReset').textContent='Reset whole game'; try{ await db.remove(''); ST.adDirty=false; ST.adKey=''; ST.adFormKey=''; $('adResetMsg').textContent='Game cleared.'; fillSetup(true); }catch(x){ $('adResetMsg').textContent='Could not reset: '+x.message; } };

/* ---------- Game Master ---------- */
const GMK=['meta','game','rounds','players','scores'];
let gmTab='sb', gmUid=null, gmOff=null, gmLayRound=0, gmDraw=null;
function startGm(){ show('gm'); gmTab='sb'; document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===gmTab)); subscribe(GMK,renderGm); }
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{ gmTab=b.dataset.tab; document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x===b)); renderGm(true); });
let gmT=null; function renderGm(now){ if(ST.role!=='gm'||!allGot(GMK)) return; if(now===true){ drawGm(); return; } clearTimeout(gmT); gmT=setTimeout(drawGm,120); }
function gmRoundNo(){ const g=ST.game||{}; return g.round||0; }
function drawGm(){
  const meta=ST.meta, g=ST.game||{phase:'lobby',round:0}; const body=$('gmBody');
  const ended=g.phase==='round'&&roundState(roundNow(),nowMs())==='ended';
  $('gmBar').classList.toggle('on',g.phase==='setup'||(ended&&g.round<(meta?meta.rounds:0)));
  $('gmRound').textContent=!meta?'Waiting for the admin':g.phase==='lobby'?'Game starting soon':g.phase==='done'?'Final results':'Round '+g.round+' of '+meta.rounds;
  if(!meta){ body.innerHTML='<p class="hint" style="font-size:20px">The admin has not set up the game yet.</p>'; return; }
  if(gmTab==='sb') drawScoreboard(body); else if(gmTab==='lv') drawLive(body); else drawLayouts(body);
}
function drawScoreboard(body){
  const meta=ST.meta, g=ST.game||{}, st=standings(meta,ST.players,ST.rounds,ST.scores,null), n=g.round||0, teams=usesTeams(meta);
  const pl='<h2>Players</h2><table><tr><th class="r">#</th><th>Player</th>'+(teams?'<th>Team</th>':'')+'<th class="r">Round '+(n||'–')+'</th><th class="r">Total</th></tr>'
    +st.players.map(p=>'<tr><td class="rk r">'+p.rank+'</td><td>'+esc(p.name)+'</td>'+(teams?'<td>'+esc(p.team)+'</td>':'')+'<td class="r">'+num(p.per[n]||0,1)+'</td><td class="r"><b>'+num(p.total,1)+'</b></td></tr>').join('')+'</table>';
  let tm='';
  if(teams) tm='<h2>Teams</h2><table><tr><th class="r">#</th><th>Team</th><th class="r">Round '+(n||'–')+'</th><th class="r">Total</th></tr>'+st.teams.map(t=>'<tr><td class="rk r">'+t.rank+'</td><td>'+esc(t.name)+'</td><td class="r">'+num(t.per[n]||0,1)+'</td><td class="r"><b>'+num(t.total,1)+'</b></td></tr>').join('')+'</table><p class="hint">Team score is the average of its members\' scores.</p>';
  body.innerHTML='<div class="sb"><div>'+(st.players.length?pl:'<p class="hint" style="font-size:20px">No players have joined yet.</p>')+'</div><div>'+tm+'</div></div>';
}
function drawLive(body){
  const meta=ST.meta, g=ST.game||{}, n=g.round||0;
  if(!n){ body.innerHTML='<p class="hint" style="font-size:20px">The live build appears once round 1 starts.</p>'; return; }
  const st=standings(meta,ST.players,ST.rounds,ST.scores,null);
  if(!gmUid||!ST.players[gmUid]) gmUid=st.players.length?st.players[0].uid:null;
  if(!body.querySelector('.lv')||body.dataset.rn!==String(n)){ body.dataset.rn=String(n); body.innerHTML='<div class="lv"><div class="list" id="lvList"></div><div class="view"><canvas id="lvCv"></canvas><div class="cap" id="lvCap"></div><div class="stats" id="lvSt"></div></div></div>'; subLive(); }
  $('lvList').innerHTML=st.players.map(p=>'<button data-u="'+p.uid+'" class="'+(p.uid===gmUid?'on':'')+'"><span>'+esc(p.name)+'</span><b>'+num(p.per[n]||0,1)+'</b></button>').join('')||'<p class="hint" style="padding:12px">Nobody yet.</p>';
  $('lvList').onclick=e=>{ const b=e.target.closest('[data-u]'); if(!b) return; gmUid=b.dataset.u; subLive(); drawGm(); };
  drawLiveCanvas();
}
let gmItems=[];
function subLive(){
  if(gmOff){ gmOff(); gmOff=null; } gmItems=[]; const n=gmRoundNo(); if(!gmUid||!n) return; const uid=gmUid;
  gmOff=db.on('builds/'+n+'/'+uid,v=>{ if(uid!==gmUid) return; try{ gmItems=v&&v.items?JSON.parse(v.items):[]; }catch(x){ gmItems=[]; } if(gmTab==='lv') drawLiveCanvas(); });
}
function drawLiveCanvas(){
  const cv=$('lvCv'); if(!cv||!gmUid) return; const p=ST.players[gmUid], g=ST.game, n=g.round, rp=ST.rounds[n]; if(!p||!rp) return;
  const r=drawBuild(cv,ST.meta,n,p.fi,gmItems,rp,'iso'); const an=r.an;
  $('lvCap').innerHTML='<b>'+esc(p.name)+'</b>'+(usesTeams(ST.meta)?' · '+esc(teamName(ST.meta,p)):'')+' · '+esc(factoryLabel(p.fi));
  $('lvSt').innerHTML='Score <b>'+num(an.total,1)+'</b> / 100<br>Line rate '+num(an.rate,1)+' of '+num(rp.target)+' units/min<br>Spent '+inr(an.cost)+' of '+inr(rp.budget);
}
function drawLayouts(body){
  const meta=ST.meta, started=Object.keys(ST.rounds).map(Number).sort((a,b)=>a-b);
  if(!started.length){ body.innerHTML='<p class="hint" style="font-size:20px">Layouts appear once round 1 starts.</p>'; return; }
  const cur=ST.game&&ST.game.round?ST.game.round:started[started.length-1]; if(!started.includes(gmLayRound)) gmLayRound=cur;
  const key='lay'+gmLayRound+'|'+meta.seed+'|'+meta.pool; if(body.dataset.k===key&&body.querySelector('.lay')) return; body.dataset.k=key; body.dataset.rn='';
  body.innerHTML='<div class="row2" style="margin-bottom:12px"><span class="hint" style="font-size:16px">Round</span>'+started.map(n=>'<button class="btn" data-lr="'+n+'" style="'+(n===gmLayRound?'background:var(--hazard);color:#1a1a1a;font-weight:700':'')+'">'+n+'</button>').join('')+'</div><div class="lay">'
    +Array.from({length:meta.K},(_,i)=>{ const f=floorOf(meta,gmLayRound,i); return '<div class="tile"><canvas data-fi="'+i+'"></canvas><div class="tt"><b>'+esc(factoryLabel(i))+'</b><span class="hint">Floor '+f.index+' · '+esc(f.floor.family)+'</span></div></div>'; }).join('')+'</div>';
  body.onclick=e=>{ const b=e.target.closest('[data-lr]'); if(b){ gmLayRound=+b.dataset.lr; body.dataset.k=''; drawLayouts(body); } };
  body.querySelectorAll('canvas[data-fi]').forEach(c=>drawBuild(c,meta,gmLayRound,+c.dataset.fi,[],ST.rounds[gmLayRound],'iso'));
}
window.addEventListener('resize',()=>{ if(ST.role==='gm'){ const b=$('gmBody'); b.dataset.k=''; drawGm(); } });
function gmTick(){
  if(ST.role!=='gm') return; const rp=roundNow(), g=ST.game; const el=$('gmTimer');
  if(!rp||!g||g.phase!=='round'){ $('gmTL').textContent=g&&g.phase==='done'?'Finished':'Timer'; $('gmTC').textContent='--:--'; el.className='gmtimer'; return; }
  const st=roundState(rp,nowMs()), left=roundLeftMs(rp,nowMs());
  $('gmTL').textContent=st==='paused'?'Paused':st==='ended'?"Time's up":'Time left'; $('gmTC').textContent=mmss(left); el.className='gmtimer '+(st==='running'?(left<=30000?'bad':left<=120000?'warn':''):st==='ended'?'bad':'warn');
  const ended=st==='ended'&&g.round<ST.meta.rounds; $('gmBar').classList.toggle('on',g.phase==='setup'||ended);
}
setInterval(()=>{ gmTick(); adminTick(); },250);
setInterval(()=>{ if(ST.role==='gm'&&gmTab==='sb') drawGm(); },4000);

/* ---------- watermark: the header logo, faint behind every screen ---------- */
(function(){ const i=$('logoClub'); if(i&&i.src) document.body.style.setProperty('--wm','url('+i.src+')'); })();
/* ---------- start ---------- */
(async function init(){
  $('modeNote').textContent=db.kind==='demo'?'Demo mode: the game works across tabs of this browser only. Add your database address in config.js to play across devices.':'';
  const hash=(location.hash||'').toLowerCase(); if(hash==='#admin') setRole('admin'); else if(hash==='#gm') setRole('gm'); else setRole('player');
  show('login');
  let sess=null; try{ sess=JSON.parse(localStorage.getItem(SESS)||'null'); }catch(x){}
  const go=async()=>{
    try{ await db.ready(); }catch(x){ $('loginErr').textContent='Cannot reach the game server. Retrying…'; setTimeout(go,3000); return; }
    $('loginErr').textContent=''; if(sess&&sess.role){ begin(sess); }
  };
  go();
})();
window.__shell={ST,db,show};
})();

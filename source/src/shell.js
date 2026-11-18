/* ---------- Shell: login, joining, waiting, admin console, Game Master display. Uses store.js, game.js, xlsx.js, view.js, Builder (app.js). ---------- */
(function(){
const $=id=>document.getElementById(id); let db=createStore();
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const inr=n=>'₹'+Math.round(n).toLocaleString('en-IN'), num=(n,d)=>Number(n).toLocaleString('en-IN',{maximumFractionDigits:d||0});
const mmss=ms=>{ const s=Math.ceil(ms/1000); return String(Math.floor(s/60)).padStart(2,'0')+':'+String(s%60).padStart(2,'0'); };
const hlOf=(sm,t)=>Builder.hlOf(sm,t), hlHtml=(h,l,b)=>Builder.hlHtml(h,l,b);
const SCREENS=['login','join','wait','app','admin','gm','judge'];
function show(id){ SCREENS.forEach(s=>$(s).classList.toggle('on',s===id)); ST.screen=id; if(id==='app') setTimeout(()=>Builder.resize(),30); }
const ST={role:null,email:'',uid:'',meta:null,game:null,rounds:{},trucks:{},ratings:{},players:{},scores:{},got:{},offs:[],screen:'login',sig:'',bkey:'',bn:0,unsent:null,sending:false};
const KEYS={meta:'meta',game:'game',rounds:'rounds',players:'players',scores:'scores',trucks:'trucks',ratings:'ratings'};
const factoryLabel=i=>'Factory '+(FACTORIES[i]||'?');
const SESS='ffsess';

/* ---------- connection ---------- */
db.status(on=>$('net').classList.toggle('on',!on));
function subscribe(list,cb){
  for(const k of list){ ST.offs.push(db.on(KEYS[k],v=>{ ST[k]=(k==='meta'||k==='game')?v:(v||{}); ST.got[k]=1; cb(); })); }
}
function allGot(list){ return list.every(k=>ST.got[k]); }
function stopAll(){ if(typeof gmStop==='function') gmStop(); ST.offs.forEach(f=>f()); ST.offs=[]; ST.got={}; ST.meta=null; ST.game=null; ST.rounds={}; ST.trucks={}; ST.ratings={}; ST.players={}; ST.scores={}; ST.bkey=''; ST.sig=''; }
function nowMs(){ return db.now(); }
/* truck controls shared by the admin, the game master and the demo: send a truck now, or change the automatic interval by 10 s */
function truckApply(tr,el,act){
  tr=tr||{e:60,c:'',m:''};
  if(act==='tIn') return truckAdd(tr,el,'i'); if(act==='tOut') return truckAdd(tr,el,'o');
  const cur=truckNowEvery(tr,el), nx=truckEvery(cur+(act==='tUp'?10:-10)); return nx===cur?tr:truckSetEvery(tr,el,nx);
}
/* the truck schedule of a round: starting interval from the round, plus every interval change and manual truck, each saved as its own record so two people pressing at once never overwrite each other */
function trFor(n){ const rp=ST.rounds[n]; if(!rp) return null; const tt=ST.trucks[n]||{}, list=o=>Object.values(o||{}).filter(x=>x&&x.t!=null).sort((a,b)=>a.t-b.t);
  return {e:rp.every||60,c:list(tt.c).map(x=>x.t+':'+x.e).join(','),m:list(tt.m).map(x=>x.t+':'+x.k).join(',')}; }
async function truckDo(act){
  const g=ST.game, rp=roundNow(); if(!g||g.phase!=='round'||!rp) return; const now=nowMs();
  if(roundState(rp,now)!=='running'){ alert('Trucks can be sent while the round is running.'); return; }
  const el=roundElapsedSec(rp,now), id=Math.random().toString(36).slice(2,8)+now.toString(36), base='trucks/'+g.round+'/'; let rec;
  if(act==='tIn'||act==='tOut') rec={[base+'m/'+id]:{t:el,k:act==='tIn'?'i':'o'}};
  else { const cur=truckNowEvery(trFor(g.round),el), nx=truckEvery(cur+(act==='tUp'?10:-10)); if(nx===cur) return; rec={[base+'c/'+id]:{t:el,e:nx}}; }
  try{ await db.update('',rec); }catch(x){ alert('That did not go through: '+x.message); }
}
function truckEveryNow(rp){ const g=ST.game; return rp&&g?truckNowEvery(trFor(g.round),roundElapsedSec(rp,nowMs())):60; }
function roundNow(){ const g=ST.game; if(!g||!g.round) return null; return ST.rounds[g.round]||null; }

/* ---------- login ---------- */
let loginRole='player';
function setRole(r){
  loginRole=r; const p=r==='player';
  $('lbEmail').style.display=p?'':'none'; $('lbPass').textContent=p?'Password':(r==='admin'?'Admin passcode':r==='demo'?'Demo passcode':r==='judge'?'Judge passcode':'Game Master passcode');
  $('loginGo').textContent=p?'Join game':(r==='admin'?'Open admin console':r==='demo'?'Open demo':r==='judge'?'Open judge page':'Open Game Master display');
  $('roleAdmin').style.display=p?'':'none'; $('roleGm').style.display=p?'':'none'; $('roleJudge').style.display=p?'':'none'; $('roleDemo').style.display=p?'':'none'; $('rolePlayer').style.display=p?'none':'';
  $('loginErr').textContent=''; $('inPass').value='';
}
$('roleAdmin').onclick=()=>setRole('admin'); $('roleGm').onclick=()=>setRole('gm'); $('roleJudge').onclick=()=>setRole('judge'); $('roleDemo').onclick=()=>setRole('demo'); $('rolePlayer').onclick=()=>setRole('player');
$('loginForm').onsubmit=async e=>{
  e.preventDefault(); const email=$('inEmail').value, pass=$('inPass').value;
  const err=checkLogin(loginRole,email,pass); if(err){ $('loginErr').textContent=err; return; }
  $('loginErr').textContent=''; $('loginGo').disabled=true;
  if(loginRole!=='demo'){ try{ await db.ready(); }catch(x){ $('loginErr').textContent='Cannot reach the game server. Check the internet connection and try again.'; $('loginGo').disabled=false; return; } }
  $('loginGo').disabled=false;
  const sess=loginRole==='player'?{role:'player',email:cleanEmail(email)}:loginRole==='judge'?{role:'judge',j:judgeOf(pass)}:{role:loginRole};
  try{ localStorage.setItem(SESS,JSON.stringify(sess)); }catch(x){}
  begin(sess);
};
function signOut(){ try{ localStorage.removeItem(SESS); }catch(x){} stopDemo(); stopAll(); if(ST.mainDb){ db=ST.mainDb; } ST.sbx=null; ST.demoOn=false; ST.pov=null; povBar(); clearInterval(ST.hb); ST.role=null; setRole('player'); $('inPass').value=''; show('login'); }
['joinOut','waitOut','adOut','gmOut','jgOut','outBtn'].forEach(id=>$(id).onclick=signOut);
function begin(sess){
  stopAll(); ST.role=sess.role; if(sess.role==='demo'){ ST.demoOn=true; ST.pov='player'; ST.mainDb=ST.mainDb||db; db=ST.mainDb; ST.sbx=null; } else { ST.demoOn=false; } povBar();
  if(sess.role==='player'){ ST.email=sess.email; ST.uid=uidOf(sess.email); startPlayer(); }
  else if(sess.role==='admin') startAdmin(); else if(sess.role==='demo') startDemo(); else if(sess.role==='judge'){ ST.judge=sess.j===2?2:1; startJudge(); } else startGm();
}

/* ---------- player ---------- */
const PL=['meta','game','rounds','trucks','ratings','players','scores'];
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
function hlFromScore(e){ // highlight numbers saved with the player's final build
  const types=String((e&&e.rmt)||'').split(',').filter(Boolean).map(x=>x.split(':')).map(([a,b])=>[a,+b]);
  return {fg:e?+e.fg||0:0,rm:e?+e.rm||0:0,types};
}
function resultCard(n){
  const meta=ST.meta, st=standings(meta,ST.players,ST.rounds,ST.scores,null,ST.ratings), me=st.players.find(x=>x.uid===ST.uid); if(!me) return '';
  const e=ST.scores[n]&&ST.scores[n][ST.uid], judged=(me.jc[n]||0)>=JUDGES;
  const tm=usesTeams(meta)?st.teams.find(t=>t.key===me.teamKey):null;
  const done=st.players.every(p=>st.rounds.every(r=>(p.jc[r]||0)>=JUDGES));
  return '<div class="card2" style="text-align:left"><div class="hint">Round '+n+' highlights</div><div class="hl" style="margin:8px 0">'+hlHtml(hlFromScore(e),false,true)+'</div>'
   +(judged?'<div class="hint" style="margin-top:8px">Round '+n+' score</div><div style="font-size:42px;font-weight:800">'+num(me.per[n]||0,1)+' <span style="font-size:16px;color:var(--ink2)">/ 100</span></div>'
     +'<div class="hint">Total after '+st.rounds.length+' round'+(st.rounds.length>1?'s':'')+': <b>'+num(me.total,1)+'</b>'+(done?' · you are <b>#'+me.rank+'</b> of '+st.players.length+(tm?' · team <b>'+esc(tm.name)+'</b> is #'+tm.rank+' of '+st.teams.length:''):'')+'</div>'
     :'<div class="hint" style="margin-top:8px">The judges are marking your layout and flow. Your score appears here once both judges have rated round '+n+'.</div>')+'</div>';
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
  rec.ord=assignSeat(meta,ST.players,rec); rec.fi=rec.ord%meta.K;
  try{
    await db.set('players/'+ST.uid,rec);
    if(usesTeams(meta)){ const all=await db.get('players')||{}; const mates=Object.keys(all).filter(u=>all[u].team===team).sort((a,b)=>all[a].joined-all[b].joined||(a<b?-1:1)); if(mates.indexOf(ST.uid)>=meta.ppt){ await db.remove('players/'+ST.uid); $('joinErr').textContent='That team just filled up. Please choose another.'; return; } }
  }catch(x){ $('joinErr').textContent='Could not join: '+x.message; }
};

/* builder wiring */
function ensureBuilder(n,me,rp){
  const lay=layoutOf(ST.meta,me,n), key=[n,me.fi,lay,ST.uid,ST.meta.seed,ST.meta.pool,ST.meta.use||'',rp.target,rp.budget].join('|');
  if(key===ST.bkey){ show('app'); return; }
  ST.bkey=key; ST.bn=n; ST.sig=''; show('app'); Builder.setLock(true,{title:'Loading',html:'<p>Loading your floor…</p>'});
  db.get('builds/'+n+'/'+ST.uid).then(b=>{
    if(ST.bkey!==key) return; let items=[]; try{ items=b&&b.items?JSON.parse(b.items):[]; }catch(x){}
    Builder.onChange=pushBuild;
    Builder.load({seed:ST.meta.seed,pool:ST.meta.pool,K:ST.meta.K,R:ST.meta.rounds,round:n,fi:me.fi,lay,use:useList(ST.meta),target:rp.target,budget:rp.budget,items,who:me.name});
    ST.sig=''; applyLock(true);
  }).catch(()=>{ ST.bkey=''; });
}
function pushBuild(d){
  if(!ST.bn||ST.role!=='player') return; const r1=x=>Math.round(x*10)/10, p=d.an.pts;
  ST.unsent={n:ST.bn,items:JSON.stringify(d.items),score:r1(d.an.total),pts:{close:r1(p.close),spend:r1(p.spend),store:r1(p.store),layout:r1(p.layout)},rate:r1(d.an.rate),cost:Math.round(d.an.cost),fg:Math.round(d.an.hl.fg*10)/10,rm:Math.round(d.an.hl.rm*10)/10,rmt:d.an.hl.types.map(x=>x[0]+':'+Math.round(x[1]*10)/10).join(',')};
  flushUnsent();
}
async function flushUnsent(){
  const u=ST.unsent; if(!u||ST.sending) return; ST.sending=true; const t=nowMs(), id=ST.uid;
  try{ await db.update('',{['builds/'+u.n+'/'+id]:{items:u.items,t},['scores/'+u.n+'/'+id]:{score:u.score,pts:u.pts,rate:u.rate,cost:u.cost,fg:u.fg,rm:u.rm,rmt:u.rmt,t}}); if(ST.unsent===u) ST.unsent=null; }catch(x){}
  ST.sending=false; if(ST.unsent&&ST.unsent!==u) flushUnsent();
}
function applyLock(force){
  const g=ST.game, rp=roundNow(); if(!g||!rp||ST.screen!=='app'||!ST.bkey) return;
  const st=roundState(rp,nowMs()), left=roundLeftMs(rp,nowMs()), S=Builder.state, an=S.an;
  const lastRound=g.round>=ST.meta.rounds;
  const myJ=judgePts(ST.ratings,g.round,ST.uid); let sig=st+(st==='ended'&&an?num(an.sim?an.sim.shipped:0,1)+'|'+myJ.count+'|'+myJ.pts:'');
  Builder.setTrucks(trFor(g.round),roundTotalSec(rp)); Builder.setLive(roundElapsedSec(rp,nowMs()));
  if(st==='running'){ Builder.setClock('Time left',mmss(left),left<=30000?'bad':left<=120000?'warn':'run'); }
  else if(st==='paused'){ Builder.setClock('Paused',mmss(left),'pause'); }
  else { Builder.setClock("Time's up",'00:00','end'); }
  if(!force&&sig===ST.sig) return; ST.sig=sig;
  if(st==='running') Builder.setLock(false);
  else if(st==='paused'){ Builder.flush(); Builder.setLock(true,{title:'Paused',cls:'paused',html:'<p>The admin has paused the game. Building resumes shortly.</p>'}); }
  else { Builder.flush(); const a=S.an;
    const jt=myJ.count>=JUDGES?'<p>Your round score: <b>'+num((a?a.total:0)+myJ.pts,1)+' / 100</b> (computer '+num(a?a.total:0,1)+' + judges '+num(myJ.pts,1)+').</p>':'<p>The judges are marking your layout and flow. Your score appears after they finish.</p>';
    Builder.setLock(true,{title:"Time's up",html:'<div class="hl" style="margin:6px 0 12px;text-align:left">'+hlHtml(hlOf(a&&a.sim,null),false,true)+'</div><p>Line rate '+num(a?a.rate:0,1)+' of '+num(rp.target)+' units/min · spent '+inr(a?a.cost:0)+'. Your layout is submitted as it stands.</p>'+jt+'<p>'+(lastRound?'That was the final round. Results will be shown shortly.':'Please wait, the admin is setting up the next round.')+'</p>'}); }
}
setInterval(()=>{ if(ST.role==='demo') dmTick(); if(ST.role==='player'&&ST.screen==='app') applyLock(false); if(ST.unsent&&!ST.sending&&Date.now()%3000<260) flushUnsent(); },250);
window.addEventListener('beforeunload',()=>{ try{ Builder.flush(); }catch(x){} });

/* ---------- admin ---------- */
const AD=['meta','game','rounds','trucks','ratings','players','scores'];
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
  set('adSeed',m?m.seed:'OPS-'+Math.floor(1000+Math.random()*9000)); set('adRounds',m?m.rounds:6); set('adPpt',m?m.ppt:1);
  set('adTeams',m?teamList(m).map(t=>t.name).join('\n'):'');
  $('adTeamsBox').style.display=(+$('adPpt').value>1)?'':'none';
  const started=Object.keys(ST.rounds).length>0; ['adSeed','adRounds'].forEach(id=>$(id).disabled=started);
}
['adSeed','adRounds','adPpt','adTeams'].forEach(id=>$(id).addEventListener('input',()=>{ ST.adDirty=true; $('adTeamsBox').style.display=(+$('adPpt').value>1)?'':'none'; $('adSaveMsg').textContent=''; }));
$('adSave').onclick=async()=>{
  const seed=($('adSeed').value||'').trim()||'OPS-1', rounds=Math.max(5,Math.min(10,+$('adRounds').value||6)), ppt=Math.max(1,Math.min(8,+$('adPpt').value||1));
  const teams=parseTeams($('adTeams').value,(ST.meta&&ST.meta.teams)||{});
  if(ppt>1&&!Object.keys(teams).length){ $('adSaveMsg').textContent='Add at least one team name, one per line.'; $('adSaveMsg').className='hint badc'; return; }
  const old=ST.meta||{}, keep=old.seed===seed&&old.rounds===rounds&&old.ppt===ppt;
  const meta={seed,rounds,pool:old.pool||Math.min(FF_MAXPOOL,layoutsNeeded({ppt,rounds})+3),K:4,ppt,teams:ppt>1?teams:{},created:old.created||nowMs()};
  if(old.fp) meta.fp=1;
  if(keep){ if(old.use) meta.use=old.use; if(old.seq) meta.seq=old.seq; if(old.shuf) meta.shuf=old.shuf; }
  const cleared=!keep&&(old.use||old.seq);
  try{
    await db.set('meta',meta); if(!ST.game) await db.set('game',{phase:'lobby',round:0,upd:nowMs()});
    ST.adDirty=false; $('adSaveMsg').textContent=cleared?'Saved. Seed, rounds or players per team changed, so the floor selection was cleared: choose and assign floor plans again in step 2.':'Saved.'; $('adSaveMsg').className='hint ok';
  }catch(x){ $('adSaveMsg').textContent='Could not save: '+x.message; $('adSaveMsg').className='hint badc'; }
};
function renderAdmin(){
  if(ST.role!=='admin'||!allGot(AD)) return;
  const meta=ST.meta, g=ST.game||{phase:'lobby',round:0};
  $('adConn').textContent=db.kind==='demo'?'Demo mode (this browser only)':'Live database';
  const ph={lobby:'Before round 1',round:'Round '+g.round,setup:'Between rounds',done:'Finished'}[g.phase]||g.phase; $('adPhase').textContent=ph;
  fillSetup(false); renderFloors(); renderAdminRound(); renderAdminPlayers();
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
      key='ended'+g.round; const last=g.round>=meta.rounds, sd=standings(meta,ST.players,ST.rounds,ST.scores,null,ST.ratings);
      html='<div class="stat"><b>Round '+g.round+' finished</b><span class="hint">Layouts are locked. The judges can now rate the layouts; players see their score once both judges have rated. Rated by both judges: <b>'+sd.players.filter(p=>(p.jc[g.round]||0)>=JUDGES).length+' of '+sd.players.length+'</b>.</span></div>'
        +(sd.players.length?'<p class="hint">Leader: <b>'+esc(sd.players[0].name)+'</b> with '+num(sd.players[0].total,1)+' points in total.</p>':'')
        +(last?'<button class="btn hz" data-act="finish">Finish game and show final results</button>':'<button class="btn hz" data-act="gen">Generate round '+(g.round+1)+'…</button>')
        +'<button class="btn" data-act="add5" style="margin-left:8px">Re-open for +5 min</button>';
    } else {
      key='live'+g.round+st;
      html='<div class="stat"><span>Round '+g.round+' of '+meta.rounds+'</span><b id="adClock">--:--</b><span id="adSt" class="hint"></span></div>'
        +'<p class="hint">Target '+num(rp.target)+' units/min · budget '+inr(rp.budget)+' · '+rp.minutes+' min</p>'
        +'<div class="row2"><button class="btn hz" data-act="'+(st==='paused'?'resume':'pause')+'">'+(st==='paused'?'Resume':'Pause')+'</button>'
        +'<button class="btn" data-act="add1">+1 min</button><button class="btn" data-act="add5">+5 min</button><button class="btn" data-act="end">End round now</button></div>'
        +'<div class="row2" style="margin-top:10px"><span class="hint">Trucks every <b id="adTe">60</b> s</span><button class="btn" data-act="tDown">−10 s</button><button class="btn" data-act="tUp">+10 s</button><button class="btn hz" data-act="tIn">Send delivery truck</button><button class="btn hz" data-act="tOut">Send shipping truck</button></div>';
    }
  } else { // lobby or setup: round form
    const n=g.phase==='lobby'?1:g.round+1; key='form'+n+g.phase+'|'+(meta.use||'')+'|'+(seqList(meta).length?1:0);
    if(ST.adFormKey!==key){ ST.adFormKey=key; ST.adSug=null; }
    const prev=ST.rounds[n-1]; const sug=ST.adSug;
    html=(seqList(meta).length?'':'<p class="hint badc">Floor plans are not assigned yet (step 2). Until you shuffle and assign them, the game rotates floors automatically.</p>')
      +'<h3 style="margin:0 0 8px;font-size:15px">'+(g.phase==='lobby'?'Generate round 1':'Generate round '+n)+' of '+meta.rounds+'</h3>'
      +'<div class="g3"><label class="f">Round timer (minutes)<input id="rfMin" type="number" min="1" max="60" step="1" value="'+(prev?prev.minutes:12)+'"></label>'
      +'<label class="f">Production target (units/min)<input id="rfTarget" type="number" min="10" max="1000" step="10" value="'+(sug?sug.target:'')+'"></label>'
      +'<label class="f">Budget (₹)<input id="rfBudget" type="number" min="1000" max="500000" step="1000" value="'+(sug?sug.budget:'')+'"></label></div>'
      +'<div class="g3"><label class="f">Truck interval (seconds, steps of 10)<input id="rfEvery" type="number" min="10" max="300" step="10" value="'+(prev&&prev.every?truckEvery(prev.every):60)+'"></label></div>'
      +'<p class="hint" id="rfSug">'+(sug?'Suggested'+(useList(meta).length?' (from your '+useList(meta).length+' chosen floors)':'')+': '+num(sug.target)+' units/min, limited by '+(sug.limit==='fill'?'how much of the hardest floor the line may fill':'the budget cap')+'; about '+num(sug.direct)+' units/min is reachable without belts at the bays. Suggested budget '+inr(sug.budget)+'. Target is capped at 1,000 and budget at ₹5,00,000.':'Working out suggested values from the floors…')+'</p>'
      +'<div class="row2"><button class="btn hz" data-act="start">Start round '+n+'</button><span class="hint" id="rfErr"></span></div>'
      +'<p class="hint">'+(g.phase==='lobby'?'Players are seeing “Game is starting kindly wait”.':'Players are seeing “Please wait, the admin is setting up the next round”.')+' Starting the round opens building for everyone at once.</p>';
    if(!sug&&meta){ setTimeout(()=>{ if(ST.adFormKey!==key||ST.adSug) return; try{ ST.adSug=suggestFor(meta); ST.adKey=''; renderAdminRound(); }catch(x){} },30); }
  }
  if(key!==ST.adKey){ ST.adKey=key; body.innerHTML=html; }
  const rp=roundNow(); if(rp&&g.phase==='round'){ const st=roundState(rp,nowMs()); if($('adClock')){ $('adClock').textContent=mmss(roundLeftMs(rp,nowMs())); $('adSt').textContent=st==='paused'?'Paused':'Running'; } if($('adTe')) $('adTe').textContent=truckEveryNow(rp); }
}
function adminTick(){ if(ST.role!=='admin') return; const rp=roundNow(), g=ST.game; if(rp&&g&&g.phase==='round'){ const st=roundState(rp,nowMs()); const k=ST.adKey||''; if(st==='ended'&&!k.startsWith('ended')) { ST.adKey=''; renderAdminRound(); } else if($('adClock')){ $('adClock').textContent=mmss(roundLeftMs(rp,nowMs())); if($('adTe')) $('adTe').textContent=truckEveryNow(rp); } } }
$('adRoundBody').addEventListener('click',async e=>{
  const b=e.target.closest('[data-act]'); if(!b) return; const act=b.dataset.act, g=ST.game||{phase:'lobby',round:0}, meta=ST.meta, now=nowMs();
  if(act==='tIn'||act==='tOut'||act==='tUp'||act==='tDown'){ truckDo(act); return; }
  const rp=ST.rounds[g.round], n=g.round; const norm=r=>roundState(r,now)==='ended'?endRound(r):r;
  try{
    if(act==='gen'){ await db.set('game',{phase:'setup',round:g.round,upd:now}); }
    else if(act==='finish'){ await db.set('game',{phase:'done',round:g.round,upd:now}); }
    else if(act==='start'){
      const nx=g.phase==='lobby'?1:g.round+1, min=Math.round(+$('rfMin').value), tg=Math.round(+$('rfTarget').value), bu=Math.round(+$('rfBudget').value), er=$('rfErr');
      if(!(min>=1&&min<=60)){ er.textContent='Timer must be 1 to 60 minutes'; er.className='hint badc'; return; }
      if(!(tg>=10&&tg<=1000)){ er.textContent='Target must be 10 to 1,000 units/min'; er.className='hint badc'; return; }
      if(!(bu>=1000&&bu<=500000)){ er.textContent='Budget must be ₹1,000 to ₹5,00,000'; er.className='hint badc'; return; }
      const ev=Math.round(+$('rfEvery').value); if(!(ev>=10&&ev<=300&&ev%10===0)){ er.textContent='Truck interval must be 10 to 300 seconds, in steps of 10'; er.className='hint badc'; return; }
      await db.update('',{['rounds/'+nx]:startRound(min,tg,bu,now,ev),game:{phase:'round',round:nx,upd:now}});
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
  const meta=ST.meta; const st=standings(meta||{ppt:1},ST.players,ST.rounds,ST.scores,null,ST.ratings), g=ST.game||{round:0};
  $('adCount').textContent=st.players.length+' joined';
  const teams=usesTeams(meta);
  $('adPlayers').innerHTML='<tr><th>#</th><th>Player</th><th>College id</th>'+(teams?'<th>Team</th>':'')+'<th>Factory</th><th>Floor</th><th class="r">Round '+(g.round||'–')+'</th><th class="r">Total</th><th>Last seen</th><th></th></tr>'
    +st.players.map(p=>'<tr><td>'+p.rank+'</td><td>'+esc(p.name)+'</td><td>'+esc(p.email)+'</td>'+(teams?'<td>'+esc(p.team)+'</td>':'')+'<td>'+esc(factoryLabel(p.fi))+'</td><td>'+(layoutOf(meta,ST.players[p.uid],g.round||1)||'auto')+'</td><td class="r">'+num(p.per[g.round]||0,1)+'</td><td class="r">'+num(p.total,1)+'</td><td>'+ago((ST.players[p.uid]||{}).seen)+'</td><td><button class="btn" data-rm="'+p.uid+'" style="height:28px">Remove</button></td></tr>').join('')
    ||'<tr><td colspan="10" class="hint">Nobody has joined yet.</td></tr>';
}
$('adPlayers').addEventListener('click',async e=>{ const b=e.target.closest('[data-rm]'); if(!b) return; if(b.dataset.sure!=='1'){ b.dataset.sure='1'; b.textContent='Sure?'; setTimeout(()=>{ b.dataset.sure=''; b.textContent='Remove'; },3000); return; } try{ await db.remove('players/'+b.dataset.rm); }catch(x){ alert(x.message); } });
$('adExport').onclick=()=>{
  if(!ST.meta){ alert('Nothing to export yet.'); return; }
  const sheets=exportSheets(ST.meta,ST.players,ST.rounds,ST.scores,null,factoryLabel,ST.ratings); if(sheets.length&&Object.keys(ST.rounds).length===0){ alert('No rounds have been played yet, so the file will only list the players.'); }
  const blob=new Blob([buildXlsx(sheets)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); const d=new Date(); a.download='factory-floor-results-'+d.getFullYear()+String(d.getMonth()+1).padStart(2,'0')+String(d.getDate()).padStart(2,'0')+'.xlsx'; document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); },500);
};
let resetAt=0;
$('adReset').onclick=async()=>{ if(Date.now()-resetAt>4000){ resetAt=Date.now(); $('adReset').textContent='Click again to wipe all players, rounds and scores'; $('adResetMsg').textContent='Export first if you need the record.'; setTimeout(()=>{ if(Date.now()-resetAt>=3900){ $('adReset').textContent='Reset whole game'; $('adResetMsg').textContent=''; } },4000); return; }
  resetAt=0; $('adReset').textContent='Reset whole game'; try{ await db.remove(''); ST.adDirty=false; ST.adKey=''; ST.adFormKey=''; $('adResetMsg').textContent='Game cleared.'; fillSetup(true); }catch(x){ $('adResetMsg').textContent='Could not reset: '+x.message; } };


/* ---------- floor plans (admin): generate, look, choose, shuffle and assign ---------- */
const FL={sel:null,selK:'',busy:'',prog:'',key:''};
function flBuildPool(meta,done){ // makes the floors a few at a time so the page stays responsive
  const k=meta.seed+'|'+meta.pool; if(VIEW.pools[k]) return done(); if(FL.busy===k) return; FL.busy=k;
  const out=[], P=meta.pool, seed=meta.seed; let i=0;
  const step=()=>{ const t=Date.now(); while(i<P&&Date.now()-t<40){ out.push(generateOne(seed,i)); i++; }
    if(i<P){ FL.prog=i+' of '+P; const e=$('flProg'); if(e) e.textContent=FL.prog; setTimeout(step,0); } else { VIEW.pools[k]=out; FL.busy=''; FL.prog=''; done(); } };
  setTimeout(step,0);
}
function flGoodList(pool){ const g=[]; pool.forEach((f,i)=>{ if(!f.failed) g.push(i+1); }); return g; }
function renderFloors(){
  const box=$('flBody'); if(ST.role!=='admin'||!allGot(AD)) return; const meta=ST.meta;
  if(!meta){ FL.key=''; box.innerHTML='<p class="hint">Save the game setup above first.</p>'; return; }
  const need=layoutsNeeded(meta), started=Object.keys(ST.rounds).length>0, k=meta.seed+'|'+meta.pool, ready=!!VIEW.pools[k];
  const key=[meta.seed,meta.pool,meta.fp||0,meta.use||'',meta.seq||'',meta.ppt,meta.rounds,teamList(meta).map(t=>t.name).join('/'),started?1:0,ready?1:0].join('|');
  if(key===FL.key) return; FL.key=key;
  const saved=useList(meta), seqOn=seqList(meta).length>0, per=meta.ppt>1?meta.ppt+' player'+(meta.ppt>1?'s':'')+' per team':'1 floor per round';
  let h='<p>This game needs <b>'+need+'</b> different floor plans ('+(meta.ppt>1?meta.ppt+' players per team × '+meta.rounds+' rounds':meta.rounds+' rounds')+'). '
    +(meta.ppt>1?'Teammates never share a layout: player 1 of every team rotates through one group of '+meta.rounds+' floors, player 2 through the next group, and so on.':'Each player rotates through all '+meta.rounds+' floors, starting at a different one.')+'</p>';
  const defN=meta.fp?meta.pool:Math.min(FF_MAXPOOL,need+3);
  h+='<div class="g3"><label class="f">How many floor plans to generate ('+need+' to '+FF_MAXPOOL+')<input id="flN" type="number" min="'+need+'" max="'+FF_MAXPOOL+'" value="'+defN+'"'+(started?' disabled':'')+'></label>'
    +'<div style="align-self:end"><button class="btn hz" id="flGen"'+(started?' disabled':'')+'>'+(meta.fp?'Generate again':'Generate floor plans')+'</button></div></div><div class="hint" id="flMsg"></div>';
  if(started) h+='<p class="hint">Locked: round 1 has started, so floor plans can no longer change.</p>';
  if(!meta.fp){ box.innerHTML=h+'<p class="hint">Generate the floor plans to see them here. The same seed always gives the same floors.</p>'; bindFloors(meta); return; }
  if(!ready){ box.innerHTML=h+'<p class="hint">Generating floor plans… <span id="flProg">'+(FL.prog||'')+'</span></p>'; bindFloors(meta); flBuildPool(meta,()=>{ FL.key=''; renderFloors(); }); return; }
  const pool=VIEW.pools[k], good=flGoodList(pool); const sk=k+'|'+(meta.use||'');
  if(!FL.sel||FL.selK!==sk){ FL.selK=sk; FL.sel=new Set(saved.length?saved.filter(n=>good.includes(n)):good); }
  if(pool.length<need){ h+='<p class="hint badc">You have '+pool.length+' floor plans but need '+need+'. Generate at least '+need+'.</p>'; }
  const exact=pool.length===need;
  h+='<div class="flbar"><span class="pill" id="flCount"></span>'
    +(exact||started?'':'<button class="btn" id="flAll">Select all</button><button class="btn" id="flFirst">Select first '+need+'</button><button class="btn" id="flNone">Clear</button>')
    +'<span class="hint">Click a picture to enlarge it. Green is the inbound bay, orange the outbound bay, grey are obstacles.</span></div>';
  h+='<div class="flgrid" id="flGrid">'+pool.map((f,i)=>{ const n=i+1; return f.failed?'<div class="fl bad" data-n="'+n+'"><div class="flhd"><b>Floor '+n+'</b></div><div class="hint">Could not be generated. Generate again with a different count.</div></div>'
    :'<div class="fl" data-n="'+n+'"><div class="flhd"><input type="checkbox" data-n="'+n+'"'+((exact||started)?' disabled':'')+'><b>Floor '+n+'</b></div><canvas data-n="'+n+'" title="Click to enlarge"></canvas><div class="hint">'+esc(f.family)+' · '+f.stats.packed+' cells</div></div>'; }).join('')+'</div>';
  h+='<div class="row2" style="margin-top:12px"><button class="btn hz" id="flAssign"'+(started?' disabled':'')+'>'+(seqOn?'Shuffle again':'Shuffle and assign')+'</button><span class="hint" id="flAsMsg"></span></div>';
  if(seqOn){
    const rows=assignmentRows(meta), R=meta.rounds, solo=meta.ppt<=1;
    h+='<h3 style="margin:16px 0 4px;font-size:14px">Who plays which floor</h3><div class="fltab"><table><tr><th>'+(solo?'Joining order':'Team')+'</th>'+(solo?'':'<th>Player</th>')+Array.from({length:R},(_,r)=>'<th>Round '+(r+1)+'</th>').join('')+'</tr>'
      +rows.map(r=>'<tr><td>'+(solo?'Player '+r.seat:esc(r.team))+'</td>'+(solo?'':'<td>Player '+r.seat+'</td>')+r.cells.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</table></div>'
      +'<p class="hint">'+(solo?'Players are numbered by the order they join; after '+R+' players the pattern repeats.':'Player 1 and player 2 of a team are the first and second to join that team.')+' Pressing “Shuffle again” makes a new random arrangement.</p>';
  }
  box.innerHTML=h; bindFloors(meta);
  box.querySelectorAll('canvas[data-n]').forEach(c=>drawThumb(c,pool[+c.dataset.n-1].rows)); flRefresh(meta);
}
function flRefresh(meta){
  if(!FL.sel||!$('flCount')) return; const need=layoutsNeeded(meta), pool=VIEW.pools[meta.seed+'|'+meta.pool]; if(!pool) return;
  const n=FL.sel.size, started=Object.keys(ST.rounds).length>0, exact=pool.length===need, saved=(meta.use||'');
  const cur=[...FL.sel].sort((a,b)=>a-b).join(',');
  $('flCount').textContent='Selected '+n+' of '+need+' needed'; $('flCount').style.borderColor=n===need?'var(--ok)':'var(--warn)';
  document.querySelectorAll('#flGrid .fl[data-n]').forEach(el=>{ const on=FL.sel.has(+el.dataset.n); el.classList.toggle('on',on); const c=el.querySelector('input'); if(c) c.checked=on; });
  const msg=$('flAsMsg'), btn=$('flAssign'); if(!msg||!btn) return;
  btn.disabled=started||n!==need;
  msg.className='hint'; msg.textContent=n>need?'Deselect '+(n-need)+' more floor'+(n-need>1?'s':'')+'.':n<need?'Select '+(need-n)+' more floor'+(need-n>1?'s':'')+'.':(saved===cur&&seqList(meta).length?'Saved and assigned.':'Ready: shuffle and assign to save this choice.');
  if(n===need&&saved===cur&&seqList(meta).length) msg.className='hint ok';
  if(exact&&n!==need){ msg.textContent='Some floors could not be generated. Generate again.'; msg.className='hint badc'; }
}
function bindFloors(meta){
  const need=layoutsNeeded(meta), msg=$('flMsg');
  $('flGen').onclick=async()=>{
    const n=Math.max(need,Math.min(FF_MAXPOOL,Math.round(+$('flN').value)||need)); msg.className='hint'; msg.textContent='Saving…';
    try{
      const upd={'meta/pool':n,'meta/fp':1}; const bad=useList(meta).some(x=>x>n); if(bad){ upd['meta/use']=null; upd['meta/seq']=null; upd['meta/shuf']=null; }
      await db.update('',upd); ST.adFormKey=''; FL.key='';
    }catch(x){ msg.className='hint badc'; msg.textContent='Could not save: '+x.message; }
  };
  const grid=$('flGrid'); if(!grid) return;
  const all=()=>flGoodList(VIEW.pools[meta.seed+'|'+meta.pool]);
  if($('flAll')) $('flAll').onclick=()=>{ FL.sel=new Set(all()); flRefresh(meta); };
  if($('flFirst')) $('flFirst').onclick=()=>{ FL.sel=new Set(all().slice(0,need)); flRefresh(meta); };
  if($('flNone')) $('flNone').onclick=()=>{ FL.sel=new Set(); flRefresh(meta); };
  grid.onclick=e=>{
    const cb=e.target.closest('input[data-n]'); if(cb){ const n=+cb.dataset.n; if(cb.checked) FL.sel.add(n); else FL.sel.delete(n); flRefresh(meta); return; }
    const cv=e.target.closest('canvas[data-n]'); if(cv) flBig(meta,+cv.dataset.n);
  };
  $('flAssign').onclick=async()=>{
    const use=[...FL.sel].sort((a,b)=>a-b); if(use.length!==need) return; const token=nowMs();
    try{ await db.update('',{'meta/use':use.join(','),'meta/seq':shuffleAssign(use,meta.ppt,meta.rounds,token),'meta/shuf':token}); ST.adFormKey=''; FL.key=''; }
    catch(x){ $('flAsMsg').className='hint badc'; $('flAsMsg').textContent='Could not save: '+x.message; }
  };
}
function flBig(meta,n){
  const f=VIEW.pools[meta.seed+'|'+meta.pool][n-1]; $('flBigT').textContent='Floor '+n+' · '+f.family; $('flBig').classList.add('on');
  $('flBigP').textContent='Usable space '+f.stats.packed+' cells · inbound bay '+f.inb.len+' cells · outbound bay '+f.out.len+' cells. Shown as the player sees it.';
  setTimeout(()=>drawBuild($('flBigCv'),meta,1,0,[],null,'iso',n),20);
}
$('flBigX').onclick=()=>$('flBig').classList.remove('on'); $('flBig').addEventListener('click',e=>{ if(e.target===$('flBig')) $('flBig').classList.remove('on'); });


/* ---------- Demo mode: one person tests the game alone. Runs only in this browser, nothing goes to the database. ---------- */
const DEMOK='ffdemo';
const DM={seed:'OPS-1',rounds:6,pool:12,K:4,fi:0,round:1,lay:0,target:null,budget:null,minutes:12,tr:null,tm:{state:'idle',left:720000,endAt:0,add:0},items:[]};
let dmSig='', dmKey='';
function dmSave(){ try{ localStorage.setItem(DEMOK,JSON.stringify(DM)); }catch(x){} }
function dmLoadSaved(){ try{ const o=JSON.parse(localStorage.getItem(DEMOK)||'null'); if(o&&typeof o==='object') Object.assign(DM,o); }catch(x){} }
function dmLeft(){ const t=DM.tm; return t.state==='running'?Math.max(0,t.endAt-Date.now()):t.state==='ended'?0:t.left; }
function dmState(){ const t=DM.tm; if(t.state==='running'&&Date.now()>=t.endAt){ t.state='ended'; t.left=0; dmSave(); } return t.state; }
function dmFloorKey(){ return [DM.seed,DM.rounds,DM.pool,DM.K,DM.fi,DM.round,DM.lay].join('|'); }
/* ---------- demo: look at the game as each role. Admin, Game Master and Judges run the real screens on a private sample event that
   lives only in this page, so nothing here can touch the real game ---------- */
const POVS=[['player','Player'],['admin','Admin'],['gm','Game Master'],['judge1','Judge 1'],['judge2','Judge 2']];
$('pov').innerHTML=POVS.map(([k,l])=>'<button data-pov="'+k+'">'+l+'</button>').join('')+'<select id="povMoment" title="Which moment of the sample event to look at"><option value="lobby">Lobby</option><option value="running">Round running</option><option value="judging">Judges rating</option><option value="reveal">Reveal ready</option><option value="final">Final</option></select><button id="povReset" title="Start the sample event again from its first state">Reset sample</button>';
function povBar(){ const on=!!ST.demoOn; $('pov').style.display=on?'flex':'none'; document.body.classList.toggle('demo',on);
  $('pov').querySelectorAll('button[data-pov]').forEach(b=>b.classList.toggle('on',b.dataset.pov===ST.pov)); $('povReset').style.display=on&&ST.pov&&ST.pov!=='player'?'':'none'; const mo=$('povMoment'); mo.style.display=on&&ST.pov&&ST.pov!=='player'?'':'none'; mo.value=ST.moment||'judging'; }
async function seedSample(){
  const mem=MemoryStore(true), now=Date.now(), cfg=cloneCfg(), mo=ST.moment||'judging';
  const NS=Math.max(6,Math.min(80,+ST.sampleN||6)), tms={}; if(NS===6){ tms.t1='Alpha'; tms.t2='Beta'; tms.t3='Gamma'; } else for(let k=1;k<=Math.ceil(NS/2);k++) tms['t'+k]='Team '+k;
  const meta={seed:DM.seed,rounds:mo==='final'?1:DM.rounds,pool:Math.min(FF_MAXPOOL,layoutsNeeded({ppt:2,rounds:DM.rounds})+3),K:4,ppt:2,teams:tms,created:now};
  const au=suggestFor(meta), target=au.target, budget=au.budget, names=['Asha','Bo','Cy','Dev','Esha','Farid'].concat(Array.from({length:NS-6},(_,i)=>'Player '+(i+7)));
  const rp=mo==='running'?startRound(DM.minutes,target,budget,now-150000):Object.assign(startRound(DM.minutes,target,budget,now-(DM.minutes+3)*60000),{status:'ended',leftMs:0,endAt:now-3*60000});
  const up={meta,game:mo==='lobby'?{phase:'lobby',round:0,upd:now}:{phase:mo==='final'?'done':'round',round:1,upd:now}}; if(mo!=='lobby') up['rounds/1']=rp;
  names.forEach((nm,i)=>{ const uid=nm.toLowerCase(), ord=i%2, fi=ord%4, p={email:uid+DOMAIN,name:nm,team:'t'+(1+(i>>1)),ord,fi,joined:now-60000*(10-i),seen:now}; up['players/'+uid]=p;
    const fl=floorOf(meta,1,fi,0), ctx=floorCtx(fl.floor.rows), m=roundM(meta.seed,1,cfg), P={target,budget,need:needSpace(FACTORIES[fi],target,m),m,f:FACTORIES[fi]};
    if(mo==='lobby') return;
    const items=sampleLayout(ctx,cfg,P,i%4), rate=Math.round(target*(0.5+0.08*i)), cost=Math.round(budget*(0.45+0.07*i)), auto=30+i*9, lost=(6-i)*40;
    const pts={close:Math.round(auto*0.45*10)/10,spend:Math.round(auto*0.33*10)/10,store:Math.round(auto*0.22*10)/10,layout:0}, rmt=(MIX[FACTORIES[fi]]||[]).map(x=>x[0]+':'+Math.round(lost*x[1]*10)/10).join(',');
    up['builds/1/'+uid]={items:JSON.stringify(items),score:auto,pts,rate,cost,t:now,demoRate:Math.round(target*(NS===6?[.95,.85,.72,.6,.48,.33][i]:.3+.65*((i*37)%NS)/NS)),demoCap:[.9,.75,.5,.85,.45,.6][i%6]};
    up['scores/1/'+uid]={score:auto,pts,rate,cost,fg:Math.round(rate*DM.minutes*0.85),rm:lost,rmt,t:now}; });
  if(mo==='judging'){ up['ratings/1/asha/j1']={v:4.5,t:now}; up['ratings/1/asha/j2']={v:4,t:now}; up['ratings/1/bo/j1']={v:3.5,t:now}; }
  else if(mo==='reveal'||mo==='final') names.forEach((nm,i)=>{ const u=nm.toLowerCase(); up['ratings/1/'+u+'/j1']={v:[4.5,3.5,2.5,4,3,2][i%6],t:now}; up['ratings/1/'+u+'/j2']={v:[4,3,3,3.5,2.5,2][i%6],t:now}; });
  await mem.update('',up); return mem;
}
async function setPov(pov){
  if(!ST.demoOn||ST.busyPov) return; ST.busyPov=true;
  try{
    stopDemo(); stopAll(); ST.pov=pov;
    if(pov==='player'){ db=ST.mainDb; ST.role='demo'; startDemo(); }
    else { if(!ST.sbx) ST.sbx=await seedSample(); db=ST.sbx; ST.role=pov==='admin'?'admin':pov==='gm'?'gm':'judge';
      if(ST.role==='judge') ST.judge=pov==='judge2'?2:1; if(pov==='admin') startAdmin(); else if(pov==='gm') startGm(); else startJudge(); }
    povBar();
  } finally { ST.busyPov=false; }
}
$('pov').addEventListener('change',async e=>{ if(e.target.id!=='povMoment') return; ST.moment=e.target.value; const cur=ST.pov; ST.sbx=null; await setPov('player'); await setPov(cur); });
$('pov').addEventListener('click',async e=>{ const b=e.target.closest('button'); if(!b) return; if(b.id==='povMoment') return; if(b.id==='povReset'){ const cur=ST.pov; ST.sbx=null; await setPov('player'); await setPov(cur); return; } if(b.dataset.pov&&b.dataset.pov!==ST.pov) setPov(b.dataset.pov); });
function startDemo(){
  dmLoadSaved(); show('app'); $('setupBtn').style.display=''; dmSig=''; dmKey='';
  Builder.onChange=d=>{ if(ST.role!=='demo') return; DM.items=d.items; dmSave(); };
  dmLoadFloor(false); dmTick();
}
function stopDemo(){ $('setupBtn').style.display='none'; $('demoSetup').classList.remove('on'); if(Builder.onChange) Builder.onChange=null; }
function dmLoadFloor(fresh){
  const k=dmFloorKey(); if(fresh&&k!==dmKey) DM.items=[]; dmKey=k;
  Builder.onChange=d=>{ if(ST.role!=='demo') return; DM.items=d.items; dmSave(); };
  Builder.load({seed:DM.seed,pool:DM.pool,K:DM.K,R:DM.rounds,round:DM.round,fi:DM.fi,lay:DM.lay||0,use:null,target:DM.target,budget:DM.budget,items:DM.items,who:'Demo'});
  dmSig=''; dmSave();
}
function dmTick(){
  if(ST.role!=='demo'||ST.screen!=='app') return; const st=dmState(), left=dmLeft(), S=Builder.state;
  const lab={idle:'Not started',running:'Time left',paused:'Paused',ended:"Time's up"}[st], cls=st==='ended'?'end':st==='paused'?'pause':st==='idle'?'':(left<=30000?'bad':left<=120000?'warn':'run');
  Builder.setClock(lab,mmss(left),cls);
  const dTot=DM.minutes*60+(DM.tm.add||0); Builder.setTrucks(DM.tr,dTot); Builder.setLive(st==='idle'?null:Math.max(0,Math.min(dTot,Math.round(dTot-left/1000))));
  if($('demoSetup').classList.contains('on')){ $('dmStatus').value=lab+' · '+mmss(left); $('dmTe').textContent=truckNowEvery(DM.tr,Math.max(0,Math.round(dTot-left/1000)))+' s'; }
  const an=S.an, sig=st+(st==='ended'&&an?num(an.sim?an.sim.shipped:0,1):''); if(sig===dmSig) return; dmSig=sig;
  if(st==='paused'){ Builder.flush(); Builder.setLock(true,{title:'Paused',cls:'paused',html:'<p>The timer is paused. Open Setup and press Pause again to resume.</p>'}); }
  else if(st==='ended'){ Builder.flush(); Builder.setLock(true,{title:"Time's up",html:'<div class="hl" style="margin:6px 0 12px;text-align:left">'+hlHtml(hlOf(an&&an.sim,null),false,true)+'</div><p>Line rate '+num(an?an.rate:0,1)+' of '+num(S.target)+' units/min · spent '+inr(an?an.cost:0)+'. (In a real game the judges add up to 10 points for layout and flow.)</p><p>Open Setup to add time or reset the timer.</p>'}); }
  else Builder.setLock(false);
}
function dmTime(fn){ fn(DM.tm); dmSave(); dmSig=''; dmTick(); }
const dmStart=()=>dmTime(t=>{ if(t.state==='ended'||t.state==='running') return; if(t.state==='idle') t.left=DM.minutes*60000; t.endAt=Date.now()+t.left; t.state='running'; });
$('dmStart').onclick=dmStart;
$('dmPause').onclick=()=>dmTime(t=>{ if(t.state==='running'){ t.left=Math.max(0,t.endAt-Date.now()); t.state='paused'; } else if(t.state==='paused'){ t.endAt=Date.now()+t.left; t.state='running'; } });
const dmAdd=sec=>dmTime(t=>{ t.add=(t.add||0)+sec; if(t.state==='running') t.endAt+=sec*1000; else if(t.state==='paused'||t.state==='idle') t.left+=sec*1000; else if(t.state==='ended'){ t.left=sec*1000; t.endAt=Date.now()+t.left; t.state='running'; } });
$('dmAdd1').onclick=()=>dmAdd(60); $('dmAdd5').onclick=()=>dmAdd(300);
$('dmEnd').onclick=()=>dmTime(t=>{ t.state='ended'; t.left=0; });
$('dmReset').onclick=()=>dmTime(t=>{ t.state='idle'; t.left=DM.minutes*60000; t.endAt=0; t.add=0; DM.tr=null; });
function dmTruck(act){ if(dmState()!=='running'){ alert('Start the timer first, then send trucks.'); return; } const tot=DM.minutes*60+(DM.tm.add||0), el=Math.max(0,Math.round(tot-dmLeft()/1000)); DM.tr=truckApply(DM.tr,el,act); dmSave(); dmTick(); }
['dmTIn:tIn','dmTOut:tOut','dmTDown:tDown','dmTUp:tUp'].forEach(x=>{ const [id,a]=x.split(':'); $(id).onclick=()=>dmTruck(a); });
$('dmMin').onchange=()=>{ const v=Math.max(1,Math.min(60,Math.round(+$('dmMin').value)||1)); DM.minutes=v; $('dmMin').value=v; if(DM.tm.state==='idle') DM.tm.left=v*60000; dmSave(); };
function dmFill(){
  const opt=(a,sel)=>a.map(([v,l])=>'<option value="'+v+'"'+(String(v)===String(sel)?' selected':'')+'>'+l+'</option>').join('');
  $('dmSeed').value=DM.seed; $('dmPool').value=DM.pool; $('dmMin').value=DM.minutes; $('dmTarget').value=DM.target||''; $('dmBudget').value=DM.budget||'';
  $('dmRounds').innerHTML=opt([5,6,7,8,9,10].map(n=>[n,n]),DM.rounds); $('dmK').innerHTML=opt([1,2,3,4].map(n=>[n,n]),DM.K);
  dmDeps();
}
function dmDeps(){ // factory, round and floor lists follow rounds, team size and pool
  const R=+$('dmRounds').value, K=+$('dmK').value, P=Math.max(5,Math.min(20,+$('dmPool').value||12)); const opt=(a,sel)=>a.map(([v,l])=>'<option value="'+v+'"'+(String(v)===String(sel)?' selected':'')+'>'+l+'</option>').join('');
  $('dmFactory').innerHTML=opt(Array.from({length:K},(_,i)=>[i,'Factory '+FACTORIES[i]]),Math.min(DM.fi,K-1)); $('dmRound').innerHTML=opt(Array.from({length:R},(_,i)=>[i+1,'Round '+(i+1)]),Math.min(DM.round,R));
  $('dmLay').innerHTML=opt([[0,'Automatic (rotation)'],...Array.from({length:P},(_,i)=>[i+1,'Floor '+(i+1)])],DM.lay<=P?DM.lay:0);
}
['dmRounds','dmK','dmPool'].forEach(id=>$(id).addEventListener('change',dmDeps));
$('dmNewSeed').onclick=()=>{ $('dmSeed').value='OPS-'+Math.floor(1000+Math.random()*9000); };
$('setupBtn').onclick=()=>{ dmFill(); $('demoSetup').classList.add('on'); dmTick(); };
$('dmCancel').onclick=()=>$('demoSetup').classList.remove('on');
$('demoSetup').addEventListener('click',e=>{ if(e.target===$('demoSetup')) $('demoSetup').classList.remove('on'); });
$('dmApply').onclick=()=>{
  const clamp=(v,a,b,d)=>Math.max(a,Math.min(b,Math.round(+v)||d));
  DM.seed=($('dmSeed').value||'').trim()||'OPS-1'; DM.rounds=clamp($('dmRounds').value,5,10,6); DM.pool=clamp($('dmPool').value,5,20,12); DM.K=clamp($('dmK').value,1,4,4);
  DM.fi=Math.min(DM.K-1,clamp($('dmFactory').value,0,3,0)); DM.round=Math.min(DM.rounds,clamp($('dmRound').value,1,10,1)); DM.lay=Math.min(DM.pool,clamp($('dmLay').value,0,20,0));
  const tg=Math.round(+$('dmTarget').value), bu=Math.round(+$('dmBudget').value); DM.target=tg>=10?Math.min(1000,tg):null; DM.budget=bu>=1000?Math.min(500000,bu):null;
  dmLoadFloor(true); $('demoSetup').classList.remove('on'); dmTick();
};

/* ---------- rules cards: wait screen and the in-game Rules button ---------- */
const RULES=[
 {t:'Your goal',b:['Build a four-stage production line on your floor that reaches this round\'s <b>target</b> (units per minute) and stays inside the <b>budget</b>.','Every round has its own timer, target and budget. Your work saves by itself, and your build locks when time is up.'],tip:'Teams: the team score is the average of its members\' scores.'},
 {t:'How you score (100)',b:['<b>40</b> · Closeness to target: units your line really ships in the truck run against the target. Overshooting loses points too.','<b>30</b> · Spending efficiency: reaching the target for less money.','<b>20</b> · Storage planning: how much of each delivery you could take in, and whether full storage ever blocked the line.','<b>10</b> · Layout and flow: <b>two judges</b> each give up to 5 points (in steps of 0.5) after the round. You do not see a live score; watch the two highlights instead: finished goods shipped and raw material turned away.']},
 {t:'The production line',b:['Order: <b>RM Processor → Assembler → Robo Welder → Packer</b>.','A machine only works if it is fed by the stage before it, by touching it or through a complete belt.','<b>Flow splits.</b> A machine, storage unit or bay that feeds several places shares what it passes on evenly between them. If one of them is already running at its own rate, the leftover goes to the others.','A machine makes the <b>lesser</b> of what it receives and its own rate. Line rate is what reaches the outbound bay. The ◂ mark shows your bottleneck.']},
 {t:'Docking bays',b:['An <b>RM Processor</b> must touch the inbound bay, or take a belt from it.','A <b>Packer</b> must touch the outbound bay, or send a belt to it.','Nothing can be built on the docking bays or on grey obstacles.']},
 {t:'Belts',b:['A belt is <b>motor, connectors, motor</b>. Each motor has a <b>blue</b> end where material goes in and a <b>green</b> end where it comes out; the arrow shows the way.','First motor: its blue end touches the upstream machine or bay and its green end joins the connectors. Second motor: blue end joins the connectors, green end touches the downstream machine or bay.','A complete belt shows arrows on its connectors and gives <b>+10%</b> to every machine touching a motor (max +30%).','Two belts may not touch, corners included. Keep one empty cell between them.','<b>Limits:</b> one machine takes at most 2 belts in and 2 belts out; one storage unit takes 3 in and 3 out. An extra belt is ignored and outlined in red.','More belts do not add speed: they only give a piece more places to share its output with.'],tip:'Tip: tap the Connector card, then drag across the floor to lay a line. One Undo removes the whole line.'},
 {t:'Storage and trucks',b:['Storage and the line <b>start empty</b> when the round starts. A delivery truck brings raw material every 60 seconds; a shipping truck collects finished goods one interval later. The game master can change the interval or send extra trucks.','Put storage between the inbound bay and the RM Processor for raw material, and between the Packer and the outbound bay for finished goods. Touch it, or join it with a complete belt; arrows show the flow.','A unit only counts if it sits in that flow. If storage is full, the truck turns material away.','<b>Joined storage:</b> two storage units that share a full side (at least 2 cells long, not just a corner or one cell) and do the same job (both raw material, or both finished goods) act as <b>one big unit</b>. Their space is pooled, they share one bar, and the belt limit adds up (2 units: 6 in, 6 out). Raw-material and finished-goods units never join.','Watch the storage bars and trucks on the floor as the clock runs. Total capacity should cover the space your deliveries need (see “Deliveries and space needed”).']},
 {t:'Budget and aisle',b:['Spending is capped by the round budget.','Keep an open aisle from the IN bay to the OUT bay.','Cheaper builds score better, as long as the target is still reached.']},
 {t:'Move and turn',b:['<b>Move a piece:</b> press it and drag. Drop it on a free spot, or on the cards at the bottom to remove it. Works any time the floor is open.','<b>Remove:</b> tap a piece, then press Remove (or the Delete key).','<b>Turn a piece:</b> select it and press Rotate (or R).','<b>Turn the whole floor</b> to see behind tall machines: the ⟲ ⟳ buttons, the Q and E keys, Shift + drag, or twist two fingers on a phone.','Pinch or scroll to zoom. Drag empty floor to pan.']},
 {t:'Your floor',b:['The admin gives you a floor and a factory (A to D, which sets your product mix). Teammates get different floors.','Your floor changes between rounds. Read the Score panel for the target, budget and space needed.'],tip:'Open this guide again any time with the Rules button.'}
];
/* picture side of each rule card: icon, one-line headline, a small drawing, 2-4 short lines (the older long text sits under "More detail") */
const RC={m1:'#17b8a6',m2:'#ff8a3d',m3:'#3f8cff',m4:'#a46cf5',y:'#f4c24d',g:'#3fe08f',b:'#5aa0ff',r:'#ff6b7f',w:'#d9d3ff',d:'#2a1a78'};
const fBox=(x,y,w,h,c,t,fs)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="8" fill="'+c+'"/>'+(t?'<text x="'+(x+w/2)+'" y="'+(y+h/2+4)+'" text-anchor="middle" fill="#fff" font-size="'+(fs||11)+'" font-weight="700">'+t+'</text>':'');
const fArr=(x1,x2,y,c)=>'<path d="M'+x1+' '+y+'H'+(x2-5)+'" stroke="'+(c||RC.w)+'" stroke-width="2.5" stroke-linecap="round"/><path d="M'+(x2-7)+' '+(y-5)+'L'+x2+' '+y+'L'+(x2-7)+' '+(y+5)+'Z" fill="'+(c||RC.w)+'"/>';
const fTxt=(x,y,t,c,fs,an)=>'<text x="'+x+'" y="'+y+'" text-anchor="'+(an||'middle')+'" fill="'+(c||RC.w)+'" font-size="'+(fs||10)+'" font-weight="600">'+t+'</text>';
const fSvg=(h,inner)=>'<svg viewBox="0 0 250 '+h+'" role="img" aria-hidden="true">'+inner+'</svg>';
const RV=[
 {ic:'🎯',head:'Hit the target. Stay in budget.',pts:['Build a 4-machine line on your floor','Reach the <b>units per minute</b> target','Overshooting loses points too'],
  fig:fSvg(70,fBox(8,12,104,46,RC.m1,'')+fTxt(60,32,'TARGET',RC.w,10)+fTxt(60,50,'units / min','#fff',13)+fBox(138,12,104,46,RC.m2,'')+fTxt(190,32,'BUDGET',RC.w,10)+fTxt(190,50,'₹ cap','#fff',13)+fTxt(125,40,'+',RC.w,18))},
 {ic:'🏆',head:'100 points to win',pts:['<b>90</b> are scored by the computer','<b>10</b> come from two judges after the round','No live score: watch <b>shipped</b> and <b>turned away</b>'],
  fig:fSvg(78,fBox(8,8,92.8,34,RC.m1,'40',15)+fBox(100.8,8,69.6,34,RC.m2,'30',15)+fBox(170.4,8,46.4,34,RC.m3,'20',15)+fBox(216.8,8,25.2,34,RC.m4,'10',12)+fTxt(54,58,'🎯 Target',RC.w,10)+fTxt(135,58,'💰 Spend',RC.w,10)+fTxt(193,58,'📦 Storage',RC.w,10)+fTxt(242,72,'⚖ Judges',RC.w,10,'end'))},
 {ic:'🏭',head:'Four machines, in order',pts:['Each one must be <b>fed by the one before</b>','Touch it, or join it with a complete belt','Line rate is the slowest link, marked ◂'],
  fig:fSvg(70,fBox(4,14,50,40,RC.m1,'RM',13)+fArr(56,70,34)+fBox(72,14,50,40,RC.m2,'ASM',12)+fArr(124,138,34)+fBox(140,14,50,40,RC.m3,'WELD',12)+fArr(192,206,34)+fBox(208,14,40,40,RC.m4,'PACK',11))},
 {ic:'🚪',head:'In at one end, out at the other',pts:['The <b>RM Processor</b> touches the inbound bay','The <b>Packer</b> touches the outbound bay','No building on the bays or the grey blocks'],
  fig:fSvg(70,fBox(4,10,46,50,RC.y,'IN',16)+fBox(50,18,48,34,RC.m1,'RM',13)+fTxt(125,40,'· · ·',RC.w,18)+fBox(150,18,48,34,RC.m4,'PACK',11)+fBox(198,10,48,50,RC.g,'OUT',16))},
 {ic:'🔗',head:'A belt is three parts',pts:['<b>Motor, connectors, motor</b>','<b>Blue</b> end takes material in, <b>green</b> end lets it out','A complete belt gives machines <b>+10%</b>','Leave one empty cell between two belts'],
  fig:fSvg(70,fBox(6,18,44,34,RC.m3,'')+fBox(6,18,12,34,RC.b,'')+fBox(38,18,12,34,RC.g,'')+fTxt(28,40,'MOTOR','#fff',9)+fBox(58,22,18,26,RC.y,'')+fBox(80,22,18,26,RC.y,'')+fBox(102,22,18,26,RC.y,'')+fBox(124,22,18,26,RC.y,'')+fBox(146,22,18,26,RC.y,'')+fBox(172,18,44,34,RC.m3,'')+fBox(172,18,12,34,RC.b,'')+fBox(204,18,12,34,RC.g,'')+fTxt(194,40,'MOTOR','#fff',9)+fArr(222,246,35,RC.y)+fTxt(12,12,'IN',RC.b,9)+fTxt(44,12,'OUT',RC.g,9))},
 {ic:'🚚',head:'Trucks bring and take',pts:['Everything <b>starts empty</b>; trucks come about every minute','Storage <b>before the RM</b> and <b>after the Packer</b>','Full storage: the truck <b>turns material away</b>'],
  fig:fSvg(70,fBox(2,26,34,22,RC.y,'🚚',14)+fArr(38,56,37)+fBox(58,18,36,38,RC.m2,'STORE',9)+fArr(96,110,37)+fBox(112,22,28,30,RC.m1,'RM',11)+fTxt(150,40,'···',RC.w,14)+fBox(160,22,28,30,RC.m4,'PK',11)+fArr(190,204,37)+fBox(206,18,36,38,RC.m2,'STORE',9))},
 {ic:'💰',head:'Cheap and clear',pts:['Spend is capped by the round budget','Same target for less money scores higher','Keep an open aisle from IN to OUT'],
  fig:fSvg(60,fBox(6,14,150,26,RC.d,'')+fBox(6,14,96,26,RC.g,'')+fTxt(54,31,'spent','#06281a',11)+fTxt(130,31,'left',RC.w,11)+fTxt(6,54,'₹0',RC.w,9,'start')+fTxt(156,54,'BUDGET',RC.w,9,'end')+fBox(172,14,70,26,RC.y,'IN → OUT',9))},
 {ic:'✋',head:'Move, turn, remove',pts:['<b>Drag</b> a piece to move it; drop on the bottom cards to remove','<b>R</b> turns a piece; <b>Q</b> and <b>E</b> turn the whole floor','Pinch or scroll to zoom, drag the floor to pan'],
  fig:fSvg(60,fBox(4,8,56,44,RC.d,'✋ drag',11)+fBox(66,8,56,44,RC.d,'↻ R',12)+fBox(128,8,56,44,RC.d,'⟲ ⟳',13)+fBox(190,8,56,44,RC.d,'🗑',16))},
 {ic:'🗺',head:'Your own floor',pts:['The admin gives you a floor and a factory (A to D)','The floor changes every round','Read the <b>Score</b> panel for target and budget'],
  fig:fSvg(70,'<path d="M20 44L70 18L120 44L70 62Z" fill="#cfd8df"/><path d="M110 40L160 14L222 46L170 66Z" fill="#cfd8df"/><rect x="132" y="28" width="12" height="10" fill="#4a5360"/><rect x="190" y="40" width="14" height="10" fill="#4a5360"/>'+fTxt(70,12,'Round 1',RC.w,10)+fTxt(172,10,'Round 2',RC.w,10))}
];
function mountRules(box,dots){
  box.innerHTML=RULES.map((r,i)=>{ const v=RV[i]||{pts:[],head:''};
    return '<article class="rcard"><div class="rtop"><span class="rico">'+(v.ic||'')+'</span><h4>'+esc(r.t)+'</h4></div>'+(v.fig?'<div class="rfig">'+v.fig+'</div>':'')+'<p class="rhead">'+esc(v.head||'')+'</p><ul class="rpts">'+v.pts.map(x=>'<li>'+x+'</li>').join('')+'</ul>'
      +'<details class="rmore"><summary>More detail</summary><ul>'+r.b.map(x=>'<li>'+x+'</li>').join('')+'</ul>'+(r.tip?'<p class="rtip">'+r.tip+'</p>':'')+'</details></article>'; }).join('');
  dots.innerHTML=RULES.map(()=>'<i></i>').join(''); const cards=[...box.children], ds=[...dots.children];
  const upd=()=>{ if(!box.offsetParent) return; const c=box.getBoundingClientRect(); let best=0, bd=1e9; cards.forEach((el,i)=>{ const r=el.getBoundingClientRect(), d=Math.abs(r.left+r.width/2-(c.left+c.width/2)); if(d<bd){ bd=d; best=i; } }); ds.forEach((d,i)=>d.classList.toggle('on',i===best)); };
  box.addEventListener('scroll',()=>requestAnimationFrame(upd),{passive:true}); window.addEventListener('resize',upd);
  ds.forEach((d,i)=>d.onclick=()=>box.scrollTo({left:cards[i].offsetLeft-(box.clientWidth-cards[i].offsetWidth)/2,behavior:'smooth'}));
  upd(); return upd;
}
mountRules($('rulesWait'),$('rulesWaitDots'));
const updRulesIn=mountRules($('rulesIn'),$('rulesInDots'));
$('rulesBtn').onclick=()=>{ $('rulesModal').classList.add('on'); $('rulesIn').scrollLeft=0; setTimeout(updRulesIn,30); };
$('rulesClose').onclick=()=>$('rulesModal').classList.remove('on');
$('rulesModal').addEventListener('click',e=>{ if(e.target===$('rulesModal')) $('rulesModal').classList.remove('on'); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ $('rulesModal').classList.remove('on'); $('flBig').classList.remove('on'); } });

/* ---------- Game Master ---------- */
const GMK=['meta','game','rounds','trucks','ratings','players','scores'];
let gmTab='show', gmUid=null, gmOff=null, gmLayRound=0, gmDraw=null;
function startGm(){ show('gm'); gmTab='show'; gmStop(); $('gmBody').innerHTML=''; $('gmBody').classList.remove('showmode'); document.querySelectorAll('.tabs button').forEach(b=>b.classList.toggle('on',b.dataset.tab===gmTab)); subscribe(GMK,renderGm); }
document.querySelectorAll('.tabs button').forEach(b=>b.onclick=()=>{ gmTab=b.dataset.tab; document.querySelectorAll('.tabs button').forEach(x=>x.classList.toggle('on',x===b)); const bd=$('gmBody'); bd.innerHTML=''; bd.className='gmbody'; bd.dataset.k=''; bd.dataset.rn=''; bd.dataset.sn=''; bd.dataset.sd=''; bd.onclick=null; renderGm(true); });
let gmT=null; function renderGm(now){ if(ST.role!=='gm'||!allGot(GMK)) return; if(now===true){ drawGm(); return; } clearTimeout(gmT); gmT=setTimeout(drawGm,120); }
function gmRoundNo(){ const g=ST.game||{}; return g.round||0; }
function drawGm(){
  const meta=ST.meta, g=ST.game||{phase:'lobby',round:0}; const body=$('gmBody');
  const ended=g.phase==='round'&&roundState(roundNow(),nowMs())==='ended';
  $('gmBar').classList.toggle('on',g.phase==='setup');
  $('gmRound').textContent=!meta?'Waiting for the admin':g.phase==='lobby'?'Game starting soon':g.phase==='done'?'Final results':'Round '+g.round+' of '+meta.rounds;
  if(!meta){ body.innerHTML='<p class="hint" style="font-size:20px">The admin has not set up the game yet.</p>'; return; }
  gmSubBuilds(); if(gmTab==='show') showTick(); else if(gmTab==='sb') drawScoreboard(body); else if(gmTab==='lv') drawLive(body); else drawLayouts(body);
}
function judgeMark(p,n){ const r=ST.rounds[n]; return r&&roundState(r,nowMs())==='ended'&&(p.jc[n]||0)<JUDGES?' <span title="Waiting for the judges">⏳</span>':''; }
function drawJudgeBoard(body){
  const meta=ST.meta, g=ST.game||{}, st=standings(meta,ST.players,ST.rounds,ST.scores,null,ST.ratings), n=g.round||0, teams=usesTeams(meta);
  const row=(rk,nm,sub,per,tot,mx,mark)=>'<div class="jb-row'+(rk<=3?' top':'')+'"><b class="jb-rk r'+rk+'">'+rk+'</b><div class="jb-nm">'+esc(nm)+(sub?'<small>'+esc(sub)+'</small>':'')+'</div><div class="jb-bar"><u style="width:'+(mx>0?Math.max(2,tot/mx*100):0)+'%"></u></div><span class="jb-rd"><small>Round '+(n||'–')+'</small>'+'<em>'+num(per,1)+(mark||'')+'</em></span><b class="jb-tt">'+num(tot,1)+'</b></div>';
  const mxP=Math.max(1,...st.players.map(p=>p.total)), pl='<h2>Players</h2><div class="jb">'+st.players.map(p=>row(p.rank,p.name,teams?p.team:'',p.per[n]||0,p.total,mxP,judgeMark(p,n))).join('')+'</div><p class="hint">⏳ means the judges have not both rated that round yet, so the points are not final.</p>';
  let tm=''; if(teams){ const mxT=Math.max(1,...st.teams.map(t=>t.total)); tm='<h2>Teams</h2><div class="jb">'+st.teams.map(t=>row(t.rank,t.name,'',t.per[n]||0,t.total,mxT,'')).join('')+'</div><p class="hint">Team score is the average of its members\' scores.</p>'; }
  body.innerHTML='<div class="sb"><div>'+(st.players.length?pl:'<p class="hint" style="font-size:20px">No players have joined yet.</p>')+'</div><div>'+tm+'</div></div>';
}
function drawLive(body){
  const meta=ST.meta, g=ST.game||{}, n=g.round||0;
  if(!n){ body.innerHTML='<p class="hint" style="font-size:20px">The live build appears once round 1 starts.</p>'; return; }
  const st=standings(meta,ST.players,ST.rounds,ST.scores,null,ST.ratings);
  if(!gmUid||!ST.players[gmUid]) gmUid=st.players.length?st.players[0].uid:null;
  if(!body.querySelector('.lv')||body.dataset.rn!==String(n)){ body.dataset.rn=String(n); body.innerHTML='<div class="lv"><div class="list" id="lvList"></div><div class="view"><canvas id="lvCv"></canvas><div class="cap" id="lvCap"></div><div class="stats" id="lvSt"></div></div></div>'; subLive(); }
  const pts=gmRevealN>=n; $('lvList').innerHTML=st.players.map(p=>'<button data-u="'+p.uid+'" class="'+(p.uid===gmUid?'on':'')+'"><span>'+esc(p.name)+'</span><b>'+(pts?num(p.per[n]||0,1):'')+'</b></button>').join('')||'<p class="hint" style="padding:12px">Nobody yet.</p>';
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
  const lay=layoutOf(ST.meta,p,n), r=drawBuild(cv,ST.meta,n,p.fi,gmItems,Object.assign({},rp,{tr:trFor(n)}),'iso',lay,nowMs()); const an=r.an;
  $('lvCap').innerHTML='<b>'+esc(p.name)+'</b>'+(usesTeams(ST.meta)?' · '+esc(teamName(ST.meta,p)):'')+' · '+esc(factoryLabel(p.fi))+' · Floor '+r.floor.index;
  const jp=judgePts(ST.ratings,n,gmUid), pts=gmRevealN>=n; $('lvSt').innerHTML=(pts?'Computer points <b>'+num(an.total,1)+'</b> / 90 · judges <b>'+num(jp.pts,1)+'</b> / 10 ('+jp.count+' of '+JUDGES+' rated)<br>':'')+'Line rate '+num(an.rate,1)+' of '+num(rp.target)+' units/min<br>Spent '+inr(an.cost)+' of '+inr(rp.budget);
}
function drawLayouts(body){
  const meta=ST.meta, started=Object.keys(ST.rounds).map(Number).sort((a,b)=>a-b);
  if(!started.length){ body.innerHTML='<p class="hint" style="font-size:20px">Layouts appear once round 1 starts.</p>'; return; }
  const cur=ST.game&&ST.game.round?ST.game.round:started[started.length-1]; if(!started.includes(gmLayRound)) gmLayRound=cur;
  const assigned=seqList(meta).length>0, pl=Object.keys(ST.players).map(u=>ST.players[u]);
  const key='lay'+gmLayRound+'|'+meta.seed+'|'+meta.pool+'|'+(meta.seq||'')+'|'+pl.length; if(body.dataset.k===key&&body.querySelector('.lay')) return; body.dataset.k=key; body.dataset.rn='';
  let tiles;
  if(assigned){ // one tile per floor in use this round, with the players who have it
    const by={}; assignmentRows(meta).forEach(r=>{ const n=r.cells[gmLayRound-1]; if(n) by[n]=by[n]||[]; });
    pl.forEach(p=>{ const n=layoutOf(meta,p,gmLayRound); if(n) (by[n]=by[n]||[]).push(p); });
    tiles=Object.keys(by).map(Number).sort((a,b)=>a-b).map(n=>{ const f=floorOf(meta,gmLayRound,0,n), who=by[n].map(p=>esc(p.name)+(usesTeams(meta)?' ('+esc(teamName(meta,p))+')':'')).join(', ');
      return '<div class="tile"><canvas data-lay="'+n+'"></canvas><div class="tt"><b>Floor '+n+'</b><span class="hint">'+esc(f.floor.family)+(who?' · '+who:'')+'</span></div></div>'; }).join('');
  } else tiles=Array.from({length:meta.K},(_,i)=>{ const f=floorOf(meta,gmLayRound,i); return '<div class="tile"><canvas data-fi="'+i+'"></canvas><div class="tt"><b>'+esc(factoryLabel(i))+'</b><span class="hint">Floor '+f.index+' · '+esc(f.floor.family)+'</span></div></div>'; }).join('');
  body.innerHTML='<div class="row2" style="margin-bottom:12px"><span class="hint" style="font-size:16px">Round</span>'+started.map(n=>'<button class="btn" data-lr="'+n+'" style="'+(n===gmLayRound?'background:var(--hazard);color:#1a1a1a;font-weight:700':'')+'">'+n+'</button>').join('')+'</div><div class="lay">'+tiles+'</div>';
  body.onclick=e=>{ const b=e.target.closest('[data-lr]'); if(b){ gmLayRound=+b.dataset.lr; body.dataset.k=''; drawLayouts(body); } };
  body.querySelectorAll('canvas[data-fi]').forEach(c=>drawBuild(c,meta,gmLayRound,+c.dataset.fi,[],ST.rounds[gmLayRound],'iso'));
  body.querySelectorAll('canvas[data-lay]').forEach(c=>drawBuild(c,meta,gmLayRound,0,[],ST.rounds[gmLayRound],'iso',+c.dataset.lay));
}
/* ---------- Game Master show screen: made for the big screen ---------- */
let gmBN=0, gmBOff=null, gmBuilds={}, gmRevealN=0, gmRev=null, gmSpot={uid:null,until:0,i:0}, gmRaf=0, gmBudget=6, gmRoad=null, gmTk='', gmChips=new Set(), gmLobbyN=new Set();
const gmPl=new Map();
function gmStop(){ if(gmBOff){ gmBOff(); gmBOff=null; } gmBN=0; gmBuilds={}; gmPl.clear(); gmRevealN=0; gmRev=null; gmSpot={uid:null,until:0,i:0}; gmRoad=null; gmTk=''; gmChips=new Set(); gmLobbyN=new Set(); cancelAnimationFrame(gmRaf); gmRaf=0; }
function gmSubBuilds(){ const n=gmRoundNo(); if(n===gmBN) return; if(gmBOff){ gmBOff(); gmBOff=null; } gmBN=n; gmBuilds={}; gmPl.clear(); if(n) gmBOff=db.on('builds/'+n,v=>{ gmBuilds=v||{}; }); }
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x)), lerp=(a,b,k)=>a+(b-a)*k, easeO=k=>1-Math.pow(1-clamp(k,0,1),3);
function countTo(el,to,dec){ const from=+el.dataset.v||0; if(el.dataset.v!=null&&Math.abs(from-to)<1e-9) return; el.dataset.v=to; const t0=performance.now(); const my=(el._tw=(el._tw||0)+1);
  const step=now=>{ if(el._tw!==my) return; const k=Math.min(1,(now-t0)/800); el.textContent=num(lerp(from,to,easeO(k)),dec||0); if(k<1) requestAnimationFrame(step); }; requestAnimationFrame(step); }
/* rows that glide to their new place when the order changes */
function placeRows(box,rows,rowH,make,update,cols){
  const nodes=box._n||(box._n=new Map()), seen=new Set(); cols=cols||1; const colW=box.clientWidth/cols, per=Math.ceil(rows.length/cols);
  const pos=i=>cols>1?'translate('+Math.floor(i/per)*colW+'px,'+(i%per)*rowH+'px)':'translateY('+(i*rowH)+'px)';
  rows.forEach((r,i)=>{ let n=nodes.get(r.key); if(!n){ n=make(r); n.style.transform=pos(i); box.appendChild(n); nodes.set(r.key,n); void n.offsetWidth; }
    n.style.height=(rowH-6)+'px'; n.style.width=cols>1?(colW-8)+'px':''; n.style.transform=pos(i); update(n,r,i); seen.add(r.key); });
  for(const [k,n] of nodes) if(!seen.has(k)){ n.remove(); nodes.delete(k); }
}
const TRK=c=>'<svg viewBox="0 0 96 46" class="tsv"><rect x="2" y="6" width="58" height="26" rx="4" fill="'+c+'"/><path d="M62 13h16l11 11v8H62z" fill="'+c+'" opacity=".9"/><rect x="68" y="17" width="11" height="8" rx="1" fill="#d6ecff"/><rect x="2" y="30" width="87" height="4" fill="#0006"/><circle cx="20" cy="36" r="6" fill="#0b0627" stroke="#cfd6e6" stroke-width="2"/><circle cx="74" cy="36" r="6" fill="#0b0627" stroke="#cfd6e6" stroke-width="2"/></svg>';
const TRK_MINI=c=>'<svg viewBox="0 0 96 46" width="26" height="12"><rect x="2" y="6" width="58" height="26" rx="4" fill="'+c+'"/><path d="M62 13h16l11 11v8H62z" fill="'+c+'"/></svg>';

/* what the crowd may see: results of the rounds already revealed, never the round that is still being marked */
function gmStand(){
  const meta=ST.meta, g=ST.game||{}, n=g.round||0, st=standings(meta,ST.players,ST.rounds,ST.scores,null,ST.ratings);
  const upto=(n&&gmRevealN>=n)?n:n-1;
  const rowsP=st.players.map(p=>{ let tot=0,pend=false; for(const m of st.rounds) if(m<=upto){ tot+=p.per[m]||0; if((p.jc[m]||0)<JUDGES) pend=true; } return Object.assign({},p,{vis:tot,pend}); });
  const rank=a=>{ a.sort((x,y)=>y.vis-x.vis||x.name.localeCompare(y.name)); a.forEach((r,i)=>r.vrank=i>0&&Math.abs(a[i-1].vis-r.vis)<1e-9?a[i-1].vrank:i+1); return a; };
  rank(rowsP); let rowsT=[];
  if(usesTeams(meta)){ const by={}; rowsP.forEach(p=>{ (by[p.teamKey]=by[p.teamKey]||{key:p.teamKey,name:p.team,m:[]}).m.push(p); }); rowsT=rank(Object.values(by).map(t=>({key:t.key,name:t.name,vis:t.m.reduce((a,p)=>a+p.vis,0)/t.m.length,pend:t.m.some(p=>p.pend)}))); }
  const rp=ST.rounds[n], ended=n>0&&(g.phase==='done'||(rp&&roundState(rp,nowMs())==='ended'));
  const rated=st.players.filter(p=>(p.jc[n]||0)>=JUDGES).length, total=st.players.length;
  return {st,n,upto,rowsP,rowsT,ended,rated,total,allJ:total>0&&rated===total,ready:ended&&total>0&&rated===total&&gmRevealN<n,revealed:n>0&&gmRevealN>=n};
}

/* ---- the leaderboard: bars that climb, with a reveal from last place to first ---- */
function drawScoreboard(body){
  if(!body.querySelector('.sbx')){ body.classList.remove('showmode'); body.innerHTML='<div class="sbx"><div class="sbtop" id="sbTop"></div><div class="sbcols"><div class="sbcol"><h2>Players</h2><div class="rows" id="sbP"></div></div><div class="sbcol" id="sbTw"><h2>Teams <small>average of members</small></h2><div class="rows" id="sbT"></div></div></div></div>';
    $('sbTop').onclick=e=>{ if(e.target.closest('#sbRev')) gmStartReveal(); }; }
  const V=gmStand(), meta=ST.meta, g=ST.game||{}, top=$('sbTop');
  const msg=!V.n?'<b>The race has not started</b><span>Scores appear after round 1 is judged.</span>'
    :V.ready?'<button class="revbtn" id="sbRev">Reveal round '+V.n+' results</button><span>Both judges have rated every layout.</span>'
    :V.ended&&!V.revealed?'<b>Round '+V.n+' finished</b><span>Judges are rating the layouts · '+V.rated+' of '+V.total+' done</span><i class="pbar"><u style="width:'+(V.total?100*V.rated/V.total:0)+'%"></u></i>'
    :!V.ended?'<b>Round '+V.n+' in progress</b><span>Points stay hidden until the judges have rated every layout.</span>'
    :'<b>'+(g.phase==='done'?'Final results':'Round '+V.n+' results')+'</b><span>Computer points plus the judges\' marks.</span>';
  const mk=msg+'|'+(gmRev?gmRev.shown:'-'); if(top.dataset.k!==mk){ top.dataset.k=mk; top.innerHTML=msg; }
  $('sbTw').style.display=V.rowsT.length?'':'none';
  const fill=(id,rows0)=>{ const box=$(id); if(!box) return; const rows=(V.upto<1?[]:rows0).map(r=>Object.assign(r,{key:r.key||r.uid})); const H=Math.max(200,box.parentElement.clientHeight-50); const rowH=clamp(Math.floor(H/Math.max(1,rows.length)),34,74); box.style.height=rows.length*rowH+'px'; box.style.setProperty('--bh',rowH+'px'); box.classList.toggle('tight',rowH<46);
    const max=Math.max(1e-9,...rows.map(r=>r.vis)), N=rows.length;
    placeRows(box,rows,rowH,r=>{ const d=document.createElement('div'); d.className='brow2'; d.innerHTML='<span class="bk"></span><span class="bn"><b></b><small></small></span><span class="bb"><i></i></span><span class="bv"><b></b><em></em></span>'; return d; },
      (n,r)=>{ const hid=!!gmRev&&r.vrank>N-gmRev.shown?false:!!gmRev; n.classList.toggle('hid',hid); n.classList.toggle('g1',r.vrank===1&&V.upto>0&&!hid); n.classList.toggle('g2',r.vrank===2&&V.upto>0); n.classList.toggle('g3',r.vrank===3&&V.upto>0);
        n.dataset.rk=r.vrank; n.querySelector('.bk').textContent=V.upto>0?r.vrank:'–'; n.querySelector('.bn b').textContent=r.name; n.querySelector('.bn small').textContent=r.team&&id==='sbP'?r.team:'';
        n.querySelector('.bb i').style.width=hid||V.upto<1?'0%':Math.max(3,100*r.vis/max)+'%';
        const vb=n.querySelector('.bv b'); if(hid||V.upto<1){ vb.textContent=V.upto<1?'–':'0'; vb.dataset.v=0; } else countTo(vb,r.vis,1); n.querySelector('.bv em').textContent=r.pend&&!hid?'⏳':''; }); };
  fill('sbP',V.rowsP); if(V.rowsT.length) fill('sbT',V.rowsT);
}
function gmStartReveal(){ const V=gmStand(); if(!V.ready||gmRev) return; gmRevealN=V.n; gmRev={n:V.n,shown:0}; drawScoreboard($('gmBody'));
  const N=V.total, step=clamp(Math.round(18000/Math.max(1,N)),350,1300), tick=()=>{ if(!gmRev) return; gmRev.shown++; drawScoreboard($('gmBody')); { const rk=N-gmRev.shown+1, el=$('sbP')&&$('sbP').querySelector('[data-rk="'+rk+'"]'); if(el&&!el.classList.contains('hid')) el.scrollIntoView({block:'center',behavior:'smooth'}); } if(gmRev.shown>=N+1){ gmRev=null; drawScoreboard($('gmBody')); } else setTimeout(tick,step); }; setTimeout(tick,900); }

/* ---- the live show ---- */
const SK_ROUND='<div class="show round"><div class="sh-head"><div class="sh-t"><small>FACTORY FLOOR · OPSPHERE</small><b id="shRound"></b><span id="shTarget"></span></div>'
  +'<div class="sh-clock" id="shClock"><small id="shCl">Time left</small><b id="shCb">--:--</b><i class="pbar"><u id="shPr"></u></i><span id="shNote"></span></div>'
  +'<div class="sh-tot"><div class="fgn"><small>Finished goods shipped</small><b id="shFg">0</b></div><div class="rmn"><small>Raw material turned away</small><b id="shRm">0</b></div></div></div>'
  +'<div class="road" id="shRoad"><div class="asph"></div><div class="dock din"><b>IN</b><span>raw material</span></div><div class="mid"><svg viewBox="0 0 40 40" class="gear"><path d="M20 4l3 4 5-1 1 5 5 2-2 5 3 4-4 3 0 5-5 1-2 5-5-2-5 2-2-5-5-1 0-5-4-3 3-4-2-5 5-2 1-5 5 1z" fill="#8F6BFF" opacity=".55"/><circle cx="20" cy="20" r="6" fill="#150842"/></svg><span>factories</span></div><div class="dock dout"><b>OUT</b><span>finished goods</span></div></div>'
  +'<div class="sh-main"><div class="sh-spot"><canvas id="shCv"></canvas><div class="cap" id="shCap"></div><div class="hl2" id="shHl"></div></div><div class="sh-race"><h3>Live race <small>finished goods shipped, out of everything the trucks make possible</small><em></em></h3><div class="rows" id="shRows"></div></div></div>'
  +'<div class="sh-tick" id="shTick"></div></div>';
function showTick(){
  if(ST.role!=='gm'||gmTab!=='show'||!allGot(GMK)) return; const body=$('gmBody'), meta=ST.meta, g=ST.game||{};
  if(!meta){ body.classList.remove('showmode'); body.innerHTML='<p class="hint" style="font-size:22px">The admin has not set up the game yet.</p>'; return; }
  gmSubBuilds(); gmBudget=3; const n=g.round||0, rp=ST.rounds[n];
  if(g.phase==='round'&&rp) showRound(body,n,rp); else if(g.phase==='done') showDone(body); else showLobby(body);
}
function showLobby(body){
  if(!body.querySelector('.show.lobby')){ body.classList.add('showmode'); gmLobbyN=new Set(); body.innerHTML='<div class="show lobby"><div class="lb-title"><small>OPSPHERE · OPERATIONS CLUB · IBS BANGALORE</small><h1>Factory <span>Floor</span></h1><p id="lbSub"></p></div>'
    +'<div class="road mini"><div class="asph"></div><div class="trk auto">'+TRK('#e5a826')+'</div><div class="trk auto d2">'+TRK('#2cb09d')+'</div></div><div class="lb-count"><b id="lbN">0</b><span>players ready</span></div><div class="lb-chips" id="lbChips"></div></div>'; }
  const pl=Object.values(ST.players), g=ST.game||{}; $('lbSub').textContent=g.phase==='setup'?'The admin is setting up the next step. Get ready.':'Game starting soon. Find your seat and sign in.';
  countTo($('lbN'),pl.length,0); const box=$('lbChips'), first=gmLobbyN.size===0;
  for(const p of pl){ if(gmLobbyN.has(p.name)) continue; gmLobbyN.add(p.name); const c=document.createElement('span'); c.textContent=p.name||'Player'; if(!first) c.className='pop'; box.appendChild(c); }
}
function showDone(body){
  const V=gmStand(); const key='done'+(V.revealed?1:0);
  if(body.dataset.sd!==key||!body.querySelector('.show.done')){ body.dataset.sd=key; body.classList.add('showmode');
    if(!V.revealed){ body.innerHTML='<div class="show done"><div class="lb-title"><small>FACTORY FLOOR</small><h1>Final <span>results</span></h1><p>'+(V.ready?'Open the Scoreboard tab and press Reveal.':'The judges are finishing their marks · '+V.rated+' of '+V.total+' layouts rated.')+'</p></div></div>'; return; }
    const top=V.rowsP.slice(0,3), by=r=>r?'<div class="who"><b>'+esc(r.name)+'</b><small>'+esc(r.team||'')+'</small></div>':'';
    const col=(r,i,cls)=>r?'<div class="pd '+cls+'">'+by(r)+'<div class="blk" data-h="'+[100,76,58][i]+'"><b>'+r.vrank+'</b><span>'+num(r.vis,1)+'</span></div></div>':'';
    body.innerHTML='<div class="show done"><div class="lb-title"><small>FACTORY FLOOR</small><h1>Final <span>results</span></h1></div><div class="podium">'+col(top[1],1,'p2')+col(top[0],0,'p1')+col(top[2],2,'p3')+'</div>'
      +(V.rowsT.length?'<p class="tm">Best team: <b>'+esc(V.rowsT[0].name)+'</b> · '+num(V.rowsT[0].vis,1)+' points</p>':'')+'</div>';
    setTimeout(()=>body.querySelectorAll('.blk').forEach((b,i)=>setTimeout(()=>{ b.style.height=b.dataset.h+'%'; },i*500)),50); }
}
function gmRoundGeo(n,rp){ const rpT=Object.assign({},rp,{tr:trFor(n)}), D=roundTotalSec(rp); return {rpT,D,trk:JSON.stringify(rpT.tr)+'|'+D}; }
function gmPlayerAn(uid,n,G){
  const p=ST.players[uid]; if(!p) return null; const b=gmBuilds[uid]; let raw=b&&b.items!=null?b.items:''; const rs=typeof raw==='string'?raw:JSON.stringify(raw);
  const lay=layoutOf(ST.meta,p,n), key=n+'|'+p.fi+'|'+lay+'|'+rs+'|'+G.trk; let c=gmPl.get(uid); if(c&&c.key===key) return c; if(gmBudget<=0) return c||null; gmBudget--;
  let items=[]; try{ items=Array.isArray(raw)?raw:(rs?JSON.parse(rs):[]); }catch(x){ items=[]; }
  try{ if(b&&b.demoRate!=null) c={key,an:gmDemoAn(p,n,G,b),items,lay}; else { const r=analyzeBuild(ST.meta,n,p.fi,items,G.rpT,lay); c={key,an:r.an,items,lay}; } }catch(x){ c={key,an:null,items,lay}; } gmPl.set(uid,c); return c;
}
/* the demo's sample players have no real working line, so their truck run is simulated from a chosen line rate */
function gmDemoAn(p,n,G,b){ const cfg=cloneCfg(), T=G.rpT.target, m=roundM(ST.meta.seed,n,cfg), need=needSpace(FACTORIES[p.fi],T,m), c=need/(T*(1+m))||1, cap=need*(+b.demoCap||.7);
  const sm=simulate({T,rate:+b.demoRate,D:G.D,events:truckPlan(G.rpT.tr,G.D,T),c,cf:c*m,stores:[{k:0,cap:cap*.6},{k:1,cap:cap*.4}],rmIdx:[0],fgIdx:[1],dockCap:10,directCap:0});
  sm.mix=(MIX[FACTORIES[p.fi]]||[]).map(x=>({id:x[0],share:x[1]})); return {sim:sm,rate:+b.demoRate}; }
function showRound(body,n,rp){
  if(!body.querySelector('.show.round')||body.dataset.sn!==String(n)){ body.dataset.sn=String(n); body.classList.add('showmode'); body.innerHTML=SK_ROUND; gmTk=''; gmChips=new Set(); gmSpot={uid:null,until:0,i:0}; gmRoad=null;
    $('shRows').onclick=e=>{ const r=e.target.closest('[data-u]'); if(r){ gmSpot={uid:r.dataset.u,until:Date.now()+30000,i:gmSpot.i}; gmSpotDraw(true); } }; }
  const meta=ST.meta, now=nowMs(), st=roundState(rp,now), left=roundLeftMs(rp,now), G=gmRoundGeo(n,rp), D=G.D, el=clamp(D-left/1000,0,D), V=gmStand();
  $('shRound').textContent='Round '+n+' of '+meta.rounds; $('shTarget').textContent='Target '+num(rp.target)+' units/min · Budget '+inr(rp.budget);
  $('shCl').textContent=st==='paused'?'Paused':st==='ended'?"Time's up":'Time left'; $('shCb').textContent=mmss(left); $('shClock').className='sh-clock '+(st==='running'?(left<=30000?'bad':left<=120000?'warn':''):st==='ended'?'bad':'warn');
  $('shPr').style.width=(100*left/(D*1000))+'%';
  $('shNote').textContent=st!=='ended'?'':V.ready?'Results are ready: open the Scoreboard tab':'Judges are rating the layouts · '+V.rated+' of '+V.total;
  const rows=gmRows(n,G,el); let fg=0, rm=0; rows.forEach(r=>{ fg+=r.fg; rm+=r.rm; }); countTo($('shFg'),fg,0); countTo($('shRm'),rm,0);
  // truck road data for the animation loop
  const sig=G.trk; if(!gmRoad||gmRoad.sig!==sig||gmRoad.n!==n) gmRoad={sig,n,plan:truckPlan(G.rpT.tr,D,rp.target),els:new Map(),lost:{}};
  gmRoad.rp=rp; gmRoad.D=D; gmRoad.lost={}; for(const r of rows) if(r.sm) for(const e of r.sm.ev) if(e.type==='in'&&e.lost>.5) gmRoad.lost[e.t]=(gmRoad.lost[e.t]||0)+1;
  if(!gmRaf) gmRaf=requestAnimationFrame(gmRoadFrame);
  // the race
  const box=$('shRows'), H=box.clientHeight||300, W=box.clientWidth||600, MINR=34; rows.forEach((r,i)=>r.rank=i+1);
  let cols=1, per=Math.max(3,Math.floor(H/MINR)); if(rows.length>per&&W>=620){ cols=2; per*=2; } const pages=Math.max(1,Math.ceil(rows.length/per)), page=pages>1?Math.floor(Date.now()/8000)%pages:0, shown=rows.slice(page*per,page*per+per);
  const rowH=clamp(Math.floor(H/Math.ceil(shown.length/cols)),MINR,66); box.classList.toggle('tight',rowH<50); box.classList.toggle('two',cols>1); box.style.setProperty('--rh',rowH+'px');
  const hs=document.querySelector('.sh-race h3 em'); if(hs) hs.textContent=pages>1?'Page '+(page+1)+' of '+pages:'';
  placeRows(box,shown,rowH,r=>{ const d=document.createElement('div'); d.className='rrow'; d.dataset.u=r.key; d.innerHTML='<span class="rk"></span><span class="rn"><b></b><small></small></span><span class="lane"><i></i><u>'+TRK_MINI('#3fe08f')+'</u></span><span class="fgn"></span><span class="rmn"></span>'; return d; },
    (d,r,i)=>{ d.classList.toggle('spot',r.key===gmSpot.uid); d.querySelector('.rk').textContent=r.rank; d.querySelector('.rn b').textContent=r.name; d.querySelector('.rn small').textContent=r.team;
      d.querySelector('.lane i').style.width=(r.pct*100)+'%'; d.querySelector('.lane u').style.left=(r.pct*100)+'%'; d.querySelector('.fgn').textContent=num(r.fg); d.querySelector('.rmn').textContent=r.rm>.5?'▼ '+num(r.rm):''; },cols);
  // spotlight rotates through the teams; a tap on a lane pins one for 30 seconds
  if(!ST.players[gmSpot.uid]||Date.now()>gmSpot.until){ if(rows.length){ gmSpot.i=(gmSpot.i+1)%rows.length; gmSpot.uid=rows[gmSpot.i].key; gmSpot.until=Date.now()+10000; gmSpotDraw(true); } }
  else gmSpotDraw(false);
  gmTicker(rows,gmRoad.plan,el);
}
function gmPlPeek(uid){ return gmPl.get(uid); }
function gmRows(n,G,t){
  const rows=[]; let goal=0; for(const uid of Object.keys(ST.players)){ const c=gmPlPeek(uid); if(c&&c.an&&c.an.sim&&c.an.sim.shippable>goal) goal=c.an.sim.shippable; } if(goal<=0) goal=Math.max(1,G.rpT.target*G.D/60*.5);
  for(const uid of Object.keys(ST.players)){ const p=ST.players[uid], c=gmPlayerAn(uid,n,G), sm=c&&c.an?c.an.sim:null, h=Builder.hlOf(sm,t);
    rows.push({key:uid,name:p.name||uid,team:usesTeams(ST.meta)?teamName(ST.meta,p):'',fg:h.fg,rm:h.rm,pct:clamp(h.fg/goal,0,1),sm}); }
  rows.sort((a,b)=>b.fg-a.fg||a.name.localeCompare(b.name)); return rows;
}
let gmSpotT=0;
function gmSpotDraw(force){
  const cv=$('shCv'); if(!cv||!ST.game) return; const t=Date.now(); if(!force&&t-gmSpotT<900) return; gmSpotT=t;
  const n=ST.game.round, rp=ST.rounds[n], uid=gmSpot.uid, p=ST.players[uid]; if(!rp||!p) return; const G=gmRoundGeo(n,rp), c=gmPlayerAn(uid,n,G); if(!c) return;
  const lay=c.lay, r=drawBuild(cv,ST.meta,n,p.fi,c.items,G.rpT,'iso',lay,nowMs()), an=c.an||r.an;
  $('shCap').innerHTML='<b>'+esc(p.name)+'</b>'+(usesTeams(ST.meta)?' · '+esc(teamName(ST.meta,p)):'')+' · '+esc(factoryLabel(p.fi))+' · Floor '+r.floor.index;
  const el=roundElapsedSec(rp,nowMs()); const h=Builder.hlOf(an.sim,el); $('shHl').innerHTML='<div class="hlc fg"><small>Finished goods shipped</small><b>'+num(h.fg)+'</b></div><div class="hlc rm"><small>Raw material turned away</small><b>'+num(h.rm)+'</b>'+(h.rm>.5?'<em>'+h.types.map(x=>x[0]+' '+num(x[1])).join(' · ')+'</em>':'')+'</div>';
  document.querySelectorAll('#shRows .rrow').forEach(d=>d.classList.toggle('spot',d.dataset.u===uid));
}
function gmTicker(rows,plan,t){
  const evs=[];
  for(const e of plan){ if(e.t>t) continue; evs.push(e.type==='in'?{k:'ti'+e.t,t:e.t,c:'tk',x:'● Delivery truck arrived · '+num(e.units)+' raw material for every factory'}:{k:'to'+e.t,t:e.t+.1,c:'tk',x:'● Shipping truck collected finished goods'}); }
  for(const r of rows) if(r.sm) for(const e of r.sm.ev){ if(e.t>t) continue;
    if(e.type==='out'&&e.got>.5) evs.push({k:r.key+'o'+e.t,t:e.t+.2,c:'fg',x:'▲ '+r.name+' shipped '+num(e.got)+' finished goods'});
    else if(e.type==='in'&&e.lost>.5) evs.push({k:r.key+'i'+e.t,t:e.t+.2,c:'rm',x:'▼ '+r.name+' turned away '+num(e.lost)+' raw material'+((r.sm.mix||[]).length?' ('+r.sm.mix.map(m=>m.id+' '+num(e.lost*m.share)).join(', ')+')':'')}); }
  evs.sort((a,b)=>b.t-a.t); const top=evs.slice(0,12), sig=top.map(e=>e.k).join(','); if(sig===gmTk) return; gmTk=sig; const box=$('shTick'); if(!box) return; const had=gmChips.size>0, next=new Set();
  box.innerHTML=top.map(e=>{ next.add(e.k); return '<span class="tkc '+e.c+(had&&!gmChips.has(e.k)?' new':'')+'">'+esc(e.x)+'</span>'; }).join(''); gmChips=next;
}
/* the truck road runs every frame so the trucks glide */
function gmRoadFrame(){
  gmRaf=0; if(ST.role!=='gm'||gmTab!=='show'||!gmRoad) return; const road=$('shRoad'), R=gmRoad, rp=ST.rounds[R.n]; if(!road||!rp||!ST.game||ST.game.phase!=='round') return;
  const now=nowMs(), st=roundState(rp,now), D=R.D, el=clamp(D-roundLeftMs(rp,now)/1000,0,D); road.classList.toggle('still',st!=='running');
  R.plan.forEach((e,i)=>{ const te=e.t, inn=e.type==='in'; const t0=inn?te-8:te-6, t1=inn?te+4.5:te+9; let n=R.els.get(i);
    if(el<t0||el>t1){ if(n){ n.remove(); R.els.delete(i); } return; }
    if(!n){ n=document.createElement('div'); n.className='trk '+(inn?'in':'out'); n.innerHTML='<span class="lab"></span>'+TRK(inn?'#e5a826':'#2cb09d'); road.appendChild(n); R.els.set(i,n); }
    let x,op=1,lab='',red='';
    if(inn){ x=lerp(-14,25,easeO((el-t0)/8)); if(el>te-.3) lab='+'+num(e.units)+' raw material'; if(el>te+3) op=clamp(1-(el-te-3)/1.5,0,1); const L=R.lost[te]; if(L&&el>te+.6) red=L+(L===1?' team':' teams')+' turned stock away'; }
    else { x=el<te?lerp(50,78,easeO((el-t0)/6)):el<te+2?78:lerp(78,125,(el-te-2)/7); if(el>te-.5&&el<te+2.5) lab='loading finished goods'; }
    n.style.left=x+'%'; n.style.opacity=op; const lb=n.firstChild; lb.textContent=lab; lb.className='lab'+(red?' two':''); if(red){ lb.innerHTML=esc(lab)+'<em>'+esc(red)+'</em>'; } lb.style.display=lab?'':'none'; });
  gmRaf=requestAnimationFrame(gmRoadFrame);
}

window.addEventListener('resize',()=>{ if(ST.role==='gm'){ const b=$('gmBody'); b.dataset.k=''; drawGm(); } });
function gmTick(){
  if(ST.role!=='gm') return; const rp=roundNow(), g=ST.game; const el=$('gmTimer');
  if(!rp||!g||g.phase!=='round'){ $('gmTrucks').style.display='none'; $('gmTL').textContent=g&&g.phase==='done'?'Finished':'Timer'; $('gmTC').textContent='--:--'; el.className='gmtimer'; return; }
  const st=roundState(rp,nowMs()), left=roundLeftMs(rp,nowMs());
  $('gmTrucks').style.display=st==='running'?'flex':'none'; $('gmTe').textContent=truckEveryNow(rp)+' s';
  $('gmTL').textContent=st==='paused'?'Paused':st==='ended'?"Time's up":'Time left'; $('gmTC').textContent=mmss(left); el.className='gmtimer '+(st==='running'?(left<=30000?'bad':left<=120000?'warn':''):st==='ended'?'bad':'warn');
  $('gmBar').classList.toggle('on',g.phase==='setup');
}
$('gmTrucks').addEventListener('click',e=>{ const b=e.target.closest('[data-tr]'); if(b) truckDo(b.dataset.tr); });
setInterval(()=>{ gmTick(); adminTick(); },250);
setInterval(()=>{ if(ST.role==='gm'&&gmTab==='sb'&&!gmRev) drawGm(); },3000);
setInterval(()=>{ if(ST.role==='gm'&&gmTab==='show') showTick(); },250);
const gmScr=new WeakMap(); /* a long leaderboard glides up and down by itself, since nobody can scroll the projector */
setInterval(()=>{ if(ST.role!=='gm'||gmTab!=='sb'||gmRev) return; document.querySelectorAll('.sbcol').forEach(c=>{ const mx=c.scrollHeight-c.clientHeight; if(mx<6) return; const st=gmScr.get(c)||{dir:1,hold:Date.now()+3000}; gmScr.set(c,st); if(Date.now()<st.hold) return;
  c.scrollTop+=st.dir*1.6; if(c.scrollTop>=mx-1){ st.dir=-1; st.hold=Date.now()+3000; } else if(c.scrollTop<=0&&st.dir<0){ st.dir=1; st.hold=Date.now()+3000; } }); },30);
setInterval(()=>{ if(ST.role==='gm'&&gmTab==='lv'&&ST.game&&ST.game.phase==='round') drawLiveCanvas(); },2000);

/* ---------- Judge: rates every layout after a round ends (0 to 5, steps of 0.5), sees the leaderboard and the floors ---------- */
const JGK=['meta','game','rounds','trucks','ratings','players','scores'];
let jgTab='rate', jgRound=0, jgUid=null, jgOff=null, jgItems=[], jgPick=null, jgT=null;
function startJudge(){ show('judge'); jgTab='rate'; jgRound=0; jgUid=null; jgPick=null; $('jgBody').innerHTML=''; $('jgBody').dataset.k=''; $('jgWho').textContent='Judge '+ST.judge;
  document.querySelectorAll('.jtabs button').forEach(b=>b.classList.toggle('on',b.dataset.jt===jgTab)); subscribe(JGK,renderJudge); }
document.querySelectorAll('.jtabs button').forEach(b=>b.onclick=()=>{ jgTab=b.dataset.jt; document.querySelectorAll('.jtabs button').forEach(x=>x.classList.toggle('on',x===b)); const body=$('jgBody'); body.innerHTML=''; body.dataset.k=''; body.dataset.rn=''; body.onclick=null; renderJudge(true); });
function renderJudge(now){ if(ST.role!=='judge'||!allGot(JGK)) return; if(now===true){ drawJudge(); return; } clearTimeout(jgT); jgT=setTimeout(drawJudge,120); }
function endedRounds(){ return Object.keys(ST.rounds).map(Number).filter(n=>ST.rounds[n]&&roundState(ST.rounds[n],nowMs())==='ended').sort((a,b)=>a-b); }
function drawJudge(){
  const meta=ST.meta, g=ST.game||{phase:'lobby',round:0}, body=$('jgBody');
  $('jgRound').textContent=!meta?'Waiting for the admin':g.phase==='lobby'?'Game starting soon':g.phase==='done'?'Final results':'Round '+g.round+' of '+meta.rounds;
  if(!meta){ body.innerHTML='<p class="hint" style="font-size:20px">The admin has not set up the game yet.</p>'; return; }
  if(jgTab==='sb') drawJudgeBoard(body); else if(jgTab==='lay') drawLayouts(body); else drawRate(body);
}
function jgSub(){ // the chosen player's final layout
  if(jgOff){ jgOff(); jgOff=null; } jgItems=[]; if(!jgUid||!jgRound) return; const uid=jgUid, n=jgRound;
  jgOff=db.on('builds/'+n+'/'+uid,v=>{ if(uid!==jgUid||n!==jgRound) return; try{ jgItems=v&&v.items?JSON.parse(v.items):[]; }catch(x){ jgItems=[]; } jgCanvas(); });
}
const jgV={mode:'iso',zoom:1,px:0,py:0,rot:0,ready:false,fit:true};
function jgReset(){ jgV.ready=false; jgV.fit=true; jgV.ab=null; jgV.abKey=null; }
function jgCanvas(){
  const cv=$('jgCv'); if(!cv||!jgUid||!jgRound) return; const p=ST.players[jgUid], rp=ST.rounds[jgRound]; if(!p||!rp) return;
  jgV.key=jgRound+'|'+jgUid+'|'+JSON.stringify(jgItems);
  const lay=layoutOf(ST.meta,p,jgRound), r=drawBuild(cv,ST.meta,jgRound,p.fi,jgItems,rp,jgV.mode,lay,null,jgV), an=r.an, e=ST.scores[jgRound]&&ST.scores[jgRound][jgUid], h=hlFromScore(e);
  $('jgCap').innerHTML='<b>'+esc(p.name)+'</b><span>'+(usesTeams(ST.meta)?esc(teamName(ST.meta,p))+' · ':'')+esc(factoryLabel(p.fi))+' · Floor '+r.floor.index+' · Round '+jgRound+'</span>';
  const chk=CHECK_NAMES.map((nm,i)=>{ const v=Math.round(an.checks[i]*100); return '<span class="ck'+(v>=100?' ok':v<50?' lo':'')+'">'+nm+' <b>'+v+'%</b></span>'; }).join('');
  $('jgSt').innerHTML='<div class="kp"><span>Line rate<b>'+num(an.rate,1)+' <small>of '+num(rp.target)+' /min</small></b></span><span>Spent<b>'+inr(an.cost)+' <small>of '+inr(rp.budget)+'</small></b></span><span class="g">FG shipped<b>'+num(h.fg)+'</b></span><span class="r">RM turned away<b>'+num(h.rm)+'</b></span></div><div class="cks">'+chk+'</div>';
}
/* the judge can zoom, pan and turn the floor, and switch between the 3D view and the flat plan, as the players do */
function jgZoomAt(sx,sy,z){ const V=jgV; if(!V.ready) return; const nz=Math.max(0.2,Math.min(6,V.zoom*z)), w=unP(V,sx,sy); V.zoom=nz; const q=P(V,w[0],w[1],0); V.px+=sx-q[0]; V.py+=sy-q[1]; V.fit=false; jgCanvas(); }
function jgFit(){ const V=jgV; if(!V.ready||!V.rows) return; fitView(V,V.rows,V.W,V.H); V.fit=true; jgCanvas(); }
function jgTurn(dir){ const V=jgV; if(!V.ready||!V.rows) return; const w=unP(V,V.W/2,V.H/2), wasFit=V.fit; V.rot=((V.rot||0)+dir+4)%4; const q=P(V,w[0],w[1],0); V.px+=V.W/2-q[0]; V.py+=V.H/2-q[1]; if(wasFit) fitView(V,V.rows,V.W,V.H); jgCanvas(); }
function jgToggleMode(){ const V=jgV; if(!V.ready) return; V.mode=V.mode==='iso'?'flat':'iso'; $('jgMode').textContent=V.mode==='iso'?'Flat plan':'3D view'; fitView(V,V.rows,V.W,V.H); V.fit=true; jgCanvas(); }
function jgStageEvents(){
  const cv=$('jgCv'), tl=$('jgTools'); if(!cv) return; const ptr=new Map(); let d0=0;
  const xy=e=>{ const r=cv.getBoundingClientRect(); return [e.clientX-r.left,e.clientY-r.top]; };
  cv.addEventListener('wheel',e=>{ e.preventDefault(); const [x,y]=xy(e); jgZoomAt(x,y,Math.exp(-e.deltaY*0.0015)); },{passive:false});
  cv.addEventListener('pointerdown',e=>{ cv.setPointerCapture(e.pointerId); ptr.set(e.pointerId,xy(e)); d0=0; });
  cv.addEventListener('pointermove',e=>{ if(!ptr.has(e.pointerId)) return; const o=ptr.get(e.pointerId), n=xy(e); ptr.set(e.pointerId,n); const V=jgV; if(!V.ready) return;
    if(ptr.size===1){ V.px+=n[0]-o[0]; V.py+=n[1]-o[1]; V.fit=false; jgCanvas(); }
    else if(ptr.size===2){ const [a,b]=[...ptr.values()], d=Math.hypot(a[0]-b[0],a[1]-b[1]); if(d0>0) jgZoomAt((a[0]+b[0])/2,(a[1]+b[1])/2,d/d0); d0=d; } });
  const up=e=>{ ptr.delete(e.pointerId); d0=0; }; cv.addEventListener('pointerup',up); cv.addEventListener('pointercancel',up); cv.addEventListener('dblclick',jgFit);
  tl.onclick=e=>{ const b=e.target.closest('[data-jt2]'); if(!b) return; const k=b.dataset.jt2, V=jgV;
    if(k==='in') jgZoomAt(V.W/2,V.H/2,1.3); else if(k==='out') jgZoomAt(V.W/2,V.H/2,1/1.3); else if(k==='fit') jgFit(); else if(k==='l') jgTurn(-1); else if(k==='r') jgTurn(1); else if(k==='mode') jgToggleMode(); };
}
function myMark(n,uid){ return ratingsOf(ST.ratings,n,uid)[ST.judge-1]; }
function drawRate(body){
  const done=endedRounds();
  if(!done.length){ body.dataset.rn=''; body.innerHTML='<p class="hint" style="font-size:20px">Rating opens when a round ends. The layouts of that round will appear here for you to mark.</p>'; return; }
  if(!done.includes(jgRound)){ jgRound=done[done.length-1]; jgUid=null; }
  const pl=Object.keys(ST.players).map(u=>Object.assign({uid:u},ST.players[u])).sort((a,b)=>String(a.name||a.uid).localeCompare(String(b.name||b.uid)));
  if(!pl.length){ body.innerHTML='<p class="hint" style="font-size:20px">No players have joined.</p>'; return; }
  if(!jgUid||!ST.players[jgUid]) jgUid=(pl.find(p=>myMark(jgRound,p.uid)==null)||pl[0]).uid;
  if(!body.querySelector('.jx')||body.dataset.rn!==String(jgRound)){
    body.dataset.rn=String(jgRound);
    body.innerHTML='<div class="jx"><div class="jx-top"><div class="jx-rounds"><span>Round</span>'+done.map(n=>'<button class="rp'+(n===jgRound?' on':'')+'" data-jr="'+n+'">'+n+'</button>').join('')+'</div><div class="jx-prog"><span id="jgProg"></span><i><u id="jgFill"></u></i></div></div>'
      +'<div class="jx-main"><div class="jx-list" id="jgList"></div><div class="jx-stage"><canvas id="jgCv"></canvas><div class="cap" id="jgCap"></div>'
      +'<div class="jx-tools" id="jgTools"><button data-jt2="in" title="Zoom in" aria-label="Zoom in">＋</button><button data-jt2="out" title="Zoom out" aria-label="Zoom out">－</button><button data-jt2="fit" title="Fit the whole floor" aria-label="Fit">⤢</button><button data-jt2="l" title="Turn the floor left" aria-label="Turn left">⟲</button><button data-jt2="r" title="Turn the floor right" aria-label="Turn right">⟳</button><button data-jt2="mode" id="jgMode" title="Switch between the 3D view and the flat plan">Flat plan</button></div>'
      +'<div class="stats" id="jgSt"></div></div></div>'
      +'<div class="jx-rate"><div class="jx-rt"><b>Layout and flow mark</b><span class="hint" id="jgMsg"></span><small class="hint">0 to 5, steps of 0.5 · Judge '+ST.judge+' of '+JUDGES+'</small></div><div class="pts" id="jgPts"></div><button class="btn hz" id="jgSave">Save mark</button></div></div>';
    body.onclick=e=>{ const b=e.target.closest('[data-jr]'); if(b){ jgRound=+b.dataset.jr; jgUid=null; jgPick=null; body.dataset.rn=''; drawRate(body); return; }
      const u=e.target.closest('[data-ju]'); if(u){ jgUid=u.dataset.ju; jgPick=null; jgReset(); jgSub(); drawRate(body); return; }
      const k=e.target.closest('[data-jp]'); if(k){ jgPick=+k.dataset.jp; jgBar(); return; }
      if(e.target.id==='jgSave') jgSave(); };
    jgPick=null; jgReset(); jgStageEvents(); jgSub();
  }
  const rated=pl.filter(p=>myMark(jgRound,p.uid)!=null).length;
  $('jgProg').textContent='You have rated '+rated+' of '+pl.length+' players'; $('jgFill').style.width=(pl.length?rated/pl.length*100:0)+'%';
  const AVC=['#17b8a6','#ff8a3d','#3f8cff','#a46cf5','#f4c24d','#ff6b7f'];
  $('jgList').innerHTML=pl.map(p=>{ const m=myMark(jgRound,p.uid), nm=String(p.name||p.uid), c=AVC[[...nm].reduce((a,ch)=>a+ch.charCodeAt(0),0)%AVC.length]; return '<button data-ju="'+p.uid+'" class="'+(p.uid===jgUid?'on':'')+(m!=null?' done':'')+'"><i class="av" style="background:'+c+'">'+esc(nm.trim().charAt(0).toUpperCase())+'</i><span>'+esc(nm)+'<br><small class="hint">'+esc(factoryLabel(p.fi))+(usesTeams(ST.meta)?' · '+esc(teamName(ST.meta,p)):'')+'</small></span><b class="st '+(m!=null?'ok':'')+'">'+(m!=null?num(m,1):'–')+'</b></button>'; }).join('');
  jgCanvas(); jgBar();
}
function jgBar(){
  const saved=myMark(jgRound,jgUid), cur=jgPick!=null?jgPick:saved; let h='';
  for(let v=0;v<=RATE_MAX+1e-9;v+=RATE_STEP) h+='<button data-jp="'+v+'" class="'+(cur===v?'on ':'')+(saved===v?'saved':'')+'">'+num(v,1)+'</button>';
  $('jgPts').innerHTML=h; $('jgSave').disabled=jgPick==null||jgPick===saved;
  $('jgMsg').textContent=saved!=null?'Your saved mark: '+num(saved,1)+' / '+RATE_MAX:'Not rated yet';
}
async function jgSave(){
  if(jgPick==null||!jgUid||!rateOk(jgPick)) return; const n=jgRound, uid=jgUid, v=jgPick;
  const rp=ST.rounds[n]; if(!rp||roundState(rp,nowMs())!=='ended'){ alert('Marks can be given once the round has ended.'); return; }
  $('jgSave').disabled=true;
  try{ await db.update('',{['ratings/'+n+'/'+uid+'/j'+ST.judge]:{v,t:nowMs()}}); }catch(x){ $('jgMsg').textContent='That did not go through: '+x.message; $('jgSave').disabled=false; return; }
  jgPick=null; ST.ratings=ST.ratings||{}; (ST.ratings[n]=ST.ratings[n]||{}); (ST.ratings[n][uid]=ST.ratings[n][uid]||{})['j'+ST.judge]={v,t:nowMs()};
  const pl=Object.keys(ST.players).map(u=>Object.assign({uid:u},ST.players[u])).sort((a,b)=>String(a.name||a.uid).localeCompare(String(b.name||b.uid)));
  const nx=pl.find(p=>p.uid!==uid&&myMark(n,p.uid)==null); if(nx){ jgUid=nx.uid; jgReset(); jgSub(); }
  drawRate($('jgBody'));
}
window.addEventListener('resize',()=>{ if(ST.role==='judge'){ const b=$('jgBody'); b.dataset.k=''; if(jgTab==='rate') jgCanvas(); else drawJudge(); } });
setInterval(()=>{ if(ST.role==='judge'&&jgTab==='sb') drawJudge(); },4000);
setInterval(()=>{ if(ST.role==='judge'&&jgTab==='rate') renderJudge(); },5000);

/* ---------- watermark: the header logo, faint behind every screen ---------- */
(function(){ const i=$('logoClub'); if(i&&i.src) document.body.style.setProperty('--wm','url('+i.src+')'); })();
/* ---------- start ---------- */
(async function init(){
  $('modeNote').textContent=db.kind==='demo'?'Demo mode: the game works across tabs of this browser only. Add your database address in config.js to play across devices.':'';
  const hash=(location.hash||'').toLowerCase(); if(hash==='#admin') setRole('admin'); else if(hash==='#gm') setRole('gm'); else if(hash==='#judge') setRole('judge'); else if(hash==='#demo') setRole('demo'); else setRole('player');
  show('login');
  let sess=null; try{ sess=JSON.parse(localStorage.getItem(SESS)||'null'); }catch(x){}
  const go=async()=>{
    if(sess&&sess.role==='demo'){ begin(sess); return; }
    try{ await db.ready(); }catch(x){ $('loginErr').textContent='Cannot reach the game server. Retrying…'; setTimeout(go,3000); return; }
    $('loginErr').textContent=''; if(sess&&sess.role){ begin(sess); }
  };
  go();
})();
window.__shell={ST,db,show,DM};
})();

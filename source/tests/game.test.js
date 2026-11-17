const fs=require('fs'),vm=require('vm');
vm.runInThisContext(fs.readFileSync(__dirname+'/../src/game.js','utf8')+fs.readFileSync(__dirname+'/../src/xlsx.js','utf8')+';globalThis.__G={validEmail,uidOf,checkLogin,assignFactory,roundLeftMs,roundState,startRound,pauseRound,resumeRound,addTime,endRound,standings,exportSheets,buildXlsx,teamList,CREDS}');
const G=globalThis.__G; let ok=0,bad=0; const t=(c,m)=>{ if(c)ok++; else{bad++;console.log('FAIL',m);} };
t(G.validEmail('Asha.K@IBSindia.org'),'case-insens ok'); t(!G.validEmail('asha@gmail.com'),'wrong domain'); t(!G.validEmail('@ibsindia.org'),'empty local'); t(!G.validEmail('a@x.ibsindia.org'),'subdomain'); t(!G.validEmail('a b@ibsindia.org'),'space');
t(G.uidOf('Asha.K@ibsindia.org')==='asha_k','uid');
t(G.checkLogin('player','a@ibsindia.org','123456789')==='','login ok'); t(G.checkLogin('player','a@ibsindia.org','x')!=='','bad pass'); t(G.checkLogin('admin','','19990909')==='','admin'); t(G.checkLogin('gm','','1')!=='','gm bad');
// timer
const T0=1e6; let r=G.startRound(10,300,250000,T0); t(G.roundLeftMs(r,T0+60000)===540000,'left'); t(G.roundState(r,T0+599999)==='running','running'); t(G.roundState(r,T0+600000)==='ended','ends at endAt');
let p=G.pauseRound(r,T0+120000); t(p.leftMs===480000&&G.roundLeftMs(p,T0+999999)===480000,'pause freezes'); let q=G.resumeRound(p,T0+500000); t(q.endAt===T0+980000,'resume'); t(G.addTime(q,60,0).endAt===T0+1040000,'add running'); t(G.addTime(p,60,0).leftMs===540000,'add paused');
let e=G.endRound(r); t(G.roundLeftMs(e,T0)===0&&G.roundState(e,T0)==='ended','end'); t(G.addTime(e,120,T0+5).endAt===T0+5+120000&&G.addTime(e,120,T0+5).status==='running','reopen ended');
// standings with teams
const meta={ppt:2,teams:{t1:'Alpha',t2:'Beta'},rounds:2};
const players={a:{email:'a@ibsindia.org',name:'Asha',team:'t1',fi:0},b:{email:'b@ibsindia.org',name:'Bo',team:'t1',fi:1},c:{email:'c@ibsindia.org',name:'Cy',team:'t2',fi:0}};
const rounds={1:{minutes:10,target:300,budget:200000,status:'ended'},2:{minutes:10,target:320,budget:210000,status:'running'}};
const scores={1:{a:{score:80,pts:{close:30,spend:20,store:15,layout:15},rate:300,cost:150000},b:{score:60,pts:{close:20,spend:15,store:15,layout:10}},c:{score:70,pts:{close:25,spend:15,store:15,layout:15}}}};
const builds={2:{a:{score:50,pts:{close:20,spend:10,store:10,layout:10}},c:{score:90,pts:{close:35,spend:20,store:20,layout:15}}}};
const st=G.standings(meta,players,rounds,scores,builds);
t(st.players[0].name==='Cy'&&st.players[0].total===160,'player ranking uses final+live '+JSON.stringify(st.players.map(x=>[x.name,x.total])));
t(st.teams[0].name==='Beta'&&st.teams[0].total===160,'team avg: Beta 160'); const al=st.teams.find(x=>x.name==='Alpha'); t(al.per[1]===70&&al.per[2]===25&&al.total===95,'Alpha avg incl. member with no build counted as 0 '+JSON.stringify(al.per));
// no teams mode
const st2=G.standings({ppt:1},players,rounds,scores,builds); t(st2.teams.length===3&&st2.teams[0].members.length===1,'ppt=1: each player is own team');
// assign factory
t(G.assignFactory(meta,players,{email:'d@ibsindia.org',team:'t1'},4)===2,'factory by join order in team'); t(G.assignFactory(meta,players,{email:'d@ibsindia.org',team:'t2'},4)===1,'t2 second member');
t(G.assignFactory({ppt:1},players,{email:'d@ibsindia.org'},4)===3,'solo overall order');
// sheets
const sh=G.exportSheets(meta,players,rounds,scores,builds,i=>'Factory '+'ABCD'[i]);
t(sh.length===4&&sh[0].name==='Summary'&&sh.some(s=>s.name==='Asha'),'one summary + one per player '+sh.map(s=>s.name));
const ash=sh.find(s=>s.name==='Asha').rows; const hdr=ash.find(r=>r[0]&&r[0].v==='Scoring parameter'); t(hdr&&hdr[1].v==='Round 1'&&hdr[2].v==='Round 2','columns are rounds');
const cl=ash.find(r=>r[0]==='Closeness to target'); t(cl[1]===30&&cl[2]===20&&cl[3]===50,'parameter row values '+JSON.stringify(cl));
// xlsx validity written to disk for external check
fs.writeFileSync('/tmp/t.xlsx',Buffer.from(G.buildXlsx(sh)));
console.log('ok',ok,'bad',bad); process.exit(bad?1:0);

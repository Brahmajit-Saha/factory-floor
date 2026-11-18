const fs=require('fs'),vm=require('vm');
vm.runInThisContext(fs.readFileSync(__dirname+'/../src/game.js','utf8')+fs.readFileSync(__dirname+'/../src/xlsx.js','utf8')+';globalThis.__G={validEmail,uidOf,checkLogin,assignFactory,assignSeat,layoutsNeeded,shuffleAssign,layoutOf,assignmentRows,useList,seqList,roundLeftMs,roundState,startRound,pauseRound,resumeRound,addTime,endRound,standings,exportSheets,buildXlsx,teamList,CREDS,judgeOf,rateOk,ratingsOf,judgePts}');
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
const solo={s0:{email:'s0@ibsindia.org',ord:0},s1:{email:'s1@ibsindia.org',ord:1},s2:{email:'s2@ibsindia.org',ord:2}};
t(G.assignFactory({ppt:1},solo,{email:'d@ibsindia.org'},4)===3,'solo overall order'); t(G.assignSeat({ppt:1},{s0:solo.s0,s2:solo.s2},{email:'n@ibsindia.org'})===1,'removed player seat is reused'); t(G.assignFactory({ppt:1},{a:{email:'a',ord:4}, b:{email:'b',ord:0},c:{email:'c',ord:1},d:{email:'d',ord:2},e:{email:'e',ord:3}},{email:'z'},4)===1,'factory wraps after K (seat 5 -> B)');
// floor plans
const mm={ppt:2,rounds:6,teams:{t1:'A',t2:'B',t3:'C',t4:'D',t5:'E',t6:'F'}};
t(G.layoutsNeeded(mm)===12&&G.layoutsNeeded({ppt:1,rounds:6})===6,'layouts needed = players per team x rounds (6 for solo)');
const use=[1,2,3,4,5,6,7,8,9,10,11,12], seqT=G.shuffleAssign(use,2,6,'tok');
t(seqT===G.shuffleAssign(use,2,6,'tok'),'same token gives same shuffle'); t(seqT!==G.shuffleAssign(use,2,6,'tok2'),'new token reshuffles');
const grp=seqT.split('|').map(x=>x.split(',').map(Number)); t(grp.length===2&&grp.every(g=>g.length===6),'two groups of six'); t([...grp[0],...grp[1]].sort((a,b)=>a-b).join()===use.join(),'every chosen floor used exactly once');
const M=Object.assign({},mm,{use:use.join(),seq:seqT});
const pl=(team,ord)=>({email:team+ord+'@ibsindia.org',team,ord,fi:ord});
let clash=0, allSeen=true;
for(let r=1;r<=6;r++){ const a=new Set(), b=new Set(); for(const tm of ['t1','t2','t3','t4','t5','t6']){ a.add(G.layoutOf(M,pl(tm,0),r)); b.add(G.layoutOf(M,pl(tm,1),r)); } if(a.size!==6||b.size!==6) clash++; if([...a].some(x=>b.has(x))) clash++; }
t(clash===0,'each round: six teams play six different floors per seat, and seat 1 and seat 2 never overlap');
for(const tm of ['t1','t4','t6']){ for(const o of [0,1]){ const got=new Set(); for(let r=1;r<=6;r++) got.add(G.layoutOf(M,pl(tm,o),r)); if(got.size!==6) allSeen=false; } }
t(allSeen,'over six rounds a player plays six different floors'); 
t(new Set([0,1].map(o=>[1,2,3,4,5,6].map(r=>G.layoutOf(M,pl('t2',o),r)).join())).size===2,'teammates never share a layout in any round'); 
{ let share=0; for(let r=1;r<=6;r++) if(G.layoutOf(M,pl('t2',0),r)===G.layoutOf(M,pl('t2',1),r)) share++; t(share===0,'teammates differ every round'); }
t(G.layoutOf(mm,pl('t1',0),1)===0,'no assignment -> 0 (auto rotation)');
const SM={ppt:1,rounds:5,use:'3,4,5,6,7',seq:G.shuffleAssign([3,4,5,6,7],1,5,'x')}; const sg=SM.seq.split(',').map(Number);
t([1,2,3,4,5].every(r=>G.layoutOf(SM,{ord:0},r)===sg[(r-1)%5])&&G.layoutOf(SM,{ord:1},1)===sg[1],'solo rotates through the one group, offset by joining order');
const ar=G.assignmentRows(M); t(ar.length===12&&ar[0].cells.length===6&&ar[1].seat===2,'assignment table rows = teams x seats');
t(G.useList({use:'3, 5,x,0,8'}).join()==='3,5,8','useList tolerant');
// sheets
const sh=G.exportSheets(meta,players,rounds,scores,builds,i=>'Factory '+'ABCD'[i]);
t(sh.length===4&&sh[0].name==='Summary'&&sh.some(s=>s.name==='Asha'),'one summary + one per player '+sh.map(s=>s.name));
const ash=sh.find(s=>s.name==='Asha').rows; const hdr=ash.find(r=>r[0]&&r[0].v==='Scoring parameter'); t(hdr&&hdr[1].v==='Round 1'&&hdr[2].v==='Round 2','columns are rounds');
const cl=ash.find(r=>String(r[0]).startsWith('Closeness to target')); t(cl[1]===30&&cl[2]===20&&cl[3]===50,'parameter row values '+JSON.stringify(cl));
// judges: two passcodes, marks 0..5 in halves, added to the automatic points
t(G.checkLogin('judge','','24681357')===''&&G.checkLogin('judge','','13572468')===''&&G.checkLogin('judge','','x')!=='','judge passcodes'); t(G.judgeOf('24681357')===1&&G.judgeOf('13572468')===2&&G.judgeOf('0')===0,'which judge');
t(G.rateOk(0)&&G.rateOk(4.5)&&G.rateOk(5)&&!G.rateOk(5.5)&&!G.rateOk(-0.5)&&!G.rateOk(2.3)&&!G.rateOk('x'),'marks: 0 to 5 in steps of 0.5');
const rt={1:{[Object.keys(players)[0]]:{j1:{v:4.5,t:1},j2:{v:3,t:2}}}}; const u0=Object.keys(players)[0];
t(G.judgePts(rt,1,u0).pts===7.5&&G.judgePts(rt,1,u0).count===2&&G.judgePts(rt,2,u0).count===0,'judgePts sums both judges');
const stJ=G.standings(meta,players,rounds,scores,builds,rt), stN=G.standings(meta,players,rounds,scores,builds); const a0=stJ.players.find(p=>p.uid===u0), b0=stN.players.find(p=>p.uid===u0);
t(Math.abs(a0.per[1]-b0.per[1]-7.5)<1e-9&&a0.jc[1]===2&&a0.jc[2]===0,'standings add the judges marks to the round');
const shJ=G.exportSheets(meta,players,rounds,scores,builds,i=>'Factory '+'ABCD'[i],rt); const rowsJ=shJ.find(s=>s.name===players[u0].name.replace(/[\[\]:*?\/\\]/g,' ').trim()).rows;
t(rowsJ.some(r=>String(r[0]).includes('Judge 1')&&r[1]===4.5)&&rowsJ.some(r=>String(r[0]).startsWith('Layout and flow')&&r[1]===7.5),'export lists each judge and the layout total');
// xlsx validity written to disk for external check
fs.writeFileSync('/tmp/t.xlsx',Buffer.from(G.buildXlsx(sh)));
console.log('ok',ok,'bad',bad); process.exit(bad?1:0);

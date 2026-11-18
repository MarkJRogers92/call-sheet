const {test}=require('node:test');
const assert=require('node:assert/strict');
const {makeRetiredNumbers}=require('../retired-numbers.js');
const {loadEngine}=require('../tools/harness.js');

function world(){
 const t={id:1,name:'Home U'};
 const A=(id,o)=>({id,name:`P${id}`,pos:'QB',lastTeam:'Home U',retiredYear:2030,jerseyNumber:10+Number(id),awards:[],...o});
 const u={year:2034,playerArchive:[A(1,{awards:[{name:'Receiver of the Year'}]}),A(2,{awards:[{name:'National Player of the Year'},{name:'Quarterback of the Year'}],draftResult:{round:1,pick:2}}),A(3,{draftResult:{round:1,pick:20}}),A(4,{}),A(5,{awards:[{name:'X'}],lastTeam:'Other U'}),A(6,{awards:[{name:'X'}],jerseyNumber:undefined})]};
 return{t,u,R:makeRetiredNumbers({getUniverse:()=>u})};
}

test('former players with a national award or a first-round result qualify, the most decorated first',()=>{
 const {t,R}=world();
 const c=R.candidates(t);
 assert.deepEqual(c.map(x=>x.playerId),[2,1,3],'no honours, another program\'s player and a missing number are left out');
 assert.match(c[0].honour,/2 national awards incl\. National Player of the Year · first-round pick \(#2\)/);
 assert.equal(c[2].honour,'first-round pick (#20)');
});

test('one number a season, never the same number or player twice, twelve in all',()=>{
 const {t,u,R}=world();
 const r=R.retire(t,2);assert.equal(r.ok,true);assert.deepEqual(t.retiredNumbers[0],{number:12,playerId:2,name:'P2',pos:'QB',year:2034,honour:r.entry.honour});
 assert.equal(R.retire(t,1).reason,'One number a season.');
 u.year=2035;assert.equal(R.retire(t,2).ok,false,'not twice');assert.equal(R.retire(t,4).ok,false,'he does not qualify');
 u.playerArchive.push({id:9,name:'Twin',pos:'WR',lastTeam:'Home U',jerseyNumber:12,awards:[{name:'X'}]});
 assert.ok(!R.candidates(t).some(x=>x.playerId===9),'a retired number is not retired again');
 t.retiredNumbers=Array.from({length:12},(_,i)=>({number:i,playerId:`x${i}`,year:2000+i}));
 assert.match(R.canRetire(t).reason,/at most 12/);
});

test('in the game, no newcomer is given a retired number; a player wearing it keeps it',async()=>{
 const e=loadEngine({seed:3434,fullRuntime:true});await e.loadSchools();e.setUserTeam('Chicago Metropolitan');e.initUniverse();
 const t=e.T('Chicago Metropolitan');e.assignTeamJerseys(t);
 const veteran=t.roster.find(p=>p.pos==='QB'),number=veteran.jerseyNumber;
 t.retiredNumbers=[{number,playerId:'old',name:'Old',pos:'QB',year:2020}];
 const rookies=t.roster.filter(p=>p!==veteran&&['QB','WR','K','P'].includes(p.pos));for(const p of rookies)delete p.jerseyNumber;
 e.assignTeamJerseys(t);
 assert.equal(veteran.jerseyNumber,number,'the veteran keeps it');
 assert.ok(rookies.length>5&&rookies.every(p=>Number.isInteger(p.jerseyNumber)&&p.jerseyNumber!==number),'no newcomer takes the retired number');
});

const Ro=require('../forks/call-sheet/core/roster');
const CL=require('../forks/call-sheet/core/classes');
const viewPlayers=lu=>[...Object.values(lu.off),...Object.values(lu.def)];
const testBands={QB:[[1,19]],WR:[[1,19],[80,89]],TE:[[40,49],[80,89]],RB:[[20,49]],OT:[[50,79]],OG:[[50,79]],C:[[50,79]],EDGE:[[50,79],[90,99]],DT:[[50,79],[90,99]],LB:[[40,59],[90,99]],CB:[[20,49]],S:[[20,49]],K:[[1,19]],P:[[1,19]]};
const inBand=(p,n)=>testBands[p].some(([lo,hi])=>Number.isInteger(n)&&n>=lo&&n<=hi);
function checkPlayers(list,key='number'){
 for(const p of list)assert.ok(inBand(p.pos,p[key]),p.pos+' #'+p[key]);
 assert.equal(new Set(list.map(p=>p[key])).size,list.length,'unique across the team');
}
test('standalone programs, draft picks and incoming signees wear distinct traditional numbers',()=>{
 for(let i=0;i<25;i++){
  const team=Ro.preset('ground','jersey'+i);checkPlayers(viewPlayers(team.lineup));
  assert.deepEqual(team,Ro.preset('ground','jersey'+i),'seeded');
  const picks=Object.fromEntries(Object.entries(Ro.dealDraft(i)).map(([role,choices])=>[role,choices[i%3]]));
  checkPlayers(viewPlayers(Ro.teamFromDraft('State',picks).lineup));
  delete team.lineup.off.QB;
  const recruit=CL.prospects('user','QB','QB',3,.5)[0];recruit.number=87;
  const before=viewPlayers(team.lineup).map(p=>p.number);
  CL.sign(team.lineup,'off','QB',recruit);checkPlayers(viewPlayers(team.lineup));
  assert.deepEqual(viewPlayers(team.lineup).filter(p=>p!==recruit).map(p=>p.number),before);
 }
});
test('legacy rosters repair impossible numbers, reserve valid incumbents, and handle saturated QB room',()=>{
 const e=loadEngine({seed:1919});const p=(id,pos,jerseyNumber)=>({id,pos,jerseyNumber,year:'SR',portraitSeed:'p'+id,portraitVersion:1});
 const team={roster:[p(1,'QB',87),p(2,'QB',52),p(3,'WR',87),p(4,'CB',26),p(5,'RB',26),p(6,'TE',85)]};
 const mirror=JSON.parse(JSON.stringify(team));mirror.roster.reverse();
 e.assignTeamJerseys(team);e.assignTeamJerseys(mirror);
 checkPlayers(team.roster,'jerseyNumber');assert.equal(team.roster[2].jerseyNumber,87);assert.equal(team.roster[5].jerseyNumber,85);
 assert.deepEqual(team.roster,mirror.roster.reverse());
 const first=JSON.stringify(team);e.assignTeamJerseys(team);assert.equal(JSON.stringify(team),first);
 const over={roster:Array.from({length:24},(_,i)=>p(i,'QB',87))};e.assignTeamJerseys(over);
 assert.ok(over.roster.every(q=>inBand('QB',q.jerseyNumber)));assert.equal(new Set(over.roster.map(p=>p.jerseyNumber)).size,19);
});
test('a dense roster can move a flexible veteran to free a traditional number for a QB',()=>{
 const e=loadEngine({seed:4545});const roster=Array.from({length:19},(_,i)=>({id:i+1,pos:i===12?'WR':'QB',jerseyNumber:i+1,year:'SR',portraitSeed:'p'+i}));
 roster.push({id:20,pos:'QB',jerseyNumber:87,year:'FR',portraitSeed:'new'});
 e.assignTeamJerseys({roster});checkPlayers(roster,'jerseyNumber');assert.equal(roster[19].jerseyNumber,13);
});

test('standalone saved uniforms stay in sync on the active signature and resumed field without rewriting career history',()=>{
 const team=Ro.preset('aerial','legacy');const qb=team.lineup.off.QB;qb.number=87;
 const active={playerId:qb.id,number:87},legend={playerId:qb.id,number:87};
 const pb={signatures:[active],ringOfHonor:[legend]};
 const action={pending:{type:'snap'},teams:{home:JSON.parse(JSON.stringify(team))},personnel:{[qb.id]:{...qb}}};
 Ro.refreshUniforms(team.lineup,pb);Ro.syncBattleUniforms(action,'home',viewPlayers(team.lineup),'number');
 assert.ok(inBand('QB',qb.number));assert.equal(active.number,qb.number);assert.equal(legend.number,87);
 assert.equal(action.teams.home.lineup.off.QB.number,qb.number);assert.equal(action.personnel[qb.id].number,qb.number);
 assert.deepEqual(action.pending,{type:'snap'});
});
test('a player-approved switch to tight end immediately replaces an out-of-position uniform',async()=>{
 const e=loadEngine({seed:5933});await e.loadSchools();e.setUserTeam('Chicago Metropolitan');e.initUniverse();
 const t=e.T('Chicago Metropolitan'),p=t.roster.find(p=>e.positionOptions(p).includes('TE')&&p.pos!=='TE'&&!inBand('TE',p.jerseyNumber));
 assert.ok(p);const id=p.id,face=p.portraitSeed;
 assert.equal(e.applyRequestedPositionChange(t,p,'TE'),true);
 assert.ok(inBand('TE',p.jerseyNumber),'non-TE number survived: '+p.jerseyNumber);
 assert.equal(id,p.id);assert.equal(face,p.portraitSeed);
});

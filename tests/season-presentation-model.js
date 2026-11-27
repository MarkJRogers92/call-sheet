const test=require('node:test');
const assert=require('node:assert/strict');
const {makeSeasonPresentationModel}=require('../season-presentation-adapter');
const model=makeSeasonPresentationModel();
const user='Chicago Metropolitan';
const games=[
 {week:1,home:user,away:'Great Lakes University',played:true,winner:user,score:[17,31]},
 {week:2,home:'Wisconsin Commonwealth',away:user,played:true,winner:user,score:[28,21]},
 {week:3,home:user,away:'Milwaukee State',played:true,winner:'Milwaukee State',score:[24,20]},
 {week:4,home:'Michigan Commonwealth',away:user,played:true,winner:'Michigan Commonwealth',score:[21,17]},
 {week:5,home:user,away:'Detroit Metropolitan',played:false}
];
test('game result preserves home and road score orientation',()=>{assert.deepEqual(model.gameResult(games[0],user),{result:'W',userScore:31,oppScore:17,opponent:'Great Lakes University',location:'vs',week:1,detailed:false});assert.deepEqual(model.gameResult(games[1],user),{result:'W',userScore:28,oppScore:21,opponent:'Wisconsin Commonwealth',location:'@',week:2,detailed:false})});
test('season streak is derived from consecutive completed outcomes only',()=>{assert.equal(model.streak(games,user),'L2');assert.equal(model.streak([{...games[0],played:false}],user),'—')});
test('season summary ignores unsupported hidden team state',()=>{const base={teamId:1,teamName:user,record:'2-2',conferenceRecord:'1-1',rank:'NR',conference:'Great Lakes',conferencePlace:5,year:2027,phase:'Regular Season',week:4,completed:4,remaining:8,streak:'L2',latest:{result:'L'},next:{id:5,name:'Detroit Metropolitan'}};const hidden={...base,trueTeamPower:99,privateInjuryLuck:100,hiddenScheduleDifficulty:100};assert.deepEqual(model.summary(base),model.summary(hidden))});

const team=(name,cw,w)=>({name,cw,cl:7-cw,w,l:11-w});
const matchup=(home,away,conf=true)=>({home,away,conf,played:false,week:12});
const outlook=(standings,schedule,extra={})=>model.conferenceRace({
 standings,schedule,userName:'Us',week:12,phase:'regular',scheduleReady:true,...extra
});

test('record scenarios respect mutually exclusive winners when proving a clinch',()=>{
 const standings=[team('Us',6,9),team('Lake',5,8),team('Metro',5,8)];
 assert.equal(outlook(standings,[matchup('Lake','Metro')]).status,'clinched');
 assert.equal(outlook(standings,[matchup('Lake','Outsider'),matchup('Metro','Another')]).status,'in-position');
});

test('needs-help and rooting advice require distinct proven record paths',()=>{
 const standings=[team('Leader',7,10),team('Lake',5,9),team('Us',5,8),team('Ridge',3,6),team('South',2,4)];
 const lake=matchup('Lake','Ridge');
 const schedule=[lake,matchup('South','Us'),{...matchup('Lake','South'),week:11,played:true,gameId:'G2027_640',score:[14,20]}];
 const before=JSON.stringify({standings,schedule});
 const race=outlook(standings,schedule);
 assert.equal(race.status,'needs-help');
 assert.equal(race.games.find(g=>g.home==='Lake'&&!g.played).rootFor,'Ridge');
 assert.deepEqual(race.games.find(g=>g.played).score,[14,20]);
 assert.equal(race.games.find(g=>g.played).id,'G2027_640');
 assert.equal(JSON.stringify({standings,schedule}),before);
 assert.equal(outlook(standings,schedule,{scheduleReady:false}).status,'chasing');
 assert.equal(outlook(standings.map(t=>t.name==='Lake'?{...t,w:8}:t),schedule).status,'chasing','ranking score is unknowable in a wins tie');
});

test('conference wins precede overall wins and the exact final standings decide a tie',()=>{
 const standings=[team('Leader',7,9),team('Lake',5,10),team('Us',5,8),team('Ridge',3,6),team('South',2,4)];
 assert.equal(outlook(standings,[matchup('South','Us'),matchup('Lake','Ridge',false)]).status,'win-out');
 assert.equal(outlook(standings,[],{phase:'confReady'}).status,'out');
 assert.equal(outlook([standings[0],standings[2],standings[1],...standings.slice(3)],[],{phase:'confReady'}).status,'clinched');
});

test('playoff projections reserve conference bids and official seeds come from the freeze',()=>{
 const teams=Array.from({length:20},(_,i)=>({
  id:i+1,name:`Team ${i+1}`,rank:i+1,conference:`League ${Math.floor(i/2)+1}`,cw:i%2?6:5,w:8
 }));
 const projected=model.playoffRace({teams,userId:2,phase:'regular'});
 assert.equal(projected.state,'projected-in');
 assert.equal(projected.route,'champion','the conference wins leader gets the projection despite a lower national rank');
 assert.equal(projected.field.filter(t=>t.route==='champion').length,10);
 assert.equal(projected.field.filter(t=>t.route==='at-large').length,6);
 assert.equal(model.playoffRace({teams,userId:19,phase:'confReady'}).state,'projected-out');
 const frozenIds=[20,19,...Array.from({length:14},(_,i)=>i+1)];
 const official=model.playoffRace({teams,userId:19,phase:'bowlReady',frozenIds,championIds:[20]});
 assert.equal(official.state,'qualified');
 assert.equal(official.seed,2);
 assert.equal(official.route,'at-large');
 assert.equal(official.field[0].name,'Team 20');
 assert.equal(model.playoffRace({teams,userId:18,phase:'playoffReady',unavailable:true}).state,'unavailable');
});

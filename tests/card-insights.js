'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const B=require('../forks/call-sheet/core/battle');
const Ro=require('../forks/call-sheet/core/roster');
const clone=x=>JSON.parse(JSON.stringify(x));
function duel(extra={}){return{key:'G',label:'Protection',offRoles:['LT'],defRoles:['RUSH'],offNames:['Alex Tackle'],defNames:['Sam Rusher'],offGrade:9,defGrade:6,mods:[{v:-1,src:'Pressure'}],...extra}}
function snap(extra={}){return{type:'snap',offSide:'home',defSide:'away',play:'deep_cross',sit:{down:1,distance:10,period:1},duels:[duel()],duelResults:[{won:true}],yards:12,...extra}}
test('matchup story separates player ratings from setup and uses the real winner',()=>{
  const e=snap(),before=clone(e),s=B.matchupStory(e);
  assert.equal(s.ratingEdge,3);assert.equal(s.setupEdge,-1);assert.equal(s.winnerSide,'home');
  assert.match(s.summary,/Alex Tackle/);assert.match(s.detail,/rating advantage.*unfavorable setup/i);assert.deepEqual(e,before);
  const upset=B.matchupStory(snap({duelResults:[{won:false}]}));assert.equal(upset.winnerSide,'away');assert.match(upset.detail,/favored.*not guaranteed/i);
});
test('stories never credit unreached duels or invent a dropped pass',()=>{
  const e=snap({duels:[duel(),duel({key:'K',offNames:['Hidden Receiver']})],duelResults:[{won:false},{won:true}],kind:'inc'});
  const s=B.matchupStory(e);assert.equal(s.key,'G');assert.doesNotMatch(JSON.stringify(s),/Hidden Receiver|dropped/);
  assert.equal(B.matchupStory(snap({penalty:{label:'Holding'}})),null);
  assert.equal(B.matchupStory(snap({category:'kick'})),null);
});
test('postgame takeaway needs repeated recorded evidence and offers only owned optional plays',()=>{
  const b={user:'home',decks:{home:{off:{base:['inside_zone'],wrinkles:['outside_zone']}}},log:[0,1,2].map(()=>snap({play:'outside_zone',yards:1,duels:[duel({label:'Edge block'})],duelResults:[{won:false}]}))};
  const before=clone(b),t=B.postgameTakeaway(b);assert.equal(t.samples,3);assert.match(t.summary,/Outside Zone/);assert.match(t.evidence,/3.*1\.0/);assert.equal(t.playId,'inside_zone');assert.match(t.recommendation,/Consider/);assert.deepEqual(b,before);
  b.log=b.log.slice(0,2);assert.equal(B.postgameTakeaway(b),null);
  b.log.push(snap({play:'outside_zone',yards:1,penalty:{}}));assert.equal(B.postgameTakeaway(b),null);
});
test('adaptation clue uses confirmed public lean and actual previous snaps, never hidden state',()=>{
  const b={log:[1,2,3].map(()=>snap({play:'inside_zone'})),tend:{home:{run:99}},snap:{def:{play:'secret'}}};
  const req={kind:'snap',role:'off',side:'home',look:{lean:{value:'run',confirmed:false}},options:{plays:[]}};
  const before=clone(b),uncertain=B.adaptationRead(b,req);assert.equal(uncertain.confirmed,false);assert.match(uncertain.summary,/3 straight run/);assert.match(uncertain.detail,/may|could/);assert.doesNotMatch(uncertain.summary,/leaning|safety/);
  req.look.lean.confirmed=true;const known=B.adaptationRead(b,req);assert.equal(known.confirmed,true);assert.match(known.summary,/their defense is playing the run/i);
  b.snap.def.play='another secret';assert.deepEqual(B.adaptationRead(b,req),known);b.snap.def.play='secret';assert.deepEqual(b,before);
});
test('insight helpers survive older saves and reveal no unconfirmed coverage',()=>{
  assert.equal(B.matchupStory(null),null);assert.equal(B.postgameTakeaway({log:[]}),null);assert.equal(B.adaptationRead({},null),null);
  const b=B.create({home:Ro.preset('ground'),away:Ro.preset('aerial'),seed:'insight-check',user:'home',control:'offense',mode:'snap'});B.advance(b);
  const before=B.save(b);B.adaptationRead(b);B.postgameTakeaway(b);assert.equal(B.save(b),before);
});
test('adaptation recommendations never suggest an unaffordable or blocked counter',()=>{
  const req={kind:'snap',role:'off',side:'home',look:{lean:{value:'run',confirmed:true}},options:{command:0,plays:[{id:'pa_boot',cost:1,blocked:null}]}};
  assert.equal(B.adaptationRead({log:[]},req).counterPlay,null);
  req.options.command=2;req.options.plays[0].blocked='Owner resting';assert.equal(B.adaptationRead({log:[]},req).counterPlay,null);
  req.options.plays[0].blocked=null;assert.equal(B.adaptationRead({log:[]},req).counterPlay,'pa_boot');
});

function coordinatorGame(seed,defensivePlan){
 const D=require('../forks/call-sheet/core/data'),E=require('../game-engine-v2');
 const home=Ro.preset('aerial'),away=Ro.preset('tempo');
 home.decks=clone(D.DEFAULT_DECKS);home.decks.off.base.push('screen');
 const b=B.create({home,away,seed,user:'home',mode:'snap',control:'offense',defensivePlan});
 E.startGame(b.game);
 Object.assign(b.game,{possession:'home',fieldPosition:35,down:1,distance:10});
 return b;
}
test('opposing game plans produce different legal opening calls from the same rosters',()=>{
 const {CALLS}=require('../forks/call-sheet/core/data');
 const counts={pressure:0,coveragePressure:0,twoHigh:0,pressureTwoHigh:0,adjustedPressure:0,adjustedTwoHigh:0};
 for(let i=0;i<24;i++){
   const rush=coordinatorGame('coordinator-'+i,'pressure'),coverage=coordinatorGame('coordinator-'+i,'two_high');
   const adjustedRush=B.load(B.save(rush)),adjustedCoverage=B.load(B.save(coverage));
   adjustedRush.opponentDefense.counters=2;adjustedCoverage.opponentDefense.counters=2;
   assert.match(B.advance(rush).defensePlan.text,/extra rushers/);
   assert.match(B.advance(coverage).defensePlan.text,/two safeties/);
   B.advance(adjustedRush);B.advance(adjustedCoverage);
   const rushCall=CALLS[rush.snap.def.play],coverageCall=CALLS[coverage.snap.def.play];
   counts.pressure+=Number(rushCall.pressure>0);
   counts.coveragePressure+=Number(coverageCall.pressure>0);
   counts.twoHigh+=Number(coverageCall.shell===2);
   counts.pressureTwoHigh+=Number(rushCall.shell===2);
   counts.adjustedPressure+=Number(CALLS[adjustedRush.snap.def.play].pressure>0);
   counts.adjustedTwoHigh+=Number(CALLS[adjustedCoverage.snap.def.play].shell===2);
 }
 assert.ok(counts.pressure>=counts.coveragePressure+4,JSON.stringify(counts));
 assert.ok(counts.twoHigh>=counts.pressureTwoHigh+4,JSON.stringify(counts));
 assert.ok(counts.pressure>=counts.adjustedPressure+4,JSON.stringify(counts));
 assert.ok(counts.twoHigh>=counts.adjustedTwoHigh+4,JSON.stringify(counts));
 assert.match(B.advance(coordinatorGame('auto-plan','auto')).defensePlan.text,/extra rushers/);
 assert.equal(B.advance(coordinatorGame('no-plan',false)).defensePlan,undefined);
 assert.equal(B.createChallenge('need_six').pending.defensePlan,undefined,'the original challenge keeps its scripted behavior');
});
test('the pressure coordinator adjusts after two completed screen counters and remembers on resume',()=>{
 const {CALLS}=require('../forks/call-sheet/core/data');
 const b=coordinatorGame('counter-2','pressure');
 b.aiBias={away:{family:'pressure'}};
 const action={type:'call',play:'screen',tactics:[]};
 let req=B.advance(b);
 assert.equal(req.defensePlan.adjusted,false);
 req=B.submit(b,action);
 assert.ok(b.lastResult.yards>=5&&CALLS[b.lastResult.call].pressure>0);
 assert.equal(b.opponentDefense.counters,1);
 assert.equal(req.defensePlan.adjusted,false);
 assert.ok(CALLS[b.snap.def.play].pressure>0);
 const before=B.save(b);
 assert.equal(B.snapDecisions(b).defensePlan.adjusted,false);
 assert.equal(B.save(b),before,'reading the committed matchup changes nothing');
 const resumed=B.load(before);
 req=B.submit(resumed,action);
 assert.ok(resumed.lastResult.yards>=5&&CALLS[resumed.lastResult.call].pressure>0);
 assert.deepEqual(resumed.opponentDefense,{id:'pressure',counters:2});
 assert.equal(req.defensePlan.adjusted,true);
 assert.match(req.defensePlan.text,/Two screens.*drop into coverage/);
 assert.deepEqual(B.load(B.save(resumed)).pending.defensePlan,req.defensePlan);
 resumed.snap.def.play='cover0';
 assert.deepEqual(B.snapDecisions(resumed).defensePlan,req.defensePlan,'the public tendency never reveals this snap’s call');
 const noRush=coordinatorGame('counter-2','pressure');
 noRush.aiBias={away:{pressure:0}};
 B.advance(noRush);B.submit(noRush,action);
 assert.equal(CALLS[noRush.lastResult.call].pressure,0);
 assert.equal(noRush.opponentDefense.counters,0,'a screen against coverage does not count as a pressure counter');
});
test('the two-high coordinator treats only productive runs as reasons to adjust',()=>{
 const b=coordinatorGame('two-high-counter-1','two_high');
 b.aiBias={away:{shell:2}};
 const action={type:'call',play:'inside_zone',tactics:[]};
 B.advance(b);
 assert.equal(B.submit(b,action).defensePlan.adjusted,false);
 assert.equal(b.opponentDefense.counters,1);
 assert.equal(B.submit(b,action).defensePlan.adjusted,false);
 assert.equal(b.opponentDefense.counters,1);
 assert.match(B.submit(b,action).defensePlan.text,/Two runs.*closer to the line/);
 assert.equal(b.opponentDefense.counters,2);
});
test('rivalry film charts a productive payoff only from the winning side of a finished meeting',()=>{
 const payoff=snap({play:'pa_boot',yards:12,sit:{down:3,distance:7,field:45,period:2},
  events:[{type:'combo',id:'establish',duel:'K',side:'home'}]});
 const b={rivalry:true,user:'home',game:{status:'final',score:{home:24,away:20}},log:[payoff,
  {...payoff,yards:8,events:[]},{...payoff,yards:9,penalty:{label:'Holding'}},{...payoff,yards:20,turnover:'fumble'}]};
 assert.deepEqual(B.callFilm(b).rivalryWin,{play:'pa_boot',count:2,yards:20,combo:'establish'});
 assert.equal(B.callFilm({...b,rivalry:false}).rivalryWin,undefined);
 assert.equal(B.callFilm({...b,game:{...b.game,status:'live'}}).rivalryWin,undefined);
 assert.equal(B.callFilm({...b,game:{status:'final',score:{home:20,away:24}}}).rivalryWin,undefined);
});
test('studying different rivalry cards changes legal AI responses without revealing the next call',()=>{
 const D=require('../forks/call-sheet/core/data'),E=require('../game-engine-v2');
 const counts={screen:0,deep_cross:0};
 for(let i=0;i<32;i++)for(const play of Object.keys(counts)){
   const b=B.create({home:Ro.preset('aerial'),away:Ro.preset('tempo'),seed:'rival-coordinator-'+i,
     user:'home',mode:'snap',control:'offense',rivalry:true,rivalryPlan:{side:'home',play}});
   E.startGame(b.game);Object.assign(b.game,{possession:'home',fieldPosition:35,down:1,distance:10});
   const req=B.advance(b),call=D.CALLS[b.snap.def.play];
   counts[play]+=Number(call.pressure>0);
   assert.ok(req.defensePlan.text.includes(D.PLAYS[play].name));
   const replay=B.load(B.save(b));replay.snap.def.play=call.id==='cover0'?'two_high':'cover0';
   assert.deepEqual(B.snapDecisions(replay).defensePlan,B.snapDecisions(b).defensePlan);
 }
 assert.ok(counts.deep_cross>=counts.screen+6,JSON.stringify(counts));
 const old=B.create({home:Ro.preset('aerial'),away:Ro.preset('tempo'),user:'home',rivalry:false,rivalryPlan:{side:'home',play:'deep_cross'}});
 assert.equal(old.rivalryPlan,undefined);
});
test('rivalry film remembers actual converting receivers and two recorded catches',()=>{
  const play=snap({offSide:'away',defSide:'home',sit:{down:4,distance:5,period:4,clock:82,field:60},completed:true,
    participants:{target:'TE'},lineups:{off:{TE:'relief',X:'primary'}},primaryTarget:'X'});
  const b={rivalry:true,user:'home',personnel:{relief:{name:'Sam End'}},log:[play,{...play,sit:{...play.sit,period:3,clock:195}},
    {...play,yards:1},{...play,completed:false},{...play,penalty:{}},{...play,turnover:'fumble'},{...play,lineups:null}]};
  const film=B.callFilm(b).rivalryPlay;
  assert.equal(film.id,'relief');assert.equal(film.name,'Sam End');assert.equal(film.kind,'fourth');
  assert.deepEqual(film.snaps.map(s=>s.clock),[82,195]);assert.equal(film.snaps[0].play,'Deep Cross');
  b.log=b.log.slice(2);assert.equal(B.callFilm(b).rivalryPlay,undefined);
});
test('prepared rivalry assignment follows the on-field player and applies only when Bracket is played',()=>{
  const home=Ro.preset('ground'),away=Ro.preset('tempo'),D=require('../forks/call-sheet/core/data');
  home.rivalryBracketId=away.lineup.off.TE.id;home.decks=clone(D.DEFAULT_DECKS);home.decks.def.tactics=Array(6).fill('bracket');
  const b=B.create({home,away,user:'home',mode:'snap',control:'defense',seed:'bracket-owner'}),req=B.advance(b);
  assert.equal(req.options.bracketPlan.role,'TE');
  const call={type:'call',play:req.options.plays.find(p=>!p.blocked&&!p.cost).id,tactics:['bracket']};
  assert.ok(B.preview(b,'home',call).vs.every(x=>x.snap.bracketRole==='TE'));
  assert.ok(B.preview(b,'home',{...call,tactics:[]}).vs.every(x=>x.snap.bracketRole===null));
  assert.ok(B.preview(b,'home',{...call,bracketRole:'X'}).vs.every(x=>x.snap.bracketRole==='X'));
  const n=b.log.length;B.submit(b,call);assert.equal(b.log[n].bracketRole,'TE');
});

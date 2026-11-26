'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const B=require('../forks/call-sheet/core/battle'),D=require('../forks/call-sheet/core/data'),Ro=require('../forks/call-sheet/core/roster');
const W=require('../forks/call-sheet/core/world');
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(role='off'){
 const b={teams:{home:Ro.preset('ground')},log:[],snap:{def:{play:'secret'}}};
 const ids=role==='off'?['inside_zone','outside_zone','quick_slant','pa_boot','screen']:['cover3','cover1','bear','cover0'];
 const req={kind:'snap',side:'home',role,look:{lean:{value:null,confirmed:false},box:{value:'normal',confirmed:true},shell:{value:1,confirmed:false},pressure:{value:false,confirmed:false}},options:{command:2,plays:ids.filter(id=>(role==='off'?D.PLAYS:D.CALLS)[id]).map(id=>({id,cost:(role==='off'?D.PLAYS:D.CALLS)[id].cost}))}};
 return {b,req};
}
test('snap decisions give contrasting legal hand calls with current named players without mutating state',()=>{
 const {b,req}=fixture();b.teams.home.lineup.off.RB.name='Current Back';
 const before=clone({b,req}),view=B.snapDecisions(b,req);
 assert.ok(view.choices.length>=2&&view.choices.length<=3);assert.equal(new Set(view.choices.map(x=>D.PLAYS[x.id].family)).size,view.choices.length);
 assert.match(view.choices.find(x=>x.id==='inside_zone').detail,/Current Back/);
 assert.match(view.choices.find(x=>x.id==='inside_zone').detail,/lean|repeat/i);
 assert.deepEqual({b,req},before);
 req.options.plays[0].blocked='Out';req.options.plays[2].cost=9;
 assert.ok(B.snapDecisions(b,req).choices.every(x=>!['inside_zone','quick_slant'].includes(x.id)));
});
test('confirmed lean prioritizes a genuine counter but an unconfirmed lean cannot leak through',()=>{
 const {b,req}=fixture();req.look.lean={value:'run',confirmed:true};
 let view=B.snapDecisions(b,req);assert.equal(view.choices[0].id,'pa_boot');assert.match(view.clue,/their defense is playing the run/i);assert.match(view.choices[0].detail,/playing the run.*counter/i);
 req.look.lean.confirmed=false;view=B.snapDecisions(b,req);assert.doesNotMatch(view.clue,/playing the run/);assert.doesNotMatch(JSON.stringify(view),/playing the run.*counter/i);
 b.snap.def.play='changed secret';assert.deepEqual(B.snapDecisions(b,req),view);
});
test('repeated pressure and film streak are evidence, not knowledge of a hidden next call',()=>{
 const {b,req}=fixture();req.look.heat=true;
 let view=B.snapDecisions(b,req);assert.equal(view.choices[0].id,'screen');assert.match(view.clue,/pressure.*film/i);assert.match(view.clue,/not|unknown/i);
 req.look.heat=false;b.log=[1,2,3].map(()=>({type:'snap',offSide:'home',play:'inside_zone'}));
 view=B.snapDecisions(b,req);assert.match(view.clue,/3 straight run/);assert.match(view.clue,/may|not confirmation/);
});
test('defense names own personnel and gives conditional tradeoffs without reading hidden offense',()=>{
 const {b,req}=fixture('def');req.offLook={family:{confirmed:false,value:'deep'}};req.offTendency={run:0};
 b.teams.home.lineup.def.RUSH.name='Actual Edge';
 const view=B.snapDecisions(b,req);assert.ok(view.choices.length>=2);assert.match(JSON.stringify(view),/Actual Edge/);assert.match(JSON.stringify(view),/if|If/);
 b.snap.off={play:'vertical_shot'};assert.deepEqual(B.snapDecisions(b,req),view);
});
test('old saves, duplicate options and non-snap requests are safe',()=>{
 assert.equal(B.snapDecisions({},null),null);assert.equal(B.snapDecisions({}, {kind:'fourth'}),null);
 const {b,req}=fixture();req.options.plays=[req.options.plays[0],req.options.plays[0],{id:'missing',cost:0}];
 assert.equal(B.snapDecisions({},req).choices.length,1);
 const live=B.create({home:Ro.preset('ground'),away:Ro.preset('aerial'),seed:'snap-view',user:'home',control:'offense',mode:'snap'});B.advance(live);
 const saved=B.save(live);B.snapDecisions(live);assert.equal(B.save(live),saved);assert.deepEqual(B.snapDecisions(B.load(saved)),B.snapDecisions(live));
});
test('full preview cannot turn an unconfirmed lean into a certain matchup modifier',()=>{
 const b=B.create({home:Ro.preset('ground'),away:Ro.preset('aerial'),seed:'snap-view',user:'home',control:'offense',mode:'snap'});B.advance(b);
 b.tend.home.run=20;b.snap.look.lean={value:'run',confirmed:false};
 const before=B.save(b),pv=B.preview(b,'home',{play:'pa_boot'});
 assert.ok(!pv.snap.duels.flatMap(d=>d.mods).some(m=>m.src==='Punish the lean'));
 assert.deepEqual(B.presumedCall(b.snap.look,true).counters,[]);
 assert.equal(B.save(b),before);
 b.snap.look.lean.confirmed=true;
 assert.ok(B.preview(b,'home',{play:'pa_boot'}).snap.duels.flatMap(d=>d.mods).some(m=>m.src==='Punish the lean'));
});
test('quick kick is described as possession surrender and impossible hands stay empty',()=>{
 const {b,req}=fixture();req.options.plays=[{id:'quick_kick',cost:1}];
 assert.match(B.snapDecisions(b,req).choices[0].detail,/give up possession/);
 req.options.command=0;assert.deepEqual(B.snapDecisions(b,req).choices,[]);
});

test('compact choices surface a genuine available combo, not a promised outcome',()=>{
 const {b,req}=fixture();b.game={drive:1,possession:'home',period:1};b.drive={key:'1:home',fams:['run','run']};
 const view=B.snapDecisions(b,req);assert.equal(view.choices[0].id,'pa_boot');assert.match(view.choices[0].detail,/Establish the Run ready/);
 assert.ok(view.choices.every(x=>x.detail.length<140));
 b.drive.fams=['run'];assert.doesNotMatch(JSON.stringify(B.snapDecisions(b,req)),/Establish the Run ready/);
});
test('two coached runs draw a visible run lean; the suggested boot gets the real counter edge but loses its fake duel',()=>{
 const P=require('../forks/call-sheet/core/packs'),pb=P.newPlaybook();pb.off.base=['inside_zone','quick_slant','pa_boot'];
 const home=Ro.preset('ground'),away=Ro.preset('aerial');home.decks=P.decksOf(pb);
 home.coach={...home.coach,film:true};away.coach={...away.coach,discipline:2};
 const b=B.create({home,away,user:'home',control:'both',mode:'snap',seed:'coach-drive-3'});
 B.advance(b);
 // Keep the tight end on the field so the coach can call the edge-blocking counter.
 B.setGrouping(b,'home','11');
 for(const play of ['inside_zone','inside_zone'])B.submit(b,{type:'call',play,tactics:[]});
 const view=B.snapDecisions(b);assert.match(view.clue,/their defense is playing the run/i);
 assert.equal(view.choices[0].id,'pa_boot');assert.ok(view.choices.some(c=>D.PLAYS[c.id].family==='run'),'the coach can still stay on the ground');
 B.submit(b,{type:'call',play:view.choices[0].id,tactics:[]});
 const e=b.lastResult,k=e.duels.findIndex(d=>d.key==='K');
 assert.ok(e.duelResults[0].won);assert.ok(e.duels[k].mods.some(m=>m.v===2&&m.src==='Punish the lean'));
 assert.ok(e.duels[k].mods.some(m=>m.src==='COMBO: Establish the Run'));
 assert.equal(e.duelResults[k].won,false,'the advantage did not guarantee the matchup');
 assert.ok(e.duels[k].offNames.includes(home.lineup.off.RB.name));
});
test('a chosen legal opener is in quick reach, even alongside a ready counter from its own family',()=>{
 const {b,req}=fixture();req.options.openingScript='screen';req.look.lean={confirmed:true,value:'run'};
 const view=B.snapDecisions(b,req);assert.equal(view.choices[0].id,'pa_boot');assert.ok(view.choices.some(c=>c.id==='screen'));assert.ok(view.choices.some(c=>D.PLAYS[c.id].family!=='constraint'));
 req.options.command=0;assert.ok(!B.snapDecisions(b,req).choices.some(c=>c.id==='screen'));
});
test('a clock spike names the real QB, not an imaginary target',()=>{
 const {b,req}=fixture();req.options.plays=[{id:'spike',cost:0}];
 const v=B.snapDecisions(b,req);assert.match(v.choices[0].detail,/clock/i);assert.ok(v.choices[0].detail.includes(b.teams.home.lineup.off.QB.name));
});

test('thin-film Quick Calls rank roster-fit options and show the unselected forecast',()=>{
 const pairs=[['sunbelt','prairie'],['tempo','control'],['lakeshore','aerial'],['prairie','ground'],
   ['control','granite'],['aerial','sunbelt'],['ground','tempo'],['granite','lakeshore']];
 const boards=pairs.map(([home,away])=>{
   const b=B.create({home:W.teamFor(home),away:W.teamFor(away),user:'home',mode:'key',control:'offense',
     openingDrive:true,seed:'review-fog-'+home});
   const req=B.advance(b),saved=B.save(b),view=B.snapDecisions(b,req,{},60);
   assert.equal(view.choices.length,3);
   for(const {id,aim,forecast,matchup} of view.choices){
     assert.equal(matchup?.chip,'?');
     const expected=B.scoutedForecast(b,req,{play:id},60);
     assert.deepEqual(forecast,{yards:expected.yards,first:expected.first,confidence:'Limited film',goal:'first'});
     assert.deepEqual(B.quickForecast(b,req,{play:id},60),forecast);
     if(aim==='Dependable gain')assert.notEqual(D.PLAYS[id].family,'deep');
   }
   assert.equal(B.save(b),saved);
   return view.choices.map(c=>c.id);
 });
 assert.ok(boards.filter(ids=>ids.includes('inside_zone')).length<=4,'a base run does not dominate every thin-film board');
 assert.ok(boards.filter(ids=>ids.includes('quick_slant')).length<=5,'the first listed quick pass does not dominate');
});

function thirdDown(seed,distance=6,overrides={}){
 const E=require('../game-engine-v2');
 const b=B.create({seed:'two-down-'+seed,home:Ro.preset('ground'),away:Ro.preset('aerial'),mode:'snap',control:'both',user:'home'});
 E.startGame(b.game);Object.assign(b.game,{possession:'home',fieldPosition:35,down:3,distance,...overrides});B.advance(b);
 return b;
}
test('goal-to-go and money downs give the conversion recommendation priority',()=>{
 for(const [b,aim,goal] of [[thirdDown(0),'Move the chains','first'],[thirdDown(0,4,{fieldPosition:96}),'Reach the end zone','touchdown']]){
   const {choices}=B.snapDecisions(b,b.pending,{},60);
   assert.equal(choices[0].aim,aim);
   assert.ok(choices.every(c=>c.forecast?.goal===goal));
   if(goal==='touchdown')assert.ok(choices.every(c=>c.forecast.yards[1]<=4));
 }
});
test('two-down intent changes legal quick calls, survives resume and clears on the next snap',()=>{
 const b=thirdDown(0),before=B.snapDecisions(b),rng=clone(b.rng);
 B.submit(b,{type:'two_down',active:true});
 const view=B.snapDecisions(b);
 assert.match(view.clue,/gain 4 to leave fourth-and-two/i);
 for(const aim of ['Set up fourth down','Go for the sticks','Take a shot'])assert.ok(view.choices.some(c=>c.detail.startsWith(aim)));
 assert.equal(new Set(view.choices.map(c=>c.id)).size,view.choices.length);
 for(const c of view.choices)assert.ok(b.pending.options.plays.some(p=>p.id===c.id&&!p.blocked&&p.cost<=b.pending.options.command));
 const resumed=B.load(B.save(b));assert.deepEqual(B.snapDecisions(resumed),view);assert.deepEqual(b.rng,rng);
 resumed.snap.def.play='secret';assert.deepEqual(B.snapDecisions(resumed),view);
 B.submit(b,{type:'two_down',active:false});assert.deepEqual(B.snapDecisions(b),before);
 const wrong=thirdDown(0,6,{down:2}),saved=B.save(wrong);
 assert.throws(()=>B.submit(wrong,{type:'two_down',active:true}),/third downs/);assert.equal(B.save(wrong),saved);
 const defense=thirdDown(0,6,{possession:'away'});
 assert.throws(()=>B.submit(defense,{type:'two_down',active:true}),/offensive/);
});
test('staff uses the two-down objective on third down and recommends going on a short fourth without committing',()=>{
 const b=thirdDown(0,8),regular=B.load(B.save(b));
 B.submit(b,{type:'two_down',active:true});B.submit(b,{type:'auto'});B.submit(regular,{type:'auto'});
 assert.equal(b.lastResult.play,'quick_slant');assert.equal(regular.lastResult.play,'vertical_shot');
 const short=thirdDown(8),defaultPlan=B.load(B.save(short));
 B.submit(short,{type:'two_down',active:true});
 const fourth=B.submit(short,{type:'auto'}),defaultFourth=B.submit(defaultPlan,{type:'auto'});
 assert.equal(fourth.kind,'fourth');assert.equal(fourth.situation.distance,2);assert.equal(fourth.recommended,'go');
 assert.equal(defaultFourth.recommended,'punt');assert.ok(fourth.options.includes('punt'));
 const next=B.submit(short,{choice:'go'});assert.equal(next.situation.down,4);
 assert.ok(!short.snap.twoDown);assert.doesNotMatch(B.snapDecisions(short).clue,/two-down territory/i);
});
test('delegated fourth-down decisions also honor the coach’s two-down plan',()=>{
 const b=thirdDown(8);b.mode='key';b.headset.fourth=false;
 B.submit(b,{type:'two_down',active:true});B.submit(b,{type:'auto'});
 const fourth=b.log.find(e=>e.type==='snap'&&e.sit?.down===4);
 assert.ok(fourth);assert.equal(fourth.offSide,'home');assert.equal(fourth.sit.distance,2);
});

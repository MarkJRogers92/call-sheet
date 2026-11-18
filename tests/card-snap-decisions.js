'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const B=require('../forks/call-sheet/core/battle'),D=require('../forks/call-sheet/core/data'),Ro=require('../forks/call-sheet/core/roster');
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
 let view=B.snapDecisions(b,req);assert.equal(view.choices[0].id,'pa_boot');assert.match(view.clue,/leaning on the run/i);assert.match(view.choices[0].detail,/punish the run lean/i);
 req.look.lean.confirmed=false;view=B.snapDecisions(b,req);assert.doesNotMatch(view.clue,/leaning/);assert.doesNotMatch(JSON.stringify(view),/punish the run lean/i);
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
 for(const play of ['inside_zone','inside_zone'])B.submit(b,{type:'call',play,tactics:[]});
 const view=B.snapDecisions(b);assert.match(view.clue,/leaning on the run/i);
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

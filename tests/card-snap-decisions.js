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
 assert.deepEqual(view.choices.find(x=>x.id==='inside_zone').actor,{id:b.teams.home.lineup.off.RB.id,name:'Current Back',role:'RB',kind:'runner'});
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
test('an installed combo exposes its progress and a fitting setup call without reading the hidden defense',()=>{
 const {b,req}=fixture();b.user=req.side;
 b.game={drive:1,possession:'home',period:1};b.drive={key:'1:home',fams:['run']};
 b.decks={home:{off:{wrinkles:['pa_boot'],comboPlan:{id:'establish',play:'pa_boot'}}}};
 req.situation={down:2,distance:6,field:40,period:1};
 Object.defineProperty(b.snap,'def',{get(){throw new Error('hidden defense accessed')}});
 const before=JSON.stringify({drive:b.drive,req,decks:b.decks}),view=B.snapDecisions(b,req);
 const progress=B.equippedComboSetup(b,req);
 assert.equal(progress.step,1);assert.equal(progress.steps,2);assert.equal(progress.ready,false);
 assert.deepEqual(view.comboSetup,{...progress,nextCall:{id:'inside_zone',name:D.PLAYS.inside_zone.name}});
 assert.equal(view.choices[0].aim,'Build the setup');
 assert.equal(JSON.stringify({drive:b.drive,req,decks:b.decks}),before);
 req.situation.down=3;req.situation.distance=10;
 assert.equal(B.snapDecisions(b,req).comboSetup.nextCall,undefined);
 req.situation.down=2;req.options.plays.filter(o=>D.PLAYS[o.id].family==='run').forEach(o=>{o.cost=3});
 assert.equal(B.snapDecisions(b,req).comboSetup.nextCall,undefined);
 b.drive.key='2:home';assert.equal(B.equippedComboSetup(b,req).step,0);
 b.comboLog={home:{1:['establish']}};assert.equal(B.equippedComboSetup(b,req),null);
});
test('an installed payoff wins overlapping recipes in the draw, preview and live result',()=>{
 let b=B.createChallenge('need_six');const side=b.user,plan={id:'change_of_pace',play:'rpo_bubble'};
 const deck=b.decks[side].off,hand=b.hands[side],pile=b.piles[side].off.wrinkle;
 if(!deck.wrinkles.includes(plan.play))deck.wrinkles.push(plan.play);
 deck.comboPlan=plan;
 for(const cards of [hand.wrinkles,pile.draw,pile.discard]){
   const i=cards.indexOf(plan.play);if(i>=0)cards.splice(i,1);
 }
 pile.draw.push(plan.play);
 b.drive={key:`${b.game.drive}:${side}`,fams:['run'],plays:['inside_zone'],calls:[{pressure:2}],results:[{family:'run',yards:7}]};
 assert.equal(B.equippedComboSetup(b).step,0);
 assert.equal(B.comboFor(b,D.PLAYS[plan.play]).id,'screen_the_heat','the installed recipe has not happened yet');
 b.drive.results[0].yards=8;
 b=B.load(B.save(b));
 assert.equal(B.equippedComboSetup(b).ready,true);
 assert.equal(b.pending.comboPayoff?.id,plan.id);
 B.submit(b,{type:'combo_payoff'});
 assert.ok(B.preview(b,side,{play:plan.play}).snap.duels.some(d=>d.mods.some(m=>m.src==='COMBO: Change of Pace')));
 B.submit(b,{type:'call',play:plan.play,tactics:[]});
 assert.deepEqual(b.lastResult.events.filter(e=>e.type==='combo').map(e=>e.id),[plan.id]);
});
test('an equipped run-dependent defensive payoff keeps its condition visible when the family is unknown',()=>{
 const b=B.createChallenge('goal_line_stand'),req=b.pending,deck=b.decks[req.side].def,card=D.CALLS.zone_pressure;
 if(!deck.wrinkles.includes(card.id))deck.wrinkles.push(card.id);
 deck.comboPlan={id:'wall_up',play:card.id};
 b.drive={key:`${b.game.drive}:${b.game.possession}`,results:[{family:'run',yards:1},{family:'run',yards:-4}]};
 const fromFamily=(value,confirmed)=>({...req,offLook:{...req.offLook,family:{value,confirmed}}});
 const unconfirmed=fromFamily('deep',false);
 assert.equal(B.equippedComboSetup(b,unconfirmed).condition,'if they run');
 assert.equal(B.comboRead(b,unconfirmed,card).id,'wall_up');
 assert.equal(B.comboRead(b,fromFamily('run',true),card).id,'wall_up');
 assert.equal(B.comboRead(b,fromFamily('deep',true),card).id,'heat_check');
 assert.equal(B.equippedComboSetup(b,fromFamily('deep',true)).ready,false);
});
test('Quick Calls name a retargeted primary and avoid inventing a Read Option carrier',()=>{
 const {b,req}=fixture(),off=b.teams.home.lineup.off;
 req.options.plays=[{id:'quick_slant',cost:0}];
 const target=B.snapDecisions(b,req,{play:'quick_slant',target:'X'}).choices[0].actor;
 assert.deepEqual(target,{id:off.X.id,name:off.X.name,role:'X',kind:'target'});
 req.options.plays=[{id:'read_option',cost:0}];
 assert.equal(B.snapDecisions(b,req).choices[0].actor,undefined);
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
test('Quick Calls show defensive ranges that distinguish public call tradeoffs',()=>{
 const b=B.createChallenge('goal_line_stand'),req=b.pending,before=B.save(b);
 const withFamily=family=>({...req,offLook:{...req.offLook,family:{value:family,confirmed:true}}});
 const versusRun=withFamily('run'),versusDeep=withFamily('deep');
 const forecast=(look,play,confidence)=>B.quickForecast(b,look,{play},confidence);
 const runFit=forecast(versusRun,'run_fit',60),quarters=forecast(versusRun,'two_high',60);
 assert.ok(runFit.first[1]<quarters.first[1],'load the box against confirmed runs');
 assert.ok(forecast(versusDeep,'two_high',60).first[1]<forecast(versusDeep,'run_fit',60).first[1],
   'keep two safeties back against confirmed deep passes');
 for(const confidence of [60,70,90,undefined]){
   const {choices}=B.snapDecisions(b,req,{},confidence);
   assert.ok(choices.length>=2);
   for(const {id,forecast:estimate} of choices){
     assert.deepEqual(estimate,forecast(req,id,confidence));
     assert.equal(estimate.goal,'touchdown');
     assert.ok(estimate.yards[0]<=estimate.yards[1]&&estimate.yards[1]<=4);
     assert.ok(estimate.first[0]>=0&&estimate.first[0]<estimate.first[1]&&estimate.first[1]<=100);
   }
 }
 for(const [confidence,label] of [[60,'Limited film'],[70,'Partial film'],[90,'Play tendencies'],[undefined,'Play tendencies']]){
   assert.equal(forecast(req,'run_fit',confidence).confidence,label);
 }
 assert.equal(forecast(versusRun,'run_fit',90).confidence,'Scouted family');
 const betweenThe20s=thirdDown(0,6,{possession:'away'});
 assert.equal(B.snapDecisions(betweenThe20s).choices[0].forecast.goal,'first');
 assert.equal(B.save(b),before);
});

test('defensive projections ignore hidden calls, tactics and unread scouting facts',()=>{
 const b=B.createChallenge('goal_line_stand'),req=b.pending;
 const unrevealed=(family,protection)=>({...req,offLook:{family:{value:family,confirmed:false},protection:{value:protection,confirmed:false}}});
 const forecast=(look,confidence)=>B.quickForecast(b,look,{play:'cover3'},confidence);
 const limited=forecast(unrevealed('run',true),60),full=forecast(unrevealed('run',true),90);
 const board=B.snapDecisions(b,req,{},60);
 const noPeeking=()=>{throw new Error('hidden offense accessed')};
 Object.defineProperty(b.snap,'off',{get:noPeeking});
 Object.defineProperty(b.snap,'offInfo',{get:noPeeking});
 assert.deepEqual(forecast(unrevealed('deep',false),90),full);
 assert.deepEqual(B.snapDecisions(b,req,{},60),board);
 Object.defineProperty(b.teams,'away',{get:noPeeking});
 assert.deepEqual(forecast(unrevealed('deep',false),60),limited);
});

test('defensive tactic previews use the selected assignment and compare against the same call',()=>{
 const b=B.createChallenge('goal_line_stand'),base=b.pending;
 const look=family=>({...base,offLook:{...base.offLook,family:{value:family,confirmed:true}}});
 const deep=look('deep'),run=look('run'),play='two_high';
 const bracket=deep.options.tactics.find(t=>t.id==='bracket');
 const choice={play,bracketRole:'Z'};
 const rows=B.quickTactics(b,deep,choice,[bracket.slot],60);
 const paired=B.quickForecast(b,deep,{...choice,tactics:['bracket']},60);
 assert.deepEqual(rows[0].with,paired);
 assert.deepEqual(rows[0].without,B.quickForecast(b,deep,{play},60));
 assert.notDeepEqual(rows[0].with.first,rows[0].without.first);
 assert.notDeepEqual(paired,B.quickForecast(b,deep,{...choice,bracketRole:'X',tactics:['bracket']},60));
 assert.ok(!rows.some(t=>t.name==='Identify Protection'),'scouting cards stay out of tactic comparisons');
 const selected=B.snapDecisions(b,deep,{...choice,tac:[bracket.slot]},60).choices.find(c=>c.id===play);
 assert.deepEqual(selected.forecast,paired);
 assert.notDeepEqual(B.quickForecast(b,run,{play,edgeAssignment:'crash'},90),
   B.quickForecast(b,run,{play,edgeAssignment:'contain'},90));
});

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

'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const D=require('../forks/call-sheet/core/data.js');
const Ro=require('../forks/call-sheet/core/roster.js');
const B=require('../forks/call-sheet/core/battle.js');
const P=require('../forks/call-sheet/core/packs.js');
const W=require('../forks/call-sheet/core/world.js');
const EV=require('../forks/call-sheet/core/evolution.js');

const allWrinkles=(b,side,role)=>[
  ...b.hands[side].wrinkles,
  ...b.piles[side][role].wrinkle.draw,
  ...b.piles[side][role].wrinkle.discard,
  ...(b.exhausted[side]||[]).filter(id=>role==='off'?D.PLAYS[id]:D.CALLS[id])
].sort();

test('Check at the Line redraws wrinkles once per series, honors QB/MIKE cost 0, conserves cards, and survives save/load',()=>{
  const home=Ro.preset('ground');
  home.lineup.off.QB.archetype='Toolsy Project'; // normal 1 CMD redraw
  const b=B.create({home,away:Ro.preset('aerial'),user:'home',mode:'snap',control:'offense',seed:'v31-redraw'});
  let req=B.advance(b);
  assert.equal(req.options.redraw.cost,1);
  const beforeCmd=req.options.command;
  const beforePool=allWrinkles(b,'home','off');
  req=B.submit(b,{type:'redraw'});
  assert.equal(req.options.command,beforeCmd-1);
  assert.equal(req.options.redraw,undefined,'only one redraw per series');
  assert.deepEqual(allWrinkles(b,'home','off'),beforePool,'card piles strictly conserve every wrinkle');
  assert.throws(()=>B.submit(b,{type:'redraw'}),/Cannot check plays/);
  const loaded=B.load(B.save(b));
  assert.equal(loaded.hands.home.checkedLine,true);
  assert.equal(loaded.pending.options.redraw,undefined);

  // Field Architect QB gets a free 0 CMD Check at the Line.
  const freeHome=Ro.preset('aerial');
  freeHome.lineup.off.QB.archetype='Field Architect';
  const b2=B.create({home:freeHome,away:Ro.preset('ground'),user:'home',mode:'snap',control:'offense',seed:'v31-redraw-free'});
  let req2=B.advance(b2);
  assert.equal(req2.options.redraw.cost,0);
  const c2=req2.options.command;
  req2=B.submit(b2,{type:'redraw'});
  assert.equal(req2.options.command,c2);
});

test('all 4 new combos fire on their sequence and setupProgress reports 1/2',()=>{
  const b=B.create({home:Ro.preset('aerial'),away:Ro.preset('ground'),user:'home',mode:'snap',seed:'v31-combos'});
  B.advance(b);
  const dkey=`${b.game.drive}:${b.game.possession}`;
  // Step 1/2 -> 2/2 for Tempo Body Blow
  b.drive={key:dkey,fams:['quick'],plays:['quick_slant'],calls:[{coverage:'zone',pressure:0,shell:2}],results:[{family:'quick',yards:6}],combos:[]};
  assert.match(B.setupProgress(b,D.PLAYS.power,'off')?.label||'',/SET UP 1\/2/);
  b.drive.fams.push('quick');b.drive.plays.push('stick');b.drive.results.push({family:'quick',yards:5});
  assert.equal(B.setupProgress(b,D.PLAYS.power,'off'),null);
  assert.equal(B.comboFor(b,D.PLAYS.power)?.id,'rhythm_and_bruise');

  // Change of Pace
  b.drive={key:dkey,fams:['run'],plays:['inside_zone'],calls:[],results:[{family:'run',yards:8}],combos:[]};
  assert.equal(B.comboFor(b,D.PLAYS.read_option)?.id,'change_of_pace');

  // Bait the Throw (1/2 -> 2/2)
  b.drive={key:dkey,fams:['quick'],plays:['stick'],calls:[{coverage:'zone',pressure:0,shell:2}],results:[{family:'quick',yards:4}],combos:[]};
  assert.match(B.setupProgress(b,D.CALLS.cover1,'def')?.label||'',/SET UP 1\/2/);
  b.drive.calls.push({coverage:'zone',pressure:0,shell:2});
  assert.equal(B.comboFor(b,D.PLAYS.stick,D.CALLS.cover1)?.id,'bait_the_throw');

  // Bring the House
  b.drive={key:dkey,fams:['run'],plays:['inside_zone'],calls:[{coverage:'man',pressure:0,shell:1}],results:[{family:'run',yards:-3}],combos:[]};
  assert.equal(B.comboFor(b,D.PLAYS.inside_zone,D.CALLS.zone_pressure)?.id,'heat_check');
});

test('in-series Clean Execution and Stonewalled surges award +1 Command',()=>{
  // Find a seed where user offense wins all 3 duels on snap 1 (not a first down) and gets Clean Execution.
  let clean=null;
  for(let i=0;i<40&&!clean;i++){
    const b=B.create({home:Ro.preset('ground'),away:Ro.preset('aerial'),user:'home',mode:'snap',control:'offense',seed:`surge-off-${i}`});
    const req=B.advance(b);
    b.hands.home.command=3;
    B.submit(b,{type:'call',play:'inside_zone',tactics:[]});
    const r=b.lastResult;
    if(r?.events?.some(e=>e.type==='surge'&&e.id==='clean_sweep'))clean={b,r};
  }
  assert.ok(clean,'expected Clean Execution surge on 3-for-3 non-first-down snap');
  assert.equal(clean.b.hands.home.command,4);

  // Defense Stonewalled surge when Gate is won and yards <= 0.
  let wall=null;
  for(let i=0;i<40&&!wall;i++){
    const b=B.create({home:Ro.preset('ground'),away:Ro.preset('aerial'),user:'home',mode:'snap',control:'defense',seed:`surge-def-${i}`});
    B.advance(b);
    if(b.pending?.role!=='def')continue;
    b.hands.home.command=3;
    B.submit(b,{type:'call',play:'run_fit',tactics:[]});
    const r=b.lastResult;
    if(r?.events?.some(e=>e.type==='surge'&&e.id==='stonewalled'))wall={b,r};
  }
  assert.ok(wall,'expected Stonewalled surge on defensive Gate win for <= 0 yards');
  assert.equal(wall.b.hands.home.command,4);
});

test('Quick Calls separates a pressure tendency from a confirmed rush and preserves challenge alternates',()=>{
  const b=B.create({home:Ro.preset('ground'),away:Ro.preset('aerial'),user:'home',mode:'snap',control:'offense',seed:'v31-quick'});
  const req=B.advance(b);
  req.look.covTend='zone';
  req.look.coverage={value:null,confirmed:false};
  req.look.box={value:'normal',confirmed:false};
  req.look.shell={value:1,confirmed:false};
  req.look.pressure={value:false,confirmed:false};
  req.look.heat=false;
  req.options.plays=[
    {id:'inside_zone',cost:0,card:D.PLAYS.inside_zone},
    {id:'quick_slant',cost:0,card:D.PLAYS.quick_slant},
    {id:'draw',cost:1,card:D.PLAYS.draw}
  ];
  const covView=B.snapDecisions(b,req);
  assert.match(covView.clue,/zone-coverage tendency/i);
  req.look.heat=true;
  const view=B.snapDecisions(b,req);
  const drawChoice=view.choices.find(c=>c.id==='draw');
  assert.ok(!drawChoice?.badge,'Draw has no live rush bonus from historical heat');
  req.look.pressure={value:false,confirmed:true};
  assert.match(B.snapDecisions(b,req).clue,/confirms no extra rush/);
  assert.equal(B.counterBadge(req,D.PLAYS.draw),null);
  assert.equal(B.counterBadge(req,D.PLAYS.screen),'PRESSURE TENDENCY');
  req.look.pressure={value:true,confirmed:true};
  assert.equal(B.snapDecisions(b,req).choices.find(c=>c.id==='draw')?.badge,'BEATS THE BLITZ');
  assert.ok(view.choices.every(c=>c.detail.length<140));

  const sixAlt=B.createChallenge('need_six',{alternate:true});
  assert.equal(sixAlt.challengeLook,'prevent_umbrella');
  assert.equal(D.CALLS[sixAlt.snap.def.play].shell,2);
  assert.equal(D.CALLS[sixAlt.snap.def.play].coverage,'zone');

  const glsAlt=B.createChallenge('goal_line_stand',{alternate:true});
  assert.equal(glsAlt.challengeLook,'spread_pylon');
  assert.equal(D.PLAYS[glsAlt.snap.off.play].pass,true);
});

test('defensive combo cues only use public family and drive history',()=>{
  const b=B.createChallenge('goal_line_stand');
  const req=b.pending,dkey=b.game.drive+':away';
  b.drive={key:dkey,fams:['run','run'],plays:['inside_zone','inside_zone'],calls:[],
    results:[{family:'run',yards:1},{family:'run',yards:-3}],combos:[]};
  req.offLook.family={value:'run',confirmed:false};
  const runFit=B.comboRead(b,req,D.CALLS.run_fit);
  assert.equal(runFit.id,'wall_up');
  assert.equal(runFit.condition,'if they run');
  req.options.plays=[{id:'run_fit',card:D.CALLS.run_fit,cost:0}];
  assert.match(B.setupCue(b,req).text,/Wall Up.*if they run/);
  assert.match(B.snapDecisions(b,req).choices[0].badge,/IF THEY RUN/);
  b.snap.off={...b.snap.off,play:'deep_cross'};
  req.offLook.family.value='deep';
  assert.deepEqual(B.comboRead(b,req,D.CALLS.run_fit),runFit);
  assert.equal(B.comboRead(b,req,D.CALLS.zone_pressure).alternate,'Wall Up');
  req.offLook.family.confirmed=true;
  assert.equal(B.comboRead(b,req,D.CALLS.run_fit),null);
  const ready=B.comboRead(b,req,D.CALLS.zone_pressure);
  assert.equal(ready.id,'heat_check');
  assert.equal(ready.condition,undefined);
  req.offLook.family.value='run';
  assert.equal(B.comboRead(b,req,D.CALLS.zone_pressure).id,'wall_up','only one defensive combo earns the payoff');
});

test('both units can earn their set-up combo in the same snap, without lowering staff-granted Command',()=>{
  const home=Ro.preset('ground'),pb=P.newPlaybook();
  pb.off.base[1]='power';home.decks=P.decksOf(pb);
  const b=B.create({home,away:Ro.preset('aerial'),user:'home',mode:'snap',control:'offense',seed:'combo-receipts-0'});
  B.advance(b);
  Object.assign(b.game,{down:1,distance:20,fieldPosition:8});
  const zone={coverage:'zone',pressure:0,shell:2};
  b.drive={key:b.game.drive+':home',fams:['quick','quick'],plays:['quick_slant','stick'],calls:[zone,zone],
    results:[{family:'quick',yards:5},{family:'quick',yards:5}],combos:[]};
  b.snap.def={play:'cover1',tactics:[]};b.hands.home.command=3;b.hands.away.command=7;
  b.decks.away.def.base=['cover1'];b.hands.away.wrinkles=[];b.hands.away.tactics=[];
  const start=b.log.length;
  B.submit(b,{type:'call',play:'power',tactics:[]});
  const e=b.log.slice(start).find(x=>x.type==='snap'&&x.userCalled);
  assert.deepEqual(e.events.filter(x=>x.type==='combo').map(x=>[x.id,x.side,x.commandRefund]),
    [['rhythm_and_bruise','home',1],['bait_the_throw','away',0]]);
  assert.ok(e.duels[0].mods.some(x=>x.src==='COMBO: Tempo Body Blow'));
  assert.ok(e.duels[1].mods.some(x=>x.src==='COMBO: Bait the Throw'));
  assert.equal(b.hands.away.command,7);
});

test('repairMinimum repairs under-minimum decks and AI evolutions honor roster gates',()=>{
  const pb=P.newPlaybook();
  pb.off.wrinkles=pb.off.wrinkles.slice(0,2);
  pb.def.tactics=[];
  P.repairMinimum(pb);
  assert.equal(P.underMinimum(pb),null);
  assert.equal(pb.off.wrinkles.length,6);
  assert.equal(pb.def.tactics.length,6);

  const world=W.newWorld('aerial','v31-ai-gate');
  const oppId=W.opponentOf(world),prog=world.programs[oppId];
  prog.playbook.mastery.inside_zone=100;
  // Force low power across O-line so inside_zone_plus (Power Zone) is locked.
  for(const r of ['LG','C','RG'])prog.lineup.off[r].traits.power=40;
  const ready=EV.ready(prog.playbook,{lineup:prog.lineup}).find(x=>x.rootId==='inside_zone');
  assert.ok(ready);
  W.advanceWeek(world,pb,{won:true,userTendency:'run',opponentTendency:'run'});
  if(prog.playbook.evolved?.inside_zone){
    assert.ok(!ready.locks?.[prog.playbook.evolved.inside_zone],'AI only picks unlocked evolution branch');
  }
});

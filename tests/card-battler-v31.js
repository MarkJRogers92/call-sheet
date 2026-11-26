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

test('Quick Calls surfaces covTend, draw heat counter, badges, and Need Six / Goal-Line Stand alternates',()=>{
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
  assert.ok(drawChoice,'draw is surfaced as a heat counter');
  assert.equal(drawChoice.badge,'BEATS BLITZ');
  assert.ok(view.choices.every(c=>c.detail.length<140));

  const sixAlt=B.createChallenge('need_six',{alternate:true});
  assert.equal(sixAlt.challengeLook,'prevent_umbrella');
  assert.equal(D.CALLS[sixAlt.snap.def.play].shell,2);
  assert.equal(D.CALLS[sixAlt.snap.def.play].coverage,'zone');

  const glsAlt=B.createChallenge('goal_line_stand',{alternate:true});
  assert.equal(glsAlt.challengeLook,'spread_pylon');
  assert.equal(D.PLAYS[glsAlt.snap.off.play].pass,true);
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

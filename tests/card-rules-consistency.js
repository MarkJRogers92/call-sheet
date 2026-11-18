'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const B=require('../forks/call-sheet/core/battle'),R=require('../forks/call-sheet/core/resolver');
const D=require('../forks/call-sheet/core/data'),Ro=require('../forks/call-sheet/core/roster'),RNG=require('../rng');

function start(role,info){
  const home=Ro.preset('ground'),away=Ro.preset('tempo');
  home.lineup.off.SLOT.archetype='Motion Weapon';
  home.decks=structuredClone(D.DEFAULT_DECKS);
  home.decks[role].tactics=Array(6).fill(info);
  const b=B.create({home,away,user:'home',mode:'snap',control:role==='off'?'offense':'defense',seed:'info-test'});
  B.advance(b);return b;
}
for(const id of ['identify_protection','film_tell']){
  test(id+' resolves before a defensive call, charges once and survives resuming',()=>{
    const b=start('def',id),before=b.hands.home.command,price=b.pending.options.tactics[0].cost;
    assert.ok(b.snap.off);assert.equal(b.snap.def,null);
    const req=B.submit(b,{type:'info',tactic:id});
    const fact=id==='film_tell'?'family':'protection';
    assert.equal(req.offLook[fact].confirmed,true);
    assert.equal(b.hands.home.command,before-price);
    assert.deepEqual(B.load(B.save(b)).pending.offLook,req.offLook);
    const saved=B.save(b);
    assert.throws(()=>B.submit(b,{type:'info',tactic:id}));
    assert.equal(B.save(b),saved);
    if(id==='identify_protection'){
      const pv=B.preview(b,'home',{play:'cover0',tactics:[]});
      assert.ok(pv.vs.some(row=>row.snap.duels.some(d=>d.mods.some(m=>m.src==='Aimed pressure'))));
    }
  });
}
test('Motion, Motion Weapon, primary-only and momentum use the same context in preview and replay',()=>{
  const b=start('off','motion'),role='home',choice={type:'call',play:'quick_slant',tactics:[],read:'primary'};
  B.setGrouping(b,role,'11');
  B.submit(b,{type:'info',tactic:'motion'});b.momentum={side:'home',left:1};
  const pv=B.preview(b,role,choice);assert.equal(pv.snap.checkdown,null);
  assert.ok(B.preview(b,role,{...choice,read:'auto'}).snap.checkdown);
  const i=b.log.length;B.submit(b,choice);
  for(const gate of [pv.snap.duels[0],b.log[i].duels[0]]){
    assert.equal(gate.mods.filter(m=>m.src==='Motion').length,1);
    assert.ok(gate.mods.some(m=>m.src.includes('Motion Weapon')));
    assert.ok(gate.mods.some(m=>m.src==='Momentum: takeaway'));
  }
});
test('forecast counts interceptions before a possible checkdown and uses the sampled explosive mean',()=>{
  const ro=Ro.preset('tempo'),play=structuredClone(D.PLAYS.deep_cross);
  const snap=R.buildSnap({off:ro.lineup.off,def:ro.lineup.def,play,call:D.CALLS.cover3});
  snap.duels.forEach(d=>d.p=1);
  const rng=RNG.create('distribution'),n=20000;
  play.results.explosive=[{w:1,kind:'inc',yards:[0,0],int:.20}];
  snap.checkdown={p:.60,role:'RB',defRole:'WILL',yards:5};
  snap.flags.ballHawk=false;
  const ev=R.evaluate(snap,{distance:10});assert.equal(ev.turnover,.2);
  let picked=0,checked=0;
  for(let i=0;i<n;i++){const o=R.resolve(snap,rng);if(o.turnover)picked++;if(o.checkdown)checked++}
  assert.ok(Math.abs(picked/n-.2)<.015);assert.ok(Math.abs(checked/n-.48)<.015);
  play.results.explosive=[{w:1,kind:'catch',yards:[10,0],tail:1}];
  assert.equal(R.evaluate(snap,{distance:10}).yards,34);
  let yards=0;for(let i=0;i<n;i++)yards+=R.resolve(snap,rng).yards;
  assert.ok(Math.abs(yards/n-34)<.5);
});
test('Hard Count reverses a real exhausted trick and its exact charge after save/resume',()=>{
  const home=Ro.preset('ground'),away=Ro.preset('tempo'),Engine=require('../game-engine-v2');
  home.lineup.off.C.archetype='Anchor';home.lineup.off.C.traits.composure=40;
  home.decks=structuredClone(D.DEFAULT_DECKS);home.decks.off.tactics=['hard_count'];
  away.decks=structuredClone(D.DEFAULT_DECKS);away.decks.def={base:['cover3'],wrinkles:['ghost_blitz'],tactics:['disguise']};
  let b;
  for(let i=0;i<60;i++){
    b=B.create({home,away,user:'home',control:'offense',mode:'snap',seed:'refund-'+i});
    Engine.startGame(b.game);Object.assign(b.game,{possession:'home',down:3,distance:10});
    // A previously discarded different call must not be removed by the refund.
    b.piles.away.def.wrinkle.draw.unshift('two_man','two_man','two_man');
    b.piles.away.def.wrinkle.discard.push('two_man');
    B.advance(b);if(b.snap.def.play==='ghost_blitz')break;
  }
  assert.equal(b.snap.def.play,'ghost_blitz');
  const starting=b.snap.def.restore.hand.command;
  b.game.fieldPosition=4;
  for(let i=0;;i++){const rng=RNG.create('dead-ball-'+i),snapshot=rng.snapshot();if(rng.next()<.15){b.rng=snapshot;break}}
  const ids=game=>[...game.hands.away.wrinkles,...game.piles.away.def.wrinkle.draw,...game.piles.away.def.wrinkle.discard,...game.exhausted.away].sort();
  const before=ids(b),saved=B.load(B.save(b));B.submit(b,{type:'info',tactic:'hard_count'});
  B.submit(saved,{type:'info',tactic:'hard_count'});
  assert.equal(b.box.home.penalties,1);assert.deepEqual(ids(b),before);
  const flag=b.log.findLast(e=>e.type==='penalty');
  assert.equal(flag.yards,2);assert.match(flag.text,/2 yards/);assert.equal(b.box.home.penaltyYds,2);
  assert.equal(b.snap.def.restore.hand.command,starting);
  assert.deepEqual(B.save(saved),B.save(b));
});

test('automated Film Tell waits for a committed offense and can guide its pending defensive decision',()=>{
  const Engine=require('../game-engine-v2');
  function thirdDown(user){
    const home=Ro.preset('ground'),away=Ro.preset('tempo');
    away.decks=structuredClone(D.DEFAULT_DECKS);away.decks.def.tactics=['film_tell'];
    const b=B.create({home,away,user,mode:'snap',control:'both',seed:'film-timing'});
    Engine.startGame(b.game);Object.assign(b.game,{possession:'home',down:3,distance:7,fieldPosition:40});
    B.advance(b);return b;
  }
  const first=thirdDown('home');
  assert.equal(first.snap.off,null);
  assert.deepEqual(first.snap.defInfo,[]);assert.ok(first.hands.away.tactics.includes('film_tell'));
  const last=thirdDown('away'),i=last.log.length,planned=D.PLAYS[last.snap.off.play].family;
  B.submit(last,{type:'auto'});
  assert.equal(D.PLAYS[last.log[i].play].family,planned);
  assert.deepEqual(last.log[i].defInfo,['film_tell']);
});

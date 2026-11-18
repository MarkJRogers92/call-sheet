'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const B=require('../forks/call-sheet/core/battle');
const Ro=require('../forks/call-sheet/core/roster');
const D=require('../forks/call-sheet/core/data');
const E=require('../game-engine-v2');

function fixture(seed,overrides={}){
  const b=B.create({seed,home:Ro.preset('ground'),away:Ro.preset('aerial'),
    mode:'snap',control:'both',user:'home',coachingWindows:true});
  E.startGame(b.game);
  Object.assign(b.game,{possession:'home',fieldPosition:30,down:1,distance:10,...overrides});
  return b;
}
function tacticCopies(b,role='off'){
  const p=b.piles.home[role].tactic,hand=b.hands.home;
  return [...p.draw,...p.discard,...(hand?.role===role?hand.tactics:[])].sort();
}
const run={type:'call',play:'inside_zone',tactics:[]};

test('halftime permits one saved choice from the shuffled deck, without creating a card or revealing the shuffle',()=>{
  const b=fixture('halftime-draw',{period:3,clock:900});
  b.period=2;
  const req=B.advance(b),before=B.save(b);
  assert.equal(req.kind,'halftime');
  assert.deepEqual(req.options.filter(o=>o.role==='off').map(o=>o.id),[...new Set(b.decks.home.off.tactics)].sort());
  assert.throws(()=>B.submit(b,{type:'halftime',tactic:'absent'}));
  assert.equal(B.save(b),before);
  const copy=B.load(before),cards=tacticCopies(b);
  for(const state of [b,copy]){
    const next=B.submit(state,{type:'halftime',tactic:'max_protect'});
    assert.equal(next.kind,'snap');assert.ok(state.hands.home.tactics.includes('max_protect'));
    assert.equal(state.hands.home.tactics.length,D.RULES.tacticHand);
    assert.deepEqual(tacticCopies(state),cards);
    assert.equal(state.halftimeAdjustment,'max_protect');
    assert.throws(()=>B.submit(state,{type:'halftime',tactic:'motion'}));
  }
  assert.equal(B.save(b),B.save(copy));
  const lineupChoice=B.load(before),mode=req.packages.find(p=>p.id==='11');
  assert.ok(mode);
  B.submit(lineupChoice,{type:'halftime',adjustment:'package:'+mode.id});
  assert.equal(lineupChoice.grouping.home,mode.id);
  assert.equal(lineupChoice.halftimeAdjustment,'package:'+mode.id);
  assert.deepEqual(tacticCopies(lineupChoice),cards);
});

test('a reserved tactic spends a normal draw only on conversion, with a fresh series discount and exact inventory',()=>{
  for(let i=0;i<40;i++){
    const b=fixture('keep-'+i,{distance:1});
    B.advance(b);
    const card=b.hands.home.tactics[0],cards=tacticCopies(b);
    b.hands.home.onceUsed.push(card);
    B.setSideline(b,{keep:card});
    const before=B.save(b),copy=B.load(before);
    B.submit(b,run);B.submit(copy,run);
    assert.equal(B.save(b),B.save(copy));
    if(!b.hands.home.retained)continue;
    assert.equal(b.lastResult.after.possession,'home');assert.equal(b.lastResult.after.down,1);
    assert.equal(b.hands.home.retained,card);assert.equal(b.hands.home.tactics[0],card);
    assert.equal(b.hands.home.tactics.length,D.RULES.tacticHand);
    assert.deepEqual(b.hands.home.onceUsed,[]);assert.deepEqual(tacticCopies(b),cards);
    return;
  }
  assert.fail('Expected an earned first down');
});

test('late tempo changes only elapsed time; one authorized timeout shares the real inventory and survives save',()=>{
  for(let i=0;i<30;i++){
    const base=fixture('clock-'+i,{period:4,clock:95});base.period=4;B.advance(base);
    const results={};
    for(const intent of ['normal','preserve','drain','timeout']){
      const b=B.load(B.save(base));
      B.setSideline(b,{intent:intent==='timeout'?'normal':intent,timeoutNext:intent==='timeout'});
      const copy=B.load(B.save(b));B.submit(copy,run);
      results[intent]={out:copy.lastResult,left:copy.game.timeouts.home};
    }
    const ordinary=results.normal.out;
    if(ordinary.penalty||ordinary.turnover||ordinary.after.possession!=='home')continue;
    assert.equal(results.normal.left,3);assert.equal(results.preserve.left,3);assert.equal(results.timeout.left,2);
    assert.equal(results.timeout.out.after.clock,89);assert.equal(results.preserve.out.after.clock,82);
    assert.equal(results.drain.out.after.clock,ordinary.after.clock-10);
    for(const item of Object.values(results))assert.equal(item.out.yards,ordinary.yards);
    return;
  }
  assert.fail('Expected a running-clock snap');
});

test('clock-stop calls preserve the timeout, and invalid instructions leave the hand and clock intact',()=>{
  const b=fixture('spike-clock',{period:2,clock:60});b.period=2;B.advance(b);
  const before=B.save(b);
  assert.throws(()=>B.setSideline(b,{keep:'not-owned',intent:'preserve',timeoutNext:true}));
  assert.equal(B.save(b),before);
  B.setSideline(b,{intent:'drain',timeoutNext:true});
  const req=B.submit(b,{type:'call',play:'spike',tactics:[]});
  assert.equal(req.kind,'snap');assert.equal(b.game.timeouts.home,3);
  assert.ok(b.lastResult.after.clock>=54);assert.equal(B.sidelineOptions(b).timeoutNext,false);
});

test('film identifies a repeated productive call and its actual player, and ignores future calls and flags',()=>{
  const b=fixture('observed-film'),p=b.teams.home.lineup.off.RB;
  const gain={type:'snap',play:'inside_zone',offSide:'home',participants:{carrier:'RB'},lineups:{off:{RB:p.id}},sit:{distance:7},yards:9};
  b.log=[gain,{...gain,penalty:{kind:'holding'}},{...gain,yards:3}];
  b.snap={off:{play:'inside_zone'}};
  assert.equal(B.revealedThreat(b,'home'),null);
  b.log.push({...gain,yards:12});
  assert.deepEqual(B.revealedThreat(b,'home'),{play:'inside_zone',role:'RB',playerId:p.id,count:2,yards:21,family:'run'});
  assert.match(B.adaptationRead(b,{kind:'snap',side:'home',role:'off'}).summary,new RegExp(p.name));
  b.log.push({type:'halftime'});assert.equal(B.revealedThreat(b,'home'),null);
});

test('recorded success can change the defensive commitment before the offense selects its next play',()=>{
  for(let i=0;i<80;i++){
    const plain=fixture('film-counter-'+i),film=B.load(B.save(plain));
    const event={type:'snap',play:'inside_zone',offSide:'home',participants:{carrier:'RB'},
      lineups:{off:{RB:film.teams.home.lineup.off.RB.id}},sit:{distance:7},yards:10};
    film.log=[event,event,event,event];
    B.advance(plain);B.advance(film);
    assert.equal(film.snap.off,null);
    const unprepared=D.CALLS[plain.snap.def.play],prepared=D.CALLS[film.snap.def.play];
    if(!unprepared.counters.includes('run')&&prepared.counters.includes('run'))return;
  }
  assert.fail('Expected an observed repeated threat to influence at least one defensive call');
});

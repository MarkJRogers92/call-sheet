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

test('Key Moments headset delegates fourth downs and stops once per drive at the opponent’s 25',()=>{
  function setup(game,headset={}){
    const b=fixture('headset-offense',game);
    b.mode='key';b.control='offense';b.headset=B.headsetSettings(headset);return b;
  }
  const fourth={down:4,fieldPosition:25,distance:9};
  assert.equal(B.advance(setup(fourth)).kind,'fourth');
  const delegate=setup(fourth,{fourth:false});
  B.advance(delegate);assert.equal(delegate.log.find(e=>e.type==='kick').kick,'punt');
  const entering=setup({fieldPosition:75},{inside25:true});
  assert.equal(B.advance(entering).kind,'snap');assert.equal(entering.telemetry.snaps,0);
  const checkpoint=B.load(B.save(entering));assert.equal(checkpoint.headset25Drive,checkpoint.game.drive);
  for(const alreadyCalled of [false,true]){
    const b=setup({fieldPosition:75},{inside25:true});
    b.headset25Drive=alreadyCalled?b.game.drive:b.game.drive-1;
    B.advance(b);assert.equal(b.telemetry.snaps===0,!alreadyCalled);
  }
  const outside=setup({fieldPosition:74},{inside25:true});B.advance(outside);assert.ok(outside.telemetry.snaps>0);
  const old=setup({fieldPosition:75});delete old.headset;
  const loaded=B.load(B.save(old));assert.deepEqual(loaded.headset,{fourth:true,inside25:false,defendLead:false,restStarters:true});
  B.advance(loaded);assert.ok(loaded.telemetry.snaps>0);
});

test('one-score lead puts an offense-only coach on defense only in Key Moments',()=>{
  for(const [lead,mode,enabled,stops] of [[1,'key',true,true],[8,'key',true,true],[9,'key',true,false],[0,'key',true,false],[-3,'key',true,false],[3,'key',false,false],[3,'snap',true,false]]){
    const b=fixture('headset-defense',{possession:'away',score:{home:14+lead,away:14}});
    b.mode=mode;b.control='offense';b.headset=B.headsetSettings({defendLead:enabled});
    const req=B.advance(b);assert.equal(b.telemetry.snaps===0,stops);
    if(stops){assert.equal(req.kind,'snap');assert.equal(req.role,'def')}
  }
});

test('feature selection is atomic and the boost follows the actual call and receiver',()=>{
  const b=fixture('feature-duels');B.advance(b);
  const rb=b.teams.home.lineup.off.RB,slot=b.teams.home.lineup.off.SLOT,feature=rb.id;
  assert.throws(()=>B.setSideline(b,{feature,keep:'missing'}));assert.equal(B.sidelineOptions(b).featured,null);
  B.setSideline(b,{feature});
  const labeled=(play,target)=>B.preview(b,'home',{play,target,tactics:[]}).snap.duels.some(d=>d.mods.some(m=>m.src==='Featured: '+rb.name));
  assert.ok(labeled('inside_zone'));assert.equal(labeled('pa_boot'),false,'selling the fake is not a designed touch');
  const R=require('../forks/call-sheet/core/resolver');
  const option=edgeAssignment=>R.buildSnap({off:b.teams.home.lineup.off,def:b.teams.away.lineup.def,play:D.PLAYS.read_option,call:D.CALLS.cover3,
    featured:{role:'RB',id:rb.id,v:1},edgeAssignment}).duels.some(d=>d.mods.some(m=>m.src==='Featured: '+rb.name));
  assert.equal(option('contain'),true,'read option actually hands off');assert.equal(option('crash'),false,'quarterback keeps');
  const saved=B.save(b),sub=b.teams.home.packageDepth.find(p=>p.pos==='RB');
  b.teams.home.lineup.off.RB=sub;assert.equal(labeled('inside_zone'),false);
  const resumed=B.load(saved);assert.equal(B.sidelineOptions(resumed).featured.id,feature);
  resumed.game.period=3;assert.equal(B.sidelineOptions(resumed).featured,null);
  B.setSideline(resumed,{feature:slot.id});assert.equal(B.sidelineOptions(resumed).featured.id,slot.id);
});
test('a featured pass target spends a touch only on a recorded catch',()=>{
  const results=new Set();
  for(let i=0;i<35&&results.size<2;i++){
    const b=fixture('feature-receipt-'+i);B.advance(b);
    const id=b.teams.home.lineup.off.SLOT.id;B.setSideline(b,{feature:id});
    const start=b.log.length;B.submit(b,{type:'call',play:'quick_slant',tactics:[],read:'primary'});
    const e=b.log.slice(start).find(x=>x.type==='snap');
    if(e?.participants?.target!=='SLOT')continue;
    assert.equal(b.featured.home.touches,e.completed?1:0);
    assert.equal(e.featuredTouch,e.completed?id:undefined);
    results.add(!!e.completed);
  }
  assert.equal(results.size,2,'saw an actual catch and a missed target');
});
test('film counts actual plays, notices only contemporaneous featured touches, and clears between halves',()=>{
  const b=fixture('sampled-feature'),rb=b.teams.home.lineup.off.RB,slot=b.teams.home.lineup.off.SLOT;
  const catchPlay={type:'snap',offSide:'home',play:'quick_slant',primaryTarget:'SLOT',completed:true,sit:{distance:5,period:1},
    participants:{target:'RB'},lineups:{off:{RB:rb.id,SLOT:slot.id}},yards:9};
  b.featured={home:{id:rb.id,half:1,touches:0}};b.log=[catchPlay];assert.equal(B.revealedThreat(b,'home'),null);
  b.log=[{...catchPlay,featuredTouch:rb.id}];let t=B.revealedThreat(b,'home');
  assert.equal(t.count,1);assert.equal(t.featuredTouches,1);assert.equal(t.yards,9);assert.equal(t.playerId,rb.id);
  assert.match(B.adaptationRead(b,{kind:'snap',side:'home',role:'off'}).summary,/1 productive Quick Slant call\./);
  b.log.push({...catchPlay,completed:false});assert.equal(B.revealedThreat(b,'home').count,1);
  b.log.push(catchPlay);t=B.revealedThreat(b,'home');assert.equal(t.count,2);assert.equal(t.yards,18);assert.equal(t.featuredTouches,1);
  b.teams.home.lineup.off.RB=b.teams.home.packageDepth.find(p=>p.pos==='RB');assert.equal(B.revealedThreat(b,'home'),null);
  b.teams.home.lineup.off.RB=rb;b.game.period=3;assert.equal(B.revealedThreat(b,'home'),null);
  b.game.period=5;b.log=[{...catchPlay,sit:{...catchPlay.sit,period:4},featuredTouch:rb.id}];assert.equal(B.revealedThreat(b,'home'),null);
});

'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const P=require('../forks/call-sheet/core/packs');
const {loadEngine}=require('../tools/harness'),{postgameFrame}=require('./helpers/postgame-frame');
const offer=(id,extra={})=>({...P.POOL.find(c=>c.id===id),...extra});

test('one live pack recommendation explains its use without picking, sorting, or rerolling',()=>{
  const pb=P.newPlaybook(),cards=[offer('deep_cross'),offer('cover2_trap',{why:'Counters their quick game'}),offer('inside_zone_plus')];
  const before=JSON.stringify({pb,cards});
  let fit=P.packFit(pb,cards);
  assert.equal(fit.id,'cover2_trap');assert.match(fit.reason,/quick game/i);
  fit=P.packFit(pb,cards,{target:{name:'Ground Game',missing:['inside_zone_plus']}});
  assert.equal(fit.id,'inside_zone_plus');assert.match(fit.reason,/Ground Game/);
  assert.equal(JSON.stringify({pb,cards}),before);
});

test('pack advice accounts for storage, stale upgrades, and already active copies',()=>{
  const pb=P.newPlaybook(),c=offer('cover2_trap',{why:'Counters their quick game'});
  pb.def.wrinkles=Array(pb.capacity.wrinkles).fill('robber');
  assert.equal(P.packFit(pb,[c,offer('inside_zone_plus')]).id,'inside_zone_plus');
  assert.equal(P.packFit(pb,[c],{reserveLimit:0}),null);
  assert.equal(P.packFit(pb,[offer('deep_cross')]),null,'no invented benefit from an existing active copy');
  let f=P.packFit(pb,[c],{game:false});assert.match(f.reason,/collection/i);
  let pack=P.freezeGamePack(pb,{cards:[offer('inside_zone_plus')]},{key:'card:test',year:2026});
  pb.off.base[0]='power';const live=P.gamePackChoices(pb,pack);
  f=P.packFit(pb,live);
  assert.ok(!f||f.id===live[0].id);assert.notEqual(f?.id,'inside_zone_plus');
});

test('film notes require an actual defensive family counter, including old banked offers',()=>{
  const pb=P.newPlaybook(),D=require('../forks/call-sheet/core/data');
  const R=require('../forks/call-sheet/core/resolver'),W=require('../forks/call-sheet/core/world');
  const lineups={off:W.freshLineup('granite').off,def:W.freshLineup('prairie').def};
  const sample={run:'inside_zone',quick:'quick_slant',deep:'deep_cross',constraint:'screen'};
  for(const [family,ids] of Object.entries(P.COUNTERS))for(const id of ids){
    assert.equal(D.rarityOf(id),'common','losses should not guarantee a premium card');
    if(family==='run'&&id==='spy')continue; // the exception below must name the QB keeper
    const key=R.buildSnap({...lineups,play:D.PLAYS[sample[family]],call:D.CALLS[id]}).duels.find(d=>d.key==='K');
    assert.ok(key.mods.some(m=>m.v<0&&/Built for the run|Coverage built for it|Robber lurking/.test(m.src)),id+' does not counter '+family+' at the Key duel');
  }
  const spyMods=play=>R.buildSnap({...lineups,play:D.PLAYS[play],call:D.CALLS.run_fit,defTactics:['spy']}).duels.flatMap(d=>d.mods.filter(m=>m.src==='QB spy'));
  assert.ok(spyMods('read_option').some(m=>m.v===-2));assert.deepEqual(spyMods('inside_zone'),[]);
  const film=P.openPack(pb,{won:false,oppTendency:{run:12},seed:'run-film'});
  const spy=film.cards.find(c=>c.id==='spy');assert.ok(spy);
  assert.match(spy.why,/quarterback|QB/);assert.doesNotMatch(spy.why,/Counters their run game/);
  const f=P.packFit(pb,[spy,offer('stunt')]);
  assert.equal(f.id,'spy','the specific QB-run tool beats an unrelated new pressure tactic');assert.match(f.reason,/another copy/i);
  const stale=[offer('stunt'),offer('two_man'),offer('spy')].map(c=>({...c,why:'Counters their run game'}));
  const bank=P.freezeGamePack(pb,{cards:stale},{key:'card:old-run',year:2025});
  const before=JSON.stringify(bank),live=P.gamePackChoices(pb,bank);
  assert.deepEqual(live.map(c=>c.id),stale.map(c=>c.id));
  assert.ok(live.every(c=>!c.why?.includes('Counters their run')));
  assert.equal(P.packFit(pb,live),null,'no tactical endorsement of a stale film slot');
  assert.equal(P.packFit(pb,stale),null,'raw offers are checked as well');
  assert.equal(JSON.stringify(bank),before);
});

test('postgame offers a useful earned card once; it persists on resume without claiming the pack',async()=>{
  const e=loadEngine({seed:90451,fullRuntime:true});e.setUserTeam('Chicago Metropolitan');await e.loadSchools();e.initUniverse();
  const host=globalThis.__callSheetDynasty,CS=globalThis.CallSheet;globalThis.DynastyCardGameDay.enable();
  e.universe.callSheet.cardStreak=2;
  const cfg=host.launch(),make=s=>CS.adapter.battleTeam(cfg[s],s===cfg.userSide?P.decksOf(e.universe.callSheet.playbook):null,cfg.program?.[s]);
  const battle=CS.battle.simulate({home:make('home'),away:make('away'),seed:cfg.seed});battle.user=cfg.userSide;
  host.save({activeBattle:{seed:cfg.seed,battle:CS.battle.save(battle)}});
  const entry={...host,close(){}},frame=postgameFrame(entry),html=frame.get('#modal').innerHTML;
  assert.match(html,/id="equipMilestone"/);assert.match(html,/id="bankPack"/);
  assert.match(html,/Add Flea Flicker to next game's deck/,'the just-committed third-win milestone comes through the host');
  const snap=JSON.stringify(frame.api.b._gamePack),pb=frame.api.save().playbook;
  const count=()=>['off','def'].reduce((sum,s)=>sum+pb[s].tactics.length+pb[s].wrinkles.length,0),old=count();
  const click=frame.get('#equipMilestone').onclick;click();click();
  assert.equal(count(),old+1);assert.equal(pb.packsOpened,0);
  const resume=postgameFrame(entry);
  assert.doesNotMatch(resume.get('#modal').innerHTML,/id="equipMilestone"/);
  assert.equal(JSON.stringify(resume.api.b._gamePack),snap);
  resume.get('#bankPack').onclick();
  assert.equal(e.universe.callSheet.playbook.gamePacks.length,1);
  assert.equal(e.universe.callSheet.playbook.packsOpened,0);
});

test('after a loss, the swap removes one copy of the play that struggled and adds an owned play from another family',()=>{
  const D=require('../forks/call-sheet/core/data'),pb=P.newPlaybook();P.ensureCollection(pb);
  const weak=pb.off.wrinkles.find(id=>D.PLAYS[id]&&!D.PLAYS[id].trick);const fam=D.PLAYS[weak].family;
  const other=Object.keys(D.PLAYS).find(id=>!D.PLAYS[id].trick&&!D.PLAYS[id].fourthOnly&&!D.PLAYS[id].signature&&D.PLAYS[id].side!=='def'&&D.PLAYS[id].family!==fam&&!pb.off.wrinkles.includes(id)&&!pb.off.base.includes(id)&&P.POOL.some(c=>c.id===id));
  const same=Object.keys(D.PLAYS).find(id=>D.PLAYS[id].family===fam&&id!==weak&&!D.PLAYS[id].trick&&P.POOL.some(c=>c.id===id));
  const note={weakId:weak,playId:'inside_zone',samples:4,avg:1.3};
  assert.equal(P.lossSwap(pb,note),null,'nothing to add from an empty collection');
  if(same)pb.reserve.off.wrinkles.push(same);assert.equal(P.lossSwap(pb,note),null,'same family is not a real change');
  pb.reserve.off.wrinkles.push(other);
  const before=JSON.stringify(pb),s=P.lossSwap(pb,note);assert.equal(JSON.stringify(pb),before,'advice does not edit the deck');
  assert.deepEqual([s.remove,s.add],[weak,other]);assert.match(s.why,/averaged 1\.3 yards on 4 calls/);
  assert.equal(P.lossSwap(pb,{...note,weakId:pb.off.base[0]}),null,'base calls are never removed');
  assert.equal(P.lossSwap(pb,{...note,weakId:null}),null);
});

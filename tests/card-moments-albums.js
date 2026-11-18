'use strict';
// Duel moments in box scores and the archive (coached and simulated card games), and collection albums.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadEngine}=require('../tools/harness');
async function setup(seed){
  globalThis.__DL_TEST__={};
  const e=loadEngine({seed,fullRuntime:true});e.setUserTeam('Chicago Metropolitan');await e.loadSchools();e.initUniverse();e.universe.weeklyDecisions=[];
  const cg=globalThis.DynastyCardGameDay;cg.enable();
  return{e,cg,u:e.universe,me:e.T('Chicago Metropolitan'),CS:globalThis.CallSheet,host:globalThis.__callSheetDynasty};
}

test('the battle names the deciding duel and the biggest swings with real players',async()=>{
  const {CS}=await setup(961),Ro=CS.roster;
  let found=0;
  for(let i=0;i<8;i++){
    const b=CS.battle.simulate({home:Ro.preset('aerial'),away:Ro.preset('ground'),seed:`moments-${i}`}),m=CS.battle.decidingMoments(b);
    assert.deepEqual(CS.battle.decidingMoments(b),m);assert.ok(m.length<=3);
    const names=new Set(Object.values(b.personnel).map(p=>p.name));
    for(const line of m){assert.match(line,/^(Deciding duel|Turning point|Interception|Fumble|Big play): .+ beat .+ on .+ \((Q\d|OT)/);
      const [,w,l]=line.match(/: (.+?) beat (.+?) on /);assert.ok(names.has(w)&&names.has(l),line)}
    if(m.length)found++;
  }
  assert.ok(found>=6);
});

test('a card-simulated week stores duel moments in the archive and the game summary shows them',async()=>{
  const {e,u,me,CS}=await setup(962);
  u.callSheet.settings.headset={restStarters:false};
  const simulate=CS.battle.simulate;let game;
  CS.battle.simulate=opts=>{game=simulate(opts);return game};
  try{e.simWeek()}finally{CS.battle.simulate=simulate}
  assert.equal(game.teams[game.headsetSide].name,me.name);
  assert.equal(game.headset.restStarters,false);
  assert.equal(game.telemetry.userSnaps,0);
  const rec=(u.gameArchive||[]).find(r=>r.cardBattle&&(r.home?.id===me.id||r.away?.id===me.id));
  assert.ok(rec,'the user game was a card game');assert.ok(Array.isArray(rec.cardMoments)&&rec.cardMoments.length);
  const html=e.gameSummaryHTML(rec);assert.match(html,/<h3>Card battle<\/h3>/);assert.ok(html.includes(rec.cardMoments[0].replace(/&/g,'&amp;')));
});

test('a coached game records the moments the battle sends, once',async()=>{
  const {e,u,me,CS,host}=await setup(963);
  const cfg=host.launch(),pb=u.callSheet.playbook,deck=CS.packs.decksOf(pb),opp=cfg.oppPlaybook?CS.packs.decksOf(cfg.oppPlaybook):null;
  const team=side=>CS.adapter.battleTeam(cfg[side],side===cfg.userSide?deck:opp,cfg.program?.[side]);
  const b=CS.battle.simulate({home:team('home'),away:team('away'),seed:`${cfg.seed}:t`,weather:cfg.weather,conditions:cfg.conditions});
  host.save({activeBattle:{seed:cfg.seed,battle:'{}'}});
  const moments=CS.battle.decidingMoments(b);
  assert.equal(host.record(JSON.parse(JSON.stringify(b.game)),CS.battle.duelTally(b),moments).ok,true);
  assert.equal(host.record(JSON.parse(JSON.stringify(b.game)),CS.battle.duelTally(b),['ignored']).ok,true);
  const rec=(e.universe.gameArchive||[]).filter(r=>r.cardCoached&&(r.home?.id===me.id||r.away?.id===me.id));
  assert.equal(rec.length,1);assert.deepEqual(rec[0].cardMoments,moments.slice(0,3));
});

test('completing an album earns one Album Pack; evolved cards count for their root',async()=>{
  const {cg,u,CS}=await setup(964),pb=u.callSheet.playbook;
  for(const id of ['statue_left','hook_ladder','flea_flicker','jet_reverse'])CS.packs.grantCard(pb,id);
  assert.deepEqual(cg.checkAlbums(),['trick']);assert.deepEqual(cg.checkAlbums(),[],'once');
  const pack=u.callSheet.rewardPacks.find(p=>p.type==='album');assert.match(pack.title,/Trick Bag Album Pack/);assert.equal(pack.cards.length,4);
  const before=cg.albumProgress().find(a=>a.id==='ground').have;
  pb.mastery.inside_zone=99;CS.evolution.evolve(pb,'inside_zone','duo');
  assert.equal(cg.albumProgress().find(a=>a.id==='ground').have,before,'Duo still counts as Inside Zone');
});

test('an archived final drive reopens with its historical players, hand and clocks without recording a second result',async()=>{
  const {e,u,CS,host}=await setup(963),cfg=host.launch(),B=CS.battle;
  const teams=Object.fromEntries(['home','away'].map(side=>[side,CS.adapter.battleTeam(cfg[side])]));
  let b,record;
  for(let i=0;i<24&&!record;i++){
    b=B.simulate({...teams,seed:'final-drive-'+i,classicSide:cfg.userSide});
    record=B.archivedDrive(b);
  }
  assert.ok(record,'a one-score game yielded a final drive');
  const ordinary=B.simulate({...teams,seed:b.seed});
  assert.deepEqual(b.game,ordinary.game,'capturing history consumes no RNG');
  host.save({activeBattle:{seed:cfg.seed,battle:'{}'}});
  assert.ok(host.record(b.game,B.duelTally(b),[],null,record).ok);
  const row=u.gameArchive.find(r=>r.classicDrive);
  assert.match(e.gameSummaryHTML(row),/Replay the final drive/);
  assert.doesNotMatch(e.gameSummaryHTML({...row,classicDrive:null}),/Replay the final drive/);
  const season=JSON.stringify([u.gameArchive,u.callSheet,u.teams.map(t=>[t.w,t.l])]);
  const original=JSON.parse(record.battle),r=B.replayDrive(row.classicDrive);
  assert.equal(original.classicDrive,undefined,'snapshots do not recursively embed older drives');
  assert.deepEqual(r.teams,original.teams);
  assert.deepEqual(r.hands,original.hands);
  assert.deepEqual(r.rng,original.rng);
  assert.deepEqual(r.game,original.game);
  const first=B.advance(r);
  assert.ok(['snap','fourth'].includes(first.kind));
  assert.equal(first.side,cfg.userSide);
  r.mode='sim';r.pending=null;
  assert.equal(B.advance(r),null);
  assert.ok(r.game.drive!==original.game.drive||r.game.status==='final');
  assert.equal(r.final,undefined,'replay stops before normal postgame processing');
  assert.deepEqual(B.replayDrive(row.classicDrive).hands,original.hands);
  assert.equal(JSON.stringify([u.gameArchive,u.callSheet,u.teams.map(t=>[t.w,t.l])]),season);
});

test('a classic overtime drive starts on the final overtime possession',()=>{
  const B=require('../forks/call-sheet/core/battle'),Ro=require('../forks/call-sheet/core/roster');
  const E=require('../game-engine-v2');
  const b=B.create({home:Ro.preset('ground'),away:Ro.preset('ground','rival'),seed:'replay9',mode:'sim',classicSide:'away'});
  E.startGame(b.game);
  // Expire a tied regulation game on an ordinary run, then let the battle play overtime.
  Object.assign(b.game,{period:4,clock:1,elapsed:4*E.QUARTER_SECONDS-1,fieldPosition:25,down:1,distance:10});
  E.applyScrimmage(b.game,{kind:'rush',yards:1,clock:1});
  B.advance(b);
  assert.ok(b.game.ot&&B.archivedDrive(b));
  const record=B.archivedDrive(b),replay=B.replayDrive(record);
  assert.equal(replay.game.ot.possessions,b.game.ot.possessions-1);
  assert.equal(replay.game.fieldPosition,75);
  assert.equal(replay.game.down,1);
  replay.mode='sim';assert.equal(B.advance(replay),null);
  assert.equal(replay.game.ot.possessions,b.game.ot.possessions);
});

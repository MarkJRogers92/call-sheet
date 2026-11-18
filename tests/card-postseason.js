'use strict';
// Coached postseason card battles: conference championships, bowls and every playoff round the user reaches are
// launched from the card program, recorded through the transactional postseason stage, and rewarded exactly once.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadEngine}=require('../tools/harness');
async function setup(seed,stage){
  globalThis.__DL_TEST__={};
  const e=loadEngine({seed,fullRuntime:true});e.setUserTeam('Chicago Metropolitan');await e.loadSchools();e.initUniverse();e.universe.weeklyDecisions=[];
  globalThis.DynastyCardGameDay.enable();
  if(stage)globalThis.__DL_TEST__.v2PostseasonPrepare(stage);
  return{e,cg:globalThis.DynastyCardGameDay,host:globalThis.__callSheetDynasty,CS:globalThis.CallSheet,me:()=>e.universe.teams.find(t=>t.name==='Chicago Metropolitan')};
}
// Plays the launched battle to its final whistle the way the slice does, then hands the final state to the host.
function coach(env){
  const {e,host,CS}=env,cfg=host.launch(),pb=e.universe.callSheet.playbook;
  const mine=CS.packs.decksOf(pb),theirs=cfg.oppPlaybook?CS.packs.decksOf(cfg.oppPlaybook):null;
  const team=side=>CS.adapter.battleTeam(cfg[side],side===cfg.userSide?mine:theirs,cfg.program?.[side]);
  const b=CS.battle.simulate({home:team('home'),away:team('away'),seed:`${cfg.seed}:test`,weather:cfg.weather,conditions:cfg.conditions,rivalry:cfg.rivalry});
  host.save({activeBattle:{seed:cfg.seed,battle:'{}'}});
  return{cfg,b,out:host.record(JSON.parse(JSON.stringify(b.game)),CS.battle.duelTally(b))};
}
const userGames=(u,meId)=>(u.gameArchive||[]).filter(r=>r.season===u.year&&r.label!=='Regular season'&&(r.home?.id===meId||r.away?.id===meId));
const closeBattle=env=>env.host.save({activeBattle:null});

test('a coached conference championship records through the stage exactly once and advances the postseason',async()=>{
  const env=await setup(901,'conference'),{e,cg}=env,me=env.me();
  assert.equal(cg.blocker(),null);
  const cfg=env.host.launch();
  assert.match(cfg.seed,/^card:post:/);assert.equal(cfg.stage,'conference');assert.equal(cfg.neutral,true);assert.match(cfg.label,/ Championship$/);
  const packs=e.universe.callSheet.playbook.packsOpened,games=e.universe.callSheet.games;
  const {b,out}=coach(env);
  assert.equal(out.ok,true,out.error);
  const u=e.universe,rows=userGames(u,me.id);
  assert.equal(u.phase,'bowlReady');assert.equal(rows.length,1);
  const row=rows[0];assert.equal(row.cardCoached,true);assert.equal(row.engine,'v2');
  const side=row.home.id===me.id?'home':'away',bSide=cfg.userSide;
  assert.equal(row.score[side],b.game.score[bSide]);assert.ok(row.playerStats[side].length);
  assert.equal(u.callSheet.recordedBattleSeed,cfg.seed);assert.equal(u.callSheet.pendingPostseason,undefined);
  // The slice opens the pack itself after a successful record; the stage must not also pay a simulated reward.
  assert.equal(u.callSheet.playbook.packsOpened,packs);assert.equal(u.callSheet.games,games);
  assert.ok(Object.keys(u.callSheet.players).length>5,'card careers recorded');
  // A repeated record (resume after the final whistle, retry) is a no-op.
  assert.equal(env.host.record(JSON.parse(JSON.stringify(b.game)),{}).ok,true);
  assert.equal(userGames(e.universe,me.id).length,1);
  // Until the battle closes it stays the current game, and the next stage waits for it.
  assert.equal(globalThis.__callSheetPostseason.game().played,true);
  e.simBowls();assert.equal(e.universe.phase,'bowlReady');
  closeBattle(env);e.simBowls();assert.equal(e.universe.phase,'playoffReady');
});

test('a failed coached bowl rolls back the whole stage, keeps the result pending and records on retry',async()=>{
  const env=await setup(902,'bowl'),{e}=env,me=env.me();
  env.host.launch(); // launch-time program sync (deck capacity, signatures) happens before the battle, as in play
  const archive=(e.universe.gameArchive||[]).length,cards=JSON.stringify(e.universe.callSheet.playbook);
  globalThis.__DL_TEST__.v2PostseasonInjectFault('afterArchive');
  const {cfg,b,out}=coach(env);
  assert.equal(cfg.stage,'bowl');assert.match(cfg.label,/ Bowl$/);
  assert.equal(out.ok,false);assert.match(out.error,/Injected/);
  let u=e.universe;
  assert.equal(u.phase,'bowlReady');assert.equal((u.gameArchive||[]).length,archive);
  assert.notEqual(u.callSheet.recordedBattleSeed,cfg.seed);assert.equal(u.callSheet.pendingPostseason.seed,cfg.seed);
  assert.equal(JSON.stringify(u.callSheet.playbook),cards);
  const retry=env.host.record(JSON.parse(JSON.stringify(b.game)),{});
  assert.equal(retry.ok,true,retry.error);u=e.universe;
  assert.equal(u.phase,'playoffReady');assert.equal(userGames(u,me.id).length,1);assert.equal(userGames(u,me.id)[0].cardCoached,true);
});

test('every playoff round the user reaches is coached, recorded per round, and the bracket completes',async()=>{
  const env=await setup(903,'playoff'),{e}=env,me=env.me();
  const labels=[];
  for(let guard=0;guard<4&&e.universe.phase==='playoffReady';guard++){
    assert.equal(env.cg.blocker(),null);
    const {cfg,out}=coach(env);assert.equal(out.ok,true,out.error);labels.push(cfg.label);
    const u=e.universe,last=userGames(u,me.id).at(-1);
    assert.equal(last.label,cfg.label);assert.equal(last.cardCoached,true);
    const won=last.winner?last.winner===me.name:(last.home.id===me.id?last.score.home>last.score.away:last.score.away>last.score.home);
    if(u.phase==='playoffReady'){assert.ok(won,'only a winner is paused before the next round');assert.equal(u.playoffProgress.round,labels.length)}
    closeBattle(env);
  }
  const u=e.universe;
  assert.equal(u.phase,'complete');assert.ok(u.champion);assert.equal(u.playoffProgress,undefined);
  assert.deepEqual(labels,['Round of 16','Quarterfinal','Semifinal','National Championship'].slice(0,labels.length));
  const playoff=(u.gameArchive||[]).filter(r=>r.season===u.year&&['Round of 16','Quarterfinal','Semifinal','National Championship'].includes(r.label));
  assert.equal(playoff.length,15);
  assert.equal(userGames(u,me.id).filter(r=>r.cardCoached).length,labels.length);
});

test('the classic playoff still plays the whole bracket in one call, and stale progress is ignored',async()=>{
  const env=await setup(904,'playoff'),{e}=env;
  e.universe.playoffProgress={year:e.universe.year-1,round:2,alive:[1,2,3,4]};
  assert.equal(globalThis.DynastyGameEngineV2LabBridge.playoffUpcoming().round,0);
  e.simPlayoff();
  const u=e.universe;assert.equal(u.phase,'complete');assert.equal(u.playoffProgress,undefined);
  assert.equal((u.gameArchive||[]).filter(r=>r.season===u.year&&['Round of 16','Quarterfinal','Semifinal','National Championship'].includes(r.label)).length,15);
});

test('postseason packs are bigger only for wins and leave regular packs unchanged',async()=>{
  const {CS}=await setup(905);
  const pb=()=>CS.packs.newPlaybook();
  const plain=CS.packs.openPack(pb(),{won:true,seed:'same'}),again=CS.packs.openPack(pb(),{won:true,seed:'same',stage:null});
  assert.deepEqual(again,plain);assert.equal(plain.type,'victory');
  const title=CS.packs.openPack(pb(),{won:true,seed:'same',stage:'title'});
  assert.equal(title.type,'title');assert.equal(title.cards.length,5);assert.equal(title.title,'National Title Pack');
  assert.equal(CS.packs.openPack(pb(),{won:false,seed:'same',stage:'bowl'}).type,'film');
});

test('the card program offers the postseason game only when the user has one',async()=>{
  const env=await setup(906,'bowl'),{cg}=env;
  assert.equal(cg.blocker(),null);
  assert.match(globalThis.__callSheetPostseason.game().label,/ Bowl$/);
  const u=env.e.universe;u.phase='confReady';for(const t of u.teams)if(t.conference===env.me().conference){t.cw=9;t.w=12}env.me().cw=0;env.me().w=0;
  assert.equal(globalThis.__callSheetPostseason.game(),null);assert.match(cg.blocker(),/no postseason game/);
});

test('bowl and playoff games get an extra week of film; the conference championship does not',async()=>{
  const base=await setup(907),regular=base.host.launch().scouting.confidence;
  const conf=await setup(907,'conference');const c=conf.host.launch();assert.equal(c.stage,'conference');
  const confNote=conf.cg.filmNote();assert.equal(confNote.prep,false);assert.doesNotMatch(confNote.text,/postseason film/);
  const bowl=await setup(907,'bowl');const bcfg=bowl.host.launch();assert.equal(bcfg.stage,'bowl');
  assert.equal(bcfg.scouting.confidence,Math.min(94,c.scouting.confidence+6),'bowl prep adds 6 within the 94 cap');
  const note=bowl.cg.filmNote();assert.equal(note.prep,true);assert.match(note.text,/Includes \+6 for the extra week of postseason film\./);
  assert.ok(Number.isFinite(regular));
});

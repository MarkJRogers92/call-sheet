'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadEngine}=require('../tools/harness');
async function setup(){
 globalThis.__DL_TEST__={};const e=loadEngine({seed:944,fullRuntime:true});e.setUserTeam('Chicago Metropolitan');await e.loadSchools();e.initUniverse();
 const cg=globalThis.DynastyCardGameDay;cg.enable();const u=e.universe,me=e.T('Chicago Metropolitan'),g=e.findUserGame(),opp=e.T(g.home===me.name?g.away:g.home);return{e,cg,u,me,opp};
}
test('dynasty bridge reports actual current practice reps without changing saves',async()=>{
 const {cg,u,me,opp}=await setup();me.weeklyPrep={year:u.year,week:u.week,opponent:opp.name,focuses:['run_blocking','coverage']};
 const before=JSON.stringify(u),html=cg.connectionsHTML();
 assert.match(html,/Inside Zone[^<]*\+5/);assert.match(html,/Quarters[^<]*\+5/);assert.match(html,/data-card-dynasty-tab="gamelab"/);assert.equal(JSON.stringify(u),before);
 me.weeklyPrep.week--;assert.doesNotMatch(cg.connectionsHTML(),/Inside Zone[^<]*\+5/);
});
test('bridge honors integration toggles and does not promise practice in postseason',async()=>{
 const {cg,u,me,opp}=await setup();me.weeklyPrep={year:u.year,week:u.week,opponent:opp.name,focuses:['run_blocking']};
 cg.setIntegration('practice-reps',false);assert.match(cg.connectionsHTML(),/Practice mastery is off/);assert.doesNotMatch(cg.connectionsHTML(),/Inside Zone[^<]*\+5/);
 cg.setIntegration('practice-reps',true);u.phase='complete';assert.doesNotMatch(cg.connectionsHTML(),/Inside Zone[^<]*\+5/);assert.match(cg.connectionsHTML(),/Next regular-season opponent/);
});
test('bridge links existing dynasty screens and marks launch snapshot when battle is active',async()=>{
 const {cg,u}=await setup();let html=cg.connectionsHTML();for(const tab of ['depth','staff','development','recruiting'])assert.ok(html.includes(`data-card-dynasty-tab="${tab}"`));
 u.callSheet.activeBattle={seed:'test'};html=cg.connectionsHTML();assert.match(html,/already locked in/);assert.doesNotMatch(html,/data-card-dynasty-tab="gamelab"/);
});
test('bridge safely escapes names and renders absent legacy staff',async()=>{
 const {cg,me}=await setup();me.staff.OC.name='<OC>';assert.match(cg.connectionsHTML(),/&lt;OC&gt;/);assert.doesNotMatch(cg.connectionsHTML(),/<OC>/);
 delete me.staff.OC;assert.doesNotThrow(()=>cg.connectionsHTML());
});
test('a suspended weekly battle leaves Drive Challenges available in the Deck Room',async t=>{
 const {cg,u}=await setup();
 const previous=globalThis.CallSheetBundle;
 t.after(()=>{if(previous===undefined)delete globalThis.CallSheetBundle;else globalThis.CallSheetBundle=previous});
 globalThis.CallSheetBundle='<!doctype html>';
 u.callSheet.activeBattle={seed:cg.launch().seed,battle:'{}'};
 const before=JSON.stringify(u.callSheet),html=cg.cardProgramHTML();
 assert.match(html,/<button[^>]*data-drive-challenges[^>]*aria-haspopup="dialog"[^>]*>Drive Challenges<\/button>/);
 assert.match(html,/data-card-deck disabled/);
 assert.match(html,/>Resume Battle<\/button>/);
 assert.equal(JSON.stringify(u.callSheet),before);
});
test('Deck Room and Collection route to one saved playbook without moving cards or granting rewards',async()=>{
 const {cg,u}=await setup(),pb=u.callSheet.playbook,cs=globalThis.CallSheet;
 require('../forks/call-sheet/core/playbook-ui');
 pb.off.openingScript='screen';pb.reserve.off.wrinkles.push('screen','screen');pb.finishes={screen:'foil'};
 const doc=globalThis.document;doc.getElementById=id=>doc.querySelector('#'+id);
 const snapshot=JSON.stringify(u.callSheet);
 cg.openDynastyConnection('deckroom');
 const deck=doc.getElementById('deckroom').innerHTML;assert.match(deck,/In your deck/);assert.match(deck,/4\/4 base calls/);assert.match(deck,/12\/(14|16|18) plays/);assert.match(deck,/Opening script:<\/b> RB Screen/);assert.match(deck,/data-card-deck/);assert.match(deck,/data-card-dynasty-tab="depth"/);
 cg.openDynastyConnection('collection');
 const binder=doc.getElementById('collection').innerHTML;
 assert.match(binder,/Offense · \d+ owned/);assert.match(binder,/4 owned · 2 in deck/);assert.equal((binder.match(/data-face="screen"/g)||[]).length,1);assert.match(binder,/f-foil" data-face="screen"/);
 assert.match(binder,/data-face="inside_zone"/);assert.match(binder,/data-card-deck/);
 assert.equal((binder.match(/class="cpn-pile"/g)||[]).length,2);
 cg.openDynastyConnection('deckroom');assert.equal(JSON.stringify(u.callSheet),snapshot,'navigation is read-only');
 assert.ok(cs.packs.cardDef('screen'));
});

test('Dynasty reconciles an installed combo after save and passes it to the scheduled card battle',async()=>{
 const {e,cg,u}=await setup(),packs=globalThis.CallSheet.packs;
 const off={id:'establish',play:'pa_boot'},def={id:'heat_check',play:'zone_pressure'};
 packs.setComboPlan(u.callSheet.playbook,'off',off);packs.setComboPlan(u.callSheet.playbook,'def',def);
 u.callSheet=JSON.parse(JSON.stringify(u.callSheet));e.normalizeCallSheet(u);
 const cfg=cg.launch();assert.deepEqual(cfg.playbook.off.comboPlan,off);assert.deepEqual(cfg.playbook.def.comboPlan,def);
 const decks=packs.decksOf(cfg.playbook);
 assert.deepEqual(decks.off.comboPlan,off);assert.deepEqual(decks.def.comboPlan,def);
 u.callSheet.playbook.def.comboPlan={id:'establish',play:'inside_zone'};
 e.normalizeCallSheet(u);assert.equal(u.callSheet.playbook.def.comboPlan,undefined);
});

test('rivalry catch survives a save, identifies the new starter and prepares this meeting only',async()=>{
 const {cg,u,me,opp,e}=await setup(),line=globalThis.CallSheet.adapter.lineupFromTeam(opp).lineup.off;
 me.protectedRivalIds=[opp.id];const id=String(line.TE.id),name=line.TE.name;
 const play={id,name,role:'TE',kind:'fourth',snaps:[{play:'Deep Cross',period:3,clock:142,down:4,distance:4,yards:8}]};
 const entry={year:u.year-1,week:10,rivalryPlay:play};u.callSheet.oppFilm={[opp.id]:[entry]};e.normalizeCallSheet(u);
 const h=cg.rivalryHistory();assert.equal(h.still,true);assert.deepEqual(h.snaps,play.snaps);assert.equal(h.target.id,id);
 assert.equal(cg.setRivalryPrep(true),true);const cfg=cg.launch();assert.equal(cfg.program[cfg.userSide].rivalryBracketId,id);
 const wrong=JSON.parse(JSON.stringify(u.callSheet));e.normalizeCallSheet({callSheet:wrong});assert.deepEqual(wrong.rivalryPrep,u.callSheet.rivalryPrep);
 u.callSheet.rivalryPrep.match='earlier week';assert.equal(cg.launch().program[cfg.userSide].rivalryBracketId,undefined);
 u.callSheet.oppFilm[opp.id][0].rivalryPlay={...play,id:'departed-TE',name:'Alex Graduate'};
 (u.playerArchive??=[]).push({id:'departed-TE',exitReason:'Graduated'});
 const other=cfg.userSide==='home'?'away':'home',starter=globalThis.CallSheet.adapter.battleTeam(opp,null,cfg.program[other]).lineup.off.TE;
 const now=cg.rivalryHistory();assert.equal(now.still,false);assert.ok(now.text.includes('Alex Graduate graduated'));assert.ok(now.text.includes(starter.name+' now starts at TE'));assert.equal(now.target.id,String(starter.id));
 u.callSheet.oppFilm[opp.id][0]={year:u.year-1,week:10,star:{id,name,w:6,l:3}};assert.equal(cg.rivalryHistory().snaps,undefined);assert.equal(cg.setRivalryPrep(true),false);
});

test('a recorded rivalry win supplies the next matchup with one durable hand-scouting note',async()=>{
 const {cg,u,me,opp,e}=await setup(),CS=globalThis.CallSheet,host=globalThis.__callSheetDynasty,g=e.findUserGame();
 me.protectedRivalIds=[opp.id];
 const cfg=host.launch();assert.equal(cfg.rivalryPlan,undefined);
 const team=side=>{
   const t=CS.adapter.battleTeam(cfg[side],null,cfg.program[side]);
   for(const lineup of Object.values(t.lineup))for(const player of Object.values(lineup))
     for(const trait of Object.keys(player.traits))player.traits[trait]=side===cfg.userSide?88:63;
   return t;
 };
 const b=CS.battle.simulate({home:team('home'),away:team('away'),seed:'rivalry-opening-win',rivalry:true});
 const film=CS.battle.callFilm(b,cfg.userSide),sample={...film.rivalryWin,teamId:String(me.id)};
 assert.ok(film.rivalryWin?.count>=2);
 host.save({activeBattle:{seed:cfg.seed,battle:'{}'}});
 assert.equal(host.record(b.game,{},[],film).ok,true);
 assert.equal(host.record(b.game,{},[],film).ok,true);
 assert.equal(u.callSheet.oppFilm[opp.id].length,1);
 assert.deepEqual(u.callSheet.oppFilm[opp.id][0].rivalryWin,sample);
 u.callSheet=JSON.parse(JSON.stringify(u.callSheet));e.normalizeCallSheet(u);
 u.callSheet.activeBattle=null;g.played=false;u.year++;
 u.gameArchive=[]; // Browser saves defer loading the historical box scores.
 assert.deepEqual(cg.launch().rivalryPlan,{side:cfg.userSide,play:sample.play});
 u.events.push({type:'GAME_COMPLETED',season:u.year-1,week:g.week+1,schoolIds:[me.id,opp.id]});
 assert.equal(cg.launch().rivalryPlan,undefined,'a later meeting supersedes the remembered win');
 u.events.pop();me.protectedRivalIds=[];
 assert.equal(cg.launch().rivalryPlan,undefined,'ordinary opponents get no rematch bias');
});

test('coached and saved opponent film counts their actual third-down calls exactly once',async()=>{
  const {e,u,opp}=await setup(),CS=globalThis.CallSheet,host=globalThis.__callSheetDynasty,cfg=host.launch();
  const team=side=>CS.adapter.battleTeam(cfg[side],null,cfg.program?.[side]);
  const b=CS.battle.simulate({home:team('home'),away:team('away'),seed:'opponent-drill-film'}),other=cfg.userSide==='home'?'away':'home';
  const seen={};
  for(const snap of b.log.filter(e=>e.type==='snap'&&e.offSide===other&&!e.penalty&&e.category!=='kick'&&e.sit.down===3))seen[snap.play]=(seen[snap.play]||0)+1;
  assert.ok(Object.keys(seen).length>=2);
  const film=CS.battle.callFilm(b,cfg.userSide);assert.deepEqual(film.off.thirdDown,seen);
  host.save({activeBattle:{seed:cfg.seed,battle:'{}'}});
  for(let i=0;i<2;i++)assert.equal(host.record(b.game,{},[],film).ok,true);
  const entries=u.callSheet.oppFilm[String(opp.id)];assert.equal(entries.length,1);
  assert.deepEqual(entries[0].off.thirdDown,seen);
  entries.unshift({year:u.year-1,off:{run:9,pass:10,total:19}});
  const saved=JSON.parse(JSON.stringify(u.callSheet));
  saved.oppFilm[opp.id][1].off.thirdDown.constructor=5;
  e.normalizeCallSheet({callSheet:saved});
  assert.deepEqual(saved.oppFilm[opp.id][1].off.thirdDown,seen);
  assert.equal(saved.oppFilm[opp.id][0].off.thirdDown,undefined);
});

test('protection film charts actual duels, offers real prep and compares the next card game',async()=>{
  const {e,cg,u,me}=await setup(),CS=globalThis.CallSheet,host=globalThis.__callSheetDynasty,cfg=host.launch();
  const team=side=>CS.adapter.battleTeam(cfg[side],null,cfg.program[side]);
  const b=CS.battle.simulate({home:team('home'),away:team('away'),seed:'protection-review-1'});
  const film=CS.battle.callFilm(b,cfg.userSide),sample=film.own.protection;
  const protectionSnaps=b.log.filter(x=>x.type==='snap'&&x.offSide===cfg.userSide&&!x.penalty&&CS.data.PLAYS[x.play]?.duels.G.protect&&x.duelResults?.[0]);
  assert.equal(sample.attempts,protectionSnaps.length);
  assert.equal(sample.sacks,protectionSnaps.filter(x=>x.kind==='sack').length);
  assert.equal(sample.lost,protectionSnaps.filter(x=>!x.duelResults[0].won).length);
  host.save({activeBattle:{seed:cfg.seed,battle:'{}'}});
  const first=host.record(b.game,{},[],film);
  assert.equal(first.ok,true);
  assert.match(first.protectionReview,/Film flagged pass protection/);
  const firstRecord=u.gameArchive.find(game=>game.id===first.result.gameId);
  assert.deepEqual(firstRecord.cardProtection,sample);
  assert.match(cg.cardProgramHTML(),/Advance the week/);
  for(let attempt=0;attempt<2;attempt++)assert.equal(host.record(b.game,{},[],film).ok,true);
  assert.equal(u.gameArchive.filter(game=>game.cardProtection).length,1);

  const saved=JSON.parse(JSON.stringify(u.callSheet));
  e.normalizeCallSheet({callSheet:saved});
  assert.deepEqual(saved.protectionFilm,u.callSheet.protectionFilm);
  u.callSheet=saved;
  u.callSheet.activeBattle=null;
  u.week=1;
  u.weeklyDecisions=[];
  assert.match(cg.cardProgramHTML(),/1 weekly prep point for \+1 on Protection duels/);
  globalThis.__DL_TEST__.weeklyCoachingSet(['run_blocking','coverage']);
  assert.match(cg.cardProgramHTML(),/Review weekly prep/);
  assert.equal(cg.applyProtectionPrep(),false);
  assert.deepEqual(me.weeklyPrep.focuses,['run_blocking','coverage']);
  globalThis.__DL_TEST__.weeklyCoachingSet(['coverage']);
  u.callSheet.activeBattle={seed:cg.launch().seed,battle:'{}'};
  assert.equal(cg.applyProtectionPrep(),false);
  u.callSheet.activeBattle=null;
  assert.equal(cg.applyProtectionPrep(),true);
  assert.equal(cg.applyProtectionPrep(),false);
  assert.deepEqual(me.weeklyPrep.focuses,['coverage','pass_protection']);
  const next=cg.launch();
  assert.deepEqual(next.program[next.userSide].prep,me.weeklyPrep.focuses);
  assert.deepEqual(next.practiceReps,{two_high:5,cover1:5,deep_cross:5,pa_boot:5});

  const beforePacks=u.callSheet.playbook.packsOpened;
  const game=e.recordV2GameLabResult();
  assert.equal(game.ok,true);
  assert.equal(game.record.cardProtection.planned,true);
  assert.ok(game.record.cardProtection.prepared>0);
  assert.deepEqual(game.record.cardProtection.before,sample);
  assert.match(e.gameSummaryHTML(game.record),/Week 1 had .* This game had /);
  assert.match(cg.cardProgramHTML(),/Pass Protection prep applied on/);
  assert.equal(u.callSheet.playbook.packsOpened,beforePacks+1);
});

test('run defense film tracks designed runs and spends the existing Run Fits prep point',async()=>{
  const {e,cg,u,me}=await setup(),CS=globalThis.CallSheet,host=globalThis.__callSheetDynasty,cfg=host.launch();
  const team=side=>CS.adapter.battleTeam(cfg[side],null,cfg.program[side]);
  const b=CS.battle.simulate({home:team('home'),away:team('away'),seed:'run-defense-review-1'});
  const film=CS.battle.callFilm(b,cfg.userSide),sample=film.own.runDefense;
  const runs=b.log.filter(x=>x.type==='snap'&&x.defSide===cfg.userSide&&!x.penalty&&x.kind==='run'&&CS.data.PLAYS[x.play]?.family==='run');
  assert.equal(sample.attempts,runs.length);
  assert.equal(sample.yards,runs.reduce((total,run)=>total+run.yards,0));
  assert.equal(sample.explosives,runs.filter(run=>run.yards>=10).length);
  assert.ok(sample.attempts>=8&&(sample.yards/sample.attempts>=4.5||sample.explosives>=2));
  assert.equal(sample.prepared,0);

  host.save({activeBattle:{seed:cfg.seed,battle:'{}'}});
  const first=host.record(b.game,{},[],film);
  assert.equal(first.ok,true);
  assert.match(first.runDefenseReview,/Film flagged run defense.*designed runs for/);
  assert.deepEqual(u.gameArchive.find(game=>game.id===first.result.gameId).cardRunDefense,sample);
  assert.equal(host.record(b.game,{},[],film).ok,true);
  assert.equal(u.gameArchive.filter(game=>game.cardRunDefense).length,1);

  const saved=JSON.parse(JSON.stringify(u.callSheet));
  e.normalizeCallSheet({callSheet:saved});
  assert.deepEqual(saved.runDefenseFilm,u.callSheet.runDefenseFilm);
  const v32=JSON.parse(JSON.stringify(saved));delete v32.runDefenseFilm;
  e.normalizeCallSheet({callSheet:v32});
  assert.deepEqual(v32.protectionFilm,saved.protectionFilm);
  assert.equal(v32.runDefenseFilm,undefined);
  u.callSheet=saved;
  u.callSheet.activeBattle=null;
  u.week=1;
  u.weeklyDecisions=[];
  assert.match(cg.cardProgramHTML(),/1 weekly prep point for \+1 on the defensive Gate against designed runs/);
  globalThis.__DL_TEST__.weeklyCoachingSet(['run_blocking','coverage']);
  assert.equal(cg.applyFilmPrep('runDefense'),false);
  assert.deepEqual(me.weeklyPrep.focuses,['run_blocking','coverage']);
  globalThis.__DL_TEST__.weeklyCoachingSet(['coverage']);
  assert.equal(cg.applyFilmPrep('runDefense'),true);
  assert.equal(cg.applyFilmPrep('runDefense'),false);
  assert.deepEqual(me.weeklyPrep.focuses,['coverage','run_fits']);
  const next=cg.launch();
  assert.deepEqual(next.practiceReps,{two_high:5,cover1:5,run_fit:5,cover3:5});

  const game=e.recordV2GameLabResult();
  assert.equal(game.ok,true);
  assert.equal(game.record.cardRunDefense.planned,true);
  assert.ok(game.record.cardRunDefense.prepared>0);
  assert.deepEqual(game.record.cardRunDefense.before,sample);
  assert.match(e.gameSummaryHTML(game.record),/Run Fits prep applied on .* Week 1 had .* This game had /);
});

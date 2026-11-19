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

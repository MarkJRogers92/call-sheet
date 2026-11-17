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
    const names=new Set(Object.values(b.teams).flatMap(t=>[...Object.values(t.lineup.off),...Object.values(t.lineup.def),...(t.backfield||[])]).map(p=>p.name));
    for(const line of m){assert.match(line,/^(Deciding duel|Turning point|Interception|Fumble|Big play): .+ beat .+ on .+ \((Q\d|OT)/);
      const [,w,l]=line.match(/: (.+?) beat (.+?) on /);assert.ok(names.has(w)&&names.has(l),line)}
    if(m.length)found++;
  }
  assert.ok(found>=6);
});

test('a card-simulated week stores duel moments in the archive and the game summary shows them',async()=>{
  const {e,u,me}=await setup(962);
  e.simWeek();
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

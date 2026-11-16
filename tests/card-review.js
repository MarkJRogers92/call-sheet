'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadEngine}=require('../tools/harness');

async function dynasty(seed){
  const e=loadEngine({seed,fullRuntime:true});e.setUserTeam('Chicago Metropolitan');await e.loadSchools();e.initUniverse();e.universe.weeklyDecisions=[];
  const cg=globalThis.DynastyCardGameDay;cg.enable();return{e,cg,u:e.universe,me:e.T('Chicago Metropolitan')};
}

test('damaged deck IDs and signature metadata cannot poison the next battle',async()=>{
  const {e}=await dynasty(713),CS=globalThis.CallSheet;
  const pb=CS.packs.newPlaybook();pb.off.wrinkles.push('missing_card','cover1','constructor');pb.def.tactics.push('motion');
  const sg=CS.signatures.specFor({id:'review-player',name:'Test Player',role:'RB',archetype:'Third-Down Weapon'});
  pb.signatures=[sg,{...sg,id:'sig_broken',playerId:'broken',side:'invalid'}];
  const u={callSheet:{version:1,playbook:pb}};e.normalizeCallSheet(u);
  assert.ok(!pb.off.wrinkles.some(id=>['missing_card','cover1','constructor'].includes(id)));
  assert.ok(!pb.def.tactics.includes('motion'));assert.equal(pb.signatures.length,1);
  CS.signatures.registerAll(pb);assert.doesNotThrow(()=>CS.packs.decksOf(pb));
  pb.off.base[0]='missing_card';e.normalizeCallSheet(u);assert.equal(u.callSheet.playbook,null);
});

test('weekly preparation must belong to the current week',async()=>{
  const {cg,u,me}=await dynasty(714),cfg=cg.launch(),opp=cfg.userSide==='home'?cfg.away:cfg.home;
  me.weeklyPrep={year:u.year,week:u.week-1,opponent:opp.name,focuses:['run_blocking']};
  assert.deepEqual(cg.launch().practiceReps,{});
  me.weeklyPrep.week=u.week;assert.equal(cg.launch().practiceReps.inside_zone,5);
});

test('new dynasties do not inherit another dynasty integration switches',async()=>{
  const {e,cg}=await dynasty(715);cg.setIntegration('scouting-fog',false);
  e.initUniverse();cg.enable();assert.equal(cg.integrations().find(x=>x.id==='scouting-fog').on,true);
});

test('simulated card games earn a record and pack; AI progression resumes next season',async()=>{
  const {e,cg,u}=await dynasty(716);const cfg=cg.launch(),opp=cfg.userSide==='home'?cfg.away:cfg.home;
  const ai=globalThis.CallSheet.packs.newPlaybook();ai.record={w:12,l:0};ai.recordYear=u.year-1;ai.packsOpened=12;u.callSheet.ai[opp.id]=ai;
  e.simWeek();
  assert.equal(u.callSheet.playbook.record.w+u.callSheet.playbook.record.l,1);
  assert.equal(u.callSheet.playbook.packsOpened,1);
  assert.equal(ai.packsOpened,13,'last season’s twelve wins must not suppress this season’s packs');
  assert.equal(ai.recordYear,u.year);
});

test('dynasty pack offers exclude legendaries already held by opponents',async()=>{
  const {cg,u}=await dynasty(717),CS=globalThis.CallSheet;
  const ai=CS.packs.newPlaybook();ai.legendaries=CS.packs.POOL.filter(c=>c.rarity==='legendary').map(c=>c.id);u.callSheet.ai.opponent=ai;
  const cfg=cg.launch();assert.deepEqual(new Set(cfg.worldTaken),new Set(ai.legendaries));
});

test('a blocked week does not fire progression hooks or create AI playbooks',async()=>{
  const {e,cg,u}=await dynasty(718);let ticks=0;
  cg.register({id:'review-tick',hooks:{weekTick(){ticks++}}});
  u.phase='preseason';e.simWeek();assert.equal(ticks,0);assert.deepEqual(u.callSheet.ai,{});
});

test('switching program edges off removes scheme and staff bonuses from both teams',async()=>{
  const {cg}=await dynasty(719);cg.setIntegration('program-edges',false);
  const cfg=cg.launch();cfg.home.staff.OC.playCall=99;cfg.home.offScheme='Ground Pressure';
  for(const side of ['home','away']){
    const team=globalThis.CallSheet.adapter.battleTeam(cfg[side],undefined,cfg.program?.[side]);
    assert.deepEqual(team.edges,{off:[],def:[]});assert.deepEqual(team.coach.commandBonus,{off:0,def:0});
  }
});


test('a current card checkpoint blocks week advancement but stale checkpoints do not',async()=>{
  const {e,cg,u}=await dynasty(720),cfg=cg.launch(),week=u.week;
  u.callSheet.activeBattle={seed:cfg.seed,battle:'pending'};
  e.simWeek();assert.equal(u.week,week);
  u.callSheet.activeBattle.seed='old-season';
  e.simWeek();assert.ok(u.week!==week);
});

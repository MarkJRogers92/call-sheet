'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {loadEngine}=require('../tools/harness');
async function setup(){globalThis.__DL_TEST__={};const e=loadEngine({seed:945,fullRuntime:true});e.setUserTeam('Chicago Metropolitan');await e.loadSchools();e.initUniverse();e.universe.weeklyDecisions=[];const cg=globalThis.DynastyCardGameDay;cg.enable();return{e,cg,u:e.universe,me:e.T('Chicago Metropolitan'),CS:globalThis.CallSheet}}
function teamOf(CS,cfg,side){return CS.adapter.battleTeam(cfg[side],null,cfg.program[side])}
function ids(t){return [...Object.values(t.lineup.off),...Object.values(t.lineup.def),...t.backfield,...Object.values(t.specialists).filter(Boolean)].map(p=>p.id)}
test('Dynasty card launch honors redshirt, academic hold, rest and injury for both teams',async()=>{
 const {cg,u,CS}=await setup();let cfg=cg.launch();
 for(const side of ['home','away']){
  const t=cfg[side],initial=teamOf(CS,cfg,side),roles=['QB','RB','X','LT'],players=roles.map(r=>t.roster.find(p=>String(p.id)===initial.lineup.off[r].id));
  players[0].redshirtActive=true;players[1].academicHold=2;players[2].weeklyAvailability={season:u.year,week:u.week,role:'sit'};players[3].injuryWeeks=2;
  cfg=cg.launch();const next=teamOf(CS,cfg,side);
  for(const p of players)assert.ok(!ids(next).includes(String(p.id)),`${p.name} must not play`);
  assert.equal(Object.keys(next.lineup.off).length,11,'available depth fills each spot');
 }
});
test('specialists and rotation respect eligibility even with program bonuses off; stale rest expires',async()=>{
 const {cg,u,me,CS}=await setup();cg.setIntegration('program-edges',false);let cfg=cg.launch(),side=cfg.userSide,t=teamOf(CS,cfg,side);
 const k=me.roster.find(p=>String(p.id)===t.specialists.K.id),p=me.roster.find(p=>String(p.id)===t.specialists.P.id),rb=me.roster.find(p=>String(p.id)===t.backfield.at(-1).id);
 k.redshirtActive=true;p.academicHold=1;rb.weeklyAvailability={season:u.year,week:u.week,role:'sit'};
 cfg=cg.launch();t=teamOf(CS,cfg,side);for(const x of [k,p,rb])assert.ok(!ids(t).includes(String(x.id)));
 rb.weeklyAvailability.week--;cfg=cg.launch();assert.ok(ids(teamOf(CS,cfg,side)).includes(String(rb.id)),'stale rest does not bench the player');
});
test('simulated card game never credits an ineligible starter; existing battle snapshots stay unchanged',async()=>{
 const {e,cg,u,me,CS}=await setup();const first=cg.launch(),side=first.userSide,t=teamOf(CS,first,side),qb=me.roster.find(p=>String(p.id)===t.lineup.off.QB.id);
 const b=CS.battle.create({home:teamOf(CS,first,'home'),away:teamOf(CS,first,'away'),seed:'availability-resume'}),saved=CS.battle.save(b);
 qb.redshirtActive=true;
 const wr=me.roster.find(p=>String(p.id)===t.lineup.off.X.id);wr.weeklyAvailability={season:u.year,week:u.week,role:'sit'};
 const rb=me.roster.find(p=>String(p.id)===t.lineup.off.RB.id);rb.academicHold=2;
 assert.equal(CS.battle.load(saved).teams[side].lineup.off.QB.id,String(qb.id),'resume uses saved personnel, not a new selection');
 e.simWeek();for(const p of [qb,wr,rb])assert.ok(!u.callSheet.players?.[String(p.id)]?.games,`${p.name} earns no card game credit while unavailable`);
});
test('standalone adapter retains its injury-only default and explicit exclusions are read-only',async()=>{
 const {me,CS}=await setup(),a=CS.adapter,line=a.lineupFromTeam(me),qb=me.roster.find(p=>String(p.id)===line.lineup.off.QB.id);qb.redshirtActive=true;
 assert.equal(a.lineupFromTeam(me).lineup.off.QB.id,String(qb.id));
 const before=JSON.stringify(me),filtered=a.lineupFromTeam(me,{unavailableIds:[String(qb.id)]});assert.notEqual(filtered.lineup.off.QB.id,String(qb.id));assert.equal(JSON.stringify(me),before);
});
test('empty specialist depth stays empty rather than recalling an ineligible kicker',async()=>{
 const {cg,me,CS}=await setup();for(const p of me.roster)if(['K','P'].includes(p.pos))p.academicHold=1;
 const cfg=cg.launch(),t=teamOf(CS,cfg,cfg.userSide);assert.equal(t.specialists.K,null);assert.equal(t.specialists.P,null);
 const b=CS.battle.simulate({home:teamOf(CS,cfg,'home'),away:teamOf(CS,cfg,'away'),seed:'missing-specialists'});assert.equal(b.game.status,'final');assert.ok(!b.final.engineError,b.final.engineError);
});
test('postseason card simulation honors eligibility and still records exactly one game reward',async()=>{
 const {u,me,CS}=await setup(),opp=u.teams.find(t=>t.id!==me.id),qbId=CS.adapter.lineupFromTeam(me).lineup.off.QB.id,qb=me.roster.find(p=>String(p.id)===qbId);qb.academicHold=2;u.phase='bowlReady';
 const out=globalThis.__DL_TEST__.v2PostseasonRecordMatch(me,opp,{week:13,label:'Eligibility Bowl',neutral:true});assert.equal(out.ok,true);assert.ok(!u.callSheet.players?.[qbId]?.games);assert.equal(u.callSheet.games,1);assert.equal(u.callSheet.playbook.packsOpened,1);
});
test('unavailable nemesis players neither receive game edges nor trigger victory moments',async()=>{
 const {cg,u,me,CS}=await setup(),first=cg.launch(),side=first.userSide==='home'?'away':'home',opp=first[side],id=teamOf(CS,first,side).lineup.off.QB.id,p=opp.roster.find(x=>String(x.id)===id);
 p.recruitingMemory={recruitId:'rival-qb',season:u.year-1,schoolId:opp.id,pursuit:[{schoolId:me.id,action:'offer',finalist:true}]};p.redshirtActive=true;
 const cfg=cg.launch();assert.ok(!cfg.program[side].conds?.[p.id]);cg.programAwards({won:true,us:20,them:10,opp});assert.ok(!(u.callSheet.moments||[]).some(m=>/Should've signed/.test(m.text)));
});

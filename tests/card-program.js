'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadEngine}=require('../tools/harness');
async function setup(seed=830){
  globalThis.__DL_TEST__={};
  const e=loadEngine({seed,fullRuntime:true});e.setUserTeam('Chicago Metropolitan');await e.loadSchools();e.initUniverse();e.universe.weeklyDecisions=[];
  const cg=globalThis.DynastyCardGameDay;cg.enable();return {e,cg,u:e.universe,me:e.T('Chicago Metropolitan'),CS:globalThis.CallSheet};
}
test('facility capacity uses earned thresholds, persists and honors the integration switch',async()=>{
  const {cg,u,me}=await setup(),pb=u.callSheet.playbook;
  me.facilities=74;cg.syncProgramCapacity(me,pb);assert.equal(pb.capacity.wrinkles,14);
  me.facilities=75;cg.syncProgramCapacity(me,pb);assert.equal(pb.capacity.wrinkles,16);
  me.facilities=90;cg.syncProgramCapacity(me,pb);assert.equal(pb.capacity.tactics,18);
  me.facilities=30;cg.syncProgramCapacity(me,pb);assert.equal(pb.capacity.tactics,18);
  cg.setIntegration('facility-playbook',false);pb.capacity={wrinkles:14,tactics:14};me.facilities=99;
  cg.syncProgramCapacity(me,pb);assert.equal(pb.capacity.tactics,14);
});
test('Facility 90 opens a fourth signature slot for a simulated breakout',async t=>{
  const {e,cg,u,me,CS}=await setup(),pb=u.callSheet.playbook;
  me.facilities=90;
  const starters=CS.adapter.lineupFromTeam(me).lineup.off;
  pb.signatures=['QB','RB','X'].map(role=>CS.signatures.specFor(starters[role]));
  assert.match(cg.cardProgramHTML(),/Player signatures:<\/b> 3\/4/);
  assert.equal(pb.signatureSlots,undefined,'the read-only Deck Room leaves the playbook alone');
  t.mock.method(CS.signatures,'candidate',(b,side)=>({p:b.teams[side].lineup.off.TE,wins:18,duels:20,fire:0}));
  const out=e.recordV2GameLabResult();
  assert.equal(out.ok,true);
  assert.equal(pb.signatures.length,4);
  assert.equal(pb.signatures[3].playerId,starters.TE.id);
  assert.equal(pb.reserveSignatures?.length??0,0);
  e.normalizeCallSheet(u);
  assert.equal(u.callSheet.playbook.signatures.length,4);
});
test('recruit playbook fit reaches the existing pitch and ignores hidden ratings',async()=>{
  const {cg,e,u,me}=await setup(831);
  const r=u.recruits.find(r=>cg.recruitingFit(me,r).bonus>0);assert.ok(r);
  const fit=cg.recruitingFit(me,r),before=e.recruitPitchBreakdown(me,r);
  assert.equal(before.find(x=>x[0]==='Active playbook fit')[1],fit.bonus);
  r.trueNow=1;r.upside=1;assert.deepEqual(cg.recruitingFit(me,r),fit);
  cg.setIntegration('playbook-recruiting',false);
  assert.equal(e.recruitPitchBreakdown(me,r).some(x=>x[0]==='Active playbook fit'),false);
});
test('coaching mastery rewards used plays only and caps the bonus at thirty percent',async()=>{
  const {CS}=await setup(832),pb=CS.packs.newPlaybook();
  const log=Array.from({length:10},()=>({type:'snap',offSide:'home',defSide:'away',play:'inside_zone',call:'cover3'}));
  const gained=CS.evolution.recordReps(pb,log,'home',{inside_zone:99,slant:.3});
  assert.equal(gained.inside_zone,13);assert.equal(pb.mastery.slant,undefined);
});
test('signatures survive portal limbo and follow the player into a full collection',async()=>{
  const {cg,u,me,CS}=await setup(833),pb=u.callSheet.playbook;
  const p=me.roster.find(x=>x.pos==='QB'),sg=CS.signatures.specFor(CS.adapter.toBattlePlayer(p,'QB'));
  pb.signatures=[sg];me.roster=me.roster.filter(x=>x!==p);u.transferPortal=[{p,fromSchoolId:me.id}];
  cg.launch();assert.equal(pb.signatures[0].playerId,String(p.id));
  const dest=u.teams.find(t=>t.id!==me.id),other=CS.packs.newPlaybook();u.callSheet.ai[dest.id]=other;
  other.signatures=CS.adapter.lineupFromTeam(dest).lineup.off.QB?[CS.signatures.specFor(CS.adapter.lineupFromTeam(dest).lineup.off.QB),CS.signatures.specFor(CS.adapter.lineupFromTeam(dest).lineup.off.RB)]:[];
  dest.roster.push(p);u.transferPortal=[];cg.launch();cg.launch();
  assert.equal(pb.signatures.length,0);
  assert.equal(other.reserveSignatures.filter(x=>x.playerId===String(p.id)).length,1);
  const saved=JSON.parse(JSON.stringify(u.callSheet));globalThis.__ENGINE__.normalizeCallSheet({callSheet:saved});
  assert.equal(saved.ai[dest.id].reserveSignatures.length,1);
});
test('postseason card simulation records player stats and one reward pack',async()=>{
  const {u,me}=await setup(834),opp=u.teams.find(t=>t.id!==me.id);u.phase='bowlReady';
  const out=globalThis.__DL_TEST__.v2PostseasonRecordMatch(me,opp,{week:13,label:'Test Bowl',neutral:true});
  assert.equal(out.ok,true);assert.equal(out.record.cardBattle,true);
  assert.equal(u.callSheet.games,1);assert.equal(u.callSheet.playbook.packsOpened,1);
  assert.ok(Object.keys(u.callSheet.players).length>10);assert.ok(out.record.playerStats.home.length);
});
test('failed postseason recording restores card progression and program changes',async()=>{
  const {e,u,me}=await setup(835),opp=u.teams.find(t=>t.id!==me.id);u.phase='bowlReady';me.facilities=99;
  const before=JSON.stringify(u.callSheet),archive=(u.gameArchive||[]).length;
  assert.throws(()=>globalThis.__DL_TEST__.v2PostseasonRecordMatch(me,opp,{week:13,label:'Fault Bowl',testFault:'afterArchive'}),/Injected/);
  assert.equal(JSON.stringify(e.universe.callSheet),before);assert.equal((e.universe.gameArchive||[]).length,archive);
});
test('recruiting shows assignments from the active deck with public scouting ranges',async()=>{
  const {u,cg,CS}=await setup(836),pb=u.callSheet.playbook;
  const te=u.recruits.find(r=>r.pos==='TE'),cb=u.recruits.find(r=>r.pos==='CB');
  const panel=html=>html.match(/<div class="cs-pcard-note" data-prospect-jobs>[\s\S]*?<\/div>/)?.[0];
  const jobs=()=>panel(cg.recruitCard(te.id));
  pb.off.base=['outside_zone','stick'];pb.off.wrinkles=['outside_zone'];
  const before=jobs();assert.match(before,/Outside Zone.*Edge block/s);assert.match(before,/Stick.*Release/s);
  assert.equal(before.match(/<li>/g).length,2);
  assert.equal(panel(globalThis.DynastyRecruitCard.dossierHTML(te.id)),before);
  for(const k of CS.data.TRAITS)te[k]=99;
  te.trueNow=99;te.upside=99;assert.equal(jobs(),before);
  te.scoutingDomains.blocking.estimate=40;const lower=jobs();
  te.scoutingDomains.blocking.estimate=80;assert.notEqual(jobs(),lower);
  pb.off.base=['stick'];pb.off.wrinkles=[];assert.doesNotMatch(jobs(),/Outside Zone/);
  pb.def.base=['cover1'];pb.def.wrinkles=[];const defense=panel(cg.recruitCard(cb.id));
  assert.match(defense,/Cover 1/);assert.match(defense,/against Quick Slant/);
  pb.off.base=['inside_zone'];assert.equal(jobs(),undefined);
  cg.setIntegration('playbook-recruiting',false);assert.equal(panel(cg.recruitCard(cb.id)),undefined);
});

'use strict';
// Recruiting and development in cards: nemesis recruits, portal arrivals with a card, Players of the Week breakouts,
// mentors passing a signature down, development stamps and camp auditions. Public data only.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadEngine}=require('../tools/harness');
async function setup(seed){
  globalThis.__DL_TEST__={};
  const e=loadEngine({seed,fullRuntime:true});e.setUserTeam('Chicago Metropolitan');await e.loadSchools();e.initUniverse();e.universe.weeklyDecisions=[];
  const cg=globalThis.DynastyCardGameDay;cg.enable();
  return{e,cg,u:e.universe,me:e.T('Chicago Metropolitan'),CS:globalThis.CallSheet};
}
const stored=pb=>[...pb.reserve.off.wrinkles,...pb.reserve.off.tactics,...pb.reserve.def.wrinkles,...pb.reserve.def.tactics];
const cards=pb=>[...(pb.signatures||[]),...(pb.reserveSignatures||[])];

test('a recruit who chose a rival plays up on money downs against you, labeled, and beating him is a moment',async()=>{
  const {e,cg,u,me,CS}=await setup(931);
  const g=e.findUserGame(),opp=e.T(g.home===me.name?g.away:g.home),oppSide=g.home===me.name?'away':'home';
  const star=CS.adapter.lineupFromTeam(opp).lineup.off.QB,p=opp.roster.find(x=>String(x.id)===String(star.id));
  p.recruitment={...(p.recruitment||{}),schoolId:opp.id,offerSchoolIds:[me.id,opp.id],topFiveSchoolIds:[opp.id,me.id]};
  assert.equal(cg.isNemesis(p,opp,me),true);
  const cfg=cg.launch(),conds=cfg.program[oppSide].conds;
  assert.match(conds[p.id][0].src,/Nemesis/);assert.equal(conds[p.id][0].when,'money');
  const team=CS.adapter.battleTeam(cfg[oppSide],null,cfg.program[oppSide]);
  assert.ok(team.lineup.off.QB.cond.some(c=>/Nemesis/.test(c.src)&&c.v===1));
  assert.match(cg.playerCard(p.id),/NEMESIS/);
  cg.programAwards({won:true,us:20,them:10,opp});cg.programAwards({won:true,us:20,them:10,opp});
  assert.equal(u.callSheet.moments.filter(m=>/Should've signed/.test(m.text)).length,1);
});

test('a transfer brings one card from his old program’s playbook',async()=>{
  const {cg,u,me,CS}=await setup(932),pb=u.callSheet.playbook;
  const from=u.teams.find(t=>t.id!==me.id),theirs=CS.packs.newPlaybook();theirs.off.wrinkles=['four_verts','four_verts'];theirs.off.tactics=['audible'];u.callSheet.ai[from.id]=theirs;
  const p=me.roster.find(x=>x.pos==='WR');p.transferHistory=[{season:u.year,fromSchoolId:from.id,toSchoolId:me.id,fromSchool:from.name}];
  const before=stored(pb).length;cg.rewards.portal();cg.rewards.portal();
  const added=stored(pb).slice(before);assert.equal(added.length,1);assert.ok(['four_verts','audible'].includes(added[0]));
  assert.ok(u.callSheet.moments.some(m=>m.text.includes(p.name)&&m.text.includes(from.name)));
});

test('a Player of the Week on your roster breaks out with a signature once',async()=>{
  const {cg,u,me}=await setup(933),pb=u.callSheet.playbook;
  const qb=me.roster.find(x=>x.pos==='QB');u.weeklyHonors={year:u.year,rows:[{week:3,off:{playerId:qb.id,teamId:me.id,name:qb.name,pos:'QB'},def:null}]};
  cg.rewards.potw(3);cg.rewards.potw(3);
  const got=cards(pb).filter(x=>String(x.playerId)===String(qb.id));assert.equal(got.length,1);assert.equal(got[0].id,`sig_${qb.id}`);
});

test('a graduating signature player passes a Legacy card to the next starter at his position',async()=>{
  const {cg,u,me}=await setup(934),pb=u.callSheet.playbook;
  pb.ringOfHonor=[{id:'sig_grad-1',playerId:'grad-1',name:'Grad Senior',last:'Senior',pos:'WR',role:'X',number:9,year:u.year}];
  cg.rewards.mentor();cg.rewards.mentor();
  const leg=cards(pb).filter(x=>x.legacy);assert.equal(leg.length,1);assert.equal(leg[0].legacy.name,'Grad Senior');
  assert.equal(me.roster.find(p=>String(p.id)===String(leg[0].playerId)).pos,'WR');
});

test('player cards stamp card-OVR changes since the season ended',async()=>{
  const {cg,me}=await setup(935);
  const p=me.roster.find(x=>x.pos==='RB');cg.rewards.snapshot();
  for(const k of ['speed','power','technique','iq','composure'])p[k]=Math.min(99,(Number(p[k])||60)+12);
  assert.match(cg.playerCard(p.id),/Development stamp: card OVR \d+ → \d+/);
});

test('camp auditions are deterministic card duels between the top two candidates',async()=>{
  const {cg,me}=await setup(936);
  const wrs=me.roster.filter(x=>x.pos==='WR').slice(0,2),battle={roleId:'X',phase:'Fall',candidates:wrs.map(p=>({id:p.id,name:p.name,score:70})),recommended:wrs[0].id,gap:2};
  const a=cg.campAudition(battle,me),b=cg.campAudition(battle,me);
  assert.deepEqual(a,b);assert.ok(wrs.some(p=>p.id===a.winnerId));assert.match(a.score,/^\d–\d$/);
});

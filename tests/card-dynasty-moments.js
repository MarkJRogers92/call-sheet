'use strict';
// The dynasty's big moments in cards: bowl traditions theme the pack, signature cards grow with honors, a held rivalry
// trophy plays in its game, coaching-tree cards leave with their coach, milestones fill the Program History album,
// walk-ons are recognized, and the spring game gives reps once a year.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadEngine}=require('../tools/harness');
async function setup(seed){
  globalThis.__DL_TEST__={};
  const e=loadEngine({seed,fullRuntime:true});e.setUserTeam('Chicago Metropolitan');await e.loadSchools();e.initUniverse();e.universe.weeklyDecisions=[];
  const cg=globalThis.DynastyCardGameDay;cg.enable();
  return{e,cg,u:e.universe,me:e.T('Chicago Metropolitan'),CS:globalThis.CallSheet};
}
const owns=(pb,id)=>['off','def'].some(s=>[...pb[s].wrinkles,...pb[s].tactics,...pb.reserve[s].wrinkles,...pb.reserve[s].tactics].includes(id));

test('bowl traditions theme the first card of a bowl pack',async()=>{
  const {cg,CS}=await setup(981);
  const a=cg.bowlTheme('Summit Bowl','bowl'),b=cg.bowlTheme('Summit Bowl','bowl');assert.deepEqual(a,b);assert.equal(cg.bowlTheme('Week 3','regular'),null);
  const themes=new Set(['Summit Bowl','Prairie Bowl','Coastal Bowl','Heritage Bowl','Gateway Bowl','Frontier Bowl'].map(l=>cg.bowlTheme(l,'bowl').why.includes('old-school')));assert.equal(themes.size,2,'both classic and modern bowls exist');
  const pack=CS.packs.openPack(CS.packs.newPlaybook(),{won:true,stage:'bowl',seed:'theme',favor:a.cards,favorWhy:a.why});
  assert.ok(pack.cards.some(c=>a.cards.includes(c.id)&&c.why===a.why),'one card comes from the bowl theme');
});

test('signature cards grow with honors, and an award makes them stronger',async()=>{
  const {cg,u,me,CS}=await setup(982),pb=u.callSheet.playbook;
  const qb=me.roster.find(p=>p.pos==='QB'),spec=CS.signatures.specFor(CS.adapter.toBattlePlayer(qb,'QB'),{season:u.year});pb.signatures=[spec];CS.signatures.register(spec);
  const base=CS.packs.cardDef(spec.id);
  u.weeklyHonors={year:u.year,rows:[1,2,3].map(w=>({week:w,off:{playerId:qb.id,teamId:me.id},def:null}))};
  cg.honorTiers();assert.equal(pb.signatures[0].tier,2);assert.match(CS.packs.cardDef(spec.id).name,/★★$/);
  qb.awards=[{year:u.year,name:'National Player of the Year'}];cg.honorTiers();assert.equal(pb.signatures[0].tier,3);
  const top=CS.packs.cardDef(spec.id),sum=d=>(d.effects||[]).reduce((n,x)=>n+x.v,0)+(d.duels?.K?.bias||0);
  assert.equal(sum(top),sum(base)+1,'an award adds +1');
  cg.syncSignatures();assert.equal(pb.signatures[0].tier,3,'the tier survives roster syncs');
});

test('a held rivalry trophy plays in that game only',async()=>{
  const {cg,u,me}=await setup(983),rival=u.teams.find(t=>t.id!==me.id),other=u.teams.find(t=>t.id!==me.id&&t.id!==rival.id);
  me.rivalry={rivalId:rival.id,trophy:'Old Brass Bell',series:{holderId:me.id}};
  const edge=cg.trophyEdge(me,rival);assert.match(edge.src,/Old Brass Bell/);assert.equal(edge.when,'money');
  assert.equal(cg.trophyEdge(me,other),null);me.rivalry.series.holderId=rival.id;assert.equal(cg.trophyEdge(me,rival),null);
});

test('a coaching-tree card leaves with its coordinator for his new program',async()=>{
  const {cg,u,me,CS}=await setup(984),pb=u.callSheet.playbook;
  me.staff.OC.preferredScheme='Ground Pressure';cg.rewards.scheme();cg.coachDepartures();assert.ok(owns(pb,'counter_trey'));
  CS.packs.moveCard(pb,'off','wrinkles',pb.reserve.off.wrinkles.indexOf('counter_trey'),true);CS.packs.setOpeningScript(pb,'counter_trey');
  const coach=me.staff.OC,dest=u.teams.find(t=>t.id!==me.id&&t.staff?.OC);
  me.staff.OC={...dest.staff.OC,id:'replacement-oc',preferredScheme:'Multiple'};dest.staff.OC=coach;
  cg.coachDepartures();
  assert.equal(pb.off.openingScript,undefined,'the departed card cannot silently reactivate when reacquired');
  assert.equal(owns(pb,'counter_trey'),false,'it left the collection');
  assert.ok(u.callSheet.ai[dest.id].off.wrinkles.includes('counter_trey'),'and joined his new program');
  assert.ok(u.callSheet.moments.some(m=>m.text.includes(dest.name)&&/Counter Trey/.test(m.text)));
});

test('milestones fill Program History; walk-ons are recognized; the spring game runs once a year',async()=>{
  const {cg,u,me,CS}=await setup(985),pb=u.callSheet.playbook;
  me.bowlResult={won:true,year:u.year};me.champ=true;cg.programMilestones();cg.programMilestones();
  const hist=cg.albumProgress().find(a=>a.id==='history');assert.equal(hist.have,2);assert.equal(u.callSheet.moments.filter(m=>/Program history/.test(m.text)).length,2);
  assert.equal(cg.isWalkOn({origin:'Walk-on / late addition'}),true);assert.equal(cg.isWalkOn({recruitment:{stars:2}}),true);assert.equal(cg.isWalkOn({recruitment:{stars:4}}),false);
  u.offseason={...(u.offseason||{}),phase:'spring'};const before=pb.mastery.inside_zone||0;
  cg.springGame();cg.springGame();
  assert.equal(pb.mastery.inside_zone,before+3,'reps once');assert.equal(u.callSheet.moments.filter(m=>/Spring game/.test(m.text)).length,1);
});

test('returning a rival card keeps a scripted duplicate, but clears the last copy and base promotions',async()=>{
  const {cg,u,CS}=await setup(986),pb=u.callSheet.playbook;
  const returnOne=id=>{pb.borrowed=[{id,year:u.year-1,from:'Rival'}];cg.returnBorrowed()};
  CS.packs.setOpeningScript(pb,'screen');returnOne('screen');assert.equal(pb.off.openingScript,'screen');
  returnOne('screen');assert.equal(pb.off.openingScript,undefined);
  const promoted=pb.off.wrinkles[0];CS.packs.setOpeningScript(pb,promoted);returnOne(pb.off.base[0]);
  assert.ok(pb.off.base.includes(promoted));assert.equal(pb.off.openingScript,undefined);
});

test('a base coordinator card leaves once and a replacement of the same scheme restores one loan',async()=>{
  const {cg,u,me,CS}=await setup(988),pb=u.callSheet.playbook,coach=me.staff.OC,dest=u.teams.find(t=>t!==me&&t.staff?.OC);
  const count=()=>[...pb.off.base,...pb.off.wrinkles,...pb.reserve.off.wrinkles].filter(id=>id==='counter_trey').length;
  coach.preferredScheme='Ground Pressure';cg.rewards.scheme();
  CS.packs.setBase(pb,'off',0,'counter_trey');dest.staff.OC=coach;me.staff.OC=null;cg.coachDepartures();
  assert.equal(count(),0);assert.equal(new Set(pb.off.base).size,4);
  assert.ok(pb.off.base.some(id=>{const c=CS.packs.cardDef(id);return c.cost===0&&!c.needs}));
  me.staff.OC={...coach,id:'same-scheme-successor',name:'New Coach'};cg.rewards.scheme();cg.rewards.scheme();assert.equal(count(),1);
  CS.packs.grantCard(pb,'counter_trey',{kind:'independent'});me.staff.OC=null;cg.coachDepartures();assert.equal(count(),1);
  assert.equal(u.callSheet.ai[dest.id].off.wrinkles.filter(id=>id==='counter_trey').length,1);
  me.staff.OC=coach;dest.staff.OC=null;cg.rewards.scheme();cg.rewards.scheme();
  assert.equal(count(),2,'one independent copy plus the returning loan');
  assert.ok(!u.callSheet.ai[dest.id].off.wrinkles.includes('counter_trey'));

});

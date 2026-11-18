'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const D=require('../forks/call-sheet/core/data'),R=require('../forks/call-sheet/core/resolver'),B=require('../forks/call-sheet/core/battle'),Ro=require('../forks/call-sheet/core/roster'),P=require('../forks/call-sheet/core/packs'),EV=require('../forks/call-sheet/core/evolution');
const copy=x=>JSON.parse(JSON.stringify(x));
function context(play='inside_zone'){
 const off=Ro.preset('ground').lineup.off,def=Ro.preset('aerial').lineup.def;
 for(const p of [...Object.values(off),...Object.values(def)]){p.archetype='';p.cond=[];for(const t of D.TRAITS)p.traits[t]=70}
 return{off,def,play:D.PLAYS[play],call:D.CALLS.cover3,situation:{down:1,distance:10,field:25}};
}
function waiting(){const b=B.create({home:Ro.preset('ground'),away:Ro.preset('aerial'),seed:'coaching',user:'home',control:'offense',mode:'snap'});B.advance(b);return b}
function owned(pb){return ['off','def'].flatMap(s=>[...pb[s].base,...pb[s].wrinkles,...pb[s].tactics,...(pb.reserve?.[s]?.wrinkles||[]),...(pb.reserve?.[s]?.tactics||[])]).sort()}

test('every relevant rating point changes odds; unrelated traits do not',()=>{
 const c=context(),before=R.buildSnap(c).duels[1];c.off.RB.traits.iq++;
 const improved=R.buildSnap(c).duels[1];assert.ok(improved.p>before.p);assert.ok(improved.p-before.p<.02);
 c.off.RB.traits.speed=99;assert.equal(R.buildSnap(c).duels[1].p,improved.p);
 c.off.RB.traits.iq=99;c.off.RB.traits.technique=99;c.def.MIKE.traits.iq=40;c.def.MIKE.traits.power=40;
 const dominant=R.buildSnap({...c,defTactics:[]}).duels[1];assert.ok(Math.abs(dominant.p-.7745)<1e-10,'published V17 chance for this matchup');
 for(const p of Object.values(c.off))for(const trait of D.TRAITS)p.traits[trait]=80;
 const grades=R.buildSnap(c).duels.map(d=>d.offGrade);assert.deepEqual(grades,[7.3,7.55,7.55]);
});
test('quarterback delivery affects deep catches even when receivers fight the duel',()=>{
 const c=context('vertical_shot'),before=R.buildSnap(c);c.off.QB.traits.power=99;c.off.QB.traits.technique=99;
 const after=R.buildSnap(c);assert.ok(after.duels[2].p>before.duels[2].p);assert.equal(after.duels[0].p,before.duels[0].p);assert.ok(after.duels[2].offRoles.includes('QB'));
});
test('durability controls gradual workload fatigue while resting preserves freshness',()=>{
 const c=context('quick_slant'),id=c.off.SLOT.id;c.workload={[id]:65};c.off.SLOT.traits.durability=30;
 const worn=R.buildSnap(c).duels[0];c.off.SLOT.traits.durability=99;const durable=R.buildSnap(c).duels[0];assert.ok(durable.p>worn.p);
 c.workload[id]=0;assert.equal(R.buildSnap(c).duels[0].p,durable.p);assert.ok(worn.mods.some(m=>m.src.includes('Game fatigue')));
});
test('every archetype has an ability, and every duel ability can activate in a legal role',()=>{
 for(const [pos,styles] of Object.entries(D.STYLES))for(const style of styles){
  const sig=D.SIGNATURES[style];assert.ok(sig,style);if(!sig.duel)continue;
  let hit=false;
  for(const tactics of [[],['motion','max_protect','route_adjust']]){
   const c=context();for(const [side,roles] of [['off',D.OFF_ROLES],['def',D.DEF_ROLES]])for(const [role,p] of Object.entries(c[side]))if(roles[role]===pos)p.archetype=style;
   for(const play of Object.values(D.PLAYS))for(const call of Object.values(D.CALLS)){
    if(R.buildSnap({...c,play,call,situation:{down:3,field:90},offTactics:tactics,defTactics:['stunt']}).duels.some(d=>d.mods.some(m=>m.src.includes(`(${style})`))))hit=true;
   }
  }
  assert.ok(hit,style+' must affect a matchup');
 }
});
test('evolved plays keep archetype, tactic and pressure interactions',()=>{
 const c=context('jailbreak');c.off.LG.archetype='Pulling Guard';c.call=D.CALLS.zone_pressure;c.heat=true;
 const snap=R.buildSnap(c);assert.ok(snap.duels[0].mods.some(m=>m.src==='They rushed into it'));assert.ok(snap.duels[1].mods.some(m=>m.src==='Blitz-happy defense'));assert.ok(snap.duels[1].mods.some(m=>m.src.includes('Pulling Guard')));
 assert.equal(R.tacticBlocked(D.TACTICS.seal_block,D.PLAYS.counter,c.off),null);
});
test('preview and actual resolution include the same known fire and evolved combo',()=>{
 const b=waiting();b.drive={key:`${b.game.drive}:home`,fams:['run','run'],firsts:0};b.fire[b.teams.home.lineup.off.RB.id]=true;
 for(const id of ['pa_boot','pa_throwback','pa_shot']){
  assert.equal(B.comboFor(b,D.PLAYS[id]).id,'establish');
  const pv=B.preview(b,'home',{play:id,tactics:[]});assert.ok(pv.snap.duels[1].mods.some(m=>m.src.includes('COMBO')));assert.ok(pv.snap.duels[1].mods.some(m=>m.src.includes('ON FIRE')));
 }
 b.drive.key='old-drive';assert.equal(B.comboFor(b,D.PLAYS.pa_boot),null);
});
test('battle serialization preserves remaining outcomes, workload and RNG',()=>{
 const b=waiting();B.submit(b,{type:'call',play:'inside_zone',tactics:[]});const resumed=B.load(B.save(b));
 for(const x of [b,resumed]){x.mode='sim';x.pending=null;B.advance(x)}
 assert.deepEqual(resumed,b);assert.ok(Object.keys(b.workload).length>0);
});
test('deck editing conserves owned cards, allows chosen base plays and prevents dead decks',()=>{
 const pb=P.newPlaybook(),before=owned(pb);P.moveCard(pb,'off','wrinkles',0,false);P.moveCard(pb,'off','wrinkles',0,true);P.setBase(pb,'off',0,'pa_boot');assert.deepEqual(owned(pb),before);
 P.setBase(pb,'off',1,'screen');P.setBase(pb,'off',2,'power');const unchanged=copy(pb);assert.throws(()=>P.setBase(pb,'off',3,'vertical_shot'),/free/);assert.deepEqual(pb,unchanged);
 assert.throws(()=>P.setBase(pb,'off',1,'pa_boot'),/different/);assert.throws(()=>P.setBase(pb,'off',1,'hook_ladder'),/Trick/);
});
test('storing cards retains legendaries, and upgrades/evolutions reach the collection',()=>{
 const pb=P.newPlaybook();P.applyPick(pb,P.POOL.find(c=>c.id==='statue_left'));P.cut(pb,'off','wrinkles',pb.off.wrinkles.length-1);assert.ok(pb.legendaries.includes('statue_left'));assert.ok(pb.reserve.off.wrinkles.includes('statue_left'));
 while(pb.off.wrinkles.includes('pa_boot'))P.cut(pb,'off','wrinkles',pb.off.wrinkles.indexOf('pa_boot'));
 P.applyPick(pb,P.POOL.find(c=>c.id==='pa_boot_plus'));assert.ok(pb.reserve.off.wrinkles.includes('pa_boot_plus'));
 EV.evolve(pb,'pa_boot','pa_throwback');assert.ok(!pb.reserve.off.wrinkles.includes('pa_boot_plus'));assert.ok(pb.reserve.off.wrinkles.includes('pa_throwback'));
});
test('achievements grant permanent rewards once and only after a completed game',()=>{
 const pb=P.newPlaybook(),b=waiting();assert.deepEqual(P.awardAchievements(pb,b,'home'),[]);
 b.mode='sim';b.pending=null;B.advance(b);const earned=P.awardAchievements(pb,b,'home');assert.ok(earned.some(a=>a.id==='first_game'));assert.ok(pb.reserve.off.wrinkles.includes('rpo_bubble'));
 const saved=copy(pb);assert.deepEqual(P.awardAchievements(pb,b,'home'),[]);assert.deepEqual(pb,saved);
});
test('unavailable tactics cannot partially spend Command or consume the selected play',()=>{
 const b=waiting();b.hands.home.tactics=[];b.hands.home.command=10;const before=B.save(b);
 assert.throws(()=>B.submit(b,{type:'call',play:'inside_zone',tactics:['seal_block']}));assert.equal(B.save(b),before);
});

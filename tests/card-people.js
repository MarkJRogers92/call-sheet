'use strict';
// Recruiting and development in cards: nemesis recruits, portal arrivals with a card, Players of the Week breakouts,
// mentors passing a signature down, development stamps and camp auditions. Public data only.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {loadEngine}=require('../tools/harness');
async function setup(seed,options={}){
  globalThis.__DL_TEST__={};
  const e=loadEngine({seed,fullRuntime:true,...options});e.setUserTeam('Chicago Metropolitan');await e.loadSchools();e.initUniverse();e.universe.weeklyDecisions=[];
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

test('real enrollment connects a signed prospect to the signing pack, game-day card and alumni record',async()=>{
  const {e,cg,u,me,CS}=await setup(937),r=u.recruits.find(r=>!r.committed&&r.pos==='QB'&&r.stars<=2);
  assert.ok(r);assert.equal(e.commitRecruit(r,me.name),true);
  u.phase='complete';u.offseason=e.makeOffseasonState(u.year,'signing',['review','departures']);
  e.runOffseason();
  const p=me.roster.find(p=>p.portraitSeed===r.portraitSeed&&p.name===r.name);
  assert.ok(p,'real signing enrolled the prospect');
  const packs=(u.callSheet.rewardPacks||[]).filter(x=>x.type==='signing');
  assert.equal(packs.length,1,'the real class earned its Signing Day Pack');
  assert.match(packs[0].subtitle,/1 signee \(1 QB\)/);
  cg.rewards.signing();assert.equal(u.callSheet.rewardPacks.filter(x=>x.type==='signing').length,1);
  assert.equal(p.recruitingMemory.recruitId,r.id);assert.equal(cg.isWalkOn(p),true);

  // Put the freshman atop the actual depth chart and play a recorded card game.
  me.roleDepth.QB1=[p.id,...(me.roleDepth.QB1||[]).filter(id=>id!==p.id)];
  u.phase='regular';u.weeklyDecisions=[];const cfg=cg.launch();
  assert.equal(CS.adapter.battleTeam(cfg[cfg.userSide],null,cfg.program[cfg.userSide]).lineup.off.QB.id,String(p.id));
  e.simWeek();assert.equal(u.callSheet.players[p.id]?.games,1);
  assert.ok(u.callSheet.players[p.id].w+u.callSheet.players[p.id].l>0);
  assert.match(cg.playerCard(p.id),/Card games/);
  e.addToArchive(p,me,'Graduated');const alumni=u.playerArchive.find(a=>a.id===p.id);
  assert.equal(alumni.recruitingMemory.recruitId,r.id);assert.equal(alumni.name,r.name);
});

test('a real scholarship offer on the published final five becomes a nemesis on enrollment',async()=>{
  const {e,cg,u,me}=await setup(938),r=u.recruits.find(r=>!r.committed),opp=u.teams.find(t=>t.id!==me.id);
  assert.equal(globalThis.DynastyRecruitingActions.perform(r,me,'offer').ok,true);
  const others=u.teams.filter(t=>t.id!==me.id&&t.id!==opp.id).slice(0,3);
  r.funnel={version:2,season:u.year,top5:[opp,me,...others].map(t=>t.name)};
  assert.equal(e.commitRecruit(r,opp.name),true);
  u.phase='complete';u.offseason=e.makeOffseasonState(u.year,'signing',['review','departures']);
  e.offseasonEnrollment();const p=opp.roster.find(p=>p.portraitSeed===r.portraitSeed&&p.name===r.name);
  assert.ok(p);assert.equal(cg.isNemesis(p,opp,me),true);
  assert.equal(cg.isNemesis(p,opp,others[0]),false,'being a finalist alone is not a scholarship offer');
  assert.match(cg.playerCard(p.id),/NEMESIS/);
});

test('a prospect previews an unearned signature from his public style, without minting it',async()=>{
  const {cg,u,CS}=await setup(940),r=u.recruits.find(x=>x.pos==='QB');
  r.name='Lee <Cross>';r.style='Field Architect';
  const before=JSON.stringify(u.callSheet),face=()=>cg.recruitCard(r.id).match(/<aside class="cs-signature-story"[^]*?<\/aside>/)?.[0]||'';
  const shown=face();assert.match(shown,/Possible signature/);assert.match(shown,/&lt;Cross&gt; Audible/);assert.match(shown,/QB read/);
  r.trueNow=25;r.speed=99;r.upside=99;assert.equal(face(),shown);
  assert.equal(JSON.stringify(u.callSheet),before);assert.equal(CS.packs.cardDef('sig_'+r.id),null);
});

test('roster profiles distinguish a projected signature from a real collected or equipped one',async()=>{
  const {cg,u,me,CS}=await setup(941),pb=u.callSheet.playbook,lu=CS.adapter.lineupFromTeam(me).lineup;
  const bp=lu.off.QB,p=me.roster.find(x=>String(x.id)===bp.id);
  p.recruitingMemory={season:2026,schoolId:me.id,stars:4};
  assert.match(cg.playerCard(p.id),/Possible signature/);
  const spec=CS.signatures.specFor(bp,{earned:'Player of the Week 3',season:2028,tier:3});
  pb.reserveSignatures=[spec];let html=cg.playerCard(p.id);
  assert.match(html,/In collection/);assert.match(html,/Player of the Week 3/);assert.match(html,/★★★/);assert.match(html,/Chicago Metropolitan/);
  assert.doesNotMatch(html,/Possible signature/);
  pb.reserveSignatures=[];pb.signatures=[spec];html=cg.playerCard(p.id);assert.match(html,/In deck/);assert.match(html,/on the field/);
  assert.doesNotMatch(cg.playerCard(me.roster.find(x=>x.pos==='K').id),/Possible signature/,'no invented specialist signature');
});

test('a real signature retires with its recorded duel career and signing story even after rolling data is pruned',async()=>{
  const {e,cg,u,me,CS}=await setup(942),pb=u.callSheet.playbook,bp=CS.adapter.lineupFromTeam(me).lineup.off.QB,p=me.roster.find(x=>String(x.id)===bp.id);
  p.recruitingMemory={season:2026,schoolId:me.id,stars:3};
  pb.signatures=[CS.signatures.specFor(bp,{earned:'Rivalry win',season:2028})];
  u.callSheet.players[p.id]={w:17,l:9,big:2,games:3};
  e.addToArchive(p,me,'Graduated');me.roster=me.roster.filter(x=>x!==p);cg.syncSignatures();
  assert.equal(pb.ringOfHonor.length,1);
  delete u.callSheet.players[p.id];const before=JSON.stringify(u.callSheet),html=cg.playerCard(p.id);
  assert.match(html,/id="alumniBattleCard"/);assert.match(html,/Ring of Honor/);assert.match(html,/17–9/);assert.match(html,/Rivalry win/);assert.match(html,/Chicago Metropolitan/);
  assert.doesNotMatch(html,/on the depth chart|every snap|Not on the depth chart|Possible signature/);
  assert.equal(JSON.stringify(u.callSheet),before);
});

test('defensive signatures explain who gets the actual edge, including inherited and honored cards',async()=>{
  const {cg,u,me,CS}=await setup(943),pb=u.callSheet.playbook,lu=CS.adapter.lineupFromTeam(me).lineup;
  const safety=lu.def.FS,rusher=lu.def.RUSH;
  pb.signatures=[CS.signatures.specFor(safety,{tier:3,legacy:{name:'Reed Vale',last:'Vale',playerId:'old-11'}})];
  assert.match(cg.playerCard(safety.id),/\+2 against the offense’s QB read/,'legacy takes one off, top tier adds one back');
  assert.match(cg.playerCard(rusher.id),/\+2 against the offense’s pass protection/);
});

test('a transferred signature can be followed through the rival roster to that program’s Ring of Honor',async()=>{
  const {e,u,cg,me,CS}=await setup(944),pb=u.callSheet.playbook,bp=CS.adapter.lineupFromTeam(me).lineup.off.QB,p=me.roster.find(x=>String(x.id)===bp.id);
  const dest=u.teams.find(t=>t.id!==me.id);pb.reserveSignatures=[CS.signatures.specFor(bp,{earned:'First road win'})];
  me.roster=me.roster.filter(x=>x!==p);dest.roster.push(p);cg.syncSignatures();
  assert.match(cg.playerCard(p.id),/First road win/);
  e.addToArchive(p,dest,'Graduated');dest.roster=dest.roster.filter(x=>x!==p);cg.syncSignatures();
  const html=cg.playerCard(p.id);assert.match(html,/Retired signature/);assert.match(html,/First road win/);assert.ok(html.includes(dest.name));
});

test('loading a pre-journey honor preserves available duel totals before the live ledger trims old players',async()=>{
  const {e,u,me,CS}=await setup(945),pb=u.callSheet.playbook,bp=CS.adapter.lineupFromTeam(me).lineup.off.QB;
  const sg=CS.signatures.specFor(bp);pb.ringOfHonor=[{...sg,year:u.year}];
  const old={w:19,l:5,big:2,games:3};u.callSheet.players={[bp.id]:old};
  for(let i=0;i<805;i++)u.callSheet.players['other-'+i]={...old};
  e.normalizeCallSheet(u);assert.ok(!u.callSheet.players[bp.id]);assert.deepEqual(pb.ringOfHonor[0].cardCareer,old);
  e.normalizeCallSheet(u);assert.deepEqual(pb.ringOfHonor[0].cardCareer,old);
});

test('a cold dynasty archive is not mistaken for a signature player leaving football',async()=>{
  const {IDBFactory}=require('fake-indexeddb');
  const {e,u,cg,me,CS}=await setup(946,{indexedDB:new IDBFactory()}),pb=u.callSheet.playbook,bp=CS.adapter.lineupFromTeam(me).lineup.off.QB,p=me.roster.find(x=>String(x.id)===bp.id);
  pb.signatures=[CS.signatures.specFor(bp,{earned:'Player of the Week'})];u.callSheet.players[p.id]={w:12,l:2,big:1,games:1};
  cg.setIntegration('signature-graduation',false);
  e.addToArchive(p,me,'Graduated');me.roster=me.roster.filter(x=>x!==p);
  await e.saveBrowser();await e.loadBrowser();assert.equal(e.archiveIsDeferred(),true);
  cg.setIntegration('signature-graduation',true);
  assert.deepEqual(cg.syncSignatures(),[],'no departure should be classified before the archive loads');
  const book=e.universe.callSheet.playbook;assert.equal(book.signatures.length,1);
  await e.ensureArchiveLoaded();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(book.signatures.length,0);assert.equal(book.ringOfHonor[0].playerId,p.id);
  assert.match(cg.playerCard(p.id),/12–2/);
});

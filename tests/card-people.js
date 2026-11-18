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

test('a prospect preview states its deck fit; switching decks changes the advice, never the projection or ownership',async()=>{
  const {e,cg,u,CS}=await setup(941);
  const ol=u.recruits.find(r=>!r.committed&&['C','OG','OT','G','T','LT','RT','LG','RG','OL'].includes(r.pos)),db=u.recruits.find(r=>!r.committed&&['CB','S','FS','SS'].includes(r.pos));
  assert.ok(ol&&db,'fixture has a lineman and a defensive back');
  const pb=u.callSheet.playbook||cg.meta().playbook,owned=JSON.stringify([...(pb?.signatures||[]),...(pb?.reserveSignatures||[])]);
  const before=cg.recruitDeckFit(ol.id);assert.ok(before.fit.edge.count>0,'the default deck runs the lineman\'s edge play');
  assert.match(cg.recruitCard(ol.id),/With your current deck:/);
  const live=u.callSheet.playbook;
  const edgeId=Object.keys(CS.data.PLAYS).find(id=>CS.data.PLAYS[id].name===before.fit.edge.label);
  assert.ok(!live.off.base.includes(edgeId),'edge play is a wrinkle, so the four base calls stay legal');
  live.off.wrinkles=live.off.wrinkles.filter(id=>id!==edgeId&&CS.data.PLAYS[id].evolvedFrom!==edgeId);
  const after=cg.recruitDeckFit(ol.id);
  assert.equal(after.fit.edge.count,0);assert.notEqual(after.fit.text,before.fit.text,'advice follows the deck');
  assert.deepEqual([after.ovr,after.archetype],[before.ovr,before.archetype],'talent projection does not move with the deck');
  const d=cg.recruitDeckFit(db.id);assert.equal(d.fit.fit,'opponent');assert.match(d.fit.text,/not your deck/);
  assert.equal(JSON.stringify([...(u.callSheet.playbook.signatures||[]),...(u.callSheet.playbook.reserveSignatures||[])]),owned,'a preview never grants the card');
  assert.match(globalThis.DynastyRecruitCard.dossierHTML(ol.id),/CARD PREVIEW · PROSPECT[\s\S]*fit with your deck[\s\S]*Nothing is granted/);
});

test('the pre-game film note matches the battle\'s confidence and moves with the staff, not recruiting scouting',async()=>{
  const {cg,u,me}=await setup(943);
  const note=cg.filmNote(),cfg=cg.launch();assert.ok(note&&cfg.scouting);
  assert.equal(note.confidence,Math.round(cfg.scouting.confidence),'same number the battle uses');
  assert.match(note.text,note.exact?/exact grades/:/coordinators and head coach.*ranges/);
  for(const k of ['OC','DC'])if(me.staff?.[k])me.staff[k].playCall=40;if(me.staff?.HC)me.staff.HC.development=40;
  const low=cg.filmNote();assert.ok(low.confidence<=note.confidence);assert.equal(low.exact,false);assert.match(low.text,/narrows them|shows them exactly/);
  for(const r of u.recruits.slice(0,20))r.scouted=true; // recruiting scouting does not change film confidence
  assert.equal(cg.filmNote().confidence,low.confidence);
});

test('last game\'s card Player of the Game joins This Week\'s player stories, only for the latest game and while switched on',async()=>{
  const {cg,u,me}=await setup(945);const stories=()=>globalThis.__DL_TEST__.weeklyPlayerStoriesDebug();
  const before=stories(),p=me.roster.find(x=>!before.some(s=>String(s.playerId)===String(x.id)));
  u.callSheet.moments.push({year:u.year,week:u.week,kind:'pog',playerId:p.id,text:`Card Player of the Game: ${p.name} won 7 of 9 duels.`});
  const s=stories().find(x=>x.type==='card_duels');
  assert.ok(s,'card story added');assert.equal(String(s.playerId),String(p.id));assert.match(s.summary,new RegExp(`Card battle, Week ${u.week}: ${p.name} won 7 of 9 duels`));
  assert.ok(stories().length<=Math.max(before.length,5),'stays within the story limit');
  assert.ok(!stories().some(x=>x.type==='injury'&&x.priority<s.priority),'injuries still outrank it');assert.equal(s.priority,93);
  cg.setIntegration('card-player-stories',false);assert.ok(!stories().some(x=>x.type==='card_duels'),'integration switch is honored');cg.setIntegration('card-player-stories',true);
  u.callSheet.moments.push({year:u.year,week:u.week+1,kind:'big',playerId:p.id,text:'later game'});
  assert.ok(!stories().some(x=>x.type==='card_duels'),'a newer game replaces last game\'s story');
});

test('a rivalry week says what is at stake before kickoff, using the same rivalry flag as the battle',async()=>{
  const {cg,me,e}=await setup(947);const g=e.findUserGame(),opp=e.T(g.home===me.name?g.away:g.home);
  me.protectedRivalIds=(me.protectedRivalIds||[]).filter(id=>id!==opp.id);
  assert.equal(cg.packStakes().elevated,false);assert.equal(cg.launch().rivalry,false);
  me.protectedRivalIds.push(opp.id);
  const st=cg.packStakes();assert.equal(cg.launch().rivalry,true);assert.equal(st.elevated,true);assert.equal(st.win.title,'Rivalry Pack');
});

test('the opponent identity line uses the staff report and their call sheet without writing to the save',async()=>{
  const {cg,u}=await setup(949);const before=JSON.stringify(u.callSheet);
  const id=cg.opponentIdentity();assert.ok(id,'identity for this week\'s opponent');
  assert.ok(Number.isFinite(id.passEstimate),'staff pass estimate from the weekly report');assert.match(id.text,/staff expects/);
  assert.ok(id.calls>0&&id.pressure>=0);assert.equal(JSON.stringify(u.callSheet),before,'reading it creates no AI playbook and changes nothing');
});

test('a simulated card game stores film on that opponent, which survives a save round trip and feeds the identity line',async()=>{
  const {e,cg,u,me}=await setup(951);const g=e.findUserGame(),opp=e.T(g.home===me.name?g.away:g.home);
  u.weeklyDecisions=[];e.simWeek();
  const film=u.callSheet.oppFilm?.[String(opp.id)];assert.ok(Array.isArray(film)&&film.length===1,'one meeting recorded');
  assert.ok(film[0].def.total>0&&film[0].off.total>0);assert.equal(film[0].def.pressure+film[0].def.man+film[0].def.zone,film[0].def.total);
  const copy=JSON.parse(JSON.stringify({callSheet:u.callSheet}));copy.callSheet.oppFilm[String(opp.id)].push({year:'x',week:-4,def:{total:'9'},off:null},{junk:1},{},{});copy.callSheet.oppFilm['__proto__x']='bad';
  e.normalizeCallSheet(copy);const kept=copy.callSheet.oppFilm[String(opp.id)];
  assert.equal(kept.length,3,'at most three meetings');assert.ok(kept.every(x=>Number.isInteger(x.def.total)&&x.def.total>=0));assert.equal(copy.callSheet.oppFilm['__proto__x'],undefined);
  // Next time they are the opponent, the line reads from film.
  const id=globalThis.CallSheet.packs.opponentIdentity(globalThis.CallSheet.packs.newPlaybook(),{film,mine:u.callSheet.playbook,name:opp.name});
  assert.equal(id.fromFilm,true);assert.match(id.text,/when you last met/);
});

test('rivalry weeks name last meeting\'s top duel winner against you, and whether that player is still there',async()=>{
  const {e,cg,u,me}=await setup(953);const g=e.findUserGame(),opp=e.T(g.home===me.name?g.away:g.home);
  u.weeklyDecisions=[];e.simWeek();
  const film=u.callSheet.oppFilm[String(opp.id)];const star=film[0].star;
  assert.ok(star&&star.w>=4,'a real opponent duel winner was recorded');assert.ok(opp.roster.some(p=>String(p.id)===star.id));
  // Treat the next opponent as that rival, carrying this film, to exercise the line on the matchup strip.
  const next=e.findUserGame(),nextOpp=e.T(next.home===me.name?next.away:next.home);
  u.callSheet.oppFilm[String(nextOpp.id)]=film;const p=opp.roster.find(x=>String(x.id)===star.id);nextOpp.roster.push(p);
  assert.equal(cg.rivalryHistory(),null,'not a protected rival yet');
  me.protectedRivalIds=[...(me.protectedRivalIds||[]),nextOpp.id];
  let h=cg.rivalryHistory();assert.match(h.text,new RegExp(`Last card meeting \\(${u.year}, Week ${film[0].week}\\): ${star.name} won ${star.w} of ${star.w+star.l} duels against you and is still on their roster\\.`));
  nextOpp.roster=nextOpp.roster.filter(x=>String(x.id)!==star.id);h=cg.rivalryHistory();assert.match(h.text,/has since left/);
});

test('coordinator candidates show how hiring would change the card film read, as a band, for your own openings only',async()=>{
  const {cg,me,u}=await setup(955);
  for(const k of ['OC','DC'])me.staff[k].playCall=76;me.staff.HC.development=76; // Medium film read (76)
  const o={slot:'OC',schoolName:me.name};
  let fx=cg.hireFilmEffect(o,{playCall:99,development:60});assert.match(fx.text,/Medium \(one-point ranges\) → High \(exact grades\)/);assert.equal(fx.change,1);
  fx=cg.hireFilmEffect(o,{playCall:20,development:60});assert.match(fx.text,/Medium .* → Low \(wide ranges\)|stays Medium.*blurrier/);
  fx=cg.hireFilmEffect(o,{playCall:76,development:60});assert.match(fx.text,/stays Medium \(one-point ranges\)\./);
  assert.equal(cg.hireFilmEffect({slot:'RC',schoolName:me.name},{playCall:99}),null,'recruiting coordinators do not change film');
  const other=u.teams.find(t=>t.id!==me.id);assert.equal(cg.hireFilmEffect({slot:'OC',schoolName:other.name},{playCall:99}),null,'only your program');
  assert.equal(me.staff.OC.playCall,76,'the preview does not change your staff');
  cg.setIntegration('scouting-fog',false);assert.equal(cg.hireFilmEffect(o,{playCall:99}),null,'follows the scouting-fog switch');
});

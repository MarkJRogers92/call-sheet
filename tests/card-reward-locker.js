'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const P=require('../forks/call-sheet/core/packs'),EV=require('../forks/call-sheet/core/evolution');
const {loadEngine}=require('../tools/harness');
const defs=ids=>ids.map((id,i)=>({...P.POOL.find(c=>c.id===id),uid:'4-'+i,...(i===0?{why:'Counters their deep game'}:{})}));
const fixture=ids=>({type:'film',title:'Film Study Pack',subtitle:'Pick 1 of 3',cards:defs(ids)});
const envelope=(pb,ids,week=1)=>P.freezeGamePack(pb,fixture(ids),{key:'card:2026:'+week+':12',source:'Week '+week+' vs West',year:2026});
test('banking freezes structured, distinct choices and metadata without spending an opening',()=>{
  const pb=P.newPlaybook();pb.packsOpened=4;
  assert.equal(typeof P.freezeGamePack,'function','the coached game has an offer it can bank');
  const pack=envelope(pb,['two_man','inside_zone_plus','four_verts']);
  assert.deepEqual(pack.cards.map(c=>[c.id,c.kind,c.uid,c.why,c.replaces]),defs(['two_man','inside_zone_plus','four_verts']).map(c=>[c.id,c.kind,c.uid,c.why,c.replaces]));
  assert.equal(pack.serial,4);assert.equal(pb.packsOpened,4);
  pb.gamePacks=[pack];const direct=structuredClone(pb);P.applyPick(direct,{...pack.cards[1]});
  pb.packsOpened=19;const result=P.claimGamePack(pb,pack.key,'inside_zone_plus',[]);
  assert.equal(result.ok,true);assert.deepEqual(direct.off,pb.off);assert.equal(pb.packsOpened,20);
  assert.deepEqual(direct.finishes,pb.finishes,'finish belongs to earned offer, not the redemption order');
  assert.equal(pb.gamePacks.length,0);const after=JSON.stringify(pb);assert.equal(P.claimGamePack(pb,pack.key,'inside_zone_plus',[]).ok,false);assert.equal(JSON.stringify(pb),after);
});
test('invalid choice never spends a pick; a full pile stores the new card without cutting a current call',()=>{
  const pb=P.newPlaybook(),pack=envelope(pb,['two_man','press','pa_boot']);pb.gamePacks=[pack];
  let before=JSON.stringify(pb);assert.equal(P.claimGamePack(pb,pack.key,'fake_punt',[]).ok,false);assert.equal(JSON.stringify(pb),before);
  pb.def.wrinkles=Array(pb.capacity.wrinkles).fill('robber');const active=structuredClone(pb.def);
  const r=P.claimGamePack(pb,pack.key,'two_man',[]);assert.equal(r.stored,true);assert.deepEqual(pb.def,active);assert.deepEqual(pb.reserve.def.wrinkles,['two_man']);assert.equal(P.overCapacity(pb),null);
});
test('a banked pick can be kept outside the deck even when a deck slot is open',()=>{
  const pb=P.newPlaybook(),pack=envelope(pb,['press','two_man','inside_zone_plus']);pb.gamePacks=[pack];
  const active=structuredClone(pb.def),limit=2;pb.reserve.def.tactics=['spy'];
  const r=P.claimGamePack(pb,pack.key,'press',[],limit,'collection');
  assert.equal(r.ok,true);assert.equal(r.stored,true);assert.deepEqual(pb.def,active);assert.deepEqual(pb.reserve.def.tactics,['spy','press']);
  assert.equal(pb.packsOpened,1);assert.equal(P.claimGamePack(pb,pack.key,'press',[],limit,'deck').ok,false);
});
test('explicit pack destinations never fall back or spend a pick when the chosen type is full',()=>{
  for(const destination of ['deck','collection']){
    const pb=P.newPlaybook(),pack=envelope(pb,['two_man','inside_zone_plus']);pb.gamePacks=[pack];
    if(destination==='deck')pb.def.wrinkles=Array(pb.capacity.wrinkles).fill('robber');else pb.reserve.def.wrinkles=['robber'];
    const before=JSON.stringify(pb);assert.equal(P.claimGamePack(pb,pack.key,'two_man',[],1,destination).ok,false);assert.equal(JSON.stringify(pb),before);
    const r=P.claimGamePack(pb,pack.key,'two_man',[],1,destination==='deck'?'collection':'deck');
    assert.equal(r.ok,true);assert.equal(r.stored,destination==='deck');assert.equal(pb.packsOpened,1);
  }
});
test('changed world or evolved prerequisites cannot duplicate a legendary or spend an upgrade on nothing',()=>{
  const pb=P.newPlaybook(),leg=P.POOL.find(c=>c.rarity==='legendary').id,pack=envelope(pb,[leg,'inside_zone_plus','press']);pb.gamePacks=[pack];
  const old=JSON.stringify(pb);assert.equal(P.claimGamePack(pb,pack.key,leg,[leg]).ok,false);assert.equal(JSON.stringify(pb),old);
  EV.evolve(pb,'inside_zone','duo');const choices=P.gamePackChoices(pb,pack,[leg]);assert.equal(choices.length,3);
  assert.equal(new Set(choices.map(c=>c.id)).size,3);assert.ok(choices.slice(0,2).every(c=>c.exchangeFor&&c.rarity!=='legendary'&&c.kind!=='upgrade'));
  assert.deepEqual(choices,P.gamePackChoices(pb,structuredClone(pack),[leg]));
  assert.equal(P.claimGamePack(pb,pack.key,'inside_zone_plus',[leg]).ok,false);
  assert.equal(P.claimGamePack(pb,pack.key,choices[1].id,[leg]).ok,true);assert.deepEqual(pb.legendaries,[]);assert.ok(pb.off.base.includes('duo'));assert.equal(pb.history.at(-1).id,choices[1].id);
});
test('save normalization preserves every banked offer, repairs descriptors from the catalog and discards malformed/duplicate entries',async()=>{
  const e=loadEngine({seed:20261117,fullRuntime:true});const pb=P.newPlaybook();
  const kept=Array.from({length:14},(_,i)=>envelope(pb,['press','inside_zone_plus','deep_cross'],i+1));
  pb.gamePacks=structuredClone(kept);pb.gamePacks.push(null,pb.gamePacks[0],{key:'junk',cards:[]});
  Object.assign(pb.gamePacks[0].cards[0],{side:'off',kind:'upgrade',replaces:'inside_zone'});
  const u={callSheet:{version:1,playbook:pb}};e.normalizeCallSheet(u);
  assert.deepEqual(u.callSheet.playbook.gamePacks,kept);
});
test('tracking an album shows real acquisition routes, follows earned progress, and never changes pack odds or the deck',async()=>{
  const e=loadEngine({seed:92501,fullRuntime:true});e.setUserTeam('Chicago Metropolitan');await e.loadSchools();e.initUniverse();
  const cg=globalThis.DynastyCardGameDay;cg.enable();const pb=e.universe.callSheet.playbook;
  assert.equal(typeof cg.trackAlbum,'function');assert.equal(cg.pursuit(),null);
  const baseline=JSON.stringify(pb);assert.equal(cg.trackAlbum('trick'),true);
  let p=cg.pursuit();assert.equal(p.name,'Trick Bag');assert.ok(p.routes.some(x=>/three straight/i.test(x)));assert.ok(p.routes.some(x=>/postseason/i.test(x)));assert.ok(p.routes.some(x=>/pack/i.test(x)));
  assert.equal(JSON.stringify(pb),baseline);
  assert.equal(cg.trackAlbum('not-an-album'),false);assert.equal(cg.pursuit().id,'trick');
  cg.trackAlbum('ground');assert.ok(cg.pursuit().routes.some(x=>/coordinator.+Ground Pressure/i.test(x)));
  cg.trackAlbum('trick');P.grantCard(pb,'flea_flicker');assert.equal(cg.pursuit().have,p.have+1);
  const copy=JSON.parse(JSON.stringify({callSheet:e.universe.callSheet}));e.normalizeCallSheet(copy);assert.equal(copy.callSheet.trackedAlbum,'trick');
  cg.trackAlbum(null);assert.equal(cg.pursuit(),null);
});

async function finishedDynasty(stage){
  globalThis.__DL_TEST__={};const e=loadEngine({seed:90451,fullRuntime:true});e.setUserTeam('Chicago Metropolitan');await e.loadSchools();e.initUniverse();e.universe.weeklyDecisions=[];
  const cg=globalThis.DynastyCardGameDay,host=globalThis.__callSheetDynasty,CS=globalThis.CallSheet;cg.enable();
  if(stage)globalThis.__DL_TEST__.v2PostseasonPrepare(stage);
  const cfg=host.launch(),team=side=>CS.adapter.battleTeam(cfg[side],side===cfg.userSide?P.decksOf(e.universe.callSheet.playbook):null,cfg.program?.[side]);
  const b=CS.battle.simulate({home:team('home'),away:team('away'),seed:cfg.seed,weather:cfg.weather,conditions:cfg.conditions});b.user=cfg.userSide;
  e.universe.callSheet.playbook.mastery.inside_zone=100;
  host.save({activeBattle:{seed:cfg.seed,battle:CS.battle.save(b)}});
  return{e,cg,CS,host,b};
}
test('a recorded bowl can be banked on resume with a full signature roster, claimed once, and never blocks the next stage',async()=>{
  const {postgameFrame}=require('./helpers/postgame-frame'),{e,cg,host,b,CS}=await finishedDynasty('bowl');
  const getPb=()=>e.universe.callSheet.playbook,lu=b.teams[b.user].lineup.off;
  for(const p of [lu.QB,lu.X,lu.TE])CS.signatures.add(getPb(),CS.signatures.specFor(p));
  let closes=0;const entry={...host,close:()=>closes++};
  const frame=postgameFrame(entry),snap=JSON.stringify(frame.api.b._gamePack);assert.match(frame.get('#modal').innerHTML,/id="bankPack"/);
  const resumed=postgameFrame(entry);assert.equal(JSON.stringify(resumed.api.b._gamePack),snap);assert.equal(e.universe.callSheet.games,1);
  // Deterministically cover a breakout when every slot is occupied.
  resumed.api.b._breakout={p:lu.RB,wins:17,duels:19,fire:2};
  const bank=resumed.get('#bankPack').onclick;bank();bank();
  assert.equal(closes,1);assert.equal(e.universe.callSheet.activeBattle,null);assert.equal(e.universe.callSheet.games,1);
  assert.equal(getPb().reserveSignatures.filter(s=>s.id==='sig_'+lu.RB.id).length,1);assert.equal(getPb().signatures.length,3);
  const [offer]=getPb().gamePacks;assert.equal(JSON.stringify(offer),snap);assert.equal(getPb().packsOpened,0);assert.ok(!getPb().evolved?.inside_zone);
  const phase=e.universe.phase;e.simPlayoff();assert.notEqual(e.universe.phase,phase);
  const normalized=JSON.parse(JSON.stringify({callSheet:e.universe.callSheet}));e.normalizeCallSheet(normalized);
  assert.deepEqual(normalized.callSheet.playbook.gamePacks,[offer]);
  const taken=host.rewardContext().worldTaken,id=P.gamePackChoices(getPb(),offer,taken)[0].id;
  const packsBefore=getPb().packsOpened;assert.equal(cg.takeGamePack(offer.key,id).ok,true);assert.equal(cg.takeGamePack(offer.key,id).ok,false);
  assert.equal(getPb().packsOpened,packsBefore+1);assert.equal(getPb().gamePacks.length,0);
});
test('postgame evolution can be deferred without touching a branch or spending its mastery',async()=>{
  const {postgameFrame}=require('./helpers/postgame-frame'),{e,host,CS}=await finishedDynasty(null),entry={...host,close(){}};
  const f=postgameFrame(entry);const book=f.api.save().playbook,r=CS.evolution.ready(book).find(x=>x.rootId==='inside_zone');
  assert.ok(r);const reps=book.mastery.inside_zone;
  CS.packs.applyPick(book,f.api.b._gamePack.cards[0]);f.api.b._packPicked=true;host.save({playbook:book,activeBattle:{seed:f.api.b.seed,battle:CS.battle.save(f.api.b)}});
  // Ensure one unlocked path in the saved battle lineup; real Deck Room rechecks the current roster.
  const data=JSON.parse(e.universe.callSheet.activeBattle.battle);data.teams[data.user].lineup.off.LG.traits.power=99;data.teams[data.user].lineup.off.C.traits.power=99;
  e.universe.callSheet.activeBattle.battle=JSON.stringify(data);
  const resume=postgameFrame(entry);await new Promise(resolve=>setImmediate(resolve));
  assert.match(resume.get('#modal').innerHTML,/id="deferEvolution"/);resume.get('#deferEvolution').onclick();
  assert.equal(e.universe.callSheet.playbook.packsOpened,1);
  assert.equal(e.universe.callSheet.activeBattle,null);assert.equal(e.universe.callSheet.playbook.mastery.inside_zone,reps);
  assert.ok(!e.universe.callSheet.playbook.evolved?.inside_zone);
  assert.ok(e.universe.callSheet.playbook.deferredEvolutions?.includes('inside_zone'),'leave it in Deck Room without a repeat prompt next week');
});
test('unopened program packs are not evicted by newer packs and an earned album cannot re-award after unrelated reward keys age out',async()=>{
  const e=loadEngine({seed:539,fullRuntime:true});e.setUserTeam('Chicago Metropolitan');await e.loadSchools();e.initUniverse();
  const cg=globalThis.DynastyCardGameDay;cg.enable();const u=e.universe,m=u.callSheet;
  for(const id of ['statue_left','hook_ladder','flea_flicker','jet_reverse'])P.grantCard(m.playbook,id);
  cg.checkAlbums();const album=m.rewardPacks.find(x=>x.key==='album:trick');
  for(let n=0;n<10;n++)cg.rewards.booster(u.year+n,6);
  assert.ok(m.rewardPacks.some(p=>p.key===album.key),'the oldest unopened pack still exists');
  const clone=JSON.parse(JSON.stringify({callSheet:m}));e.normalizeCallSheet(clone);assert.equal(clone.callSheet.rewardPacks.length,m.rewardPacks.length);
  assert.equal(cg.takeRewardCard(album.key,album.cards[0]).ok,true);m.rewardKeys=Array.from({length:120},(_,i)=>'misc:'+i);
  assert.deepEqual(cg.checkAlbums(),[]);assert.ok(!m.rewardPacks.some(p=>p.key===album.key));
});
test('an entirely full destination never consumes a game or program pack; another legal choice can still be claimed',async()=>{
  const e=loadEngine({seed:641,fullRuntime:true});e.setUserTeam('Chicago Metropolitan');await e.loadSchools();e.initUniverse();
  const cg=globalThis.DynastyCardGameDay;cg.enable();const pb=e.universe.callSheet.playbook,m=e.universe.callSheet;
  pb.def.wrinkles=Array(pb.capacity.wrinkles).fill('robber');pb.reserve.def.wrinkles=Array(500).fill('two_man');
  const pack=envelope(pb,['two_man','press','inside_zone_plus']);pb.gamePacks=[pack];
  m.rewardPacks=[{key:'album:test',title:'Test pack',type:'album',cards:['two_man','press']}];
  let before=JSON.stringify(m);assert.equal(cg.takeGamePack(pack.key,'two_man').ok,false);assert.equal(JSON.stringify(m),before);
  assert.equal(cg.takeRewardCard('album:test','two_man').ok,false);assert.equal(JSON.stringify(m),before);
  assert.equal(cg.takeGamePack(pack.key,'inside_zone_plus').ok,true);assert.equal(cg.takeRewardCard('album:test','press').ok,true);
  assert.equal(pb.reserve.def.wrinkles.length,500);assert.equal(pb.packsOpened,1);
});

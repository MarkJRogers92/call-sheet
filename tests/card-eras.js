'use strict';
// Eras of football: single wing, option, West Coast and 46 / zone blitz cards play in full battles, the triple option
// needs a running QB, Two-Way Star rewards versatile players, and the new eras and albums exist.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const core=f=>require(path.join(__dirname,'../forks/call-sheet/core',f));
const B=core('battle.js'),R=core('resolver.js'),Ro=core('roster.js'),D=core('data.js'),P=core('packs.js');
const OFF=['spinner','buck_lateral','triple_option','split_veer','shallow_cross','curl_flat'],DEF=['forty_six','zone_blitz'];

test('era cards are real cards: in packs, labeled by era, and played by coordinators',()=>{
  for(const id of [...OFF,...DEF,'two_way_star'])assert.ok(P.POOL.some(c=>c.id===id),id);
  for(const id of [...OFF,...DEF])assert.ok((D.PLAYS[id]||D.CALLS[id]).era,id);
  const used=new Set();
  for(let i=0;i<24;i++){
    const t=Ro.preset(['ground','tempo','aerial'][i%3]),d=JSON.parse(JSON.stringify(D.DEFAULT_DECKS));d.off.wrinkles.push(...OFF,...OFF);d.def.wrinkles.push(...DEF,...DEF);d.off.tactics.push('two_way_star','two_way_star');t.decks=d;
    const b=B.simulate({home:t,away:Ro.preset('aerial'),seed:`eras-${i}`});assert.ok(!b.final.engineError,b.final.engineError);
    for(const e of b.log)if(e.type==='snap'&&e.offSide==='home')used.add(e.play);else if(e.type==='snap')used.add(e.call);
  }
  const missing=[...OFF,...DEF].filter(id=>!used.has(id));
  assert.ok(missing.length<=1,`coordinators use the era cards (unused: ${missing.join(', ')})`);
});

test('the triple option needs a running quarterback; Two-Way Star needs a versatile player',()=>{
  const lu=Ro.preset('aerial').lineup.off;lu.QB={...lu.QB,traits:{...lu.QB.traits,speed:55}};
  assert.match(R.playBlocked(D.PLAYS.triple_option,lu)||'',/speed 7/);
  lu.QB={...lu.QB,traits:{...lu.QB.traits,speed:80}};assert.equal(R.playBlocked(D.PLAYS.triple_option,lu),null);
  const off=Ro.preset('aerial').lineup.off,def=Ro.preset('ground').lineup.def;
  const snap=v=>{off.SLOT={...off.SLOT,traits:{...off.SLOT.traits,versatility:v}};return R.buildSnap({off,def,play:D.PLAYS.shallow_cross,call:D.CALLS.cover3,offTactics:['two_way_star'],situation:{down:1,distance:10,field:30,period:1}})};
  const has=s=>s.duels.some(d=>d.mods.some(m=>m.src==='Two-Way Star'));
  assert.equal(has(snap(85)),true);assert.equal(has(snap(60)),false);
});

test('new eras and albums are part of the card program',async()=>{
  const {loadEngine}=require('../tools/harness');globalThis.__DL_TEST__={};
  const e=loadEngine({seed:971,fullRuntime:true});e.setUserTeam('Chicago Metropolitan');await e.loadSchools();e.initUniverse();
  const cg=globalThis.DynastyCardGameDay;cg.enable();
  const eras=new Set(Array.from({length:60},(_,i)=>cg.eraFor(1990+i).name));
  assert.ok(eras.has('Single Wing Era')&&eras.has('Two-Way Era'),[...eras].join(', '));
  const albums=cg.albumProgress().map(a=>a.id);
  for(const id of ['single_wing','west_coast','option','pressure'])assert.ok(albums.includes(id),id);
  assert.ok(cg.albumProgress().find(a=>a.id==='option').cards.includes('triple_option'));
});

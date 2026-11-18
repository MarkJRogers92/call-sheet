'use strict';
// Collecting: print finishes are cosmetic and keep the best one, saves keep only valid finishes, and the Ring of Honor
// binder shows graduated players' career cards.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const P=require(path.join(__dirname,'../forks/call-sheet/core/packs.js')),D=require(path.join(__dirname,'../forks/call-sheet/core/data.js'));

test('pulls roll a cosmetic print finish; the collection keeps the best one',()=>{
  const pb=P.newPlaybook(),counts={foil:0,gold:0,none:0};
  for(let i=0;i<1500;i++){const f=P.rollFinish(pb,`card_${i%40}`,`seed-${i}`);counts[f||'none']++}
  assert.ok(counts.gold>10&&counts.gold<100,`gold ${counts.gold}/1500`);assert.ok(counts.foil>120&&counts.foil<320,`foil ${counts.foil}/1500`);
  const pb2=P.newPlaybook();pb2.finishes={draw:'gold'};
  for(let i=0;i<200;i++)P.rollFinish(pb2,'draw',`x-${i}`);assert.equal(pb2.finishes.draw,'gold','a gold card never downgrades');
  // Cosmetic only: the card's definition does not change.
  const before=JSON.stringify(D.PLAYS.draw);P.applyPick(pb2,{...P.POOL.find(c=>c.id==='draw'),uid:'u1'});assert.equal(JSON.stringify(D.PLAYS.draw),before);
});

test('saves keep only valid print finishes',async()=>{
  const {loadEngine}=require('../tools/harness');globalThis.__DL_TEST__={};
  const e=loadEngine({seed:991,fullRuntime:true});e.setUserTeam('Chicago Metropolitan');await e.loadSchools();e.initUniverse();
  const cg=globalThis.DynastyCardGameDay;cg.enable();const u=e.universe;
  u.callSheet.playbook.finishes={draw:'gold',power:'shiny',screen:'foil'};
  const copy=JSON.parse(JSON.stringify({callSheet:u.callSheet}));e.normalizeCallSheet(copy);
  assert.deepEqual(copy.callSheet.playbook.finishes,{draw:'gold',screen:'foil'});
});

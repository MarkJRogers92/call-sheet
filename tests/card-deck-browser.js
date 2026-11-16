'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {chromium}=require('playwright-core'),{chromiumPath}=require('./helpers/chromium-path'),{startNewDynasty}=require('./helpers/start-new-dynasty');
const {bundle}=require('../forks/call-sheet/tools/bundle');
(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'card-deck-')),file=path.join(dir,'battle.html');fs.writeFileSync(file,bundle({document:true}));
 const browser=await chromium.launch({executablePath:chromiumPath(),args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('file://'+file);await page.locator('[data-team]').first().click();await page.click('#pbv');
  await page.locator('[data-base="0"]').selectOption('pa_boot');await page.locator('[data-move^="tactics:"]').first().click();await page.click('[data-save]');
  assert.equal(await page.evaluate(()=>window.__slice.save().playbook.off.base[0]),'pa_boot');
  assert.equal(await page.evaluate(()=>window.__slice.save().playbook.reserve.off.tactics.length),1);
  await page.reload();assert.equal(await page.evaluate(()=>window.__slice.save().playbook.off.base[0]),'pa_boot');
  await page.click('[data-k="mode"][data-v="snap"]');await page.click('#play');await page.click('#kick');if(await page.$('#gotIt'))await page.click('#gotIt');
  await page.waitForFunction(()=>window.__slice.req&&!window.__slice.busy);
  await page.evaluate(()=>{window.SliceFX.speed=.001;window.SliceFX.skipping=true;window.__slice.go({type:'call',play:'outside_zone',tactics:[]})});
  await page.waitForFunction(()=>window.__slice.req&&!window.__slice.busy);
  const checkpoint=await page.evaluate(()=>{const b=window.__slice.b;return{game:b.game,rng:b.rng,hands:b.hands,log:b.log,workload:b.workload}});
  await page.reload();assert.match(await page.textContent('#play'),/RESUME/);await page.click('#play');
  assert.deepEqual(await page.evaluate(()=>{const b=window.__slice.b;return{game:b.game,rng:b.rng,hands:b.hands,log:b.log,workload:b.workload}}),checkpoint);
  await page.locator('#hand .card.k-play:not(.blocked)').first().click();assert.match(await page.textContent('#side'),/Ability.*Effects.*Edge/);
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.__slice.title());assert.equal(await page.locator('#pbv').isDisabled(),true);
  await page.click('#play');await page.evaluate(()=>{window.SliceFX.speed=.001;window.SliceFX.skipping=true});await page.click('#bSim');await page.waitForSelector('#openPack');
  const earned=await page.evaluate(()=>({games:window.__slice.save().games,achievements:window.__slice.save().playbook.achievements}));assert.ok(earned.achievements.includes('first_game'));
  await page.reload();await page.click('#play');await page.waitForSelector('#openPack');assert.equal(await page.evaluate(()=>window.__slice.save().games),earned.games);
  // Skip any optional breakout before choosing the saved game's pack.
  await page.evaluate(()=>{window.__slice.b._breakout=null;window.SliceFX.speed=.001});await page.click('#openPack');await page.click('#pk',{force:true});await page.waitForSelector('.slot.pickable');await page.locator('.slot.pickable').first().click();
  await page.waitForFunction(()=>window.__slice.b._packPicked);const packs=await page.evaluate(()=>window.__slice.save().playbook.packsOpened);
  // A refresh after the pick must not grant a second pack or advance a second game.
  await page.reload();if(await page.locator('#play').textContent().then(t=>t.includes('RESUME')))await page.click('#play');
  assert.equal(await page.evaluate(()=>window.__slice.save().playbook.packsOpened),packs);
  assert.equal(await page.evaluate(()=>window.__slice.save().games),earned.games);
  await page.close();
  const dynasty=await browser.newPage({viewport:{width:1400,height:900}});dynasty.on('pageerror',e=>errors.push(String(e)));
  await dynasty.goto('file://'+path.join(__dirname,'..','index.html'));await startNewDynasty(dynasty);
  while(await dynasty.locator('#weeklyDecisions [data-decision]').count())await dynasty.locator('#weeklyDecisions [data-decision]').first().click();
  await dynasty.locator('#broadcastFeature [data-card-deck]').click();await dynasty.locator('[data-base="0"]').selectOption('pa_boot');await dynasty.click('[data-save]');
  assert.equal(await dynasty.evaluate(()=>window.DynastyCardGameDay.meta().playbook.off.base[0]),'pa_boot');
  await dynasty.evaluate(()=>{const l=window.__callSheetDynasty.launch;window.__callSheetDynasty.launch=()=>{const c=l();return{...c,settings:{...c.settings,mode:'snap'}}}});
  await dynasty.locator('#broadcastFeature [data-coach-cards]').click();let frame=await (await dynasty.waitForSelector('#cardGameDay iframe')).contentFrame();
  await frame.waitForFunction(()=>window.__slice&&(document.querySelector('#gotIt')||window.__slice.req));if(await frame.$('#gotIt'))await frame.click('#gotIt');await frame.waitForFunction(()=>window.__slice.req&&!window.__slice.busy);
  assert.equal(await frame.evaluate(()=>window.__slice.b.decks[window.__slice.b.user].off.base[0]),'pa_boot');
  const saved=await frame.evaluate(()=>({game:window.__slice.b.game,rng:window.__slice.b.rng}));
  assert.ok(await dynasty.evaluate(()=>window.DynastyCardGameDay.meta().activeBattle));
  // Reopening the iframe reconstructs the screen from the host save, not a fresh kickoff.
  await dynasty.evaluate(()=>window.__callSheetDynasty.close());await dynasty.locator('#cardProgram [data-coach-cards]').click();frame=await (await dynasty.waitForSelector('#cardGameDay iframe')).contentFrame();await frame.waitForFunction(()=>window.__slice?.req);
  assert.deepEqual(await frame.evaluate(()=>({game:window.__slice.b.game,rng:window.__slice.b.rng})),saved);
  await frame.evaluate(()=>{window.SliceFX.speed=.001;window.SliceFX.skipping=true});await frame.click('#bSim');await frame.waitForSelector('#openPack');
  const progress=await dynasty.evaluate(()=>({games:window.DynastyCardGameDay.meta().games,record:window.DynastyCardGameDay.meta().playbook.record}));
  await dynasty.evaluate(()=>window.__callSheetDynasty.close());await dynasty.locator('#cardProgram [data-coach-cards]').click();frame=await (await dynasty.waitForSelector('#cardGameDay iframe')).contentFrame();await frame.waitForSelector('#openPack');
  assert.deepEqual(await dynasty.evaluate(()=>({games:window.DynastyCardGameDay.meta().games,record:window.DynastyCardGameDay.meta().playbook.record})),progress);
  assert.deepEqual(errors,[]);console.log('ok desktop/phone deck editing, owned cards, sandbox refresh and rewards, Dynasty deck launch and checkpoint resume');
 }finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});

'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {chromium}=require('playwright-core'),{chromiumPath}=require('./helpers/chromium-path'),{startNewDynasty}=require('./helpers/start-new-dynasty');
const {bundle}=require('../forks/call-sheet/tools/bundle');
const exerciseOwnedDeck=require('./helpers/exercise-owned-deck');
const exerciseGamePack=require('./helpers/exercise-game-pack');
const {finishPackChoice}=require('./helpers/play-card-battle');
const shots=process.env.CARD_SHOTS;
async function checkLayout(page,width,height,label){
  await page.setViewportSize({width,height});
  const editor=page.locator('#deckEditor');
  const geometry=await editor.evaluate(el=>{
    const d=el.getBoundingClientRect(), row=el.querySelector('[data-owned-card]'), save=el.querySelector('[data-save]'), b=save.getBoundingClientRect();
    return {left:d.left,right:d.right,wide:el.scrollWidth>el.clientWidth+1,
      firstTop:row.getBoundingClientRect().top,saveTop:b.top,saveBottom:b.bottom,
      clear:document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)?.closest('[data-save]')===save};
  });
  assert.ok(!geometry.wide&&geometry.left>=-1&&geometry.right<=width+1,'no sideways overflow at '+width);
  assert.ok(geometry.firstTop<height&&geometry.saveTop>=0&&geometry.saveBottom<=height+1&&geometry.clear,'owned choices and usable save action in first viewport: '+JSON.stringify(geometry));
  if(shots){fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,'owned-deck-'+label+'-'+width+'.png')})}
}
async function showOptions(page){
  const more=page.locator('#deckEditor [data-more-options]');
  if(!await more.evaluate(e=>e.open))await more.locator(':scope > summary').click();
}

(async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'card-deck-')),file=path.join(dir,'battle.html');fs.writeFileSync(file,bundle({document:true}));
 const browser=await chromium.launch({executablePath:chromiumPath(),args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('file://'+file);await page.locator('[data-team]').first().click();
  await page.locator('.headset-options summary').click();await page.locator('[data-headset="inside25"]').check();
  await page.reload();await page.locator('.headset-options summary').click();
  assert.ok(await page.locator('[data-headset="inside25"]').isChecked(),'Quick Battle remembers headset preferences');
  await page.click('#pbv');
  const editor=page.locator('#deckEditor');
  for(const [w,h] of [[1400,900],[390,844],[320,720]])await checkLayout(page,w,h,'sandbox');
  // Keyboard input must leave a reachable control on the same face, even as the next state changes.
  const active=editor.locator('[data-owned-card="deep_cross"]');
  await active.locator('[data-move="remove"]').focus();await page.keyboard.press('Enter');
  assert.match(await active.locator('[data-copy-count]').innerText(),/1 of 2 in deck/i);
  assert.ok(await active.evaluate(el=>el.contains(document.activeElement)));
  await editor.locator('[data-cancel]').click();
  await page.evaluate(exerciseOwnedDeck);await page.setViewportSize({width:1400,height:900});
  // Exercise the real standalone save callback, discard once, then cold-reload the kept changes.
  await page.click('#pbv');await showOptions(page);await page.selectOption('#openingScript','screen');await page.click('[data-cancel]');await page.click('#pbv');
  await showOptions(page);assert.equal(await page.inputValue('#openingScript'),'');await page.selectOption('#openingScript','screen');
  await page.click('[data-category="base"]');await page.locator('[data-base="0"]').selectOption('pa_boot');
  await page.click('[data-category="tactics"]');await page.locator('[data-owned-card="motion"] [data-move="remove"]').click();await page.click('[data-save]');
  assert.equal(await page.evaluate(()=>window.__slice.save().playbook.off.base[0]),'pa_boot');
  assert.equal(await page.evaluate(()=>window.__slice.save().playbook.reserve.off.tactics.length),1);
  await page.reload();assert.equal(await page.evaluate(()=>window.__slice.save().playbook.off.base[0]),'pa_boot');
  assert.equal(await page.evaluate(()=>window.__slice.save().playbook.off.openingScript),'screen');
  await page.click('[data-k="mode"][data-v="snap"]');await page.click('#play');await page.click('#kick');if(await page.$('#gotIt'))await page.click('#gotIt');
  await page.waitForFunction(()=>window.__slice.req&&!window.__slice.busy);
  assert.ok(await page.locator('#quickClue').isVisible(),'one public read sits beside the calls');
  const quick=page.locator('[data-quick-call]');assert.ok(await quick.count()>=2&&await quick.count()<=3);
  assert.ok(!await page.locator('#side').isVisible(),'full detail does not crowd the default decision');
  const preChoice=await page.evaluate(()=>window.CallSheet.battle.save(window.__slice.b));
  await quick.first().focus();await page.keyboard.press('Enter');assert.equal(await quick.first().getAttribute('aria-pressed'),'true');assert.ok(await quick.first().evaluate(el=>el===document.activeElement));
  const pair=await page.locator('.quick-board .call-tactic-note').innerText();assert.match(pair,/Add tactic|Play now|Hold Command/,'a selected call explains a pairing or why to save Command');
  await page.click('#sheetToggle');assert.equal(await page.locator('#sheetToggle').getAttribute('aria-expanded'),'true');assert.ok(await page.locator('#coachingRead .call-tactic-note').isVisible(),'same guidance in the full sheet');assert.match(await page.textContent('#look'),/Opening script: Screen/i);
  await page.click('#battleSettings');await page.selectOption('#motionMode','reduced');
  assert.ok(await page.locator('#headsetControls [data-headset="inside25"]').isChecked());
  await page.locator('#headsetControls [data-headset="defendLead"]').check();
  assert.ok(await page.evaluate(()=>window.__slice.b.headset.defendLead&&window.__slice.save().settings.headset.defendLead));
  await page.locator('#headsetControls [data-headset="defendLead"]').uncheck();
  assert.ok(await page.evaluate(()=>window.SliceFX.reduce&&document.documentElement.classList.contains('motion-reduced')));
  await page.keyboard.press('Escape');assert.ok(await page.locator('#battleSettings').evaluate(el=>el===document.activeElement));
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.locator('#hand .fan').first().evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  assert.ok(await page.locator('#root').evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  const tactic=page.locator('#hand .fan button[data-tactic-slot]:not(.info):not(.blocked)').first();
  if(await tactic.count()){
    const slot=await tactic.getAttribute('data-tactic-slot');
    await tactic.focus();await page.keyboard.press('Enter');
    const same=page.locator('#hand [data-tactic-slot="'+slot+'"]');
    assert.equal(await same.getAttribute('aria-pressed'),'true');assert.ok(await same.evaluate(el=>el===document.activeElement));
    await page.keyboard.press('Enter');assert.equal(await same.getAttribute('aria-pressed'),'false');
  }
  await page.setViewportSize({width:1400,height:900});
  assert.equal(await page.evaluate(()=>window.CallSheet.battle.save(window.__slice.b)),preChoice,'picking and inspecting cannot advance a snap');
  await page.evaluate(()=>{window.SliceFX.speed=.001;window.SliceFX.skipping=true;window.__slice.go({type:'call',play:'outside_zone',tactics:[]})});
  await page.waitForFunction(()=>window.__slice.req&&!window.__slice.busy);
  const checkpoint=await page.evaluate(()=>{const b=window.__slice.b;return{game:b.game,rng:b.rng,hands:b.hands,log:b.log,workload:b.workload}});
  await page.reload();assert.match(await page.textContent('#play'),/RESUME/);await page.click('#play');
  assert.deepEqual(await page.evaluate(()=>{const b=window.__slice.b;return{game:b.game,rng:b.rng,hands:b.hands,log:b.log,workload:b.workload}}),checkpoint);
  if(!await page.locator('#side').isVisible())await page.click('#sheetToggle');await page.locator('#hand .card.k-play:not(.blocked)').first().click();assert.match(await page.textContent('#side'),/Ability.*Effects.*Edge/);
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.__slice.title());assert.equal(await page.locator('#pbv').isDisabled(),true);
  await page.click('#play');if(!await page.locator('#bSim').isVisible())await page.click('#sheetToggle');await page.evaluate(()=>{window.SliceFX.speed=.001;window.SliceFX.skipping=true});await page.click('#bSim');await page.waitForSelector('#openPack');
  const earned=await page.evaluate(()=>({games:window.__slice.save().games,achievements:window.__slice.save().playbook.achievements}));assert.ok(earned.achievements.includes('first_game'));
  await page.reload();await page.click('#play');await page.waitForSelector('#openPack');assert.equal(await page.evaluate(()=>window.__slice.save().games),earned.games);
  // Skip any optional breakout before choosing the saved game's pack.
  await page.evaluate(()=>{window.__slice.b._breakout=null;window.SliceFX.speed=.001});await page.click('#openPack');await page.click('#pk',{force:true});await page.waitForSelector('.slot.pickable');await page.locator('.slot.pickable').first().click();await finishPackChoice(page,'collection');
  await page.waitForFunction(()=>window.__slice.b._packPicked);const packs=await page.evaluate(()=>window.__slice.save().playbook.packsOpened);
  // A refresh after the pick must not grant a second pack or advance a second game.
  await page.reload();if(await page.locator('#play').textContent().then(t=>t.includes('RESUME')))await page.click('#play');
  assert.equal(await page.evaluate(()=>window.__slice.save().playbook.packsOpened),packs);
  assert.equal(await page.evaluate(()=>window.__slice.save().games),earned.games);
  await page.close();
  const rewardPage=await browser.newPage();rewardPage.on('pageerror',e=>errors.push(String(e)));
  await rewardPage.goto('file://'+file);await rewardPage.locator('[data-team]').first().click();
  await rewardPage.evaluate(exerciseGamePack);await rewardPage.close();
  const dynasty=await browser.newPage({viewport:{width:1400,height:900}});dynasty.on('pageerror',e=>errors.push(String(e)));
  await dynasty.goto('file://'+path.join(__dirname,'..','index.html'));await startNewDynasty(dynasty);
  while(await dynasty.locator('#weeklyDecisions [data-decision]').count())await dynasty.locator('#weeklyDecisions [data-decision]').first().click();
  await dynasty.locator('#cardDeskLink [data-card-dynasty-tab="deckroom"]').click();await dynasty.locator('#cardProgram [data-card-deck]').click();for(const [w,h] of [[1400,900],[390,844],[320,720]])await checkLayout(dynasty,w,h,'dynasty');
  await showOptions(dynasty);await dynasty.locator('[data-plans] summary').click();await dynasty.selectOption('[data-plan]','air');assert.match(await dynasty.locator('[data-plan-preview]').innerText(),/Tradeoff:/);
  await dynasty.click('[data-plan-apply]');assert.equal(await dynasty.inputValue('#openingScript'),'vertical_shot');
  await dynasty.click('#deckEditor [data-cancel]');await dynasty.setViewportSize({width:1400,height:900});await dynasty.locator('#cardProgram [data-card-deck]').click();await showOptions(dynasty);await dynasty.selectOption('#openingScript','screen');
  await dynasty.click('[data-category="base"]');await dynasty.locator('[data-base="0"]').selectOption('pa_boot');await dynasty.click('[data-save]');
  assert.equal(await dynasty.evaluate(()=>window.DynastyCardGameDay.meta().playbook.off.base[0]),'pa_boot');
  await dynasty.evaluate(()=>{const l=window.__callSheetDynasty.launch;window.__callSheetDynasty.launch=()=>{const c=l();return{...c,settings:{...c.settings,mode:'snap'}}}});
  await dynasty.locator('#clientRail [data-client-tab="dashboard"]').click();await dynasty.locator('#broadcastFeature [data-coach-cards]').click();let frame=await (await dynasty.waitForSelector('#cardGameDay iframe')).contentFrame();
  await frame.waitForFunction(()=>window.__slice&&(document.querySelector('#gotIt')||window.__slice.req));if(await frame.$('#gotIt'))await frame.click('#gotIt');await frame.waitForFunction(()=>window.__slice.req&&!window.__slice.busy);
  assert.equal(await frame.evaluate(()=>window.__slice.b.decks[window.__slice.b.user].off.base[0]),'pa_boot');
  await frame.click('#sheetToggle');assert.match(await frame.textContent('#look'),/Opening script: Screen/i);
  const saved=await frame.evaluate(()=>({game:window.__slice.b.game,rng:window.__slice.b.rng}));
  assert.ok(await dynasty.evaluate(()=>window.DynastyCardGameDay.meta().activeBattle));
  // Reopening the iframe reconstructs the screen from the host save, not a fresh kickoff.
  await dynasty.evaluate(()=>window.__callSheetDynasty.close());await dynasty.locator('#clientRail [data-client-tab="deckroom"]').click();await dynasty.locator('#cardProgram [data-coach-cards]').click();frame=await (await dynasty.waitForSelector('#cardGameDay iframe')).contentFrame();await frame.waitForFunction(()=>window.__slice?.req);
  assert.deepEqual(await frame.evaluate(()=>({game:window.__slice.b.game,rng:window.__slice.b.rng})),saved);
  if(!await frame.locator('#bSim').isVisible())await frame.click('#sheetToggle');await frame.evaluate(()=>{window.SliceFX.speed=.001;window.SliceFX.skipping=true});await frame.click('#bSim');await frame.waitForSelector('#openPack');
  const progress=await dynasty.evaluate(()=>({games:window.DynastyCardGameDay.meta().games,record:window.DynastyCardGameDay.meta().playbook.record}));
  await dynasty.evaluate(()=>window.__callSheetDynasty.close());await dynasty.locator('#cardProgram [data-coach-cards]').click();frame=await (await dynasty.waitForSelector('#cardGameDay iframe')).contentFrame();await frame.waitForSelector('#openPack');
  assert.deepEqual(await dynasty.evaluate(()=>({games:window.DynastyCardGameDay.meta().games,record:window.DynastyCardGameDay.meta().playbook.record})),progress);
  assert.deepEqual(errors,[]);console.log('ok desktop/phone deck editing, owned cards, sandbox refresh and rewards, Dynasty deck launch and checkpoint resume');
 }finally{await browser.close();fs.rmSync(dir,{recursive:true,force:true})}
})().catch(e=>{console.error(e);process.exitCode=1});

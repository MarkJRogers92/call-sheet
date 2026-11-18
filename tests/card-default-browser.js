'use strict';
// In the Call Sheet fork the card game is the game: a new dynasty has a deck shortcut at the top of This Week, and
// Next and Game Day coach this week's game as a card battle, and the classic versions are hidden until card mode is off.
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('playwright-core'),{chromiumPath}=require('./helpers/chromium-path'),{startNewDynasty}=require('./helpers/start-new-dynasty');
const {playCardBattle}=require('./helpers/play-card-battle');
const shots=process.env.CARD_SHOTS||'';
(async()=>{
  const browser=await chromium.launch({executablePath:chromiumPath(),args:['--no-sandbox']});
  try{
    const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    await page.goto('file://'+path.join(__dirname,'..','index.html'));await startNewDynasty(page,{cardGame:true});
    // The deck shortcut and the matchup lead This Week.
    // Order: masthead, view tabs, the briefing (with the Cards & Deck strip as its first row, so it sits right under the
    // tabs), then the matchup, before anything else.
    const order=await page.evaluate(()=>{const kids=[...document.querySelector('#dashboard').children],i=id=>kids.findIndex(n=>n.id===id),desk=document.querySelector('#dashboard > .command-center');return{brief:kids.findIndex(n=>n.classList.contains('command-center')),feature:i('broadcastFeature'),panelFirstInBrief:desk?.firstElementChild?.id==='cardDeskLink',tour:i('tourOffer')}});
    assert.ok(order.panelFirstInBrief&&order.feature===order.brief+1&&(order.tour<0||order.tour>order.feature),`deck shortcut and matchup lead This Week: ${JSON.stringify(order)}`);
    while(await page.locator('#weeklyDecisions [data-decision]').count())await page.locator('#weeklyDecisions [data-decision]').first().click();
    const next=page.locator('#hubAdvance');
    await page.waitForFunction(()=>/^Next: Coach Week 1 (vs|at) /.test(document.querySelector('#hubAdvance')?.textContent||''),null,{timeout:10000});
    if(shots)await page.screenshot({path:`${shots}/default-week.png`});
    // No classic versions in card mode: no Classic Game Day, no duplicate Open Game Day; Game Day leads with the battle.
    assert.equal(await page.locator('#broadcastFeature [data-coach-live]').isHidden(),true,'Classic Game Day is hidden');
    assert.equal(await page.locator('#broadcastFeature [data-sports-tab="gamelab"]').isHidden(),true,'Open Game Day is hidden');
    await page.evaluate(()=>window.__DL_TEST__.goToTab('gamelab'));await page.waitForTimeout(300);
    assert.equal(await page.locator('#gamelabCoachCards').isVisible(),true);assert.equal(await page.locator('#watchDetailedGame').isHidden(),true,'no classic Watch');
    assert.match(await page.locator('#gamelab > .section-head .muted').innerText(),/card battle/);
    await page.evaluate(()=>window.__DL_TEST__.goToTab('dashboard'));await page.waitForTimeout(300);
    // Game Day (nav) opens the battle; closing it keeps it resumable from Next.
    await page.locator('[data-client-tab="gamelab"]').first().click();
    await page.waitForSelector('#cardGameDay iframe',{timeout:10000});
    const frame=await (await page.$('#cardGameDay iframe')).contentFrame();
    await frame.waitForFunction(()=>window.__slice&&(document.querySelector('#gotIt')||window.__slice.req),null,{timeout:30000});
    if(await frame.$('#gotIt'))await frame.click('#gotIt',{force:true});
    await frame.waitForFunction(()=>window.__slice.req&&!window.__slice.busy,null,{timeout:30000});
    await page.evaluate(()=>window.__callSheetDynasty.close());
    await page.evaluate(()=>window.DynastyCardGameDay.paint());
    assert.equal(await next.innerText(),'Next: Resume Card Battle');
    // Next resumes it; play it out; then Next advances the week.
    await next.click();await playCardBattle(page);
    const played=await page.evaluate(()=>window.__DL_TEST__.preseasonDebug());
    assert.match(await next.innerText(),/^Next: (?!Coach)/,'after the game, Next goes back to advancing the week');
    await next.click();
    await page.waitForFunction(w=>window.__DL_TEST__.preseasonDebug().week>w,played.week,{timeout:60000});
    // Turning card mode off returns Next to simulating and brings the classic versions back.
    await page.evaluate(()=>{window.DynastyCardGameDay.setIntegration('cards-default',false);window.DynastyCardGameDay.paint()});
    while(await page.locator('#weeklyDecisions [data-decision]').count())await page.locator('#weeklyDecisions [data-decision]').first().click();
    assert.doesNotMatch(await next.innerText(),/Coach/);
    assert.equal(await page.locator('#broadcastFeature [data-coach-cards]').count(),1);
    assert.equal(await page.locator('#broadcastFeature [data-coach-live]').isVisible(),true,'with card mode off, Classic Game Day is back');
    await page.evaluate(()=>window.__DL_TEST__.goToTab('gamelab'));await page.waitForTimeout(300);
    assert.equal(await page.locator('#watchDetailedGame').isVisible(),true);assert.equal(await page.locator('#gamelabCoachCards').count(),0);
    assert.deepEqual(errors,[],errors.join('\n'));
    console.log('ok  card battles are the game day: classic versions hidden; Next, Game Day, resume, then advance; switchable');
  }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exit(1)});

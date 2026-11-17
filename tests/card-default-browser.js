'use strict';
// In the Call Sheet fork the card game is the game: a new dynasty has a Card Program at the top of This Week, and
// Next, Game Day and Open Game Day all coach this week's game as a card battle. Classic Game Day stays available.
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
    // The matchup and the Card Program lead This Week.
    // Order: masthead, view tabs, the briefing (with Next), then the matchup and the Card Program, before anything else.
    const order=await page.evaluate(()=>{const kids=[...document.querySelector('#dashboard').children],i=id=>kids.findIndex(n=>n.id===id);return{brief:kids.findIndex(n=>n.classList.contains('command-center')),feature:i('broadcastFeature'),panel:i('cardProgram'),tour:i('tourOffer')}});
    assert.ok(order.feature<=order.brief+1&&order.panel===order.feature+1&&(order.tour<0||order.tour>order.panel),`matchup and Card Program lead This Week: ${JSON.stringify(order)}`);
    while(await page.locator('#weeklyDecisions [data-decision]').count())await page.locator('#weeklyDecisions [data-decision]').first().click();
    const next=page.locator('#hubAdvance');
    await page.waitForFunction(()=>/^Next: Coach Week 1 (vs|at) /.test(document.querySelector('#hubAdvance')?.textContent||''),null,{timeout:10000});
    if(shots)await page.screenshot({path:`${shots}/default-week.png`});
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
    // Turning the default off returns Next to simulating; Coach with Cards stays on the matchup card.
    await page.evaluate(()=>{window.DynastyCardGameDay.setIntegration('cards-default',false);window.DynastyCardGameDay.paint()});
    while(await page.locator('#weeklyDecisions [data-decision]').count())await page.locator('#weeklyDecisions [data-decision]').first().click();
    assert.doesNotMatch(await next.innerText(),/Coach/);
    assert.equal(await page.locator('#broadcastFeature [data-coach-cards]').count(),1);
    assert.equal(await page.locator('#broadcastFeature [data-coach-live]').count(),1,'Classic Game Day is still offered');
    assert.deepEqual(errors,[],errors.join('\n'));
    console.log('ok  the card battle is the default game day: Next, Game Day, resume, then advance; switchable');
  }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exit(1)});

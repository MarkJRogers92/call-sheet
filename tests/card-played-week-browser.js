'use strict';
// After this week's card game is recorded, the matchup card must not offer to coach it again before the week advances.
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core');
const {chromiumPath}=require('./helpers/chromium-path');
const {testPageURL}=require('./helpers/browser-url');
const {startNewDynasty}=require('./helpers/start-new-dynasty');
const {playCardBattle}=require('./helpers/play-card-battle');
(async()=>{
  const browser=await chromium.launch({executablePath:chromiumPath(),args:['--no-sandbox']});
  try{
    const page=await browser.newPage({viewport:{width:1400,height:900},reducedMotion:'reduce'});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(testPageURL());await startNewDynasty(page,{cardGame:true});
    while(await page.locator('#weeklyDecisions [data-decision]').count())await page.locator('#weeklyDecisions [data-decision]').first().click();
    const coach=page.locator('#broadcastFeature [data-coach-cards]');
    assert.ok(await coach.isVisible(),'the unplayed game can be coached');assert.match(await page.textContent('#broadcastFeature .broadcast-kicker'),/NEXT MATCHUP/);
    await coach.click();await playCardBattle(page,{timeout:240000});
    assert.equal(await page.evaluate(()=>window.DynastyCardGameDay.meta().games),1);
    // The Last Final card repeats the recorded deciding snap (the same text the battle's final screen showed).
    const decider=page.locator('#highlightsCard #hlDecider');await decider.waitFor({timeout:10000});
    assert.match(await decider.innerText(),/Deciding snap[\s\S]+ beat [\s\S]+ on /i);
    assert.match(await page.textContent('#broadcastFeature .broadcast-kicker'),/WEEK 1 · FINAL RECORDED/);
    assert.equal(await coach.isVisible(),false,'a recorded game is not offered again');
    assert.match(await page.textContent('#csPlayedNote'),/Advance the week/);
    await page.click('#hubAdvance');await page.waitForFunction(()=>/WEEK 2 · NEXT MATCHUP/.test(document.querySelector('#broadcastFeature .broadcast-kicker')?.textContent||''),null,{timeout:30000});
    assert.equal(await page.locator('#csPlayedNote').count(),0);assert.ok(await coach.isVisible(),'the next game is offered after the week advances');
    assert.equal(await page.evaluate(()=>window.DynastyCardGameDay.meta().games),1,'no second game was played');
    assert.deepEqual(errors,[]);console.log('ok  played week: deciding snap on Last Final, no replay offer before advancing, next game offered after');
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});

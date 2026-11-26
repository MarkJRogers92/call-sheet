'use strict';
// In the Call Sheet fork the card game is the game: a new dynasty has a deck shortcut at the top of This Week, and
// Next and Game Day coach this week's game as a card battle, and the classic versions are hidden until card mode is off.
const assert=require('node:assert/strict');
const {chromium}=require('playwright-core'),{chromiumPath}=require('./helpers/chromium-path'),{startNewDynasty}=require('./helpers/start-new-dynasty');
const {playCardBattle}=require('./helpers/play-card-battle');
const {testPageURL}=require('./helpers/browser-url');
const shots=process.env.CARD_SHOTS||'';
(async()=>{
  const browser=await chromium.launch({executablePath:chromiumPath(),args:['--no-sandbox']});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'}),errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(testPageURL());await startNewDynasty(page,{cardGame:true});
    const order=await page.evaluate(()=>{
      const desk=document.querySelector('#dashboard > .command-center');
      const focus=desk?.querySelector('#weeklyDeskFocus');
      const matchup=document.querySelector('#broadcastFeature');
      return {shortcutAfterAction:focus?.nextElementSibling?.id==='cardDeskLink',matchupAfterDesk:!!(desk&&matchup&&(desk.compareDocumentPosition(matchup)&Node.DOCUMENT_POSITION_FOLLOWING))};
    });
    assert.deepEqual(order,{shortcutAfterAction:true,matchupAfterDesk:true},'the weekly action leads the deck shortcut and matchup');
    await page.evaluate(()=>window.scrollTo(0,0));
    for(const selector of ['#hubAdvance','#weeklyDeskFocus']){
      const bounds=await page.locator(selector).boundingBox();
      assert.ok(bounds&&bounds.y>=0&&bounds.y+bounds.height<=844,`${selector} fits in the first phone screen`);
    }
    await page.setViewportSize({width:1400,height:900});
    while(await page.locator('#weeklyDecisions [data-decision]').count())await page.locator('#weeklyDecisions [data-decision]').first().click();
    const next=page.locator('#hubAdvance');
    const coach=page.locator('#broadcastFeature [data-coach-cards]');
    const matchup=page.locator('#broadcastFeature .broadcast-kicker');
    await page.waitForFunction(()=>/^Next: Coach Week 1 (vs|at) /.test(document.querySelector('#hubAdvance')?.textContent||''),null,{timeout:10000});
    assert.equal(await coach.isVisible(),true,'the unplayed game can be coached');
    assert.match(await matchup.innerText(),/NEXT MATCHUP/);
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
    assert.match(await matchup.innerText(),/WEEK 1 · FINAL RECORDED/);
    assert.equal(await coach.isHidden(),true,'a recorded game cannot be coached again');
    assert.match(await page.locator('#csPlayedNote').innerText(),/Advance the week/);
    const game=await page.evaluate(()=>{
      const meta=window.DynastyCardGameDay.meta();
      return {games:meta.games,film:Object.values(meta.oppFilm||{})};
    });
    assert.equal(game.games,1,'the first game was recorded once');
    assert.equal(game.film.length,1,'only one opponent has recorded film');
    assert.ok(game.film[0][0].def.total>0&&game.film[0][0].off.total>0,'both sides contributed to the opponent film');
    const decider=page.locator('#highlightsCard #hlDecider');
    await decider.waitFor({timeout:10000});
    assert.match(await decider.innerText(),/Deciding snap[\s\S]+ beat [\s\S]+ on /i);
    await next.click();
    await page.waitForFunction(w=>window.__DL_TEST__.preseasonDebug().week>w,played.week,{timeout:60000});
    await page.waitForFunction(()=>/WEEK 2 · NEXT MATCHUP/.test(document.querySelector('#broadcastFeature .broadcast-kicker')?.textContent||''),null,{timeout:30000});
    assert.equal(await page.locator('#csPlayedNote').count(),0);
    assert.equal(await coach.isVisible(),true,'the next matchup can be coached after advancing');
    assert.equal(await page.evaluate(()=>window.DynastyCardGameDay.meta().games),1,'advancing did not record a second game');
    // Turning card mode off returns Next to simulating and brings the classic versions back.
    await page.evaluate(()=>{window.DynastyCardGameDay.setIntegration('cards-default',false);window.DynastyCardGameDay.paint()});
    while(await page.locator('#weeklyDecisions [data-decision]').count())await page.locator('#weeklyDecisions [data-decision]').first().click();
    assert.doesNotMatch(await next.innerText(),/Coach/);
    assert.equal(await page.locator('#broadcastFeature [data-coach-cards]').count(),1);
    assert.equal(await page.locator('#broadcastFeature [data-coach-live]').isVisible(),true,'with card mode off, Classic Game Day is back');
    await page.evaluate(()=>window.__DL_TEST__.goToTab('gamelab'));await page.waitForTimeout(300);
    assert.equal(await page.locator('#watchDetailedGame').isVisible(),true);assert.equal(await page.locator('#gamelabCoachCards').count(),0);
    assert.deepEqual(errors,[],errors.join('\n'));
    console.log('ok  card battles are the game day: first-screen phone action, classic controls hidden, resume, record once, advance, switchable');
  }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exit(1)});

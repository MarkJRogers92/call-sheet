'use strict';
// Call Sheet fork: "Coach with Cards" plays this week's real game as a card battle and records it into the season.
// Opens from the next-matchup card, runs the battle in its frame on both real rosters, records the final through the
// transactional path, saves the program's card playbook, and returns to the dynasty.
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('playwright-core'),{chromiumPath}=require('./helpers/chromium-path'),{startNewDynasty}=require('./helpers/start-new-dynasty');
const shots=process.env.CARD_SHOTS||'';
(async()=>{
  const browser=await chromium.launch({executablePath:chromiumPath(),args:['--no-sandbox']});
  try{
    const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
    await page.goto('file://'+path.join(__dirname,'..','index.html'));await startNewDynasty(page);
    while(await page.locator('#weeklyDecisions [data-decision]').count())await page.locator('#weeklyDecisions [data-decision]').first().click();
    const before=await page.evaluate(()=>window.__DL_TEST__.preseasonDebug());
    if(shots)await page.screenshot({path:`${shots}/c0-hub.png`});
    await page.locator('#broadcastFeature [data-coach-cards]').click();
    const frameEl=await page.waitForSelector('#cardGameDay iframe',{timeout:10000});
    const frame=await frameEl.contentFrame();
    // The battle starts on the real teams: the user's real quarterback is on the field.
    await frame.waitForFunction(()=>window.__slice&&(document.querySelector('#gotIt')||window.__slice.req),null,{timeout:20000});
    if(await frame.$('#gotIt')){if(shots)await page.screenshot({path:`${shots}/c1-howto.png`});await frame.click('#gotIt',{force:true})}
    await frame.waitForFunction(()=>window.__slice.req&&!window.__slice.busy,null,{timeout:30000});
    const qb=await frame.evaluate(()=>{const b=window.__slice.b;return b.teams[b.user].lineup.off.QB});
    assert.ok(qb.portraitSeed,'battle players carry their Dynasty Lab portrait');
    const realQb=await page.evaluate(id=>{const t=window.__DL_TEST__.selected();return t.roster.find(p=>String(p.id)===id)?.name},qb.id);
    assert.equal(realQb,qb.name,'the battle quarterback is the real starter');
    if(shots)await page.screenshot({path:`${shots}/c2-battle.png`});
    // Call one snap by hand, then let the coordinators finish the game.
    const cards=await frame.$$('#hand .fan:first-child .card:not(.blocked)');
    if(cards.length){await cards[0].click({force:true});await frame.click('#snapBtn',{force:true});await page.waitForTimeout(1200);if(shots)await page.screenshot({path:`${shots}/c3-clash.png`})}
    await frame.waitForFunction(()=>!window.__slice.busy,null,{timeout:60000});
    await frame.evaluate(()=>{document.getElementById('modal').classList.remove('on')});
    await frame.click('#bSim',{force:true});
    for(let i=0;i<400;i++){if(await frame.$('#openPack'))break;const f=await frame.$('#modal [data-o]');if(f)await f.click({force:true}).catch(()=>{});await page.waitForTimeout(150)}
    await page.waitForTimeout(600);
    const finalText=await frame.locator('#modal').innerText();
    if(shots)await page.screenshot({path:`${shots}/c4-final.png`});
    assert.match(finalText,/SAVED TO YOUR SEASON/,`the final is recorded: ${finalText.slice(0,200)}`);
    const after=await page.evaluate(()=>window.__DL_TEST__.preseasonDebug());
    assert.ok(after.played>before.played,'the scheduled game is now played');
    // Pack, then home.
    await frame.click('#openPack',{force:true});
    for(let i=0;i<60;i++){if(await frame.$('#pk'))break;const tp=await frame.$('#toPack');if(tp){await tp.click({force:true});await page.waitForTimeout(300);continue}await page.waitForTimeout(150)}
    await frame.click('#pk',{force:true});
    for(let i=0;i<80;i++){if(await frame.$('.slot.pickable'))break;await page.waitForTimeout(150)}
    if(shots)await page.screenshot({path:`${shots}/c5-pack.png`});
    await (await frame.$$('.slot.pickable'))[0].click({force:true});
    for(let i=0;i<80;i++){const cut=await frame.$('.cutme');if(cut){await cut.click({force:true});await page.waitForTimeout(900);continue}const br=await frame.$('.branch');if(br){await br.click({force:true});await page.waitForTimeout(2000);continue}if(await frame.$('#home'))break;await page.waitForTimeout(200)}
    await frame.click('#home',{force:true});
    await page.waitForFunction(()=>!document.querySelector('#cardGameDay'),null,{timeout:10000});
    const meta=await page.evaluate(()=>window.DynastyCardGameDay.meta());
    assert.ok(meta&&meta.playbook&&meta.playbook.packsOpened===1,'the pack pick is saved in the dynasty');
    if(shots)await page.screenshot({path:`${shots}/c6-back.png`});
    assert.deepEqual(errors,[],'no console errors');
    console.log('ok  Coach with Cards plays the real game, records it, saves the playbook and returns to the dynasty');
  }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exit(1)});

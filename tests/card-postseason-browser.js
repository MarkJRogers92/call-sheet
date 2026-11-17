'use strict';
// Coached postseason in the browser: the Card Program offers the user's bowl, the battle plays on a neutral site, the
// final records through the bowl stage, leaving before the pack resumes the same battle without recording it again,
// and the pack is a Bowl Pack (on a win) opened exactly once.
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('playwright-core'),{chromiumPath}=require('./helpers/chromium-path'),{startNewDynasty}=require('./helpers/start-new-dynasty');
const shots=process.env.CARD_SHOTS||'';
async function reachPostseason(page){
  if(!await page.locator('#simSeason').isVisible())await page.click('#programDetails > summary');
  await page.click('#simSeason');await page.waitForFunction(()=>window.DynastyGameEngineV2LabBridge.cutoverDebug().phase==='confReady',{timeout:90000});
  await page.waitForFunction(()=>['saved','failed'].includes(window.DynastySessionStatus.read().state),null,{timeout:60000});
}
async function openFrame(page){
  const frame=await (await page.waitForSelector('#cardGameDay iframe',{timeout:10000})).contentFrame();
  await frame.waitForFunction(()=>window.__slice&&(document.querySelector('#gotIt')||window.__slice.req||document.querySelector('#openPack')),null,{timeout:30000});
  if(await frame.$('#gotIt'))await frame.click('#gotIt',{force:true});
  return frame;
}
(async()=>{
  const browser=await chromium.launch({executablePath:chromiumPath(),args:['--no-sandbox']});
  try{
    const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    await page.goto('file://'+path.join(__dirname,'..','index.html'));await startNewDynasty(page);
    await reachPostseason(page);
    await page.evaluate(()=>window.__DL_TEST__.v2PostseasonPrepare('bowl'));
    const start=await page.evaluate(()=>{const m=window.DynastyCardGameDay.meta();return{packs:m?.playbook?.packsOpened||0,games:m?.games||0}});
    await page.evaluate(()=>window.DynastyCardGameDay.paint());
    const coach=page.locator('#cardProgram [data-coach-post]');
    await coach.waitFor({timeout:10000});
    const label=(await coach.innerText()).replace(/^Coach the | with Cards$/g,'');
    assert.match(label,/ Bowl$/,`the card program offers the bowl: ${label}`);
    if(shots)await page.screenshot({path:`${shots}/p0-offer.png`});
    await page.evaluate(()=>{const launch=window.__callSheetDynasty.launch;window.__callSheetDynasty.launch=()=>{const cfg=launch();return{...cfg,settings:{...cfg.settings,mode:'snap',control:'offense'}}}});
    await coach.click();
    let frame=await openFrame(page);
    await frame.waitForFunction(()=>window.__slice.req&&!window.__slice.busy,null,{timeout:60000});
    const side=await frame.evaluate(()=>document.querySelector('#side')?.innerText||'');
    assert.ok(side.toLowerCase().includes(label.toLowerCase()),`the battle is labeled with the bowl: ${side.slice(0,120)}`);
    await frame.evaluate(()=>{document.getElementById('modal').classList.remove('on')});
    await frame.click('#bSim',{force:true});
    for(let i=0;i<500;i++){if(await frame.$('#openPack')||await frame.$('#retryRecord'))break;const f=await frame.$('#modal [data-o]');if(f)await f.click({force:true}).catch(()=>{});await page.waitForTimeout(150)}
    assert.equal(await frame.$('#retryRecord'),null,'the bowl records on the first try');
    const finalText=await frame.locator('#modal').innerText();
    assert.match(finalText,/SAVED TO YOUR SEASON/);
    const won=/VICTORY/.test(finalText);
    assert.match(finalText,won?/OPEN BOWL PACK|BREAKOUT/:/OPEN FILM STUDY PACK|BREAKOUT/);
    if(shots)await page.screenshot({path:`${shots}/p1-final.png`});
    const recorded=await page.evaluate(()=>{const me=window.__DL_TEST__.selected(),u=window.__DL_TEST__.universe?.()||null;return{phase:window.DynastyGameEngineV2LabBridge.cutoverDebug().phase,audit:window.__DL_TEST__.v2PostseasonAudit(),meId:me.id}});
    assert.equal(recorded.phase,'playoffReady','the bowl stage completed');
    assert.equal(recorded.audit.userV2,1,'one recorded user bowl');
    // Leave before opening the pack: the playoff waits, and Resume returns to the same recorded battle.
    await page.evaluate(()=>window.__callSheetDynasty.close());
    await page.evaluate(()=>window.DynastyCardGameDay.paint());
    assert.equal(await page.locator('#cardProgram [data-coach-cards]').innerText(),'Resume Battle');
    await page.evaluate(()=>document.querySelector('#simPlayoff')?.click());
    assert.equal(await page.evaluate(()=>window.DynastyGameEngineV2LabBridge.cutoverDebug().phase),'playoffReady','the playoff waits for the open battle');
    await page.locator('#cardProgram [data-coach-cards]').click();
    frame=await openFrame(page);
    await frame.waitForSelector('#openPack',{timeout:20000});
    assert.equal((await page.evaluate(()=>window.__DL_TEST__.v2PostseasonAudit())).userV2,1,'resuming does not record again');
    await frame.click('#openPack',{force:true});
    for(let i=0;i<60;i++){if(await frame.$('#pk'))break;const tp=await frame.$('#toPack');if(tp){await tp.click({force:true});await page.waitForTimeout(300);continue}await page.waitForTimeout(150)}
    // A breakout screen can come first; read the title that sits with the pack itself.
    const packTitle=await frame.evaluate(()=>document.querySelector('#pk')?.closest('.mwrap')?.querySelector('.big')?.textContent.trim()||'');
    assert.equal(packTitle,won?'BOWL PACK':'FILM STUDY PACK');
    await frame.click('#pk',{force:true});
    for(let i=0;i<80;i++){if(await frame.$('.slot.pickable'))break;await page.waitForTimeout(150)}
    const slots=(await frame.$$('.slot.pickable')).length;assert.equal(slots,won?5:3);
    if(shots)await page.screenshot({path:`${shots}/p2-pack.png`});
    await (await frame.$$('.slot.pickable'))[0].click({force:true});
    for(let i=0;i<80;i++){const cut=await frame.$('.cutme');if(cut){await cut.click({force:true}).catch(()=>{});await page.waitForTimeout(900);continue}const br=await frame.$('.branch:not(.locked)');if(br){await br.click({force:true}).catch(()=>{});await page.waitForTimeout(2000);continue}if(await frame.$('#home'))break;await page.waitForTimeout(200)}
    await frame.click('#home',{force:true});
    await page.waitForFunction(()=>!document.querySelector('#cardGameDay'),null,{timeout:10000});
    const meta=await page.evaluate(()=>window.DynastyCardGameDay.meta());
    assert.equal(meta.playbook.packsOpened,start.packs+1,'one pack from the bowl');assert.equal(meta.games,start.games+1);assert.equal(meta.activeBattle,null);assert.equal(meta.pendingPostseason,undefined);
    // With the battle closed, the classic playoff runs again.
    await page.evaluate(()=>document.querySelector('#simPlayoff')?.click());
    await page.waitForFunction(()=>window.DynastyGameEngineV2LabBridge.cutoverDebug().phase!=='playoffReady',null,{timeout:60000}).catch(()=>{});
    assert.notEqual(await page.evaluate(()=>window.DynastyGameEngineV2LabBridge.cutoverDebug().phase),'playoffReady','the playoff simulates once the battle is closed');
    // Phone width: the bowl offer fits.
    assert.deepEqual(errors,[],errors.join('\n'));
    console.log(`ok  coached ${label}: neutral-site battle, stage record, exact resume before the pack, ${won?'Bowl':'Film Study'} pack once`);
  }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exit(1)});

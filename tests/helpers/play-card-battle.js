'use strict';
// Plays an open Call Sheet card battle to the end through the page itself (no test hooks): skip the how-to, let the
// coordinators sim it, answer 4th-down choices, open the pack, take the first card, handle cuts/evolutions, go home.
async function finishPackChoice(frame,prefer='deck'){
  // Inspecting a face does not commit the reward. A second click explicitly chooses its destination.
  const options=frame.locator('#pkBtns [data-pack-destination]:enabled');
  await options.first().waitFor();
  if(await frame.evaluate(()=>!!window.__slice.b._packPicked))throw new Error('Inspecting a face must not consume the pack.');
  const preferred=frame.locator('#pkBtns [data-pack-destination="'+prefer+'"]:enabled');
  await (await preferred.count()?preferred:options.first()).click();
}
async function playCardBattle(page,{timeout=120000,stopAtFinal=false}={}){
  const frame=await (await page.waitForSelector('#cardGameDay iframe',{timeout:15000})).contentFrame();
  const until=Date.now()+timeout,tick=()=>page.waitForTimeout(150);
  await frame.waitForSelector('#gotIt, #sheetToggle:not([hidden]), #bSim, #openPack',{timeout:30000});
  if(await frame.$('#gotIt'))await frame.click('#gotIt',{force:true});
  if(!await frame.$('#openPack')){
    await frame.waitForSelector('#sheetToggle:not([hidden]), #bSim',{timeout:30000});
    if(!await frame.locator('#bSim').isVisible())await frame.click('#sheetToggle');
    await frame.evaluate(()=>{const m=document.getElementById('modal');if(m)m.classList.toggle('on',false)});
    await frame.click('#bSim',{force:true});
  }
  while(Date.now()<until&&!await frame.$('#openPack')){
    if(await frame.$('#retryRecord'))throw new Error('The card battle result was not saved.');
    const f=await frame.$('#modal [data-o]');if(f)await f.click({force:true}).catch(()=>{});await tick();
  }
  if(stopAtFinal)return frame;
  await frame.click('#openPack',{force:true});
  while(Date.now()<until&&!await frame.$('#pk')){const skip=await frame.$('#boSkip');if(skip){await skip.click({force:true}).catch(()=>{});continue}const tp=await frame.$('#toPack');if(tp)await tp.click({force:true}).catch(()=>{});await tick()}
  await frame.click('#pk',{force:true});
  while(Date.now()<until&&!await frame.$('.slot.pickable'))await tick();
  await (await frame.$$('.slot.pickable'))[0].click({force:true});await finishPackChoice(frame);
  while(Date.now()<until){
    const cut=await frame.$('.cutme');if(cut){await cut.click({force:true}).catch(()=>{});await page.waitForTimeout(900);continue}
    const br=await frame.$('.branch:not(.locked)');if(br){await br.click({force:true}).catch(()=>{});await page.waitForTimeout(2000);continue}
    if(await frame.$('#home'))break;await page.waitForTimeout(200);
  }
  await frame.click('#home',{force:true});
  await page.waitForFunction(()=>!document.querySelector('#cardGameDay'),null,{timeout:15000});
}
module.exports={playCardBattle,finishPackChoice};

'use strict';
// The Card Program panel's new controls in the real page: reward packs open into the collection, the install focus
// saves, the era and albums are shown, and it all fits on a phone.
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('playwright-core'),{chromiumPath}=require('./helpers/chromium-path'),{startNewDynasty}=require('./helpers/start-new-dynasty');
const shots=process.env.CARD_SHOTS||'';
(async()=>{
  const browser=await chromium.launch({executablePath:chromiumPath(),args:['--no-sandbox']});
  try{
    for(const view of [{name:'desktop',width:1400,height:900},{name:'phone',width:390,height:844}]){
      const page=await browser.newPage({viewport:{width:view.width,height:view.height}}),errors=[];
      page.on('pageerror',e=>errors.push(String(e)));
      await page.goto('file://'+path.join(__dirname,'..','index.html'));await startNewDynasty(page);
      await page.evaluate(()=>{const cg=window.DynastyCardGameDay;cg.enable();const u=window.__DL_TEST__.selected();u.fan_support=90;cg.rewards.booster(new Date().getFullYear()+50,6);cg.paint()});
      assert.equal(await page.locator('#dashboard #cardProgram').count(),0);
      const route=view.name==='desktop'?'#clientRail':'.client-mobile-nav';
      await page.locator(route+' [data-client-tab="deckroom"]').click();
      const room=page.locator('#deckroom.active');await room.waitFor();
      await room.locator('[data-card-fold="training"] > summary').click();
      assert.match(await room.innerText(),/ Era · /i,'the season era is shown');
      await room.locator('[data-card-deck]').click();await page.click('#deckEditor [data-more-options] > summary');await page.selectOption('#openingScript','screen');
      await page.click('#deckEditor [data-cancel]');
      assert.equal(await page.evaluate(()=>window.DynastyCardGameDay.meta().playbook.off.openingScript||''),'','Cancel discards changes');
      await room.locator('[data-card-deck]').click();await page.click('#deckEditor [data-more-options] > summary');await page.selectOption('#openingScript','screen');await page.click('#deckEditor [data-save]');
      assert.match(await room.innerText(),/Opening script: RB Screen/);
      if(view.name==='desktop')await page.click('#clientRail [data-client-tab="collection"]');
      else {await page.click('.client-mobile-nav [data-client-more]');await page.click('#clientRail [data-client-tab="collection"]')}
      const panel=page.locator('#collection.active #cardBinder');await panel.waitFor();
      assert.ok(await panel.locator('.cpn-pile [data-face]').count()>0,'the binder contains real owned cards');
      assert.equal(await panel.locator('.cpn-pile').count(),2,'one owned pool for each side');
      assert.equal(await page.locator('#clientRail [data-client-tab="collection"]').getAttribute('aria-current'),'page');
      const open=panel.locator('[data-reward-pack]');assert.match(await open.innerText(),/Open Booster Pack/);
      assert.match(await panel.locator('.cpn-albums summary').innerText(),/Albums · \d+\/\d+ complete/);
      // The Ring of Honor binder shows graduated players' career cards.
      await page.evaluate(()=>{const g=window.DynastyCardGameDay;g.addRingForTest?.({playerId:'gr-1',name:'Test Legend',number:12,pos:'QB',archetype:'Field Architect',career:'3 seasons · 7,412 pass yds · 61 TD',exit:'graduated',year:2026});g.paint()});
      if(await page.locator('#cardBinder .cpn-ring').count()){assert.match(await page.locator('#cardBinder .cpn-ring summary').innerText(),/Ring of Honor binder · 1/);await page.locator('#cardBinder .cpn-ring summary').click();assert.match(await page.locator('#cardBinder .cpn-ring .cs-ring').innerText(),/Test Legend[\s\S]*7,412 pass yds/)}
      else assert.fail('the Ring of Honor binder did not render');
      if(shots)await panel.screenshot({path:`${shots}/program-${view.name}.png`});
      await open.click();
      const dialog=page.locator('#rewardPack');await dialog.waitFor();
      // The pack comes wrapped: rip it open, then the card faces appear.
      assert.equal(await dialog.locator('[data-take]').first().isVisible(),false,'cards stay hidden until the pack is opened');
      await dialog.locator('[data-rip]').click({force:true});await dialog.locator('.rp-cards .cs-face').first().waitFor();
      const cards=await dialog.locator('[data-take]').count();assert.equal(cards,4,'a big booster drive opens four cards');
      const overflow=await page.evaluate(()=>{const d=document.querySelector('#rewardPack').getBoundingClientRect();return d.right>window.innerWidth+1||d.left<-1});
      assert.equal(overflow,false,'the pack fits the screen');
      if(shots)await page.screenshot({path:`${shots}/reward-${view.name}.png`});
      const pick=await dialog.locator('[data-take]').first().getAttribute('data-take');
      await dialog.locator('[data-take]').first().click();await dialog.waitFor({state:'detached'});
      const meta=await page.evaluate(()=>window.DynastyCardGameDay.meta());
      assert.equal(meta.rewardPacks.length,0);
      assert.ok([...meta.playbook.reserve.off.wrinkles,...meta.playbook.reserve.off.tactics,...meta.playbook.reserve.def.wrinkles,...meta.playbook.reserve.def.tactics].includes(pick),'the pick is in the collection');
      assert.equal(await page.locator('#cardBinder [data-reward-pack]').count(),0);
      assert.ok(await panel.locator(`.cpn-pile [data-face="${pick}"]`).count()>0,'the picked card is immediately in the binder');
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1),false,'collection fits the screen');
      await panel.locator('[data-card-deck]').click();assert.ok(await page.locator('#deckEditor').isVisible());
      await page.click('#deckEditor [data-cancel]');assert.ok(await panel.isVisible(),'closing the editor returns to the collection');
      assert.ok(await panel.locator('[data-card-deck]').evaluate(el=>el===document.activeElement),'focus returns to the collection launcher');
      await page.locator(route+' [data-client-tab="deckroom"]').click();
      assert.match(await room.innerText(),/Opening script: RB Screen/);
      const install=page.locator('#cardProgram [data-install]');
      if(await install.count()){const value=await install.locator('option').nth(1).getAttribute('value');await install.selectOption(value);
        assert.equal(await page.evaluate(()=>window.DynastyCardGameDay.meta().installFocus),value,'the install focus saves')}
      const wide=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);assert.equal(wide,false,`no horizontal scroll on ${view.name}`);
      assert.deepEqual(errors,[],errors.join('\n'));
      await page.close();
    }
    console.log('ok  Card Program: reward packs, install focus, era and albums on desktop and phone');
  }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exit(1)});

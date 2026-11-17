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
      const panel=page.locator('#cardProgram');await panel.waitFor();
      const open=panel.locator('[data-reward-pack]');assert.match(await open.innerText(),/Open Booster Pack/);
      assert.match(await panel.innerText(),/ Era · /i,'the season era is shown');
      assert.match(await panel.locator('.cpn-albums summary').innerText(),/Albums · \d+\/\d+ complete/);
      // The Ring of Honor binder shows graduated players' career cards.
      await page.evaluate(()=>{const g=window.DynastyCardGameDay;g.addRingForTest?.({playerId:'gr-1',name:'Test Legend',number:12,pos:'QB',archetype:'Field Architect',career:'3 seasons · 7,412 pass yds · 61 TD',exit:'graduated',year:2026});g.paint()});
      if(await page.locator('#cardProgram .cpn-ring').count()){assert.match(await page.locator('#cardProgram .cpn-ring summary').innerText(),/Ring of Honor binder · 1/);await page.locator('#cardProgram .cpn-ring summary').click();assert.match(await page.locator('#cardProgram .cs-ring').innerText(),/Test Legend[\s\S]*7,412 pass yds/)}
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
      assert.equal(await page.locator('#cardProgram [data-reward-pack]').count(),0);
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

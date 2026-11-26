const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const {chromiumPath}=require('./helpers/chromium-path');

const expectedVersion = 'v' + fs.readFileSync(path.join(__dirname, '..', 'VERSION.txt'), 'utf8').trim().replace(/^v/, '');

(async()=>{
  const browser = await chromium.launch({
    executablePath:chromiumPath(),
    args: ['--no-sandbox']
  });

  try{
    for(const [label,viewport] of [['desktop',{width:1280,height:900}],['iphone',{width:390,height:844}]]){
      const page = await browser.newPage({viewport});
      const errors=[];
      page.on('console',message=>{if(message.type()==='error')errors.push(message.text())});
      page.on('pageerror',error=>errors.push(String(error)));

      await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
      await page.waitForFunction(()=>document.querySelector('#titleTeam')?.options.length>0,null,{timeout:60000});

      assert.equal(await page.locator('#titleGameName').textContent(),'Call Sheet',`[${label}] Call Sheet title`);
      assert.equal(await page.locator('#titleContinue').isHidden(),true,`[${label}] empty save slots offer New Dynasty`);
      const battle=page.locator('#titleQuickBattle');
      await battle.click();
      const quick=page.frameLocator('#quickBattleHost iframe');
      await quick.locator('[data-team]').first().waitFor();
      assert.match(await quick.locator('#modal').innerText(),/Quick Battle/i);
      await page.getByRole('button',{name:'Back to Title',exact:true}).click();
      assert.equal(await page.evaluate(()=>document.activeElement.id),'titleQuickBattle',`[${label}] Quick Battle restores focus`);
      await page.locator('#titleDriveChallenges').click();
      const challenges=page.frameLocator('#driveChallengeHost iframe');
      await challenges.getByRole('heading',{name:'Drive Challenges'}).waitFor();
      assert.equal(await challenges.locator('#beginChallengeRun').isVisible(),true,`[${label}] three-drive run is available`);
      await challenges.getByRole('button',{name:'Back to Title',exact:true}).click();
      assert.equal(await page.evaluate(()=>document.activeElement.id),'titleDriveChallenges',`[${label}] challenge menu returns to title`);

      assert.equal(await page.locator('#titleAbout').isVisible(),true,`[${label}] About entry is visible`);
      await page.click('#titleAbout');
      assert.equal(await page.locator('#titleAboutPanel').isVisible(),true,`[${label}] About panel opens`);
      assert.equal((await page.textContent('[data-about-version]')).trim(),expectedVersion,`[${label}] About shows current version`);
      assert.match(await page.textContent('#titleAboutPanel'),/college football card battler/i,`[${label}] About identifies the game`);
      assert.match(await page.textContent('#titleAboutPanel'),/Browser slots \+ complete exports/i,`[${label}] About explains save model`);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`[${label}] About does not overflow viewport`);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('#titleMainMenu').isVisible(),true,`[${label}] About returns to main menu`);
      assert.equal(await page.evaluate(()=>document.activeElement.id),'titleAbout',`[${label}] Escape restores focus`);

      await page.click('#titleOptions');
      assert.equal(await page.locator('#titleOptionsPanel').isVisible(),true,`[${label}] Options panel opens`);
      assert.equal((await page.textContent('#titleOptionsHeading')).trim(),'Game & Presentation',`[${label}] Options has clear heading`);
      assert.deepEqual(await page.$$eval('#titleWatchSpeed option',options=>options.map(o=>[o.textContent.trim(),o.value])),[['Slow','1400'],['Normal','850'],['Fast','400']],`[${label}] Watch pace choices preserved`);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`[${label}] Options does not overflow viewport`);

      await page.selectOption('#titleWatchSpeed','400');
      await page.evaluate(()=>{document.querySelector('#titleMotion').checked=false});
      await page.click('#titleSaveOptions');
      await page.waitForFunction(()=>!document.querySelector('#titleMainMenu').hidden);
      const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('dynastyLabPreferences')));
      assert.deepEqual(saved,{motion:false,watchSpeed:'400'},`[${label}] Options persist on this device`);

      await page.click('#titleOptions');
      assert.equal(await page.$eval('#titleWatchSpeed',el=>el.value),'400',`[${label}] saved Watch pace is restored`);
      assert.equal(await page.$eval('#titleMotion',el=>el.checked),false,`[${label}] saved motion preference is restored`);
      await page.click('#titleResetOptions');
      assert.equal(await page.$eval('#titleWatchSpeed',el=>el.value),'850',`[${label}] Restore Defaults returns Watch pace to Normal`);
      const expectedMotion=await page.evaluate(()=>!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
      assert.equal(await page.$eval('#titleMotion',el=>el.checked),expectedMotion,`[${label}] Restore Defaults follows device motion preference`);
      const beforeSave=await page.evaluate(()=>JSON.parse(localStorage.getItem('dynastyLabPreferences')));
      assert.deepEqual(beforeSave,{motion:false,watchSpeed:'400'},`[${label}] Restore Defaults waits for explicit save`);
      await page.click('#titleSaveOptions');

      assert.deepEqual(errors,[],`[${label}] title menus produce no console/page errors`);
      await page.close();
      console.log(`PASS ${label} Call Sheet title, Quick Battle, Drive Challenges, Options and About`);
    }
  } finally {
    await browser.close();
  }
})().catch(error=>{console.error(error);process.exit(1)});

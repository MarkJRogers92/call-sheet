'use strict';
// Cards everywhere in the dynasty: the roster is a card grid by default (table one click away), Roles & Depth shows the
// card lineup, Recruiting shows prospect cards from your scouting, Staff shows coach cards, the matchup shows the
// opponent's players to beat, and the newsletter carries card moments. Desktop and phone.
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('playwright-core'),{chromiumPath}=require('./helpers/chromium-path'),{startNewDynasty}=require('./helpers/start-new-dynasty');
const shots=process.env.CARD_SHOTS||'';
// Phone layouts keep the nav in a drawer, so navigate the way its own click handler does.
const go=async(page,tab)=>{await page.evaluate(t=>document.querySelector(`[data-client-tab="${t}"]`)?.click(),tab);await page.waitForTimeout(300)};
(async()=>{
  const browser=await chromium.launch({executablePath:chromiumPath(),args:['--no-sandbox']});
  try{
    for(const view of [{name:'desktop',width:1400,height:900},{name:'phone',width:390,height:844}]){
      const page=await browser.newPage({viewport:{width:view.width,height:view.height}}),errors=[];
      page.on('pageerror',e=>errors.push(String(e)));
      await page.goto('file://'+path.join(__dirname,'..','index.html'));await startNewDynasty(page,{cardGame:true});
      const rosterSize=await page.evaluate(()=>window.__DL_TEST__.selected().roster.length);
      // The matchup shows their four best starters, and This Week shows the Saturday rundown + singleton Game Day guard.
      assert.equal(await page.locator('#broadcastFeature #matchupCards .cs-mini').count(),4,'players to beat on the matchup');
      assert.equal(await page.locator('#cardDeskLink .cpn-rundown-cell').count(),4,'Saturday rundown renders 4 cells');
      while(await page.locator('#weeklyDecisions [data-decision]').count())await page.locator('#weeklyDecisions [data-decision]').first().click();
      await page.evaluate(()=>{window.DynastyCardGameDay.open();window.DynastyCardGameDay.open()});
      assert.equal(await page.locator('#cardGameDay').count(),1,'opening Game Day twice keeps a single overlay');
      await page.evaluate(()=>{document.getElementById('cardGameDay')?.remove();document.body.classList.remove('cs-open')});
      // Roster: cards by default, every player, opens his profile; the table is one click away.
      await go(page,'roster');
      await page.locator('#rosterCards .cs-mini').first().waitFor();
      assert.equal(await page.locator('#rosterCards .cs-mini').count(),rosterSize,'a card for every player');
      assert.equal(await page.locator('#roster .table-wrap').isHidden(),true);assert.equal(await page.locator('#rosterPositionBoard').isHidden(),true);
      if(shots)await page.screenshot({path:`${shots}/pages-roster-${view.name}.png`});
      await page.locator('#rosterCards .cs-mini').first().click();
      await page.locator('#playerBattleCard').waitFor({timeout:10000});
      await page.keyboard.press('Escape');await page.waitForTimeout(200);
      // Card mode shows no classic roster view at all; turning card mode off brings the Classic toggle back.
      assert.equal(await page.locator('#rosterViewToggle').isHidden(),true,'no classic roster option in card mode');
      await page.evaluate(()=>{window.DynastyCardGameDay.setIntegration('cards-default',false);window.__DL_TEST__.goToTab('roster')});await page.waitForTimeout(300);
      await page.locator('#rosterViewToggle [data-roster-view="classic"]').click();
      assert.equal(await page.locator('#rosterPositionBoard').isVisible(),true,'Classic shows Dynasty Lab’s own roster board');assert.equal(await page.locator('#rosterCards').isHidden(),true);
      assert.equal(await page.evaluate(()=>window.DynastyCardGameDay.meta().rosterView),'classic','the view choice saves');
      await page.evaluate(()=>{window.DynastyCardGameDay.setIntegration('cards-default',true);window.__DL_TEST__.goToTab('roster')});await page.waitForTimeout(300);
      assert.equal(await page.locator('#rosterCards').isVisible(),true,'card mode always shows the cards');
      // Roles & Depth: the 22-man card lineup.
      await go(page,'depth');await page.locator('#depthCards .cs-mini').first().waitFor();
      assert.equal(await page.locator('#depthCards .cs-mini').count(),22);
      // Recruiting: prospect cards show a range from scouting, never a single hidden number unless fully scouted.
      await go(page,'recruiting');await page.locator('#prospectCards .cs-mini').first().waitFor();
      const ranges=await page.locator('#prospectCards .cs-mini-ovr').allInnerTexts();
      assert.ok(ranges.length>0&&ranges.some(t=>t.includes('–')),'prospect cards show scouting ranges');
      if(shots)await page.screenshot({path:`${shots}/pages-recruiting-${view.name}.png`});
      await page.locator('#prospectCards [data-card-recruit]').filter({hasText:/quarterback|running back|receiver|tight end|tackle|corner|linebacker|safety/i}).first().click();
      const jobs=page.locator('#recruitBattleCard [data-prospect-jobs] li');
      await jobs.first().waitFor();
      assert.ok((await jobs.allTextContents()).every(t=>/Projected \d+–\d+\/99/.test(t)),'each assignment carries its scouting range');
      await page.keyboard.press('Escape');
      // Staff: coach cards explain their battle effects.
      await go(page,'staff');await page.locator('#staffCards .cs-coach article').first().waitFor();
      assert.match(await page.locator('#staffCards').innerText(),/Command/);
      const wide=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);assert.equal(wide,false,`no horizontal scroll on ${view.name}`);
      assert.deepEqual(errors,[],errors.join('\n'));
      await page.close();
    }
    const battlePage=await browser.newPage({viewport:{width:390,height:844}});
    await battlePage.goto('file://'+path.join(__dirname,'..','forks/call-sheet/slice/index.html'));
    const challengeHit=await battlePage.evaluate(()=>{
      const btn=document.getElementById('driveChallenges');
      if(!btn)return false;
      const r=btn.getBoundingClientRect(),hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);
      return hit===btn||btn.contains(hit);
    });
    assert.equal(challengeHit,true,'Drive Challenges button is hit-targetable on title screen');
    await battlePage.close();
    console.log('ok  cards across the dynasty: matchup, roster cards/classic, card lineup, prospect cards, coach cards (desktop and phone)');
  }finally{await browser.close()}
})().catch(err=>{console.error(err);process.exit(1)});

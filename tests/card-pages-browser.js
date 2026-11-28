'use strict';
// Cards everywhere in the dynasty: the roster is a card grid by default (table one click away), Roles & Depth shows the
// card lineup, Recruiting shows prospect cards from your scouting, Staff shows coach cards, the matchup shows the
// opponent's players to beat, and the newsletter carries card moments. Desktop and phone.
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require('playwright-core'),{chromiumPath}=require('./helpers/chromium-path'),{startNewDynasty}=require('./helpers/start-new-dynasty');
const {finishPackChoice,playCardBattle}=require('./helpers/play-card-battle');
const shots=process.env.CARD_SHOTS||'';
async function go(page,tab){
  const shortcut=page.locator(`.client-mobile-nav [data-client-tab="${tab}"]`);
  if(await shortcut.isVisible())await shortcut.click();
  else{
    const more=page.locator('.client-mobile-nav [data-client-more]');
    if(await more.isVisible())await more.click();
    await page.locator(`#clientRail [data-client-tab="${tab}"]`).click();
  }
  await page.locator(`#${tab}.active`).waitFor();
}

async function playWeek(page){
  await go(page,'dashboard');
  const week=await page.evaluate(()=>window.__DL_TEST__.preseasonDebug().week);
  const rundown=page.locator('#cardDeskLink');
  await rundown.locator('[data-card-dynasty-tab="recruiting"]').click();
  const prospects=page.locator('#prospectCards [data-card-recruit]');
  await prospects.first().waitFor();
  const guest=await prospects.evaluateAll(cards=>{
    const actions=window.DynastyRecruitingActions,desk=window.DynastyRecruitingDesk,team=desk.team();
    return cards.map(card=>card.dataset.cardRecruit).find(id=>{
      const recruit=desk.recruit(id),date=actions.visitDates(team,recruit)[0];
      return date&&actions.availability(recruit,team,'visit',{visitWeek:date.week}).ok;
    });
  });
  assert.ok(guest,'one visible prospect is eligible for an upcoming home visit');
  await page.locator(`#prospectCards [data-card-recruit="${guest}"]`).click();
  const planner=page.locator('#recruitDialog .ra-weekend');
  await planner.locator('summary').click();
  const date=Number(await planner.locator('[data-ra-visit-date]').inputValue());
  await planner.locator('[data-ra-visit-focus]').selectOption('early_role');
  await planner.locator('[data-ra-action="plan-weekend"]').click();
  const visit=await page.evaluate(id=>{
    const desk=window.DynastyRecruitingDesk;
    return window.DynastyRecruitingActions.visitWeekend(desk.recruit(id),desk.team());
  },guest);
  assert.equal(visit.week,date);
  assert.equal(visit.focus,'early_role');
  await page.keyboard.press('Escape');
  await go(page,'dashboard');
  if(date===week+1)assert.match(await rundown.innerText(),/1 priority guest this week/);
  const deckRoom=rundown.locator('[data-card-dynasty-tab="deckroom"]');
  assert.ok(await deckRoom.evaluate(button=>button.compareDocumentPosition(button.parentElement.querySelector('.cpn-rundown'))&Node.DOCUMENT_POSITION_FOLLOWING),
    'Deck Room precedes the Saturday rundown');
  await deckRoom.click();
  await page.locator('#cardProgram [data-card-deck]').first().click();
  const editor=page.locator('#deckEditor'),cross=editor.locator('[data-owned-card="deep_cross"]');
  await cross.locator('[data-move="remove"]').click();
  assert.match(await cross.locator('[data-copy-count]').innerText(),/1 of 2 in deck/i);
  await editor.locator('[data-save]').click();
  const meta=()=>page.evaluate(()=>window.DynastyCardGameDay.meta());
  assert.ok((await meta()).playbook.reserve.off.wrinkles.includes('deep_cross'));

  await go(page,'dashboard');
  while(await page.locator('#weeklyDecisions [data-decision]').count())await page.locator('#weeklyDecisions [data-decision]').first().click();
  await page.evaluate(()=>{
    const host=window.__callSheetDynasty,launch=host.launch;
    host.launch=()=>{const cfg=launch();return{...cfg,seenHelp:true,settings:{...cfg.settings,mode:'snap',guidedDrivePending:false,fast:true}}};
  });
  await page.locator('#broadcastFeature [data-coach-cards]').click();
  await page.evaluate(()=>window.DynastyCardGameDay.open());
  assert.equal(await page.locator('#cardGameDay').count(),1,'opening Game Day twice keeps a single overlay');
  const frame=await playCardBattle(page,{stopAtFinal:true});
  assert.match(await frame.locator('#modal').innerText(),/SAVED TO YOUR SEASON/);
  assert.equal(await frame.evaluate(()=>{
    const b=window.__slice.b;
    return b.decks[b.user].off.wrinkles.filter(id=>id==='deep_cross').length;
  }),1,'the scheduled game used the saved deck');
  await frame.locator('#openPack').click();
  await frame.locator('#pk, #boSkip, #toPack').first().waitFor();
  if(await frame.locator('#boSkip').isVisible())await frame.locator('#boSkip').click();
  if(!await frame.locator('#pk').isVisible())await frame.locator('#toPack').click();
  await frame.locator('#pk').click();
  await frame.locator('.slot.pickable').first().click();
  await finishPackChoice(frame,'collection');
  const review=frame.locator('[data-review-turning-film]');
  const evolve=frame.locator('.branch:not(.locked)');
  while(!await review.isVisible()){
    await frame.locator('.branch:not(.locked), [data-review-turning-film]').first().waitFor();
    if(await evolve.first().isVisible()){
      const choice=await evolve.first().getAttribute('data-b');
      await evolve.first().click();
      await frame.locator(`.branch[data-b="${choice}"]`).waitFor({state:'detached'});
    }
  }
  await review.click();
  const film=page.locator('#deckroom #turningPointFilm');
  await film.waitFor();
  assert.ok(await film.evaluate(el=>{
    const bounds=el.getBoundingClientRect();
    return el===document.activeElement&&bounds.left>=-1&&bounds.right<=innerWidth+1;
  }),'drive film receives focus and fits the viewport');
  const afterGame=await meta();
  assert.equal(afterGame.playbook.packsOpened,1);
  assert.equal(afterGame.games,1);
  assert.equal(afterGame.lastTurningPoints.week,week+1);
  assert.equal(await film.locator('li').count(),afterGame.lastTurningPoints.points.length);
  const train=film.locator('[data-train-turning-card]:enabled').first();
  const root=await train.getAttribute('data-train-turning-card');
  const reps=afterGame.playbook.mastery[root]||0;
  await train.click();
  const scheduled=await meta();
  assert.equal(scheduled.installFocus,root);
  assert.equal(scheduled.playbook.mastery[root]||0,reps,'planning practice does not grant the reps yet');
  await go(page,'dashboard');
  while(await page.locator('#weeklyDecisions [data-decision]').count())await page.locator('#weeklyDecisions [data-decision]').first().click();
  await page.locator('#hubAdvance').click();
  await page.waitForFunction(previous=>window.__DL_TEST__.preseasonDebug().week===previous+1,week,{timeout:30000});
  await page.waitForFunction(({root,reps})=>window.DynastyCardGameDay.meta().playbook.mastery[root]===reps+6,{root,reps},{timeout:30000});
  assert.equal((await meta()).games,1,'advancing past a recorded game does not play it twice');
}

(async()=>{
  const browser=await chromium.launch({executablePath:chromiumPath(),args:['--no-sandbox']});
  try{
    for(const view of [{name:'desktop',width:1400,height:900},{name:'phone',width:390,height:844}]){
      const page=await browser.newPage({viewport:{width:view.width,height:view.height},reducedMotion:'reduce'}),errors=[];
      page.on('pageerror',e=>errors.push(String(e)));
      await page.goto('file://'+path.join(__dirname,'..','index.html'));await startNewDynasty(page,{cardGame:true});
      const rosterSize=await page.evaluate(()=>window.__DL_TEST__.selected().roster.length);
      // The matchup shows their four best starters, and This Week shows the Saturday rundown + singleton Game Day guard.
      assert.equal(await page.locator('#broadcastFeature #matchupCards .cs-mini').count(),4,'players to beat on the matchup');
      assert.equal(await page.locator('#cardDeskLink .cpn-rundown-cell').count(),4,'Saturday rundown renders 4 cells');
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
      await playWeek(page);
      console.log(`ok  Dynasty week (${view.name}): booked recruit, saved deck, recorded game, opened pack and applied film-driven mastery`);
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

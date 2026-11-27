const assert = require('assert/strict');
const path = require('path');
const {chromium} = require('playwright-core');
const {chromiumPath}=require('./helpers/chromium-path');

(async () => {
  const browser = await chromium.launch({
    executablePath:chromiumPath(),
    args: ['--no-sandbox'],
  });
  const page = await browser.newPage({viewport: {width: 1440, height: 960}});
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });

  try {
    await page.goto(`file://${path.join(__dirname, '..', 'index.html')}`);
    await page.waitForFunction(() => document.querySelector('#titleTeam')?.options.length === 120,
      {timeout: 60000});
    await page.click('#titleNew');
    await page.locator('#dynastySetup').waitFor({state: 'visible'});
    assert.equal(await page.locator('.setup-progress-step').count(), 7,
      'setup exposes seven focused screens');
    assert.match(await page.locator('#setupHeading').innerText(), /Take the Job/i);

    await page.click('#setupContinue');
    assert.match(await page.locator('#setupHeading').innerText(), /Put your name on the office/i);
    assert.equal(await page.locator('#setupContinue').isDisabled(), true,
      'coach identity is required');
    await page.fill('#setupCoachName', 'Jordan Rivers');
    assert.equal(await page.locator('#setupContinue').isEnabled(), true);
    await page.reload();
    await page.locator('#dynastySetup').waitFor({state: 'visible', timeout: 30000});
    assert.equal(await page.locator('#setupCoachName').inputValue(), 'Jordan Rivers',
      'an active setup draft recovers after refresh');

    await page.click('#setupContinue');
    assert.match(await page.locator('#setupHeading').innerText(), /Choose the program/i);
    assert.equal(await page.locator('.setup-program-row').count(), 120,
      'all programs are available');
    await page.fill('#setupProgramSearch', 'Lake Erie');
    assert.equal(await page.locator('.setup-program-row').count(), 1,
      'program search narrows the real program catalog');
    await page.click('[data-setup-program="Lake Erie University"]');

    await page.click('#setupContinue');
    assert.match(await page.locator('#setupHeading').innerText(), /Set the program identity/i);
    await page.click('label:has([data-setup-field="offScheme"][value="Tempo Spread"])');
    await page.click('label:has([data-setup-field="defScheme"][value="Pressure Multiple"])');
    await page.click('label:has([data-setup-field="trainingFocus"][value="Fundamentals"])');

    await page.click('#setupContinue');
    assert.match(await page.locator('#setupHeading').innerText(), /Configure the world/i);
    assert.match(await page.locator('#setupContent').innerText(), /120 fictional programs/i);
    assert.match(await page.locator('#setupContent').innerText(), /Not exposed yet/i);
    await page.click('label:has([data-setup-field="mode"][value="commissioner"])');
    const scenario = id => page.locator(`[data-setup-field="scenario"][value="${id}"]`);
    const chooseScenario = id => page.click(`label:has([data-setup-field="scenario"][value="${id}"])`);
    assert.equal(await scenario('standard').isChecked(), true, 'ordinary preseason is the default');
    await chooseScenario('next-man-up');
    await page.reload();
    await page.locator('#dynastySetup').waitFor({state: 'visible'});
    assert.equal(await scenario('next-man-up').isChecked(), true, 'scenario selection survives draft recovery');
    await page.click('#setupContinue');
    await page.locator('#setupContinue:enabled').waitFor({timeout: 60000});
    const injuryStart = await page.evaluate(() => {
      const api = window.__DL_TEST__, {setup} = api.setupDebug(), team = api.selected();
      const injured = team.roster.find(player => player.id === setup.scenarioPlayerId);
      const backup = team.roleDepth.QB1.map(id => team.roster.find(player => player.id === id))
        .find(player => player && !player.injuryWeeks && !player.redshirtActive);
      return {scenario: setup.scenario, injury: injured?.injury, weeks: injured?.injuryWeeks,
        pos: injured?.pos, starter: injured?.name, backup: backup?.name};
    });
    assert.deepEqual({scenario: injuryStart.scenario, injury: injuryStart.injury, weeks: injuryStart.weeks, pos: injuryStart.pos},
      {scenario: 'next-man-up', injury: 'Shoulder sprain', weeks: 3, pos: 'QB'},
      'Next Man Up uses the inherited roster and native injury state');
    const injuryBrief = await page.locator('.setup-note').innerText();
    assert.ok(injuryStart.starter && injuryBrief.includes(injuryStart.starter));
    assert.ok(injuryStart.backup && injuryBrief.includes(injuryStart.backup));

    await page.click('#setupBack');
    await chooseScenario('conference-crown');

    await page.click('#setupContinue');
    await page.waitForFunction(() => !document.querySelector('#setupContinue')?.disabled,
      {timeout: 60000});
    assert.match(await page.locator('#setupHeading').innerText(), /What You Inherited/i);
    const briefing = await page.locator('#setupContent').innerText();
    assert.match(briefing, /Lake Erie University/i);
    assert.match(briefing, /Conference Crown/i);
    assert.match(briefing, /Roster & scholarships/i);
    assert.match(briefing, /first 30 days/i);
    const crownStart = await page.evaluate(name => {
      const team = window.__DL_TEST__.selected();
      const formerQb = team.roster.find(player => player.name === name);
      return {goals: team.seasonGoals.filter(goal => goal.type === 'conferenceTitle').map(goal => goal.weight),
        formerQb: formerQb?.name, priorInjury: formerQb?.injuryWeeks || 0};
    }, injuryStart.starter);
    assert.deepEqual(crownStart.goals, ['Important'], 'the board evaluates one native conference title goal');
    assert.equal(crownStart.formerQb, injuryStart.starter, 'switching scenarios regenerates from the same seed');
    assert.equal(crownStart.priorInjury, 0, 'the old scenario injury does not leak into the new candidate');

    await page.click('#setupContinue');
    assert.match(await page.locator('#setupHeading').innerText(), /Accept the contract/i);
    assert.match(await page.locator('#setupContent').innerText(), /Jordan Rivers/i);
    assert.match(await page.locator('#setupContent').innerText(), /Tempo Spread/i);
    assert.match(await page.locator('#setupContent').innerText(), /Pressure Multiple/i);
    assert.match(await page.locator('#setupContent').innerText(), /Fundamentals/i);
    await page.click('#setupContinue');
    await page.locator('#app').waitFor({state: 'visible', timeout: 60000});

    const state = await page.evaluate(() => ({
      phase: window.__DL_TEST__.preseasonDebug().phase,
      setup: window.__DL_TEST__.setupDebug(),
    }));
    assert.equal(state.phase, 'preseason', 'the accepted job opens at the true preseason boundary');
    assert.equal(state.setup.saveCount, 1, 'acceptance creates exactly one save');
    assert.deepEqual({
      completed: state.setup.setup.completed,
      coachName: state.setup.setup.coachName,
      programName: state.setup.setup.programName,
      offScheme: state.setup.setup.offScheme,
      defScheme: state.setup.setup.defScheme,
      trainingFocus: state.setup.setup.trainingFocus,
      mode: state.setup.setup.mode,
      scenario: state.setup.setup.scenario,
    }, {
      completed: true,
      coachName: 'Jordan Rivers',
      programName: 'Lake Erie University',
      offScheme: 'Tempo Spread',
      defScheme: 'Pressure Multiple',
      trainingFocus: 'Fundamentals',
      mode: 'commissioner',
      scenario: 'conference-crown',
    }, 'the accepted contract writes every supported setup choice');
    assert.equal(await page.evaluate(() => localStorage.getItem('dynastyLabNewDynastySetupV1')), null,
      'the completed draft is cleared only after the save succeeds');

    await page.reload();
    await page.waitForFunction(() => !document.querySelector('#titleContinue')?.disabled,
      {timeout: 60000});
    assert.equal(await page.locator('#dynastySetup').isHidden(), true,
      'completed and migrated saves bypass setup');
    await page.click('#titleContinue');
    await page.locator('#app').waitFor({state: 'visible'});
    assert.match(await page.locator('#teamName').innerText(), /Lake Erie University/i);
    assert.equal(await page.evaluate(() => window.__DL_TEST__.setupDebug().setup.scenario), 'conference-crown');
    assert.match(await page.locator('#seasonGoalsDashboard').innerText(), /Win the conference championship/i);

    await page.evaluate(() => document.querySelector('#newUniverse').click());
    page.once('dialog', dialog => dialog.accept());
    await page.click('#titleNew');
    await page.click('#setupContinue');
    await page.fill('#setupCoachName', 'Jordan Rivers');
    for (let step = 0; step < 3; step++) await page.click('#setupContinue');
    await chooseScenario('midseason-takeover');
    await page.click('#setupContinue');
    await page.locator('#setupContinue:enabled').waitFor({timeout: 60000});
    assert.match(await page.locator('#setupContent').innerText(), /2–5 record and five regular-season games/);
    const takeoverState = () => page.evaluate(() => {
      const api = window.__DL_TEST__, team = api.selected(), setup = api.setupDebug().setup;
      const {week, phase, played} = api.preseasonDebug();
      return {week, phase, played, program: team.name, inherited: setup.takeover.inherited,
        games: team.schedule.map(game => ({week: game.week, score: game.score, played: !!game.played, id: game.gameId}))};
    });
    const preview = await takeoverState();
    assert.equal(preview.program, 'Vermont State');
    assert.equal(preview.phase, 'regular');
    assert.equal(preview.week, 7);
    assert.equal(preview.played, 420, 'all league games in the first seven weeks have actual results');
    assert.deepEqual(preview.inherited, {w: 2, l: 5});
    assert.equal(preview.games.filter(game => game.played && game.score && game.id).length, 7);
    assert.equal(preview.games.filter(game => !game.played).length, 5);
    await page.click('#setupContinue');
    await page.reload();
    await page.locator('#setupContinue:enabled').waitFor({timeout: 60000});
    assert.deepEqual(await takeoverState(), preview, 'reopening the review draft reproduces the inherited schedule');
    const activePrograms = () => page.evaluate(async () => (await globalThis.DynastyStorage.create().listSlots())
      .filter(slot => !slot.empty).map(slot => slot.program));
    assert.deepEqual(await activePrograms(), ['Lake Erie University'], 'replaying inherited weeks does not write an autosave');
    await page.click('#setupContinue');
    assert.match(await page.locator('#setupContent').innerText(), /2027 Week 8/i);
    await page.click('#setupContinue');
    await page.locator('#app').waitFor({state: 'visible', timeout: 60000});
    assert.deepEqual(await activePrograms(), ['Lake Erie University', 'Vermont State'], 'acceptance saves to a separate slot');
    const inheritedArchive = await page.evaluate(async () => {
      const setup = window.__DL_TEST__.setupDebug().setup;
      const store = globalThis.DynastyStorage.create({slot: setup.saveSlot}), saved = await store.load();
      const games = await store.readGames(saved.gameRef), former = saved.universe.coachArchive.find(coach => coach.id === setup.takeover.formerCoachId);
      return {games: games.length, unique: new Set(games.map(game => game.id)).size,
        priorCoach: former?.seasons.map(season => [season.wins, season.losses]), gamesCoached: saved.universe.callSheet?.games || 0};
    });
    assert.deepEqual(inheritedArchive, {games: 420, unique: 420, priorCoach: [[2, 5]], gamesCoached: 0},
      'the save gives the inherited results to the former coach');
    await page.reload();
    await page.locator('#titleContinue:enabled:visible').waitFor({timeout: 60000});
    await page.click('#titleLoad');
    await page.selectOption('#titleSaveSlot', 'dynasty-2');
    await page.locator('#titleLoadMeta').filter({hasText: 'Vermont State'}).waitFor();
    await page.click('#titleLoadBrowser');
    await page.locator('#app').waitFor({state: 'visible'});
    assert.deepEqual(await takeoverState(), preview, 'resuming the inherited dynasty retains the actual archive and schedule');
    assert.match(await page.locator('#seasonGoalsDashboard').innerText(), /Win 3 of the final 5 regular-season games/);
    assert.deepEqual(errors, [], `setup emits no console or page errors: ${errors.join(' | ')}`);
    console.log('PASS Take the Job setup generates preseason scenarios and a saved Week 8 takeover');
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error);
  process.exit(1);
});

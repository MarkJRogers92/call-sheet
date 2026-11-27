const test = require('node:test');
const assert = require('node:assert/strict');
const {loadEngine} = require('../tools/harness');

async function engine(seed, options) {
  const e = loadEngine({seed, ...options});
  await e.loadSchools();
  e.setUserTeam('Chicago Metropolitan');
  e.initUniverse();
  return e;
}

test('each simulated week reports the controlled team result on the status line', async () => {
  const e = await engine(31001);
  const u = e.T('Chicago Metropolitan');
  for (let week = 1; week <= 3; week++) {
    e.delegateWeeklyDecisions(u);
    e.simWeek(true);
    assert.equal(e.universe.week, week);
    const game = e.universe.schedule[week - 1].find(g => g.home === u.name || g.away === u.name);
    const status = e.$el('#saveStatus').textContent;
    if (!game) { assert.equal(status, `Week ${week} complete.`); continue; }
    const home = game.home === u.name, us = home ? game.score[1] : game.score[0], them = home ? game.score[0] : game.score[1];
    assert.equal(status, `Week ${week} final: ${game.winner === u.name ? 'W' : 'L'} ${us}-${them} ${home ? 'vs' : 'at'} ${home ? game.away : game.home}.`);
  }
});

test('a seeded universe generates the same portrait seeds on every load', async () => {
  const seeds = async () => (await engine(31002)).universe.teams[0].roster.slice(0, 20).map(p => [p.portraitSeed, p.jerseyNumber].join(':'));
  const first = await seeds();
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.deepEqual(await seeds(), first);
  assert.equal(new Set(first.map(s => s.split(':')[0])).size, first.length, 'seeds stay unique');
});

test('advance to rivalry week uses real results and leaves the rivalry unplayed', async () => {
  const e = await engine(31003);
  const u = e.universe, school = e.T('Chicago Metropolitan');
  const stop = e.seasonAdvanceStops().find(x => x.id === 'rivalry');
  assert.ok(stop.week > 1);
  const report = e.advanceSeasonTo('rivalry');
  assert.equal(u.week, stop.week - 1);
  assert.equal(school.schedule.find(g => g.week === stop.week).played, false);
  assert.equal(report.endWeek, u.week);
  assert.ok(report.games.length > 0);
  for (const row of report.games) {
    const game = school.schedule.find(g => g.week === row.week);
    assert.equal(row.won, game.winner === school.name);
  }
  e.universe = JSON.parse(JSON.stringify(e.packUniverse(u)));
  e.normalizeUniverse();
  assert.deepEqual(e.universe.seasonAdvanceReport, report);
});

test('advance pauses for a pending redshirt and refuses to disturb a live game', async () => {
  const e = await engine(31004);
  const u = e.universe, school = e.T('Chicago Metropolitan');
  const player = school.roster.find(p => !p.redshirtUsed && !p.redshirtActive);
  player.stats.games = 4;
  const decision = e.currentWeeklyDecisions(school).find(x => x.type === 'REDSHIRT_DECISION');
  assert.ok(decision);
  u.liveGameDay = {};
  assert.equal(e.advanceSeasonTo('redshirt'), null);
  delete u.liveGameDay;
  const report = e.advanceSeasonTo('redshirt');
  assert.equal(report.reason, decision.title);
  assert.equal(report.games.length, 0);
  assert.equal(u.week, 0);
  assert.equal(decision.resolved, false);
});

test('visit stops require a real future home game and preempt the visit week', async () => {
  const e = await engine(31005, {fullRuntime: true});
  const u = e.universe, school = e.T('Chicago Metropolitan');
  const visitor = u.recruits.find(r => r.stars === 5 && !r.committed);
  const away = school.schedule.find(g => g.away === school.name);
  Object.assign(visitor, {visit: true, visitWeek: away.week});
  assert.equal(e.seasonAdvanceStops().some(x => x.id === 'visit'), false);
  const home = school.schedule.find(g => g.home === school.name);
  visitor.visitWeek = home.week;
  const other = u.teams.find(t => t.id !== school.id);
  visitor.recruitingActions = {[other.id]: {season: u.year, visitWeekend: {week: home.week, receipt: null}}};
  assert.equal(e.seasonAdvanceStops().some(x => x.id === 'visit'), false, 'a priority visit belongs to its booking school');
  delete visitor.recruitingActions;
  // Set the clock at the opening of the visit week to exercise the
  // stop-before-kickoff boundary without relying on the recruit's decision roll.
  u.week = home.week - 1;
  assert.equal(e.seasonAdvanceStops().find(x => x.id === 'visit')?.recruitId, visitor.id);
  const report = e.advanceSeasonTo('visit');
  assert.equal(report.games.length, 0);
  assert.equal(home.played, false);
  assert.ok(report.reason.includes(visitor.name));
});

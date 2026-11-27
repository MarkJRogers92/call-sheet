const assert = require('assert/strict');
const path = require('path');
const { chromium } = require('playwright-core');
const { chromiumPath } = require('./helpers/chromium-path');
const { startNewDynasty } = require('./helpers/start-new-dynasty');

const FILE = 'file://' + path.join(__dirname, '..', 'index.html');

// Roster needs: the recruiting tab shows thin position groups before signing day.
(async () => {
  const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'] });
  try {
    for (const [label, viewport] of [['desktop', { width: 1280, height: 900 }], ['iphone', { width: 390, height: 844 }]]) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      page.on('pageerror', error => errors.push(String(error)));

      await page.goto(FILE);
      await startNewDynasty(page);
      const succession = await page.evaluate(() => {
        const team = window.__DL_TEST__.selected();
        const [starter, backup] = team.roleDepth.QB1.map(id => team.roster.find(player => player.id === id));
        for (const player of team.roster) Object.assign(player, { eligibilityUsed: 0, redshirtActive: false, injuryWeeks: 0, academicHold: 0 });
        backup.eligibilityUsed = 2;
        Object.assign(starter, { eligibilityUsed: 3, redshirtActive: false });
        return { outgoing: starter.name, backup: backup.name, backupId: backup.id };
      });
      await page.evaluate(() => document.querySelector('.tabs button[data-tab="recruiting"]').click());
      await page.click('[data-recruit-class="outlook"]');
      await page.waitForSelector('#recruitingNeeds [data-need-pos]', { timeout: 10000 });

      assert.equal(await page.locator('#recruitingNeeds').isVisible(), true, `[${label}] the roster needs card is visible`);
      assert.ok(await page.locator('#recruitingNeeds [data-need-pos]').count() > 0, `[${label}] thin position rows render`);
      assert.match(await page.textContent('#recruitingNeedsCount'), /\d+ position group/, `[${label}] the card states a count`);
      const first = await page.locator('#recruitingNeeds [data-need-pos]').first().innerText();
      assert.match(first, /\d+ of \d+/, `[${label}] the row carries counts`);
      assert.match(first, /committed/i, `[${label}] the row explains commitments`);

      const opening = page.locator('[data-succession-role="QB1"]');
      const openingText = await opening.innerText();
      assert.ok(openingText.includes(succession.outgoing), `[${label}] the outgoing starter is named`);
      assert.ok(openingText.includes(succession.backup), `[${label}] the understudy is named`);
      await opening.getByRole('button', { name: 'Run first-team audition for Starting QB' }).click();
      const report = opening.locator('.succession-audition');
      assert.match(await report.innerText(), /Same eight scripted snaps per player/i);
      assert.equal(await report.locator('li').count(), 2, `[${label}] both players have observed reps`);
      await report.getByRole('button', { name: `Start ${succession.backup}` }).click();
      assert.equal(await page.evaluate(() => window.__DL_TEST__.selected().roleDepth.QB1[0]), succession.backupId, `[${label}] audition changes the actual depth chart only when picked`);
      assert.match(await report.innerText(), /Depth chart choice/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `[${label}] no horizontal overflow`);
      await opening.getByRole('button', { name: `Training for ${succession.backup}` }).click();
      assert.equal(await page.locator('#development').isVisible(), true, `[${label}] training opens Development`);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.training), succession.backupId, `[${label}] the named player's training control receives focus`);
      assert.deepEqual(errors, [], `[${label}] no console errors`);
      await page.close();
    }
    console.log('recruiting needs browser check passed (desktop + iphone)');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exit(1); });

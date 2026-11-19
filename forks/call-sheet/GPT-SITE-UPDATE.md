# Call Sheet: put V29 on the live Site
**For: GPT (ChatGPT Sites). From: Claude Code session, 19 November 2026. Owner: Mark Rogers.**

Mark wants the live Call Sheet playtest site updated from V28 to V29 for a playtest.
- Publish only. Do not change game code.
- Do not merge or force-push any branch in the game repository.

## 1. What to deploy

| | |
|---|---|
| Game repository | `MarkJRogers92/call-sheet` |
| Branch | `claude/v29-own-the-drive`. It is one game commit on top of `release/v28` (`90104b4`). |
| Build commit | `22856e6aa43d4930bcf0cc2d92923799127928df`. Any later commits on this branch change only docs, so the built pages are identical. |
| Dynasty page (root `index.html`, committed build) | sha256 `d52b79ebb5ad66a0d8c8b00a0d44bbcf4d55901b14634a29eaa2a8e7ee9fa860` |
| Standalone battle page (generated, see step 2) | sha256 `149dcf89a7b7c188a7927efa28a8773f4adc1bc27687b042db386ee42a7330b3` |
| App version string | Still `0.36.0`; not bumped. Call it **V29** in the release notes. |

Both hashes were checked from a clean clone with Node 22.23.5. If yours differ, stop and report the difference. Do not deploy.

## 2. Build and check (from a clean clone)

```sh
git clone --branch claude/v29-own-the-drive https://github.com/MarkJRogers92/call-sheet.git
cd call-sheet
git checkout 22856e6aa43d4930bcf0cc2d92923799127928df
npm ci
npm run build
git diff --exit-code -- index.html sw.js          # must print nothing: the committed build is current
sha256sum index.html                              # must match the Dynasty hash above
node -e "process.stdout.write(require('./forks/call-sheet/tools/bundle').bundle({document:true}))" > /tmp/battle-index.html
sha256sum /tmp/battle-index.html                  # must match the battle hash above
```

- Use Node 22 or 24.
- On macOS, use `shasum -a 256` instead of `sha256sum`.

## 3. Deploy to the existing Sites project

- **Sites project:** `appgprj_6afb8523e61481918d4881852b228a49`.
- **Before you change anything, write down the current hosting commit (the V28 deployment).** It is the rollback point. Put it in the README entry and in your report.
- **Keep unchanged:**
  - the Site URL
  - the project
  - the public audience
  - the landing page `dist/index.html`

  Saves live in the browser per origin and path, so keeping the same URL keeps players' saves.

Replace exactly these:

| Hosting path | Replace with |
|---|---|
| `dist/dynasty/index.html` | the game repo's root `index.html` (Dynasty hash) |
| `dist/battle/index.html` | `/tmp/battle-index.html` (battle hash) |
| `dist/dynasty/sw.js`, `dist/dynasty/manifest.webmanifest` | the same files from the game repo root, if they exist in `dist/dynasty/` today |
| Other files already under `dist/dynasty/` (for example `assets/`, `portraits/`) | the same-named files from the game repo root. Don't add files the hosting tree never had. |

Before deploying, check that every local `src=`/`href=` in the new `index.html` exists in `dist/dynasty/`. Skip `data:` and `https:` references.

Add a README entry in the hosting repo. It must contain:
- the game build commit `22856e6aa43d4930bcf0cc2d92923799127928df`
- the two hashes
- the V28 hosting commit you recorded
- the label "V29 (0.36.0)"

Commit it to the hosting repo, then deploy.

**Note:** pushing to the hosting repo and deploying the Site are two separate operations. Do both.

## 4. Verify the live site

1. Download both live game pages. Their sha256 must equal the two hashes above. If a service worker serves an old copy, reload once.
   - https://call-sheet-playtest-mark.markjrogers92.chatgpt.site/battle/
   - https://call-sheet-playtest-mark.markjrogers92.chatgpt.site/dynasty/
2. The landing page https://call-sheet-playtest-mark.markjrogers92.chatgpt.site/ must be unchanged.
3. Smoke-test in a **private window**, so Mark's live save is never touched. **Do not clear site data for this domain.** On the battle page:
   - **Opening drive.** Pick any team → Play → Kickoff → **Skip guide · Start game**.
     - The first call board you see is your offense on **1st & 10** with **5 command**. The header button reads **Coaching this drive**.
     - If you kicked off, the opponent's drive plays first without asking you anything.
   - **Drive end.** Call plays until the possession ends. A **DRIVE OVER** box shows a line like "3 plays, 2 yards. A 1-yard third-down run forced a punt." It has two buttons: **Coach next drive** and **Back to Key Moments**.
   - **Next drive.** Choose **Coach next drive**. Your next possession again starts with a 1st-down call.
     - A collapsed **While the staff called it** line summarizes the opponent's drive.
     - The same summary appears in the ticker.
   - **Verdict.** After one of your own snaps, the result panel shows one line in this form: "Read the crease: their [name] beat your [name]."
     - If you added Max Protect or Seal Block, the line says whether it helped.
   - **Third down.** On 3rd down the forecast says **Convert** and lists "Known: …" and "Still a guess: …".
   - **Setup cue.** Run twice on one drive with PA Boot in hand. A green **Setup ready · Establish the Run** box appears with a **Select PA Boot** button. It may not show in every game, so don't treat its absence alone as a failure.
   - **Final screen.** Finish or simulate the game. The final screen has a **Your drives** list and a **Copy playtest log** button.
   - **Challenges.** Open `…/battle/?mode=challenges` → **Four-Minute Offense** → play it out. The result screen shows:
     - **Your calls**
     - **Retry this situation**
     - **Face another look**, with "Practice only: no sticker"

     Choosing **Face another look** starts the same 1:48, 3rd-and-3 situation.
   - **Phone width.** At 390 px wide, the DRIVE OVER box and both of its buttons fit without horizontal scrolling.
4. Dynasty page: start a quick new dynasty and play one card game to confirm it loads and records. Dynasty does **not** get the opening drive in V29, so its first call can still come on 3rd down. That is expected.

## 5. Test status at the build commit

- `tests/card-own-the-drive.js` (13 new tests) and the full card regression chain pass: 350 node tests, plus the standalone battle (25/25), adapter, save, integration and game-record checks.
- `npm run build` and `npm run lint` are clean.
- Browser checks:
  - The standalone battle was driven in Chromium at 1280×800 and 390×844, through the opening drive, drive end, Coach next drive and the Four-Minute result with Face another look. There were no page errors and no horizontal overflow.
  - `card-gameday-browser` and `card-pages-browser` pass.
- **Known failure, not a release blocker:** `card-default-browser` fails on "matchup and deck shortcut lead This Week". It fails identically on untouched V28.
- Not run: the full Dynasty Lab `npm test`, the full browser suite, Safari/VoiceOver.

## 6. Release notes (what players will notice)

- **You coach the opening drive.** A new Quick Battle hands you your first offensive possession from 1st down with all 5 Command, whether you receive or kick.
- **Choose the next drive.** When your drive ends you see what happened. Then pick **Coach next drive** or **Back to Key Moments**.
- **Staff recaps.** Drives the staff called get one-line summaries.
- **Setup cues.** When your last calls set up a combo you can use right now (for example, two runs then PA Boot), the call sheet says so. On third and long it also warns that the bonus is no cure-all.
- **Why the play worked or failed.** After your snap, one line names the matchup that decided it. It says whether your tactic actually came into play.
- **Third downs.** The forecast says what the defense's look confirms and what is still a guess.
- **Four-Minute Offense** has **Face another look**: the same situation against a defense that stacks the box every snap. Your calls are listed so you can try something different. It's practice only: no sticker.
- **Playtest log.** The final screen lists your drives and can copy a playtest log.

Full details: `forks/call-sheet/HANDOFF-GPT.md` (the "V29 own the drive" section).

## 7. Report back

Send Mark:
- the new hosting commit
- the V28 hosting commit (rollback point)
- the two live hashes
- each smoke-test item from step 4, marked pass/fail

# Call Sheet: update the live Site to the November 18 build
**For: GPT (ChatGPT Sites). From: Claude Code session, 18 November 2026. Owner: Mark Rogers.**

Mark wants the live Call Sheet site updated from V15 to the build on branch `claude/new-session-8fuxi1`. Publish only. Do not change game code. Do not merge or force-push any branch.

## 1. What to deploy

| | |
|---|---|
| Game repository | `MarkJRogers92/call-sheet` |
| Branch | `claude/new-session-8fuxi1`, which starts from `card-battles` at `6f1e525` |
| Build commit | `19e450e2425142db6aec064fd5f26cd5181d7ecd`. Later commits on this branch change only docs, so the built pages are identical. |
| Dynasty page (root `index.html`, committed build) | sha256 `6cbeb06091dc220799274fd57373061402f966eda120e025c0e451d099391066` |
| Standalone battle page (generated, see step 2) | sha256 `a98c20e9e674ade982c7c3a6563c9680d4a901387740842b9f7a9d73b8f94517` |
| App version string | still `0.36.0`. The version was not bumped. Say "Nov 18 build" in release notes. |

Both hashes were checked twice from a clean rebuild. If yours differ, stop and report the difference. Do not deploy.

## 2. Build and check (from a clean clone)

```sh
git clone --branch claude/new-session-8fuxi1 https://github.com/MarkJRogers92/call-sheet.git
cd call-sheet
npm ci
npm run build
git diff --exit-code -- index.html sw.js          # must print nothing: the committed build is current
shasum -a 256 index.html                          # must match the Dynasty hash above
node -e "process.stdout.write(require('./forks/call-sheet/tools/bundle').bundle({document:true}))" > /tmp/battle-index.html
shasum -a 256 /tmp/battle-index.html              # must match the battle hash above
```

Use Node 22 or 24. Run `sha256sum` instead of `shasum -a 256` on Linux.

## 3. Deploy to the existing Sites project

- **Sites project:** `appgprj_6afb8523e61481918d4881852b228a49`.
- **Current hosting commit:** `e374e177d4345cfb06739296318422f99dfd2fba`. It holds README metadata plus `dist/{index.html,battle/,dynasty/}`.
- **Keep unchanged:** the Site URL, the project, the public audience, and the landing page `dist/index.html`. Saves live in the browser per origin and path, so keeping the same URL keeps players' saves.

Replace exactly these:

| Hosting path | Replace with |
|---|---|
| `dist/dynasty/index.html` | the game repo's root `index.html` (Dynasty hash) |
| `dist/battle/index.html` | `/tmp/battle-index.html` (battle hash) |
| `dist/dynasty/sw.js`, `dist/dynasty/manifest.webmanifest` | the same files from the game repo root, if they exist in `dist/dynasty/` today |
| Other files already under `dist/dynasty/` (for example `assets/`, `portraits/`) | the same-named files from the game repo root. Don't add files the hosting tree never had. |

Before deploying, check that every local `src=`/`href=` that the new `index.html` references (excluding `data:` and `https:`) exists in `dist/dynasty/`.

Add a README entry in the hosting repo. It must name the game build commit `19e450e2425142db6aec064fd5f26cd5181d7ecd` and the two hashes, and say "Nov 18 build on V15 (0.36.0)". Commit it to the hosting repo, then deploy.

**Note:** pushing to the hosting repo and deploying the Site are two separate operations. Do both.

## 4. Verify the live site

1. Download both live game pages:
   - https://call-sheet-playtest-mark.markjrogers92.chatgpt.site/dynasty/
   - https://call-sheet-playtest-mark.markjrogers92.chatgpt.site/battle/

   Their sha256 must equal the two hashes above. If a service worker serves an old copy, reload once.
2. The landing page https://call-sheet-playtest-mark.markjrogers92.chatgpt.site/ must be unchanged.
3. Smoke-test in a **private window**, so Mark's live save is never touched. **Do not clear site data for this domain.**
   - Dynasty → New dynasty → quick setup. This Week shows a **Cards & Deck** row right under the Briefing / Players / League tabs.
   - The matchup card shows "players to beat", an opponent line ("…staff expects about N% passing; their defense…"), and a "Film confidence N% (your coordinators and head coach)" line.
   - **Coach with Cards** → in a duel replay, each side shows a stacked sum (Ability, + bonuses, Total) and "X vs Y · your edge … · N% to win this duel".
   - After the game, the matchup card reads "WEEK 1 · FINAL RECORDED" with no Coach button. "Last final" shows a "Deciding snap". Cards & Deck names the card you took.
   - Battle page: pick a team → Play → Full call sheet → pick a play. The Read panel shows the stacked sums.
   - At 390 px wide, the battle's Snap button is visible without scrolling once the call board finishes sliding in.

## 5. Test status at the build commit

- Card regression suites, battle engine (18/18), adapter, game recording, save and integrations: all pass.
- The full `npm test` passed on the previous round's code (`2d6f13a`). The browser run there: 85 of 89 passed. Three of the four failures were old test bugs that also failed on untouched V15, and they are now fixed. The fourth is a known flake (below).
- Final full run at `20d60fe` (`npm test` plus all 89 browser tests via `npm run test:browser-all`): **in progress when this was written. See the update at the bottom.**
- **Known flake:** `tests/card-deck-browser.js:100` (does a reopened battle match its save) fails roughly 1 in 3 runs under machine load. It is not a release blocker, but it's open.

## 6. Release notes (what players will notice)

- **Battle:**
  - Duel math shows as an addition problem: each side's ability plus bonuses, totals facing off.
  - The same sums appear in the call sheet before you snap.
  - Your last call stays pinned on the call board.
  - 4th downs show the 3rd-down call that set them up.
  - The final screen shows the deciding snap.
  - After a loss, you can stage a deck swap with a single tap; Cancel changes nothing.
- **This Week:**
  - Cards & Deck sits right under the tabs, with last game's card and an install tip.
  - The matchup card shows opponent identity (from film when you've met), film confidence, rivalry history, and what pack is at stake.
  - A played game no longer offers a replay.
  - Last game's card Player of the Game appears in player stories.
- **Recruiting:** prospect cards show their possible signature, how it fits your deck, and the exact breakout bar.
- **Program:**
  - Coaching candidates show how they'd change your card film read.
  - Bowls and playoff games get an extra week of film.
  - The Deck Room has a season recap of your calls and groups plays by family.
- **Fixes:** misleading "scout them" hints now point to coaches; several stale browser tests fixed.

Full details: `forks/call-sheet/HANDOFF-GPT.md` (dated Nov 18 sections).

## Update: final verification
_Pending. Claude will fill this in when the run finishes._

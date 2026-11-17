# Dynasty Card / Call Sheet — continuation handoff

Date: November 16, 2026 (Chicago). Owner: Mark.

## Start here

Finish on **MarkJRogers92/call-sheet, branch `card-battles`**, and publish to the **existing** site:
https://call-sheet-playtest-mark.markjrogers92.chatgpt.site

Site ID: `appgprj_6afb8523e61481918d4881852b228a49`. Preserve its owner-only access and URL.
Do not create another branch/site, merge `main`, or change the base `MarkJRogers92/Football` game.
Mark explicitly authorized finishing the implementation and hosting update. He does not want another planning
round or repeated requests for approval. This handoff is for finishing the remaining concrete work.

## Recovered state and locations

- Prior chat: **Review Handoff File**. Latest committed starting point:
  `57d9ddedd960d078744f184477979c78f82d3d8e` (roster-driven battles, editable decks, exact resume).
- Prior checkout, preserved untouched:
  `/Users/markrogers/Documents/Codex/2026-11-16/new-chat/call-sheet`.
- Completed working checkout, same `card-battles` branch:
  `/Users/markrogers/Documents/ChatGPT/Dynasty Card/call-sheet`.
- Previous hosting checkout:
  `/Users/markrogers/Documents/Codex/2026-11-16/new-chat/call-sheet-prototype`.
  Its `dist/` contains the landing page, `/battle/` and `/dynasty/`; its README explains the packaging layout.
- This continuation's test logs are one directory above the working checkout.
- Read `forks/call-sheet/HANDOFF-GPT.md` and `INTEGRATION.md` for architecture. The new checkpoint section
  in the former supersedes its older implementation status.

The old handoff's `30b6677` and prior conversation's `cb0d530` are earlier snapshots. Do not reset to them.

## Completed implementation

The previous chat left the following changes uncommitted. They were recovered, reviewed, and supplemented
with regression coverage and fixes:

1. **Recruiting and decks:** the active playbook's compatibility with a recruit's archetype contributes to
   the existing recruiting pitch, capped at 3 points. Prospect cards explain the match. Hidden ratings are not used.
2. **Coaches and mastery:** coordinator development and existing coaching relationships/specialties add up to
   30% mastery to plays actually used. Both coached and simulated games use the same calculation. Saved battles
   retain launch-time coaching rates.
3. **Facilities and capacity:** facilities 75 unlock 16 play/tactic slots; 90 unlock 18. Capacity already earned
   stays unlocked. The integration can be switched off.
4. **Development feedback:** player cards show the most recent camp trait improvement and relevant plays.
   Actual battle attributes already contain that improvement; no duplicate stat bonus is added.
5. **Signatures and transfers:** signatures follow real player IDs between user/AI programs. A full destination
   stores the incoming signature. Graduates retire to the Ring of Honor. **Fixed in this continuation:** retain
   signatures while a portal entrant temporarily has no roster owner; otherwise the original draft discarded them.
6. **Deck management:** choose earned two-branch evolutions between games and store/equip signatures, keeping
   the three-active maximum. Editor changes are draft-only until Save.
7. **Postseason simulation:** the user's conference championship, bowl and playoff simulations can use the card
   engine and write real stats through the existing transactional recorder. Mastery, achievements, packs, signature
   breakouts and card careers flow back. Neutral sites do not get home crowd advantages. **Fixed in this continuation:**
   rollback includes launch-time program changes and card rewards, not just the football result.

New code: `forks/call-sheet/core/program.js`. Main integration: `card-gameday.js`.
Other changes: `game-engine-v2-postseason.js`, core evolution/signatures/world/playbook UI, slice HTML/JS,
`tools/build.js`, `tools/harness.js`, generated `index.html`, test registration in `package.json`.
New tests: `tests/card-program.js` (six tests).

## Verification in this continuation

Passed:

- `node tools/build.js` — rebuilt the full Dynasty game and embedded battle.
- `node --test tests/card-program.js tests/card-review.js tests/card-coaching.js tests/card-deck-depth.js`
  — **34 passed, 0 failed**. Log: `../focused-tests.log`.
- `node tests/card-battle-record.js` — real Dynasty game recording passed.
- `node forks/call-sheet/tests/battle.test.js` — **18 passed, 0 failed**.
- `node forks/call-sheet/tests/adapter.test.js` — real-roster battle passed; zero depth-chart fallbacks across 40 teams.
- `node tests/card-save.js` — versioning, validation and signature retirement/transfer checks passed.
- `node tests/card-integrations.js` — weekly card simulation, scouting, practice and AI progression passed.

Not completed; do not report as passing:

- `npm test`: smoke checks reported **53 passed, 0 failed** and many unit checks passed, but the full run did not
  complete. It stalled while the linter dependency was loading. The independent lint run also failed to finish;
  they were stopped. Log: `../full-tests.log`. No full-suite success claim is made.
- Browser suites: `node tests/card-deck-browser.js` could not launch Chrome in this restricted session
  (SIGABRT/EPERM). The chained game-day browser suite therefore did not run. Log: `../browser-tests.log`.
- The supported browser also rejected local `file:` preview URLs. No new visual verification is claimed.

## Hosting status and exact remaining work

The existing Site was confirmed active at saved version **2**. This continuation has **not** published a new version.
The previous hosting README identifies its build as the prior deck/roster update. The program connections above
must still be included in the next publication.

The official source-opening helper failed to resolve `git.chatgpt-team.site`; ordinary GitHub shell access also
failed DNS. A network escalation request was automatically rejected because this session disables sandbox
approval. Mark approved publication, but that approval cannot change the session's enforced network restriction.
Use Claude's permitted network/publishing environment; do not bypass security controls or paste credentials into logs.

Remaining sequence:

1. Use the completed source on `card-battles`. Inspect the branch head and pending diff before writing; retain any
   later work. If working from the local checkout, note that its origin initially points to the prior local checkout.
   The canonical destination is `https://github.com/MarkJRogers92/call-sheet.git`, branch `card-battles`.
2. Resolve the test-environment/linter loading problem, then run `npm test`, `node tools/lint.js`,
   `node tests/card-deck-browser.js`, and `node tests/card-gameday-browser.js` against the final build.
3. Verify the new UI at desktop and phone sizes: facility capacity summary, prospect playbook fit, development
   note, ready evolutions, signature storage/equipping, Cancel versus Save, and battle resume.
4. Update the existing hosting source using its official source helper and a fresh short-lived credential.
   Refresh `/battle/` with `node forks/call-sheet/tools/bundle.js <hosting-checkout>/dist/battle/index.html`;
   update `/dynasty/` with the rebuilt game plus the same assets/PWA files used by the previous hosting checkout.
   Preserve the landing page, manifest, Site ID and audience. The previous hosting README has the layout.
5. Push the exact hosting source, package it, save and deploy it to the existing owner-private Site. Verify the
   returned deployment success and report the actual new version and unchanged URL to Mark.

## Known remaining features — distinct from closing this batch

- **Manual postseason card coaching: implemented (Nov 17).** See "Coached postseason" in `forks/call-sheet/HANDOFF-GPT.md`.
  Remaining polish: the This Week briefing's primary "Next: Play Bowl Games" button still simulates; the coach
  entry point is the Card Program panel's "Coach the … with Cards" button.
- Alternate passing targets (checkdowns) and the brainstorm list were built Nov 17; see "Expansion batches" in
  `forks/call-sheet/HANDOFF-GPT.md`. More combo recipes remain future work.
- Older wishlist items (nemesis recruits, signing-class reveals, coordinator-owned pools, booster packs, legacy
  cards, coaching-tree playbooks, albums) were not part of this finite integration batch and remain optional work.

## Preserve Mark's design priorities

Battles come first. Player ratings, abilities, archetypes, roles, health, fatigue, scheme fit and synergies must
change outcomes in understandable ways. A visible +1 count is not a guarantee; real talent and uncertainty remain.
Players choose their own decks and earn plays/tactics through packs and achievements. Reuse Dynasty Lab's player
identities, recruiting, development, staff, facilities and records; do not create a second progression economy.
Keep effects labeled, scouting secrets hidden, saves compatible, rewards idempotent, and the game easy to resume.

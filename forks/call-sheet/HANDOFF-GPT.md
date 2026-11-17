# Call Sheet: handoff

## Continuation checkpoint — November 16, 2026

The unfinished program-integration batch has been recovered and completed on `card-battles`.
This section supersedes the integration status in the older sections below.

- Recruiting: active playbook/archetype compatibility contributes up to 3 points through the existing
  recruiting pitch. It uses public archetype strengths, never hidden true ratings. Prospect cards explain the fit.
- Coaching: coordinator development and the existing development-coaching relationship modifier add up to
  30% mastery to plays actually used. Coached and simulated games share the same accounting; battle saves
  preserve the launch-time training rates.
- Facilities: ratings 75 and 90 unlock 16 and 18 play/tactic slots respectively. Earned capacity persists.
- Development: player cards explain the latest camp trait gain and affected plays without stacking a second bonus.
- Transfers: signatures move with the real player ID between user and AI programs. Portal entrants retain
  their signatures while temporarily absent from rosters. A full destination stores the incoming signature.
- Deck editor: earned evolutions can be selected between games; signatures can be stored/equipped while
  retaining the three-active limit. Cancel discards the draft.
- Postseason simulation: the user's conference, bowl and playoff games can use the card engine, real-player
  attribution, mastery, achievements, packs and signature breakouts. Both launch-time program changes and
  recorded game/reward changes roll back when the transaction fails. Neutral games do not get home crowd edges.

New module: `forks/call-sheet/core/program.js`. New registered regression suite: `tests/card-program.js`.
The six tests cover facility thresholds/toggles, recruiting pitch and hidden-rating independence, mastery limits,
portal transfer/reserve/save continuity, postseason stat/reward recording, and fault-injected rollback.

Manual postseason card coaching is still separate work: the regular-season iframe launch gate remains in place.
(Superseded Nov 17 — see the next section.)

## The card game is the game — November 17, 2026 (latest)

Mark: in this fork the card battle IS the game, and cards belong everywhere in Dynasty Lab.

- `cards-default` (section 9 of `card-gameday.js`, on by default): the top **Next** button reads "Next: Coach Week N vs
  Opponent" and opens the battle; Game Day (nav) and the matchup's Open Game Day open it too. After the game, Next
  advances the week as before. "Next: Resume Card Battle" resumes. Classic Game Day stays on the matchup card; Sim Week
  (season controls) lets coordinators play it. Every dynasty has a Card Program and playbook from day one; the matchup and
  Card Program sit at the top of This Week under the briefing.
- `card-pages` (section 10, on by default): roster card grid (Cards / Classic toggle; Classic is DL's own board and
  folding table), Roles & Depth card lineup, Recruiting prospect cards (ranges from scouting via `prospectEstimate`,
  never hidden ratings), Staff coach cards (Command, coaching-tree card, development coaching), Development card growth,
  the matchup's "players to beat", and a Card Program block in the newsletter. Kickers and punters get special-teams cards.
  Hooks: DL's `extendRender` for roster/recruiting/staff/development; the tab table's depth/newsletter entries are
  *wrapped* (table-folding also wraps them — never replace them).
- Tests: DL browser tests that expect classic Next and pages call `startNewDynasty(page)` and keep them; card tests ask
  `startNewDynasty(page,{cardGame:true})`. `tests/helpers/play-card-battle.js` plays a battle through the UI (no hooks);
  `tests/release-build-browser.js` now plays Week 1 as a card battle. New: `card-default-browser.js`,
  `card-pages-browser.js` (desktop and phone).
- DL fix exposed by this: the recruiting workspace "UPDATED" badge was 7px; it now meets the phone 12px floor.

## Expansion batches — November 17, 2026 (after coached postseason)

All in `card-gameday.js` sections 5–8 unless noted; each has an integration switch and a test suite in `npm test`.

- **Earn cards (`program-cards`, tests/card-rewards.js):** Booster Pack (week 6+, fan support sets size/odds), Signing
  Day Pack (weighted by the signing class's positions), Album Packs. Reward packs are drawn when earned, stored in
  `callSheet.rewardPacks`, opened once from the Card Program (`[data-reward-pack]`) into the collection. Coaching-tree
  cards from coordinator `preferredScheme` (`data.SCHEME_CARDS`). Giant Killer (upset a top 10), Flea Flicker (3
  straight wins), Bluff Zero (winner held to 7), Jet Reverse (postseason win). Legacy signatures for retired numbers
  (`leg_<playerId>` specs, fainter via `signatures.buildAny`). Rivalry stakes: borrow a rival's card for a season.
- **People (`people-cards`, tests/card-people.js):** nemesis recruits (+1 money downs, from public recruitment
  history), visit pitch on prospect cards, camp auditions in close battles (applied through the existing camp path),
  portal arrivals bring a card, Players of the Week break out, mentors pass a Legacy card, development stamps.
  Adapter supports per-player labeled edges via `program[side].conds`.
- **Upgrades (`card-upgrades`, tests/card-upgrades.js):** evolution branches gated by the runner's trait
  (`evolution.NEEDS`, checked in deck editor, slice and AI), weekly install focus (+6 reps, clears film), film wear
  (30+ uses over 3 games → opponent Key −1 on that play), seasonal eras (+0.5 labeled, both teams).
- **Battles (core, tests/card-battle-features.js):** progression reads/checkdowns (Checkdowns auto/off toggle; AI
  skips on long 3rd/4th), two-minute drill cards (Sideline Out, Spike), weather cards, timeout tactics, momentum after
  takeaways. Resolver `when` conditions (rain/snow/wind/clear/late/money) on effects, edges and matchups; `play` edges.
- **Moments and albums (tests/card-moments-albums.js):** `battle.decidingMoments(b)` → archive `cardMoments`, shown
  under "Card battle" in the game summary; seven collection albums.
- Browser: `npm run test:card-program-browser` (reward pack, install focus, era, albums; desktop and phone).

## Coached postseason — November 17, 2026

- Conference championships, bowls and every playoff round the user reaches can be coached as card battles. The Card
  Program panel shows "Coach the <game> with Cards" when the user has a game in the current stage (`postseasonCardGame`
  in `card-gameday.js`; pairings mirror the stage functions exactly). Battles are neutral-site and seeded
  `card:post:<year>:<label>:<teamId>`; `callSheet.postseasonBattle` keeps an open battle current until it closes.
- Recording: the final state is stored in `callSheet.pendingPostseason`, then the stage runs through the existing
  transactional path (`game-engine-v2-postseason.js`). `v2PostseasonExternalFor` hands the coached state to the user's
  game; card careers and `recordedBattleSeed` are written inside the stage transaction, so a rollback undoes them and
  the in-battle rewards (granted only after a successful record) are paid once. Classic stage buttons wait while a
  postseason battle is open.
- The playoff now commits one round per transaction with `universe.playoffProgress = {year, round, alive}` (cleared
  when the champion is crowned; stale years ignored). The classic button still plays the whole remaining bracket;
  the card flow sets `v2PostseasonPauseForUser` so it stops before the user's next uncoached round.
- Postseason wins open five-card stage packs (Championship, Bowl, Playoff, National Title) with a legendary chance on
  the last card; simulated postseason games use the same packs. Regular packs are unchanged.
- Tests: `tests/card-postseason.js` (6, in `npm test`) and `tests/card-postseason-browser.js`
  (`npm run test:card-postseason-browser`).
Do not describe that UI as implemented. Alternate passing targets, additional combo recipes and the older
optional integration wishlist remain future work, not prerequisites for this program-integration batch.

Keep using the existing `card-battles` branch and the existing Site `appgprj_6afb8523e61481918d4881852b228a49`.
Do not replace the Site, change its audience, merge `main`, or modify the base `Football` repository.
Publication and verification details for this continuation are in `DYNASTY-CARD-HANDOFF-2026-11-16.md` at the repository root.

**For:** the next agent continuing this work (GPT or Claude). **Owner:** Mark. **Date:** 2026-11-16.

Call Sheet is a fork of **Dynasty Lab** (a college football dynasty sim). It adds an arcade card battler, in the
spirit of Balatro: loud animations and big payoffs. Coaching a game becomes a card battle on the real rosters,
and every result flows back into Dynasty Lab's own records. Read this file first, then `INTEGRATION.md`, then
`DESIGN.md` if you need the rules in depth.

## Where everything is

| What | Where |
| --- | --- |
| The real fork (work here) | GitHub `MarkJRogers92/call-sheet`, branch **`card-battles`** |
| `call-sheet` `main` | Dynasty Lab plus an early copy of this folder. **It does not have the card-battles work yet.** Merge only when Mark says so |
| Prototype copy | GitHub `MarkJRogers92/Football`, branch `claude/gracious-volta-3me7m2`, folder `forks/call-sheet/` (synced with `card-battles` for `core/`, `slice/`, `tools/` and the docs; it has none of the Dynasty Lab integration files) |
| Hosted playtest (current battle improvements) | https://call-sheet-playtest-mark.markjrogers92.chatgpt.site — private to Mark; Quick Battle at `/battle/`, full Dynasty Mode at `/dynasty/`; gameplay source: latest tested `card-battles` deck/roster update |
| Earlier playable sandbox | https://claude.ai/artifact/65grKWrvUGk2Ea4suJxGac (the slice bundled into one page; it runs without a dynasty) |
| Art tools | Pixel Forge (`MarkJRogers92/pixel-forge`, installed by the cloud environment's setup script), PixelLab (claude.ai connector), Meshy (3D) |

The hosted playtest is a static copy of the tested build, not an automatic deployment of this GitHub branch.
Its separate hosting checkout is `../call-sheet-prototype` beside the local `call-sheet` checkout; preserve its
`.openai/hosting.json` Site identity when updating. Copy the full game and assets together into `dist/dynasty/`
and regenerate `dist/battle/index.html` with the sandbox bundler. The root mode selector lives in `dist/index.html`.
Quick Battle uses the existing sandbox teams; real-roster backfield packages are in Dynasty Mode.

## Run, build, test

```bash
npm ci                                   # once
node tools/build.js                      # builds index.html (Dynasty Lab plus the card engine plus the battle frame)
npm test                                 # the full suite: Dynasty Lab's 1,026 tests and the card tests (must stay green)
node tests/card-gameday-browser.js       # the end-to-end browser test (Playwright); CARD_SHOTS=dir saves screenshots
node forks/call-sheet/tests/battle.test.js   # rules engine, 18 checks
node forks/call-sheet/tools/bundle.js out.html   # standalone sandbox page (what the artifact is)
```

Every new test file must be listed in `package.json` (`test`, `test:slow` or its own script). `check-test-lists.js`
fails the suite otherwise.

## Rules in one paragraph

On offense you hold a visible **call sheet** of 4 base plays, a drawn row of 3 **wrinkles** and a hand of 4
**tactics**. You get 5 **Command** per series, and a new first down deals a fresh hand. Each snap resolves in
three named **duels**: Gate, Key and Finish. A duel compares the players' trait grades (traits ÷ 10) plus labeled
modifiers, and the margin maps to a win chance. A lost Gate decides the play. **Honest Look:** a Confirmed fact
is always true. Tendencies build a Lean, and constraint plays punish it. Players catch **On Fire**. Other systems:
combos, trick plays, packs after games (rarity, one legendary per world), card evolution through mastery reps
(two permanent branches), and archetype **signature cards** for star players. Modes: key downs (default),
series, every snap, watch.

## Architecture

**Card engine** (`forks/call-sheet/core/`, UMD modules, also loaded in Node tests):
- `data.js`: catalog (PLAYS, CALLS, TACTICS), roles, archetypes (STYLE_TRAITS), archetype SIGNATURES, RARITY.
- `resolver.js`: `buildSnap` and `evaluate` (all duel modifiers, each with a `src` label), `resolve`.
- `battle.js`: the game state machine on Game Engine 2. Contains `simulate` and `preview`, and
  `duelTally(b)` (per-player duels won and lost, highlight plays). It tags engine events with `ev.card.actors` so
  Dynasty Lab credits stats to the players who actually won the duels.
- `packs.js`, `evolution.js`, `signatures.js`, `world.js` (AI programs' picks), `classes.js`, `roster.js`.
- `adapter.js`: turns a **real Dynasty Lab team** into a battle team. It builds the lineup from `roleDepth`
  (injured players sit), `toBattlePlayer`, `conditionsOf` (fatigue, composure, morale, out of position), and
  `programEdges` (scheme fit, weekly prep, crowd, familiarity). It also has `staffCommand` and `battleTeam`.

**The battle screen** (`forks/call-sheet/slice/`): `index.html`, `slice.js`, `fx.js`, `cards.js`. The same code runs
the standalone sandbox and the Dynasty Lab game day. In Dynasty Lab it runs inside an iframe (`srcdoc` =
`globalThis.CallSheetBundle`) and talks to the host through `window.parent.__callSheetDynasty`
(`launch`, `record(state,tally)`, `save`, `close`).
- The field shows 22 **player cards**. Hovering one shows the player tooltip.
- Matchup glow before the snap: green and red on your players, dashed amber on threats.
- After the play, duel winners flash gold and the playmaker pops.

**Dynasty Lab side** (repo root):
- `card-gameday.js`: the engine extension that holds all the glue. Sections:
  1. Save format: `normalizeCallSheet` runs on every load from `normalizeUniverse`.
  2. Integration framework.
  3. Game day and card-simulated games.
  4. UI: the Card Program panel, Card Settings, player and recruit cards, and the newsletter section.
- `game-engine-v2-record-run.js`: `recordV2GameLabResult({externalState})` records a finished battle
  transactionally (validation and rollback).
- `game-engine-v2-attribution.js`: `cardActor` makes stats duel-true.
- `tools/build.js` injects `card-gameday.js` and the core files, and embeds the battle bundle.
  `tools/harness.js` loads them headless.
- `brand-visuals.js` adds the "Coach with Cards" and "Classic Game Day" buttons on the next-matchup card.

**How the glue works:** `card-gameday.js` reassigns Dynasty Lab closure functions to wrap them:
`recordV2GameLabResult`, `simWeek`, `runOffseason`, `render`, `showPlayerProfile`, `showRecruitProfile` and
`renderNewsletter`. **Watch out:** some tabs call their renderer through `TAB_RENDERERS`, so after wrapping you
must also set `TAB_RENDERERS.<tab>` (as is done for the newsletter).

## Save: `universe.callSheet` (version 1)

`playbook` (decks, capacity, mastery, evolved, signatures, ringOfHonor, legendaries, record, packsOpened,
gamesPlayed), `combos`, `settings {mode, control, fast, sound, integrations{id:bool}}`, `games`, `seenHelp`,
`ai {teamId: playbook}` (programs on your schedule plus your rival, at most 40), `newsLog` (last 40 pulls and
evolutions, with year and week), `lastWeekNews`, `players {dlId: {w, l, big, games}}` (card careers), and
`moments` (last 60 newsletter moments). Everything is repaired or bounded in `normalizeCallSheet`. A newer
version refuses to load. **Opt-in:** none of this exists until the first Coach with Cards or
`DynastyCardGameDay.enable()`, so base Dynasty Lab behavior stays identical.

## Integration framework

`registerCardIntegration({id, label, about, hooks})`. The hooks:
- `launch(ctx)`: edit the battle config.
- `afterGame(ctx)`: after a card-simulated game.
- `weekTick(ctx)`: after `simWeek`. Push items onto `ctx.news` and they appear in the feed and the newsletter.
- `offseason(ctx)`.

Each integration appears automatically in **Card Settings** with an on/off switch. A throwing integration is
logged and skipped. Registered integrations: `program-edges`, `signature-graduation`, `scouting-fog`,
`practice-reps`, `ai-playbooks`, `sim-with-cards`. `INTEGRATION.md` lists every connection with its status and a
table of next ideas by hook.

## Done (newest first)

### Roster-driven battles, deck building and resume (2026-11-16)

Mark's priority: the actual players, traits, archetypes, role fit, tactics and synergies must determine battle odds.
Keep uncertainty; a stack of tactical bonuses must not erase a major talent disadvantage.

- Duel resolution now retains full trait averages and interpolates the existing 15–85% probability curve.
  Display bands no longer make 70 and 79 identical. On receiver-led pass Finishes, the receiver contributes 70%
  and the QB's relevant passing traits 30%; QB-led read duels keep their own existing formula.
- All 62 archetypes now have an ability. Added the 32 missing situational specialties, generally half-edges;
  an exhaustive test verifies every duel specialty can actually activate in its legal position. Existing scheme,
  prep, health/wear, morale, role familiarity, roster availability and staff wiring remain in the same resolver.
- Durability already contributed to contact duels; it now also delays game-workload fatigue. Each active player
  accrues one load per non-penalty snap; fatigue starts after 20 + durability/2 and ramps to −1 over 20 more snaps.
  Halftime recovers 10 load. Rotation preserves the resting player's freshness. These are game-local effects.
- Preview, coordinator evaluation and real resolution now share known fire, workload and drive-combo effects.
  Upgraded/evolved plays retain original play identity for abilities, tactical legality, screen counters and the
  Establish the Run combo. Island Protector now obeys its advertised no-tactic condition.
- The battle shows Ability / Effects / Edge and duel odds, with trait details and the pass blend on hover.
  Scouting fog still hides exact opposing grades and forecasts. Player tooltips show all seven traits and the
  archetype ability. Ready play-action combinations are marked on cards. Replay controls offer all/key moments.
- **Build Deck** is available before the first full-Dynasty game and on the Quick Battle program screen.
  Four unique base calls can be chosen from owned non-trick plays, provided one free unrestricted call remains.
  Active play and tactic piles retain their limits; storing/cutting a card now preserves it in `playbook.reserve`.
  Collection ownership, including stored legendary cards, survives upgrades, evolutions, saves and reloads.
  The shared editor lives in `core/playbook-ui.js` and saves a draft only on Save Deck.
- Five one-time achievements award real collection cards: first game (RPO Bubble), first win (Hurry-Up), all
  four offensive families in a game (HB Wheel), Establish the Run (Draw), three sacks (Stunt). Coached and
  simulated Dynasty games use the same award function. Pack choices remain available after every game.
- Battle checkpoints persist the exact state/RNG before replays and after information or personnel actions.
  Quick Battle offers Resume; Dynasty reopens the matching saved game. Finished-game and pack-pick markers
  prevent repeat rewards on refresh; the host also remembers the recorded battle seed. Deck editing is locked
  during a game. `activeBattle` is stored alongside the existing program save, not in a separate season system.
- Whole-hand validation happens before any play/tactic is spent. False-start refunds use the actual custom
  base sheet instead of a catalog card's original base flag.

Tests: `tests/card-deck-depth.js` covers probabilities, traits, every archetype, fatigue, evolved synergies,
collection ownership, achievements and deterministic resume. `tests/card-deck-browser.js` covers desktop/phone
editing, browser refresh, exactly-once rewards, real-roster deck launch and host resume. Both are registered.
Postseason card recording, alternate pass targets, and additional combo recipes remain follow-up features.


### Battle coaching improvements — 2026-11-16

- **Backfield packages:** Auto rotation (the depth-chart backup takes every fourth offensive snap), Starter,
  Power (power/technique), and Receiving (technique/IQ/versatility). Package selection uses existing player
  conditions, costs no Command, and persists for the current battle. Real injured backs and players occupying
  another lineup role are excluded. Both teams rotate; the standalone sandbox keeps its existing fixed roster.
- **Coach's read:** up to two short cues from the public Look, confirmed film and observed tendencies, visible
  before a card is selected. Unconfirmed pressure remains explicitly uncertain. Hidden opponent traits and the
  committed call are never inputs to these cues; exact forecasts remain suppressed under scouting fog.
- **Last snap:** a compact result and duel takeaway names the actual players and a labeled edge. A failed Gate
  explicitly marks Key and Finish as unreached, including in the ticker.
- **Historical personnel:** snap logs store lineup IDs; `b.personnel` stores the player cards once.
  `battle.snapLineup` resolves those IDs for replays, field portraits, duel careers and signature breakouts.
  Engine box-score actors continue to use the players on the field at resolution. Older battle saves still load.
- **Progression fixes:** fire streaks and signature breakouts no longer count Key/Finish after a failed Gate.
  Signature cards require their owner in the correct active role; a replacement cannot use a resting star's card.
- **Hand layout:** the card hand stays within its pane, has space below the fan, and scrolls when needed.

Regression coverage: `tests/card-coaching.js` (nine cases; included in full/slow suites), the existing engine and
integration tests, and `tests/card-gameday-browser.js` (package controls, field identity, reads, desktop/phone
hand access, result explanation and the existing record/retry/reward flow).

### Review fixes — 2026-11-16

- Failed coached-game recording now offers Retry Save and Return to Dynasty. It grants no game count,
  record, mastery, breakout or pack until the result is accepted. Retrying records and rewards the game once.
- Simulated card games now update the card win/loss record and award a pack. The existing scheme-aware
  coordinator chooses the card and trims the deck to capacity; manual games still let the player choose.
- AI playbooks track `recordYear`, so last season's record cannot block new-season packs and evolution reps.
  Older saves infer a reset when the team's current record has fewer games than the stored record.
- Both coached and simulated packs exclude legendaries already held by opponents. Coached pack seeds now
  include the dynasty matchup instead of sharing a null sandbox-team seed across dynasties.
- Save normalization rejects unknown/wrong-side deck cards and unusable signature metadata before a battle
  can crash. Broken base sheets retain the existing reset behavior; valid evolved cards and signatures survive.
- Practice mastery requires this week's preparation. Integration switches are fresh per dynasty. A blocked
  week does not run card progression hooks; completed-week card news and AI progression are autosaved.
- Switching Program edges off now removes scheme/preparation/crowd effects and staff Command bonuses
  on both teams, instead of silently reapplying adapter defaults.
- Scouting fog applies to trait bars, precise forecasts and matchup colors as well as grade labels. Duel replay
  uses the recorded play's sides, so a touchdown or turnover cannot swap which team's grades are hidden.

Regression coverage: `node --test tests/card-review.js` (also in `npm test` / `test:slow`) and
`node tests/card-gameday-browser.js` (fog, forced recording failure, retry, exactly-once rewards, pack and return).
Postseason remains the next substantial feature; this review does not enable it.

### Previous implementation

1. **Every player has a card** (30b6677):
   - Player pages show a battle card: role and depth, ability, grades, conditions and card career.
   - Recruit pages show a prospect card: scouted *ranges* (never true values), projected role, playbook usage
     and comparison with your starter.
   - Player conditions from health, wear, composure, morale and familiarity become labeled ±1 mods.
   - Card careers are recorded from coached and simulated games.
   - The weekly newsletter gets a Call Sheet section.
2. **Player cards on the field** (04e0550): portraits, hover tooltip, matchup glow, duel-win flashes.
3. **Card Program panel, Around the League news, Card Settings** (7c590f9).
4. **Integration framework**: simulated games played as card battles, scouting fog, practice reps, AI playbooks (664746d).
5. **Duel-true stats, validated saves, program edges, signature graduation** (c898988).
6. **Coach with Cards** game day on the real rosters, recorded as a real game (dd4a77d).

## Next steps (in priority order)

1. ✅ **Postseason card battles** (done Nov 17; kept for history). Conference championships, bowls and playoffs still use Classic Game Day
   (`cardGameBlocker` blocks phases other than `regular`). Postseason results go only to `universe.gameArchive`
   (see `latestUserPostseasonGame`, `app/09-careers-bowls.js`), not through `recordV2GameLabResult`. Build a
   transactional postseason recorder that mirrors the regular-season one (validation, rollback, attribution).
   Then let `buildLaunch` and `simulateCardGame` accept a postseason game. Add bowl, title and playoff packs.
2. Remaining rows of `INTEGRATION.md` → "Next integrations, by hook":
   - pitch recruits with your playbook (archetype fit raises interest through the existing pitch path);
   - nemesis recruits;
   - a signing-class pack reveal;
   - development stamps;
   - camp auditions;
   - coordinator card pools that leave with staff;
   - facilities raising playbook capacity;
   - booster packs;
   - Players of the Week feeding signature breakouts;
   - records broken mid-battle;
   - Legacy cards from retired numbers;
   - coaching-tree playbooks;
   - collection albums;
   - duel notes in box scores.
3. **Known gaps:**
   - In the standalone sandbox, AI-vs-AI games use quick results.
   - Recruit prospect cards use a deterministic estimate (`scoutHash`), not Dynasty Lab's per-domain estimates.
4. **Art pass (optional):** pack wrappers, legendary and signature card art, trophies, flame effects. Use PixelLab
   or Pixel Forge. Keep player faces on Dynasty Lab's portrait renderer (`DynastyPortraits`) so they match
   everywhere.

## Rules for this codebase (keep them)

- **No parallel systems.** Read Dynasty Lab's data and write back only through its own paths.
- **Labeled effects only.** Every duel modifier has a `src` the player can read.
- **Fail safe.** Wrap integration and UI code in try/catch. UI code must bail out headless: the harness has a
  stub `document` without `getElementById`.
- **Never leak hidden truth.** Recruits and opponents under scouting fog show ranges, never true ratings.
- Keep all 1,026 Dynasty Lab tests green, and register every new test.
- Escape all HTML (`escH`).
- Commit messages end with the attribution lines the session asks for. Don't merge to `main` or open PRs unless
  Mark asks.

## What Mark wants

- **Easy to understand,** with as little reading and busywork as possible.
- **Arcade presentation:** loud, over the top, Balatro-style payoffs, not spreadsheets.
- **Every dynasty unique:** strategic pack picks, no two playbooks alike.
- **Recruits matter in the card game.** Recruiting and development should drive the battles.
- **Everything connected:** the battler should use as much Dynasty Lab data as possible, and results should flow back.
- He likes ideas and pushback, but stay impartial.

# Call Sheet: handoff

## November 26, 2026 · V30 & V31 review fixes + card-battler upgrade

Built on `claude/v29-own-the-drive` (`fcc6731`). Implements the V30 gameplay/UX review fixes and the V31 card-battler & parity upgrade.

**V30 fixes.**
- **Tendencies, scouting & Four-Minute Offense:** Core offensive families (`run`/`quick`/`deep`) and defensive coverage (`man`/`zone`) now decay `-0.5` when another core call is made; `heat` (`pressure`) resets on successful `screen`, `draw`, or any pressure punisher, and `deep` resets on a successful `run`. Added `covTendFor(b)` and surfaced `covTend` across `lookFor`, `blindLook`, `presumedCall`, `lookCertainty`, `callReason`, `coachingRead`, and Quick Calls. `tacticRead` ranks duel-changing tactics ahead of info cards under scouting fog without calling `publicRead` or emitting `"Projected ..."` text. `seal_block` text names `Inline Mauler TE`. `four_minute_offense` now gives the defense `2` timeouts (`timeouts: [2, 2]`) so winning requires multi-snap clock management and diverges from `stacked_box`.
- **Verdicts & Dynasty opening drive:** `snapVerdict` and `matchupStory` credit Finish recovery on `[W, L, W]` (`success`) snaps and clarify `[W, W, W]` incomplete catches. `HEADSET_RULES` adds `openingDrive: true` by default and wires it into both Dynasty (`dynastyStart`) and Quick Battle (`startGame`), plus `Your drives` (`driveLogHTML`) on Dynasty final screens (without `#copyDriveLog`).
- **Deck floor, Facility 90, progression & mobile/laptop UX:** Added `MIN_CAPACITY = { wrinkles: 6, tactics: 6 }` (`underMinimum`) enforced in `playbook-ui.js`; Facility `>= 90` unlocks a 4th active Signature slot (`pb.signatureSlots`, `SG.slotsFor`); standalone `evoReady`/`evolutionScreen` checks `save.world?.userLineup`; removed `i === 0 ? 2 : 0` OVR bias in `CL.prospects`; preserved legal `sel.play` on `#personnel` / `#backfield` changes; added inline `[data-cmd-personnel]` in Full Call Sheet `.cmd`; pinned `#root.full-snap #hand .cmd` sticky at bottom on phone (`max-width: 860px`) while keeping `.notch` visible; and tightened laptop (`min-width: 861px and max-height: 820px`) Full/Quick heights.

**V31 card-battler & parity upgrades.**
- **Check at the Line (`type: 'redraw'`):** Once per series, cycle current wrinkles/calls (`1 CMD`, or `0 CMD` with a `Field Architect` / `Rhythm Distributor` QB or `Traffic Director` MIKE) with strict card conservation across `hand + draw + discard + exhausted`.
- **In-series momentum surges:** Coached snaps that sweep all 3 duels for positive yardage without resetting the series earn **Clean Execution (`+1 Command`)**; coached defensive snaps that win the Gate for `<= 0` yards earn **Stonewalled (`+1 Command`)** (capped at `seriesCommand`).
- **New combos & card juice:** Added 4 football-grounded combos (`rhythm_and_bruise`, `change_of_pace`, `bait_the_throw`, `heat_check`), `setupProgress` `SET UP 1/2` pips, `.tactic-syn` badges (`+2 GATE`, `+2 PROT`, `+2 SEP`, etc.), `.coin.rebate` for `+1 CMD COMBO` plays, `BEATS THE BLITZ` notches, and staggered `.card.dealt` entrance animations.
- **Quick Calls parity & modal clipping fix:** Added `.quick-bar` (confirmed tell chips, one-tap `Scout:` info buttons, `[data-quick-personnel]`, `.quick-badge` pills, and `↻ Check plays`) and switched `#modal` to `align-items: flex-start` with `margin: auto` on `.mwrap` + compact `@media (max-height: 820px)` / `@media (max-width: 600px)` rules so tall modals (`HOW TO PLAY`, `ROSTER`, `FINAL`) never clip at `390×844` or `1280×800`.
- **Challenge alternates & Dynasty parity:** Added `Face another look` alternates to `need_six` (`prevent_umbrella`) and `goal_line_stand` (`spread_pylon`), fixed `createChallenge` to target `other(b.user)` with `aiBias`, gated `aiReps` evolutions in `world.js` on `prog.lineup`, and added `P.repairMinimum` in `normalizeCardPlaybook` and `sanitizePlaybook`.

**Tests.** `tests/card-review-v30.js` (5 tests) and `tests/card-battler-v31.js` (5 tests) registered in `package.json` (`test` & `test:fast`), `forks/call-sheet/tests/battle.test.js` (25/25), `tests/card-people.js` (17/17), `tests/docs-consistency.js`, `tests/release-guard.js`, `node tools/lint.js` (0 errors), and Chromium verification at `1280×800` and `390×844`.

## November 19, 2026 · V29 own the drive (Claude)

Built on `release/v28` at `90104b4`. Implements the first release from the November 18 development roadmap, with
the review changes: milestones 1 and 2 shipped together, drive instrumentation, third/fourth-down-only certainty in
the forecast, "Face another look" pulled forward onto Four-Minute Offense, and the Max Protect matchup kept as a
regression test. Not built, by decision: a third playbook identity, new animations, more challenges.

**Own the opening drive.** `battle.create({openingDrive:true})` (Quick Battle passes it; Dynasty does not yet).
In Key Moments the coach's first offensive possession is claimed before the staff calls any snap on it
(`claimDrive`), whether the team receives or kicks, using the existing per-possession `coachedDrive`. Measured on
eight programs (`slice:<id>:0`, default settings, tutorial skipped): first offensive decision moved from 3rd down
with 2–3 Command in all eight to 1st down with 5 Command in all eight. When a coached possession ends (score, punt,
turnover, downs, half), `advance` returns `{kind:'drive_end',summary}`; `submit({type:'drive_end',coachNext})`
claims the next possession or returns to Key Moments. `auto` means Key Moments. Simulation, the guided tutorial
drive (snap mode), finals and challenges never pause. Rules and RNG streams are untouched: accepting every staff
call gives a byte-identical log, score and clock with or without the option (tested).

**Recaps and instrumentation.** Log entries now carry `drive` (snaps and kicks). `driveSummary(b,key)` gives
plays, net yards, result and one line ("3 plays, 0 yards. A third-down sack forced a punt."). `delegatedRecap(b,i)`
lists staff-only possessions since log index `i`; the slice shows them in the ticker and a collapsed
"While the staff called it" box. `driveLog(b)` records, per possession of the coach's team: who called it
(opening/next/chosen/Key Moments), first decision down/distance/Command (`telemetry.handoff`), setup cues shown and
used, and the Coach-next choice. Quick Battle stores the last 30 games in `save.playtest`; the final screen lists
"Your drives" with **Copy playtest log**.

**Setup cue.** `setupCue(b,req)` is attached to the coach's snap requests as `req.setupCue`: the first combo in
`data.COMBOS` that this drive's memory has set up and that an in-hand, legal, affordable card completes, only while
unspent this half (offense via `comboFor`; defense: Show and Bail). On 3rd/4th and 7+ it adds a caution that the bonus
helps one matchup, not the whole down. The slice shows it in the quick board and full sheet, with a Select button.

**Post-snap verdict.** `snapVerdict(e,side)` writes one or two short sentences: where the coach's tactic acted, then
the deciding duel, with "your/their". A tactic is credited only for a modifier on a duel the play reached
(`helped` / `outweighed` / `unreached` / `cost` / `none`), from resolver labels (`TACTIC_SRCS`). Example:
"Protection: won with help from Max Protect. Read the safety: their FS beat your Z." Used by the matchup story, last
snap box, pinned call, 4th-down and drive-end recaps (`lastCallRecap`/`lastUserCall` gain `verdict`).

**Forecast.** On 3rd and 4th down the objective reads "Convert" and the forecast adds what the look confirms and
what is still a guess (`lookCertainty`). Earlier downs are unchanged, to keep routine snaps uncluttered.

**Face another look.** `createChallenge('four_minute_offense',{look:'stacked_box'})`: same seed, rosters, clock,
down, distance and field position. The opposing coordinator is limited to loaded-box calls (`b.aiBias`, honored in
`aiDefense`, falling back to the full sheet if none is affordable). The result screen lists "Your calls" with
verdicts, "Retry this situation" (same look) and the alternate. The alternate is practice only: no sticker.

**Regression matchup.** Sunbelt Deep Cross into Lakeshore Cover 0, 1st and 10 at the 35, 2,000 paired rolls: Max
Protect raises protection wins 33.7% → 48.5% and first downs without a turnover 17.7% → 22.6%; 80% of pairs show the
same visible outcome. The roadmap's figures (24% → 48%, 12% → 22%) came from different game states; the test asserts
direction and size, not those exact numbers.

**Tests.** New `tests/card-own-the-drive.js` (13 tests, registered in `test` and `test:slow`). The full card chain
passes (350 node tests plus the standalone battle, adapter, save, integration and record checks); `npm run build` and
`npm run lint` are clean. Browser: a rebuilt standalone battle was driven in Chromium at 1280×800 and 390×844 (fresh
Quick Battle → 1st-down opening call with 5 Command → drive-end prompt → Coach next drive → 1st-down call; Four-Minute
result → Face another look), with no page errors or horizontal overflow. `card-gameday-browser` and
`card-pages-browser` pass. `card-default-browser` fails on "matchup and deck shortcut lead This Week"; it fails the
same way on untouched V28. Not run: the full Dynasty Lab suite, Safari/VoiceOver, people.

**Next.** Playtest this build against V28 with the two seeded drives in the roadmap's protocol and read
`save.playtest`. Decide on Dynasty opening drives after that.

## November 18, 2026 · V22 hold the look and film fixes (Claude)

Built on V21 source `2659b41d`. Follows the V21 review: playtest in Chromium (Quick Battle and a Quick Start
Dynasty), seeded checks in Node.

**Hold the look (Quick Out / Out-and-Up).** The corner's read of the quick out counts only Quick Outs from the same
personnel (`boundaryOuts`). Auto personnel moves to 10 on 3rd & 7+, so in 200 seeded games 1,528 Out-and-Up calls after
two completed outs got no credit. New `setupLook(b,side)` reports the count in this snap's grouping and the grouping
where a larger count still stands. The pair panel (`sameLookPair`) names the reset ("his read of the out starts over")
and offers `hold` {grouping}; the slice renders **Stay in 11 · balanced**, which calls `setGrouping` and keeps the
selected call. Personnel then stays manual until set back to Auto. Quick Calls keep Quick Out in reach until the corner
has seen two, and keep Out-and-Up on the shortlist when two stand here or in the personnel the coach can return to,
with the count in the detail. No rule of the double move changed.

**Film only describes what happened.** Every duel is rolled (`resolver.js` resolve), but a lost Gate ends the play.
Out-and-Up narration said "X got behind him" after "Hold the pocket ✗"; it now says "The pocket broke down before the
route developed" and `cornerStep.reached` records it. `decidingMoments` credited unreached duels and always the offense:
a game decided by a safety named the losing team's back as the deciding duel. It now uses reached duels and credits the
defense when the defense won the snap for the eventual winner.

**The film names the defensive call.** `matchupStory` returns `defense`: "Defense: Bear Front + Disguise. At edge block:
Loaded box −2, Run blitz −1." (scheme and situation edges only; player abilities stay in the duel view). The favored
loser is named: "Marcus Vance was favored (54%), but winning it was not guaranteed." ("the other side" read as the
opponent.)

**Tactic suggestion by value.** `tacticRead(..., b, fog)` on a live battle without scouting fog suggests the affordable
tactic that moves the public projection most (more than 0.25 utility), with "Projected first down 30% → 54%". Hand
order remains the fallback. Example: 3rd & 1, Outside Zone, Seal Block over Hard Count.

**3rd-and-7 comparison uses live personnel.** `thirdDownHands(saved,draft,lineup,team)` dresses the grouping Auto uses
on 3rd & 7 when the team has depth (four wide), so PA Boot and Power are no longer counted there and the package's edges
apply; the report names the personnel. `open()` takes `team`; slice and `card-gameday.js` pass the battle team.
Without depth the game stays in 11 too, so the old view is unchanged.

**Read Option prompt is opt-in** (headset `readOption`, default off). The cue states the end's real first step and the
textbook read wins in every measured matchup, so the prompt was a click, not a choice. The rework (a disguised first
step, QB IQ, keep traits that favor runners) is deferred.

**Tests.** New `tests/card-review-v22.js` (8 tests, registered in `test` and `test:slow`; all 8 fail on untouched V21).
Updated expectations, each from a rule change above: headset shape gains `readOption:false` (`card-save.js`,
`card-sideline.js`); `cornerStep` gains `reached` and the mesh tests opt in with `headset:{readOption:true}`
(`card-personnel-targets.js`, `tests/helpers/exercise-coaching-choices.js`). The card chain matches V21: the only
failure is `a cold dynasty archive is not mistaken for a signature player leaving football`, which needs
`fake-indexeddb` (not in the review zip). A rebuilt Quick Battle bundle was checked in Chromium: the staged 3rd & 8
showed the reset, the Stay in 11 button restored 2/2, the snap and film rendered, no horizontal scroll at 390 px.
Not run: the repository build, `npm run lint`, browser suites, the full Dynasty Lab suite, Safari.

**Not built:** recruit "deciding trait" lines (V22 proposal 2) and the Read Option rework (proposal 3).

## November 18, 2026 · Integrated V20

Applied Claude’s patch to the exact V19 source and verified its ten files against the supplied ZIP. Integration fixes keep hidden scouting grades out of Quick Calls, carry the halftime bracket onto the named eligible receiver, and use the same resolver inputs for reward odds and the practice snap. The featured-player counter follows actual catches and carries. Rest settings apply to simulated Dynasty games and package changes. Fourth-down staff decisions account for field goals that tie, win or cut a 9–11 point deficit to one possession. Film, box scores and narration now agree on recovery spots, sacks and enforced penalty yards.

A separate balance check used one generated Dynasty league (seed 2026), real depth charts, 20 game seeds and both home/away assignments. The widest starter-grade matchup in this league was Chicago Metropolitan vs Wyoming State. Chicago won all 40, with a median margin of 43.5 and a maximum of 61. In the neighboring mid-table matchup, Red Dirt won 25 of 40 against Detroit Metropolitan. Median absolute margin was 13.5 and the widest was 30. These are samples from those two matchups.

## November 18, 2026 · Claude’s original V20 review and pre-integration measurements

Built from the V19 review (`3ceb239d`). The review played a drive, swept 1,200 seeded games and traced the worst.

**Quick Calls follow the confirmed Look** (`battle.js` `snapDecisions`, `publicRead`). A confirmed real rush now leads the
clue ahead of a lean, and protection-dependent counters (PA Boot) stop being the counter while it is on; a screen takes
that place. On a live battle each approach's representative and the order come from the same public evaluation the full
sheet preview uses (presumed call from the Look, confirmed lean only, players on the field). The hidden defensive call
never enters (tested). Forced picks stay first: a genuine counter, a combo set-up that still suits the down (no run set-up
on 3rd/4th and 5+, nothing more than 1 utility below the best), the opener. Each choice carries `matchup`
{label, offense, defense, chip} for its first duel, shown on the card. Generic text no longer claims two safeties or
tight man coverage that the Look has not confirmed.

**Tryouts show odds** (`tryRewardCard`, `tryoutOdds`). The same film snap is evaluated exactly with and without the
card (tactics), or against the play/call it would replace. The single practice rep is still shown, labeled "one rep".

**Close-out, rested starters and score-aware fourth downs.** `protectLead` starts in Q3 at a 28-point lead. A new
headset rule `restStarters` (default on) rests RB, Z and TE for depth players once a second-half lead reaches 28,
returning them at 20 or less; AI teams always do. A `rest` log entry is shown in the ticker. The trailing team goes for
it on a makeable fourth down (5 or less, any distance inside two minutes) when three scores down in the second half, two
inside six minutes or any deficit inside two, unless a field goal would make it a one-score game. All of this is inside
the battle; Game Engine 2's `defaultFourthDown` is unchanged.

**Featured player** (sideline). Name one active skill player per half. On calls designed for him, his duels get +1 until he records two carries or catches. The defense can recognize his first productive touch. Film reports his actual touches and yards.

**Lean meter.** The offense's snap request carries `leanMeter` {family, count, threshold}; the Look shows it until the
lean triggers. The threshold is the coordinator's discipline, already public as the aggressive/disciplined label.

**Halftime** names the receiver with two or more 10+ yard catches (`threat`) and points the Bracket suggestion at him.

**Bug fixed: yards past the goal line.** About 4% of snaps narrated gains beyond the goal line (seed `blow-4-51`:
"for 33" from the 1). Log entries, drive memory and film now count to the goal line, like the box score already did.

**Sweep, 200 games per row, matched seeds and sides swapped.** Favorite win rates and median margins are unchanged
(gap 12: 91.5% → 91.0%, median 21 → 21). Tails shrink: gap 12 p99 72 → 55; gap 20 p99 93 → 76; worst game 93–0 → 76–0;
margins of 70+ at gap 20 10 → 4. Talent mismatches beyond 20 rating points (real Dynasty extremes) were not sampled.

**Tests.** New `tests/card-review-v20.js` (11 tests, registered in `test` and `test:slow`). Updated expectations:
headset shape gains `restStarters:true` (`card-save.js`, `card-sideline.js`); `card-people.js` breakout fixture now
takes the first of a short seed range instead of one fixed seed, because the new rules change that seed's game. The card
chain passes except `a cold dynasty archive is not mistaken for a signature player leaving football`, which fails on
untouched V19 too in an environment without `node_modules` (`fake-indexeddb` missing). Browser suites, the full
Dynasty Lab suite and phone-width checks were not run; the repository build and its lint were not run (errors-only
ESLint on the changed files is clean).

## November 18, 2026 · Coaching and classic games

Quick Battle and Dynasty support two-down territory, Read Option assignments, paired Inside Zone and PA Boot calls, and persistent Key Moments settings. Reward cards offer an isolated tryout before selection. Dynasty stores opponent film for rivalry prep and the final possession of newly recorded one-score card games. Game Center → Summary opens that possession in a separate, read-only replay. Games ending in a third-overtime shootout are excluded.

## November 18, 2026 · V17 reconciliation

The `call-sheet-review` checkout now includes the gameplay changes from the published V17 Quick Battle and Dynasty pages alongside the later review work. Sites recorded a successful V17 deployment from hosting commit `978675190a6f165e8c11b7ef0d191afd4887ae10`. The earlier release review identified its game source as `41f41463c0f0924953c6f2af783fc3933748e304`. GitHub could not resolve that game commit.

The V17 battle document embedded in the live Dynasty page had SHA-256 `1a63b3338490ea981b8940ff40512e99d64e1d4f97e0f6387d577c8c5e23e2ab`. Its game body and styles matched the standalone release. Comparing those pages with the verified V15 snapshot identified changes in ten modular files. A three-way merge preserved both the V17 changes and the review edits, including the manual clock controls alongside the coordinator’s late-lead behavior.

Local build `6547da7d894b` passed 248 card regressions, 18 standalone battle tests, the real-roster adapter check, and lint. Quick Battle and Dynasty embed byte-identical battle documents. A guided offensive snap ran in Safari. The automated Chromium browser suite was blocked at launch by macOS permissions. This checkpoint shipped as V18 from hosting commit `ec50e808d9a0cbcd0ea629b9ef217695fa5629d2`.

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

## Round 2 from IDEAS-2.md — November 17, 2026 (latest)

Built (tests in `npm test`): `card-special-teams.js`, `card-eras.js`, `card-dynasty-moments.js`, `card-collecting.js`.
- **Special teams** (battle.js "special teams and situations"): kicker/punter ratings move kicks (adapter supplies
  `team.specialists`), Fake Punt / Fake Field Goal (`fourthOnly`), Onside Kick and Swinging Gate (`special` tactics that
  never enter a hand), personnel groupings (`GROUPINGS`, `setGrouping`), Kill Kill (`countered` effect flag), Fade, real
  timeouts for timeout cards, red-zone rule, halftime weather turn. Game Engine 2 gained opt-in hooks
  (`attemptFieldGoal(state,{adjust})`, `punt(state,{netAdjust})`, `state.onside`, `state.twoPointCall`); unused, nothing
  changes. The v0.10.0 calibration was re-run (identical numbers) and restamped.
- **Eras**: Spinner, Buck Lateral, Triple Option, Split Veer, Shallow Cross, Curl-Flat, 46, Zone Blitz, Two-Way Star
  (`versatile` flag); Single Wing and Two-Way eras; Single Wing, West Coast albums; era ribbons on cards.
- **Dynasty moments** (card-gameday section 12, `dynasty-moments`): bowl-themed packs (`packs.openPack` `favor`),
  signature honor tiers (`signatures.withTier`, tier 3 = +1), held rivalry trophy edge, coaching-tree cards leave with
  their coach (`callSheet.schemeGrants`), Program History album (`callSheet.milestones`), Walk-On badge, spring game.
- **Collecting**: cosmetic foil/gold finishes (`packs.rollFinish`, `playbook.finishes`), team-colored card backs, Ring of
  Honor binder in the Card Program.
- Gaps closed after: Quick Kick (`quickKick`, `thirdOnly`, punts inside resolveSnap), drill timeouts stop the clock
  (trailing offense or trailing defense, logged), walk-on breakouts (10%/week once a walk-on starts, once ever), spring
  game standout -> `callSheet.springStandout` -> added to DL's spring camp battles via the `buildCampBattles` wrapper,
  trophy case in the Card Program. Tests: `tests/card-gaps.js`. Two-way players remain a tactic/era (one position each in DL).

## Balance, combos, card mode, visuals — November 17, 2026

- **Balance** (`tools/balance-report.js`, `tools/sim-report.js`, guards in `tests/card-balance.js`): game-day form
  (`battle.js` `FORM_SIGMA`, seeded per game, labeled "X sharp/flat today") so a 12-point talent gap wins ~92%, not
  100%. Checkdowns roll the interception first, need the protection to hold, `CHECKDOWN_RATE` .3 (~1.5% of passes).
  Trick plays are truly once per game (the halftime reshuffle used to bring them back). Dagger toned down.
  Latest numbers: `tools/latest-report.txt`, `tools/latest-balance.txt`.
- **Combos** (`data.COMBOS`, `battle.comboFor(b,play,call)`, `tests/card-combos.js`): Establish the Run fixed (it fired
  after any two plays); six new recipes, two defensive; each once per half per team.
- **Card mode** (default): classic versions are hidden (Classic Game Day, Watch, the duplicate Open Game Day, classic
  roster view); Game Day leads with Coach with Cards. `applyCardMode()` runs on render, roster paint and setting changes.
- **Visuals**: battle cards carry origin ribbons (Legacy, coaching tree, two-minute drill, trick, weather, milestone) and
  a Legacy frame; the deck editor and reward packs use shared card faces (`playbookUI.faceHTML`); reward packs open from a
  wrapper. The breakout screen now names the right postseason pack.
- Round-2 ideas from football history: `IDEAS-2.md`.

## The card game is the game — November 17, 2026

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

## Dynasty Lab decision bridge — November 17, 2026

The Card Program now includes a read-only Dynasty Lab → Game Day panel. It shows the current
opponent's valid preparation reps by card, per-side staff teaching rates, and direct links to
Roles & Depth, Development, Staff and Recruiting. Scout & Prepare uses the existing Game Day
router directly, bypassing the card-first launch shortcut so the original preparation board remains
reachable. An active battle is labeled as a locked launch snapshot and does not offer that prep link.
This adds no new economy, reward, save field or simulation modifier. Integration switches and stale/
postseason preparation are respected. `tests/card-dynasty-bridge.js` checks read-only behavior against
the whole universe, current-week prep, toggles, active saves, legacy staff and escaped names.

## Dynasty availability governs card games — November 17, 2026

Scheduled card games now use Dynasty Lab's canonical `gameAvailable()` rules, not only injuries.
Redshirts, academic holds and current-week sit decisions cannot enter the starting lineup, RB
rotation or kicker/punter slots. The launch serializes excluded IDs into each side's program info;
this rule remains active with program bonuses disabled. Both the coached launch and separate
postseason simulation path apply it. Existing saved battles retain their original lineup snapshot.
Depth cards, deck eligibility, teaching support, opponent matchup cards and nemesis participation
use the same eligible lineup. Spring practice remains separate: redshirts may practice.
No rewards, save schema, or independent eligibility rules were added. `tests/card-availability.js`
covers real coached/sim launch, both teams, specialists, expired rest, missing specialist depth,
postseason rewards, resumed snapshots and unavailable nemesis moments.

## Signature careers in Dynasty

Prospect and roster profiles now preview the named signature their current role and public
archetype could produce; this is not an unlock or an extra scouting rating. Earned profiles use the
same final card definition as game day, including legacy effects and award tiers, and distinguish
the game deck from stored collection cards. Archived profiles show recorded card duels without
inventing active ratings. The Ring of Honor opens the existing player archive, and new retirements
retain the four recorded duel-career counters even if the rolling ledger expires. Loading an older
save preserves counters still available there; counters already discarded cannot be reconstructed.
No pack odds, card power or unlock conditions changed. See the new cases in `tests/card-people.js`
and `npm run test:card-journey-browser` for the profile-to-binder flow.

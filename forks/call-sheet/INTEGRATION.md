# Integration map: everything in Dynasty Lab feeds the card battle

The rule for the fork: **no parallel systems.** Every card-battle number comes from something Dynasty Lab already
tracks, and every battle result flows back into Dynasty Lab's own records. Status: ✅ done · ▶ next · ○ planned.

## The integration framework (`card-gameday.js`)

Each connection is a small named **integration** registered with `registerCardIntegration` (or, from a
presentation module, `DynastyCardGameDay.register`). It plugs into one or more hooks:

| Hook | When it runs | Context | Typical use |
| --- | --- | --- | --- |
| `launch` | Building any battle: coached or simulated | `{cfg, g, home, away, me, opp, userSide}` | Add edges, fog, opponent decks, callouts to `cfg` |
| `afterGame` | A card-simulated game has been recorded | `{b, userSide, me, opp, coached:false}` | Mastery, news, awards from the battle log |
| `weekTick` | After every simulated week (`simWeek`) | `{week, year, news}` | AI playbooks, league-wide effects, news items |
| `offseason` | After `runOffseason` | `{year}` | Graduation ceremonies, staff departures, signing-class packs |

Rules every integration follows:
- **No parallel systems.** Read Dynasty Lab's own data; write back only through Dynasty Lab's own paths
  (`recordV2GameLabResult`, the save at `universe.callSheet`).
- **Labeled effects only.** A duel bonus is an edge with a `src` the player can read in "The read" and the clash.
- **Fail safe.** A throwing integration is logged and skipped. Tested by `tests/card-integrations.js`.
- **Switchable.** `callSheet.settings.integrations[id]=false` turns it off; the save keeps the choice.
- **Opt-in for the dynasty.** Nothing changes until `universe.callSheet` exists: the first Coach with Cards, or
  `DynastyCardGameDay.enable()`. Base Dynasty Lab behavior and all 1,026 of its tests are untouched.

### Registered integrations

| id | Hooks | What it does |
| --- | --- | --- |
| `program-edges` | launch | Scheme fit (per side), weekly prep, home crowd, coordinator play-calling |
| `signature-graduation` | launch | Signature cards retire to the Ring of Honor with graduates; transfers take theirs |
| `scouting-fog` | launch | Film confidence below 82 shows opponent ratings as ranges in the read and the clash |
| `practice-reps` | launch, afterGame | Each prep focus adds 5 mastery reps to the matching cards every week |
| `ai-playbooks` | weekTick, launch | Programs on your schedule (and your rival) open packs, pick by identity and evolve; you face their decks |
| `sim-with-cards` | (record wrapper) | Simulated games are card battles with your playbook, recorded with duel-true stats |

### Next integrations, by hook

| Idea | Hook(s) | Reads (Dynasty Lab) | Writes |
| --- | --- | --- | --- |
| Recruit prospect cards with progressive reveal | presentation | `recruits[]`, scouting confidence | — (display) |
| Pitch with your playbook (interest bonus for archetype fit) | weekTick | recruit archetypes, your evolved cards | recruit interest through the existing pitch path |
| Nemesis recruits (players you lost) | launch | recruiting history, opponent rosters | edge on that player's duels |
| Signing-class pack reveal | offseason | commitments | presentation only |
| Visible development stamps | afterGame / offseason | development receipts | card grade before and after |
| Camp and position-battle auditions | presentation + camp | camp battles | depth chart through the existing camp path |
| Coordinator card pools, cards leaving with staff | offseason | staff hires and departures | `callSheet.playbook` |
| Position coaches speed evolution | afterGame | staff development ratings | mastery |
| Facilities raise playbook capacity | offseason | `facilities` | `playbook.capacity` |
| Booster pack (once a season) and admin mandates | weekTick | NIL, admin confidence, mandates | packs; confidence through existing events |
| Players of the Week and awards feed breakouts | weekTick | `players-of-week.js`, awards | signature breakout eligibility |
| Records broken mid-battle | afterGame | records | ceremonies through the existing system |
| Bowl, playoff and title packs | weekTick (postseason) | bowls and playoff results | packs |
| Battle moments in news and storylines | weekTick / afterGame | — | news events through the existing feed |
| League-wide scouting of overused plays | weekTick | AI playbooks, your play log | an edge for opponents |
| Retired numbers as Legacy cards | offseason | `retired-numbers.js` | Legacy card for a future player |
| Coaching-tree cards | offseason | coaching tree | AI playbook of the new program |
| Collection albums | presentation | history | — |
| Duel moments in box scores and the archive | afterGame | archive record | play log annotations |

## People → duels

| Dynasty Lab data | Battle effect | Status |
| --- | --- | --- |
| Seven traits (`speed`…`versatility`), archetype (`style`) | Duel grades and archetype signatures | ✅ adapter |
| Depth chart (`roleDepth`), injuries (`injuryWeeks`) | Who plays each battle role; injured players sit | ✅ adapter |
| Class year, jersey, portrait seed | Player cards, portraits, Ring of Honor | ✅ adapter |
| `health` / `wear` (fatigue) | Tired players take −1 on duels late in games | ○ |
| `morale`, `composure` | Composure duels on 3rd down and in rivalry games | ○ |
| `positionFamiliarity` | A player out of position takes −1 until familiar | ○ |
| Development and training focus | Traits change, so duels change. Training focus also gives mastery reps toward card evolution | ✅ / ○ |
| Players of the Week, awards | Count toward signature-card breakouts | ○ |
| Graduation, eligibility, portal transfers | Signature cards retire to the Ring of Honor (using `retired-numbers.js`); a transfer brings his signature card | ▶ |

## Program → deck

| Dynasty Lab data | Battle effect | Status |
| --- | --- | --- |
| `offScheme` / `defScheme`, scheme familiarity | Coordinator AI (run/pass mix, lean discipline); scheme-fit cards get +1; a new scheme's cards start Raw | ✅ partial / ▶ |
| Staff (OC, DC, position coaches) quality | Coordinator signatures (one free tactic per series), Command, evolution speed | ▶ |
| Facilities | Playbook capacity (14 → 16 → 18) | ○ |
| Prestige and fan support | Home crowd: the visiting offense risks false starts on 3rd down | ○ |
| Weekly preparation and opponent scouting | Opponent Look facts start Confirmed; prepared counters cost 1 less | ▶ |
| Scouting confidence | Opponent players you haven't scouted show their grades as ranges in the duel chips | ○ |
| Rivalries and trophies (`rival-watch.js`, trophy art) | Protected rivals trigger rivalry week and the rivalry pack ✅; the real trophy turntable ○ | ✅ / ○ |
| `game-conditions.js` weather and stadium | Duel modifiers driven by Dynasty Lab's real forecast for the game; the conditions are recorded with it | ✅ |

## Results → dynasty

| Battle output | Dynasty Lab system | Status |
| --- | --- | --- |
| Final Game Engine 2 state | `recordV2GameLabResult({externalState})`: schedule, records, archive, player stats, rankings, validation, rollback | ✅ `tests/card-battle-record.js` |
| Who won each duel | Attribution with the actual ball carriers and targets (currently Dynasty Lab's share-based attribution) | ▶ |
| Breakouts, combos, legendaries | Season moments, storylines, news | ○ |
| Card playbook, packs, mastery, combos, settings | Stored in the save at `universe.callSheet` and autosaved after the pack ✅; versioned validation ○ | ✅ / ○ |

## Next build steps

1. ✅ **Coach a real game with cards:** "Coach with Cards" on the next-matchup card opens the battle full-screen
   (`card-gameday.js`, frame built from the slice by `tools/build.js`) on both real rosters and depth charts,
   with the real forecast. The final records through `recordV2GameLabResult({externalState})`, and the pack
   and evolutions save into the dynasty. Proven by `tests/card-gameday-browser.js`. Classic Game Day stays
   available.
2. **Save integration:** the playbook, mastery, signatures and combo book stored on the controlled team, versioned
   and validated.
3. **Duel-true attribution:** stats credited to the players who actually won and lost the duels.
4. **Program wiring:** schemes, staff, weekly prep, real weather, scouting confidence, and the rest of the ▶ rows.

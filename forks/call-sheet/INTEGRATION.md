# Integration map: everything in Dynasty Lab feeds the card battle

The rule for the fork: **no parallel systems.** Every card-battle number comes from something Dynasty Lab already
tracks, and every battle result flows back into Dynasty Lab's own records. Status: ✅ done · ▶ next · ○ planned.

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
| Rivalries and trophies (`rival-watch.js`, trophy art) | Rivalry packs and the real trophy turntable | ○ |
| `game-conditions.js` weather and stadium | Duel modifiers (already in the battle) driven by the real forecast | ▶ |

## Results → dynasty

| Battle output | Dynasty Lab system | Status |
| --- | --- | --- |
| Final Game Engine 2 state | `recordV2GameLabResult({externalState})`: schedule, records, archive, player stats, rankings, validation, rollback | ✅ `tests/card-battle-record.js` |
| Who won each duel | Attribution with the actual ball carriers and targets (currently Dynasty Lab's share-based attribution) | ▶ |
| Breakouts, combos, legendaries | Season moments, storylines, news | ○ |
| Card playbook, packs, mastery | Stored on the controlled team in the save (versioned, validated) | ▶ |

## Next build steps

1. **Coach a real game with cards:** "Coach with cards" on game day opens the battle screen on both real rosters
   and records through `recordV2GameLabResult({externalState})`.
2. **Save integration:** the playbook, mastery, signatures and combo book stored on the controlled team, versioned
   and validated.
3. **Duel-true attribution:** stats credited to the players who actually won and lost the duels.
4. **Program wiring:** schemes, staff, weekly prep, real weather, scouting confidence, and the rest of the ▶ rows.

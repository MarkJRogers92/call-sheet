# Call Sheet: put V31 on the live Site
**For: GPT (ChatGPT Sites). From: Antigravity session, 26 November 2026. Owner: Mark Rogers.**

Mark wants the live Call Sheet playtest site updated from V29 to V31 for a playtest.
- Publish only. Do not change game code.
- Do not merge or force-push any branch in the game repository.

## 1. What to deploy

| | |
|---|---|
| Game repository | `MarkJRogers92/call-sheet` |
| Branch | `release/v31` (and `main`). |
| Build commit | `5937f52c7fb569d59931b6a8f1c9f92516c16dca`. Later commits on this branch change only docs, so the built pages are identical. |
| Dynasty page (root `index.html`, committed build) | sha256 `c1cdaa8c6983260395e92612f8ed0d4bedc3b07028b00c6807604219eb8f5c00` |
| Standalone battle page (generated, see step 2) | sha256 `e82acb16e817028f19a528b7f39a5100df115fe6887a6f9246b5b234cecb583f` |
| App version string | Still `0.36.0`; not bumped. Call it **V31** in the release notes. |

Both hashes were checked from a clean tree with Node 24.20.0. If yours differ, stop and report the difference. Do not deploy.

## 2. Build and check (from a clean clone)

```sh
git clone --branch release/v31 https://github.com/MarkJRogers92/call-sheet.git
cd call-sheet
git checkout 5937f52c7fb569d59931b6a8f1c9f92516c16dca
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
- **Before you change anything, write down the current hosting commit (the V29 deployment `2baa39fd9c47bd6f38d8074f1268e7c6871cbe23`).** It is the rollback point. Put it in the README entry and in your report.
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
- the game build commit `5937f52c7fb569d59931b6a8f1c9f92516c16dca`
- the two hashes
- the V29 hosting commit `2baa39fd9c47bd6f38d8074f1268e7c6871cbe23`
- the label "V31 (0.36.0)"

Commit it to the hosting repo, then deploy.

**Note:** pushing to the hosting repo and deploying the Site are two separate operations. Do both.

## 4. Verify the live site

1. Download both live game pages. Their sha256 must equal the two hashes above. If a service worker serves an old copy, reload once.
   - https://call-sheet-playtest-mark.markjrogers92.chatgpt.site/battle/
   - https://call-sheet-playtest-mark.markjrogers92.chatgpt.site/dynasty/
2. The landing page https://call-sheet-playtest-mark.markjrogers92.chatgpt.site/ must be unchanged.
3. Smoke-test in a **private window**, so Mark's live save is never touched. **Do not clear site data for this domain.** On the battle page:
   - **Opening drive & Quick Calls.** Pick any team → Play → Kickoff → **Skip guide · Start game**.
     - The first call board you see is your offense on **1st & 10** with **5 command**.
     - Quick Calls shows `.quick-bar` with personnel selector and `Scout:` info buttons, plus `↻ Check plays` (`1 CMD`, or `0 CMD` for `Field Architect` / `Rhythm Distributor` QB).
   - **Full Call Sheet & combos.** Toggle **Full call sheet**: tactic synergy badges (`+2 GATE`, `+2 PROT`, `+2 SEP`) appear when a compatible play is selected, and `SET UP 1/2` pips appear after step 1 of a 2-snap combo.
   - **Phone width (`390px`).** `#modal` (`HOW TO PLAY`) and `#root.full-snap #hand .cmd` (sticky bottom command bar) fit cleanly with zero horizontal overflow or clipping.
   - **Challenges.** Open `…/battle/?mode=challenges`:
     - **Four-Minute Offense** gives the defense **2 timeouts** (`Up 2 · 1:48 · 3rd and 3 · Defense has 2 timeouts`) and requires multi-snap clock management.
     - **Need Six**, **Goal-Line Stand**, and **Four-Minute Offense** all offer **Face another look** on the drive result screen.
4. Dynasty page: start a quick new dynasty, check **Deck Room → Build Deck** (minimum 6 plays and 6 tactics per side enforced), and coach Week 1 — Dynasty now **does** coach the opening offensive drive from **1st & 10** by default (`openingDrive: true` in Key Moments headset).

## 5. Release notes (what players will notice)

- **Check at the Line (Redraw):** Once per series, swap your wrinkle plays or defensive calls (`1 CMD`, free with `Field Architect` / `Rhythm Distributor` QB or `Traffic Director` MIKE).
- **In-series momentum surges:** Sweeping all 3 duels cleanly (`Clean Execution`) or stuffing a run at the Gate for `<= 0` yards (`Stonewalled`) refunds `+1 Command` in the series.
- **Four new combos & 1/2 setup pips:** *Tempo Body Blow*, *Change of Pace*, *Bait the Throw*, and *Bring the House*, plus `SET UP 1/2` indicators and tactic synergy badges (`+2 GATE`, `+2 PROT`, `+2 SEP`).
- **Quick Calls upgrade:** Confirmed pre-snap read chips, one-tap `Scout:` info buttons, personnel switching, and counter/combo badges right in Quick Calls.
- **Dynasty opening drives & deck balance:** Dynasty coaches now own their opening offensive drive from 1st & 10 by default, decks require at least 6 plays and 6 tactics per side, and Facility 90 unlocks a 4th active Signature slot.
- **All three Drive Challenges** (*Need Six*, *Goal-Line Stand*, *Four-Minute Offense*) now have **Face another look** alternate coordinator puzzles.

Full details: `forks/call-sheet/HANDOFF-GPT.md`.

## 6. Report back

Send Mark:
- the new hosting commit
- the V29 hosting commit (`2baa39fd9c47bd6f38d8074f1268e7c6871cbe23`, rollback point)
- the two live hashes
- each smoke-test item from step 4, marked pass/fail

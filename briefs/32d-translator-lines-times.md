# Stage 32d — translator: subway lines read "Line 2", clock times keep "08:12" (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section) and `web/AGENTS.md`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator (EN crawl of the landing, tour, sim A/B, both replays and the chat; every romanization logged)
The customer saw the browser tab read `Ithaca — living Bogo Goreuneun home`. The orchestrator added the missing table entries (`en.js`, `en-words.js`). Two bugs are in the code (`web/src/i18n/translate.js`):

1. **`2호선` → `No. 2seon`.**
   - `localizeNumbers` (~line 80) turns every `(\d+)호` into `No. N`, so `2호선` becomes `No. 2선`, and the leftover `선` is romanized.
   - Seen in the sim's route lines (`08:35 2호선 잠실→강남` → `08: 35 No. 2seon Jamsil→Gangnam`), the crowding events (`2호선 잠실→강남 혼잡 93%`) and the map legend (`2호선` … `9호선`).
2. **`08:21` → `08: 21`.**
   - `wordFallback` splits on `:` (`/([·(),:])/`), joins the tokens with a space, and the clean-up only removes the space *before* `:`.
   - Every clock time inside a fallback line gets a space after the colon: `08: 21 Lake Palace`, `Day 2 08: 12 A …`.

## Change (`web/src/i18n/translate.js` only)
1. In `localizeNumbers`, before the `호` rule: `(\d+)호선` → `Line $1`. `(\d+)호` (unit/room numbers) stays `No. $1`.
2. In `wordFallback`, guard a colon between digits the way the digit comma is guarded (`COMMA_GUARD`), so `\d:\d` is never a split point and comes back as `08:21`. A colon after a word (`직장: 판교`) still splits as today.
3. Nothing else changes.

## Test — new `web/tests/translator-32d.test.js`
With the real tables (`createTranslator({ phrases, patterns, words: WORDS })`):
- `2호선` → `Line 2`; `2호선 잠실→강남 혼잡 93%` → `Line 2 Jamsil→Gangnam crowding 93%`; `9호선` → `Line 9`.
- `101호` still has `No. 101`.
- `08:35 2호선 잠실→강남` → contains `08:35` and `Line 2`, and no `08: 35`.
- `2일차 08:12 A 2호선 잠실→강남 혼잡 93%` → starts with `Day 2 08:12 A Line 2`.
- `직장: 판교` → still `Workplace: Pangyo` (or whatever it gives today; assert it is unchanged from before your edit).
- **Orchestrator table entries** (no code needed, pin them):
  - `Ithaca — 살아 보고 고르는 집` → `Ithaca — The Pre-living Agent for Your Next Home`;
  - `Ithaca — A · 레이크팰리스` → `Ithaca — A · Lake Palace`;
  - `Ithaca — 송파구 잠실역 인근` → `Ithaca — Near Jamsil Station, Songpa-gu`;
  - `27.2초` → `27.2 s`;
  - `21건` → `21 deals`, `1건` → `1 deal`;
  - `프로필 읽기(1개 물어봄)` → `Reading your situation (asked 1)`.
- **Keep green:** every test that mentions `localizeNumbers`, `wordFallback`, `translate(` or `en.js`.

Run only (**run it before you finish**):
```
cd web && node --test tests/translator-32d.test.js $(grep -lE "localizeNumbers|wordFallback|createTranslator|i18n/en" tests/*.test.js | tr '\n' ' ') 2>&1 | tail -15
```
If a kept test pins the old `No. 2…선` or `08: 21` output, update it and name it. If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
`en.js`, `en-words.js`, `en-table.js` (the orchestrator owns them), and everything outside `translate.js` and the new test.

## Final message
Changed files, one line each. Updated test files. Nothing else.

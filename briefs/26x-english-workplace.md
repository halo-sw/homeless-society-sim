# Stage 26x — English situations read the workplace and the budget; the save confirmation names the homes (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator
**Live runs.** In English, "I work in Pangyo, jeonse under 200M won, alone" gave candidates all over Seoul with no commute in 2 of 3 runs.

**Direct calls.** Running `extract_profile` from `src/profile.js` on English text shows three gaps:

| Text | Result |
|---|---|
| `New hire commuting to Pangyo: salary 40M won, savings 50M won, jeonse under 200M won` (the English of example card 1) | **no workplace**: "commuting to" is not a pattern, and ":" is not in the `tail` look-ahead |
| `Dual-income engaged couple, working in Gangnam, jeonse under 400M won, 59m² or larger` | **no workplace**: "working in" is not a pattern |
| `I work in Pangyo. Find me a jeonse home to live alone, under 200M won` | workplace OK, **no `depositMax`**: "under 200M won" is 34 characters after "jeonse", and the English deposit window is 24 (`nearMoney(src, /jeonse\|deposit/i, krwMonies, 24)`, ~line 512) |
| Korean `판교로 출근하는 신입, 연봉 4천, 모은 돈 5천, 전세 2억 이하` | everything filled (keep it so) |

**Save confirmation.** When the guard falls back to `actionConfirmation` (`src/consult/guards.js` ~559) on a later turn ("Save 1 and 2"), the names are missing, so it reads "A, B를 찜했어요." → "Saved A, B."
- Cause: names come only from `candidates` in **this turn's** tool results.
- The candidates were found in an earlier turn.

## Change
1. **`src/profile.js` workplace patterns** (the English list, ~line 355):
   - Accept `commut(?:e|es|ing) to`, `work(?:s|ing)? (?:at|in|near|around)` and `(?:job|office) (?:is )?(?:at|in|near)`, as well as the existing forms.
   - Add `:` to the `tail` look-ahead set (`[.,;:!]`). Also stop before ` for `, ` with ` and ` to ` when they follow the place.
   - The mention still resolves with `resolveEnglishStation(mention, stations)` (or the US place resolver where it applies). Nothing resolves that did not before.
2. **`src/profile.js` English deposit:**
   - When the tenure is jeonse, wolse or public, an English cue `under|up to|at most|no more than|max(?:imum)?|budget(?: of| is)?` directly before a KRW amount also counts as the deposit cue.
   - Keep the existing rule that every number must appear in the customer's words.
   - Do not claim an amount that is already the salary or the savings: same `nearMoney` order as today, salary and cash first.
   - Widen the `jeonse|deposit` window from 24 to 40 characters.
3. **Tool description** (`src/consult/tools-search.js` `extract_profile`, ~line 295): `text` is "The customer's words, verbatim (Korean or English). Do not translate or paraphrase."
4. **Save confirmation names:**
   - `find_homes` and `find_public_rentals` (tools-search.js) remember the last list on the session: `session.lastCandidateNames = { [id]: name }`, replaced on each call.
   - `actionConfirmation(toolResults, opts = {})` also takes `opts.names` (an id → name object) and uses it when this turn's results have no name for a picked id.
   - The three callers in `src/consult/agent.js` (~364, ~395, ~402) pass `{ names: session.lastCandidateNames }`. Find how `session` is reachable there; if it is not, pass the names through the same object the tools get.

## Test — `web/tests/english-profile-26x.test.js`
Call `extract_profile` from `src/profile.js` with `{ stations: ["판교", "강남", "잠실"] }`:
- example 1 (table above): `workplaces.value[0].text === "Pangyo"`, `resolved.station === "판교"`, `depositMax.value === 200000000`, `salaryAnnual` and `cash` unchanged from today;
- `Dual-income engaged couple, working in Gangnam, jeonse under 400M won, 59m² or larger` → workplace `Gangnam` resolved to `강남`, `depositMax` 400000000, `sizeMin` 59;
- `I work in Pangyo. Find me a jeonse home to live alone, under 200M won` → `depositMax` 200000000;
- `I'm commuting to Jamsil every day, monthly rent` → workplace resolved to `잠실`;
- the Korean example still gives the same fields as before (copy today's values into the test);
- `I work in Pangyo, salary 40M won` → no `depositMax` (no tenure cue).

`actionConfirmation`: a result `{ ok: true, ui: { action: "pick", ids: ["x1", "x2"] } }` with `{ names: { x1: "판교푸르지오", x2: "봇들마을" } }` → contains both names.

Keep green: every `tests/profile*`, `tests/english*`, `tests/guards*`, `tests/consult*`, `tests/agent*` and `tests/us-26*` file that exists, plus `tests/search-*` if present.

Run only:
```
cd web && node --test tests/english-profile-26x.test.js $(ls tests | grep -E '^(profile|english|guards|consult|agent|us-26|search)' | grep -v 26x | sed 's#^#tests/#') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
`src/engine/**`, `src/i18n/**`, `src/ui/**`, `pipeline/**`, `relay/**`, `data/`, `README*`.

## Final message
Changed files, one line each. Nothing else.

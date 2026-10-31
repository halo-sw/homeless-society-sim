# Stage 30g3 — English area words load one area; lot names use the candidate's station (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator (keyless rule mode, real browser)
1. **English is 6× slower.**
   - Measured from send to answer:
     - "판교로 출근해요, 혼자 살아요, 전세 3억 이하" → 5 s, list footer "남은 83곳";
     - "I work in Pangyo, living alone, jeonse up to 300M won" → **29 s**, footer "5624 left".
   - **Cause:** `REGION_NAME_ALIASES` (`web/src/region-names.js`) has no English words for `pangyo`, `jeongja`, `migeum`, or for 잠실, 송파, 천호, 서현, 수내, 모란. So `regionWordsIn` finds nothing, and `structuredFlow` loads every area.
2. **The station fallback never fires.**
   - 30g made `displayNameFor` read `candidate.station`. But `find_homes` candidates (`web/src/homes.js` ~640–700) carry the station at `candidate.commute.walk.station`. Only the raw home record has `station.station`.
   - So the browser shows `A 오피스텔 (647)` instead of `판교역 근처 오피스텔 (647)`.

## Change
1. `region-names.js`: add lowercase English aliases.
   - `pangyo: ["판교", "pangyo"]`, `jeongja: ["정자", "jeongja"]`, `migeum: ["미금", "migeum"]`;
   - `"songpa-gu"` gets `"songpa"` and `"jamsil"`;
   - `gangdong` gets `"cheonho"`;
   - `bundang` gets `"seohyeon"` and `"sunae"`;
   - `jungwon` gets `"moran"`.
   - Keep every existing alias.
   - Check that `regionWordsIn` + `regionsForNames` on the English sentence above returns `["bundang"]`, the same as the Korean one.
2. `displayNameFor` (`web/src/homes.js`): the station is `candidate.commute?.walk?.station`, then `candidate.station` (string or `{station}`). Keep the rest of 30g.

## Test: extend `web/tests/lot-names-30g.test.js`
- `displayNameFor({ name: "(647)", kind: "오피스텔", region: "bundang", commute: { walk: { station: "판교", known: true } } })` → `판교역 근처 오피스텔 (647)`.
- `regionsForNames(regionWordsIn("I work in Pangyo, living alone, jeonse up to 300M won", REGION_NAME_ALIASES))` deep-equals `regionsForNames(regionWordsIn("판교로 출근해요, 혼자 살아요, 전세 3억 이하", REGION_NAME_ALIASES))`, and both equal `["bundang"]`.
- "near Jamsil" → `["songpa-gu"]`.
- Keep green: every `tests/region*`, `tests/*26c*`, `tests/english*`, `tests/profile*` file and `tests/rule-picks-30c.test.js`.

Run only:
```
cd web && node --test tests/lot-names-30g.test.js tests/rule-picks-30c.test.js $(ls tests | grep -E '^region|26c|^english|^profile' | sed 's#^#tests/#') 2>&1 | tail -10
```

## Do not touch
Anything except `web/src/region-names.js`, `web/src/homes.js` (`displayNameFor` only) and that test file.

## Final message
Changed files, one line each.

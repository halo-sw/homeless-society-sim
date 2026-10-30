# Stage 26y2 — Muse knows Menlo Park is covered (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator
Live dev run after 26y, English, Muse connected, "I work at Meta HQ in Menlo Park, renting alone, up to $5,000 a month":
- Muse called `extract_profile` (Meta HQ resolved to the US place) but **never called `find_homes`**. It answered: "This area around Meta HQ is still preparing, so I cannot show homes there yet", and suggested Seoul districts.
- Later "Live in both homes" ran Korean homes (Lake Palace in Jamsil).

**Cause:** the system prompt (`src/consult/agent.js` `SYSTEM_PROMPT`, line ~43) says: "다루지 않는 지역이면 '아직 준비 중이에요'라고 말하고 …". Nothing in the prompt, and nothing in `list_areas` (`src/consult/tools.js` ~569), says that Menlo Park around Meta HQ **is** covered. Muse guesses it is not.

## Change
1. **`SYSTEM_PROMPT`:** add one line before the "다루지 않는 지역" line:
   > 다루는 지역: 한국 수도권 역세권 지역들(list_areas)과 미국 1곳 — Menlo Park의 Meta HQ(1 Hacker Way) 주변 아파트. 미국은 월세만, Zillow ZIP 추정 월세(USD), 출근은 자전거·도보 분. 출근지가 Meta HQ·Menlo Park면 준비 중이라고 하지 말고 extract_profile 다음 바로 find_homes를 부른다.
2. **`list_areas`:** append `{ id: "us-menlo", label: "Menlo Park · Meta HQ (US)", note: "월세(Zillow ZIP 추정), 자전거·도보 출근, 3D 상자 없음" }` to the returned areas in both branches. Keep the existing note text, and add that us-menlo is searchable with `find_homes` but has no 3D box.
3. **`extract_profile` result** (`src/consult/tools-search.js`): when the profile is US (the same test 26y uses), add `next: "US profile — call find_homes now (Menlo Park homes)"`. Keep every other field the same.

## Test — `web/tests/agent-menlo-26y2.test.js`
- `SYSTEM_PROMPT` joined contains `Menlo Park` and `find_homes`.
- `list_areas` (with and without `loadAreasIndex`) contains an entry with id `us-menlo`.
- The `extract_profile` tool on the Meta HQ sentence returns `next` mentioning `find_homes`. The Korean Pangyo sentence has no such `next`, or keeps today's value.
- Keep green: `tests/server-us-homes-26y.test.js`, `tests/english-profile-26x.test.js`, `tests/english-action-26x2.test.js`, and every `tests/agent*`, `tests/consult*`, `tests/us-26*` file. **Update a test only if it pins the exact old `list_areas` length or the exact prompt line count**, and say so in the final message.

Run only:
```
cd web && node --test tests/agent-menlo-26y2.test.js tests/server-us-homes-26y.test.js tests/english-profile-26x.test.js tests/english-action-26x2.test.js $(ls tests | grep -E '^(agent|consult|us-26)' | grep -v 26y2 | sed 's#^#tests/#') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
`src/engine/**`, `src/i18n/**`, `src/ui/**`, `pipeline/**`, `relay/**`, `data/`, `README*`.

## Final message
Changed files, one line each. Nothing else.

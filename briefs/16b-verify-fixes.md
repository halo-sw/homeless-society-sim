# Stage 16b — Fixes from the orchestrator's final verification of 16a (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `verify-16a`. Commit after each part (`git add -A web/src/verify web/tests scenarios/verify && git commit -m "16b: …"`). Touch only `web/src/verify/`, `web/tests/verify-*.test.js` and `scenarios/verify/ground_truth.json`. First edit within 5 tool calls.

Read once: `briefs/16a-RESULT.md`, `web/src/verify/checklist.js:20-100` and `:155-238`, `web/src/verify/numbers.js`.

The orchestrator ran 16a against the Python reference with checklists an agent would really write, and against the real 30-day runs in `data/build/sim/`. The audit traps are fixed, but two regressions are worse than the traps.

## 1. Korean keyword matching is too strict
Measured (2026-10-30), natural `young_family` checklist:
`["출퇴근 시간이 두 사람 모두 40분 안쪽인지","월세와 관리비, 공과금을 합친 월 주거비","층간소음이 심한지","어린이집까지 걸어서 몇 분인지","단지 앞 횡단보도와 차량 통행 안전","놀이터와 공원까지 거리","유모차로 엘리베이터 이용이 편한지","소아과까지 가는 시간","남향이라 채광이 좋은지","마트와 편의점 접근성"]`
- Python: passed, must 1.0, weighted 0.88. JS: **failed, must 0.6**, missing C03, F01, F04, F05.
- `matchKeyword("어린이집","어린이집까지 걸어서")`, `("소아과","소아과까지…")`, `("소음","층간소음이 심한지")`, `("미끄","바닥재 미끄럼")`, `("바닥","바닥재 미끄럼")` all return `[]`.

Cause: the boundary rule meant for **1-syllable** Korean keywords was applied to every Korean keyword (and `PARTICLE_FOLLOW` is one character, so "까지" fails).

Fix:
- 1-syllable Korean keywords keep today's rule (향 → "향이" yes, "향후"/"방향" no).
- Korean keywords of 2+ syllables: plain substring, exactly like the Python reference (compounds "층간소음", particles "까지", stems "미끄럼" all match).
- The two audit traps this reopens are handled as data, not code: add an optional `exclude` list to an item in `ground_truth.json`; an agent line containing any `exclude` phrase does not cover that item. Add exactly: F05 and M02 `["병원비"]`, F02 `["투자"]`, C09 `["아침 식사", "아침 메뉴"]`. Do not change the user's ids, labels, keywords, weights or acceptance.
- **Tie-break:** when one line hits a common `should` item and a persona item, the persona item takes the line ("유모차로 엘리베이터 이용이 편한지" → F04, not C09). A common `must` item still wins over a persona `should`. Today "유모차로 엘리베이터…" goes to C09 and "욕실 낙상 위험" to C09 instead of M03.
- Tests:
  - the 10 `matchKeyword` cases above (true for every 2+ syllable case; 향후/방향 still false).
  - Natural-checklist parity: put these five checklists in `web/tests/fixtures/verify-natural.json` with the Python results, and assert JS `passed` and `must_coverage` equal Python's for each (weighted may be lower by the one-to-one rule, at most 0.1):
    - young_family: the list above → Python passed, must 1.0, weighted 0.88
    - newlywed_couple: `["두 사람 각자 통근 시간이 균형 잡혔는지","월 주거비 총액(월세·관리비)","소음 문제","택배 무인택배함이 있는지","막차 시간과 심야 버스","방 수가 아이 계획에 충분한지","헬스장·산책 같은 여가 시설","출퇴근 시간"]` → Python not passed, must 1.0, weighted 0.73
    - multigen_family: `["무단차 출입과 엘리베이터","병원 접근성","욕실 낙상 위험","방 수와 욕실 수로 사생활 보장","경로당과 산책로","월 주거비","통근 시간","소음"]` → Python not passed, must 1.0, weighted 0.79
    - pet_owner: `["반려동물 허용 여부 확인","공원과 산책로 거리","짖음 민원 위험","동물병원 거리","바닥재 미끄럼","월세 관리비","출퇴근 시간","소음"]` → Python not passed, must 1.0, weighted 0.75
    - remote_worker: `["업무 공간을 따로 둘 수 있는지","낮 시간 공사 소음이 화상회의에 지장 주는지","인터넷 회선 속도","카페나 코워킹 접근성","환기가 잘 되는지","월세와 관리비","통근 시간","층간 소음"]` → Python not passed, must 1.0, weighted 0.75
  - Every audit trap from 16a still does not cover its item (병원비, 안전한 투자, 아침 식사 메뉴 via `exclude`; 향후, 방향, 짐작, parking, recall via the existing rules; negation; keyword salad).
- Commit `16b: Korean matching like the reference + exclude list + persona tie-break`.

## 2. Engine values must be the household's door-to-door numbers
Measured on `data/build/sim/persona-dual-income-child-A.json`: `engineValue("C01", run)` = **10.3**. A report saying the true one-way commute "43.6분" **fails**, and one saying "10.3분" **passes**.

Causes in `numbers.js`:
- `meanMinutes` with `member = null` averages **all agents**, including the 60 simulated neighbours (`b01…b60`).
- It averages each walk leg on its own. The subway ride is not a trip at all: it is an away with `kind: "ride"` (`detail.ride.minutesTotal`, older runs `detail.rides.out/back.minutesTotal`), so it is missing entirely.

Fix:
- Household members = keys of `run.totals.per_member` that are not simulated neighbours (`run.agents[].background` or key prefix `b`); use the run's own flag if it has one.
- **C01** = mean over household members who commute of: `(per_member.commute_walk_minutes + per_member.commute_ride_minutes) / one-way commutes`, where one-way commutes = distinct `(agent, day, am|pm)` among that member's `purpose: "commute"` trips and `kind: "ride"` aways (am = before 12:00).
- **N01** = the same per member (`claim.member`).
- **C05 / F01 / F03 / F05 / M02 / P02** = mean minutes of that purpose's trips by household members only.
- Expected on today's build (hard-code in a real-data test that skips when the file is missing): `demo-two-homes-A` C01 **42.7**, `demo-two-homes-B` C01 **16.5**, `persona-newlywed-couple-B` N01 h1 **46.5**. Plus a tiny hand-made run (one member, walk 10 + ride 30 + walk 5 out, the same back) → C01 45.
- `verifyReport` on `persona-dual-income-child-A` with a C01 claim of 43.6 → no number failure; with 10.3 → a number failure.
- Commit `16b: household door-to-door engine values`.

## End
- `cd web && node --test tests/verify-*.test.js 2>&1 | tail -6` and `npm test 2>&1 | tail -6` (the one `share.test.js` failure from stage 15 may remain; say so if it is the only one).
- Append a "16b" section to `briefs/16a-RESULT.md`: the natural-checklist table (Python vs JS), the engine values above, and anything you could not match.
- Commit.

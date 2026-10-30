# Stage 20c — Show how this scene counts toward the result (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ithaca-17`. New pure module `web/src/evidence.js`; small wiring in `main.js:1721` (where `nowCardFor` is set) and in `SimHero` (`web/src/ui/app.jsx` ~404-440). First edit within 4 tool calls. Commit, then stop.

## Why
The user: "계산된 내용이 제대로 적용되었는지도 잘 모르겠어". The result card says, for example, "출퇴근 편도 A 11분 · B 14분" and "장보기 A 7번 vs B 3번". In the 3D view, the hero only says "4분 남음". Nothing ties the scene on screen to those numbers.

## What to add
`sceneEvidence({ run, agentKey, day, minute, now })` returns 1–3 short lines. `SimHero` renders them under the big number as a small list headed "이 장면이 결과에 들어가는 곳". Lines are 12 px, `--ui-ink2`, and each line carries a "측정" or "가정값" tag where one applies.

**Commute trip or ride** (`now` is a commute walk or a ride; use `run.trips` / `run.aways` for this agent, day and am|pm half):
- "오늘 출근 {total}분 = 걷기 {walk}분 + 지하철 {ride}분{ + 기다림 {wait}분}". Whole minutes, `Math.round`, and the parts must add up to the total.
- "30일 출퇴근 편도 평균 {commuteOneWayMinutes(run, agentKey) rounded}분 중 하루예요". Use the same helper the result card uses (`verify/numbers.js:125`), so the numbers match the card.
- When the ride's crowding is an assumption, add: "혼잡 70%는 가정값이에요 (실측 없음)".

**Errand / clinic / park trip:**
- "30일 중 {k}번째 {장보기|병원|산책} · 이 집에서 모두 {n}번". `k` is the 1-based index of this trip among this agent's trips of that purpose, ordered by (day, depart_min). `n` is the total.
- "목적지 {to.label} · 걸어서 {minutes}분".

**At home / work:** no lines, so nothing to clutter.

Also, while a trip is shown, its destination gets a 3D label. Stage 20b adds a destination pill. If 20b is not merged yet, skip this part.

## Tests — `web/tests/evidence-20c.test.js`
Build small run fixtures inline: 2 days, an agent `h1`, commute trips plus a ride away, and 3 errand trips.
- A commute at day 1 am gives "오늘 출근 13분 = 걷기 4분 + 지하철 7분 + 기다림 2분" (choose fixture numbers that make this exact). The second line's average equals `Math.round(commuteOneWayMinutes(run, "h1"))`.
- The second errand gives "30일 중 2번째 장보기 · 이 집에서 모두 3번".
- At home, the result is `[]`.
- No line contains `/\d+\.\d+분/` or "undefined".

Run:
```
cd web && node --test tests/evidence-20c.test.js tests/nowcard*.test.js 2>&1 | tail -8
```

Commit `20c: the sim hero says how this scene counts toward the result`. Then stop.

# Stage 18d — Fixes from the orchestrator's walkthrough of 18c (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ithaca-17`. Commit after each numbered item, or after a small group of related items (`git add -A web/src web/tests && git commit -m "18d: …"`). Keep all tests green. First edit within 6 tool calls.

The orchestrator walked the flow on the laptop GPU at 2026-10-30 14:30, 1440×900: landing → "1인 사회초년생" → pick 천사의도시Ⅱ오피스텔 + 시그마 3 → drawer "이 집들로 30일 살아 보기" → A 3D → A·B 비교 → 결과 공유. The crash is gone. Custom data, names, score (A 44 · B 56 everywhere), compare and share now work. Remaining issues:

## 1. The chat map is a blank beige panel
- The SVG `viewBox` is `100.95 37.34 0.110 0.075`, which is in degrees. The content is drawn in projected metres (labels at x = −61…701, y = −1199…401). Label `font-size` is `0.0012`. So nothing lands inside the view.
- Fix it so `fitMapView` and every layer use the same projected space. Labels and pins must use readable screen sizes: 11–13 px text, pins about 22 px, constant on screen however the map is zoomed.
- Add a test that builds the map for the `single-firstjob` example with real data shapes and asserts all of these:
  - every candidate pin and the workplace pin lie inside the `viewBox`
  - the `viewBox` units match the layer coordinates (order of magnitude)
  - label font-size gives ≥ 11 px at a 1000 px panel width
- The test must exercise the full ChatMap data → SVG path, not only `fitMapView` in isolation.

## 2. "null" in the intake summary
"문장에서 가져왔어요: 1인 · 판교 출근 · 연봉 4,000만 원 · 모은 돈 5,000만 원 · 전세 2억 원 이하 · null㎡ 이상 · 출퇴근 null분 이내" (`intake.js:218`). Leave out fields whose value is missing, and test it.

## 3. One commute number everywhere
The same home shows four different commute numbers:

| Where | A | B |
|---|---|---|
| card "판교까지 약 …" (estimate) | 10.4분 | 12.3분 |
| moment | — | "출근 13분" |
| result card "하루 출퇴근 (문 앞→회사 편도 평균)" | 8분 | 10분 |
| share card "하루 출퇴근 시간" | 16분 | 21분 |

The result card divides 30-day totals by days × 2, including days without a commute.
- Use one definition for the customer-facing "출퇴근 편도": door-to-door minutes per one-way commute, i.e. (commute walk + commute ride) ÷ one-way commutes, counting distinct (agent, day, am|pm). This is exactly `engineValue("C01")` / `N01` in `web/src/verify/numbers.js` (16b).
- Put it in one shared helper used by the result card, the share card, the compare table and the moments.
- The candidate card keeps its pre-run estimate, labelled "추정 (살아 보기 전)".
- Test: for a custom run, the result card, share card and compare row show the same number for each home, and it equals `engineValue("C01")`.

## 4. No feedback after starting the run
After clicking any "이 집들로 30일 살아 보기" (sticky, drawer, in-chat), the chat column does not move. The progress and result card appear far below, out of view. Scroll the chat to the simulation card as soon as it is created, and keep its progress visible. Test that the scroll target is set.

## 5. Selection log time
The drawer's 선택 기록 shows "17:40.200000000000045 나 · 공원/귀가". Format every minute value as HH:MM through one formatter. Grep for other raw float minutes reaching the UI.

## 6. Card 3D thumbnail
On the candidate cards, the painted `SceneThumb` shows a brown tilted slab with one thin spike. That is ground plus a single tree, with no buildings in frame. Frame the home's own building and its neighbours from about 45° at a 150–250 m view width, with the painted palette and the home outlined or pinned. If the scene has no building for that home, show the `MiniMap` instead. Test the framing maths: the home footprint is centred and occupies 10–40 % of the frame.

## 7. Share card wording
The share card still has internal lines such as "차·지하철을 탄 시간이 0분이면 도보로 적어요" and "출처: 걸어서 잰 시간 · 가정값 · 가정값". Rewrite them in plain customer Korean, or move them into a single small "계산 방법" footnote. Add rows for 월 주거비 and the 출퇴근 편도 from item 3. No winner wording. "(낮음)" markers may stay only as neutral descriptors.

## 8. Compare table in the drawer
In the 340 px drawer, each value cell wraps as "A 5시간 17분 · B 5시간 54분 · Δ +37분하루 평균 …" (the delta and the plain line run together). Lay each row out as:
- label
- A value | B value (two columns)
- the plain-words line below, in supporting text

No run-together text.

## End
- `cd web && npm test 2>&1 | tail -6` and `npx vite build 2>&1 | tail -2`.
- Append an "18d" section to `briefs/18-RESULT.md`.
- Commit.

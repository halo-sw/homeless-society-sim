# Stage 11 — Polish the four things the real GPU still shows (brief for Muse)

Agent mode, rules in `AGENTS.md`. Read `briefs/10-RESULT.md` (incl. 10b), `web/src/ui/agent-float.js`, `consult.jsx`, `app.jsx`, `share.js`, `share.jsx`, `ui.css`, `web/src/render/rig.js`, `sky.js`, `renderer.js`, and the fog code in `web/src/main.js` (~L144, ~L1503, ~L1872). Astryx docs offline in `docs/astryx/` (`npx --no-install @astryxdesign/cli component <Name>` works offline). Sandbox: no network, no keys.

User request: "네 가지 다듬어 줘" — the four issues below, found by the orchestrator on the real GPU (Apple M-series, ANGLE Metal, 1440×900) at `fdc1b07`. Attached captures:
- `briefs/img/10b-gpu-a.png` (2×2): A 08:50 ride · B 08:30 walk · 생활비 tab · share dialog.
- `briefs/img/10b-gpu-b.png` (2×2): 매물 tab with example · public notices · share over 생활비 · night 19:18.
- Singles: `briefs/img/11-before-ride.png`, `11-before-night.png`, `11-before-listing.png`, `11-before-share.png`, `11-before-money.png`.

## 1 — The floating agent must never cover the cards
What the captures show: the agent panel (~380×560) is **open on every sim URL** (not only `?tour=demo&step=9`) and sits on top of the right column — it covers the "30일 생활 비교" card, its tab body, the 매물 paste box and the public-notice list. On the night capture it also covers the right third of the scene.
1. Default state is **closed** (only the "물어보기" button). It opens when the user clicks it, when the tour reaches the agent step, or when a nudge is accepted. Remember open/closed per viewer (try/catch storage).
2. When open, the panel must not overlap the right column card, the Now card, the left column, the timeline bar or the followed resident's screen position. Extend the pure placement in `agent-float.js`: given viewport + obstacle rects, choose (a) the free corner, else (b) dock the panel as a right-side drawer and **shift the right column card left / narrow the canvas** so nothing is under it, else (c) on narrow viewports (< 1100 px) a bottom sheet that the right card scrolls above. Never place over a rect; tests with the 1440×900 rects measured from the captures (right card ≈ x 645–890, y 55–1100 in the 2× grid → in CSS px x ≈ 1290–1780 at 1440 wide; derive real rects from DOM in code, the numbers are only for the test fixture).
3. Re-run placement on resize, tab change, card collapse/expand and Now-card height change (ResizeObserver).

## 2 — Nothing truncated
1. **Agent header**: the subtitle "상담 · 조건 정하기 · 결과 설명 · 다시 실행" wraps into three lines, the model switch (Spark 1.3 / Spark Open / Muse Spark 1.3) and "알림" take a second row, and the three actions show as "왼쪽…", "접…", "닫…". Make the header one clean row: title "물어보기" + model badge; actions as Astryx `IconButton`s with `aria-label` + Tooltip ("다른 쪽으로 옮기기", "작게 접기", "닫기"); move the model switch and nudge setting into a small "설정" menu (Popover/Menu) inside the panel. Drop the long subtitle (it can be the empty-state line).
2. **"30일 생활 비교" tabs**: 10+ tabs are squeezed to "A.. 내기.. 생. 살.. 살.. 안.. 전.. 지.. 매 게..". Use a two-level structure with full labels: groups **비교 · 돈 · 안심 · 매물** (e.g. 비교 = A·B 비교 / 내 기준 / 삶의 질 / 기준; 돈 = 생활비 / 살 만한가; 안심 = 치안·교육 / 전세 점검 / 지원 제도; 매물 = 내가 본 매물 / 공공 공고) — or a horizontally scrollable TabList with full labels and fade edges, per Astryx docs. Every label fully readable at 1440 and at 1100 wide. Keep `?tab=` deep links working (map old ids).
3. Scan the rest of the UI for `text-overflow: ellipsis` / fixed widths on labels and buttons; a label may wrap but must never be cut mid-word in Korean.
4. Test: a pure layout check that every tab/button label fits its computed min width (or a jsdom-free check that no label is rendered with an ellipsis class), plus the tab-id mapping.

## 3 — The share card must show the comparison
Today the dialog shows only the weights text ("기본 모두 보통이에요 …"), a 2026-10-28 date that is the scenario date, and buttons. The data builder from stage 10 exists — wire it into the visible card and the PNG:
1. Header: persona, homes A / B (name, area ㎡), "만든 날 2026-10-29" (today, from the clock) and "시뮬레이션 기간 2026-11-02부터 30일" separately.
2. A vs B rows in plain words (copy guide), each with value + unit, source badge or 가정값 mark: 출근 방법, 하루 출퇴근 시간, 30일 동안 지하철을 탄 시간, 30일 동안 걸은 시간, 회사 도착할 때 피곤한 정도, 가장 붐빈 구간, 전세로 살면 매달 집에 드는 돈, 월급에서 집에 나가는 비율, 집값과 생활비를 내고 남는 돈, 보증금이 집값의 몇 %인지, 걸어서 10분 안 편의시설 수, 저녁에 집에 머문 시간. Highlight which side is lower/higher only neutrally (no 좋음/나쁨, no winner).
3. The customer's priorities as small bars, then the disclaimer line.
4. The PNG is the same layout (canvas), 1080 px wide, legible at phone size; the print page matches. Test: builder output for the demo run contains every row with the numbers from `data/build/sim/demo-two-homes-compare.json` / `-money.json` (fixture when absent), and no verdict words.

## 4 — Less haze by day and on the regional view, calmer night
What the captures show:
- **Regional/ride view (A 08:50)**: almost uniform grey; the corridor buildings, the line and the train are barely visible. The fog is pulled to `regional.dist*1.1 … *3.2` while the camera is high, so nearly everything is inside fog, and the fog colour equals the sky.
- **Day (B 08:30, 생활비 12:00, 매물)**: low contrast, milky; roads and roofs are pale.
- **Night 19:18**: the tower façade is a solid white block; stage 9c's clamp is not enough.
Fix, with every constant in one `look` table (in `rig.js` or a new `render/look.js`) so the orchestrator can tune it with `?look=key:value,…` without a rebuild:
1. Regional view: fog near/far based on distance from the camera to the **target** (not altitude) with far ≥ 6× that distance; or disable fog over the corridor tiles and use a light horizon gradient instead. The line, the train and stations must read clearly; corridor buildings get a slightly darker base colour and a soft edge/outline or AO so blocks separate.
2. Day: raise contrast — darker ground/road base, less ambient/hemisphere fill, stronger sun-to-shadow ratio, fog starts farther (≥ 2.5× span), sky saturation up a little; tone mapping ACES (or AgX) with exposure tuned so mid-greys sit around 0.45–0.55. Keep shadows clean (no regression of stage 7's fix).
3. Night: per-window emissive with a lit fraction (e.g. ≤ 35 % of windows lit, based on residents at home as today) instead of whole-façade emission; emissive intensity cap; bloom threshold above window brightness so only lamps glow. A lit tower must show a window grid with dark gaps.
4. Pure tests: look-table parsing (`?look=`), fog range function for regional/street, night lit-fraction function bounds.

## Tests and output
All existing tests green (581 JS, 168 Python); new tests above; `vite build` green; no keys or raw data in git or bundle. `briefs/11-RESULT.md`: what changed per issue, the default `look` values and why, the capture URLs to check (same as `10b-gpu-*.png`), and what only the real GPU can confirm.

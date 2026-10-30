# Stage 18 — RESULT: the customer's own homes, end to end (parts 3–5)

Date: 2026-10-30. Briefs: `briefs/18-real-service.md` (parts 3, 4),
`briefs/17d-day-exposure.md` (part 5). Agent mode, rules in `AGENTS.md`.
No sub-agents. Branch `ithaca-17`. Parts 1–2 landed in the previous run
(`5fd1ee1`, `984eefd`, summarized from `git show --stat` + test files —
not redone). Order note: part 5 (17d) was implemented and committed
first because it was fully specified from its brief while parts 3–4
needed code exploration; all three parts land, nothing skipped.

Commits: `1172c40 17d: time-aware day exposure`, `16b8b31 18: readable
results`, `1c7fb4f 18: chat stage map` (this file + final test numbers
commit separately below).

## Parts 1–2 (previous run, not redone)

- Part 1 `5fd1ee1 18: custom runs use their own data` (18 files):
  new `web/src/chat/custom-money.js` (browser money-doc builder with
  `tenureCost`/`householdMonthlyNet`/`moneyTimeline` parity), plus
  `chat/engine.js`, `chat/urls.js`, `homes.js`, `intake.js`, `main.js`,
  `priorities.js`, `profile.js`, candidate/chat/demotour/intake/listings/
  money UI, and `web/tests/custom-18.test.js` (407 lines: parity,
  share-card names, score from the custom record, 공공임대/thin-deal
  rules).
- Part 2 `984eefd 18: flow without dead ends` (11 files): `intake.js`
  (skip-asked fields), `main.js`, `profile.js`, `ui/app.jsx`,
  `ui/candidate-card.jsx`, `ui/chat.jsx`, `ui/landing.jsx`
  (chips send immediately), `ui/share.jsx`, `ui/ui.css`, and
  `web/tests/flow-18.test.js` (249 lines: shared run verdict, intake
  skips, compare reveal, share dialog).

## Part 3 — readable results (`16b8b31`)

- Result card (`SimulationCard`) now reads top to bottom: (a) 내 기준
  점수 per home with the existing subjective-score caption (reuses
  `myScore`/`priorityValues`, input order kept, never sorted/crowned);
  (b) 월 주거비 per home = 보증금 기회비용·관리비·교통비 from the money
  doc with a per-home 어떻게 계산했나요 (transit ingredient added via an
  optional `transitWon` prop; `MoneyTab` unchanged); (c) 하루 출퇴근
  문 앞→회사 편도 평균 per commuting member from `compare.members`
  (non-commuters skipped); (d) the 2–3 `pickMoments` texts (computed in
  `onRun` from the runs). The full 13-row table moved behind 자세히 보기.
- Every detail row carries a plain-words delta (`plainMetricLine`,
  tested): "B가 하루 평균 9분 더 차·지하철을 타요", "A가 장보기 4번 더",
  fatigue as "덜 피곤해요 (A 5.1 · B 4.3)", congestion in %포인트,
  같아요 for zero, nothing for null.
- 피곤한 정도: one scale caption everywhere ("0–10, 높을수록 피곤해요",
  compare table + money QoL card). The 30-day mean was a different
  quantity (daily mean incl. recovery vs momentary arrival/after-home),
  so it is renamed to "하루 평균 피곤한 정도 (쉬는 시간 포함)" in
  `simulate.js`, `money.jsx`, `demotour.js`, `guards.js`, chat extraLine.
- Removed from customer view: `judgmentLine` ("고른 주체 …", function
  deleted), "그래프 = …", "장면에 단지 이름이 없어 …" (`AnchorNotes`
  deleted). Their facts live in the table's 어떻게 계산했나요 as plain
  language ("이 30일은 정해 둔 생활 규칙으로 만들었어요. Muse 판단이
  들어간 날: 0일", graph-vs-assumed line, `FATIGUE_MODEL_NOTE`,
  per-label coordinate-anchor lines via `compare.anchors`).
- Cards: the hero is the complex photo when one exists, else the real
  painted `SceneThumb` — never a station/street photo (those stay as a
  small labelled strip with licence lines). No empty grey box: without
  a hero the area is omitted; with no photos and no scene a `MiniMap`
  OSM handoff shows. New `.ui-cand-strip` CSS.
- Landing: scrim 65%→88% warm-white + blur 6→12px, so headline/input/
  chips keep ≈6:1 solid-surface contrast (AA). One justified pin update
  in `ithaca-name-17.test.js` (65%→≥85% + blur); new
  `web/tests/results-18.test.js` (13 tests).
- Could not do: per-member 편도 minutes divide 30-day totals by days×2
  (an average over non-commute days too — labelled as such); the chat
  score row is non-interactive (no dead比重 tap; weights live in the sim
  tab).

## Part 4 — chat stage map (`1c7fb4f`)

- Replaced the slab `OrbView` with `ChatMap` (`web/src/ui/chatmap.jsx`,
  static top-down SVG, no drift, fills the panel via `preserveAspectRatio
  slice` + ResizeObserver; reduced motion needs nothing since nothing
  moves). Pure data/geometry in `web/src/chatmap.js`.
- Layers: beige ground `#cfc4ad`; corridor-tile open water stroked and
  closed water filled `#3f6f8f`; picked-box landuse water/parks
  (`extractGreenRings`) `#3f6f8f`/`#8a9a5b`; region coverage boxes as
  thin lines with quiet labels; corridor-tile 시군구 boundary polylines;
  subway lines from `network.json` in data colours (`line.color` wins,
  else the official line-colour table) with station dots.
- Workplace pin (resolved station via `findStop`, omitted when
  unresolvable) + numbered pins in card order with price tags; picked
  homes get commute legs from `findPath` (the engine's own router) in
  line colours with door-to-door minute labels; unroutable → omitted.
- Camera `fitMapView` holds pins with exactly ≥8% margin at 1440×900 and
  390×844 (tested). Hover card↔pin highlights both ways (`home:<id>`
  keys, `cand-<id>` scroll targets); region click still filters.
- Loaders: `loadCorridorTiles` (manifest + view-intersecting tiles only,
  ≤24, null-tolerant) in `chat/engine.js`; picked-box green extracted in
  `onRun` from already-fetched area docs (zero extra bytes).
- Could not do: real 시군구 boundary *polygons* (built data has bboxes +
  corridor-tile segments only — rects + tile lines shown, no invented
  borders); park polygons appear only once a picked box loads (no
  lightweight regional park source; layer implemented + tested);
  water-parks extract script was dropped (sandbox denies `data/` writes,
  so its output could not be produced or verified here).

## Part 5 — 17d (`1172c40`, notes also in `briefs/17-RESULT.md`)

`paintedSkyParams` normalises sun+fill by ungained horizontal total
against the 08:50 reference (`refDayE 1.23148`, dayF fade-in; night
untouched; shade ratio gain-invariant). Before→after: 08:50 identical
ΔE 2.2; 11:00 ΔE 12.2→3.7; 14:00 ΔE 10.1→3.7; 17:00 ΔE 34.5→7.2; roofs
<245, roads neutral and ≥98 under. New `painted-17d.test.js` (13);
one justified pin update in `painted-17b.test.js`.

## End

- `cd web && npm test`: **1228 tests, 1227 pass, 0 fail, 1 skipped**
  (skip pre-existing). `npx vite build` hits the known sandbox EPERM
  (`node_modules/.vite-temp`, same as 14e/17/17b/17c); stand-ins green:
  `node --check` on edited JS, jsx-loader render tests, and a full
  esbuild bundle of `src/main.js` (5.1 MB, font externalized) in
  `/tmp/18-bundle.js`.
- Capture URLs for the orchestrator (dev server, `/data` served from
  `data/build`): landing `/`; example flow (chip sends immediately)
  `/?chat=1&example=single-firstjob` (resolves via `exampleChatUrl`);
  sim on the custom run `?mode=sim&home=A&custom=<id>` (`<id>` is
  runtime-created by that run — no fixed id to capture); chat stage
  before candidates = same chat URL with regions framed +
  "출근지를 말하면 후보가 지도에 표시돼요", after = with `?chat=…`
  once candidates arrive (pins 1…6 + 직장 pin + commute lines).

## 18c — chat renders again (cardHi) + error boundaries + render smoke test

- Crash: `CardMsg` read `cardHi` (highlight state living in `ChatScreen`)
  without receiving it, so any candidates message unmounted the whole
  chat (`ReferenceError: cardHi is not defined`). Fix: `CardMsg` takes
  `cardHi` as a prop, `ChatScreen` passes it. Grepped the 18 diffs
  (`5fd1ee1 984eefd 16b8b31 1c7fb4f`) for other moved names — `cardHi`
  was the only identifier used outside its scope.
- New `MsgBoundary` (exported from `web/src/ui/chat.jsx`): wraps every
  chat message and the stage map. A failing card shows "이 카드를 그리지
  못했어요 · 다시 시도" + the error message in small text; the rest of
  the chat keeps working. `StageArea` is now exported for tests.
- New `web/tests/chat-render-18c.test.js` (12 tests): renders every chat
  message kind via `CardMsg` with realistic `single-firstjob` data —
  profile (from the example sentence), intake, candidates (6 cards,
  2 picked, `home:c2` highlighted — the exact crash), done-state
  simulation, listing, all three tabs, text + system, tour — plus the
  stage map in the boundary. Asserts no throw.

## End (18c)

- `cd web && npm test`: **1240 tests, 1239 pass, 0 fail, 1 skipped**
  (skip pre-existing; +12 new). `npx vite build` hits the known sandbox
  EPERM (`node_modules/.vite-temp`, same as 14e/17/17b/17c/18);
  stand-in green: full esbuild bundle of `src/main.js` (5.4 MB, font
  externalized) in `/tmp/18c-bundle.js`.

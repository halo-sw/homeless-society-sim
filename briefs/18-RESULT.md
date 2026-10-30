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

## 18d — walkthrough fixes (`briefs/18d-walkthrough-fixes.md`)

Orchestrator walkthrough 2026-10-30 14:30, 1440×900, on branch
`ithaca-17`. Eight items, one commit each (items 7–8 finished from the
18e working tree, not restarted).

- Item 1 `cd1d991` (chatmap.jsx + `chatmap-18.test.js`): the SVG
  `viewBox` was in degrees while layers draw in projected metres, so the
  map was blank beige. `fitMapView` and every layer now share one
  projected space (`viewBox 0 0 W H`); labels 11–13 px and pins ~22 px,
  constant on screen at any zoom. The test runs the full ChatMap data →
  SVG path for the `single-firstjob` example: pins inside the viewBox,
  matching units, readable sizes.
- Item 2 `697253a` (intake.js + flow-18.test.js): the intake summary
  printed "null㎡" / "null분" for missing fields. Fields without a value
  are now left out of the sentence, with a test.
- Item 3 `048563f` (numbers.js, moments.js, app.jsx, candidate-card.jsx,
  chat.jsx, share.js + results-18.test.js): one customer-facing 출퇴근
  편도 — door-to-door minutes per one-way commute, i.e. `engineValue`
  ("C01") / N01 — in one shared helper used by the result card, the
  share card, the compare table and the moments. The candidate card keeps
  its pre-run estimate, labelled "추정 (살아 보기 전)". Test: result
  card, share card and compare row agree per home and equal C01.
- Item 4 `c7bf899` (chat.jsx + chat-render-18c.test.js): starting a run
  gave no feedback — the progress/result card appeared far below the
  viewport. The chat now scrolls to the simulation card as soon as it is
  created; test asserts the scroll target is set.
- Item 5 `a65c9a9` (moments.js, main.js, nowcard.js, sim.js, timeline.js,
  assumptions.jsx + timeline-12b.test.js): the drawer 선택 기록 showed
  raw float minutes ("17:40.200000000000045"). Every minute value on
  screen now goes through one HH:MM formatter; grepped for other raw
  floats reaching the UI.
- Item 6 `5046017` (photos.js, candidate-card.jsx, preview.jsx +
  photos.test.js): card thumbnails showed ground + one tree, no buildings.
  The home's own building and neighbours are now framed from ~45° at
  150–250 m view width in the painted palette with the home outlined;
  `MiniMap` when no building matches. Test: the home footprint is centred
  and fills 10–40 % of the frame.
- Items 7–8 `77503b9` (monthly.js [new], app.jsx, chat.jsx, share.js,
  share.jsx, share.test.js, share-load.test.js): the share card's internal
  lines ("차·지하철을 탄 시간이 0분이면 도보로 적어요", per-row
  "출처: … 가정값 · 가정값", card-level `sources_note`) are rewritten in
  plain customer Korean inside one small 계산 방법 footnote (official
  source names kept: 국토교통부 실거래가, 경찰청·공공임대 공식 자료);
  per-row 출처 lines removed from both the dialog preview and the canvas
  renderer. New rows for 월 주거비 (shared `monthlyHousingOf` helper also
  used by the result card: 주거비 + 관리비 + 교통비) and the item-3 출퇴근
  편도. No winner wording; (낮음) stays neutral with a footnote saying it
  only marks the smaller side. The drawer compare table now lays each row
  out as label, then A | B in two columns, then the plain-words line
  (which already carries the delta: "B가 하루 평균 … 더 …") in supporting
  text — no run-together text; the symbolic Δ shows only where no plain
  line exists. The 18e run's only failure was the stage-11b pin in
  `share-load.test.js` expecting the old 12-row card; updated to 13 with a
  note (the new 월 주거비 row).

## End (18d)

- `cd web && npm test 2>&1 | tail -6`: **1251 pass, 0 fail, 1 skipped**
  (skip pre-existing; +12 pass since 18c). `npx vite build 2>&1 | tail -2`
  hits the same known sandbox EPERM (`node_modules/.vite-temp`);
  stand-in green: full esbuild bundle of `src/main.js` (4.9 MB JS +
  291 KB CSS, fonts externalized) in `/tmp/18d-bundle.js`.

## 18f — chat map: real subway tracks, non-overlapping tags, one 추정

Three 18e walkthrough leftovers, all in the chat map + card:

- Item 1 (tracks): `buildChatMap` (`web/src/chatmap.js`) joined
  `line.stops` in array order — alphabetical in
  `data/build/region/network.json`, hence the tangle. Each line is now
  drawn from its `patterns[].geometry` (real OSM track polyline,
  `meta.edge_methods.geometry` = 678 edges), one pattern per direction;
  a pattern without geometry falls back to `patterns[].stops` order,
  never `line.stops`. Sparse rural vertices (up to 3.8 km apart on the
  경강선) are densified in-lon/lat (`densifyPts`, ≤ 2.5 km hops) so the
  drawn line keeps the same segments with intermediate vertices.
  Station dots still come from `stops`. Renderer keys lines
  `id:direction:index` (one line id now yields several polylines).
  Tests on the real network: every consecutive hop ≤ 3 km, each drawn
  line within 15 % of its pattern's `distance_km`.
- Item 2 (tags): new pure `layoutPinLabels` (`web/src/chatmap.js`) used
  by `web/src/ui/chatmap.jsx`. Each tag tries right, left, above, below
  (clamped into the frame); when all collide it steps diagonally outward
  with a short leader line (stack-below last resort). Pins closer than
  18 px fan out on a small circle around their centroid with a thin
  leader back to the true point. Tests: the synthetic 5/6-style pair
  ("전세 1억 9,500만 원" vs "전세 1억 9,800만 원") fans out with
  disjoint boxes, and the real single-firstjob `find_homes` run
  (판교 통근, 전세 ≤ 2억, 6 candidates) lays out with no two tag boxes
  intersecting at both 1440×900 and 390×844.
- Item 3 (card): the commute line already ends in "· 추정 (살아 보기
  전)" while `SourceDot` added a second "● 추정". `CandidateCard`
  (`web/src/ui/candidate-card.jsx`) now skips the dot whenever the line
  already says 추정 — the card reads "… · 추정 (살아 보기 전)" once.
  Test renders the card and counts exactly one 추정.

## End (18f)

- `cd web && npm test 2>&1 | tail -6`: **1257 pass, 0 fail, 1 skipped**
  (skip pre-existing; +6 since 18d, all new 18f tests).
  `npx vite build 2>&1 | tail -2` hits the same known sandbox EPERM
  (`node_modules/.vite-temp`, unwritable in-sandbox — fails loading
  `vite.config.js` before any source); stand-in green: full esbuild
  bundle of `src/main.js` (4.9 MB JS + 291 KB CSS, fonts externalized)
  in `/tmp/18f-bundle.js`.

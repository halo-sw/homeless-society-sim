# Stage 8 result — journey view + corridor map + congestion fatigue

Agent mode (Muse). Builds on stage 7 (`briefs/07-RESULT.md`): the followed
member's subway ride is now a visible regional journey on the real line
geometry, and every commute carries a stated, deterministic fatigue index
driven by measured congestion where it exists.

## What changed

**Part A — journey view + corridor map**
- `pipeline/network.py` (`network` CLI): 5 수도권 lines from OSM route
  relations — 2호선 (43역, 내선/외선), 8호선 (24역), 9호선 (38역),
  수인·분당선 (38역), 신분당선 (16역) — with stop order, station nodes,
  simplified geometry and 13 same-name transfers, into
  `data/build/region/network.json` (gitignored). All 310 shipped edges
  are geometry-backed (projected chainage; line-8 one side mirrored from
  its exact-reverse sibling, recorded). Direction labels: 2호선 내선/외선
  from the relation name, others 상선/하선 by station-number rule
  (xlsx numbers or OSM ref), else `<종점> 방면`.
- `pipeline/corridor.py` (`corridor` CLI): low-detail corridor along a
  routed path — register buildings within ±250 m (stage-1 height
  priority, ≤1200/tile), major roads, water, district boundaries,
  station markers — in 1 km tiles under
  `data/build/region/corridor/<id>/` + `corridors.json` index.
- Ride split keeps the customer's total: transfer walk/wait first
  (C-ride-split, 4분/회 가정값), the rest by line distance; the split
  sums to the input exactly. UI shows e.g. "2호선 잠실→강남 약 8.6분 ·
  환승 4분 · 신분당선 강남→판교 약 17.4분 — 합계는 고객 입력 30분".
- Journey camera (`web/src/journey.js` pure + `journey-scene.js` +
  `main.js`): on a station ride the camera rises to a regional framing
  (both ends + line), the line draws per-hop congestion colours, a train
  marker moves at the split pace with line/station label + minutes left,
  then descends into the destination detail (both areas' data load on
  the itinerary;Lite second world). No detail → corridor level +
  "상세 지도는 지역 생성 후". Progress-driven, so 60× never skips it.
  User override: 자동 / 거리 보기 / 전체 경로. Corridor tiles lazy-load
  around the train (paced, capped, disposed far behind).
- Now card shows itinerary loading ("판교 지도 불러오는 중…").

**Part B — congestion + fatigue**
- `pipeline/congestion.py` (`congestion` CLI): the Seoul Metro xlsx →
  `data/build/region/congestion.json` (1–8호선, 평일/토요일/일요일,
  39 slots). 공공누리 3유형: xlsx + derived JSON stay under `data/`
  (gitignored), used for local compute/display with attribution.
  신분당선·수인분당선·9호선 have no rows → "혼잡도 자료 없음" + the
  C-congestion 가정값 (70 %), visibly.
- Fatigue model (C-fatigue-load / C-fatigue-recovery, all weights
  criteria, editable): walk 0.35/분, seated ride 0.2/분, standing share
  linear 34 %→100 %, standing 0.9/분, above-capacity extra
  0.6/분, transfer 2.0/회 + wait 0.5/분; recovery at home 0.8/분 and in
  seated stays 0.3/분; midnight reset to 8; clamped 0–100. Expected
  values, no RNG — deterministic. Labelled everywhere
  "피로도 지수 · 가정 모델이며 건강·의학적 판단이 아닙니다". No verdict.
- Engine (`sim-engine/6`): every walk trip carries
  `congestion: null` + `fatigue_delta`; station-ride work aways carry
  `detail.rides` (out/back: legs with split minutes, congestion
  {line, station, direction, slot, value_pct, source}, fatigue_delta) or
  an honest `journey_note` + `ride_fallback`; per member-day a fatigue
  series with event markers; per-member summaries
  (arrival_work_avg, after_home_avg, avg_30d = mean of time-weighted
  daily means, peak_max, crowded_min). No destination / no network →
  numeric ride, never invented. Stage-7 metrics reproduce exactly.
- No car mode, no invented road traffic: walking legs show graph
  distance only. Road traffic needs the Seoul real-time traffic API key
  (orchestrator asks the user) + a car mode — later work.

**Part C — legibility**
- Now card: 피로도 bar (value + current-leg delta + congestion note +
  실측/가정값 badge + criterion chips + model note) and a day fatigue
  sparkline with event markers; free-camera rows show each member's value.
- Journey card: legs with per-leg congestion + source badges, 4-band
  legend (여유/보통/혼잡/매우 혼잡), "간략 지도 (건물 높이 추정)",
  congestion attribution, view buttons.
- A·B 비교 + 삶의 질: 출근 도착 / 퇴근 후 / 30일 평균 / 혼잡 100 % 초과
  탑승 시간 (가정값 badge, model note). QoL and compare agree exactly.
- Agent tools: `get_journey(run, day, member)`, `get_fatigue(run,
  member, day?)` (21 tools); prompt requires citing criterion ids +
  sources and the model note, never health advice; the guard strips the
  exact disclaimer before the topic check so it never trips itself.

## The 잠실→판교 commute (08:00 weekday, stated model)

Path: **2호선 잠실→강남 (7 stops, 7.181 km) + 환승 강남 + 신분당선
강남→판교 (5 stops, 14.48 km)** = 21.661 km. Customer total 30분 splits
8.6 + 환승 4 + 17.4. Morning (08:00 slot): 2호선 잠실→강남 **내선
93.2 % (서울교통공사 실측)** → 보통/혼잡 경계, 서서 감; 신분당선
강남→판교 **하선 70 % (가정값, 혼잡도 자료 없음)**. Out-ride fatigue
+21.2. Evening return reads the evening columns on the reverse
patterns (e.g. 2호선 강남→잠실 외선).

Fatigue summaries (stated model, 0–100): home A 구성원 1
{출근 도착 25.2, 퇴근 후 22.7, 30일 평균 7.6, 혼잡초과 0분, 최고 26},
구성원 2 {25.4, 22.8, 7.6, 0분, 26}; home B 구성원 1·2
{23.2, 23.3, 7.1, 0분, 23.3} (B has no destination station — never
invented — so rides stay numeric with fallback congestion). No demo leg
exceeds 100 % (max 93.2 %), hence 0 crowded minutes.

Corridor c1 (잠실→판교): **65 tiles, 10,971 buildings, 2.4 MB total**
(biggest tile 247 KB, builds in ~6 ms in Node, 16k tris); initial view
loads ~3–12 nearby tiles (≈100–450 KB). Tile cap 12 × 3 meshes + line +
dots + train ≈ **≤ 39 added draw calls** (budget; browser-measured
counts are logged as `[journey]` lines — see below).

## Capture URLs (dev server, port 5173)

- Departure (walking to 잠실역):
  `/?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:30&follow=1`
- Mid-ride journey view (cruise, train + corridor + banner):
  `/?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:50&follow=1`
- Descent into 판교 (lite detail + arrival hold into work hours):
  `/?mode=sim&scenario=demo-two-homes&home=A&day=1&t=09:02&follow=1`
- Fatigue in A·B 비교 (metrics) and 삶의 질 (per-home rows):
  `/?mode=sim&scenario=demo-two-homes&home=A&tab=compare`,
  `...&tab=quality`

## Verification

- Python: 163 passed (`pytest tests/`), incl. real-pbf network facts
  (잠실/강남/판교, 강남 transfer, 내선 order, geometry methods),
  real-xlsx loader (2호선 잠실 08:00 내선≈93.2 / 외선≈43.2).
- JS: 375 passed, incl. split exactness, worked fatigue examples,
  recovery/reset, determinism, camera state machine, tile selector,
  agent tools with a fake provider. `vite build` passes.
- Node smoke test drove `journey-scene.js` on the real run/network/
  corridor (line bounds 9.3×12.4 km, train sweep, tile pacing).
- Git: only source files changed; `data/raw`, `data/build` ignored;
  bundle scanned — no congestion values, no keys.

## 8b — sim-mode load crash (TDZ) + headless smoke check

Found by the orchestrator on the real GPU at 446ddc5: every sim-mode
URL stopped at "생활 시뮬레이션 불러오는 중…" with
`Cannot access 'ROLE_KO' before initialization`. Tour mode was fine;
Node tests passed because nothing imported the sim-load path.

Cause: in `bootSim` (`web/src/main.js`), the initial `store.set()`
called `buildSimMeta()` (line 1911) while `const ROLE_KO` — read by
that function — was declared later in the same scope (line 1963):
a temporal-dead-zone crash on every sim load.

Fix (Muse):
- `buildSimMeta` + `ROLE_KO` moved verbatim into the Now-card text
  builder (`web/src/nowcard.js`, module scope) as exported
  `simMetaFor({ household, scenario, run, homes })`; `main.js`
  imports it. Same inputs, same payload shape for the intro card.
- Same-family audit over all of `web/src` + `web/scripts` (binding-
  accurate TDZ scan: hoisted functions, const-arrow closures with
  transitive reads, direct references, block scoping; plus a
  no-undef pass) found one more stage-8 crash: `paintFollow`'s
  journey branch hid an undeclared `followPin` (never declared
  anywhere — a `ReferenceError` on the first station ride in follow
  mode). Removed; the `destPin` + `rideStub` hides already cover
  that branch. No other use-before/undeclared-use found.

New check — `web/tests/sim-smoke.test.js` (runs in `npm test`):
boots the sim state machine headlessly (no WebGL/DOM) on the real
`data/build` run through load → first frame (`?day=1&t=08:28`) →
follow each member + free camera → journey out/work/back → day
change → compare/money payloads, driving `indexRun`, `simMetaFor`
(the crash site, incl. the null-scenario fallback), `sampleAgent`
on the real graph, `nowCardFor`/`householdNow`/`tickerFor`/
`fatigueFor`/`highlightFor`, `rideStateFor`/`journeyBanner`/
`journeyPhase`/`trainPosition`/`corridorFor`, `compare()` and the
UI store's exact sim-load keys. A tripwire test keeps sim-meta
building in the tested module (fails if it drifts back into
`main.js`). Skips with a clear message when `data/build` is
absent. Proven: an injected `ROLE_KO` TDZ fails the suite with
the original `ReferenceError`; restored, it passes.

Test output: JS 384 passed (375 + 9 smoke), Python 163 passed,
`vite build` passes; bundle contains the extracted sim-meta
strings and no `followPin`. Stage-8 journey + fatigue UI payloads
(journey banner legs with congestion sources, train sweep,
corridor c1, fatigue load/recovery + series + summaries) are
asserted against the real run in the smoke test.

## 8c — follow-mode crash (`bboxToXY is not a function or its return value is not iterable`)

Found by the orchestrator on the real GPU at 7a90a4d (after 8b): every
follow-mode sim URL (`?mode=sim&…&follow=1` at `t=08:30`, `08:50`,
`09:02`, `t=19:18`, `&tab=criteria`) threw on load. Free camera,
compare tab and intro loaded fine.

Cause: two stage-8 helpers in `web/src/main.js` — `areaForStation`
(≈ line 1565, the itinerary preload that resolves a station to a
built area) and `destDetailLoaded` (≈ line 1693, the gate for the
descent into the destination detail) — destructured `bboxToXY()`
as an array (`const [x0, y0, x1, y1] = bboxToXY(...)`), but
`web/src/frame.js` returns an object `{minX, minY, maxX, maxY}`.
Destructuring a non-iterable object throws exactly the reported
`TypeError` (reproduced in Node with the same expression against
the real `songpa-jamsil/area.json`). Both run only in follow mode
with a station ride, so the 8b smoke test never reached them.

Fix (Muse):
- New pure module `web/src/station-areas.js` (no three.js/DOM):
  `bboxContains`, `pickStationArea` (smallest containing area wins —
  songpa contains jamsil; null → corridor level + note) and
  `destInLoadedAreas`. Object fields throughout.
- `main.js` keeps only the bbox fetching/caching wrappers and calls
  the pure module; net −10 lines there.
- Same-family audit over `web/src`: the only other `bboxToXY` use
  (`buildWorld`) already reads object fields; every
  `lonLatToXY`/`lonLatToWorld`/`xyToLonLat` call site correctly uses
  arrays; `frame.js` `haversineM` callers treat it as a number
  (`journey.js` and `consult/tools-money.js` define their own local
  `haversineM` with different signatures — unaffected). No other
  array-destructuring of object returns found.

New check — the smoke test (`web/tests/sim-smoke.test.js`, runs in
`npm test`) gains "resolves station areas (stage-8c crash site)":
it calls the extracted module with the real `data/build` area
bboxes, the home-area origin and the real `network.json` stop
coords, and asserts 잠실역 → `songpa-jamsil` (smallest-wins over
`songpa`), 판교역 → `pangyo`, outside-every-area → null, plus the
descent gate (loaded pangyo → true, only home loaded → false,
null dest → false). The tripwire test now also fails if
`main.js` ever array-destructures `bboxToXY` again
(`] = bboxToXY(`) or stops using the tested module.

Test output: JS 384 passed + 1 skipped (the bundle-contents test
skips — `web/dist` is absent because `vite build` cannot run in
this sandbox: `web/node_modules` is a symlink to a sibling tree
outside the workspace, so vite's `.vite-temp` config write fails
with EPERM; verified identical on the untouched tree, i.e.
pre-existing/environmental, failing at config load before any
source is read). Python 163 passed (unchanged). `node --check`
passes on all touched files; smoke suite 10/10.

## Needs the real GPU or live keys

- Journey rendering itself (camera flights, corridor look, legibility),
  measured draw calls + corridor load time < 2 s on medium, and the four
  captures above — the sandbox has no browser/GPU and blocks ports, so
  the dev server could not be curl-checked here (serve paths follow the
  existing verified `/data/*` pattern).
- Road traffic: Seoul real-time traffic API key + a car mode (later
  work, orchestrator asks the user).

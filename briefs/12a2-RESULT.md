# Stage 12a2 result (Muse): schedule ride times, 9 lines, more matched homes

All existing tests green plus the new ones (JS 707/707, Python 216/216),
`vite build` green, no keys or raw data in git or bundle. Built data was
rebuilt in place (`data/build/region/network.json`,
`data/build/homes-index.json`, new `data/build/homes/`).

## 1 — Ride times from the operator's schedule

New module `web/src/transit/schedule.js` (pure, tested):

- `parseInterstationCsv` reads the committed
  `scenarios/transit/seoul-metro-interstation.csv` (279 rows: lines 1–8,
  소요시간 mm:ss per gap) into a gap map + the median minutes-per-km
  **computed from the file: 1.4286분/km** (≈42 km/h).
- Branch junctions verified against OSM geometry and pinned in code:
  line-2 용답←성수, 도림천←신도림, line-5 둔촌동←강동 (file km ≈
  straight-line km in all three). Non-adjacent file neighbours
  (시청→용답, 하남검단산→둔촌동…) yield no gap.
- `rideMinutes(from, to, path, schedule)`: per leg, schedule gaps where
  the file covers the line, else leg km × median; transfers add the
  stage-8 4분/회 (C-ride-split, labelled, overridable via
  `transferMin`); the note always ends with "대기 시간 제외".
  `findPath` legs gained `edgeKm` for per-gap estimates (additive).
- Precedence customer > schedule > estimate, `source` customer/derived,
  per-leg `method` schedule/estimate/mixed in the result + note.
- C-ride-minutes / C-ride-split rule texts updated in
  `scenarios/criteria/kr-default.json` (source now
  "데이터: 서울교통공사", an allowed value).
- `find_homes` takes `opts.schedule`; default sort is now walk+ride
  total (known walk first, then known ride; unknown walk last).
  `commuteMax` still filters on known walk only — deliberate: the
  ceiling must not silently drop homes on a derived number.
- `scenarioFromProfile(..., {network, schedule})` fills per-home ride
  minutes (customer number, else derived, labelled
  `user_input`/`derived`); only homes with neither keep
  `needs_user_input`. The engine records the source in the trace
  (`ride_minutes_source`) instead of "unavailable" — no `routines.js`
  change needed. Consult server threads `loadTransit` (CSV parsed once,
  cached) through `find_homes` and `build_scenario`.
- Station-name matching schedule↔OSM: normalised both sides (strip 역
  + parentheticals). **Unmatched: zero on lines 2/3/5/7/8**
  schedule-side (75 schedule-only rows are all lines 1/4/6, not in the
  network); 26 network-only stations are the non-Seoul-Metro sections
  whose gaps fall back to estimate: line 3 대화~삼송 (10), line 7
  까치울~석남 (11), line 8 별내 연장 (5).

Ride-time coverage (8,276 station-homes × destination, derived layer):

| 목적지 | schedule-only | mixed | estimate-only | no path |
|---|---|---|---|---|
| 판교 | 0 (every 판교 path touches 신분당/수인분당/경강선) | 7,339 | 752 | 185 |
| 강남 | 3,016 | 4,763 | 312 | 185 |
| 잠실 | 4,136 | 3,937 | 18 | 185 |

No-path = 4 box "station" POIs off our lines (bus terminals +
경의중앙선 응봉), honest unknown. Customer source appears when the
customer gives a number (tested override); the example below has none.

## 2 — Lines 3, 5, 7, 경강선 in the network

`pipeline/network.py`: `LINE_SPECS` 5 → 9, explicit `MATCH_ORDER`
(신분당선 before 분당선), plus keep-extra-patterns-that-add-stations
(`_with_branch_patterns`, pure-tested). Same OSM method, geometry
chainage, direction rules throughout.

| line | stops | patterns |
|---|---|---|
| 2호선 | 51 (loop 43 + 성수/신정지선 8 — same rule, newly kept) | 4 |
| 3호선 | 44 (대화–오금) | 2 |
| 5호선 | 56 (방화–하남검단산 + 마천 branch) | 3 |
| 7호선 | 53 (장암–석남) | 2 |
| 8호선 | 24 | 2 |
| 9호선 | 38 | 2 |
| 신분당선 | 16 | 2 |
| 수인·분당선 | 38 | 2 |
| 경강선 | 12 (판교–여주, +성남역 from the 부발 pattern) | 3 |

Transfers 13 → 39. Briefed transfers all resolve: 잠실 2·8, 천호 5·8,
가락시장 3·8, 수서 3·수인분당, 건대입구 2·7, 강남구청 7·수인분당,
판교 신분당·경강선. Distances match the real line lengths (2호선
49.0 km, 7호선 61.7 km, 경강선 56.0 km…).

Two fixes while rebuilding: `osmium getid` needs `-r` (without
referenced way nodes every edge silently falls back to haversine —
now 678/678 geometry edges); line 2's 지선 and 경강선's 성남역 ride
the new branch-pattern rule. The five old lines keep identical stop
lists except line 2's +8 branch stations.

Congestion: lines 3/5/7 hit the existing Seoul Metro table
(verified: 5호선 고덕 47.4%, 3호선 수서 44.7%, 7호선 강남구청 83.2%
weekday 08:00); 경강선 has no table entry → 가정값 fallback,
`hasData: false` ("혼잡 자료 없음" path, never invented).

## 3 — More homes matched (register 66.8% → combined 77.6%)

New `pipeline/osm_names.py`: pool of ~12k named OSM residential
polygons from the 9 region extracts (deduped by osm id, largest area
wins for bbox-clipped copies). Rules: exact normalised match wins;
else exactly one distinct edge-aligned containment (shorter ≥ 4,
middle ≥ 7); OSM names without complex identity never match (bare
numbers `101`/`103동`/`가동`, bare generics `오피스텔`…);
same-name polygons must cluster within 1.5 km; centroid inside the
row's region union (all 9 "union", never bbox); 법정동 must agree when
both sides have one. Never a name alone across regions.

| region | rows | register | + osm_name | % before → after | homes (register + osm) |
|---|---|---|---|---|---|
| bundang | 27,905 | 25,560 | 473 | 91.6 → 93.3 | 522 (514 + 8) |
| gangdong | 30,192 | 20,766 | 5,130 | 68.8 → 85.8 | 3,421 (3,396 + 25) |
| gangnam | 39,144 | 28,368 | 6,407 | 72.5 → 88.8 | 3,160 (3,108 + 52) |
| jungwon | 9,617 | 7,725 | 493 | 80.3 → 85.5 | 1,614 (1,607 + 7) |
| seongdong | 16,503 | 11,698 | 1,199 | 70.9 → 78.1 | 1,057 (1,043 + 14) |
| songpa-gu | 53,081 | 39,518 | 7,034 | 74.4 → 87.7 | 6,817 (6,787 + 30) |
| sujeong | 9,852 | 3,914 | 3,593 | 39.7 → 76.2 | 990 (960 + 30) |
| suji | 20,185 | 14,246 | 3,378 | 70.6 → 87.3 | 427 (381 + 46) |
| wirye | 86,904 | 44,125 | 4,167 | 50.8 → 55.6 | 27 (3 + 24) |
| total | 293,383 | 195,920 | 31,874 | 66.8 → 77.6 | 18,035 (17,799 + 236) |

Headline cases now matched: 헬리오시티 (→ 송파헬리오시티, 가락동),
산성역포레스티아 (891건), 산성역자이푸르지오 1–4단지, 위례
힐스테이트센트럴위례·위례포레자이·위례자이·송파위례리슈빌… Honest
residual misses: 위례센트럴자이 (no OSM polygon at all),
위례아트리버푸르지오1단지 (only 2단지 mapped). Every home carries
`match: register|osm_name` (+ `osm:{id,name}`); the card shows
"위치: OSM 단지 이름 일치" for the latter (12b).

10 seeded spot-checks (`OSM_SPOTCHECK_SEED = 20261029`, all
hand-verified plausible — complex ⊂/=/⊃ OSM name, same area):

- sujeong 가천대역두산위브 ← 가천대역 두산위브
- songpa-gu 송파시그니처롯데캐슬 ← 송파시그니처롯데캐슬
- gangnam 개포자이프레지던스 ← 개포자이프레지던스아파트
- sujeong 판교밸리자이3단지 ← 판교밸리자이 3단지
- jungwon 중앙하이츠금광프리미엄아파트 ← (same)
- songpa-gu 송파파크데일1단지 ← (same)
- gangnam 스톤빌리지 ← 스톤빌리지 대치2차
- gangnam 강남신동아파밀리에2단지 ← 신동아파밀리에아파트
- suji 성복아이파크 ← 용인성복아이파크아파트
- suji 광교지웰레이크 ← (same)

(coordinates in the build output, `osm_spotcheck` key.)

## 4 — Browser-sized index

`pipeline homes` also writes `data/build/homes/<region>.json` (card
fields only: id, name, kind, region, lon/lat, build year, buckets,
station walk, scene, match, osm_name) + `homes/summary.json` (counts
per region and kind/match). Consult tools keep the full 19 MB file
server-side. Slim total ≈ 17.6 MB — the saving is per-region lazy
loading (buckets dominate both), not the total:

bundang 0.8 · gangdong 3.2 · gangnam 3.2 · jungwon 1.2 · seongdong 1.1
· songpa-gu 6.7 · sujeong 0.8 · suji 0.5 · wirye 0.04 MB (+ 2 KB
summary). Served under the existing `/data` middleware, no new wiring.

## 5 — Verification + orchestrator commands

- JS 707/707 (691 existing + 16 new: 9 ride-times incl. live
  고덕→판교/대치→삼성 + transfer checks, 4 find_homes derived/override/
  sort, 3 scenarioFromProfile fill/override/partial).
- Python 216/216 (200 existing + 16 new: 3 network incl. live new-line
  transfer checks, 9 osm_names, 4 homes incl. slim writer).
- `vite build` green; bundle has no `data/raw` refs and does not embed
  the schedule CSV (server-side only).
- Orchestrator: `.venv/bin/python -m pipeline network --refresh &&
  .venv/bin/python -m pipeline homes` (network needs `--refresh` once
  for the new lines' member ways; homes is idempotent).
- Note: `pipeline safety` output is untouched by this stage (regions
  unchanged); 12a's safety build still stands.

## 6 — 판교 example re-run (with ride minutes)

"판교로 출근하는 신입, 연봉 4천, 모은 돈 5천, 전세 2억 이하" →
**2,934 matches** (was 2,917), top 6 now near 판교 (the old walk-only
sort led with 강동 villas):

1. 천사의도시Ⅱ오피스텔 (분당, 40㎡) 1.85억/3건 — 미금 도보 3.8분,
   승차 약 6.6분 (추정 1.43분/km × 4.6km), 3D 가능
2. 오라타워 (중원, 40㎡) 1.25억/2건 — 모란 도보 1분 이내, 승차 약
   11.6분 (수인분당→경강선 환승 이매 1회 포함), 3D 가능
3. 시그마 3 (분당, 30㎡) 1.77억/7건 — 야탑 도보 3.8분, 승차 약 8.5분
   (환승 1회 포함), 3D 가능
4. 분당오벨리스크 (분당, 40㎡) 1.93억/5건 — 서현 도보 4.9분, 승차 약
   8분 (환승 1회 포함), 3D 가능
5. 노블리치1오피스텔 (분당, 30㎡) 1.60억/5건 — 야탑 도보 4.9분, 승차
   약 8.5분 (환승 1회 포함), 3D 가능
6. 성남 메트로칸 (중원, 40㎡) 1.92억/2건 — 모란 도보 2분, 승차 약
   11.6분 (환승 1회 포함), 3D 가능

All six carry a derived ride number with source + method labels
(대기 시간 제외); every route now uses 경강선 where it is shortest
(모란→이매→판교). Recorded reply + live cross-check updated
accordingly (`profile_search`).

## 7 — What 12b can rely on (stable APIs)

- `web/src/transit/schedule.js`: `parseInterstationCsv`,
  `rideMinutes(from, to, path, schedule)`, `gapMinutes`,
  `scheduleLineOf`, `unmatchedScheduleStations`, source labels.
- `find_homes(..., {schedule})`: `commute.ride`
  `{minutes, source: customer|derived, note, derived?}`, `commute_ko`
  one-liner, source badges incl. schedule/estimate.
- `scenarioFromProfile(..., {network, schedule})`: filled
  `ride_minutes` + `ride_minutes_source` + `needs_user_input`.
- Files: `data/build/homes/<region>.json` + `summary.json` for the
  browser; full `homes-index.json` server-side; `match`/`osm_name` on
  every record; 9-line `network.json`.

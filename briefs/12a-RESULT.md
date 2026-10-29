# Stage 12a result (Muse): 11 areas, customer numbers, real candidate homes

`vite build` green. Python 199/199 green (168 existing + 31 new). JS: all new
suites green (60/60 incl. a live cross-check of the recorded example against
the real build); full-suite re-run after the last edits is still pending
(was 686/687 with the one known failure fixed — see §8).

## 1 — Regions (Part A1): `data/build/regions.json`

9 regions resolved from OSM (`pipeline/regions.py`, one prefilter + one scan):

| id | label | boundary (OSM) | 시군구 | RTMS | safety column + level |
|---|---|---|---|---|---|
| seongdong | 서울 성동구 | 성동구 r2419953 L6 | 11200 | seongdong | 서울 성동구, district |
| songpa-gu | 서울 송파구 | 송파구 r2419954 L6 | 11710 | songpa | 서울 송파구, district |
| gangnam | 서울 강남구 | 강남구 r2410520 L6 | 11680 | gangnam | 서울 강남구, district |
| gangdong | 서울 강동구 | 강동구 r2419944 L6 | 11740 | gangdong | 서울 강동구, district |
| bundang | 성남시 분당구 | 분당구 r5423194 L7 | 41135 | bundang | 경기도 성남시, city |
| sujeong | 성남시 수정구 | 수정구 r5423192 L7 | 41131 | sujeong | 경기도 성남시, city |
| jungwon | 성남시 중원구 | 중원구 r5423193 L7 | 41133 | jungwon | 경기도 성남시, city |
| suji | 용인시 수지구 | 수지구 r8127737 L7 | 41465 | suji | 경기도 용인시, city |
| wirye | 위례 | 위례동 r11117000 + r13316464 L8 | 11710·41131·41450 | songpa·sujeong·hanam | 3 관할, never merged |

- 시군구 codes cross-checked against data: every region's matched PNUs carry
  exactly the listed 5-digit prefix (wirye: 41450 + 11710).
- 위례 definition (noted in `regions.json` as `wirye_note`): union of the OSM
  위례동 boundaries **where present** — this extract has only 서울 송파구
  위례동 (r11117000) and 하남시 위례동 (r13316464); 성남 수정구 위례동 has no
  OSM boundary (verified by full national scan). 위례 homes = rows from the
  three district files whose matched footprint falls inside the union polygon;
  성남-side rows stay in 수정구. Safety shows the three 관할 separately.
- Places (labels, not statistics units): 판교·정자·분당(서현·수내)·미금, all
  resolving to stations in 분당구.

## 2 — Station boxes (Part A2): 60/60 built, 63 skipped

`pipeline/boxes.py`: each region bbox clipped from the national PBF **once**
(`data/build/_cache/regions/<id>.osm.pbf`), one pyosmium pass per region
counts apartment buildings within 600 m of each metro station. Ordered by
count, cap 60 with the 14 required stations holding guaranteed slots
(왕십리·강남·삼성·천호·고덕·남위례·모란·정자·서현·미금·수지구청 + 판교·성수·잠실 —
all found in OSM with count > 0, none forced). 63 skipped stations are logged
in `station-boxes.json` with reasons (62 below the cut at 77, e.g. 수내 63·
선릉 71·압구정 74; 복정 0 — no apartments within 600 m).

Build (`pipeline build --areas station:*`, incremental via `box_manifest.json`
input signatures, resumable — re-run skipped 60/60; boxes clip from their
region extract): **60/60 ok, 0 errors**, ~26 min wall total, 11–63 s per box
(median 23 s), 5–36 MB per box (median 12 MB, total 0.89 GB). Per-box
seconds + bytes in `data/build/boxes-report.json`.

3 boxes fail the standing walk-LCC ≥ 95% check (data characteristic, check
not weakened; scenes kept and usable, flagged in boxes-report):
st-가천대 93.7%, st-대청 92.9%, st-삼성 95.0% (borderline).

`data/build/areas-index.json` (64 areas: 60 + 4 legacy) carries id, label,
center, bbox, station, size. The app (`web/src/main.js` + new
`web/src/areas-index.js`) loads the index at boot (legacy-4 fallback when
unbuilt) and still loads only the selected box; station containment uses
index bboxes (no area.json fetch).

## 3 — Home index (Part B): `data/build/homes-index.json` (17,799 homes)

`pipeline homes`: RTMS rows (293,383 read, 0 files missing/empty) → PNU via
register stream over the combined region bbox (land-type agnostic, 산 included,
부번 0 padded; mirrors `pnu.js`) → grouped by 단지명 + PNU + type.

| region | rows | matched | % | homes |
|---|---|---|---|---|
| bundang | 27,905 | 25,560 | 91.6 | 514 |
| gangdong | 30,192 | 20,766 | 68.8 | 3,396 |
| gangnam | 39,144 | 28,368 | 72.5 | 3,108 |
| jungwon | 9,617 | 7,725 | 80.3 | 1,607 |
| seongdong | 16,503 | 11,698 | 70.9 | 1,043 |
| songpa-gu | 53,081 | 39,518 | 74.4 | 6,787 |
| sujeong | 9,852 | 3,914 | 39.7 | 960 |
| suji | 20,185 | 14,246 | 70.6 | 381 |
| wirye | 86,904 | 44,125 | 50.8 | 3 |
| **total** | **293,383** | **195,920** | **66.8** | **17,799** |

Each record: id, name, kind, region, lon/lat (footprint centroid), build year
(register approval + RTMS 건축년도 mode), ±5 ㎡ buckets with trade/jeonse/
wolse counts + median + range (cancelled excluded), nearest station + graph
walk minutes when inside a built box else null (8,212 with station; never a
straight-line guess), scene box id or null (8,275 with scene, 56 boxes used),
photos within 700 m.

**Data finding (honest): the register extract is stale for new builds.**
헬리오시티 (가락동 913), 힐스테이트송파위례 (장지동 883), 위례센트럴자이,
산성역포레스티아 등이 대장에 없어 위례 아파트는 매칭 불가 → 위례 3곳(빌라만),
sujeong 39.7%. Unmatched examples ship per region in the build report.

## 4 — Profile (Part C): `web/src/profile.js`

14 fields, each `{value, source: customer|default|derived, note}`: members,
workplaces (station/POI in our data or 모름), salaryAnnual/takehomeMonthly,
cash, debts, tenure, depositMax/monthlyMax/priceMax, sizeMin, commuteMax,
priorities (9a weights), mustHaves. Salaries/cash/budget/workplace never
defaulted. `extract_profile` fills only values in the text (evidence guard,
Korean money: 4천→4e7, 2억 5천→2.5e8, 월 80), asks ≤2 plain-word questions.
`scenarioFromProfile` is deterministic (stable seed hash); unknown ride times
stay `{}` + `needs_user_input` (engine records unavailable, never guesses);
complex names join via shared PNU. Demo scenario ships as `exampleProfile()`,
labelled 예시.

## 5 — Search (Part D): `web/src/homes.js` + `web/src/consult/tools-search.js`

`find_homes(profile, {sort, limit, regions, kind})`: tenure+budget medians of
the matching bucket (all/none/partial fit + deals count), size, kind,
customer-named regions, commute (graph walk or 도보 미확인; network path with
lines/transfers/km; ride stays the customer's number per C-ride-minutes or
승차 미확인), must-haves on the graph inside boxes. Sorts: commute (default,
shown), monthly, deals, priority; no score/rank/추천 (contract-tested).
Results carry numbers, source badges, scene, ≤6 photos.
`find_public_rentals` applies the same budget rules; coverage parses 시군구
segments (snapshot 2026-10-28: 송파 171·성동 80·분당 19 complexes, +1 youth
unit in 강남; elsewhere "이 지역 공공임대 자료 없음"). Loader accepts any
`snapshot_*.json` (merged, newest wins). Tools: `extract_profile`,
`find_homes`, `find_public_rentals`, `build_scenario` (38 total). System
prompt + `profile_search` recorded reply cover the new flow.

Deviation note: the brief's "ride minutes from the stage 8 network" is not
implemented as network-derived minutes — C-ride-minutes (app cannot know
transit times) stands; the network contributes path/lines/transfers/km and
the ride total stays the customer's number, labelled.

## 6 — Photos (Part E): `web/src/places/photos.js`

`photosNear` over the 4,553-item Commons manifest (700 m, ≤6): prefers
streets/parks/stations/apartments/skylines, drops portraits/events/food/
interiors/logos; every photo has a credit line + page link; UI constant
"주변 사진 · 이 매물 사진이 아니에요". Photos per region bbox: gangnam
3,089 · songpa-gu 1,499 · seongdong 550 · suji 545 · gangdong 206 ·
bundang 176 · sujeong 71 · jungwon 45 · wirye 17. `sceneThumbnail(boxId)`
renders our own 640×400 massing preview offscreen (injected renderer seam,
in-memory data-URL cache).

## 7 — Example run (real data)

"판교로 출근하는 신입, 연봉 4천, 모은 돈 5천, 전세 2억 이하" →
profile (1 adult, 판교 resolved, 4e7/5e7/jeonse/2e8, all customer) →
**2,917 matches**, top 6 all villas/officetels with scenes (as expected —
no apartments at this budget near stations): 하우징허브 1.69억(3건),
양지빌라A동 1.39억(1건), 오라타워 1.25억(2건), 브라운스톤천호 2.00억(1건),
동인 레반트 1.70억(2건), (1-25) 0.90억(2건) — each with graph walk,
network path + transfers, 승차 미확인. Recorded in `demotour.js`
(`profile_search`, labelled 예시/기록된 답변) and cross-checked by a live
test against the build.

## 8 — Verification + orchestrator commands

- Python 199/199 · JS new suites 60/60 · `vite build` green · no keys/raw
  data in git or bundle (`data/` gitignored; bundle has no `data/raw` refs).
- Full JS suite: 686/687 before the last edits (1 known: middleware
  list_areas count — fixed to the index contract); final full re-run pending.
- Changed-behaviour tests updated for the mandated API change: 34→38 tools,
  list_areas-from-index. `pipeline safety` rebuilt (regions added, areas
  unchanged); `get_safety` resolves st- boxes to regions; 위례 returns
  per-관할 parts.
- Orchestrator: `.venv/bin/python -m pipeline regions && .venv/bin/python -m
  pipeline boxes && .venv/bin/python -m pipeline build --areas station:* &&
  .venv/bin/python -m pipeline homes && .venv/bin/python -m pipeline safety`
  (all idempotent; boxes resume via manifests).

## 9 — What 12b can rely on (stable APIs)

- Files: `data/build/regions.json`, `station-boxes.json`, `areas-index.json`,
  `homes-index.json` (+ `boxes-report.json`, `region/safety.json` regions).
- Web: `profile.js` (profile/extract/guard/questions/scenarioFromProfile/
  exampleProfile), `homes.js` (find_homes/find_public_rentals/coverage/
  commuteLine), `places/photos.js` (photosNear/credit/sceneThumbnail +
  disclaimer), `areas-index.js` loader.
- Consult tools (38): + `extract_profile`, `find_homes`,
  `find_public_rentals`, `build_scenario`; session loaders `loadHomes`,
  `loadPhotos`, `loadAreasIndex`, `loadStationBoxes`; `list_areas` reads
  the index. Recorded `profile_search` reply for no-key mode.

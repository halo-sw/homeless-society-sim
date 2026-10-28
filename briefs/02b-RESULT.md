# Stage 2b result — visual polish + register matching (Muse)

Date: 2026-10-28. Agent mode, single agent (no subagents — `AGENTS.md`
reserves product code, tests and pipeline scripts to Muse). All code and
tests below are my own. Style reference used as art direction only
(camera distance, proportions, palette, light); nothing copied or traced.

## Part A — visual polish (`web/`)

1. **Camera** (new `web/src/camera.js`, wired in `web/src/main.js`):
   narrow FOV 24°, pitch 45°, stop frame 300 m across, glide frame
   500 m, tour target centred. At the orchestrator's 1280×860
   (aspect 1.49) that is 474 m camera distance at stops, 790 m during
   glides; the frame eases wide→tight along each leg. Home/overview
   frames the whole area span with the same pitch/FOV.
2. **Trees** (`web/src/trees.js` + instancing in `main.js`): 6–10 m
   tall overall, crown radius 2–3.5 m (r 2.6 m icosahedron at canopy
   height 4.8 m), 3 m trunk visible below the canopy, per-tree scale
   ±20 % seeded (was 0.8–1.5×).
3. **Palette + light** (`palette.js`, `buildings.js`, `main.js`):
   shadow strength 0.32 (`shadow.intensity`, three r170 supports it),
   hemisphere fill 0.85 → 1.1 (warm ground), sun 2.6 → 2.4. Paper base
   stays #FBF7EE; roads #DCD6CC / major #D0C8B8; apartments in cream /
   warm-white / pale-terracotta families with per-complex variation,
   subtle floor banding (×0.965, not stripes) and a darker short-end
   side face (×0.93, three face tones); houses keep red-brown roofs;
   non-residential pale grey-beige. Thin edge lines skipped: on the
   merged soup they would need an `EdgesGeometry` pass over up to
   1.3 M triangles (songpa) — not cheap.
4. **Ground layers** now step paper base #FBF7EE → complex plates
   #EADFC4 → footways #E9E3D5 → roads #DCD6CC → parks #AFC493 →
   water #93BCD6, with white crossings on top.
5. **Paper framing**: `#vignette` overlay (radial gradient to paper at
   the edges, pointer-events none) in `index.html` / `style.css`.
6. Caption/cards/legend/attribution/주거만 강조 untouched except the
   walk line: stop 0 shows "출발", later stops keep the
   graph-derived "이전 정류장에서 도보 X분 (Y m)".
7. **Debug flags**: `?shot=<stopIndex>` jumps to that stop and pauses
   (camera snapped, caption shown, orbit enabled); `?t=<seconds>`
   jumps the tour clock and keeps playing. The clock model
   (`tourSchedule`/`seekState`/`legGlideDuration` in `tour.js`) is pure
   and unit-tested; tour content itself is unchanged (same 6 stops and
   legs per area as stage 2).

## Part B — register matching (`pipeline/register_api.py`)

- **Footprint-area match**: `footprint_area_m2` (shapely, same
  equirectangular projection as `area_build`), `is_main_building_record`
  (주건축물 + `grndFlrCnt > 0` + positive `archArea` + no 경비실/주차장/부속
  in names), `match_by_area` (one-to-one, smallest relative
  `|area−archArea|/archArea`, tolerance 15 %, tie-break on
  (diff, building id, record key)). `assign_parcel` runs dong-match
  first, then the legacy single-record rule, then area match on the
  leftovers; unmatched stays inferred. Against the real 백현동 553
  sample (read-only): 21/36 records pass the filter (20 numbered
  dongs + 상가동; 경비실/주차장 all excluded).
- **블록 retry**: `fetch_parcel` — when `platGbCd=0` succeeds with
  0 records, one retry with `platGbCd=2` (mountain parcels unaffected).
  The cached body may therefore be the plat-2 response; `block_retries`
  is counted in the summary.
- **Recap**: `getBrRecapTitleInfo` once per parcel in the fill set that
  has an apartment building (`recap_parcels`, reported as `recap_pnus`
  in the dry-run). After the rebuild, fetched parcel recaps are summed
  onto their complexes as `households`, `main_bld_cnt`,
  `households_source: "register_recap"`, `households_pnus`
  (`attach_complex_recaps` handles inline and `$ref` complex sections;
  schema documented in `docs/area-schema.md`). Title `hhldCnt` was
  already stored per building (`register.api.households`) — unchanged.
  Scoping note: recap is bounded to the fill's eligible parcels, so a
  complex spanning unfilled parcels gets a partial sum; `households_pnus`
  says exactly which parcels contributed.
- **503**: shared `_http_get` retries 429/5xx incl. 503 with 1/2/4 s
  backoff (3 attempts) for titles, block-retries and recaps alike.
- Tests: 15 new in `tests/test_register_api.py` + 3 synthetic fixtures
  (`area_match.json`, `recap.json`, `recap_empty.json`); the real
  sample is only ever read. One existing test updated for the contract
  change (`recap_pnus` in the dry-run plan); no assertion weakened.

## Commands run and observed output

1. `.venv/bin/pytest tests/ -q` → **131 passed** (~14 s).
2. `cd web && npm test` → **50 passed** (was 42; +camera/schedule/scale/tone tests).
3. `cd web && npm run build` → **✓ built** (~0.5 s).
4. `.venv/bin/python -m pipeline.validate --all` → seongsu/songpa/
   songpa-jamsil PASS; pangyo FAIL (inferred 66.7 %, unchanged —
   needs the real fill, no fake heights added).
5. Headless node e2e over all areas (load + buildings + trees + tour):
   6 stops each, tours 42–55 s; songpa 1.3 M tris in ~2.8 s; tree
   scales observed in [0.80, 1.20]; stop width verified 300 m at
   1280×860 aspect. No rebuild of `data/build` was needed (pipeline
   changes only affect `register-fill`, which runs outside the sandbox).
6. Dry-run plans (orchestrator runs the real fetch):

| area | title pnus | title buildings | recap pnus |
|---|---|---|---|
| pangyo | 99 | 764 | 5 |
| seongsu | 713 | 1236 | 2 |
| songpa | 1705 | 4284 | 20 |
| songpa-jamsil | 83 | 335 | 1 |

Title counts match stage 2 exactly (plus the new `recap_pnus` key and
the songpa row, previously unreported). At ≤ 5 req/s plus backoff the
songpa title pass alone is ≥ 6 min; suggest `--limit` smoke runs first.

## Debug URLs (all four areas, 6 stops each)

Serve `web/` (`npm run dev`) and open (short tour-clock alternative:
`?t=` jumps seconds into tours of pangyo 55.4 s / seongsu 42.6 s /
songpa + jamsil 49.8 s):

- pangyo (백현마을 → 화랑초등학교 → 숲안어린이공원 → 7-Eleven →
  연세CS치과의원 → 판교):
  `/?area=pangyo&shot=0` `/?area=pangyo&shot=1` `/?area=pangyo&shot=2`
  `/?area=pangyo&shot=3` `/?area=pangyo&shot=4` `/?area=pangyo&shot=5`
- seongsu (서울숲힐스테이트 → CU 성수베스트 → 서울경동초등학교 →
  성수근린공원 → 건국약국 → 성수):
  `/?area=seongsu&shot=0` `/?area=seongsu&shot=1` `/?area=seongsu&shot=2`
  `/?area=seongsu&shot=3` `/?area=seongsu&shot=4` `/?area=seongsu&shot=5`
- songpa (갤러리아팰리스 → 세븐일레븐 잠실 갤러리아점 →
  스마일플러스치과 → 송전초등학교 → 잠실광역환승센터 → 송파나루공원):
  `/?area=songpa&shot=0` `/?area=songpa&shot=1` `/?area=songpa&shot=2`
  `/?area=songpa&shot=3` `/?area=songpa&shot=4` `/?area=songpa&shot=5`
- songpa-jamsil (same six stops as songpa):
  `/?area=songpa-jamsil&shot=0` `/?area=songpa-jamsil&shot=1`
  `/?area=songpa-jamsil&shot=2` `/?area=songpa-jamsil&shot=3`
  `/?area=songpa-jamsil&shot=4` `/?area=songpa-jamsil&shot=5`

## Not verifiable without a browser

- The actual look: shadow softness/exposure balance (0.32 / hemi 1.1 /
  sun 2.4 are estimated, not eyeballed), palette harmony, plate/park/
  road separation, vignette strength, caption overlap at 1280×860.
- `?shot=`/`?t=` run through the same tested pose/clock code headlessly,
  but real-frame capture (caption visible, camera settled — the snap is
  immediate, no lerp) needs the orchestrator's screenshots.
- Draw calls / fps: scene still ~10 draw calls by construction; real fps
  needs the browser perf log line.
- Register fill: no network in the sandbox — title matching, block
  retry, recap attach and 503 backoff are fixture-tested only; the
  first real fetch decides pangyo's inferred share.

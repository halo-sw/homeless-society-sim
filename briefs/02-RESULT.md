# Stage 2 result — residential 3D scene + miniature style (Muse)

Date: 2026-10-28. Everything below was built and run by the reporting
agent in this repo (`sim/`), sandboxed, no network. All product code,
tests and pipeline scripts are my own (per `AGENTS.md`).

## What built

**Part A — pipeline (Python).** All four areas rebuilt with:
- Buffered graphs: scene-box walk/bike/drive graphs are built from a
  300 m buffered extract (`extract.buffered.osm.pbf`), connectivity is
  measured on the buffered graph, and the shipped graph is clipped to
  the box keeping every edge whose segment intersects it
  (`pipeline/extract.py`, `pipeline/graph.py`). `report.json` carries
  the full LCC family: `walk_lcc` (thresholded after-share),
  `walk_lcc_box` (before), `walk_lcc_buffered`, `walk_lcc_clipped_raw`.
  `validate.py` thresholds the after-share and cross-checks the raw
  share by recomputation from `area.json`.
- Residential classification per building (`residential` +
  `residential_source`, rules in `pipeline/building_join.py` and
  `docs/area-schema.md`). Register use wins (공동주택→apartment,
  단독주택→house); strict apartment-name evidence (excluding 상가/공장
  wings) gates `mixed` and the no-register fallback; OSM
  `building=residential` splits on levels ≥ 4 (the tag alone proved
  unreliable). `register.use` stays verbatim.
- Complexes (`complexes` section via `pipeline/complexes.py`): register
  name stems, else named `landuse=residential` polygons, else ≤ 40 m
  spatial clustering with a documented 150 m anti-chaining guard for
  unnamed clusters (single linkage alone fused 511 buildings / 1.1 km
  in songpa). Names are never invented; `households_hint` is null (no
  세대수 signal in shapefiles — but see the API note below).
- Register-API fill (`pipeline/register_api.py`, CLI
  `.venv/bin/python -m pipeline register-fill --area pangyo`,
  `--dry-run` supported): PNU-keyed, key from `DATA_GO_KR_KEY` only
  (never logged), ≤ 5 req/s, retried, cached per PNU under
  `data/raw/register_api/`, resumable, dong-aware matching, new sources
  `api_height`/`api_floors`. During the session a real 36-item sample
  response plus the official guide (v1.0) appeared under `data/raw/`
  (read-only use); all field names verified against them, and the real
  household signal `hhldCnt` (세대수) is captured as
  `register.api.households`.
- Incidental fix: boundary areas now always ensure the cached boundary
  relation file, restoring songpa's register clip (28088 buildings).

**Part B — 3D scene (`web/`, three.js + Vite, plain ES modules).**
`/?area=songpa-jamsil` loads `data/build/<id>/area.json` (+ `$ref`
parts) through a dev-only `/data` route — data is never copied into
`web/`. Modules: `frame` (WGS84↔metres), `buildings` (merged
residential/context massing: banded ≥6-floor slabs with rooftop boxes,
pitched gable/hip roofs for ≤3-floor rectangular houses, flat muted
rest), `ground` (road ribbons by class, zebra crossings at
footway/road junctions, parks/water, named-complex paving plates),
`trees` (seeded instanced ginkgo/zelkova, never in footprints, labelled
decorative), `palette` (miniature style, paper #FBF7EE), `lighting`
(solar position driving sun + hemisphere fill), `tour` (4–6 stops from
real complexes + daily-life POIs joined by walk-graph shortest paths,
cinematic glide with ~40° pitch, 3 s dwells, caption cards with
graph-derived walking minutes, progress dots, intro fade, outro
pull-back), `walkers` (30 seeded preview residents, labelled
simulated), `load` ($ref loader). UI: 4-area switcher, play/pause,
"주거만 강조" fade, height-source + residential legend, always-visible
attribution. Draw calls + triangle count log to the console once after
load.

## Commands run and observed output

1. `.venv/bin/pytest tests/ -q` → **115 passed** in ~14 s (80 stage-1 +
   35 new: buffered graph, residential, complexes, register API incl. a
   real-sample verification test).
2. `cd web && npm test` (`node --test tests/*.test.js`) → **42 passed**
   (frame, roofs, palette, solar, ground, trees, walkers, tour incl. a
   real-data jamsil tour test).
3. `cd web && npm run build` → **✓ built** (~0.6 s, 15 modules).
4. `.venv/bin/python -m pipeline build --all` → all areas build; exit 1
   with exactly one stderr line (pangyo inferred heights, see gaps).
5. `.venv/bin/python -m pipeline.validate --all` → seongsu/songpa/
   songpa-jamsil PASS; pangyo FAIL (inferred 66.7% only).
6. `register-fill --dry-run`: pangyo **99 parcels / 764 buildings**,
   seongsu 713/1236, songpa-jamsil 83/335. No network in the sandbox;
   the orchestrator runs the real fetch outside it.
7. Headless node end-to-end over all areas (load + buildings + ground +
   trees + tour + walkers): jamsil 158k building tris, 6.4k ground
   tris, 2200 trees, 6-stop tour in ~0.1 s; songpa 1.3M tris in ~3.4 s.
   Browser draw calls / fps will be observed from screenshots (the perf
   log line is in place); the scene holds ~10 draw calls by
   construction (2 building meshes + ground + base + 2 tree + walkers +
   tour line + shadow pass).
8. Dev-server socket binding is blocked in the sandbox, so the `/data`
   middleware was verified by direct invocation: area.json → 200 JSON,
   part file → 200, path escape → 403, missing → next().

## Per-area numbers (measured, this run)

| area | buildings | walk LCC box → buffered | inferred | residential apt/house/mixed/none | complexes total/named |
|---|---|---|---|---|---|
| pangyo | 1204 | 91.8% → **99.0%** ✓ | 66.7% FAIL | 257/3/0/944 | 16/9 |
| seongsu | 5383 | 90.4% → **100%** ✓ | 23.5% | 305/1628/0/3450 | 133/74 |
| songpa | 28088 | 98.1% (boundary) | 16.5% | 9872/7461/6/10749 | 3055/2366 |
| songpa-jamsil | 1506 | 98.9% → **100%** ✓ | 24.0% | 542/164/0/800 | 155/123 |

Named complexes (all verbatim, never invented): pangyo — 백현마을,
봇들마을, 아름마을, 판교 푸르지오그랑블, 알파리움1단지/2단지,
백현마을7단지휴먼시아아파트, 판교푸르지오월드마크, 판교 호반 써밋
플레이스 (register stems here are village-scale: 118/89 buildings).
Seongsu (74) incl. 서울숲힐스테이트, 성수동아이파크, 쌍용아파트,
성수대우2차아파트, 뚝섬현대아파트. Jamsil (123) incl. 레이크팰리스(46),
장미아파트, 리센츠, 트리지움, 잠실주공5단지아파트, 파크리오,
갤러리아팰리스. Songpa (2366), largest 올림픽선수기자촌아파트(122).
Example tour (jamsil): 갤러리아팰리스 → 세븐일레븐 잠실 갤러리아점
(3.2분) → 스마일플러스치과 (0.4분) → 송전초등학교 (3.6분) →
잠실광역환승센터 (9.6분) → 송파나루공원 (3.5분) — all legs real
walk-graph paths.

## Delegation

None — no subagents. `AGENTS.md` reserves product code, tests and
pipeline scripts to Muse in agent mode, and the brief requires all code
written by me, so the whole stage (design, code, tests, builds, docs)
is single-agent work. (The `data/raw` API guide + sample responses
used read-only for verification were provided externally mid-session.)

## Known gaps (measured, not gamed)

1. **Pangyo inferred heights 66.7%** — unchanged by design until the
   real API fill runs outside the sandbox (99 parcels planned; the
   sample parcel shows dong matching will work: 36 title records incl.
   상가동/경비실/지하주차장 dongs). No fake heights added.
2. Pangyo/봇들마을/백현마을 complexes are village-scale (118/89
   buildings) because the register names no 단지 there — a faithful
   consequence of the stem rule, documented in the schema.
3. Officetels (업무시설 + 오피스텔 names) classify as `none`; `mixed`
   fired only 6× (songpa). No household signal exists in the
   shapefiles, so nothing was guessed — the API's `hhldCnt` is now the
   documented path forward.
4. Register A24 names can be junky (`1`, `관리사무소`, address-like);
   used verbatim per the never-invent rule. The tour ranks by
   height/size so these sink below real 단지 names.
5. Browser fps/screenshots unverified in the sandbox (no browser,
   no socket bind); `vite build` passes and the headless data flow runs
   clean for all areas. The orchestrator's screenshot run is the first
   real render check.
6. Two existing-test edits were required by the contract change (the
   `complexes` section in `area.json`): the section-set assertion and
   the shared fixture. No assertion was weakened.

## What stage 3 (agent life engine) needs

- Load `area.json` + `$ref` parts; local frame, graph, POIs, complexes
  as documented in `docs/area-schema.md` (new: `residential`,
  `complexes`, `register.pnu/name/sub_name/api`, LCC family in
  `report.json`).
- Walk graph is directed with `length_m`; tour code (`web/src/tour.js`)
  shows the Dijkstra pattern; walkers (`web/src/walkers.js`) are the
  placeholder to replace.
- After the register fill, `register.api.households` (hhldCnt 세대수)
  + `use` give real per-dong populations and uses — the key input for
  household synthesis. Until then, treat `inferred` heights (esp.
  pangyo) as approximate massing.
- Simulated residents must stay labelled simulated (UI precedent set).

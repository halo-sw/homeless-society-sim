# Stage 1 result — nationwide data pipeline (Muse)

Date: 2026-10-28. All commands below were run and observed by the
reporting agent (parent) from the repo root (`sim/`), sandboxed, no
network. Subagent runs happened earlier (see Delegation); every number
in the report table was re-measured by the parent after its own fixes.

## What built

`pipeline/` turns the national OSM extract + GIS building register into
self-contained area files under `data/build/<area>/` (git-ignored):

- `area_def.json` — resolved definition (station + bbox, or admin boundary)
- `extract.osm.pbf` — osmium clip of the national PBF
- `osm.json`, `buildings.json`, `graph.json` — intermediate stages
- `area.json` (+ `area.<section>.json` splits when a section exceeds 2 MB)
- `report.json` — counts, height sources, POI categories, walk LCC,
  register coverage, sizes, timings

Four areas: `pangyo`, `seongsu` (1.2 km scene boxes), `songpa` (whole
송파구 admin boundary, relation 2419954, admin_level 6), `songpa-jamsil`
(1.2 km scene box). Station lookups resolve OSM railway stations named
without 역 (판교/성수/잠실); naive matching on `…역` names mis-resolves
(e.g. Chungnam 판교역 at 36.15,126.67) and is ranked out.

Two genuine bugs were found by the parent during verification and fixed
(with 5 new tests, docs updated):

1. `area=yes` ways (pedestrian plaza surfaces) were treated as routable
   graph edges. Per the OSM data model they are areas, not linear paths,
   so they are now excluded from the routing graph in all modes and kept
   in the roads list with `area: true` for rendering. This moved pangyo
   walk LCC 77.9% → 90.3% (a 326-node plaza outline plus fragments).
2. `motorroad=yes` expressways (자동차전용도로, motorway-like access,
   e.g. 분당내곡로, 동부간선로 tunnels) were walkable. They are now
   treated like motorways: never walkable, bike only with `bicycle=yes`,
   still drivable. Pangyo LCC → 91.8%, seongsu → 90.4%.

## Commands run and observed output

1. `.venv/bin/pytest tests/ -q` → **80 passed** (79 unit + 1
   integration) in ~12.6 s. (75 passed before the parent's 5 new tests.)
   Only warnings are shapely `transform()` deprecations from
   `pipeline/building_join.py`.
2. `.venv/bin/python -m pipeline build --all` (osmium 1.19.1, wall
   **50.6 s**) → exit **1**, with exactly 3 stderr lines:
   - `pangyo: inferred-height share 66.7% (803/1204) exceeds 30% per scene box`
   - `pangyo: walk-graph largest component 91.8% below 95% per scene box`
   - `seongsu: walk-graph largest component 90.4% below 95% per scene box`
3. `.venv/bin/python -m pipeline.validate --all` → same 3 failures;
   `songpa: PASS`, `songpa-jamsil: PASS`; exit 1.
4. Determinism, observed: `songpa-jamsil/area.json` md5
   `3c9f72f3c558319f0a31051341a3689e` before and after
   `build --area songpa-jamsil` (10.6 s) → **byte-identical**;
   `pangyo/area.json` `7548d65ed8f734acca0295907ccf3bd9` and
   `pangyo/area.graph.json` `f246b9b570f346bb6d89e93a25232a93`
   likewise identical across `build --area pangyo` (10.3 s).
5. Read-only probes of `buildings.json`/`graph.json`, raw DBF headers
   (seoul vs all 3 gyeonggi parts: identical A0–A28 order, same
   EPSG:5186 `.prj`), and per-way OSM tags for every disconnected
   walk component (attribute counts and tag evidence quoted under
   Known gaps).

`data/raw/` was never modified (reads only; mtimes predate all runs:
PBF 2026-10-28 13:39, seoul DBF 2026-10-06). Note: `gyeonggi/`
(3 SHP parts, 1.0M + 1.0M + 298K shapes) finished downloading during
the stage, so pangyo now builds with `register_coverage: full` (1125
register records in bbox) instead of OSM-only, and songpa picked up 97
cross-border gyeonggi parcels. No spatial duplicates were found between
parts in the pangyo bbox (0 pairs with IoU > 0.9, 0 duplicate ids).

## Per-area report table (measured, this run)

| area | station (lat, lon / OSM) | buildings | POIs | inferred | walk LCC | register | wall s | out size |
|---|---|---|---|---|---|---|---|---|
| pangyo | 37.3943732, 127.1111517 (node 5927786493) | 1204 | 255 | 66.7% FAIL | 91.8% FAIL | full (gyeonggi) | 9.7 | 10 MB |
| seongsu | 37.5445688, 127.0561016 (node 5935554450) | 5383 | 621 | 23.5% | 90.4% FAIL | full (seoul) | 10.8 | 17 MB |
| songpa | boundary rel 2419954, no station | 28088 | 5775 | 16.5% | 98.1% | full (seoul+gyeonggi×97) | 20.1 | 128 MB |
| songpa-jamsil | 37.5132169,127.1001365 (node 6033315017) | 1506 | 615 | 24.0% | 98.9% | full (seoul) | 9.6 | 9.1 MB |

Details: POI counts are named POIs (all scene boxes ≥ 50 ✓).
Height sources pangyo: inferred 803, osm_height 131, osm_levels 21,
register_height 247, register_floors 2. Songpa `area.json` is 2.8 MB
with splits (`area.buildings.json` 34.3 MB, `area.graph.json` 20.7 MB,
`area.roads.json` 4.3 MB); jamsil is a single 4.6 MB `area.json`.
Total `data/build/` = 164 MB. Per-area wall seconds come from the
`build --all` JSON (extract cache hits); total wall 50.6 s includes the
national OSM scan.

## Delegation used

One workflow with six sequential subagents (shared checkout):
(1) repo/data recon (read-only); (2) areas/extract/osm_parse + CLI;
(3) building_join/graph + `docs/building-register-fields.md`;
(4) area_build/validate + `docs/area-schema.md` + `ATTRIBUTION.md`;
(5) pytest suite; (6) full builds + first brief draft. The parent then
independently re-read all product code, re-ran pytest (75 passed),
re-ran all builds, root-caused each threshold gap with read-only probes
(component geography, DBF schema/completeness, per-way tags, duplicate
checks), fixed the two genuine bugs above (+5 tests), and re-measured
everything in this brief (80 passed, 50.6 s build, determinism hashes).

## Known gaps (measured, not gamed)

1. **Pangyo inferred-height share 66.7% (803/1204).** Data cause,
   verified: only 357/1125 gyeonggi register records in the bbox carry
   height > 0 (floors > 0: 358, use present: 365, footprint > 0: 360;
   addresses all present, alignment correct). The ~760 bare records are
   distinct small footprints (register-only median 17 m², no spatial
   dupes), so no honest height source exists for them. Seoul records in
   seongsu are far more complete (height 2363/5328). Needs a stage-level
   decision: accept the measured value, or define a follow-up register
   quality/coverage rule. Bare-record polygons were deliberately NOT
   dropped to chase the metric.
2. **Walk LCC 91.8% pangyo / 90.4% seongsu after genuine fixes.**
   Residual fragments, each verified by tags: grade-separated
   infrastructure correctly disconnected from surface streets (화랑지하차도
   primary tunnel 49 nodes, bridge/unclassified 31 nodes), boundary
   corner-clips of through-paths that connect outside the box
   (중랑천동자전거길 cycleway 68 nodes of which 19 in-bbox, footway/path
   bits), plus small interior footway gaps. The graph adds no invented
   connectors. Needs a stage-level decision: accept measured values, or
   a documented follow-up (e.g. buffered extract, snap rule).
3. DBF fields A18 (probable FAR %, arithmetic unverified) and A19/A20
   (unidentified) are documented as low/medium confidence and not
   consumed by the pipeline.
4. `build --all` exits 1 while any scene-box threshold fails; the
   brief's "all four build with exit 0" criterion is therefore not met
   until (1)–(2) are decided. The exit-1 is correct loud failure, not a
   pipeline bug: every area still writes complete, deterministic files.

## What stage 2 (three.js scene builder) needs from the area files

- Load `data/build/<area>/area.json`; resolve `$ref` part files listed in
  `report.json` → `parts` (`area.buildings.json`, `area.graph.json`,
  `area.roads.json`) — songpa always splits, scene boxes sometimes do.
- Coordinates: WGS84 + a local metre frame; the origin rule and the
  equirectangular projection are defined in `docs/area-schema.md`
  (origin = station centre for bbox areas, feature-bounds midpoint for
  boundary areas). Full field/unit reference is in that doc.
- Every building has `height_m` + `height_source`; treat `inferred`
  (up to 66.7% in pangyo) as approximate massing, not surveyed height.
- Walk/bike/drive graphs are separate directed edge sets with stable node
  ids (`graph.json` shape) and `length_m` per edge; walk LCC share is in
  `report.json` → `walk_lcc`. Note: `area=yes` plaza surfaces and
  `motorroad=yes` expressways are excluded from walk (flags on roads).
- POIs carry `category` (`amenity:*`, `shop:*`, …); counts by category are
  in `report.json` → `poi_counts`.
- Attribution (OSM ODbL, GIS건물통합정보 MOLIT/VWorld, Geofabrik) is in
  `ATTRIBUTION.md` and must appear on screen.

## Addendum (stage 2, part A — 2026-10-28, measured by the same agent)

Rebuilt all four areas with the stage-2 pipeline (buffered graphs,
residential classification, complexes, register fields; the API fill ran
as `--dry-run` only — no network in the sandbox). `pytest`: **114
passed** (79 old unit + 1 integration + 34 new). `validate --all`:
seongsu/songpa/songpa-jamsil PASS; pangyo still FAILs on inferred
heights only (walk LCC now passes everywhere).

| area | buildings | walk LCC box → buffered | inferred | residential apt/house/mixed/none | complexes total/named |
|---|---|---|---|---|---|
| pangyo | 1204 | 91.8% → **99.0%** ✓ | 66.7% FAIL | 257/3/0/944 | 16/9 |
| seongsu | 5383 | 90.4% → **100%** ✓ | 23.5% | 305/1628/0/3450 | 133/74 |
| songpa | 28088 | 98.1% (boundary, no buffer) | 16.5% | 9872/7461/6/10749 | 3055/2366 |
| songpa-jamsil | 1506 | 98.9% → **100%** ✓ | 24.0% | 542/164/0/800 | 155/123 |

Notes: songpa is back to 28088 buildings (the boundary clip was
restored — see stage-2 brief §A1; an intermediate build without the
cached boundary file had over-pulled 171k register records). Pangyo's
inferred share is unchanged by design: 764 of the 803 inferred buildings
carry a PNU, planned fill = 99 parcel requests (seongsu: 713 parcels /
1236 buildings); the orchestrator runs
`.venv/bin/python -m pipeline register-fill --area pangyo` outside the
sandbox. Full detail: `briefs/02-RESULT.md`.

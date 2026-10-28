# Stage 1 — Nationwide data pipeline (brief for Muse)

You are Muse Spark 1.3 in agent mode in this repository. Read `AGENTS.md` first. You may read/write files and run shell commands (sandboxed, no network). Write all code yourself. If parallel work helps, use sub-agents (e.g. one for OSM parsing, one for the building join, one for tests) and record what you delegated.

## Goal
Turn the national OSM extract plus the national building register (GIS건물통합정보) into validated, self-contained **area files** that later stages (3D scene builder, agent engine) load without touching raw data. It must work for any place in South Korea; this stage validates it on three areas.

## Inputs (already downloaded, do not modify)
- `data/raw/south-korea-latest.osm.pbf` — Geofabrik, OSM data up to 2026-10-27T21:23:59Z, md5 verified. ODbL.
- `data/raw/buildings/<region>/*.shp` — GIS건물통합정보 SHP from VWorld (기준일 2026-10-09). Present now: `seoul/AL_D010_11_20261009.*` (695,753 polygons, DBF encoding cp949, `.prj` = Korea_2000_Korea_Central_Belt_2010 ≈ EPSG:5186). `gyeonggi/` (경기도) is still downloading and may be absent: the pipeline must discover all region folders automatically, and an area with no register coverage must still build (OSM only) while `report.json` flags `register_coverage: none` — do not fail `pangyo` for that reason in this run; report its OSM-only numbers. Licence shown as CC BY / 공공누리 제1유형 (attribution). **Field names are anonymised (`A0`…`A28`)**: inspect values yourself, identify height / above-ground floors / use / structure / name / address / approval-date fields, and document the mapping with sample values and your confidence. If a field is ambiguous, say so. The DBF is 1.26 GB: read it streaming and filter by bbox early (use the `.shx` / shape bbox before reading records).
- Tools: `osmium` CLI 1.19 (`/opt/homebrew/bin/osmium`), Python venv `.venv` with `osmium` (pyosmium), `pyshp`, `pyproj`, `shapely`, `numpy`, `pytest`. No other installs are possible.

## Validation areas
| id | label | definition |
|---|---|---|
| `pangyo` | 판교역 인근 | 1.2 km × 1.2 km box centred on 판교역 (look the station up in OSM; record the coordinate you used) |
| `seongsu` | 성수동 | 1.2 km × 1.2 km box centred on 성수역 (OSM lookup, record it) |
| `songpa` | 송파구 | the whole 송파구 administrative boundary from OSM (pipeline scale test) **and** a 1.2 km scene box centred on 잠실역 (`songpa-jamsil`) |

## Required output
- `pipeline/` (Python):
  - `extract` — clip the national pbf to an area (bbox or OSM admin boundary by name/relation id) via osmium.
  - `osm_parse` — buildings (footprints, OSM height / levels / building type / name), roads (highway class, name, oneway, access, lanes if present, bridge/tunnel/layer), named POIs (amenity, shop, leisure, tourism, public_transport, railway stations) with category, landuse / parks / water polygons, trees if present.
  - `building_join` — reproject GIS건물통합정보 to WGS84, match to OSM footprints (overlap-based, document the rule and threshold), and **add register buildings that OSM lacks** (with their own footprint). Every building gets `height_m` and `height_source` ∈ {`osm_height`, `osm_levels`, `register_height`, `register_floors`, `inferred`}. Inferred heights use building type + footprint area with a seeded RNG; document the rule.
  - `graph` — separate walk / bike / drive edge sets (respect `oneway`, `access`, `foot=no`, motorways not walkable), edge length in metres, node ids stable across runs.
  - `area_build` — writes `data/build/<area>/area.json` (+ optional split files if large) and `data/build/<area>/report.json`.
  - `validate` — fails loudly (non-zero exit, clear message) when an area is empty, the street/POI set is missing, or thresholds below are not met.
  - One CLI entry point, e.g. `.venv/bin/python -m pipeline build --area pangyo`, and `build --all`.
- `docs/area-schema.md` — the area file schema (coordinates in WGS84 + a local metre frame with the origin stored), with field meanings and units.
- `docs/building-register-fields.md` — the DBF field mapping you found, with 3–5 real sample rows (no personal data; building names/addresses of public buildings are fine).
- `ATTRIBUTION.md` — OSM (ODbL, link), GIS건물통합정보 (국토교통부/VWorld, CC BY / 공공누리 제1유형 as labelled), Geofabrik.
- `tests/` with pytest: unit tests on small synthetic fixtures (no raw data needed) for parsing, the join rule, height-source assignment, oneway handling, and schema validation; plus an integration test that runs only when `data/raw` exists.
- `briefs/01-RESULT.md` — what you built, the actual commands you ran and their real output summaries, the per-area report table, delegation used, known gaps, and what stage 2 (three.js scene builder) needs from the area files.

## Acceptance thresholds (report the measured values)
- All four areas build with exit code 0 and pass `validate`.
- `inferred` height share ≤ 30 % in each scene box (for reference: OSM alone gave 74 % assumed in Seongsu).
- Largest connected component of the walk graph ≥ 95 % of walk nodes in each scene box.
- At least 50 named POIs in each scene box; record the count.
- 송파구 full-boundary build completes; record wall time and peak output size.
- Re-running a build produces byte-identical `area.json` (determinism).

## Rules
- Run the tests and the four builds yourself. Paste real numbers; never claim a run you did not observe.
- Do not modify `data/raw/`. `data/build/` is git-ignored output.
- Keep the code compact and readable; prefer clarity over cleverness.

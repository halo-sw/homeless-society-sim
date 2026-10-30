# Stage 26b — US box: scene builds, and homes with Zillow rent (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `us-26`. Stop when this part is done.

## Why
Stage 26a made `us-menlo` (Meta HQ, Menlo Park) build through the pipeline. The orchestrator ran the real build and found two gaps:
- the walk graph came out empty, because `graph.run_build` clips the buffered extract from the default Korean PBF;
- `scene --area us-menlo` fails with "unknown area".

The web app also needs US homes with a rent price. This stage adds them from OSM apartment buildings plus the Zillow Observed Rent Index (ZORI) by ZIP.

Raw inputs are on disk (never commit anything under `data/`):
- `data/raw/us/norcal-latest.osm.pbf`;
- `data/raw/us/zillow/Zip_zori_uc_sfrcondomfr_sm_month.csv`. Columns: `RegionID,SizeRank,RegionName,RegionType,StateName,State,City,Metro,CountyName`, then one column per month (`2015-01-31` … `2026-09-30`). `RegionName` is the ZIP and the values are USD per month;
- the built box `data/build/us-menlo/` (`area_def.json`, `area.json`, `buildings.json`, `graph.json`, `extract.osm.pbf`).

## Change
1. **`pipeline/graph.py` `run_build` (~370)**: when `area_def.get("country") == "US"`, pass `raw_pbf=US_RAW_PBF` (from `.areas`) to `extract_mod.ensure_buffered_extract`. Korean areas call it exactly as today.
2. **`pipeline/scene.py` `run_scene` (~767-771)**: accept `is_us_area(area_id)` next to `AREA_IDS` / `is_station_box`. Nothing else changes; the Terrarium DEM already covers the box.
3. **New `pipeline/homes_us.py`**:
   - `load_zori(csv_path) -> dict[str, dict]`: ZIP → `{ "monthly_usd": round(latest non-empty value), "month": "YYYY-MM" }`. Use the latest month column that has a value for that row. Skip empty cells.
   - `postcode_points(pbf_path) -> list[(lon, lat, zip)]`: every node/way/relation in the extract with `addr:postcode` matching `^\d{5}`. Use the 5-digit prefix. For ways, use the centroid. Use the same PBF reader the pipeline already uses (`osm_parse` or pyosmium, whichever `homes.py`/`scene.py` use).
   - `zip_for(lon, lat, points, default="94025")`: the ZIP of the nearest point within 600 m. Otherwise return the default and mark `zip_source: "default"` (else `"osm_nearest"`).
   - `build_us_homes(area_dir, zori, points) -> list[dict]`:
     - Candidates: buildings in `buildings.json` with `building` in `{"apartments", "residential", "dormitory"}`. Leave `dormitory` out (student housing).
     - **Grouping:** buildings that share the same `name` within 300 m of each other become one home. Treat names matching `^Building\s+\S+$` (case-insensitive) as no name.
     - **Unnamed buildings** stay one home each. Name: `Apartments on <road>`, where `<road>` is the `name` of the nearest named road in `area.roads` (`highway` in residential/tertiary/secondary/primary/living_street/unclassified). Without one, use `Apartment building <n>`.
     - **Fields per home** (same shape as Korean slim homes so the web reads it):
       - `id` `us-home-NNNN`, `name`, `kind: "아파트"` (the app's internal kind key), `region: "us-menlo"`;
       - `lon`/`lat`: the centroid of the group, 7 decimals;
       - `build_year: null`, `pnu: null`, `match: "osm_name"` when named, else `"osm"`, `osm_name` = name or null;
       - `scene: "us-menlo"`;
       - `station`: the nearest Caltrain station by walk on the area graph (reuse `homes.nearest_station_walk` if it works with this box dict; otherwise the same Dijkstra on `graph.edges.walk`, 1.3 m/s), as `{station, walk_minutes}`. Use null when there is none within 40 minutes;
       - `buckets`: one bucket `{ "center_m2": null, "range_m2": null, "trade": null, "jeonse": null, "wolse": { "count": 1, "deposit": null, "monthly": { "count": 1, "median_won": <usd>, "min_won": <usd>, "max_won": <usd> } } }`. The `_won` key names are kept for schema reuse; the unit is USD, stated by `currency`;
       - `currency: "USD"`, `country: "US"`;
       - `price: { "source": "zillow_zori_zip", "zip": <zip>, "zip_source": ..., "month": "YYYY-MM", "label": "Zillow ZORI (typical rent for this ZIP, all home types)" }`;
       - `work_targets: { "meta-hq": { "walk_m", "walk_minutes", "bike_m", "bike_minutes", "bike_speed_kmh": 15, "bike_speed_source": "assumed" } }`. Use the shortest paths on `graph.edges.walk` and `graph.edges.bike` from the nearest node to the home to the nearest node to the workplace in `area.json` `workplaces`. Walk speed 1.3 m/s (engine constant), bike 15 km/h (assumed). Minutes have 1 decimal.
     - Drop a home when its ZIP has no ZORI value. Count the drops in the report.
   - `run_us_homes(build_dir, raw_dir) -> dict`:
     - writes `data/build/homes/us-menlo.json` as `{ "region": "us-menlo", "country": "US", "currency": "USD", "sources": [ { "id": "zillow_zori", "name": "Zillow Observed Rent Index (ZORI), ZIP, smoothed, all homes", "url": "https://www.zillow.com/research/data/", "month": ... }, { "id": "osm", "name": "OpenStreetMap contributors", "license": "ODbL" } ], "homes": [...] }`;
     - updates `data/build/homes/summary.json` **without touching `regions`**. The web loads every id in `regions` for Korean searches, so US homes must not appear there. Add or replace a top-level `"other_regions": { "us-menlo": { "homes": n, "country": "US", "currency": "USD" } }`. Keep every other key byte-identical in meaning;
     - returns a report: homes, named, unnamed, dropped_no_zori, zip counts, the station-walk share and the min/median/max Meta HQ bike minutes.
4. **`pipeline/cli.py`**: `homes --us` calls `run_us_homes` and prints the report. Plain `homes` is unchanged.

## Test — `tests/test_homes_us.py` (pytest, fixtures only, no real PBF or CSV)
- `load_zori` on a 3-row CSV string (tmp file) with a trailing empty month: picks the latest non-empty value and its month.
- `zip_for`: nearest within 600 m wins; far away gives the default with `zip_source == "default"`.
- `build_us_homes` on a tiny tmp area dir:
  - `buildings.json` has two buildings named "Live Oak Apartments" 50 m apart, one named "Building A", one unnamed, and one `dormitory`;
  - `area.json` has a named road and the `meta-hq` workplace;
  - `graph.json` is a small line graph with walk and bike edges.
  - Expect 3 homes: Live Oak grouped, and "Building A" and the unnamed one each "Apartments on <road>"; no dormitory.
  - Bike minutes = distance / (15/3.6) / 60, 1 decimal.
  - `currency == "USD"` and `buckets[0].wolse.monthly.median_won` equals the fixture ZORI.
- `run_us_homes` with a tmp `summary.json` that has `regions: {"gangnam": {...}}`: `regions` is unchanged and `other_regions["us-menlo"]` is present. A second run does not duplicate it.
- `graph.run_build` uses `US_RAW_PBF` for a US `area_def` (monkeypatch `ensure_buffered_extract` to record its kwargs, and stub the parse/build calls).
- `scene.run_scene("us-menlo", tmp)` no longer raises "unknown area". It may raise FileNotFoundError for the missing area_def; assert that type.

Run only:
```
.venv/bin/python -m pytest -q tests/test_homes_us.py tests/test_us_area.py 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
`web/**`, `pipeline/homes.py` (import from it, do not edit it), anything under `data/`.

## Final message
Changed files, one line each. Nothing else.

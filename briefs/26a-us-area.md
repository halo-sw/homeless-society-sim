# Stage 26a — A US area next to Meta HQ: the pipeline builds it (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `us-26`. Stop when this part is done.

## Why
The user wants the app to work in the US too, starting with the area around Meta HQ (1 Hacker Way, Menlo Park). Later stages add homes, USD money and a bike commute. This stage only lets the OSM pipeline build one US scene box and one US region from the Northern California extract. The orchestrator runs the real build. You write the code and the unit tests.

Raw inputs are already on disk:
- OSM extract `data/raw/us/norcal-latest.osm.pbf`;
- Terrarium DEM tiles for the box, in the usual folder `data/raw/dem/terrarium/14/`.

Never commit anything under `data/`.

## The area
- id `us-menlo`, label `Menlo Park · Meta HQ`, country `US`, currency `USD`;
- bbox (minlon, minlat, maxlon, maxlat) = `(-122.190, 37.450, -122.125, 37.492)`. This covers Meta HQ, Belle Haven, East Palo Alto, the Willows and downtown Menlo Park with its Caltrain station;
- center = Meta HQ, `(-122.14823, 37.48485)`;
- workplace `{ "id": "meta-hq", "name": "Meta HQ (1 Hacker Way)", "lon": -122.14823, "lat": 37.48485 }`.

## Change
1. **`pipeline/areas.py`**
   - Add `US_RAW_PBF = REPO_ROOT / "data" / "raw" / "us" / "norcal-latest.osm.pbf"`.
   - Add `US_AREAS = { "us-menlo": { label, bbox, center, country: "US", currency: "USD", workplaces: [ … ] } }`.
   - Add `is_us_area(area_id)`.
   - `AreaDef` gains optional fields `country: str = "KR"`, `currency: str = "KRW"` and `workplaces: list | None = None`. Keep `to_dict` working.
   - `resolve_area`: for a US id, return `AreaDef(kind="bbox", bbox=…, center=…, station=None, boundary=None, country="US", currency="USD", workplaces=…)` straight away. Never scan a PBF for it.
2. **`pipeline/extract.py:89-130`** (`ensure_extract`): for a US id, skip the national candidate scan. Resolve with `resolve_area(area_id)` directly, then `clip_bbox` from the given raw PBF as for any bbox area. The buffered extract (`ensure_buffered_extract`) works unchanged from `area_def.json`.
3. **`pipeline/cli.py`**
   - `build_area` (~48-60) accepts `is_us_area(area_id)`.
   - When the raw path is the default Korean PBF and the area is US, use `US_RAW_PBF` instead. Print one line saying so.
   - `expand_area_patterns` (used by build and scene) accepts US ids.
4. **`pipeline/area_build.py`**: `area.json` carries `country`, `currency` and `workplaces` from `area_def.json`. When absent, write nothing new, so Korean areas stay byte-identical.
5. **`pipeline/validate.py:39-200`**: for a US area (`area_def.country == "US"`), the inferred-height share gate becomes a warning in the report, not a failure. The US has no national building register, and OSM heights are sparse. Add the warning text: "US area: no building register; heights are OSM or inferred (warning only)". The walk-graph and POI gates stay.
6. **`pipeline/regions.py`**
   - Add `US_REGION_SPECS = ({ "id": "us-menlo", "label": "Menlo Park · East Palo Alto", "bbox": (same bbox), "country": "US", "currency": "USD" },)`.
   - New `run_us_regions(raw_pbf=US_RAW_PBF, build_dir=…)`:
     - clips each spec's bbox into `_cache/regions/<id>.osm.pbf` with osmium (the same helper style the KR code uses);
     - merges the entries into an existing `regions.json`: KR regions stay untouched, and a `us-menlo` already there is replaced;
     - each US region entry has `id`, `label`, `bbox`, `country`, `currency`, `relations: []`, `rtms_files: []`, `safety: []`, and whatever other keys KR entries carry (with empty values), so readers that index them do not crash.
   - `cli regions --us` calls it.
7. **`pipeline/walkgraph.py`**: no change is expected. It reads `regions.json` and the cached region PBF. If something assumes KR keys, guard it.

## Test — `tests/test_us_area.py` (pytest, fixtures only, no real PBF)
- `resolve_area("us-menlo")`:
  - returns `kind == "bbox"`, the exact bbox, `country == "US"` and `currency == "USD"`;
  - one workplace `meta-hq`;
  - does not call `build_candidate_extract` (monkeypatch it to raise).
- `is_us_area`: true for `us-menlo`, false for `st-판교`.
- The regions merge, with a tmp `regions.json` holding one KR region and a monkeypatched clip:
  - after `run_us_regions` the KR region is unchanged and `us-menlo` is present with `country == "US"`;
  - a second run does not duplicate it.
- Validate: a tiny area dir fixture with `area_def.country == "US"` and 80 % inferred heights gives a warning, not a failure. The same fixture with KR fails as before. Follow `tests/test_area_build_validate.py` for fixture style.
- `area_build` writes `country`/`currency`/`workplaces` only when present: a KR fixture output has no `country` key.

Run only:
```
.venv/bin/python -m pytest -q tests/test_us_area.py tests/test_area_build_validate.py tests/test_regions.py tests/test_walkgraph.py 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
`web/**`, `pipeline/homes.py`. Later runs edit them.

## Final message
Changed files, one line each. Nothing else.

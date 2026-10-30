# Stage 26f — US homes: unique names from real OSM addresses (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `us-26`. Stop when this part is done.

## Why
The real build of `pipeline/homes_us.py` (stage 26b) gives 61 US homes. Only 6 have an OSM name. The other 55 are named `Apartments on <road>`, so the list shows the same name many times:
- "Apartments on Coleman Avenue" 11 times;
- "Haven Avenue" 8 times;
- "Hamilton Avenue" 7 times.

A customer cannot tell them apart. The extract has many OSM address points (`addr:housenumber` + `addr:street`), so most buildings can carry their real street address.

## Change (only `pipeline/homes_us.py`)
1. **`postcode_points` → `address_points(pbf_path)`.** Keep `postcode_points` as a thin wrapper so existing callers and tests still work.
   - It scans once and returns `{"postcodes": [(lon, lat, zip)], "addresses": [(lon, lat, housenumber, street)]}`.
   - An address is any node/way/relation with both `addr:housenumber` and `addr:street`. Use the centroid for ways, as today.
2. **`nearest_address(lon, lat, addresses, max_m=40)`:**
   - returns `"<housenumber> <street>"` for the nearest address within `max_m`, or None;
   - also prefer an address whose point lies inside the building polygon, when the polygon is given (optional arg `ring`, shapely or a simple point-in-polygon).
3. **Naming in `build_us_homes`** (~335-346). For a home with no OSM name:
   - use the address of the group's largest building. Try inside-polygon first, then the nearest within 40 m;
   - name: `<housenumber> <street>`, e.g. `1200 Coleman Avenue`, with `match: "osm_address"`;
   - otherwise keep `Apartments on <road>`;
   - after all homes are named, any name used more than once gets ` · <n>` appended (1-based, ordered by lat descending, then lon) on every copy. Names that are unique stay unchanged.
4. **`run_us_homes` report:** add `named_by_address` and `duplicate_names_after` (should be 0).

## Test — add to `tests/test_homes_us.py`
- `address_points` cannot be tested without a PBF, so test the pure helpers.
- `nearest_address`:
  - a point 10 m from an address → `"12 Bay Road"`;
  - 60 m away → None;
  - with a ring containing a second address 30 m away and a closer one outside the ring, the inside one wins.
- `build_us_homes` fixture (extend the existing one) has two unnamed buildings on the same road:
  - one with an address 5 m away, which becomes `"12 Bay Road"` with `match == "osm_address"`;
  - one with none, which becomes `"Apartments on Bay Road"`.
- Add a third unnamed building with no address on the same road. The two `Apartments on Bay Road` become `Apartments on Bay Road · 1` and `· 2` (north first).
- Existing tests in the file stay green (the `postcode_points` wrapper).

Run only:
```
.venv/bin/python -m pytest -q tests/test_homes_us.py 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
Everything except `pipeline/homes_us.py` and `tests/test_homes_us.py`. Nothing under `data/`.

## Final message
Changed files, one line each. Nothing else.

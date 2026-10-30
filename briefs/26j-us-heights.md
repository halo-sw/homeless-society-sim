# Stage 26j — US buildings: low-rise inferred heights (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `us-26`. Stop when this part is done.

## Found by the orchestrator in the 3D view
In `us-menlo` (Menlo Park / East Palo Alto), 98.9 % of the 17,771 buildings have inferred heights:
- 16,810 are `building=yes`, plus 360 detached and 112 house;
- the median height is 9.0 m, and the floor counts are spread evenly over 1–4.

The 3D view shows a city of 4–5 storey blocks. The real neighbourhood is mostly 1–2 storey single-family houses. `infer_height` in `pipeline/building_join.py:482` uses the Korean tables (`INFER_FLOORS`, `DEFAULT_INFER_FLOORS`, `AREA_BUMP`). There is no US building register, so OSM `building:levels` / `height` tags (already used, `osm_levels`) are the only measured heights.

## Change (`pipeline/building_join.py`)
1. **`infer_height(..., country="KR")`.** For `"KR"` it is byte-identical to today: same tables, same seed, same rng draws.
2. **US tables** (constants next to the Korean ones, each with a one-line comment saying "assumed; US has no national building register"):
   - `US_INFER_FLOORS`:
     - `house`, `detached`, `semidetached_house`, `bungalow`: (1, 2);
     - `residential`, `terrace`: (1, 2);
     - `apartments`: (2, 3);
     - `commercial`, `retail`, `industrial`, `warehouse`, `church`, `school`: (1, 2);
     - `office`: (2, 3);
     - `garage`, `garages`, `carport`, `shed`, `roof`, `hut`: (1, 1).
   - `US_DEFAULT_INFER_FLOORS = (1, 2)` (covers `building=yes`).
   - `US_AREA_BUMP = [(5000, 1, 4)]`: a footprint over 5,000 m² gets +1 floor, capped at 4.
   - Height = floors × `FLOOR_HEIGHT_M`, except the `(1, 1)` accessory types, which use 3.0 m.
3. **`join_area`:** read `area_def.get("country", "KR")` and pass it to both `infer_height` calls (~579 and ~620).
4. Nothing changes for buildings with `osm_levels`, `osm_height` or register heights.

## Test — `tests/test_us_heights.py`
- `infer_height("yes", 150.0, "us-menlo", "w1", country="US")` gives floors in {1, 2} and height floors × FLOOR_HEIGHT_M. Over 200 seeded ids, at least 30 % are 1 and 30 % are 2.
- `"carport"` US → (3.0, 1).
- `"apartments"` 6,000 m² US → floors in {3, 4}.
- KR: `infer_height("yes", 150.0, "st-강남", "b1")` equals the value with `country="KR"` passed explicitly, and the same as before. Pin today's value: compute it once with the unchanged function before you edit it, and write it into the test.
- Keep green: `tests/test_area_build_validate.py`, `tests/test_us_area.py`, and any `tests/*building_join*` file.

Run only:
```
.venv/bin/python -m pytest -q tests/test_us_heights.py tests/test_area_build_validate.py tests/test_us_area.py $(ls tests | grep -i building_join | sed 's#^#tests/#') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
Everything except `pipeline/building_join.py` and the test file. Nothing under `data/`.

## Final message
Changed files, one line each. Nothing else.

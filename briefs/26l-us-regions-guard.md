# Stage 26l — keep the US region out of Korean views (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator after merging the US branches
`data/regions.json` now has a tenth entry: `{ id: "us-menlo", country: "US", currency: "USD", bbox: […California…], relations: [], rtms_files: [], … }` (stage 26a `run_us_regions`).

1. **Python:** `tests/test_regions.py::test_real_regions_json_shape` (line ~100) fails. It expects exactly the nine Korean `REGION_IDS` and non-empty `relations` / `rtms_files`.
2. **Web:** `src/chat/engine.js:157` loads `regions.json`. `src/ui/chat.jsx:1813` passes the whole doc to `buildChatMap`, which frames the map on all region bboxes when there are no pins (`ui/chatmap.jsx` ~84-88). A Korean map with no pins would then span Korea and California. A US map with no pins would span both too.
3. **Web, 3D right panel:** for a bike commute the line `${days}일 출퇴근 편도 평균 N분 중 하루예요` (`src/evidence.js:144`) carries the tag `측정`. A bike time comes from the assumed speed. When the run's commute trips are bike (`trip.mode === "bike"`), the tag must be `가정값`.

## Change
- **`tests/test_regions.py`:**
  - `test_real_regions_json_shape` checks the Korean entries only: `[r for r in doc["regions"] if r.get("country", "KR") == "KR"]`;
  - add a check that any US entry has `country == "US"`, `currency == "USD"` and a 4-number bbox.
  - Do not loosen the Korean asserts.
- **`src/chat/engine.js`:** add `regionsForCurrency(doc, currency)`, which returns a doc whose `regions` keeps only entries with `(r.country || "KR") === (currency === "USD" ? "US" : "KR")`.
- **`src/ui/chat.jsx` ~1813:** pass `regionsForCurrency(regionsDoc, <profile currency>)`.
- Grep the other users of `regionsDoc` / `regions.json` in `src/` and `src/consult/`. For each that iterates all regions, apply the same filter or confirm it is harmless. Name them in your final message. Python readers of `regions.json` in `pipeline/` (walkgraph, safety, corridor, homes): check each skips or ignores an entry with empty `relations` / `rtms_files` and does not crash. Fix only if one would crash. Name them.
- **`src/evidence.js:144`:** tag `가정값` when the trips counted are bike; else unchanged.

## Test — `web/tests/us-26l.test.js` + the Python change
- `regionsForCurrency` with a doc of one KR and one US region: `"KRW"` → only KR; `"USD"` → only US; a missing `country` counts as KR.
- `buildChatMap` with no candidates and the filtered KR doc has a framing bbox inside Korea (lon 124–132).
- The evidence helper with a bike-trip run → the average line tag `가정값`; with a walk run → `측정` (unchanged).
- Python: `.venv/bin/python -m pytest -q tests/test_regions.py` passes.

Run only:
```
cd web && node --test tests/us-26l.test.js tests/us-26i.test.js tests/chatmap-18.test.js tests/chatmap-19b.test.js $(ls tests | grep -E '^evidence' | sed 's#^#tests/#') 2>&1 | tail -15
cd .. && ../sim/.venv/bin/python -m pytest -q tests/test_regions.py 2>&1 | tail -5
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
`src/engine/**`, `src/i18n/**`, anything under `data/`. No `text-overflow: ellipsis`.

## Final message
Changed files, one line each, plus the lists of readers you checked. Nothing else.

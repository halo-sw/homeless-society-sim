# Stage 12a3 — Raise the home match rate to 90% with an honest measure, in a loop (brief for Muse)

Agent mode, rules in `AGENTS.md`. Read `briefs/12a-RESULT.md`, `briefs/12a2-RESULT.md`, `pipeline/homes.py`, `pipeline/osm_names.py`. Sandbox: no network, no keys. Sub-agents allowed (Muse only). You run in a separate git worktree on branch `stage-12a3` while stage 12b changes the UI on `main`. Touch only `pipeline/`, `tests/`, the home-index readers in `web/src/homes.js` (if the record shape changes, additive only) and `briefs/12a3-RESULT.md`. `data/raw` and most of `data/build` are symlinks to the main checkout. Write only `data/build/homes-index.json`, `data/build/homes/` and new files under `data/build/_cache/homes12a3/`.

## Goal (user, 2026-10-29)
"연결률 90%가 되도록 루프를 계속 돌려줘": keep going until the share of real-transaction rows placed on a real location is **≥ 90%**. Do it without lowering precision, and use only data already on disk: the RTMS CSVs, GIS buildings, OSM, and the committed files.

## 1 — Measure honestly first
The 12a/12a2 table double-counts. The `wirye` row reads all of 송파 + 수정 + 하남, so rows that are simply not in 위례 (헬리오시티 etc.) count as wirye failures. 하남 rows outside 위례 are out of scope altogether.
- Count every RTMS row exactly once, in its 시군구 region. 위례 is a label on rows whose location falls inside the 위례 union, not a separate denominator.
- 하남 rows count only if they are in 위례. A row is in 위례 if its 법정동 is e.g. 위례동 or 학암동; check which 법정동 names the 하남 file actually uses for 위례 and document the rule. All other 하남 rows are out of scope and reported separately.
- Report per region: rows in scope, matched by each method, matched %, and the overall %. This is the number the loop drives.
- Also report the measure as **share of complexes** (단지명 + 지번 groups) as well as share of rows, because a few huge complexes dominate rows.

## 2 — The loop
Repeat until overall ≥ 90% **and** every Seoul region ≥ 85%, or until an iteration adds < 0.3 pp (then stop and report why):
1. List unmatched groups (단지명 + 시군구 + 번지) by row count, top 50, with their 도로명 (the RTMS `도로명` column) and 건축년도.
2. Pick the rule that would place the most of them, implement it with tests, rebuild `pipeline homes`, re-measure.
3. Precision check every iteration: draw 15 seeded random matches from the new rule and check each one. Name similarity, same 법정동, centroid within the region, and distance to any register building with the same 본번 < 400 m where one exists. If more than 1 of 15 looks wrong, tighten or drop the rule.
4. Append one line per iteration to the RESULT table: rule, rows gained, pp gained, precision check result.

Candidate rules, in the order to try. Add your own when the unmatched list suggests one.
- **도로명 → OSM address**: RTMS `도로명` (e.g. "송파대로 345") ↔ OSM `addr:street` + `addr:housenumber` on residential buildings or landuse, in the same 시군구. This is exact when both exist.
- **Same 본번, other 부번**: the register has buildings on `본번-x` parcels of the same 법정동. Use them when they form one contiguous residential cluster and the 단지명 does not contradict a different named building there.
- **GIS building name field**: AL_D010 has a building-name attribute. Find which A-field it is, document it, and match 단지명 within the same 법정동 after the same normalisation as `osm_names`.
- **Better OSM name normalisation**: brand aliases (e.g. "e편한세상" / "이편한세상", "IPARK" / "아이파크", "SK VIEW" / "SK뷰", roman / arabic 단지 numbers, "(1단지)", "101동~116동" suffixes). Keep the existing ambiguity rules.
- **Rows with 번지 0000-0000** (e.g. 수지 동천동): RTMS has no 지번, so only 도로명 or name rules may place them.

Never use a straight-line guess, a 법정동 centroid or a geocoder, and never match by name alone across regions. Each record keeps `match` with the rule name, which the card labels.

## 3 — If the loop stalls below 90%
State plainly which data would close the gap. For example, parcel polygons (연속지적도, PNU → parcel centroid) would place every row that has a 지번. Write a loader stub `pipeline/cadastral.py`: if `data/raw/cadastral/*.shp` exists, join PNU → parcel centroid as a final rule `match: "parcel"`; otherwise skip with a log line. Add tests on a fixture, so the orchestrator can drop the files in later and rebuild.

## Tests and output
- All existing tests green (707 JS, 216 Python) plus new rule tests.
- Do not run `vite build` changes outside your files.
- `briefs/12a3-RESULT.md` should contain:
  - the honest before / after measure (rows and complexes, per region)
  - the iteration table
  - precision samples
  - the residual top 30 unmatched
  - the rebuild command

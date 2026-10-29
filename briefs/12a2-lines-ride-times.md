# Stage 12a2 — More lines, ride times from the operator's schedule, more matched homes (brief for Muse)

Agent mode, rules in `AGENTS.md`. Read `briefs/12a-RESULT.md`, `pipeline/network.py`, `pipeline/homes.py`, `web/src/homes.js`, `web/src/profile.js`. Sandbox: no network, no keys. Sub-agents allowed (Muse only). This is a short data stage before 12b (UI).

## Why
The orchestrator checked 12a against the user's goal ("the service should pull the right data out for me"). All tests pass (691 JS, 200 Python). Three gaps would show up as empty cells in 12b:
1. **Every candidate says "승차 미확인".** Without the customer's own ride minutes, the search can't sort by commute, and that is the default sort.
2. **The network has only 5 lines** (2, 8, 9, 신분당, 수인·분당). 강동 (5호선: 천호·고덕·강일·길동), 3호선 (대치·도곡·수서·가락시장·오금), 7호선 (청담·강남구청) and 경강선 (판교) homes have no path.
3. **위례 has 3 homes and 수정구 is 39.7%.** The building register lacks new complexes (헬리오시티, 위례 아파트).

## 1 — Ride times from an official schedule (replaces "승차 미확인" as the default)
- New committed source: `scenarios/transit/seoul-metro-interstation.csv`, from 서울교통공사 역간거리 및 소요시간 (OA-12034, 공공누리 1유형). Columns: 연번, 호선, 역명, 소요시간 (mm:ss, standard running time from the previous station), 역간거리(km), 호선별누계(km). It covers lines 1–8. Attribution is already in `ATTRIBUTION.md`.
- Add a ride-time layer `rideMinutes(fromStation, toStation, path)`. For each line segment of the network path:
  - **Lines 1–8:** sum the schedule's per-gap times along the path. Source label: "서울교통공사 표준 운행시간".
  - **Lines not in the file** (9호선, 신분당선, 수인·분당선, 경강선): use the path's km × the median minutes-per-km of the schedule's lines 1–8, computed from the file, not typed in. Label it "추정 · 1~8호선 평균 속도 적용". Show both the method and the number.
  - **Transfers:** keep the stage 8 4분/회 assumption (C-ride-split) and label it.
  - **Waiting:** half the headway is unknown, so add nothing and say "대기 시간 제외".
- The precedence is: customer's own number > schedule > estimate. `source` is `customer` / `derived` with the note above.
- The profile's ride numbers stay `customer` when given. C-ride-minutes still holds for the simulation engine when the customer gives a number; otherwise the engine uses the derived number and records it as derived in the trace (not "unavailable").
- `find_homes` commute = walk (graph, or "도보 미확인") + ride (above). The default sort "출퇴근 짧은 순" now works without customer input; unknown walk sorts after known.
- Station-name matching between the CSV and OSM: normalise (strip "역", parentheses such as "잠실(송파구청)"), and report unmatched names.
- Tests: 잠실→강남 on 2호선 equals the CSV sum; a 신분당선 leg uses the estimate and labels it; transfer added and labelled; the customer number overrides; every result in the 판교 example has a ride number with a source.

## 2 — Lines 3, 5, 7 and 경강선 in the network
Extend the line spec in `pipeline/network.py` to 3호선, 5호선 (both branches: 마천 and 하남검단산), 7호선 and 경강선 (판교–), using the same OSM route-relation method, geometry chainage and the direction rules. Rebuild `data/build/region/network.json` (command in RESULT). Congestion numbers: use them where the existing congestion source has these lines; otherwise "혼잡 자료 없음" (never invented). Check that transfers at 잠실·천호·가락시장·수서·건대입구·강남구청·판교 resolve. Tests for path finding across the new lines (e.g. 고덕 → 판교, 대치 → 삼성).

## 3 — More homes matched (위례, 수정구, new complexes)
Add a second join for RTMS rows the register can't match: an OSM building or landuse polygon tagged as residential (`building=apartments` / `landuse=residential` with a `name`), whose name matches the 단지명 after normalisation ("헬리오시티" ⊂ "송파 헬리오시티"; drop 아파트/APT/단지 suffixes and spaces), inside the row's 시군구 region, and when OSM has it, the same 법정동 (`addr:*` or containment). Location = polygon centroid. Record `match: "register" | "osm_name"`, and the card later shows "위치: OSM 단지 이름 일치" for the second kind. Never match on a name alone across regions. Report the new match % per region (위례 and 수정구 especially) and 10 random osm_name matches for the orchestrator to spot-check.

## 4 — Browser-sized index
`homes-index.json` is 18 MB and is read by the dev middleware. 12b will show candidates in the browser. Also write `data/build/homes/<region>.json`, a slim per-region index with only the fields the card needs, plus `homes/summary.json` (counts per region and kind). The consult tools may keep the full file server-side. Report the sizes.

## Tests and output
All existing tests green (691 JS, 200 Python), plus the new tests above, `vite build` green, no keys or raw data in git or bundle. `briefs/12a2-RESULT.md` should cover:
- ride-time coverage (share of candidate results by source: schedule / estimate / customer)
- the lines added, with their station counts
- match rates before and after per region
- the orchestrator commands
- the 판교 example re-run with ride minutes

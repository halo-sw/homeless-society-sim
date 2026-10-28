# Stage 3 result — life engine + sim playback (Muse)

Date: 2026-10-28. Agent mode, single agent (no subagents —
`AGENTS.md` reserves product code, tests and pipeline scripts to
Muse). All code and tests below are my own. Nothing written by other
agents; nothing delegated.

## Part A — pipeline + scene follow-ups

1. **Reproducible register fill.** `python -m pipeline build` now
   re-applies cached register responses offline (no network, no key):
   titles in `building_join.run_build`
   (`register_api.apply_cached_titles`), recaps in
   `area_build.run_build` (`reapply_cached_recaps`). Same
   assign/apply code as `register-fill`, sorted and deterministic.
   - Pangyo rebuild: 99 cache PNUs → 136 filled, inferred 66.7 % →
     **55.4 %**; jamsil 83 PNUs → 80 filled, 24.0 % → **18.7 %**;
     songpa 82 PNUs → 165 filled, 16.5 % → 15.9 %; seongsu unchanged
     (no cache). Recap complexes: pangyo 2, jamsil 1, songpa 1.
   - Drop/restore demo (cache dir moved away and back): without cache
     pangyo rebuilds to 66.7 % inferred (the old drop); with cache it
     rebuilds to 55.4 % with `api_height` kept — offline.
   - Byte-identical rebuilds hold: consecutive pangyo rebuilds are
     identical in every file except `report.json` timings (measured
     durations, documented). The rebuilt `area.json` is byte-identical
     to the one the real `register-fill` produced — the offline path
     reproduces the online path exactly.
   - Incidental fix: `fill_area` never refreshed `buildings.json`
     meta, so `report.json` kept stale shares after a fill (the old
     "66.7 %" reading was partly stale meta). It now recomputes
     `height_sources`/`inferred_share`/`residential_inferred_share`.
2. **Residential validation gate.** Pass gate is now "inferred-height
   share among apartment + house + mixed ≤ 30 %"; the all-buildings
   share stays reported (`report.json` → `inferred_share`,
   `residential_inferred_share` added to report + `buildings.json`
   meta + stage summaries). Real values after rebuild: pangyo
   **6/260 (2.3 %)**, jamsil **8/706 (1.1 %)**, seongsu **2/1933
   (0.1 %)**; `validate --all` → all four areas PASS (exit 0).
3. **Tower occlusion at stops.** Per-stop camera azimuth with the
   least tower occlusion (`camera.js`: exact camera→target segment vs
   building prisms, scored on the stop anchor + settled path end;
   default azimuth wins ties). 2b framing (FOV/pitch/distance) kept;
   the azimuth eases in during the glide. Headless on real data
   (occluders before → after): jamsil stops 2, 3 go 1 → 0 (stop 1
   stays 1, least-overlap side); pangyo stops 0, 5 go 2 → 0, stop 4
   1 → 0; seongsu stops 0, 1, 4 go 2 → 0; clear stops keep the
   default. One log line per stop (`[occlusion]`) names the azimuth.

## Part B — engine (`web/src/engine/`, pure JS, no three.js)

Modules: `prng.js` (mulberry32 over FNV-1a(`${seed}:${key}`), one
stream per agent), `graph.js` (Dijkstra over `length_m`, per-source +
per-pair cache), `places.js` (real POIs + named park polygons,
round-trip reachability on the directed graph), `scenario.js`
(schema, verbatim home resolution, dateless KST calendar),
`agents.js` (household + `households`-weighted background synthesis),
`decisions.js` (rule/hook/replay decider), `routines.js` (day
timelines), `simulate.js` (`simulate` + `compare`), `canonical.js`
(sorted keys, floats to 3 decimals). No `Date.now()`, no
`Math.random()`; the only haversine use is graph anchoring (a lookup
— no reported number uses a straight-line distance).
Schema: `docs/scenario-schema.md`. Demo:
`scenarios/demo-two-homes.json` (A 잠실 레이크팰리스, B 판교 백현마을,
couple, both `station_ride`, placeholder `ride_minutes: 30` with
`needs_user_input: true` — no transit time looked up or guessed).

CLI (`node web/scripts/simulate.mjs --scenario
scenarios/demo-two-homes.json --home both --out data/build/sim/`):

| home | ms | agents | trips | decisions | unavail | dijkstra srcs |
|---|---|---|---|---|---|---|
| A (jamsil) | 264 | 62 (2 + 60) | 3220 | 1835 | 0 | 69 |
| B (pangyo) | 187 | 62 (2 + 60) | 3408 | 1916 | 0 | 72 |

Outputs ~2.8–2.9 MB canonical JSON per run + `demo-two-homes-compare.json`.

Demo 30-day compare (household totals):

| metric | A | B | Δ (B−A) | unit | source |
|---|---|---|---|---|---|
| walk_minutes | 1752 | 2213.7 | +461.7 | 분 | graph |
| walk_distance_m | 136516.12 | 172356.84 | +35840.7 | m | graph |
| commute_away_minutes | 26400 | 26400 | 0 | 분 | scenario |
| errands_done | 21 | 21 | 0 | 회 | scenario |
| park_visits | 13 | 13 | 0 | 회 | scenario |
| home_evening_minutes | 19376 | 18930 | −446 | 분 | scenario |
| trips | 158 | 158 | 0 | 회 | graph |

Per member: m1 walks 949.2 → 1215.3 min (73 952 → 94 604 m);
m2 walks 802.8 → 998.4 min (62 565 → 77 753 m); commute_away equal
(13 200 each — same assumed ride + workday).

Decisions per run by kind (stage-4 hook-call target = one `decide()`
call per record: **A 1835, B 1916** calls per 30-day run):

| kind | A total | A household | B total | B household |
|---|---|---|---|---|
| shop_choice | 515 | 21 | 552 | 21 |
| park_or_home | 1320 | 60 | 1320 | 60 |
| station_route | 0 (one 잠실 entrance) | 0 | 44 (2 × 22 workdays) | 44 |

## Part C — scene playback (`?mode=sim`)

File-first run loading (`/data/sim/…`, new dev route) with a Web
Worker fallback (`sim-worker.js`, verified byte-identical to the CLI
run); engine agents as instanced capsules (household large +
highlighted, neighbours small, all labelled 시뮬레이션 주민); sim
clock `11월 2일(월) 07:42 · 1일차/30` with 1×/10×/60×, pause, day
jump; sun/sky from `lighting.js` per sim minute with night window
glow proportional to at-home residents per building (vertex ranges,
numbers from the run); 따라가기 follow camera in 2b framing with
purpose + minutes + distance captions; A/B toggle preserving the
clock; compare panel from `compare()` with 그래프/가정 source tags;
tour mode kept behind the mode switch; attribution + simulated note
on screen.

## Commands run and observed output

1. `.venv/bin/pytest tests/ -q` → **138 passed** (~13 s; +7:
   offline cache re-apply ×4, residential gate ×3).
2. `cd web && npm test` → **93 passed** (was 50: +7 occlusion,
   +28 engine incl. real-data jamsil/pangyo runs, +8 sim playback).
3. `cd web && npm run build` → **✓ built** (~0.5 s, worker chunk
   `sim-worker-*.js` emitted).
4. `.venv/bin/python -m pipeline.validate --all` → 4 × PASS.
5. CLI: see table above (A 264 ms, B 187 ms).
6. `/data` + `/scenarios` middleware re-verified by direct
   invocation (area/run/scenario → 200, escape/non-json → 403,
   missing → next()).
7. Headless sim checks: worker run sha == CLI file sha; full-day
   sampling of run A (day 3, 10-min steps, 62 agents) has no NaNs,
   02:00 occupancy 62/62, night visibility 0; follow caption
   `구성원 1 · 통근 → 잠실 · 도보 13.6분 (1058 m)`; residential
   vertex ranges cover the soup exactly (432 942/432 942).

## Debug URLs (serve `web/`, run the CLI first)

- `/?mode=sim&home=A&day=3&t=07:30&follow=1` (member 1 morning commute)
- `/?mode=sim&home=B&day=3&t=07:30&follow=1` (same clock, 판교)
- `/?mode=sim&home=A&day=3&t=02:00` (night glow, all residents home)
- `/?mode=sim&home=A&day=3&t=19:00&follow=2` (evening errands/park)
- Tour regression: `/?area=songpa-jamsil&shot=2` (moved azimuth),
  `/?area=pangyo&shot=0`, `/?area=seongsu&shot=4`

## Not verifiable without a browser

- The actual look: night-sky/glow balance, follow framing at 300 m,
  caption/simbar/compare overlap at 1280×860, agent capsule scale vs
  buildings, azimuth moves improving (not worsening) the settled
  frame.
- Worker transport in a real browser (the worker's code path is
  verified headless byte-identical; only the `Worker` postMessage
  round-trip is not), `?mode=sim` first-load timing (~6 MB JSON),
  and real fps/draw calls with 62 instanced agents.
- Screenshots are the first real render check for all of the above.

## Known gaps

1. Night visibility is 0 by routine (no nightlife activities) —
   faithful to the rules, but evenings read quiet.
2. Pangyo/백현마을 is village-scale (118 buildings, from the stem
   rule); the B entrance is the node nearest one of its buildings.
3. `ride_minutes: 30` is a flagged placeholder (`needs_user_input`);
   commute_away and evening-home deltas move with the user's value.
4. Main-thread engine import in the page is used only for the
   compare fallback; the scene path never blocks on simulation.

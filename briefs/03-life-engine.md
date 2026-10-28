# Stage 3 — Life engine (brief for Muse)

Agent mode, rules in `AGENTS.md`. Read `briefs/02-RESULT.md`, `briefs/02b-RESULT.md`, `docs/area-schema.md` first. Sub-agents allowed (Muse only); record what you delegated. Attached: current render after 2b (`briefs/img/02b-render.png`; rows = 잠실 stop 0/2, 성수 0/3, 판교 0/1).

Product: a household compares two homes by **daily life**, not price. The engine simulates the same household living 30 days in home A and, separately, in home B, with the same seed, and reports numbers that come only from data + graph. Stage 4 will add Muse decisions at branch points; this stage makes them pluggable but uses rule defaults.

## Part A — small follow-ups (pipeline + scene)
1. **Reproducible register fill.** `python -m pipeline build` must re-apply cached register responses from `data/raw/register_api/` offline (no network, no key), so a rebuild after `register-fill` keeps `api_height` etc. Today a plain rebuild drops them (verified: pangyo back to 66.7 % inferred until `register-fill` is re-run). Byte-identical rebuilds must still hold.
2. **Residential validation gate.** The product is about homes. Make the pass gate "inferred-height share among residential buildings (apartment + house + mixed) ≤ 30 %"; keep the all-buildings share as a reported number, not a gate. Current real values after the fill: pangyo residential inferred 6/260, jamsil 8/706, seongsu 2/1933 (all-buildings: 55.4 %, 18.7 %, 23.5 %).
3. **Tower occlusion at stops.** In 잠실 (46-storey towers) the stop target is hidden behind towers between camera and target. Fade buildings that intersect the camera→target segment to ~25 % opacity while stopped (or pick the stop azimuth with the least occlusion). Keep 2b framing elsewhere.

## Part B — engine (`web/src/engine/`, pure JS, no three.js, runs in Node and browser)
1. **Inputs.** `area.json` (graph, POIs, complexes, buildings) + a scenario JSON committed under `scenarios/`. Scenario schema (document it in `docs/scenario-schema.md`):
   - `household`: members with `role` (adult / child / senior), `workdays` (e.g. Mon–Fri), `work`: either `{type: "station_ride", station_name, ride_minutes, ride_minutes_source: "user_assumption"}` (leave the area by walking to a real station POI on the graph, then an assumed ride the user typed; the UI must label it "가정값") or `{type: "local_poi", name}` or `none`; `school` for children (nearest real school POI by graph); weekly errands (supermarket/convenience count per week), park walks, clinic visits as frequencies.
   - `homes`: `[{label: "A", area: "songpa-jamsil", complex_name: "레이크팰리스"}, {label: "B", area: "pangyo", complex_name: "백현마을"}]` resolved by verbatim complex name; the household's entrance = graph node nearest to a building of that complex (deterministic choice).
   - `start_date` (default 2026-11-02, a Monday), `days` (30), `seed`.
   - `background`: number of simulated neighbours (default 60) — synthesised in residential buildings of the area weighted by `households` when present, else floors × footprint; each gets a simple routine from the same rules. Always labelled 시뮬레이션 주민. Never named after real people; use 주민 01, 주민 02 …
   Commit `scenarios/demo-two-homes.json` with the A/B above, one couple (two adults, both `station_ride`) and **placeholder `ride_minutes` flagged `"needs_user_input": true`** — do not look up or guess real transit times.
2. **Clock.** Discrete-event, minute resolution, KST. Weekday vs weekend routines. No `Date.now()`, no `Math.random()`; one seeded PRNG (document algorithm) split per agent by stable key.
3. **Movement.** Every trip is a shortest path on the walk graph (Dijkstra/A* with `length_m`, cache per node pair), speed 1.3 m/s adults, 1.1 children/seniors. Store per trip: agent, day, depart/arrive minute, from/to (POI id or home), `distance_m`, `minutes`, path node ids. No straight-line distances anywhere. If a needed category has no POI reachable in the area, skip that activity and record `unavailable: <category>` (never invent a place).
4. **Branch points (for stage 4).** At defined moments the engine creates a decision record `{id, agent, day, minute, kind, options:[{key, label, minutes, distance_m, poi_id?}], default_key, chosen_key, chosen_by: "rule"}`. Kinds to implement: which supermarket/convenience (2–3 nearest by graph time), park walk or stay home after work, which station entrance/route when two are within 20 % time. Option numbers come from the graph. A `decide(record)` hook returns a key; default = rule (shortest time, stable tie-break). Recorded decisions must be replayable: given a decisions file, the run reuses them and makes zero hook calls.
5. **Outputs.** `simulate(area, scenario, homeLabel, {decisions?}) → run` with `trips`, `decisions`, per-day per-member summary (minutes walking, minutes away for commute, errands done, time at home 18:00–24:00), and a 30-day summary. A compare function for A vs B returns only numbers + their units; no scores, no rankings, no prices, no safety claims.
6. **Determinism.** Canonical JSON (sorted keys, fixed number formatting). Test: two runs with the same inputs are byte-identical (sha256); a different seed changes background routines but not the graph distances.
7. **CLI.** `node web/scripts/simulate.mjs --scenario scenarios/demo-two-homes.json --home A|B|both --out data/build/sim/` reading `data/build/<area>/area.json`. Print run time and counts. Agents ≥ 50 per run.

## Part C — scene playback (web)
1. Load a run (from the CLI output, or run the engine in a Web Worker for the scenario) and replace the 2b preview walkers with engine agents moving along their recorded paths. Household members larger and highlighted, labelled "시뮬레이션 주민"; background neighbours small.
2. Sim clock UI: `11월 2일(월) 07:42 · 1일차/30`, speeds (1×=1 sim-min per 0.1 s, 10×, 60×), pause, jump to day. Sun/sky follow sim time via existing `lighting.js` (night = dark sky + simple window glow on buildings proportional to simulated residents currently at home in that building — numbers from the run).
3. "따라가기" camera: follow a household member along their trip (2b miniature framing), caption shows trip purpose, `minutes` and `distance_m` from the run.
4. A/B toggle: switch area + run for home B with the same clock; small compare panel with the 30-day numbers from `compare()` (each labelled with its source: graph / scenario assumption).
5. Keep 2b tour mode reachable (a mode switch). Keep attribution and the simulated-resident note on screen.

## Tests
`node --test`: PRNG reproducibility, Dijkstra vs a brute-force on a small fixture graph, trip times = length/speed, unavailable categories, branch-record replay (zero hook calls), byte-identical runs, compare() contains no forbidden keys (price, score, safety, rank). pytest for Part A items 1–2.

## Output
`briefs/03-RESULT.md`: real outputs (pytest, node --test, vite build, CLI timings and counts for A and B), the demo scenario's 30-day compare numbers, decisions per run by kind (target for stage 4: how many hook calls a 30-day run would make), what you could not verify without a browser, and debug URLs to capture playback (`?mode=sim&home=A&day=3&t=07:30&follow=1`).

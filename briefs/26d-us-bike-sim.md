# Stage 26d — US homes run the 30-day sim: walk or bike to Meta HQ (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `us-web-26`. Stop when this part is done.

## Why
Stage 26c lets the chat list US homes near Meta HQ. The candidate row now has:
- `commute.work = { target, name, walk_minutes, bike_minutes, mode, minutes, source: "assumed_speed" }`;
- `currency: "USD"`;
- the profile workplace `resolved.place = { id, name, lon, lat }`.

Picking two US homes and pressing "살아 보기" fails today, for these reasons:
- `simReadyFor` (`src/chat/engine.js` ~293) needs `commute.walk.known`, which is the station walk;
- `scenarioFromProfile` (`src/profile.js` 662-785) throws without `home.station`, and only emits `station_ride`;
- the engine has no bike: `Router` (`src/engine/graph.js` ~64) reads only `graph.edges.walk`, and trip minutes are `lengthM / agent.speed` (`src/engine/routines.js` ~180);
- the result money step needs the Korean payroll table (`src/ui/chat.jsx` ~1276-1290) and fails with "계산 전".

The US box graph (`data/areas/us-menlo/area.json` → `graph`) has `edges.walk`, `edges.bike` and `edges.drive` over one shared `nodes` dict. Meta HQ is inside the box.

Read first: `src/engine/routines.js` (100-200, 420-480, 590-645), `src/engine/graph.js`, `src/engine/scenario.js` (80-175), `src/engine/simulate.js` (20-60), `src/engine/criteria.js` (around the `F.` fields and line ~272), `../scenarios/criteria/kr-default.json` (C-walk-speed, C-walk-commute-max), `src/engine/journey.js` (~255 walkFatigue), `src/profile.js` (662-785), `src/chat/engine.js` (253-330), `src/ui/chat.jsx` (1240-1300), `src/chat/custom-money.js` (180-200).

## Change
1. **Criteria** (`../scenarios/criteria/kr-default.json`), two new entries. Copy the style of `C-walk-commute-max`, with Korean text, group `move`, `"source": "가정값"`, `editable: true`:
   - `C-bike-speed`: `{ "kmh": { "value": 15, "unit": "km/h", "overridable": true } }`. Title `자전거 속도`. Rule: 자전거 출퇴근은 자전거 길 그래프 거리를 이 속도로 나눠 시간을 잡는다 (신호·경사 미반영);
   - `C-bike-commute-max`: `{ "max_min": { "value": 30, "unit": "분", "overridable": true } }`. Title `자전거 통근 상한`. Rule: 걸어서 도보 통근 상한을 넘으면, 이 상한 이내일 때 자전거로 출근한다.
   - Expose them in `F` as `bike_mps` (= kmh / 3.6) and `bike_commute_max_min` the way `walk_commute_max_min` is exposed. Keep every existing criteria id and value. If a test pins the criteria count or list, update that test's expected list. Never drop an entry.
2. **Router per mode** (`src/engine/graph.js`): `new Router(graph, { mode = "walk" } = {})` reads `graph.edges[mode]`. The default is unchanged. Nothing else in Router changes.
3. **New work type `place`** (`src/engine/scenario.js` `parseWork`):
   - shape: `{ type: "place", place: { name, lon, lat }, modes: ["walk","bike"] }`;
   - `place` goes through `parseWorkplace`; it must be lon/lat. `modes` defaults to `["walk","bike"]` and only those two values are allowed;
   - every existing type is unchanged.
4. **Routine** (`src/engine/routines.js`): new `commuteToPlace(work, depart)`, dispatched where `work.type` is switched (~597):
   - **walk:** if the place is in the home bbox and the walk round trip on the walk router is `<= F.walk_commute_max_min`, behave exactly like the walk branch of `commutePlace` (same causes, same away record with `commute: "walk"`);
   - **bike:** else if `"bike"` is in `modes` and the graph has bike edges:
     - build (and cache per run) a bike `Router`, and route home node → nearest bike node to the place, and back;
     - `bikeMin = lengthM / F.bike_mps / 60`;
     - if `bikeMin <= F.bike_commute_max_min`, add the two trips with mode bike;
   - **otherwise:** `unavailable("commute", "bike", "<name>까지 걷기·자전거 상한을 넘어요")`.
   - **`addTrip` gains optional `labels.speedMps` and `labels.mode`:**
     - minutes use `speedMps` when given;
     - the trip records `mode: "bike"`; walk trips get no new key, so Korean outputs stay byte-identical;
     - bike fatigue uses `walkFatigue(minutes, F) * 0.6`, labelled with a cause id `C-bike-speed` (assumed; no measured source).
   - **Causes:**
     - `["C-commute-depart", "C-bike-speed", "C-bike-commute-max", "C-work-days", "C-fatigue-load", "C-fatigue-recovery"]`;
     - text `${wk} 근무일 · … · ${place.name}까지 자전거 ${round1(bikeMin)}분(${F.bike_commute_max_min}분 이내, 속도 가정 ${kmh}km/h)`;
     - the work away record has `commute: "bike"` and `workplace: { name, lon, lat }`.
   - **Path for the 3D replay:** `path` is the bike route's node ids. They are in the same shared `nodes` dict, so the existing replay draws them. Check `src/main.js` reads `trip.path` through `area.graph.nodes` and needs no change; report it if it does.
5. **`scenarioFromProfile`** (`src/profile.js`): when the member's workplace has `resolved.place`:
   - `work = { type: "place", place: { name, lon, lat }, modes: ["walk","bike"] }`;
   - `home.station` is no longer required for that scenario. Keep `station` when the home has one; otherwise omit it or set null, whichever the scenario parser accepts. Check `parseHome`;
   - Korean station workplaces are unchanged.
6. **`simReadyFor`** (`src/chat/engine.js`): ready when `candidate.commute.work` has finite `minutes`, even if the station walk is unknown. The reason strings are unchanged.
7. **US money in the result** (`src/ui/chat.jsx` ~1276; `src/chat/custom-money.js`): when the picked candidates are USD, skip the payroll table. Build a small money doc with `buildUsRentMoneyDoc({ picked, labels })`, new, in `custom-money.js`:
   - per home: `{ label, rent_usd_month: <median>, source: "Zillow ZORI (ZIP <zip>, <month>)", estimate: true }`;
   - `currency: "USD"`, and no net pay or loan.
   - Check where `moneyDoc` is rendered (`ui/money.jsx` and the result table "월 주거비" in `ui/chat.jsx` ~420). For a USD doc, show only `월 주거비 월 $4,261 (ZIP 추정)` per home, using `fmtMoney` from `src/money/currency.js` (26c). Hide the Korean-only rows (실수령, 대출, 전세 점검) instead of showing "계산 전".
   - KRW docs are unchanged.

## Test — `web/tests/us-26d.test.js` (node --test, no network)
- **Fixture area:** a 4-node line graph A–B–C–D, 1000 m per edge, with walk and bike edges.
  - The home is near A and the workplace place is near D (3000 m).
  - Walk 3000 m at 1.3 m/s = 38.5 min, which is over 25.
  - Bike 3000 m at 15 km/h = 12.0 min.
- Run the engine the way existing engine tests do (find one, e.g. a test that calls `simulate` or the routine builder with a tiny area) for 1 workday:
  - the commute trips have `mode: "bike"` and `minutes === 12`;
  - the work away has `commute: "bike"`;
  - a cause cites `C-bike-speed`.
- Same fixture with the place near B (1000 m, 12.8 min walk): walk trips with no `mode` key.
- Same fixture with bike edges removed and the place at D: an `unavailable` commute record.
- `parseWork({type:"place", place:{name:"Meta HQ", lon:..., lat:...}})` → modes `["walk","bike"]`. `parseWork({type:"place", place:{...}, modes:["car"]})` throws.
- `scenarioFromProfile` with a USD profile (`resolved.place` meta-hq) and two US homes, one with `station: null`, produces `work.type === "place"` and does not throw.
- `simReadyFor` for a candidate with `commute.work.minutes = 12` and `walk.known = false` → `ready: true`.
- `buildUsRentMoneyDoc` returns `currency: "USD"` and `rent_usd_month` for each pick.
- Keep green: every existing engine test file that touches routines or criteria (run the ones named `engine*`, `routines*`, `criteria*`, `scenario*` that exist), plus `tests/us-26c.test.js`.

Run only:
```
cd web && node --test tests/us-26d.test.js tests/us-26c.test.js $(ls tests | grep -E '^(engine|routines|criteria|scenario)' | sed 's#^#tests/#') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
`src/i18n/**`, `pipeline/**`, anything under `data/`, the Korean walk/ride branches' behaviour. No `text-overflow: ellipsis`.

## Final message
Changed files, one line each. Nothing else.

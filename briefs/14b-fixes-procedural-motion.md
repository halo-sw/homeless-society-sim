# Stage 14b — Two load bugs, then procedural motion (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Commit after each part (`git add -A web pipeline tests && git commit -m "14b: …"`). Read `briefs/14-RESULT.md` first. Do not explore beyond the files named in parts 1 and 2. The first edit should land within 5 tool calls.

## 1. Station boxes never load in dev (Korean paths)
- GPU check: `/?area=st-가천대&shot=0` → `Unexpected token '<', "<!doctype "… is not valid JSON`.
- `curl /data/st-%EA%B0%80%EC%B2%9C%EB%8C%80/area.json` returns `index.html`, while `/data/songpa-jamsil/area.json` returns JSON. The files exist (NFC names).
- Cause: `web/vite.config.js:24` (`serveDir`) uses the raw, percent-encoded `req.url`, so `stat` fails and the request falls through to the SPA.
- Fix: decode it before the containment check (decode, then `normalize('NFC')`). Keep the traversal guard after decoding (reject `..` and absolute paths), and return 400 on a malformed URI.
- Test: a pure helper `resolveDataPath(dir, url)` with Korean, traversal and malformed cases.
- Commit `14b: data route decodes Korean paths`.

## 2. Sim crashes on scene meshes
- GPU check: `/?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:50&follow=1` throws `THREE.BufferAttribute: array should be a Typed Array`.
  - Stack: `toIndexedGeometry` (`web/src/main.js:122`) ← `buildWorld` (`main.js:268`) ← `bootSim`.
  - The scene meshes from `scene.json` arrive as plain JSON arrays.
- Fix: convert at the loader boundary (`web/src/scene/load.js` or where terrain/land/water mesh data is built). Positions/colours/uvs become `Float32Array`; indices become `Uint32Array` (or `Uint16Array` when max < 65536). `toIndexedGeometry` also accepts either, defensively.
- Check lines 237 and 278 (terrain, water) too.
- Test: a loader test with plain arrays in, typed arrays out.
- Commit `14b: typed arrays for scene meshes`.

## 3. Procedural motion for everything that moves (user request)
The user wants every moving thing in the 3D sim to be a **procedural simulation**: generated from rules + seed + time, not keyframed, baked or hand-placed. Today some movers are decorative (`render/streetmeshes.js` moving cars, `walkers.js` preview walkers, `render/streetlife.js`).

Core rule: **state is a pure function of (box seed, sim time t, inputs)**. Scrubbing the timeline to 08:50 shows exactly the same scene as playing up to 08:50. There is no accumulated per-frame drift: per-frame code only evaluates `stateAt(t)`.

- Put pure modules in `web/src/motion/` (no three.js). Renderers only read them.
- **Vehicles.**
  - Spawn on the 14 road ribbons by class (primary–tertiary, residential, service) with a per-class density curve by hour (rush-hour peaks, night trough). Put the curve in a config table and label it 가정값.
  - Each vehicle's position is `lane offset + arc length = (phase + speed·t) mod length`, with speed by class and seeded phase. Bridges follow ribbon heights; tunnels hide vehicles.
  - No collisions needed. Keep a minimum spacing by deterministic phase slots.
- **Pedestrians.**
  - Ambient walkers on footways and the walk graph (`walkgraph`, `area.graph`).
  - Count by hour from the same kind of curve. Near stations, scale by the congestion data where we have it, labelled 실측; elsewhere 가정값.
  - Path: seeded origin–destination pairs (homes/buildings → station, shops, parks), routed once with the walk graph and cached per seed; position at t by arc length.
  - Our household members keep their scenario-driven journeys. They are the "real" agents; ambient walkers never replace them.
- **Trains.**
  - On the subway lines, positions come from the official interstation times (`web/src/transit/schedule.js`, `rideMinutes`/`gapMinutes`) with seeded offsets per line.
  - Underground segments are hidden; show trains only where a line runs at grade or elevated, if our data has that; otherwise just a pulse on the station marker at arrival times.
- **Nature.**
  - Tree sway: a vertex shader driven by `t` and per-instance seed (amplitude ≤ 2 % of tree height). Calm at night, a bit more by day.
  - Water: a slow procedural normal or UV drift on water ribbons.
- **Determinism and budget.**
  - Same seed + same t gives byte-equal state arrays (test).
  - Draw calls: one InstancedMesh per mover class (≤ 4 extra calls in total).
  - Caps: ≤ 600 vehicles and ≤ 1,500 pedestrians per box on high, half on low.
  - Evaluate at most ~2 ms per frame on the capture laptop. Log `[motion] t=… cars=… peds=… trains=… ms=…` once a second in dev.
- **Labelling.**
  - Update the legend line: ambient cars, people and trains are "규칙으로 만든 모의 움직임(가정값)", not observed traffic.
  - Congestion-scaled crowds near stations say 실측 혼잡도 기반.
  - Do not present ambient movers as data.
- **Tests:** `stateAt` determinism, scrub equality (play to t vs jump to t), density curve shape, spacing slots, hidden in tunnels, the train-at-station pulse timing from the schedule.
- Commit per sub-part: `14b: procedural vehicles`, `14b: procedural pedestrians`, `14b: trains from schedule`, `14b: tree sway + water`.

## End
- Run `.venv/bin/python -m pytest -q 2>&1 | tail -2`, `cd web && npm test 2>&1 | tail -6` and `cd web && npx vite build 2>&1 | tail -2`.
- Write `briefs/14b-RESULT.md`:
  - what changed
  - counts per box at 08:50 and 03:00 for `st-가천대`, `st-잠실`, `songpa-jamsil`
  - capture URLs, including a scrub pair (play to 08:50 vs `t=08:50`)
- Commit.

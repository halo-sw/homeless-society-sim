# Stage 14b — RESULT: load-bug fixes + procedural motion

Date: 2026-10-29. Brief: stage 14b (two load bugs, then procedural motion).
All product code by Muse (agent mode). Commits: `14b: data route decodes
Korean paths`, `14b: typed arrays for scene meshes`, `14b: procedural
vehicles`, `14b: procedural pedestrians`, `14b: trains from schedule`,
`14b: tree sway + water`.

## What changed

**1. Station boxes load in dev (Korean paths).** `web/vite.config.js`
`serveDir` used the raw percent-encoded `req.url`, so `stat` missed
NFC-named box dirs and fell through to the SPA. New pure helper
`resolveDataPath(dir, url)`: decode → `normalize('NFC')` → containment
check (rejects `..` and absolute paths, incl. encoded variants), 400 on
malformed URIs. Test: `web/tests/data-path-14b.test.js` (Korean, NFD→NFC,
traversal, malformed).

**2. Sim no longer crashes on scene meshes.** `buildRoadMeshes` /
`buildWaterRibbons` returned plain JS arrays; `toIndexedGeometry` passed
`indices` to `new THREE.BufferAttribute`, which needs a Typed Array.
New `toTypedMesh` in `web/src/scene/load.js` (positions/colours/uvs →
`Float32Array`, indices → `Uint16Array`/`Uint32Array` by max) applied in
the road/water builders; `toIndexedGeometry` converts defensively too.
Terrain already returned typed arrays. Test:
`web/tests/scene-typed-14b.test.js`. One existing assertion
(`scene-14.test.js` water level) now compares with float tolerance —
same 0.3 m contract, float32 storage.

**3. Procedural motion.** Every mover is now pure state of (box seed,
sim time t, inputs): `web/src/motion/` (`rng.js`, `density.js`,
`vehicles.js`, `pedestrians.js`, `trains.js`, `nature.js`; no three.js),
renderers only evaluate `stateAt(t)` per frame — no drift, scrub-safe.

- *Vehicles* (`motion/vehicles.js` + `render/streetmeshes.js`): fleet
  built once per box from the road ribbons (primary–tertiary,
  residential, service, +links); per-class speed/lane/density 가정값;
  `(phase + speed·t) mod length` with deterministic phase slots (one
  speed per direction per road, so same-direction spacing holds at
  every t); bridges follow ribbon heights; tunnel roads spawn nothing.
  Reuses the body+glass InstancedMeshes (0 extra draw calls).
- *Pedestrians* (`motion/pedestrians.js` + `render/crowd.js`): seeded
  home→station/shop/park OD pairs routed once on the walk graph
  (binary-heap Dijkstra, one run per destination, out-and-back);
  counts from the 가정값 curve; station-bound walkers scale with the
  observed congestion table where it covers the box station (실측
  혼잡도 기반), else 1.0. Household agents untouched. +1 draw call.
  Replaces the tour preview walkers; sim had no ambient walkers before.
- *Trains* (`motion/trains.js` + `render/trainpulse.js`, sim only):
  runs from each pattern carrying the box station, cumulative minutes
  from official interstation gaps (`schedule.js`) or the km estimate;
  evenly spaced trains (가정 headway) with a seeded offset per line.
  No grade data → pulse on the station marker at arrivals only, never
  moving meshes. +1 draw call. Static under reduced-motion.
- *Nature*: tree sway in the crown vertex shader (t + per-instance
  seed, ≤ 0.14 m = 2 % of 7 m at any instance scale, calm at night via
  the emissive gate) and slow water normal drift. 0 extra calls. Scene
  trees only — the flat fallback's trunk/canopy split can't sway
  coherently, so it stays static.
- *Wiring*: sim drives motion from `day×1440+minute`; tour from
  sun-minute + wall elapsed. Caps: 600/1500 high, half on low.
  Dev heartbeat: `[motion] t=… cars=… peds=… trains=… ms=…` 1/s.
- *Legend*: movers labelled "규칙으로 만든 모의 움직임(가정값)"; sim
  appends "역 주변 인파는 실측 혼잡도 기반입니다." when the congestion
  table backs the box station (arrives async).

## Counts per box (headless, high caps, weekday)

Slots: cars = fleet phases, peds = routed walkers (half station-bound),
trains = circulating trains across runs.

| Box | 08:50 cars / peds / trains | 03:00 cars / peds / trains |
| --- | --- | --- |
| `st-가천대` | 128 / 1062 / 24 | 0 / 16 / 24 |
| `st-잠실` | 130 / 873 / 32 | 0 / 11 / 32 |
| `songpa-jamsil` | 130 / 873 / 32 | 0 / 11 / 32 |

Notes: 잠실 crowds scale by observed congestion (08:50: 64.4 % → ×0.64,
실측); 가천대 (경강선, outside the 1–8 table) stays 가정값. 2호선 runs
use full-schedule gaps; 8호선 mixed; 수인·분당선 estimated. 03:00
streets are near-empty (night trough rounds small roads to 0) — the
curve's honest output. Pulse at 08:50: 가천대 0.00, st-잠실 0.13,
songpa-jamsil 0.72 (seeds differ per box id). Crowd build 218–639 ms
one-time; per-frame eval < 1 ms headless (2 ms budget is for the
capture laptop).

## Capture URLs (orchestrator, `vite dev` on :5173)

- `/?area=st-가천대&shot=0` — part-1 fix: Korean box JSON loads (was SPA fallback)
- `/?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:50&follow=1` — part-2 fix + motion at rush
- Scrub pair (must show identical movers):
  - jump: `…&day=1&t=08:50&follow=1` (paused at 08:50)
  - play: `…&day=1&t=08:49&play=1&follow=1` (plays into 08:50; compare as the clock hits 08:50)
- Night: same sim URL with `t=03:00` — near-empty streets, dim sway, lamp glow
- Watch: `[motion]` console line 1/s; legend note + 실측 suffix on 잠실 boxes.

## Gates

`.venv/bin/python -m pytest -q` → 244 passed; `cd web && npm test` →
907 passed (870 + 37 new), 0 fail; `cd web && npx vite build` → green.

## Risks / limitations

1. fps unverified here (no GPU); headless eval < 1 ms, matrix writes unmeasured.
2. Flat-fallback trees don't sway; tour shows no train pulse and no 실측 scaling (no region data there) — legend texts say exactly what each mode shows.
3. 3 am shows zero cars on these boxes (curve rounds to 0) — intended trough, flag if it reads as broken.
4. K trains/line clamp 2–12 and the 10-minute headway target are 가정값.

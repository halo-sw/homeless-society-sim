# Stage 19e — Sim screen: a small train marker, and people called 나 / 배우자 (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Touch only `web/src/journey-scene.js`, `web/src/journey.js`, the household block in `web/src/main.js` (around line 1401), `web/src/style.css` or `web/index.html` (wherever `.hhtag` / `.hopin` are styled; grep) and a new test. First edit within 4 tool calls. Commit, then stop.

## Why
The orchestrator captured the demo sim at 1440×900, `?mode=sim&home=A`, day 1 08:50 (member riding 신분당선 강남→판교, street-level follow camera). Two things look broken:
1. **A huge white cone** (~95 px tall) stands on the road, with a ~45 px white disc above it. This is the journey train marker. `trainMesh = new THREE.Mesh(new THREE.ConeGeometry(30, 90, 10), trainMat)` is at `journey-scene.js:300`. `updateMarkerScale` (`journey-scene.js:384-390`) calls `markerScaleFor` (`journey.js:120-128`), which clamps **below** at `MARKER_MIN_SCALE`. Close to the camera, the cone can never shrink under that floor, so it renders far above the intended 28 px.
2. The drawer, the follow menu and the 3D tag call the demo person **"구성원 1"**. The demo scenario members have no `label`, so `engine/scenario.js:231` defaults to `구성원 ${index + 1}`. The customer-facing rule (`profile.js:439-462`, `memberLabelFor`) is 나 / 배우자 / 아이 …, never "구성원 N".

## Changes
### 1. Train marker → HTML pin (constant size by construction)
- Replace the 3D cone with an HTML element in the journey tag layer (the `tags` option `createJourneyLayer` already receives; station labels use the same layer):
  - `div.trainpin`: a 20 px circle filled with the ride's line colour (`BAND_COLORS` / the network line colour the ride already uses for the route), a 2 px white border and `box-shadow: 0 1px 3px rgba(0,0,0,.35)`;
  - next to it, a white pill label (11 px, weight 600, radius 999, padding 2px 8px): `${lineName} · ${memberLabel}`, e.g. "신분당선 · 나".
- Each frame, `setTrain` projects the world position to screen (same projection helper the station labels use) and moves the div. Hide it when the cone used to hide, or when the point is behind the camera or off screen.
- Delete `trainMesh`, its edge `LineSegments` and `TRAIN_CONE_H`. Keep `markerScaleFor` for the station dots.
- **Fix the dots too:** in `markerScaleFor`, drop the lower clamp when the result would exceed `maxPx` on screen, so `maxPx` is a true ceiling: `return Math.min(1, worldForMax / wh)`. Keep a tiny floor of 1e-3 only to avoid zero.
  - Test: for d = 30 m, fov 10, vh 900, wh 36, maxPx 14, the projected size `scale * wh * vh / (2 d tan(fov/2))` ≤ 14.

### 2. Member names in the sim
At `main.js:1401`, after `const household = run.agents.filter((a) => a.household);`, relabel for display:
```js
household.forEach((a, i) => { a.label = memberLabelFor(a, i); });
```
Import `memberLabelFor` from `./profile.js`.
- Check that `run.agents[i]` carries `role` ("adult" / "child"); `memberLabelFor` already maps index 0 → 나, the second adult → 배우자, child → 아이.
- Also route `agent-float.js:37`'s fallback through the same helper instead of `구성원 ${follow}`.
- Do **not** change `engine/scenario.js`. Engine output and run hashes must stay identical.

## Tests — `web/tests/sim-19e.test.js`
- (a) `markerScaleFor` ceiling (above) at d = 30, 300 and 3000 m.
- (b) `memberLabelFor({ label: "구성원 1", role: "adult" }, 0) === "나"`; with `({ label: "구성원 2", role: "adult" }, 1) === "배우자"`; with `({ label: "구성원 2", role: "child" }, 1) === "아이"`.
- (c) Source pin: `journey-scene.js` no longer contains `ConeGeometry(30, 90`, and contains `trainpin`.

Run:
```
cd web && node --test tests/sim-19e.test.js tests/journey*.test.js 2>&1 | tail -12
```

Commit `19e: train marker as a constant-size HTML pin, sim members named 나/배우자/아이`. Then stop.

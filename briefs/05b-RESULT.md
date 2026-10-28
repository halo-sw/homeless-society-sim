# Stage 5b result — realistic rendering (Muse)

Date: 2026-10-28. Agent mode, single agent (no subagents — `AGENTS.md`
reserves product code, tests and pipeline scripts to Muse). All code and
tests below are my own. Nothing written by other agents; nothing delegated.

Realism comes only from lighting, PBR materials and procedural detail
driven by our real data (footprint, height, levels, use, residential
class, run occupancy). No photo facades, no downloaded textures, no new
packages (three@0.170.0 `examples/jsm` only).

## What changed

**New pure modules (`web/src/render/`, Node-tested, no three/DOM):**
- `facades.js` — facade maths + procedural pixel synthesis. One tile
  texture per class (apartment / house / mixed / non-residential /
  podium / roof) at 512 px: albedo + packed roughness/metalness +
  emissive (R = window mask, G = per-window lit threshold). Rows =
  levels (or height/3 m), bays every 3.2 m (brief: 3–3.6 m), balcony
  slab bands on apartments, plaster/brick houses, curtain-wall or
  concrete non-residential, storefront + fascia podium band (no text —
  invented shops are out of scope). `litFractionFor(occ)` = at-home
  residents / agents housed there, from the same stage-3 occupancy the
  old glow quads used. Full 6-texture synthesis runs in ~40 ms.
- `sky.js` — `skyParams(lat, lon, date, minute)`: solar position +
  day/night mix + dusk bump → phase (day/golden/blue/night), sun and
  hemisphere colours/intensities, Sky turbidity/rayleigh, fog/sky
  colours, exposure, environment intensity, bloom gate, emissive gate.
- `quality.js` — `?q=high|medium|low` (default medium), per-level
  settings, auto-drop rule (first 60 frames < 25 fps → low, never
  upgrades).
- `streetlife.js` — decorative parked cars (drive-edge offset),
  slow movers (7 m/s ping-pong), street lamps (alternating sides);
  seeded and deterministic. Covered by the existing "장식용" legend note.

**Scene modules (additive; all 146 pre-existing tests still pass):**
- `buildings.js` — metre-based wall UVs (U = ring distance, V =
  height) + planar roof UVs; detail buckets (one wall mesh per facade
  class, podium band on mixed/non-residential taller than 5.2 m, one
  roof mesh) dual-emitted with the unchanged legacy buckets; parapets
  (1.1 m + cap) on every flat roof; rooftop plant boxes on tall (≥
  30 m) flat towers. Bevel skipped (merged soup, no cheap win).
- `ground.js` — lane paint overlay by road class (yellow centre on
  arterials, white on local streets, edge lines on wide roads), kerb
  strips, separate reflective water skin, seeded grass variation.
- `trees.js` — `species` per tree (zelkova/ginkgo/pine, derived from
  the existing phase — placement/scale RNG sequence bit-identical),
  dark evergreen pine colours.
- `camera.js` — `archLensPose()`: true two-point framing (level
  sensor + wide frustum + `setViewOffset` crop) at the 2b stop widths.
- `palette.js` — lane/kerb/pine/water constants (additive).

**Browser rig (`web/src/render/`, wired through the seam):**
- `textures.js` — pixel buffers → cached CanvasTextures; PBR material
  factories. Facade shader patch: per-vertex `aLit` (building lit
  fraction) vs per-window threshold → warm emissive × `uNight`
  (0 by day; lazy-compile safe).
- `rig.js` — sun (+moonlight below horizon) with a target-following
  240 m shadow frustum, hemisphere fill, Preetham Sky dome by
  day/golden, PMREM environment (throttled: once per tour, per 30 sim
  minutes), fog/exposure/environment follow the clock.
- `post.js` — EffectComposer: SAO (high only), night/dusk-gated bloom,
  mild tilt-shift (`?tilt=0` disables), vignette + grain-off-by-default
  grade (`?grain=1`), OutputPass. Low = direct render. CSM considered
  and rejected (cost/risk under SwiftShader; the following frustum
  covers the frame instead).
- `renderer.js` — `createRenderer({canvas, params})` (AgX, sRGB,
  PCFSoft) / `renderFrame({bloom}, dt)`: stats + auto quality drop.
  Logs scene-only draw calls/triangles/frame-ms at frames 30/120.
- `streetmeshes.js` — instanced car bodies + glass cabins, lamp poles
  + heads (emissive at night); only movers update per frame.

**`main.js` (seam only + rendering needs):** renderer via
`createRenderer`, frames via `renderFrame`, rig/material/street
builders in `buildWorld`, night quads replaced by `aLit` occupancy
fill, `?time=HH:MM` tour-sun override, `?lens=arch` tour lens,
`resOnly` dims non-res walls + podium. No UI/overlay edits, no
`sim.js`/`judge/`/`consult/`/`index.html` edits (one line hides the 2b
paper `#vignette` div — the post chain owns the vignette now; 5a owns
the overlay itself). `windows.js` is retained and tested but no longer
rendered (emissive maps replace the quads, same occupancy data).

## Commands run and observed output

1. `cd web && node --test tests/*.test.js` → **185 passed**
   (was 146; +39: 10 facades/buckets, 7 sky, 3 quality, 7 streetlife,
   5 ground/markings, 4 arch-lens/species, +3 phase/detail asserts).
2. `cd web && npm run build` → **✓ built** (~0.7 s).
3. Browser-module import check (node): `textures/rig/post/renderer/
   streetmeshes` import with no DOM at import time → OK.
4. Bundle scan: no `api.meta.ai` / baseten URLs, no `*_API_KEY` in
   `dist/assets/*.js` (stage-4 guarantee holds).
5. Headless scene build over real `data/build` (load + buildings +
   ground + trees + streetlife; script in `/tmp/check5b.mjs`):

| area | buildings | build ms | wall tris (apt/house/mix/none/podium) | roofs | total bld |
|---|---|---|---|---|---|
| songpa-jamsil | 1506 | 161 | 136178/1640/0/10582/9732 | 53393 | 211525 |
| pangyo | 1204 | 155 | 144494/40/0/12144/10238 | 56281 | 223197 |
| seongsu | 5383 | 182 | 25208/19502/0/35740/29380 | 114031 | 223861 |
| songpa | 28088 | 1643 | 925920/87306/70/127702/113062 | 731178 | 1985238 |

Detail-bucket sum == legacy-bucket sum on all four areas (dual-emit
consistent). Ground: jamsil base 6437 + paint 5604 + kerbs 2280 +
water 233 tris, 103 crossings. Street: 600 parked + ~45 movers +
920–1200 lamps (capped). Trees: 2200 (capped) ≈ 44/35/21 %
zelkova/ginkgo/pine. Facade synthesis 39 ms, hashes
`4654b270/01a55da2/c69e5db0/beedc8c0/890fe9fc/ca01d44a`.
Run A day 3: 02:00 → 62/62 home in 42 buildings (all lit);
12:00 → 26/62 home in 21 buildings.
6. `.venv/bin/pytest` could not run here (no `.venv` in this
   workspace); the Python pipeline and its tests are untouched
   (`git status`: only `web/src/*`, new `web/src/render/`,
   new `web/tests/render-*`).

## Per-quality draw calls / triangles

Scene geometry is identical across qualities (same meshes; quality
changes pixel ratio, shadow size and post passes, not the scene).
Headless scene-triangle estimates from the table above + instancing:

| area | scene tris ≈ | scene draw calls ≈ |
|---|---|---|
| songpa-jamsil | ~610 k (211 k bld + ~200 k trees + ~160 k lamps + rest) | ~22 |
| pangyo | ~630 k | ~22 |
| seongsu | ~600 k | ~22 |
| songpa | ~2.6 M | ~22 |

Meshes: ≤4 wall + podium + roof, ground + paint + water + base, trunk
+ 3 canopy, 2 car + 2 lamp, Sky, agents/walkers. Post passes add
~7 calls (high), ~5 (medium), 0 (low) — the in-browser `[render]
frame=30/120 q=… drawCalls=… triangles=… frameMs=… (scene only)` lines
report the exact scene numbers; `[scene]`/`[sim]` lines keep the
counts. Expect SwiftShader to auto-drop to low (logged).

## Capture URLs (serve `web/`, `npm run dev`)

Tour sun `?time=` uses the Oct-15 solar table (verified: 12:00 alt
44° day · 16:30 alt 15° golden · 18:30 alt −8° blue · 22:00 night).
Append `&q=high|medium|low`, `&lens=arch`, `&tilt=0` as needed.

- Day 12:00: `/?area=songpa-jamsil&shot=2&time=12:00`
- Golden 16:30: `/?area=songpa-jamsil&shot=2&time=16:30`
- Blue 18:30: `/?area=songpa-jamsil&shot=2&time=18:30`
- Night 22:00 (tour has no run → dark facades + lamps + moonlight):
  `/?area=songpa-jamsil&shot=2&time=22:00`
- Night 22:00 with lit windows (run occupancy):
  `/?mode=sim&home=A&day=3&t=22:00` (also `&t=12:00`, `&t=16:30`,
  `&t=18:30`; B via `&home=B`). Run files exist; no CLI run needed.
- Tour stops (each `&shot=0..5`, all areas as in 02b):
  `/?area=songpa-jamsil&shot=0` … `/?area=pangyo&shot=5`
- Architectural lens: any tour URL + `&lens=arch`
  (e.g. `/?area=songpa-jamsil&shot=1&lens=arch&time=16:30`)

## What needs a real GPU to judge

- The look itself: facade contrast/readability at 300–500 m,
  apartment banding vs tiling repetition, night emissive brightness
  (2.4× warm) vs lamp glow, bloom threshold/strength, SAO strength on
  high, tilt-shift focus/range, vignette weight, water reflection,
  Sky/exposure balance at golden hour, arch-crop edge distortion.
- Shadow quality: 240 m following frustum (bias −0.0004, normalBias
  1.5) — acne vs peter-panning on facades; 2048 vs 1024 maps.
- Behaviour: auto-drop timing on SwiftShader vs the Mac GPU, first-
  load PMREM/SAO cost on songpa (2.6 M tris), mover/lamp instancing
  fps, `?shot=` + `?time=` + `?lens=arch` combined framing.
- Known honest limits: tour night has no lit windows (no run in tour
  mode); blue/night sky is a flat colour (no stars/moon disc);
  unoccupied buildings stay dark; podium fascia has no text; pitched
  roofs reuse the membrane texture tinted tile-red; roofs share one
  mesh so `resOnly` never dims them.

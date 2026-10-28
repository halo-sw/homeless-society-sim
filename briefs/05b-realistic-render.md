# Stage 5b — Realistic rendering (brief for Muse)

Agent mode, rules in `AGENTS.md`. Read `briefs/02b-RESULT.md`, `briefs/04-RESULT.md` and the scene modules first. Attached: current captures (`briefs/img/04-render.png`). Sandbox: no network; the orchestrator captures in Chromium (SwiftShader) and on the user's Mac.

User feedback: "it looks too crude (투박)". The user chose a **realistic architectural-visualisation look** (실사풍 렌더) over the illustrated style. Real photo facades of real buildings are out of scope (no rights, no data); the realism must come from lighting, materials and procedural detail driven by our real data (footprint, height, floors, use, residential class).

**A parallel stage (5a) is moving all UI overlays to React/Astryx and adding a chat panel.** Do not edit UI/overlay code, `sim.js` UI parts, `web/src/judge/`, `web/src/consult/`, or `index.html` beyond what rendering needs. Put new code in `web/src/render/` and the scene modules (`buildings.js`, `ground.js`, `trees.js`, `lighting.js`, `palette.js`, `camera.js`). Touch `main.js` only through a small `createRenderer(...)` / `renderFrame(...)` seam so the merge with 5a is trivial.

## What to build (three@0.170.0 incl. `examples/jsm`; no new packages, no downloaded textures — all procedural)
1. **Physically based base.** `MeshStandardMaterial`/`MeshPhysicalMaterial`, `renderer.toneMapping = AgXToneMapping` (or ACES), sRGB output, `PMREMGenerator` environment from `examples/jsm/objects/Sky.js` driven by the existing solar position, so sky colour, sun colour and ambient follow the sim clock (day, golden hour, blue hour, night).
2. **Facades from data.** Procedural canvas textures (generated once, cached, seeded) with real-world UV mapping in metres per wall: window grid where row count = `levels` (or height/3 m), bay width ~3–3.6 m; apartment slabs: balcony bands and glass with slight roughness variation; houses: plaster/brick with fewer windows; non-residential: curtain wall glass or concrete. Roughness + metalness maps; ground-floor band (lobby / shops) on mixed and non-residential. At night an emissive map lights a fraction of windows equal to the run's residents-at-home per building (stage 3 data) — the same data the current glow uses; daytime emissive off.
3. **Roofs and massing detail.** Parapets on flat roofs, rooftop plant boxes on tall buildings, pitched roofs with tile colour for houses; slight bevel on edges if cheap.
4. **Ground.** Asphalt with lane markings by road class, sidewalks with kerbs, crosswalk stripes (exists), grass with subtle variation for parks, complex paving, water with reflection-ish roughness.
5. **Vegetation.** Instanced trees with 2–3 species shapes (zelkova/ginkgo/pine), autumn colour variety, real scale (6–12 m), shadows.
6. **Street life (decorative, labelled).** Instanced cars along drive edges (parked + slowly moving), street lights along roads that turn on at night. Keep the existing "장식용" attribution note.
7. **Post-processing** via `EffectComposer`: GTAO or SAO (ambient occlusion), soft shadows (PCFSoft or VSM; consider `examples/jsm/csm/CSM.js` for large areas), bloom only at night/dusk for lit windows and street lights, mild tilt-shift (vertical DOF) for the miniature-photo feel (toggle), subtle vignette, filmic grain off by default.
8. **Quality levels.** `?q=high|medium|low` (default medium); auto drop to low if the first 60 frames average < 25 fps. Log draw calls, triangles, frame time.
9. **Camera.** Keep 2b framing and occlusion fade; add an architectural lens option (vertical lines kept vertical / two-point perspective) for tour stops.

## Tests (`node --test`)
Facade UV/row maths (levels → rows, bay width), seeded texture determinism (hash of generated pixel data), night lit-window fraction = residents/households from the run, quality-level selection, sky/sun parameters at noon / golden hour / night for Seoul. `vite build` passes.

## Output
`briefs/05b-RESULT.md`: what changed, real test/build output, per-quality draw calls/triangles, capture URLs (day 12:00, 16:30 golden hour, 18:30 blue hour, 22:00 night; tour stops), and what needs a real GPU to judge.

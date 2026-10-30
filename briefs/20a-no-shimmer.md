# Stage 20a — The 3D view stops crawling when the camera moves (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ithaca-17`. Do not explore beyond the files named. First edit within 4 tool calls. Commit, then stop. The orchestrator verifies on the GPU.

## Why
The user: "지도 움직일때마다 우글우글 거려" (the map crawls whenever it moves). Their capture of the painted sim also shows **blotchy, ragged road surfaces**: grey patches with torn edges over the beige ground.

Causes found in code:
1. **Low-res main pass with nearest upscale.** On painted high, the main pass renders at 1/`PAINTED_PIXEL_HIGH` = 1/1.5 (`render/painted.js:65`, applied in `render/post.js:255-262`). Both composer targets use `NearestFilter`. Every edge snaps to a coarse grid that moves with the camera.
2. **No anti-aliasing in the composer.** `composerSamples: 0` on every level (`render/quality.js:19-27`), and the chain has no FXAA/SMAA pass. The renderer's `antialias: true` does nothing once an `EffectComposer` is used.
3. **Kuwahara every frame** (`kuwaharaRadiusFor`: 3 on high, `render/painted.js:75-79`). It is a non-linear selector, so sub-pixel camera motion flips which quadrant wins and the whole frame boils.
4. **Coplanar ground layers.** The stage-14 terrain grid (`main.js:302-317`, land mask texture), the old `buildGround` mesh with its own road polygons (`main.js:318-322`), and the road ribbons (`main.js:337-350`, polygonOffset 1–2) all sit at nearly the same height. The old ground roads fight the terrain, which gives the ragged grey patches.

## Changes
1. Default `paintedPixelFactor` to **1** on every level (`PAINTED_PIXEL_HIGH = 1`). Keep `?px=` as an explicit override. Use `LinearFilter` on the composer targets unless `pf > 1`.
2. Add anti-aliasing to the painted chain:
   - If WebGL2: set `composerSamples: 4` for the **painted** chain only. Painted uses its own AO pass, not SAO, so the ANGLE/Metal SAO black-frame rule does not apply. Keep 0 for the photo chain.
   - Else: insert an FXAA pass (`three/addons/shaders/FXAAShader.js`) just before `output`.
   - Update `postChainSpec` and its tests to show the AA step.
3. Kuwahara: radius 1 on high and 1 on medium, or remove it from the chain when `?kuwa=0`. The default must be stable under motion.
   - The motion stability test: a pure function `temporalStableKuwahara(level)` returning the radius; assert ≤ 1.
   - Keep the painted look from the 1 px outline and grade passes.
4. In painted scene mode (`scene14 && STYLE === "painted"`), hide the old `groundMesh` road/lane polygons the same way `markMesh` is hidden at `main.js:368`. Draw roads only as ribbons.
   - Raise the ribbon `polygonOffset` to road 2 / rail 2 / foot 3 / cycle 3.
   - Set the terrain material `polygonOffset` to factor 1 / units 1 (pushed back).
5. Shadows: when the camera moves, keep the shadow camera texel-snapped. `render/shadows.js` already computes `texelM`; check that the light target is rounded to `texelM` in world space each frame. If it is not, do it.

## Tests — `web/tests/shimmer-20a.test.js`
- `paintedPixelFactor("high")` is 1, and `paintedPixelFactor("high", "2")` is 2.
- `postChainSpec("high", { style: "painted" })` contains an AA step (or `qualitySettings` exposes `paintedSamples: 4`).
- The Kuwahara radius is ≤ 1 by default.
- A source pin: `main.js` hides the old ground in painted scene mode, i.e. the line exists next to the `markMesh` hide.

Run:
```
cd web && node --test tests/shimmer-20a.test.js tests/painted*.test.js tests/post*.test.js 2>&1 | tail -10
```
Update the old pins that expect 1.5, nearest filtering or radius 3, and name them in the commit body.

Commit `20a: no crawling — full-res painted pass, MSAA/FXAA, gentle Kuwahara, one road layer`. Then stop.

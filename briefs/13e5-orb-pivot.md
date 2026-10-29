# Stage 13e5 — Orb pivot and the sim "직장" sprite (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents. Do not explore beyond what is named.** The first edit should land within 4 tool calls.

## 1. Orb drifts off-centre (root cause found)
- GPU after `fa6a980`, 12 s after load: the canvas is right (1000×811 css, 1000×811 buffer). But the regions sit cropped against the top-right corner.
- Cause: `web/src/ui/orb.jsx` tick, around line 162:
  - `root.rotation.y = rotY` with `rotY` drifting while idle.
  - `root` rotates about the world origin, but the shapes are centred at `view.center`, which is not the origin.
  - So the drift swings the map away from the camera's `centerV`.
  - `fitOrbView` is fine.
- Fix:
  - Make the pivot the map centre: put `root.position` at `centerV` and offset the children by `-centerV` (or wrap them in an inner group).
  - Keep the drift very small (±6° oscillation, not continuous spin), so labels stay readable and the fit holds.
  - With reduced motion: no drift.
  - Label projection must use the same transform.
- Test: a pure helper that, for the sample shapes, rotating by ±6° about the pivot keeps projected bounds centred within ±5 %.
- Commit `13e5: orb pivots on its centre`.

## 2. The sim "직장" tag is a WebGL sprite, not a DOM tag
- GPU probe: no DOM element with the text "직장" has a size. The visible tag at x≈1058–1092, y≈55–68 is drawn **inside the canvas**, behind the right drawer, and peeks out in the 8 px gap between the top bar and the drawer.
- Find where the work/home place labels are drawn as sprites or canvas textures (search `web/src/render/` and `web/src/main.js` for `Sprite`, `CanvasTexture`, or the activity label "직장" / `ACTIVITIES.work.label`).
- Then do **both**:
  - (a) Give the 3D view a camera view offset (`camera.setViewOffset` or `renderer.setViewport`) so the scene's visible centre is the stage area left of the drawer, and nothing important renders under it.
  - (b) Close the gap: the drawer (`.ui-sim13-drawer`) starts flush under the top bar, with the same background, so no canvas pixels show between them.
- Test: the view-offset helper for 1440 wide with a 380 px drawer.
- Commit `13e5: sim scene clear of the drawer`.

## End
- Run `cd web && npx vite build 2>&1 | tail -3` and `cd web && npm test 2>&1 | tail -6`.
- Append a "13e5" section to `briefs/13e-RESULT.md`.
- Commit.

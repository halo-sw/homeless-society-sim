# Stage 26h — Big areas: coarser terrain grid (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `us-26`. Stop when this part is done.

## Found by the orchestrator
The US scene `us-menlo` has a terrain grid of 3105 × 3105 at `STEP_M = 2.5`. That is 9.6 M height samples, because the box is 5.7 × 4.7 km and the terrain is a square centred on Meta HQ near the east edge.
- `scene.json` is 32 MB.
- The browser draws 24 M triangles, most of them terrain.
- Korean station boxes are about 1.2 km (about 480 cells per side).

## Change (`pipeline/scene.py`, ~405-420 and the `terrain` meta ~707)
1. **New constant `MAX_TERRAIN_CELLS = 1200`** (cells per side).
2. **After computing `half_m`, pick `step`:**
   - `STEP_M` when `2 * half_m / STEP_M <= MAX_TERRAIN_CELLS`;
   - else the smallest multiple of 0.5 m such that `2 * half_m / step <= MAX_TERRAIN_CELLS`.
   - Recompute `half_m = ceil(need / step) * step` with that step.
   - Pass `step` to `sample_grid` and write it into `terrain.step`, which the web already reads.
3. Every other use of `STEP_M` in the scene build that means "the terrain grid step" must use `step`. Grep the file and check each use. Road and land geometry do not depend on it; if one does, say so in the final message.
4. Bump `SCENE_CODE_VERSION` only if Korean outputs would change. They must not: for any box with `2 * half_m / 2.5 <= 1200`, the output must be byte-identical. So do not bump it unless you have to, and explain why if you do.

## Test — add to `tests/test_us_area.py` (or a new `tests/test_scene_step.py`)
- Factor the choice into a pure helper `terrain_step(need_m) -> (step, half_m)` and test it:
  - `need = 600` → `(2.5, 600.0)`;
  - `need = 1500` → `(2.5, 1500.0)` (exactly 1200 cells);
  - `need = 3880` → step `6.5`, `half_m = 3880.5`, and `2*half_m/step <= 1200`;
  - `need = 1501` → step `3.0`.
- Keep green: the existing scene tests (`ls tests | grep -i scene`).

Run only:
```
.venv/bin/python -m pytest -q tests/test_us_area.py $(ls tests | grep -i scene | sed 's#^#tests/#') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
Everything except `pipeline/scene.py` and the test file. Nothing under `data/`.

## Final message
Changed files, one line each. Nothing else.

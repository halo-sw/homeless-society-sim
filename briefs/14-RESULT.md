# Stage 14 — RESULT: terrain, road ribbons, forests and trees from OSM

Date: 2026-10-29. Spec: `docs/specs/osm-3d-scene-roads-forest-trees.md` (§N below).
Brief: `briefs/14-terrain-roads-trees.md`. All product code by Muse (agent mode).

## What landed

- **Pipeline**: `pipeline/scene_geo.py` (frame, heightAt, resample, seeded RNG),
  `pipeline/dem.py` (Terrarium PNG via stdlib+zlib, bilinear 2.5 m grid, weak
  seeded noise, pluggable `ngii_5m` ASCII-grid source), `pipeline/scene.py`
  (buffered-extract parse, clip/simplify/project, Poisson trees, `scene.json`),
  `pipeline scene` CLI (`--areas station:*`, `--dem`, `--species`, `--overwrite`).
- **Web**: `web/src/scene/` (`height.js`, `load.js`, `terrain.js`, `roads.js`,
  `trees3d.js`); `main.js` seats terrain/roads/buildings/trees/cars/lamps/
  walkers/agents/routes/tags/camera on one `heightAt`, with a flat fallback
  when a box has no `scene.json`. New look colours, ≤768 px auto-low,
  `terrain-tiles` source entry, updated tree legend.
- **Data**: all 60 station boxes + 3 legacy boxes built (max 1.22 MB, all
  ≤ 2.5 MB). `songpa` (gu boundary) skips by design — needs §6.1 tiling.

## Spec §7 table (per step, with numbers)

| Step | Work | Output | Done? / numbers |
| --- | --- | --- | --- |
| 1 | Data collect (local extracts, no Overpass) | `pipeline scene`, buffered PBF + DEM tiles | ✅ 60/60 boxes parse; DEM coverage 1.0 on all |
| 2 | Preprocess + JSON | `scene.json` per box (§4.1 schema) | ✅ 0.98–1.22 MB (target ≤ 2.5 MB); byte-identical rebuilds (sha `b85000d6…` twice) |
| 3 | Terrain render | grid mesh + `heightAt` | ✅ DEM 17.5–115.6 m (가천대), −0.8–79.5 m (잠실), −5.0–96.3 m (대모산입구); map-vs-shape check is the orchestrator's eye test |
| 4 | Road render | 2 m ribbons, order offsets + `polygonOffset`, bridges lifted, tunnels skipped | ✅ 344–571 roads/box; 0 NaN verts; road–area alignment ≤ 0.07 m (named-road probe) |
| 5 | Forest/green/water | canvas land mask on terrain + waterway ribbons (−0.3 m) | ✅ mask classes forest/grass/scrub/water; holes via evenodd; no floating sheets (paint, not geometry) |
| 6 | Trees | 3 `InstancedMesh`, seeded | ✅ 1,469–10,000 trees/box; 0 on roads/water/buildings (probe); 0 in the fixture hole; spacing ≥ 5 m (forest) |
| 7 | Optimise + mobile | low mode, budgets | ✅ ~22–24 draw calls, ~0.86–1.35 M tris (headless estimate, §6 limits 30 / 1.5 M); DPR ≤ 1.5 + AO off + 1024 shadows on low; auto-low ≤ 768 px; 60 fps needs the capture laptop |
| 8 | Other regions | no-code-change builds | ✅ 60 station + 3 legacy boxes, one command, zero failures |

Per-box detail (time = first build; signature-skipped rebuilds are ~0 s):

| Box | Time | Size | Roads (by class) | Lands | Trees (species / source) | Calls / tris |
| --- | --- | --- | --- | --- | --- | --- |
| `st-가천대` | 2.4 s | 1,220,839 B | 397 (motorway 6, trunk 10, primary 19, secondary 8, residential 65, service 156, footway 91, steps 15, cycleway 3, + links/track/rail) | 46 (wood 7, grass 30, park 1, pitch 6, water 2) | 10,000 capped (coni 4,000 / broad 4,980 / shrub 1,020; forest 9,444 / park 21 / street 535) | ~22 / ~1.35 M |
| `st-잠실` | 0.9 s | 1,027,539 B | 571 (trunk 1, primary 47, secondary 8, tertiary 36, residential 32, service 104, footway 154, cycleway 100, steps 22, rail 10, + links/busway) | 36 (grass 21, park 9, pitch 4, water 2) | 1,469 (564 / 755 / 150; park 460 / row 19 / street 990) | ~23 / ~0.87 M |
| `st-대모산입구` | 1.0 s | 1,031,132 B | 344 (primary 24, secondary 6, tertiary 14, residential 16, service 130, footway 91, cycleway 17, steps 7, rail 6, + links) | 29 (wood 1, park 10, garden 1, pitch 16, water 1) | 2,742 (1,078 / 1,388 / 276; forest 785 / osm 1 / park 685 / row 125 / street 1,146) | ~24 / ~0.86 M |

Also built: `st-남한산성입구` (1.11 MB, 1,597 trees, no mapped forest — honest
OSM gap, see risks), `pangyo` (1.12 MB), `seongsu` (0.98 MB), `songpa-jamsil`
(1.03 MB). All 60 boxes: 183,117 trees total, 3 capped at 10,000
(가천대/고덕/일원), 34 with waterways, none over budget, none treeless.

## Capture URLs (orchestrator, `vite dev` on :5173)

No scenario exists on `st-가천대`, so tour URLs per the brief (`shot=0`
pauses on the first stop for deterministic framing):

- `/?area=st-가천대&shot=0` — spec test point, forest hill + campus
- `/?area=st-잠실&shot=0` — flat apartment box
- `/?area=st-대모산입구&shot=0` — hill-adjacent box
- Bonus sim (terrain + agents + routes, home A lives here):
  `/?mode=sim&home=A&day=1&t=08:50&follow=1` (songpa-jamsil)

Watch the console for `[scene14] area=… drawCalls=… triangles=…` (once per
box load, scene-only) and the frame-30 `[scene]` line. Eye-check against
Kakao/Naver satellite (roads/forest edges) — by eye only, never as data.

## What the orchestrator must run

```bash
# Everything is already built, but a clean re-run is one command:
.venv/bin/python -m pipeline scene --areas station:*   # skips when fresh
.venv/bin/python -m pipeline scene --areas pangyo,seongsu,songpa-jamsil
.venv/bin/python -m pytest tests/ -q                    # 244 passed
cd web && npm test                                      # 870 passed
cd web && npm run build                                 # green
```

Nothing to install (stdlib PNG decode + numpy/shapely/osmium already in
`.venv`). No network, no keys at any step.

## Design decisions (brief §5 etc.)

- **`scene.json` next to `area.json`, not inside it**: different frame
  (scene-local metres vs WGS84), different consumers (3D only vs everything),
  different rebuild triggers (DEM/extract vs register/graph). Keeps 2D/sim
  loads small and scene rebuilds independent.
- **Production frame uses 111320 m/deg on both axes** (matches
  `frame.js`/`area_build.py`), not the spec's 110540 latitude constant —
  otherwise scene roads would drift ~4 m from buildings at the box edge.
  The converter takes the constant as a parameter and the test asserts the
  spec formula exactly with 110540.
- **Clip to the box bbox** (the buffered extract only feeds data): terrain
  covers exactly the box, so ribbons past its edge would float on clamped
  heights.
- **Post**: kept ours (Render→SAO→Bloom→Tilt→Grade→Output on high; SAO is
  the N8AO equivalent). No SMAA added — medium/high composer paths stay as
  they were; low uses renderer MSAA via `antialias:true`.
- **Tree shadow 150 m**: real implementation — patched `MeshDepthMaterial`
  discards past-150 m fragments from the shadow map (not just the frustum).
- **Journey layer untouched**: its lines/dots/train already render with
  `depthTest:false`, so terrain can't bury them. 2D map-sim stays flat.

## Final checklist (spec §7, honest status)

- [ ] Kakao/Naver satellite side-by-side — **orchestrator + user, by eye**
      (not done here; no headless browser in this session)
- [x] Roads drape the terrain — 0 NaN vertices, bridge/tunnel rules tested,
      alignment ≤ 0.07 m on named roads (vertex-to-segment; one 5 m
      vertex-to-vertex reading is a clip-boundary point with no nearby area
      vertex, verified on-segment)
- [x] Byte-identical rebuilds — sha equal across `--overwrite` rebuilds;
      fixture determinism test
- [x] OSM credit on screen — unchanged footer/drawer + new `terrain-tiles`
      source entry (`web/src/sources.js`, `ATTRIBUTION.md`)
- [x] Apartment + hill boxes verified — 잠실 (flat) + 대모산입구 (hill) +
      가천대 (spec point), code-unchanged; plus all 60 boxes in one pass

## Risks / known limitations (all pre-existing spec risks, kept visible)

1. **Unmapped mountain forest** (spec §8 row 1): `st-남한산성입구` has hills
   but zero OSM forest polygons, so its slopes render bare (terrain shape is
   still right). The spec's DEM-slope estimated-forest option is NOT
   implemented — documented future work, needs an explicit labelling decision.
2. **SRTM reads buildings and water**: 잠실 shows a ~80 m bump (tower
   averaged into 30 m cells) and −0.8 m over the river; 대모산입구 −5.0 m
   near water. Bare-earth NGII 5 m (`--dem ngii_5m`, sidecar layout in
   `pipeline/dem.py`) replaces this when the user downloads it.
3. **fps is unverified here** — no GPU in this session. Headless budgets
   hold (≤ 24 calls, ≤ 1.35 M tris); the capture laptop decides 60 fps.
4. **Same-class road crossings** share one ribbon height plus a deterministic
   ≤ 4 mm micro-lift and `polygonOffset` — class crossings can't flicker;
   same-class crossings should be rare/invisible but this is an eye check.
5. **Gu-scale `songpa`** renders flat (boundary areas need §6.1 tiling).

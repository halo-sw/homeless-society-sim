# Stage 14 — Terrain, road ribbons, forests and trees from OSM (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents** (cost).

The user's spec is `docs/specs/osm-3d-scene-roads-forest-trees.md` (Korean, by the user, 2026-10-29). Read it in full; it is the source of truth for this stage. This brief only adapts it to our codebase. Also read `web/src/render/` (renderer.js, look.js, streetmeshes.js, streetlife.js, quality.js, shadows.js), `pipeline/area_build.py`, `pipeline/boxes.py` and `briefs/13-RESULT.md`.

## Adaptations to our project
1. **Data source.**
   - Use the local OSM extracts, never Overpass: `data/build/_cache/regions/<region>.osm.pbf` and each box's `extract.buffered.osm.pbf`.
   - Use the same tag set as the spec's §3.1 query: highway, railway, natural wood/scrub/grassland/water, landuse forest/grass/meadow/park/recreation_ground, leisure park/garden/pitch, waterway, natural=tree, tree_row, and multipolygon relations with outer/inner rings.
   - The spec's "R + 100 m" margin = our buffered extract.
2. **Where it applies.**
   - Add the layers to **our existing scene boxes**: the 60 station boxes, the 4 legacy areas, and the map-sim regions from stage 13 where cheap.
   - Buildings stay. The spec excludes them only because its scene has none; ours does.
   - Trees must avoid building footprints (§6.1 exclusion list) as well as roads and water.
   - First test box: `st-가천대` (the spec's test point, 37.4529, 127.1314). Then a flat apartment box (`st-잠실` or `songpa-jamsil`) and a hill-adjacent box (`st-남한산성입구` or `st-대모산입구`), per §7 step 8.
3. **Terrain (DEM).**
   - The orchestrator downloaded **AWS Terrain Tiles (Terrarium PNG), zoom 14**, covering lon 126.98–127.22, lat 37.27–37.62: `data/raw/dem/terrarium/14/{x}_{y}.png` (231 tiles).
   - Decode: `elevation_m = R*256 + G + B/256 − 32768`.
   - In Korea these come from SRTM, about 30 m effective. Resample to the spec's 2.5 m grid with bilinear interpolation, and add the spec's weak noise (seeded) only to break flatness. Store as dm integers.
   - Keep the DEM loader pluggable. A later `ngii_5m` source (국토지리정보원 5m DEM; the user would download it after sign-up) must drop in without code changes elsewhere.
   - Attribution: AWS Terrain Tiles / Mapzen, with the SRTM source. Add it to `web/src/sources.js` and `ATTRIBUTION.md`.
4. **Height everywhere.**
   - One `heightAt(x, z)` shared by terrain, roads, lands, water, trees, buildings (base sits on terrain), the walking person, the route line, labels and the camera rig.
   - Today the scene is flat. Check that nothing floats or sinks after terrain is on. For buildings on slopes, use the lowest footprint corner as the base, with a plinth to the highest.
   - The 2D map sim (stage 13) may stay flat.
5. **Scene data.**
   - Follow the spec's §4.1 schema as a per-box `scene.json` (or as new keys in the existing box files; pick one and say why).
   - Targets: 1.2 km boxes, aiming ≤ 2.5 MB per box before gzip. The spec's 1 MB is for 500 m radius. Report actual sizes.
   - Same input → byte-identical output (seeded by box id).
6. **Roads.**
   - Ribbons with the spec's widths table, resampled every 2 m, following terrain.
   - Order offsets plus `polygonOffset`. Bridges are raised and interpolated; tunnels are not drawn.
   - Three materials: road / footway / cycleway. Merged per class, ≤ 4 draw calls.
   - Replace our current street meshes where they overlap, so there is one road system. Keep the route line and crowding colours on top.
7. **Lands and water.** Use the spec's recommended **mask texture on the terrain** (canvas per box): forest, grass/park, scrub, water. Rivers and streams are ribbons 0.3 m below ground.
8. **Trees.**
   - Three `InstancedMesh` (conifer / broadleaf / shrub), ≤ 200 triangles each, built in code. Vertex colours, plus ±8 % per-instance tint, random scale and rotation (seeded).
   - Placement rules per §3.2:
     - OSM `natural=tree` points are placed as-is.
     - Tree rows: every 8 m.
     - Forests: Poisson-disk, 5 m minimum spacing.
     - Parks and gardens: 12 m.
     - Street trees: 10 m apart along primary–tertiary, at width/2 + 2 m.
   - Exclude trees on roads, water and building footprints.
   - Shadows: cast within 150 m only.
   - Our existing decorative trees (`streetlife.js`, labelled "나무·인물은 장식용 모의 표시") are replaced by these. Update the label to say trees come from OSM forest/park areas and are placed procedurally.
9. **Performance.**
   - Spec §6 targets apply per box: ≤ 30 draw calls before post, ≤ 1.5 M triangles, up to 10,000 trees, 60 fps on the capture laptop.
   - Low-end mode (DPR ≤ 1.5, lower shadow map, AO off, auto on ≤ 768 px). Use the existing `quality.js` and `look.js` where they fit; new colours go in the look table.
   - Log `renderer.info` once per box load.
   - Post-processing: we already have a pipeline (`post.js`). Do not add N8AO/SMAA if equivalent passes exist; say what you kept.
10. **Build.**
    - Pipeline step `scene` (`.venv/bin/python -m pipeline scene --areas station:*`), incremental via input signatures like `boxes`.
    - Build the 3 test boxes and report per box: time, size, counts (roads by class, land polygons, trees by species and source), draw calls, triangles.
    - The orchestrator runs the rest.

## Tests
- DEM decode + bilinear `heightAt` (edge clamp).
- Coordinate conversion per the spec's formula.
- Road width from width / lanes / defaults.
- Ribbon vertex count for a 2 m resample.
- Bridge / tunnel handling.
- Multipolygon with a hole (point in hole gets no forest trees).
- Poisson minimum spacing.
- No tree on a road / water / building fixture.
- Determinism (two builds byte-equal).
- Species ratio config.
- Scene size budget on the test box.
- All existing tests green, `vite build` green, no keys or raw data in git or bundle.

## Output
`briefs/14-RESULT.md` with:
- the §7 table filled per step, with numbers
- capture URLs for the orchestrator: the 3 test boxes, A 08:50 ride and walk on `st-가천대` if a scenario exists there, otherwise the tour
- what the orchestrator must run
- the final checklist from spec §7 with honest status. The visual comparison with Kakao/Naver maps is done by the orchestrator and the user, by eye only; their images are never used as data.

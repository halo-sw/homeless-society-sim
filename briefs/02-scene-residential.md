# Stage 2 — Residential 3D scene + miniature style (brief for Muse)

You are Muse Spark 1.3 in agent mode in this repository. Read `AGENTS.md`, `briefs/01-RESULT.md`, `docs/area-schema.md` and `docs/building-register-fields.md` first. Sandboxed shell, no network, no installs. Use sub-agents for parallel parts if it helps and record what you delegated. Write all code yourself.

**Product focus (from the user): apartments and residential buildings.** The simulator is about where people live. Everything in this stage should make homes, apartment complexes (단지) and the daily-life places around them readable; other buildings are context.

## Part A — Stage 1 follow-ups (pipeline, Python)

1. **Buffered graph.** Build walk/bike/drive graphs from an extract buffered by 300 m around each scene box, compute connectivity on the buffered graph, then clip to the box keeping edges that intersect it. Report LCC share before/after for every area. Target ≥ 95 % for `pangyo` and `seongsu`; if still below, report the measured value and the reason, do not add fake connectors.
2. **Residential classification** in `area.json`, per building: `residential: "apartment" | "house" | "mixed" | "none"` with `residential_source`. Rules (document them): register use `공동주택` → apartment (also `아파트`, `연립주택`, `다세대주택` names if present), `단독주택` → house; OSM `building=apartments|residential|house|detached|terrace` likewise; `mixed` for 근린생활시설 with residential evidence only if you find a reliable signal, else `none`. Keep `register.use` verbatim.
3. **Complexes (단지).** Group apartment buildings into complexes: same register building-name stem (strip `101동`-style suffix from `A24`/`A25`), or OSM `landuse=residential` polygons with a name, else spatial clustering ≤ 40 m. Output `complexes: [{id, name, name_source, building_ids, centroid, households_hint|null, max_floors}]`. Never invent a complex name; unnamed → `name: null`.
4. **Building register API fill (code only, fixture-tested).** Many Pangyo register records lack height/floors/use (≈ 410 of 601 in the box). Add `pipeline/register_api.py` that, for buildings with `height_source == "inferred"` and a register parcel id (PNU, field `A2`), calls the official 국토교통부 건축HUB 건축물대장 표제부 API:
   - `GET https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo?serviceKey=…&sigunguCd=…&bjdongCd=…&platGbCd=…&bun=…&ji=…&numOfRows=100&pageNo=1&_type=json`
   - PNU (19) = sigunguCd(5) + bjdongCd(5) + land type(1) + bun(4) + ji(4); land type `1` → `platGbCd=0`, `2` → `platGbCd=1`.
   - Expected item fields (verify against the first real response; treat names as unconfirmed): `grndFlrCnt`, `ugrndFlrCnt`, `heit` (m), `mainPurpsCdNm`, `bldNm`, `dongNm`, `useAprDay`, `mgmBldrgstPk`.
   - Key from env `DATA_GO_KR_KEY` only; never print, log or write it. Rate-limit (≤ 5 req/s), retry with backoff, cache raw responses per PNU under `data/raw/register_api/` (public-domain-licensed register data; caching allowed), resumable.
   - Matching a parcel with several buildings: pick by `dongNm` vs register `A25` when possible, else assign only when the parcel has exactly one title record; otherwise leave inferred and count it.
   - New height sources: `api_height`, `api_floors`. `--dry-run` prints the planned request count without network.
   - Tests use recorded fixtures you write by hand from the schema above (mark them synthetic). The orchestrator will run the real fetch outside the sandbox; design the CLI so that is one command: `.venv/bin/python -m pipeline register-fill --area pangyo`.
5. Re-run all builds and `validate`; update `briefs/01-RESULT.md` numbers in a short addendum.

## Part B — 3D scene (web, `web/`)

Installed for you: `web/node_modules` with `three@0.170.0` (incl. `examples/jsm`: BufferGeometryUtils, EffectComposer, passes) and `vite@6.3.5`. Plain JavaScript ES modules, no TypeScript, no other packages. The app must load an area by id, e.g. `/?area=songpa-jamsil` from `data/build/<id>/area.json` (configure Vite to serve that folder; do not copy data into `web/`).

Required modules (pure logic separated from three.js so it can be unit-tested with `node --test`):
- `src/frame.js` — WGS84 ↔ local metres using the origin stored in the area file.
- `src/buildings.js` — footprint → extruded mesh data. Apartments ≥ 6 floors: slab/tower look with horizontal floor banding (one band per floor using `levels`) and a rooftop structure; houses ≤ 3 floors: pitched (gable or hip) roof when the footprint is roughly rectangular; others: flat roof, muted. Merge geometry per material for performance.
- `src/ground.js` — roads as ribbons with width by highway class, crosswalk stripes where footways cross roads, parks/green landuse, water, residential-complex ground plates (lighter paving inside a complex hull).
- `src/trees.js` — decorative ginkgo/zelkova trees along residential streets and inside complexes using instancing; deterministic seed; clearly decorative (never in building footprints).
- `src/palette.js` — style ① "miniature" (reference: warm autumn diorama): paper background ~#FBF7EE, apartments in warm cream/terracotta/brick families with per-complex variation, houses red-brown roofs, non-residential desaturated grey-beige, roads light grey, ginkgo yellow/orange with some green.
- `src/lighting.js` — directional sun with soft shadow map + hemisphere fill; sun position from date/time/lat/lon using a standard solar-position formula (unit-test: Seoul 37.57 N, 2026-06-21 12:30 KST altitude ≈ 76 °, 2026-12-21 12:30 KST ≈ 29 °, tolerance 1.5 °).
- `src/tour.js` — residential walk-through: pick 4–6 stops = apartment complexes (named first) + the daily-life places nearest them (railway station, school, supermarket/convenience, park, clinic/pharmacy) using **real walk-graph shortest paths**. Camera glides along the path (isometric-ish perspective, ~35–45° pitch), eases into each stop for ~3 s, shows a caption card: complex/place name (Korean, bold), category, `lat° N lon° E`, walking time from previous stop in minutes from the graph (1.3 m/s), progress dots. Intro fade, outro slow pull-back.
- `src/walkers.js` — preview only (stage 3 builds the engine): ~30 tiny residents leaving apartment entrances along graph paths at walking speed, seeded.
- UI: area switcher (the four areas), play/pause, a toggle "주거만 강조" (non-residential fades to 30 %), legend: height sources with counts and `residential` counts, and an always-visible attribution line (OSM ODbL, GIS건물통합정보 국토교통부, decorative trees/people note).

Performance: target 60 fps on a mid laptop for `songpa-jamsil`; log draw calls and triangle count to the console once after load.

Tests (`web/tests/*.test.js`, `node --test`): frame round-trip, roof selection by footprint/levels, residential palette assignment, solar altitude cases above, tour stop selection only from real complexes/POIs with graph-path walking times, seeded determinism.

## Output
- `briefs/02-RESULT.md`: what you built, real command outputs (pytest, `node --test`, `vite build`), per-area numbers (LCC before/after, residential counts, complexes found with names), what you delegated, known gaps, and what stage 3 (agent life engine) needs.
- The orchestrator will start `npm run dev` and take browser screenshots outside the sandbox; make sure `vite build` succeeds.

## Rules
- Run every test and build yourself; paste real numbers only.
- Do not modify `data/raw/`. Do not commit.
- Clean-room rule in `AGENTS.md` applies.

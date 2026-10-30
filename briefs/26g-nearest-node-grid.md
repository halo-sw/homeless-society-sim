# Stage 26g — 3D view hangs on the big US area: grid index for nearestNode (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `us-web-26`. Stop when this part is done.

## Found by the orchestrator (headless Chrome CPU profile, `/?area=us-menlo`)
The US area (`us-menlo`, 46,404 graph nodes) takes **116 s** before the first frame. Korean boxes have a few thousand nodes.

Top self time:
- **`nearestNode` in `src/walkgraph.js:12` — 109 s.** It is a linear scan over `Object.entries(graph.nodes)` on every call. `src/motion/pedestrians.js` calls it per pedestrian, station and destination (lines 212, 218, 224, 243); there are 825 pedestrians;
- `nearestNode` in `src/tour.js:62` — 0.7 s (same linear pattern).

## Change
1. **`src/walkgraph.js` `nearestNode(graph, lon, lat)`:** same signature and the same result (the exact nearest by the same squared-degree metric, same tie-break as the linear scan: the first in `Object.entries` order wins on equal distance).
   - Build a grid index lazily, once per `graph.nodes` object, and cache it in a module `WeakMap` keyed by the `nodes` object.
   - Cell size: 0.002° (about 200 m). Store `[id, lon, lat, order]` per cell.
   - **Query:** search rings of cells outward from the query cell. Stop when the best distance found is smaller than the distance to the nearest unsearched ring edge. Fall back to the linear scan when the graph has fewer than 2,000 nodes. Small Korean graphs then keep exactly today's code path.
   - Empty nodes → null, as today.
2. **`src/tour.js:62` `nearestNode(lon, lat, nodes)`:** use the same grid helper. Export the helper from `walkgraph.js`, e.g. `nearestNodeIn(nodes, lon, lat)`, used by both.
3. Grep `src/` for other linear nearest scans over `graph.nodes` / `nodes` outside `src/engine/` (the engine Router has its own). Switch them to the helper only if they run per entity, and list them in your final message.

## Test — `web/tests/nearest-node-26g.test.js`
- **Random graph** (seeded LCG, no Math.random) with 5,000 nodes in a 0.07° × 0.05° box: for 300 random query points, inside and outside the box, the grid result equals a reference linear scan. Copy today's function into the test as the reference.
- **Tie-break:** two nodes at the same distance → the earlier one in insertion order, same as the reference.
- **Speed:** 20,000 nodes and 2,000 queries finish in under 1.5 s (`performance.now()`).
- A graph with 10 nodes uses the linear path and returns the same as before.
- Keep green: `tests/walkgraph-13.test.js`, and every `tests/*pedestrian*` / `tests/*tour*` / `tests/*crowd*` file that exists.

Run only:
```
cd web && node --test tests/nearest-node-26g.test.js tests/walkgraph-13.test.js $(ls tests | grep -E 'pedestrian|tour|crowd' | sed 's#^#tests/#') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
`src/engine/**`, `src/i18n/**`, `pipeline/**`, anything under `data/`.

## Final message
Changed files, one line each, plus the list from step 3. Nothing else.

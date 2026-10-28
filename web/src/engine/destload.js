// Destination-area loading for place commutes (async glue).
//
// The engine needs the destination graph to walk the alighting station
// to the workplace. This helper resolves which built area holds the
// scenario's workplace(s) and loads it; the picking itself is pure
// (workplace.js). IO is injected so the CLIs, the consult server and
// tests share one implementation. Anything missing (no workplace, no
// lister, no file) resolves to null — the engine then records the
// destination walk as 0 with an explicit note, never a guess.

import { bboxContains, destAreaIdFor, scenarioWorkplaceCoords } from "./workplace.js";

// { scenario (parsed or raw), network (region network or null),
//   homeArea (loaded home area, for the same-area shortcut),
//   listAreas: () -> [areaId], readAreaMeta: (id) -> {bbox},
//   loadArea: (id) -> loaded area }
// → loaded destination area, the home area itself (same-area shortcut),
// or null.
export async function loadDestArea({ scenario, network = null, homeArea = null,
    listAreas = null, readAreaMeta = null, loadArea = null } = {}) {
  const coords = scenarioWorkplaceCoords(scenario || {}, network);
  if (coords.length === 0) return null;
  if (homeArea && Array.isArray(homeArea.bbox)
      && coords.some((c) => bboxContains(homeArea.bbox, c.lon, c.lat))) {
    return homeArea;
  }
  if (typeof listAreas !== "function" || typeof readAreaMeta !== "function"
      || typeof loadArea !== "function") {
    return null;
  }
  let ids = [];
  try {
    ids = await listAreas();
  } catch {
    return null;
  }
  const metas = {};
  for (const id of ids || []) {
    try {
      metas[id] = await readAreaMeta(id);
    } catch {
      // Unreadable candidate — skip it, never fail the run.
    }
  }
  const exclude = homeArea && homeArea.area;
  for (const c of coords) {
    const id = destAreaIdFor(c.lon, c.lat, metas, exclude);
    if (!id) continue;
    try {
      return await loadArea(id);
    } catch {
      // Unloadable candidate — try the next workplace.
    }
  }
  return null;
}

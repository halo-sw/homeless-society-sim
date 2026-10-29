// 2D map simulation helpers (13, Part 8). Homes without a built 3D
// box run the same engine and day strip, rendered on a flat map with
// the route drawn on the region walk graph plus the subway line.
// Card badge: "지도 시뮬레이션" (map) vs "3D 가능" (box).
// Pure; tested in mapsim-13.test.js.

export const SIM_BADGE_3D = "3D 가능";
export const SIM_BADGE_MAP = "지도 시뮬레이션";
export const SIM_BADGE_NONE = "시뮬레이션 불가";

export function simKindFor(home) {
  if (home && home.scene) return "3d";
  if (home && home.walkgraph) return "map";
  return "none";
}

export function simBadgeFor(home) {
  const kind = simKindFor(home);
  if (kind === "3d") return SIM_BADGE_3D;
  if (kind === "map") return SIM_BADGE_MAP;
  return SIM_BADGE_NONE;
}

// Coverage report over the home index: {d3, map, none, noneReasons}.
export function simCoverage(homes) {
  const out = { d3: 0, map: 0, none: 0, noneReasons: {} };
  for (const h of homes || []) {
    const kind = simKindFor(h);
    if (kind === "3d") out.d3 += 1;
    else if (kind === "map") out.map += 1;
    else {
      out.none += 1;
      const reason = h.walkgraph_error || "walkgraph-unreachable";
      out.noneReasons[reason] = (out.noneReasons[reason] || 0) + 1;
    }
  }
  return out;
}

// Project a walk-graph route (node id list + node coords) and a subway
// leg list into flat-map polylines for the 2D renderer.
export function mapRoutePolylines({ walkNodes, nodeCoords, subwayLegs, stationCoords }) {
  const walk = (walkNodes || [])
    .map((id) => nodeCoords && nodeCoords[id])
    .filter((c) => Array.isArray(c) && c.length >= 2)
    .map(([lon, lat]) => ({ lon, lat }));
  const subway = [];
  for (const leg of subwayLegs || []) {
    for (const stop of leg.stops || []) {
      const c = stationCoords && stationCoords[stop];
      if (c) subway.push({ lon: c[0], lat: c[1], stop });
    }
  }
  return { walk, subway };
}

// Viewport fit for the flat map: bbox of all route points + home,
// padded. Returns {minLon, minLat, maxLon, maxLat} or null.
export function fitRouteViewport(points, home, padDeg = 0.004) {
  const pts = [...(points || [])];
  if (home && Number.isFinite(home.lon) && Number.isFinite(home.lat)) {
    pts.push({ lon: home.lon, lat: home.lat });
  }
  const lons = pts.map((p) => p.lon).filter(Number.isFinite);
  const lats = pts.map((p) => p.lat).filter(Number.isFinite);
  if (lons.length === 0) return null;
  return {
    minLon: Math.min(...lons) - padDeg,
    minLat: Math.min(...lats) - padDeg,
    maxLon: Math.max(...lons) + padDeg,
    maxLat: Math.max(...lats) + padDeg,
  };
}

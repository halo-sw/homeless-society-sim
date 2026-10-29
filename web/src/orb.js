// Orb data builder (13, Part 7). Pure transform from built data to
// the Seoul/Gyeonggi orb: the 9 regions as shapes, our stations as
// points, candidate homes as dots coloured by tenure fit. Hover facts
// per region: homes count, median 전세 for 60㎡, photos count, public
// rental yes/no. Tested in orb-13.test.js.
//
// Hovering a card highlights its dot (dotKeyFor); clicking a region
// filters the search to that region.

export function dotKeyFor(homeId) {
  return `home:${homeId}`;
}

// tenure fit colour (CSS hex): all = fits budget, partial = mixed,
// none = over budget, unknown = no budget set.
export const FIT_COLORS = {
  all: "#2f9e44",
  partial: "#f08c00",
  none: "#e03131",
  unknown: "#868e96",
};

export function fitColorFor(fit) {
  return FIT_COLORS[fit] || FIT_COLORS.unknown;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export function regionHoverFacts(regionId, { homes, manifest, rentalCoverage }) {
  const list = (homes || []).filter((h) => h.region === regionId);
  const jeonse60 = [];
  for (const h of list) {
    for (const b of h.buckets || []) {
      if (Math.abs((b.center_m2 || 0) - 60) > 10) continue;
      if (b.jeonse && Number.isFinite(b.jeonse.median_won)) {
        jeonse60.push(b.jeonse.median_won);
      }
    }
  }
  let photos = 0;
  if (manifest && Array.isArray(manifest.items) && list.length > 0) {
    // Count = manifest items within any home's 700 m (cheap bbox pass
    // over the region bbox instead of per-home haversine).
    const lons = list.map((h) => h.lon).filter(Number.isFinite);
    const lats = list.map((h) => h.lat).filter(Number.isFinite);
    if (lons.length > 0) {
      const pad = 0.008;
      const box = [Math.min(...lons) - pad, Math.min(...lats) - pad,
        Math.max(...lons) + pad, Math.max(...lats) + pad];
      photos = manifest.items.filter((p) => p.lon >= box[0] && p.lon <= box[2]
        && p.lat >= box[1] && p.lat <= box[3]).length;
    }
  }
  const rentals = rentalCoverage && rentalCoverage[regionId];
  return {
    region: regionId,
    homes: list.length,
    jeonse60MedianWon: median(jeonse60),
    photos,
    publicRental: Boolean(rentals && rentals.present),
  };
}

export function buildOrbData({ regions, stations, homes, candidates, manifest, rentalCoverage }) {
  const regionList = (regions && regions.regions) || regions || [];
  const shapes = regionList.map((r) => ({
    id: r.id,
    label: r.label || r.id,
    bbox: r.bbox || null,
    facts: regionHoverFacts(r.id, { homes, manifest, rentalCoverage }),
  }));
  const points = (stations || []).map((s) => ({
    name: s.name || s.station,
    lon: s.lon,
    lat: s.lat,
  })).filter((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat));
  const found = new Set((candidates || []).map((c) => c.id));
  const dots = (homes || [])
    .filter((h) => Number.isFinite(h.lon) && Number.isFinite(h.lat))
    .map((h) => {
      const cand = (candidates || []).find((c) => c.id === h.id) || null;
      const fit = cand && cand.tenures && cand.tenures[0]
        ? cand.tenures[0].budget_fit : "unknown";
      return {
        key: dotKeyFor(h.id),
        id: h.id,
        region: h.region,
        lon: h.lon,
        lat: h.lat,
        found: found.has(h.id),
        fit,
        color: fitColorFor(fit),
      };
    });
  return { shapes, points, dots };
}

export function litDots(orbData, candidateIds) {
  const want = new Set(candidateIds || []);
  return (orbData.dots || []).filter((d) => want.has(d.id));
}

// ---- 13e2: pure camera-fit + label geometry (no three.js) ----
// Projection shared with ui/orb.jsx: lon/lat to tilted-disc x/z.
export const ORB_PROJECT = { lon0: 127.08, lat0: 37.62, scale: 60 };
export const ORB_DEFAULT_BBOX = [127.0, 37.4, 127.16, 37.55];
export const ORB_FIT_MARGIN = 0.08;

export function projectLonLat(lon, lat) {
  return [(lon - ORB_PROJECT.lon0) * ORB_PROJECT.scale,
    (ORB_PROJECT.lat0 - lat) * ORB_PROJECT.scale];
}

export function shapeProjectedBounds(shape) {
  const b = (shape && shape.bbox) || ORB_DEFAULT_BBOX;
  const [x0, z0] = projectLonLat(b[0], b[3]);
  const [x1, z1] = projectLonLat(b[2], b[1]);
  return {
    x0: Math.min(x0, x1), z0: Math.min(z0, z1),
    x1: Math.max(x0, x1), z1: Math.max(z0, z1),
  };
}

export function shapeCentroid(shape) {
  const r = shapeProjectedBounds(shape);
  return [(r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2];
}

export function labelCentroids(shapes) {
  return (shapes || []).map((s) => {
    const [x, z] = shapeCentroid(s);
    return { id: s.id, label: s.label || s.id, x, z };
  });
}

// Slab extrusion depth: at most 2 % of the map width.
export function slabDepth(mapWidth) {
  return Math.max(mapWidth * 0.02, 0.01);
}

// Fit the camera to the shapes' bounds with ORB_FIT_MARGIN margin,
// centred. Returns the world-space centre, the fitted width/depth
// (margin included) and the distance that frames them at fovDeg.
export function fitOrbView(shapes, aspect = 16 / 9, fovDeg = 42) {
  let bounds = null;
  for (const s of shapes || []) {
    const r = shapeProjectedBounds(s);
    bounds = bounds ? {
      x0: Math.min(bounds.x0, r.x0), z0: Math.min(bounds.z0, r.z0),
      x1: Math.max(bounds.x1, r.x1), z1: Math.max(bounds.z1, r.z1),
    } : { ...r };
  }
  if (!bounds) bounds = shapeProjectedBounds(null);
  const cx = (bounds.x0 + bounds.x1) / 2;
  const cz = (bounds.z0 + bounds.z1) / 2;
  const width = Math.max(bounds.x1 - bounds.x0, 0.4) * (1 + ORB_FIT_MARGIN);
  const depth = Math.max(bounds.z1 - bounds.z0, 0.4) * (1 + ORB_FIT_MARGIN);
  const halfFov = (fovDeg * Math.PI) / 360;
  const fitH = (depth / 2) / Math.tan(halfFov);
  const fitW = (width / 2) / (Math.tan(halfFov) * aspect);
  return { center: [cx, cz], width, depth, distance: Math.max(fitH, fitW) };
}

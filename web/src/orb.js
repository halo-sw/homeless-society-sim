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

// ---- 13e4: fit to the PROJECTED bounds, not the world bounds ----
// The camera looks down the tilted dir (0, 7.5, 9), so a ground-plane
// unit in z compresses to ~0.64 units on screen; fitting the raw
// world depth left ~70 % of the stage empty. Solve for the distance
// (and centre) whose NDC box fills ORB_FIT_FILL of the shorter side.
// Camera basis (three.js lookAt, up +Y): right = +X, up = (0, vz, -vy),
// forward-to-target = -(0, vy, vz). Must match ui/orb.jsx viewDir.
export const ORB_VIEW_DIR = { y: 7.5, z: 9 };
export const ORB_FIT_FILL = 0.84;

function orbCameraTilt() {
  const len = Math.hypot(ORB_VIEW_DIR.y, ORB_VIEW_DIR.z) || 1;
  return { vy: ORB_VIEW_DIR.y / len, vz: ORB_VIEW_DIR.z / len };
}

// All four ground corners of every shape bbox, in world x/z.
export function shapeCorners(shapes) {
  const list = (shapes && shapes.length > 0) ? shapes : [null];
  const corners = [];
  for (const s of list) {
    const b = (s && s.bbox) || ORB_DEFAULT_BBOX;
    const [xa, za] = projectLonLat(b[0], b[3]);
    const [xb, zb] = projectLonLat(b[2], b[1]);
    corners.push([xa, za], [xb, za], [xa, zb], [xb, zb]);
  }
  return corners;
}

function ndcBounds(corners, cx, cz, d, aspect, tanF, vy, vz) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [px, pz] of corners) {
    const dz = pz - cz;
    const depth = Math.max(d - dz * vz, d * 0.1, 1e-3);
    const nx = (px - cx) / (depth * tanF * aspect);
    const ny = (-dz * vy) / (depth * tanF);
    if (nx < x0) x0 = nx;
    if (nx > x1) x1 = nx;
    if (ny < y0) y0 = ny;
    if (ny > y1) y1 = ny;
  }
  return { x0, y0, x1, y1 };
}

// Fill of each axis as a fraction of the shorter container side:
// NDC half-range 1 maps to half of W (resp. H), so scale by side/S.
function fillsFor(box, aspect) {
  const w = aspect, h = 1, s = Math.min(w, h);
  const fillX = ((box.x1 - box.x0) / 2) * (w / s);
  const fillY = ((box.y1 - box.y0) / 2) * (h / s);
  return { fillX, fillY, fill: Math.max(fillX, fillY) };
}

// Fit the camera to the shapes' PROJECTED bounds at the current
// camera angle and container aspect, centred, filling ORB_FIT_FILL
// of the shorter side. Returns the world-space centre, the fitted
// width/depth (margin included, for slab sizing) and the distance.
export function fitOrbView(shapes, aspect = 16 / 9, fovDeg = 42) {
  const corners = shapeCorners(shapes);
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const [px, pz] of corners) {
    if (px < x0) x0 = px;
    if (px > x1) x1 = px;
    if (pz < z0) z0 = pz;
    if (pz > z1) z1 = pz;
  }
  let cx = (x0 + x1) / 2;
  let cz = (z0 + z1) / 2;
  const width = Math.max(x1 - x0, 0.4) * (1 + ORB_FIT_MARGIN);
  const depth = Math.max(z1 - z0, 0.4) * (1 + ORB_FIT_MARGIN);
  const halfFov = (fovDeg * Math.PI) / 360;
  const tanF = Math.tan(halfFov);
  const { vy, vz } = orbCameraTilt();
  // Seed with the old world-space estimate, then iterate in NDC:
  // rescale distance to the target fill, re-centre the NDC box.
  let d = Math.max((depth / 2) / tanF, (width / 2) / (tanF * aspect));
  d = Math.max(d, 0.5);
  for (let i = 0; i < 12; i++) {
    const box = ndcBounds(corners, cx, cz, d, aspect, tanF, vy, vz);
    const { fill } = fillsFor(box, aspect);
    if (!(fill > 1e-9)) break;
    d = Math.min(Math.max((d * fill) / ORB_FIT_FILL, 0.5), 500);
    const ncx = (box.x0 + box.x1) / 2;
    const ncy = (box.y0 + box.y1) / 2;
    cx += ncx * d * tanF * aspect;
    cz -= (ncy * d * tanF) / (vy || 1);
  }
  return { center: [cx, cz], width, depth, distance: d };
}

// Projected (NDC) bounds of the fitted view: centre offset in NDC
// units (half-range 1, so ±0.05 is ±5 %) and per-axis fill as a
// fraction of the shorter container side.
export function projectedOrbBounds(shapes, aspect = 16 / 9, fovDeg = 42) {
  const view = fitOrbView(shapes, aspect, fovDeg);
  const halfFov = (fovDeg * Math.PI) / 360;
  const tanF = Math.tan(halfFov);
  const { vy, vz } = orbCameraTilt();
  const box = ndcBounds(shapeCorners(shapes), view.center[0], view.center[1],
    view.distance, aspect, tanF, vy, vz);
  const { fillX, fillY, fill } = fillsFor(box, aspect);
  return {
    nx0: box.x0, ny0: box.y0, nx1: box.x1, ny1: box.y1,
    centerX: (box.x0 + box.x1) / 2, centerY: (box.y0 + box.y1) / 2,
    fillX, fillY, fill,
  };
}

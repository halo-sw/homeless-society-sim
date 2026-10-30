// Nearby-place photos + own 3D previews for candidate homes (12a, E).
//
// photosNear(lon, lat, {radius: 700, limit: 6}) reads the committed
// manifest scenarios/places/commons-photos.json (freely licensed,
// geotagged Wikimedia Commons photos near the 11 areas — URLs only, no
// image bytes in the repo). It prefers street/park/station/apartment/
// skyline subjects and drops portraits, events, food, interiors and
// logos by category + title keywords. Every photo carries an
// attribution line and a page link; the UI must show
// PHOTOS_DISCLAIMER ("주변 사진 · 이 매물 사진이 아니에요").
//
// sceneThumbnail(boxId, deps) renders the box once offscreen at
// 640×400 (a massing-model preview from our own footprint+height
// data) and caches the data URL in memory, so every candidate with a
// scene has at least our own 3D preview.

export const PHOTOS_RADIUS_M = 700;
export const PHOTOS_LIMIT = 6;
export const PHOTOS_DISCLAIMER = "주변 사진 · 이 매물 사진이 아니에요";
export const THUMB_W = 640;
export const THUMB_H = 400;

const EARTH_R_M = 6371000;

export function haversineM(lon1, lat1, lon2, lat2) {
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dp / 2) ** 2
    + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * EARTH_R_M * Math.asin(Math.sqrt(a));
}

const PREFER_RE = new RegExp([
  "street", "road", "avenue", "alley", "boulevard",
  "park", "garden", "plaza", "square",
  "station", "subway", "metro", "platform",
  "apartment", "housing", "residential",
  "skyline", "cityscape", "panorama", "aerial",
  "building", "tower", "bridge", "river", "stream",
  "school", "library", "market",
  "거리", "가로", "공원", "역", "아파트", "스카이라인", "전경", "풍경",
].join("|"), "i");

const DROP_RE = new RegExp([
  "portrait", "selfie", "\\bface\\b", "people", "person",
  "wedding", "concert", "festival", "ceremony", "event", "protest",
  "demonstration", "press conference",
  "food", "dish", "meal", "cuisine", "restaurant", "cafe", "coffee",
  "interior", "bedroom", "kitchen", "bathroom",
  "logo", "emblem", "poster", "menu", "signage", "advertisement",
  "초상", "인물", "얼굴", "결혼", "공연", "축제", "음식", "요리",
  "실내", "내부", "로고", "간판",
].join("|"), "i");

function photoText(photo) {
  const cats = Array.isArray(photo.categories) ? photo.categories.join(" ") : "";
  return `${photo.title || ""} ${photo.description || ""} ${cats}`;
}

export function photoExcluded(photo) {
  return DROP_RE.test(photoText(photo));
}

export function photoPreferred(photo) {
  return PREFER_RE.test(photoText(photo));
}

export function photoCreditLine(photo) {
  const author = (photo && photo.author) || "작자 미상";
  const licence = (photo && (photo.license || photo.licence)) || "저작권 정보 없음";
  return `사진: ${author}, ${licence}, Wikimedia Commons`;
}

function photoRecord(photo, lon, lat) {
  return {
    title: photo.title || "",
    thumb_url: photo.thumb_url || "",
    page_url: photo.page_url || "",
    author: photo.author || "",
    licence: photo.license || photo.licence || "",
    lat: photo.lat,
    lon: photo.lon,
    distance_m: Math.round(haversineM(lon, lat, photo.lon, photo.lat)),
    credit: photoCreditLine(photo),
  };
}

export function photosNear(lon, lat, manifest, opts = {}) {
  const radius = opts.radius ?? PHOTOS_RADIUS_M;
  const limit = opts.limit ?? PHOTOS_LIMIT;
  const items = (manifest && manifest.items) || [];
  const scored = [];
  for (const photo of items) {
    if (!Number.isFinite(photo.lon) || !Number.isFinite(photo.lat)) continue;
    if (haversineM(lon, lat, photo.lon, photo.lat) > radius) continue;
    if (!photo.thumb_url || !photo.page_url) continue;
    if (photoExcluded(photo)) continue;
    scored.push({ photo, preferred: photoPreferred(photo) });
  }
  scored.sort((a, b) => {
    if (a.preferred !== b.preferred) return a.preferred ? -1 : 1;
    const da = haversineM(lon, lat, a.photo.lon, a.photo.lat);
    const db = haversineM(lon, lat, b.photo.lon, b.photo.lat);
    if (da !== db) return da - db;
    return String(a.photo.title) < String(b.photo.title) ? -1 : 1;
  });
  return scored.slice(0, Math.max(0, limit))
    .map(({ photo }) => photoRecord(photo, lon, lat));
}

// --- own 3D preview ------------------------------------------------------------
// Massing model: one box per footprint (bbox × height_m), an oblique
// camera, a ground plate. Built from our own data only.

const thumbCache = new Map();

export function clearThumbnailCache() {
  thumbCache.clear();
}

// Equirectangular metres around the area origin (mirrors
// pipeline/area_build.py local_xy). Area docs carry footprints in
// EPSG:4326 degrees plus crs.local.origin; the thumbnail works in
// metres so the frame width means something.
const METERS_PER_DEG_LAT = 111320;

function localOrigin(area) {
  const o = area && area.crs && area.crs.local && area.crs.local.origin;
  if (o && Number.isFinite(o.lon) && Number.isFinite(o.lat)) return o;
  return null;
}

function toLocalM(lon, lat, origin) {
  if (!origin) return [lon, lat];
  const kx = METERS_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180);
  return [(lon - origin.lon) * kx, (lat - origin.lat) * METERS_PER_DEG_LAT];
}

function footprintBoxes(area) {
  const origin = localOrigin(area);
  const out = [];
  for (const b of (area && area.buildings) || []) {
    const geom = b && b.geometry;
    if (!geom || !geom.coordinates) continue;
    const polys = geom.type === "Polygon" ? [geom.coordinates]
      : geom.type === "MultiPolygon" ? geom.coordinates : [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const poly of polys) {
      for (const ring of poly) {
        for (const [lon, lat] of ring) {
          const [x, y] = toLocalM(lon, lat, origin);
          if (x < minX) minX = x;
          if (y < minY) minY = y;
          if (x > maxX) maxX = x;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (minX === Infinity) continue;
    out.push({
      cx: (minX + maxX) / 2, cy: (minY + maxY) / 2,
      w: Math.max(maxX - minX, 1e-9), d: Math.max(maxY - minY, 1e-9),
      h: Number.isFinite(b.height_m) && b.height_m > 0 ? b.height_m : 9,
      residential: b.residential || "none",
    });
  }
  return out;
}

// 18d: the card thumbnail frames the HOME's own building and its
// neighbours — centred, ~45°, 150–250 m across, the home outlined —
// never the whole box area (which shrank buildings out of frame).
// home is {lon, lat}. Without a home (or without an origin to project
// it) the spec keeps the old whole-area frame. Returns null when the
// scene has no building near the home — the card shows the MiniMap
// instead of ground plus one tree.
export const THUMB_HOME_MATCH_M = 500;
export const THUMB_VIEW_MIN_M = 150;
export const THUMB_VIEW_MAX_M = 250;

export function thumbnailSceneSpec(area, home = null) {
  // Pure, tested part: boxes + frame derived from the area doc.
  const boxes = footprintBoxes(area);
  if (boxes.length === 0) return null;
  if (home && Number.isFinite(home.lon) && Number.isFinite(home.lat)) {
    const origin = localOrigin(area);
    if (!origin) return null;
    const [hx, hy] = toLocalM(home.lon, home.lat, origin);
    let homeIndex = -1;
    let best = Infinity;
    boxes.forEach((b, i) => {
      const d = Math.hypot(b.cx - hx, b.cy - hy);
      if (d < best) { best = d; homeIndex = i; }
    });
    if (homeIndex < 0 || best > THUMB_HOME_MATCH_M) return null;
    const hb = boxes[homeIndex];
    // The home reads at ~a quarter of the frame (10–40 % either way).
    const viewW = Math.min(THUMB_VIEW_MAX_M,
      Math.max(THUMB_VIEW_MIN_M, Math.max(hb.w, hb.d) * 4));
    const viewH = (viewW * THUMB_H) / THUMB_W;
    return {
      boxes,
      homeIndex,
      frame: { minX: hb.cx - viewW / 2, maxX: hb.cx + viewW / 2,
        minY: hb.cy - viewH / 2, maxY: hb.cy + viewH / 2 },
      width: THUMB_W,
      height: THUMB_H,
    };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.cx - b.w / 2);
    minY = Math.min(minY, b.cy - b.d / 2);
    maxX = Math.max(maxX, b.cx + b.w / 2);
    maxY = Math.max(maxY, b.cy + b.d / 2);
  }
  return {
    boxes,
    homeIndex: null,
    frame: { minX, minY, maxX, maxY },
    width: THUMB_W,
    height: THUMB_H,
  };
}

export async function sceneThumbnail(boxId, deps = {}, home = null) {
  const { loadArea, createRenderer } = deps;
  // The frame depends on the home: cache per home, not per box.
  const key = home && Number.isFinite(home.lon) && Number.isFinite(home.lat)
    ? `${boxId}@${home.lon},${home.lat}` : boxId;
  if (thumbCache.has(key)) return thumbCache.get(key);
  if (typeof loadArea !== "function" || typeof createRenderer !== "function") {
    throw new Error("sceneThumbnail: needs {loadArea, createRenderer}");
  }
  const area = await loadArea(boxId);
  const spec = thumbnailSceneSpec(area, home);
  if (!spec) return null;
  const renderer = await createRenderer(THUMB_W, THUMB_H);
  if (!renderer) return null;
  try {
    const dataUrl = renderMassing(renderer, spec);
    thumbCache.set(key, dataUrl);
    return dataUrl;
  } finally {
    if (renderer && typeof renderer.dispose === "function") renderer.dispose();
  }
}

// The renderer seam: {scene, camera, mesh} are provided by three.js in
// the browser (see createWebGLThumbnailRenderer); tests inject a stub
// with the same {render, domElement, dispose} surface.
export function renderMassing(renderer, spec) {
  if (typeof renderer.buildMassing === "function") {
    // Injected test/browser builder owns the three.js calls.
    return renderer.buildMassing(spec);
  }
  throw new Error("renderMassing: renderer needs buildMassing(spec)");
}

// Browser-side renderer (WebGL offscreen). Returns null outside the DOM.
export function createWebGLThumbnailRenderer(width, height) {
  if (typeof document === "undefined") return null;
  return import("three").then((THREE) => {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(width, height, false);
    return {
      domElement: canvas,
      dispose: () => renderer.dispose(),
      buildMassing: (spec) => {
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0xdfe8ee);
        const { minX, minY, maxX, maxY } = spec.frame;
        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const span = Math.max(maxX - minX, maxY - minY, 1);
        const ground = new THREE.Mesh(
          new THREE.PlaneGeometry(span * 1.2, span * 1.2),
          new THREE.MeshLambertMaterial({ color: 0xd8cdb2 }));
        ground.rotation.x = -Math.PI / 2;
        ground.position.set(cx, 0, -cy);
        scene.add(ground);
        const geo = new THREE.BoxGeometry(1, 1, 1);
        const matA = new THREE.MeshLambertMaterial({ color: 0xd9a878 });
        const matB = new THREE.MeshLambertMaterial({ color: 0xcfc8bb });
        const matHome = new THREE.MeshLambertMaterial({ color: 0xe0b070 });
        const edgeMat = new THREE.LineBasicMaterial({ color: 0xb25a33 });
        spec.boxes.forEach((b, i) => {
          const isHome = spec.homeIndex === i;
          const mesh = new THREE.Mesh(geo,
            isHome ? matHome : (b.residential === "none" ? matB : matA));
          mesh.scale.set(b.w, b.h, b.d);
          mesh.position.set(b.cx, b.h / 2, -b.cy);
          scene.add(mesh);
          if (isHome) {
            const edges = new THREE.LineSegments(
              new THREE.EdgesGeometry(geo), edgeMat);
            edges.scale.set(b.w * 1.04, b.h * 1.04, b.d * 1.04);
            edges.position.copy(mesh.position);
            scene.add(edges);
          }
        });
        const sun = new THREE.DirectionalLight(0xffffff, 1.6);
        sun.position.set(cx + span, span * 1.2, -cy + span * 0.6);
        scene.add(sun);
        scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8a7a, 0.7));
        // 18d: about 45° above the horizon (height ≈ horizontal
        // distance), so the home block and its neighbours read in frame.
        const camera = new THREE.PerspectiveCamera(40, width / height, 1, span * 20);
        camera.position.set(cx + span * 0.62, span * 0.88, -cy + span * 0.62);
        camera.lookAt(cx, 0, -cy);
        renderer.render(scene, camera);
        return canvas.toDataURL("image/png");
      },
    };
  });
}

// Stage 20d: drape live VWorld aerial photos over the ground and roofs.
//
// Client-side. Fetches tiles through the dev-server proxy (/api/aerial,
// which holds the key server-side) and never touches the key or the
// upstream URL — those live only in web/src/aerial/proxy.js (server-only)
// and web/vite.config.js. Tiles are drawn into one canvas, never to disk.
//
// Texture convention: the mosaic canvas has north at row 0 and the
// CanvasTexture uses flipY = false, so uvForLonLat maps directly.
import { TILE_PX, MAX_MOSAIC_PX, tilesForBBox, uvForLonLat, pickZoom } from "./tiles.js";
import { haversineM, xyToLonLat } from "../frame.js";

export const AERIAL_CREDIT = "항공사진 © 국토교통부 공간정보 오픈플랫폼(VWorld)";

function hexCss(hex) {
  return `#${Number(hex).toString(16).padStart(6, "0")}`;
}

function loadBitmap(blob) {
  if (typeof createImageBitmap === "function") return createImageBitmap(blob);
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

// World-space vertex (east = +x, north = -z) -> mosaic uv.
function pushMosaicUVs(geo, origin, range, zoom, onlyUpward = false) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  let uv = geo.attributes.uv;
  if (!uv) {
    uv = new Float32Array(pos.count * 2);
    geo.setAttribute("uv", { array: uv, itemSize: 2 });
  }
  const arr = uv.array || uv;
  const set = typeof uv.setXY === "function"
    ? (i, u, v) => uv.setXY(i, u, v)
    : (i, u, v) => { arr[i * 2] = u; arr[i * 2 + 1] = v; };
  for (let i = 0; i < pos.count; i++) {
    if (onlyUpward && nor && nor.getY(i) <= 0.9) continue;
    const [lon, lat] = xyToLonLat(pos.getX(i), -pos.getZ(i), origin);
    const [u, v] = uvForLonLat(lon, lat, range, zoom);
    set(i, u, v);
  }
  uv.needsUpdate = true;
}

export async function drapeAerial({ THREE, renderer, scene, area, origin,
  terrainMesh = null, groundMesh = null, roadMeshes = [], roofMesh = null,
  look = {}, style = "photo" }) {
  // 1. Key check: without a key the painted ground stays as it is.
  let status = null;
  try {
    const r = await fetch("/api/aerial/status");
    if (!r.ok) return { ok: false, reason: "status" };
    status = await r.json();
  } catch {
    return { ok: false, reason: "status" };
  }
  if (!status || status.hasKey !== true) return { ok: false, reason: "no-key" };

  // 2. Zoom + tile range, capped at 4096 px per side.
  const midLat = (area.bbox[1] + area.bbox[3]) / 2;
  const widthM = haversineM(area.bbox[0], midLat, area.bbox[2], midLat);
  let zoom = pickZoom(widthM);
  let range = tilesForBBox(area.bbox, zoom);
  while (zoom > 6
    && ((range.x1 - range.x0 + 1) * TILE_PX > MAX_MOSAIC_PX
      || (range.y1 - range.y0 + 1) * TILE_PX > MAX_MOSAIC_PX)) {
    zoom -= 1;
    range = tilesForBBox(area.bbox, zoom);
  }
  // 3. Fetch tiles (concurrency 6) into one canvas. Missing tiles keep
  // the painted ground colour underneath.
  const nx = range.x1 - range.x0 + 1;
  const ny = range.y1 - range.y0 + 1;
  const canvas = document.createElement("canvas");
  canvas.width = nx * TILE_PX;
  canvas.height = ny * TILE_PX;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = hexCss(look.terrainBase ?? 0xd2c9a9);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const jobs = [];
  for (let ty = range.y0; ty <= range.y1; ty++) {
    for (let tx = range.x0; tx <= range.x1; tx++) jobs.push([tx, ty]);
  }
  let drawn = 0;
  await Promise.all(Array.from({ length: 6 }, async () => {
    while (jobs.length > 0) {
      const [tx, ty] = jobs.pop();
      try {
        const r = await fetch(`/api/aerial/${zoom}/${ty}/${tx}.jpeg`);
        if (!r.ok) continue;
        const img = await loadBitmap(await r.blob());
        ctx.drawImage(img, (tx - range.x0) * TILE_PX, (ty - range.y0) * TILE_PX);
        drawn += 1;
      } catch {
        // Missing tile: the painted ground colour shows through.
      }
    }
  }));
  let mosaic = canvas;
  if (style === "painted") {
    // Painted grade: the same photo, 10 % less saturation so it sits
    // with the painted buildings.
    const graded = document.createElement("canvas");
    graded.width = canvas.width;
    graded.height = canvas.height;
    const g = graded.getContext("2d");
    g.filter = "saturate(0.9)";
    g.drawImage(canvas, 0, 0);
    mosaic = graded;
  }
  const tex = new THREE.CanvasTexture(mosaic);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.generateMipmaps = true;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  tex.needsUpdate = true;

  // 4. Ground: lon/lat UVs per vertex; the photo replaces the land mask.
  const ground = terrainMesh || groundMesh;
  if (ground) {
    pushMosaicUVs(ground.geometry, origin, range, zoom);
    ground.material.map = tex;
    ground.material.vertexColors = false;
    ground.material.needsUpdate = true;
  }
  // Road ribbons stay readable under the route line at 35 % opacity.
  for (const m of roadMeshes || []) {
    if (!m || !m.material) continue;
    m.material.transparent = true;
    m.material.opacity = 0.35;
    m.material.needsUpdate = true;
  }

  // 5. Roofs: top faces only; walls keep their facades. The roofs are a
  // dedicated mesh, so planar photo UVs replace the metre UVs there.
  if (roofMesh) {
    pushMosaicUVs(roofMesh.geometry, origin, range, zoom, true);
    roofMesh.material.map = tex;
    roofMesh.material.color.setRGB(1, 1, 1);
    roofMesh.material.needsUpdate = true;
  }
  void scene;
  return { ok: true, tiles: drawn, zoom };
}

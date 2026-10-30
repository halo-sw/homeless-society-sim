// Stage 25a: light raster basemap + zoom/pan maths for the candidate map.
// Pure, no DOM — except one env read in basemapApiBase. The tiles come
// from our own proxy (/api/tiles/white/…); no key, no stored geocoder.
import { tileToLonLat, tilesForBBox } from "./aerial/tiles.js";
import { API_BASE, LIVE_API } from "./paths.js";

// Web-Mercator metres per pixel at zoom 0 on the equator.
const WEB_MERC_M_PER_PX_Z0 = 156543.03;
const MIN_Z = 7;
const MAX_Z = 19;

// Where the tile proxy lives: the relay origin (API_BASE) on the
// public site, the same origin's /api/tiles on a dev server, or null
// for a static build with no relay (no basemap). Node (tests) has no
// import.meta.env, which reads as API_BASE "" with LIVE_API true
// (same-origin, harmless without a server).
export function basemapApiBase() {
  if (!LIVE_API) return null;
  return API_BASE;
}

// 26k: contiguous-US bbox (lon/lat). Inside it the chat map uses
// USGS National Map topo tiles directly (no relay, no key); elsewhere
// VWorld.
export const US_BBOX = [-125, 24, -66, 50];

export function isUsLonLat(lon, lat) {
  const x = Number(lon);
  const y = Number(lat);
  return Number.isFinite(x) && Number.isFinite(y)
    && x >= US_BBOX[0] && x <= US_BBOX[2] && y >= US_BBOX[1] && y <= US_BBOX[3];
}

export function basemapProvider(lon, lat) {
  return isUsLonLat(lon, lat) ? "usgs" : "vworld";
}

export function basemapTileUrl(apiBase, z, y, x, { provider = "vworld" } = {}) {
  if (provider === "usgs") {
    return `https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer/tile/${z}/${y}/${x}`;
  }
  return `${apiBase}/api/tiles/white/${z}/${y}/${x}.png`;
}

// The integer z whose Web-Mercator m/px is closest to metersPerPx in
// log2, clamped to 7–19.
export function pickBasemapZoom(metersPerPx, lat) {
  const mpp = Number(metersPerPx);
  if (!Number.isFinite(mpp) || mpp <= 0) return MAX_Z;
  const cos = Math.cos((Number(lat) * Math.PI) / 180) || 1e-9;
  const z = Math.round(Math.log2((WEB_MERC_M_PER_PX_Z0 * cos) / mpp));
  return Math.min(MAX_Z, Math.max(MIN_Z, z));
}

// The tiles covering the visible stage [0, 0, W, H]. toLonLat is the
// inverse of the current toXY. Steps z down while the cover would
// need more than maxTiles tiles.
export function basemapTiles({ toLonLat, W, H, lat, metersPerPx, maxTiles = 80 }) {
  const w = Math.max(1, Number(W) || 1);
  const h = Math.max(1, Number(H) || 1);
  const corners = [toLonLat(0, 0), toLonLat(w, 0), toLonLat(0, h), toLonLat(w, h)];
  const lons = corners.map((c) => c[0]);
  const lats = corners.map((c) => c[1]);
  const bbox = [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
  let z = pickBasemapZoom(metersPerPx, lat);
  let range = tilesForBBox(bbox, z);
  while ((range.x1 - range.x0 + 1) * (range.y1 - range.y0 + 1) > maxTiles && z > MIN_Z) {
    z -= 1;
    range = tilesForBBox(bbox, z);
  }
  const out = [];
  for (let x = range.x0; x <= range.x1; x++) {
    for (let y = range.y0; y <= range.y1; y++) {
      out.push({
        key: `${z}/${y}/${x}`,
        z, x, y,
        nw: tileToLonLat(x, y, z),
        se: tileToLonLat(x + 1, y + 1, z),
      });
    }
  }
  return out;
}

// Screen-space zoom/pan around (cx, cy): apply maps stage px to
// screen px, invert maps back.
export function viewTransform({ zoom, panX, panY, cx, cy }) {
  const z = Number(zoom) || 1;
  return {
    apply: ([x, y]) => [cx + (x - cx) * z + panX, cy + (y - cy) * z + panY],
    invert: ([x, y]) => [(x - panX - cx) / z + cx, (y - panY - cy) / z + cy],
  };
}

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 12;

// Zoom by factor around the stage point (px, py): the point under the
// cursor stays fixed on screen. Zoom clamps to 0.6–12.
export function zoomAt(state, factor, px, py, cx, cy) {
  const z0 = Number(state && state.zoom) || 1;
  const z1 = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z0 * Number(factor)));
  const x0 = Number(state && state.panX) || 0;
  const y0 = Number(state && state.panY) || 0;
  return {
    zoom: z1,
    panX: x0 + (px - cx) * (z0 - z1),
    panY: y0 + (py - cy) * (z0 - z1),
  };
}

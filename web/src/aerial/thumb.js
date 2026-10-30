// Stage 26n: pure thumbnail maths for the live aerial crop behind each
// candidate row/card. No network, no key, no DOM — safe to unit-test.
// The home point sits exactly at the window centre; tiles are drawn at
// tilePx CSS px (128 draws z18 tiles at half size, sharp on retina).
import { lonLatToTile } from "./tiles.js";
import { isUsLonLat } from "../basemap.js";
import { usgsTileUrl } from "./drape.js";

export const AERIAL_THUMB_Z = 18;
export const AERIAL_THUMB_TILE_PX = 128;

// USGS imagery tiles stop at z16 in this area (checked 2026-10-31:
// 200 at z16, 404 at z17/z18), so US thumbs draw z16 tiles at 1.5x
// (~120 m across in a 96 px thumb). Korea stays at z18.
export function aerialThumbZoom(lon, lat) {
  if (isUsLonLat(lon, lat)) return { z: 16, tilePx: 384 };
  return { z: 18, tilePx: 128 };
}

// Fractional global pixels at zoom z -> the tiles intersecting the
// [gx0, gx0 + widthPx] x [gy0, gy0 + heightPx] window centred on the
// home. left/top are CSS offsets of each tile inside the window.
export function aerialThumbTiles({ lon, lat, z = AERIAL_THUMB_Z,
  widthPx = 96, heightPx = 96, tilePx = AERIAL_THUMB_TILE_PX }) {
  const t = lonLatToTile(Number(lon), Number(lat), z);
  const size = Number(tilePx) > 0 ? Number(tilePx) : AERIAL_THUMB_TILE_PX;
  const w = Math.max(1, Number(widthPx) || 96);
  const h = Math.max(1, Number(heightPx) || 96);
  const gx = t.x * size;
  const gy = t.y * size;
  const gx0 = gx - w / 2;
  const gy0 = gy - h / 2;
  const x0 = Math.floor(gx0 / size);
  const x1 = Math.ceil((gx0 + w) / size) - 1;
  const y0 = Math.floor(gy0 / size);
  const y1 = Math.ceil((gy0 + h) / size) - 1;
  const tiles = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      tiles.push({ z, x, y, left: x * size - gx0, top: y * size - gy0 });
    }
  }
  return { z, tiles, size };
}

// Tile image URL for one aerialThumbTiles entry. The US fetches USGS
// directly (no relay, no key); Korea goes through the relay route in
// src/aerial/proxy.js (the key stays server-side, no-store). Korea
// with apiBase === null (static build, no relay) has no URL.
export function aerialThumbUrl(apiBase, lon, lat, { z, y, x }) {
  if (isUsLonLat(lon, lat)) return usgsTileUrl(z, y, x);
  if (apiBase === null || apiBase === undefined) return null;
  return `${String(apiBase).replace(/\/+$/, "")}/api/tiles/Satellite/${z}/${y}/${x}.jpeg`;
}

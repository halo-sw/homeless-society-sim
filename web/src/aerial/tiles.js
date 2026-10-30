// Stage 20d: pure Web-Mercator tile maths for the VWorld aerial drape.
// No three.js, no network, no key — safe to unit-test and to bundle.
export const TILE_PX = 256;
export const MAX_MOSAIC_PX = 4096;

// WGS84 lon/lat -> fractional tile coordinates at zoom z.
export function lonLatToTile(lon, lat, z) {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const rad = (clamped * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return { x, y };
}

// Inverse: fractional tile coordinates -> [lon, lat] (upper-left origin,
// the same convention lonLatToTile uses).
export function tileToLonLat(x, y, z) {
  const n = 2 ** z;
  const lon = (x / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return [lon, lat];
}

// Integer tile range covering [w, s, e, n] (inclusive on both axes).
export function tilesForBBox(bbox, z) {
  const [w, s, e, n] = bbox;
  const a = lonLatToTile(w, s, z);
  const b = lonLatToTile(e, n, z);
  return {
    x0: Math.floor(Math.min(a.x, b.x)),
    x1: Math.floor(Math.max(a.x, b.x)),
    y0: Math.floor(Math.min(a.y, b.y)),
    y1: Math.floor(Math.max(a.y, b.y)),
    z,
  };
}

// Lon/lat -> [u, v] in 0..1 over the stitched mosaic described by range.
// v = 0 is the north edge; the mosaic canvas is drawn with flipY off,
// so canvas row 0 (north) matches v = 0 directly.
export function uvForLonLat(lon, lat, range, z) {
  const { x, y } = lonLatToTile(lon, lat, z);
  const w = range.x1 - range.x0 + 1;
  const h = range.y1 - range.y0 + 1;
  return [(x - range.x0) / w, (y - range.y0) / h];
}

// Zoom from the area width in metres: z18 at or under 1.5 km, z17 up to
// 4 km, else z16. drapeAerial steps down further when the mosaic would
// exceed MAX_MOSAIC_PX per side.
export function pickZoom(bboxWidthM) {
  if (bboxWidthM <= 1500) return 18;
  if (bboxWidthM <= 4000) return 17;
  return 16;
}

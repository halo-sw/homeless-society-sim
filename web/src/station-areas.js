// Station -> built-area lookup for the journey view (pure, no three.js).
//
// Stage-8 follow mode crashed every sim URL here: areaForStation and
// destDetailLoaded in main.js destructured bboxToXY() — which returns
// {minX, minY, maxX, maxY} — as an array. The containment math lives in
// this tested module now; main.js only fetches/caches the bboxes.
import { bboxToXY, lonLatToXY } from "./frame.js";

// [minlon, minlat, maxlon, maxlat] contains (lon, lat)?
export function bboxContains(bbox, lon, lat, origin) {
  const { minX, minY, maxX, maxY } = bboxToXY(bbox, origin);
  const [x, y] = lonLatToXY(lon, lat, origin);
  return x >= minX && x <= maxX && y >= minY && y <= maxY;
}

// Smallest built area containing the station (songpa contains jamsil —
// the smallest wins). entries: iterable of [areaId, bbox]; falsy bboxes
// are skipped. null → corridor level + note.
export function pickStationArea(lon, lat, entries, origin) {
  let best = null;
  let bestSize = Infinity;
  for (const [id, bbox] of entries) {
    if (!bbox) continue;
    const { minX, minY, maxX, maxY } = bboxToXY(bbox, origin);
    const [x, y] = lonLatToXY(lon, lat, origin);
    if (x < minX || x > maxX || y < minY || y > maxY) continue;
    const size = (maxX - minX) * (maxY - minY);
    if (size < bestSize) {
      bestSize = size;
      best = id;
    }
  }
  return best;
}

// The dest station's detailed scene is loaded (the dest bbox is among
// the loaded ones). bboxes: iterable of bbox arrays; falsy skipped.
export function destInLoadedAreas(destLonLat, bboxes, origin) {
  if (!destLonLat) return false;
  for (const bbox of bboxes) {
    if (!bbox) continue;
    if (bboxContains(bbox, destLonLat[0], destLonLat[1], origin)) return true;
  }
  return false;
}

// WGS84 <-> local metres frame (pure, no three.js).
//
// Matches pipeline/area_build.py: equirectangular projection around the
// stored origin (crs.local.origin):
//   x = (lon - lon0) * 111320 * cos(lat0)   (east, metres)
//   y = (lat - lat0) * 111320                (north, metres)
//
// Three.js mapping used by main.js: world.x = x, world.z = -y
// (north is -z, the three.js "into the screen" convention).

export const METERS_PER_DEG_LAT = 111320.0;

export function lonLatToXY(lon, lat, origin) {
  const kx = METERS_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180);
  return [(lon - origin.lon) * kx, (lat - origin.lat) * METERS_PER_DEG_LAT];
}

export function xyToLonLat(x, y, origin) {
  const kx = METERS_PER_DEG_LAT * Math.cos((origin.lat * Math.PI) / 180);
  return [origin.lon + x / kx, origin.lat + y / METERS_PER_DEG_LAT];
}

// Three.js world position (y-up): east -> +x, north -> -z.
export function lonLatToWorld(lon, lat, origin, height = 0) {
  const [x, y] = lonLatToXY(lon, lat, origin);
  return [x, height, -y];
}

export function haversineM(lon1, lat1, lon2, lat2) {
  const R = 6371000;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const dp = ((lat2 - lat1) * Math.PI) / 180;
  const dl = ((lon2 - lon1) * Math.PI) / 180;
  const h =
    Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// [minlon, minlat, maxlon, maxlat] -> {minX, minY, maxX, maxY} in metres.
export function bboxToXY(bbox, origin) {
  const [x0, y0] = lonLatToXY(bbox[0], bbox[1], origin);
  const [x1, y1] = lonLatToXY(bbox[2], bbox[3], origin);
  return { minX: Math.min(x0, x1), minY: Math.min(y0, y1),
           maxX: Math.max(x0, x1), maxY: Math.max(y0, y1) };
}

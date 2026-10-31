// Stage 32c: street-level photos from Mapillary through our relay.
//
// Pure logic + a small request handler. The client token is NEVER read
// here — the caller (relay/handler.js, web/vite.config.js) passes it in
// via getToken(), so this file must not mention the token env name.
// The token travels in the upstream Authorization header only: never
// logged, never echoed in an error, never sent to the browser.
//
// Flow per request: validate lon/lat (finite, inside KR or US) → token
// present? → rate limit (60 / 10 min per client) → cache (rounded
// lon/lat, 10 min, 500 entries) → Mapillary ±0.0005° box (limit 20),
// then one ±0.0015° box (limit 30) → pick (drop panos, prefer a camera
// facing the home, then newest, then nearest). Each upstream call has
// its own timeout and the whole lookup is capped; any failure answers
// { photo: null, reason: "none" }. Nothing is written to disk and image
// bytes are never proxied — the browser loads thumb_1024_url directly
// from Mapillary's CDN.
import { US_BBOX } from "../web/src/basemap.js";

const GRAPH_URL = "https://graph.mapillary.com/images";
const FIELDS = "id,captured_at,compass_angle,thumb_1024_url,creator,computed_geometry,is_pano";
// Korea coverage for our homes (generous country box, not a claim).
const KR_BBOX = [124, 33, 132, 44];
const SMALL_HALF = 0.0005; // ≈ 55 m
const BIG_HALF = 0.0015;
const SMALL_LIMIT = 20;
const BIG_LIMIT = 30;
const DEFAULT_PER_TRY_MS = 6000;
const DEFAULT_TOTAL_MS = 9000;
const CACHE_TTL_MS = 600000; // 10 min
const CACHE_MAX = 500;
const RATE_WINDOW_MS = 600000; // 10 min
const RATE_MAX = 60;
const FACING_DEG = 60;

export function inStreetBounds(lon, lat) {
  const x = Number(lon);
  const y = Number(lat);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  const inside = (box) => x >= box[0] && x <= box[2] && y >= box[1] && y <= box[3];
  return inside(KR_BBOX) || inside(US_BBOX);
}

export function streetCacheKey(lon, lat) {
  return `${Number(lon).toFixed(5)},${Number(lat).toFixed(5)}`;
}

// Bearing from (lat1, lon1) to (lat2, lon2), degrees 0–360.
function bearingDeg(lat1, lon1, lat2, lon2) {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const p1 = (lat1 * Math.PI) / 180;
  const p2 = (lat2 * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(p2);
  const x = Math.cos(p1) * Math.sin(p2)
    - Math.sin(p1) * Math.cos(p2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function angDiff(a, b) {
  return Math.abs((((a - b + 540) % 360) - 180));
}

function imageLonLat(image) {
  const g = image && image.computed_geometry;
  const c = g && Array.isArray(g.coordinates) ? g.coordinates : null;
  if (!c || !Number.isFinite(Number(c[0])) || !Number.isFinite(Number(c[1]))) return null;
  return { lon: Number(c[0]), lat: Number(c[1]) };
}

// 32c pick: drop panoramas (and images without a thumbnail or a
// position); prefer cameras facing the home; then newest captured_at;
// then nearest. Returns the raw upstream image or null.
export function pickStreetImage(images, home) {
  const list = Array.isArray(images) ? images : [];
  const usable = [];
  for (const im of list) {
    if (!im || im.is_pano || !im.thumb_1024_url) continue;
    const pos = imageLonLat(im);
    if (!pos) continue;
    const compass = Number(im.compass_angle);
    const at = Number(im.captured_at);
    const dist = Math.hypot(pos.lon - home.lon, pos.lat - home.lat);
    let facing = false;
    if (Number.isFinite(compass)) {
      facing = angDiff(bearingDeg(pos.lat, pos.lon, home.lat, home.lon), compass) <= FACING_DEG;
    }
    usable.push({ im, pos, at: Number.isFinite(at) ? at : 0, dist, facing });
  }
  if (usable.length === 0) return null;
  const pool = usable.some((u) => u.facing) ? usable.filter((u) => u.facing) : usable;
  pool.sort((a, b) => (b.at - a.at) || (a.dist - b.dist));
  return pool[0].im;
}

export function streetPhotoFrom(image) {
  const pos = imageLonLat(image);
  const creator = (image.creator && image.creator.username) || "Mapillary contributor";
  const year = Number.isFinite(Number(image.captured_at))
    ? new Date(Number(image.captured_at)).getUTCFullYear() : null;
  return {
    id: String(image.id),
    thumb_url: image.thumb_1024_url,
    captured_year: year,
    creator,
    page_url: `https://www.mapillary.com/app/?pKey=${encodeURIComponent(String(image.id))}`,
    lon: pos.lon,
    lat: pos.lat,
    compass: Number.isFinite(Number(image.compass_angle)) ? Number(image.compass_angle) : null,
  };
}

function defaultClientOf(req) {
  const h = (req && req.headers) || {};
  const fwd = h["x-forwarded-for"] || h["X-Forwarded-For"];
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0].trim() || "?";
  }
  const sock = req && req.socket && req.socket.remoteAddress;
  return sock || "?";
}

export function createStreetHandler({ getToken = () => null, fetchImpl = fetch,
  now = () => Date.now(), perTryMs = DEFAULT_PER_TRY_MS,
  totalMs = DEFAULT_TOTAL_MS } = {}) {
  const cache = new Map(); // key -> { expires, body }
  const buckets = new Map(); // client -> [t]

  function overLimit(client, t) {
    let hits = buckets.get(client);
    if (!hits) {
      hits = [];
      buckets.set(client, hits);
    }
    while (hits.length > 0 && hits[0] <= t - RATE_WINDOW_MS) hits.shift();
    if (hits.length >= RATE_MAX) {
      return Math.max(1, Math.ceil((hits[0] + RATE_WINDOW_MS - t) / 1000));
    }
    hits.push(t);
    return 0;
  }

  // One upstream call with its own timeout. A hanging fetchImpl (one
  // that ignores the abort signal) still loses the race, so callers
  // always settle within ms.
  function getJson(url, token, ms) {
    const ctrl = new AbortController();
    let timer = null;
    const attempt = fetchImpl(url,
      { headers: { Authorization: `OAuth ${token}` }, signal: ctrl.signal })
      .then(async (res) => {
        if (!res || !res.ok) throw new Error("upstream");
        return res.json();
      });
    attempt.catch(() => {});
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        try {
          ctrl.abort();
        } catch {
          // ignore — the race below still settles
        }
        reject(new Error("timeout"));
      }, Math.max(1, ms));
    });
    return Promise.race([attempt, timeout]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  function boxUrl(lon, lat, half, limit) {
    const bbox = `${lon - half},${lat - half},${lon + half},${lat + half}`;
    return `${GRAPH_URL}?fields=${FIELDS}&bbox=${bbox}&limit=${limit}`;
  }

  async function lookup(lon, lat, token) {
    const start = now();
    const boxes = [[SMALL_HALF, SMALL_LIMIT], [BIG_HALF, BIG_LIMIT]];
    for (const [half, limit] of boxes) {
      const remain = Math.min(perTryMs, totalMs - (now() - start));
      if (remain <= 0) throw new Error("timeout");
      let items = null;
      try {
        const json = await getJson(boxUrl(lon, lat, half, limit), token, remain);
        items = (json && json.data) || [];
      } catch {
        items = null; // this box failed — the bigger box may still work
      }
      if (items) {
        const picked = pickStreetImage(items, { lon, lat });
        if (picked) return streetPhotoFrom(picked);
      }
    }
    return null;
  }

  function cacheGet(key, t) {
    const hit = cache.get(key);
    if (!hit) return null;
    if (hit.expires <= t) {
      cache.delete(key);
      return null;
    }
    return hit.body;
  }

  function cacheSet(key, body, t) {
    if (cache.size >= CACHE_MAX) {
      const first = cache.keys().next().value;
      if (first !== undefined) cache.delete(first);
    }
    cache.set(key, { expires: t + CACHE_TTL_MS, body });
  }

  return async (req, res) => {
    const t = now();
    let lon = NaN;
    let lat = NaN;
    try {
      const u = new URL(String((req && req.url) || ""), "http://street.local");
      lon = Number(u.searchParams.get("lon"));
      lat = Number(u.searchParams.get("lat"));
    } catch {
      lon = NaN;
      lat = NaN;
    }
    const send = (code, obj, cacheable) => {
      res.statusCode = code;
      res.setHeader("Content-Type", "application/json");
      if (cacheable) res.setHeader("Cache-Control", "private, max-age=600");
      res.end(JSON.stringify(obj));
    };
    if (!inStreetBounds(lon, lat)) {
      send(400, { photo: null, reason: "bad_request" }, false);
      return;
    }
    let token = null;
    try {
      token = getToken() || null;
    } catch {
      token = null;
    }
    // No token on this server: street photos are off, not an error.
    if (!token) {
      send(200, { photo: null, reason: "off" }, true);
      return;
    }
    const wait = overLimit(defaultClientOf(req), t);
    if (wait > 0) {
      res.statusCode = 429;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Retry-After", String(wait));
      res.end(JSON.stringify({ photo: null, reason: "limited" }));
      return;
    }
    const key = streetCacheKey(lon, lat);
    const hit = cacheGet(key, t);
    if (hit) {
      send(200, hit, true);
      return;
    }
    let photo = null;
    try {
      photo = await lookup(lon, lat, token);
    } catch {
      photo = null;
    }
    const body = photo ? { photo } : { photo: null, reason: "none" };
    cacheSet(key, body, t);
    send(200, body, true);
  };
}

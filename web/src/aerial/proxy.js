// Stage 20d: pure helpers for the dev-server aerial tile proxy (VWorld).
// SERVER-ONLY. Never import this module from the client bundle: it builds
// the upstream URL that carries the secret key. Only web/vite.config.js
// (the dev-server middleware, which reads process.env.VWORLD_KEY) and
// relay/handler.js (the public relay, which reads its own env) use it.
export function parseAerialPath(url) {
  const path = String(url || "").split("?")[0];
  const m = /^\/api\/aerial\/(\d+)\/(\d+)\/(\d+)\.jpeg$/.exec(path);
  if (!m) return null;
  const z = Number(m[1]);
  const y = Number(m[2]);
  const x = Number(m[3]);
  if (!Number.isInteger(z) || !Number.isInteger(y) || !Number.isInteger(x)) return null;
  if (z < 6 || z > 19) return null;
  return { z, y, x };
}

// The key travels in the upstream path only, server-side. Never logged,
// never sent to the browser.
export function upstreamUrl(key, z, y, x) {
  return `https://api.vworld.kr/req/wmts/1.0.0/${key}/Satellite/${z}/${y}/${x}.jpeg`;
}

// Stage 23a: the relay serves three VWorld layers. The extension is fixed
// per layer so a bad path never reaches upstream.
export const TILE_LAYERS = { Satellite: "jpeg", white: "png", Base: "png" };

// Accepts /api/tiles/{layer}/{z}/{y}/{x}.{ext} (ext must match the layer)
// and the old /api/aerial/{z}/{y}/{x}.jpeg (layer Satellite).
// Returns { layer, ext, z, y, x } or null.
export function parseTilePath(path) {
  const clean = String(path || "").split("?")[0];
  const m = /^\/api\/tiles\/([A-Za-z]+)\/(\d+)\/(\d+)\/(\d+)\.([A-Za-z]+)$/.exec(clean);
  let layer;
  let ext;
  let z;
  let y;
  let x;
  if (m) {
    layer = m[1];
    z = Number(m[2]);
    y = Number(m[3]);
    x = Number(m[4]);
    ext = m[5];
    if (!(layer in TILE_LAYERS) || TILE_LAYERS[layer] !== ext) return null;
  } else {
    const old = parseAerialPath(clean);
    if (!old) return null;
    ({ z, y, x } = old);
    layer = "Satellite";
    ext = "jpeg";
  }
  if (!Number.isInteger(z) || !Number.isInteger(y) || !Number.isInteger(x)) return null;
  if (z < 6 || z > 19) return null;
  const n = 2 ** z;
  if (x < 0 || y < 0 || x >= n || y >= n) return null;
  return { layer, ext, z, y, x };
}

// [lon, lat] of the tile centre (inverse Web Mercator).
export function tileCenterLonLat(z, y, x) {
  const n = 2 ** z;
  const lon = ((x + 0.5) / n) * 360 - 180;
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / n))) * 180) / Math.PI;
  return [lon, lat];
}

// Simulated-area box [w, s, e, n]. Tiles are clipped to it so the relay
// cannot be used as an open tile proxy.
export const TILE_BOUNDS = [126.6, 37.2, 127.4, 37.75];

export function tileInBounds(z, y, x) {
  if (z < 11) return true; // a low-zoom tile is bigger than the box
  const [lon, lat] = tileCenterLonLat(z, y, x);
  const [w, s, e, n] = TILE_BOUNDS;
  return lon >= w && lon <= e && lat >= s && lat <= n;
}

export function upstreamTileUrl(key, layer, z, y, x) {
  const ext = TILE_LAYERS[layer] || "jpeg";
  return `https://api.vworld.kr/req/wmts/1.0.0/${key}/${layer}/${z}/${y}/${x}.${ext}`;
}

// The one tile handler both the dev server and the relay use.
// res is a Node ServerResponse (statusCode, setHeader, end).
export async function serveTile({ path, env, fetchImpl = fetch, res }) {
  const clean = String(path || "").split("?")[0];
  if (clean === "/api/aerial/status" || clean === "/api/tiles/status") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ hasKey: Boolean(env && env.VWORLD_KEY) }));
    return;
  }
  const tile = parseTilePath(clean);
  if (!tile) {
    res.statusCode = 400;
    res.end("bad tile");
    return;
  }
  if (!tileInBounds(tile.z, tile.y, tile.x)) {
    res.statusCode = 403;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "out_of_area" }));
    return;
  }
  const key = env && env.VWORLD_KEY;
  if (!key) {
    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ missing: "VWORLD_KEY" }));
    return;
  }
  const url = upstreamTileUrl(key, tile.layer, tile.z, tile.y, tile.x);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const up = await fetchImpl(url, { signal: ctl.signal });
    if (!up.ok) throw new Error(`upstream ${up.status}`);
    const buf = Buffer.from(await up.arrayBuffer());
    res.statusCode = 200;
    res.setHeader("Content-Type", tile.ext === "png" ? "image/png" : "image/jpeg");
    res.setHeader("Cache-Control", "no-store");
    res.end(buf);
  } catch {
    // Never echo the upstream URL or the key.
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "upstream" }));
  } finally {
    clearTimeout(timer);
  }
}

// Stage 20d: pure helpers for the dev-server aerial tile proxy (VWorld).
// SERVER-ONLY. Never import this module from the client bundle: it builds
// the upstream URL that carries the secret key. Only web/vite.config.js
// (the dev-server middleware, which reads process.env.VWORLD_KEY) uses it.
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

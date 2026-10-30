// Stage 20d: VWorld aerial drape — tile maths, path parsing, proxy
// behaviour and key safety. No network: upstream fetch is stubbed.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAerialPath, upstreamUrl } from "../src/aerial/proxy.js";
import { lonLatToTile, tileToLonLat, tilesForBBox, uvForLonLat, pickZoom } from "../src/aerial/tiles.js";
import config from "../vite.config.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");

describe("parseAerialPath", () => {
  it("parses a valid tile path", () => {
    assert.deepEqual(parseAerialPath("/api/aerial/17/50510/111797.jpeg"),
      { z: 17, y: 50510, x: 111797 });
  });
  it("rejects an out-of-range zoom", () => {
    assert.equal(parseAerialPath("/api/aerial/25/1/1.jpeg"), null);
  });
  it("rejects traversal", () => {
    assert.equal(parseAerialPath("/api/aerial/../x"), null);
  });
});

describe("tile maths", () => {
  it("lonLatToTile matches the standard formula, centre round-trips", () => {
    const z = 17;
    const t = lonLatToTile(127.1115, 37.3947, z);
    const expectX = ((127.1115 + 180) / 360) * 2 ** z;
    assert.ok(Math.abs(t.x - expectX) < 1e-9, `x=${t.x} expected=${expectX}`);
    const cx = Math.floor(t.x) + 0.5;
    const cy = Math.floor(t.y) + 0.5;
    const [lon, lat] = tileToLonLat(cx, cy, z);
    const back = lonLatToTile(lon, lat, z);
    assert.ok(Math.abs(back.x - cx) < 1e-6, `round-trip x drift ${Math.abs(back.x - cx)}`);
    assert.ok(Math.abs(back.y - cy) < 1e-6, `round-trip y drift ${Math.abs(back.y - cy)}`);
  });
  it("uvForLonLat maps bbox corners to (0,0)/(1,1) within one tile margin", () => {
    const bbox = [127.09, 37.38, 127.13, 37.41];
    const z = 17;
    const range = tilesForBBox(bbox, z);
    const nx = range.x1 - range.x0 + 1;
    const ny = range.y1 - range.y0 + 1;
    const [u0, v0] = uvForLonLat(bbox[0], bbox[1], range, z);
    const [u1, v1] = uvForLonLat(bbox[2], bbox[3], range, z);
    assert.ok(u0 >= 0 && u0 <= 1 / nx + 1e-9, `u0=${u0}`);
    assert.ok(v0 >= 1 - 1 / ny - 1e-9 && v0 <= 1, `v0=${v0}`);
    assert.ok(u1 >= 1 - 1 / nx - 1e-9 && u1 <= 1, `u1=${u1}`);
    assert.ok(v1 >= 0 && v1 <= 1 / ny + 1e-9, `v1=${v1}`);
  });
  it("pickZoom follows the width bands", () => {
    assert.equal(pickZoom(1200), 18);
    assert.equal(pickZoom(3000), 17);
    assert.equal(pickZoom(5000), 16);
  });
});

describe("key safety", () => {
  function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else out.push(p);
    }
    return out;
  }
  it("no client file carries the upstream host except proxy.js", () => {
    const hits = walk(SRC).filter((p) => readFileSync(p, "utf8").includes("api.vworld.kr"));
    assert.deepEqual(hits, [join(SRC, "aerial", "proxy.js")]);
  });
  it("the client bundle never imports proxy.js", () => {
    const checked = [join(SRC, "main.js"), join(SRC, "aerial", "drape.js"),
      ...walk(join(SRC, "ui")).filter((p) => p.endsWith(".jsx"))];
    assert.ok(checked.length > 0);
    for (const p of checked) {
      assert.ok(!/from\s+["'][^"']*aerial\/proxy\.js["']/.test(readFileSync(p, "utf8")),
        `${p} imports the server-only proxy module`);
    }
  });
  it("upstreamUrl puts the key only in the path", () => {
    const url = upstreamUrl("K", 1, 2, 3);
    assert.ok(url.includes("/K/"), url);
    assert.ok(!/[?&]/.test(url), url);
  });
});

function aerialHandler() {
  const routes = new Map();
  for (const plugin of config.plugins) {
    if (plugin && plugin.name === "aerial-api"
      && typeof plugin.configureServer === "function") {
      plugin.configureServer({ middlewares: { use: (p, h) => routes.set(p, h) } });
    }
  }
  const hit = routes.get("/api/aerial");
  assert.ok(hit, "aerial-api route registered");
  return hit;
}

function mockRes() {
  let resolve;
  const done = new Promise((r) => { resolve = r; });
  const res = {
    statusCode: 200,
    headers: {},
    chunks: [],
    setHeader(k, v) { res.headers[k.toLowerCase()] = v; },
    end(chunk) {
      if (chunk !== undefined) res.chunks.push(Buffer.from(chunk));
      resolve(res);
    },
  };
  return { res, done };
}

async function callAerial(url, { key = undefined, fetchStub = undefined } = {}) {
  const savedKey = process.env.VWORLD_KEY;
  const savedFetch = globalThis.fetch;
  try {
    if (key === undefined) delete process.env.VWORLD_KEY;
    else process.env.VWORLD_KEY = key;
    if (fetchStub !== undefined) globalThis.fetch = fetchStub;
    const handler = aerialHandler();
    const { res, done } = mockRes();
    handler({ method: "GET", url }, res);
    return await done;
  } finally {
    if (savedKey === undefined) delete process.env.VWORLD_KEY;
    else process.env.VWORLD_KEY = savedKey;
    globalThis.fetch = savedFetch;
  }
}

describe("aerial proxy plugin", () => {
  it("status reports key presence as a boolean only", async () => {
    const withKey = await callAerial("/status", { key: "SECRET" });
    assert.deepEqual(JSON.parse(Buffer.concat(withKey.chunks).toString()), { hasKey: true });
    const without = await callAerial("/status");
    assert.deepEqual(JSON.parse(Buffer.concat(without.chunks).toString()), { hasKey: false });
  });
  it("rejects a bad tile with 400", async () => {
    const res = await callAerial("/25/1/1.jpeg", { key: "SECRET" });
    assert.equal(res.statusCode, 400);
  });
  it("returns 503 without a key", async () => {
    const res = await callAerial("/17/50510/111797.jpeg");
    assert.equal(res.statusCode, 503);
    assert.deepEqual(JSON.parse(Buffer.concat(res.chunks).toString()), { missing: "VWORLD_KEY" });
  });
  it("streams upstream bytes with no-store and never echoes key or URL", async () => {
    let seenUrl = "";
    const ok = await callAerial("/17/50510/111797.jpeg", {
      key: "SECRET",
      fetchStub: async (url) => {
        seenUrl = String(url);
        return { ok: true, arrayBuffer: async () => new Uint8Array([1, 2, 3]) };
      },
    });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.headers["content-type"], "image/jpeg");
    assert.equal(ok.headers["cache-control"], "no-store");
    assert.ok(seenUrl.includes("/SECRET/"), "key must travel in the upstream path only");
    const bad = await callAerial("/17/50510/111797.jpeg", {
      key: "SECRET",
      fetchStub: async () => ({ ok: false, status: 500 }),
    });
    assert.equal(bad.statusCode, 502);
    const body = Buffer.concat(bad.chunks).toString();
    assert.deepEqual(JSON.parse(body), { error: "upstream" });
    assert.ok(!body.includes("SECRET") && !body.includes("vworld"), body);
  });
});

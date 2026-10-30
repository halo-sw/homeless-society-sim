// Stage 23a: public relay — tile paths, serveTile, relay routes and
// limits, HTTP data reads. No network: fetch, req and res are faked.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseTilePath, tileInBounds, serveTile } from "../src/aerial/proxy.js";
import { lonLatToTile } from "../src/aerial/tiles.js";
import { readBody, httpReadText } from "../src/consult/server.js";
import { createRelay } from "../../relay/handler.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ORIGIN = "https://halo-sw.github.io";

function mockRes() {
  let resolve;
  const done = new Promise((r) => { resolve = r; });
  const res = {
    statusCode: 200,
    headers: {},
    chunks: [],
    setHeader(k, v) { res.headers[String(k).toLowerCase()] = v; },
    end(chunk) {
      if (chunk !== undefined) res.chunks.push(Buffer.from(chunk));
      resolve(res);
    },
  };
  return { res, done };
}

function bodyText(res) {
  return Buffer.concat(res.chunks).toString("utf8");
}

function flooredXY(lon, lat, z) {
  const t = lonLatToTile(lon, lat, z);
  return { x: Math.floor(t.x), y: Math.floor(t.y) };
}

describe("parseTilePath", () => {
  it("parses a white tile", () => {
    assert.deepEqual(parseTilePath("/api/tiles/white/16/25392/55894.png"),
      { layer: "white", ext: "png", z: 16, y: 25392, x: 55894 });
  });
  it("rejects a wrong extension", () => {
    assert.equal(parseTilePath("/api/tiles/white/16/1/1.jpeg"), null);
  });
  it("rejects an unknown layer", () => {
    assert.equal(parseTilePath("/api/tiles/Evil/16/1/1.png"), null);
  });
  it("accepts the old aerial path as Satellite", () => {
    const t = parseTilePath("/api/aerial/17/50510/111797.jpeg");
    assert.equal(t && t.layer, "Satellite");
  });
  it("rejects zoom 20", () => {
    assert.equal(parseTilePath("/api/tiles/white/20/1/1.png"), null);
  });
});

describe("tileInBounds", () => {
  it("accepts a Gangnam tile and rejects a Busan tile", () => {
    const g = flooredXY(127.0276, 37.4979, 16);
    assert.equal(tileInBounds(16, g.y, g.x), true);
    const b = flooredXY(129.07, 35.18, 16);
    assert.equal(tileInBounds(16, b.y, b.x), false);
  });
});

describe("serveTile", () => {
  const g = flooredXY(127.0276, 37.4979, 16);
  const white = `/api/tiles/white/16/${g.y}/${g.x}.png`;

  async function callServe({ path, key, fetchStub }) {
    let seenUrl = "";
    const fetchImpl = async (url, opts) => {
      seenUrl = String(url);
      return fetchStub(url, opts);
    };
    const { res, done } = mockRes();
    await serveTile({ path, env: key ? { VWORLD_KEY: key } : {}, fetchImpl, res });
    return { res: await done, seenUrl };
  }

  it("streams png bytes with no-store", async () => {
    const { res } = await callServe({
      path: white,
      key: "K",
      fetchStub: async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([9]) }),
    });
    assert.equal(res.statusCode, 200);
    assert.equal(res.headers["content-type"], "image/png");
    assert.equal(res.headers["cache-control"], "no-store");
  });
  it("puts the key in the upstream URL only", async () => {
    const { res, seenUrl } = await callServe({
      path: white,
      key: "SECRET-KEY-123",
      fetchStub: async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([9]) }),
    });
    assert.ok(seenUrl.includes("/SECRET-KEY-123/"), seenUrl);
    for (const v of Object.values(res.headers)) assert.ok(!String(v).includes("SECRET-KEY-123"));
    assert.ok(!bodyText(res).includes("SECRET-KEY-123"));
  });
  it("maps an upstream failure to 502 without the key", async () => {
    const { res } = await callServe({
      path: white,
      key: "SECRET-KEY-123",
      fetchStub: async () => ({ ok: false, status: 500 }),
    });
    assert.equal(res.statusCode, 502);
    assert.deepEqual(JSON.parse(bodyText(res)), { error: "upstream" });
    assert.ok(!bodyText(res).includes("SECRET-KEY-123"));
  });
  it("returns 503 without a key", async () => {
    const { res } = await callServe({
      path: white,
      key: null,
      fetchStub: async () => ({ ok: true, arrayBuffer: async () => new Uint8Array([9]) }),
    });
    assert.equal(res.statusCode, 503);
  });
  it("reports key presence on the status path", async () => {
    const { res, done } = mockRes();
    const target = res;
    void done;
    await serveTile({ path: "/api/tiles/status?x=1", env: { VWORLD_KEY: "K" }, fetchImpl: async () => ({}), res: target });
    assert.deepEqual(JSON.parse(bodyText(target)), { hasKey: true });
  });
});

describe("createRelay", () => {
  function stubFactory(seen) {
    return (opts) => {
      seen.opts = opts;
      return async (req, res) => {
        seen.calls += 1;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ ok: true }));
      };
    };
  }

  function relayWith({ env = {}, now = () => 1000000, seen = null } = {}) {
    const store = seen || { calls: 0, opts: null };
    const relay = createRelay({ env, fetchImpl: async () => ({}), now, consultFactory: stubFactory(store) });
    return { relay, seen: store };
  }

  async function callRelay(relay, { method = "GET", url = "/", headers = {}, body = undefined, ip = "1.2.3.4" }) {
    const { res, done } = mockRes();
    const req = { method, url, headers, socket: { remoteAddress: ip } };
    if (body !== undefined) req.body = body;
    await relay(req, res);
    return await done;
  }

  it("answers OPTIONS with the allow-origin", async () => {
    const { relay } = relayWith();
    const res = await callRelay(relay,
      { method: "OPTIONS", url: "/api/consult", headers: { origin: ORIGIN } });
    assert.equal(res.statusCode, 204);
    assert.equal(res.headers["access-control-allow-origin"], ORIGIN);
  });
  it("rejects a consult POST from an evil origin", async () => {
    const { relay, seen } = relayWith();
    const res = await callRelay(relay,
      { method: "POST", url: "/api/consult", headers: { origin: "https://evil.example" } });
    assert.equal(res.statusCode, 403);
    assert.deepEqual(JSON.parse(bodyText(res)), { ok: false, error: "origin" });
    assert.equal(seen.calls, 0);
  });
  it("reports model status as booleans only", async () => {
    const { relay } = relayWith({ env: { MODEL_API_KEY: "SUPERSECRET-KEY-999" } });
    const res = await callRelay(relay,
      { url: "/api/relay?path=model/status", headers: { origin: ORIGIN } });
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(bodyText(res));
    assert.equal(body.meta.hasServerKey, true);
    assert.equal(body.baseten.hasServerKey, false);
    assert.equal(body.recorded.hasServerKey, true);
    for (const v of [body.ok, body.relay, body.meta.hasServerKey,
      body.baseten.hasServerKey, body.recorded.hasServerKey]) {
      assert.equal(typeof v, "boolean");
    }
    assert.ok(!bodyText(res).includes("SUPERSECRET"));
  });
  it("rate-limits the 21st consult in 10 minutes", async () => {
    const { relay, seen } = relayWith();
    let last;
    for (let i = 0; i < 21; i += 1) {
      last = await callRelay(relay, {
        method: "POST",
        url: "/api/consult",
        headers: { origin: ORIGIN, "x-forwarded-for": "9.9.9.9" },
        body: {},
      });
    }
    assert.equal(seen.calls, 20);
    assert.equal(last.statusCode, 429);
    assert.ok(last.headers["retry-after"], "Retry-After header");
    const body = JSON.parse(bodyText(last));
    assert.equal(body.error, "rate_limited");
    assert.equal(typeof body.retryAfterSec, "number");
  });
  it("rejects a non-meta provider without the BYOK header", async () => {
    const { relay, seen } = relayWith();
    const denied = await callRelay(relay, {
      method: "POST",
      url: "/api/consult",
      headers: { origin: ORIGIN },
      body: { provider: "baseten" },
    });
    assert.equal(denied.statusCode, 400);
    assert.deepEqual(JSON.parse(bodyText(denied)), { ok: false, error: "provider" });
    assert.equal(seen.calls, 0);
    const allowed = await callRelay(relay, {
      method: "POST",
      url: "/api/consult",
      headers: { origin: ORIGIN, "x-model-key": "BYOK-1" },
      body: { provider: "baseten" },
    });
    assert.equal(allowed.statusCode, 200);
    assert.equal(seen.calls, 1);
  });
  it("builds the consult handler for HTTP data, not the file system", () => {
    const seen = { calls: 0, opts: null };
    relayWith({ seen });
    assert.equal(seen.opts.rawDir, null);
    assert.equal(typeof seen.opts.readText, "function");
  });
});

describe("httpReadText", () => {
  it("maps data and scen roots onto the public site", async () => {
    const urls = [];
    const fake = async (url) => {
      urls.push(url);
      return { ok: true, text: async () => "TXT" };
    };
    const read = httpReadText("https://x.test/base", fake);
    assert.equal(await read("data", "homes-index.json"), "TXT");
    assert.equal(await read("scen", "personas/a.json"), "TXT");
    assert.deepEqual(urls, [
      "https://x.test/base/data/homes-index.json",
      "https://x.test/base/scenarios/personas/a.json",
    ]);
    await assert.rejects(
      httpReadText("https://x.test/base/", async () => ({ ok: false, status: 404 }))("data", "nope.json"),
      /not found: nope\.json/);
  });
});

describe("readBody", () => {
  it("resolves a parked object body", async () => {
    assert.equal(await readBody({ body: { a: 1 } }), '{"a":1}');
  });
});

describe("server-only proxy imports", () => {
  function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else out.push(p);
    }
    return out;
  }
  it("no file under web/src/ui/ and not web/src/main.js imports proxy.js", () => {
    const src = join(HERE, "..", "src");
    const checked = [...walk(join(src, "ui")), join(src, "main.js")];
    assert.ok(checked.length > 0);
    for (const p of checked) {
      assert.ok(!/aerial\/proxy\.js/.test(readFileSync(p, "utf8")),
        `${p} imports the server-only proxy module`);
    }
  });
});

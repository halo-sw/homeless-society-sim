// 22a: GitHub Pages (static only — no /api/* routes).
//
// - assetUrl(p) prefixes the Vite base, so client fetches of /data/…
//   and /scenarios/… work under /homeless-society-sim/ and at /.
//   assetUrlWith(base, p) is the injectable pure form used by tests.
// - STATIC_SITE is true for the VITE_STATIC=1 build. 23b: /api/consult,
//   /api/model/status, /api/aerial/* and /api/tiles/* go through the
//   relay (LIVE_API) on the public site; /api/judge stays off there, so
//   the judge shows recorded/rule labels.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { assetUrl, assetUrlWith, STATIC_SITE } from "../src/paths.js";
import { runtimeDataList } from "../scripts/runtime-data-list.mjs";

const WEB = dirname(fileURLToPath(new URL(".", import.meta.url)));
const ROOT = join(WEB, "..");
const SRC = join(WEB, "src");

async function jsFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...await jsFiles(full));
    else if (/\.(js|jsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

describe("22a base-aware urls", () => {
  it("assetUrl keeps /data paths with the default base", () => {
    assert.equal(assetUrl("/data/x.json"), "/data/x.json");
    assert.equal(assetUrl("/scenarios/a.json"), "/scenarios/a.json");
  });
  it("assetUrlWith prefixes the Pages base", () => {
    assert.equal(assetUrlWith("/homeless-society-sim/", "/data/x.json"),
      "/homeless-society-sim/data/x.json");
    assert.equal(assetUrlWith("/homeless-society-sim/", "/scenarios/a.json"),
      "/homeless-society-sim/scenarios/a.json");
  });
  it("STATIC_SITE is off without VITE_STATIC=1", () => {
    assert.equal(STATIC_SITE, false);
  });
  it("no file under web/src/ fetches /data directly — all go through assetUrl", async () => {
    const bad = [];
    for (const f of await jsFiles(SRC)) {
      const text = await readFile(f, "utf8");
      if (/fetch\(\s*["'`]\/data\//.test(text)
        || /fetch\(\s*`\/data\//.test(text)) {
        bad.push(relative(ROOT, f));
      }
    }
    assert.deepEqual(bad, []);
  });
  it("every /api/ fetch site is guarded by STATIC_SITE or LIVE_API", async () => {
    const bad = [];
    for (const f of await jsFiles(SRC)) {
      const text = await readFile(f, "utf8");
      const callsApi = /fetch\(\s*["'`]\/api\//.test(text)
        || /fetch\(\s*`\/api\//.test(text)
        || /fetch\(\s*apiUrl\(/.test(text);
      if (callsApi && !text.includes("STATIC_SITE") && !text.includes("LIVE_API")) {
        bad.push(relative(ROOT, f));
      }
    }
    assert.deepEqual(bad, []);
  });
});

describe("22a runtime-data-list", () => {
  function fakeReader() {
    const store = {
      "st-a/area.json": { buildings: { $ref: "area.buildings.json" } },
      "st-a/area.buildings.json": { n: 1 },
      "st-a/scene.json": {},
      "st-a/osm.json": {},
      "st-a/graph.json": {},
      "st-a/report.json": {},
      "st-a/extract.osm.pbf": null,
      "homes/summary.json": {},
      "region/network.json": {},
      "region/congestion.json": {},
      "region/safety.json": {},
      "sim/demo-x-A.json": {},
      "walkgraph/w1.json": {},
      "areas-index.json": {},
      "personas/p.json": {},
      "_cache/a.pbf": null,
    };
    const files = Object.keys(store);
    return {
      files,
      readJson: async (rel) => {
        if (!(rel in store) || store[rel] === null) throw new Error(`no json: ${rel}`);
        return store[rel];
      },
    };
  }
  it("lists area.json, scene.json and $ref targets, not the excluded files", async () => {
    const list = await runtimeDataList(fakeReader());
    assert.ok(list.includes("st-a/area.json"), "area.json");
    assert.ok(list.includes("st-a/area.buildings.json"), "$ref target");
    assert.ok(list.includes("st-a/scene.json"), "scene.json");
    assert.ok(!list.includes("st-a/osm.json"), "no osm.json");
    assert.ok(!list.includes("st-a/graph.json"), "no graph.json");
    assert.ok(!list.includes("st-a/report.json"), "no report.json");
    assert.ok(!list.includes("st-a/extract.osm.pbf"), "no pbf");
    assert.ok(!list.includes("_cache/a.pbf"), "no _cache");
    assert.ok(!list.includes("personas/p.json"), "no personas");
  });
  it("lists region/congestion.json and the subtree + top-level json", async () => {
    const list = await runtimeDataList(fakeReader());
    for (const p of ["region/congestion.json", "region/network.json",
      "homes/summary.json", "sim/demo-x-A.json", "walkgraph/w1.json",
      "areas-index.json"]) {
      assert.ok(list.includes(p), p);
    }
  });
});

describe("22a pages workflow + vite base", () => {
  it("pages.yml deploys with the data asset and static flags", async () => {
    const yml = await readFile(
      join(ROOT, ".github", "workflows", "pages.yml"), "utf8");
    for (const needle of ["deploy-pages", "PAGES_BASE=/homeless-society-sim/",
      "VITE_STATIC=1", "runtime-data.tgz"]) {
      assert.ok(yml.includes(needle), needle);
    }
  });
  it("vite.config.js reads PAGES_BASE", async () => {
    const cfg = await readFile(join(WEB, "vite.config.js"), "utf8");
    assert.ok(cfg.includes("PAGES_BASE"), "PAGES_BASE");
  });
});

// Stage 11b ride view: full-corridor background tile loading (no clock),
// the oblique train-following cruise, and the base map (ground + water +
// major-road ribbons in look-table colours).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import * as THREE from "three";
import { corridorLoadPlan } from "../src/journey.js";
import { PRELOAD_CONCURRENCY, createJourneyLayer,
  tileCapFor } from "../src/journey-scene.js";
import { baseMapBounds, hexToRgb, ribbonSoup, tileRoadRibbons,
  tileWaterRibbons } from "../src/corridor.js";
import { TOUR_FOV_DEG, distanceForWidth, frameWidthFor,
  JOURNEY_CRUISE_FRAME_M, JOURNEY_CRUISE_PITCH_DEG,
  journeyCruisePose } from "../src/camera.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

const manifestFixture = (n) => ({
  id: "c9",
  bounds: [127.0, 37.5, 127.01, 37.51],
  tiles: Array.from({ length: n }, (_, i) => ({
    id: `t_${i}`, bounds: [127.0, 37.5, 127.01, 37.51] })),
});

describe("corridor load plan (stage 11b)", () => {
  it("covers every tile of the active corridor", () => {
    const plan = corridorLoadPlan(manifestFixture(65));
    assert.equal(plan.total, 65);
    assert.equal(plan.ids.length, 65);
    assert.deepEqual(plan.ids, manifestFixture(65).tiles.map((t) => t.id));
    assert.equal(plan.loaded, 0);
    // No focus, no minute, no clock anywhere in the plan inputs.
    assert.deepEqual(Object.keys(plan).sort(), ["ids", "loaded", "total"]);
  });

  it("skips already-loaded tiles and tolerates empty manifests", () => {
    const m = manifestFixture(4);
    const plan = corridorLoadPlan(m, { loaded: ["t_1", "t_3", "t_gone"] });
    assert.deepEqual(plan.ids, ["t_0", "t_2"]);
    assert.equal(plan.total, 4);
    assert.equal(plan.loaded, 2);
    assert.deepEqual(corridorLoadPlan(null), { ids: [], total: 0, loaded: 0 });
    assert.deepEqual(corridorLoadPlan({}), { ids: [], total: 0, loaded: 0 });
  });

  it("caps at the corridor tile count with a small concurrency", () => {
    assert.equal(tileCapFor(manifestFixture(65)), 65);
    assert.equal(tileCapFor(manifestFixture(1)), 1);
    assert.equal(tileCapFor(null), 0);
    assert.equal(PRELOAD_CONCURRENCY, 6);
  });
});

describe("cruise camera (stage 11b)", () => {
  const aspect = 1280 / 860; // orchestrator capture size

  it("sits 50–60° off vertical (oblique, never top-down)", () => {
    assert.ok(JOURNEY_CRUISE_PITCH_DEG >= 30 && JOURNEY_CRUISE_PITCH_DEG <= 40,
      `pitch ${JOURNEY_CRUISE_PITCH_DEG}`);
    const pose = journeyCruisePose([1000, -2000], aspect);
    const [px, py, pz] = pose.pos;
    const [lx, ly, lz] = pose.look;
    const up = py - ly;
    const dist = Math.hypot(px - lx, up, pz - lz);
    const fromVertical = (Math.acos(up / dist) * 180) / Math.PI;
    assert.ok(fromVertical >= 50 && fromVertical <= 60,
      `off-vertical ${fromVertical}`);
    assert.ok(Math.abs(dist - pose.dist) < 1e-9);
  });

  it("frames about 3–4 km of corridor around the train", () => {
    assert.ok(JOURNEY_CRUISE_FRAME_M >= 3000 && JOURNEY_CRUISE_FRAME_M <= 4000,
      `frame ${JOURNEY_CRUISE_FRAME_M}`);
    const pose = journeyCruisePose([1000, -2000], aspect);
    const framed = frameWidthFor(pose.dist, TOUR_FOV_DEG, aspect);
    assert.ok(Math.abs(framed - JOURNEY_CRUISE_FRAME_M) < 1e-6);
    assert.deepEqual(pose.look, [1000, 0, -2000]);
    // Height scales with the frame, not with the whole 20 km path.
    assert.ok(pose.dist < 9000, `dist ${pose.dist}`);
    assert.ok(Math.abs(pose.dist
      - distanceForWidth(JOURNEY_CRUISE_FRAME_M, TOUR_FOV_DEG, aspect)) < 1e-9);
  });
});

describe("base map (stage 11b)", () => {
  const origin = { lon: 127.0, lat: 37.5 };

  it("sizes the ground plane from the manifest bounds", () => {
    const rect = baseMapBounds(manifestFixture(3), origin);
    assert.ok(rect.w > 800 && rect.w < 1000, `w ${rect.w}`);
    assert.ok(rect.d > 1000 && rect.d < 1200, `d ${rect.d}`);
    assert.ok(Math.abs(rect.cx - rect.w / 2) < 1e-6);
    assert.ok(Math.abs(rect.cz + rect.d / 2) < 1e-6);
    assert.deepEqual(baseMapBounds(null, origin),
      { cx: 0, cz: 0, w: 0, d: 0, minX: 0, maxX: 0, minZ: 0, maxZ: 0 });
  });

  it("covers the real c1 corridor bounds", { skip: !existsSync(
    join(ROOT, "data/build/region/corridor/c1/manifest.json")) }, () => {
    const m = JSON.parse(readFileSync(
      join(ROOT, "data/build/region/corridor/c1/manifest.json"), "utf8"));
    assert.equal(m.tiles.length, 65);
    const rect = baseMapBounds(m, { lon: 127.101667, lat: 37.513691 });
    assert.ok(rect.w > 6000 && rect.w < 9000, `w ${rect.w}`);
    assert.ok(rect.d > 11000 && rect.d < 15000, `d ${rect.d}`);
  });

  it("converts look hex ints to vertex triples", () => {
    assert.deepEqual(hexToRgb(0xffffff), [1, 1, 1]);
    assert.deepEqual(hexToRgb(0x000000), [0, 0, 0]);
    const [r, g, b] = hexToRgb(0x5b8fc4);
    assert.ok(Math.abs(r - 0x5b / 255) < 1e-9);
    assert.ok(Math.abs(g - 0x8f / 255) < 1e-9);
    assert.ok(Math.abs(b - 0xc4 / 255) < 1e-9);
    assert.deepEqual(hexToRgb(NaN), [0, 0, 0]);
  });

  it("lays two triangles per segment at the readable width", () => {
    const line = [[[127.0, 37.5], [127.002, 37.5], [127.002, 37.502]]];
    const soup = ribbonSoup(line, origin, { widthM: 16, lift: 0.3 });
    assert.equal(soup.triangles, 4); // 2 segments × 2
    assert.equal(soup.positions.length, soup.triangles * 9);
    // Width across the first (east-running) segment ≈ 16 m in z.
    const zs = [];
    for (let i = 2; i < 18; i += 3) zs.push(soup.positions[i]);
    assert.ok(Math.max(...zs) - Math.min(...zs) > 15
      && Math.max(...zs) - Math.min(...zs) < 17);
    // Lift is exact on every vertex.
    for (let i = 1; i < soup.positions.length; i += 3) {
      assert.equal(soup.positions[i], 0.3);
    }
  });

  it("ignores degenerate and empty polylines", () => {
    assert.equal(ribbonSoup([], origin).triangles, 0);
    assert.equal(ribbonSoup(null, origin).triangles, 0);
    const same = [[[127.0, 37.5], [127.0, 37.5]]];
    assert.equal(ribbonSoup(same, origin).triangles, 0);
  });

  it("ribbons roads and open waterways separately", () => {
    const tile = {
      id: "t_0",
      roads: [{ name: "대로", class: "primary",
        pts: [[127.0, 37.5], [127.002, 37.5]] }],
      water: [
        { name: "천", closed: false, pts: [[127.0, 37.5], [127.001, 37.501]] },
        { name: "호", closed: true,
          pts: [[127.0, 37.5], [127.001, 37.5], [127.001, 37.501], [127.0, 37.5]] },
      ],
    };
    const roads = tileRoadRibbons(tile, origin);
    assert.equal(roads.triangles, 2);
    const water = tileWaterRibbons(tile, origin);
    assert.equal(water.triangles, 2); // open stream only, not the lake
    assert.equal(tileRoadRibbons({ id: "t_x" }, origin).triangles, 0);
    assert.equal(tileWaterRibbons({ id: "t_x" }, origin).triangles, 0);
  });
});

describe("background preload (stage 11b, headless three.js)", () => {
  const origin = { lon: 127.0, lat: 37.5 };

  const tileDoc = (id) => ({
    id,
    buildings: [{ id: `b-${id}`, h: 12,
      pts: [[127.0, 37.5], [127.001, 37.5], [127.001, 37.501],
        [127.0, 37.501], [127.0, 37.5]] }],
    roads: [{ name: "대로", class: "primary",
      pts: [[127.0, 37.5], [127.002, 37.5]] }],
    water: [],
    boundaries: [],
  });

  function layerWith(n) {
    const scene = new THREE.Scene();
    const layer = createJourneyLayer(scene, origin, {});
    layer.setManifest(manifestFixture(n));
    return { scene, layer };
  }

  it("loads every tile with bounded concurrency and progress", async () => {
    const { layer } = layerWith(10);
    let inFlight = 0;
    let maxInFlight = 0;
    let calls = 0;
    const seen = [];
    const fetchJson = async (url) => {
      calls++;
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      const id = url.slice(url.lastIndexOf("/") + 1, -".json".length);
      return tileDoc(id);
    };
    const done = await layer.preloadCorridor(fetchJson, (p) => seen.push({ ...p }));
    assert.equal(calls, 10);
    assert.equal(done.loaded, 10);
    assert.equal(done.total, 10);
    assert.equal(done.cancelled, false);
    assert.ok(done.triangles > 0);
    assert.ok(maxInFlight <= PRELOAD_CONCURRENCY,
      `max in flight ${maxInFlight}`);
    assert.ok(maxInFlight > 1, `expected parallel fetches, got ${maxInFlight}`);
    // Progress runs 0/10 → 10/10 with no clock involved.
    assert.equal(seen[0].loaded, 0);
    assert.equal(seen[seen.length - 1].loaded, 10);
    assert.ok(seen.every((p) => p.total === 10));
    assert.deepEqual(layer.counts(), { tiles: 10, total: 10, rideKey: "",
      visible: false });
    layer.dispose();
  });

  it("is idempotent: a second call refetches nothing", async () => {
    const { layer } = layerWith(4);
    let calls = 0;
    const fetchJson = async (url) => {
      calls++;
      return tileDoc(url.slice(url.lastIndexOf("/") + 1, -".json".length));
    };
    const first = layer.preloadCorridor(fetchJson, null);
    const second = layer.preloadCorridor(fetchJson, null);
    assert.equal(first === second, true);
    const done = await second;
    assert.equal(calls, 4);
    assert.equal(done.loaded, 4);
    const third = await layer.preloadCorridor(fetchJson, null);
    assert.equal(calls, 4, "finished preload never refetches");
    assert.equal(third.loaded, 4);
    layer.dispose();
  });

  it("cancels on corridor change and unloads the old tiles", async () => {
    const scene = new THREE.Scene();
    const layer = createJourneyLayer(scene, origin, {});
    layer.setManifest(manifestFixture(6));
    let release;
    const gate = new Promise((r) => { release = r; });
    const fetchJson = async (url) => {
      await gate;
      return tileDoc(url.slice(url.lastIndexOf("/") + 1, -".json".length));
    };
    const pending = layer.preloadCorridor(fetchJson, null);
    layer.setManifest({ ...manifestFixture(2), id: "c-other" });
    release();
    const done = await pending;
    assert.equal(done.cancelled, true);
    assert.equal(layer.counts().tiles, 0);
    assert.equal(layer.counts().total, 2);
    layer.dispose();
  });

  it("builds the base map and station labels headlessly", async () => {
    const scene = new THREE.Scene();
    const layer = createJourneyLayer(scene, origin, {});
    layer.setManifest(manifestFixture(2));
    await layer.preloadCorridor(async (url) =>
      tileDoc(url.slice(url.lastIndexOf("/") + 1, -".json".length)), null);
    // Ground plane + merged road ribbons + 2 tiles × buildings/lines.
    assert.ok(scene.children.length > 0);
    assert.equal(layer.counts().tiles, 2);
    // No tags container in Node: label updates are safe no-ops.
    layer.updateStationLabels(null);
    layer.updateStationLabels(new THREE.PerspectiveCamera());
    layer.dispose();
    assert.equal(layer.counts().tiles, 0);
  });

  it("names the station-label contract (layer + CSS)", () => {
    const sceneSrc = readFileSync(join(ROOT, "web/src/journey-scene.js"), "utf8");
    assert.ok(sceneSrc.includes("jostation"), "layer builds .jostation tags");
    assert.ok(sceneSrc.includes("updateStationLabels"), "per-frame label update");
    const css = readFileSync(join(ROOT, "web/src/ui/ui.css"), "utf8");
    assert.ok(css.includes(".jostation"), "label style exists");
    const main = readFileSync(join(ROOT, "web/src/main.js"), "utf8");
    assert.ok(main.includes("지도 불러오는 중"),
      "loading chip text while tiles stream in");
    assert.ok(main.includes("preloadCorridor"), "scene drives the preload");
  });
});

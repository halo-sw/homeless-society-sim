// Stage 33a2 — VWorld tile clipping + low-zoom underlay. Pure, no DOM.
// node --test, no network.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { basemapTiles, basemapUnderlayTiles, pickBasemapZoom } from "../src/basemap.js";
import { tileInBounds } from "../src/aerial/proxy.js";

// The 1440 case: a 1440x1040 stage whose view bbox reaches lon 127.55
// (east of the 127.4E proxy bound) at z 11.
const W = 1440;
const H = 1040;
const toLonLatWide = (x, y) => [126.9 + (x / W) * 0.65, 37.6 - (y / H) * 0.4];
const wideArgs = { toLonLat: toLonLatWide, W, H, lat: 37.4, metersPerPx: 60 };

// One candidate area inside the box (Jamsil): everything stays sharp.
const JW = 640;
const JH = 420;
const toLonLatJamsil = (x, y) => [127.08 + (x / JW) * 0.04, 37.53 - (y / JH) * 0.03];
const jamsilArgs = { toLonLat: toLonLatJamsil, W: JW, H: JH, lat: 37.51, metersPerPx: 9.5 };

function covers(rects, lon, lat) {
  return rects.some(([w, s, e, n]) => lon >= w && lon <= e && lat >= s && lat <= n);
}
function rectsOf(tiles) {
  return tiles.map((t) => [
    Math.min(t.nw[0], t.se[0]), Math.min(t.nw[1], t.se[1]),
    Math.max(t.nw[0], t.se[0]), Math.max(t.nw[1], t.se[1]),
  ]);
}

describe("33a2 clipped normal tiles (1440 case)", () => {
  const tiles = basemapTiles(wideArgs);
  it("picks z 11", () => {
    assert.equal(pickBasemapZoom(60, 37.4), 11);
    assert.ok(tiles.length > 0, "at least one tile");
    assert.equal(tiles[0].z, 11);
  });
  it("requests no tile the proxy rejects", () => {
    for (const t of tiles) assert.ok(tileInBounds(t.z, t.y, t.x), `in bounds: ${t.key}`);
  });
  it("actually clips the out-of-area column", () => {
    const full = basemapTiles({ ...wideArgs, provider: "usgs" });
    const dropped = full.filter((t) => !tileInBounds(t.z, t.y, t.x));
    assert.ok(dropped.length > 0, "wide view reaches past 127.4E");
    assert.ok(full.length > tiles.length, "clipped list is shorter, no new 403s");
  });
});

describe("33a2 underlay (1440 case)", () => {
  const tiles = basemapTiles(wideArgs);
  const under = basemapUnderlayTiles({ toLonLat: toLonLatWide, W, H, z: tiles[0].z });
  it("stays at z <= 10 and bounded", () => {
    assert.ok(under.length > 0, "at least one underlay tile");
    assert.ok(under.length <= 16, `${under.length} <= 16`);
    for (const t of under) assert.ok(t.z <= 10, `low zoom: ${t.key}`);
    assert.equal(new Set(under.map((t) => t.key)).size, under.length, "deduped");
  });
  it("covers the whole view bbox", () => {
    const rects = rectsOf(under);
    for (const [lon, lat] of [[126.9, 37.6], [127.55, 37.6], [126.9, 37.2], [127.55, 37.2]]) {
      assert.ok(covers(rects, lon, lat), `corner (${lon}, ${lat}) covered`);
    }
  });
});

describe("33a2 inside the box (Jamsil)", () => {
  const tiles = basemapTiles(jamsilArgs);
  it("every normal tile is in bounds", () => {
    assert.ok(tiles.length > 0, "at least one tile");
    for (const t of tiles) assert.ok(tileInBounds(t.z, t.y, t.x), `in bounds: ${t.key}`);
  });
  it("the underlay is still bounded", () => {
    const under = basemapUnderlayTiles({ toLonLat: toLonLatJamsil, W: JW, H: JH, z: tiles[0].z });
    assert.ok(under.length <= 16, `${under.length} <= 16`);
    for (const t of under) assert.ok(t.z <= 10, `low zoom: ${t.key}`);
  });
});

describe("33a2 USGS provider", () => {
  it("clips nothing", () => {
    const full = basemapTiles({ ...wideArgs, provider: "usgs" });
    assert.ok(full.some((t) => !tileInBounds(t.z, t.y, t.x)), "out-of-area tiles kept");
  });
  it("needs no underlay", () => {
    assert.deepEqual(
      basemapUnderlayTiles({ toLonLat: toLonLatWide, W, H, z: 11, provider: "usgs" }), []);
  });
});

describe("33a2 chatmap.jsx source pins", () => {
  const src = readFileSync(new URL("../src/ui/chatmap.jsx", import.meta.url), "utf8");
  it("draws the underlay under the normal tiles in the same mute group", () => {
    assert.ok(src.includes("basemapUnderlayTiles"), "underlay wired");
    const g = src.indexOf('filter="url(#basemap-mute)"');
    assert.ok(g >= 0, "mute group");
    const u = src.indexOf("underlay.filter", g);
    const n = src.indexOf("tiles.filter", g);
    assert.ok(u > g && n > u, "underlay first, normal tiles on top");
  });
  it("keeps basemapOn counting requested tiles", () => {
    assert.ok(src.includes("failCount * 2 < tiles.length"), "basemapOn unchanged");
  });
});

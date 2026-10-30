// Stage 25a — the candidate map is a real map: raster basemap maths,
// zoom/pan, and chatmap.jsx source pins.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fitMapView, MAP_FIT_MARGIN } from "../src/chatmap.js";
import { basemapApiBase, basemapTileUrl, pickBasemapZoom,
  basemapTiles, viewTransform, zoomAt } from "../src/basemap.js";

const INSET = { top: 56, right: 24, bottom: 96, left: 24 };

describe("25a fitMapView.toLonLat inverts toXY", () => {
  const fit = fitMapView([
    { lon: 127.02, lat: 37.49 },
    { lon: 127.06, lat: 37.51 },
    { lon: 127.0, lat: 37.45 },
  ], 640, 420, MAP_FIT_MARGIN, INSET);
  for (const [lon, lat] of [[127.02, 37.49], [127.06, 37.51], [127.0, 37.45]]) {
    it(`round-trips (${lon}, ${lat})`, () => {
      const [x, y] = fit.toXY(lon, lat);
      const [blon, blat] = fit.toLonLat(x, y);
      assert.ok(Math.abs(blon - lon) < 1e-9, `lon ${blon} ≈ ${lon}`);
      assert.ok(Math.abs(blat - lat) < 1e-9, `lat ${blat} ≈ ${lat}`);
    });
  }
});

describe("25a pickBasemapZoom", () => {
  it("1.19 m/px at lat 37.5 gives 17", () => {
    assert.equal(pickBasemapZoom(1.19, 37.5), 17);
  });
  it("9.5 m/px at lat 37.5 gives 14", () => {
    assert.equal(pickBasemapZoom(9.5, 37.5), 14);
  });
  it("0.01 m/px clamps to 19", () => {
    assert.equal(pickBasemapZoom(0.01, 37.5), 19);
  });
});

describe("25a basemapTiles around Gangnam", () => {
  const W = 1000;
  const H = 700;
  const fit = fitMapView([
    { lon: 127.0216, lat: 37.4979 },
    { lon: 127.0336, lat: 37.4979 },
  ], W, H, MAP_FIT_MARGIN, INSET);
  const tiles = basemapTiles({
    toLonLat: (x, y) => fit.toLonLat(x, y),
    W, H, lat: fit.midLat, metersPerPx: fit.metersPerPx,
  });
  it("stays within the tile budget", () => {
    assert.ok(tiles.length > 0, "at least one tile");
    assert.ok(tiles.length <= 80, `${tiles.length} <= 80`);
  });
  it("every tile key is unique", () => {
    assert.equal(new Set(tiles.map((t) => t.key)).size, tiles.length);
  });
  it("the tile union covers the four stage corners", () => {
    const rects = tiles.map((t) => {
      const [x0, y0] = fit.toXY(t.nw[0], t.nw[1]);
      const [x1, y1] = fit.toXY(t.se[0], t.se[1]);
      return [Math.min(x0, x1), Math.min(y0, y1),
        Math.max(x0, x1), Math.max(y0, y1)];
    });
    for (const [cx, cy] of [[0, 0], [W, 0], [0, H], [W, H]]) {
      const hit = rects.some(([a, b, c, d]) =>
        cx >= a - 1e-9 && cx <= c + 1e-9 && cy >= b - 1e-9 && cy <= d + 1e-9);
      assert.ok(hit, `corner (${cx}, ${cy}) covered`);
    }
  });
});

describe("25a zoomAt", () => {
  it("keeps the cursor point fixed on screen", () => {
    const before = viewTransform({ zoom: 1, panX: 0, panY: 0, cx: 500, cy: 350 });
    const s = zoomAt({ zoom: 1, panX: 0, panY: 0 }, 2, 100, 200, 500, 350);
    const after = viewTransform({ ...s, cx: 500, cy: 350 });
    const [x0, y0] = before.apply([100, 200]);
    const [x1, y1] = after.apply([100, 200]);
    assert.ok(Math.abs(x1 - x0) < 1e-6, `x ${x1} ≈ ${x0}`);
    assert.ok(Math.abs(y1 - y0) < 1e-6, `y ${y1} ≈ ${y0}`);
  });
  it("clamps zoom to 0.6–12", () => {
    assert.equal(zoomAt({ zoom: 1, panX: 0, panY: 0 }, 100, 10, 10, 50, 50).zoom, 12);
    assert.equal(zoomAt({ zoom: 1, panX: 0, panY: 0 }, 0.0001, 10, 10, 50, 50).zoom, 0.6);
  });
});

describe("25a basemapTileUrl + basemapApiBase", () => {
  it("builds the white-tile proxy URL", () => {
    assert.equal(basemapTileUrl("https://r.example", 16, 25392, 55894),
      "https://r.example/api/tiles/white/16/25392/55894.png");
  });
  it("an empty base stays same-origin", () => {
    assert.ok(basemapTileUrl("", 16, 25392, 55894).startsWith("/api/tiles/"));
  });
  it("node (no import.meta.env) reads as same-origin", () => {
    assert.equal(basemapApiBase(), "");
  });
});

describe("25a chatmap.jsx source pins", () => {
  const src = readFileSync(new URL("../src/ui/chatmap.jsx", import.meta.url), "utf8");
  it("credits VWorld behind basemapOn", () => {
    assert.ok(src.includes("basemapOn"), "basemapOn gate");
    assert.ok(/basemapOn[\s\S]{0,300}VWorld/.test(src), "VWorld credit tied to basemapOn");
  });
  it("wheel listener is non-passive", () => {
    assert.ok(src.includes("{ passive: false }"), "addEventListener with passive false");
  });
  it("zoom buttons carry Korean aria-labels", () => {
    assert.ok(src.includes('aria-label="확대"'), "zoom in");
    assert.ok(src.includes('aria-label="축소"'), "zoom out");
    assert.ok(src.includes('aria-label="후보 모두 보기"'), "fit");
  });
});

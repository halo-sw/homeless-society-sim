import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { bboxToXY, haversineM, lonLatToWorld, lonLatToXY, xyToLonLat } from "../src/frame.js";

const ORIGIN = { lon: 127.1, lat: 37.5 };

describe("frame", () => {
  it("round-trips lon/lat within a centimetre", () => {
    for (const [lon, lat] of [[127.1, 37.5], [127.105, 37.503], [127.09, 37.49]]) {
      const [x, y] = lonLatToXY(lon, lat, ORIGIN);
      const [lon2, lat2] = xyToLonLat(x, y, ORIGIN);
      assert.ok(Math.abs(lon2 - lon) < 1e-7, `lon ${lon}`);
      assert.ok(Math.abs(lat2 - lat) < 1e-7, `lat ${lat}`);
    }
  });

  it("scales metres correctly (100 m north)", () => {
    const [x, y] = lonLatToXY(127.1, 37.5 + 100 / 111320, ORIGIN);
    assert.ok(Math.abs(x) < 1e-6);
    assert.ok(Math.abs(y - 100) < 0.01);
  });

  it("maps north to -z in world space", () => {
    const [x, h, z] = lonLatToWorld(127.101, 37.501, ORIGIN, 5);
    assert.ok(x > 0 && z < 0 && h === 5);
  });

  it("haversine matches ~111 m per 0.001 deg latitude", () => {
    const d = haversineM(127.0, 37.5, 127.0, 37.501);
    assert.ok(Math.abs(d - 111.2) < 0.5, `${d}`);
  });

  it("projects bboxes with ordered corners", () => {
    const b = bboxToXY([127.0, 37.49, 127.01, 37.51], ORIGIN);
    assert.ok(b.minX < b.maxX && b.minY < b.maxY);
  });
});

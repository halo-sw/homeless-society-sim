import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MAX_CARS, MAX_LAMPS, carColor, placeStreetlife, sampleMover } from "../src/render/streetlife.js";
import { roadWidth } from "../src/ground.js";

const ORIGIN = { lon: 127.0, lat: 37.5 };

// One 6 m residential street (~180 m) + one footway.
function roads() {
  return [
    { id: "w1", highway: "residential", area: false,
      geometry: { type: "LineString", coordinates: [[127.0, 37.5], [127.002, 37.5]] } },
    { id: "w2", highway: "footway", area: false,
      geometry: { type: "LineString", coordinates: [[127.0, 37.501], [127.002, 37.501]] } },
  ];
}

describe("street life placement", () => {
  it("is deterministic for a fixed seed", () => {
    const a = placeStreetlife(roads(), ORIGIN, { seed: "s1" });
    const b = placeStreetlife(roads(), ORIGIN, { seed: "s1" });
    assert.deepEqual(a, b);
    assert.ok(a.cars.length > 0, "parked cars");
    assert.ok(a.lamps.length > 0, "street lamps");
  });

  it("parks cars along the drive edge, clear of the centre", () => {
    const { cars } = placeStreetlife(roads(), ORIGIN, { seed: "s1" });
    const hw = roadWidth("residential") / 2; // 3 m
    for (const c of cars) {
      const off = Math.abs(c.y); // street runs east-west at y=0
      assert.ok(Math.abs(off - (hw - 1.4)) < 0.6, `offset ${off}`);
    }
    assert.ok(cars.length <= MAX_CARS);
  });

  it("picks slow movers on long segments", () => {
    const { movers } = placeStreetlife(roads(), ORIGIN, { seed: "s1" });
    assert.ok(movers.length >= 1, "at least one mover on the 180 m street");
    for (const m of movers) {
      assert.ok(m.speed > 3 && m.speed < 12, `speed ${m.speed}`);
    }
  });

  it("lines lamps past the kerb, alternating sides", () => {
    const { lamps } = placeStreetlife(roads(), ORIGIN, { seed: "s1" });
    const hw = roadWidth("residential") / 2;
    for (const l of lamps) {
      assert.ok(Math.abs(Math.abs(l.y) - (hw + 1.5)) < 0.6, `offset ${l.y}`);
    }
    const sides = new Set(lamps.map((l) => l.side));
    assert.deepEqual([...sides].sort(), [-1, 1]);
    assert.ok(lamps.length <= MAX_LAMPS);
  });

  it("ignores foot-class ways", () => {
    const foot = placeStreetlife([roads()[1]], ORIGIN, { seed: "s1" });
    assert.equal(foot.cars.length, 0);
    assert.equal(foot.movers.length, 0);
    assert.equal(foot.lamps.length, 0);
  });

  it("deals muted body colours", () => {
    assert.equal(carColor(0.1), 0xf2f2f0);
    assert.equal(carColor(0.99), 0x3d5a5a);
  });
});

describe("mover sampling", () => {
  it("ping-pongs along its segment", () => {
    const m = { ax: 0, ay: 0, bx: 100, by: 0, t: 0, speed: 10, angle: 0 };
    const p0 = sampleMover(m, 0);
    assert.ok(Math.abs(p0.x) < 1e-9 && p0.angle === 0);
    const mid = sampleMover(m, 5); // 50 m out
    assert.ok(Math.abs(mid.x - 50) < 1e-9);
    const back = sampleMover(m, 15); // returning
    assert.ok(Math.abs(back.x - 50) < 1e-9);
    assert.ok(Math.abs(back.angle - Math.PI) < 1e-9, "flipped heading");
    for (const t of [0, 3, 9, 21, 60]) {
      const p = sampleMover(m, t);
      assert.ok(p.x >= 0 && p.x <= 100, `t=${t} x=${p.x}`);
    }
  });
});

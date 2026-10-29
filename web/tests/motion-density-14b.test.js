import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DENSITY_SOURCE, PED_CURVE, VEHICLE_CURVE, activeCount, factorAt } from "../src/motion/density.js";

describe("14b density curves", () => {
  it("labels the curves 가정값", () => {
    assert.equal(DENSITY_SOURCE, "가정값");
    assert.equal(VEHICLE_CURVE.source, "가정값");
    assert.equal(PED_CURVE.source, "가정값");
  });
  it("peaks at rush hours and troughs at night", () => {
    for (const curve of [VEHICLE_CURVE, PED_CURVE]) {
      assert.ok(factorAt(curve, 8 * 60) > 0.9, "08 peak");
      assert.ok(factorAt(curve, 18 * 60) >= 0.99, "18 peak");
      assert.ok(factorAt(curve, 18 * 60 + 30) > 0.85, "18:30 shoulder");
      assert.ok(factorAt(curve, 3 * 60) < 0.05, "03 trough");
      assert.ok(factorAt(curve, 8 * 60) > factorAt(curve, 14 * 60),
        "rush above midday");
      assert.ok(factorAt(curve, 14 * 60) > factorAt(curve, 3 * 60),
        "midday above night");
    }
  });
  it("interpolates between hours and wraps past midnight", () => {
    const a = factorAt(VEHICLE_CURVE, 7 * 60);
    const b = factorAt(VEHICLE_CURVE, 8 * 60);
    const mid = factorAt(VEHICLE_CURVE, 7 * 60 + 30);
    assert.ok(Math.abs(mid - (a + b) / 2) < 1e-12);
    assert.equal(factorAt(VEHICLE_CURVE, 8 * 60), factorAt(VEHICLE_CURVE, 8 * 60 + 1440));
    assert.equal(factorAt(VEHICLE_CURVE, 0), factorAt(VEHICLE_CURVE, 1440));
  });
  it("scales slot counts with a cap", () => {
    assert.equal(activeCount(100, VEHICLE_CURVE, 3 * 60), 3);
    assert.ok(activeCount(100, VEHICLE_CURVE, 8 * 60) >= 90);
    assert.equal(activeCount(100, VEHICLE_CURVE, 8 * 60, 10), 10);
  });
});

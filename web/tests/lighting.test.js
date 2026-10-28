import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { solarPosition, sunDirection } from "../src/lighting.js";

// Seoul 37.57 N; instants carry their KST offset (+09:00).
describe("lighting", () => {
  it("matches the June-solstice noon altitude (~76 deg)", () => {
    const d = new Date("2026-06-21T12:30:00+09:00");
    const { altitude } = solarPosition(37.57, 126.98, d);
    assert.ok(Math.abs(altitude - 76) < 1.5, `got ${altitude}`);
  });

  it("matches the December-solstice noon altitude (~29 deg)", () => {
    const d = new Date("2026-12-21T12:30:00+09:00");
    const { altitude } = solarPosition(37.57, 126.98, d);
    assert.ok(Math.abs(altitude - 29) < 1.5, `got ${altitude}`);
  });

  it("puts the noon sun in the south and returns a unit vector", () => {
    const d = new Date("2026-10-15T12:30:00+09:00");
    const [x, y, z] = sunDirection(37.57, 126.98, d);
    assert.ok(Math.abs(Math.hypot(x, y, z) - 1) < 1e-9);
    assert.ok(y > 0.4, `daytime up=${y}`);
    assert.ok(z > 0, `south => +z, got ${z}`);
  });

  it("drops below the horizon at midnight", () => {
    const d = new Date("2026-10-15T00:00:00+09:00");
    const { altitude } = solarPosition(37.57, 126.98, d);
    assert.ok(altitude < 0, `got ${altitude}`);
  });
});

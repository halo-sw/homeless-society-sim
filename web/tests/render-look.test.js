// Stage-11 look table: ?look= parsing, street/regional fog ranges and
// the night lit-fraction cap — pure, no GPU needed.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LOOK, capLitFraction, parseLookParam, regionalFogRange,
  resolveLook, streetFogRange } from "../src/render/look.js";

describe("look parsing (?look=key:value,…)", () => {
  it("parses overrides and reports unknown/invalid parts", () => {
    const p = parseLookParam("fogStreetFar:8,nightGain:0.9");
    assert.deepEqual(p.values, { fogStreetFar: 8, nightGain: 0.9 });
    assert.deepEqual(p.unknown, []);
    assert.deepEqual(p.invalid, []);
    const q = parseLookParam("fogStreetFar:8, nope:1, broken, nightGain:abc");
    assert.deepEqual(q.values, { fogStreetFar: 8 });
    assert.deepEqual(q.unknown, ["nope"]);
    assert.deepEqual(q.invalid, ["broken", "nightGain:abc"]);
    assert.deepEqual(parseLookParam("").values, {});
    assert.deepEqual(parseLookParam("  ").values, {});
  });

  it("resolves ?look= over the defaults (string or URLSearchParams)", () => {
    assert.deepEqual(resolveLook(""), DEFAULT_LOOK);
    assert.deepEqual(resolveLook(null), DEFAULT_LOOK);
    assert.deepEqual(resolveLook(new URLSearchParams("")), DEFAULT_LOOK);
    const r = resolveLook("?mode=sim&look=fogStreetFar:8,nightGain:0.9");
    assert.equal(r.fogStreetFar, 8);
    assert.equal(r.nightGain, 0.9);
    assert.equal(r.fogStreetNear, DEFAULT_LOOK.fogStreetNear);
    const s = resolveLook(new URLSearchParams("look=nope:1"));
    assert.deepEqual(s, DEFAULT_LOOK);
  });

  it("pins the default table (deliberate values, see 11-RESULT.md)", () => {
    assert.deepEqual(DEFAULT_LOOK, {
      fogStreetNear: 2.5,
      fogStreetFar: 6,
      fogRegionalNear: 2,
      fogRegionalFar: 6,
      sunGain: 1.05,
      hemiGain: 0.75,
      exposureGain: 0.94,
      rayleighGain: 1.15,
      gradeSaturation: 1.12,
      nightLitCap: 0.35,
      nightGain: 0.85,
      bloomThreshold: 0.9,
      corridorDarken: 0.82,
      corridorRoofLift: 1.12,
      lineOpacity: 1,
      regionalGround: 0xa9a68e,
      regionalWater: 0x5b8fc4,
      regionalRoad: 0x6e6a5e,
    });
  });

  it("accepts base-map colours as decimal ?look= overrides", () => {
    const r = resolveLook("?look=regionalWater:6000000");
    assert.equal(r.regionalWater, 6000000);
    assert.equal(r.regionalGround, DEFAULT_LOOK.regionalGround);
  });
});

describe("fog ranges", () => {
  it("starts street fog at ≥2.5× the framed width", () => {
    assert.deepEqual(streetFogRange(300), { near: 750, far: 1800 });
    assert.deepEqual(streetFogRange(2000), { near: 5000, far: 12000 });
    assert.deepEqual(streetFogRange(null), { near: 750, far: 1800 });
    const r = streetFogRange(300, { ...DEFAULT_LOOK, fogStreetNear: 3 });
    assert.deepEqual(r, { near: 900, far: 1800 });
  });

  it("derives regional fog from the camera distance with far ≥ 6×", () => {
    assert.deepEqual(regionalFogRange(4000), { near: 8000, far: 24000 });
    for (const d of [500, 4000, 20000]) {
      const r = regionalFogRange(d);
      assert.ok(r.far >= 6 * d, `far ${r.far} >= 6×${d}`);
      assert.ok(r.near > d, `near ${r.near} beyond the target at ${d}`);
    }
    assert.deepEqual(regionalFogRange(null), { near: 8000, far: 24000 });
    const r = regionalFogRange(4000, { ...DEFAULT_LOOK, fogRegionalFar: 8 });
    assert.deepEqual(r, { near: 8000, far: 32000 });
  });
});

describe("night lit-fraction cap", () => {
  it("caps at 35% and stays in [0, 1]", () => {
    assert.equal(capLitFraction(0.9), 0.35);
    assert.equal(capLitFraction(0.35), 0.35);
    assert.equal(capLitFraction(0.2), 0.2);
    assert.equal(capLitFraction(0), 0);
    assert.equal(capLitFraction(-1), 0);
    assert.equal(capLitFraction(NaN), 0);
    assert.equal(capLitFraction(null), 0);
    assert.equal(capLitFraction(0.9, { ...DEFAULT_LOOK, nightLitCap: 0.2 }), 0.2);
  });
});

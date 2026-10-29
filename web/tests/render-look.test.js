// Stage-11 look table: ?look= parsing, street/regional fog ranges and
// the night lit-fraction cap — pure, no GPU needed.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_LOOK, PAINTED_LOOK, PAINTED_NIGHT_GROUND, capLitFraction, lerpHex, nightTint, paintedFogRange, parseLookParam, regionalFogRange,
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

  it("resolves ?look= over the style base (string or URLSearchParams)", () => {
    // 14e: painted is the default style; photo keeps the old defaults.
    const painted = { ...DEFAULT_LOOK, ...PAINTED_LOOK };
    assert.deepEqual(resolveLook(""), painted);
    assert.deepEqual(resolveLook(null), painted);
    assert.deepEqual(resolveLook(new URLSearchParams("")), painted);
    assert.deepEqual(resolveLook("", "photo"), DEFAULT_LOOK);
    assert.deepEqual(resolveLook("?style=photo"), DEFAULT_LOOK);
    assert.deepEqual(resolveLook("?style=painted"), painted);
    const r = resolveLook("?mode=sim&look=fogStreetFar:8,nightGain:0.9");
    assert.equal(r.fogStreetFar, 8);
    assert.equal(r.nightGain, 0.9);
    assert.equal(r.fogStreetNear, PAINTED_LOOK.fogStreetNear);
    const rp = resolveLook("?style=photo&look=fogStreetFar:8");
    assert.equal(rp.fogStreetFar, 8);
    assert.equal(rp.fogStreetNear, DEFAULT_LOOK.fogStreetNear);
    const s = resolveLook(new URLSearchParams("look=nope:1"));
    assert.deepEqual(s, painted);
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
      corridorDarken: 0.74,
      corridorRoofLift: 1.2,
      lineOpacity: 1,
      regionalGround: 0xbcb096,
      regionalWater: 0x3a8fd4,
      regionalRoad: 0x7d7668,
      terrainBase: 0xd2c9a9,
      terrainGrass: 0xbccb9c,
      terrainForest: 0x6f9a5e,
      terrainScrub: 0xc2c27e,
      terrainWater: 0x4d9fd6,
      terrainRock: 0xa09a8c,
      sceneRoad: 0x8a8276,
      sceneRoadMinor: 0x8a8276,
      sceneFoot: 0xe9e3d5,
      sceneCycle: 0xb97a5e,
      sceneRail: 0x55555c,
    });
  });

  it("accepts base-map colours as decimal ?look= overrides", () => {
    const r = resolveLook("?look=regionalWater:6000000");
    assert.equal(r.regionalWater, 6000000);
    assert.equal(r.regionalGround, PAINTED_LOOK.regionalGround);
    const p = resolveLook("?style=photo&look=regionalWater:6000000");
    assert.equal(p.regionalWater, 6000000);
    assert.equal(p.regionalGround, DEFAULT_LOOK.regionalGround);
  });

  it("pins the painted overrides (14e daytime targets, sRGB)", () => {
    assert.deepEqual(PAINTED_LOOK, {
      fogStreetNear: 4,
      fogStreetFar: 9,
      fogRegionalNear: 4,
      fogRegionalFar: 9,
      gradeSaturation: 1.2,
      nightLitCap: 0.65, // 17b: most residential floors lit at 21:00
      corridorDarken: 1, // 14f: no photo darkening on corridor tiles
      regionalGround: 0xcfc4ad,
      regionalWater: 0x3f6f8f,
      regionalRoad: 0x5b5d60,
      terrainBase: 0xcfc4ad,
      terrainGrass: 0x8a9a5b,
      terrainForest: 0x5d7040,
      terrainScrub: 0x9a8f5a,
      terrainWater: 0x3f6f8f,
      sceneRoad: 0x5b5d60,
      sceneRoadMinor: 0x6c6e70,
      sceneFoot: 0xd9d3c7,
      sceneCycle: 0xa0705a,
    });
    // Painted roads are near-neutral dark greys, never blue: the pinned
    // hexes carry at most a 5-step blue lead (warm-grey asphalt).
    for (const h of [PAINTED_LOOK.sceneRoad, PAINTED_LOOK.sceneRoadMinor]) {
      const r = (h >> 16) & 255;
      const g = (h >> 8) & 255;
      const b = h & 255;
      assert.ok(b - r <= 5 && b - g <= 5, `road ${h.toString(16)} not blue`);
      assert.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 8, `road ${h.toString(16)} grey`);
    }
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

  it("measures painted fog from the camera distance (14f: near = d+2w, far = d+6w)", () => {
    // Tour stop framing: 300 m wide at ~1070 m out — fog must start well
    // behind the target (old 4×-width near sat just behind it and tinted
    // the whole frame at the 10° painted FOV).
    assert.deepEqual(paintedFogRange(1070, 300), { near: 1670, far: 2870 });
    assert.deepEqual(paintedFogRange(6400, 1800), { near: 10000, far: 17200 });
    for (const [d, w] of [[500, 150], [2500, 700], [12000, 3500]]) {
      const r = paintedFogRange(d, w);
      assert.ok(r.near > d, `near ${r.near} beyond the target at ${d}`);
      assert.ok(r.far > r.near, "far beyond near");
    }
    assert.deepEqual(paintedFogRange(null, null), { near: 600, far: 1800 });
    assert.deepEqual(paintedFogRange(-50, 300), { near: 600, far: 1800 });
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

describe("painted fog + night (14e)", () => {
  it("fades only the far edge: near ≥ 4×, far ≥ 9×", () => {
    const look = resolveLook("", "painted");
    for (const w of [150, 300, 3500]) {
      const r = streetFogRange(w, look);
      assert.ok(r.near >= 4 * w, `street near ${r.near} >= 4×${w}`);
      assert.ok(r.far >= 9 * w, `street far ${r.far} >= 9×${w}`);
    }
    for (const d of [500, 4000, 20000]) {
      const r = regionalFogRange(d, look);
      assert.ok(r.near >= 4 * d, `regional near ${r.near} >= 4×${d}`);
      assert.ok(r.far >= 9 * d, `regional far ${r.far} >= 9×${d}`);
    }
  });

  it("lifts the corridor darkening in painted only (14f)", () => {
    assert.equal(resolveLook("", "painted").corridorDarken, 1);
    assert.equal(resolveLook("", "photo").corridorDarken, 0.74);
  });

  it("grades painted frames at 1.2 saturation", () => {
    assert.equal(resolveLook("", "painted").gradeSaturation, 1.2);
    assert.equal(resolveLook("", "photo").gradeSaturation, 1.12);
  });

  it("mixes plain colours for the night lerp", () => {
    assert.equal(PAINTED_NIGHT_GROUND, 0x1d2330);
    assert.equal(lerpHex(0xcfc4ad, PAINTED_NIGHT_GROUND, 0), 0xcfc4ad);
    assert.equal(lerpHex(0xcfc4ad, PAINTED_NIGHT_GROUND, 1), PAINTED_NIGHT_GROUND);
    const mid = lerpHex(0x000000, 0xffffff, 0.5);
    assert.ok(Math.abs(((mid >> 16) & 255) - 128) <= 1);
    assert.equal(lerpHex(0x111111, 0x222222, -1), 0x111111);
    assert.equal(lerpHex(0x111111, 0x222222, 2), 0x222222);
  });

  it("tints mapped surfaces white by day, night albedo at full night", () => {
    assert.deepEqual(nightTint(0xcfc4ad, PAINTED_NIGHT_GROUND, 0), [1, 1, 1]);
    const full = nightTint(0xcfc4ad, PAINTED_NIGHT_GROUND, 1);
    // Linear-space round trip: tint × lin(day) == lin(night).
    const lin = (u) => {
      const c = u / 255;
      return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    const day = [0xcf, 0xc4, 0xad];
    const night = [0x1d, 0x23, 0x30];
    for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(full[i] * lin(day[i]) - lin(night[i])) < 1e-9, `chan ${i}`);
      assert.ok(full[i] > 0 && full[i] < 1, `darkens chan ${i}`);
    }
  });
});

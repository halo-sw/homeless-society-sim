// 17c screen colours: the painted chain, resolved through the same
// functions the renderer uses (part 1: sim day view). Pure tests only —
// the capture URLs in briefs/17-RESULT.md carry the on-screen checks.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deltaE76, gradePixel, hexToU8, resolvePaintedPixel } from "../src/render/chain.js";
import { GRADE_LUMA, GRADE_WARM, PAINTED_NIGHT_GROUND, PAINTED_NIGHT_ROAD_GLOW,
  PAINTED_NIGHT_ROAD_LIT, PAINTED_NIGHT_ROAD_WARM, PAINTED_NIGHT_WALL,
  nightEmissiveHex } from "../src/render/look.js";
import { hexToLinearRgb } from "../src/palette.js";
import { toneMappingFor } from "../src/render/renderer.js";
import { MARKER_MIN_SCALE, STATION_DOT_PX, TRAIN_MARKER_PX,
  markerScaleFor } from "../src/journey.js";
import { distanceForWidth } from "../src/camera.js";

// Songpa-jamsil box centre (data bbox): the demo home-A area.
const LAT = 37.5132169;
const LON = 127.1001365;
// Sim ?day=1&t=08:50: start 2026-11-02, day index 0, minute 530.
const SIM_0850 = { date: new Date("2026-11-02T08:50:00+09:00"), minute: 530,
  lat: LAT, lon: LON, camDistM: 17000, framedWidthM: 3500, fog: "regional" };

const lumaU8 = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

describe("17c-1 sim view through the real chain", () => {
  it("renders the 08:50 sim ground within ΔE 10 of beige", () => {
    const g = resolvePaintedPixel(0xcfc4ad, SIM_0850);
    const dE = deltaE76(g.rgb, hexToU8(0xcfc4ad));
    assert.ok(dE <= 10, `ground ${g.rgb} ΔE ${dE.toFixed(2)}`);
  });

  it("renders roofs lighter than the sim ground", () => {
    const g = resolvePaintedPixel(0xcfc4ad, SIM_0850);
    const r = resolvePaintedPixel(0xddd8ce, SIM_0850);
    const diff = lumaU8(r.rgb) - lumaU8(g.rgb);
    assert.ok(diff >= 15, `roof ${r.rgb} vs ground ${g.rgb}: +${diff.toFixed(1)}`);
  });

  it("renders sim roads neutral grey, ≥ 25 levels under the ground", () => {
    const g = resolvePaintedPixel(0xcfc4ad, SIM_0850);
    const d = resolvePaintedPixel(0x5b5d60, SIM_0850);
    assert.ok(Math.abs(d.rgb[0] - d.rgb[2]) <= 10, `road ${d.rgb} not neutral`);
    const diff = lumaU8(g.rgb) - lumaU8(d.rgb);
    assert.ok(diff >= 25, `road/ground diff ${diff.toFixed(1)}`);
  });

  it("applies no fog at the sim camera distance (fog exonerated)", () => {
    const g = resolvePaintedPixel(0xcfc4ad, SIM_0850);
    assert.equal(g.fogF, 0);
  });

  it("keeps the albedo view beige with roofs ≥ 15 above ground", () => {
    const g = resolvePaintedPixel(0xcfc4ad, { ...SIM_0850, unlit: true });
    const dE = deltaE76(g.rgb, hexToU8(0xcfc4ad));
    assert.ok(dE <= 10, `albedo ground ${g.rgb} ΔE ${dE.toFixed(2)}`);
    const r = resolvePaintedPixel(0xddd8ce, { ...SIM_0850, unlit: true });
    const diff = lumaU8(r.rgb) - lumaU8(g.rgb);
    assert.ok(diff >= 15, `albedo roof/ground +${diff.toFixed(1)}`);
    const d = resolvePaintedPixel(0x5b5d60, { ...SIM_0850, unlit: true });
    assert.ok(Math.abs(d.rgb[0] - d.rgb[2]) <= 10, `albedo road ${d.rgb}`);
  });

  it("does not clip sunlit beige at noon", () => {
    const n = resolvePaintedPixel(0xcfc4ad,
      { date: new Date("2026-11-02T12:00:00+09:00"), minute: 720,
        lat: LAT, lon: LON, camDistM: 2800, framedWidthM: 700, fog: "painted" });
    assert.ok(Math.max(...n.rgb) < 255, `noon ground ${n.rgb} clips`);
  });
});

describe("17c-1 grade mirror + output transform", () => {
  it("pins the shared grade constants (GLSL is built from these)", () => {
    assert.deepEqual(GRADE_LUMA, [0.299, 0.587, 0.114]);
    assert.deepEqual(GRADE_WARM, [1.045, 1.005, 0.955]);
  });

  it("grades painted pixels neutrally (identity at sat 1, warm 0)", () => {
    for (const c of [[0.6, 0.55, 0.42], [0.1, 0.1, 0.12], [0.9, 0.8, 0.7]]) {
      assert.deepEqual(gradePixel(c, { saturation: 1, warmAmt: 0 }), c);
    }
  });

  it("warms highlights with the photo settings (the old brown push)", () => {
    const beige = [0.357, 0.247, 0.141]; // sunlit ground, linear
    const photo = gradePixel(beige, { saturation: 1.12, warmAmt: 1 });
    assert.ok(photo[0] > beige[0] && photo[2] < beige[2],
      `photo grade ${photo} should push R up, B down`);
  });

  it("tone-maps painted linearly, photo with AgX", async () => {
    const THREE = await import("three");
    assert.equal(toneMappingFor("painted"), THREE.LinearToneMapping);
    assert.equal(toneMappingFor("photo"), THREE.AgXToneMapping);
    assert.equal(toneMappingFor(""), THREE.AgXToneMapping);
  });
});

// Tour ?time=21:00: stop framing over the jamsil box.
const NIGHT_2100 = { date: new Date("2026-10-15T21:00:00+09:00"), minute: 1260,
  lat: LAT, lon: LON, camDistM: 1600, framedWidthM: 450, fog: "painted" };

describe("17c-2 night ground and roads visible", () => {
  it("self-lights entries to their own night albedo (glow wins)", () => {
    assert.equal(nightEmissiveHex({}), PAINTED_NIGHT_GROUND);
    assert.equal(nightEmissiveHex({ night: PAINTED_NIGHT_WALL }),
      PAINTED_NIGHT_WALL);
    assert.equal(nightEmissiveHex({ night: PAINTED_NIGHT_ROAD_WARM, glow: PAINTED_NIGHT_ROAD_LIT }),
      PAINTED_NIGHT_ROAD_LIT);
  });

  it("adds the lamp-lit road emissive in linear space", () => {
    // ROAD_LIT ≈ warm + glow (linear add); ±1.5 levels rounding slack.
    const warm = hexToLinearRgb(PAINTED_NIGHT_ROAD_WARM);
    const glow = hexToLinearRgb(PAINTED_NIGHT_ROAD_GLOW);
    const lit = hexToLinearRgb(PAINTED_NIGHT_ROAD_LIT);
    const linToU8 = (l) => {
      const c = Math.min(1, Math.max(0, l));
      const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
      return s * 255;
    };
    warm.forEach((w, i) => {
      assert.ok(Math.abs(linToU8(w + glow[i]) - linToU8(lit[i])) <= 1.5,
        `channel ${i}: warm+glow vs ROAD_LIT`);
    });
    const [r, , b] = hexToU8(PAINTED_NIGHT_ROAD_LIT);
    assert.ok(r > b, "lamp-lit road is warm");
  });

  it("renders the 21:00 ground at navy, each channel ±8", () => {
    const g = resolvePaintedPixel(PAINTED_NIGHT_GROUND,
      { ...NIGHT_2100, emissiveHex: nightEmissiveHex({}) });
    const want = hexToU8(PAINTED_NIGHT_GROUND);
    g.rgb.forEach((c, i) => {
      assert.ok(Math.abs(c - want[i]) <= 8, `ground ${g.rgb} vs navy ${want}`);
    });
  });

  it("renders night roads lighter and warmer than the ground (≥ 10)", () => {
    const g = resolvePaintedPixel(PAINTED_NIGHT_GROUND,
      { ...NIGHT_2100, emissiveHex: nightEmissiveHex({}) });
    const d = resolvePaintedPixel(PAINTED_NIGHT_ROAD_WARM, { ...NIGHT_2100,
      emissiveHex: nightEmissiveHex(
        { night: PAINTED_NIGHT_ROAD_WARM, glow: PAINTED_NIGHT_ROAD_LIT }) });
    const diff = lumaU8(d.rgb) - lumaU8(g.rgb);
    assert.ok(diff >= 10, `road ${d.rgb} vs ground ${g.rgb}: +${diff.toFixed(1)}`);
    assert.ok(d.rgb[0] - d.rgb[2] > g.rgb[0] - g.rgb[2], "roads warmer");
  });

  it("holds unlit night walls ≥ 15 levels above the ground", () => {
    const g = resolvePaintedPixel(PAINTED_NIGHT_GROUND,
      { ...NIGHT_2100, emissiveHex: nightEmissiveHex({}) });
    const w = resolvePaintedPixel(PAINTED_NIGHT_WALL, { ...NIGHT_2100, normalY: 0,
      emissiveHex: nightEmissiveHex({ night: PAINTED_NIGHT_WALL }) });
    const diff = lumaU8(w.rgb) - lumaU8(g.rgb);
    assert.ok(diff >= 15, `wall ${w.rgb} vs ground ${g.rgb}: +${diff.toFixed(1)}`);
  });

  it("applies no fog at the night stop distance (fog exonerated)", () => {
    const g = resolvePaintedPixel(PAINTED_NIGHT_GROUND,
      { ...NIGHT_2100, emissiveHex: nightEmissiveHex({}) });
    assert.equal(g.fogF, 0);
  });
});

describe("17c-3 smaller sim marker", () => {
  // Screen px of a world-height object at a camera distance.
  const pxFor = (worldH, scale, d, fov = 10, vh = 860) =>
    (worldH * scale * vh) / (2 * d * Math.tan((fov * Math.PI) / 180 / 2));

  it("pins the marker budgets (cone 28 px, dots 14 px)", () => {
    assert.equal(TRAIN_MARKER_PX, 28);
    assert.equal(STATION_DOT_PX, 14);
    assert.equal(MARKER_MIN_SCALE, 0.02);
  });

  it("clamps the cone to 28 px at street framing", () => {
    // Painted stop framing (450 m ≈ the journey street ends).
    const d = distanceForWidth(450, 10, 1.2);
    const s = markerScaleFor(d, 10, 860, 90, TRAIN_MARKER_PX);
    assert.ok(s < 1, `street scale ${s} should shrink the 90 m cone`);
    assert.ok(Math.abs(pxFor(90, s, d) - 28) < 0.5, `cone px ${pxFor(90, s, d)}`);
    const dots = markerScaleFor(d, 10, 860, 36, STATION_DOT_PX);
    assert.ok(pxFor(36, dots, d) <= 14.5, `dot px ${pxFor(36, dots, d)}`);
  });

  it("keeps the authored size at the cruise (already ≤ 28 px)", () => {
    const s = markerScaleFor(17000, 10, 860, 90, TRAIN_MARKER_PX);
    assert.equal(s, 1);
    assert.ok(pxFor(90, s, 17000) <= 28, `cruise cone px ${pxFor(90, s, 17000)}`);
  });

  it("clamps instead of vanishing or enlarging", () => {
    assert.equal(markerScaleFor(1e9, 10, 860, 90, 28), 1);
    assert.ok(markerScaleFor(5, 10, 860, 90, 28) >= MARKER_MIN_SCALE);
    for (const bad of [NaN, null, undefined, -3]) {
      const s = markerScaleFor(bad, 10, 860, 90, 28);
      assert.ok(Number.isFinite(s) && s >= MARKER_MIN_SCALE && s <= 1);
    }
  });
});

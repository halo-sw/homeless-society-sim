// 17c screen colours: the painted chain, resolved through the same
// functions the renderer uses (part 1: sim day view). Pure tests only —
// the capture URLs in briefs/17-RESULT.md carry the on-screen checks.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deltaE76, gradePixel, hexToU8, resolvePaintedPixel } from "../src/render/chain.js";
import { GRADE_LUMA, GRADE_WARM } from "../src/render/look.js";
import { toneMappingFor } from "../src/render/renderer.js";

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

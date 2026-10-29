// 17b polish from the laptop GPU capture: softer painted shade, darker
// roads (part 2), a lit night (part 3) and a readable regional view
// (part 4). Pure tests only — the capture URLs in briefs/17-RESULT.md
// carry the on-screen checks.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PAINTED_LIGHT, paintedSkyParams, shadeSunRatio,
  skyParams } from "../src/render/sky.js";
import { PAINTED_LOOK, resolveLook, srgbLumaU8 } from "../src/render/look.js";
import { buildRoadMeshes, hexToLinearRgb } from "../src/scene/roads.js";

// Seoul, autumn (the capture dates).
const LAT = 37.55;
const LON = 127.07;
const at = (hhmm, minute) =>
  skyParams(LAT, LON, new Date(`2026-10-15T${hhmm}:00+09:00`), minute);

const linToSrgbU8 = (l) => {
  const c = Math.min(1, Math.max(0, l));
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(s * 255);
};

describe("17b-2 painted day light values", () => {
  it("pins softer shadows (30 %) and a ×1.35 day fill boost", () => {
    assert.equal(PAINTED_LIGHT.shadowStrength, 0.3);
    assert.equal(PAINTED_LIGHT.hemiBoost, 1.35);
  });

  it("boosts the hemisphere fill by day, never at night", () => {
    const base = { dayF: 1, hemiSky: 0, hemiGround: 0, fogColor: 0,
      hemiIntensity: 0.85 };
    assert.ok(Math.abs(paintedSkyParams(base).hemiIntensity - 0.85 * 1.35) < 1e-9);
    const night = paintedSkyParams({ ...base, dayF: 0 });
    assert.ok(Math.abs(night.hemiIntensity - 0.85) < 1e-9);
  });

  it("keeps a shaded wall ≥ 55 % of the same wall in sun at 14:00", () => {
    const rig = paintedSkyParams(at("14:00", 840));
    assert.equal(rig.phase, "day");
    const look = resolveLook("", "painted");
    const ratio = shadeSunRatio(rig.sunIntensity * look.sunGain,
      rig.hemiIntensity * look.hemiGain, rig.shadowStrength);
    assert.ok(ratio >= 0.55, `shade/sun ratio ${ratio}`);
  });

  it("bounds the shade model (full shadow → fill only, no shadow → 1)", () => {
    assert.equal(shadeSunRatio(3, 1, 0), 1);
    assert.ok(Math.abs(shadeSunRatio(3, 1, 1) - 1 / 4) < 1e-9);
    assert.equal(shadeSunRatio(0, 0, 0.3), 1);
  });
});

describe("17b-2 dark asphalt roads", () => {
  it("writes painted arterial ribbons as linear #5b5d60", () => {
    const painted = resolveLook("", "painted");
    assert.equal(painted.sceneRoad, 0x5b5d60);
    const { meshes } = buildRoadMeshes(
      [{ k: "primary", n: null, w: 16, br: 0, p: [[0, 0], [4, 0]] }],
      () => 0, painted);
    const want = hexToLinearRgb(0x5b5d60);
    const [r, g, b] = meshes.road.colors.slice(0, 3);
    assert.ok(Math.abs(r - want[0]) < 1e-6
      && Math.abs(g - want[1]) < 1e-6 && Math.abs(b - want[2]) < 1e-6);
    // Linear values sit well below the old raw-sRGB lift (≈0.36).
    assert.ok(r < 0.15 && g < 0.16 && b < 0.17, `linear ${r},${g},${b}`);
  });

  it("round-trips ribbon colours back to the palette hex", () => {
    for (const hex of [0x5b5d60, PAINTED_LOOK.sceneRoadMinor, 0xe0b93c]) {
      const [r, g, b] = hexToLinearRgb(hex);
      assert.deepEqual([linToSrgbU8(r), linToSrgbU8(g), linToSrgbU8(b)],
        [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]);
    }
  });

  it("separates road asphalt from beige ground by ≥ 25 levels", () => {
    const diff = srgbLumaU8(0xcfc4ad) - srgbLumaU8(0x5b5d60);
    assert.ok(diff >= 25, `luma diff ${diff}`);
  });
});

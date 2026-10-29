// 17b polish from the laptop GPU capture: softer painted shade, darker
// roads (part 2), a lit night (part 3) and a readable regional view
// (part 4). Pure tests only — the capture URLs in briefs/17-RESULT.md
// carry the on-screen checks.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PAINTED_LIGHT, paintedSkyParams, shadeSunRatio,
  skyParams } from "../src/render/sky.js";
import { DEFAULT_LOOK, PAINTED_LOOK, PAINTED_NIGHT_GROUND,
  PAINTED_NIGHT_ROAD_GLOW, PAINTED_NIGHT_ROAD_WARM, PAINTED_NIGHT_WALL,
  capLitFraction, resolveLook, srgbLumaU8 } from "../src/render/look.js";
import { eveningHomeFraction, litFractionWithFallback,
  tourOfficeFraction } from "../src/render/facades.js";
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

describe("17b-3 lit night", () => {
  const painted = () => resolveLook("", "painted");

  it("lights ≥ 60 % of residential floors at 21:00 (any hash)", () => {
    assert.equal(eveningHomeFraction(1260), 0.9);
    for (const hash01 of [0, 0.25, 0.5, 0.75, 1]) {
      const frac = capLitFraction(litFractionWithFallback(null, {
        households: 10, globalHomeFrac: 0.9, hash01,
      }), painted());
      assert.ok(frac >= 0.6, `hash ${hash01}: lit ${frac}`);
    }
    assert.equal(painted().nightLitCap, 0.65);
    assert.equal(DEFAULT_LOOK.nightLitCap, 0.35); // photo untouched
  });

  it("lights offices fewer than residential, but some", () => {
    for (const hash01 of [0, 0.5, 1]) {
      const office = tourOfficeFraction(0.9, hash01);
      assert.ok(office > 0 && office < 0.6, `office ${office}`);
      assert.ok(office < capLitFraction(litFractionWithFallback(null, {
        households: 10, globalHomeFrac: 0.9, hash01,
      }), painted()));
    }
    assert.equal(tourOfficeFraction(0, 0.5), 0);
    assert.equal(tourOfficeFraction(0.9, 0.5), tourOfficeFraction(0.9, 0.5));
    // Empty buildings stay dark unless the tour passes an office share.
    assert.equal(litFractionWithFallback(null,
      { households: 0, globalHomeFrac: 0.9 }), 0);
    assert.equal(litFractionWithFallback(null,
      { households: 0, globalHomeFrac: 0.9, emptyFrac: 0.2 }), 0.2);
  });

  it("keeps the night road band lighter than the navy ground", () => {
    assert.ok(srgbLumaU8(PAINTED_NIGHT_ROAD_WARM)
      > srgbLumaU8(PAINTED_NIGHT_GROUND));
    const glowR = (PAINTED_NIGHT_ROAD_GLOW >> 16) & 255;
    const glowB = PAINTED_NIGHT_ROAD_GLOW & 255;
    assert.ok(glowR > glowB, "road glow is warm");
  });

  it("holds night walls a visible dark slate above the ground", () => {
    assert.equal(PAINTED_NIGHT_GROUND, 0x1d2330);
    const diff = srgbLumaU8(PAINTED_NIGHT_WALL)
      - srgbLumaU8(PAINTED_NIGHT_GROUND);
    assert.ok(diff >= 15, `wall/ground luma diff ${diff}`);
  });
});

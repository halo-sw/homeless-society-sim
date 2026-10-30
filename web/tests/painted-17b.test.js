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
  capLitFraction, litLumaU8, resolveLook, srgbLumaU8 } from "../src/render/look.js";
import { eveningHomeFraction, litFractionWithFallback,
  tourOfficeFraction } from "../src/render/facades.js";
import { buildRoadMeshes, hexToLinearRgb } from "../src/scene/roads.js";
import { CORRIDOR_BUILDING, CORRIDOR_ROOF, hexToRgb,
  tileBuildings } from "../src/corridor.js";

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
  it("pins softer shadows (30 %) and a uniform ×1.8 day gain", () => {
    assert.equal(PAINTED_LIGHT.shadowStrength, 0.3);
    // 17c: the fill-only ×1.35 is replaced by a uniform sun+fill gain
    // (the shade/sun ratio is gain-invariant, so the ≥ 55 % bar below
    // still holds with the same margin).
    assert.equal(PAINTED_LIGHT.dayLight, 1.8);
  });

  it("normalises the day gain to the 08:50 reference, never at night (17d)", () => {
    // 17d replaces the flat x1.8: sun and fill share one gain that holds
    // a sunlit horizontal surface at dayLight x refDayE, fading in by
    // dayF. The 08:50 calibration keeps the flat gain exactly; higher sun
    // reduces it, lower sun raises it; night passes through untouched.
    const cal = (hhmm, minute) => skyParams(37.5132169, 127.1001365,
      new Date(`2026-11-02T${hhmm}:00+09:00`), minute);
    const gainOf = (p) => paintedSkyParams(p).sunIntensity / p.sunIntensity;
    assert.ok(Math.abs(gainOf(cal("08:50", 530)) - 1.8) < 1e-6);
    assert.ok(gainOf(cal("11:00", 660)) < 1.8);
    assert.ok(gainOf(cal("14:00", 840)) < 1.8);
    assert.ok(gainOf(cal("17:00", 1020)) > 1.8);
    const base = { dayF: 1, altitude: 20, hemiSky: 0xf2ece0,
      hemiGround: 0xb9ad98, fogColor: 0xe2d8c4, sunColor: 0xffffff,
      sunIntensity: 3.0, hemiIntensity: 0.85 };
    const rig = paintedSkyParams(base);
    assert.ok(Math.abs(rig.sunIntensity / 3.0 - rig.hemiIntensity / 0.85) < 1e-9,
      "sun and fill still share one uniform gain");
    const night = paintedSkyParams({ ...base, dayF: 0 });
    assert.ok(Math.abs(night.hemiIntensity - 0.85) < 1e-9);
    assert.ok(Math.abs(night.sunIntensity - 3.0) < 1e-9);
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

describe("17b-4 readable regional view", () => {
  const painted = () => resolveLook("", "painted");

  it("keeps the painted base map free of the brown multiplier", () => {
    const l = painted();
    assert.equal(l.regionalGround, 0xcfc4ad);
    assert.equal(l.regionalRoad, 0x5b5d60);
    assert.equal(l.regionalWater, 0x3f6f8f);
    assert.equal(l.corridorDarken, 1);
  });

  it("extrudes corridor walls/roofs in the painted linear targets", () => {
    assert.deepEqual(CORRIDOR_BUILDING.map((v) => linToSrgbU8(v)),
      [0xc9, 0xc4, 0xbb]);
    assert.deepEqual(CORRIDOR_ROOF.map((v) => linToSrgbU8(v)),
      [0xdd, 0xd8, 0xce]);
    const tile = { id: "t_0",
      buildings: [{ h: 12,
        pts: [[127.0, 37.5], [127.001, 37.5], [127.001, 37.501], [127.0, 37.5]] }] };
    const soup = tileBuildings(tile, { lon: 127.0, lat: 37.5 });
    assert.deepEqual(soup.colors.slice(0, 3), CORRIDOR_BUILDING);
    const hasRoof = soup.colors.some((_, i) => i % 3 === 0
      && soup.colors[i] === CORRIDOR_ROOF[0]
      && soup.colors[i + 1] === CORRIDOR_ROOF[1]
      && soup.colors[i + 2] === CORRIDOR_ROOF[2]);
    assert.ok(hasRoof, "roof caps carry the roof target");
  });

  it("renders regional roads and the river true to the look table", () => {
    const l = painted();
    for (const hex of [l.regionalRoad, l.regionalWater]) {
      assert.deepEqual(hexToRgb(hex).map((v) => linToSrgbU8(v)),
        [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255]);
    }
  });

  it("separates roofs from ground by ≥ 15 and roads by ≥ 25 levels", () => {
    const l = painted();
    const roofDiff = srgbLumaU8(0xddd8ce) - srgbLumaU8(l.regionalGround);
    assert.ok(roofDiff >= 15, `roof/ground luma diff ${roofDiff}`);
    const roadDiff = srgbLumaU8(l.regionalGround) - srgbLumaU8(l.regionalRoad);
    assert.ok(roadDiff >= 25, `road/ground luma diff ${roadDiff}`);
  });

  it("separates shaded walls from sunlit ground by ≥ 15 at 08:50", () => {
    // Representative morning geometry: horizontal ground in full sun,
    // a vertical wall in cast shadow (half-sun incidence, half-sun
    // shadowed, half fill) — the faces a regional frame mostly shows.
    const rig = paintedSkyParams(at("08:50", 530));
    const l = painted();
    const S = rig.sunIntensity * l.sunGain;
    const H = rig.hemiIntensity * l.hemiGain;
    const exp = rig.exposure * l.exposureGain;
    const Eground = S * Math.sin((rig.altitude * Math.PI) / 180) + H;
    const Ewall = S * 0.5 * (1 - rig.shadowStrength) + H * 0.5;
    const diff = litLumaU8(l.regionalGround, Eground, exp)
      - litLumaU8(0xc9c4bb, Ewall, exp);
    assert.ok(diff >= 15, `wall/ground lit diff ${diff}`);
  });
});

// Sky/sun/lighting parameters from the sim clock (pure, no three.js).
//
// skyParams(lat, lon, date, minute) folds the solar position
// (lighting.js), the day/night mix and the dusk bump (sim.js) into one
// parameter set the browser rig (render/rig.js) applies to the sun,
// hemisphere fill, Sky uniforms, environment, exposure and bloom:
// day, golden hour, blue hour, night. Colours are 0xRRGGBB ints.

import { solarPosition } from "../lighting.js";
import { daylightFactor, duskFactor } from "../sim.js";
import { paintedFogRange, streetFogRange } from "./look.js";

export const PHASES = ["day", "golden", "blue", "night"];

// Day phase from solar altitude + wall-clock minute: golden covers the
// warm low-sun band morning and evening (the 16:30 capture sits in it),
// blue the after-sunset band down to −8° (the 18:30 capture), night below.
export function dayPhase(altitudeDeg, minute) {
  if (altitudeDeg <= -8) return "night";
  if (altitudeDeg <= 0) return "blue";
  const evening = minute >= 15 * 60 + 30;
  const morning = minute <= 8 * 60 + 30;
  if (altitudeDeg <= 25 && (evening || morning)) return "golden";
  return "day";
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function mixHex(h1, h2, t) {
  const r = Math.round(lerp((h1 >> 16) & 255, (h2 >> 16) & 255, t));
  const g = Math.round(lerp((h1 >> 8) & 255, (h2 >> 8) & 255, t));
  const b = Math.round(lerp(h1 & 255, h2 & 255, t));
  return (r << 16) | (g << 8) | b;
}

// Stage 14f painted light rig (sRGB): the photo hemisphere fill is blue
// (hemiSkyDay #b8cfe4, B−R = 44) and every standard material also takes
// blue diffuse IBL from the PMREM sky capture — with full-strength
// shadows, shade reads blue and roads/towers go blue-grey. Painted days
// use warm neutral fill, a warm haze fog, soft shadows and no sky IBL.
// 17b: the laptop capture still read shaded walls near-black, so shadows
// soften to 30 % and the day hemisphere fill gains ×1.35.
export const PAINTED_LIGHT = {
  hemiSky: 0xf2ece0,
  hemiGround: 0xb9ad98,
  fog: 0xe2d8c4,
  shadowStrength: 0.3,
  hemiBoost: 1.35,
};

// Painted override over skyParams (pure): hemi/fog colours blend to the
// warm rig by daylight so dawn/dusk stay continuous (full warm at dayF 1,
// untouched photo colours at night); shadows sit at 30 %, the fill gains
// the boost by day, and the blue sky environment switches off.
// Bloom/emissive/nightF/phase pass through.
export function paintedSkyParams(p) {
  const dayF = Math.min(1, Math.max(0, Number(p.dayF) || 0));
  return {
    ...p,
    hemiSky: mixHex(p.hemiSky, PAINTED_LIGHT.hemiSky, dayF),
    hemiGround: mixHex(p.hemiGround, PAINTED_LIGHT.hemiGround, dayF),
    fogColor: mixHex(p.fogColor, PAINTED_LIGHT.fog, dayF),
    hemiIntensity: (Number(p.hemiIntensity) || 0)
      * (1 + (PAINTED_LIGHT.hemiBoost - 1) * dayF),
    shadowStrength: PAINTED_LIGHT.shadowStrength,
    envIntensity: 0,
  };
}

// Diffuse irradiance on one wall in cast shadow vs the same wall in sun:
// the sun term scales by (1−shadow) while the hemisphere fill stays, so
// the ratio is (S×(1−s)+H)/(S+H). 17b acceptance: ≥ 0.55 at 14:00.
export function shadeSunRatio(sunI, hemiI, shadow) {
  const s = Math.max(0, Number(sunI) || 0);
  const h = Math.max(0, Number(hemiI) || 0);
  const k = Math.min(1, Math.max(0, Number(shadow) || 0));
  return s + h > 0 ? (s * (1 - k) + h) / (s + h) : 1;
}

export const SKY_COLORS = {
  sunDay: 0xffe9c8, // stage 6: crisper midday, warmer sun
  sunGolden: 0xffb377,
  sunNight: 0x93a0cc, // moonlight
  hemiSkyDay: 0xb8cfe4,
  hemiSkyNight: 0x2a3358,
  hemiGroundDay: 0x877c66, // deeper shade under the warm sun
  hemiGroundNight: 0x1c2036,
  skyDay: 0x87a9c8, // fallback clear colour (Sky mesh covers it by day)
  skyGolden: 0xc99a78,
  skyBlue: 0x44548f, // blue hour: brighter blue, distinct from night
  skyNight: 0x1a2650, // deep blue, not black
  fogDay: 0xd9dee2,
  fogGolden: 0xd8b49a,
  fogBlue: 0x525f8a,
  fogNight: 0x232c52,
};

export function skyParams(lat, lon, date, minute) {
  const { altitude, azimuth } = solarPosition(lat, lon, date);
  const dayF = daylightFactor(altitude);
  const nightF = 1 - dayF;
  const duskF = duskFactor(minute);
  const phase = dayPhase(altitude, minute);

  // Sun: warm at low altitude, moonlight at night.
  const lowSun = Math.min(1, Math.max(0, 1 - altitude / 30)); // 1 at horizon
  const sunColor = nightF > 0.98
    ? SKY_COLORS.sunNight
    : mixHex(mixHex(SKY_COLORS.sunDay, SKY_COLORS.sunGolden, Math.min(1, lowSun + duskF * 0.6)), SKY_COLORS.sunNight, nightF);
  const sunIntensity = lerp(0.12, 3.0, dayF);

  // Hemisphere fill follows the same mix.
  const hemiSky = mixHex(SKY_COLORS.hemiSkyNight, SKY_COLORS.hemiSkyDay, dayF);
  const hemiGround = mixHex(SKY_COLORS.hemiGroundNight, SKY_COLORS.hemiGroundDay, dayF);
  const hemiIntensity = lerp(0.5, 0.85, dayF);

  // Sky dome uniforms (Preetham): hazier at golden hour.
  const turbidity = phase === "golden" ? 6.5 : phase === "day" ? 4.5 : 3.0;
  const rayleigh = phase === "golden" ? 2.2 : phase === "day" ? 1.2 : 0.6;

  // Background / fog: Sky mesh by day, flat colours at blue/night.
  const skyColor = phase === "night" ? SKY_COLORS.skyNight
    : phase === "blue" ? SKY_COLORS.skyBlue
    : phase === "golden" ? SKY_COLORS.skyGolden : SKY_COLORS.skyDay;
  const fogColor = phase === "night" ? SKY_COLORS.fogNight
    : phase === "blue" ? SKY_COLORS.fogBlue
    : phase === "golden" ? SKY_COLORS.fogGolden : SKY_COLORS.fogDay;

  return {
    altitude, azimuth, phase, dayF, nightF, duskF,
    sunColor, sunIntensity, hemiSky, hemiGround, hemiIntensity,
    turbidity, rayleigh,
    skyColor, fogColor,
    skyVisible: phase === "day" || phase === "golden",
    exposure: lerp(0.9, 1.12, dayF),
    envIntensity: lerp(0.12, 0.55, dayF),
    // Bloom only at night/dusk (lit windows, street lamps).
    bloom: Math.min(1, nightF * 0.9 + duskF * 0.35),
    // Emissive gate: windows/lamps dark by day.
    emissive: nightF >= 0.05 || duskF >= 0.35 ? Math.min(1, nightF + duskF * 0.5) : 0,
  };
}

// Fog is distance cueing only: it starts beyond 2.5× the framed width so
// the stop framing itself stays crisp (1.5× read milky), and ends at 6×
// so the skyline melts into the sky colour. Pure; the rig applies it per
// frame. Factors live in the look table (render/look.js).
// Stage 14f: painted style measures from the camera distance instead — at
// the 10° FOV the camera sits ~3.6× the framed width away, so a pure
// width multiple starts fog just behind the target and tints the frame.
// Photo passes no opts and keeps the width multiples exactly.
export function fogRangeFor(framedWidthM, look, { style = "photo", camDistM = null } = {}) {
  const hasDist = camDistM !== null && camDistM !== undefined && camDistM !== ""
    && Number.isFinite(Number(camDistM));
  if (style === "painted" && hasDist) {
    return paintedFogRange(camDistM, framedWidthM);
  }
  return streetFogRange(framedWidthM, look);
}

// Sky/sun/lighting parameters from the sim clock (pure, no three.js).
//
// skyParams(lat, lon, date, minute) folds the solar position
// (lighting.js), the day/night mix and the dusk bump (sim.js) into one
// parameter set the browser rig (render/rig.js) applies to the sun,
// hemisphere fill, Sky uniforms, environment, exposure and bloom:
// day, golden hour, blue hour, night. Colours are 0xRRGGBB ints.

import { solarPosition } from "../lighting.js";
import { daylightFactor, duskFactor } from "../sim.js";

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

// Fog is distance cueing only: it starts beyond 1.5× the framed width so
// the stop framing itself stays crisp, and ends at 6× so the skyline
// melts into the sky colour. Pure; the rig applies it per frame.
export function fogRangeFor(framedWidthM) {
  const w = Math.max(50, Number(framedWidthM) || 300);
  return { near: w * 1.5, far: w * 6 };
}

// Painted pixel chain (pure, no three.js): resolves one flat albedo hex
// through the same functions the renderer uses, so tests predict the
// on-screen colour instead of modelling it twice. Stage 17c.
//
// Chain order (matching the composer: Render → AO → Kuwahara → Outline →
// Bloom → Grade → Output, and the direct render for ?debug=albedo/low):
//  1. sun + hemisphere irradiance from skyParams/paintedSkyParams with
//     the look-table gains (rig.js applies the same);
//  2. Lambert diffuse (÷ π) plus material emissive (night self-lit);
//  3. linear fog mix at the camera distance (regional/painted ranges);
//  4. grade (a line-by-line mirror of the GradeShader GLSL, sharing its
//     constants — GLSL cannot run in Node; same precedent as outlineEdge)
//     at the frame centre (vignette = 1, grain off);
//  5. Linear output transform (× exposure, saturate — exact) + sRGB.
//
// Assumed flat and centre-frame: AO/Kuwahara/outline/bloom are identity
// on a featureless patch (no depth steps, no variance, day threshold),
// and vignette is 1 at the centre. ?debug=albedo skips 1–4: the sweep
// swaps unlit basic materials and direct-renders (unlit:true below).
import { skyParams, paintedSkyParams } from "./sky.js";
import { DEFAULT_LOOK, GRADE_LUMA, GRADE_WARM, GRADE_WARM_HI, GRADE_WARM_LO,
  paintedFogRange, regionalFogRange, resolveLook } from "./look.js";

// Fixed moon direction y (rig.js MOON_DIR (0.55, 0.75, 0.35) normalized):
// the flat-ground NdotL once the sun is down.
export const MOON_DIR_Y = 0.75 / Math.hypot(0.55, 0.75, 0.35);

export function srgbU8ToLinear(u8) {
  const c = Math.min(1, Math.max(0, u8 / 255));
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export function linearToSrgbU8(l) {
  const c = Math.min(1, Math.max(0, l));
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(s * 255);
}

export function hexToU8(hex) {
  const h = Number(hex) || 0;
  return [(h >> 16) & 255, (h >> 8) & 255, h & 255];
}

export function hexToLinear(hex) {
  return hexToU8(hex).map(srgbU8ToLinear);
}

// Grade mirror (linear in/out): luma → warm-highlights gate → saturation.
// warmAmt is the GradeShader `warm` uniform (photo 1, painted 0).
export function gradePixel([r, g, b], { saturation = 1, warmAmt = 0 } = {}) {
  const l = GRADE_LUMA[0] * r + GRADE_LUMA[1] * g + GRADE_LUMA[2] * b;
  const t = Math.min(1, Math.max(0,
    (l - GRADE_WARM_LO) / (GRADE_WARM_HI - GRADE_WARM_LO)));
  const hi = t * t * (3 - 2 * t);
  const w = [r * (1 + (GRADE_WARM[0] - 1) * hi * warmAmt),
    g * (1 + (GRADE_WARM[1] - 1) * hi * warmAmt),
    b * (1 + (GRADE_WARM[2] - 1) * hi * warmAmt)];
  return w.map((q) => l + (q - l) * saturation);
}

// sRGB u8 → CIE Lab (D65), and the CIE76 ΔE between two u8 triplets.
export function srgbU8ToLab([r, g, b]) {
  const rl = srgbU8ToLinear(r);
  const gl = srgbU8ToLinear(g);
  const bl = srgbU8ToLinear(b);
  const f = (t) => (t > 0.008856 ? Math.pow(t, 1 / 3) : 7.787 * t + 16 / 116);
  const X = f((0.4124 * rl + 0.3576 * gl + 0.1805 * bl) / 0.95047);
  const Y = f(0.2126 * rl + 0.7152 * gl + 0.0722 * bl);
  const Z = f((0.0193 * rl + 0.1192 * gl + 0.9505 * bl) / 1.08883);
  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}

export function deltaE76(a, b) {
  const A = srgbU8ToLab(a);
  const B = srgbU8ToLab(b);
  return Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
}

// Full painted pixel. `fog` picks the range function the frame uses
// ("regional" for the sim journey cruise, "painted" for tour/street).
// `normalY`: 1 = flat/up-facing, 0 = vertical-face average. `shadowed`
// scales the sun term by (1 − shadowStrength). `unlit` reproduces the
// ?debug=albedo direct render (albedo × exposure, no light/grade).
export function resolvePaintedPixel(albedoHex, {
  date, minute, lat, lon,
  normalY = 1,
  shadowed = false,
  emissiveHex = 0x000000,
  camDistM = 17000,
  framedWidthM = 3500,
  fog = "regional",
  unlit = false,
  look = null,
} = {}) {
  const l = look || resolveLook("", "painted");
  const base = skyParams(lat, lon, date, minute);
  const p = paintedSkyParams(base);
  const exp = p.exposure * (Number(l.exposureGain) || 1);
  if (unlit) {
    const v = hexToLinear(albedoHex).map((q) => Math.min(1, q * exp));
    return { rgb: v.map(linearToSrgbU8), fogF: 0, exp,
      EdivPi: [0, 0, 0], phase: base.phase, dayF: base.dayF };
  }
  const sunI = p.sunIntensity * (Number(l.sunGain) || 1);
  const hemiI = p.hemiIntensity * (Number(l.hemiGain) || 1);
  const sunC = hexToLinear(p.sunColor);
  const hemiC = hexToLinear(p.hemiSky);
  const hemiG = hexToLinear(p.hemiGround);
  const flat = normalY === 1;
  // Same rule as the rig: clamped solar sine by day, moon dir at night.
  const sunY = base.altitude > -1
    ? Math.max(Math.sin((base.altitude * Math.PI) / 180), 0.03)
    : MOON_DIR_Y;
  const ndotl = flat ? sunY : 0.5;
  const shade = shadowed ? 1 - (Number(p.shadowStrength) || 0) : 1;
  const E = [0, 1, 2].map((i) => sunI * ndotl * shade * sunC[i]
    + hemiI * (flat ? hemiC[i] : (hemiC[i] + hemiG[i]) / 2));
  const alb = hexToLinear(albedoHex);
  const emis = hexToLinear(emissiveHex);
  let v = alb.map((a, i) => (a * E[i]) / Math.PI + emis[i]);
  const range = fog === "painted"
    ? paintedFogRange(camDistM, framedWidthM)
    : regionalFogRange(camDistM, l);
  const fogF = Math.min(1, Math.max(0,
    (camDistM - range.near) / Math.max(1, range.far - range.near)));
  const fogC = hexToLinear(p.fogColor);
  v = v.map((q, i) => q + (fogC[i] - q) * fogF);
  v = gradePixel(v, { saturation: Number(l.gradeSaturation) || 1, warmAmt: 0 });
  v = v.map((q) => Math.min(1, q * exp));
  return { rgb: v.map(linearToSrgbU8), fogF, exp,
    EdivPi: E.map((e) => e / Math.PI), phase: base.phase, dayF: base.dayF };
}

export { skyParams, paintedSkyParams, DEFAULT_LOOK };

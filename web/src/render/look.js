// Look table (pure, no three.js, no DOM): every tunable behind the
// stage-11 render polish in one place, so the orchestrator can retune on
// the real GPU with `?look=key:value,…` without a rebuild.
//
// Keys (all numbers):
// - fogStreetNear / fogStreetFar: street-view fog as multiples of the
//   framed width (the rig applies them every frame).
// - fogRegionalNear / fogRegionalFar: journey regional-view fog as
//   multiples of the camera-to-target distance (not altitude).
// - sunGain / hemiGain / exposureGain / rayleighGain / gradeSaturation:
//   day-contrast multipliers over the sky params (sky.js keeps its own
//   contract and tests; the rig applies these).
// - nightLitCap: at most this share of windows lit on any tower.
// - nightGain: facade emissive multiplier (uniform, was baked 1.15).
// - bloomThreshold: UnrealBloomPass threshold — above window brightness
//   so only lamps bloom.
// - corridorDarken: journey-tile building multiplier (material colour).
// - corridorRoofLift: journey-tile roof-cap lift over the walls, so
//   blocks separate from each other and the ground.
// - lineOpacity: journey-line opacity.
// - regionalGround / regionalWater / regionalRoad: the journey base-map
//   colours as decimal sRGB ints (e.g. regionalWater:6000000), so the
//   `?look=` number parser accepts them.
// - terrainBase / terrainGrass / terrainForest / terrainScrub /
//   terrainWater / terrainRock: stage-14 land-mask + slope colours.
// - sceneRoad / sceneFoot / sceneCycle / sceneRail: stage-14 ribbon
//   colours. All colours are decimal sRGB ints like regionalGround.
// - sceneRoadMinor: residential/service ribbon tone (major roads keep
//   sceneRoad). Equals sceneRoad in the photo default.

export const DEFAULT_LOOK = {
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
};

// Stage 14e painted style: overrides on top of DEFAULT_LOOK (never blue
// roads, warm beige ground, deep greens, calm water). Picked by ?style=
// (painted is the default); ?look= still overrides on top of these.
export const PAINTED_LOOK = {
  fogStreetNear: 4,
  fogStreetFar: 9,
  fogRegionalNear: 4,
  fogRegionalFar: 9,
  // 17c: neutral grade — the palette already carries the look. The photo
  // 1.2 saturation + warm highlights pushed every sunlit flat ~15 levels
  // toward brown on the GPU capture (blue −18 % through the grade alone).
  gradeSaturation: 1.0,
  // 17b: residential towers read most floors lit at 21:00 (the photo cap
  // 0.35 would pin every tower at a third); 0.65 still keeps dark gaps.
  nightLitCap: 0.65,
  // 14f: lift the photo corridor darkening (0.74 → grey blocks) — the
  // tile walls/roofs (≈ #c9c2b3 / lighter caps) already sit on the painted
  // wall/roof split, and outlines now separate the blocks. Base-map
  // ground/water/roads below already carry the painted targets.
  corridorDarken: 1,
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
};

// Painted night albedos (stage 14e): the ground plane goes dark navy
// while carriageways keep a warm lamp-lit band and walls a dark slate,
// so lit windows pop without the blocks going black. Applied as a
// material tint/colours lerp in main.js (painted style only).
// Grade-shader constants (single source of truth: post.js builds the
// GLSL from these, chain.js mirrors the math for the 17c pixel tests).
// Luma weights are Rec.601; the warm triplet scales highlights only.
export const GRADE_LUMA = [0.299, 0.587, 0.114];
export const GRADE_WARM = [1.045, 1.005, 0.955];
export const GRADE_WARM_LO = 0.45;
export const GRADE_WARM_HI = 1.0;

export const PAINTED_NIGHT_GROUND = 0x1d2330;
export const PAINTED_NIGHT_ROAD = 0x39415a;
export const PAINTED_NIGHT_ROAD_WARM = 0x4a4136;
export const PAINTED_NIGHT_ROAD_GLOW = 0x2a2118;
export const PAINTED_NIGHT_WALL = 0x3a4152;
export const PAINTED_WATER = 0x3f6f8f;

export const LOOK_KEYS = Object.keys(DEFAULT_LOOK);

// Parse `?look=` payloads ("fogStreetFar:8,nightGain:0.9"; `=` also
// accepted). Unknown keys and non-finite values are reported and
// ignored — the table keeps its defaults for them.
export function parseLookParam(text) {
  const values = {};
  const unknown = [];
  const invalid = [];
  for (const part of String(text || "").split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const m = /^([A-Za-z]+)\s*[:=]\s*(-?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?)$/.exec(trimmed);
    if (!m) {
      invalid.push(trimmed);
      continue;
    }
    const [, key, raw] = m;
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_LOOK, key)) {
      unknown.push(key);
      continue;
    }
    const v = Number(raw);
    if (!Number.isFinite(v)) {
      invalid.push(trimmed);
      continue;
    }
    values[key] = v;
  }
  return { values, unknown, invalid };
}

// Merge `?look=` overrides over the style base. Accepts a query string,
// a URLSearchParams, or nothing. `style` ("painted" | "photo") defaults
// to the ?style= param (painted when absent); an explicit style wins.
// ?look= always overrides on top of the style base.
export function resolveLook(search, style = null) {
  const params = search instanceof URLSearchParams
    ? search
    : new URLSearchParams(typeof search === "string" ? search : "");
  const st = style ?? (params.get("style") === "photo" ? "photo" : "painted");
  const base = st === "photo" ? DEFAULT_LOOK : { ...DEFAULT_LOOK, ...PAINTED_LOOK };
  const raw = params.get("look");
  if (!raw) return { ...base };
  const { values } = parseLookParam(raw);
  return { ...base, ...values };
}

function num(v, fallback) {
  if (v === null || v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

// Street fog: distance cueing only — it starts at 2.5× the framed width
// so the stop framing itself stays crisp (was 1.5×, milky), ends at 6×.
export function streetFogRange(framedWidthM, look = DEFAULT_LOOK) {
  const w = Math.max(50, num(framedWidthM, 300));
  const l = look || DEFAULT_LOOK;
  return {
    near: w * num(l.fogStreetNear, DEFAULT_LOOK.fogStreetNear),
    far: w * num(l.fogStreetFar, DEFAULT_LOOK.fogStreetFar),
  };
}

// Painted fog from the camera distance, not the framed width: at the 10°
// painted FOV the camera sits ~3.6× the framed width away, so a pure
// width-multiple starts fog just behind the target and tints the frame.
// near = camDist + 2×width, far = camDist + 6×width. Photo unchanged.
export function paintedFogRange(camDistM, framedWidthM) {
  const d = Math.max(0, num(camDistM, 0));
  const w = Math.max(50, num(framedWidthM, 300));
  return { near: d + 2 * w, far: d + 6 * w };
}

// Regional fog from the live camera-to-target distance (not altitude):
// the line, the train and the stations stay clear of the haze while the
// horizon still melts. Far is always ≥ 6× the distance.
export function regionalFogRange(camDistM, look = DEFAULT_LOOK) {
  const d = Math.max(100, num(camDistM, 4000));
  const l = look || DEFAULT_LOOK;
  return {
    near: d * num(l.fogRegionalNear, DEFAULT_LOOK.fogRegionalNear),
    far: d * num(l.fogRegionalFar, DEFAULT_LOOK.fogRegionalFar),
  };
}

// Cap the night lit fraction: a lit tower shows a window grid with dark
// gaps, never a solid block (fraction still comes from residents home).
export function capLitFraction(frac, look = DEFAULT_LOOK) {
  const n = Number(frac);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const l = look || DEFAULT_LOOK;
  const cap = num(l.nightLitCap, DEFAULT_LOOK.nightLitCap);
  if (!(cap > 0)) return 0;
  return Math.min(1, Math.min(n, cap));
}

// Rec.601 luma of an sRGB hex in 0..255 levels (the same weights as the
// grade shader): 17b separation checks read through this helper.
export function srgbLumaU8(hex) {
  const h = Number(hex) || 0;
  return 0.299 * ((h >> 16) & 255) + 0.587 * ((h >> 8) & 255) + 0.114 * (h & 255);
}

// On-screen luma of an albedo hex under scalar diffuse irradiance E
// (three.js-style: out = lin(albedo) × E × exposure / π, gamma-encoded,
// no tone map — a comparison model for separation tests, not a render).
export function litLumaU8(hex, E, exposure = 1) {
  const h = Number(hex) || 0;
  const k = Math.max(0, Number(E) || 0) * Math.max(0, Number(exposure) || 0) / Math.PI;
  const chan = (u8) => linToSrgb01(srgbLin(u8) * k) * 255;
  return 0.299 * chan((h >> 16) & 255)
    + 0.587 * chan((h >> 8) & 255) + 0.114 * chan(h & 255);
}

function linToSrgb01(l) {
  const c = Math.min(1, Math.max(0, l));
  return c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

// Mix two 0xRRGGBB colours (t clamped to 0..1, smoothstepped): the
// painted night lerp for plain-colour materials (no map).
export function lerpHex(h1, h2, t) {
  const k = smooth01(t);
  const r = Math.round(lerpChan((h1 >> 16) & 255, (h2 >> 16) & 255, k));
  const g = Math.round(lerpChan((h1 >> 8) & 255, (h2 >> 8) & 255, k));
  const b = Math.round(lerpChan(h1 & 255, h2 & 255, k));
  return (r << 16) | (g << 8) | b;
}

function lerpChan(a, b, k) {
  return a + (b - a) * k;
}

function smooth01(t) {
  const c = Math.min(1, Math.max(0, Number(t) || 0));
  return c * c * (3 - 2 * c);
}

// Linear-space material tint multiplier that carries a mapped or
// vertex-coloured surface from its day albedo (dayHex reference) to
// nightHex at full night: white at t=0, lin(night)/lin(day) per channel
// at t=1. Applied via Color.setRGB (working-space values), so the
// effective albedo lands exactly on nightHex.
export function nightTint(dayHex, nightHex, t) {
  const k = smooth01(t);
  const chan = (d, n) => {
    const dl = srgbLin(d);
    const target = dl > 0 ? srgbLin(n) / dl : 0;
    return 1 + (target - 1) * k;
  };
  return [
    chan((dayHex >> 16) & 255, (nightHex >> 16) & 255),
    chan((dayHex >> 8) & 255, (nightHex >> 8) & 255),
    chan(dayHex & 255, nightHex & 255),
  ];
}

function srgbLin(u8) {
  const c = Math.min(1, Math.max(0, u8 / 255));
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

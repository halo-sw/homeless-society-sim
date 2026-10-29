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
  corridorDarken: 0.82,
  corridorRoofLift: 1.12,
  lineOpacity: 1,
  regionalGround: 0xa9a68e,
  regionalWater: 0x5b8fc4,
  regionalRoad: 0x6e6a5e,
};

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

// Merge `?look=` overrides over the defaults. Accepts a query string,
// a URLSearchParams, or nothing (defaults).
export function resolveLook(search) {
  const params = search instanceof URLSearchParams
    ? search
    : new URLSearchParams(typeof search === "string" ? search : "");
  const raw = params.get("look");
  if (!raw) return { ...DEFAULT_LOOK };
  const { values } = parseLookParam(raw);
  return { ...DEFAULT_LOOK, ...values };
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

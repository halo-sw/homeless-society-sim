// Render quality levels (pure, no three.js).
//
// ?q=high|medium|low (default medium). The browser seam auto-drops to
// low when the first 60 frames average below 25 fps (SwiftShader
// captures) and logs draw calls / triangles / frame time.

export const QUALITY_LEVELS = ["high", "medium", "low"];

export const QUALITY_SETTINGS = {
  high: {
    // Stage 6: composer MSAA is OFF even on high. ?q=high rendered a
    // fully black canvas on the real GPU (ANGLE Metal) while SwiftShader
    // rendered it; the only high-vs-medium deltas were SAO + MSAA(4) +
    // pixelRatio 2, and the MSAA HalfFloat-target × SAO readBuffer
    // write-back combo is the prime suspect. AA loss at pixelRatio 2 is
    // minor; a black screen is not. The renderer also carries a
    // black-frame guard that drops high→medium if the framebuffer ever
    // reads back uniform (see renderFrameGuard).
    pixelRatio: 2, shadowMapSize: 2048, composer: true, composerSamples: 0,
    sao: true, bloom: true, tiltShift: true, grain: false,
  },
  medium: {
    pixelRatio: 1.5, shadowMapSize: 2048, composer: true, composerSamples: 0,
    sao: false, bloom: true, tiltShift: true, grain: false,
  },
  low: {
    pixelRatio: 1, shadowMapSize: 1024, composer: false, composerSamples: 0,
    sao: false, bloom: false, tiltShift: false, grain: false,
  },
};

export const AUTO_DROP_FRAMES = 60;
export const AUTO_DROP_FPS = 25;

export function parseQuality(params) {
  const q = params.get("q");
  if (q === "high" || q === "medium" || q === "low") return q;
  return "medium";
}

export function qualitySettings(level) {
  return QUALITY_SETTINGS[level] || QUALITY_SETTINGS.medium;
}

// True when the opening frame-time sample (ms per frame) averages below
// the fps floor: the seam then rebuilds at low.
export function shouldDropToLow(frameTimesMs) {
  if (!Array.isArray(frameTimesMs) || frameTimesMs.length < AUTO_DROP_FRAMES) return false;
  const sample = frameTimesMs.slice(0, AUTO_DROP_FRAMES);
  const avg = sample.reduce((a, b) => a + b, 0) / sample.length;
  return 1000 / avg < AUTO_DROP_FPS;
}

// Resolve the quality after the opening sample (never upgrades).
export function effectiveQuality(initial, frameTimesMs) {
  if (initial === "low") return "low";
  return shouldDropToLow(frameTimesMs) ? "low" : initial;
}

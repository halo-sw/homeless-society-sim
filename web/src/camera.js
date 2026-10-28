// Miniature tour camera framing (pure, no three.js).
//
// The tour reads as an architectural miniature: narrow field of view,
// 40-50° downward pitch, and the stop's complex plus its surroundings
// readable in frame — ~250-350 m across at stops, ~400-600 m during
// glides. main.js converts these metres into camera offsets; the maths
// stays here so it is unit-testable.

export const TOUR_FOV_DEG = 24;
export const TOUR_PITCH_DEG = 45;
export const STOP_FRAME_M = 300;
export const GLIDE_FRAME_M = 500;
// Camera azimuth: offset direction (x east, z south-positive in the
// x-right/z-towards-viewer sense main.js uses), unnormalized.
export const TOUR_AZIMUTH = [0.45, 0.75];

// Visible frame width (m) at the target for a perspective camera.
export function frameWidthFor(distance, fovDeg, aspect) {
  return 2 * distance * Math.tan(((fovDeg * Math.PI) / 180) / 2) * aspect;
}

// Camera distance (m) needed to frame `width` metres across.
export function distanceForWidth(width, fovDeg, aspect) {
  return width / (2 * Math.tan(((fovDeg * Math.PI) / 180) / 2) * aspect);
}

// [dx, dy, dz] camera offset for a target, pitch looking down.
export function tourOffset(distance, pitchDeg = TOUR_PITCH_DEG,
                           azimuth = TOUR_AZIMUTH) {
  const len = Math.hypot(azimuth[0], azimuth[1]) || 1;
  const horiz = distance * Math.cos((pitchDeg * Math.PI) / 180);
  const vert = distance * Math.sin((pitchDeg * Math.PI) / 180);
  return [(horiz * azimuth[0]) / len, vert, (horiz * azimuth[1]) / len];
}

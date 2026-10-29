// Shared height function (pure, no three.js).
//
// makeHeightAt(terrain) mirrors pipeline/scene_geo.py: bilinear over the
// decimetre grid, edges clamped. terrain, roads, water, trees, buildings,
// walkers, route lines and the camera rig all read this one function.
// flatHeightAt() is the no-scene.json fallback (songpa gu, map-sim).

export function flatHeightAt() {
  return () => 0;
}

export function makeHeightAt(terrain) {
  const { x0, z0, step, nx, nz, dm } = terrain;
  return (x, z) => {
    let fx = (x - x0) / step;
    let fz = (z - z0) / step;
    fx = Math.min(Math.max(fx, 0), nx - 1);
    fz = Math.min(Math.max(fz, 0), nz - 1);
    const ix = nx > 1 ? Math.min(Math.floor(fx), nx - 2) : 0;
    const iz = nz > 1 ? Math.min(Math.floor(fz), nz - 2) : 0;
    const tx = fx - ix;
    const tz = fz - iz;
    const jx = Math.min(ix + 1, nx - 1);
    const jz = Math.min(iz + 1, nz - 1);
    const a = dm[iz * nx + ix];
    const b = dm[iz * nx + jx];
    const c = dm[jz * nx + ix];
    const d = dm[jz * nx + jx];
    return ((a * (1 - tx) + b * tx) * (1 - tz)
      + (c * (1 - tx) + d * tx) * tz) / 10;
  };
}

// Slope in degrees at (x, z) by central differences (for the rock mix;
// pure, tested).
export function slopeAt(heightAt, x, z, eps = 2.5) {
  const dx = heightAt(x + eps, z) - heightAt(x - eps, z);
  const dz = heightAt(x, z + eps) - heightAt(x, z - eps);
  const grad = Math.hypot(dx, dz) / (2 * eps);
  return (Math.atan(grad) * 180) / Math.PI;
}

// Seat one building: {base, ceil} = min/max terrain over the outer-ring
// corners ([x, yNorth] points; world z = -y). The base is the lowest
// corner; the spread decides the footing skirt (buildings.js).
export function seatOnTerrain(heightAt, outerRings) {
  let base = Infinity;
  let ceil = -Infinity;
  for (const ring of outerRings || []) {
    for (const [x, y] of ring) {
      const h = heightAt(x, -y);
      if (h < base) base = h;
      if (h > ceil) ceil = h;
    }
  }
  if (!Number.isFinite(base)) return { base: 0, ceil: 0 };
  return { base, ceil };
}

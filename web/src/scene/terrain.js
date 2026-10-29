// Terrain mesh + land-masks (pure geometry; three.js only for nothing;
// the mask draws on a caller-provided 2D canvas so tests stay DOM-free).
//
// buildTerrainMesh(terrain, look, {stride}) returns indexed grid arrays:
// positions (y from dm), uvs over the mask, per-vertex colours (white with
// a rock mix past 35° slope, spec §5.1). main.js wraps them in
// BufferGeometry, calls computeVertexNormals, and pairs the mesh with a
// CanvasTexture from paintLandMask(canvas, lands, terrain, look).
//
// Mask classes: forest (wood/forest), grass (grass/meadow/park/garden/
// recreation_ground/pitch), scrub, water. Everything else is the urban
// paper base — most of a station box is built-up, not meadow.

export const ROCK_SLOPE_DEG = 35;
export const MASK_SIZE = 1024;

export function maskClassFor(kind) {
  if (kind === "wood" || kind === "forest") return "forest";
  if (kind === "scrub") return "scrub";
  if (kind === "water" || kind === "riverbank" || kind === "dock") return "water";
  if (kind === "grass" || kind === "grassland" || kind === "meadow" ||
      kind === "park" || kind === "garden" || kind === "recreation_ground" ||
      kind === "pitch") return "grass";
  return null;
}

// Kinds the mask covers: buildGround skips these as geometry (one land
// system) but keeps the rest (playground, cemetery, …) lifted on terrain.
export const MASKED_KINDS = new Set([
  "natural:wood", "landuse:forest", "natural:scrub", "natural:water",
  "waterway:riverbank", "waterway:dock", "natural:grassland",
  "landuse:grass", "landuse:meadow", "landuse:park",
  "landuse:recreation_ground", "leisure:park", "leisure:garden",
  "leisure:pitch",
]);

export function isMaskedKind(kind) {
  return MASKED_KINDS.has(kind);
}

function hexRgb(hex) {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

function css(hex) {
  return `#${hex.toString(16).padStart(6, "0")}`;
}

// Scene (x, z) -> mask pixels. Row 0 is the north edge (z0).
export function sceneToMask(x, z, terrain, size = MASK_SIZE) {
  const w = (terrain.nx - 1) * terrain.step;
  const d = (terrain.nz - 1) * terrain.step;
  return [(x - terrain.x0) / w * size, (z - terrain.z0) / d * size];
}

export function buildTerrainMesh(terrain, look, { stride = 1 } = {}) {
  const { x0, z0, step, nx, nz, dm } = terrain;
  const rock = hexRgb(look.terrainRock);
  const ixCount = Math.floor((nx - 1) / stride) + 1;
  const izCount = Math.floor((nz - 1) / stride) + 1;
  const positions = new Float32Array(ixCount * izCount * 3);
  const colors = new Float32Array(ixCount * izCount * 3);
  const uvs = new Float32Array(ixCount * izCount * 2);
  const at = (ix, iz) => dm[Math.min(nz - 1, iz) * nx + Math.min(nx - 1, ix)] / 10;
  let v = 0;
  for (let gz = 0; gz < izCount; gz++) {
    for (let gx = 0; gx < ixCount; gx++) {
      const ix = Math.min(nx - 1, gx * stride);
      const iz = Math.min(nz - 1, gz * stride);
      const x = x0 + ix * step;
      const z = z0 + iz * step;
      positions[v * 3] = x;
      positions[v * 3 + 1] = at(ix, iz);
      positions[v * 3 + 2] = z;
      uvs[v * 2] = ix / (nx - 1);
      uvs[v * 2 + 1] = 1 - iz / (nz - 1);
      // Slope from the grid neighbours (metres); rock past 35°.
      const s = Math.max(1, stride);
      const hx = (at(Math.min(nx - 1, ix + s), iz) - at(Math.max(0, ix - s), iz))
        / (2 * s * step);
      const hz = (at(ix, Math.min(nz - 1, iz + s)) - at(ix, Math.max(0, iz - s)))
        / (2 * s * step);
      const slope = (Math.atan(Math.hypot(hx, hz)) * 180) / Math.PI;
      const k = Math.min(1, Math.max(0, (slope - ROCK_SLOPE_DEG) / 10));
      colors[v * 3] = 1 + (rock[0] - 1) * k;
      colors[v * 3 + 1] = 1 + (rock[1] - 1) * k;
      colors[v * 3 + 2] = 1 + (rock[2] - 1) * k;
      v++;
    }
  }
  const quads = (ixCount - 1) * (izCount - 1);
  const indices = new Uint32Array(quads * 6);
  let t = 0;
  for (let gz = 0; gz < izCount - 1; gz++) {
    for (let gx = 0; gx < ixCount - 1; gx++) {
      const a = gz * ixCount + gx;
      const b = a + 1;
      const c = a + ixCount;
      const d = c + 1;
      indices[t++] = a;
      indices[t++] = c;
      indices[t++] = b;
      indices[t++] = b;
      indices[t++] = c;
      indices[t++] = d;
    }
  }
  return { positions, colors, uvs, indices,
           triangles: quads * 2, vertices: v };
}

// Paint the land mask: base first, then grass, scrub, forest, water on
// top. Rings use the even-odd fill so multipolygon holes stay base.
export function paintLandMask(ctx, lands, terrain, look, size = MASK_SIZE) {
  const order = { grass: 0, scrub: 1, forest: 2, water: 3 };
  const fill = {
    grass: css(look.terrainGrass), scrub: css(look.terrainScrub),
    forest: css(look.terrainForest), water: css(look.terrainWater),
  };
  ctx.fillStyle = css(look.terrainBase);
  ctx.fillRect(0, 0, size, size);
  const sorted = [...(lands || [])]
    .map((l) => ({ cls: maskClassFor(l.k), r: l.r }))
    .filter((l) => l.cls)
    .sort((a, b) => order[a.cls] - order[b.cls]);
  ctx.lineJoin = "round";
  for (const land of sorted) {
    ctx.beginPath();
    for (const ring of land.r) {
      ring.forEach(([x, z], i) => {
        const [px, py] = sceneToMask(x, z, terrain, size);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.closePath();
    }
    ctx.fillStyle = fill[land.cls];
    ctx.fill("evenodd");
  }
  return { painted: sorted.length };
}

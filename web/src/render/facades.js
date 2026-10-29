// Procedural facade textures (pure, no three.js, no DOM).
//
// Stage 5b renders buildings with MeshStandardMaterial + canvas textures,
// but the pixel synthesis here is plain Uint8 buffers so it is
// deterministic and unit-testable in Node. The browser wrapper
// (render/textures.js) uploads these buffers to CanvasTextures.
//
// Design: each residential class has ONE tile texture that repeats every
// (tileW × tileH) metres along the wall (real-world UV mapping, metres
// per wall — the renderer divides wall distance/height by the tile size).
// One floor per 3.0 m and one bay per 3.2 m, so a building's window rows
// equal its levels whenever height ≈ levels × 3 m (the pipeline's own
// convention), and bays tile every 3.2 m (brief: 3–3.6 m).
//
// Per class we synthesise three maps with identical layout:
// - map:      albedo (wall + windows + floor bands)
// - rough:    packed G=roughness, B=metalness (R unused)
// - emissive: R=window mask, G=per-window lit threshold 0..255
// At night the shader lights the windows whose threshold is below the
// building's lit fraction (aLit vertex attribute, from run occupancy:
// at-home residents / agents in the building — the same stage-3 data the
// old glow quads used). Daytime emissive is off (uNight = 0).

import { APARTMENT_FAMILIES, HOUSE_WALL, MIXED_WALL, NON_RESIDENTIAL, hashString } from "../palette.js";

export const TEX_SIZE = 512;
export const FLOOR_H_M = 3.0;
export const BAY_W_M = 3.2; // within the brief's 3–3.6 m

// Tile world size per facade class: {w, h} metres, {cols, rows} bays.
export const FACADE_CLASSES = ["apartment", "house", "mixed", "none", "podium", "roof"];
export const FACADE_TILES = {
  apartment: { w: 12.8, h: 12.0, cols: 4, rows: 4 }, // 4 bays × 4 floors
  house: { w: 9.6, h: 6.0, cols: 3, rows: 2 }, // 3 bays × 2 floors
  mixed: { w: 12.8, h: 12.0, cols: 4, rows: 4 },
  none: { w: 12.8, h: 12.0, cols: 4, rows: 4 }, // curtain wall / concrete
  podium: { w: 12.8, h: 4.2, cols: 8, rows: 1 }, // ground-floor shops/lobby
  roof: { w: 8.0, h: 8.0, cols: 4, rows: 4 }, // membrane seams every 2 m
};
export const PODIUM_H_M = 4.2;

// Painted wall/roof targets (stage 14e, sRGB): warm light concrete
// walls with roofs one step lighter, so the two separate at a glance.
// Applied as a material tint (photo keeps white = today's pixels). The
// shader multiplies map × vertex colour × material colour in linear
// space, so the tint compensates both the baked tile base (mirroring
// the paintWall calls in synth*) and the typical vertex colour from
// palette.js (vertex colours are used raw, without sRGB decoding).
export const FACADE_WALL_BASE = {
  apartment: [238, 230, 214],
  house: [240, 234, 220],
  mixed: [226, 220, 208],
  none: [214, 208, 196],
  podium: [206, 200, 190],
  roof: [226, 224, 220],
};
export const PAINTED_WALL = [201, 196, 187]; // #c9c4bb
export const PAINTED_ROOF = [221, 216, 206]; // #ddd8ce

function hexToRgb255(hex) {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function meanHex(hexes) {
  const out = [0, 0, 0];
  for (const h of hexes) {
    const c = hexToRgb255(h);
    out[0] += c[0];
    out[1] += c[1];
    out[2] += c[2];
  }
  return out.map((v) => v / hexes.length);
}

// Typical vertex colour per facade class (sRGB 0..255 ints): apartment
// families average out (per-complex variation stays); the single roof
// mesh targets the apartment-slab majority, so red tile roofs keep their
// hue, lifted; podium bands share their building's wall colour.
export const FACADE_VERTEX_REF = {
  apartment: meanHex(APARTMENT_FAMILIES.map((f) => f.wall)),
  house: hexToRgb255(HOUSE_WALL),
  mixed: hexToRgb255(MIXED_WALL),
  none: hexToRgb255(NON_RESIDENTIAL),
  podium: meanHex([MIXED_WALL, NON_RESIDENTIAL]),
  roof: meanHex(APARTMENT_FAMILIES.map((f) => f.roof)),
};

export function srgbToLinear(u8) {
  const c = Math.min(1, Math.max(0, u8 / 255));
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// [r, g, b] linear-space material tint multiplier for one facade class +
// style: tint × lin(tile base) × vertex/255 lands on lin(target) for the
// typical building of that class (per-building vertex variation stays).
export function facadeTintFor(facadeClass, style) {
  if (style !== "painted") return [1, 1, 1];
  const base = FACADE_WALL_BASE[facadeClass];
  const vref = FACADE_VERTEX_REF[facadeClass];
  if (!base || !vref) return [1, 1, 1];
  const target = facadeClass === "roof" ? PAINTED_ROOF : PAINTED_WALL;
  return [0, 1, 2].map((i) => {
    const denom = srgbToLinear(base[i]) * (vref[i] / 255);
    return denom > 0 ? srgbToLinear(target[i]) / denom : 1;
  });
}

// Facade class for a building's walls (residential classes map 1:1).
export function facadeTileFor(residential) {
  const key = residential === "apartment" || residential === "house" ||
    residential === "mixed" ? residential : "none";
  return FACADE_TILES[key];
}

// Window rows for a building: levels when known, else height / 3 m.
export function facadeRows(levels, heightM) {
  if (Number.isInteger(levels) && levels > 0) return levels;
  return Math.max(1, Math.round((heightM || FLOOR_H_M) / FLOOR_H_M));
}

// Window bays along a wall of length lenM.
export function facadeBays(lenM) {
  return Math.max(1, Math.round(lenM / BAY_W_M));
}

// Real-world UV mapping: wall distance/height in metres -> tile UV.
export function facadeUV(distM, hM, tile) {
  return [distM / tile.w, hM / tile.h];
}

// Night lit fraction for one building from run occupancy
// ({home, total} = at-home agents / agents housed there).
export function litFractionFor(occ) {
  if (!occ || !(occ.total > 0)) return 0;
  return Math.min(1, Math.max(0, occ.home / occ.total));
}

// Night lit fraction with the stage-6 fallback: buildings that house
// simulated residents use their exact at-home share; residential
// buildings with real households but no simulated agents use the
// run-wide at-home share modulated ±20% by a deterministic per-building
// hash (a lighting estimate, not data — the legend says whose); empty
// non-residential buildings stay dark.
export function litFractionWithFallback(occ, { households = 0, globalHomeFrac = 0, hash01 = 0.5 } = {}) {
  if (occ && occ.total > 0) return Math.min(1, Math.max(0, occ.home / occ.total));
  if (!(households > 0)) return 0;
  if (!(globalHomeFrac > 0)) return 0;
  const jitter = 0.8 + 0.4 * Math.min(1, Math.max(0, hash01));
  return Math.min(1, globalHomeFrac * jitter);
}

// Run-wide at-home share from an occupancy map (for the fallback above).
export function globalHomeFraction(occMap) {
  let home = 0;
  let total = 0;
  for (const occ of (occMap || new Map()).values()) {
    home += occ.home || 0;
    total += occ.total || 0;
  }
  return total > 0 ? home / total : 0;
}

// Tour-mode lighting estimate (no run, no residents): ramps up through
// the evening, full at night, down toward dawn. Decorative only.
export function eveningHomeFraction(minute) {
  const m = Number(minute);
  if (!Number.isFinite(m)) return 0;
  if (m >= 5 * 60 + 30 && m < 16 * 60 + 30) return 0; // daytime: dark
  if (m < 5 * 60 + 30) return 0.55; // small hours: most home, most asleep
  if (m < 18 * 60) return 0.45; // late afternoon arrivals
  if (m < 20 * 60) return 0.8; // evening peak
  if (m < 23 * 60) return 0.9; // night
  return 0.7; // toward midnight
}

// --- tiny deterministic PRNG (local mulberry32; no shared state) ---

export function rng32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// FNV-1a hash over pixel data (every 16th byte + length mix): stable
// across runs for one seed, different across seeds/classes.
export function hashPixels(data) {
  let h = 0x811c9dc5;
  for (let i = 0; i < data.length; i += 16) {
    h ^= data[i];
    h = Math.imul(h, 0x01000193);
  }
  h ^= data.length & 255;
  h = Math.imul(h, 0x01000193);
  return (h >>> 0).toString(16).padStart(8, "0");
}

function makeBuf() {
  return {
    map: new Uint8ClampedArray(TEX_SIZE * TEX_SIZE * 4),
    rough: new Uint8ClampedArray(TEX_SIZE * TEX_SIZE * 4),
    emissive: new Uint8ClampedArray(TEX_SIZE * TEX_SIZE * 4),
  };
}

function fillRect(buf, x0, y0, x1, y1, rgba) {
  const [r, g, b, a] = rgba;
  for (let y = Math.max(0, y0); y < Math.min(TEX_SIZE, y1); y++) {
    for (let x = Math.max(0, x0); x < Math.min(TEX_SIZE, x1); x++) {
      const i = (y * TEX_SIZE + x) * 4;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = b;
      buf[i + 3] = a;
    }
  }
}

// Window pane with a vertical glass gradient + slight per-window tint
// (stage 6: deeper glass so windows read at stop-framing distance).
function paintWindow(buf, rng, x0, y0, w, h, tint) {
  for (let y = 0; y < h; y++) {
    const k = y / Math.max(1, h - 1); // 0 top → 1 bottom
    const r = Math.round(74 + 58 * k + tint[0]);
    const g = Math.round(104 + 52 * k + tint[1]);
    const bl = Math.round(134 + 44 * k + tint[2]);
    for (let x = 0; x < w; x++) {
      const i = (((y0 + y) * TEX_SIZE) + (x0 + x)) * 4;
      if (y0 + y < 0 || y0 + y >= TEX_SIZE || x0 + x < 0 || x0 + x >= TEX_SIZE) continue;
      buf[i] = r;
      buf[i + 1] = g;
      buf[i + 2] = bl;
      buf[i + 3] = 255;
    }
  }
}

function paintEmissiveWindow(emissive, x0, y0, w, h, threshold) {
  fillRect(emissive, x0, y0, x0 + w, y0 + h, [255, threshold, 0, 255]);
}

function paintRoughWindow(rough, x0, y0, w, h) {
  fillRect(rough, x0, y0, x0 + w, y0 + h, [0, 42, 26, 255]); // glass: smooth
}

// Wall base with fine per-pixel noise (plaster/concrete grain).
function paintWall(buf, rng, base, amp) {
  for (let i = 0; i < TEX_SIZE * TEX_SIZE; i++) {
    const n = (rng() - 0.5) * 2 * amp;
    const o = i * 4;
    buf[o] = base[0] + n;
    buf[o + 1] = base[1] + n;
    buf[o + 2] = base[2] + n;
    buf[o + 3] = 255;
  }
}

function paintRoughBase(rough, value, spread, rng) {
  for (let i = 0; i < TEX_SIZE * TEX_SIZE; i++) {
    const v = Math.max(0, Math.min(255, value + (rng() - 0.5) * spread));
    const o = i * 4;
    rough[o] = 0;
    rough[o + 1] = v; // roughness in G
    rough[o + 2] = 8; // metalness ~0 in B
    rough[o + 3] = 255;
  }
}

// Apartment slab: balcony slab band per floor + punched windows.
function synthApartment(seed) {
  const rng = rng32(hashString(`facade:apartment:${seed}`));
  const buf = makeBuf();
  const tile = FACADE_TILES.apartment;
  paintWall(buf.map, rng, [238, 230, 214], 7);
  paintRoughBase(buf.rough, 228, 26, rng);
  const pxmX = TEX_SIZE / tile.w; // px per metre
  const pxmY = TEX_SIZE / tile.h;
  const bayW = Math.floor(TEX_SIZE / tile.cols);
  const floorH = Math.floor(TEX_SIZE / tile.rows);
  for (let r = 0; r < tile.rows; r++) {
    const fy = r * floorH;
    // Floor slab band: light strip + shadow line under it.
    fillRect(buf.map, 0, fy, TEX_SIZE, fy + Math.max(2, Math.round(0.28 * pxmY)), [246, 240, 228, 255]);
    fillRect(buf.map, 0, fy + Math.max(2, Math.round(0.28 * pxmY)),
      TEX_SIZE, fy + Math.max(4, Math.round(0.42 * pxmY)), [150, 140, 124, 255]);
    for (let c = 0; c < tile.cols; c++) {
      const bx = c * bayW;
      const ww = Math.round(1.9 * pxmX);
      const wh = Math.round(1.5 * pxmY);
      const wx = bx + Math.round((bayW - ww) / 2);
      const wy = fy + Math.round(1.05 * pxmY);
      // Frame + sill.
      fillRect(buf.map, wx - 2, wy - 2, wx + ww + 2, wy + wh + 2, [104, 94, 82, 255]);
      const tint = [(rng() - 0.5) * 26, (rng() - 0.5) * 22, (rng() - 0.5) * 18];
      paintWindow(buf.map, rng, wx, wy, ww, wh, tint);
      fillRect(buf.map, wx - 2, wy + wh + 2, wx + ww + 2, wy + wh + 4, [200, 192, 178, 255]);
      paintRoughWindow(buf.rough, wx, wy, ww, wh);
      paintEmissiveWindow(buf.emissive, wx, wy, ww, wh, Math.floor(rng() * 256));
    }
  }
  return buf;
}

// House: plaster (or brick variant by seed) with fewer, smaller windows.
function synthHouse(seed) {
  const rng = rng32(hashString(`facade:house:${seed}`));
  const buf = makeBuf();
  const tile = FACADE_TILES.house;
  const brick = hashString(`brick:${seed}`) % 2 === 0;
  if (brick) {
    paintWall(buf.map, rng, [172, 118, 92], 6);
    // Brick courses ~75 mm + mortar joints.
    const courseH = Math.max(2, Math.round((TEX_SIZE / tile.h) * 0.075));
    for (let y = 0; y < TEX_SIZE; y += courseH) {
      fillRect(buf.map, 0, y, TEX_SIZE, y + 1, [214, 200, 186, 255]);
    }
  } else {
    paintWall(buf.map, rng, [240, 234, 220], 8);
  }
  paintRoughBase(buf.rough, 232, 30, rng);
  const pxmX = TEX_SIZE / tile.w;
  const pxmY = TEX_SIZE / tile.h;
  const bayW = Math.floor(TEX_SIZE / tile.cols);
  const floorH = Math.floor(TEX_SIZE / tile.rows);
  for (let r = 0; r < tile.rows; r++) {
    const fy = r * floorH;
    for (let c = 0; c < tile.cols; c++) {
      if (rng() < 0.22) continue; // blank bay: houses have fewer windows
      const bx = c * bayW;
      const ww = Math.round(1.4 * pxmX);
      const wh = Math.round(1.4 * pxmY);
      const wx = bx + Math.round((bayW - ww) / 2);
      const wy = fy + Math.round(0.95 * pxmY);
      fillRect(buf.map, wx - 2, wy - 2, wx + ww + 2, wy + wh + 3, [110, 96, 84, 255]);
      paintWindow(buf.map, rng, wx, wy, ww, wh,
        [(rng() - 0.5) * 20, (rng() - 0.5) * 18, (rng() - 0.5) * 14]);
      paintRoughWindow(buf.rough, wx, wy, ww, wh);
      paintEmissiveWindow(buf.emissive, wx, wy, ww, wh, Math.floor(rng() * 256));
    }
  }
  return buf;
}

// Mixed-use: concrete panels + ribbon windows.
function synthMixed(seed) {
  const rng = rng32(hashString(`facade:mixed:${seed}`));
  const buf = makeBuf();
  const tile = FACADE_TILES.mixed;
  paintWall(buf.map, rng, [226, 220, 208], 9);
  paintRoughBase(buf.rough, 222, 30, rng);
  const pxmX = TEX_SIZE / tile.w;
  const pxmY = TEX_SIZE / tile.h;
  const bayW = Math.floor(TEX_SIZE / tile.cols);
  const floorH = Math.floor(TEX_SIZE / tile.rows);
  // Panel joints.
  for (let c = 0; c <= tile.cols; c++) {
    fillRect(buf.map, c * bayW - 1, 0, c * bayW + 1, TEX_SIZE, [188, 182, 170, 255]);
  }
  for (let r = 0; r < tile.rows; r++) {
    const fy = r * floorH;
    fillRect(buf.map, 0, fy - 1, TEX_SIZE, fy + 1, [188, 182, 170, 255]);
    fillRect(buf.map, 0, fy + 1, TEX_SIZE, fy + 4, [160, 154, 144, 255]); // slab shadow
    for (let c = 0; c < tile.cols; c++) {
      const ww = Math.round(2.4 * pxmX);
      const wh = Math.round(1.4 * pxmY);
      const wx = c * bayW + Math.round((bayW - ww) / 2);
      const wy = fy + Math.round(1.0 * pxmY);
      fillRect(buf.map, wx - 2, wy - 2, wx + ww + 2, wy + wh + 2, [96, 100, 108, 255]);
      paintWindow(buf.map, rng, wx, wy, ww, wh,
        [(rng() - 0.5) * 30, (rng() - 0.5) * 26, (rng() - 0.5) * 20]);
      paintRoughWindow(buf.rough, wx, wy, ww, wh);
      paintEmissiveWindow(buf.emissive, wx, wy, ww, wh, Math.floor(rng() * 256));
    }
  }
  return buf;
}

// Non-residential: curtain-wall glass (seed variant) or concrete + insets.
function synthNone(seed) {
  const rng = rng32(hashString(`facade:none:${seed}`));
  const buf = makeBuf();
  const tile = FACADE_TILES.none;
  const curtain = hashString(`curtain:${seed}`) % 2 === 0;
  const pxmX = TEX_SIZE / tile.w;
  const bayW = Math.floor(TEX_SIZE / tile.cols);
  const floorH = Math.floor(TEX_SIZE / tile.rows);
  if (curtain) {
    paintWall(buf.map, rng, [120, 148, 172], 10);
    paintRoughBase(buf.rough, 90, 40, rng);
    // Mullion grid every 1.6 m × floor.
    const mullX = Math.round(1.6 * pxmX);
    for (let x = 0; x < TEX_SIZE; x += mullX) {
      fillRect(buf.map, x - 1, 0, x + 1, TEX_SIZE, [70, 76, 84, 255]);
    }
    for (let r = 0; r <= tile.rows; r++) {
      fillRect(buf.map, 0, r * floorH - 2, TEX_SIZE, r * floorH + 2, [64, 70, 78, 255]);
    }
    // Per-pane tint + emissive thresholds per pane.
    for (let r = 0; r < tile.rows; r++) {
      for (let x = 0; x < TEX_SIZE; x += mullX) {
        const tint = (rng() - 0.5) * 36;
        const y0 = r * floorH + 2;
        const y1 = (r + 1) * floorH - 2;
        for (let y = y0; y < y1; y++) {
          for (let xx = x + 1; xx < Math.min(TEX_SIZE, x + mullX - 1); xx++) {
            const i = (y * TEX_SIZE + xx) * 4;
            buf.map[i] += tint * 0.5;
            buf.map[i + 1] += tint * 0.6;
            buf.map[i + 2] += tint * 0.7;
          }
        }
        paintEmissiveWindow(buf.emissive, x + 1, y0,
          Math.min(mullX - 2, TEX_SIZE - x - 1), y1 - y0, Math.floor(rng() * 256));
      }
    }
    // Glass is smooth everywhere on a curtain wall.
    for (let i = 0; i < TEX_SIZE * TEX_SIZE; i++) {
      const o = i * 4;
      buf.rough[o + 1] = 70;
      buf.rough[o + 2] = 60;
    }
  } else {
    paintWall(buf.map, rng, [214, 208, 196], 9);
    paintRoughBase(buf.rough, 226, 26, rng);
    for (let r = 0; r < tile.rows; r++) {
      const fy = r * floorH;
      for (let c = 0; c < tile.cols; c++) {
        const ww = Math.round(1.6 * pxmX);
        const wh = Math.round(1.6 * (TEX_SIZE / tile.h));
        const wx = c * bayW + Math.round((bayW - ww) / 2);
        const wy = fy + Math.round(0.9 * (TEX_SIZE / tile.h));
        fillRect(buf.map, wx - 3, wy - 3, wx + ww + 3, wy + wh + 3, [150, 144, 132, 255]);
        paintWindow(buf.map, rng, wx, wy, ww, wh,
          [(rng() - 0.5) * 24, (rng() - 0.5) * 22, (rng() - 0.5) * 18]);
        paintRoughWindow(buf.rough, wx, wy, ww, wh);
        paintEmissiveWindow(buf.emissive, wx, wy, ww, wh, Math.floor(rng() * 256));
      }
    }
  }
  return buf;
}

// Podium: ground-floor storefront glass + fascia band (no text —
// invented shop names are out of scope; fascia reads as signage strips).
function synthPodium(seed) {
  const rng = rng32(hashString(`facade:podium:${seed}`));
  const buf = makeBuf();
  const tile = FACADE_TILES.podium;
  paintWall(buf.map, rng, [206, 200, 190], 8);
  paintRoughBase(buf.rough, 220, 30, rng);
  const pxmX = TEX_SIZE / tile.w;
  const pxmY = TEX_SIZE / tile.h;
  const bayW = Math.floor(TEX_SIZE / tile.cols);
  const glassTop = Math.round(0.5 * pxmY);
  const glassBot = Math.round(3.3 * pxmY);
  for (let c = 0; c < tile.cols; c++) {
    const x0 = c * bayW + 2;
    const x1 = (c + 1) * bayW - 2;
    paintWindow(buf.map, rng, x0, glassTop, x1 - x0, glassBot - glassTop,
      [(rng() - 0.5) * 20, (rng() - 0.5) * 18, (rng() - 0.5) * 14]);
    paintRoughWindow(buf.rough, x0, glassTop, x1 - x0, glassBot - glassTop);
    paintEmissiveWindow(buf.emissive, x0, glassTop, x1 - x0, glassBot - glassTop,
      Math.floor(rng() * 256));
    // Stall riser + mullions + fascia strip.
    fillRect(buf.map, x0, glassBot, x1, TEX_SIZE, [150, 144, 134, 255]);
    fillRect(buf.map, c * bayW - 1, glassTop, c * bayW + 1, glassBot, [80, 78, 76, 255]);
    const fascia = [[148, 74, 60], [60, 96, 120], [74, 110, 80], [120, 104, 70]][Math.floor(rng() * 4)];
    fillRect(buf.map, x0, 0, x1, glassTop, [...fascia, 255]);
  }
  return buf;
}

// Roof membrane: grey + seam grid + gravel noise. Pitched-tile colour
// comes from vertex colours (house roof tint) multiplying this map.
function synthRoof(seed) {
  const rng = rng32(hashString(`facade:roof:${seed}`));
  const buf = makeBuf();
  paintWall(buf.map, rng, [226, 224, 220], 12);
  paintRoughBase(buf.rough, 236, 20, rng);
  const seam = Math.round(TEX_SIZE / 4);
  for (let k = 0; k <= 4; k++) {
    fillRect(buf.map, k * seam - 1, 0, k * seam + 1, TEX_SIZE, [198, 196, 192, 255]);
    fillRect(buf.map, 0, k * seam - 1, TEX_SIZE, k * seam + 1, [198, 196, 192, 255]);
  }
  return buf;
}

// Neutral ground detail (multiplies vertex colours): asphalt grain.
export function synthGroundDetail(seed) {
  const rng = rng32(hashString(`facade:ground:${seed}`));
  const map = new Uint8ClampedArray(256 * 256 * 4);
  for (let i = 0; i < 256 * 256; i++) {
    const n = 232 + (rng() - 0.5) * 26;
    const o = i * 4;
    map[o] = n;
    map[o + 1] = n;
    map[o + 2] = n - 2;
    map[o + 3] = 255;
  }
  return { size: 256, data: map };
}

const SYNTH = {
  apartment: synthApartment,
  house: synthHouse,
  mixed: synthMixed,
  none: synthNone,
  podium: synthPodium,
  roof: synthRoof,
};

// Full facade set for one class: {map, rough, emissive} pixel buffers.
export function synthFacade(facadeClass, seed = 1) {
  const fn = SYNTH[facadeClass];
  if (!fn) throw new Error(`unknown facade class: ${facadeClass}`);
  return fn(seed);
}

// Share of emissive texels with threshold below frac (0..1): the
// expected lit-window share at lit fraction `frac`, for tests.
export function emissiveLitShare(emissive, frac) {
  const cut = Math.floor(frac * 255);
  let lit = 0;
  let win = 0;
  for (let i = 0; i < emissive.length; i += 4) {
    if (emissive[i] > 0) {
      win++;
      if (emissive[i + 1] <= cut) lit++;
    }
  }
  return win === 0 ? 0 : lit / win;
}

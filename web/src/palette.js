// Style 1 "miniature": warm autumn diorama palette (pure, no three.js).
//
// Paper background ~#FBF7EE; apartments in warm cream / terracotta / brick
// families with per-complex variation; houses with red-brown roofs;
// non-residential desaturated grey-beige; roads light grey; ginkgo
// yellow/orange with some green. All colors are 0xRRGGBB ints.

export const PAPER = 0xfbf7ee;
export const GROUND_PLATE = 0xeadfc4;
export const ROAD = 0xdcd6cc;
export const ROAD_MAJOR = 0xd0c8b8;
export const FOOTWAY = 0xe9e3d5;
export const CROSSWALK = 0xffffff;
export const WATER = 0x93bcd6;
export const PARK = 0xafc493;
export const GRASS = 0xbccb9c;
export const WOOD = 0x8fae7c;

export const HOUSE_WALL = 0xf3ead9;
export const HOUSE_ROOF = 0x8c4a32;
export const NON_RESIDENTIAL = 0xd8d2c4;
export const NON_RESIDENTIAL_ROOF = 0xbfb8a8;
export const MIXED_WALL = 0xe6d6bc;

// Apartment families: [wall, roof] per family. Per-complex variation
// picks a family by hash(complex id) and jitters lightness deterministically.
// Floor banding (band) and the short-end side faces (side) derive from the
// wall so the three face tones always stay in the same family.
export const BAND_FACTOR = 0.965; // subtle banding, not stripes
export const SIDE_FACTOR = 0.93; // slightly darker side faces
export const APARTMENT_FAMILIES = [
  { wall: 0xf6ecd8, roof: 0xcfc0a4 }, // cream
  { wall: 0xfaf3e6, roof: 0xd6c9b2 }, // warm white
  { wall: 0xe9c9a2, roof: 0xc7a67e }, // pale terracotta
];

export const GINKGO = [0xf2b234, 0xe8832a, 0xdd9a1e, 0x7ba05b, 0x6a8f4e];
export const TRUNK = 0x7a5c42;

export function hashString(text) {
  // FNV-1a 32-bit, deterministic across runs.
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Deterministic 0..1 from (seed, salt) without shared RNG state.
export function hashUnit(seed, salt = 0) {
  let h = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  return h / 4294967296;
}

function shade(hex, factor) {
  const r = Math.min(255, Math.max(0, Math.round(((hex >> 16) & 255) * factor)));
  const g = Math.min(255, Math.max(0, Math.round(((hex >> 8) & 255) * factor)));
  const b = Math.min(255, Math.max(0, Math.round((hex & 255) * factor)));
  return (r << 16) | (g << 8) | b;
}

// Apartment colors for one building. complexId may be null (ungrouped):
// the building id seeds the variation instead, deterministically.
export function apartmentColors(buildingId, complexId) {
  const seed = hashString(complexId || `solo:${buildingId}`);
  const family = APARTMENT_FAMILIES[seed % APARTMENT_FAMILIES.length];
  const jitter = 0.96 + hashUnit(seed, 7) * 0.08; // ±4 % lightness
  const wall = shade(family.wall, jitter);
  return {
    wall,
    band: shade(wall, BAND_FACTOR),
    side: shade(wall, SIDE_FACTOR),
    roof: shade(family.roof, jitter),
  };
}

// Wall/roof colors for any building given its residential class.
export function residentialColors(building, complexId) {
  const res = building.residential || "none";
  if (res === "apartment") {
    return apartmentColors(building.id, complexId);
  }
  if (res === "house") return { wall: HOUSE_WALL, band: shade(HOUSE_WALL, BAND_FACTOR),
    side: shade(HOUSE_WALL, SIDE_FACTOR), roof: HOUSE_ROOF };
  if (res === "mixed") return { wall: MIXED_WALL, band: shade(MIXED_WALL, BAND_FACTOR),
    side: shade(MIXED_WALL, SIDE_FACTOR), roof: HOUSE_ROOF };
  return { wall: NON_RESIDENTIAL, band: shade(NON_RESIDENTIAL, BAND_FACTOR),
    side: shade(NON_RESIDENTIAL, SIDE_FACTOR), roof: NON_RESIDENTIAL_ROOF };
}

export function css(hex) {
  return `#${hex.toString(16).padStart(6, "0")}`;
}

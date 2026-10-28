// Style 1 "miniature": warm autumn diorama palette (pure, no three.js).
//
// Paper background ~#FBF7EE; apartments in warm cream / terracotta / brick
// families with per-complex variation; houses with red-brown roofs;
// non-residential desaturated grey-beige; roads light grey; ginkgo
// yellow/orange with some green. All colors are 0xRRGGBB ints.

export const PAPER = 0xfbf7ee;
export const GROUND_PLATE = 0xf3ecdc;
export const ROAD = 0xd9d4c9;
export const ROAD_MAJOR = 0xcfc9bc;
export const FOOTWAY = 0xe8e3d6;
export const CROSSWALK = 0xffffff;
export const WATER = 0x9fc4d8;
export const PARK = 0xa9bf8e;
export const GRASS = 0xbccb9c;
export const WOOD = 0x8fae7c;

export const HOUSE_WALL = 0xf3ead9;
export const HOUSE_ROOF = 0x8c4a32;
export const NON_RESIDENTIAL = 0xcfc8bb;
export const NON_RESIDENTIAL_ROOF = 0xbfb8a8;
export const MIXED_WALL = 0xe3d3b8;

// Apartment families: [wall, band, roof] per family. Per-complex variation
// picks a family by hash(complex id) and jitters lightness deterministically.
export const APARTMENT_FAMILIES = [
  { wall: 0xf5e6c4, band: 0xe8d3a8, roof: 0xc9a06a }, // warm cream
  { wall: 0xe8c39a, band: 0xd9a878, roof: 0xa86a42 }, // terracotta
  { wall: 0xd99a78, band: 0xc47f5c, roof: 0x8c4a32 }, // brick
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
  return {
    wall: shade(family.wall, jitter),
    band: shade(family.band, jitter),
    roof: shade(family.roof, jitter),
  };
}

// Wall/roof colors for any building given its residential class.
export function residentialColors(building, complexId) {
  const res = building.residential || "none";
  if (res === "apartment") {
    const c = apartmentColors(building.id, complexId);
    return { wall: c.wall, band: c.band, roof: c.roof };
  }
  if (res === "house") return { wall: HOUSE_WALL, band: HOUSE_WALL, roof: HOUSE_ROOF };
  if (res === "mixed") return { wall: MIXED_WALL, band: MIXED_WALL, roof: HOUSE_ROOF };
  return { wall: NON_RESIDENTIAL, band: NON_RESIDENTIAL, roof: NON_RESIDENTIAL_ROOF };
}

export function css(hex) {
  return `#${hex.toString(16).padStart(6, "0")}`;
}

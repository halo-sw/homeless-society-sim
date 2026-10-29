// Seeded RNG for procedural motion (pure, no three.js).
//
// Every mover module derives its randomness from here: the same seed
// string replays the same stream, so stateAt(seed, t) is byte-equal
// across runs. Mirrors walkers.js mulberry32 (kept local so motion/
// stays self-contained).

import { hashString } from "../palette.js";

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One stream per (mover kind, box): streamFrom("vehicles", areaId).
export function streamFrom(...parts) {
  return mulberry32(hashString(parts.join(":")));
}

// Deterministic unit hash in [0, 1) from string parts (stable choice
// without consuming a stream).
export function unitFrom(...parts) {
  return mulberry32(hashString(parts.join(":")))();
}

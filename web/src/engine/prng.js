// Seeded PRNG for the life engine (pure, no Math.random, no Date).
//
// Algorithm (documented for the scenario schema): one 32-bit stream per
// agent, mulberry32 (public-domain, by Tommy Ettinger) seeded by the
// FNV-1a 32-bit hash of `${seed}:${agentKey}`. Streams are independent:
// adding an agent never shifts another agent's draws. All routine draws
// happen up front in a fixed order, so hook choices (stage 4) can never
// shift the random sequence either.

// FNV-1a 32-bit over a UTF-16 string -> uint32.
export function xfnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// mulberry32: seed uint32 -> () -> float in [0, 1).
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

// Independent stream for one stable key (agent id, "background", ...).
export function streamFor(seed, key) {
  return mulberry32(xfnv1a(`${seed}:${key}`));
}

// Uniform int in [0, n).
export function intBelow(rng, n) {
  return Math.floor(rng() * n);
}

// Fisher-Yates shuffle; returns a new array, input untouched.
export function shuffled(rng, arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = intBelow(rng, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

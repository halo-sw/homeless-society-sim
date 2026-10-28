import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { intBelow, mulberry32, shuffled, streamFor, xfnv1a } from "../src/engine/prng.js";

describe("engine prng", () => {
  it("reproduces the same stream for the same seed + key", () => {
    const a = streamFor(20261102, "h1");
    const b = streamFor(20261102, "h1");
    const sa = Array.from({ length: 100 }, () => a());
    const sb = Array.from({ length: 100 }, () => b());
    assert.deepEqual(sa, sb);
  });

  it("splits independent streams per key", () => {
    const a = streamFor(20261102, "h1");
    const b = streamFor(20261102, "h2");
    const sa = Array.from({ length: 10 }, () => a());
    const sb = Array.from({ length: 10 }, () => b());
    assert.notDeepEqual(sa, sb);
  });

  it("changes streams with the seed", () => {
    const a = streamFor(1, "h1");
    const b = streamFor(2, "h1");
    assert.notDeepEqual([a(), a(), a()], [b(), b(), b()]);
  });

  it("hashes stably (FNV-1a 32-bit)", () => {
    assert.equal(xfnv1a(""), 0x811c9dc5);
    assert.equal(xfnv1a("20261102:h1"), xfnv1a("20261102:h1"));
    const first = mulberry32(0)();
    assert.ok(first >= 0 && first < 1, `mulberry32 in [0,1): ${first}`);
  });

  it("shuffles deterministically without touching the input", () => {
    const input = [0, 1, 2, 3, 4, 5, 6];
    const r1 = shuffled(streamFor(9, "k"), input);
    const r2 = shuffled(streamFor(9, "k"), input);
    assert.deepEqual(r1, r2);
    assert.deepEqual(input, [0, 1, 2, 3, 4, 5, 6]);
    assert.deepEqual([...r1].sort((x, y) => x - y), input);
  });

  it("draws ints below n", () => {
    const rng = streamFor(3, "k");
    for (let i = 0; i < 50; i++) {
      const v = intBelow(rng, 7);
      assert.ok(Number.isInteger(v) && v >= 0 && v < 7);
    }
  });
});

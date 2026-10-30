// 17d time-aware day exposure: a sunlit horizontal surface resolves to
// its palette colour at any daytime hour. Pure tests only — the capture
// URLs in briefs/17-RESULT.md carry the on-screen checks.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { deltaE76, hexToU8, resolvePaintedPixel } from "../src/render/chain.js";

// Songpa-jamsil box centre (same calibration as painted-17c).
const LAT = 37.5132169;
const LON = 127.1001365;
const at = (hhmm, minute) => ({ date: new Date(`2026-11-02T${hhmm}:00+09:00`),
  minute, lat: LAT, lon: LON, camDistM: 17000, framedWidthM: 3500,
  fog: "regional" });

const lumaU8 = ([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b;

describe("17d time-aware day exposure", () => {
  for (const [hhmm, minute] of [["08:50", 530], ["11:00", 660],
    ["14:00", 840], ["17:00", 1020]]) {
    it(`renders sunlit ground within ΔE 10 of beige at ${hhmm}`, () => {
      const g = resolvePaintedPixel(0xcfc4ad, at(hhmm, minute));
      const dE = deltaE76(g.rgb, hexToU8(0xcfc4ad));
      assert.ok(dE <= 10, `ground ${g.rgb} ΔE ${dE.toFixed(2)} at ${hhmm}`);
    });

    it(`renders roofs lighter than ground and below 245 at ${hhmm}`, () => {
      const g = resolvePaintedPixel(0xcfc4ad, at(hhmm, minute));
      const r = resolvePaintedPixel(0xddd8ce, at(hhmm, minute));
      assert.ok(lumaU8(r.rgb) > lumaU8(g.rgb),
        `roof ${r.rgb} vs ground ${g.rgb} at ${hhmm}`);
      assert.ok(Math.max(...r.rgb) < 245,
        `roof ${r.rgb} clips at ${hhmm}`);
    });

    it(`renders roads neutral and ≥ 25 levels under ground at ${hhmm}`, () => {
      const g = resolvePaintedPixel(0xcfc4ad, at(hhmm, minute));
      const d = resolvePaintedPixel(0x5b5d60, at(hhmm, minute));
      assert.ok(Math.abs(d.rgb[0] - d.rgb[2]) <= 10,
        `road ${d.rgb} not neutral at ${hhmm}`);
      const diff = lumaU8(g.rgb) - lumaU8(d.rgb);
      assert.ok(diff >= 25, `road/ground diff ${diff.toFixed(1)} at ${hhmm}`);
    });
  }

  it("keeps the 08:50 17c result (ground, roof gap, road)", () => {
    const g = resolvePaintedPixel(0xcfc4ad, at("08:50", 530));
    assert.deepEqual(g.rgb, [204, 191, 166]);
    const r = resolvePaintedPixel(0xddd8ce, at("08:50", 530));
    assert.ok(lumaU8(r.rgb) - lumaU8(g.rgb) >= 15, "roof gap holds");
    const d = resolvePaintedPixel(0x5b5d60, at("08:50", 530));
    assert.ok(Math.abs(d.rgb[0] - d.rgb[2]) <= 10, "road stays neutral");
    assert.ok(lumaU8(g.rgb) - lumaU8(d.rgb) >= 25, "road gap holds");
  });
});

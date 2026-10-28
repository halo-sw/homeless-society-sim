import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { APARTMENT_FAMILIES, HOUSE_ROOF, NON_RESIDENTIAL, PAPER, apartmentColors, css, residentialColors } from "../src/palette.js";

describe("palette", () => {
  it("uses the paper background", () => {
    assert.equal(css(PAPER), "#fbf7ee");
  });

  it("assigns apartment colors deterministically per complex", () => {
    const a = apartmentColors("w1", "cx000001");
    const b = apartmentColors("w2", "cx000001");
    assert.deepEqual(a, b); // same complex => same colors
    const c = apartmentColors("w3", "cx000002");
    assert.ok(typeof c.wall === "number");
  });

  it("varies families across complexes", () => {
    const walls = new Set();
    for (let i = 0; i < 12; i++) walls.add(apartmentColors(`w${i}`, `cx${i}`).wall);
    assert.ok(walls.size >= 2, "expected per-complex variation");
  });

  it("maps residential classes to distinct colors", () => {
    const apt = residentialColors({ id: "a", residential: "apartment" }, "cx1");
    const house = residentialColors({ id: "h", residential: "house" }, null);
    const non = residentialColors({ id: "n", residential: "none" }, null);
    assert.equal(house.roof, HOUSE_ROOF);
    assert.equal(non.wall, NON_RESIDENTIAL);
    assert.ok(APARTMENT_FAMILIES.some((f) => Math.abs(f.wall - apt.wall) < 0x101010));
    assert.notEqual(apt.wall, non.wall);
  });

  it("falls back to the building id without a complex", () => {
    const a = apartmentColors("solo-w1", null);
    const b = apartmentColors("solo-w1", null);
    assert.deepEqual(a, b);
  });

  it("derives subtle band and darker side tones from the wall", () => {
    const lum = (hex) => 0.299 * ((hex >> 16) & 255) + 0.587 * ((hex >> 8) & 255) + 0.114 * (hex & 255);
    for (const cx of ["cx1", "cx2", "cx3"]) {
      const c = residentialColors({ id: "a", residential: "apartment" }, cx);
      assert.ok(lum(c.side) < lum(c.band) && lum(c.band) < lum(c.wall),
        `side < band < wall for ${cx}`);
      assert.ok(lum(c.band) / lum(c.wall) > 0.94, "banding stays subtle");
    }
    const non = residentialColors({ id: "n", residential: "none" }, null);
    assert.ok(typeof non.side === "number");
  });
});

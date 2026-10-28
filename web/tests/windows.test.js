import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { litCounts, planWindows, slotsForBuilding, LIT_NIGHT_MIN } from "../src/windows.js";

const ORIGIN = { lon: 127.0, lat: 37.5 };

function slab(id = "tower") {
  // 60 × 12 m slab, 10 floors.
  const ring = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  return {
    id, residential: "apartment", height_m: 30, levels: 10,
    geometry: { type: "Polygon", coordinates: [ring(127.0, 37.5, 127.0007, 37.5001)] },
  };
}

function house(id = "cottage") {
  const ring = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]];
  return {
    id, residential: "house", height_m: 6, levels: 2,
    geometry: { type: "Polygon", coordinates: [ring(127.0, 37.5, 127.0001, 37.50009)] },
  };
}

describe("night windows", () => {
  it("lays slots on both long façades, bottom-up", () => {
    const slots = slotsForBuilding(slab(), ORIGIN);
    assert.ok(slots.length > 10);
    // Bottom-up rows: y non-decreasing within each façade half.
    const half = Math.floor(slots.length / 2);
    for (const part of [slots.slice(0, half), slots.slice(half)]) {
      for (let i = 1; i < part.length; i++) {
        assert.ok(part[i].y >= part[i - 1].y - 1e-9);
      }
    }
    // Two façades face opposite ways (rotY differs by ~π).
    const first = slots[0].rotY;
    const opposite = slots.find((s) => Math.abs(Math.abs(s.rotY - first) - Math.PI) < 0.2);
    assert.ok(opposite, "second façade faces the other way");
    // Deterministic.
    assert.deepEqual(slotsForBuilding(slab(), ORIGIN), slots);
  });

  it("plans residential buildings only, capped and sorted", () => {
    const plan = planWindows([slab("b"), house("a"), { ...slab("c"), residential: "none" }], ORIGIN);
    assert.deepEqual(plan.map((b) => b.id), ["a", "b"]);
    assert.ok(plan.every((b) => b.slots.length > 0 && b.slots.length <= 60));
    assert.deepEqual(planWindows([], ORIGIN), []);
    assert.deepEqual(planWindows([{ ...slab(), geometry: null }], ORIGIN), []);
  });

  it("lights windows from at-home residents, never by day", () => {
    const plan = planWindows([slab("t"), house("h")], ORIGIN);
    const occ = new Map([["t", { home: 2, total: 3 }], ["h", { home: 0, total: 1 }]]);
    assert.equal(litCounts(plan, occ, 0).size, 0);
    assert.equal(litCounts(plan, occ, LIT_NIGHT_MIN - 0.01).size, 0);
    const lit = litCounts(plan, occ, 1);
    assert.equal(lit.get("t"), 4); // 2 residents × 2
    assert.ok(!lit.has("h")); // nobody home: dark
    assert.equal(litCounts(plan, new Map([["t", { home: 99, total: 99 }]]), 1).get("t"),
      plan[1].slots.length); // capped at the slot count
  });
});

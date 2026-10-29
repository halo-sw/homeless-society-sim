import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildOrbData, regionHoverFacts, dotKeyFor, fitColorFor, litDots,
} from "../src/orb.js";

const REGIONS = { regions: [
  { id: "bundang", label: "성남 분당구", bbox: [127, 37.3, 127.2, 37.5] },
  { id: "gangnam", label: "서울 강남구", bbox: [127, 37.4, 127.2, 37.6] },
] };
const HOMES = [
  { id: "h1", region: "bundang", lon: 127.1, lat: 37.4,
    buckets: [{ center_m2: 60, jeonse: { median_won: 300000000 } }] },
  { id: "h2", region: "bundang", lon: 127.11, lat: 37.41,
    buckets: [{ center_m2: 65, jeonse: { median_won: 500000000 } }] },
];
const MANIFEST = { items: [
  { lon: 127.1, lat: 37.4 }, { lon: 127.11, lat: 37.41 }, { lon: 130, lat: 38 },
] };

describe("orb data builder", () => {
  it("builds shapes, station points and home dots", () => {
    const orb = buildOrbData({ regions: REGIONS,
      stations: [{ name: "서현", lon: 127.1, lat: 37.4 }, { name: "bad" }],
      homes: HOMES,
      candidates: [{ id: "h1", tenures: [{ budget_fit: "all" }] }],
      manifest: MANIFEST,
      rentalCoverage: { bundang: { present: true } } });
    assert.equal(orb.shapes.length, 2);
    assert.equal(orb.points.length, 1);
    assert.equal(orb.dots.length, 2);
    const d1 = orb.dots.find((d) => d.id === "h1");
    assert.equal(d1.found, true);
    assert.equal(d1.key, dotKeyFor("h1"));
    assert.equal(d1.color, fitColorFor("all"));
    assert.equal(litDots(orb, ["h1"]).length, 1);
  });
  it("reports hover facts per region", () => {
    const facts = regionHoverFacts("bundang",
      { homes: HOMES, manifest: MANIFEST,
        rentalCoverage: { bundang: { present: true } } });
    assert.equal(facts.homes, 2);
    assert.equal(facts.jeonse60MedianWon, 400000000);
    assert.equal(facts.photos, 2);
    assert.equal(facts.publicRental, true);
    const empty = regionHoverFacts("gangnam",
      { homes: HOMES, manifest: MANIFEST, rentalCoverage: {} });
    assert.equal(empty.homes, 0);
    assert.equal(empty.jeonse60MedianWon, null);
    assert.equal(empty.publicRental, false);
  });
});

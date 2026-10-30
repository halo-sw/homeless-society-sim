import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  BAY_W_M, FACADE_TILES, FLOOR_H_M, TEX_SIZE,
  aviationBlink, emissiveLitShare, facadeBays, facadeRows, facadeTileFor,
  facadeUV, floorBand, floorWindowThreshold, hashPixels, litFractionFor,
  needsAviationLight, synthFacade,
} from "../src/render/facades.js";
import { buildBuildings } from "../src/buildings.js";

const ORIGIN = { lon: 127.0, lat: 37.5 };

function rectPoly(lon, lat, w, d) {
  return {
    type: "Polygon",
    coordinates: [[[lon, lat], [lon + w, lat], [lon + w, lat + d], [lon, lat + d], [lon, lat]]],
  };
}

describe("facade maths", () => {
  it("counts rows from levels, else height / 3 m", () => {
    assert.equal(facadeRows(15, 45), 15);
    assert.equal(facadeRows(null, 30), 10);
    assert.equal(facadeRows(0, 30), 10);
    assert.equal(facadeRows(undefined, undefined), 1);
    assert.equal(FLOOR_H_M, 3.0);
  });

  it("lays bays ~3.2 m wide (brief: 3–3.6 m)", () => {
    assert.ok(BAY_W_M >= 3 && BAY_W_M <= 3.6);
    assert.equal(facadeBays(12.8), 4);
    assert.equal(facadeBays(1), 1);
    // Implied bay width stays in the brief's band for long walls.
    for (const len of [20, 33.5, 60, 101]) {
      const w = len / facadeBays(len);
      assert.ok(w >= 2.9 && w <= 3.7, `${len} m -> ${w} m bays`);
    }
  });

  it("maps wall metres to tile UV", () => {
    const tile = FACADE_TILES.apartment; // 12.8 x 12.0 m
    assert.deepEqual(facadeUV(0, 0, tile), [0, 0]);
    assert.deepEqual(facadeUV(12.8, 12.0, tile), [1, 1]);
    assert.deepEqual(facadeUV(6.4, 3.0, tile), [0.5, 0.25]);
  });

  it("selects facade class from residential use", () => {
    assert.equal(facadeTileFor("apartment"), FACADE_TILES.apartment);
    assert.equal(facadeTileFor("house"), FACADE_TILES.house);
    assert.equal(facadeTileFor("mixed"), FACADE_TILES.mixed);
    assert.equal(facadeTileFor("none"), FACADE_TILES.none);
    assert.equal(facadeTileFor("bogus"), FACADE_TILES.none);
  });

  it("derives night lit fractions from run occupancy (home / total)", () => {
    assert.equal(litFractionFor({ home: 3, total: 4 }), 0.75);
    assert.equal(litFractionFor({ home: 0, total: 4 }), 0);
    assert.equal(litFractionFor({ home: 2, total: 2 }), 1);
    assert.equal(litFractionFor(undefined), 0); // unoccupied: dark
    assert.equal(litFractionFor({ home: 0, total: 0 }), 0);
    assert.equal(litFractionFor({ home: 9, total: 4 }), 1); // clamped
  });
});

describe("facade synthesis", () => {
  it("synthesises every class at 512 px with three maps", () => {
    for (const cls of Object.keys(FACADE_TILES)) {
      const set = synthFacade(cls, 1);
      for (const buf of [set.map, set.rough, set.emissive]) {
        assert.equal(buf.length, TEX_SIZE * TEX_SIZE * 4);
      }
    }
    assert.throws(() => synthFacade("castle", 1), /unknown facade class/);
  });

  it("is deterministic per seed and distinct across seeds/classes", () => {
    const a = synthFacade("apartment", 1);
    const b = synthFacade("apartment", 1);
    assert.equal(hashPixels(a.map), hashPixels(b.map));
    assert.equal(hashPixels(a.emissive), hashPixels(b.emissive));
    const other = synthFacade("apartment", 2);
    assert.notEqual(hashPixels(a.map), hashPixels(other.map));
    const house = synthFacade("house", 1);
    assert.notEqual(hashPixels(a.map), hashPixels(house.map));
  });

  it("lights ~fraction of window texels at lit fraction f", () => {
    const { emissive } = synthFacade("apartment", 1);
    assert.equal(emissiveLitShare(emissive, 1), 1);
    assert.ok(emissiveLitShare(emissive, 0) < 0.03);
    let prev = -1;
    for (const f of [0.25, 0.5, 0.75]) {
      const share = emissiveLitShare(emissive, f);
      assert.ok(Math.abs(share - f) < 0.2, `f=${f} share=${share}`);
      assert.ok(share > prev, "monotone");
      prev = share;
    }
  });

  it("paints glass smoother than wall in the roughness map", () => {
    const { map, rough, emissive } = synthFacade("apartment", 1);
    let glassRough = 0;
    let glassN = 0;
    let wallRough = 0;
    let wallN = 0;
    for (let i = 0; i < emissive.length; i += 4) {
      if (emissive[i] > 0) {
        glassRough += rough[i + 1];
        glassN++;
      } else if (map[i + 3] > 0) {
        wallRough += rough[i + 1];
        wallN++;
      }
    }
    assert.ok(glassN > 1000);
    assert.ok(glassRough / glassN < (wallRough / wallN) * 0.5);
  });
});

describe("building detail buckets", () => {
  function buildings() {
    return [
      { id: "slab", residential: "apartment", levels: 15, height_m: 45,
        geometry: rectPoly(127.0, 37.5, 0.0004, 0.00015) },
      { id: "house", residential: "house", levels: 2, height_m: 6,
        geometry: rectPoly(127.001, 37.501, 0.00015, 0.00008) },
      { id: "shop", residential: "none", levels: 3, height_m: 12,
        geometry: rectPoly(127.002, 37.502, 0.0002, 0.0001) },
    ];
  }

  it("emits per-class wall buckets + podium + roofs with metre UVs", () => {
    const out = buildBuildings(buildings(), [], ORIGIN);
    const { walls, podium, roofs } = out.detail;
    assert.ok(walls.apartment.triangles > 0);
    assert.ok(walls.house.triangles > 0);
    assert.ok(walls.none.triangles > 0);
    assert.equal(walls.mixed.triangles, 0);
    assert.ok(podium.triangles > 0, "tall non-residential gets a podium band");
    assert.ok(roofs.triangles > 0);
    for (const data of [...Object.values(walls), podium, roofs]) {
      assert.equal(data.uvs.length, (data.positions.length / 3) * 2);
    }
    // Legacy buckets keep their shape (+uvs).
    assert.equal(out.residential.uvs.length, (out.residential.positions.length / 3) * 2);
  });

  it("runs wall U along the ring and V up the height", () => {
    const out = buildBuildings([buildings()[0]], [], ORIGIN);
    const data = out.detail.walls.apartment;
    let maxU = 0;
    let maxV = 0;
    for (let i = 0; i < data.uvs.length; i += 2) {
      maxU = Math.max(maxU, data.uvs[i]);
      maxV = Math.max(maxV, data.uvs[i + 1]);
    }
    // Ring perimeter ~110 m, height 45 m.
    assert.ok(maxU > 80 && maxU < 200, `maxU=${maxU}`);
    assert.ok(Math.abs(maxV - 45) < 0.01, `maxV=${maxV}`);
  });

  it("crowns flat roofs with parapets and plants tall towers", () => {
    const out = buildBuildings(buildings(), [], ORIGIN);
    assert.ok(out.stats.parapet >= 2, `parapets: ${out.stats.parapet}`);
    // Slab: 45 m walls + 1.1 m parapet ring + 2.2 m rooftop box on top.
    let maxH = 0;
    let ring = 0;
    for (let i = 1; i < out.residential.positions.length; i += 3) {
      const h = out.residential.positions[i];
      maxH = Math.max(maxH, h);
      if (h > 46.05 && h < 46.15) ring++;
    }
    assert.ok(Math.abs(maxH - 47.2) < 0.01, `maxH=${maxH}`);
    assert.ok(ring > 0, "parapet cap ring at 46.1 m");
    const tall = buildBuildings(
      [{ id: "tower", residential: "none", levels: 12, height_m: 40,
        geometry: rectPoly(127.0, 37.5, 0.0003, 0.0002) }], [], ORIGIN);
    assert.equal(tall.stats.plant, 1);
  });

  it("switches whole seeded floors off as the lit fraction falls (14e)", () => {
    // Distinct bands 0..rows-1 per class, deterministic in the floor.
    for (const cls of ["apartment", "house", "mixed", "none"]) {
      const rows = FACADE_TILES[cls].rows;
      const bands = [];
      for (let r = 0; r < rows; r++) {
        assert.equal(floorBand(cls, r, rows), floorBand(cls, r, rows));
        bands.push(floorBand(cls, r, rows));
      }
      assert.deepEqual([...bands].sort((a, b) => a - b),
        bands.map((_, i) => i));
    }
    // Guard gaps keep floors strictly ordered: the highest threshold of
    // the lowest band stays below the lowest of the highest band.
    const rows = FACADE_TILES.apartment.rows;
    const bandOf = (r) => floorBand("apartment", r, rows);
    const lo = [0, 1, 2, 3].find((r) => bandOf(r) === 0);
    const hi = [0, 1, 2, 3].find((r) => bandOf(r) === rows - 1);
    assert.ok(floorWindowThreshold("apartment", lo, rows, 1)
      < floorWindowThreshold("apartment", hi, rows, 0));
    for (const t of [floorWindowThreshold("apartment", 0, rows, 0),
        floorWindowThreshold("apartment", 0, rows, 1)]) {
      assert.ok(Number.isInteger(t) && t >= 0 && t <= 255);
    }
    // Tile level: per-row mean window thresholds differ floor to floor.
    const means = [];
    for (const seed of [1, 1]) {
      const { emissive } = synthFacade("apartment", seed);
      const rowH = TEX_SIZE / rows;
      const m = [];
      for (let r = 0; r < rows; r++) {
        let sum = 0;
        let n = 0;
        for (let y = r * rowH; y < (r + 1) * rowH; y++) {
          for (let x = 0; x < TEX_SIZE; x++) {
            const i = (y * TEX_SIZE + x) * 4;
            if (emissive[i] > 0) {
              sum += emissive[i + 1];
              n++;
            }
          }
        }
        assert.ok(n > 100, `row ${r} has windows`);
        m.push(sum / n);
      }
      means.push(m);
    }
    assert.deepEqual(means[0], means[1]); // deterministic
    assert.ok(Math.max(...means[0]) - Math.min(...means[0]) > 30);
  });

  it("blinks red aviation beacons on towers ≥ 60 m (14e)", () => {
    assert.equal(needsAviationLight(59.9), false);
    assert.equal(needsAviationLight(60), true);
    assert.equal(needsAviationLight(149), true);
    assert.equal(needsAviationLight(null), false);
    assert.equal(needsAviationLight(undefined), false);
    // One hard flash per 1.5 s, procedural in t.
    assert.equal(aviationBlink(0), 1);
    assert.equal(aviationBlink(0.11), 1);
    assert.equal(aviationBlink(0.13), 0);
    assert.equal(aviationBlink(1.4), 0);
    assert.equal(aviationBlink(1.5), 1);
    assert.equal(aviationBlink(3.0), 1);
    assert.equal(aviationBlink(1.2), aviationBlink(1.2 + 1.5));
    assert.equal(aviationBlink(NaN), 0);
  });

  it("keeps per-building ranges aligned with vertex counts", () => {
    const out = buildBuildings(buildings(), [], ORIGIN);
    for (const data of [...Object.values(out.detail.walls), out.detail.podium, out.detail.roofs]) {
      const verts = data.positions.length / 3;
      for (const r of data.ranges) {
        assert.ok(r.start >= 0 && r.start + r.count <= verts, `${r.id} range`);
      }
    }
    const ids = new Set(out.detail.roofs.ranges.map((r) => r.id));
    assert.deepEqual([...ids].sort(), ["house", "shop", "slab"]);
  });
});

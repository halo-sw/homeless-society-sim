// Stage 15, part 3: distance fares (수도권 통합 거리비례 운임, 2025-06-28).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { distanceFare, fareForTrip, resolveLegKm, SHINBUNDANG_EXTRA,
  SHINBUNDANG_PENDING_NOTE } from "../src/money/fare.js";
import { parseInterstationCsv } from "../src/transit/schedule.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

describe("distance fare (stage 15.3)", () => {
  it("pins the fare vectors", () => {
    assert.equal(distanceFare(9.9), 1550);
    assert.equal(distanceFare(10), 1550);
    assert.equal(distanceFare(10.1), 1650);
    assert.equal(distanceFare(50), 2350);
    assert.equal(distanceFare(58.1), 2450);
    assert.equal(distanceFare(0), 1550);
  });

  it("charges one journey fare over summed km (transfers add no base)", () => {
    const two = fareForTrip({ legs: [
      { km: 6, official: true }, { km: 6, official: true },
    ], card: "transit_card", age: "adult" });
    assert.equal(two.fare_won, 1650); // 12 km, not 2 × 1550
    assert.equal(two.transfers, 1);
    assert.equal(two.distance, "공식");
    const one = fareForTrip({ legs: [{ km: 12, official: true }] });
    assert.equal(one.fare_won, two.fare_won);
  });

  it("adds 100원 for a single-use ticket", () => {
    const card = fareForTrip({ legs: [{ km: 5, official: true }] });
    const single = fareForTrip({ legs: [{ km: 5, official: true }], card: "single_use" });
    assert.equal(card.fare_won, 1550);
    assert.equal(single.fare_won, 1650);
    assert.equal(single.single_use_added_won, 100);
  });

  it("keeps 신분당선 surcharges null with 확인 필요", () => {
    assert.equal(SHINBUNDANG_EXTRA.status, "확인 필요");
    assert.deepEqual(Object.keys(SHINBUNDANG_EXTRA.segments).sort(),
      ["강남–정자", "신사–강남", "정자–광교"].sort());
    for (const v of Object.values(SHINBUNDANG_EXTRA.segments)) {
      assert.equal(v, null);
    }
    const priced = fareForTrip({ legs: [
      { km: 8, official: true, lineName: "신분당선", stops: ["강남", "정자"] },
    ] });
    assert.equal(priced.shinbundang.status, "확인 필요");
    assert.equal(priced.shinbundang.extra_won, null);
    assert.equal(priced.shinbundang.note, SHINBUNDANG_PENDING_NOTE);
    assert.deepEqual(priced.shinbundang.segments.sort(),
      ["강남–정자", "신사–강남", "정자–광교"].sort());
    assert.equal(priced.source, "가정값");
  });

  it("resolves leg km from the operator table, else marks 추정", async () => {
    const text = await readFile(join(ROOT, "scenarios", "transit",
      "seoul-metro-interstation.csv"), "utf8");
    const schedule = parseInterstationCsv(text);
    // Line 1, 서울역→시청: the file's first gap (1.1 km).
    const official = resolveLegKm(
      { line: "line1", lineName: "1호선", stops: ["서울역", "시청"], distanceKm: 9.9 },
      { schedule });
    assert.deepEqual(official, { km: 1.1, official: true });
    // A line the file does not cover falls back to OSM chainage (추정).
    const osm = resolveLegKm(
      { line: "bundang", lineName: "수인·분당선", stops: ["복정", "판교"], distanceKm: 5 },
      { schedule });
    assert.deepEqual(osm, { km: 5, official: false });
    // No chainage either: straight line × 1.2 (추정).
    const straight = resolveLegKm({ line: "x", stops: ["a", "b"], straight_km: 10 }, {});
    assert.deepEqual(straight, { km: 12, official: false });
    assert.equal(resolveLegKm({ line: "x", stops: ["a"] }, {}), null);
  });

  it("marks estimated distances 추정 and official ones 공식", () => {
    const est = fareForTrip({ legs: [{ km: 5, official: false }] });
    assert.equal(est.distance, "추정");
    assert.equal(est.source, "가정값");
    const off = fareForTrip({ legs: [{ km: 5, official: true }] });
    assert.equal(off.distance, "공식");
    assert.equal(off.source, "molti-fare");
    assert.equal(fareForTrip({ legs: [] }), null);
    assert.equal(fareForTrip({ legs: [{ km: 5 }], age: "child" }), null);
  });
});

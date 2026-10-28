import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeSnapshot, noticesFor, createHousingApi, recommendPublicRental,
  attributionFor, HOUSING_API_BASE, DEFAULT_BURDEN_THRESHOLD_PCT,
  BURDEN_THRESHOLD_NOTE, ELIGIBILITY_NOTE,
} from "../src/money/housing.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const SNAP = join(REPO, "data", "raw", "public_housing", "snapshot_3districts.json");

async function realSnapshot() {
  try {
    return normalizeSnapshot(JSON.parse(await readFile(SNAP, "utf8")));
  } catch {
    return null;
  }
}

function tinySnapshot() {
  return normalizeSnapshot({
    fetched_at: "2026-10-28T19:19:15+0900",
    complexes: [
      { source: "lh-complexes", id: "a1", name: "서울특별시 송파구", address: "서울특별시 송파구 마천동 100",
        pnu: "1171010100100440000", unit_types: [
          { unit_type: "51", building_type: "아파트", exclusive_area_m2: "51.5",
            deposit_won: "50000000", monthly_rent_won: "300000" },
          { unit_type: "84", building_type: "아파트", exclusive_area_m2: "84.0",
            deposit_won: "150000000", monthly_rent_won: "800000" },
        ] },
      { source: "lh-complexes", id: "b2", name: "서울특별시 성동구", address: "서울특별시 성동구 성수동 200",
        pnu: "1120010100100010000", unit_types: [
          { unit_type: "41", building_type: "아파트", exclusive_area_m2: "41.5",
            deposit_won: "40000000", monthly_rent_won: "250000" },
        ] },
      { source: "youth-complexes", id: "y1", name: "잠실새내역점", address: "송파구 석촌호수로 74",
        pnu: null, latitude: "37.5", longitude: "127.08" },
    ],
    notices: [
      { source: "lh-notices", id: "n1", title: "마천동 행복주택 입주자 모집",
        announced_at: "2026.10.01", address: "서울특별시 송파구 마천동",
        source_url: "https://apply.lh.or.kr/x" },
      { source: "lh-notices", id: "n2", title: "김포 공고",
        announced_at: "2026.08.25", address: "경기도 김포시",
        source_url: "https://apply.lh.or.kr/y" },
    ],
  });
}

describe("public rental", () => {
  it("normalises the snapshot and links notices by address", () => {
    const snap = tinySnapshot();
    assert.equal(snap.complexes.length, 3);
    assert.equal(snap.complexes[0].unit_types.length, 2);
    assert.equal(snap.complexes[2].unit_types.length, 0); // youth: no prices
    const hits = noticesFor(snap.complexes[0], snap.notices);
    assert.equal(hits.length, 1);
    assert.equal(hits[0].id, "n1");
    assert.match(attributionFor(snap), /LH·마이홈/);
    assert.match(attributionFor(snap), /2026-10-28/);
    assert.equal(DEFAULT_BURDEN_THRESHOLD_PCT, 30);
    assert.match(BURDEN_THRESHOLD_NOTE, /기준선/);
    assert.match(ELIGIBILITY_NOTE, /공고 원문/);
  });

  it("filters by burden + area and ranks by commute", () => {
    const snap = tinySnapshot();
    const rec = recommendPublicRental(snap, {
      monthlyNetWon: 4000000, thresholdPct: 30, targetAreaM2: 50, areaTolM2: 10,
      commuteMinutes: (c) => (c.id === "a1" ? 25 : 10), limit: 5,
    });
    // a1/51평형(30만원, 7.5%) + b2/39형(25만원, 6.25%) pass; a1/84형(면적 초과) drops.
    assert.equal(rec.total, 2);
    assert.equal(rec.candidates[0].complex_id, "b2"); // shorter commute first
    assert.equal(rec.candidates[0].burden_pct, 6.3); // 250000/4000000
    assert.equal(rec.candidates[0].notices.length, 0);
    assert.equal(rec.candidates[1].notices.length, 1);
    // Tight threshold drops everything honestly.
    const tight = recommendPublicRental(snap, {
      monthlyNetWon: 4000000, thresholdPct: 5, targetAreaM2: 50,
      commuteMinutes: () => 10,
    });
    assert.equal(tight.total, 0);
  });

  it("calls the API with Bearer auth (stubbed fetch)", async () => {
    let seen = null;
    const api = createHousingApi({
      key: "k123",
      fetchImpl: async (url, opts) => {
        seen = { url, opts };
        return { ok: true, json: async () => ({ items: [] }) };
      },
    });
    await api.complexes({ district: "songpa" });
    assert.match(seen.url, new RegExp(`^${HOUSING_API_BASE.replace(/[./]/g, (c) => `\\${c}`)}/complexes`));
    assert.equal(seen.opts.headers.Authorization, "Bearer k123");
    assert.throws(() => createHousingApi({ key: "x" }), /fetchImpl/);
  });

  it("ranks the real snapshot (local file, never committed)", async (t) => {
    const snap = await realSnapshot();
    if (!snap) return t.skip("no snapshot");
    assert.ok(snap.complexes.length > 100);
    assert.ok(snap.notices.length > 100);
    const rec = recommendPublicRental(snap, {
      monthlyNetWon: 7000000, thresholdPct: 30, targetAreaM2: 60, areaTolM2: 10,
      commuteMinutes: () => null, limit: 5,
    });
    assert.ok(rec.total > 10, `total ${rec.total}`);
    assert.equal(rec.candidates.length, 5);
    for (const c of rec.candidates) {
      assert.ok(Math.abs(c.exclusive_area_m2 - 60) <= 10);
      assert.ok(c.burden_pct === null || c.burden_pct <= 30);
      assert.equal(c.simulated, false);
    }
    assert.match(rec.attribution, /스냅샷/);
  });
});

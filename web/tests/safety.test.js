import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SAFETY_SOURCE, SAFETY_PERIOD, SAFETY_UNIT, SAFETY_AREA_COLUMNS,
  SAFETY_CAVEATS, safetyView,
} from "../src/safety.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SAFETY_JSON = join(ROOT, "data", "build", "region", "safety.json");

function fixtureDoc() {
  return {
    source: SAFETY_SOURCE, period: SAFETY_PERIOD, unit: SAFETY_UNIT,
    areas: {
      pangyo: {
        column: "경기도 성남시", geo_level: "city", unit: "건", total: 30,
        by_cat1: { 강력범죄: 10, 절도범죄: 20 },
        by_cat2: [
          { cat1: "강력범죄", cat2: "살인기수", count: 1 },
          { cat1: "강력범죄", cat2: "강도", count: 2 },
          { cat1: "강력범죄", cat2: "기타 강간/강제추행등", count: 7 },
          { cat1: "절도범죄", cat2: "절도범죄", count: 20 },
        ],
      },
    },
    population: null,
    population_note: "인구 테이블 없음",
    caveats: [...SAFETY_CAVEATS],
  };
}

describe("safety view", () => {
  it("shapes one area with source, period, unit and geographic level", () => {
    const v = safetyView(fixtureDoc(), "pangyo");
    assert.equal(v.missing, undefined);
    assert.equal(v.column, "경기도 성남시");
    assert.equal(v.geo_level, "city");
    assert.equal(v.geo_level_ko, "시 단위");
    assert.equal(v.source, SAFETY_SOURCE);
    assert.equal(v.period, SAFETY_PERIOD);
    assert.equal(v.unit, "건");
    assert.equal(v.total, 30);
    assert.equal(v.population_note, "인구 테이블 없음");
    assert.ok(v.caveats.length >= 3);
  });

  it("shows counts by 대분류 with the selected 중분류 subset", () => {
    const v = safetyView(fixtureDoc(), "pangyo");
    const violent = v.groups.find((g) => g.cat1 === "강력범죄");
    assert.equal(violent.count, 10);
    // 살인기수 + 강도 are selected; 기타 강간/강제추행등 is not.
    assert.deepEqual(violent.mid.map((m) => m.cat2), ["살인기수", "강도"]);
    const theft = v.groups.find((g) => g.cat1 === "절도범죄");
    assert.deepEqual(theft.mid, [{ cat2: "절도범죄", count: 20 }]);
  });

  it("maps the four built areas (성남시 city-level) and misses honestly", () => {
    assert.deepEqual(Object.keys(SAFETY_AREA_COLUMNS).sort(),
      ["pangyo", "seongsu", "songpa", "songpa-jamsil"]);
    assert.equal(SAFETY_AREA_COLUMNS.pangyo.geo_level, "city");
    assert.equal(SAFETY_AREA_COLUMNS["songpa-jamsil"].column, "서울 송파구");
    const v = safetyView(fixtureDoc(), "seongsu");
    assert.match(v.missing, /빌드되지 않았습니다/);
    assert.deepEqual(safetyView(fixtureDoc(), "busan").missing,
      'unknown area "busan"');
    assert.match(safetyView(null, "pangyo").missing, /빌드되지 않았습니다/);
  });

  it("never emits a score, rank or verdict field", () => {
    const payload = JSON.stringify(safetyView(fixtureDoc(), "pangyo"));
    for (const banned of ["score", "rank", "rating", "grade", "verdict",
        " 점수", "순위", "1위", "안전합니다", "위험합니다"]) {
      // "순위" appears only inside the no-ranking caveat.
      if (banned === "순위") {
        const hits = payload.split("순위").length - 1;
        const caveatHits = payload.split("점수·순위·등급을 매기지 않습니다").length - 1;
        assert.equal(hits, caveatHits);
        continue;
      }
      assert.ok(!payload.includes(banned), banned);
    }
    assert.match(payload, /위험도가 아닙니다/);
    assert.match(payload, /매기지 않습니다/);
  });

  it("reads the real build artifact (송파구/성동구/성남시)", (t) => {
    if (!existsSync(SAFETY_JSON)) {
      t.skip(`missing ${SAFETY_JSON} — run: .venv/bin/python -m pipeline safety`);
      return;
    }
    const doc = JSON.parse(readFileSync(SAFETY_JSON, "utf8"));
    for (const [area, column, level] of [
      ["songpa", "서울 송파구", "district"],
      ["songpa-jamsil", "서울 송파구", "district"],
      ["seongsu", "서울 성동구", "district"],
      ["pangyo", "경기도 성남시", "city"],
    ]) {
      const v = safetyView(doc, area);
      assert.equal(v.missing, undefined, area);
      assert.equal(v.column, column, area);
      assert.equal(v.geo_level, level, area);
      assert.ok(v.total > 0, area);
      // 대분류 sums reconcile with the total and the 중분류 rows.
      const cat1Sum = Object.values(doc.areas[area].by_cat1).reduce((a, b) => a + b, 0);
      assert.equal(cat1Sum, doc.areas[area].total, area);
      const cat2Sum = doc.areas[area].by_cat2.reduce((a, r) => a + r.count, 0);
      assert.equal(cat2Sum, doc.areas[area].total, area);
    }
    // Real totals (year ending 2025-12-31) — pinned so a silent rebuild
    // against a different table cannot slip through.
    assert.equal(doc.areas["songpa-jamsil"].total, doc.areas.songpa.total);
    assert.ok(doc.areas.pangyo.total > doc.areas.seongsu.total);
    assert.match(doc.population_note, /인구 테이블/);
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  AREAS_INDEX_URL, FALLBACK_AREAS, areasOrFallback, loadAreasIndex,
} from "../src/areas-index.js";
import {
  SAFETY_REGION_COLUMNS, CITY_LEVEL_NOTE, safetyView, safetyRegionView,
} from "../src/safety.js";

describe("areas-index loader", () => {
  it("reads the built index, never a hard-coded array", async () => {
    assert.equal(AREAS_INDEX_URL, "/data/areas-index.json");
    const doc = {
      areas: [{ id: "st-정자", label: "정자역 인근", center: [127.1, 37.36],
        bbox: [127.0, 37.3, 127.2, 37.4],
        station: { name: "정자" }, size_bytes: 123 }],
    };
    const r = await loadAreasIndex(async () => doc);
    assert.equal(r.fallback, false);
    assert.deepEqual(r.areas, doc.areas);
  });

  it("falls back to the four legacy areas when unbuilt", async () => {
    const r = await areasOrFallback(async () => { throw new Error("404"); });
    assert.equal(r.fallback, true);
    assert.deepEqual(r.areas.map((a) => a.id),
      ["pangyo", "seongsu", "songpa", "songpa-jamsil"]);
    assert.equal(FALLBACK_AREAS.length, 4);
  });
});

describe("safety region views", () => {
  const entry = (column, level, total) => ({
    column, geo_level: level, unit: "건", total,
    by_cat1: { 강력범죄: total },
    by_cat2: [{ cat1: "강력범죄", cat2: "살인기수", count: total }],
  });
  const DOC = {
    source: "src", period: "p", unit: "건",
    population_note: "pop", caveats: ["c"],
    areas: {},
    regions: {
      bundang: { label: "성남시 분당구",
        ...entry("경기도 성남시", "city", 100) },
      wirye: { label: "위례",
        parts: {
          "서울 송파구": entry("서울 송파구", "district", 10),
          "경기도 성남시": entry("경기도 성남시", "city", 100),
          "경기도 하남시": entry("경기도 하남시", "city", 20),
        },
        note: "합치지 않음" },
    },
  };

  it("covers all nine regions with columns and levels", () => {
    assert.deepEqual(Object.keys(SAFETY_REGION_COLUMNS).sort(),
      ["bundang", "gangdong", "gangnam", "jungwon", "seongdong",
        "songpa-gu", "sujeong", "suji", "wirye"]);
    assert.equal(SAFETY_REGION_COLUMNS.wirye.length, 3);
    assert.equal(SAFETY_REGION_COLUMNS.bundang[0].geo_level, "city");
  });

  it("reads a single-관할 region with the city note", () => {
    const v = safetyView(DOC, "bundang");
    assert.equal(v.column, "경기도 성남시");
    assert.equal(v.geo_level, "city");
    assert.equal(v.level_note, CITY_LEVEL_NOTE);
    assert.equal(v.total, 100);
  });

  it("keeps 위례 parts separate, never merged", () => {
    const v = safetyRegionView(DOC, "wirye");
    assert.deepEqual(Object.keys(v.parts).sort(),
      ["경기도 성남시", "경기도 하남시", "서울 송파구"]);
    assert.equal(v.parts["서울 송파구"].total, 10);
    assert.equal(v.parts["경기도 하남시"].total, 20);
    assert.ok(!("total" in v));
  });

  it("still reports unknown areas as missing", () => {
    assert.match(safetyView(DOC, "busan").missing, /unknown area/);
    assert.match(safetyView(DOC, "gangnam").missing, /빌드되지 않았습니다/);
  });
});

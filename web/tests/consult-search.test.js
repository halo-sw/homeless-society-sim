import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { callTool, createSession } from "../src/consult/tools.js";
import {
  SEARCH_TOOL_DEFS, SEARCH_HANDLERS, regionsForNames, kindForName,
} from "../src/consult/tools-search.js";
import { emptyProfile, field } from "../src/profile.js";

function bucket(center, jeonse) {
  return {
    center_m2: center, range_m2: [center - 5, center + 5],
    trade: null,
    jeonse: jeonse ? { count: jeonse[0], median_won: jeonse[1],
      min_won: jeonse[2], max_won: jeonse[3] } : null,
    wolse: null,
  };
}

const HOMES = {
  homes: [
    { id: "home-000001", name: "정자푸르지오", kind: "아파트", region: "bundang",
      lon: 127.1, lat: 37.39, build_year: 2010, buckets: [bucket(60, [5, 280000000, 250000000, 320000000])],
      station: { station: "정자", walk_minutes: 8, source: "graph" },
      scene: "st-정자", photos_700m: 2 },
    { id: "home-000002", name: "미금빌라", kind: "연립·다세대", region: "bundang",
      lon: 127.11, lat: 37.38, build_year: 2005, buckets: [bucket(60, [4, 150000000, 120000000, 180000000])],
      station: null, scene: null, photos_700m: 0 },
  ],
};

const NETWORK = {
  lines: [{
    id: "bundang", name: "수인·분당선",
    stops: [
      { id: "s1", key: "정자", name: "정자" },
      { id: "s2", key: "판교", name: "판교" },
    ],
    patterns: [{ id: "p1", stops: ["s1", "s2"], chainage_km: [0, 2.0] }],
  }],
};

const PHOTOS = { items: [] };

function profile() {
  const p = emptyProfile();
  p.members = field([{ role: "adult" }], "customer", "");
  p.workplaces = field([{ member: 0, text: "판교", resolved: { station: "판교" } }],
    "customer", "");
  p.tenure = field("jeonse", "customer", "");
  p.depositMax = field(200000000, "customer", "");
  return p;
}

function session(over = {}) {
  return createSession({
    scenario: { name: "t", household: { members: [] }, homes: [] },
    loadArea: async (id) => ({
      complexes: [{ id: "cx1", name: "정자푸르지오", building_ids: ["b1"] }],
      buildings: [{ id: "b1", register: { pnu: "4113512345678901234" } }],
      graph: { nodes: {}, edges: {} }, pois: [],
    }),
    loadHomes: async () => HOMES,
    loadRegion: async () => ({ network: NETWORK, congestion: null }),
    loadPhotos: async () => PHOTOS,
    ...over,
  });
}

describe("search tool defs", () => {
  it("exposes four documented tools", () => {
    assert.deepEqual(SEARCH_TOOL_DEFS.map((t) => t.function.name).sort(),
      ["build_scenario", "extract_profile", "find_homes", "find_public_rentals"]);
    assert.deepEqual(Object.keys(SEARCH_HANDLERS).sort(),
      ["build_scenario", "extract_profile", "find_homes", "find_public_rentals"]);
  });

  it("maps region words and kind words", () => {
    assert.deepEqual(regionsForNames(["송파", "판교", "위례"]),
      ["songpa-gu", "bundang", "wirye"]);
    assert.deepEqual(regionsForNames(["bundang"]), ["bundang"]);
    assert.equal(kindForName("빌라"), "연립·다세대");
    assert.equal(kindForName("오피스텔"), "오피스텔");
    assert.equal(kindForName("단독"), null);
  });
});

describe("extract_profile tool", () => {
  it("reads text and asks at most 2", async () => {
    const r = await callTool(session(), "extract_profile", {
      text: "판교로 출근하는 신입, 연봉 4천, 모은 돈 5천, 전세 2억 이하",
    });
    assert.equal(r.ok, true);
    assert.equal(r.profile.depositMax.value, 200000000);
    assert.ok(r.asked.length <= 2);
    assert.ok(r.missing.length >= r.asked.length);
  });

  it("rejects empty text", async () => {
    const r = await callTool(session(), "extract_profile", { text: "  " });
    assert.equal(r.ok, false);
  });
});

describe("find_homes tool", () => {
  it("returns budgeted candidates with scenes and photos", async () => {
    const r = await callTool(session(), "find_homes", { profile: profile() });
    assert.equal(r.ok, true);
    assert.equal(r.total_matching, 1);
    assert.equal(r.candidates[0].id, "home-000002");
    assert.equal(r.candidates[0].scene, null);
    assert.deepEqual(r.candidates[0].photos, []);
  });

  it("validates sort and kind", async () => {
    const badSort = await callTool(session(), "find_homes",
      { profile: profile(), sort: "cheap" });
    assert.equal(badSort.ok, false);
    const badKind = await callTool(session(), "find_homes",
      { profile: profile(), kind: "단독" });
    assert.equal(badKind.ok, false);
  });

  it("filters by customer-named regions", async () => {
    const r = await callTool(session(), "find_homes",
      { profile: profile(), regions: ["강남"] });
    assert.equal(r.ok, true);
    assert.equal(r.total_matching, 0);
  });
});

describe("find_public_rentals tool", () => {
  const SNAP = {
    fetched_at: "2026-10-28",
    complexes: [{
      source: "lh", id: "1", name: "송파행복", address: "서울특별시 송파구 문정동",
      pnu: null, latitude: null, longitude: null,
      unit_types: [{ unit_type: "26A", building_type: "아파트",
        exclusive_area_m2: 26, deposit_won: 30000000, monthly_rent_won: 200000 }],
    }],
    notices: [],
  };

  it("finds budgeted units and reports coverage", async () => {
    const s = session({ loadHousing: async () => SNAP });
    const r = await callTool(s, "find_public_rentals", { profile: profile() });
    assert.equal(r.ok, true);
    assert.equal(r.total_matching, 1);
    assert.match(r.coverage_note || "", /공공임대 자료 없음/);
  });

  it("fails honestly without a loader", async () => {
    const r = await callTool(session(), "find_public_rentals", { profile: profile() });
    assert.equal(r.ok, false);
  });
});

describe("build_scenario tool", () => {
  const SCENED = {
    homes: [{
      id: "home-000001", name: "정자푸르지오", pnu: "4113512345678901234",
      kind: "아파트", region: "bundang", lon: 127.1, lat: 37.39,
      build_year: 2010, buckets: [bucket(60, [5, 150000000, 120000000, 180000000])],
      station: { station: "정자", walk_minutes: 8, source: "graph" },
      scene: "st-정자", photos_700m: 2,
    }],
  };

  it("adopts the picked homes as the working scenario", async () => {
    const s = session({ loadHomes: async () => SCENED });
    const r = await callTool(s, "build_scenario",
      { profile: profile(), home_ids: ["home-000001"] });
    assert.equal(r.ok, true);
    assert.equal(s.scenario.homes.length, 1);
    assert.equal(s.scenario.homes[0].area, "st-정자");
    assert.equal(s.scenario.homes[0].complex_name, "정자푸르지오");
  });

  it("refuses unknown ids and scene-less homes", async () => {
    const s = session();
    const bad = await callTool(s, "build_scenario",
      { profile: profile(), home_ids: ["home-999999"] });
    assert.equal(bad.ok, false);
    const noScene = await callTool(s, "build_scenario",
      { profile: profile(), home_ids: ["home-000002"] });
    assert.equal(noScene.ok, false);
    assert.match(noScene.error, /3D로 살아 보기/);
  });
});

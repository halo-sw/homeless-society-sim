import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { callTool, createSession } from "../src/consult/tools.js";
import { mergeProfiles, boxesForHomes } from "../src/consult/tools-search.js";
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

const BASE = {
  loadArea: async () => ({
    complexes: [], buildings: [],
    graph: { nodes: {}, edges: {} }, pois: [],
  }),
  loadRegion: async () => ({ network: NETWORK, congestion: null }),
  loadPhotos: async () => PHOTOS,
};

function pangyoProfile() {
  const p = emptyProfile();
  p.members = field([{ role: "adult" }], "customer", "");
  p.workplaces = field([{ member: 0, text: "판교", resolved: { station: "판교" } }],
    "customer", "");
  p.tenure = field("jeonse", "customer", "");
  p.depositMax = field(200000000, "customer", "");
  return p;
}

describe("27b3 mergeProfiles", () => {
  it("keeps the extract's resolved workplace when the model copy drops it", () => {
    const extract = pangyoProfile();
    extract.depositMax = field(null, "customer", "");
    const modelCopy = pangyoProfile();
    modelCopy.workplaces = field(null, "customer", "");
    modelCopy.depositMax = field(200000000, "customer", "");
    const merged = mergeProfiles(extract, modelCopy);
    assert.equal(merged.workplaces.value[0].resolved.station, "판교");
    assert.equal(merged.depositMax.value, 200000000);
  });

  it("an unresolved later workplaces does not replace a resolved one; a resolved one does", () => {
    const extract = pangyoProfile();
    const unresolved = emptyProfile();
    unresolved.workplaces = field([{ member: 0, text: "판교", resolved: null }],
      "customer", "");
    assert.equal(
      mergeProfiles(extract, unresolved).workplaces.value[0].resolved.station, "판교");
    const resolved = emptyProfile();
    resolved.workplaces = field([{ member: 0, text: "강남", resolved: { station: "강남" } }],
      "customer", "");
    assert.equal(
      mergeProfiles(extract, resolved).workplaces.value[0].resolved.station, "강남");
  });
});

describe("27b3 find_homes keeps the conversation profile", () => {
  it("profile_used.workplaces stays resolved when args.profile drops it", async () => {
    const s = createSession({
      scenario: { name: "t", household: { members: [] }, homes: [] },
      ...BASE,
      loadHomes: async () => HOMES,
    });
    s.lastProfile = pangyoProfile();
    const thin = pangyoProfile();
    thin.workplaces = field(null, "customer", "");
    const r = await callTool(s, "find_homes", { profile: thin });
    assert.equal(r.ok, true);
    assert.equal(r.profile_used.workplaces.value[0].resolved.station, "판교");
  });

  it("loads at most limit box areas through find_homes", async () => {
    const many = { homes: HOMES.homes.slice() };
    for (let i = 0; i < 8; i++) {
      many.homes.push({
        id: `home-0001${i}`, name: `다세대${i}`, kind: "연립·다세대",
        region: "bundang", lon: 127.1, lat: 37.37 + i * 0.001,
        build_year: 2005, buckets: [bucket(60, [4, 150000000, 120000000, 180000000])],
        station: null, scene: `st-box-${i}`, photos_700m: 0,
      });
    }
    let calls = 0;
    const s = createSession({
      scenario: { name: "t", household: { members: [] }, homes: [] },
      ...BASE,
      loadArea: async () => {
        calls += 1;
        return { graph: { nodes: {}, edges: {} }, pois: [] };
      },
      loadHomes: async () => many,
    });
    const r = await callTool(s, "find_homes", { profile: pangyoProfile(), limit: 6 });
    assert.equal(r.ok, true);
    assert.ok(calls <= 6, `loadArea called ${calls} times (limit 6)`);
  });
});

describe("27b3 boxesForHomes", () => {
  it("caps at max areas and skips failures without throwing", async () => {
    const homes = Array.from({ length: 8 }, (_, i) => ({ scene: `st-fail-${i}` }));
    const session = {
      loadArea: async (id) => {
        if (id === "st-fail-3") throw new Error("boom");
        return { graph: { nodes: {}, edges: {} }, pois: [] };
      },
    };
    const boxes = await boxesForHomes(session, homes, 6);
    assert.equal(boxes.size, 5);
  });
});

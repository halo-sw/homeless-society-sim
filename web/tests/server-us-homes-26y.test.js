// Stage 26y — the server find_homes finds the Menlo Park homes.
// node --test, no network.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { callTool, createSession } from "../src/consult/tools.js";
import { createConsultHandler, createUsHomesLoader } from "../src/consult/server.js";
import { extract_profile } from "../src/profile.js";

const META_SENTENCE = "I work at Meta HQ in Menlo Park, renting alone, up to $5,000 a month";
const PANGYO_SENTENCE = "판교로 출근하는 신입, 전세 2억 이하, 혼자 살아요";

function bucket(center, jeonse) {
  return {
    center_m2: center, range_m2: [center - 5, center + 5],
    trade: null,
    jeonse: jeonse ? { count: jeonse[0], median_won: jeonse[1],
      min_won: jeonse[2], max_won: jeonse[3] } : null,
    wolse: null,
  };
}

const KR_HOMES = {
  homes: [
    { id: "kr-000001", name: "잠실리센츠", kind: "아파트", region: "songpa-gu",
      lon: 127.08, lat: 37.51, build_year: 2008, buckets: [bucket(60, [5, 280000000, 250000000, 320000000])],
      station: { station: "잠실", walk_minutes: 6, source: "graph" }, scene: null, photos_700m: 0 },
    { id: "kr-000002", name: "역삼빌라", kind: "연립·다세대", region: "gangnam",
      lon: 127.03, lat: 37.50, build_year: 2005, buckets: [bucket(60, [4, 150000000, 120000000, 180000000])],
      station: null, scene: null, photos_700m: 0 },
  ],
};

// Minimal shape findHomesCore needs for a USD home (web/tests/us-26c.test.js;
// data/homes/us-menlo.json is not shipped in this checkout).
function usHome(id, rent, walkMin, bikeMin) {
  return {
    id, name: `Coleman Ave ${id}`, kind: "아파트", region: "us-menlo",
    lon: -122.15, lat: 37.47, build_year: null, scene: null,
    pnu: null, match: "osm_name", osm_name: `Coleman Ave ${id}`,
    station: null,
    buckets: [{ center_m2: null, range_m2: null, trade: null,
      jeonse: null,
      wolse: { count: 1, deposit: null,
        monthly: { count: 1, median_won: rent, min_won: rent, max_won: rent } } }],
    currency: "USD", country: "US",
    price: { source: "zillow_zori_zip", zip: "94025",
      zip_source: "osm_nearest", month: "2026-09",
      label: "Zillow ZORI (typical rent for this ZIP, all home types)" },
    work_targets: { "meta-hq": { walk_m: 2900, walk_minutes: walkMin,
      bike_m: 3100, bike_minutes: bikeMin, bike_speed_kmh: 15,
      bike_speed_source: "assumed" } },
  };
}

const US_HOMES = [usHome("us-000001", 3800, 40, 20), usHome("us-000002", 4261, 37, 8)];

const NETWORK = {
  lines: [{
    id: "line2", name: "2호선",
    stops: [
      { id: "s1", key: "잠실", name: "잠실" },
      { id: "s2", key: "강남", name: "강남" },
    ],
    patterns: [{ id: "p1", stops: ["s1", "s2"], chainage_km: [0, 5.0] }],
  }],
};

function session(over = {}) {
  return createSession({
    scenario: { name: "t", household: { members: [] }, homes: [] },
    loadArea: async () => ({ graph: null, pois: [] }),
    loadHomes: async () => KR_HOMES,
    loadUsHomes: async () => US_HOMES,
    loadRegion: async () => ({ network: NETWORK, congestion: null }),
    loadPhotos: async () => ({ items: [] }),
    ...over,
  });
}

describe("26y find_homes (US)", () => {
  it("finds only Menlo Park homes for the Meta HQ sentence", async () => {
    const r = extract_profile(META_SENTENCE);
    assert.equal(r.ok, true);
    assert.equal(r.profile.currency.value, "USD");
    const out = await callTool(session(), "find_homes", { profile: r.profile });
    assert.equal(out.ok, true);
    assert.ok(out.candidates.length > 0);
    for (const c of out.candidates) {
      assert.equal(c.currency, "USD");
      assert.equal(c.region, "us-menlo");
    }
    assert.deepEqual(out.asked_for.regions, ["us-menlo"]);
  });

  it("returns no USD home for a KRW Pangyo profile", async () => {
    const r = extract_profile(PANGYO_SENTENCE, null, { stations: ["판교"] });
    assert.equal(r.ok, true);
    assert.equal(r.profile.currency.value, "KRW");
    // Even with a US home mixed into the index, a KRW search never shows it.
    const mixed = { homes: [...KR_HOMES.homes, ...US_HOMES] };
    const out = await callTool(session({ loadHomes: async () => mixed }),
      "find_homes", { profile: r.profile });
    assert.equal(out.ok, true);
    assert.ok(out.candidates.length > 0);
    for (const c of out.candidates) {
      assert.notEqual(c.currency, "USD");
      assert.notEqual(c.country, "US");
    }
  });

  it("fails honestly when the US file is missing or empty", async () => {
    const r = extract_profile(META_SENTENCE);
    assert.equal(r.ok, true);
    const empty = await callTool(session({ loadUsHomes: async () => [] }),
      "find_homes", { profile: r.profile });
    assert.equal(empty.ok, false);
    assert.match(empty.error, /US homes are not available on this server/);
    const missing = await callTool(session({ loadUsHomes: null }),
      "find_homes", { profile: r.profile });
    assert.equal(missing.ok, false);
    assert.match(missing.error, /US homes are not available on this server/);
  });

  it("requests homes/us-menlo.json only for a US search", async () => {
    const calls = [];
    const readText = async (kind, rel) => {
      calls.push([kind, rel]);
      if (rel === "homes/us-menlo.json") return JSON.stringify({ homes: US_HOMES });
      throw new Error("not found: " + rel);
    };
    // The handler builds over the same readText reader (relay parity).
    const handler = createConsultHandler({ readText, env: {} });
    assert.equal(typeof handler, "function");
    const loadUsHomes = createUsHomesLoader(readText);

    const kr = extract_profile(PANGYO_SENTENCE, null, { stations: ["판교"] });
    const krOut = await callTool(session({ loadUsHomes }), "find_homes", { profile: kr.profile });
    assert.equal(krOut.ok, true);
    assert.ok(!calls.some(([, rel]) => rel === "homes/us-menlo.json"));

    const us = extract_profile(META_SENTENCE);
    const usOut = await callTool(session({ loadUsHomes }), "find_homes", { profile: us.profile });
    assert.equal(usOut.ok, true);
    const usReads = calls.filter(([kind, rel]) => kind === "data" && rel === "homes/us-menlo.json");
    assert.equal(usReads.length, 1);
    // Cached: a second US search reads no file again.
    const again = await callTool(session({ loadUsHomes }), "find_homes", { profile: us.profile });
    assert.equal(again.ok, true);
    assert.equal(calls.filter(([, rel]) => rel === "homes/us-menlo.json").length, 1);
  });

  it("fails US public rentals honestly (Korean data only)", async () => {
    const us = extract_profile(META_SENTENCE);
    const snap = { fetched_at: "2026-10-28", complexes: [], notices: [] };
    const out = await callTool(session({ loadHousing: async () => snap }),
      "find_public_rentals", { profile: us.profile });
    assert.equal(out.ok, false);
    assert.match(out.error, /Korean regions only/);
  });
});

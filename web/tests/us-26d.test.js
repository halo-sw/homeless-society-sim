// Stage 26d — US homes run the 30-day sim: walk or bike to Meta HQ.
// node --test, no network.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Router } from "../src/engine/graph.js";
import { parseScenario } from "../src/engine/scenario.js";
import { simulate } from "../src/engine/simulate.js";
import { criterionDefault, defaultFlat } from "../src/engine/criteria.js";
import { scenarioFromProfile } from "../src/profile.js";
import { simReadyFor } from "../src/chat/engine.js";
import { buildUsRentMoneyDoc } from "../src/chat/custom-money.js";

const NODES = {
  a: [127.0, 37.5],
  b: [127.01, 37.5],
  c: [127.02, 37.5],
  d: [127.03, 37.5],
};

const E = (from, to, len) => ({ from, to, way: 1, highway: "residential",
  name: null, length_m: len });
const LINE = [
  E("a", "b", 1000), E("b", "a", 1000),
  E("b", "c", 1000), E("c", "b", 1000),
  E("c", "d", 1000), E("d", "c", 1000),
];

function square(lon, lat, s = 0.0001) {
  return { type: "Polygon",
    coordinates: [[[lon, lat], [lon + s, lat], [lon + s, lat + s],
      [lon, lat + s], [lon, lat]]] };
}

function lineArea(withBike = true) {
  return {
    area: "tiny-bike",
    label: "TinyBike",
    crs: { local: { origin: { lon: 127.0, lat: 37.5 } } },
    buildings: [{
      id: "b-home", origin: "joined", building: "apartments",
      name: null, height_m: 30, height_source: "register_height",
      levels: 10, area_m2: 500, residential: "apartment",
      residential_source: "osm:apartments", register: null,
      geometry: square(127.0, 37.5001),
    }],
    complexes: [{
      id: "cx1", name: "알파", name_source: "register",
      building_ids: ["b-home"], centroid: [127.0, 37.5001],
      households_hint: null, max_floors: 10,
    }],
    pois: [],
    landuse: [],
    roads: [],
    trees: [],
    graph: { nodes: NODES, edges: { walk: LINE,
      bike: withBike ? LINE.map((e) => ({ ...e })) : [], drive: [] } },
  };
}

function placeScenario(wpLon, wpLat, workExtra = {}) {
  return {
    name: "bike",
    start_date: "2026-11-02",
    days: 1,
    seed: 7,
    background: 0,
    household: {
      members: [{
        id: "m1", label: "나", role: "adult", workdays: ["Mon"],
        work: { type: "place", place: { name: "Meta HQ",
          lon: wpLon, lat: wpLat }, ...workExtra },
        errands_per_week: { supermarket: 0, convenience: 0 },
        park_walks_per_week: 0, clinic_visits_per_month: 0,
      }],
    },
    homes: [{ label: "A", area: "tiny-bike", complex_name: "알파" }],
  };
}

describe("26d criteria (bike)", () => {
  it("exposes bike_mps and bike_commute_max_min", () => {
    assert.equal(criterionDefault("C-bike-speed", "kmh"), 15);
    assert.equal(criterionDefault("C-bike-commute-max", "max_min"), 30);
    const flat = defaultFlat();
    assert.equal(flat.bike_commute_max_min, 30);
    assert.ok(Math.abs(flat.bike_mps - 15 / 3.6) < 1e-12);
  });

  it("routes per mode, walk by default", () => {
    const area = lineArea(true);
    const walk = new Router(area.graph);
    const bike = new Router(area.graph, { mode: "bike" });
    assert.deepEqual(walk.route("a", "d"),
      { nodeIds: ["a", "b", "c", "d"], lengthM: 3000 });
    assert.deepEqual(bike.route("a", "d"),
      { nodeIds: ["a", "b", "c", "d"], lengthM: 3000 });
    const noBike = new Router(lineArea(false).graph, { mode: "bike" });
    assert.equal(noBike.route("a", "d"), null);
  });
});

describe("26d commuteToPlace (bike)", () => {
  it("bikes 3000 m in 12 min with a C-bike-speed cause", () => {
    const run = simulate(lineArea(true),
      placeScenario(NODES.d[0], NODES.d[1]), "A");
    const commutes = run.trips.filter((t) => t.purpose === "commute");
    assert.equal(commutes.length, 2);
    for (const t of commutes) {
      assert.equal(t.mode, "bike");
      assert.equal(t.minutes, 12);
    }
    const work = run.aways.find((a) => a.kind === "work");
    assert.equal(work.detail.commute, "bike");
    assert.deepEqual(work.detail.workplace,
      { name: "Meta HQ", lon: NODES.d[0], lat: NODES.d[1] });
    assert.ok(commutes[0].cause.criterion_ids.includes("C-bike-speed"));
    assert.ok(commutes[0].cause.criterion_ids.includes("C-bike-commute-max"));
    assert.match(commutes[0].cause.text, /자전거 12분/);
  });

  it("walks 1000 m with no mode key", () => {
    const run = simulate(lineArea(true),
      placeScenario(NODES.b[0], NODES.b[1]), "A");
    const commutes = run.trips.filter((t) => t.purpose === "commute");
    assert.equal(commutes.length, 2);
    for (const t of commutes) {
      assert.ok(!("mode" in t));
      assert.equal(t.minutes, 12.8);
    }
    const work = run.aways.find((a) => a.kind === "work");
    assert.equal(work.detail.commute, "walk");
  });

  it("records unavailable without bike edges at 3000 m", () => {
    const run = simulate(lineArea(false),
      placeScenario(NODES.d[0], NODES.d[1]), "A");
    assert.equal(run.trips.filter((t) => t.purpose === "commute").length, 0);
    assert.equal(run.unavailable.length, 1);
    assert.equal(run.unavailable[0].activity, "commute");
    assert.equal(run.unavailable[0].category, "bike");
  });
});

describe("26d parseWork place", () => {
  it("defaults modes to walk+bike", () => {
    const sc = parseScenario(placeScenario(NODES.d[0], NODES.d[1]));
    assert.deepEqual(sc.household.members[0].work.modes, ["walk", "bike"]);
    assert.equal(sc.household.members[0].work.type, "place");
  });

  it("rejects modes car", () => {
    assert.throws(
      () => parseScenario(placeScenario(NODES.d[0], NODES.d[1],
        { modes: ["car"] })),
      /only walk and bike/);
  });
});

describe("26d scenarioFromProfile (US place)", () => {
  const profile = {
    members: { value: [{ role: "adult" }], source: "customer", note: "" },
    workplaces: { value: [{ member: 0, text: "Meta",
      resolved: { place: { id: "meta-hq", name: "Meta HQ (1 Hacker Way)",
        lon: -122.14823, lat: 37.48485 }, region: "us-menlo" } }],
    source: "customer", note: "" },
  };
  const homes = [
    { id: "h1", name: "Home A", scene: "us-menlo",
      lon: -122.15, lat: 37.47, station: null },
    { id: "h2", name: "Home B", scene: "us-menlo",
      lon: -122.16, lat: 37.48, station: null },
  ];

  it("produces place work without throwing", () => {
    const sc = scenarioFromProfile(profile, homes);
    assert.equal(sc.household.members[0].work.type, "place");
    assert.deepEqual(sc.household.members[0].work.modes, ["walk", "bike"]);
  });
});

describe("26d simReadyFor (US work minutes)", () => {
  it("is ready with work.minutes even when the station walk is unknown", () => {
    const r = simReadyFor({
      commute: { work: { minutes: 12 }, walk: { known: false } },
      lon: -122.15, lat: 37.47, scene: "us-menlo",
    }, null);
    assert.equal(r.ready, true);
  });
});

describe("26d buildUsRentMoneyDoc", () => {
  const picked = ["A", "B"].map((label, i) => ({
    label,
    candidate: { name: `Home ${label}`,
      tenures: [{ tenure: "wolse", median_won: 4261 + i }],
      price: { source: "zillow_zori_zip", zip: "94025", month: "2026-09" } },
    complexName: `Home ${label}`,
    areaId: "us-menlo",
  }));

  it("returns USD with rent_usd_month per pick", () => {
    const doc = buildUsRentMoneyDoc({ picked, labels: ["A", "B"] });
    assert.equal(doc.currency, "USD");
    assert.equal(doc.homes.A.rent_usd_month, 4261);
    assert.equal(doc.homes.B.rent_usd_month, 4262);
    assert.equal(doc.homes.A.source, "Zillow ZORI (ZIP 94025, 2026-09)");
    assert.equal(doc.homes.A.estimate, true);
    assert.ok(!("household_monthly_net_won" in doc));
  });
});

// Stage 9c: workplace commutes — resolution, per-home derivation (A rides,
// B walks), ride leg timing/labels, remote destination walks, per-path
// ride minutes, and determinism. Fixture branches first, then the real
// graph + network (skipped when data/build is absent).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { statSync } from "node:fs";
import { tinyArea, tinyScenario } from "./engine-fixture.js";
import { parseScenario, rideMinutesForHome } from "../src/engine/scenario.js";
import { simulate } from "../src/engine/simulate.js";
import { canon } from "../src/engine/canonical.js";
import { Router } from "../src/engine/graph.js";
import { buildPlaces } from "../src/engine/places.js";
import { defaultFlat } from "../src/engine/criteria.js";
import {
  bboxContains, destAreaIdFor, resolveWorkplace, scenarioWorkplaceCoords,
  stationCoords,
} from "../src/engine/workplace.js";
import { loadDestArea } from "../src/engine/destload.js";

const FLAT = defaultFlat();

function placeScenario({ place, rideMinutes = 20, days = 3, background = 0,
    destination = "직장역", seed = 7, overrides = null } = {}) {
  const raw = tinyScenario({ days, background, seed,
    household: { members: [
      { id: "m1", label: "구성원 1", role: "adult", workdays: ["Mon"],
        work: { type: "station_ride", station_name: "중앙역",
          ride_minutes: rideMinutes,
          ride_minutes_source: "user_assumption",
          ...(destination ? { destination_station: destination } : {}),
          ...(place ? { place } : {}) } },
    ] } });
  if (overrides) raw.criteria_overrides = overrides;
  return raw;
}

describe("resolveWorkplace", () => {
  const area = tinyArea();
  const places = buildPlaces(area, new Router(area.graph));
  const network = { lines: [
    { id: "l1", stops: [
      { id: "s1", name: "중앙역", lon: 1, lat: 2 },
      { id: "s2", name: "중앙역", lon: 3, lat: 4 },
    ] },
  ] };

  it("takes lon/lat first (how: coords)", () => {
    const wp = resolveWorkplace({ name: "일터", lon: 0.5, lat: 0.5 },
      { places, network });
    assert.deepEqual(wp, { name: "일터", lon: 0.5, lat: 0.5, how: "coords" });
  });

  it("resolves a home-area POI name (how: poi)", () => {
    const wp = resolveWorkplace({ name: "일터", poi: "슈퍼1" }, { places, network });
    assert.equal(wp.how, "poi");
    assert.equal(wp.name, "일터");
    assert.equal(wp.lon, 127.001);
    assert.equal(wp.lat, 37.5001);
    assert.ok(wp.poiId);
  });

  it("resolves a network station name (how: station, first stop wins)", () => {
    const wp = resolveWorkplace({ name: "일터", station: "중앙" }, { places, network });
    assert.deepEqual(wp, { name: "일터", lon: 1, lat: 2, how: "station" });
  });

  it("returns null when nothing resolves", () => {
    assert.equal(resolveWorkplace(null, { places, network }), null);
    assert.equal(resolveWorkplace({ name: "일터", poi: "없는곳" }, { places, network }), null);
    assert.equal(resolveWorkplace({ name: "일터", station: "없는역" }, { places, network }), null);
    assert.equal(resolveWorkplace({ name: "일터", poi: "슈퍼1" }, { places: null }), null);
  });

  it("prefers coords over poi/station when several are present", () => {
    const wp = resolveWorkplace({ name: "일터", lon: 9, lat: 9, poi: "슈퍼1", station: "중앙" },
      { places, network });
    assert.equal(wp.how, "coords");
  });
});

describe("stationCoords", () => {
  it("matches with 역-suffix tolerance in file order", () => {
    const network = { lines: [{ id: "l1", stops: [
      { id: "s1", name: "판교역", lon: 1, lat: 1 },
      { id: "s2", name: "판교", lon: 2, lat: 2 },
    ] }] };
    assert.deepEqual(stationCoords(network, "판교"),
      { lon: 1, lat: 1, stopId: "s1", line: "l1" });
    assert.equal(stationCoords(network, "없는역"), null);
    assert.equal(stationCoords(null, "판교"), null);
  });
});

describe("destAreaIdFor", () => {
  const metas = {
    big: { bbox: [0, 0, 10, 10] },
    small: { bbox: [2, 2, 4, 4] },
    other: { bbox: [20, 20, 30, 30] },
  };

  it("picks the smallest containing bbox", () => {
    assert.equal(destAreaIdFor(3, 3, metas, null), "small");
    assert.equal(destAreaIdFor(5, 5, metas, null), "big");
  });

  it("excludes the home area and returns null outside", () => {
    assert.equal(destAreaIdFor(3, 3, metas, "small"), "big");
    assert.equal(destAreaIdFor(50, 50, metas, null), null);
    assert.ok(bboxContains([0, 0, 1, 1], 0.5, 0.5));
    assert.ok(!bboxContains([0, 0, 1, 1], 2, 2));
  });
});

describe("work.place schema", () => {
  it("rejects malformed workplaces", () => {
    for (const place of [
      { lon: 1, lat: 2 }, // no name
      { name: "x", lon: 1 }, // no lat
      { name: "x" }, // no locator
      { name: "x", lon: "a", lat: 2 },
      { name: "x", poi: "" },
      { name: "", lon: 1, lat: 1 },
    ]) {
      assert.throws(() => parseScenario(placeScenario({ place })), /place/, JSON.stringify(place));
    }
  });

  it("parses per-home ride minutes and reads them per home", () => {
    const parsed = parseScenario(placeScenario({ rideMinutes: { A: 25 },
      place: { name: "일터", lon: 9, lat: 9 } }));
    const work = parsed.household.members[0].work;
    assert.deepEqual(work.ride_minutes, { A: 25 });
    assert.equal(rideMinutesForHome(work, "A"), 25);
    assert.equal(rideMinutesForHome(work, "B"), null);
    const plain = parseScenario(placeScenario({ rideMinutes: 20 }));
    assert.equal(rideMinutesForHome(plain.household.members[0].work, "B"), 20);
    assert.throws(() => parseScenario(placeScenario({ rideMinutes: { A: -1 } })), /ride_minutes/);
    assert.throws(() => parseScenario(placeScenario({ rideMinutes: "30" })), /ride_minutes/);
  });

  it("lists coords + station workplaces for destination discovery", () => {
    const parsed = parseScenario(placeScenario({
      place: { name: "일터", lon: 1, lat: 2 } }));
    const coords = scenarioWorkplaceCoords(parsed, null);
    assert.deepEqual(coords, [{ member: "h1", name: "일터", lon: 1, lat: 2 }]);
    const poiParsed = parseScenario(placeScenario({ place: { name: "일터", poi: "슈퍼1" } }));
    assert.deepEqual(scenarioWorkplaceCoords(poiParsed, null), [],
      "POI workplaces resolve in the home area — never a destination load");
  });
});

describe("place derivation on the fixture", () => {
  it("walks when the workplace is in-area within the limit", () => {
    const run = simulate(tinyArea(),
      placeScenario({ place: { name: "테스트직장", lon: 127.001, lat: 37.5 } }), "A");
    assert.ok(!run.aways.some((a) => a.kind === "ride"), "no rides on a walk commute");
    const work = run.aways.find((a) => a.agent === "h1" && a.day === 0 && a.kind === "work");
    assert.equal(work.label, "테스트직장 근무");
    assert.equal(work.detail.commute, "walk");
    assert.equal(run.totals.per_member.h1.commute_ride_minutes, 0);
    assert.ok(run.totals.per_member.h1.commute_walk_minutes > 0);
    const trip = run.trips.find((t) => t.agent === "h1" && t.purpose === "commute");
    assert.ok(trip.cause.criterion_ids.includes("C-walk-commute-max"));
    assert.match(trip.cause.text, /이내/);
    assert.equal(run.unavailable.length, 0);
  });

  it("rides past the limit, with fallback legs and no invented path", () => {
    // The island node (127.1, 37.6): anchored, but no home route reaches it.
    const run = simulate(tinyArea(),
      placeScenario({ place: { name: "먼직장", lon: 127.1, lat: 37.6 } }), "A");
    const out = run.aways.find((a) => a.agent === "h1" && a.day === 0
      && a.kind === "ride" && a.detail.direction === "out");
    const back = run.aways.find((a) => a.agent === "h1" && a.day === 0
      && a.kind === "ride" && a.detail.direction === "back");
    const work = run.aways.find((a) => a.agent === "h1" && a.day === 0 && a.kind === "work");
    assert.ok(out && back && work);
    assert.equal(out.start_min + 20, out.end_min);
    assert.equal(work.label, "먼직장 근무");
    assert.equal(work.detail.commute.mode, "ride");
    assert.equal(work.detail.commute.out_start, out.start_min);
    assert.equal(work.detail.commute.back_end, back.end_min);
    assert.equal(out.detail.ride, null);
    assert.equal(out.detail.journey_note, "노선도 없음");
    assert.ok(out.detail.ride_fallback);
    assert.equal(out.detail.ride_fallback.source, "가정값");
    assert.deepEqual(out.detail.dest_walk,
      { minutes: 0, distance_m: 0, source: "none", note: "목적지 지역 미생성" });
    const fat = run.daily.find((d) => d.agent === "h1").days[0].fatigue;
    assert.deepEqual(fat.peak_congestion,
      { pct: FLAT.congestion_fallback_pct, line: null, station: "중앙역", source: "가정값" });
    const trip = run.trips.find((t) => t.agent === "h1" && t.purpose === "commute");
    assert.match(trip.cause.text, /도보 연결 없음/);
  });

  it("records unavailable when the path has no ride input", () => {
    const run = simulate(tinyArea(),
      placeScenario({ place: { name: "먼직장", lon: 127.1, lat: 37.6 },
        rideMinutes: { B: 20 } }), "A");
    const miss = run.unavailable.find((u) => u.agent === "h1"
      && u.activity === "commute" && u.category === "ride");
    assert.ok(miss, "a ride without input records unavailable, never guesses");
    assert.ok(!run.aways.some((a) => a.agent === "h1" && a.kind === "ride"));
  });

  it("falls back to one labelled away for an unlocatable workplace", () => {
    const run = simulate(tinyArea(),
      placeScenario({ place: { name: "유령직장", station: "없는역" } }), "A");
    assert.ok(!run.aways.some((a) => a.kind === "ride"));
    const work = run.aways.find((a) => a.agent === "h1" && a.day === 0 && a.kind === "work");
    assert.equal(work.label, "유령직장 근무");
    assert.match(work.detail.journey_note, /근무지 위치 확인 불가/);
  });

  it("runs deterministically with a destination area", () => {
    const mk = () => {
      const area = tinyArea();
      area.area = "tiny";
      return simulate(area,
        placeScenario({ place: { name: "먼직장", lon: 127.1, lat: 37.6 } }), "A",
        { destArea: area });
    };
    assert.equal(canon(mk()), canon(mk()));
    assert.equal(mk().meta.dest_area, "tiny");
  });
});

describe("loadDestArea", () => {
  const scenario = parseScenario(placeScenario({
    place: { name: "일터", lon: 5, lat: 5 } }));
  const noPlace = parseScenario(tinyScenario());

  it("returns null without a workplace", async () => {
    assert.equal(await loadDestArea({ scenario: noPlace, homeArea: null }), null);
  });

  it("short-circuits the home area without any lister", async () => {
    const home = { area: "home", bbox: [0, 0, 10, 10] };
    assert.equal(await loadDestArea({ scenario, homeArea: home }), home);
  });

  it("loads the containing area, skipping failures", async () => {
    const home = { area: "home", bbox: [0, 0, 1, 1] };
    const calls = [];
    const dest = await loadDestArea({ scenario, homeArea: home,
      listAreas: async () => ["home", "broke", "dest"],
      readAreaMeta: async (id) => ({ bbox: id === "dest" ? [4, 4, 6, 6] : [0, 0, 1, 1] }),
      loadArea: async (id) => { calls.push(id); return { area: id }; } });
    assert.equal(dest.area, "dest");
    assert.deepEqual(calls, ["dest"]);
    const failed = await loadDestArea({ scenario, homeArea: home,
      listAreas: async () => { throw new Error("no fs"); } });
    assert.equal(failed, null);
  });
});

// --- real graph + network (skipped when data/build is absent) ---

const P = {
  jamsil: "../../data/build/songpa-jamsil/area.json",
  pangyo: "../../data/build/pangyo/area.json",
  network: "../../data/build/region/network.json",
  congestion: "../../data/build/region/congestion.json",
  demo: "../../scenarios/demo-two-homes.json",
};

function haveRealData() {
  try {
    for (const f of Object.values(P)) statSync(new URL(f, import.meta.url));
    return true;
  } catch {
    return false;
  }
}

async function realArea(path) {
  const { readFile } = await import("node:fs/promises");
  const { dirname, join } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const file = fileURLToPath(new URL(path, import.meta.url));
  const area = JSON.parse(await readFile(file, "utf8"));
  for (const [k, v] of Object.entries(area)) {
    if (v && typeof v === "object" && !Array.isArray(v)
        && Object.keys(v).join() === "$ref") {
      area[k] = JSON.parse(await readFile(join(dirname(file), v.$ref), "utf8"));
    }
  }
  return area;
}

async function realRegion() {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const network = JSON.parse(await readFile(
    fileURLToPath(new URL(P.network, import.meta.url)), "utf8"));
  const congestion = JSON.parse(await readFile(
    fileURLToPath(new URL(P.congestion, import.meta.url)), "utf8"));
  return { network, congestion };
}

async function realDemo({ days = 3, background = 0 } = {}) {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const raw = JSON.parse(await readFile(
    fileURLToPath(new URL(P.demo, import.meta.url)), "utf8"));
  raw.days = days;
  raw.background = background;
  return raw;
}

function edgeSet(graph) {
  return new Set((graph.edges.walk || []).map((e) => `${e.from}>${e.to}`));
}

function peakReadingOf(run, member) {
  let best = null;
  for (const a of run.aways) {
    if (a.agent !== member || a.kind !== "ride" || !a.detail || !a.detail.ride) continue;
    for (const leg of a.detail.ride.legs) {
      const c = leg.congestion;
      if (best === null || c.valuePct > best.pct) {
        best = { pct: c.valuePct, line: leg.lineName, station: c.station, source: c.source };
      }
    }
  }
  return best;
}

describe("place derivation on the real graph + network", () => {
  it("rides from A, walks from B", async (t) => {
    if (!haveRealData()) return t.skip("needs data/build");
    const [jamsil, pangyo, region] = await Promise.all(
      [realArea(P.jamsil), realArea(P.pangyo), realRegion()]);
    const runA = simulate(jamsil, await realDemo(), "A", { region, destArea: pangyo });
    const runB = simulate(pangyo, await realDemo(), "B", { region, destArea: pangyo });
    assert.equal(runA.meta.dest_area, "pangyo");
    assert.equal(runB.meta.dest_area, "pangyo");
    // A: walk → ride → work labelled by the workplace.
    const aRides = runA.aways.filter((a) => a.agent === "h1" && a.kind === "ride");
    assert.ok(aRides.length > 0, "A rides the subway");
    const aWork = runA.aways.find((a) => a.agent === "h1" && a.kind === "work");
    assert.equal(aWork.label, "직장 (가정: 판교역 인근) 근무");
    assert.equal(aWork.detail.commute.mode, "ride");
    assert.ok(runA.totals.per_member.h1.commute_ride_minutes > 0);
    // A's peak boarding equals the highest leg reading on the real data.
    assert.deepEqual(runA.totals.per_member.h1.fatigue.peak_congestion,
      peakReadingOf(runA, "h1"));
    assert.equal(runA.totals.household.fatigue_peak_congestion_pct,
      peakReadingOf(runA, "h1").pct);
    // B: the workplace is a 16-minute walk — no rides at all.
    assert.ok(!runB.aways.some((a) => a.kind === "ride"), "B walks, never rides");
    const bWork = runB.aways.find((a) => a.agent === "h1" && a.kind === "work");
    assert.equal(bWork.label, "직장 (가정: 판교역 인근) 근무");
    assert.equal(bWork.detail.commute, "walk");
    assert.equal(runB.totals.per_member.h1.commute_ride_minutes, 0);
    assert.ok(runB.totals.per_member.h1.commute_walk_minutes > 0);
    assert.equal(runB.totals.per_member.h1.fatigue.peak_congestion, null);
    assert.equal(runB.totals.household.fatigue_peak_congestion_pct, null);
    assert.equal(runA.unavailable.length + runB.unavailable.length, 0);
  });

  it("walks the destination graph remotely (path on pangyo edges)", async (t) => {
    if (!haveRealData()) return t.skip("needs data/build");
    const [jamsil, pangyo, region] = await Promise.all(
      [realArea(P.jamsil), realArea(P.pangyo), realRegion()]);
    // A workplace 154 m from the 판교역 stop (CGV 판교점, real OSM POI):
    // the destination walk is a real non-zero graph leg.
    const raw = await realDemo();
    for (const m of raw.household.members) {
      m.work.place = { name: "직장 (가정: 판교역 인근)", lon: 127.1123628, lat: 37.3933342 };
    }
    const run = simulate(jamsil, raw, "A", { region, destArea: pangyo });
    const dw = run.trips.find((x) => x.agent === "h1" && x.day === 0
      && x.from.label === "판교" && x.to.label === "직장 (가정: 판교역 인근)");
    assert.ok(dw, "expected a destination walk trip");
    assert.equal(dw.remote, true);
    assert.equal(dw.graph_area, "pangyo");
    assert.ok(dw.minutes > 0 && dw.path.length > 1);
    const edges = edgeSet(pangyo.graph);
    for (let i = 0; i + 1 < dw.path.length; i++) {
      assert.ok(edges.has(`${dw.path[i]}>${dw.path[i + 1]}`),
        `foreign edge ${dw.path[i]}>${dw.path[i + 1]}`);
    }
    const out = run.aways.find((a) => a.agent === "h1" && a.day === 0
      && a.kind === "ride" && a.detail.direction === "out");
    const work = run.aways.find((a) => a.agent === "h1" && a.day === 0 && a.kind === "work");
    assert.equal(dw.depart_min, out.end_min);
    assert.equal(dw.arrive_min, work.start_min);
    assert.equal(out.detail.dest_walk.source, "graph");
    assert.ok(out.detail.dest_walk.minutes > 0);
  });

  it("takes per-path ride minutes", async (t) => {
    if (!haveRealData()) return t.skip("needs data/build");
    const [jamsil, pangyo, region] = await Promise.all(
      [realArea(P.jamsil), realArea(P.pangyo), realRegion()]);
    const raw = await realDemo();
    for (const m of raw.household.members) m.work.ride_minutes = { A: 25 };
    const run = simulate(jamsil, raw, "A", { region, destArea: pangyo });
    const out = run.aways.find((a) => a.agent === "h1" && a.day === 0
      && a.kind === "ride" && a.detail.direction === "out");
    assert.equal(out.end_min - out.start_min, 25);
    const workdays = run.aways.filter((a) => a.agent === "h1" && a.kind === "ride").length / 2;
    assert.equal(run.totals.per_member.h1.commute_ride_minutes, 25 * 2 * workdays);
  });

  it("rides from B when the walk limit drops below the B walk", async (t) => {
    if (!haveRealData()) return t.skip("needs data/build");
    const [pangyo, region] = await Promise.all([realArea(P.pangyo), realRegion()]);
    const raw = await realDemo();
    raw.criteria_overrides = { "C-walk-commute-max": { max_min: 10 } };
    const run = simulate(pangyo, raw, "B", { region, destArea: pangyo });
    const rides = run.aways.filter((a) => a.agent === "h1" && a.kind === "ride");
    assert.ok(rides.length > 0, "B rides once the 16-minute walk exceeds the limit");
    assert.ok(run.totals.per_member.h1.commute_ride_minutes > 0);
    assert.equal(rides[0].detail.ride, null);
    assert.equal(rides[0].detail.journey_note, "목적지 역 없음");
    const trip = run.trips.find((x) => x.agent === "h1" && x.day === 0 && x.purpose === "commute");
    assert.match(trip.cause.text, /분\(10분 초과\)/);
    const fat = run.daily.find((d) => d.agent === "h1").days[0].fatigue;
    assert.equal(fat.peak_congestion.pct, FLAT.congestion_fallback_pct);
    assert.equal(fat.peak_congestion.source, "가정값");
  });

  it("walks the destination graph in-area (same-area destination)", async (t) => {
    if (!haveRealData()) return t.skip("needs data/build");
    const [pangyo, region] = await Promise.all([realArea(P.pangyo), realRegion()]);
    // B forced onto the subway (limit 1) with a same-station destination:
    // the 판교역→CGV walk runs on the home graph — a visible trip, not
    // a remote one.
    const raw = await realDemo();
    raw.criteria_overrides = { "C-walk-commute-max": { max_min: 1 } };
    for (const m of raw.household.members) {
      m.work.place = { name: "직장 (가정: 판교역 인근)", lon: 127.1123628, lat: 37.3933342 };
      m.work.destination_station = { A: "판교", B: "판교" };
    }
    const run = simulate(pangyo, raw, "B", { region, destArea: pangyo });
    const dw = run.trips.find((x) => x.agent === "h1" && x.day === 0
      && x.from.label === "판교" && x.to.label === "직장 (가정: 판교역 인근)");
    assert.ok(dw, "expected a destination walk trip");
    assert.equal(dw.graph_area, "pangyo");
    assert.equal(dw.remote, false);
    assert.ok(dw.minutes > 0 && dw.path.length > 1);
    const edges = edgeSet(pangyo.graph);
    for (let i = 0; i + 1 < dw.path.length; i++) {
      assert.ok(edges.has(`${dw.path[i]}>${dw.path[i + 1]}`),
        `foreign edge ${dw.path[i]}>${dw.path[i + 1]}`);
    }
    const out = run.aways.find((a) => a.agent === "h1" && a.day === 0
      && a.kind === "ride" && a.detail.direction === "out");
    assert.equal(out.detail.dest_walk.source, "graph");
  });

  it("re-runs byte-identically with a destination area", async (t) => {
    if (!haveRealData()) return t.skip("needs data/build");
    const [jamsil, pangyo, region] = await Promise.all(
      [realArea(P.jamsil), realArea(P.pangyo), realRegion()]);
    const mk = async () => simulate(jamsil, await realDemo(), "A", { region, destArea: pangyo });
    assert.equal(canon(await mk()), canon(await mk()));
  });
});

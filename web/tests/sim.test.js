import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { daylightFactor, followCaption, formatClock, homeOccupancy, indexRun, isAtHome, parseTParam, sampleAgent, simInstant, tripFractions } from "../src/sim.js";
import { simulate } from "../src/engine/simulate.js";
import { tinyArea, tinyScenario } from "./engine-fixture.js";

describe("sim playback", () => {
  it("formats the sim clock label", () => {
    assert.equal(formatClock("2026-11-02", 0, 462, 30), "11월 2일(월) 07:42 · 1일차/30");
    assert.equal(formatClock("2026-11-02", 6, 0, 30), "11월 8일(일) 00:00 · 7일차/30");
    assert.equal(formatClock("2026-11-02", 29, 1439, 30), "12월 1일(화) 23:59 · 30일차/30");
  });

  it("parses ?t=HH:MM", () => {
    assert.equal(parseTParam("07:30"), 450);
    assert.equal(parseTParam("23:59"), 1439);
    assert.equal(parseTParam("nope"), null);
    assert.equal(parseTParam("24:00"), null);
  });

  it("maps sim minutes to absolute KST instants", () => {
    const d = simInstant("2026-11-02", 0, 450); // 07:30 KST
    assert.equal(d.toISOString(), "2026-11-01T22:30:00.000Z");
  });

  it("ramps daylight with solar altitude", () => {
    assert.equal(daylightFactor(-10), 0);
    assert.equal(daylightFactor(20), 1);
    const mid = daylightFactor(3);
    assert.ok(mid > 0 && mid < 1);
  });

  it("splits trip time by edge length", () => {
    const trip = { path: ["a", "b", "c"] };
    const fracs = tripFractions(trip, new Map([["a>b", 100], ["b>c", 300]]));
    assert.deepEqual(fracs, [0, 0.25, 1]);
    assert.deepEqual(tripFractions(trip), [0, 0.5, 1]);
    assert.deepEqual(tripFractions({ path: ["a"] }), [0]);
  });

  it("samples agents along recorded paths, hides them at home/work", () => {
    const run = simulate(tinyArea(), tinyScenario(), "A");
    const indexed = indexRun(run);
    const nodes = new Map(Object.entries(tinyArea().graph.nodes));
    const home = nodes.get("a");
    const trip = run.trips.find((t) => t.agent === "h1");
    const edgeLen = new Map([["a>b", 100], ["b>a", 100], ["b>c", 10], ["c>b", 10], ["c>d", 200], ["d>c", 200]]);
    // Mid-trip: visible on the path between the endpoints.
    const mid = sampleAgent("h1", indexed, trip.day, trip.depart_min, nodes, home, edgeLen);
    assert.equal(mid.visible, true);
    assert.equal(mid.state, "trip");
    const start = nodes.get(trip.path[0]);
    assert.ok(Math.abs(mid.lon - start[0]) < 1e-9 && Math.abs(mid.lat - start[1]) < 1e-9);
    // Deep night: at home, hidden.
    const night = sampleAgent("h1", indexed, 0, 120, nodes, home, edgeLen);
    assert.equal(night.visible, false);
    assert.equal(night.state, "home");
    assert.equal(isAtHome("h1", indexed, 0, 120), true);
    assert.equal(isAtHome("h1", indexed, trip.day, trip.depart_min), false);
    // Midday work stay: out of area, hidden.
    const away = run.aways.find((a) => a.agent === "h1" && a.kind === "work");
    const w = sampleAgent("h1", indexed, away.day, away.start_min + 5, nodes, home, edgeLen);
    assert.equal(w.visible, false);
    assert.equal(w.state, "away");
  });

  it("counts at-home residents per building from the run", () => {
    const run = simulate(tinyArea(), tinyScenario(), "A");
    const indexed = indexRun(run);
    const occ = homeOccupancy(run, indexed, 0, 120); // 02:00, everyone home
    let total = 0;
    for (const slot of occ.values()) {
      assert.equal(slot.home, slot.total);
      total += slot.total;
    }
    assert.equal(total, 7);
  });

  it("captions the followed agent with run numbers", () => {
    const run = simulate(tinyArea(), tinyScenario(), "A");
    const trip = run.trips.find((t) => t.agent === "h1" && t.purpose === "commute");
    const line = followCaption({ state: "trip", trip }, "구성원 1");
    assert.ok(line.includes("구성원 1") && line.includes("통근"));
    assert.ok(line.includes(`${trip.minutes}분`) && line.includes(`${Math.round(trip.distance_m)} m`));
    const away = run.aways.find((a) => a.agent === "h1" && a.kind === "work");
    assert.ok(followCaption({ state: "away", away }, "구성원 1").includes("가정값"));
    assert.ok(followCaption({ state: "home" }, "구성원 1").includes("집"));
  });
});

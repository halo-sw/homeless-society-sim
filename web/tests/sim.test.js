import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { agentLabelOf, chosenLabel, dayDecisions, daylightFactor, decisionBadge, duskFactor, followCaption, formatClock, homeOccupancy, indexRun, isAtHome, latestDecision, optionsLine, parseTParam, sampleAgent, shouldAutoplay, simInstant, tripFractions } from "../src/sim.js";
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

  it("pauses on ?t= unless ?play=1", () => {
    assert.equal(shouldAutoplay(new URLSearchParams("")), true);
    assert.equal(shouldAutoplay(new URLSearchParams("?t=07:30")), false);
    assert.equal(shouldAutoplay(new URLSearchParams("?t=07:30&play=1")), true);
    assert.equal(shouldAutoplay(new URLSearchParams("?play=1")), true);
  });

  it("bumps warm dusk over 17:00–20:00, peaking 18:30", () => {
    assert.equal(duskFactor(16 * 60), 0);
    assert.equal(duskFactor(21 * 60), 0);
    assert.equal(duskFactor(18 * 60 + 30), 1);
    const early = duskFactor(17 * 60 + 30);
    assert.ok(early > 0 && early < 1);
    assert.ok(Math.abs(duskFactor(17 * 60 + 30) - duskFactor(19 * 60 + 30)) < 1e-9);
  });

  it("badges decisions by judge provenance", () => {
    assert.deepEqual(decisionBadge({ chosen_by: "model", provider: "meta" }), { text: "Muse Spark 1.3", cls: "spark" });
    assert.deepEqual(decisionBadge({ chosen_by: "model", provider: "baseten" }), { text: "Muse Spark Open", cls: "open" });
    assert.deepEqual(decisionBadge({ chosen_by: "rule" }), { text: "규칙", cls: "rule" });
    assert.deepEqual(decisionBadge({ chosen_by: "rule_fallback" }), { text: "규칙", cls: "rule" });
    assert.deepEqual(decisionBadge({ chosen_by: "replay" }), { text: "규칙", cls: "rule" });
  });

  it("labels choices and options from run records", () => {
    const run = simulate(tinyArea(), tinyScenario(), "A");
    const sc = run.decisions.find((d) => d.kind === "shop_choice" && d.agent === "h1");
    assert.equal(chosenLabel(sc), sc.options.find((o) => o.key === sc.chosen_key).label);
    assert.ok(optionsLine(sc).includes("분"));
    const wk = run.decisions.find((d) => d.kind === "weekend_plan" && d.agent === "h1" && d.day === 5);
    assert.equal(chosenLabel(wk), "공원");
    assert.deepEqual(dayDecisions(run, 5).filter((d) => d.kind === "weekend_plan").length, 2);
    assert.equal(agentLabelOf(run, "h1"), "구성원 1");
    const latest = latestDecision(run, "h1", 5, 1439);
    assert.equal(latest.kind, "weekend_plan");
    assert.equal(latestDecision(run, "h1", 5, 0), null);
    // Household only: background branches never enter the log.
    assert.ok(dayDecisions(run, 0).every((d) => d.agent === "h1" || d.agent === "h2"));
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

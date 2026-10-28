// Highlight selector tests (stage 7, Part B): followed route and
// destination, ride-away stubs, household ticks, pulse moments,
// convenience-POI hover ids, and POI→building lookup on the fixture.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tinyArea, tinyScenario } from "./engine-fixture.js";
import { indexRun } from "../src/sim.js";
import { simulate } from "../src/engine/simulate.js";
import { buildingForPoi, highlightFor, pointInRing } from "../src/highlight.js";

function setup() {
  const area = tinyArea();
  const run = simulate(area, tinyScenario(), "A");
  return { area, run, indexed: indexRun(run) };
}

describe("highlightFor", () => {
  it("follows a member's trip with route fraction and destination", () => {
    const { run, indexed, area } = setup();
    const t = run.trips.find((x) => x.agent === "h1" && x.purpose === "commute");
    const mid = Math.floor((t.depart_min + t.arrive_min) / 2);
    const h = highlightFor({ run, indexed, follow: 1, day: t.day, minute: mid, area });
    assert.equal(h.followedKey, "h1");
    assert.equal(h.dimOthers, true);
    assert.ok(h.trip);
    assert.equal(h.trip.id, t.id);
    assert.ok(h.trip.frac >= 0 && h.trip.frac <= 1);
    assert.equal(h.destLabel, t.to.label);
    assert.equal(h.destNodeId, t.path[t.path.length - 1]);
    assert.equal(h.homeBuildingId, run.meta.home_building);
    assert.equal(h.rideAway, null);
  });

  it("resolves the destination building from the POI footprint", () => {
    const { run, indexed, area } = setup();
    // sup1 sits inside the b-shop square (127.002, 37.5002).
    assert.equal(buildingForPoi(area.buildings, 127.00205, 37.50025), "b-shop");
    const t = run.trips.find((x) => x.to.id === "sup1" && x.from.kind === "home");
    if (t) {
      // sup1 sits outside every footprint; the nearest centroid (b-house)
      // within 60 m wins as the documented fallback.
      const h = highlightFor({ run, indexed, follow: 1, day: t.day, minute: t.depart_min, area });
      assert.equal(h.destBuildingId, "b-house");
    }
  });

  it("flags the ride-away stub while at work", () => {
    const { run, indexed } = setup();
    const a = run.aways.find((x) => x.agent === "h1" && x.kind === "work"
      && x.detail && x.detail.ride_minutes);
    assert.ok(a, "tiny h1 needs a station_ride work stay");
    const mid = Math.floor((a.start_min + a.end_min) / 2);
    const h = highlightFor({ run, indexed, follow: 1, day: a.day, minute: mid });
    assert.equal(h.trip, null);
    assert.ok(h.rideAway);
    assert.equal(h.rideAway.rideMinutes, a.detail.ride_minutes);
    assert.ok(h.rideAway.stationNodeId);
  });

  it("emits ticks and the pulse decision for the followed member", () => {
    const { run, indexed } = setup();
    const d = run.decisions.find((x) => x.agent === "h1" && x.day === 0);
    assert.ok(d, "tiny h1 day 0 needs a decision");
    const h = highlightFor({ run, indexed, follow: 1, day: 0, minute: d.minute });
    assert.equal(h.pulseDecisionId, d.id);
    assert.ok(h.ticks.length > 0);
    assert.ok(h.ticks.every((t, i, arr) => i === 0 || arr[i - 1].minute <= t.minute));
    assert.ok(h.ticks.some((t) => t.kind === "decision"));
    assert.ok(h.ticks.some((t) => t.kind === "depart"));
    const off = highlightFor({ run, indexed, follow: 1, day: 0, minute: d.minute + 1 });
    if (!run.decisions.some((x) => x.agent === "h1" && x.day === 0 && x.minute === d.minute + 1)) {
      assert.equal(off.pulseDecisionId, null);
    }
  });

  it("returns household-neutral state for the free camera", () => {
    const { run, indexed } = setup();
    const h = highlightFor({ run, indexed, follow: 0, day: 0, minute: 500 });
    assert.equal(h.followedKey, null);
    assert.equal(h.dimOthers, false);
    assert.equal(h.trip, null);
    assert.deepEqual(h.ticks, []);
    assert.equal(h.pulseDecisionId, null);
  });

  it("passes hovered convenience POI ids through from the money doc", () => {
    const { run, indexed } = setup();
    const moneyDoc = { homes: { A: { qol_convenience: {
      poi_ids: { park: ["park1"], grocery: ["sup1", "conv1"] } } } } };
    const h = highlightFor({ run, indexed, follow: 0, day: 0, minute: 500,
      qualityHover: { category: "park" }, moneyDoc, homeLabel: "A" });
    assert.deepEqual(h.qualityPoiIds, ["park1"]);
    const none = highlightFor({ run, indexed, follow: 0, day: 0, minute: 500, moneyDoc, homeLabel: "A" });
    assert.deepEqual(none.qualityPoiIds, []);
  });
});

describe("pointInRing", () => {
  it("contains the inside and excludes the outside", () => {
    const ring = [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]];
    assert.equal(pointInRing(0.5, 0.5, ring), true);
    assert.equal(pointInRing(2, 2, ring), false);
  });
});

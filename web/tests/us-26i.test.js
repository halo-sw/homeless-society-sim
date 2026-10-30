// Stage 26i — US 3D view: bike trips read 자전거, the home pill shows
// the run's home name. node --test, no network.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ACTIVITIES, activityOfTrip, daySegments, outingStepsFor, runHasBikeTrip,
} from "../src/timeline.js";
import { commuteLines } from "../src/evidence.js";
import { homeDisplayName, labelItemsFor } from "../src/labels3d.js";

const home = { kind: "home", id: "home", label: "10 Coleman Place" };
const work = { kind: "poi", id: "meta-hq", label: "Meta HQ (1 Hacker Way)" };

function trip(id, depart, arrive, extra = {}) {
  return { id, agent: "h1", day: 0, depart_min: depart, arrive_min: arrive,
    from: home, to: work, purpose: "commute", minutes: arrive - depart,
    ...extra };
}

function runWith(trips) {
  return { meta: { days: 30 }, trips, aways: [] };
}

describe("26i bike segments", () => {
  it("registers the 자전거 activity with its own colour", () => {
    assert.equal(ACTIVITIES.bike.label, "자전거");
    const rest = new Set(Object.entries(ACTIVITIES)
      .filter(([k]) => k !== "bike").map(([, v]) => v.color));
    assert.match(ACTIVITIES.bike.color, /^#[0-9a-f]{6}$/);
    assert.ok(!rest.has(ACTIVITIES.bike.color));
  });

  it("maps mode bike trips to bike, modeless trips to walk", () => {
    assert.equal(activityOfTrip({ mode: "bike" }), "bike");
    assert.equal(activityOfTrip({}), "walk");
    assert.equal(activityOfTrip(null), "walk");
  });

  it("daySegments gives a bike segment for a bike commute trip", () => {
    const segs = daySegments({ run: runWith([trip("b1", 480, 492, { mode: "bike" })]),
      agentKey: "h1", day: 0 });
    const leg = segs.find((s) => s.activity === "bike");
    assert.ok(leg, "has a bike segment");
    assert.equal(leg.detail, "자전거로 12분");
    assert.ok(runHasBikeTrip(runWith([trip("b1", 480, 492, { mode: "bike" })])));
  });

  it("a trip without mode stays a walk segment", () => {
    const segs = daySegments({ run: runWith([trip("w1", 480, 492)]),
      agentKey: "h1", day: 0 });
    assert.ok(!segs.some((s) => s.activity === "bike"));
    const leg = segs.find((s) => s.activity === "walk");
    assert.ok(leg, "has a walk segment");
    assert.equal(leg.detail, "걸어서 12분");
    assert.equal(runHasBikeTrip(runWith([trip("w1", 480, 492)])), false);
  });

  it("outing steps name the bike leg 자전거로", () => {
    const outings = outingStepsFor({ run: runWith([trip("b1", 480, 492, { mode: "bike" })]),
      agentKey: "h1", day: 0 });
    const step = outings[0].steps.find((s) => s.tripId === "b1");
    assert.equal(step.kind, "bike");
    assert.match(step.label, /자전거로 12분/);
    const plain = outingStepsFor({ run: runWith([trip("w1", 480, 492)]),
      agentKey: "h1", day: 0 });
    const wstep = plain[0].steps.find((s) => s.tripId === "w1");
    assert.equal(wstep.kind, "walk");
    assert.match(wstep.label, /걸어서 12분/);
  });
});

describe("26i commute breakdown", () => {
  it("a bike trip reads 자전거 with a 가정값 badge", () => {
    const t = trip("b1", 480, 492, { mode: "bike" });
    const lines = commuteLines(runWith([t]), "h1", t, t.depart_min);
    assert.match(lines[0].text, /자전거 12분/);
    assert.ok(!lines[0].text.includes("걷기"));
    assert.equal(lines[0].tag, "가정값");
  });

  it("a walk trip is unchanged", () => {
    const t = trip("w1", 480, 492);
    const lines = commuteLines(runWith([t]), "h1", t, t.depart_min);
    assert.equal(lines[0].text, "오늘 출근 12분 = 걷기 12분");
    assert.equal(lines[0].tag, "측정");
  });
});

describe("26i home label", () => {
  it("replaces an OSM-id complex name with the run home name", () => {
    assert.equal(homeDisplayName("w112348084", "10 Coleman Place"), "10 Coleman Place");
  });

  it("leaves Korean names unchanged", () => {
    assert.equal(homeDisplayName("잠실 레이크팰리스", "10 Coleman Place"), "잠실 레이크팰리스");
    assert.equal(homeDisplayName("잠실 레이크팰리스", null), "잠실 레이크팰리스");
  });

  it("labelItemsFor pills the run home name for OSM-id complexes", () => {
    const area = {
      complexes: [{ id: "c1", name: "w112348084", centroid: [0, 0], building_ids: ["b1"] }],
      buildings: [{ id: "b1", kind: "apartments",
        geometry: { type: "Point", coordinates: [0, 0] } }],
      pois: [],
    };
    const items = labelItemsFor(area, { homeBuildingId: "b1",
      homeName: "10 Coleman Place", cameraDistM: 600 });
    assert.equal(items[0].title, "우리 집 · 10 Coleman Place");
    const koArea = { ...area,
      complexes: [{ id: "c1", name: "잠실 레이크팰리스",
        centroid: [0, 0], building_ids: ["b1"] }] };
    const ko = labelItemsFor(koArea, { homeBuildingId: "b1",
      homeName: "10 Coleman Place", cameraDistM: 600 });
    assert.equal(ko[0].title, "우리 집 · 잠실 레이크팰리스");
  });
});

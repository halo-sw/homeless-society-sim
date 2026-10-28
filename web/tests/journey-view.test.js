// Journey view: ride state, camera phases, train marker, tile picking.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tinyRegion } from "./engine-fixture.js";
import { buildRides } from "../src/engine/journey.js";
import { defaultFlat } from "../src/engine/criteria.js";
import {
  commuteSegments, corridorFor, journeyBanner, journeyCameraState,
  journeyPhase, legAt, rideSegments, rideStateFor, tilesFor, trainPosition,
} from "../src/journey.js";
import { sliceGeometry, tileBuildings, tileLines, tileWater } from "../src/corridor.js";

const CRIT = defaultFlat();

function rides() {
  const { network, congestion } = tinyRegion();
  return buildRides({ network, congestion, fromName: "중앙역", toName: "직장역",
    rideMinutes: 20, departOut: 480, departBack: 1080, weekday: "Mon", crit: CRIT });
}

// A work away 08:00–18:20 with a 20-minute ride each way (540-min day).
function away() {
  return { agent: "h1", day: 0, kind: "work", start_min: 480, end_min: 1100,
    detail: { ride_minutes: 20, rides: rides() } };
}

describe("journey view", () => {
  it("locates the member in out-ride, work, back-ride", () => {
    const a = away();
    const out = rideStateFor(a, 490);
    assert.equal(out.dir, "out");
    assert.equal(out.elapsed, 10);
    assert.equal(out.progress, 0.5);
    assert.equal(rideStateFor(a, 479), null);
    const work = rideStateFor(a, 700);
    assert.equal(work.dir, "work");
    const back = rideStateFor(a, 1090);
    assert.equal(back.dir, "back");
    assert.equal(back.elapsed, 10);
    assert.equal(rideStateFor(a, 1100), null);
    assert.equal(rideStateFor({ kind: "errand" }, 500), null);
  });

  it("walks legs and transfer gaps at the split pace", () => {
    const ride = rides().out; // [5.3, transfer 4, 10.7]
    assert.equal(legAt(ride, 0).legIndex, 0);
    assert.equal(legAt(ride, 5.2).inTransfer, false);
    const gap = legAt(ride, 6);
    assert.equal(gap.inTransfer, true);
    assert.equal(gap.transferIndex, 0);
    assert.equal(legAt(ride, 10).legIndex, 1);
    assert.equal(legAt(ride, 19.9).legIndex, 1);
  });

  it("runs the camera state machine (auto / low / high)", () => {
    assert.equal(journeyPhase({ riding: null }), "idle");
    assert.equal(journeyPhase({ riding: { progress: 0.05 } }), "rising");
    assert.equal(journeyPhase({ riding: { progress: 0.5 } }), "cruise");
    assert.equal(journeyPhase({ riding: { progress: 0.9 }, hasDetailDest: true }), "descending");
    // No detailed destination: stay at corridor level, never descend.
    assert.equal(journeyPhase({ riding: { progress: 0.99 }, hasDetailDest: false }), "cruise");
    assert.equal(journeyPhase({ riding: { progress: 0.5 }, view: "low" }), "street");
    assert.equal(journeyPhase({ riding: { progress: 0.99 }, view: "high", hasDetailDest: true }), "cruise");
    assert.equal(journeyPhase({ riding: null, view: "high" }), "idle");
  });

  it("moves the train marker along the real geometry", () => {
    const { network } = tinyRegion();
    const ride = rides().out;
    const start = trainPosition(network, ride, 0);
    assert.ok(Math.abs(start.lon - 127.0) < 1e-9);
    assert.equal(start.legIndex, 0);
    const end = trainPosition(network, ride, 19.99);
    assert.ok(Math.abs(end.lon - 127.04) < 0.005, JSON.stringify(end));
    assert.equal(end.legIndex, 1);
    const mid = trainPosition(network, ride, 2.65); // halfway through leg 0
    assert.ok(mid.lon > 127.0 && mid.lon < 127.02);
    assert.equal(trainPosition(null, ride, 5), null);
  });

  it("colours the line per segment with sources", () => {
    const segs = rideSegments(rides().out);
    assert.equal(segs.length, 3); // 중앙역→시청→환승역, 환승역→직장역
    assert.equal(segs[0].band, "normal"); // 90 %
    assert.equal(segs[0].source, "서울교통공사");
    assert.equal(segs[2].band, "normal"); // 70 % fallback
    assert.equal(segs[2].source, "가정값");
  });

  it("builds the journey banner", () => {
    const ride = rides().out;
    const b = journeyBanner({ ride, dir: "out", elapsed: 2, rideMinutes: 20 });
    assert.match(b.where, /A호선 중앙역→환승역 이동 중/);
    assert.equal(b.legIndex, 0);
    assert.equal(b.minutesLeft, 18);
    assert.equal(b.legs.length, 2);
    const gap = journeyBanner({ ride, dir: "out", elapsed: 6, rideMinutes: 20 });
    assert.match(gap.where, /환승 중/);
    assert.equal(gap.inTransfer, true);
  });

  it("picks corridor tiles near the focus, drops far ones", () => {
    const manifest = { id: "c1", tiles: [
      { id: "t_1_1", bounds: [127.0, 37.5, 127.01, 37.51] },
      { id: "t_2_1", bounds: [127.01, 37.5, 127.02, 37.51] },
      { id: "t_9_9", bounds: [127.08, 37.58, 127.09, 37.59] },
    ] };
    const focus = { lon: 127.005, lat: 37.505 };
    const first = tilesFor({ manifest, focus, loaded: [] });
    assert.deepEqual(first.load, ["t_1_1", "t_2_1"]);
    assert.deepEqual(first.unload, []);
    const moved = tilesFor({ manifest, focus: { lon: 127.085, lat: 37.585 },
      loaded: ["t_1_1", "t_2_1"] });
    assert.deepEqual(moved.load, ["t_9_9"]);
    assert.deepEqual(moved.unload.sort(), ["t_1_1", "t_2_1"]);
    // Loads come nearest-first.
    assert.equal(first.load[0], "t_1_1");
  });

  it("matches corridors to rides in either direction", () => {
    const index = { corridors: [{ id: "c1", from: "잠실", to: "판교" }] };
    assert.equal(corridorFor(index, "잠실", "판교").id, "c1");
    assert.equal(corridorFor(index, "판교", "잠실").id, "c1");
    assert.equal(corridorFor(index, "잠실", "강남"), null);
    assert.equal(corridorFor(null, "잠실", "판교"), null);
  });
});

describe("corridor tiles", () => {
  const tile = {
    id: "t_1_1",
    buildings: [{ id: "b1", h: 12, pts: [[127.0, 37.5], [127.001, 37.5], [127.001, 37.501], [127.0, 37.501], [127.0, 37.5]] }],
    roads: [{ name: "대로", class: "primary", pts: [[127.0, 37.5], [127.002, 37.502]] }],
    water: [
      { name: "천", closed: false, pts: [[127.0, 37.5], [127.001, 37.501]] },
      { name: "호", closed: true, pts: [[127.0, 37.5], [127.001, 37.5], [127.001, 37.501], [127.0, 37.5]] },
    ],
    boundaries: [{ name: "구", pts: [[127.0, 37.5], [127.003, 37.5]] }],
  };
  const origin = { lon: 127.0, lat: 37.5 };

  it("extrudes flat prisms with walls + roof", () => {
    const soup = tileBuildings(tile, origin);
    assert.ok(soup.triangles >= 10); // 4 walls × 2 + roof fan
    assert.equal(soup.positions.length, soup.triangles * 9);
    assert.equal(soup.normals.length, soup.positions.length);
    assert.equal(soup.colors.length, soup.positions.length);
    // The prism rises 12 m above the lift.
    const ys = [];
    for (let i = 1; i < soup.positions.length; i += 3) ys.push(soup.positions[i]);
    assert.ok(Math.max(...ys) > 12 && Math.min(...ys) >= 0);
  });

  it("merges lines and triangulates closed water", () => {
    const lines = tileLines(tile, origin);
    assert.ok(lines.segments >= 3); // road + boundary + open water
    assert.equal(lines.positions.length, lines.segments * 6);
    assert.equal(lines.colors.length, lines.positions.length);
    const water = tileWater(tile, origin);
    assert.ok(water.triangles >= 1);
  });

  it("slices travelled geometry between stops (either order)", () => {
    const geom = [[127.0, 37.5], [127.01, 37.5], [127.02, 37.5], [127.03, 37.5]];
    const fwd = sliceGeometry(geom, [127.011, 37.5], [127.029, 37.5]);
    assert.deepEqual(fwd, [[127.01, 37.5], [127.02, 37.5], [127.03, 37.5]]);
    const rev = sliceGeometry(geom, [127.029, 37.5], [127.011, 37.5]);
    assert.deepEqual(rev, fwd);
    assert.deepEqual(sliceGeometry([[127.0, 37.5]], [127.0, 37.5], [127.0, 37.5]), []);
  });
});

describe("journey camera state (stage 9c)", () => {
  // One member-day, new engine form: out ride 08:20–08:50, work until
  // 17:50, back ride 17:50–18:20.
  const dayAways = [
    { agent: "h1", day: 0, kind: "ride", start_min: 500, end_min: 530,
      detail: { direction: "out", ride_minutes: 30 } },
    { agent: "h1", day: 0, kind: "work", start_min: 530, end_min: 1070, detail: {} },
    { agent: "h1", day: 0, kind: "ride", start_min: 1070, end_min: 1100,
      detail: { direction: "back", ride_minutes: 30 } },
  ];
  const segments = commuteSegments(dayAways);
  const phase = (minute, extra = {}) =>
    journeyCameraState({ segments, minute, ...extra }).phase;

  it("reads ride aways in either engine form", () => {
    assert.deepEqual(segments, {
      out: { start: 500, end: 530 },
      work: { start: 530, end: 1070 },
      back: { start: 1070, end: 1100 },
    });
    // Old form: the work away splits by its ride minutes.
    const old = commuteSegments([{ agent: "h1", day: 0, kind: "work",
      start_min: 480, end_min: 1100, detail: { ride_minutes: 20 } }]);
    assert.deepEqual(old, {
      out: { start: 480, end: 500 },
      work: { start: 500, end: 1080 },
      back: { start: 1080, end: 1100 },
    });
    assert.equal(commuteSegments([{ kind: "work", detail: {} }]), null);
    assert.equal(commuteSegments([]), null);
  });

  it("locates the member in a ride away (normalised shape)", () => {
    const st = rideStateFor(dayAways[0], 515);
    assert.equal(st.dir, "out");
    assert.equal(st.elapsed, 15);
    assert.equal(st.progress, 0.5);
    assert.equal(st.rides, null, "no drawn leg — rides map stays empty");
    assert.equal(rideStateFor(dayAways[0], 499), null);
    assert.equal(rideStateFor(dayAways[0], 530), null);
    const back = rideStateFor(dayAways[2], 1099);
    assert.equal(back.dir, "back");
    // With a drawn leg the single ride normalises into the direction map.
    const drawn = { agent: "h1", day: 0, kind: "ride", start_min: 500, end_min: 530,
      detail: { direction: "out", ride_minutes: 20, ride: rides().out } };
    const dst = rideStateFor(drawn, 510);
    assert.equal(dst.dir, "out");
    assert.ok(dst.rides && dst.rides.out && dst.rides.out.legs.length > 0);
    assert.equal(dst.fallback, null);
  });

  it("cruises inside the ride, streets before it, holds after it", () => {
    assert.equal(phase(515), "cruise");
    assert.equal(phase(501), "rising");
    assert.equal(phase(499), "street");
    assert.equal(phase(0), "street");
    assert.equal(phase(600), "hold");
    assert.equal(phase(1085), "cruise");
    assert.equal(phase(1100), "street");
    assert.equal(phase(1439), "street");
  });

  it("holds through destination-walk gaps", () => {
    const gapped = {
      out: { start: 500, end: 530 }, work: { start: 535, end: 1070 },
      back: { start: 1075, end: 1105 },
    };
    const at = (minute) => journeyCameraState({ segments: gapped, minute }).phase;
    assert.equal(at(532), "hold");
    assert.equal(at(1072), "hold");
    assert.equal(at(600), "hold");
  });

  it("honours the view override and the detail gate", () => {
    assert.equal(phase(515, { view: "low" }), "boarding");
    assert.equal(phase(515, { view: "high" }), "cruise");
    assert.equal(phase(529, { hasDetailDest: true }), "descending");
    assert.equal(phase(529), "cruise");
  });
});

// engine/journey: path, split, congestion, fatigue maths (synthetic region).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tinyRegion } from "./engine-fixture.js";
import {
  buildRides, CAPACITY_PCT, congestionBand, congestionFor, congestionPeakLine,
  dayKindFor, findPath, patternForLeg, rideLegFatigue, SEATED_PCT, slotIndexFor,
  splitLine, splitRide, standShare, VERY_CROWDED_PCT, walkFatigue,
} from "../src/engine/journey.js";
import { defaultFlat } from "../src/engine/criteria.js";

const CRIT = defaultFlat();

describe("engine journey", () => {
  it("reads congestion thresholds from the criteria", () => {
    assert.equal(SEATED_PCT, 34);
    assert.equal(CAPACITY_PCT, 100);
    assert.equal(VERY_CROWDED_PCT, 150);
  });

  it("maps weekdays to congestion day kinds", () => {
    assert.equal(dayKindFor("Mon"), "weekday");
    assert.equal(dayKindFor("Fri"), "weekday");
    assert.equal(dayKindFor("Sat"), "saturday");
    assert.equal(dayKindFor("Sun"), "sunday");
  });

  it("picks the 30-minute slot by ride start (clamped)", () => {
    const slots = [330, 480, 510];
    assert.equal(slotIndexFor(0, slots), 0);
    assert.equal(slotIndexFor(480, slots), 1);
    assert.equal(slotIndexFor(509, slots), 1);
    assert.equal(slotIndexFor(510, slots), 2);
    assert.equal(slotIndexFor(2000, slots), 2);
  });

  it("routes across a transfer by shortest line km", () => {
    const { network } = tinyRegion();
    const path = findPath(network, "중앙역", "직장역", 2.0);
    assert.deepEqual(path.legs.map((l) => l.line), ["a", "b"]);
    assert.deepEqual(path.legs[0].stops, ["중앙역", "시청", "환승역"]);
    assert.deepEqual(path.legs[1].stops, ["환승역", "직장역"]);
    assert.deepEqual(path.transfers, ["환승"]);
    assert.equal(path.distanceKm, 6);
    assert.deepEqual(findPath(network, "직장역", "중앙역", 2.0).legs.map((l) => l.line), ["b", "a"]);
    assert.equal(findPath(network, "중앙역", "없는역", 2.0), null);
    assert.equal(findPath(network, "없는역", "직장역", 2.0), null);
  });

  it("matches legs to directed patterns in travel order only", () => {
    const { network } = tinyRegion();
    const out = findPath(network, "중앙역", "환승역", 2.0);
    assert.equal(patternForLeg(network, out.legs[0]).direction_label, "하선");
    const back = findPath(network, "환승역", "중앙역", 2.0);
    assert.equal(patternForLeg(network, back.legs[0]).direction_label, "상선");
  });

  it("splits the customer total in proportion to distance (sum exact)", () => {
    const { network } = tinyRegion();
    const path = findPath(network, "중앙역", "직장역", 2.0); // 2 km + 4 km
    const parts = splitRide(20, path, 4);
    assert.equal(parts.transferMinutesTotal, 4);
    assert.deepEqual(parts.legs, [5.3, 10.7]); // 16 min over 2:4 km
    assert.equal(parts.legs[0] + parts.legs[1] + parts.transferMinutesTotal, 20);
    const direct = findPath(network, "중앙역", "시청", 2.0);
    const solo = splitRide(20, direct, 4);
    assert.deepEqual(solo.legs, [20]);
    assert.equal(solo.transferMinutesTotal, 0);
  });

  it("looks up boarding congestion with a visible fallback", () => {
    const { congestion } = tinyRegion();
    const hit = congestionFor(congestion, { dayKind: "weekday", lineName: "A호선",
      station: "중앙역", directionLabel: "하선", minute: 480, fallbackPct: 70 });
    assert.equal(hit.valuePct, 90);
    assert.equal(hit.source, "서울교통공사");
    assert.equal(hit.hasData, true);
    assert.equal(hit.slotLabel, "08:00~08:30");
    const miss = congestionFor(congestion, { dayKind: "weekday", lineName: "신분당선",
      station: "강남", directionLabel: "하선", minute: 480, fallbackPct: 70 });
    assert.equal(miss.valuePct, 70);
    assert.equal(miss.source, "가정값");
    assert.equal(miss.hasData, false);
    assert.equal(congestionFor(null, { dayKind: "weekday", lineName: "A호선",
      station: "중앙역", directionLabel: "하선", minute: 480, fallbackPct: 70 }).source, "가정값");
  });

  it("bands congestion for the journey legend", () => {
    assert.equal(congestionBand(34).key, "calm");
    assert.equal(congestionBand(35).key, "normal");
    assert.equal(congestionBand(99.9).key, "normal");
    assert.equal(congestionBand(100).key, "crowded");
    assert.equal(congestionBand(150).key, "crowded");
    assert.equal(congestionBand(150.1).key, "packed");
  });

  it("stands above 34 % and crowds above 100 % (worked examples)", () => {
    assert.equal(standShare(34), 0);
    assert.equal(standShare(100), 1);
    assert.equal(standShare(67), 0.5);
    // Seated 10 min at 30 %: 10 × 0.2 = 2.0.
    assert.equal(rideLegFatigue(10, 30, CRIT), 2);
    // Half-standing 10 min at 67 %: 10 × (0.5×0.2 + 0.5×0.9) = 5.5.
    assert.equal(rideLegFatigue(10, 67, CRIT), 5.5);
    // 10 min at 148 %: standing 9.0 + extra 10×0.48×0.6 = 11.88.
    assert.ok(Math.abs(rideLegFatigue(10, 148, CRIT) - 11.88) < 1e-9);
    assert.equal(walkFatigue(10, CRIT), 3.5);
  });

  it("builds both commute rides with per-leg congestion", () => {
    const { network, congestion } = tinyRegion();
    const rides = buildRides({ network, congestion, fromName: "중앙역",
      toName: "직장역", rideMinutes: 20, departOut: 480, departBack: 1080,
      weekday: "Mon", crit: CRIT });
    assert.ok(rides.out && rides.back);
    assert.equal(rides.out.legs[0].congestion.valuePct, 90);
    assert.equal(rides.out.legs[0].congestion.source, "서울교통공사");
    assert.equal(rides.out.legs[0].congestion.direction, "하선");
    // B호선 has no table rows: visible fallback.
    assert.equal(rides.out.legs[1].congestion.source, "가정값");
    assert.equal(rides.out.minutesTotal, 20);
    assert.equal(rides.out.legs[0].minutes + rides.out.legs[1].minutes
      + rides.out.transferMinutes, 20);
    // Evening return reads the evening column on the reverse patterns.
    assert.equal(rides.back.legs[1].congestion.direction, "상선");
    assert.match(splitLine(rides, "user_input"), /합계는 고객 입력 20분/);
  });

  it("returns null without network, destination or path", () => {
    const { network, congestion } = tinyRegion();
    const base = { network, congestion, fromName: "중앙역", toName: "직장역",
      rideMinutes: 20, departOut: 480, departBack: 1080, weekday: "Mon", crit: CRIT };
    assert.equal(buildRides({ ...base, network: null }), null);
    assert.equal(buildRides({ ...base, toName: null }), null);
    assert.equal(buildRides({ ...base, toName: "없는역" }), null);
    assert.equal(buildRides({ ...base, toName: "중앙역" }), null);
    assert.equal(buildRides({ ...base, rideMinutes: 0 }), null);
    // No congestion table: legs still split, all fallback.
    const noTable = buildRides({ ...base, congestion: null });
    assert.equal(noTable.out.legs[0].congestion.source, "가정값");
  });

  it("is deterministic", () => {
    const { network, congestion } = tinyRegion();
    const base = { network, congestion, fromName: "중앙역", toName: "직장역",
      rideMinutes: 20, departOut: 480, departBack: 1080, weekday: "Mon", crit: CRIT };
    assert.deepEqual(buildRides(base), buildRides(base));
    assert.deepEqual(findPath(network, "중앙역", "직장역", 2.0),
      findPath(network, "중앙역", "직장역", 2.0));
  });

  it("lines the peak boarding beside fatigue (stage 9c)", () => {
    assert.equal(congestionPeakLine(
      { pct: 93.2, line: "2호선", station: "잠실", source: "서울교통공사" }),
      "2호선 잠실 혼잡도 93.2%, 서서 감");
    assert.equal(congestionPeakLine(
      { pct: 20, line: "A호선", station: "중앙역", source: "서울교통공사" }),
      "A호선 중앙역 혼잡도 20%, 앉아서 감");
    assert.equal(congestionPeakLine(
      { pct: 70, line: null, station: "중앙역", source: "가정값" }),
      "중앙역 혼잡도 70%, 서서 감");
    assert.equal(congestionPeakLine(null), null);
    assert.equal(congestionPeakLine({}), null);
  });
});

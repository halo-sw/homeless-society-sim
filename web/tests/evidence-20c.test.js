// Stage 20c: the sim hero says how this scene counts toward the result.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { sceneEvidence } from "../src/evidence.js";
import { commuteOneWayMinutes } from "../src/verify/numbers.js";

function rideDetail(rideMin, waitMin, source) {
  return {
    ride: {
      minutesTotal: rideMin + waitMin,
      legs: [{ lineName: "2호선", from: "A", to: "B", minutes: rideMin,
        congestion: { valuePct: 120, source, hasData: source !== "가정값" } }],
      transfers: [{ station: "B", minutes: waitMin }],
      transferMinutes: waitMin,
    },
  };
}

function commuteTrip(id, day, depart, minutes) {
  return { id, agent: "h1", day, purpose: "commute",
    depart_min: depart, arrive_min: depart + minutes, minutes,
    from: { label: "집" }, to: { label: "A역" } };
}

function rideAway(day, start, rideMin, waitMin, source) {
  return { agent: "h1", day, kind: "ride", label: "지하철",
    start_min: start, end_min: start + rideMin + waitMin,
    detail: rideDetail(rideMin, waitMin, source) };
}

function errandTrip(id, day, depart, minutes) {
  return { id, agent: "h1", day, purpose: "errand",
    depart_min: depart, arrive_min: depart + minutes, minutes,
    from: { label: "집" }, to: { label: "마트" } };
}

function run() {
  return {
    meta: { days: 30 },
    agents: [{ key: "h1", label: "H1", household: true }],
    trips: [
      commuteTrip("t1", 1, 480, 4),
      errandTrip("e1", 1, 600, 5),
      errandTrip("e2", 2, 600, 6),
      errandTrip("e3", 2, 700, 5),
      commuteTrip("t3", 1, 1089, 4),
    ],
    aways: [
      rideAway(1, 484, 7, 2, "서울교통공사"),
      rideAway(1, 1080, 7, 2, "서울교통공사"),
    ],
  };
}

describe("sceneEvidence commute", () => {
  it("day-1 am commute reads walk + ride + wait that add up", () => {
    const r = run();
    const lines = sceneEvidence({ run: r, agentKey: "h1", day: 1, minute: 481,
      now: { state: "trip", tripId: "t1" } });
    assert.equal(lines[0].text, "오늘 출근 13분 = 걷기 4분 + 지하철 7분 + 기다림 2분");
    assert.equal(lines[1].text,
      `30일 출퇴근 편도 평균 ${Math.round(commuteOneWayMinutes(r, "h1"))}분 중 하루예요`);
  });

  it("assumption crowding adds the 가정값 line", () => {
    const r = run();
    r.aways[0].detail.ride.legs[0].congestion = { valuePct: 70, source: "가정값", hasData: false };
    const lines = sceneEvidence({ run: r, agentKey: "h1", day: 1, minute: 481,
      now: { state: "trip", tripId: "t1" } });
    assert.equal(lines[2].text, "혼잡 70%는 가정값이에요 (실측 없음)");
    assert.equal(lines[2].tag, "가정값");
  });
});

describe("sceneEvidence errands and home", () => {
  it("second errand counts itself among this home's trips", () => {
    const lines = sceneEvidence({ run: run(), agentKey: "h1", day: 2, minute: 602,
      now: { state: "trip", tripId: "e2" } });
    assert.equal(lines[0].text, "30일 중 2번째 장보기 · 이 집에서 모두 3번");
    assert.equal(lines[1].text, "목적지 마트 · 걸어서 6분");
  });

  it("at home there are no lines", () => {
    assert.deepEqual(sceneEvidence({ run: run(), agentKey: "h1", day: 1, minute: 720,
      now: { state: "home", now: "집 · 낮 시간" } }), []);
  });

  it("no line carries decimals or undefined", () => {
    const r = run();
    const calls = [
      { run: r, agentKey: "h1", day: 1, minute: 481, now: { state: "trip", tripId: "t1" } },
      { run: r, agentKey: "h1", day: 1, minute: 485, now: { state: "ride", awayId: "x" } },
      { run: r, agentKey: "h1", day: 2, minute: 602, now: { state: "trip", tripId: "e2" } },
      { run: r, agentKey: "h1", day: 1, minute: 720, now: { state: "home" } },
    ];
    for (const c of calls) {
      for (const line of sceneEvidence(c)) {
        assert.match(line.text, /./);
        assert.doesNotMatch(line.text, /\d+\.\d+분/);
        assert.doesNotMatch(line.text, /undefined/);
      }
    }
  });
});

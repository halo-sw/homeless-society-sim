// 12b, D: day-at-a-glance timeline builders (pure). Synthetic trip
// lists always run; the 08:50 A example + month strip cross-check the
// real demo build (skipped when data/build is absent — data/ is
// gitignored).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  ACTIVITIES, ACTIVITY_ORDER, DAY_STRIP_START, DAY_STRIP_END,
  activityOfAway, activityLabel, daySegments, hhmm, monthStrip,
  navFromOutings, outingIndexAt, outingStepsFor, outingsFor,
  routeSteps, segmentTitle, stepIndexAt, stripFrac, stripMinute,
  tripNav,
} from "../src/timeline.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const RUN_A = join(ROOT, "data/build/sim/demo-two-homes-A.json");
const HAS_RUN = existsSync(RUN_A);
const SKIP_RUN = !HAS_RUN
  ? "missing data/build/sim/demo-two-homes-A.json — generate data/build first"
  : false;

const homeEnd = (label) => ({ kind: "home", id: "home", label });
const poiEnd = (id, label) => ({ kind: "poi", id, label });

function trip(id, depart, arrive, from, to, purpose = "commute") {
  return { id, agent: "h1", day: 0, depart_min: depart, arrive_min: arrive,
    from, to, purpose, distance_m: 1000, minutes: arrive - depart,
    path: ["a", "b"] };
}

function away(kind, start, end, label, detail = null) {
  const a = { agent: "h1", day: 0, kind, start_min: start, end_min: end, label };
  if (detail) a.detail = detail;
  return a;
}

const RIDE_DETAIL = {
  direction: "out",
  ride: {
    legs: [
      { lineName: "2호선", from: "잠실", to: "강남", minutes: 8.6,
        congestion: { valuePct: 91.1, source: "서울교통공사" } },
      { lineName: "신분당선", from: "강남", to: "판교", minutes: 17.4,
        congestion: { valuePct: 70, source: "가정값" } },
    ],
    transfers: [{ station: "강남", minutes: 4 }],
  },
  ride_minutes: 30,
};

describe("timeline vocabulary", () => {
  it("covers the fixed 7 activities with distinct colours", () => {
    assert.deepEqual(ACTIVITY_ORDER,
      ["home", "walk", "subway", "work", "errand", "park", "other"]);
    const colours = new Set(ACTIVITY_ORDER.map((a) => ACTIVITIES[a].color));
    assert.equal(colours.size, 7);
    for (const a of ACTIVITY_ORDER) {
      assert.match(ACTIVITIES[a].color, /^#[0-9a-f]{6}$/, a);
      assert.ok(ACTIVITIES[a].label.length > 0, a);
    }
  });

  it("maps away kinds (school/clinic fall under 기타 with labels)", () => {
    assert.equal(activityOfAway("ride"), "subway");
    assert.equal(activityOfAway("work"), "work");
    assert.equal(activityOfAway("errand"), "errand");
    assert.equal(activityOfAway("park"), "park");
    assert.equal(activityOfAway("school"), "other");
    assert.equal(activityOfAway("clinic"), "other");
    assert.equal(activityOfAway("mystery"), "other");
    assert.equal(activityLabel("walk"), "걷기");
  });

  it("strip spans 05:00–24:00 with a frac/minute round-trip", () => {
    assert.equal(DAY_STRIP_START, 300);
    assert.equal(DAY_STRIP_END, 1440);
    assert.equal(stripFrac(300), 0);
    assert.equal(stripFrac(1440), 1);
    assert.equal(stripMinute(0), 300);
    assert.equal(stripMinute(1), 1440);
    assert.equal(stripMinute(stripFrac(530)), 530);
    assert.equal(stripFrac(0), 0); // clamped
    assert.equal(hhmm(530), "08:50");
  });

  it("formats float minutes as HH:MM, never a float tail", () => {
    // 18d walkthrough: the 선택 기록 showed 17:40.200000000000045.
    assert.equal(hhmm(1060.200000000000045), "17:40");
    assert.equal(hhmm(1060.9), "17:40");
    assert.equal(hhmm(0), "00:00");
    assert.equal(hhmm(1439.9), "23:59");
  });
});

describe("daySegments", () => {
  const run = {
    trips: [
      trip("t1", 501, 515, homeEnd("레이크팰리스"), poiEnd("st", "잠실")),
      trip("t2", 1115, 1127, poiEnd("st", "잠실"), homeEnd("레이크팰리스")),
    ],
    aways: [
      away("ride", 515, 545, "지하철 이동", RIDE_DETAIL),
      away("work", 545, 1085, "직장 근무"),
      away("ride", 1085, 1115, "지하철 이동", { ...RIDE_DETAIL, direction: "back" }),
    ],
  };

  it("covers 05:00–24:00 with no gaps or overlaps", () => {
    const segs = daySegments({ run, agentKey: "h1", day: 0 });
    assert.equal(segs[0].start, 300);
    assert.equal(segs[segs.length - 1].end, 1440);
    for (let i = 1; i < segs.length; i++) {
      assert.equal(segs[i].start, segs[i - 1].end, `gap at ${i}`);
      assert.ok(segs[i].end > segs[i].start, `empty at ${i}`);
    }
  });

  it("labels walks, rides, work and home gaps", () => {
    const segs = daySegments({ run, agentKey: "h1", day: 0 });
    const kinds = segs.map((s) => s.activity);
    assert.deepEqual(kinds,
      ["home", "walk", "subway", "work", "subway", "walk", "home"]);
    assert.equal(segmentTitle(segs[1]), "08:21–08:35 걷기 · 레이크팰리스 → 잠실 14분");
    assert.equal(segmentTitle(segs[0]), "05:00–08:21 집");
    assert.match(segmentTitle(segs[segs.length - 1]), /–24:00 집$/);
  });

  it("is empty-home all day without trips", () => {
    const segs = daySegments({ run: { trips: [], aways: [] }, agentKey: "h1", day: 0 });
    assert.equal(segs.length, 1);
    assert.equal(segs[0].activity, "home");
  });
});

describe("routeSteps + outings", () => {
  const run = {
    trips: [
      trip("t1", 501, 515, homeEnd("레이크팰리스"), poiEnd("st", "잠실")),
      trip("t2", 1115, 1127, poiEnd("st", "잠실"), homeEnd("레이크팰리스")),
      trip("t3", 1157, 1160, homeEnd("레이크팰리스"), poiEnd("shop", "편의점"), "errand"),
      trip("t4", 1175, 1178, poiEnd("shop", "편의점"), homeEnd("레이크팰리스"), "errand"),
    ],
    aways: [
      away("ride", 515, 545, "지하철 이동", RIDE_DETAIL),
      away("work", 545, 1085, "직장 근무"),
      away("ride", 1085, 1115, "지하철 이동", { ...RIDE_DETAIL, direction: "back" }),
      away("errand", 1160, 1175, "편의점 장보기"),
    ],
  };

  it("splits out / back / errand into three trips", () => {
    const outings = outingsFor({ run, agentKey: "h1", day: 0 });
    assert.equal(outings.length, 3);
    assert.deepEqual(outings.map((o) => [o.start, o.end]),
      [[501, 1085], [1085, 1127], [1157, 1178]]);
  });

  it("builds the morning steps with congestion sources", () => {
    const { steps, current } = routeSteps({ run, agentKey: "h1", day: 0, minute: 530 });
    assert.deepEqual(steps.map((s) => s.label), [
      "레이크팰리스",
      "잠실 (걸어서 14분)",
      "2호선 잠실→강남 (9분, 혼잡 91% 실측)",
      "강남 환승 4분",
      "신분당선 강남→판교 (17분, 혼잡 70% 가정)",
      "직장 근무",
    ]);
    assert.equal(current, 4); // on the second leg at 08:50
  });

  it("hops trips with prev/next (inside goes to the start first)", () => {
    assert.deepEqual(tripNav({ run, agentKey: "h1", day: 0, minute: 530 }),
      { prev: 501, next: 1085 });
    assert.deepEqual(tripNav({ run, agentKey: "h1", day: 0, minute: 100 }),
      { prev: null, next: 501 });
    assert.deepEqual(tripNav({ run, agentKey: "h1", day: 0, minute: 1200 }),
      { prev: 1157, next: null });
  });

  it("UI-side nav + step index agree with the builders", () => {
    const outs = outingStepsFor({ run, agentKey: "h1", day: 0 });
    assert.equal(outs.length, 3);
    assert.equal(outingIndexAt(outs, 530), 0);
    assert.equal(outingIndexAt(outs, 100), 0); // nearest future
    assert.equal(outingIndexAt(outs, 1200), 2); // nearest past
    assert.equal(outingIndexAt([], 530), -1);
    assert.deepEqual(navFromOutings(outs, 530), { prev: 501, next: 1085 });
    assert.equal(stepIndexAt(outs[0].steps, 530), 4);
    assert.equal(stepIndexAt(outs[0].steps, 501), 1);
  });
});

describe("monthStrip", () => {
  it("reads commute + fatigue per day, weekends marked", () => {
    const run = { daily: [{ agent: "h1", days: [
      { day: 0, date: "2026-11-02", weekday: "Mon", commute_walk_minutes: 25,
        commute_ride_minutes: 60, trips: 4, fatigue: { mean: 10.5 } },
      { day: 1, date: "2026-11-03", weekday: "Tue", trips: 0, fatigue: {} },
      { day: 5, date: "2026-11-07", weekday: "Sat", commute_walk_minutes: 0,
        commute_ride_minutes: 0, trips: 2, fatigue: { mean: 0.1 } },
    ] }] };
    const days = monthStrip({ run, agentKey: "h1" });
    assert.equal(days.length, 3);
    assert.deepEqual(days[0],
      { day: 0, date: "2026-11-02", weekday: "Mon", weekend: false,
        commuteMin: 85, fatigueMean: 10.5, trips: 4 });
    assert.equal(days[1].commuteMin, null); // unknown stays unknown
    assert.equal(days[1].fatigueMean, null);
    assert.equal(days[2].weekend, true);
    assert.equal(days[2].commuteMin, 0);
  });

  it("is empty without daily rows", () => {
    assert.deepEqual(monthStrip({ run: {}, agentKey: "h1" }), []);
  });
});

describe("timeline on the real demo build", { skip: SKIP_RUN }, () => {
  it("matches the 08:50 A example", () => {
    const run = JSON.parse(readFileSync(RUN_A, "utf8"));
    const { steps, current } = routeSteps({ run, agentKey: "h1", day: 0, minute: 530 });
    assert.deepEqual(steps.map((s) => s.label), [
      "레이크팰리스",
      "잠실 (걸어서 14분)",
      "2호선 잠실→강남 (9분, 혼잡 91% 실측)",
      "강남 환승 4분",
      "신분당선 강남→판교 (17분, 혼잡 70% 가정)",
      "직장 (가정: 판교역 인근) 근무",
    ]);
    assert.equal(current, 4);
    const segs = daySegments({ run, agentKey: "h1", day: 0 });
    assert.ok(segs.some((s) => segmentTitle(s)
      === "08:21–08:35 걷기 · 레이크팰리스 → 잠실 14분"));
  });

  it("covers 30 days with weekend flags", () => {
    const run = JSON.parse(readFileSync(RUN_A, "utf8"));
    const days = monthStrip({ run, agentKey: "h1" });
    assert.equal(days.length, 30);
    assert.equal(days[0].weekend, false);
    assert.equal(days[0].commuteMin, 85);
    assert.ok(days.some((d) => d.weekend), "a weekend exists");
    for (const d of days) {
      if (d.weekend) assert.equal(d.commuteMin, 0);
    }
  });
});

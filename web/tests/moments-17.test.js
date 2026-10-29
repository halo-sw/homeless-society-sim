// 17-3: 살아 보니 moments from the 30 days. Pure picker (demo build
// when present, synthetic runs always) + the drawer section render.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

register("./jsx-loader.mjs", import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

import { pickMoments, householdEveningMinutes,
  MOMENT_KINDS } from "../src/engine/moments.js";

const pA = join(ROOT, "data/build/sim/demo-two-homes-A.json");
const pB = join(ROOT, "data/build/sim/demo-two-homes-B.json");
const hasDemo = existsSync(pA) && existsSync(pB);
const demoA = () => JSON.parse(readFileSync(pA, "utf8"));
const demoB = () => JSON.parse(readFileSync(pB, "utf8"));

function evidenceExists(run, evidence) {
  if (evidence.type === "trip") return run.trips.some((t) => t.id === evidence.id);
  if (evidence.type === "decision") return run.decisions.some((d) => d.id === evidence.id);
  return false;
}

function synthRun(home, { trips = [], aways = [], decisions = [] } = {}) {
  return {
    meta: { home, days: 30 },
    agents: [{ key: "h1", household: true, label: "구성원 1" }],
    trips, aways, decisions,
  };
}

const TRIP = (id, o = {}) => ({
  id, agent: "h1", day: 5, depart_min: 1080, arrive_min: 1100,
  purpose: "errand", from: { kind: "home", id: "home", label: "집" },
  to: { kind: "poi", id: "p1", label: "마트" }, ...o,
});

describe("17-3 pickMoments on the demo build", { skip: !hasDemo }, () => {
  it("picks three moments, each with an evidence id from its run", () => {
    const A = demoA();
    const B = demoB();
    const moments = pickMoments(A, B, { max: 3 });
    assert.equal(moments.length, 3);
    assert.deepEqual([...new Set(moments.map((m) => m.kind))].length, 3);
    for (const m of moments) {
      assert.ok(MOMENT_KINDS.includes(m.kind), m.kind);
      const run = m.home === "A" ? A : B;
      assert.ok(evidenceExists(run, m.evidence),
        `${m.kind} evidence ${m.evidence.type}:${m.evidence.id} in run ${m.home}`);
      assert.ok(!m.sentence.includes("가정"), `no assumed wording: ${m.sentence}`);
    }
  });

  it("ranks by relative A/B difference", () => {
    const moments = pickMoments(demoA(), demoB(), { max: 3 });
    for (let i = 1; i < moments.length; i++) {
      assert.ok(moments[i - 1].gapRel >= moments[i].gapRel, "gapRel desc");
    }
  });

  it("uses measured congestion only for the crowded leg", () => {
    const moments = pickMoments(demoA(), demoB(), { max: 3 });
    const crowded = moments.find((m) => m.kind === "crowded");
    assert.ok(crowded, "demo A has measured rides");
    assert.equal(crowded.detail.source, "서울교통공사");
    assert.match(crowded.sentence, /실측/);
  });

  it("recomputes evening-at-home minutes exactly like the engine", () => {
    const A = demoA();
    const B = demoB();
    assert.equal(householdEveningMinutes(A).total,
      A.totals.household.home_evening_minutes);
    assert.equal(householdEveningMinutes(B).total,
      B.totals.household.home_evening_minutes);
  });
});

describe("17-3 pickMoments on synthetic runs (no data needed)", () => {
  it("surfaces a Muse decision that differs, with its reason_ko", () => {
    const d = { id: "h1:d5:1080:evening:00", agent: "h1", day: 5,
      minute: 1080, kind: "evening",
      options: [{ key: "mart", label: "마트" }, { key: "home", label: "집으로" }],
      default_key: "mart", chosen_key: "home", chosen_by: "model",
      reason_ko: "피곤해서 바로 쉬고 싶어요" };
    const runA = synthRun("A", { trips: [TRIP("t000001")], decisions: [d] });
    const runB = synthRun("B", { trips: [TRIP("t000001")] });
    const moments = pickMoments(runA, runB, { max: 3 });
    const dec = moments.find((m) => m.kind === "decision");
    assert.ok(dec, "decision candidate");
    assert.equal(dec.home, "A");
    assert.match(dec.sentence, /마트 대신 집으로/);
    assert.match(dec.sentence, /피곤해서 바로 쉬고 싶어요/);
    assert.deepEqual(dec.evidence, { type: "decision", id: d.id });
    assert.ok(evidenceExists(runA, dec.evidence));
  });

  it("skips assumed-congestion legs entirely", () => {
    const away = { agent: "h1", day: 0, kind: "ride", start_min: 500,
      end_min: 530, label: "지하철 이동", cause: { type: "routine", criterion_ids: [], text: "" },
      detail: { direction: "out",
        ride: { departMin: 500, transfers: [], legs: [{
          lineName: "신분당선", from: "강남", to: "판교", minutes: 17,
          congestion: { hasData: false, source: "가정값", valuePct: 70 },
        }] } } };
    const runA = synthRun("A", { aways: [away], trips: [TRIP("t000001", { day: 0 })] });
    const runB = synthRun("B");
    const moments = pickMoments(runA, runB, { max: 3 });
    assert.ok(!moments.some((m) => m.kind === "crowded"), "no crowded from 가정값");
  });

  it("respects max and returns [] for empty runs", () => {
    const full = pickMoments(synthRun("A"), synthRun("B"), { max: 3 });
    assert.deepEqual(full, []);
    const d = { id: "h1:d5:1080:evening:00", agent: "h1", day: 5,
      minute: 1080, kind: "evening", options: [{ key: "mart", label: "마트" }],
      default_key: "x", chosen_key: "mart", chosen_by: "model",
      reason_ko: "쉬고 싶어요" };
    const runA = synthRun("A", { trips: [TRIP("t000001")], decisions: [d] });
    const runB = synthRun("B", { trips: [TRIP("t000001")] });
    assert.equal(pickMoments(runA, runB, { max: 1 }).length, 1);
    assert.ok(pickMoments(runA, runB, { max: 3 }).length <= 3);
  });
});

describe("17-3 drawer moments section (SSR, no DOM)", () => {
  let React;
  let renderToString;
  let SimDrawer;

  before(async () => {
    React = (await import("react")).default;
    ({ renderToString } = await import("react-dom/server"));
    ({ SimDrawer } = await import("../src/ui/app.jsx"));
  });

  const MOMENTS = [
    { kind: "crowded", home: "A", agent: "h1", agentLabel: "구성원 1",
      day: 1, minute: 492, dayLabel: "2일차", timeLabel: "08:12",
      sentence: "2일차 08:12 A 2호선 잠실→강남 혼잡 93% (실측)",
      evidence: { type: "trip", id: "t000005" }, followIndex: 1, gapRel: 1 },
    { kind: "commute", home: "A", agent: "h1", agentLabel: "구성원 1",
      day: 0, minute: 501, dayLabel: "1일차", timeLabel: "08:21",
      sentence: "1일차 A 출근 44분",
      evidence: { type: "trip", id: "t000001" }, followIndex: 1, gapRel: 0.6 },
    { kind: "gap", home: "B", agent: "h1", agentLabel: "구성원 1",
      day: 4, minute: 1060, dayLabel: "5일차", timeLabel: "17:40",
      sentence: "공원 A 10번 vs B 26번",
      evidence: { type: "decision", id: "h1:d4:1053:park_or_home:00" },
      followIndex: 1, gapRel: 0.5 },
  ];

  function stateWith(moments) {
    return {
      clock: { minute: 530 },
      now: { free: true, rows: [] },
      ticker: [],
      judgeLog: [],
      compareOpen: false,
      money: null,
      moments,
    };
  }

  it("shows three one-line cards open by default, under the score row", () => {
    const html = renderToString(
      React.createElement(SimDrawer, { state: stateWith(MOMENTS) }));
    assert.ok(html.includes("살아 보니"), "section head");
    assert.ok(html.includes("section-moments"), "test id");
    assert.equal(html.split("근거 ✓").length - 1, 3, "three evidence chips");
    for (const m of MOMENTS) {
      assert.ok(html.includes(m.sentence), m.kind);
      assert.ok(html.includes(`data-day="${m.day}"`), `${m.kind} seek day`);
      assert.ok(html.includes(`data-minute="${m.minute}"`), `${m.kind} seek minute`);
      assert.ok(html.includes("data-follow=\"1\""), `${m.kind} follow member`);
    }
    assert.ok(html.indexOf("section-moments") < html.indexOf("sim-hero"),
      "moments above the hero");
  });

  it("hides quietly without moments", () => {
    for (const moments of [null, []]) {
      const html = renderToString(
        React.createElement(SimDrawer, { state: stateWith(moments) }));
      assert.ok(!html.includes("살아 보니"), `hidden for ${JSON.stringify(moments)}`);
      assert.ok(html.includes("sim-hero"), "hero still renders");
    }
  });
});

// 13f2 drawer: one hero + three folded sections (SSR, no DOM).
// At the 08:50 ride state the hero answers first, every leg fact
// lives in the 오늘 list, and "잠실→강남" appears at most once
// anywhere else in the drawer.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

const LEGS = [
  { line: "2호선", from: "잠실", to: "강남", minutes: 9,
    valuePct: 91.1, source: "서울교통공사", band: "normal" },
  { line: "신분당선", from: "강남", to: "판교", minutes: 17,
    valuePct: 70, source: "가정값", band: "normal" },
];

function state0850() {
  return {
    clock: { day: 0, minute: 530, days: 30,
      startDate: "2026-11-02", label: "11월 2일(월) 08:50 · 1일차/30" },
    now: {
      agentKey: "h1", label: "구성원 1", state: "ride",
      now: "지하철 이동 중 · 2호선 잠실→강남 (약 9분) · 환승 · 신분당선 강남→판교 · 15분 남음",
      why: "07:30 기준+지터51분 → 08:21 출발", whyKind: "routine",
      criterionIds: ["C-commute-depart", "C-1", "C-2", "C-3", "C-4",
        "C-5", "C-6", "C-7", "C-8", "C-9", "C-10"],
      decision: null, progress: 0.5, next: "09:05 직장 도착", oldRun: false,
      fatigue: {
        value: 4.8, delta: 10.1,
        note: "신분당선 강남→판교 붐비는 정도 70%, 서서 감",
        source: "가정값", criterionIds: ["C-congestion", "C-fatigue-load"],
        series: [{ m: 300, v: 4 }, { m: 530, v: 14.9, label: "출근" }],
        peakCongestion: { pct: 91.1, line: "2호선", station: "잠실",
          source: "서울교통공사" },
      },
      ride: {
        direction: "out", where: "신분당선 강남→판교 이동 중",
        minutesLeft: 15, inTransfer: false, legs: LEGS,
        transfers: [{ station: "강남", minutes: 4 }], fallback: null,
      },
    },
    ticker: [
      { day: 0, minute: 501, kind: "depart", text: "08:21 출발 · 레이크팰리스 → 잠실" },
      { day: 0, minute: 515, kind: "arrive", text: "08:35 도착 · 잠실" },
    ],
    judgeLog: [
      { id: "d1", minute: "08:21", agent: "구성원 1", kind: "출근길",
        choice: "2호선", badgeText: "규칙", reason: "" },
    ],
    journey: {
      where: "신분당선 강남→판교 이동 중", legIndex: 1, inTransfer: false,
      minutesLeft: 15, legs: LEGS, elapsedMin: 17, totalMin: 32,
      corridorLabel: "간략 지도 (건물 높이 추정)", detailNote: "",
      congestionSource: "서울교통공사 지하철혼잡도정보 (2026-09-30 기준)",
    },
    journeyView: "auto", journeyLoading: "",
    routeSteps: { outings: [{
      start: 501, end: 1127,
      steps: [
        { kind: "place", label: "레이크팰리스", minute: 501 },
        { kind: "walk", label: "잠실 (걸어서 14분)", minute: 501, minutes: 14 },
        { kind: "ride", label: "2호선 잠실→강남 (9분, 혼잡 91% 실측)",
          minute: 515, minutes: 9,
          congestion: { valuePct: 91.1, source: "서울교통공사" } },
        { kind: "transfer", label: "강남 환승 4분", minute: 524, minutes: 4 },
        { kind: "ride", label: "신분당선 강남→판교 (17분, 혼잡 70% 가정)",
          minute: 528, minutes: 17,
          congestion: { valuePct: 70, source: "가정값" } },
        { kind: "place", label: "직장 (가정: 판교역 인근) 근무", minute: 545, minutes: 300 },
      ],
    }] },
    compareOpen: false, compareTab: "compare",
  };
}

describe("13f2 drawer hero + sections (SSR, no DOM)", () => {
  let React;
  let renderToString;
  let SimDrawer;
  let TodayList;

  before(async () => {
    React = (await import("react")).default;
    ({ renderToString } = await import("react-dom/server"));
    ({ SimDrawer, TodayList } = await import("../src/ui/app.jsx"));
  });

  function render(el) {
    const errors = [];
    const orig = console.error;
    console.error = (...args) => { errors.push(args.map(String).join(" ")); };
    let html = "";
    try {
      html = renderToString(el);
    } finally {
      console.error = orig;
    }
    assert.equal(errors.length, 0, `React errors: ${errors.join(" | ").slice(0, 1000)}`);
    const bad = html.match(/[a-z]+_[a-z]+|complex|°\s?[NE]/);
    assert.ok(!bad, `internal text on screen: ${bad && bad[0]}`);
    return html;
  }

  const countOf = (html, s) => html.split(s).length - 1;

  it("hero answers first at 08:50", () => {
    const html = render(React.createElement(SimDrawer, { state: state0850() }));
    assert.ok(html.includes("구성원 1"), "member name");
    assert.ok(html.includes("이동 중"), "status chip");
    assert.ok(html.includes("신분당선 강남→판교 이동 중"), "one sentence");
    assert.ok(html.includes("15분 남음"), "big number");
    assert.ok(html.includes("혼잡 70%"), "current-leg congestion");
    assert.ok(html.includes("다음: 09:05 직장 도착"), "next event");
    for (const s of ["오늘", "왜 이렇게 판단했나", "비교·기록"]) {
      assert.ok(html.includes(s), `section ${s}`);
    }
  });

  it("shows each leg fact once: 잠실→강남 at most once outside 오늘", () => {
    const state = state0850();
    const drawer = render(React.createElement(SimDrawer, { state }));
    const today = render(React.createElement(TodayList, { state }));
    const outside = countOf(drawer, "잠실→강남") - countOf(today, "잠실→강남");
    assert.ok(outside <= 1, `잠실→강남 outside 오늘: ${outside}`);
    assert.ok(countOf(today, "잠실→강남") >= 1, "the leg stays in 오늘");
  });

  it("folds every section except 오늘, criteria as +N개 tags", () => {
    const html = render(React.createElement(SimDrawer, { state: state0850() }));
    assert.ok(html.includes('open="" data-testid="section-today"'), "오늘 open");
    assert.ok(!html.includes('open="" data-testid="section-why"'), "왜 folded");
    assert.ok(!html.includes('open="" data-testid="section-compare"'), "비교·기록 folded");
    assert.ok(html.includes("+8개"), "tag expander");
    assert.ok(!html.includes("개 기준"), "no button-style expander");
  });
});

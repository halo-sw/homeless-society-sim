// 13f2 one-row timeline (SSR, no DOM): the bar is play + clock +
// strip + speed + ⋯; everything else hides in the menu. Route steps
// are gone from the bar (the drawer's 오늘 list shows them) but the
// keyboard shortcuts stay.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

function barState() {
  return {
    clock: { day: 0, minute: 530, days: 30,
      startDate: "2026-11-02", label: "11월 2일(월) 08:50 · 1일차/30" },
    playing: false, speed: 1, follow: 1,
    followOptions: [{ value: "0", label: "자유 시점" }, { value: "1", label: "구성원 1" }],
    home: "A", stripCompare: false,
    dayStrip: { segments: [
      { start: 300, end: 501, activity: "home", label: "", minutes: 201 },
      { start: 501, end: 515, activity: "walk",
        label: "레이크팰리스 → 잠실역", minutes: 14 },
      { start: 515, end: 560, activity: "subway",
        label: "2호선 잠실→강남", minutes: 45 },
    ] },
    dayStripB: null, simTicks: [],
    routeSteps: { outings: [{ start: 501, end: 560, steps: [] }] },
    monthStrip: [
      { day: 0, date: "11-02", weekday: "월", weekend: false,
        commuteMin: 64, fatigueMean: 12.1 },
    ],
  };
}

describe("13f2 one-row timeline (SSR, no DOM)", () => {
  let React;
  let renderToString;
  let TimelineBar;
  let timelineKeyHandler;

  before(async () => {
    React = (await import("react")).default;
    ({ renderToString } = await import("react-dom/server"));
    ({ TimelineBar, timelineKeyHandler } = await import("../src/ui/timeline.jsx"));
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
    return html;
  }

  it("is one row: play, clock, strip, speed, ⋯", () => {
    const html = render(React.createElement(TimelineBar, { state: barState() }));
    assert.ok(html.includes("ui-bar13f2-row"), "row class");
    assert.ok(html.includes("재생"), "play icon label");
    assert.ok(html.includes("11월 2일(월) 08:50 · 1일차/30"), "date-time");
    assert.ok(html.includes("ui-strip"), "day strip");
    assert.ok(html.includes("ui-strip-head"), "needle");
    for (const s of ["1×", "10×", "60×"]) {
      assert.ok(html.includes(s), `speed ${s}`);
    }
    assert.ok(html.includes("더 보기"), "overflow menu");
    assert.ok(html.includes("08:21–08:35 걷기") || html.includes("걷기"), "leg tooltip");
  });

  it("hides the menu items and the steps until asked", () => {
    const html = render(React.createElement(TimelineBar, { state: barState() }));
    for (const s of ["A·B 비교", "A·B 하루 같이 보기", "30일 보기", "따라가기"]) {
      assert.ok(!html.includes(s), `hidden: ${s}`);
    }
    assert.ok(!html.includes("이전 이동"), "no steps in the bar");
    assert.ok(html.includes("30일 고르기"), "month strip stays rendered");
    const open = render(React.createElement(TimelineBar,
      { state: barState(), defaultMenuOpen: true }));
    for (const s of ["A·B 비교", "A·B 하루 같이 보기", "30일 보기", "따라가기"]) {
      assert.ok(open.includes(s), `menu shows: ${s}`);
    }
  });

  it("keeps the prev/next keyboard shortcuts", () => {
    const calls = [];
    const outings = [{ start: 501, end: 560 }, { start: 1085, end: 1127 }];
    const h = timelineKeyHandler({
      routeOutings: outings, minute: () => 530,
      togglePlay: () => calls.push("play"),
      setMinute: (m) => calls.push(m),
    });
    h({ key: "ArrowRight", preventDefault: () => {} });
    assert.deepEqual(calls, [1085]);
    h({ key: "ArrowLeft", preventDefault: () => {} });
    assert.deepEqual(calls, [1085, 501]);
    h({ code: "Space", preventDefault: () => {} });
    assert.deepEqual(calls, [1085, 501, "play"]);
  });
});

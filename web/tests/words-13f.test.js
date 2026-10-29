// 13f-1 words on screen: plain copy, collapsed tool rows, tour
// caption without categories or coordinates. No data/build needed.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { exampleLine, sourceBadgeFor, groupBadgesFor,
  plainSource } from "../src/ui/copy.js";

register("./jsx-loader.mjs", import.meta.url);

describe("13f-1 example line", () => {
  it("says 예시: 예비 신혼부부, never the id", () => {
    assert.equal(exampleLine("newlywed-couple"), "예시: 예비 신혼부부");
    assert.equal(exampleLine("single-firstjob"), "예시: 1인 사회초년생");
    assert.equal(exampleLine("dual-income-child"), "예시: 맞벌이 + 초등학생 자녀");
    assert.equal(exampleLine("nope"), "예시에서 시작했어요");
  });
});

describe("13f-1 source badges", () => {
  it("maps every source to 실측 or 가정값", () => {
    for (const s of ["서울교통공사", "rtms", "graph", "register",
      "police", "housing_api", "실거래", "그래프", "관청 자료"]) {
      assert.equal(sourceBadgeFor(s), "실측", s);
    }
    for (const s of ["scenario", "user_input", "payroll_estimate",
      "고객 입력", "추정", "가정값", "whatever", "", null]) {
      assert.equal(sourceBadgeFor(s), "가정값", String(s));
    }
  });

  it("dedupes one group to at most two badges, measured first", () => {
    assert.deepEqual(groupBadgesFor(["graph", "graph", "scenario"]),
      ["실측", "가정값"]);
    assert.deepEqual(groupBadgesFor(["scenario", "user_input"]), ["가정값"]);
    assert.deepEqual(groupBadgesFor([]), []);
  });

  it("never shows engine in a source label", () => {
    assert.equal(plainSource("engine 기본값"), "기본 계산값");
    assert.equal(plainSource("가정값"), "가정값");
  });
});

describe("13f-1 screen words (SSR, no DOM)", () => {
  let React;
  let renderToString;
  let ToolRows;
  let CaptionCard;

  before(async () => {
    React = (await import("react")).default;
    ({ renderToString } = await import("react-dom/server"));
    ({ ToolRows } = await import("../src/ui/consult.jsx"));
    ({ CaptionCard } = await import("../src/ui/app.jsx"));
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

  it("collapses tool rows into one 확인한 것 N가지 line", () => {
    const html = render(React.createElement(ToolRows, { rows: [
      { id: "t1", name: "extract_profile", ok: true, summary: "1인", ms: 1 },
      { id: "t2", name: "find_homes", ok: true, summary: "3곳", ms: 40 },
      { id: "t3", name: "run_simulation", ok: true, summary: "완료", ms: 1200 },
    ] }));
    assert.ok(html.includes("확인한 것 3가지"), "collapsed line");
  });

  it("renders nothing without tool rows", () => {
    assert.equal(render(React.createElement(ToolRows, { rows: [] })), "");
  });

  it("shows the tour stop label without category or coordinates", () => {
    const html = render(React.createElement(CaptionCard, { state: {
      caption: { name: "래미안 포레스트", walk: "출발",
        meta: "아파트 단지 · complex · 37.5115° N 127.0945° E" },
      judge: null, judgeLive: false, askError: "",
    } }));
    assert.ok(html.includes("아파트 단지"), "stop kind");
    assert.ok(!html.includes("complex"), "no category word");
    assert.ok(!html.includes("37.5115"), "no coordinates");
    const bad = html.match(/[a-z]+_[a-z]+|complex|°\s?[NE]/);
    assert.ok(!bad, `internal text on screen: ${bad && bad[0]}`);
  });
});

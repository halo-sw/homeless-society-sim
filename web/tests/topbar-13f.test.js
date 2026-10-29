// 13f-1: one shared top bar for chat / sim / tour. Render smoke
// tests (react-dom/server, no DOM, no data/build needed): the bar in
// each mode, the sim/tour tool groups, and the settings sheet entries.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

describe("13f-1 shared top bar (SSR, no DOM)", () => {
  let React;
  let renderToString;
  let TopBar;
  let MapTools;
  let SettingsContent;

  before(async () => {
    React = (await import("react")).default;
    ({ renderToString } = await import("react-dom/server"));
    ({ TopBar, MapTools, SettingsContent } = await import("../src/ui/topbar.jsx"));
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

  const MODES = ["대화", "살아 보기", "동네 둘러보기"];

  it("renders the bar in chat mode with the summary chip", () => {
    const html = render(React.createElement(TopBar,
      { mode: "chat", summary: "판교 출근 · 1인", settings: { mode: "chat" } }));
    assert.ok(html.includes("주거 시뮬레이터"), "product name");
    for (const m of MODES) assert.ok(html.includes(m), `mode ${m}`);
    assert.ok(html.includes("설정"), "settings button");
    assert.ok(html.includes("판교 출근 · 1인"), "profile summary chip");
    assert.ok(!html.includes("미니어처"), "no miniature badge");
  });

  it("renders the bar in chat mode without a summary", () => {
    const html = render(React.createElement(TopBar,
      { mode: "chat", summary: "", settings: { mode: "chat" } }));
    assert.ok(html.includes("상황을 알려주세요"), "empty-state centre");
  });

  it("renders the bar in sim and tour modes with no centre chip", () => {
    for (const mode of ["sim", "tour"]) {
      const html = render(React.createElement(TopBar, { mode, settings: { mode } }));
      assert.ok(html.includes("주거 시뮬레이터"), `product name (${mode})`);
      for (const m of MODES) assert.ok(html.includes(m), `mode ${m} (${mode})`);
      assert.ok(html.includes("설정"), `settings button (${mode})`);
      assert.ok(!html.includes("상황을 알려주세요"), `no chat centre (${mode})`);
    }
  });

  it("renders the sim tool group (homes + bright-homes + legend)", () => {
    const html = render(React.createElement(MapTools, {
      state: { mode: "sim", home: "A", homes: [{ label: "A" }, { label: "B" }],
        resOnly: false },
      legendOpen: false, onLegend: () => {},
    }));
    assert.ok(html.includes("집만 밝게 보기"), "res-only toggle");
    assert.ok(html.includes("범례"), "legend toggle");
  });

  it("renders the tour tool group (area select + play + legend)", () => {
    const areaOptions = Array.from({ length: 62 }, (_, i) => (
      { value: `area-${i}`, label: `지역${i}` }));
    areaOptions[7] = { value: "songpa-jamsil", label: "송파·잠실" };
    const html = render(React.createElement(MapTools, {
      state: { mode: "tour", area: { id: "songpa-jamsil", label: "송파·잠실" },
        areaOptions, tourPlaying: true },
      legendOpen: false, onLegend: () => {},
    }));
    assert.ok(html.includes("지역:"), "area select prefix");
    assert.ok(html.includes("송파·잠실"), "current area label");
    assert.ok(html.includes("일시정지"), "pause while playing");
    assert.ok(html.includes("범례"), "legend toggle");
  });

  it("renders the settings sheet entries", () => {
    const html = render(React.createElement(SettingsContent,
      { settings: { mode: "chat", assumptions: { overrides: {} } }, onClose: () => {} }));
    for (const s of ["모델", "가정 바꾸기", "출처·라이선스", "이 시뮬레이션은?", "새로 시작"]) {
      assert.ok(html.includes(s), `sheet section ${s}`);
    }
  });

  it("renders the sim/tour sheet with a chat handoff for assumptions", () => {
    const html = render(React.createElement(SettingsContent,
      { settings: { mode: "sim", assumptions: null }, onClose: () => {} }));
    assert.ok(html.includes("대화로 이동"), "assumptions handoff");
    assert.ok(html.includes("새로 시작"), "restart");
  });
});

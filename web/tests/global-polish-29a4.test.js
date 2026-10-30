// 29a4: global polish — contrast token, summary edit affordance,
// folding chips, named sources, single example label, one pane toggle.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, p), "utf8");
const count = (html, s) => html.split(s).length - 1;

describe("29a4 contrast token", () => {
  it("ui.css and docs/design.md use --ds-ink-3: #736b5f", () => {
    assert.ok(read("../src/ui/ui.css").includes("--ds-ink-3: #736b5f"));
    assert.ok(read("../../docs/design.md").includes("--ds-ink-3: #736b5f"));
  });
});

describe("29a4 chips fold while reading", () => {
  let chipsVisible;
  before(async () => {
    ({ chipsVisible } = await import("../src/ui/chat.jsx"));
  });
  it("hides the chip row 500 px from the bottom", () => {
    assert.equal(chipsVisible(0, 1000, 500), false);
  });
  it("shows the chip row within 160 px of the bottom", () => {
    assert.equal(chipsVisible(400, 1000, 500), true);
  });
});

describe("29a4 summary pill is an edit affordance (SSR, no DOM)", () => {
  let React;
  let renderToString;
  let TopBar;
  before(async () => {
    React = (await import("react")).default;
    ({ renderToString } = await import("react-dom/server"));
    ({ TopBar } = await import("../src/ui/topbar.jsx"));
  });
  it("renders the summary with ✎ and 조건 고치기, not the info badge", () => {
    const html = renderToString(React.createElement(TopBar,
      { mode: "chat", summary: "강남 출근 · 2인 · 전세 4억 원 이하", settings: { mode: "chat" } }));
    assert.ok(html.includes("✎"), "edit glyph");
    assert.ok(html.includes("조건 고치기"), "edit label");
    assert.ok(!read("../src/ui/topbar.jsx").includes('variant="info"'), "no info badge");
  });
});

describe("29a4 sources say what was checked (SSR, no DOM)", () => {
  let React;
  let renderToString;
  let CiteRows;
  before(async () => {
    React = (await import("react")).default;
    ({ renderToString } = await import("react-dom/server"));
    ({ CiteRows } = await import("../src/ui/consult.jsx"));
  });
  it("labels the MOLIT source with its short name and full title", () => {
    const html = renderToString(React.createElement(CiteRows,
      { tools: [], sourceIds: ["rtms"] }));
    assert.ok(html.includes("확인한 출처"), "checked-sources prefix");
    assert.ok(html.includes("실거래가(국토부)"), "short name");
    assert.ok(html.includes('title="국토교통부 실거래가 공개시스템 (RTMS)"'), "full name in title");
  });
});

describe("29a4 one example notice", () => {
  it('listings.jsx no longer contains (예시)"', () => {
    assert.ok(!read("../src/ui/listings.jsx").includes("(예시)"));
  });
});

describe("29a4 one pane toggle (SSR, no DOM)", () => {
  let React;
  let renderToString;
  let TopBar;
  let ChatPaneTabs;
  let paneTabsMount;
  before(async () => {
    React = (await import("react")).default;
    ({ renderToString } = await import("react-dom/server"));
    ({ TopBar } = await import("../src/ui/topbar.jsx"));
    ({ ChatPaneTabs, paneTabsMount } = await import("../src/ui/chat.jsx"));
  });
  it("mounts the toggle in exactly one place per layout", () => {
    assert.equal(paneTabsMount({ workOpen: true, phone: false }), "top");
    assert.equal(paneTabsMount({ workOpen: true, phone: true }), "shell");
    assert.equal(paneTabsMount({ workOpen: false, phone: false }), null);
    assert.equal(paneTabsMount({ workOpen: false, phone: true }), null);
  });
  it("chat shell with workOpen true contains 화면 선택 once", () => {
    const tabs = React.createElement(ChatPaneTabs, { view: "chat", onChange: () => {} });
    const html = renderToString(React.createElement(TopBar,
      { mode: "chat", summary: "", extra: tabs, settings: { mode: "chat" } }));
    assert.equal(count(html, "화면 선택"), 1);
  });
});

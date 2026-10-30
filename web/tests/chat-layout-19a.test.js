// 19a: chat screen layout — two columns, one run button in the picks
// tray over the map, side panel on demand. Render checks (jsx-loader,
// renderToString) with the readyCandidate fixture from 18c.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

// .jsx loads dynamically (static imports resolve before the loader).
let React;
let renderToString;
let PicksTray;
let SidePanel;
let CandidatesCard;
let StageArea;
let RUN_BUTTON_LABEL;

function readyCandidate(id, name) {
  return { id, name, kind: "오피스텔", region: "bundang",
    lon: 127.1, lat: 37.4, build_year: 2015, scene: "st-판교",
    tenures: [{ tenure: "jeonse", median_won: 180000000,
      min_won: 170000000, max_won: 190000000, deals: 5,
      budget_fit: "all", bucket_center_m2: 30 }],
    commute: { walk: { known: true, station: "판교", minutes: 5 },
      ride: { known: true, minutes: 6, lines: [], transfers: [] } },
    commute_ko: "판교까지 약 11분" };
}

const NAMES = ["A집", "B집", "C집", "D집", "E집", "F집"];

before(async () => {
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
  ({ PicksTray, SidePanel, CandidatesCard, StageArea, RUN_BUTTON_LABEL } =
    await import("../src/ui/chat.jsx"));
});

const noop = () => {};

describe("19a picks tray holds the only run button", () => {
  it("(a) 2 ready picks: the label exactly once, both names, A and B, enabled", () => {
    const cands = [readyCandidate("c1", "A집"), readyCandidate("c2", "B집")];
    const html = renderToString(React.createElement(PicksTray,
      { picks: ["c1", "c2"], candidates: cands, onRun: noop, onRemove: noop }));
    assert.equal(html.split(RUN_BUTTON_LABEL).length - 1, 1, "label exactly once");
    assert.ok(html.includes("A집") && html.includes("B집"), "both names");
    assert.ok(html.includes(">A<") && html.includes(">B<"), "letters A and B");
    assert.ok(!html.includes("disabled"), "button is not disabled");
  });

  it("(b) 1 pick: the one-more hint and a disabled button", () => {
    const cands = [readyCandidate("c1", "A집"), readyCandidate("c2", "B집")];
    const html = renderToString(React.createElement(PicksTray,
      { picks: ["c1"], candidates: cands, onRun: noop, onRemove: noop }));
    assert.ok(html.includes("한 곳 더 담으면 비교할 수 있어요"), "one-more hint");
    assert.ok(html.includes("disabled"), "button is disabled");
  });

  it("(c) 0 picks: renders nothing", () => {
    const cands = [readyCandidate("c1", "A집"), readyCandidate("c2", "B집")];
    const html = renderToString(React.createElement(PicksTray,
      { picks: [], candidates: cands, onRun: noop, onRemove: noop }));
    assert.equal(html, "");
  });

  it("(d) candidates list: no run button, footer says what to say", () => {
    const cands = NAMES.map((n, i) => readyCandidate(`c${i + 1}`, n));
    const html = renderToString(React.createElement(CandidatesCard,
      { data: { candidates: cands, total_matching: 6, sort_note: "" },
        tenure: "jeonse", sort: "commute", onSort: noop,
        picks: ["c1", "c2"], onTogglePick: noop, onPreview3D: noop,
        onJeonse: noop, onRun: noop, onDetail: noop, onHover: noop,
        photoDeps: {}, destName: "판교" }));
    // The list itself has no run button; the footer says what to say.
    assert.equal(html.split(RUN_BUTTON_LABEL).length - 1, 0, "no run button in the list");
    assert.ok(html.includes("살아 봐 줘"), "footer says what to say");
  });

  it("(e) side panel with detail: title, close, and the home name", () => {
    const html = renderToString(React.createElement(SidePanel,
      { picks: ["c1"], candidatesData: null, detail: readyCandidate("c1", "A집"),
        onCloseDetail: noop, photoDeps: {}, destName: "판교",
        tenure: "jeonse", onTogglePick: noop, onJeonse: noop }));
    assert.ok(html.includes("자세히"), "detail title");
    assert.ok(html.includes("닫기"), "close button");
    assert.ok(html.includes("A집"), "candidate name");
  });

  it("(f) stage area: context pill text, no region count", async () => {
    const { buildChatMap } = await import("../src/chatmap.js");
    const cands = NAMES.map((n, i) => readyCandidate(`c${i + 1}`, n));
    const map = buildChatMap({ regions: { regions: [] }, network: null,
      tiles: [], green: { water: [], parks: [] }, candidates: cands,
      picks: ["c1", "c2"], workplaceStation: "판교", tenure: "jeonse" });
    const html = renderToString(React.createElement(StageArea,
      { map, cardHi: null, onPinHover: noop, onPinClick: noop,
        onOrbRegion: noop, contextLine: "판교 출근 · 후보 6곳" }));
    assert.ok(html.includes("판교 출근 · 후보 6곳"), "context pill text");
    assert.ok(!html.includes("지역 9곳"), "no region count");
    assert.ok(!html.includes("지역을 불러오는 중"), "no region loading line");
  });
});

// 19g walkthrough fixes: row pick click, centred pills, workplace
// label, panel attribute. Render checks (jsx-loader, renderToString).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

// .jsx loads dynamically (static imports resolve before the loader).
let React;
let renderToString;
let CandidateCard;
let rowClickHandler;
let ChatMap;
let chatMainPanelAttr;
let layoutPinLabels;

function readyCandidate(id, name) {
  return { id, name, kind: "오피스텔", region: "bundang", dong: "야탑동",
    lon: 127.1, lat: 37.4, build_year: 2003, scene: "st-판교",
    tenures: [{ tenure: "jeonse", median_won: 200000000,
      min_won: 190000000, max_won: 210000000, deals: 7,
      budget_fit: "all", bucket_center_m2: 30 }],
    commute: { walk: { known: true, station: "야탑", minutes: 3.8 },
      ride: { known: true, minutes: 8.5, lines: [], transfers: [],
        derived: { methodsUsed: ["estimate"] } } },
    commute_ko: "판교까지 약 12분" };
}

function pin(id, lon, lat, extra = {}) {
  return { id, n: Number(id) || 1, lon, lat,
    candidate: { ...readyCandidate(id, `집${id}`), lon, lat },
    ...extra };
}

before(async () => {
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
  ({ CandidateCard, rowClickHandler } = await import("../src/ui/candidate-card.jsx"));
  ({ ChatMap } = await import("../src/ui/chatmap.jsx"));
  ({ chatMainPanelAttr } = await import("../src/ui/chat.jsx"));
  ({ layoutPinLabels } = await import("../src/chatmap.js"));
});

const noop = () => {};
const render = (el) => renderToString(el);

describe("19g-1 row pick click", () => {
  it("row has no button wrapper span", () => {
    const html = render(React.createElement(CandidateCard,
      { candidate: readyCandidate("c1", "담기집"), tenure: "jeonse",
        destName: "판교", photos: null, index: 0, picked: false,
        onLive: noop, onJeonse: noop, onDetail: noop }));
    assert.ok(!html.includes("ui-cand-row-btn"), "wrapper span is gone");
    assert.ok(html.includes("담기"), "pick button still renders");
  });

  it("rowClickHandler ignores clicks from inside a button", () => {
    const cand = readyCandidate("c1", "담기집");
    let got = null;
    const h = rowClickHandler((c) => { got = c; }, cand);
    h({ target: { closest: (sel) => (sel === "button" ? {} : null) } });
    assert.equal(got, null, "button click does not open detail");
    h({ target: { closest: () => null } });
    assert.equal(got, cand, "row click opens detail");
    got = null;
    h({});
    assert.equal(got, cand, "synthetic click without target opens detail");
  });
});

describe("19g-2 centred price pills", () => {
  it("isolated pin: pill centred above, tail tip at the anchor", () => {
    const laid = layoutPinLabels(
      [{ id: "1", x: 320, y: 210, tag: "2억", w: 120, h: 24, tail: 5 }],
      640, 420);
    const b = laid[0].box;
    assert.ok(Math.abs(b.x + b.w / 2 - 320) <= 0.5, `pill centre x ${b.x + b.w / 2}`);
    assert.ok(Math.abs(b.y + b.h + 5 - 210) <= 0.5, `tail tip y ${b.y + b.h + 5}`);
  });

  it("near-duplicate pair: first stays, second moves with a leader", () => {
    const laid = layoutPinLabels([
      { id: "5", x: 300, y: 210, tag: "5", w: 100, h: 24, tail: 5 },
      { id: "6", x: 330, y: 210, tag: "6", w: 100, h: 24, tail: 5 },
    ], 640, 420);
    const [A, B] = laid.map((l) => l.box);
    assert.ok(Math.abs(A.x + A.w / 2 - 300) <= 0.5, "first pill centred");
    assert.ok(Math.abs(A.y + A.h + 5 - 210) <= 0.5, "first tail at anchor");
    const bCentred = Math.abs(B.x + B.w / 2 - 330) <= 0.5
      && Math.abs(B.y + B.h + 5 - 210) <= 0.5;
    assert.ok(!bCentred, "second pill moves");
    const tip = [B.x + B.w / 2, B.y + B.h + 5];
    assert.ok(Math.hypot(tip[0] - 330, tip[1] - 210) > 8, "moved pill gets a leader");
    const hit = A.x < B.x + B.w && B.x < A.x + A.w
      && A.y < B.y + B.h && B.y < A.y + A.h;
    assert.ok(!hit, "pills do not overlap");
  });

  it("ChatMap draws no leader for one pin, leaders for a close pair", () => {
    const solo = render(React.createElement(ChatMap, { map: {
      pins: [pin("1", 127.1, 37.4)],
      workPin: { lon: 127.0, lat: 37.35, name: "판교" },
      regions: [], tenure: "jeonse" } }));
    assert.ok(!solo.includes("<line"), "isolated pill needs no leader");
    const pair = render(React.createElement(ChatMap, { map: {
      pins: [pin("5", 127.1, 37.4), pin("6", 127.1003, 37.4),
        pin("7", 127.15, 37.42), pin("8", 127.05, 37.38)],
      regions: [], tenure: "jeonse" } }));
    assert.ok(pair.includes("<line"), "near-duplicate pills get leaders");
  });
});

describe("19g-3 workplace station keeps its dot, loses its label", () => {
  it("ChatMap names the 회사 pill but not the station", () => {
    const solo = pin("1", 127.1, 37.4, { picked: true, letter: "A",
      candidate: { ...readyCandidate("1", "집1"),
        commute: { walk: { known: true, station: "야탑", minutes: 3 },
          ride: { known: false } } } });
    const html = render(React.createElement(ChatMap, { map: {
      pins: [solo],
      workPin: { lon: 127.1, lat: 37.4005, name: "판교" },
      stations: [
        { line: "수인분당", name: "판교", lon: 127.1, lat: 37.4006 },
        // 31g: south of the pin so its label clears the taller tag.
        { line: "수인분당", name: "야탑", lon: 127.1005, lat: 37.3990 },
      ],
      regions: [], tenure: "jeonse" } }));
    assert.ok(html.includes("회사 · 판교"), "work pill still names the station");
    assert.ok(html.includes("<title>판교</title>"), "workplace dot kept");
    assert.ok(!html.includes(">판교</text>"), "no station-name label for it");
    assert.ok(html.includes(">야탑</text>"), "picked home stop still labelled");
  });
});

describe("19g-4 panel attribute", () => {
  it("chatMainPanelAttr opens only with detail or compare", () => {
    assert.equal(chatMainPanelAttr({ id: "c1" }, false), "open");
    assert.equal(chatMainPanelAttr(null, true), "open");
    assert.equal(chatMainPanelAttr(null, false), undefined);
  });

  it("ui-chat-main renders data-panel open", () => {
    const open = render(React.createElement("div",
      { className: "ui-chat-main", "data-panel": chatMainPanelAttr({ id: "c1" }, false) }));
    assert.ok(open.includes('data-panel="open"'), "attribute in render");
    const closed = render(React.createElement("div",
      { className: "ui-chat-main", "data-panel": chatMainPanelAttr(null, false) }));
    assert.ok(!closed.includes("data-panel"), "absent when the panel is shut");
  });
});

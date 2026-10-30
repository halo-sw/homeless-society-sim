// 19c: candidate rows scan — name first, map number/letter, rounded
// minutes; the full card lives in the side panel. Render checks
// (jsx-loader, renderToString) with the readyCandidate pattern of 18c.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

// .jsx loads dynamically (static imports resolve before the loader).
let React;
let renderToString;
let CandidateCard;
let CandidatesCard;
let commuteRowLine;

function readyCandidate(id, name) {
  return { id, name, kind: "오피스텔", region: "bundang", dong: "야탑동",
    lon: 127.1, lat: 37.4, build_year: 2003, scene: "st-판교",
    tenures: [{ tenure: "jeonse", median_won: 177000000,
      min_won: 170000000, max_won: 190000000, deals: 7,
      budget_fit: "all", bucket_center_m2: 30 }],
    commute: { walk: { known: true, station: "야탑", minutes: 3.8 },
      ride: { known: true, minutes: 8.5, lines: [], transfers: [],
        derived: { methodsUsed: ["estimate"] } } },
    commute_ko: "판교까지 약 12분" };
}

const NAMES = ["시그마 3", "B집", "C집", "D집", "E집", "F집"];

before(async () => {
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
  ({ CandidateCard, commuteRowLine } = await import("../src/ui/candidate-card.jsx"));
  ({ CandidatesCard } = await import("../src/ui/chat.jsx"));
});

const noop = () => {};

describe("19c candidate rows", () => {
  it("(a) name before price, no deal sub-label, no decimal minutes", () => {
    const html = renderToString(React.createElement(CandidateCard,
      { candidate: readyCandidate("c2", "시그마 3"), tenure: "jeonse",
        destName: "판교", photos: null, index: 1, picked: false,
        onLive: noop, onJeonse: noop, onDetail: noop }));
    assert.ok(html.indexOf("시그마 3") !== -1, "name renders");
    assert.ok(html.indexOf("시그마 3") < html.indexOf("전세"), "name before price");
    assert.ok(!html.includes("실거래 중간값"), "row drops the deal sub-label");
    assert.ok(!/\d+\.\d+분/.test(html), "no decimal minutes in the row");
  });

  it("(b) commuteRowLine rounds walk 3.8 + ride 8.5", () => {
    const line = commuteRowLine(readyCandidate("c2", "시그마 3"), "판교");
    assert.ok(line.text.includes("약 12분"), `total rounded: ${line.text}`);
    assert.ok(line.text.includes("걸어서 4분"), `walk rounded: ${line.text}`);
    assert.equal(line.estimate, true, "estimate ride flagged");
  });

  it("(c) picked row shows its letter, unpicked its number", () => {
    const picked = renderToString(React.createElement(CandidateCard,
      { candidate: readyCandidate("c1", "A집"), tenure: "jeonse",
        destName: "판교", photos: null, index: 0, picked: true,
        pickLetter: "A", onLive: noop, onJeonse: noop, onDetail: noop }));
    assert.ok(picked.includes(">A<"), "pick letter on the disc");
    assert.ok(picked.includes("담음 ✓"), "picked button label");
    const plain = renderToString(React.createElement(CandidateCard,
      { candidate: readyCandidate("c2", "B집"), tenure: "jeonse",
        destName: "판교", photos: null, index: 1, picked: false,
        pickLetter: null, onLive: noop, onJeonse: noop, onDetail: noop }));
    assert.ok(plain.includes(">2<"), "map pin number on the disc");
    assert.ok(plain.includes("담기"), "unpicked button label");
    assert.ok(!plain.includes("담음 ✓"), "no picked label when unpicked");
  });

  it("(d) full card: deal line, 전세 점검, disclosure, no 자세히", () => {
    const html = renderToString(React.createElement(CandidateCard,
      { candidate: readyCandidate("c1", "A집"), tenure: "jeonse",
        variant: "full", destName: "판교", photos: null,
        picked: false, onLive: noop, onJeonse: noop, onDetail: null }));
    assert.ok(html.includes("실거래 중간값"), "deal sub-label");
    assert.ok(html.includes("전세 점검"), "jeonse check action");
    assert.ok(html.includes("어떻게 계산했나요"), "how-calculated disclosure");
    assert.ok(!html.includes("자세히"), "no detail button in full");
  });

  it("(e) six candidates render six rows", () => {
    const cands = NAMES.map((n, i) => readyCandidate(`c${i + 1}`, n));
    const html = renderToString(React.createElement(CandidatesCard,
      { data: { candidates: cands, total_matching: 6, sort_note: "" },
        tenure: "jeonse", sort: "commute", onSort: noop,
        picks: ["c1", "c2"], onTogglePick: noop, onPreview3D: noop,
        onJeonse: noop, onRun: noop, onDetail: noop, onHover: noop,
        photoDeps: {}, destName: "판교" }));
    const rows = html.match(/ui-cand-row(\s|")/g) || [];
    assert.equal(rows.length, 6, "six row elements");
  });
});

// Stage 19b — the chat map looks like a real map: light basemap with
// roads, price pills, letter pins for picks, legend.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

// .jsx loads dynamically (static imports resolve before the loader).
let ChatMap = null;
before(async () => {
  ({ ChatMap } = await import("../src/ui/chatmap.jsx"));
});

import { buildChatMap, fitMapView, shortPinPrice, MAP_COLORS,
  MAP_FIT_MARGIN } from "../src/chatmap.js";

// Single-firstjob shapes, same as web/tests/chatmap-18.test.js 18d.
const NET19 = {
  lines: [{
    id: "sinbundang", name: "신분당선", color: "#D4003B",
    stops: [
      { id: "dx:판교", key: "판교", name: "판교", lon: 127.1112, lat: 37.3944 },
      { id: "dx:정자", key: "정자", name: "정자", lon: 127.1083, lat: 37.3670 },
      { id: "dx:미금", key: "미금", name: "미금", lon: 127.1128, lat: 37.3502 },
    ],
    patterns: [{ id: "pdx", stops: ["dx:판교", "dx:정자", "dx:미금"],
      chainage_km: [0, 3, 6] }],
  }],
};
const REG19 = { regions: [
  { id: "bundang", label: "성남 분당구", bbox: [127.09, 37.38, 127.13, 37.41] },
] };
const CAND19 = [
  { id: "h-a", name: "천사의도시Ⅱ오피스텔", kind: "오피스텔",
    lon: 127.1102, lat: 37.3949,
    commute: { walk: { known: true, station: "정자", minutes: 5 },
      ride: { known: true, minutes: 6 } },
    tenures: [{ tenure: "jeonse", median_won: 200000000, deals: 5 }] },
  { id: "h-b", name: "시그마3", kind: "오피스텔",
    lon: 127.1142, lat: 37.3999,
    commute: { walk: { known: true, station: "정자", minutes: 7 },
      ride: { known: true, minutes: 6 } },
    tenures: [{ tenure: "jeonse", median_won: 180000000, deals: 4 }] },
];

function map19() {
  return buildChatMap({ regions: REG19, network: NET19,
    tiles: [], green: { water: [], parks: [] },
    candidates: CAND19, picks: ["h-a", "h-b"],
    workplaceStation: "판교", tenure: "jeonse" });
}

describe("19b short pill prices", () => {
  it("177,000,000 전세 → 1억 7,700", () => {
    assert.equal(shortPinPrice(
      { tenures: [{ tenure: "jeonse", median_won: 177000000 }] }, "jeonse"), "1억 7,700");
  });
  it("95,000,000 → 9,500만", () => {
    assert.equal(shortPinPrice(
      { tenures: [{ tenure: "jeonse", median_won: 95000000 }] }, "jeonse"), "9,500만");
  });
  it("200,000,000 → 2억", () => {
    assert.equal(shortPinPrice(
      { tenures: [{ tenure: "jeonse", median_won: 200000000 }] }, "jeonse"), "2억");
  });
  it("월세 deposit 10,000,000 + monthly 600,000 → 월 60 / 1,000", () => {
    assert.equal(shortPinPrice(
      { tenures: [{ tenure: "wolse", deposit_median_won: 10000000, median_won: 600000 }] },
      "wolse"), "월 60 / 1,000");
  });
});

describe("19b roads and pick letters", () => {
  it("keeps corridor roads with cls, letters follow picks order", () => {
    const m = buildChatMap({ regions: { regions: [] }, network: { lines: [] },
      tiles: [{ roads: [
        { class: "trunk", name: "분당수서로",
          pts: [[127.06878, 37.50449], [127.07, 37.51]] },
        { class: "primary", name: "판교로",
          pts: [[127.08, 37.49], [127.09, 37.50]] },
      ] }],
      green: { water: [], parks: [] },
      candidates: [
        { id: "h-a", lon: 127.11, lat: 37.39,
          tenures: [{ tenure: "jeonse", median_won: 200000000 }] },
        { id: "h-b", lon: 127.12, lat: 37.40,
          tenures: [{ tenure: "jeonse", median_won: 180000000 }] },
      ],
      picks: ["h-b", "h-a"], workplaceStation: null, tenure: "jeonse" });
    assert.equal(m.roads.length, 2);
    assert.deepEqual(m.roads.map((r) => r.cls), ["trunk", "primary"]);
    const byId = new Map(m.pins.map((p) => [p.id, p]));
    assert.equal(byId.get("h-b").letter, "A");
    assert.equal(byId.get("h-a").letter, "B");
  });
});

describe("19b stage render", () => {
  async function html19() {
    const React = (await import("react")).default;
    const { renderToString } = await import("react-dom/server");
    return renderToString(React.createElement(ChatMap, { map: map19() }));
  }

  it("renders region names as text only, pills, no float minutes", async () => {
    const html = await html19();
    assert.ok(!html.includes('data-layer="region-box"'), "no region boxes");
    assert.ok(html.includes('data-layer="region-label"'), "region names as text");
    assert.ok(html.includes("성남 분당구"), "region name");
    assert.ok(html.includes("회사 · 판교"), "workplace pill");
    assert.ok(html.includes("1억"), "short price in a pill");
    assert.ok(!/\d+\.\d+분/.test(html), "no float minutes");
    assert.ok(!html.includes("분."), "no 분. fragment");
  });

  it("paints the light product palette", () => {
    assert.equal(MAP_COLORS.ground, "#f3f1ec");
    assert.equal(MAP_COLORS.water, "#c9dcea");
    assert.equal(MAP_COLORS.park, "#dfe9d3");
    assert.equal(MAP_COLORS.road, "#ffffff");
    assert.equal(MAP_COLORS.roadCasing, "#e2ddd3");
    assert.equal(MAP_COLORS.pinPicked, "#2f6fed");
  });
});

describe("19b fit with 19a insets", () => {
  for (const [W, H] of [[1440, 900], [390, 844]]) {
    it(`keeps every pin anchor inside the 56/24/96/24 inset at ${W}×${H}`, () => {
      const m = map19();
      const focus = [];
      if (m.workPin) focus.push(m.workPin);
      for (const p of m.pins) focus.push(p);
      assert.ok(focus.length >= 3, "workplace + two pins");
      const { toXY } = fitMapView(focus, W, H, MAP_FIT_MARGIN,
        { top: 56, right: 24, bottom: 96, left: 24 });
      for (const p of focus) {
        const [x, y] = toXY(p.lon, p.lat);
        assert.ok(x >= 24 && x <= W - 24, `x ${x} inside [24, ${W - 24}]`);
        assert.ok(y >= 56 && y <= H - 96, `y ${y} inside [56, ${H - 96}]`);
      }
    });
  }
});

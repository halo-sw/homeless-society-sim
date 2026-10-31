// Stage 31g — home pins are two-part price tags (number·area /
// price / commute minutes); clusters are count circles.
// node --test, no network.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

let React;
let renderToString;
let ChatMap;
let buildChatMap;
let tagSizePx;
let tagHeaderFor;
let tagPriceLine;
let MAP_COLORS;

before(async () => {
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
  ({ ChatMap } = await import("../src/ui/chatmap.jsx"));
  ({ buildChatMap, tagSizePx, tagHeaderFor, tagPriceLine, MAP_COLORS }
    = await import("../src/chatmap.js"));
});

// Fixtures as in tests/map-markers-31f.test.js (three spread-out
// pins, two picked as A and B), plus an area per home for the tag
// header.
const CANDS = [
  { id: "a", name: "10 Coleman Place", lon: 127.05, lat: 37.40, area_m2: 30,
    commute: { walk: { known: true, station: "판교", minutes: 5 },
      ride: { known: true, minutes: 10 } },
    tenures: [{ tenure: "jeonse", median_won: 270000000, deals: 5 }] },
  { id: "b", name: "(647)", station: "판교", kind: "오피스텔", lon: 127.12, lat: 37.46,
    area_m2: 24,
    commute: { walk: { known: true, station: "판교", minutes: 3 },
      ride: { known: true, minutes: 2 } },
    tenures: [{ tenure: "jeonse", median_won: 200000000, deals: 4 }] },
  { id: "c", name: "그린빌라", lon: 127.02, lat: 37.52, area_m2: 42,
    commute: { walk: { known: true, station: "미금", minutes: 7 } },
    tenures: [{ tenure: "jeonse", median_won: 150000000, deals: 2 }] },
];

function testMap(picks = ["a"]) {
  return buildChatMap({
    regions: { regions: [
      { id: "bd", label: "성남시 분당구", bbox: [127.06, 37.43, 127.10, 37.49] },
    ] },
    network: null, tiles: [], green: { water: [], parks: [] },
    candidates: CANDS, picks,
    workplaceStation: null,
    workPlace: { name: "판교", lon: 127.08, lat: 37.44 },
    tenure: "jeonse",
  });
}

describe("31g tagSizePx", () => {
  it("a 3-line pin is taller than a pin without a commute", () => {
    const map = testMap();
    const pin = map.pins.find((p) => p.id === "a");
    const withCommute = tagSizePx(pin, "jeonse");
    const without = tagSizePx({ ...pin, commuteMin: null }, "jeonse");
    assert.ok(withCommute.h > without.h,
      `taller with commute: ${withCommute.h} vs ${without.h}`);
  });

  it("width is at least 64 px", () => {
    const map = testMap();
    for (const pin of map.pins) {
      assert.ok(tagSizePx(pin, "jeonse").w >= 64, `pin ${pin.id} wide enough`);
    }
    assert.ok(tagSizePx({ n: 9, candidate: null, commuteMin: null }, "jeonse").w >= 64,
      "empty pin still 64");
  });

  it("a longer price gives a wider tag", () => {
    const cheap = { n: 1, commuteMin: null,
      candidate: { tenures: [{ tenure: "jeonse", median_won: 100000000 }] } };
    const dear = { n: 2, commuteMin: null,
      candidate: { tenures: [{ tenure: "jeonse", median_won: 958000000 }] } };
    assert.ok(tagSizePx(dear, "jeonse").w > tagSizePx(cheap, "jeonse").w,
      "wider for the longer price");
  });

  it("USD pins keep the dollar price", () => {
    const pin = { n: 1, commuteMin: null,
      candidate: { currency: "USD",
        tenures: [{ tenure: "monthly", median_won: 4261, currency: "USD" }] } };
    assert.ok(tagPriceLine(pin.candidate, "monthly").startsWith("$"),
      tagPriceLine(pin.candidate, "monthly"));
  });
});

describe("31g home tags in SSR ChatMap", () => {
  it("each tag renders the header, the tenure price and the commute", () => {
    const html = renderToString(React.createElement(ChatMap, { map: testMap() }));
    assert.ok(html.includes("A · 30㎡"), "picked header uses the letter");
    assert.ok(html.includes("2 · 24㎡"), "second header");
    assert.ok(html.includes("3 · 42㎡"), "third header");
    assert.ok(html.includes("전 2억 7,000"), "jeonse price with the tenure syllable");
    assert.ok(html.includes("출근 15분"), "commute minutes");
  });

  it("the picked header fill is pinA", () => {
    const html = renderToString(React.createElement(ChatMap, { map: testMap() }));
    assert.ok(html.includes(`fill="${MAP_COLORS.pinA}"`), "A header fill");
  });

  it("tags are still buttons with aria-labels", () => {
    const html = renderToString(React.createElement(ChatMap, { map: testMap() }));
    const groups = html.match(/<g[^>]*data-layer="home-pin"[^>]*>/g) || [];
    assert.equal(groups.length, 3, "three home tags");
    for (const g of groups) {
      assert.ok(g.includes('role="button"'), "role button");
      assert.ok(g.includes('tabindex="0"'), "tabindex");
    }
    const labels = [...html.matchAll(/aria-label="([1-3]번 후보[^"]*)"/g)].map((m) => m[1]);
    assert.equal(labels.length, 3, "three tag labels");
  });

  it("a pin without a commute renders no commute line", () => {
    const map = buildChatMap({
      regions: { regions: [] },
      network: null, tiles: [], green: { water: [], parks: [] },
      candidates: [{ id: "x", name: "먼 집", lon: 127.05, lat: 37.40, area_m2: 30,
        tenures: [{ tenure: "jeonse", median_won: 270000000, deals: 5 }] }],
      picks: [], workplaceStation: null, workPlace: null, tenure: "jeonse",
    });
    assert.equal(tagHeaderFor(map.pins[0]), "1 · 30㎡");
    const html = renderToString(React.createElement(ChatMap, { map }));
    assert.ok(!/출근 \d+분/.test(html), "no commute line");
  });
});

describe("31g cluster circle in SSR ChatMap", () => {
  it("a crowded map folds pins into a count circle with no +", async () => {
    const crowded = Array.from({ length: 30 }, (_, i) => ({
      id: `h-${i}`, name: `집${i}`, lon: 127.11, lat: 37.394,
      tenures: [{ tenure: "jeonse", median_won: 200000000, deals: 5 }],
    }));
    const map = buildChatMap({
      regions: { regions: [
        { id: "wide", label: "넓은 지역", bbox: [127.0, 37.35, 127.14, 37.55] },
      ] },
      network: null, tiles: [], green: { water: [], parks: [] },
      candidates: [
        ...crowded,
        { id: "far-s", name: "먼남집", lon: 127.01, lat: 37.36,
          tenures: [{ tenure: "jeonse", median_won: 150000000, deals: 5 }] },
        { id: "far-n", name: "먼북집", lon: 127.13, lat: 37.54,
          tenures: [{ tenure: "jeonse", median_won: 160000000, deals: 5 }] },
      ],
      picks: [], workplaceStation: null, tenure: "jeonse",
    });
    const html = renderToString(React.createElement(ChatMap, { map }));
    const groups = html.match(/<g[^>]*data-layer="cluster"[^>]*>/g) || [];
    assert.ok(groups.length >= 1, "at least one cluster");
    for (const g of groups) {
      assert.ok(g.includes('role="button"'), "cluster role button");
      assert.ok(/aria-label="가까운 후보 \d+곳 펼치기"/.test(g), "cluster aria-label");
    }
    assert.ok(html.includes("<circle"), "count circle renders");
    const count = html.match(/aria-label="가까운 후보 (\d+)곳 펼치기"/)[1];
    assert.ok(html.includes(`>${count}<`), "count text renders");
    assert.ok(!html.includes(`>+${count}<`), "no + on the count");
  });
});

// Stage 31f — map markers read as what they are: a home pin is a
// button opening a pin card, A and B have their own colours
// everywhere, labels are not buttons.
// node --test, no network.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

register("./jsx-loader.mjs", import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const chatSrc = readFileSync(join(HERE, "..", "src", "ui", "chat.jsx"), "utf8");
const css = readFileSync(join(HERE, "..", "src", "ui", "ui.css"), "utf8");

let React;
let renderToString;
let ChatMap;
let MAP_COLORS;
let buildChatMap;
let pinCardModel;
let displayNameFor;

before(async () => {
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
  ({ ChatMap } = await import("../src/ui/chatmap.jsx"));
  ({ MAP_COLORS, buildChatMap } = await import("../src/chatmap.js"));
  ({ pinCardModel } = await import("../src/ui/candidate-card.jsx"));
  ({ displayNameFor } = await import("../src/homes.js"));
});

// Fixtures as in tests/map-tray-31b.test.js: three spread-out pins
// (no clusters), two picked as A and B, plus a workplace and a region.
const CANDS = [
  { id: "a", name: "10 Coleman Place", lon: 127.05, lat: 37.40,
    commute: { walk: { known: true, station: "판교", minutes: 5 },
      ride: { known: true, minutes: 10 } },
    tenures: [{ tenure: "jeonse", median_won: 270000000, deals: 5 }] },
  { id: "b", name: "(647)", station: "판교", kind: "오피스텔", lon: 127.12, lat: 37.46,
    commute: { walk: { known: true, station: "판교", minutes: 3 },
      ride: { known: true, minutes: 2 } },
    tenures: [{ tenure: "jeonse", median_won: 200000000, deals: 4 }] },
  { id: "c", name: "그린빌라", lon: 127.02, lat: 37.52,
    commute: { walk: { known: true, station: "미금", minutes: 7 } },
    tenures: [{ tenure: "jeonse", median_won: 150000000, deals: 2 }] },
];

function testMap(picks = ["a", "b"]) {
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

function mapHtml(picks) {
  return renderToString(React.createElement(ChatMap, { map: testMap(picks) }));
}

describe("31f MAP_COLORS", () => {
  it("A and B have their own colours; hover is not blue", () => {
    assert.equal(MAP_COLORS.pinA, "#b3541e");
    assert.equal(MAP_COLORS.pinB, "#2f6fed");
    assert.notEqual(MAP_COLORS.pinHi, MAP_COLORS.pinB);
  });
});

describe("31f home pins are buttons", () => {
  it("each home pill group has role, tabindex and an aria-label", () => {
    const html = mapHtml();
    const groups = html.match(/<g[^>]*data-layer="home-pin"[^>]*>/g) || [];
    assert.equal(groups.length, 3, "three home pins");
    for (const g of groups) {
      assert.ok(g.includes('role="button"'), "role button");
      assert.ok(g.includes('tabindex="0"'), "tabindex");
    }
    const labels = [...html.matchAll(/aria-label="([1-3]번 후보[^"]*)"/g)].map((m) => m[1]);
    assert.equal(labels.length, 3, "three pin labels");
    assert.ok(labels.some((l) => l.startsWith("1번 후보")), "1번 후보");
    assert.ok(labels.some((l) => l.startsWith("2번 후보")), "2번 후보");
    assert.ok(labels.some((l) => l.startsWith("3번 후보")), "3번 후보");
  });

  it("the A pill is orange and the B pill is blue", () => {
    const html = mapHtml();
    assert.ok(html.includes('fill="#b3541e"'), "A fill");
    assert.ok(html.includes('fill="#2f6fed"'), "B fill");
  });

  it("region labels are not buttons", () => {
    const html = mapHtml();
    const labels = html.match(/<text[^>]*data-layer="region-label"[^>]*>/g) || [];
    assert.ok(labels.length >= 1, "region label renders");
    for (const l of labels) {
      assert.ok(!l.includes('role="button"'), "no button role");
      assert.ok(!l.includes("pointer"), "no pointer cursor");
    }
  });

  it("the work marker is a rounded rect, not a pill", () => {
    const html = mapHtml();
    const m = html.match(/data-layer="work-marker"[\s\S]*?rx="([^"]*)"/);
    assert.ok(m, "work marker rect");
    assert.notEqual(m[1], "999", "not the pill radius");
  });
});

describe("31f pinCardModel", () => {
  it("an unpicked pin with room can be picked", () => {
    const map = testMap(["a"]);
    const pin = map.pins.find((p) => p.id === "c");
    const model = pinCardModel(pin, { tenure: "jeonse", picks: ["a"] });
    assert.equal(model.picked, false);
    assert.equal(model.canPick, true);
  });

  it("a third pin cannot be picked when 2 are picked", () => {
    const map = testMap(["a", "b"]);
    const pin = map.pins.find((p) => p.id === "c");
    const model = pinCardModel(pin, { tenure: "jeonse", picks: ["a", "b"] });
    assert.equal(model.picked, false);
    assert.equal(model.canPick, false);
  });

  it("a picked pin reports picked", () => {
    const map = testMap(["a", "b"]);
    const pin = map.pins.find((p) => p.id === "a");
    const model = pinCardModel(pin, { tenure: "jeonse", picks: ["a", "b"] });
    assert.equal(model.picked, true);
    assert.equal(model.canPick, true);
  });

  it("the title uses displayNameFor and the card lines match", () => {
    const map = testMap(["a", "b"]);
    const pin = map.pins.find((p) => p.id === "b");
    const model = pinCardModel(pin, { tenure: "jeonse", picks: ["a", "b"] });
    assert.equal(model.title, displayNameFor(pin.candidate));
    assert.equal(model.title, "판교역 근처 오피스텔 (647)");
    assert.ok(model.price.startsWith("전세"), `price line: ${model.price}`);
    assert.ok(model.commute.includes("총 5분"), `commute line: ${model.commute}`);
  });
});

describe("31f region filter is gone", () => {
  it("chat.jsx has no orbFilter and no region-only toast", () => {
    assert.ok(!chatSrc.includes("orbFilter"), "no orbFilter state");
    assert.ok(!chatSrc.includes("지역만 보기"), "no region-only toast");
  });
});

describe("31f disc colours in CSS", () => {
  it(".ui-pick-disc A/B use the home tokens", () => {
    assert.ok(/\.ui-pick-disc\[data-home="A"\][^}]*--ds-home-a/.test(css), "A disc");
    assert.ok(/\.ui-pick-disc\[data-home="B"\][^}]*--ds-home-b/.test(css), "B disc");
  });
});

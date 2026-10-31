// Stage 31m — phone map polish: compact tags before folding,
// measured chrome, a one-line credit and a docked pin card.
// node --test, no network.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

register("./jsx-loader.mjs", import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const chatmapSrc = readFileSync(join(HERE, "..", "src", "ui", "chatmap.jsx"), "utf8");
const css = readFileSync(join(HERE, "..", "src", "ui", "ui.css"), "utf8");

let React;
let renderToString;
let ChatMap;
let buildChatMap;
let layoutMapPills;
let tagSizePx;

before(async () => {
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
  ({ ChatMap } = await import("../src/ui/chatmap.jsx"));
  ({ buildChatMap, layoutMapPills, tagSizePx } = await import("../src/chatmap.js"));
});

const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w
  && a.y < b.y + b.h && b.y < a.y + a.h;

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

describe("31m compact tags before folding", () => {
  // A 40 px free band across a 390 × 500 phone stage: full 56 px
  // tags fit nowhere, compact 38 px tags do.
  const obstacles = [
    { x: 0, y: 0, w: 390, h: 230 },
    { x: 0, y: 270, w: 390, h: 230 },
  ];
  const items = Array.from({ length: 6 }, (_, i) => ({
    id: `t${i}`, kind: "pill",
    x: 180 + i * 6, y: 250,
    w: 90, h: 56, alt: { w: 90, h: 38 }, rank: 2,
  }));

  it("lays tags compact with no overlaps and no obstacle hits", () => {
    const laid = layoutMapPills(items, 390, 500, obstacles);
    const boxes = laid.filter((l) => l.kind !== "cluster");
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        assert.ok(!hit(boxes[i].box, boxes[j].box),
          `tags ${boxes[i].id} and ${boxes[j].id} overlap`);
      }
      for (const o of obstacles) {
        assert.ok(!hit(boxes[i].box, o), `tag ${boxes[i].id} covers chrome`);
      }
    }
  });

  it("accounts for every id and goes compact before folding", () => {
    const laid = layoutMapPills(items, 390, 500, obstacles);
    const folded = new Set();
    for (const l of laid) {
      if (l.kind === "cluster") for (const mb of l.members || []) folded.add(mb.id);
    }
    const placed = new Set(laid.filter((l) => l.kind !== "cluster").map((l) => l.id));
    for (const p of items) {
      assert.ok(placed.has(p.id) || folded.has(p.id), p.id);
    }
    assert.ok(laid.some((l) => l.kind !== "cluster" && l.short === true),
      "at least one tag lays compact before anything folds");
  });
});

describe("31m forced A/B still place with no room", () => {
  it("two rank-1 items are laid even when the stage is covered", () => {
    const laid = layoutMapPills([
      { id: "a", kind: "pill", x: 100, y: 100, w: 90, h: 56, rank: 1 },
      { id: "b", kind: "pill", x: 104, y: 102, w: 90, h: 56, rank: 1 },
    ], 200, 200, [{ x: 0, y: 0, w: 200, h: 200 }]);
    const byId = new Map(laid.map((l) => [l.id, l]));
    assert.ok(byId.has("a") && byId.get("a").kind !== "cluster", "A placed");
    assert.ok(byId.has("b") && byId.get("b").kind !== "cluster", "B placed");
  });
});

describe("31m tagSizePx short form", () => {
  it("is shorter than the full tag when the pin has a commute", () => {
    const map = testMap();
    const pin = map.pins.find((p) => p.id === "a");
    assert.ok(pin.commuteMin !== null && pin.commuteMin !== undefined, "fixture commutes");
    const full = tagSizePx(pin, "jeonse", "ko");
    const short = tagSizePx(pin, "jeonse", "ko", { short: true });
    assert.ok(short.h < full.h, `compact ${short.h} < full ${full.h}`);
    assert.ok(short.w <= full.w, `compact no wider: ${short.w} <= ${full.w}`);
  });
});

describe("31m SSR credit", () => {
  it("renders a short-text button and the desktop full text", () => {
    const html = renderToString(React.createElement(ChatMap, { map: testMap() }));
    const btn = html.match(/<button[^>]*aria-expanded="false"[^>]*>.*?<\/button>/s);
    assert.ok(btn, "credit button with aria-expanded=false");
    assert.ok(btn[0].includes("© VWorld · © OpenStreetMap"), "short text in the button");
    assert.ok(html.includes("지도 © 국토교통부 공간정보 오픈플랫폼(VWorld) · © OpenStreetMap contributors"),
      "desktop full text present");
    assert.ok(html.includes("data-no-i18n"), "credit strings skip the DOM translator");
  });

  it("builds the EN full string for the current language", () => {
    assert.ok(chatmapSrc.includes(
      "Map © MOLIT Spatial Information Open Platform (VWorld) · © OpenStreetMap contributors"),
      "EN full credit string");
  });
});

describe("31m SSR docked pin card", () => {
  it("marks the open card docked for phones", () => {
    const map = testMap();
    const html = renderToString(React.createElement(ChatMap,
      { map, initialSelectedId: map.pins[0].id }));
    assert.ok(html.includes("ui-chatmap-pincard"), "pin card renders");
    assert.ok(/ui-chatmap-pincard[^"]*is-docked/.test(html), "card carries the docked mark");
  });
});

describe("31m phone CSS", () => {
  it("docks the card above the tray inside the 480 px query", () => {
    const blocks = css.split("@media (max-width: 480px)");
    assert.ok(blocks.length > 1, "phone media query present");
    const after = blocks.slice(1).join("\n");
    assert.ok(after.includes(".ui-chatmap-pincard.is-docked"), "docked card rule");
    assert.ok(after.includes("--ui-chat-tray-h"), "docked card clears the tray");
  });

  it("never ellipsizes", () => {
    assert.ok(!css.includes("ellipsis"), "no ellipsis in ui.css");
    assert.ok(!chatmapSrc.includes("ellipsis"), "no ellipsis in chatmap.jsx");
  });
});

// Stage 31k — map tags stay clickable with a mouse: overlays only
// catch clicks on their own controls, and hover never re-orders the
// tag DOM (the highlighted tag is a separate non-interactive copy in
// a top layer). Belt and braces: the tag opens its card on its own
// pointer-up when the pointer went down on the same pin.
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

before(async () => {
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
  ({ ChatMap } = await import("../src/ui/chatmap.jsx"));
  ({ buildChatMap } = await import("../src/chatmap.js"));
});

// Three spread-out pins (as in 31g) so every pin renders its own tag.
function threeMap() {
  return buildChatMap({
    regions: { regions: [] }, network: null, tiles: [], green: { water: [], parks: [] },
    candidates: [
      { id: "a", name: "열정 하우스", lon: 127.05, lat: 37.40, area_m2: 30,
        tenures: [{ tenure: "jeonse", median_won: 270000000, deals: 5 }] },
      { id: "b", name: "희망 하우스", lon: 127.12, lat: 37.46, area_m2: 24,
        tenures: [{ tenure: "jeonse", median_won: 200000000, deals: 4 }] },
      { id: "c", name: "도전 하우스", lon: 127.02, lat: 37.52, area_m2: 42,
        tenures: [{ tenure: "jeonse", median_won: 150000000, deals: 2 }] },
    ],
    picks: [], workplaceStation: null,
    workPlace: { name: "판교", lon: 127.08, lat: 37.44 }, tenure: "jeonse",
  });
}

function pinLabels(html) {
  return [...html.matchAll(/data-layer="home-pin"[^>]*aria-label="([^"]*)"/g)]
    .map((m) => m[1]);
}

describe("31k stable tag order under hover", () => {
  it("renders home tags in the same order with and without cardHi", () => {
    const map = threeMap();
    const hiId = map.pins[2].id;
    const plain = renderToString(React.createElement(ChatMap, { map }));
    const hi = renderToString(
      React.createElement(ChatMap, { map, cardHi: `home:${hiId}` }));
    const plainLabels = pinLabels(plain);
    const hiLabels = pinLabels(hi);
    assert.equal(plainLabels.length, 3, "three tags without highlight");
    assert.equal(hiLabels.length, 3, "three tags with highlight");
    assert.deepEqual(hiLabels, plainLabels, "hover highlight never re-orders tags");
  });

  it("draws the highlight as one extra non-interactive top-layer copy", () => {
    const map = threeMap();
    const hiId = map.pins[2].id;
    const hi = renderToString(
      React.createElement(ChatMap, { map, cardHi: `home:${hiId}` }));
    const tops = hi.match(/<g[^>]*data-layer="home-pin-top"[^>]*>/g) || [];
    assert.equal(tops.length, 1, "one top-layer highlight copy");
    assert.ok(tops[0].includes('aria-hidden="true"'), "hidden from assistive tech");
    assert.ok(!tops[0].includes("role="), "never a button");
    assert.ok(!tops[0].includes("aria-label"), "carries no pin label");
    const plain = renderToString(React.createElement(ChatMap, { map }));
    assert.ok(!plain.includes("home-pin-top"), "no top copy without a highlight");
  });

  it("no tag list is re-sorted by hover in source", () => {
    assert.ok(!/sort\(\(a, b\) =>\s*\(\(cardHi ===/.test(chatmapSrc),
      "no cardHi-driven sort remains");
    assert.ok(!chatmapSrc.includes("pillOrder.map"), "no hover-sorted pill pass remains");
  });
});

describe("31k overlays only catch clicks on their own controls", () => {
  it(".ui-chatmap-side is inert; its buttons are live", () => {
    const side = css.match(/\.ui-chatmap-side\s*\{[^}]*\}/);
    assert.ok(side, "side rule present");
    assert.ok(side[0].includes("pointer-events: none"), "side column is click-through");
    assert.ok(/\.ui-chatmap-side[^{]*button[^{]*\{[^}]*pointer-events:\s*auto[^}]*\}/s.test(css),
      "side buttons get pointer-events: auto");
  });

  it("the filter-row wrapper is inert; its chips are live", () => {
    const row = css.match(/\.ui-chatmap-filters\s*\{[^}]*\}/);
    assert.ok(row, "filter row rule present");
    assert.ok(row[0].includes("pointer-events: none"), "filter row is click-through");
    assert.ok(/\.ui-chatmap-filters[^{]*\.ui-chatmap-chip\s*\{[^}]*pointer-events:\s*auto[^}]*\}/s.test(css),
      "filter chips get pointer-events: auto");
  });
});

describe("31k tag pointer-up opens the card", () => {
  it("the tag <g> handles onPointerUp within the drag threshold", () => {
    const at = chatmapSrc.indexOf("const pinButtonProps");
    assert.ok(at >= 0, "pinButtonProps present");
    const body = chatmapSrc.slice(at, at + 1500);
    assert.ok(body.includes("onPointerDown"), "records the pointer-down pin");
    assert.ok(body.includes("onPointerUp"), "opens on pointer-up");
    assert.ok(body.includes("pastDragThreshold"), "pointer-up checks the drag threshold");
    assert.ok(body.includes("onClick"), "onClick stays for keyboard and assistive tech");
  });
});

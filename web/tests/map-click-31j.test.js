// Stage 31j — map follow-ups: mouse clicks open tag cards, English
// tags, tags avoid the work marker, compact phone tags.
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

let React;
let renderToString;
let ChatMap;
let pinAriaLabel;
let pastDragThreshold;
let buildChatMap;
let tagLines;
let tagSizePx;
let tagFontPx;
let tagHeaderFor;
let tagPriceLine;
let tagCommuteLine;
let layoutMapPills;

before(async () => {
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
  ({ ChatMap, pinAriaLabel, pastDragThreshold } = await import("../src/ui/chatmap.jsx"));
  ({ buildChatMap, tagLines, tagSizePx, tagFontPx, tagHeaderFor,
    tagPriceLine, tagCommuteLine, layoutMapPills } = await import("../src/chatmap.js"));
});

const jeonse = (won, extra) => ({ tenure: "jeonse", median_won: won, deals: 5, ...(extra || {}) });
const pin = (n, candidate, commuteMin) => ({ n, id: `p${n}`, lon: 127.05, lat: 37.4,
  picked: false, letter: null, commuteMin, candidate });

describe("31j pointer capture waits for a drag", () => {
  it("onSvgPointerDown records only — no setPointerCapture", () => {
    const down = chatmapSrc.indexOf("const onSvgPointerDown");
    const move = chatmapSrc.indexOf("const onSvgPointerMove");
    assert.ok(down >= 0 && move > down, "both handlers present");
    assert.ok(!chatmapSrc.slice(down, move).includes("setPointerCapture"),
      "no capture on pointerdown");
    assert.ok(chatmapSrc.slice(move, move + 1200).includes("setPointerCapture"),
      "capture happens in the move handler");
  });

  it("pastDragThreshold keeps clicks inside 4 px", () => {
    assert.equal(pastDragThreshold(0, 0, 2, 2), false, "2,2 is a click");
    assert.equal(pastDragThreshold(0, 0, 0, 0), false, "no movement");
    assert.equal(pastDragThreshold(0, 0, 5, 0), true, "5 px is a drag");
    assert.equal(pastDragThreshold(0, 0, 3, 4), true, "3-4-5 is a drag");
  });
});

describe("31j tag lines per language", () => {
  it("KO: header, tenure price, commute", () => {
    const p = pin(1, { area_m2: 30, tenures: [jeonse(270000000)] }, 5);
    const lines = tagLines(p, { tenure: "jeonse" });
    assert.equal(lines.header, "1 · 30㎡");
    assert.ok(lines.price.startsWith("전"), `ko price: ${lines.price}`);
    assert.equal(lines.commute, "출근 5분");
  });

  it("EN: header uses m², price uses initials, commute is short", () => {
    const p = pin(1, { area_m2: 30, tenures: [jeonse(270000000)] }, 5);
    const lines = tagLines(p, { tenure: "jeonse", lang: "en" });
    assert.equal(lines.header, "1 · 30 m²");
    assert.ok(lines.price.startsWith("J "), `en jeonse price: ${lines.price}`);
    assert.equal(lines.commute, "5 min");
    const w = pin(2, { tenures: [{ tenure: "wolse", median_won: 600000,
      deposit_median_won: 10000000, deals: 3 }] }, null);
    assert.ok(tagLines(w, { tenure: "wolse", lang: "en" }).price.startsWith("M "),
      tagLines(w, { tenure: "wolse", lang: "en" }).price);
    const s = pin(3, { tenures: [{ tenure: "sale", median_won: 320000000, deals: 2 }] }, null);
    assert.ok(tagLines(s, { tenure: "sale", lang: "en" }).price.startsWith("S "),
      tagLines(s, { tenure: "sale", lang: "en" }).price);
  });

  it("a missing or 0 area reads as just the number", () => {
    assert.equal(tagHeaderFor(pin(3, { tenures: [jeonse(1)] }, null), "en"), "3");
    assert.equal(tagHeaderFor(pin(3, { area_m2: 0, tenures: [jeonse(1)] }, null), "en"), "3");
    assert.ok(!tagHeaderFor(pin(3, { area_m2: 0, tenures: [jeonse(1)] }, null), "en").includes("0m²"));
    assert.equal(tagHeaderFor(pin(3, { area_m2: 0, tenures: [jeonse(1)] }, null)), "3");
  });

  it("USD prices stay in dollars in both languages", () => {
    const c = { currency: "USD", tenures: [{ tenure: "monthly", median_won: 4261, currency: "USD" }] };
    for (const lang of [undefined, "en"]) {
      const price = tagPriceLine(c, "monthly", lang);
      assert.ok(price.startsWith("$"), `${lang || "ko"} usd: ${price}`);
    }
  });

  it("aria-labels: KO stays, EN reads Candidate", () => {
    const p = pin(1, { name: "한 집", tenures: [jeonse(270000000)] }, 5);
    const ko = pinAriaLabel(p, tagPriceLine(p.candidate, "jeonse"));
    assert.ok(ko.startsWith("1번 후보"), ko);
    assert.ok(ko.includes("출근 5분"), ko);
    const en = pinAriaLabel(p, tagPriceLine(p.candidate, "jeonse", "en"), "en");
    assert.ok(en.startsWith("Candidate 1:"), en);
    assert.ok(en.includes("5 min commute"), en);
    assert.ok(!en.includes("번 후보"), en);
  });
});

describe("31j tag measurement follows the language", () => {
  it("the EN commute line fits the measured tag", () => {
    const p = pin(1, { area_m2: 30, tenures: [jeonse(270000000)] }, 38);
    const sz = tagSizePx(p, "jeonse", "en");
    const lines = tagLines(p, { tenure: "jeonse", lang: "en" });
    // EN commute (`38 min`) is ASCII-narrow: it must not dominate.
    const ko = tagSizePx(p, "jeonse");
    assert.ok(sz.w <= ko.w, `en ${sz.w} fits ko measure ${ko.w}`);
    assert.ok(lines.commute.length <= String(lines.header).length + 4, lines.commute);
  });

  it("compact phone tags use the small type sizes", () => {
    assert.deepEqual(tagFontPx({ compact: true }),
      { header: 10, price: 13, commute: 11, pad: 12, minW: 56, padX: 6 });
    assert.deepEqual(tagFontPx(),
      { header: 11, price: 14, commute: 12, pad: 16, minW: 64, padX: 8 });
    const p = pin(1, { area_m2: 30, tenures: [jeonse(270000000)] }, 5);
    assert.ok(tagSizePx(p, "jeonse", "ko", { compact: true }).w >= 56, "56 px minimum");
  });

  it("SSR tags carry data-no-i18n", () => {
    const map = buildChatMap({
      regions: { regions: [] }, network: null, tiles: [], green: { water: [], parks: [] },
      candidates: [{ id: "a", name: "집", lon: 127.05, lat: 37.4, area_m2: 30,
        tenures: [jeonse(270000000)] }],
      picks: [], workplaceStation: null, workPlace: null, tenure: "jeonse",
    });
    map.pins[0].commuteMin = 5;
    const html = renderToString(React.createElement(ChatMap, { map }));
    assert.ok(html.includes("data-no-i18n"), "tag text skips the DOM translator");
  });
});

describe("31j layout treats boxes as occupied", () => {
  const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w
    && a.y < b.y + b.h && b.y < a.y + a.h;

  it("a tag overlapping the work box moves away with a leader", () => {
    // Natural home slot centred above (320, 210): x 280..360, y 140..204.
    const work = { x: 280, y: 140, w: 80, h: 64 };
    const laid = layoutMapPills(
      [{ id: "p1", kind: "pill", x: 320, y: 210, w: 80, h: 64, rank: 2 }],
      640, 420, [work]);
    assert.ok(!hit(laid[0].box, work), `tag avoids work: ${JSON.stringify(laid[0].box)}`);
    assert.ok(laid[0].leader, "a moved tag keeps its leader line");
  });

  it("rank 0 still wins its home slot; invalid obstacles are ignored", () => {
    const laid = layoutMapPills([
      { id: "work", kind: "work", x: 320, y: 210, w: 80, h: 26, rank: 0 },
      { id: "p1", kind: "pill", x: 320, y: 210, w: 80, h: 64, rank: 2 },
    ], 640, 420, [null, { x: 0, y: 0, w: -5, h: 10 }]);
    const work = laid.find((l) => l.id === "work");
    assert.equal(work.leader, null, "work keeps its home slot");
    assert.ok(Math.abs(work.box.x + work.box.w / 2 - 320) < 1, "work centred");
  });
});

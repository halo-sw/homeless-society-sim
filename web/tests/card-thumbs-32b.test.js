// Stage 32b: candidate cards — one-line amount price, short commute line,
// clean wrapping; row thumbnails go 3D miniature → street photo →
// building silhouette (no aerial in the row).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

register("./jsx-loader.mjs", import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));

let React;
let renderToString;
let CandidateCard;
let tenurePriceLine;
let tenurePriceJoined;
let commuteRowLine;
let pinCardModel;
let thumbKindFor;
let streetPhotoFor;
let SilhouetteThumb;
let modelCreditFor;

function usCandidate() {
  return { id: "u1", name: "Apartments on South Perimeter Road",
    kind: "apartment", country: "US", currency: "USD",
    lon: -122.148, lat: 37.484, scene: "us-menlo", build_year: 1990,
    price: { zip: "94025", source: "zillow_zori_zip", month: "2026-09" },
    tenures: [{ tenure: "wolse", median_won: 4261, min_won: 4261,
      max_won: 4261, deals: 0, budget_fit: "all", bucket_center_m2: null }],
    commute: { work: { name: "Meta HQ", mode: "bike",
      bike_minutes: 12, walk_minutes: 39 } } };
}

function jeonseCandidate() {
  return { id: "k1", name: "시그마 3", kind: "오피스텔",
    lon: 127.1, lat: 37.4, build_year: 2003, scene: "st-판교",
    tenures: [{ tenure: "jeonse", median_won: 260000000,
      min_won: 250000000, max_won: 270000000, deals: 9,
      budget_fit: "all", bucket_center_m2: 60 }],
    commute: { walk: { known: true, station: "야탑", minutes: 4 },
      ride: { known: false } } };
}

const textOf = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const divText = (html, cls) => {
  const m = html.match(new RegExp(`<div class="${cls}[^"]*"[^>]*>([\\s\\S]*?)<\\/div>`));
  return m ? m[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() : null;
};

before(async () => {
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
  ({ CandidateCard, tenurePriceLine, tenurePriceJoined, commuteRowLine,
    pinCardModel, thumbKindFor, streetPhotoFor, SilhouetteThumb,
    modelCreditFor } = await import("../src/ui/candidate-card.jsx"));
});

const noop = () => {};

describe("32b tenurePriceLine split", () => {
  it("USD: price is the amount, basis carries the ZIP source", () => {
    const p = tenurePriceLine(usCandidate(), "wolse");
    assert.ok(!p.price.includes("ZIP"), `amount only: ${p.price}`);
    assert.ok(p.price.includes("$4,261"), `dollar amount: ${p.price}`);
    assert.ok(p.basis.includes("ZIP 94025"), `basis: ${p.basis}`);
  });

  it("KR jeonse: price is the amount, basis is the deal line", () => {
    const p = tenurePriceLine(jeonseCandidate(), "jeonse");
    assert.ok(p.price.startsWith("전세"), `amount: ${p.price}`);
    assert.ok(!p.price.includes("실거래"), `no basis in price: ${p.price}`);
    assert.match(p.basis, /실거래 중간값 · 9건/);
  });

  it("the joined helper equals the old string for both", () => {
    const us = tenurePriceLine(usCandidate(), "wolse");
    assert.equal(tenurePriceJoined(usCandidate(), "wolse"),
      `${us.price} · ${us.basis}`);
    assert.equal(tenurePriceJoined(usCandidate(), "wolse"),
      "월세 월 $4,261 · ZIP 94025 추정 (Zillow)");
    const kr = tenurePriceLine(jeonseCandidate(), "jeonse");
    assert.equal(tenurePriceJoined(jeonseCandidate(), "jeonse"),
      `${kr.price} · ${kr.basis}`);
  });

  it("the pin card keeps the joined text", () => {
    const model = pinCardModel({ id: "u1", candidate: usCandidate() },
      { tenure: "wolse", picks: [] });
    assert.equal(model.price, tenurePriceJoined(usCandidate(), "wolse"));
  });
});

describe("32b SSR row card (US, scene, estimated bike commute)", () => {
  function html() {
    return renderToString(React.createElement(CandidateCard,
      { candidate: usCandidate(), tenure: "wolse", destName: "Meta HQ",
        photos: null, index: 0, picked: false,
        onLive: noop, onJeonse: noop, onDetail: noop }));
  }

  it("the price element shows no ZIP", () => {
    const price = divText(html(), "ui-cand-row-price");
    assert.ok(price, "price element renders");
    assert.ok(!price.includes("ZIP"), `price: ${price}`);
  });

  it("the commute line drops the work name, one 추정 badge, full sentence in title", () => {
    const h = html();
    const commute = divText(h, "ui-cand-row-commute");
    assert.ok(commute, "commute element renders");
    assert.ok(!commute.includes("Meta HQ"), `commute: ${commute}`);
    assert.equal((h.match(/>추정</g) || []).length, 1, "exactly one 추정 badge");
    assert.ok(!textOf(h).includes("가정 속도"), "no 가정 속도 in visible text");
    assert.ok(!textOf(h).includes("속도 가정"), "no 속도 가정 in visible text");
    assert.equal((h.match(/가정 속도/g) || []).length, 1, "가정 속도 only in title");
    assert.ok(h.includes('title="Meta HQ까지 자전거 12분 · 걷기 39분 · 추정 (가정 속도)"'),
      "full sentence in the title");
  });

  it("commuteRowLine shortens a matching work name and keeps the title", () => {
    const line = commuteRowLine(usCandidate(), "Meta HQ");
    assert.ok(!line.text.includes("Meta HQ"), line.text);
    assert.equal(line.text, "자전거 12분 · 걷기 39분");
    assert.equal(line.estimate, true);
    assert.ok(line.title.includes("Meta HQ"), line.title);
  });

  it("the 3D thumb carries our model credit", () => {
    assert.equal(modelCreditFor(usCandidate()), "우리 자료로 만든 모형 (OSM)");
    assert.equal(modelCreditFor(jeonseCandidate()),
      "우리 자료로 만든 모형 (GIS건물통합정보·OSM)");
    assert.ok(html().includes('title="우리 자료로 만든 모형 (OSM)"'),
      "row thumb names the model credit");
  });
});

describe("32b thumbKindFor order", () => {
  it("US with scene goes 3D even when a street photo exists", () => {
    assert.equal(thumbKindFor(usCandidate(), { hasStreet: true }), "scene");
  });

  it("hero wins over everything", () => {
    assert.equal(thumbKindFor(usCandidate(), { hasHero: true, hasStreet: true }),
      "hero");
  });

  it("no scene with a street photo goes street", async () => {
    const c = { ...usCandidate(), scene: null };
    assert.equal(thumbKindFor(c, { hasStreet: true }), "street");
    assert.equal(await streetPhotoFor(c), null, "32b slot falls through");
  });

  it("neither with a footprint goes silhouette, otherwise minimap, never aerial", () => {
    const bare = { id: "x", name: "X", lon: -122.148, lat: 37.484,
      tenures: [] };
    assert.equal(thumbKindFor(bare, { hasFootprint: true }), "silhouette");
    assert.equal(thumbKindFor(bare, {}), "minimap");
    for (const kind of [thumbKindFor(usCandidate(), {}),
      thumbKindFor(bare, { hasStreet: true }),
      thumbKindFor(bare, { hasFootprint: true }),
      thumbKindFor(bare, {})]) {
      assert.notEqual(kind, "aerial", "aerial never in the row");
    }
  });
});

describe("32b SilhouetteThumb", () => {
  const square = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];

  it("a square footprint renders a fitted polygon plus the floors label", () => {
    const h = renderToString(React.createElement(SilhouetteThumb,
      { footprint: square, floors: 15, year: 2014 }));
    assert.ok(h.includes("<svg"), "svg renders");
    const m = h.match(/<(polygon|path)[^>]*points="([^"]*)"[^>]*>/)
      || h.match(/<(polygon|path)[^>]*>/);
    assert.ok(m, "a polygon or path renders");
    if (m[2]) {
      for (const n of m[2].split(/[, ]+/).filter(Boolean).map(Number)) {
        assert.ok(n >= 0 && n <= 100, `point ${n} inside the viewBox`);
      }
    }
    assert.ok(h.includes("15층"), "floors label");
    assert.ok(h.includes("2014년"), "year label");
  });

  it("without a footprint it renders the fallback", () => {
    const h = renderToString(React.createElement(SilhouetteThumb,
      { footprint: null, fallback: React.createElement("span", null, "no-model") }));
    assert.ok(h.includes("no-model"), "fallback renders");
  });
});

describe("32b row CSS", () => {
  const css = readFileSync(join(HERE, "..", "src", "ui", "ui.css"), "utf8");

  it("keep-all on the row card text; no ellipsis", () => {
    const main = css.match(/\.ui-cand-row-main\s*\{[^}]*\}/);
    assert.ok(main, ".ui-cand-row-main rule found");
    assert.ok(main[0].includes("keep-all"), "row text keeps words whole");
    assert.ok(!css.includes("ellipsis"), "no ellipsis in ui.css");
    assert.ok(!css.includes("text-overflow"), "no text-overflow in ui.css");
  });
});

// Stage 29h3: one ZIP rent stated once — a US list sharing one ZIP
// typical rent states it once above the cards, each row leads with its
// commute, and the real street photo wins over the 3D model.
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
let sharedZipRent;
let sharedRentNote;
let thumbKindFor;

let menlo = null;
try {
  const rec = JSON.parse(readFileSync(
    join(HERE, "..", "public", "recorded", "menlo-month.json"), "utf8"));
  menlo = rec.candidatesData.candidates;
} catch {
  menlo = null;
}

function usFixture(i) {
  return { id: `u${i}`, name: `Menlo home ${i}`, kind: "아파트",
    country: "US", currency: "USD", lon: -122.16, lat: 37.46,
    scene: "us-menlo",
    price: { zip: "94025", source: "zillow_zori_zip", month: "2026-09" },
    tenures: [{ tenure: "wolse", median_won: 4261, min_won: 4261,
      max_won: 4261, deals: 0, budget_fit: "all" }],
    commute: { work: { target: "meta-hq", name: "Meta HQ",
      walk_minutes: 37, bike_minutes: 11, mode: "bike", minutes: 11,
      source: "assumed_speed" } } };
}

function sixUs() {
  if (Array.isArray(menlo) && menlo.length >= 6) return menlo.slice(0, 6);
  return [0, 1, 2, 3, 4, 5].map(usFixture);
}

function krCandidate(id) {
  return { id, name: `한강집 ${id}`, kind: "아파트",
    lon: 127.1, lat: 37.4,
    tenures: [{ tenure: "jeonse", median_won: 500000000,
      min_won: 490000000, max_won: 510000000, deals: 9,
      budget_fit: "all", bucket_center_m2: 60 }],
    commute: { walk: { known: true, station: "양재", minutes: 9 },
      ride: { known: false } } };
}

const textOf = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
const divText = (html, cls) => {
  const m = html.match(new RegExp(`<div class="${cls}[^"]*"[^>]*>([\\s\\S]*?)</div>`));
  return m ? textOf(m[1]) : null;
};

before(async () => {
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
  ({ CandidateCard, sharedZipRent, sharedRentNote, thumbKindFor } =
    await import("../src/ui/candidate-card.jsx"));
});

const noop = () => {};

describe("29h3 sharedZipRent", () => {
  it("six Menlo candidates share ZIP 94025 at $4,261", () => {
    const shared = sharedZipRent(sixUs(), "wolse");
    assert.ok(shared, "shared rent found");
    assert.equal(shared.zip, "94025");
    assert.equal(shared.amount, 4261);
  });

  it("one different median_won breaks the share", () => {
    const cands = sixUs().map((c) => ({
      ...c, tenures: (c.tenures || []).map((t) => ({ ...t })) }));
    cands[2].tenures[0].median_won = 5000;
    assert.equal(sharedZipRent(cands, "wolse"), null);
  });

  it("a Korean list never shares", () => {
    assert.equal(sharedZipRent([krCandidate("k1"), krCandidate("k2")], "jeonse"), null);
  });

  it("a single candidate never shares", () => {
    assert.equal(sharedZipRent(sixUs().slice(0, 1), "wolse"), null);
  });
});

describe("29h3 sharedRentNote", () => {
  it("ko states the ZIP rent, the budget fact and the source once", () => {
    const shared = sharedZipRent(sixUs(), "wolse");
    const note = sharedRentNote(shared, { budgetWon: 4500, tenure: "wolse", lang: "ko" });
    assert.ok(note.includes("ZIP 94025"), note);
    assert.ok(note.includes("$4,261"), note);
    assert.ok(note.includes("예산보다 $239 적어요"), note);
    assert.ok(note.includes("Zillow ZORI"), note);
  });

  it("en translates the line with no Hangul", () => {
    const shared = sharedZipRent(sixUs(), "wolse");
    const note = sharedRentNote(shared, { budgetWon: 4500, tenure: "wolse", lang: "en" });
    assert.ok(note.includes("Typical rent in ZIP 94025"), note);
    assert.ok(note.includes("$239 under budget"), note);
    assert.ok(!/[가-힣]/.test(note), note);
  });

  it("null without a shared rent", () => {
    assert.equal(sharedRentNote(null, { budgetWon: 4500 }), null);
  });
});

describe("29h3 sharedRent row", () => {
  function html(sharedRent) {
    return renderToString(React.createElement(CandidateCard,
      { candidate: sixUs()[0], tenure: "wolse", destName: "Meta HQ",
        photos: null, index: 0, picked: false, sharedRent,
        onLive: noop, onJeonse: noop, onDetail: noop }));
  }

  it("the price line leads with the commute, never the rent", () => {
    const price = divText(html(true), "ui-cand-row-price");
    assert.ok(price, "price element renders");
    assert.ok(price.includes("분") || price.includes("min"), `commute leads: ${price}`);
    assert.ok(!price.includes("$"), `no rent on the row: ${price}`);
  });

  it("without sharedRent the price line is unchanged", () => {
    const price = divText(html(false), "ui-cand-row-price");
    assert.ok(price && price.includes("$4,261"), `rent stays: ${price}`);
  });
});

describe("29h3 thumbKindFor prefers the street photo over the model", () => {
  it("street wins over scene, hero still wins", () => {
    const c = sixUs()[0];
    assert.ok(c.scene, "US fixture has a scene");
    assert.equal(thumbKindFor(c, { hasStreet: true }), "street");
    assert.equal(thumbKindFor(c, { hasHero: true, hasStreet: true }), "hero");
    assert.equal(thumbKindFor(c, {}), "scene");
  });
});

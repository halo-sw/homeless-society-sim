// Stage 29k2: map pins lead with the commute when every home shares
// one ZIP rent; verified-report tags get their own spaced wrap.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tagLines, tagSizePx, tagPriceLine } from "../src/chatmap.js";

register("./jsx-loader.mjs", import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));

let React;
let renderToStaticMarkup;
let ReportCheck;

before(async () => {
  React = (await import("react")).default;
  ({ renderToStaticMarkup } = await import("react-dom/server"));
  ({ ReportCheck } = await import("../src/ui/chat.jsx"));
});

function usCandidate() {
  return { id: "u1", name: "Menlo home 1", kind: "아파트",
    country: "US", currency: "USD", lon: -122.16, lat: 37.46,
    price: { zip: "94025", source: "zillow_zori_zip", month: "2026-09" },
    tenures: [{ tenure: "wolse", median_won: 4261, min_won: 4261,
      max_won: 4261, deals: 0, budget_fit: "all" }] };
}

function pin(commuteMin) {
  return { id: "p1", n: 1, candidate: usCandidate(), commuteMin,
    lon: -122.16, lat: 37.46 };
}

describe("29k2 shared-rent pins lead with the commute", () => {
  it("ko bold line is the commute, no second line", () => {
    const lines = tagLines(pin(11), { tenure: "wolse", lang: "ko", sharedRent: true });
    assert.equal(lines.price, "출근 11분");
    assert.equal(lines.commute, null);
  });
  it("en bold line reads N min to work", () => {
    const lines = tagLines(pin(11), { tenure: "wolse", lang: "en", sharedRent: true });
    assert.equal(lines.price, "11 min to work");
    assert.equal(lines.commute, null);
  });
  it("without sharedRent nothing changes", () => {
    const p = pin(11);
    const lines = tagLines(p, { tenure: "wolse", lang: "ko" });
    assert.equal(lines.price, tagPriceLine(p.candidate, "wolse", "ko"));
    assert.equal(lines.price, "$4,261");
    assert.equal(lines.commute, "출근 11분");
  });
  it("sharedRent with no commute falls back to the money line", () => {
    const lines = tagLines(pin(null), { tenure: "wolse", lang: "ko", sharedRent: true });
    assert.equal(lines.price, "$4,261");
    assert.equal(lines.commute, null);
  });
  it("sharedRent measures the one-line height", () => {
    const h = tagSizePx(pin(11), "wolse", "ko", { sharedRent: true }).h;
    assert.equal(h, tagSizePx(pin(null), "wolse", "ko").h);
  });
});

describe("29k2 report tags get their own wrap", () => {
  const sentences = [
    { id: "s1", home: "A", item_id: "C01", text_ko: "통근은 평균 22분이에요",
      claims: [{ field: "minutes", value: 22, unit: "분" }], evidence: ["a-dark"] },
  ];
  it("tags sit inside .ui-check-tags", () => {
    const html = renderToStaticMarkup(React.createElement(ReportCheck, {
      report: { status: "pass", persona: "newlywed_couple",
        attempts: [{ attempt: 1, pass: true, weighted_coverage: 1, summary_ko: "1차" }],
        report: { sentences },
        result: { failures: [], feedback_ko: [] } },
      names: { A: "역삼" },
    }));
    const i = html.indexOf('class="ui-check-tags"');
    assert.ok(i >= 0, "has .ui-check-tags");
    const tail = html.slice(i);
    assert.ok(tail.includes("숫자 확인"));
    assert.ok(tail.includes("근거 1개"));
  });
  it("ui.css spaces the wrap on the spacing scale", () => {
    const css = readFileSync(join(HERE, "..", "src", "ui", "ui.css"), "utf8");
    assert.ok(css.includes(".ui-check-tags"));
    assert.ok(css.includes("gap: var(--ui-s8)"));
  });
});

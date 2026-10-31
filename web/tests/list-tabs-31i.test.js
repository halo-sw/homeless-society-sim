// 31i: candidate list — sort as text tabs, price is the biggest thing on a card.
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
let CandidatesCard;
let HOME_SORTS;
let HOME_SORT_KO;
let HOME_SORT_SHORT_KO;

function candidate(id) {
  return { id, name: `집${id}`, kind: "아파트",
    region: "bundang", lon: 127.1, lat: 37.35, build_year: 2010,
    match: "register", pnu: "p", scene: "st-판교", photos: [],
    tenures: [{ tenure: "jeonse", bucket_center_m2: 60, range_m2: [55, 65],
      median_won: 200000000, min_won: 190000000, max_won: 210000000,
      deals: 4, budget_fit: "all" }],
    commute: { walk: { known: true, station: "판교", minutes: 5, source: "graph" },
      ride: { known: false } } };
}

const textOf = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

before(async () => {
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
  ({ CandidatesCard } = await import("../src/ui/chat.jsx"));
  ({ HOME_SORTS, HOME_SORT_KO, HOME_SORT_SHORT_KO } = await import("../src/homes.js"));
});

describe("31i HOME_SORT_SHORT_KO", () => {
  it("has the four short labels", () => {
    assert.deepEqual(HOME_SORT_SHORT_KO, {
      commute: "출근순",
      monthly: "비용순",
      deals: "거래순",
      priority: "우선순위순",
    });
    assert.deepEqual([...HOME_SORTS].sort(), Object.keys(HOME_SORT_SHORT_KO).sort());
  });
});

describe("31i CandidatesCard sort tabs", () => {
  const base = { tenure: "jeonse", sort: "monthly", onSort: () => {},
    picks: [], onTogglePick: () => {}, onPreview3D: () => {},
    onJeonse: () => {}, onRun: () => {}, onOpenWork: () => {} };

  function html() {
    return renderToString(React.createElement(CandidatesCard,
      { ...base, data: { ok: true, total_matching: 2,
        candidates: [candidate("a"), candidate("b")] } }));
  }

  function tabButtons() {
    const tags = html().match(/<button[^>]*>[\s\S]*?<\/button>/g) || [];
    return tags.filter((t) => /ui-cand-tab( |")/.test(t));
  }

  it("renders 4 tab buttons with pressed state on 비용순", () => {
    const tabs = tabButtons();
    assert.equal(tabs.length, 4, "one tab per HOME_SORTS key");
    const pressed = tabs.filter((t) => t.includes('aria-pressed="true"'));
    assert.equal(pressed.length, 1, "exactly one active tab");
    assert.ok(pressed[0].includes("비용순"), "monthly tab is active");
    for (const t of tabs.filter((x) => x !== pressed[0])) {
      assert.ok(t.includes('aria-pressed="false"'), "inactive tabs are false");
    }
  });

  it("each tab carries the full HOME_SORT_KO label in title", () => {
    const tabs = tabButtons();
    for (const key of HOME_SORTS) {
      const tab = tabs.find((t) => t.includes(HOME_SORT_SHORT_KO[key]));
      assert.ok(tab, `tab for ${key} renders`);
      assert.ok(tab.includes(`title="${HOME_SORT_KO[key]}"`),
        `${key} tab title is the full label`);
    }
  });

  it("has no DropdownMenu trigger showing the full sort label", () => {
    assert.ok(!textOf(html()).includes(HOME_SORT_KO.commute),
      "full label is not visible text (no dropdown trigger)");
  });
});

describe("31i row price CSS", () => {
  const css = readFileSync(join(HERE, "..", "src", "ui", "ui.css"), "utf8");

  it("the row-variant price rule uses --ds-t-20", () => {
    const m = css.match(/\.ui-cand-row-price\s*\{[^}]*\}/);
    assert.ok(m, ".ui-cand-row-price rule found");
    assert.ok(m[0].includes("--ds-t-20"), "price type comes from the token");
  });

  it("no ellipsis", () => {
    assert.ok(!css.includes("ellipsis"), "no ellipsis in ui.css");
  });
});

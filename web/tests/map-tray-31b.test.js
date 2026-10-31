// Stage 31b — map overlays and the pick tray: one panel style,
// nothing covered, the run button knows when the run is done.
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
const chatSrc = readFileSync(join(HERE, "..", "src", "ui", "chat.jsx"), "utf8");
const css = readFileSync(join(HERE, "..", "src", "ui", "ui.css"), "utf8");

let React;
let renderToString;
let ChatMap;
let PicksTray;
let RUN_BUTTON_LABEL;
let RESULT_VIEW_LABEL;
let resultReadyFor;
let displayNameFor;
let buildChatMap;

before(async () => {
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
  ({ ChatMap } = await import("../src/ui/chatmap.jsx"));
  ({ PicksTray, RUN_BUTTON_LABEL, RESULT_VIEW_LABEL, resultReadyFor } =
    await import("../src/ui/chat.jsx"));
  ({ displayNameFor } = await import("../src/homes.js"));
  ({ buildChatMap } = await import("../src/chatmap.js"));
});

// Same candidate shape as the 26z2 tray test (ready to run).
const CANDS = [
  { id: "a", name: "10 Coleman Place", lon: 127.11, lat: 37.394,
    commute: { work: { minutes: 20 } },
    tenures: [{ tenure: "jeonse", median_won: 200000000, deals: 5 }] },
  { id: "b", name: "777 Hamilton Avenue", lon: 127.12, lat: 37.395,
    commute: { work: { minutes: 25 } },
    tenures: [{ tenure: "jeonse", median_won: 180000000, deals: 4 }] },
];

function doneMessages(cands = CANDS, ids = ["a", "b"]) {
  const picked = cands.filter((c) => ids.includes(c.id));
  return [{
    id: 7,
    kind: "simulation",
    data: {
      status: "done",
      names: Object.fromEntries(picked.map((c, i) => ["ABC"[i], displayNameFor(c)])),
    },
  }];
}

function trayHtml(props) {
  return renderToString(React.createElement(PicksTray, {
    picks: ["a", "b"], candidates: CANDS, gate: { ok: true },
    resultReady: false, onRun() {}, onRemove() {}, ...props,
  }));
}

// Three pins ~50 m apart plus two far pins so the fitted view keeps
// the trio within ~30 px: their pills collide and grow leaders.
function closeMap() {
  const near = (id, lon, lat, won) => ({ id, name: `집${id}`,
    lon, lat, commute: { work: { minutes: 20 } },
    tenures: [{ tenure: "jeonse", median_won: won, deals: 5 }] });
  return buildChatMap({
    regions: { regions: [
      { id: "wide", label: "넓은 지역", bbox: [127.0, 37.35, 127.14, 37.55] },
    ] },
    network: null, tiles: [], green: { water: [], parks: [] },
    candidates: [
      near("h-1", 127.1100, 37.3949, 200000000),
      near("h-2", 127.1103, 37.3950, 180000000),
      near("h-3", 127.1106, 37.3951, 220000000),
      near("h-far-s", 127.01, 37.36, 150000000),
      near("h-far-n", 127.13, 37.54, 160000000),
    ],
    picks: [], workplaceStation: null, tenure: "jeonse",
  });
}

async function mapHtml(props) {
  return renderToString(React.createElement(ChatMap, { map: closeMap(), ...props }));
}

function indices(html, sub) {
  const out = [];
  let i = 0;
  for (;;) {
    const at = html.indexOf(sub, i);
    if (at < 0) return out;
    out.push(at);
    i = at + sub.length;
  }
}

describe("31b legend and attribution leave inline styles", () => {
  it("has no inline fontSize 11 / fontSize 10 / #55514a", () => {
    assert.ok(!chatmapSrc.includes("fontSize: 11"), "no inline legend size");
    assert.ok(!chatmapSrc.includes("fontSize: 10"), "no inline credit size");
    assert.ok(!chatmapSrc.includes("#55514a"), "no raw legend ink");
  });

  it("renders the legend and the attribution through classes", () => {
    assert.ok(chatmapSrc.includes("ui-chatmap-legend"), "legend class");
    assert.ok(chatmapSrc.includes("ui-chatmap-credit"), "credit class");
  });

  it("keeps both legend strings and both credit strings", () => {
    assert.ok(chatmapSrc.includes("● 후보 · ■ 회사 · 숫자는 출근 편도(추정)"),
      "us legend string");
    assert.ok(chatmapSrc.includes("● 후보 · ■ 회사 · ━ 지하철 · 숫자는 출근 편도(추정)"),
      "kr legend string");
    assert.ok(chatmapSrc.includes(
      "지도 © 국토교통부 공간정보 오픈플랫폼(VWorld) · © OpenStreetMap contributors"),
      "VWorld credit");
    assert.ok(chatmapSrc.includes("© OpenStreetMap contributors"), "OSM credit");
  });

  it("puts the legend top-left under the title and lifts the credit above the tray", () => {
    const legend = css.match(/\.ui-chatmap-legend\s*\{[^}]*\}/);
    assert.ok(legend, "legend rule present");
    assert.ok(!legend[0].includes("bottom:"), "legend is not bottom-anchored");
    const credit = css.match(/\.ui-chatmap-credit\s*\{[^}]*\}/);
    assert.ok(credit, "credit rule present");
    const lift = css.match(
      /\.ui-chat-main:has\(\.ui-picks-tray\)\s+\.ui-chatmap-credit\s*\{[^}]*\}/);
    assert.ok(lift, "credit lifts while the tray shows");
  });
});

describe("31b one floating-panel style", () => {
  it("defines .ui-float on the card surface with card radius", () => {
    const rule = css.match(/\.ui-float\s*\{[^}]*\}/);
    assert.ok(rule, ".ui-float present");
    assert.ok(rule[0].includes("--ds-r-card"), "card radius, not a pill");
    assert.ok(!rule[0].includes("999"), "never pill-shaped");
  });

  it("gives the zoom buttons the shared surface at one height and size", () => {
    assert.ok(chatmapSrc.includes('className="ui-float"'), "zoom uses .ui-float");
    const btn = css.match(/\.ui-chatmap-zoom button\s*\{[^}]*\}/);
    assert.ok(btn, "zoom button rule present");
    assert.ok(btn[0].includes("var(--ds-s-32)"), "32 px tall from a token");
    assert.ok(btn[0].includes("var(--ds-t-14)"), "14 px from a token");
    assert.ok(!/#[0-9a-fA-F]{3,8}/.test(btn[0]), "no raw hex in the zoom rule");
    assert.ok(!/\d+px/.test(btn[0]), "no raw px in the zoom rule");
  });

  it("renames the stage pill to plain floating text", () => {
    assert.ok(!chatSrc.includes("ui-stage-pill"), "pill class gone from chat.jsx");
    assert.ok(!css.includes(".ui-stage-pill"), "pill rule gone from ui.css");
    assert.ok(chatSrc.includes("ui-float ui-stage-title"), "title uses .ui-float");
  });
});

describe("31b pin z-order", () => {
  it("paints every pill rect after every location circle and leader line", async () => {
    const html = await mapHtml();
    const dots = indices(html, 'r="4"');
    const leaders = indices(html, "<line");
    const pills = indices(html, 'rx="999"');
    assert.ok(dots.length >= 3, `location dots rendered (saw ${dots.length})`);
    assert.ok(leaders.length >= 1, "close pills grow leaders");
    assert.ok(pills.length >= 3, `pin pills rendered (saw ${pills.length})`);
    assert.ok(Math.max(...dots, ...leaders) < Math.min(...pills),
      "no dot or leader paints over a pill");
  });

  it("renders the highlighted pill last", async () => {
    const html = await mapHtml({ cardHi: "home:h-3" });
    const pills = indices(html, 'rx="999"');
    assert.equal(pills.length, 5, "one pill per pin");
    const zoom = html.indexOf("scale(1.08)");
    assert.ok(zoom > 0, "highlighted pill scales");
    assert.ok(pills[pills.length - 1] > zoom, "highlighted pill paints last");
  });
});

describe("31b tray knows when the run is done", () => {
  it("keeps the primary run button while resultReady is false", () => {
    const html = trayHtml({ resultReady: false });
    assert.ok(html.includes(RUN_BUTTON_LABEL), "30일 살아 보기");
    assert.ok(html.includes('data-variant="primary"'), "primary variant");
    assert.ok(!html.includes(RESULT_VIEW_LABEL), "no 결과 보기 yet");
  });

  it("offers a secondary 결과 보기 once resultReady is true", () => {
    const html = trayHtml({ resultReady: true });
    assert.ok(html.includes(RESULT_VIEW_LABEL), "결과 보기");
    assert.ok(html.includes('data-variant="secondary"'), "secondary variant");
    assert.ok(!html.includes(RUN_BUTTON_LABEL), "no second identical run");
  });

  it("applies the same rule to the compact phone row", () => {
    const run = trayHtml({ compact: true, resultReady: false });
    assert.ok(run.includes(RUN_BUTTON_LABEL), "compact runs while unfinished");
    const done = trayHtml({ compact: true, resultReady: true });
    assert.ok(done.includes(RESULT_VIEW_LABEL), "compact shows 결과 보기");
    assert.ok(done.includes('data-variant="secondary"'), "compact is secondary");
    assert.ok(!done.includes(RUN_BUTTON_LABEL), "compact never invites a re-run");
  });

  it("keeps the × labels and a 28 px hit area", () => {
    const html = trayHtml({});
    assert.ok(html.includes("빼기"), "remove aria-labels kept");
    const rule = css.match(/\.ui-pick-x\s*\{[^}]*\}/);
    assert.ok(rule, ".ui-pick-x rule present");
    assert.ok(rule[0].includes("calc(var(--ds-s-32) - var(--ds-s-4))"),
      "28 px hit area from tokens");
    assert.ok(rule[0].includes("var(--ds-t-14)"), "glyph stays 14 px");
  });
});

describe("31b resultReadyFor", () => {
  it("is true for a done simulation with the same picks", () => {
    assert.equal(resultReadyFor(doneMessages(), ["a", "b"], CANDS), true);
  });

  it("prefers candidate ids when the payload carries them", () => {
    const msgs = [{ kind: "simulation",
      data: { status: "done", pickIds: ["b", "a"] } }];
    assert.equal(resultReadyFor(msgs, ["a", "b"], CANDS), true);
    assert.equal(resultReadyFor(msgs, ["a"], CANDS), false);
  });

  it("goes false after a pick changes", () => {
    assert.equal(resultReadyFor(doneMessages(), ["a"], CANDS), false);
    const other = [...CANDS,
      { id: "c", name: "다른 집", commute: { work: { minutes: 10 } } }];
    assert.equal(resultReadyFor(doneMessages(), ["a", "c"], other), false);
  });

  it("is false while the last simulation runs or errored", () => {
    const running = [{ kind: "simulation", data: { status: "running" } }];
    assert.equal(resultReadyFor(running, ["a", "b"], CANDS), false);
    const errored = [{ kind: "simulation", data: { status: "error" } }];
    assert.equal(resultReadyFor(errored, ["a", "b"], CANDS), false);
  });

  it("is false with no simulation message", () => {
    assert.equal(resultReadyFor([], ["a", "b"], CANDS), false);
    assert.equal(resultReadyFor([{ kind: "text", content: "hi" }],
      ["a", "b"], CANDS), false);
  });
});

describe("31b css hygiene", () => {
  it("uses tokens only in the new rules and never truncates", () => {
    for (const sel of ["\\.ui-float", "\\.ui-stage-title",
      "\\.ui-chatmap-legend", "\\.ui-chatmap-credit", "\\.ui-pick-x"]) {
      const rule = css.match(new RegExp(`${sel}\\s*\\{[^}]*\\}`));
      assert.ok(rule, `${sel} present`);
      assert.ok(!/#[0-9a-fA-F]{3,8}/.test(rule[0]), `no raw hex in ${sel}`);
      assert.ok(!/\d+px/.test(rule[0]), `no raw px in ${sel}`);
    }
    assert.ok(!css.includes("ellipsis"), "no ellipsis in ui.css");
  });
});

// Stage 26z2: phones — the pick tray never covers the composer.
// CSS contract (node --test, no browser) + SSR of the compact run row.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

register("./jsx-loader.mjs", import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(HERE, "..", "src", "ui", "ui.css"), "utf8");
const src = readFileSync(join(HERE, "..", "src", "ui", "chat.jsx"), "utf8");

// Every @media (max-width: 900px) block concatenated (32a2: the one
// narrow breakpoint — 1099 px is gone).
function narrowBlocks() {
  const blocks = [];
  let i = 0;
  while (i < css.length) {
    const at = css.indexOf("@media (max-width: 900px)", i);
    if (at < 0) break;
    let depth = 0;
    let started = false;
    let j = at;
    for (; j < css.length; j += 1) {
      if (css[j] === "{") { depth += 1; started = true; }
      if (css[j] === "}") {
        depth -= 1;
        if (started && depth === 0) break;
      }
    }
    blocks.push(css.slice(at, j + 1));
    i = j + 1;
  }
  return blocks.join("\n");
}

// css with every @media block stripped, so a match proves the rule
// applies outside any media query (desktop included).
function cssOutsideMedia() {
  let out = "";
  let i = 0;
  while (i < css.length) {
    const at = css.indexOf("@media", i);
    if (at < 0) {
      out += css.slice(i);
      break;
    }
    out += css.slice(i, at);
    let depth = 0;
    let j = at;
    for (; j < css.length; j += 1) {
      if (css[j] === "{") depth += 1;
      if (css[j] === "}") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    i = j + 1;
  }
  return out;
}

let React;
let renderToString;
let PicksTray;
let RUN_BUTTON_LABEL;
let WORKPLACE_ASK_LABEL;
let stageTrayVisible;
let compactTrayVisible;

before(async () => {
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
  ({ PicksTray, RUN_BUTTON_LABEL, WORKPLACE_ASK_LABEL,
    stageTrayVisible, compactTrayVisible } = await import("../src/ui/chat.jsx"));
});

const CANDS = [
  { id: "a", name: "10 Coleman Place", lon: 127.1, lat: 37.5,
    commute: { work: { minutes: 20 } } },
  { id: "b", name: "777 Hamilton Avenue", lon: 127.2, lat: 37.5,
    commute: { work: { minutes: 25 } } },
];

function compactHtml(gate) {
  return renderToString(React.createElement(PicksTray, {
    compact: true, picks: ["a", "b"], candidates: CANDS,
    gate, onRun() {}, onRemove() {},
  }));
}

describe("26z2 tray stays off the phone chat pane", () => {
  it("hides the tray at <=900px unless the narrow pane is Map & homes", () => {
    const narrow = narrowBlocks();
    const rule = narrow.match(
      /\.ui-chat:not\(\.ui-chat-narrow-work\)\s+\.ui-picks-tray\s*\{[^}]*\}/);
    assert.ok(rule, "narrow rule hides the tray on the chat pane");
    assert.ok(rule[0].includes("display: none"), "tray hidden, not moved");
    assert.ok(src.includes("stageTrayVisible({ narrow, view })"),
      "the stage tray never mounts on the narrow chat pane");
    assert.equal(stageTrayVisible({ narrow: true, view: "chat" }), false);
    assert.equal(stageTrayVisible({ narrow: true, view: "work" }), true);
    assert.equal(stageTrayVisible({ narrow: false, view: "chat" }), true);
  });

  it("leaves the desktop tray alone", () => {
    const base = cssOutsideMedia();
    assert.ok(!base.includes(".ui-chat:not(.ui-chat-narrow-work)"),
      "no chat-pane gating outside media queries");
    const tray = base.match(/\.ui-picks-tray\s*\{[^}]*\}/);
    assert.ok(tray && tray[0].includes("position: absolute"),
      "desktop tray still floats over the stage");
  });
});

describe("26z2 compact run row above the phone chips", () => {
  it("renders the run action with two picks and no absolute tray", () => {
    const html = compactHtml({ ok: true });
    assert.ok(html.includes("ui-picks-compact"), "compact row rendered");
    assert.ok(html.includes(RUN_BUTTON_LABEL), "same run label as the tray");
    assert.ok(html.includes("30일 살아 보기"), "short Korean run label");
    assert.ok(html.includes("10 Coleman Place"), "first pick named");
    assert.ok(html.includes("777 Hamilton Avenue"), "second pick named");
    assert.ok(!html.includes("ui-picks-tray"), "no absolute tray in this state");
  });

  it("uses the workplace gate label when the workplace is missing", () => {
    const html = compactHtml({ ok: false });
    assert.ok(html.includes(WORKPLACE_ASK_LABEL), "gate label kept");
    assert.ok(!html.includes(RUN_BUTTON_LABEL), "run label waits for the gate");
  });

  it("flows in place so the chips and composer move up", () => {
    const row = css.match(/\.ui-picks-compact\s*\{[^}]*\}/);
    assert.ok(row, "compact row rule present");
    assert.ok(!row[0].includes("position:"), "in-flow, never absolute");
    const names = css.match(/\.ui-picks-compact-names\s*\{[^}]*\}/);
    assert.ok(names && names[0].includes("word-break: keep-all"),
      "names wrap at spaces");
    const wide = css.match(/@media\s*\(min-width:\s*901px\)\s*\{[^}]*\.ui-picks-compact[^}]*\}/);
    assert.ok(wide && wide[0].includes("display: none"),
      "desktop keeps the full tray only");
  });

  it("is wired into the chat column above the composer chips", () => {
    assert.ok(src.includes("<PicksTray compact"), "chat column renders it");
    assert.ok(src.includes("compactTrayVisible({ narrow, view })"),
      "narrow chat pane only");
    assert.equal(compactTrayVisible({ narrow: true, view: "chat" }), true);
    assert.equal(compactTrayVisible({ narrow: true, view: "work" }), false);
    assert.equal(compactTrayVisible({ narrow: false, view: "chat" }), false);
    assert.ok(src.includes('className="ui-next-steps"'),
      "next steps ride the thread, after the last message");
    const iList = src.indexOf("<ThreadList>");
    const iTray = src.indexOf("<PicksTray compact");
    assert.ok(iList >= 0 && iTray > iList,
      "compact row follows the message list in the chat column");
  });

  it("still truncates nothing, anywhere", () => {
    assert.ok(!css.includes("text-overflow"), "no truncation in ui.css");
    assert.ok(!css.includes("ellipsis"), "no ellipsis anywhere in ui.css");
  });
});

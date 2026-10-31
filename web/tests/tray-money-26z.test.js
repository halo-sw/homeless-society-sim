// Stage 26z: the tray run button keeps its full label, and the money
// source note sits on its own line under the amount at every width.
// CSS contract (node --test, no browser) + SSR of the money cell shape.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

register("./jsx-loader.mjs", import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(HERE, "..", "src", "ui", "ui.css"), "utf8");

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
let splitMoneyNote;

before(async () => {
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
  ({ splitMoneyNote } = await import("../src/ui/chat.jsx"));
});

// The money cell shape mirrors chat.jsx: main amount plus the note in
// its own element when splitMoneyNote finds one.
function moneyCell(text) {
  const parts = splitMoneyNote(text);
  return renderToString(
    React.createElement("span", { className: "ui-result-value", title: text },
      React.createElement("span", { className: "ui-result-main" }, parts.main),
      parts.note
        ? React.createElement("span", { className: "ui-result-note" }, parts.note)
        : null),
  );
}

describe("26z tray run button is never cut", () => {
  it("holds its full label on one line outside the design-system clip", () => {
    const run = css.match(/\.ui-picks-tray\s+\.ui-picks-run\s*\{[^}]*\}/);
    assert.ok(run, "tray run button rule present");
    assert.ok(run[0].includes("flex: none"), "button never shrinks");
    assert.ok(/max-width:\s*none/.test(run[0]), "no width cap");
    assert.ok(run[0].includes("overflow: visible"), "clip cannot apply");
    assert.ok(!run[0].includes("ellipsis"), "rule sets no ellipsis");
  });

  it("the A/B chips take the remaining space, names wrap at spaces", () => {
    const chips = css.match(/\.ui-picks-tray-chips\s*\{[^}]*\}/);
    assert.ok(chips, "chips rule present");
    assert.ok(chips[0].includes("flex: 1 1 0"), "chips take the free space");
    assert.ok(chips[0].includes("min-width: 0"), "chips may shrink");
    const name = css.match(/\.ui-pick-name\s*\{[^}]*\}/);
    assert.ok(name && name[0].includes("overflow-wrap"), "names wrap");
    assert.ok(name[0].includes("word-break: keep-all"), "breaks at spaces");
  });

  it("still truncates nothing, anywhere", () => {
    assert.ok(!css.includes("text-overflow"), "no truncation in ui.css");
    assert.ok(!css.includes("ellipsis"), "no ellipsis anywhere in ui.css");
  });
});

describe("26z money note sits under the amount at every width", () => {
  it("renders the note in its own element", () => {
    const html = moneyCell("$4,261/mo (ZIP 추정)");
    const note = html.match(/<span class="ui-result-note"[^>]*>([^<]*)<\/span>/);
    assert.ok(note, "note has its own element");
    assert.equal(note[1], "(ZIP 추정)");
    assert.ok(html.includes("ui-result-main"), "amount keeps its element");
  });

  it("the note rule sets display: block outside any media query", () => {
    const base = cssOutsideMedia().match(/\.ui-result-note\s*\{[^}]*\}/);
    assert.ok(base, ".ui-result-note rule outside any media query");
    assert.ok(base[0].includes("display: block"), "note on its own line");
    assert.ok(base[0].includes("--ui-t12"), "small note size");
  });
});

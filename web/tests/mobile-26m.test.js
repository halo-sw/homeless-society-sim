// Stage 26m: phone layout (390 px) — nothing cut off, 3D gets the
// screen. CSS contract (node --test, no browser) + the JS helpers
// (short tab labels, money-note split).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

register("./jsx-loader.mjs", import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(HERE, "..", "src", "ui", "ui.css"), "utf8");

// All @media (max-width: 480px) blocks in ui.css, joined.
function phoneBlock() {
  const blocks = [];
  let from = 0;
  for (;;) {
    const at = css.indexOf("@media (max-width: 480px)", from);
    if (at < 0) break;
    let depth = 0;
    let started = false;
    let end = -1;
    for (let i = at; i < css.length; i += 1) {
      if (css[i] === "{") { depth += 1; started = true; }
      if (css[i] === "}") {
        depth -= 1;
        if (started && depth === 0) { end = i; break; }
      }
    }
    assert.ok(end > at, "balanced braces in phone media block");
    blocks.push(css.slice(at, end + 1));
    from = end + 1;
  }
  assert.ok(blocks.length > 0, "ui.css has a @media (max-width: 480px) block");
  return blocks.join("\n");
}

let shortModeLabel;
let splitMoneyNote;

before(async () => {
  ({ shortModeLabel } = await import("../src/ui/topbar.jsx"));
  ({ splitMoneyNote } = await import("../src/ui/chat.jsx"));
});

describe("26m phone CSS contract", () => {
  it("carries the phone block with room-making rules", () => {
    const block = phoneBlock();
    assert.ok(block.includes("flex-shrink: 0"), "buttons never shrink");
    assert.ok(block.includes("word-break: keep-all"), "no mid-word breaks");
    assert.ok(block.includes("overflow-x: auto"), "scrollable control rows");
  });

  it("still truncates nothing, anywhere", () => {
    assert.ok(!phoneBlock().includes("text-overflow"),
      "no truncation in the phone block (29h1 header ellipsis is desktop-only)");
  });

  it("hides the summary chip and keeps the pick bar stacked", () => {
    const block = phoneBlock();
    assert.ok(block.includes(".ui-bar-center"), "summary chip hidden");
    assert.ok(block.includes(".ui-picks-tray-row"), "pick bar becomes two rows");
    assert.ok(block.includes(".ui-cand-thumb"), "64 px thumbnail");
    assert.ok(block.includes(".ui-strip-legend"), "inline legend behind the control");
    assert.ok(block.includes("55vh"), "canvas keeps most of the viewport");
  });
});

describe("26m short mode labels", () => {
  it("uses 대화 / 보기 / 둘러보기", () => {
    assert.equal(shortModeLabel("chat", "ko"), "대화");
    assert.equal(shortModeLabel("sim", "ko"), "보기");
    assert.equal(shortModeLabel("tour", "ko"), "둘러보기");
  });

  it("uses Chat / View / Explore", () => {
    assert.equal(shortModeLabel("chat", "en"), "Chat");
    assert.equal(shortModeLabel("sim", "en"), "View");
    assert.equal(shortModeLabel("tour", "en"), "Explore");
  });

  it("passes unknown values through", () => {
    assert.equal(shortModeLabel("nope", "ko"), "nope");
  });
});

describe("26m splitMoneyNote", () => {
  it("splits the EN form into amount and note", () => {
    assert.deepEqual(splitMoneyNote("$4,261 (ZIP estimate)/mo"),
      { main: "$4,261/mo", note: "(ZIP estimate)" });
  });

  it("splits the Korean form into amount and note", () => {
    assert.deepEqual(splitMoneyNote("월 $4,261 (ZIP 추정)"),
      { main: "월 $4,261", note: "(ZIP 추정)" });
  });

  it("passes plain amounts through untouched", () => {
    assert.deepEqual(splitMoneyNote("월 120만원"), { main: "월 120만원", note: "" });
    assert.deepEqual(splitMoneyNote(""), { main: "", note: "" });
  });
});

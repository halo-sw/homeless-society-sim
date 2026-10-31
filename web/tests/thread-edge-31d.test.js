// Stage 31d — chat thread follow-up: one left edge, Korean never
// breaks mid-word, citations never overlap, the last reply is never cut.
// node --test, no network.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

register("./jsx-loader.mjs", import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(HERE, "..", "src", "ui", "ui.css"), "utf8");
const chatSrc = readFileSync(join(HERE, "..", "src", "ui", "chat.jsx"), "utf8");
const chatmapSrc = readFileSync(join(HERE, "..", "src", "ui", "chatmap.jsx"), "utf8");
const cardSrc = readFileSync(join(HERE, "..", "src", "ui", "candidate-card.jsx"), "utf8");

let shouldPinToBottom;
let chipsVisible;

before(async () => {
  ({ shouldPinToBottom, chipsVisible } = await import("../src/ui/chat.jsx"));
});

function padRule(re) {
  const m = css.match(re);
  assert.ok(m, "rule present");
  return m[0];
}

describe("31d one left edge", () => {
  it("zeroes the message list inner wrapper padding under .ui-chat-thread", () => {
    const rule = padRule(
      /\.ui-chat-thread[^{]*\.astryx-chat-message-list\s*>\s*div\s*\{[^}]*\}/);
    assert.ok(/padding-left:\s*(0|var\(--ds-s-16\));?/.test(rule),
      "inner wrapper left padding zeroed or token");
    assert.ok(/padding-right:\s*(0|var\(--ds-s-16\));?/.test(rule),
      "inner wrapper right padding zeroed or token");
  });

  it("zeroes the ghost bubble padding under .ui-chat-thread", () => {
    const rule = padRule(
      /\.ui-chat-thread[^{]*\.astryx-chat-message-bubble\s*\{[^}]*padding-left[^}]*\}/);
    assert.ok(/padding-left:\s*(0|var\(--ds-s-16\));?/.test(rule),
      "ghost bubble left padding zeroed or token");
    assert.ok(/padding-right:\s*(0|var\(--ds-s-16\));?/.test(rule),
      "ghost bubble right padding zeroed or token");
  });

  it("gives the composer wrapper the token inset under .ui-chat-thread", () => {
    const rule = padRule(/\.ui-chat-thread[^{]*last-child\s*\{[^}]*\}/);
    assert.ok(rule.includes("var(--ds-s-16)"), "composer wrapper uses --ds-s-16");
  });

  it("never truncates thread text", () => {
    assert.ok(!css.includes("ellipsis"), "no ellipsis in ui.css");
  });
});

describe("31d Korean never breaks mid-word", () => {
  it("sets word-break: keep-all on the thread or its bubble/text selectors", () => {
    const m = css.match(/\.ui-chat-thread[^{]*\{[^}]*word-break:\s*keep-all[^}]*\}/);
    assert.ok(m, "keep-all set under .ui-chat-thread");
  });
});

describe("31d citations never overlap", () => {
  it("gives .ui-cites citations auto height", () => {
    const rule = padRule(/\.ui-cites\s+\.ui-cite\s*\{[^}]*\}/);
    assert.ok(/height:\s*auto/.test(rule), "citation height auto");
  });
});

describe("31e wrapped citation anchor", () => {
  it("gives the .astryx-citation anchor auto height and visible overflow", () => {
    const rule = padRule(
      /\.ui-cites\s+a\.astryx-citation[\s\S]*?\{[^}]*\}/);
    assert.ok(/\.astryx-citation/.test(rule), "targets .astryx-citation");
    assert.ok(/height:\s*auto/.test(rule), "anchor height auto");
    assert.ok(/overflow:\s*visible/.test(rule), "anchor overflow visible");
  });
});

describe("31e composer inner wrapper", () => {
  it("zeroes the composer's inner wrapper horizontal padding under .ui-chat-thread", () => {
    const rule = padRule(
      /\.ui-chat-thread\s*>\s*\.astryx-chat-layout\s*>\s*:last-child\s*>\s*div\s*\{[^}]*\}/);
    assert.ok(/padding-left:\s*0/.test(rule), "inner wrapper left padding zeroed");
    assert.ok(/padding-right:\s*0/.test(rule), "inner wrapper right padding zeroed");
  });
});

describe("31d scroll pinning", () => {
  it("stays pinned when the reader was at the bottom and content grew", () => {
    assert.equal(shouldPinToBottom(true, 1400, 2000, 500), true,
      "within 160 px of the bottom pins");
    assert.equal(shouldPinToBottom(true, 1500, 2000, 500), true,
      "exactly at the bottom pins");
  });

  it("never moves a reader who scrolled up more than 160 px", () => {
    assert.equal(shouldPinToBottom(true, 1000, 2000, 500), false,
      "500 px from the bottom does not pin");
    assert.equal(shouldPinToBottom(false, 1500, 2000, 500), false,
      "not previously at the bottom does not pin");
  });

  it("agrees with chipsVisible at the 160 px threshold", () => {
    assert.equal(chipsVisible(1400, 2000, 500), true);
    assert.equal(chipsVisible(1000, 2000, 500), false);
  });

  it("watches content growth and re-pins after the replay-done row mounts", () => {
    assert.ok(chatSrc.includes("new ResizeObserver"), "ResizeObserver watches growth");
    assert.ok(chatSrc.includes("shouldPinToBottom(pinRef.current"),
      "growth and replay-done paths gate on the pin state");
  });
});

describe("31d side column and SourceDot", () => {
  it("puts zoom and credit in one right-side column, zoom first", () => {
    assert.ok(chatmapSrc.includes("ui-chatmap-side"), "side column markup");
    assert.ok(chatmapSrc.includes("ui-chatmap-zoom"), "zoom class kept");
    assert.ok(chatmapSrc.includes("ui-chatmap-credit"), "credit class kept");
    // 31m: the measure effect names the credit selectors, so pin the
    // rendered side-column credit (is-desktop) instead of the bare name.
    assert.ok(chatmapSrc.indexOf("ui-chatmap-zoom") < chatmapSrc.indexOf("ui-chatmap-credit is-desktop"),
      "zoom on top, credit under it");
    const col = padRule(/\.ui-chatmap-side\s*\{[^}]*\}/);
    assert.ok(col.includes("flex-direction: column"), "column stacks");
    assert.ok(col.includes("flex-end"), "end-aligned");
  });

  it("lifts the column above the tray while keeping tokens only", () => {
    const lift = padRule(
      /\.ui-chat-main:has\(\.ui-picks-tray\)\s+\.ui-chatmap-side\s*\{[^}]*\}/);
    assert.ok(lift.includes("var(--ds-s-16)"), "column clears the tray");
    assert.ok(!/\d+px/.test(colCss()), "no raw px in the side column rule");
  });

  it("SourceDot has no title — the word shows exactly once", () => {
    const m = cardSrc.match(/export function SourceDot[\s\S]*?\n\}/);
    assert.ok(m, "SourceDot found");
    assert.ok(!m[0].includes("title="), "no redundant title");
    assert.ok(m[0].includes('aria-hidden="true"'), "dot stays hidden");
  });
});

function colCss() {
  return css.match(/\.ui-chatmap-side\s*\{[^}]*\}/)[0];
}

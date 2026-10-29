// Stage 13e2-1: chat columns scroll on their own — the astryx AppShell
// content node must not be the page scroller; each column owns scrolling.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(HERE, "..", "src", "ui", "ui.css"), "utf8");

function rule(selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`${esc}\\s*\\{`, "g");
  let m = null;
  let last = null;
  while ((m = re.exec(css)) !== null) last = m;
  assert.ok(last, `missing rule ${selector}`);
  const open = last.index + last[0].length - 1;
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

describe("13e2 chat column scrolling", () => {
  it("astryx layout content is a clipped flex column, never a scroller", () => {
    const body = rule('.ui-chat [class*="astryx-layout-content"]');
    assert.ok(body.includes("overflow: hidden"), "overflow hidden");
    assert.ok(body.includes("display: flex"), "flex");
    assert.ok(body.includes("flex-direction: column"), "column");
    assert.ok(body.includes("min-height: 0"), "min-height 0");
    assert.ok(body.includes("height: 100%"), "definite height");
  });

  it("wrappers between shell and main pass a definite height down", () => {
    const body = rule('.ui-chat [class*="astryx-layout-content"] > *');
    assert.ok(body.includes("display: flex"), "flex");
    assert.ok(body.includes("flex-direction: column"), "column");
    assert.ok(body.includes("min-height: 0"), "min-height 0");
  });

  it("13e3: chat main stays a row (thread | stage | drawer)", () => {
    const body = rule('.ui-chat [class*="astryx-layout-content"] > .ui-chat-main');
    assert.ok(body.includes("flex-direction: row"), "main is a row");
  });

  it("message list scrolls, composer/chips/banner stay pinned", () => {
    const list = rule(".ui-chat-thread > :first-child > :first-child");
    assert.ok(list.includes("overflow-y: auto"), "list scrolls");
    assert.ok(list.includes("min-height: 0"), "list min-height 0");
    const first = rule(".ui-chat-thread > :first-child");
    assert.ok(first.includes("overflow: hidden"), "chat layout clips");
    assert.ok(rule(".ui-chat-chips").includes("flex: none"), "chips pinned");
    const thread = rule(".ui-chat-thread");
    assert.ok(thread.includes("overflow: hidden"), "thread clips");
  });

  it("stage never scrolls, drawer keeps its own scroll", () => {
    assert.ok(rule(".ui-chat-stage").includes("overflow: hidden"), "stage clips");
    assert.ok(rule(".ui-chat-stage-body").includes("overflow: hidden"), "stage body clips");
    assert.ok(rule(".ui-chat-drawer").includes("overflow-y: auto"), "drawer scrolls");
  });
});

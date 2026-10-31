// Stage 29h5: the row-thumb street photo credit wraps inside the box.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(HERE, "..", "src", "ui", "ui.css"), "utf8");

function ruleBody(selector) {
  const i = css.indexOf(selector);
  assert.ok(i >= 0, `missing rule ${selector}`);
  const open = css.indexOf("{", i);
  const close = css.indexOf("}", open);
  assert.ok(open >= 0 && close > open, `unclosed rule ${selector}`);
  return css.slice(open + 1, close);
}

describe("29h5 row-thumb street credit", () => {
  it("wraps inside the thumb with left and right set", () => {
    const body = ruleBody(".ui-cand-thumb .ui-street-credit");
    assert.ok(body.includes("white-space: normal"), body);
    assert.ok(body.includes("overflow-wrap: anywhere"), body);
    assert.ok(body.includes("left:"), body);
    assert.ok(body.includes("right:"), body);
  });

  it("leaves the full-card hero pill on one line", () => {
    const body = ruleBody(".ui-street-credit");
    assert.ok(body.includes("white-space: nowrap"), body);
  });

  it("never truncates the credit with dots", () => {
    assert.ok(!css.includes("ellipsis"), "no ellipsis");
    assert.ok(!css.includes("text-overflow"), "no text-overflow");
  });
});

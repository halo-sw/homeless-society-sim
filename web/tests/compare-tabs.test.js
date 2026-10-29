// Stage 11: the compare card's two-level tabs (groups 비교 · 돈 · 안심 ·
// 매물) keep every label fully readable — no squeezed "A.." tabs — and
// every old ?tab= id still resolves. Plus the jsdom-free layout check:
// our CSS carries no ellipsis truncation and Korean wraps at spaces.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { COMPARE_TABS, COMPARE_GROUPS, VALID_COMPARE_TABS,
  groupForTab, labelForTab, resolveTabId, tabsInGroup } from "../src/ui/compare-tabs.js";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("compare tab groups", () => {
  it("covers every tab in exactly one group", () => {
    const seen = new Map();
    for (const g of COMPARE_GROUPS) {
      for (const t of g.tabs) {
        assert.ok(!seen.has(t), `${t} in two groups`);
        seen.set(t, g.id);
      }
    }
    assert.deepEqual([...seen.keys()].sort(), [...VALID_COMPARE_TABS].sort());
  });

  it("groups 비교 · 돈 · 안심 · 매물 with the brief's members", () => {
    assert.deepEqual(COMPARE_GROUPS.map((g) => g.label), ["비교", "돈", "안심", "매물"]);
    assert.deepEqual(tabsInGroup("compare"), ["compare", "priorities", "quality", "criteria"]);
    assert.deepEqual(tabsInGroup("money"), ["money", "worthit"]);
    assert.deepEqual(tabsInGroup("safety"), ["safety", "jeonse", "support"]);
    assert.deepEqual(tabsInGroup("listings"), ["listings", "listings-public"]);
    assert.equal(groupForTab("money"), "money");
    assert.equal(groupForTab("jeonse"), "safety");
    assert.equal(groupForTab("listings-public"), "listings");
  });

  it("keeps every old ?tab= id working", () => {
    for (const id of ["compare", "priorities", "money", "worthit", "quality",
        "safety", "jeonse", "support", "listings", "criteria"]) {
      assert.equal(resolveTabId(id), id, id);
    }
    assert.equal(resolveTabId("listings-public"), "listings-public");
    assert.equal(resolveTabId("nope"), "");
    assert.equal(resolveTabId(""), "");
    assert.equal(resolveTabId(null), "");
  });

  it("labels every tab fully (short enough to fit, never an ellipsis)", () => {
    for (const t of COMPARE_TABS) {
      assert.ok(t.label.length >= 1, t.value);
      assert.ok(t.label.length <= 7, `${t.value}: ${JSON.stringify(t.label)} too long to fit`);
      assert.ok(!t.label.includes("…") && !t.label.includes("..."), t.value);
    }
    assert.equal(labelForTab("priorities"), "내 기준");
    assert.equal(labelForTab("criteria"), "기준");
    assert.equal(labelForTab("listings"), "내가 본 매물");
    assert.equal(labelForTab("listings-public"), "공공 공고");
  });

  it("never truncates labels in CSS and wraps Korean at spaces", () => {
    const css = readFileSync(join(HERE, "..", "src", "ui", "ui.css"), "utf8");
    assert.ok(!css.includes("text-overflow"), "no ellipsis truncation in ui.css");
    assert.ok(!css.includes("…"), "no ellipsis glyph in ui.css");
    assert.ok(css.includes("word-break: keep-all"), "Korean wraps at spaces");
    assert.ok(css.includes("overflow-wrap: anywhere"), "long strings still break");
    const style = readFileSync(join(HERE, "..", "src", "style.css"), "utf8");
    assert.ok(!style.includes("text-overflow"), "no ellipsis truncation in style.css");
  });
});

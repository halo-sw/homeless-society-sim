// 19f: landing says what happens next — heading first, three steps,
// white example cards, visible city (no scrim blur).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

register("./jsx-loader.mjs", import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));

const { renderToString } = await import("react-dom/server");
const { default: React } = await import("react");
const { Theme } = await import("@astryxdesign/core/theme");
const { neutralTheme } = await import("@astryxdesign/theme-neutral/built");
const landing = await import("../src/ui/landing.jsx");

function render(el) {
  return renderToString(
    React.createElement(Theme, { theme: neutralTheme, mode: "light" }, el));
}

const textOf = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

describe("landing 19f", () => {
  it("shows the heading before the sub-line", () => {
    const html = render(React.createElement(landing.Landing));
    const h = html.indexOf(landing.LANDING_HEADING);
    const s = html.indexOf(landing.LANDING_SUB);
    assert.ok(h !== -1, "heading rendered");
    assert.ok(s !== -1, "sub rendered");
    assert.ok(h < s, "heading appears before the sub-line");
  });

  it("lists the three steps in order under the composer", () => {
    const html = render(React.createElement(landing.Landing));
    const steps = ["말로 조건 말하기", "지도에서 후보 2곳 담기", "30일 살아 보고 비교"];
    let at = -1;
    for (const step of steps) {
      const i = html.indexOf(step);
      assert.ok(i !== -1, `step rendered: ${step}`);
      assert.ok(i > at, `step in order: ${step}`);
      at = i;
    }
    assert.ok(html.includes("ui-landing-steps"));
  });

  it("shows each persona title once with an 예시 chip (listing card has none)", () => {
    const html = render(React.createElement(landing.Landing));
    const text = textOf(html);
    for (const p of landing.EXAMPLE_PROMPTS) {
      assert.equal(text.split(p.title).length - 1, 1, `title once: ${p.title}`);
    }
    assert.ok(text.includes("매물 글 붙여 넣기"));
    const chips = text.match(/예시/g) || [];
    assert.equal(chips.length, 3, `예시 chips: ${chips.length}`);
  });

  it("leaves the city visible: scrim has no backdrop-filter", () => {
    const css = readFileSync(join(HERE, "..", "src", "ui", "ui.css"), "utf8");
    const start = css.indexOf(".ui-landing-scrim");
    assert.ok(start !== -1, "scrim rule exists");
    const block = css.slice(start, css.indexOf("}", start));
    assert.ok(!block.includes("backdrop-filter"), "no backdrop-filter on the scrim");
    assert.ok(block.includes("radial-gradient"), "radial veil");
  });
});

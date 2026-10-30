// 17-1: Ithaca product name. Source scan (no "주거 시뮬레이터" left
// in UI sources) + render checks for the top bar and landing brand lines.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

register("./jsx-loader.mjs", import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");

const { renderToString } = await import("react-dom/server");
const { default: React } = await import("react");
const { Theme } = await import("@astryxdesign/core/theme");
const { neutralTheme } = await import("@astryxdesign/theme-neutral/built");
const landing = await import("../src/ui/landing.jsx");
const { TopBar } = await import("../src/ui/topbar.jsx");

function render(el) {
  return renderToString(
    React.createElement(Theme, { theme: neutralTheme, mode: "light" }, el));
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

describe("17-1 Ithaca name", () => {
  it("no 주거 시뮬레이터 left in UI sources or index.html", () => {
    const files = [...walk(SRC), join(HERE, "..", "index.html")];
    const hits = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      if (text.includes("주거 시뮬레이터")) hits.push(f);
    }
    assert.deepEqual(hits, []);
  });

  it("top bar shows Ithaca with no subtitle", () => {
    const html = render(React.createElement(TopBar,
      { mode: "chat", summary: "", settings: { mode: "chat" } }));
    assert.ok(html.includes("ui-bar-title"), "title class");
    assert.ok(html.includes(">Ithaca<"), "latin product name");
  });

  it("landing shows the brand line, headline and tagline", () => {
    const html = render(React.createElement(landing.Landing));
    const text = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    assert.ok(text.includes("Ithaca · The Pre-living Agent for Your Next Home"));
    assert.ok(text.includes("계약 전에, 그 집에서 30일 먼저 살아 봐요"));
    assert.ok(text.includes("We walk the odyssey. You just come home."));
  });

  it("document titles and share footer use Ithaca", () => {
    const main = readFileSync(join(SRC, "main.js"), "utf8");
    assert.ok(main.includes("Ithaca — 대화"));
    assert.ok(main.includes("Ithaca — ${area.label || areaId}"));
    assert.ok(main.includes("Ithaca — ${homeLabel} · ${run.meta.complex}"));
    const share = readFileSync(join(SRC, "ui", "share.js"), "utf8");
    assert.ok(share.includes("Ithaca · 파일은 이 브라우저에만 저장돼요"));
    const index = readFileSync(join(HERE, "..", "index.html"), "utf8");
    assert.ok(index.includes("<title>Ithaca — 미니어처 3D</title>"));
  });

  it("landing scrim is a bright warm-white veil (18: AA over the 3D)", () => {
    // 18: the 65% veil left light-grey copy on a light 3D scene. The
    // 88% warm-white veil + stronger blur keeps the headline, input and
    // example chips at their solid-surface contrast (ink2 on page ≈ 6:1).
    const css = readFileSync(join(SRC, "ui", "ui.css"), "utf8");
    const scrim = css.match(/\.ui-landing-scrim \{[^}]*\}/)[0];
    assert.ok(!scrim.includes("12, 14, 18"), "no dark grey veil");
    assert.ok(scrim.includes("--ui-page"), "warm white token");
    const pct = Number((scrim.match(/--ui-page\) (\d+)%/) || [])[1]);
    assert.ok(pct >= 85, `veil ${pct}% keeps copy at AA`);
    assert.ok(/blur\((1[2-9]|[2-9]\d)px\)/.test(scrim), "background blurred flat");
  });
});

// Stage 32e: the real Ithaca SVG logo in the landing nav, the landing
// footer and the chat top bar. SSR + CSS + asset contract (node --test,
// no DOM).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(here, "..", "src", "ui", "ui.css"), "utf8");

// Inner HTML of the first element with the given class.
function innerOf(html, cls) {
  const m = html.match(new RegExp(`<[^>]*class="${cls}"[^>]*>([\\s\\S]*?)<\\/[^>]+>`));
  assert.ok(m, `${cls} present`);
  return m[1];
}

// Visible text inside an element (tags stripped; attributes excluded).
function textOfInner(inner) {
  return inner.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function logoImg(inner) {
  const m = inner.match(/<img[^>]*>/);
  assert.ok(m, "logo img present");
  return m[0];
}

describe("32e Ithaca logo (SSR, no DOM)", () => {
  let React;
  let renderToStaticMarkup;
  let LandingPage;
  let TopBar;
  let Theme;
  let neutralTheme;

  before(async () => {
    React = (await import("react")).default;
    ({ renderToStaticMarkup } = await import("react-dom/server"));
    ({ LandingPage } = await import("../src/ui/landing-page.jsx"));
    ({ TopBar } = await import("../src/ui/topbar.jsx"));
    ({ Theme } = await import("@astryxdesign/core/theme"));
    ({ neutralTheme } = await import("@astryxdesign/theme-neutral/built"));
  });

  it("landing nav shows the logo link, not bare text", () => {
    const html = renderToStaticMarkup(React.createElement(LandingPage));
    assert.ok(html.includes('class="ds-lp-brand"'), "nav brand present");
    assert.ok(html.includes('href="#top"'), "brand links to the top");
    assert.ok(html.includes('aria-label="Ithaca"'), "brand link named");
    const inner = innerOf(html, "ds-lp-brand");
    const img = logoImg(inner);
    assert.ok(/src="[^"]*brand\/ithaca-logo\.svg"/.test(img), "src ends with brand/ithaca-logo.svg");
    assert.ok(img.includes('alt="Ithaca"'), "alt stays the name");
    assert.ok(img.includes('height="24"'), "nav logo 24px high");
    assert.ok(/width="100"/.test(img), "explicit width, no shift");
    assert.ok(!textOfInner(inner).includes("Ithaca"), "no bare Ithaca text in the nav brand");
  });

  it("landing footer brand shows the logo; the tagline stays", () => {
    const html = renderToStaticMarkup(React.createElement(LandingPage));
    const inner = innerOf(html, "ds-lp-foot-brand");
    const img = logoImg(inner);
    assert.ok(/src="[^"]*brand\/ithaca-logo\.svg"/.test(img), "footer logo src");
    assert.ok(img.includes('alt="Ithaca"'), "alt stays the name");
    assert.ok(img.includes('height="20"'), "footer logo 20px high");
    assert.ok(textOfInner(inner).includes("We walk the odyssey. You just come home."), "tagline stays");
    assert.ok(!textOfInner(inner).includes("Ithaca"), "no bare Ithaca text in the footer brand");
  });

  it("top bar in chat mode shows the logo with no bare text", () => {
    const html = renderToStaticMarkup(
      React.createElement(Theme, { theme: neutralTheme, mode: "light" },
        React.createElement(TopBar, { mode: "chat", summary: "", settings: { mode: "chat" } })));
    const inner = innerOf(html, "ui-bar-title");
    const img = logoImg(inner);
    assert.ok(/src="[^"]*brand\/ithaca-logo\.svg"/.test(img), "top-bar logo src");
    assert.ok(img.includes('alt="Ithaca"'), "alt stays the name");
    assert.ok(img.includes('height="20"'), "top-bar logo 20px high");
    assert.ok(!textOfInner(inner).includes("Ithaca"), "no bare Ithaca text in the title");
    assert.ok(html.includes("brand/muse-logo.png"), "Muse badge keeps its place");
  });

  it("the asset exists with the 0 0 1628 389 viewBox", () => {
    const p = path.join(here, "..", "public", "brand", "ithaca-logo.svg");
    assert.ok(fs.existsSync(p), "asset file present");
    const svg = fs.readFileSync(p, "utf8");
    assert.ok(svg.includes('viewBox="0 0 1628 389"'), "viewBox kept");
  });

  it("keeps the 32e CSS contract", () => {
    const logo = css.match(/\.ds-ithaca-logo\s*\{[^}]*\}/);
    assert.ok(logo && logo[0].includes("display: block"), "logo is block");
    const nav = css.match(/\.ds-lp-brand\s+\.ds-ithaca-logo\s*\{[^}]*\}/);
    assert.ok(nav && nav[0].includes("var(--ds-s-24)"), "nav logo from the scale");
    const foot = css.match(/\.ds-lp-foot-brand\s+\.ds-ithaca-logo\s*\{[^}]*\}/);
    assert.ok(foot && foot[0].includes("var(--ds-t-20)"), "footer logo from the scale");
    const bar = css.match(/\.ui-bar-left\s+\.ds-ithaca-logo\s*\{[^}]*\}/g);
    assert.ok(bar && bar.some((r) => r.includes("var(--ds-t-20)")), "top-bar logo from the scale");
    assert.ok(bar && bar.some((r) => r.includes("height: 18px")), "phone logo steps to 18px");
    const brand = css.match(/\.ds-lp-brand\s*\{[^}]*\}/);
    assert.ok(brand && brand[0].includes("flex: none"), "nav brand keeps flex: none");
    assert.ok(brand && brand[0].includes("white-space: nowrap"), "nav brand never wraps");
  });
});

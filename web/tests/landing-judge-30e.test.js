// 30e: the hero judge buttons render as buttons (ds-lp-judge, not ds-lp-cta).
// 31c: two judge links only — the 서울로 duplicate is gone.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, p), "utf8");

describe("30e landing hero judge buttons (SSR, no DOM)", () => {
  let React;
  let renderToStaticMarkup;
  let LandingPage;

  before(async () => {
    React = (await import("react")).default;
    ({ renderToStaticMarkup } = await import("react-dom/server"));
    ({ LandingPage } = await import("../src/ui/landing-page.jsx"));
  });

  it("the two hero links sit inside ds-lp-judge, not ds-lp-cta", () => {
    const html = renderToStaticMarkup(React.createElement(LandingPage));
    const judge = html.match(/<div class="ds-lp-judge">([\s\S]*?)<\/div>/);
    assert.ok(judge, "hero ds-lp-judge wrapper missing");
    const links = judge[1].match(/<a /g) || [];
    assert.equal(links.length, 2);
    assert.ok(judge[1].includes("ds-lp-btn--primary"));
    assert.ok(judge[1].includes("ds-lp-btn--secondary"));
    assert.ok(!html.includes("서울로 해 보기"));
  });

  it("ds-lp-cta appears exactly once, on the bottom section", () => {
    const html = renderToStaticMarkup(React.createElement(LandingPage));
    const uses = html.match(/ds-lp-cta(?![\w-])/g) || [];
    assert.equal(uses.length, 1);
    assert.ok(html.includes('<section class="ds-lp-cta"'));
  });

  it("the replay note uses a class, not an inline style", () => {
    const html = renderToStaticMarkup(React.createElement(LandingPage));
    assert.ok(html.includes("ds-lp-replaynote"));
    const note = html.match(/<p class="ds-lp-replaynote"([^>]*)>/);
    assert.ok(note, "replay note missing");
    assert.ok(!note[1].includes("style"));
    const css = read("../src/ui/ui.css");
    assert.match(css, /\.ds-lp-replaynote\s*\{[^}]*var\(--ds-ink-2\)/);
  });

  it("ui.css has the judge button rules and no ellipsis", () => {
    const css = read("../src/ui/ui.css");
    assert.match(css, /\.ds-lp-btn--primary\s*\{[^}]*background:/);
    assert.match(css, /\.ds-lp-btn\s*\{[^}]*height:/);
    assert.match(css, /\.ds-lp-judge\s*\{[^}]*display:\s*flex/);
    assert.match(css, /\.ds-lp-judge\s*\{[^}]*flex-wrap:\s*wrap/);
    assert.ok(!css.includes("ellipsis"), "ui.css must not contain ellipsis");
  });
});

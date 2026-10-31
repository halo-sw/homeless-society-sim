// 29a10: landing hero — eyebrow, one "try it" panel, nav that never breaks.
// SSR + CSS contract (node --test, no DOM).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, p), "utf8");

describe("29a10 landing hero (SSR, no DOM)", () => {
  let React;
  let renderToStaticMarkup;
  let LandingPage;

  before(async () => {
    React = (await import("react")).default;
    ({ renderToStaticMarkup } = await import("react-dom/server"));
    ({ LandingPage } = await import("../src/ui/landing-page.jsx"));
  });

  it("shows the English eyebrow line, untouched by translation", () => {
    const html = renderToStaticMarkup(React.createElement(LandingPage));
    assert.ok(html.includes("Pre-simulation by Muse Agent"));
    assert.ok(!html.includes("Muse가 대신 확인하고"));
  });

  it("wraps the judge buttons in one try-it panel with captions", () => {
    const html = renderToStaticMarkup(React.createElement(LandingPage));
    assert.ok(html.includes("ds-lp-try"));
    assert.ok(html.includes("바로 해 보기"));
    assert.ok(html.includes("키 없이 바로 재생"));
    const live = html.match(/Muse 실시간 · 하루 한도/g) || [];
    assert.equal(live.length, 2);
  });

  it("ds-lp-judge still holds exactly 3 links, one primary", () => {
    const html = renderToStaticMarkup(React.createElement(LandingPage));
    const judge = html.match(/<div class="ds-lp-judge">([\s\S]*?)<\/div>\s*<div class="ds-lp-proof">/);
    assert.ok(judge, "hero ds-lp-judge wrapper missing");
    const links = judge[1].match(/<a /g) || [];
    assert.equal(links.length, 3);
    assert.ok(judge[1].includes("ds-lp-btn--primary"));
  });

  it("drops the replay note and shows one credit in the hero header", () => {
    const html = renderToStaticMarkup(React.createElement(LandingPage));
    assert.ok(!html.includes("ds-lp-replaynote"));
    assert.ok(!html.includes("13px"));
    const hero = html.match(/<header class="ds-lp-hero">([\s\S]*?)<\/header>/);
    assert.ok(hero, "hero header missing");
    const credits = hero[1].match(/class="ds-pbm"/g) || [];
    assert.equal(credits.length, 1);
  });

  it("keeps the 29a10 landing CSS contract", () => {
    const css = read("../src/ui/ui.css");
    assert.match(css, /\.ds-lp\s*\{[^}]*word-break:\s*keep-all/);
    assert.match(css, /\.ds-lp-links a\s*\{[^}]*white-space:\s*nowrap/);
    assert.match(css, /@media\s*\(max-width:\s*720px\)[\s\S]*?\.ds-lp-links\s*\{\s*display:\s*none;\s*\}/);
    assert.ok(css.includes(".ds-lp-try"), "try panel rule missing");
    assert.ok(!css.includes("13px"), "ui.css must not contain 13px");
    assert.ok(!css.includes("ellipsis"), "ui.css must not contain ellipsis");
  });
});

// 29a12: Ithaca poster opens the landing page (SSR + CSS contract).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const ALT = "Ithaca — The Pre-living Agent for Your Next Home. We walk the odyssey. You just come home.";

describe("29a12 landing poster (SSR, no DOM)", () => {
  let React;
  let renderToStaticMarkup;
  let LandingPage;

  before(async () => {
    React = (await import("react")).default;
    ({ renderToStaticMarkup } = await import("react-dom/server"));
    ({ LandingPage } = await import("../src/ui/landing-page.jsx"));
  });

  it("renders the poster image with dimensions and alt text", () => {
    const html = renderToStaticMarkup(React.createElement(LandingPage));
    assert.ok(html.includes('class="ds-lp-poster"') || html.includes("ds-lp-poster"));
    assert.ok(html.includes("<img"));
    assert.ok(html.includes("landing/ithaca-intro.jpg"));
    assert.ok(html.includes('width="1536"'));
    assert.ok(html.includes('height="1024"'));
    assert.ok(html.includes(ALT));
  });

  it("places the poster after the notice and before the heroband", () => {
    const html = renderToStaticMarkup(React.createElement(LandingPage));
    const notice = html.indexOf("ds-lp-notice");
    const poster = html.indexOf("ds-lp-poster");
    const hero = html.indexOf("ds-lp-heroband");
    assert.ok(notice !== -1 && poster !== -1 && hero !== -1);
    assert.ok(notice < poster, "poster comes after the notice");
    assert.ok(poster < hero, "poster comes before the heroband");
  });

  it("ships the JPEG file with JPEG magic bytes", () => {
    const p = path.join(here, "..", "public", "landing", "ithaca-intro.jpg");
    assert.ok(fs.existsSync(p), "poster file exists");
    const buf = fs.readFileSync(p);
    assert.ok(buf.length > 0);
    assert.equal(buf[0], 0xff);
    assert.equal(buf[1], 0xd8);
  });

  it("styles the poster band and image in ui.css", () => {
    const css = fs.readFileSync(path.join(here, "..", "src", "ui", "ui.css"), "utf8");
    assert.ok(css.includes(".ds-lp-poster"));
    assert.ok(css.includes("--ds-lp-poster-bg"));
    assert.ok(css.includes(".ds-lp-posterimg"));
    assert.ok(css.includes("object-fit: contain"));
    const m = css.match(/@media\s*\(\s*max-width:\s*720px\s*\)\s*\{[\s\S]*?\.ds-lp-posterimg\s*\{[\s\S]*?max-height:\s*none/s);
    assert.ok(m, "720px block sets .ds-lp-posterimg max-height: none");
  });
});

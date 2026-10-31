// Stage 28f: landing beauty — bands, hero proof, product window, dark
// closing. SSR + CSS contract (node --test, no DOM).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(here, "..", "src", "ui", "ui.css"), "utf8");
// 28d–28f landing text: from the 28d marker to the end of the file.
const landingCss = css.slice(css.indexOf("/* 28d landing */"));

describe("28f landing visual (SSR, no DOM)", () => {
  let React;
  let renderToStaticMarkup;
  let LandingPage;

  before(async () => {
    React = (await import("react")).default;
    ({ renderToStaticMarkup } = await import("react-dom/server"));
    ({ LandingPage } = await import("../src/ui/landing-page.jsx"));
  });

  it("shows the hero proof, callouts and closing lines", () => {
    const html = renderToStaticMarkup(React.createElement(LandingPage));
    for (const s of [
      "Pre-simulation by Muse Agent",
      "14초",
      "85초",
      "8/8",
      "▸ 실거래 확인",
      "We walk the odyssey. You just come home.",
      "© 2026",
      "기능",
      "비교",
      "문제",
      "쓰임",
      "순서",
      "예시",
      "질문",
      "데이터",
    ]) assert.ok(html.includes(s), s);
  });

  it("never ranks or picks for the customer", () => {
    const html = renderToStaticMarkup(React.createElement(LandingPage));
    for (const s of ["추천", "우승", "네가"]) assert.ok(!html.includes(s), s);
  });

  it("keeps the 28f landing CSS contract", () => {
    assert.ok(landingCss.includes(".ds-lp-numcard .ds-lp-num"), "number specificity fix");
    assert.ok(landingCss.includes("prefers-reduced-motion"), "reduced motion respected");
    assert.ok(landingCss.includes("calc(var(--ds-s-48) * 2)"), "spacing from tokens");
    const cta = landingCss.match(/\.ds-lp-cta\s*\{[^}]*background: var\(--ds-action\)[^}]*\}/);
    assert.ok(cta, "dark CTA band");
  });

  it("28g: hero wash on the full-width band, phone nav pinned right", () => {
    const heroBand = landingCss.match(/\.ds-lp-heroband\s*\{[^}]*\}/);
    assert.ok(heroBand && heroBand[0].includes("radial-gradient"), ".ds-lp-heroband has the radial-gradient wash");
    assert.ok(!/\.ds-lp-hero\s*\{[^}]*radial-gradient/.test(landingCss), "wash is not painted on the 760px hero column");
    const from720 = landingCss.slice(landingCss.indexOf("@media (max-width: 720px)"));
    assert.ok(
      /\.ds-lp-links\s*\{\s*display:\s*none;\s*\}/.test(from720)
        && /\.ds-lp-nav-right\s*\{[^}]*margin-left:\s*auto/.test(from720),
      "720px block hides the nav links and pins the nav right group right",
    );
  });
});

// 28d: the landing at / — routing, SSR copy pins, source pins.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, p), "utf8");

describe("28d landing page (SSR, no DOM)", () => {
  let React;
  let renderToStaticMarkup;
  let routeForSearch;
  let bootKindFor;
  let appEntryUrl;
  let LandingPage;
  let EXAMPLE_PROMPTS;

  before(async () => {
    React = (await import("react")).default;
    ({ renderToStaticMarkup } = await import("react-dom/server"));
    ({ routeForSearch, bootKindFor, appEntryUrl } =
      await import("../src/chat/urls.js"));
    ({ LandingPage } = await import("../src/ui/landing-page.jsx"));
    ({ EXAMPLE_PROMPTS } = await import("../src/ui/landing.jsx"));
  });

  it("routes / to landing, keeps chat/sim/tour links", () => {
    assert.equal(routeForSearch(""), "landing");
    assert.equal(routeForSearch("?lang=en"), "landing");
    assert.equal(routeForSearch("?chat="), "chat");
    assert.equal(routeForSearch("?chat=hi"), "chat");
    assert.equal(routeForSearch("?app=1"), "chat");
    assert.equal(routeForSearch("?mode=sim"), "sim");
    assert.equal(routeForSearch("?tour=demo"), "tour");
    assert.equal(bootKindFor("landing"), "landing");
    assert.ok(appEntryUrl().endsWith("?chat="));
  });

  it("renders the landing copy", () => {
    const html = renderToStaticMarkup(React.createElement(LandingPage));
    for (const s of [
      "어떤 집을 고민 중이세요?",
      "Powered by",
      "muse-logo.png",
      "다루는 지역 11곳",
      "먼저 한 문장만 물어보세요.",
      "서울 동남권",
      "features",
      "living",
      "faq",
      "data",
    ]) assert.ok(html.includes(s), s);
    for (const p of EXAMPLE_PROMPTS) assert.ok(html.includes(p.prompt), p.id);
    for (const s of ["추천", "우승", "네가", "네 조건", "분당오벨리스크"]) {
      assert.ok(!html.includes(s), `must not contain ${s}`);
    }
  });

  it("pins the font, the i18n seed and the boot", () => {
    assert.ok(read("../index.html").includes("Noto+Serif+KR"));
    assert.ok(read("../src/i18n/en.js").includes("먼저 한 문장만 물어보세요."));
    assert.ok(read("../src/main.js").includes("bootLanding"));
  });
});

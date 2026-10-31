// 31l: landing hero follows main — eyebrow, one ds-lp-try panel with three
// captioned entries, proof facts as a stat row (SSR, no DOM).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, p), "utf8");

describe("31l landing hero order (SSR, no DOM)", () => {
  let React;
  let renderToStaticMarkup;
  let LandingPage;

  before(async () => {
    React = (await import("react")).default;
    ({ renderToStaticMarkup } = await import("react-dom/server"));
    ({ LandingPage } = await import("../src/ui/landing-page.jsx"));
  });

  it("shows the eyebrow with Pre-simulation by Muse Agent", () => {
    const html = renderToStaticMarkup(React.createElement(LandingPage));
    assert.ok(html.includes("ds-lp-heroeyebrow"), "eyebrow class missing");
    assert.ok(html.includes("Pre-simulation by Muse Agent"), "eyebrow text missing");
  });

  it("ds-lp-try holds the three entries in order, each with a caption", () => {
    const html = renderToStaticMarkup(React.createElement(LandingPage));
    const panel = html.match(/<section class="ds-lp-try"([\s\S]*?)<\/section>/);
    assert.ok(panel, "hero ds-lp-try panel missing");
    const body = panel[1];
    const first = body.indexOf("기록된 한 달 보기");
    const second = body.indexOf("Meta 본사 출근으로 해 보기");
    const third = body.indexOf("서울로 해 보기");
    assert.ok(first !== -1 && second !== -1 && third !== -1, "all three entries present");
    assert.ok(first < second && second < third, "order");
    const links = body.match(/<a /g) || [];
    assert.equal(links.length, 3);
    const primaries = body.match(/ds-lp-btn--primary/g) || [];
    assert.equal(primaries.length, 1);
    assert.ok(body.indexOf("ds-lp-btn--primary") < body.indexOf("ds-lp-btn--secondary"), "first is primary");
    const caps = body.match(/ds-lp-judgecap/g) || [];
    assert.equal(caps.length, 3);
    assert.ok(body.indexOf("기록된 한 달 보기") < body.indexOf("키 없이 바로 재생"), "first caption follows first entry");
  });

  it("has no ds-lp-replaynote", () => {
    const html = renderToStaticMarkup(React.createElement(LandingPage));
    assert.ok(!html.includes("ds-lp-replaynote"), "replay note must be gone");
  });

  it("ds-lp-chips still holds the 3 chips", () => {
    const html = renderToStaticMarkup(React.createElement(LandingPage));
    const chips = html.match(/<div class="ds-lp-chips">([\s\S]*?)<\/div>/);
    assert.ok(chips, "hero ds-lp-chips wrapper missing");
    const buttons = chips[1].match(/<button /g) || [];
    assert.equal(buttons.length, 3);
    for (const s of ["출근지로 집 찾기", "본 매물 붙여 넣기", "예시로 써 보기"]) {
      assert.ok(chips[1].includes(s), s);
    }
  });

  it("each proof fact renders its number and caption as separate elements", () => {
    const html = renderToStaticMarkup(React.createElement(LandingPage));
    const proof = html.match(/<div class="ds-lp-proof">([\s\S]*?)<\/div>/);
    assert.ok(proof, "hero ds-lp-proof wrapper missing");
    const facts = proof[1].match(/ds-lp-prooffact/g) || [];
    assert.equal(facts.length, 3);
    assert.ok(!proof[1].includes("·"), "no mid-dot separator in the stat row");
    for (const [num, rest] of [["14초", "후보 6곳 찾기"], ["85초", "두 집 30일 살아 보기"], ["8/8", "일기 문장 기록과 대조"]]) {
      assert.ok(proof[1].includes(`<b>${num}</b>`), `number element: ${num}`);
      assert.ok(proof[1].includes(`<span>${rest}</span>`), `caption element: ${rest}`);
    }
  });

  it("ui.css: eyebrow rule exists, proof is a 3-column grid, no 13px, no ellipsis", () => {
    const css = read("../src/ui/ui.css");
    assert.match(css, /\.ds-lp-heroeyebrow\s*\{[^}]*display:\s*inline-flex/);
    assert.match(css, /\.ds-lp-proof\s*\{[^}]*display:\s*grid/);
    assert.match(css, /\.ds-lp-proof\s*\{[^}]*repeat\(3,/);
    assert.ok(!css.includes("13px"), "ui.css must not contain 13px");
    assert.ok(!css.includes("ellipsis"), "ui.css must not contain ellipsis");
  });
});

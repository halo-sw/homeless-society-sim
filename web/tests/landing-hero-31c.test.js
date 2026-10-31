// 31c: landing hero — one clear order, no fake pill, two judge links,
// proof facts as a stat row (SSR, no DOM).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, p), "utf8");

describe("31c landing hero order (SSR, no DOM)", () => {
  let React;
  let renderToStaticMarkup;
  let LandingPage;

  before(async () => {
    React = (await import("react")).default;
    ({ renderToStaticMarkup } = await import("react-dom/server"));
    ({ LandingPage } = await import("../src/ui/landing-page.jsx"));
  });

  it("has no eyebrow pill", () => {
    const html = renderToStaticMarkup(React.createElement(LandingPage));
    assert.ok(!html.includes("ds-lp-heroeyebrow"), "eyebrow must be gone");
  });

  it("ds-lp-judge holds exactly 2 links: recorded month then Meta HQ", () => {
    const html = renderToStaticMarkup(React.createElement(LandingPage));
    const judge = html.match(/<div class="ds-lp-judge">([\s\S]*?)<\/div>/);
    assert.ok(judge, "hero ds-lp-judge wrapper missing");
    const links = judge[1].match(/<a /g) || [];
    assert.equal(links.length, 2);
    const first = judge[1].indexOf("기록된 한 달 보기");
    const second = judge[1].indexOf("Meta 본사 출근으로 해 보기");
    assert.ok(first !== -1 && second !== -1 && first < second, "order");
    assert.ok(judge[1].includes("ds-lp-btn--primary"), "primary first");
    assert.ok(judge[1].includes("ds-lp-btn--secondary"), "secondary second");
  });

  it("no 서울로 해 보기 anywhere", () => {
    const html = renderToStaticMarkup(React.createElement(LandingPage));
    assert.ok(!html.includes("서울로 해 보기"), "duplicate link must be gone");
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

  it("the replay note has a class and no inline style", () => {
    const html = renderToStaticMarkup(React.createElement(LandingPage));
    const note = html.match(/<p class="ds-lp-replaynote"([^>]*)>/);
    assert.ok(note, "replay note missing");
    assert.ok(!note[1].includes("style"), "no inline style on the note");
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

  it("ui.css: proof is a 3-column grid, no eyebrow, no 13px, no ellipsis", () => {
    const css = read("../src/ui/ui.css");
    assert.match(css, /\.ds-lp-proof\s*\{[^}]*display:\s*grid/);
    assert.match(css, /\.ds-lp-proof\s*\{[^}]*repeat\(3,\s*1fr\)/);
    assert.ok(!css.includes("ds-lp-heroeyebrow"), "eyebrow CSS must be gone");
    assert.ok(!css.includes("13px"), "ui.css must not contain 13px");
    assert.ok(!css.includes("ellipsis"), "ui.css must not contain ellipsis");
  });
});

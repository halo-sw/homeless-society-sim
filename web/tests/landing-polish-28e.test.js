// Stage 28e: landing polish — every section headed, phone nav on one
// line, big number cards, left-aligned hero composer, 16/10 frames.
// SSR + CSS contract (node --test, no DOM).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(here, "..", "src", "ui", "ui.css"), "utf8");
const en = fs.readFileSync(path.join(here, "..", "src", "i18n", "en.js"), "utf8");

// All @media (max-width: 480px) blocks in ui.css, joined.
function phoneBlocks() {
  const blocks = [];
  let from = 0;
  for (;;) {
    const at = css.indexOf("@media (max-width: 480px)", from);
    if (at < 0) break;
    let depth = 0;
    let started = false;
    let end = -1;
    for (let i = at; i < css.length; i += 1) {
      if (css[i] === "{") { depth += 1; started = true; }
      if (css[i] === "}") {
        depth -= 1;
        if (started && depth === 0) { end = i; break; }
      }
    }
    assert.ok(end > at, "balanced braces in phone media block");
    blocks.push(css.slice(at, end + 1));
    from = end + 1;
  }
  assert.ok(blocks.length > 0, "ui.css has a @media (max-width: 480px) block");
  return blocks.join("\n");
}

describe("28e landing polish (SSR, no DOM)", () => {
  let React;
  let renderToStaticMarkup;
  let LandingPage;

  before(async () => {
    React = (await import("react")).default;
    ({ renderToStaticMarkup } = await import("react-dom/server"));
    ({ LandingPage } = await import("../src/ui/landing-page.jsx"));
  });

  it("gives every section a heading", () => {
    const html = renderToStaticMarkup(React.createElement(LandingPage));
    for (const s of [
      "Muse가 하는 일",
      "직접 찾기·챗봇과 무엇이 다른가요",
      "이럴 때 써요",
      "이렇게 움직여요",
      "이렇게 물어보세요",
      "자주 묻는 질문",
      "쓰는 데이터",
    ]) assert.ok(html.includes(s), s);
  });

  it("spells out the four steps as title plus one line", () => {
    const html = renderToStaticMarkup(React.createElement(LandingPage));
    for (const s of [
      "출근지·예산·같이 사는 사람을 한 문장으로",
      "실거래·출근길을 직접 찾아보고 ▸ 줄로 남겨요",
      "지도·동네·비교는 말할 때만 열려요",
      "일기 문장은 모두 기록과 대조해요",
    ]) assert.ok(html.includes(s), s);
  });

  it("keeps the 28e landing CSS contract", () => {
    const brand = css.match(/\.ds-lp-brand\s*\{[^}]*\}/);
    assert.ok(brand && brand[0].includes("white-space: nowrap"), "brand never wraps");
    const phones = phoneBlocks();
    assert.ok(phones.includes(".ds-lp-nav .ds-pbm-text"), "nav keeps only the logo on phones");
    assert.ok(css.includes("aspect-ratio: 16 / 10"), "shot frames are 16/10");
    const num = css.match(/\.ds-lp-num\s*\{[^}]*\}/);
    assert.ok(num && num[0].includes("var(--ds-t-40)"), "number cards lead with the number");
  });

  it("covers the new strings in en.js", () => {
    assert.ok(en.includes("이럴 때 써요"), "use-cases heading translated");
  });
});

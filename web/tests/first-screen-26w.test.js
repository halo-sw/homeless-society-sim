// Stage 26w: the first screen shows the product, not a white page.
// ChatEmpty carries the landing heading/sub, the four example cards
// (including the US card), the composer and the coverage lines over the
// glide backdrop (SSR, no DOM, no data/build needed).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

register("./jsx-loader.mjs", import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(HERE, "..", "src", "ui", "ui.css"), "utf8");

// The last @media (max-width: 480px) block in ui.css.
function phoneBlock() {
  const at = css.lastIndexOf("@media (max-width: 480px)");
  assert.ok(at >= 0, "ui.css has a @media (max-width: 480px) block");
  let depth = 0;
  let started = false;
  for (let i = at; i < css.length; i += 1) {
    if (css[i] === "{") { depth += 1; started = true; }
    if (css[i] === "}") {
      depth -= 1;
      if (started && depth === 0) return css.slice(at, i + 1);
    }
  }
  throw new Error("unbalanced braces in phone media block");
}

let React;
let renderToString;
let chat;
let landing;
let topbar;

before(async () => {
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
  chat = await import("../src/ui/chat.jsx");
  landing = await import("../src/ui/landing.jsx");
  topbar = await import("../src/ui/topbar.jsx");
});

function emptyHtml() {
  return renderToString(React.createElement(chat.ChatEmpty,
    { onSend: () => {}, onListing: () => {}, onExample: () => {} }));
}

describe("26w first screen content (SSR, no DOM)", () => {
  it("shows the product line and sub-line from the landing", () => {
    const html = emptyHtml();
    assert.ok(html.includes(landing.LANDING_HEADING), "LANDING_HEADING");
    assert.ok(html.includes(landing.LANDING_SUB), "LANDING_SUB");
  });

  it("shows the four example cards, including the US card", () => {
    const html = emptyHtml();
    assert.equal(landing.EXAMPLE_PROMPTS.length, 4, "four examples");
    for (const p of landing.EXAMPLE_PROMPTS) {
      assert.ok(html.includes(p.title), `example title: ${p.title}`);
      assert.ok(html.includes(p.prompt), `example prompt: ${p.id}`);
    }
    assert.ok(html.includes("Meta HQ, Menlo Park (US)"), "US card reachable");
    assert.ok(html.includes("예시"), "예시 badge");
  });

  it("keeps the composer with the question as its label, then coverage last", () => {
    const html = emptyHtml();
    assert.ok(html.includes("어떤 집을 고민 중이세요?"), "composer label line");
    assert.ok(html.includes("예: 판교로 출근해요"), "composer");
    for (const s of chat.EMPTY_STARTERS) {
      assert.ok(html.includes(s.label), `starter ${s.id}`);
    }
    assert.ok(html.includes("다루는 지역"), "coverage line");
    assert.ok(html.includes("미국 1곳"), "US coverage line");
    const lastPrompt = Math.max(...landing.EXAMPLE_PROMPTS.map((p) => html.indexOf(p.prompt)));
    assert.ok(html.indexOf("미국 1곳") > lastPrompt, "coverage stays last");
  });

  it("sends the example prompt through onSend", () => {
    for (const p of landing.EXAMPLE_PROMPTS) {
      let got = null;
      chat.sendExamplePrompt((t) => { got = t; }, p.prompt);
      assert.equal(got, p.prompt, `example ${p.id} sends its prompt`);
    }
  });
});

describe("26w first screen CSS", () => {
  it("has the empty-state backdrop/scrim rule, without blur", () => {
    const at = css.indexOf(".ui-chat-empty-scrim");
    assert.ok(at !== -1, "scrim rule exists");
    const block = css.slice(at, css.indexOf("}", at));
    assert.ok(block.includes("radial-gradient"), "soft light scrim");
    assert.ok(!block.includes("backdrop-filter"), "no blur over the city");
  });

  it("stacks the example cards in one column at phone width", () => {
    const block = phoneBlock();
    assert.ok(block.includes(".ui-chat-empty-cards"), "cards rule in the phone block");
    const rule = block.slice(block.indexOf(".ui-chat-empty-cards"));
    assert.ok(rule.slice(0, 120).includes("1fr"), "one column");
  });

  it("still truncates nothing, anywhere", () => {
    assert.ok(!css.includes("text-overflow"), "no truncation in ui.css");
  });
});

describe("26w2 empty-state backdrop (SSR, no DOM)", () => {
  it("keeps the chat column layers transparent while empty", () => {
    const at = css.indexOf(".ui-chat:has(.ui-chat-thread-empty)");
    assert.ok(at !== -1, "empty-state transparency rule exists");
    const block = css.slice(at, css.indexOf("}", at));
    assert.ok(block.includes(".ui-chat-main:has(.ui-chat-thread-empty)"), "covers the main column");
    assert.ok(block.includes(".ui-chat-thread-empty"), "covers the thread");
    assert.ok(block.includes(".ui-chat-empty"), "covers the empty screen");
    assert.ok(/background:\s*transparent/.test(block), "transparent, not painted over");
  });

  it("washes the scrim translucent, never opaque, never blurred", () => {
    const at = css.indexOf(".ui-chat-empty-scrim");
    assert.ok(at !== -1, "scrim rule exists");
    const block = css.slice(at, css.indexOf("}", at));
    assert.ok(block.includes("radial-gradient"), "radial wash");
    assert.ok(block.includes("color-mix") && block.includes("transparent"), "alpha < 1");
    assert.ok(!block.includes("backdrop-filter"), "no blur over the city");
    const phone = phoneBlock();
    const pat = phone.slice(phone.indexOf(".ui-chat-empty-scrim"));
    assert.ok(pat.includes("color-mix") && pat.includes("transparent"), "phone scrim translucent");
    assert.ok(!pat.slice(0, pat.indexOf("}")).includes("backdrop-filter"), "phone scrim unblurred");
  });

  it("never wraps the badge; the title shrinks instead", () => {
    const chip = css.slice(css.indexOf(".ui-landing-cardchip"));
    assert.ok(chip.slice(0, 300).includes("white-space: nowrap"), "badge nowrap");
    assert.ok(chip.slice(0, 300).includes("flex: none"), "badge keeps its size");
    const title = css.slice(css.indexOf(".ui-landing-cardtitle"));
    assert.ok(title.slice(0, 300).includes("min-width: 0"), "title shrinks");
  });

  it("wraps the example text inside its card at every width", () => {
    const prompt = css.slice(css.indexOf(".ui-landing-cardprompt"));
    assert.ok(prompt.slice(0, 300).includes("min-width: 0"), "prompt min-width");
    assert.ok(prompt.slice(0, 300).includes("overflow-wrap: anywhere"), "long strings break");
    assert.ok(!css.includes("text-overflow"), "no truncation in ui.css");
  });

  it("glides only when empty with WebGL", () => {
    assert.equal(chat.shouldGlideBackdrop({ empty: true, webgl: true }), true);
    assert.equal(chat.shouldGlideBackdrop({ empty: false, webgl: true }), false);
    assert.equal(chat.shouldGlideBackdrop({ empty: true, webgl: false }), false);
    assert.equal(chat.shouldGlideBackdrop({}), false);
  });
});

describe("26w3 last three defects (SSR, no DOM)", () => {
  it("wraps the card title and prompt on phones (beats the button nowrap)", () => {
    const block = phoneBlock();
    const at = block.indexOf(".ui-landing-cardprompt");
    assert.ok(at !== -1, "cardprompt rule in the phone block");
    const ruleStart = block.lastIndexOf("#ui-root", at);
    assert.ok(ruleStart !== -1 && ruleStart < at, "#ui-root specificity");
    assert.ok(block.slice(ruleStart, at + 90).includes("white-space: normal"), "wraps");
    assert.ok(block.includes(".ui-landing-cardtitle"), "title covered too");
  });

  it("goes full-bleed while empty", () => {
    const at = css.indexOf(".ui-chat-thread.ui-chat-thread-empty");
    assert.ok(at !== -1, "empty full-bleed rule exists");
    const block = css.slice(at, css.indexOf("}", at));
    assert.ok(block.includes("max-width: none"), "full width, no 760px edge");
  });

  it("backs the coverage lines softly, text unchanged", () => {
    const at = css.indexOf(".ui-chat-empty-coverage");
    assert.ok(at !== -1, "coverage backing rule exists");
    const block = css.slice(at, css.indexOf("}", at));
    assert.ok(block.includes("color-mix") && block.includes("88%"), "soft backing");
    assert.ok(block.includes("border-radius: 10px"), "radius 10px");
    assert.ok(block.includes("width: fit-content"), "fits the text");
    const html = emptyHtml();
    assert.ok(html.includes("다루는 지역"), "coverage line kept");
    assert.ok(html.includes("미국 1곳"), "US coverage line kept");
  });

  it("shortens the status badge on phones, never clips it", () => {
    assert.equal(topbar.museStatusShort(true), "연결됨", "live short");
    assert.equal(topbar.museStatusShort(false), "규칙 모드", "rules short");
    const block = phoneBlock();
    assert.ok(block.includes(".ui-bar-status"), "badge rule in the phone block");
    assert.ok(!css.includes("text-overflow"), "no truncation in ui.css");
  });
});

// Stage 26p: phone details left after 26m, plus one desktop cut.
// CSS contract (node --test, no browser) + SSR labels (the chat pane
// toggle, the intake text step).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

register("./jsx-loader.mjs", import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(HERE, "..", "src", "ui", "ui.css"), "utf8");

// All @media (max-width: 480px) blocks in ui.css, joined.
function phoneBlock() {
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

let React;
let renderToString;
let ChatScreen;
let IntakeCard;

before(async () => {
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
  ({ ChatScreen } = await import("../src/ui/chat.jsx"));
  ({ IntakeCard } = await import("../src/ui/intake.jsx"));
});

describe("26p phone CSS contract", () => {
  it("keeps the 추정 tag on one line at every width", () => {
    const m = css.match(/\.ui-cand-est\s*\{[^}]*\}/);
    assert.ok(m, ".ui-cand-est rule exists");
    assert.ok(m[0].includes("white-space: nowrap"), "est tag never wraps");
  });

  it("names the phone-only blocks", () => {
    const block = phoneBlock();
    assert.ok(block.includes(".ui-chat-narrowtabs"), "pane toggle row");
    assert.ok(block.includes(".ui-result-grid"), "result grid");
    assert.ok(block.includes(".ui-moment"), "moments");
  });

  it("still truncates nothing, anywhere", () => {
    assert.ok(!css.includes("text-overflow"), "no truncation in ui.css");
  });

  it("keeps the Pick button unshrunk at every width", () => {
    const noPhone = css.replace(phoneBlock(), "");
    assert.ok(/\.ui-cand-row-top > button\s*\{[^}]*flex:\s*none/.test(noPhone),
      "pick button flex none outside the phone block");
  });

  it("gives the 입력 button flex none via CSS", () => {
    assert.ok(/\.ui-textstep button\s*\{[^}]*flex:\s*none/.test(css),
      "textstep button never shrinks");
  });
});

describe("26p SSR labels", () => {
  it("chat pane toggle reads 대화 / 지도·후보 once the work panel opens", () => {
    // 27 (chat-first): the work panel stays closed until asked, so the
    // first SSR render shows no toggle; the toggle keeps the 26p labels
    // and appears only when workOpen (own row on phones, in-bar wider).
    const html = renderToString(React.createElement(ChatScreen));
    assert.ok(!html.includes("ui-chat-narrowtabs"), "no toggle while panel closed");
    const src = readFileSync(join(HERE, "..", "src", "ui", "chat.jsx"), "utf8");
    assert.ok(src.includes('label="대화"'), "chat label");
    assert.ok(src.includes('label="지도·후보"'), "map-and-candidates label");
    assert.ok(src.includes("if (!workOpen) return null"),
      "toggle mounts only when workOpen");
    assert.ok(src.includes('return phone ? "shell" : "top"'),
      "tabsMount top only when workOpen and not phone, shell only when workOpen and phone");
    assert.ok(src.includes('tabsMount === "top" ? narrowTabs'),
      "desktop toggle needs workOpen");
    assert.ok(src.includes('tabsMount === "shell" ? narrowTabs'),
      "phone row needs workOpen");
  });

  it("intake text step puts the 입력 button after its input", () => {
    const html = renderToString(React.createElement(IntakeCard,
      { step: "current", index: 1, total: 6, value: null, said: false,
        onAnswer() {}, onSkip() {} }));
    const iInput = html.indexOf("<input");
    const iBtn = html.indexOf("입력");
    assert.ok(iInput >= 0 && iBtn > iInput, "button follows input");
    assert.ok(html.includes("ui-textstep"), "textstep hook rendered");
  });
});

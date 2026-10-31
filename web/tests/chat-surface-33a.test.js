// Stage 33a — the conversation reads like a chat app: one --ui-page
// background, filled assistant bubbles, a Muse working card with spinners.
// node --test, no network.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

register("./jsx-loader.mjs", import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const uiCss = readFileSync(join(HERE, "..", "src", "ui", "ui.css"), "utf8");
const chatSrc = readFileSync(join(HERE, "..", "src", "ui", "chat.jsx"), "utf8");

let React;
let renderToString;
let BusyMsg;
let AssistantMsg;
let liveRowLine;

before(async () => {
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
  ({ BusyMsg, liveRowLine } = await import("../src/ui/chat.jsx"));
  ({ AssistantMsg } = await import("../src/ui/consult.jsx"));
});

const doneRow = { name: "extract_profile", pending: false, ok: true, summary: "예비부부" };
const pendingRow = { name: "find_homes", pending: true };

describe("33a working card (BusyMsg)", () => {
  it("is a filled bubble named Muse with a spinner and both rows", () => {
    const html = renderToString(React.createElement(BusyMsg, { rows: [doneRow, pendingRow] }));
    assert.ok(html.includes('data-variant="filled"'), "filled bubble");
    assert.ok(html.includes("Muse"), "Muse name");
    assert.ok(html.includes("Muse가 일하는 중"), "working header");
    assert.ok(html.includes('role="status"'), "Astryx Spinner");
    assert.ok((html.match(/role="status"/g) || []).length >= 2, "header + pending spinners");
    const doneLine = liveRowLine(doneRow, "ko");
    const pendingLine = liveRowLine(pendingRow, "ko");
    assert.ok(doneLine.includes("✓"), "done line has check");
    assert.ok(html.includes(doneLine) && html.includes(pendingLine), "both rows");
  });

  it("pending row has a spinner and no check mark", () => {
    const html = renderToString(React.createElement(BusyMsg, { rows: [doneRow, pendingRow] }));
    const doneLine = liveRowLine(doneRow, "ko");
    const pendingLine = liveRowLine(pendingRow, "ko");
    const pIdx = html.indexOf(pendingLine);
    assert.ok(pIdx >= 0, "pending row present");
    const lastSpinner = html.lastIndexOf('role="status"', pIdx);
    assert.ok(lastSpinner > html.indexOf(doneLine), "pending spinner");
    assert.ok(!html.slice(lastSpinner, pIdx).includes("✓"), "no check on pending row");
    assert.equal((html.match(/✓/g) || []).length, 1, "only the done row checks");
  });

  it("with no rows shows the header plus the thinking line", () => {
    const html = renderToString(React.createElement(BusyMsg, { rows: [] }));
    assert.ok(html.includes('data-variant="filled"'), "filled bubble");
    assert.ok(html.includes("Muse가 일하는 중"), "header alone");
    assert.ok(html.includes("Muse가 생각하는 중…"), "thinking line");
  });
});

describe("33a assistant text bubble", () => {
  it("SSR AssistantMsg text bubble is filled", () => {
    const html = renderToString(React.createElement(AssistantMsg,
      { msg: { role: "assistant", content: "미금역 근처 전세 3곳을 찾았어요." }, toolRows: {} }));
    assert.ok(html.includes("미금역 근처 전세 3곳을 찾았어요."), "text renders");
    assert.ok(html.includes('data-variant="filled"'), "filled bubble");
    assert.ok(!html.includes('data-variant="ghost"'), "no ghost bubble left");
  });
});

describe("33a one background", () => {
  it("scopes the shell and layout content to var(--ui-page) inside .ui-chat", () => {
    const m = uiCss.match(/\.ui-chat\s+\.astryx-app-shell[^{]*\{[^}]*\}/);
    assert.ok(m, "shell rule present");
    assert.ok(m[0].includes("var(--ui-page)"), "page token");
    assert.ok(!/#fff|255,\s*255,\s*255/i.test(m[0]), "never white");
    assert.ok(/astryx-layout-content[^}]*var\(--ui-page\)/.test(uiCss), "layout content page token");
  });

  it("keeps the empty-state transparency (city backdrop shows while empty)", () => {
    assert.ok(uiCss.includes(".ui-chat:has(.ui-chat-thread-empty)"), "empty :has block");
    const i = uiCss.indexOf(".ui-chat:has(.ui-chat-thread-empty)");
    assert.ok(uiCss.slice(i, i + 400).includes("background: transparent"), "still transparent");
  });

  it("assistant filled bubbles read as cards", () => {
    const m = uiCss.match(
      /\.ui-chat-thread\s+\.astryx-chat-message-bubble\[data-variant="filled"\]\[data-sender="assistant"\]\s*\{[^}]*\}/);
    assert.ok(m, "card bubble rule present");
    for (const token of ["var(--ui-card)", "var(--ui-border)", "var(--ui-r-card)", "12px", "16px"]) {
      assert.ok(m[0].includes(token), token);
    }
  });

  it("chat keeps the surface shell (the page token comes from CSS)", () => {
    assert.ok(chatSrc.includes('variant="surface"'), "AppShell variant untouched");
    assert.ok(chatSrc.includes("<BusyMsg rows={liveRows} />"), "busy block uses BusyMsg");
  });
});

describe("33a2 quiet Muse label", () => {
  it("keeps the Astryx name prop slot", () => {
    assert.ok(chatSrc.includes('name="Muse"'), "BusyMsg names the Muse slot");
  });

  it("styles the name slot quiet, flush, with a 4px gap", () => {
    const m = uiCss.match(/\.ui-chat[^{]*\[data-chat-name\][^{]*\{[^}]*\}/);
    assert.ok(m, ".ui-chat name rule present");
    assert.ok(/font-size:\s*12px/.test(m[0]), "12px");
    assert.ok(/font-weight:\s*500/.test(m[0]), "weight 500");
    assert.ok(m[0].includes("var(--ui-ink3)"), "tertiary ink");
    assert.ok(/padding-left:\s*0/.test(m[0]), "no indent");
    assert.ok(/margin:[^;}]*4px/.test(m[0]), "4px gap");
    assert.ok(!m[0].includes("ellipsis"), "no ellipsis");
  });
});

// Stage 29h2 — the chat always ends on the next move: cards first,
// then Muse's words, next-step buttons in the thread (SSR, no DOM).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

register("./jsx-loader.mjs", import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const chatSrc = readFileSync(join(HERE, "..", "src", "ui", "chat.jsx"), "utf8");
const uiCss = readFileSync(join(HERE, "..", "src", "ui", "ui.css"), "utf8");
const enSrc = readFileSync(join(HERE, "..", "src", "i18n", "en.js"), "utf8");

function cands(n) {
  return Array.from({ length: n }, (_, i) => ({ id: `h${i + 1}` }));
}

describe("29h2 nextStepChips", () => {
  let nextStepChips;
  let chatChipsFor;
  let readChatIntent;

  before(async () => {
    ({ nextStepChips, chatChipsFor } = await import("../src/ui/chat.jsx"));
    ({ readChatIntent } = await import("../src/chat/intent.js"));
  });

  it("candidates with no picks open with the pick chip, live", () => {
    const messages = [{ role: "assistant", kind: "candidates",
      data: { result: { candidates: cands(6) } } }];
    const r = nextStepChips({ messages, picks: [] });
    assert.equal(r.chips[0], "1번, 2번 담아 줘");
    assert.equal(r.live, true);
  });

  it("candidates with 2+ picks open with the run chip", () => {
    const messages = [{ role: "assistant", kind: "candidates",
      data: { result: { candidates: cands(6) } } }];
    const r = nextStepChips({ messages, picks: ["a", "b"] });
    assert.equal(r.chips[0], "두 집에서 살아 봐 줘");
    assert.equal(r.live, true);
  });

  it("a later done simulation opens with the commute chip", () => {
    const messages = [
      { role: "assistant", kind: "candidates",
        data: { result: { candidates: cands(6) } } },
      { role: "assistant", kind: "simulation", data: { status: "done" } },
    ];
    const r = nextStepChips({ messages, picks: [] });
    assert.equal(r.chips[0], "출근길 보여 줘");
  });

  it("appends Muse suggestions without duplicates, at most 4", () => {
    const messages = [
      { role: "assistant", kind: "simulation", data: { status: "done" } },
      { role: "assistant", kind: "text", content: "…",
        suggestions: ["x", "출근길 보여 줘"] },
    ];
    const r = nextStepChips({ messages, picks: [] });
    assert.ok(r.chips.length <= 4);
    assert.ok(r.chips.includes("x"));
    assert.equal(new Set(r.chips).size, r.chips.length);
  });

  it("empty thread falls back to the rule chips, not live", () => {
    const r = nextStepChips({ messages: [], currency: "USD" });
    assert.deepEqual(r.chips, chatChipsFor("USD"));
    assert.equal(r.live, false);
  });

  it("the pick chip reads as a pick of [1, 2] on the rule path too", () => {
    assert.deepEqual(
      readChatIntent("1번, 2번 담아 줘", { candidateCount: 6 }),
      { type: "pick", numbers: [1, 2] });
    assert.deepEqual(
      readChatIntent("Save 1 and 2", { candidateCount: 6 }),
      { type: "pick", numbers: [1, 2] });
  });
});

describe("29h2 cards before words, next steps in the thread", () => {
  it("appendToolCards runs before the text pushMsg in the turn block", () => {
    const anchor = "const bubble = turnBubble(out);";
    const at = chatSrc.indexOf(anchor);
    assert.ok(at >= 0, "turn block found");
    const block = chatSrc.slice(at, at + 800);
    const iCards = block.indexOf("appendToolCards(out.messages);");
    const iText = block.indexOf(
      'pushMsg({ role: "assistant", kind: "text", content: bubble.content');
    assert.ok(iCards >= 0 && iText >= 0, "both calls in the block");
    assert.ok(iCards < iText, "cards before words");
  });

  it("thread row replaces the composer drawer", () => {
    assert.ok(chatSrc.includes('className="ui-next-steps"'),
      "in-thread next-steps row");
    assert.ok(!chatSrc.includes("drawer={suggestionDrawer}"),
      "no drawer on the composer");
    const rule = uiCss.match(/\.ui-next-steps\s*\{[^}]*\}/);
    assert.ok(rule && rule[0].includes("flex-wrap: wrap"), "wrapping row");
    assert.ok(enSrc.includes('"1번, 2번 담아 줘": "Save 1 and 2"'),
      "en chip string");
  });
});

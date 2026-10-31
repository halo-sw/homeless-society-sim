// Stage 29h1 — chat insets: user bubbles keep padding, header never
// hides the Muse status. node --test, no network.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(HERE, "..", "src", "ui", "ui.css"), "utf8");

describe("29h1 user bubble inset", () => {
  it("has no bare bubble rule zeroing horizontal padding", () => {
    const bare = [...css.matchAll(
      /\.ui-chat-thread\s+\.astryx-chat-message-bubble\s*\{[^}]*\}/g)];
    for (const m of bare) {
      assert.ok(!/padding-left:\s*0/.test(m[0]),
        "bare bubble rule must not set padding-left: 0");
    }
  });

  it("ghost bubble loses its side padding", () => {
    const m = css.match(
      /\.ui-chat-thread\s+\.astryx-chat-message-bubble\[data-variant="ghost"\]\s*\{[^}]*\}/);
    assert.ok(m, "ghost bubble rule present");
    assert.ok(/padding-left:\s*0/.test(m[0]), "ghost left padding zeroed");
    assert.ok(/padding-right:\s*0/.test(m[0]), "ghost right padding zeroed");
  });

  it("user bubble keeps a 16 px inner inset", () => {
    const m = css.match(
      /\.ui-chat-thread\s+\.astryx-chat-message-bubble\[data-sender="user"\]\s*\{[^}]*\}/);
    assert.ok(m, "user bubble rule present");
    assert.ok(/padding-left:\s*var\(--ds-s-16\)/.test(m[0]), "user left inset");
    assert.ok(/padding-right:\s*var\(--ds-s-16\)/.test(m[0]), "user right inset");
  });
});

describe("29h1 header keeps the Muse status", () => {
  it("pins the left group width", () => {
    const m = css.match(/\.ui-bar-left\s*\{[^}]*\}/g);
    assert.ok(m, ".ui-bar-left rule present");
    assert.ok(m.some((r) => /flex:\s*none/.test(r)), ".ui-bar-left has flex: none");
  });

  it("lets the centre summary button shrink with an ellipsis", () => {
    const m = css.match(/#ui-root\s+\.ui-bar-center\s+button\s*\{[^}]*\}/);
    assert.ok(m, "#ui-root .ui-bar-center button rule present");
    assert.ok(/text-overflow:\s*ellipsis/.test(m[0]), "button ellipsizes");
    assert.ok(/flex-shrink:\s*1/.test(m[0]), "button shrinks");
  });
});

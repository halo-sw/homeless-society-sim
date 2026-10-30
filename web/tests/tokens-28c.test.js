// 28c: design tokens in ui.css, one spacing scale, no double top bar on phones.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const css = fs.readFileSync(path.join(here, "..", "src", "ui", "ui.css"), "utf8");
const jsx = fs.readFileSync(path.join(here, "..", "src", "ui", "chat.jsx"), "utf8");
const doc = fs.readFileSync(path.join(here, "..", "..", "docs", "design.md"), "utf8");

describe("28c tokens present", () => {
  const tokens = [
    "--ds-page: #f6f4ef",
    "--ds-surface: #fffdf9",
    "--ds-line: #ddd6c8",
    "--ds-ink-2: #5c564c",
    "--ds-home-a: #b3541e",
    "--ds-ok: #1f7a3d",
    "--ds-warn: #b25e09",
    "--ds-s-48: 48px",
    "--ds-r-composer: 20px",
    "--ds-chat-col: 760px",
    "--ds-panel-w: 560px",
    "--ui-page: var(--ds-page)",
    "--ui-ink: var(--ds-ink-1)",
    "--ui-s8: var(--ds-s-8)",
  ];
  for (const t of tokens) {
    it(`ui.css contains ${t}`, () => {
      assert.ok(css.includes(t), t);
    });
  }
});

describe("28c one spacing scale", () => {
  const offScale = /(^|[^0-9.])(2|6|10)px/;
  for (const line of css.split("\n")) {
    if (/(padding|margin|gap)\s*:/.test(line)) {
      it(`on-scale: ${line.trim().slice(0, 80)}`, () => {
        assert.ok(!offScale.test(line), line.trim());
      });
    }
  }
  it("no font-size 13px", () => {
    assert.ok(!css.includes("font-size: 13px"), "13px gone");
  });
  it("no font-size 11px", () => {
    assert.ok(!css.includes("font-size: 11px"), "11px gone");
  });
});

describe("28c no double top bar on phones", () => {
  it("chat.jsx disables the mobile drawer nav", () => {
    assert.ok(jsx.includes("mobileNav={false}"), "mobileNav={false}");
  });
});

describe("28c doc and CSS agree (§2.1, §2.4)", () => {
  const lines = doc.split("\n");
  const at = (h) => lines.findIndex((l) => l.startsWith(h));
  const ranges = [
    [at("### 2.1"), at("### 2.2")],
    [at("### 2.4"), at("## 3.")],
  ];
  const pairs = [];
  for (const [s, e] of ranges) {
    for (let i = s; i >= 0 && i < e; i++) {
      for (const m of lines[i].matchAll(/--(ds-[a-z0-9-]+):\s*([^;]+);/g)) {
        pairs.push([`--${m[1]}`, m[2].trim()]);
      }
    }
  }
  assert.ok(pairs.length > 20, `${pairs.length} doc tokens parsed`);
  for (const [name, value] of pairs) {
    it(`${name}: ${value}`, () => {
      assert.ok(css.includes(`${name}: ${value}`), `${name} = ${value}`);
    });
  }
});

// 17-4: 오늘 list source badges never truncate (GPU capture 10-30).
// The line text shrinks first, then wraps; the badge keeps its full
// word (no more "실…"/"가…").
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(HERE, "..", "src", "ui", "ui.css"), "utf8");

describe("17-4 오늘 badges never truncate", () => {
  it("keeps the badge whole while the line text wraps", () => {
    const badge = css.match(/\.ui-today-row \.astryx-badge \{[^}]*\}/);
    assert.ok(badge, "badge rule present");
    assert.ok(badge[0].includes("flex: none"), "badge never shrinks");
    assert.ok(badge[0].includes("white-space: nowrap"), "badge never wraps");
    assert.ok(/max-width:\s*none/.test(badge[0]), "no badge width cap");
    assert.ok(badge[0].includes("overflow: visible"), "ellipsis cannot apply");
    assert.ok(!badge[0].includes("ellipsis"), "no ellipsis anywhere");
    const label = css.match(/\.ui-today-label \{[^}]*\}/);
    assert.ok(label && label[0].includes("overflow-wrap"), "line text wraps");
  });
});

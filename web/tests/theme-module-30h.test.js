// 30h: main.jsx wires the theme through the generated Astryx module.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const mainSrc = readFileSync(join(HERE, "..", "src", "ui", "main.jsx"), "utf8");
const recordSrc = readFileSync(join(HERE, "..", "src", "astryx-themes.js"), "utf8");

describe("theme module 30h", () => {
  it("imports themes and defaultThemeSlug from the generated module", () => {
    assert.match(
      mainSrc,
      /import\s*\{\s*themes\s*,\s*defaultThemeSlug\s*\}\s*from\s*["']\.\.\/astryx-themes\.js["']/,
    );
  });

  it("passes themes[defaultThemeSlug] to <Theme>", () => {
    assert.ok(mainSrc.includes("themes[defaultThemeSlug]"));
    assert.match(mainSrc, /<Theme\s+theme=\{themes\[defaultThemeSlug\]\}/);
  });

  it("no longer imports @astryxdesign/theme-neutral directly", () => {
    assert.ok(!mainSrc.includes("@astryxdesign/theme-neutral"));
  });

  it("generated module defaults to neutral and re-exports neutralTheme", async () => {
    let themes;
    let defaultThemeSlug;
    try {
      ({ themes, defaultThemeSlug } = await import("../src/astryx-themes.js"));
    } catch {
      assert.equal(recordSrc.includes('defaultThemeSlug = "neutral"'), true);
      assert.match(
        recordSrc,
        /import\s*\{\s*neutralTheme\s+as\s+\S+\s*\}\s*from\s*["']@astryxdesign\/theme-neutral\/built["']/,
      );
      return;
    }
    assert.equal(defaultThemeSlug, "neutral");
    const { neutralTheme } = await import("@astryxdesign/theme-neutral/built");
    assert.equal(themes.neutral, neutralTheme);
  });
});

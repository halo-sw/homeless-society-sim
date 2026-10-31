// Stage 29a5 — the map reads in English too.
// node --test, no network.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

register("./jsx-loader.mjs", import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const chatmapSrc = readFileSync(join(HERE, "..", "src", "ui", "chatmap.jsx"), "utf8");
const chatSrc = readFileSync(join(HERE, "..", "src", "ui", "chat.jsx"), "utf8");
const enSrc = readFileSync(join(HERE, "..", "src", "i18n", "en.js"), "utf8");

// .jsx loads dynamically (static imports resolve before the loader).
let workPinLabel = null;
before(async () => {
  ({ workPinLabel } = await import("../src/ui/chatmap.jsx"));
});

describe("29a5 quiet base labels in English", () => {
  it("tile group opacity depends on currentLang", () => {
    assert.ok(/<g filter="url\(#basemap-mute\)" opacity=\{[^}]*currentLang\(\)/.test(chatmapSrc),
      "basemap-mute group opacity follows currentLang");
    assert.ok(chatmapSrc.includes('currentLang() === "en" ? 0.45'),
      "English tiles quiet to 0.45");
  });
  it("station label <text> has a white halo", () => {
    assert.ok(chatmapSrc.includes('paintOrder="stroke"'),
      "station labels paint the halo first");
  });
});

describe("29a5 workplace pin label", () => {
  it('("강남", "ko") → 회사 · 강남', () => {
    assert.equal(workPinLabel("강남", "ko"), "회사 · 강남");
  });
  it('("강남", "en") → Work · Gangnam', () => {
    assert.equal(workPinLabel("강남", "en"), "Work · Gangnam");
  });
});

describe("29a5 legend placement", () => {
  it("legend floats top-left under the stage title, off the tray", () => {
    assert.ok(!chatmapSrc.includes("top: 12, right: 12"),
      "legend no longer top: 12, right: 12");
    assert.ok(!chatmapSrc.includes("bottom: 32, left: 12"),
      "legend no longer bottom-anchored where the tray covers it");
    assert.ok(chatmapSrc.includes("ui-chatmap-legend"), "legend uses its class");
    assert.ok(chatmapSrc.includes('role="note"'), "legend is a note");
  });
});

describe("29a5 show more counts", () => {
  it("chat.jsx labels the page with the remainder", () => {
    assert.ok(chatSrc.includes("남은"), "label carries 남은");
    assert.ok(!chatSrc.includes("${data.total_matching - candidates.length}곳 더 보기"),
      "old whole-remainder label gone");
  });
  it("en.js carries the English pattern", () => {
    assert.ok(enSrc.includes("Show {0} more"), "Show {0} more present");
  });
});

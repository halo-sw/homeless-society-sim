// Stage 24a: English UI core (rendered-DOM translation).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { detectLang } from "../src/i18n/lang.js";
import { romanize, romanizeName } from "../src/i18n/romanize.js";
import { createTranslator, localizeNumbers } from "../src/i18n/translate.js";
import { translateTree, createState } from "../src/i18n/dom.js";
import { phrases, patterns } from "../src/i18n/en.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..");

// Minimal DOM fakes (no jsdom): the dom core only uses nodeType,
// nodeValue, childNodes, parentNode, tagName, getAttribute/setAttribute.
function fakeText(value) {
  return { nodeType: 3, nodeValue: value, parentNode: null, childNodes: [] };
}
function fakeEl(tag, { attrs = {}, kids = [] } = {}) {
  const el = {
    nodeType: 1,
    tagName: tag,
    parentNode: null,
    childNodes: kids,
    _attrs: { ...attrs },
    getAttribute(name) {
      return Object.hasOwn(this._attrs, name) ? this._attrs[name] : null;
    },
    setAttribute(name, value) {
      this._attrs[name] = String(value);
    },
  };
  for (const k of kids) k.parentNode = el;
  return el;
}

describe("detectLang", () => {
  it("?lang=en beats a stored ko", () => {
    assert.equal(detectLang({ search: "?lang=en", stored: "ko", navLang: "ko-KR" }), "en");
  });
  it("stored en beats navLang ko-KR", () => {
    assert.equal(detectLang({ search: "", stored: "en", navLang: "ko-KR" }), "en");
  });
  it("navLang en-US gives en", () => {
    assert.equal(detectLang({ search: "", stored: null, navLang: "en-US" }), "en");
  });
  it("ko-KR gives ko", () => {
    assert.equal(detectLang({ search: "", stored: null, navLang: "ko-KR" }), "ko");
  });
  it("nothing gives ko", () => {
    assert.equal(detectLang({}), "ko");
  });
});

describe("romanize", () => {
  it("basic syllables", () => {
    assert.equal(romanize("잠실"), "Jamsil");
  });
  it("trailing 역 becomes Stn", () => {
    assert.equal(romanizeName("잠실역"), "Jamsil Stn");
  });
  it("assimilation ㄴ+ㄹ", () => {
    assert.equal(romanize("선릉"), "Seolleung");
  });
  it("trailing 동 becomes -dong", () => {
    assert.equal(romanizeName("역삼동"), "Yeoksam-dong");
  });
});

describe("localizeNumbers", () => {
  it("억 + 만 + 원", () => {
    assert.equal(localizeNumbers("전세 2억 6,000만 원"), "전세 ₩260M");
  });
  it("bare 억", () => {
    assert.equal(localizeNumbers("3억"), "₩300M");
  });
  it("만 + 원", () => {
    assert.equal(localizeNumbers("4,000만 원"), "₩40M");
  });
  it("분", () => {
    assert.equal(localizeNumbers("걸어서 5분"), "걸어서 5 min");
  });
});

describe("createTranslator", () => {
  it("exact phrase wins", () => {
    const tr = createTranslator({ phrases: { "데이터 출처": "Data sources" }, patterns: [] });
    assert.equal(tr.translate("데이터 출처"), "Data sources");
  });
  it("pattern with a romanized capture", () => {
    const tr = createTranslator({
      phrases: {},
      patterns: [{ ko: "{0} · 지하철 타는 곳", en: "{0} · where you board" }],
    });
    assert.equal(tr.translate("잠실역 · 지하철 타는 곳"), "Jamsil Stn · where you board");
  });
  it("pattern capture with its own phrase is translated, not romanized", () => {
    const tr = createTranslator({
      phrases: { "잠실역": "Jamsil Station" },
      patterns: [{ ko: "{0} · 지하철 타는 곳", en: "{0} · where you board" }],
    });
    assert.equal(tr.translate("잠실역 · 지하철 타는 곳"), "Jamsil Station · where you board");
  });
  it("untranslated sentence ending in 요 stays Korean and lands in missing", () => {
    const tr = createTranslator({ phrases: {}, patterns: [] });
    assert.equal(tr.translate("비교해 드려요"), "비교해 드려요");
    assert.ok(tr.missing.has("비교해 드려요"));
  });
  it("text with no Hangul is the same string", () => {
    const tr = createTranslator({ phrases: {}, patterns: [] });
    const s = "Hello 123";
    assert.equal(tr.translate(s) === s, true);
  });
});

describe("dom core with fakes", () => {
  it("leaf text nodes join, then split into first + empty", () => {
    const tr = createTranslator({
      phrases: {},
      patterns: [{ ko: "{0}분 남음", en: "{0} min left" }],
    });
    const st = createState();
    const leaf = fakeEl("SPAN", { kids: [fakeText("5"), fakeText("분 남음")] });
    translateTree(leaf, tr, st);
    assert.equal(leaf.childNodes[0].nodeValue, "5 min left");
    assert.equal(leaf.childNodes[1].nodeValue, "");
  });
  it("react-style rewrite is picked up as a new source", () => {
    const tr = createTranslator({
      phrases: {},
      patterns: [{ ko: "{0}분 남음", en: "{0} min left" }],
    });
    const st = createState();
    const leaf = fakeEl("SPAN", { kids: [fakeText("5"), fakeText("분 남음")] });
    translateTree(leaf, tr, st);
    leaf.childNodes[0].nodeValue = "6";
    leaf.childNodes[1].nodeValue = "분 남음";
    translateTree(leaf, tr, st);
    assert.equal(leaf.childNodes[0].nodeValue, "6 min left");
    assert.equal(leaf.childNodes[1].nodeValue, "");
  });
  it("placeholder is translated, input value is not", () => {
    const tr = createTranslator({ phrases: { "이름 입력": "Enter your name" }, patterns: [] });
    const input = fakeEl("INPUT", {
      attrs: { placeholder: "이름 입력", value: "사용자 텍스트" },
    });
    translateTree(input, tr, createState());
    assert.equal(input.getAttribute("placeholder"), "Enter your name");
    assert.equal(input.getAttribute("data-i18n-src-placeholder"), "이름 입력");
    assert.equal(input.getAttribute("value"), "사용자 텍스트");
  });
  it("a node under data-no-i18n is untouched", () => {
    const tr = createTranslator({ phrases: { "그 집": "the home" }, patterns: [] });
    const outer = fakeEl("DIV", {
      attrs: { "data-no-i18n": "" },
      kids: [fakeText("그 집")],
    });
    translateTree(outer, tr, createState());
    assert.equal(outer.childNodes[0].nodeValue, "그 집");
  });
});

describe("source pins", () => {
  it("main.jsx calls initI18n() before createRoot", async () => {
    const src = await readFile(join(WEB, "src", "ui", "main.jsx"), "utf8");
    assert.match(src, /initI18n\(\)[\s\S]*createRoot\(el\)/);
  });
  it("topbar.jsx renders LangToggle", async () => {
    const src = await readFile(join(WEB, "src", "ui", "topbar.jsx"), "utf8");
    assert.match(src, /<LangToggle/);
  });
  it("landing.jsx renders LangToggle", async () => {
    const src = await readFile(join(WEB, "src", "ui", "landing.jsx"), "utf8");
    assert.match(src, /<LangToggle/);
  });
});

describe("seed pin", () => {
  it("every Korean string literal in landing.jsx is a phrase key or pattern-matched", async () => {
    const src = await readFile(join(WEB, "src", "ui", "landing.jsx"), "utf8");
    const quoted = [...src.matchAll(/"([^"\n]*[가-힣][^"\n]*)"/g)].map((m) => m[1]);
    const jsxText = [...src.matchAll(/>([^<>{}]*[가-힣][^<>{}]*)</g)]
      .map((m) => m[1].trim()).filter(Boolean);
    const tr = createTranslator({ phrases, patterns });
    for (const lit of new Set([...quoted, ...jsxText])) {
      const covered = Object.hasOwn(phrases, lit) || tr.translate(lit) !== lit;
      assert.ok(covered, `seed covers: ${lit}`);
    }
    assert.ok(quoted.length > 20);
  });
});

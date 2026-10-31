// 29g3: map pins show the same commute the card shows; first loading line speaks the page language.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { commuteMinutesOf } from "../src/chatmap.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "../index.html"), "utf8");

function candidatesOfRecording() {
  const doc = JSON.parse(fs.readFileSync(path.join(here, "../public/recorded/menlo-month.json"), "utf8"));
  const msg = doc.messages.find((m) => m.kind === "candidates");
  return msg.data.result.candidates;
}

function inlineScript() {
  const blocks = [...html.matchAll(/<script(?![^>]*type="module")[^>]*>([\s\S]*?)<\/script>/g)]
    .map((m) => m[1]);
  const hit = blocks.find((b) => b.includes("ithaca.lang"));
  assert.ok(hit, "non-module inline script mentions ithaca.lang");
  return hit;
}

function runInline(src, { search = "", stored = undefined, navLang = "" } = {}) {
  const el = { textContent: "지역을 불러오는 중…" };
  const document = { getElementById: () => el, documentElement: {} };
  const store = {};
  if (stored !== undefined) store["ithaca.lang"] = stored;
  const sandbox = {
    document,
    location: { search },
    localStorage: { getItem: (k) => (k in store ? store[k] : null) },
    navigator: { language: navLang },
  };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return { el, lang: document.documentElement.lang };
}

describe("29g3 commuteMinutesOf prefers door-to-work", () => {
  it("work.minutes wins over the walk + ride sum", () => {
    assert.equal(commuteMinutesOf({ commute: {
      walk: { minutes: 37.6, known: true },
      ride: { known: false, minutes: null },
      work: { mode: "bike", minutes: 11.4, walk_minutes: 36.5, bike_minutes: 11.4 },
    } }), 11.4);
  });
  it("falls back to walk + ride without work; null when nothing known", () => {
    assert.equal(commuteMinutesOf({ commute: {
      walk: { minutes: 3.1, known: true }, ride: { known: true, minutes: 5 },
    } }), 8.1);
    assert.equal(commuteMinutesOf({ commute: {
      walk: { minutes: null, known: false }, ride: { known: false, minutes: null },
    } }), null);
  });
  it("first recorded US candidate with commute.work matches its work.minutes", () => {
    const first = candidatesOfRecording().find((c) => Number.isFinite(c?.commute?.work?.minutes));
    assert.ok(first, "recording has a candidate with commute.work");
    const expected = Math.round(first.commute.work.minutes * 10) / 10;
    assert.equal(commuteMinutesOf(first), expected);
  });
});

describe("29g3 first loading line speaks the page language", () => {
  it("keeps the Korean div and translates it in a pre-module inline script", () => {
    assert.ok(html.includes('<div id="loading">지역을 불러오는 중…</div>'));
    assert.ok(html.includes("Loading the area…"));
    const src = inlineScript();
    assert.ok(src.includes("Loading the area…"));
    const moduleAt = html.indexOf('<script type="module"');
    assert.ok(moduleAt > 0);
    assert.ok(html.indexOf(src.trim().slice(0, 20)) < moduleAt);
  });
  it("?lang=en wins; ?lang=ko keeps Korean", () => {
    const src = inlineScript();
    const en = runInline(src, { search: "?lang=en", stored: "ko", navLang: "ko-KR" });
    assert.equal(en.el.textContent, "Loading the area…");
    assert.equal(en.lang, "en");
    const ko = runInline(src, { search: "?replay=menlo-month&lang=ko", stored: "en", navLang: "en-US" });
    assert.equal(ko.el.textContent, "지역을 불러오는 중…");
    assert.equal(ko.lang, "ko");
  });
  it("stored lang then navigator language decide without a query", () => {
    const src = inlineScript();
    const stored = runInline(src, { search: "", stored: "en", navLang: "ko-KR" });
    assert.equal(stored.el.textContent, "Loading the area…");
    assert.equal(stored.lang, "en");
    const navEn = runInline(src, { search: "", navLang: "en-US" });
    assert.equal(navEn.el.textContent, "Loading the area…");
    assert.equal(navEn.lang, "en");
    const navKo = runInline(src, { search: "", navLang: "ko-KR" });
    assert.equal(navKo.el.textContent, "지역을 불러오는 중…");
    assert.equal(navKo.lang, "ko");
  });
});

// 27g: map data on the Muse path, [[다음]] marker split, month-spanning diary.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

import { splitSuggestions } from "../src/consult/agent.js";
import { runDigest, spreadPick } from "../src/diary/digest.js";
import { checkDiary } from "../src/consult/diary.js";

let turnBubble;
before(async () => {
  ({ turnBubble } = await import("../src/ui/chat.jsx"));
});

// Fake 30-day run: one commute trip + one work away per day.
// Day 29 has the longest commute (45분); the rest take 10~14분.
function fakeMonthRun() {
  const trips = [];
  const aways = [];
  for (let day = 0; day < 30; day++) {
    const span = day === 29 ? 45 : 10 + (day % 5);
    const depart = 8 * 60;
    trips.push({ id: `trip-${day}`, agent: "h1", day, purpose: "commute",
      from: { kind: "home" }, depart_min: depart });
    aways.push({ agent: "h1", day, kind: "work", start_min: depart + span });
  }
  return { trips, aways, decisions: [] };
}

describe("27g marker split", () => {
  it("splits a same-line trailing marker", () => {
    const r = splitSuggestions("찜했어요. [[다음: 살아 봐 줘 | 비교해 줘]]");
    assert.equal(r.text, "찜했어요.");
    assert.deepEqual(r.suggestions, ["살아 봐 줘", "비교해 줘"]);
  });

  it("own-line form still works", () => {
    const r = splitSuggestions("좋아요.\n[[다음: 비교해 줘 | 출근길 보여 줘]]");
    assert.equal(r.text, "좋아요.");
    assert.deepEqual(r.suggestions, ["비교해 줘", "출근길 보여 줘"]);
  });

  it("a marker in the middle is not split", () => {
    const r = splitSuggestions("a [[다음: x]] b");
    assert.equal(r.text, "a [[다음: x]] b");
    assert.deepEqual(r.suggestions, []);
  });
});

describe("27g turnBubble safety net", () => {
  it("strips a stray marker from the bubble", () => {
    assert.equal(
      turnBubble({ reply: "좋아요. [[다음: 살아 봐 줘]]", messages: [] }).content,
      "좋아요.");
  });
});

describe("27g month-spanning digest", () => {
  it("runDigest samples across the month and marks the longest commute", () => {
    const digest = runDigest(fakeMonthRun(), "B", { name: "베타", maxFacts: 6 });
    const commutes = digest.facts.filter((f) => f.kind === "commute");
    assert.ok(commutes.length > 0);
    const days = commutes.map((f) => f.day);
    assert.ok(Math.min(...days) <= 2, `min day ${Math.min(...days)}`);
    assert.ok(Math.max(...days) >= 25, `max day ${Math.max(...days)}`);
    const longest = commutes.find((f) => f.id === "trip-29");
    assert.ok(longest, "longest commute included");
    assert.match(longest.text_ko, /30일 중 가장 오래/);
    assert.ok(longest.numbers.includes(30));
    assert.ok(longest.numbers.includes(45));
  });

  it("spreadPick spreads evenly and keeps mustInclude", () => {
    const list = Array.from({ length: 30 }, (_, i) => ({ day: i }));
    const sampled = list[23];
    const kept = spreadPick(list, 6, sampled);
    assert.equal(kept.length, 6);
    assert.ok(kept.includes(sampled));
    assert.equal(kept[0].day, 0);
    assert.equal(kept[kept.length - 1].day, 29);
    const swapped = spreadPick(list, 6, list[20]);
    assert.equal(swapped.length, 6);
    assert.ok(swapped.includes(list[20]));
  });
});

describe("27g summary checked against totals only", () => {
  const digests = [
    { label: "A", name: "알파", facts: [],
      totals: { one_way_min: 11, park_visits: 2, late_returns: 0 } },
    { label: "B", name: "베타", facts: [],
      totals: { one_way_min: 12, park_visits: 1, late_returns: 1 } },
  ];

  it("a fact-only day number fails the summary", () => {
    const bad = checkDiary(
      { summary: "B집은 출근에 13분이었어요.", lines: [] }, digests);
    assert.equal(bad.summaryOk, false);
  });

  it("the totals average passes the summary", () => {
    const good = checkDiary(
      { summary: "B집은 출근에 12분이었어요.", lines: [] }, digests);
    assert.equal(good.summaryOk, true);
  });
});

describe("27g map data wiring", () => {
  it("chat.jsx refills map data on the Muse path", () => {
    const src = readFileSync(
      new URL("../src/ui/chat.jsx", import.meta.url), "utf8");
    assert.match(src, /setDataTick/);
    assert.match(src, /ensureData\(null\)/);
    assert.match(src, /useEffect\(\(\) => \{\s*\n?.*workOpen && !dataRef\.current[\s\S]*?ensureData\(null\)[\s\S]*?\}, \[workOpen\]\)/);
  });
});

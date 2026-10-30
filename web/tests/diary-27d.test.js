// 27d: after the 30 days — Muse writes "my diary", code checks every line.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

import { tinyArea, tinyScenario } from "./engine-fixture.js";
import { simulate } from "../src/engine/simulate.js";
import { runDigest } from "../src/diary/digest.js";
import { evidenceIndex } from "../src/verify/evidence.js";
import { checkDiary, writeDiary } from "../src/consult/diary.js";

const NUM_RE = /\d+(?:\.\d+)?/g;

describe("27d diary digest + check", () => {
  let diaryCheckLine;
  before(async () => {
    ({ diaryCheckLine } = await import("../src/ui/chat.jsx"));
  });

  it("digest facts cite the record and carry their numbers", () => {
    const run = simulate(tinyArea(), tinyScenario({ days: 3, background: 0 }), "A");
    const digest = runDigest(run, "A", { name: "알파" });
    const index = evidenceIndex(run);
    assert.ok(Array.isArray(digest.facts));
    for (const f of digest.facts) {
      assert.ok(index.has(f.id), `fact id in evidence index: ${f.id}`);
      const tokens = String(f.text_ko || "").match(NUM_RE) || [];
      for (const tok of tokens) {
        assert.ok((f.numbers || []).includes(Number(tok)),
          `number ${tok} listed in numbers (${f.text_ko})`);
      }
    }
    assert.ok(digest.totals.one_way_min === null
      || typeof digest.totals.one_way_min === "number");
  });

  it("checkDiary fails unknown ids, invented numbers and verdicts", () => {
    const digests = [
      { label: "A", name: "알파",
        facts: [{ id: "t1", day: 1, minute: 485, kind: "commute",
          text_ko: "2일째 출근 31분 (집 08:05 출발)", numbers: [2, 31, 8, 5] }],
        totals: { one_way_min: 31, park_visits: 1, late_returns: 0 } },
      { label: "B", name: "베타",
        facts: [{ id: "t2", day: 0, minute: 480, kind: "commute",
          text_ko: "1일째 출근 35분 (집 08:00 출발)", numbers: [1, 35, 8, 0] }],
        totals: { one_way_min: 35, park_visits: 0, late_returns: 0 } },
    ];
    const unknown = checkDiary(
      { summary: "두 집을 살아 봤어요.", lines: [{ home: "A", id: "nope", text: "짧게 잤다" }] },
      digests);
    assert.equal(unknown.failures.length, 1);
    assert.match(unknown.failures[0].reason_ko, /근거 없는 줄/);
    const invented = checkDiary(
      { summary: "두 집을 살아 봤어요.", lines: [{ home: "A", id: "t1", text: "2일째 출근 45분" }] },
      digests);
    assert.equal(invented.failures.length, 1);
    assert.match(invented.failures[0].reason_ko, /기록에 없는 숫자/);
    const good = checkDiary(
      { summary: "두 집을 살아 봤어요.", lines: [{ home: "A", id: "t1", text: "2일째 출근 31분" }] },
      digests);
    assert.equal(good.failures.length, 0);
    assert.equal(good.summaryOk, true);
    const verdict = checkDiary(
      { summary: "A가 낫다", lines: [] }, digests);
    assert.equal(verdict.summaryOk, false);
  });

  it("writeDiary retries once, then drops; fenced JSON parses", async () => {
    const digests = [
      { label: "A", name: "알파",
        facts: [{ id: "t1", day: 1, minute: 485, kind: "commute",
          text_ko: "2일째 출근 31분 (집 08:05 출발)", numbers: [2, 31, 8, 5] }],
        totals: { one_way_min: 31, park_visits: 1, late_returns: 0 } },
      { label: "B", name: "베타",
        facts: [{ id: "t2", day: 0, minute: 480, kind: "commute",
          text_ko: "1일째 출근 35분 (집 08:00 출발)", numbers: [1, 35, 8, 0] }],
        totals: { one_way_min: 35, park_visits: 0, late_returns: 0 } },
    ];
    const summary = "A는 출근 편도 평균 31분, B는 35분이었어요.";
    const badLines = [
      { home: "A", id: "t1", text: "2일째 출근 31분" },
      { home: "A", id: "t1", text: "2일째 출근 45분" },
    ];
    const goodLines = [
      { home: "A", id: "t1", text: "2일째 출근 31분" },
      { home: "A", id: "t1", text: "8시에 출근 31분" },
    ];
    let calls = 0;
    const fixable = async () => {
      calls++;
      const lines = calls === 1 ? badLines : goodLines;
      return { message: { content: JSON.stringify({ summary, lines }) }, usage: {} };
    };
    const fixed = await writeDiary({ complete: fixable, provider: "meta", digests });
    assert.equal(fixed.check.retried, 1);
    assert.equal(fixed.check.dropped, 0);
    assert.equal(fixed.lines.length, 2);
    assert.equal(fixed.lines[0].day, 1);
    assert.equal(fixed.lines[0].minute, 485);

    const stubborn = async () => ({
      message: { content: JSON.stringify({ summary, lines: badLines }) }, usage: {},
    });
    const dropped = await writeDiary({ complete: stubborn, provider: "meta", digests });
    assert.equal(dropped.check.retried, 1);
    assert.equal(dropped.check.dropped, 1);
    assert.equal(dropped.lines.length, 1);

    const fenced = async () => ({
      message: { content: "```json\n" + JSON.stringify({ summary, lines: goodLines }) + "\n```" },
      usage: {},
    });
    const fencedOut = await writeDiary({ complete: fenced, provider: "meta", digests });
    assert.equal(fencedOut.lines.length, 2);
  });

  it("diaryCheckLine matches the checklist wording", () => {
    assert.equal(diaryCheckLine({ passed: 9, retried: 1, dropped: 0 }),
      "✓ 문장 9개 모두 기록과 대조 · 1번 고쳐 씀");
  });
});

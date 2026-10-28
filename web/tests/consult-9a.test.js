import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tinyArea, tinyScenario } from "./engine-fixture.js";
import { createSession, callTool } from "../src/consult/tools.js";
import { runTurn } from "../src/consult/agent.js";
import { createRunCache } from "../src/consult/tools.js";
import { checkConsultReply, numbersOnlyAnswer, scoreVerdict } from "../src/consult/guards.js";
import { SAFETY_CAVEATS } from "../src/safety.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function fixtureScenario() {
  return tinyScenario({
    days: 2, background: 0, seed: 7,
    homes: [
      { label: "A", area: "pangyo", complex_name: "알파" },
      { label: "B", area: "pangyo", complex_name: "베타" },
    ],
  });
}

function safetyDoc() {
  return {
    source: "경찰청 범죄 발생 지역별 통계 (2025년)",
    period: "2025-01-01…2025-12-31", unit: "건",
    areas: {
      pangyo: {
        column: "경기도 성남시", geo_level: "city", unit: "건", total: 30,
        by_cat1: { 강력범죄: 10, 절도범죄: 20 },
        by_cat2: [
          { cat1: "강력범죄", cat2: "살인기수", count: 1 },
          { cat1: "강력범죄", cat2: "강도", count: 9 },
          { cat1: "절도범죄", cat2: "절도범죄", count: 20 },
        ],
      },
    },
    population: null, population_note: "인구 테이블 없음",
    caveats: [...SAFETY_CAVEATS],
  };
}

function session9a(over = {}) {
  return createSession({
    scenario: fixtureScenario(),
    loadArea: async () => tinyArea(),
    loadSafety: async () => safetyDoc(),
    loadPersona: async (id) => JSON.parse(readFileSync(
      join(ROOT, "scenarios", "personas", `${id}.json`), "utf8")),
    ...over,
  });
}

describe("consult 9a tools", () => {
  it("apply_persona loads a template, verifies homes, and asks for priorities next", async () => {
    const s = session9a({
      loadArea: async (areaId) => ({
        ...tinyArea(),
        complexes: [{ id: "cx",
          name: areaId === "songpa-jamsil" ? "레이크팰리스" : "백현마을" }],
      }),
    });
    const r = await callTool(s, "apply_persona", { persona: "single-firstjob" });
    assert.equal(r.ok, true);
    assert.equal(r.title, "1인 사회초년생");
    assert.equal(s.scenario.household.members.length, 1);
    assert.equal(s.scenario.name, "persona-single-firstjob");
    assert.match(r.placeholders_note, /가정값/);
    assert.match(r.next, /우선순위/);
    const bad = await callTool(s, "apply_persona", { persona: "penthouse" });
    assert.equal(bad.ok, false);
    assert.match(bad.error, /unknown persona/);
  });

  it("get/set_priorities round-trips the customer's weights", async () => {
    const s = session9a();
    const before = await callTool(s, "get_priorities", {});
    assert.equal(before.ok, true);
    assert.equal(before.groups.length, 5);
    for (const g of before.groups) {
      assert.ok(g.question && g.metrics.length >= 2);
      for (const m of g.metrics) assert.ok(m.unit && m.source);
    }
    assert.equal(before.explicit, false);
    const set = await callTool(s, "set_priorities",
      { weights: { edu: 5, life: 3, safety: 4, money: 2, convenience: 1 } });
    assert.equal(set.ok, true);
    assert.equal(set.explicit, true);
    assert.deepEqual(s.scenario.priorities.weights,
      { edu: 5, life: 3, safety: 4, money: 2, convenience: 1 });
    const after = await callTool(s, "get_priorities", {});
    assert.equal(after.explicit, true);
    assert.equal(after.weights.edu, 5);
    const bad = await callTool(s, "set_priorities",
      { weights: { edu: 9, life: 3, safety: 3, money: 3, convenience: 3 } });
    assert.equal(bad.ok, false);
  });

  it("get_safety returns counts with source, period, unit and level", async () => {
    const s = session9a();
    const r = await callTool(s, "get_safety", { area: "pangyo" });
    assert.equal(r.ok, true);
    assert.equal(r.column, "경기도 성남시");
    assert.equal(r.geo_level_ko, "시 단위");
    assert.equal(r.source, "경찰청 범죄 발생 지역별 통계 (2025년)");
    assert.equal(r.total, 30);
    assert.ok(r.groups.length >= 2);
    assert.ok(r.caveats.length >= 3);
    const unknown = await callTool(s, "get_safety", { area: "busan" });
    assert.equal(unknown.ok, false);
    const missing = await callTool(session9a({ loadSafety: null }), "get_safety", { area: "pangyo" });
    assert.equal(missing.ok, false);
    assert.match(missing.error, /unavailable/);
  });

  it("get_education returns access counts, nearest, and the school route", async () => {
    const s = session9a();
    const r = await callTool(s, "get_education", { area: "pangyo" });
    assert.equal(r.ok, true);
    assert.equal(r.complex, "알파");
    assert.ok(r.access.counts.within_10min.school_elementary >= 1);
    assert.equal(r.access.nearest.school[0].name, "초등학교");
    assert.ok(r.access.nearest.school[0].minutes > 0);
    assert.match(r.access.academy_note, /적을 수 있음/);
    // With a run: the household child's school route.
    const run = await callTool(s, "run_simulation", { home: "A" });
    assert.equal(run.ok, true);
    const id = run.run_ids.A;
    const withRun = await callTool(s, "get_education", { area: "pangyo", run: id });
    assert.equal(withRun.ok, true);
    assert.equal(withRun.school_routes.length, 1);
    assert.equal(withRun.school_routes[0].school, "초등학교");
    assert.ok(Number.isFinite(withRun.school_routes[0].primary_ways));
    const bad = await callTool(s, "get_education", { area: "pangyo", run: "run99" });
    assert.equal(bad.ok, false);
  });

  it("define_term serves the shared glossary", async () => {
    const s = session9a();
    const r = await callTool(s, "define_term", { term: "전세보증보험" });
    assert.equal(r.ok, true);
    assert.match(r.def, /보증/);
    assert.equal(r.source_url, "https://www.khug.or.kr");
    const bad = await callTool(s, "define_term", { term: "깡통전세" });
    assert.equal(bad.ok, false);
    assert.match(bad.error, /glossary/);
  });
});

describe("no-score guard", () => {
  const SAFETY_RESULTS = [{
    ok: true, column: "경기도 성남시", total: 30, source: "경찰청", period: "2025",
    geo_level_ko: "시 단위",
    groups: [{ cat1: "강력범죄", count: 10, mid: [{ cat2: "살인기수", count: 1 }] }],
    caveats: [...SAFETY_CAVEATS],
  }];

  it("trips on safety verdicts, scores and rankings (fake replies)", () => {
    for (const text of [
      "밤길이 안전합니다",
      "A가 더 안전합니다",
      "B는 위험합니다",
      "치안이 좋습니다",
      "살기 좋은 동네입니다",
      "치안 점수는 30점입니다",
      "범죄 순위 1위입니다",
      "학교 순위가 높습니다",
      "이 집을 추천합니다",
      "가장 좋은 집은 A입니다",
    ]) {
      assert.notEqual(scoreVerdict(text), null, text);
      const r = checkConsultReply(text, SAFETY_RESULTS);
      assert.equal(r.ok, false, text);
      assert.equal(r.cause, "score_verdict", text);
    }
  });

  it("passes cited counts with their caveats", () => {
    const ok = checkConsultReply(
      "성남시 강력범죄 10건, 전체 30건입니다 (경찰청 범죄 발생 지역별 통계 (2025년), 2025, 시 단위). " +
      "수치는 범죄가 기록된 곳 기준 발생 건수이며, 거주자의 위험도가 아닙니다. " +
      "성남시는 시 단위 통계라 판교/분당을 분리할 수 없습니다. 점수·순위·등급을 매기지 않습니다.",
      SAFETY_RESULTS);
    assert.deepEqual(ok, { ok: true });
    // Refusals of verdicts pass too.
    assert.deepEqual(
      checkConsultReply("안전 여부는 판단하지 않습니다. 발생 건수만 정리합니다.", SAFETY_RESULTS),
      { ok: true });
    // But an invented count still trips the number guard first.
    const bad = checkConsultReply("성남시 강력범죄 99건입니다", SAFETY_RESULTS);
    assert.equal(bad.cause, "invented_number");
  });

  it("falls back to numbers-only when the fake provider insists on a verdict", async () => {
    const scripted = (steps) => {
      let n = 0;
      return async () => steps[Math.min(n++, steps.length - 1)]();
    };
    const toolReply = (calls) => async () => ({
      message: { content: "", tool_calls: calls }, finish: "tool_calls",
      usage: { prompt_tokens: 10, completion_tokens: 5 },
      latency_ms: 1, provider: "meta", model: "muse-spark-1.3",
    });
    const textReply = (content) => async () => ({
      message: { content, tool_calls: [] }, finish: "stop",
      usage: { prompt_tokens: 10, completion_tokens: 5 },
      latency_ms: 1, provider: "meta", model: "muse-spark-1.3",
    });
    const complete = scripted([
      toolReply([{ id: "c1", name: "get_safety", args: { area: "pangyo" } }]),
      textReply("판교가 더 안전합니다. 1위입니다."),
      textReply("판교가 가장 안전합니다."),
    ]);
    const out = await runTurn({
      provider: "meta", scenario: fixtureScenario(), cache: createRunCache(),
      loadArea: async () => tinyArea(), loadSafety: async () => safetyDoc(),
      messages: [{ role: "user", content: "어디가 더 안전해?" }],
      completeFn: complete,
    });
    assert.equal(out.ok, true);
    assert.equal(out.fallback, true);
    assert.equal(out.guardCause, "score_verdict");
    assert.match(out.reply, /도구 결과의 수치만/);
    assert.match(out.reply, /발생 30건/);
    assert.equal(scoreVerdict(out.reply), null); // the fallback itself passes
  });

  it("renders safety/education fallbacks from tool results", () => {
    const text = numbersOnlyAnswer(SAFETY_RESULTS);
    assert.match(text, /발생 30건/);
    assert.match(text, /위험도가 아닙니다/);
    assert.equal(scoreVerdict(text), null);
  });
});

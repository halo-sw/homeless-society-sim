// Chat helpers: context payload, plain tool names, citations.
// 12b: the floating panel (placement, FAB, nudges, chips, open-memory)
// is gone with the chat screen; the ask-entry lesson lives on in the
// 12b reopen tests (landing-chat-12b, ui-render).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tinyArea, tinyScenario } from "./engine-fixture.js";
import { runTurn, formatAgentContext } from "../src/consult/agent.js";
import { agentContext, citationsFor, contextLine,
  toolActionKo, viewSystemLine } from "../src/ui/agent-float.js";

describe("agent context payload", () => {
  const state = {
    compareTab: "money", home: "A", follow: 1,
    followOptions: [{ value: "1", label: "구성원 1" }],
    clock: { day: 0, minute: 530 },
    moneyTenure: { A: "전세", B: "월세" },
    criteriaFocus: "C-shop-dwell", compareOpen: true,
  };

  it("carries tab, home, day, time, follow and selections", () => {
    const ctx = agentContext(state);
    assert.equal(ctx.tab, "money");
    assert.equal(ctx.tab_ko, "생활비");
    assert.equal(ctx.home, "A");
    assert.equal(ctx.day, 1);
    assert.equal(ctx.time, "08:50");
    assert.equal(ctx.follow, 1);
    assert.equal(ctx.followed_label, "구성원 1");
    assert.deepEqual(ctx.tenures, { A: "전세", B: "월세" });
    assert.equal(ctx.criterion_focus, "C-shop-dwell");
    assert.equal(ctx.compare_open, true);
  });

  it("degrades honestly without a clock or follow target", () => {
    const ctx = agentContext({});
    assert.equal(ctx.follow, 0);
    assert.equal(ctx.followed_label, "자유 카메라");
    assert.match(contextLine(ctx), /첫 화면|탭/);
  });

  it("formats one line where 이거 resolves", () => {
    const line = contextLine(agentContext(state));
    assert.match(line, /생활비 탭/);
    assert.match(line, /홈 A/);
    assert.match(line, /1일차 08:50/);
    assert.match(line, /구성원 1/);
    assert.match(line, /A 전세/);
    assert.match(line, /이거/);
    assert.equal(formatAgentContext(null), "");
    assert.match(formatAgentContext(agentContext(state)), /현재 화면/);
  });

  it("runTurn appends the context as a system message", async () => {
    let seen = null;
    const completeFn = async ({ messages }) => {
      seen = messages;
      return { message: { content: "알겠습니다.", tool_calls: [] },
        usage: { prompt_tokens: 5, completion_tokens: 5 } };
    };
    const out = await runTurn({
      provider: "meta",
      messages: [{ role: "user", content: "이거 설명해 줘" }],
      scenario: tinyScenario({ days: 2, background: 0 }),
      loadArea: async () => tinyArea(),
      context: agentContext(state),
      completeFn,
    });
    assert.equal(out.ok, true);
    const systems = seen.filter((m) => m.role === "system").map((m) => m.content);
    assert.equal(systems.length, 2);
    assert.match(systems[1], /생활비 탭 · 홈 A · 1일차 08:50/);
  });

  it("view changes render one system line", () => {
    assert.equal(viewSystemLine({ home: "B", day: 1, time: "08:50" }),
      "화면을 B · 1일차 08:50으로 옮겼어요");
    assert.equal(viewSystemLine({ home: "A" }), "화면을 A으로 옮겼어요");
    assert.equal(viewSystemLine({}), "화면을 옮겼어요");
  });
});

describe("tool actions and citations", () => {
  it("names every tool in plain Korean", () => {
    assert.equal(toolActionKo("price_reference"), "실거래가 확인");
    assert.equal(toolActionKo("jeonse_check"), "전세 점검");
    assert.equal(toolActionKo("support_programs"), "도움 제도 비교");
    assert.equal(toolActionKo("parse_listing"), "매물 읽기");
    assert.equal(toolActionKo("extract_profile"), "상황 읽기");
    assert.equal(toolActionKo("find_homes"), "집 후보 찾기");
    assert.equal(toolActionKo("build_scenario"), "시나리오 만들기");
    assert.equal(toolActionKo("mystery_tool"), "mystery_tool");
  });

  it("maps tool steps to sources, deduped", () => {
    const cites = citationsFor(["price_reference", "jeonse_check", "price_reference"]);
    assert.deepEqual(cites.map((c) => c.title), [
      "국토교통부 실거래가 공개시스템", "HUG 안심전세포털"]);
    assert.ok(cites[0].url.startsWith("https://"));
    const bare = citationsFor(["get_safety", "get_journey"]);
    assert.equal(bare[0].url, null);
    assert.deepEqual(citationsFor(["set_view", "nope"]), []);
    const search = citationsFor(["find_homes", "build_scenario"]);
    assert.deepEqual(search.map((c) => c.title), [
      "국토교통부 실거래가 공개시스템", "OpenStreetMap", "GIS건물통합정보"]);
  });
});

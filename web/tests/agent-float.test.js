import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tinyArea, tinyScenario } from "./engine-fixture.js";
import { runTurn, formatAgentContext } from "../src/consult/agent.js";
import { agentContext, chipsFor, citationsFor, contextLine,
  nextAgentCorner, nudgeAllowed, nudgeFor, placeAgentPanel,
  toolActionKo, viewSystemLine, DEFAULT_CHIPS,
  AGENT_PANEL_W, AGENT_PANEL_H } from "../src/ui/agent-float.js";

const VIEW = { w: 1280, h: 800 };

describe("floating panel placement", () => {
  it("sits bottom-right with nothing to avoid", () => {
    const p = placeAgentPanel({ viewport: VIEW });
    assert.equal(p.corner, "bottom-right");
    assert.equal(p.w, AGENT_PANEL_W);
    assert.equal(p.h, AGENT_PANEL_H);
    assert.equal(p.overlap, 0);
    assert.ok(p.x + p.w <= VIEW.w && p.y + p.h <= VIEW.h);
  });

  it("keeps the bottom-right corner when the Now card is on the left", () => {
    const p = placeAgentPanel({ viewport: VIEW,
      avoid: [{ x: 12, y: 76, w: 330, h: 500 }] });
    assert.equal(p.corner, "bottom-right");
    assert.equal(p.overlap, 0);
  });

  it("snaps bottom-left when the right side is covered", () => {
    const p = placeAgentPanel({ viewport: VIEW,
      avoid: [{ x: 800, y: 100, w: 460, h: 650 }] });
    assert.equal(p.corner, "bottom-left");
    assert.equal(p.overlap, 0);
  });

  it("minimises overlap when both corners are busy", () => {
    const p = placeAgentPanel({ viewport: VIEW,
      avoid: [
        { x: 0, y: 0, w: 1280, h: 700 }, // full-width band: both overlap
        { x: 900, y: 100, w: 380, h: 600 }, // extra weight on the right
      ] });
    assert.equal(p.corner, "bottom-left");
    assert.ok(p.overlap > 0);
  });

  it("clamps to small viewports and toggles corners", () => {
    const p = placeAgentPanel({ viewport: { w: 360, h: 500 } });
    assert.ok(p.w <= 360 - 24 && p.h <= 500 - 24);
    assert.ok(p.x >= 0 && p.y >= 0);
    assert.equal(nextAgentCorner("bottom-right"), "bottom-left");
    assert.equal(nextAgentCorner("bottom-left"), "bottom-right");
  });
});

describe("prompt chips", () => {
  it("depend on the current tab", () => {
    assert.ok(chipsFor("money").includes("전세로 살면 매달 얼마예요?"));
    assert.ok(chipsFor("quality").includes("이 출근길 왜 피곤해요?"));
    assert.ok(chipsFor("jeonse").includes("이 집 전세 괜찮은지 점검해 주세요"));
    assert.ok(chipsFor("support").includes("비슷한 공공임대 있어요?"));
    assert.deepEqual(chipsFor("no-such-tab"), DEFAULT_CHIPS);
    for (const tab of ["money", "quality", "jeonse", "support", "worthit",
        "compare", "priorities", "safety", "criteria", "listings"]) {
      assert.ok(chipsFor(tab).length >= 2, tab);
    }
  });
});

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

describe("gentle nudges", () => {
  it("rate-limits to one per minute", () => {
    assert.equal(nudgeAllowed(null, 1000), true);
    assert.equal(nudgeAllowed(0, 59999), false);
    assert.equal(nudgeAllowed(0, 60000), true);
    assert.equal(nudgeAllowed(1000, 500), false);
    assert.equal(nudgeAllowed(0, NaN), false);
  });

  it("fires on a ≥80% crowded leg first", () => {
    const n = nudgeFor({ journey: { legs: [
      { valuePct: 60 }, { valuePct: 93 },
    ] } }, []);
    assert.equal(n.id, "crowd");
    assert.match(n.text, /93%/);
    assert.equal(nudgeFor({ journey: { legs: [{ valuePct: 79 }] } }, []), null);
  });

  it("fires on the first Muse decision, then the jeonse band", () => {
    const state = {
      judgeLog: [{ badgeCls: "rule" }, { badgeCls: "spark" }],
      home: "A",
      money: { homes: { A: { jeonse_check: { computable: true,
        ratio_pct: 75, band: { key: "watch" } } } } },
    };
    assert.equal(nudgeFor(state, []).id, "muse-first");
    assert.equal(nudgeFor(state, ["muse-first"]).id, "jeonse-A");
    assert.match(nudgeFor(state, ["muse-first"]).text, /75%/);
    assert.equal(nudgeFor(state, ["muse-first", "jeonse-A"]), null);
    const calm = { money: { homes: { A: { jeonse_check: { computable: true,
      ratio_pct: 37, band: { key: "below" } } } } }, home: "A" };
    assert.equal(nudgeFor(calm, []), null);
  });
});

describe("tool actions and citations", () => {
  it("names every tool in plain Korean", () => {
    assert.equal(toolActionKo("price_reference"), "실거래가 확인");
    assert.equal(toolActionKo("jeonse_check"), "전세 점검");
    assert.equal(toolActionKo("support_programs"), "도움 제도 비교");
    assert.equal(toolActionKo("parse_listing"), "매물 읽기");
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
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tinyArea, tinyScenario } from "./engine-fixture.js";
import { runTurn, formatAgentContext } from "../src/consult/agent.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { agentContext, chipsFor, citationsFor, contextLine,
  loadAgentOpen, nextAgentCorner, nudgeAllowed, nudgeFor, placeAgentPanel,
  saveAgentOpen, shouldShowAgentFab, toolActionKo, viewSystemLine, DEFAULT_CHIPS,
  AGENT_PANEL_W, AGENT_PANEL_H, AGENT_DRAWER_W,
  AGENT_NARROW_W } from "../src/ui/agent-float.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

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

  it("docks as a drawer when both corners are busy (stage 11: never overlaps)", () => {
    const p = placeAgentPanel({ viewport: VIEW,
      avoid: [
        { x: 0, y: 0, w: 1280, h: 700 }, // full-width band: both overlap
        { x: 900, y: 100, w: 380, h: 600 }, // extra weight on the right
      ] });
    assert.equal(p.mode, "drawer");
    assert.equal(p.overlap, 0);
    assert.equal(p.shiftLeft, AGENT_DRAWER_W);
    assert.ok(p.w === AGENT_DRAWER_W && p.h === VIEW.h);
  });

  it("clamps to small viewports and toggles corners", () => {
    const p = placeAgentPanel({ viewport: { w: 360, h: 500 } });
    assert.ok(p.w <= 360 - 24 && p.h <= 500 - 24);
    assert.ok(p.x >= 0 && p.y >= 0);
    assert.equal(nextAgentCorner("bottom-right"), "bottom-left");
    assert.equal(nextAgentCorner("bottom-left"), "bottom-right");
  });
});

// Stage 11: the 1440×900 GPU captures. Obstacle rects measured from the
// captures' layout (compare card right, Now/left column, sim bar,
// tour bar, followed resident near the centre).
const GPU1440 = { w: 1440, h: 900 };
const GPU_AVOID_FULL = [
  { x: 1028, y: 76, w: 400, h: 702 }, // .ui-compare (right column card)
  { x: 12, y: 76, w: 330, h: 500 }, // .ui-simleft (Now card + left column)
  { x: 12, y: 700, w: 560, h: 174 }, // .ui-simbar (timeline bar)
  { x: 440, y: 790, w: 560, h: 100 }, // .ui-tour (demo tour bar)
  { x: 518, y: 252, w: 403, h: 396 }, // followed resident (central box)
];

function intersects(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe("stage 11 placement on the 1440x900 captures", () => {
  it("floats bottom-right with zero overlap when the right card is shut", () => {
    const p = placeAgentPanel({ viewport: GPU1440,
      avoid: [GPU_AVOID_FULL[1]] }); // only the left column
    assert.equal(p.mode, "float");
    assert.equal(p.corner, "bottom-right");
    assert.equal(p.overlap, 0);
  });

  it("floats bottom-left when only the right column is open", () => {
    const p = placeAgentPanel({ viewport: GPU1440,
      avoid: [GPU_AVOID_FULL[0]] });
    assert.equal(p.mode, "float");
    assert.equal(p.corner, "bottom-left");
    assert.equal(p.overlap, 0);
  });

  it("docks as a drawer on the full capture (both corners busy)", () => {
    const p = placeAgentPanel({ viewport: GPU1440, avoid: GPU_AVOID_FULL });
    assert.equal(p.mode, "drawer");
    assert.equal(p.overlap, 0);
    assert.ok(p.shiftLeft > 0);
    // The canvas narrows by shiftLeft: nothing ends up under the drawer.
    assert.ok(p.x + p.w <= GPU1440.w + 1);
  });

  it("falls back to a bottom sheet on narrow viewports (< 1100 px)", () => {
    const viewport = { w: 1000, h: 800 };
    const rightCard = { x: 588, y: 76, w: 400, h: 620 };
    const p = placeAgentPanel({ viewport,
      avoid: [rightCard, { x: 12, y: 76, w: 330, h: 500 },
        { x: 12, y: 620, w: 560, h: 154 }] });
    assert.ok(viewport.w < AGENT_NARROW_W);
    assert.equal(p.mode, "sheet");
    assert.ok(p.x >= 0 && p.y >= 0 && p.x + p.w <= viewport.w && p.y + p.h <= viewport.h);
    // The sheet CSS caps the right card so it ends above the sheet top:
    // the capped card must clear the sheet and stay usable.
    const capped = { ...rightCard, h: p.y - 12 - rightCard.y };
    assert.ok(capped.h > 200, `capped card keeps usable height (${capped.h})`);
    assert.equal(intersects(p, capped), false, "capped card scrolls above the sheet");
  });

  it("still floats on narrow viewports when a corner is free", () => {
    const p = placeAgentPanel({ viewport: { w: 1000, h: 800 },
      avoid: [{ x: 12, y: 76, w: 330, h: 500 }] });
    assert.equal(p.mode, "float");
    assert.equal(p.overlap, 0);
  });
});

describe("stage 11 open/closed memory", () => {
  const fakeStorage = (initial = {}) => {
    const data = { ...initial };
    return {
      getItem: (k) => (k in data ? data[k] : null),
      setItem: (k, v) => { data[k] = String(v); },
    };
  };

  it("defaults to closed and round-trips", () => {
    const s = fakeStorage();
    assert.equal(loadAgentOpen(s), false);
    assert.equal(saveAgentOpen(true, s), true);
    assert.equal(loadAgentOpen(s), true);
    saveAgentOpen(false, s);
    assert.equal(loadAgentOpen(s), false);
  });

  it("survives missing or throwing storage", () => {
    assert.equal(loadAgentOpen(null), false);
    assert.equal(saveAgentOpen(true, null), false);
    const bad = {
      getItem: () => { throw new Error("denied"); },
      setItem: () => { throw new Error("denied"); },
    };
    assert.equal(loadAgentOpen(bad), false);
    assert.equal(saveAgentOpen(true, bad), false);
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

describe("ask trigger visibility (stage 11b)", () => {
  it("always shows while the panel is closed, in every mode", () => {
    for (const mode of ["float", "drawer", "sheet"]) {
      assert.equal(shouldShowAgentFab(false, mode), true, mode);
    }
    assert.equal(shouldShowAgentFab(true, "float"), true);
    assert.equal(shouldShowAgentFab(true, "drawer"), false);
    assert.equal(shouldShowAgentFab(true, "sheet"), false);
  });

  it("keeps the 물어보기 button outside the Popover trigger", () => {
    const src = readFileSync(join(ROOT, "web/src/ui/consult.jsx"), "utf8");
    assert.ok(src.includes("shouldShowAgentFab(consultOpen, effMode)"),
      "FAB visibility runs through the helper");
    const open = src.indexOf("<Popover");
    const close = src.indexOf("</Popover>");
    assert.ok(open >= 0 && close > open, "one Popover wraps the panel");
    const trigger = src.slice(open, close);
    assert.ok(!trigger.includes('label="물어보기"'),
      "the ask button must not nest inside the Popover trigger");
    assert.ok(src.includes('label="물어보기"'), "the ask button still exists");
  });
});

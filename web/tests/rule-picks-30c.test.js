// 30c: rule mode understands "save 1 and 2" and "live in them".
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));

describe("30c readChatIntent", () => {
  let readChatIntent;
  let ruleTurnPlan;
  let ruleGateLine;
  let museModelLabel;
  before(async () => {
    ({ readChatIntent, ruleTurnPlan, ruleGateLine } =
      await import("../src/chat/intent.js"));
    ({ museModelLabel } = await import("../src/ui/powered-by-muse.jsx"));
  });

  const picks = [
    "save 1 and 2",
    "pick 1, 3",
    "add 2 and 5",
    "1 and 2",
    "#1 #2",
    "1번이랑 2번 담아 줘",
    "1, 3번 담아",
    "2번 5번 골라 줘",
    "1번 2번",
  ];
  for (const t of picks) {
    it(`pick: ${t}`, () => {
      const out = readChatIntent(t, { candidateCount: 6 });
      assert.equal(out && out.type, "pick", t);
      assert.ok(!out.thenRun, t);
    });
  }

  it("pick numbers are exact", () => {
    assert.deepEqual(readChatIntent("save 1 and 2", { candidateCount: 6 }),
      { type: "pick", numbers: [1, 2] });
    assert.deepEqual(readChatIntent("pick 1, 3", { candidateCount: 6 }),
      { type: "pick", numbers: [1, 3] });
    assert.deepEqual(readChatIntent("2번 5번 골라 줘", { candidateCount: 6 }),
      { type: "pick", numbers: [2, 5] });
  });

  const runs = [
    "live in both homes",
    "live in them",
    "live 30 days",
    "run it",
    "compare them",
    "살아 봐 줘",
    "두 집에서 살아 봐",
    "30일 살아 봐",
    "비교해 줘",
  ];
  for (const t of runs) {
    it(`run: ${t}`, () => {
      assert.deepEqual(readChatIntent(t, { candidateCount: 6 }),
        { type: "run" });
    });
  }

  it("pick and run in one sentence", () => {
    assert.deepEqual(
      readChatIntent("save 1 and 2 and live in them", { candidateCount: 6 }),
      { type: "pick", numbers: [1, 2], thenRun: true });
  });

  it("returns null for out-of-range, profile, and other text", () => {
    assert.equal(readChatIntent("save 9 and 2", { candidateCount: 6 }), null);
    assert.equal(
      readChatIntent("I work at Meta HQ, up to $5,000", { candidateCount: 6 }),
      null);
    assert.equal(
      readChatIntent("판교 출근, 전세 3억 이하", { candidateCount: 6 }), null);
    assert.equal(readChatIntent("hello", { candidateCount: 6 }), null);
  });
});

describe("30c ruleTurnPlan", () => {
  let ruleTurnPlan;
  let ruleGateLine;
  before(async () => {
    ({ ruleTurnPlan, ruleGateLine } = await import("../src/chat/intent.js"));
  });
  const cands = [
    { id: "h1", name: "잠실 A" },
    { id: "h2", name: "잠실 B" },
    { id: "h3", name: "잠실 C" },
  ];

  it("pick carries the ids of map numbers 1 and 2", () => {
    const plan = ruleTurnPlan({ text: "save 1 and 2", candidates: cands, picks: [] });
    assert.equal(plan.type, "pick");
    assert.deepEqual(plan.ids, ["h1", "h2"]);
    assert.ok(plan.message.includes("잠실 A"), plan.message);
  });

  it("run with 0 picks gives the gate text", () => {
    const plan = ruleTurnPlan({ text: "live in them", candidates: cands, picks: [] });
    assert.equal(plan.type, "gate");
    assert.equal(plan.message, ruleGateLine(0));
    assert.ok(plan.message.includes("비교할 집을"), plan.message);
  });

  it("run with 2 picks runs", () => {
    const plan = ruleTurnPlan({
      text: "두 집에서 살아 봐 줘", candidates: cands, picks: ["h1", "h2"] });
    assert.equal(plan.type, "run");
    assert.deepEqual(plan.ids, ["h1", "h2"]);
  });

  it("pick-then-run is ready with 2 numbers", () => {
    const plan = ruleTurnPlan({
      text: "save 1 and 2 and live in them", candidates: cands, picks: [] });
    assert.equal(plan.type, "pick");
    assert.equal(plan.thenRun, true);
    assert.equal(plan.runReady, true);
  });

  it("profile turns stay null", () => {
    assert.equal(ruleTurnPlan({
      text: "판교 출근, 전세 3억 이하", candidates: cands, picks: [] }), null);
  });
});

describe("30c keyless details", () => {
  let museModelLabel;
  before(async () => {
    ({ museModelLabel } = await import("../src/ui/powered-by-muse.jsx"));
  });

  it("museModelLabel is tri-state", () => {
    assert.equal(museModelLabel(true), "Muse Spark 1.3");
    assert.equal(museModelLabel(false), "규칙 모드");
    assert.equal(museModelLabel(null), "연결 확인 중");
  });

  it("keyless notice shares the replay chip", async () => {
    const top = fs.readFileSync(
      path.join(here, "..", "src", "ui", "topbar.jsx"), "utf8");
    assert.ok(top.includes("live={museLive}"), "top bar passes tri-state live");
    const src = fs.readFileSync(
      path.join(here, "..", "src", "ui", "chat.jsx"), "utf8");
    assert.ok(!src.includes("ui-chat-fallback"), "no below-composer fallback");
    const row = src.slice(src.indexOf("ui-chat-chips"), src.indexOf("ui-chat-chips") + 1200);
    assert.ok(row.includes("REPLAY_CHIP_LABEL"), "replay rides the chip row");
    assert.ok(row.indexOf("REPLAY_CHIP_LABEL") < row.indexOf("chips.map"),
      "replay is the first chip");
    const { replayChipVisible } = await import("../src/ui/chat.jsx");
    assert.equal(typeof replayChipVisible, "function");
    assert.equal(replayChipVisible({ museFails: 1, messages: [], replayId: null }), true);
    assert.equal(replayChipVisible({ museFails: 0, messages: [], replayId: null }), false);
    assert.equal(replayChipVisible({ museFails: 0, messages: [], replayId: "x" }), false);
  });
});

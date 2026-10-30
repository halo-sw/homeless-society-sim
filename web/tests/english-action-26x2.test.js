// 26x2: English mode — an action turn whose retry is still Korean
// falls back to the translatable action confirmation.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { tinyArea, tinyScenario } from "./engine-fixture.js";
import { runTurn } from "../src/consult/agent.js";
import { emptyProfile, field } from "../src/profile.js";

// Live 26x text: free model Korean (합니다체), no guard numbers in it.
const KO = "찜하신 두 곳을 저장해 두었습니다. 비교와 살아 보기를 이어서 도와드릴 수 있습니다.";

function bucket(center, jeonse) {
  return {
    center_m2: center, range_m2: [center - 5, center + 5],
    trade: null,
    jeonse: jeonse ? { count: jeonse[0], median_won: jeonse[1],
      min_won: jeonse[2], max_won: jeonse[3] } : null,
    wolse: null,
  };
}

const HOMES = {
  homes: [
    { id: "x1", name: "판교푸르지오", kind: "아파트", region: "bundang",
      lon: 127.1, lat: 37.39, build_year: 2010, buckets: [bucket(60, [5, 180000000, 150000000, 200000000])],
      station: { station: "판교", walk_minutes: 8, source: "graph" },
      scene: null, photos_700m: 0 },
    { id: "x2", name: "봇들마을", kind: "아파트", region: "bundang",
      lon: 127.11, lat: 37.38, build_year: 2005, buckets: [bucket(60, [4, 150000000, 120000000, 180000000])],
      station: null, scene: null, photos_700m: 0 },
  ],
};

const NETWORK = {
  lines: [{
    id: "bundang", name: "수인·분당선",
    stops: [
      { id: "s1", key: "정자", name: "정자" },
      { id: "s2", key: "판교", name: "판교" },
    ],
    patterns: [{ id: "p1", stops: ["s1", "s2"], chainage_km: [0, 2.0] }],
  }],
};

function profile() {
  const p = emptyProfile();
  p.members = field([{ role: "adult" }], "customer", "");
  p.workplaces = field([{ member: 0, text: "Pangyo", resolved: { station: "판교" } }],
    "customer", "");
  p.tenure = field("jeonse", "customer", "");
  p.depositMax = field(200000000, "customer", "");
  return p;
}

function textReply(content) {
  return async () => ({
    message: { content, tool_calls: [] }, finish: "stop",
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  });
}

function toolReply(calls) {
  return async () => ({
    message: { content: "", tool_calls: calls }, finish: "tool_calls",
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  });
}

function scripted(steps) {
  let calls = 0;
  const fn = async () => steps[Math.min(calls++, steps.length - 1)]();
  fn.calls = () => calls;
  return fn;
}

function baseTurn(completeFn) {
  return {
    provider: "meta",
    messages: [{ role: "user", content: "Save 1 and 2" }],
    scenario: tinyScenario({ days: 2, background: 0 }),
    loadArea: async () => tinyArea(),
    loadHomes: async () => HOMES,
    loadRegion: async () => ({ network: NETWORK, congestion: null }),
    loadPhotos: async () => ({ items: [] }),
    context: { lang: "en" },
    completeFn,
  };
}

describe("english action 26x2", () => {
  it("a still-Korean retry on an action turn answers the translatable confirmation", async () => {
    const complete = scripted([
      toolReply([
        { id: "c1", name: "find_homes", args: { profile: profile() } },
        { id: "c2", name: "pick_homes", args: { candidate_ids: ["x1", "x2"] } },
      ]),
      textReply(KO),
      textReply(KO),
    ]);
    const out = await runTurn(baseTurn(complete));
    assert.equal(out.ok, true);
    assert.equal(complete.calls(), 3);
    assert.ok(out.reply.includes("찜했어요"));
    assert.ok(out.reply.includes("판교푸르지오"));
    assert.ok(out.reply.includes("봇들마을"));
    assert.equal(out.fallback, true);
    assert.equal(out.guardCause, "english_retry_korean_action");
  });

  it("a still-Korean retry with no action keeps the Korean text", async () => {
    const complete = scripted([
      toolReply([
        { id: "c1", name: "find_homes", args: { profile: profile() } },
      ]),
      textReply(KO),
      textReply(KO),
    ]);
    const out = await runTurn(baseTurn(complete));
    assert.equal(out.ok, true);
    assert.equal(out.reply, KO);
    assert.equal(out.fallback, true);
    assert.equal(out.guardCause, "english_retry_korean");
  });
});

describe("english guard-correction retry 26x3", () => {
  // Number in no tool result: the first answer fails the guard, so the
  // turn goes through the guard-correction retry (not the 26x2 branch).
  const BAD = "Saved both homes for a deposit of ₩999,999,999 won";

  function pickTurn(completeFn, lang) {
    const turn = baseTurn(completeFn);
    turn.context = { lang };
    return turn;
  }

  it("a still-Korean correction retry on an action turn answers the translatable confirmation", async () => {
    const complete = scripted([
      toolReply([
        { id: "c1", name: "find_homes", args: { profile: profile() } },
        { id: "c2", name: "pick_homes", args: { candidate_ids: ["x1", "x2"] } },
      ]),
      textReply(BAD),
      textReply(KO),
    ]);
    const out = await runTurn(pickTurn(complete, "en"));
    assert.equal(out.ok, true);
    assert.equal(complete.calls(), 3);
    assert.ok(out.reply.includes("찜했어요"));
    assert.ok(out.reply.includes("판교푸르지오"));
    assert.ok(out.reply.includes("봇들마을"));
    assert.equal(out.fallback, true);
    assert.equal(out.guardCause, "english_retry_korean_action");
  });

  it("the English correction note asks for English, not Korean", async () => {
    const seen = [];
    let calls = 0;
    const steps = [
      toolReply([
        { id: "c1", name: "find_homes", args: { profile: profile() } },
        { id: "c2", name: "pick_homes", args: { candidate_ids: ["x1", "x2"] } },
      ]),
      textReply(BAD),
      textReply(KO),
    ];
    const complete = async (args) => {
      seen.push(args.messages);
      return steps[Math.min(calls++, steps.length - 1)]();
    };
    await runTurn(pickTurn(complete, "en"));
    assert.equal(seen.length, 3);
    const note = seen[2][seen[2].length - 1];
    assert.ok(note.content.includes("in English"));
    assert.ok(!note.content.includes("한국어로"));
  });

  it("the Korean correction note is unchanged", async () => {
    const seen = [];
    let calls = 0;
    const steps = [
      toolReply([
        { id: "c1", name: "find_homes", args: { profile: profile() } },
      ]),
      textReply("보증금은 999,999,999원입니다."),
      textReply(KO),
    ];
    const complete = async (args) => {
      seen.push(args.messages);
      return steps[Math.min(calls++, steps.length - 1)]();
    };
    const out = await runTurn(pickTurn(complete, "ko"));
    assert.equal(out.ok, true);
    assert.equal(seen.length, 3);
    const note = seen[2][seen[2].length - 1];
    assert.ok(note.content.includes("한국어로"));
  });
});

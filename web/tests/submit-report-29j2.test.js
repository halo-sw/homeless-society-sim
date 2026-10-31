// Stage 29j2: submit_report is the only way Muse hands in the
// comparison — verified inside the handler (fake call, no network).

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { TOOL_DEFS, callTool } from "../src/consult/tools.js";
import { chatToolDefs, formatAgentContext } from "../src/consult/agent.js";
import { validateReportBody } from "../src/consult/server.js";
import { reportDigest } from "../src/verify/compare.js";
import { REPORT_PROMPT, makeJudge, writeReport } from "../src/consult/report.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const GT = JSON.parse(readFileSync(
  join(HERE, "..", "..", "scenarios", "verify", "ground_truth.json"), "utf-8"));

function cmpRun(prefix) {
  return {
    meta: { start_date: "2026-11-01", area: "seoul-x" },
    agents: [{ key: "m1", household: true }, { key: "m2", household: true }],
    trips: [
      { id: `${prefix}-am1`, agent: "m1", day: 11, purpose: "commute",
        minutes: 30, depart_min: 480,
        from: { kind: "home", label: "집" }, to: { kind: "work", label: "일터" } },
      { id: `${prefix}-dark`, agent: "m1", day: 11, purpose: "commute",
        minutes: 13, depart_min: 1097, arrive_min: 1110, mode: "bike",
        from: { kind: "work", label: "Meta HQ (1 Hacker Way)" },
        to: { kind: "home", label: "집" } },
      { id: `${prefix}-late`, agent: "m1", day: 12, purpose: "commute",
        minutes: 13, depart_min: 1347, arrive_min: 1360,
        from: { kind: "work", label: "Meta HQ (1 Hacker Way)" },
        to: { kind: "home", label: "집" } },
      { id: `${prefix}-am2`, agent: "m2", day: 11, purpose: "commute",
        minutes: 25, depart_min: 480,
        from: { kind: "home", label: "집" }, to: { kind: "work", label: "일터" } },
      { id: `${prefix}-pm2`, agent: "m2", day: 11, purpose: "commute",
        minutes: 25, depart_min: 1000, arrive_min: 1025,
        from: { kind: "work", label: "일터" }, to: { kind: "home", label: "집" } },
      { id: `${prefix}-err`, agent: "m1", day: 13, purpose: "errand",
        minutes: 10, depart_min: 600,
        from: { kind: "home", label: "집" }, to: { kind: "shop", label: "마트" } },
    ],
    aways: [],
    decisions: [],
  };
}

const RUNS = { A: cmpRun("a"), B: cmpRun("b") };
const HOMES = { A: { monthly_won: 500000 }, B: { monthly_won: 600000 } };
const LABELS = ["A", "B"];
const PERSONA = "newlywed_couple";

// Sentences built from the live digest, so numbers and evidence ids
// always match the engine. Texts carry no digits (judge sentences
// have no claims, so any digit would read as an invented number).
function buildSentences({ dropBC01 = false } = {}) {
  const digest = reportDigest({ runs: RUNS, labels: LABELS, homes: HOMES,
    persona: PERSONA, groundTruth: GT });
  const out = [];
  for (const label of LABELS) {
    for (const item of digest.items) {
      if (item.engine === "none") continue;
      if (dropBC01 && label === "B" && item.id === "C01") continue;
      if (item.values) {
        const v = item.values[label];
        if (v === null || v === undefined) continue;
        if (item.id === "N01") {
          const claims = Object.entries(v).map(([member, vv]) =>
            ({ field: "minutes", value: vv.value, unit: vv.unit || "분", member }));
          if (claims.length === 0) continue;
          out.push({ id: `${label}n01`, home: label, item_id: item.id,
            text_ko: `${label}집 두 사람 통근 균형 문장`, claims, evidence: [] });
        } else {
          if (v.value === null || v.value === undefined) continue;
          const field = item.id === "C02" ? "monthly_total" : "minutes";
          out.push({ id: `${label}${item.id.toLowerCase()}`, home: label,
            item_id: item.id, text_ko: `${label}집 항목 비교 문장`,
            claims: [{ field, value: v.value, unit: v.unit }], evidence: [] });
        }
      } else if (item.events) {
        const evs = item.events[label] || [];
        if (evs.length === 0) continue;
        out.push({ id: `${label}${item.id.toLowerCase()}`, home: label,
          item_id: item.id, text_ko: `${label}집 밤늦게 도착한 날이 있어요`,
          claims: [], evidence: [evs[0].id] });
      }
    }
  }
  return out;
}

function toolReply(sentences, id = "call_1") {
  return { message: { content: "",
    tool_calls: [{ id, name: "submit_report", args: { sentences } }] }, usage: {} };
}

function judgeReply(obj) {
  return { message: { content: JSON.stringify(obj), tool_calls: [] }, usage: {} };
}

describe("29j2 tool registration", () => {
  it("TOOL_DEFS contains submit_report; the agent list does not", () => {
    assert.ok(TOOL_DEFS.some((t) => t.function.name === "submit_report"));
    assert.ok(!chatToolDefs().some((t) => t.function.name === "submit_report"));
  });

  it("submit_report outside the report step fails", async () => {
    const r = await callTool({ context: null }, "submit_report", { sentences: [] });
    assert.equal(r.ok, false);
  });
});

describe("29j2 writeReport revise loop", () => {
  it("repairs a draft missing home B C01 after feedback_ko", async () => {
    const draft = buildSentences({ dropBC01: true });
    const full = buildSentences();
    assert.ok(draft.length < full.length);
    const seen = [];
    const seenAttempts = [];
    const call = async (args) => {
      seen.push(args);
      if (args.tools) {
        const n = seen.filter((c) => c.tools).length;
        return toolReply(n === 1 ? draft : full, `call_${n}`);
      }
      return judgeReply({ supported: true, reason: "ok" });
    };
    const out = await writeReport({ call, provider: "meta", runs: RUNS,
      labels: LABELS, homes: HOMES, persona: PERSONA, groundTruth: GT,
      onAttempt: (a) => seenAttempts.push(a) });
    assert.equal(out.status, "pass");
    assert.equal(out.attempts.length, 2);
    assert.equal(out.attempts[0].pass, false);
    assert.equal(seenAttempts.length, 2);
    const second = seen.filter((c) => c.tools)[1];
    const dumped = JSON.stringify(second.messages);
    assert.match(dumped, /feedback_ko/);
    assert.match(dumped, /C01/);
    for (const m of second.messages) {
      if (m && m.tool_calls) {
        assert.ok(Array.isArray(m.tool_calls) && m.tool_calls.length > 0,
          "assistant message must not carry an empty tool_calls array");
        for (const tc of m.tool_calls) {
          assert.equal(tc.type, "function");
          assert.equal(typeof tc.function.arguments, "string");
        }
      }
    }
    const toolMsgs = second.messages.filter((m) => m && m.role === "tool");
    assert.ok(toolMsgs.length > 0);
    for (const tm of toolMsgs) assert.equal(tm.tool_call_id, "call_1");
  });

  it("a judge that always rejects hands off after 4 attempts", async () => {
    const full = buildSentences();
    const call = async (args) => {
      if (args.tools) return toolReply(full);
      return judgeReply({ supported: false, reason: "기록과 시간이 달라요" });
    };
    const out = await writeReport({ call, provider: "meta", runs: RUNS,
      labels: LABELS, homes: HOMES, persona: PERSONA, groundTruth: GT });
    assert.equal(out.status, "handoff");
    assert.equal(out.attempts.length, 4);
    assert.ok(out.handoff && typeof out.handoff.question_ko === "string"
      && out.handoff.question_ko.length > 0);
    assert.ok(Array.isArray(out.result.failures) && out.result.failures.length > 0);
    for (const f of out.result.failures) {
      assert.ok(f.home && f.sentence_id);
    }
  });

  it("pet_owner is unsupported with no model call", async () => {
    let calls = 0;
    const call = async () => { calls++; throw new Error("must not be called"); };
    const out = await writeReport({ call, provider: "meta", runs: RUNS,
      labels: LABELS, homes: HOMES, persona: "pet_owner", groundTruth: GT });
    assert.equal(out.status, "unsupported");
    assert.equal(calls, 0);
  });
});

describe("29j4 report voice and judge label", () => {
  it("REPORT_PROMPT asks for 해요체, comma numbers, dated records", () => {
    assert.match(REPORT_PROMPT, /해요체/);
    assert.match(REPORT_PROMPT, /1,109,367원/);
    assert.match(REPORT_PROMPT, /날짜·시각·분/);
  });

  it("makeJudge sends label_ko when given a labels map", async () => {
    const seen = [];
    const call = async (args) => {
      seen.push(args);
      return judgeReply({ supported: true, reason: "ok" });
    };
    const judge = makeJudge({ call, provider: "meta",
      labels: new Map([["C06", "늦은 귀가"]]) });
    await judge({ text_ko: "늦은 귀가 문장", item_id: "C06" }, [{ id: "e1" }]);
    const userMsg = seen[0].messages.find((m) => m.role === "user");
    assert.equal(JSON.parse(userMsg.content).label_ko, "늦은 귀가");
  });
});

describe("29j2 result gate and context line", () => {
  it("open_panel result needs a verified report_status", async () => {
    const blocked = await callTool({ context: null }, "open_panel", { panel: "result" });
    assert.equal(blocked.ok, false);
    const ok = await callTool({ context: { report_status: "pass" } },
      "open_panel", { panel: "result" });
    assert.equal(ok.ok, true);
  });

  it("formatAgentContext renders checking as 검증 중", () => {
    assert.match(formatAgentContext({ report_status: "checking" }), /검증 중/);
  });
});

describe("29j2 validateReportBody", () => {
  const good = () => ({ labels: ["A", "B"], runs: RUNS, homes: HOMES, persona: PERSONA });

  it("passes a good body", () => {
    assert.equal(validateReportBody(good()), true);
  });

  it("throws on bad labels and oversized trips", () => {
    assert.throws(() => validateReportBody({ ...good(), labels: ["A"] }), /labels/);
    assert.throws(() => validateReportBody({ ...good(), labels: ["A", "D"] }), /labels/);
    const big = structuredClone(RUNS);
    big.A.trips = Array.from({ length: 3001 }, (_, i) => ({ id: `t${i}` }));
    assert.throws(() => validateReportBody({ ...good(), runs: big }), /trips/);
  });
});

describe("29j3b server-first import order", () => {
  it("importing server.js before tools.js succeeds and TOOL_DEFS has submit_report", async () => {
    const { execFileSync } = await import("node:child_process");
    const out = execFileSync("node", ["--input-type=module", "-e",
      `await import("./src/consult/server.js");\nconst { TOOL_DEFS } = await import("./src/consult/tools.js");\nif (!TOOL_DEFS.some((t) => t.function && t.function.name === "submit_report")) throw new Error("missing submit_report");\nconsole.log("server-first-ok");`],
      { cwd: join(HERE, ".."), encoding: "utf8" });
    assert.match(out, /server-first-ok/);
  });
});

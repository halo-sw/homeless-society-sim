// Stage 29j2: Muse hands in the two-home comparison only through
// submit_report; the handler verifies numbers + evidence ids in code,
// then the judge model checks whether the cited records support each
// judge sentence.

import { reportDigest, runComparisonLoop } from "../verify/compare.js";
import { UNSUPPORTED_PERSONA_KO } from "../verify/loop.js";
import { parseDiaryJson } from "./diary.js";
import { callTool } from "./tools.js";

export const REPORT_PROMPT = [
  "너는 두 집에서 30일을 살아 본 기록(digest)으로 비교 리포트를 쓴다. 최종 결과는 submit_report 도구로만 낸다(일반 답장 금지).",
  "문장 하나 = 집 하나(home: A/B/C) × 항목 하나(item_id). digest에 있는 항목만, 집마다 빠짐없이(must 먼저).",
  "숫자는 digest values의 숫자만. 숫자를 쓰면 claims에 {field, value, unit}: 시간 항목은 field:\"minutes\", unit:\"분\", N01은 구성원마다 member(m1, m2…) 필수, C02는 field:\"monthly_total\", unit은 digest의 unit(원 또는 $).",
  "events가 있는 항목(judge)은 그 event의 id를 evidence에 1개 이상 달고, 그 기록이 말하는 것만 쓴다. engine:\"none\" 항목과 events가 비어 있는 항목은 쓰지 않는다.",
  "추천·계약·\"낫다\" 같은 판단은 하지 않는다.",
].join("\n");

export const REPORT_PROMPT_EN =
  "Write every sentence and its text_ko field in plain English. "
  + "The digest, homes, item ids, numbers and every other rule above stay the same.";

export function reportPrompt(lang) {
  if (lang === "en") return `${REPORT_PROMPT}\n${REPORT_PROMPT_EN}`;
  return REPORT_PROMPT;
}

export const SUBMIT_REPORT_DEF = { type: "function", function: { name: "submit_report",
  description: "두 집 비교 리포트를 낸다 — 최종 비교는 이 도구로만 낸다. 코드가 숫자·근거를 검증하고, 실패하면 feedback_ko로 고쳐 다시 낸다.",
  parameters: { type: "object", additionalProperties: false,
    properties: { sentences: { type: "array", items: { type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string" },
        home: { type: "string" },
        item_id: { type: "string" },
        text_ko: { type: "string" },
        claims: { type: "array", items: { type: "object",
          properties: {
            field: { type: "string" },
            value: { type: "number" },
            unit: { type: "string" },
            member: { type: "string" },
          } } },
        evidence: { type: "array", items: { type: "string" } },
      },
      required: ["id", "home", "item_id", "text_ko"] } } },
    required: ["sentences"] } } };

export const JUDGE_PROMPT = "문장 하나와 그 문장이 인용한 시뮬레이션 기록(events)을 보고, 기록이 문장의 내용(시간·횟수·장소·상황)을 실제로 뒷받침하는지만 판정한다. 기록에 없는 내용을 단정하면 supported=false. JSON으로만: {\"supported\": true|false, \"reason\": \"한 줄\"}.";

export function makeJudge({ call, provider }) {
  return async (sentence, events) => {
    const res = await call({ provider,
      messages: [
        { role: "system", content: JUDGE_PROMPT },
        { role: "user", content: JSON.stringify(
          { sentence: sentence.text_ko, item_id: sentence.item_id, events }) },
      ],
      maxTokens: 800 });
    const content = (res && res.message && res.message.content) || "";
    return parseDiaryJson(content);
  };
}

function toolArgsOf(message) {
  const calls = (message && message.tool_calls) || [];
  const hit = calls.find((c) => c && c.name === "submit_report");
  if (!hit) return null;
  if (typeof hit.args === "string") return JSON.parse(hit.args);
  return hit.args || {};
}

function toolCallIdOf(message) {
  const calls = (message && message.tool_calls) || [];
  const hit = calls.find((c) => c && c.name === "submit_report");
  return (hit && hit.id) || "submit_report_1";
}

export function wireToolCalls(calls) {
  return (calls || []).map((c) => ({ id: c.id, type: "function",
    function: { name: c.name,
      arguments: typeof c.args === "string" ? c.args : JSON.stringify(c.args || {}) } }));
}

function assistantEntry(message) {
  const wired = wireToolCalls(message && message.tool_calls);
  if (wired.length > 0) return { role: "assistant", content: message.content || "", tool_calls: wired };
  return { role: "assistant", content: (message && message.content) || "" };
}

export async function writeReport({ call, provider, runs, labels, homes,
  names = {}, persona, groundTruth, lang = "ko", onAttempt = null }) {
  const digest = reportDigest({ runs, labels, homes, persona, groundTruth, names });
  if (digest && digest.unsupported) {
    return { ok: true, status: "unsupported", reason_ko: UNSUPPORTED_PERSONA_KO,
      attempts: [], report: null, handoff: null };
  }
  const usage = { prompt_tokens: 0, completion_tokens: 0, calls: 0 };
  const takeUsage = (res) => {
    const u = (res && res.usage) || {};
    usage.prompt_tokens += u.prompt_tokens || 0;
    usage.completion_tokens += u.completion_tokens || 0;
    usage.calls++;
  };
  const messages = [
    { role: "system", content: reportPrompt(lang) },
    { role: "user", content: JSON.stringify(digest) },
  ];
  const tools = [SUBMIT_REPORT_DEF];
  let first = await call({ provider, messages: [...messages], tools, maxTokens: 8000 });
  takeUsage(first);
  let assistantMessage = (first && first.message) || { content: "", tool_calls: [] };
  let args = toolArgsOf(assistantMessage);
  if (!args) {
    messages.push({ role: "assistant", content: assistantMessage.content || "" });
    messages.push({ role: "user", content: "submit_report 도구로만 답해 주세요." });
    const retry = await call({ provider, messages: [...messages], tools, maxTokens: 8000 });
    takeUsage(retry);
    assistantMessage = (retry && retry.message) || { content: "", tool_calls: [] };
    args = toolArgsOf(assistantMessage) || { sentences: [] };
  }
  messages.push(assistantEntry(assistantMessage));
  let lastToolCallId = toolCallIdOf(assistantMessage);
  const judge = makeJudge({ call, provider });
  const revise = async (report, result, attempt) => {
    messages.push({ role: "tool", tool_call_id: lastToolCallId,
      content: JSON.stringify({ ok: false, attempt, feedback_ko: result.feedback_ko }) });
    const res = await call({ provider, messages: [...messages], tools, maxTokens: 8000 });
    takeUsage(res);
    assistantMessage = (res && res.message) || { content: "", tool_calls: [] };
    messages.push(assistantEntry(assistantMessage));
    lastToolCallId = toolCallIdOf(assistantMessage);
    const next = toolArgsOf(assistantMessage) || { sentences: [] };
    return { persona, sentences: next.sentences || [] };
  };
  const session = { report: { runs, labels, homes, persona, groundTruth,
    judge, revise, onAttempt }, context: null };
  const out = await callTool(session, "submit_report", args);
  return { ok: true, status: out.status, report: out.report,
    attempts: out.attempts, handoff: out.handoff, result: out.result, usage };
}

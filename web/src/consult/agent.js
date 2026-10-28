// Consult agent loop: one user turn, up to MAX_TOOL_ROUNDS tool rounds.
//
// The browser owns the conversation (messages) and the working scenario;
// this module runs one turn server-side: provider call -> tool calls ->
// guard check -> reply. On guard failure it retries once with a
// correction note, then answers with the tool numbers only. Node-side.

import { completeWithTools, providerConfig } from "../judge/providers.js";
import { costUsd } from "../judge/run.js";
import {
  TOOL_DEFS, MAX_TOOL_ROUNDS, createSession, callTool,
} from "./tools.js";
import { checkConsultReply, numbersOnlyAnswer } from "./guards.js";

export const SYSTEM_PROMPT = [
  "너는 주거 생활 시뮬레이터의 '시뮬레이션 상담' 에이전트다. 한국어로 짧게 답한다.",
  "역할: 시나리오 조건을 정하고(run_simulation), 결과를 설명하고, '만약에' 질문에는 조건을 바꿔 다시 실행해 전/후를 비교한다.",
  "첫 대화에서는 한 번에 하나씩 묻는다: 누구와 사는지, 근무일, 출근역, 승차 시간(앱은 대중교통 시간을 알 수 없으니 고객이 말한 숫자를 그대로 쓰고 가정값이라 밝힌다), 장보기·산책·병원 이용. 그 뒤 실행을 제안한다.",
  "수치는 반드시 이번 대화의 도구 결과에 나온 것만 그대로 인용한다. 도구 결과를 보지 않은 숫자를 만들지 않는다.",
  "오늘 고를 수 있는 지역은 판교·성수·송파구·잠실 4곳뿐이다. 다른 곳을 물으면 '전국 생성은 다음 단계'라고 안내한다.",
  "가격 전망·투자 조언·안전/범죄·학군·건강/의료 질문은 정중히 거절하고 시뮬레이션으로 답할 수 있는 것(도보 시간·거리, 생활 패턴 비교)으로 돌린다.",
  "시뮬레이션은 현실 예측이 아니라 '가정한 조건의 시나리오'임을 분명히 한다. 현실을 예언하는 표현을 쓰지 않는다.",
  "decisions=muse 실행은 느리고 비용이 든다: 실행 전에 경고하고 고객 확인을 받는다. 한 대화에서 1회까지만.",
  "설명할 때는 set_view로 화면을 함께 보여준다(홈·일차·시간·따라가기).",
  "도구 호출은 턴당 최대 6라운드까지다. 짧게, 먼저 보여줄 것부터.",
].join("\n");

export function countMuseRuns(messages) {
  let n = 0;
  const resultsById = new Map();
  for (const m of messages || []) {
    if (m && m.role === "tool" && m.tool_call_id) {
      try {
        resultsById.set(m.tool_call_id, JSON.parse(m.content));
      } catch { /* not a consult result */ }
    }
  }
  for (const m of messages || []) {
    for (const c of (m && m.tool_calls) || []) {
      if (c.name !== "run_simulation") continue;
      let args = c.args;
      if (typeof args === "string") {
        try {
          args = JSON.parse(args);
        } catch {
          args = {};
        }
      }
      if ((args || {}).decisions === "muse" && (resultsById.get(c.id) || {}).ok) n++;
    }
  }
  return n;
}

function shortJson(value, max = 120) {
  const s = JSON.stringify(value);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export function summarizeToolCall(name, args, result, ms) {
  const r = result || {};
  if (!r.ok) return { summary: `실패: ${String(r.error || "error").slice(0, 80)}`, ok: false };
  switch (name) {
    case "run_simulation": {
      const ids = Object.entries(r.run_ids || {}).map(([h, id]) => `${h}→${id}`).join(", ");
      return { summary: `${args.home || ""} 실행(${(r.decisions || "")}) → ${ids}`, ok: true };
    }
    case "update_scenario":
      return { summary: `시나리오 갱신(${(r.scenario.household.members || []).length}명, 홈 ${(r.scenario.homes || []).length}곳)`, ok: true };
    case "find_places":
      return { summary: `${r.category} ${(r.places || []).length}곳(그래프 분)`, ok: true };
    case "list_complexes":
      return { summary: `단지 ${r.count}곳`, ok: true };
    case "list_stations":
      return { summary: `역 ${r.count}곳`, ok: true };
    case "compare":
      return { summary: `비교(${(r.compare.metrics || []).length}개 지표)`, ok: true };
    case "get_day":
      return { summary: `${r.day}일차 ${(r.trips || []).length}회 이동`, ok: true };
    case "explain_decision":
      return { summary: `${r.kind_ko} → ${r.chosen_key}(${r.badge})`, ok: true };
    case "set_view":
      return { summary: r.chip || "화면 이동", ok: true };
    case "get_scenario":
    case "list_areas":
      return { summary: "조회", ok: true };
    default:
      return { summary: shortJson(r), ok: true };
  }
}

function toProviderMessages(messages) {
  // Client history is already OpenAI-shaped; validate lightly.
  return (messages || []).map((m) => {
    if (m.role === "tool") {
      return { role: "tool", tool_call_id: m.tool_call_id, content: String(m.content || "") };
    }
    if (m.role === "assistant" && m.tool_calls) {
      return { role: "assistant", content: m.content || "",
        tool_calls: m.tool_calls.map((c) => ({ id: c.id, type: "function",
          function: { name: c.name, arguments: typeof c.args === "string" ? c.args : JSON.stringify(c.args || {}) } })) };
    }
    return { role: m.role, content: String(m.content || "") };
  });
}

export async function runTurn(opts) {
  const {
    provider = "meta", messages = [], scenario,
    cache, loadArea, loadDecisions = null, judgeHome = null,
    fetchImpl = null, completeFn = null,
  } = opts;
  if (!scenario || typeof scenario !== "object") throw new Error("scenario is required");
  const cfg = providerConfig(provider);
  const complete = completeFn || ((args) => completeWithTools({ ...args, fetchImpl }));
  const session = createSession({
    scenario, cache, loadArea, loadDecisions, judgeHome,
    provider, fetchImpl, museRunsPrior: countMuseRuns(messages),
  });
  const history = [{ role: "system", content: SYSTEM_PROMPT }, ...toProviderMessages(messages)];
  const appended = []; // new messages for the browser to keep
  const toolCalls = []; // compact rows for the UI
  const toolResults = []; // parsed results, in order (guard scope)
  const usage = { prompt_tokens: 0, completion_tokens: 0, calls: 0 };
  let view = null;
  let rounds = 0;

  for (;;) {
    rounds++;
    const res = await complete({
      provider, messages: history, tools: TOOL_DEFS,
      maxTokens: 2000,
    });
    usage.prompt_tokens += (res.usage && res.usage.prompt_tokens) || 0;
    usage.completion_tokens += (res.usage && res.usage.completion_tokens) || 0;
    usage.calls++;
    const calls = (res.message && res.message.tool_calls) || [];
    if (calls.length === 0) {
      const reply = (res.message && res.message.content) || "";
      appended.push({ role: "assistant", content: reply });
      const checked = checkConsultReply(reply, toolResults);
      if (checked.ok) {
        return finish({ reply, guardRetries: 0, fallback: false });
      }
      // Retry once with a correction note (text only), else numbers only.
      const retry = await complete({
        provider,
        messages: [...history,
          { role: "assistant", content: reply },
          { role: "user",
            content: `교정: 방금 답은 가드 실패(${checked.cause}: ${checked.detail}). 도구 결과의 수치만 그대로 쓰고, 금지 주제·현실예측 표현 없이 3줄 이내 한국어로 다시 답하라. 도구는 쓰지 마라.` }],
      });
      usage.prompt_tokens += (retry.usage && retry.usage.prompt_tokens) || 0;
      usage.completion_tokens += (retry.usage && retry.usage.completion_tokens) || 0;
      usage.calls++;
      const reply2 = (retry.message && retry.message.content) || "";
      const checked2 = checkConsultReply(reply2, toolResults);
      if (checked2.ok) {
        appended.push({ role: "user", content: "(교정 후 재답변)" });
        appended.push({ role: "assistant", content: reply2 });
        return finish({ reply: reply2, guardRetries: 1, fallback: false });
      }
      const fallback = numbersOnlyAnswer(toolResults);
      appended.push({ role: "assistant", content: fallback });
      return finish({ reply: fallback, guardRetries: 1, fallback: true,
        guardCause: checked2.cause });
    }
    if (rounds > MAX_TOOL_ROUNDS) {
      const fallback = `도구 호출이 ${MAX_TOOL_ROUNDS}라운드를 넘었다.\n${numbersOnlyAnswer(toolResults)}`;
      appended.push({ role: "assistant", content: fallback });
      return finish({ reply: fallback, guardRetries: 0, fallback: true,
        guardCause: "too_many_rounds" });
    }
    const outgoing = [];
    for (const c of calls) {
      const t0 = Date.now();
      const result = c.args_parse_error
        ? { ok: false, error: "tool arguments are not valid JSON" }
        : await callTool(session, c.name, c.args || {});
      const ms = Date.now() - t0;
      toolResults.push(result);
      const { summary, ok } = summarizeToolCall(c.name, (c.args || {}), result, ms);
      toolCalls.push({ name: c.name, ok, summary, ms,
        target: shortJson(c.args || {}, 80) });
      if (c.name === "set_view" && result.ok) view = { ...result.view, chip: result.chip };
      outgoing.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(result) });
      history.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(result) });
    }
    const assistantMsg = { role: "assistant", content: res.message.content || "",
      tool_calls: calls.map((c) => ({ id: c.id, name: c.name, args: c.args || {} })) };
    // Insert the assistant message before its tool results in history.
    history.splice(history.length - outgoing.length, 0, {
      role: "assistant", content: res.message.content || "",
      tool_calls: calls.map((c) => ({ id: c.id, type: "function",
        function: { name: c.name, arguments: JSON.stringify(c.args || {}) } })),
    });
    appended.push(assistantMsg, ...outgoing);
  }

  function finish(extra) {
    return {
      ok: true, ...extra,
      messages: appended, toolCalls,
      usage: { ...usage, est_usd: costUsd(provider, usage) },
      scenario: session.scenario,
      view, provider, model: cfg.model,
    };
  }
}

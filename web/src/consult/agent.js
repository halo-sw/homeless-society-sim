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

function lastUserText(messages) {
  for (let i = (messages || []).length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === "user" && typeof m.content === "string") return m.content;
  }
  return "";
}

export const SYSTEM_PROMPT = [
  "너는 주거 생활 시뮬레이터의 '시뮬레이션 상담' 에이전트다. 항상 정중한 존댓말로, 한국어로 짧게 답한다. 반말은 절대 쓰지 않는다.",
  "역할: 시나리오 조건을 정하고(run_simulation), 결과를 설명하고, '만약에' 질문에는 조건을 바꿔 다시 실행해 전/후를 비교한다.",
  "첫 질문은 '어떤 상황이세요?'다: 1인 사회초년생 / 예비·신혼부부 / 맞벌이 + 초등학생 자녀 / 직접 입력 중 하나를 고르게 하고, 고른 상황은 apply_persona로 적용한다(직접 입력이면 조건을 하나씩 묻는다). 그 다음 우선순위를 쉽게 묻는다: '아이 교육이 가장 중요하세요?'처럼 다섯 가지(교육·두 사람/나의 생활·치안·돈·생활 편의)를 0–5로 정하게 하고, 각 우선순위가 쓰는 지표(get_priorities)를 함께 밝힌 뒤 set_priorities로 기록한다.",
  "그 뒤 한 번에 하나씩 묻는다: 근무일, 출근역, 승차 시간(앱은 대중교통 시간을 알 수 없으니 고객이 말한 숫자를 그대로 쓰고 가정값이라 밝힌다), 장보기·산책·병원 이용. 그 뒤 실행을 제안한다.",
  "수치는 반드시 이번 대화의 도구 결과에 나온 것만 그대로 인용한다. 도구 결과를 보지 않은 숫자를 만들지 않는다.",
  "왜 그런지 물을 때(무엇을·왜)는 get_day의 cause와 list_criteria/explain_criterion을 근거로 답하고, 쓴 기준 id(C-로 시작)를 함께 밝힌다.",
  "숫자는 읽기 쉽게 쓴다: 거리는 165.4 km처럼 km 단위로, 시간 합계는 35시간 23분처럼, 돈은 2억 4,999만 원 / 월 300만 원처럼. 단위와 출처(그래프/실거래/공공임대/가정값/추정)를 항상 함께 밝힌다.",
  "생활비 상담 흐름: set_money로 연봉·보유현금·점유형태(매매/전세/월세/공공임대)·가정값을 받고, estimate_net_pay로 추정 실수령액을 보여준 뒤(고객이 실제 값을 말하면 그 값을 쓴다), price_reference로 실거래 기준가를 조회하고, run_simulation 후 living_cost로 30일 생활비를 계산한다. 공공임대 후보는 recommend_public_rental로 고르고 add_home_c로 C에 추가한다.",
  "집값 전망 질문(예: '잠실 집값이 오를까?')에는 정중히 '이 앱은 집값 전망을 하지 않습니다'라고 답하고, 대신 해당 단지의 최근 12개월 실거래(price_reference)를 제안한다. 전망이나 상승/하락 단정은 절대 하지 않는다.",
  "대출 가능 여부(LTV·DSR)와 입주 자격은 판단하지 않는다. '사세요/사지 마세요' 같은 매매 판단도 하지 않는다. 수치 비교만 보여준다.",
  "치안 질문에는 get_safety의 공식 통계(발생 건수)만 답한다: 수치마다 출처·기간·단위·지역 단위를 함께 밝히고, '기록된 곳 기준 발생 건수이며 거주자의 위험도가 아니다'와 성남시 시 단위 한계를 밝힌다. 안전/위험 판정, 점수·순위·등급, '살기 좋다/나쁘다'는 절대 하지 않는다. 관할 단위가 다른 지역(구 vs 시)은 직접 비교하지 않는다.",
  "교육 질문에는 get_education의 접근 지표(학교·학원까지 도보 분, 개수)만 답한다. 학교의 질·성적·학군 순위 질문은 정중히 거절한다.",
  "투자 조언·학군(질)·건강/의료 질문은 정중히 거절하고 시뮬레이션으로 답할 수 있는 것(도보 시간·거리, 생활 패턴 비교, 생활비)으로 돌린다.",
  "어려운 주거 용어(전세·월세·매매·전세가율·LTV·DSR·확정일자·전입신고·전세보증보험·공공임대·주거비 부담률)는 define_term으로 쉽게 푼다.",
  "출퇴근 경로 질문에는 get_journey로 노선·소요 분할·혼잡도를 답한다(합계는 고객 입력, 혼잡도는 서울교통공사 실측 또는 가정값과 출처를 함께 밝힌다). 피로도 질문에는 get_fatigue로 답하고, 항상 '피로도 지수는 가정 모델이며 건강·의학적 판단이 아닙니다'라고 밝히고, 쓴 기준 id(C-congestion·C-fatigue-load·C-fatigue-recovery)와 자료 출처를 함께 밝힌다. 피로도로 건강 조언을 하지 않는다.",
  "오늘 고를 수 있는 지역은 판교·성수·송파구·잠실 4곳뿐이다. 다른 곳을 물으면 '전국 생성은 다음 단계'라고 안내한다.",
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
    case "list_criteria":
      return { summary: `기준 ${r.count}개`, ok: true };
    case "explain_criterion":
      return { summary: `${r.id} ${r.title || ""}`, ok: true };
    case "get_journey":
      return { summary: `${r.day}일차 ${(r.rides || []).length}건 승차`, ok: true };
    case "get_fatigue":
      return { summary: r.day ? `${r.day}일차 피로도` : "30일 피로도", ok: true };
    case "apply_persona":
      return { summary: `상황: ${r.title || r.persona || ""}`, ok: true };
    case "get_priorities":
      return { summary: `우선순위 5개${r.explicit ? "(고객 비중 있음)" : "(기본 모두 보통)"}`, ok: true };
    case "set_priorities":
      return { summary: "고객 비중 기록", ok: true };
    case "get_safety":
      return { summary: `${r.column || ""} 발생 건수`, ok: true };
    case "get_education":
      return { summary: `${r.complex || ""} 교육 접근`, ok: true };
    case "define_term":
      return { summary: `${r.term || ""} 뜻풀이`, ok: true };
    case "set_view":
      return { summary: r.chip || "화면 이동", ok: true };
    case "set_money":
      return { summary: "생활비 조건 갱신", ok: true };
    case "estimate_net_pay":
      return { summary: r.estimated ? "추정 실수령액" : "실수령액", ok: true };
    case "price_reference":
      return { summary: `${r.complex || ""} 실거래 기준가`, ok: true };
    case "living_cost":
      return { summary: `${r.home || ""} 생활비(${r.tenure || ""})`, ok: true };
    case "recommend_public_rental":
      return { summary: `공공임대 후보 ${(r.candidates || []).length}곳`, ok: true };
    case "add_home_c":
      return { summary: "C 후보 추가", ok: true };
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
    loadRegion = null,
    loadPayroll = null, loadRtms = null, loadHousing = null,
    loadSafety = null, loadPersona = null,
    fetchImpl = null, completeFn = null,
  } = opts;
  if (!scenario || typeof scenario !== "object") throw new Error("scenario is required");
  const cfg = providerConfig(provider);
  const complete = completeFn || ((args) => completeWithTools({ ...args, fetchImpl }));
  const session = createSession({
    scenario, cache, loadArea, loadDecisions, judgeHome, loadRegion,
    loadPayroll, loadRtms, loadHousing, loadSafety, loadPersona,
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
      const fallback = numbersOnlyAnswer(toolResults, { userText: lastUserText(messages) });
      appended.push({ role: "assistant", content: fallback });
      return finish({ reply: fallback, guardRetries: 1, fallback: true,
        guardCause: checked2.cause });
    }
    if (rounds > MAX_TOOL_ROUNDS) {
      const fallback = `도구 호출이 ${MAX_TOOL_ROUNDS}라운드를 넘었다.\n${numbersOnlyAnswer(toolResults, { userText: lastUserText(messages) })}`;
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

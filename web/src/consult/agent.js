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

export function chatToolDefs() {
  return TOOL_DEFS.filter((t) => t.function.name !== "submit_report");
}
import { checkConsultReply, numbersOnlyAnswer, actionConfirmation, isMostlyKorean } from "./guards.js";
import { isRunRequest } from "../chat/intent.js";

// 26u: English-mode anchor. Sent once up front and re-sent as the last
// message before the final completion so it sits after the tool results
// (Korean tool output otherwise drags the model back to Korean).
export const ENGLISH_NOTE =
  "The customer reads English. Answer in plain English. Korean place and station names: romanized, with the Korean once in parentheses, e.g. Gangnam Stn (강남역). US places, streets and Meta HQ are already English: write them as they are, never with Korean. Write money for Korean homes as won with full digits and commas, e.g. ₩260,000,000, or as ₩260M; US rents in dollars as given, e.g. $4,261/mo. Every rule above still applies.";
const ENGLISH_RETRY_NOTE =
  "Your last answer was in Korean. Rewrite it in plain English with the same facts and numbers.";

// 26x3: shared "English but still Korean → action confirmation" choice,
// used by both the 26x2 branch and the guard-correction retry branch.
function englishActionFallback(toolResults, session) {
  return actionConfirmation(toolResults, { names: session.lastCandidateNames });
}

function lastUserText(messages) {
  for (let i = (messages || []).length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m && m.role === "user" && typeof m.content === "string") return m.content;
  }
  return "";
}

const START_CLAIM_EN_RE = /\b(it'?s started|started the (month|run)|starting the (month|run))\b/i;

// 29g1: the model copies the start sentence without calling
// start_life_run. Gate the claim: only a real run request starts the
// run, otherwise replace the claim with a not-started correction.
export function fixStartClaim({ text, userText, uiActions, isEnglish }) {
  const claimed = String(text || "").includes("시작했어요")
    || START_CLAIM_EN_RE.test(String(text || ""));
  if (!claimed) return { text, addRun: false };
  if ((uiActions || []).some((a) => a && a.action === "run")) {
    return { text, addRun: false };
  }
  if (isRunRequest(userText)) return { text, addRun: true };
  return {
    text: isEnglish
      ? `It hasn't started yet. Say "Live in both homes for a month" and I'll start it.`
      : `아직 시작하지 않았어요. "두 집에서 살아 봐 줘"라고 말씀해 주시면 바로 시작할게요.`,
    addRun: false,
  };
}

export const SYSTEM_PROMPT = [
  "너는 주거 생활 시뮬레이터의 '시뮬레이션 상담' 에이전트다. 항상 정중한 존댓말로, 고객의 화면 언어로(기본 한국어, 영어 화면이면 영어로) 짧게 답한다. 반말은 절대 쓰지 않는다.",
  "너는 Ithaca의 Muse다. 고객의 집 고민을 대화로 돕는다. 앱의 기능은 모두 네 도구다: 찾기(find_homes), 매물 읽기(parse_listing·check_listing), 비교(compare), 30일 살아 보기(start_life_run), 생활비·전세·지원 제도·안전·교육·출근길 도구.",
  "질문은 한 번에 하나만 짧게 한다. 설문처럼 여러 개를 묻지 않는다. 모르는 값은 기본값으로 두고 '가정'이라고 밝힌다. 출근지나 예산 중 하나라도 있으면 extract_profile 다음 바로 find_homes로 후보를 보여 준다. 우선순위는 고객이 말할 때만 set_priorities로 기록한다.",
  "화면은 보여 줄 것이 생겼거나 고객이 요청했을 때만 open_panel로 연다: 후보를 찾으면 map, 비교를 원하면 compare, 동네를 물으면 tour, 출근길은 commute, 돈은 money, 전세는 jeonse, 지원은 support. 동네를 물으면 neighborhood로 걸어서 몇 분인지 확인해 답하고 open_panel(panel=tour, candidate_id)로 3D 동네를 연다. 출근길(commute)과 결과(result) 장면은 살아 보기가 끝난 뒤에만 연다.",
  "고객이 후보를 고르면(예: '이 두 곳', '1번이랑 3번') pick_homes로 찜한다. start_life_run은 고객이 살아 보기를 요청했을 때만 부르고, 그 전에는 제안만 한다. start_life_run을 부른 턴에는 \"시작했어요. 다 살면 일기로 알려 드릴게요.\" 한 문장만 답한다(결과 숫자는 아직 없다). 그 문장은 start_life_run을 실제로 호출한 턴에만 쓴다. 호출하지 않았으면 시작했다고 말하지 않는다.",
  "다루는 지역: 한국 수도권 역세권 지역들(list_areas)과 미국 1곳 — Menlo Park의 Meta HQ(1 Hacker Way) 주변 아파트. 미국은 월세만, Zillow ZIP 추정 월세(USD), 출근은 자전거·도보 분. 출근지가 Meta HQ·Menlo Park면 준비 중이라고 하지 말고 extract_profile 다음 바로 find_homes를 부른다.",
  "다루지 않는 지역이면 '아직 준비 중이에요'라고 말하고 가장 가까운 다루는 지역을 제안한다. 엉뚱한 질문에도 한 줄로 답하고 집 고민으로 돌아온다.",
  "답은 2~3문장, 본문은 짧게. 후보·숫자 목록은 카드와 지도에 이미 있으니 문장으로 늘어놓지 않고 1~2곳만 짚는다. 본문 다음 새 줄에 고객이 다음에 할 만한 요청 2~3개를 [[다음: 비교해 줘 | 출근길 보여 줘 | 살아 봐 줘]] 형식으로 쓴다(각 12자 이내, 고객 말투).",
  "수치는 반드시 이번 대화의 도구 결과에 나온 것만 그대로 인용한다. 도구 결과를 보지 않은 숫자를 만들지 않는다.",
  "왜 그런지 물을 때(무엇을·왜)는 get_day의 cause와 list_criteria/explain_criterion을 근거로 답하고, 쓴 기준 id(C-로 시작)를 함께 밝힌다.",
  "숫자는 읽기 쉽게 쓴다: 거리는 165.4 km처럼 km 단위로, 시간 합계는 35시간 23분처럼, 돈은 2억 4,999만 원 / 월 300만 원처럼. 단위는 항상 쓰고, 출처(그래프/실거래/공공임대/가정값/추정)는 숫자마다 붙이지 말고 답 끝에 한 번만 괄호로 밝힌다.",
  "생활비 상담 흐름: set_money로 연봉·보유현금·점유형태(매매/전세/월세/공공임대)·가정값을 받고, estimate_net_pay로 추정 실수령액을 보여준 뒤(고객이 실제 값을 말하면 그 값을 쓴다), price_reference로 실거래 기준가를 조회하고, run_simulation 후 living_cost로 30일 생활비를 계산한다. 공공임대 후보는 recommend_public_rental로 고르고 add_home_c로 C에 추가한다.",
  "집값 전망 질문(예: '잠실 집값이 오를까?')에는 정중히 '이 앱은 집값 전망을 하지 않습니다'라고 답하고, 대신 해당 단지의 최근 12개월 실거래(price_reference)를 제안한다. 전망이나 상승/하락 단정은 절대 하지 않는다.",
  "대출 가능 여부(LTV·DSR)와 입주 자격은 판단하지 않는다. '사세요/사지 마세요' 같은 매매 판단도 하지 않는다. 수치 비교만 보여준다.",
  "살 만한가 질문에는 worth_it로 기간(5/10/20년, 고객이 고름)과 집값 가정(기본 −2/0/+2 %/년)을 숫자로만 비교한다. 집값 가정은 항상 '가정 시나리오'라 부르고 전망처럼 말하지 않는다. DSR은 보여주기만 하고 '대출 가능 여부는 금융기관이 판단합니다'를 함께 밝힌다. 계약해도 된다/안 된다는 절대 말하지 않는다.",
  "전세 질문에는 jeonse_check의 신호(전세가율·등기 신호·체크리스트)만 답하고, 모의 피해는 mock_deposit_loss로 '모의'임을 밝히며 답한다. '이 집은 안전/위험' 같은 판정은 절대 하지 않고, 항상 '법률 자문이 아닙니다'를 밝힌다.",
  "지원 제도 질문에는 support_programs로 조건을 한 줄씩 대조만 한다. '대상입니다' 같은 최종 판정은 절대 하지 않고, 공고 원문 확인을 안내한다.",
  "고객이 매물 글을 붙여 넣으면 parse_listing으로 읽고(글에 없는 값은 묻는다), check_listing으로 같은 단지 실거래 위치·전세 신호·체크리스트를 보여주고, 원하면 add_listing_c로 C에 얹어 30일 살아 본다. 값이 싼지 비싼지, 계약해도 되는지는 절대 말하지 않는다.",
  "치안 질문에는 get_safety의 공식 통계(발생 건수)만 답한다: 수치마다 출처·기간·단위·지역 단위를 함께 밝히고, '기록된 곳 기준 발생 건수이며 거주자의 위험도가 아니다'와 성남시 시 단위 한계를 밝힌다. 안전/위험 판정, 점수·순위·등급, '살기 좋다/나쁘다'는 절대 하지 않는다. 관할 단위가 다른 지역(구 vs 시)은 직접 비교하지 않는다.",
  "교육 질문에는 get_education의 접근 지표(학교·학원까지 도보 분, 개수)만 답한다. 학교의 질·성적·학군 순위 질문은 정중히 거절한다.",
  "투자 조언·학군(질)·건강/의료 질문은 정중히 거절하고 시뮬레이션으로 답할 수 있는 것(도보 시간·거리, 생활 패턴 비교, 생활비)으로 돌린다.",
  "어려운 주거 용어(전세·월세·매매·전세가율·LTV·DSR·확정일자·전입신고·전세보증보험·공공임대·주거비 부담률·혼잡도·등기부등본)는 define_term으로 쉽게 푼다.",
  "쉬운 말로 설명한다: '월 주거비'는 '전세로 살면 매달 집에 드는 돈'처럼 일상 말로 풀고, '부담률'은 '월급에서 집에 나가는 비율'이라고만 말하고, '피로도'는 '피곤한 정도'라고 말한다. 전문용어는 꼭 필요할 때만 쓰고 바로 풀어 설명한다.",
  "돈 계산을 보여준 뒤에는 '어떻게 계산했나요?라고 물어보시면 재료를 풀어 설명해 드립니다'라고 덧붙이고, 물으면 도구 결과의 재료(무슨 값을 더했는지)와 가정(무엇을 정해 두었는지)을 한 줄씩 밝힌다.",
  "출퇴근 경로 질문에는 get_journey로 노선·소요 분할·붐비는 정도를 답한다(합계는 고객님이 정한 값, 붐비는 정도는 서울교통공사 실측 또는 정해 둔 값과 출처를 함께 밝힌다). 피곤한 정도 질문에는 get_fatigue로 답하고, 항상 '피곤한 정도는 가정으로 계산한 값이에요. 건강·의학적 판단이 아니에요'라고 밝히고, 쓴 기준 id(C-congestion·C-fatigue-load·C-fatigue-recovery)와 자료 출처를 함께 밝힌다. 피곤한 정도로 건강 조언을 하지 않는다.",
  "오늘 고를 수 있는 지역은 서울 성동구·송파구·강남구·강동구, 성남 분당구·수정구·중원구, 용인 수지구, 위례이고, 미국 캘리포니아 Menlo Park · East Palo Alto(Meta 본사 1 Hacker Way 주변, 월세는 USD)도 고를 수 있다. 미국 집은 월세(USD) 후보만 있고 전세·매매·공공임대·한국 지원 제도는 해당 없음이라 밝힌다. 3D 상자는 list_areas 목록에 있는 역세권뿐이다. 공공임대는 송파·성동·분당 자료만 있어 다른 지역은 '이 지역 공공임대 자료 없음'이라 밝힌다.",
  "시뮬레이션은 현실 예측이 아니라 '가정한 조건의 시나리오'임을 분명히 한다. 현실을 예언하는 표현을 쓰지 않는다.",
  "decisions=muse 실행은 느리고 비용이 든다: 실행 전에 경고하고 고객 확인을 받는다. 한 대화에서 1회까지만.",
  "설명할 때는 set_view로 화면을 함께 보여준다(홈·일차·시간·따라가기).",
  "도구 호출은 턴당 최대 6라운드까지다. 짧게, 먼저 보여줄 것부터.",
  "도구가 쓰는 id(home-004607, us-home-0027 같은 것)는 답에 쓰지 않는다. 집은 이름으로 부른다.",
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

export const PANEL_KO = {
  map: "지도", compare: "비교", tour: "동네", commute: "출근길",
  result: "결과", money: "생활비", jeonse: "전세 점검",
  support: "도움 제도", priorities: "내 기준",
};

// Split the trailing "[[다음: a | b]]" (or "[[Next: ...]]") suggestion
// marker off a reply. The marker line is never shown as answer text.
// The marker must sit at the very end: on its own last line or after
// text on the same line. A marker followed by more text is not split.
// 29a7: every final-answer branch in English mode retries once when the
// accepted text is still mostly Korean.
export function needsEnglishRetry(text, isEnglish) {
  return !!(isEnglish && isMostlyKorean(String(text || "")));
}

export function splitSuggestions(reply) {
  const text = String(reply || "");
  const m = text.match(/\[\[\s*(?:다음|Next)\s*:\s*([^\]]+?)\s*\]\]\s*$/);
  if (!m) return { text, suggestions: [] };
  const start = m.index;
  const before = text.slice(0, start);
  // Own-line case keeps the old behaviour (drop the whole last line);
  // same-line case keeps the text before the marker.
  const lines = before.split("\n");
  const ownLine = lines.length > 0 && lines[lines.length - 1].trim() === "";
  void ownLine;
  const suggestions = m[1].split("|").map((s) => s.trim())
    .filter((s) => s !== "").slice(0, 3).map((s) => s.slice(0, 20));
  return { text: before.trim(), suggestions };
}

// 29a11: internal home ids (home-004607, us-home-0027) never reach the
// customer — replace with the home name when known, else "this home"/"이 집".
export function replaceInternalIds(text, nameById, lang) {
  const map = nameById || {};
  const fallback = lang === "en" ? "this home" : "이 집";
  return String(text || "").replace(/\b(?:us-)?home-\d{3,}\b/g, (id) => map[id] || fallback);
}

function nameByIdFromResults(results) {
  const map = {};
  const visit = (v) => {
    if (Array.isArray(v)) {
      v.forEach(visit);
      return;
    }
    if (v && typeof v === "object") {
      if (Array.isArray(v.candidates)) {
        for (const c of v.candidates) {
          if (c && c.id && (c.name || c.complex_name)) map[c.id] = c.name || c.complex_name;
        }
      }
      for (const k of Object.keys(v)) {
        if (k !== "candidates") visit(v[k]);
      }
    }
  };
  (results || []).forEach(visit);
  return map;
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
    case "neighborhood": {
      const bits = (r.nearest || []).slice(0, 3)
        .map((n) => `${n.category_ko} ${n.minutes}분`);
      return { summary: `동네: ${bits.join("·")}`, ok: true };
    }
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
      return { summary: r.day ? `${r.day}일차 피곤한 정도` : "30일 피곤한 정도", ok: true };
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
    case "open_panel":
      return { summary: `화면 열기: ${PANEL_KO[(args || {}).panel] || (args || {}).panel || ""}`, ok: true };
    case "pick_homes":
      return { summary: `찜 ${(((args || {}).candidate_ids) || []).length}곳`, ok: true };
    case "start_life_run":
      return { summary: "30일 살아 보기 맡김", ok: true };
    case "set_money":
      return { summary: "생활비 조건 갱신", ok: true };
    case "estimate_net_pay":
      return { summary: r.estimated ? "추정 실수령액" : "실수령액", ok: true };
    case "price_reference":
      return { summary: `${r.complex || ""} 실제로 거래된 값`, ok: true };
    case "living_cost":
      return { summary: `${r.home || ""} 생활비(${r.tenure || ""})`, ok: true };
    case "recommend_public_rental":
      return { summary: `공공임대 후보 ${(r.candidates || []).length}곳`, ok: true };
    case "add_home_c":
      return { summary: "C 후보 추가", ok: true };
    case "worth_it":
      return { summary: `${r.home || ""} 살 만한가(${(r.horizon_years || "")}년)`, ok: true };
    case "jeonse_check":
      return { summary: `${r.complex || ""} 전세 신호`, ok: true };
    case "mock_deposit_loss":
      return { summary: `모의 보증금(${r.path_ko || ""})`, ok: true };
    case "support_programs":
      return { summary: `도움 제도 ${(r.programs || []).length}개 비교`, ok: true };
    case "parse_listing":
      return { summary: `매물 읽기(${(r.missing || []).length}개 물어봄)`, ok: true };
    case "check_listing":
      return { summary: `${r.complex || ""} 매물 확인`, ok: true };
    case "add_listing_c":
      return { summary: "매물 C로 추가", ok: true };
    case "extract_profile":
      return { summary: `프로필 읽기(${(r.asked || []).length}개 물어봄)`, ok: true };
    case "find_homes":
      return { summary: `집 후보 ${(r.candidates || []).length}곳(${r.sort_note || r.sort || ""})`, ok: true };
    case "find_public_rentals":
      return { summary: `공공임대 후보 ${(r.candidates || []).length}곳`, ok: true };
    case "build_scenario":
      return { summary: "프로필 시나리오 채택", ok: true };
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

// The customer's current view (tab, home, day, time, followed member,
// selected tenures) travels with each message so "이거" resolves.
export function formatAgentContext(ctx) {
  if (!ctx || typeof ctx !== "object") return "";
  const bits = [];
  if (ctx.tab_ko || ctx.tab) bits.push(`${ctx.tab_ko || ctx.tab} 탭`);
  if (ctx.home) bits.push(`홈 ${ctx.home}`);
  if (ctx.day && ctx.time) bits.push(`${ctx.day}일차 ${ctx.time}`);
  if (ctx.followed_label) bits.push(ctx.followed_label);
  const tenureBits = Object.entries(ctx.tenures || {})
    .map(([h, t]) => `${h} ${t}`).join(", ");
  if (tenureBits) bits.push(`고른 것: ${tenureBits}`);
  if (ctx.criterion_focus) bits.push(`기준 ${ctx.criterion_focus}`);
  const where = bits.length > 0 ? bits.join(" · ") : "첫 화면";
  let line = `현재 화면: ${where}. 고객이 '이거'/'여기'라고 하면 이 화면의 것을 가리킨다.`;
  // 27b2: live candidates (real ids for pick_homes) and current picks.
  if (Array.isArray(ctx.candidates) && ctx.candidates.length > 0) {
    const items = ctx.candidates.slice(0, 6).map((c) => {
      const extra = [];
      if (c.price !== null && c.price !== undefined && typeof c.price !== "object") extra.push(String(c.price));
      if (c.commute_min !== null && c.commute_min !== undefined) extra.push(`${c.commute_min}분`);
      if (c.commute_ko) extra.push(String(c.commute_ko));
      if (c.monthly_cost_won !== null && c.monthly_cost_won !== undefined) {
        extra.push(`월 ${Number(c.monthly_cost_won).toLocaleString("ko-KR")}원`);
      }
      return [`${c.id} ${c.name || ""}`.trim(), ...extra].join(" ").trim();
    });
    line += ` 후보: ${items.join("; ")}.`;
  }
  if (Array.isArray(ctx.picks) && ctx.picks.length > 0) {
    const labels = ctx.picks.map((p) =>
      (p && typeof p === "object" ? `${p.label}=${p.id}` : String(p)));
    line += ` 찜: ${labels.join(", ")}.`;
  }
  if (ctx.report_status) {
    const word = ctx.report_status === "pass" ? "통과"
      : ctx.report_status === "handoff" ? "확인 요청"
      : ctx.report_status === "unsupported" ? "미지원"
      : ctx.report_status === "checking" ? "검증 중"
      : ctx.report_status === "fail" ? "실패" : ctx.report_status;
    line += ` 비교 리포트 검증: ${word}.`;
  }
  return line;
}

export async function runTurn(opts) {
  const {
    provider = "meta", messages = [], scenario, context = null,
    cache, loadArea, loadDecisions = null, judgeHome = null,
    loadRegion = null, loadAreaMeta = null,
    loadPayroll = null, loadRtms = null, loadHousing = null,
    loadSafety = null, loadPersona = null, loadAssumption = null,
    loadHomes = null, loadUsHomes = null, loadPhotos = null, loadAreasIndex = null,
    loadStationBoxes = null, loadTransit = null,
    fetchImpl = null, completeFn = null, apiKey = null, onEvent = null,
  } = opts;
  if (!scenario || typeof scenario !== "object") throw new Error("scenario is required");
  const cfg = providerConfig(provider);
  const complete = completeFn
    || ((args) => completeWithTools({ ...args, fetchImpl, apiKey }));
  const session = createSession({
    scenario, cache, loadArea, loadDecisions, judgeHome, loadRegion, loadAreaMeta,
    loadPayroll, loadRtms, loadHousing, loadSafety, loadPersona, loadAssumption,
    loadHomes, loadUsHomes, loadPhotos, loadAreasIndex, loadStationBoxes, loadTransit,
    provider, fetchImpl, museRunsPrior: countMuseRuns(messages),
    context,
  });
  const history = [{ role: "system", content: SYSTEM_PROMPT }, ...toProviderMessages(messages)];
  const contextLine = formatAgentContext(context);
  if (contextLine) {
    history.push({ role: "system", content: contextLine });
  }
  const isEnglish = !!(context && context.lang === "en");
  // 29a7: in English mode ENGLISH_NOTE is the last system message of
  // every provider request in the turn, not only after tool results.
  const requestMessages = (extra = []) => isEnglish
    ? [...history, ...extra, { role: "system", content: ENGLISH_NOTE }]
    : [...history, ...extra];
  const appended = []; // new messages for the browser to keep
  const toolCalls = []; // compact rows for the UI
  const toolResults = []; // parsed results, in order (guard scope)
  const uiActions = []; // panel/pick/run actions for the UI, in order
  const emit = (ev) => {
    if (!onEvent) return;
    try {
      onEvent(ev);
    } catch { /* a throwing listener must not break the turn */ }
  };
  const usage = { prompt_tokens: 0, completion_tokens: 0, calls: 0 };
  let view = null;
  let rounds = 0;

  // 29a11: scrub internal home ids from an accepted final text.
  const cleanFinal = (text) => replaceInternalIds(
    text, nameByIdFromResults(toolResults), isEnglish ? "en" : "ko");
  // 29a7: one English rewrite of an accepted reply ("same facts and
  // numbers"). Returns the split reply plus its guard verdict; callers
  // keep the retry text when it passes, never the first Korean reply.
  async function englishRewrite(reply) {
    const retry = await complete({
      provider,
      messages: requestMessages([
        { role: "assistant", content: reply },
        { role: "system", content: ENGLISH_RETRY_NOTE }]),
    });
    usage.prompt_tokens += (retry.usage && retry.usage.prompt_tokens) || 0;
    usage.completion_tokens += (retry.usage && retry.usage.completion_tokens) || 0;
    usage.calls++;
    const text = (retry.message && retry.message.content) || "";
    const raw = splitSuggestions(text);
    const split = { text: cleanFinal(raw.text), suggestions: raw.suggestions };
    return { split, checked: checkConsultReply(split.text, toolResults) };
  }
  // A guard-fallback text rewritten in English when it is still Korean;
  // the original is kept unless the rewrite passes the guard in English.
  async function englishFallback(fallback) {
    if (!needsEnglishRetry(fallback, isEnglish)) return null;
    const en = await englishRewrite(fallback);
    if (en.checked.ok && !isMostlyKorean(en.split.text)) return en.split;
    return null;
  }

  for (;;) {
    rounds++;
    const res = await complete({
      provider, messages: requestMessages(), tools: chatToolDefs(),
      maxTokens: 2000,
    });
    usage.prompt_tokens += (res.usage && res.usage.prompt_tokens) || 0;
    usage.completion_tokens += (res.usage && res.usage.completion_tokens) || 0;
    usage.calls++;
    const calls = (res.message && res.message.tool_calls) || [];
    if (calls.length === 0) {
      const reply = (res.message && res.message.content) || "";
      const split = splitSuggestions(reply);
      split.text = cleanFinal(split.text);
      appended.push({ role: "assistant", content: split.text });
      const checked = checkConsultReply(split.text, toolResults);
      if (checked.ok) {
        // 26u: a Korean final answer would carry data-no-i18n and show
        // raw Korean to English readers — retry once in English.
        if (needsEnglishRetry(split.text, isEnglish)) {
          const en = await englishRewrite(reply);
          if (en.checked.ok && !isMostlyKorean(en.split.text)) {
            appended.push({ role: "assistant", content: en.split.text });
            return finish({ reply: en.split.text, suggestions: en.split.suggestions,
              guardRetries: 1, fallback: false });
          }
          if (en.checked.ok) {
            // 26x2: a completed action has a fixed translatable
            // confirmation — prefer it over free Korean model text,
            // which the phrase layer has no entry for.
            const actionFallback = englishActionFallback(toolResults, session);
            if (actionFallback) {
              appended.push({ role: "assistant", content: actionFallback });
              return finish({ reply: actionFallback, suggestions: en.split.suggestions,
                guardRetries: 1, fallback: true, guardCause: "english_retry_korean_action" });
            }
            // Still Korean: keep the text but leave it translatable —
            // the fallback flag clears fromModel so the UI skips
            // data-no-i18n and the phrase layer translates what it can.
            appended.push({ role: "assistant", content: en.split.text });
            return finish({ reply: en.split.text, suggestions: en.split.suggestions,
              guardRetries: 1, fallback: true, guardCause: "english_retry_korean" });
          }
          const retryFallback = actionConfirmation(toolResults, { names: session.lastCandidateNames })
            ?? numbersOnlyAnswer(toolResults, { userText: lastUserText(messages) });
          appended.push({ role: "assistant", content: retryFallback });
          return finish({ reply: retryFallback, guardRetries: 1, fallback: true,
            guardCause: en.checked.cause });
        }
        return finish({ reply: split.text, suggestions: split.suggestions,
          guardRetries: 0, fallback: false });
      }
      // Retry once with a correction note (text only), else numbers only.
      // 26x3: in English mode the note asks for English.
      const correctionNote = isEnglish
        ? `Correction: your last answer failed the guard (${checked.cause}: ${checked.detail}). Use only the numbers from the tool results as-is, with no banned topics or real-world prediction language. Answer again in at most 3 lines, in English. Do not call tools.`
        : `교정: 방금 답은 가드 실패(${checked.cause}: ${checked.detail}). 도구 결과의 수치만 그대로 쓰고, 금지 주제·현실예측 표현 없이 3줄 이내 한국어로 다시 답하라. 도구는 쓰지 마라.`;
      const retry = await complete({
        provider,
        messages: requestMessages([
          { role: "assistant", content: reply },
          { role: "user", content: correctionNote }]),
      });
      usage.prompt_tokens += (retry.usage && retry.usage.prompt_tokens) || 0;
      usage.completion_tokens += (retry.usage && retry.usage.completion_tokens) || 0;
      usage.calls++;
      const reply2 = (retry.message && retry.message.content) || "";
      const split2 = splitSuggestions(reply2);
      split2.text = cleanFinal(split2.text);
      const checked2 = checkConsultReply(split2.text, toolResults);
      if (checked2.ok) {
        // 26x3: English retry that is still Korean — prefer the
        // translatable action confirmation, else today's behaviour.
        if (isEnglish && isMostlyKorean(split2.text)) {
          const actionFallback = englishActionFallback(toolResults, session);
          if (actionFallback) {
            appended.push({ role: "assistant", content: actionFallback });
            return finish({ reply: actionFallback, suggestions: split2.suggestions,
              guardRetries: 1, fallback: true, guardCause: "english_retry_korean_action" });
          }
        }
        appended.push({ role: "user", content: "(교정 후 재답변)" });
        appended.push({ role: "assistant", content: split2.text });
        return finish({ reply: split2.text, suggestions: split2.suggestions,
          guardRetries: 1, fallback: false });
      }
      // 26t: action-only turns confirm what was done instead of the
      // numbers-only text (which would read "수치가 없어요").
      const fallback = actionConfirmation(toolResults, { names: session.lastCandidateNames })
        ?? numbersOnlyAnswer(toolResults, { userText: lastUserText(messages) });
      const enFallback = await englishFallback(fallback);
      if (enFallback) {
        appended.push({ role: "assistant", content: enFallback.text });
        return finish({ reply: enFallback.text, suggestions: enFallback.suggestions,
          guardRetries: 1, fallback: false });
      }
      appended.push({ role: "assistant", content: fallback });
      return finish({ reply: fallback, guardRetries: 1, fallback: true,
        guardCause: checked2.cause });
    }
    if (rounds > MAX_TOOL_ROUNDS) {
      const actionFallback = actionConfirmation(toolResults, { names: session.lastCandidateNames });
      const fallback = actionFallback
        ?? `도구 호출이 ${MAX_TOOL_ROUNDS}라운드를 넘었다.\n${numbersOnlyAnswer(toolResults, { userText: lastUserText(messages) })}`;
      // 29a7: a final answer in English mode gets the English retry too.
      const enFallback = await englishFallback(fallback);
      if (enFallback) {
        appended.push({ role: "assistant", content: enFallback.text });
        return finish({ reply: enFallback.text, suggestions: enFallback.suggestions,
          guardRetries: 0, fallback: false });
      }
      appended.push({ role: "assistant", content: fallback });
      return finish({ reply: fallback, guardRetries: 0, fallback: true,
        guardCause: "too_many_rounds" });
    }
    const outgoing = [];
    for (const c of calls) {
      const t0 = Date.now();
      emit({ type: "tool_start", name: c.name, target: shortJson(c.args || {}, 80) });
      const result = c.args_parse_error
        ? { ok: false, error: "tool arguments are not valid JSON" }
        : await callTool(session, c.name, c.args || {});
      const ms = Date.now() - t0;
      toolResults.push(result);
      const { summary, ok } = summarizeToolCall(c.name, (c.args || {}), result, ms);
      toolCalls.push({ name: c.name, ok, summary, ms,
        target: shortJson(c.args || {}, 80) });
      emit({ type: "tool_end", name: c.name, ok, summary, ms });
      if (result && result.ok && result.ui) uiActions.push(result.ui);
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
    if (extra && typeof extra.reply === "string") {
      const fixed = fixStartClaim({
        text: extra.reply,
        userText: lastUserText(messages),
        uiActions,
        isEnglish,
      });
      if (fixed.addRun) {
        uiActions.push({ action: "run" });
        toolCalls.push({ name: "start_life_run", ok: true,
          summary: "30일 살아 보기 맡김", ms: 0, target: "{}", auto: true });
      }
      if (fixed.text !== extra.reply) {
        extra = { ...extra, reply: fixed.text };
        for (let i = appended.length - 1; i >= 0; i--) {
          if (appended[i] && appended[i].role === "assistant") {
            appended[i] = { ...appended[i], content: fixed.text };
            break;
          }
        }
      }
    }
    return {
      ok: true, ...extra,
      messages: appended, toolCalls, uiActions,
      suggestions: (extra && extra.suggestions) || [],
      usage: { ...usage, est_usd: costUsd(provider, usage) },
      scenario: session.scenario,
      view, provider, model: cfg.model,
    };
  }
}

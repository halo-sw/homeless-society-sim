// Chat helpers (pure, no React, no DOM): the context payload sent with
// each message ("이거" resolution), the view-change system line, plain
// tool-action names, and the tool → source citation map (URLs already
// in the repo only; sources without a repo URL render as a title with
// no link).
//
// 12b: the stage-10/11 floating panel (placement, FAB, nudges, chips,
// open-memory) is gone — the chat screen (?chat=) replaces it. Only
// the message-level helpers carry over.

// --- context payload ----------------------------------------------------------
import { memberLabelFor } from "../profile.js";
import { sourceById } from "../sources.js";

export const TAB_KO = {
  compare: "A·B 비교", priorities: "내 기준으로 보기", money: "생활비",
  worthit: "살 만한가?", quality: "삶의 질", safety: "안전·교육",
  jeonse: "전세 점검", support: "지원 제도", criteria: "계산 기준",
  listings: "매물", "listings-public": "공공 공고",
};

const hhmm = (m) => {
  const n = Math.max(0, Math.min(1439, Math.floor(Number(m) || 0)));
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
};

// What "이거" means: the customer's current view, sent with each message.
export function agentContext(state = {}) {
  const clock = state.clock || {};
  const follow = Number(state.follow) || 0;
  const followOpt = (state.followOptions || []).find((o) => Number(o.value) === follow);
  return {
    tab: state.compareTab || "compare",
    tab_ko: TAB_KO[state.compareTab] || state.compareTab || "compare",
    home: state.home || "",
    day: (Number(clock.day) || 0) + 1,
    time: hhmm(clock.minute),
    follow,
    followed_label: follow > 0 ? ((followOpt && followOpt.label) || memberLabelFor({ role: "adult" }, follow - 1)) : "자유 카메라",
    tenures: state.moneyTenure || {},
    criterion_focus: state.criteriaFocus || "",
    compare_open: state.compareOpen === true,
  };
}

export function contextLine(ctx = {}) {
  const bits = [];
  if (ctx.tab_ko) bits.push(`${ctx.tab_ko} 탭`);
  if (ctx.home) bits.push(`홈 ${ctx.home}`);
  if (ctx.day && ctx.time) bits.push(`${ctx.day}일차 ${ctx.time}`);
  if (ctx.followed_label) bits.push(ctx.followed_label);
  const tenureBits = Object.entries(ctx.tenures || {})
    .map(([h, t]) => `${h} ${t}`).join(", ");
  if (tenureBits) bits.push(`고른 것: ${tenureBits}`);
  if (ctx.criterion_focus) bits.push(`기준 ${ctx.criterion_focus}`);
  const where = bits.length > 0 ? bits.join(" · ") : "첫 화면";
  return `현재 화면: ${where}. 고객이 '이거'/'여기'라고 하면 이 화면의 것을 가리킨다.`;
}

// "화면을 B · 1일차 08:50으로 옮겼어요" for ChatSystemMessage.
export function viewSystemLine(view = {}) {
  const bits = [];
  if (view.home) bits.push(String(view.home));
  if (view.day && view.time) bits.push(`${view.day}일차 ${view.time}`);
  else if (view.day) bits.push(`${view.day}일차`);
  else if (view.time) bits.push(String(view.time));
  if (bits.length === 0) return "화면을 옮겼어요";
  return `화면을 ${bits.join(" · ")}으로 옮겼어요`;
}

// --- plain tool-action names -----------------------------------------------------

export const TOOL_ACTION_KO = {
  get_scenario: "조건 보기", update_scenario: "조건 바꾸기",
  list_criteria: "계산 기준 보기", explain_criterion: "기준 설명",
  list_areas: "지역 보기", list_complexes: "단지 찾기",
  find_places: "주변 장소 찾기", neighborhood: "동네 걸어 보기", list_stations: "역 찾기",
  run_simulation: "시뮬레이션 실행", compare: "A·B 비교",
  get_day: "하루 보기", explain_decision: "고른 이유 보기",
  get_journey: "출퇴근길 보기", get_fatigue: "피곤한 정도 보기",
  apply_persona: "상황 고르기", get_priorities: "중요한 것 보기",
  set_priorities: "비중 기록", get_safety: "치안 통계 보기",
  get_education: "학교·학원 보기", define_term: "쉬운 말 풀이",
  set_view: "화면 옮기기", set_money: "돈 조건 바꾸기",
  estimate_net_pay: "실수령액 계산", price_reference: "실거래가 확인",
  living_cost: "생활비 계산", recommend_public_rental: "공공임대 찾기",
  add_home_c: "C로 추가", worth_it: "살 만한가 계산",
  jeonse_check: "전세 점검", mock_deposit_loss: "만약에 보기",
  support_programs: "도움 제도 비교", parse_listing: "매물 읽기",
  check_listing: "매물 확인", add_listing_c: "매물 C로 추가",
  extract_profile: "상황 읽기", find_homes: "집 후보 찾기",
  find_public_rentals: "공공임대 찾기", build_scenario: "시나리오 만들기",
  open_panel: "화면 열기", pick_homes: "찜하기",
  start_life_run: "30일 살아 보기 맡기기",
};

export function toolActionKo(name) {
  return TOOL_ACTION_KO[name] || name;
}

// 13e2: tool rows say the label once — the summary carries only the
// result, so strip a leading copy of the label.
export function stripToolLabel(name, summary) {
  const label = toolActionKo(name);
  const s = String(summary || "");
  if (label && s.startsWith(label)) return s.slice(label.length).trimStart();
  return s;
}

// 13e2: ≥100 ms reads as seconds with one decimal, faster stays in ms.
export function toolDurationKo(ms) {
  const n = Number(ms) || 0;
  if (n >= 100) return `${(n / 1000).toFixed(1)}초`;
  return `${Math.round(n)}ms`;
}

// --- citations ------------------------------------------------------------------
// Every assistant answer that used tools carries its sources (title +
// repo-known URL, or title only when the repo knows no URL).

const CITATIONS = {
  price_reference: [{ title: "국토교통부 실거래가 공개시스템", url: "https://rt.molit.go.kr" }],
  living_cost: [{ title: "국토교통부 실거래가 공개시스템", url: "https://rt.molit.go.kr" }],
  worth_it: [{ title: "국토교통부 실거래가 공개시스템", url: "https://rt.molit.go.kr" }],
  jeonse_check: [
    { title: "국토교통부 실거래가 공개시스템", url: "https://rt.molit.go.kr" },
    { title: "HUG 안심전세포털", url: "https://www.khug.or.kr/jeonse/index.jsp" },
  ],
  mock_deposit_loss: [
    { title: "HUG 안심전세포털", url: "https://www.khug.or.kr/jeonse/index.jsp" },
  ],
  get_journey: [{ title: "서울교통공사 지하철혼잡도정보", url: null }],
  get_fatigue: [{ title: "서울교통공사 지하철혼잡도정보", url: null }],
  get_safety: [{ title: "경찰청 범죄 발생 지역별 통계 (2025년)", url: null }],
  recommend_public_rental: [
    { title: "LH·마이홈 (공공주택 데이터 API)", url: "https://public-housing-map.vercel.app/api/v1" },
  ],
  add_home_c: [
    { title: "LH·마이홈 (공공주택 데이터 API)", url: "https://public-housing-map.vercel.app/api/v1" },
  ],
  support_programs: [
    { title: "주택도시기금", url: "https://nhuf.molit.go.kr" },
    { title: "LH·마이홈 (공공주택 데이터 API)", url: "https://public-housing-map.vercel.app/api/v1" },
  ],
  check_listing: [{ title: "국토교통부 실거래가 공개시스템", url: "https://rt.molit.go.kr" }],
  run_simulation: [
    { title: "OpenStreetMap", url: "https://www.openstreetmap.org/copyright" },
    { title: "GIS건물통합정보", url: "https://www.vworld.kr" },
  ],
  compare: [
    { title: "OpenStreetMap", url: "https://www.openstreetmap.org/copyright" },
    { title: "GIS건물통합정보", url: "https://www.vworld.kr" },
  ],
  get_day: [
    { title: "OpenStreetMap", url: "https://www.openstreetmap.org/copyright" },
    { title: "GIS건물통합정보", url: "https://www.vworld.kr" },
  ],
  get_education: [{ title: "OpenStreetMap", url: "https://www.openstreetmap.org/copyright" }],
  find_places: [{ title: "OpenStreetMap", url: "https://www.openstreetmap.org/copyright" }],
  list_complexes: [{ title: "GIS건물통합정보", url: "https://www.vworld.kr" }],
  list_stations: [{ title: "OpenStreetMap", url: "https://www.openstreetmap.org/copyright" }],
  find_homes: [{ title: "국토교통부 실거래가 공개시스템", url: "https://rt.molit.go.kr" }],
  find_public_rentals: [
    { title: "LH·마이홈 (공공주택 데이터 API)", url: "https://public-housing-map.vercel.app/api/v1" },
  ],
  build_scenario: [
    { title: "OpenStreetMap", url: "https://www.openstreetmap.org/copyright" },
    { title: "GIS건물통합정보", url: "https://www.vworld.kr" },
  ],
};

// 29a7b: find_homes over an all-US home list cites the US entries
// from sources.js (Zillow ZORI + OpenStreetMap), never MOLIT.
const US_FIND_HOMES_IDS = ["zillow-zori", "osm-us"];

function isUsHomeList(list) {
  return Array.isArray(list) && list.length > 0 && list.every((c) =>
    c && (c.country === "US" || c.currency === "USD"));
}

export function citationsFor(toolNames = [], opts = {}) {
  if ((toolNames || []).includes("find_homes")
    && isUsHomeList(opts && opts.candidates)) {
    return US_FIND_HOMES_IDS.map((id) => sourceById(id)).filter(Boolean)
      .map((s) => ({ title: s.name, url: s.url }));
  }
  const out = [];
  const seen = new Set();
  for (const name of toolNames || []) {
    for (const c of CITATIONS[name] || []) {
      if (seen.has(c.title)) continue;
      seen.add(c.title);
      out.push(c);
    }
  }
  return out;
}

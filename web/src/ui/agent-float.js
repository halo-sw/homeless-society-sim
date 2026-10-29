// Floating agent helpers (pure, no React, no DOM): panel placement
// (snap corners, never covering the followed resident or the Now card),
// per-tab prompt chips, the context payload sent with each message,
// gentle-nudge triggers + rate limit, plain tool-action names, and the
// tool → source citation map (URLs already in the repo only; sources
// without a repo URL render as a title with no link).

export const AGENT_PANEL_W = 380;
export const AGENT_PANEL_H = 560;
export const AGENT_MARGIN = 12;
export const AGENT_CORNERS = ["bottom-right", "bottom-left"];
// Stage 11: the panel never covers a card. Narrow viewports (< 1100 px)
// fall back to a bottom sheet; wide viewports with both bottom corners
// busy dock the panel as a right-side drawer (a flex sibling of the
// canvas, so the canvas narrows and the right column shifts left with
// it — nothing ends up under the panel).
export const AGENT_NARROW_W = 1100;
export const AGENT_DRAWER_W = 404;
export const AGENT_SHEET_H_MAX = 420;
export const AGENT_SHEET_H_FRAC = 0.46;

// rect: {x, y, w, h} in CSS px, origin top-left.
function overlapArea(a, b) {
  const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
  const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  return x * y;
}

function panelRectAt(viewport, corner, panel = {}) {
  const w = Math.min(panel.w || AGENT_PANEL_W, viewport.w - AGENT_MARGIN * 2);
  const h = Math.min(panel.h || AGENT_PANEL_H, viewport.h - AGENT_MARGIN * 2);
  const x = corner === "bottom-left" ? AGENT_MARGIN : viewport.w - w - AGENT_MARGIN;
  // The panel floats above the FAB: its bottom sits one FAB height plus
  // margins above the viewport bottom.
  const y = Math.max(AGENT_MARGIN, viewport.h - h - 64 - AGENT_MARGIN);
  return { x, y, w, h };
}

// Choose where the panel goes given the viewport and the obstacle rects
// (right column card, Now card / left column, sim bar, tour bar, followed
// resident — measured from the DOM by the caller):
// (a) the bottom corner with zero overlap when one is free ("float"),
// (b) else a right-side drawer on wide viewports ("drawer": the caller
// docks the panel as a flex sibling of the canvas and the canvas narrows
// by shiftLeft, so nothing is under it),
// (c) else a bottom sheet on narrow viewports ("sheet": the caller lifts
// the sim bar and tour bar above it and caps the cards' height).
// Ties prefer bottom-right, then the caller's `prefer` corner.
// Returns {mode, corner, x, y, w, h, overlap, shiftLeft}.
export function placeAgentPanel({ viewport, avoid = [], panel = {},
    prefer = null, drawerW = AGENT_DRAWER_W } = {}) {
  const w = Math.max(1, (viewport && viewport.w) || 1280);
  const h = Math.max(1, (viewport && viewport.h) || 800);
  const v = { w, h };
  const rects = (avoid || []).filter((r) => r && r.w > 0 && r.h > 0);
  const scores = AGENT_CORNERS.map((corner) => {
    const rect = panelRectAt(v, corner, panel);
    const overlap = rects.reduce((a, r) => a + overlapArea(rect, r), 0);
    return { corner, ...rect, overlap };
  });
  scores.sort((a, b) => {
    if (a.overlap !== b.overlap) return a.overlap - b.overlap;
    if (prefer && a.corner === prefer) return -1;
    if (prefer && b.corner === prefer) return 1;
    return AGENT_CORNERS.indexOf(a.corner) - AGENT_CORNERS.indexOf(b.corner);
  });
  const best = scores[0];
  if (best.overlap === 0) {
    const { overlap, ...rest } = best;
    return { ...rest, mode: "float", overlap, shiftLeft: 0 };
  }
  if (w < AGENT_NARROW_W) {
    const sheetH = Math.max(160, Math.min(panel.h || AGENT_PANEL_H,
      AGENT_SHEET_H_MAX, Math.floor(h * AGENT_SHEET_H_FRAC),
      h - AGENT_MARGIN * 2));
    const rect = { x: AGENT_MARGIN,
      y: Math.max(AGENT_MARGIN, h - sheetH - AGENT_MARGIN),
      w: w - AGENT_MARGIN * 2, h: sheetH };
    const overlap = rects.reduce((a, r) => a + overlapArea(rect, r), 0);
    return { mode: "sheet", corner: prefer || best.corner, ...rect, overlap, shiftLeft: 0 };
  }
  const dw = Math.max(280, Math.min(drawerW || AGENT_DRAWER_W, Math.floor(w * 0.4)));
  return { mode: "drawer", corner: prefer || "bottom-right",
    x: w - dw, y: 0, w: dw, h, overlap: 0, shiftLeft: dw };
}

export function nextAgentCorner(corner) {
  return corner === "bottom-left" ? "bottom-right" : "bottom-left";
}

// The bottom-corner trigger (avatar + "물어보기" button) is always on
// screen while the panel is closed, in every placement mode; once open
// it stays only as the floating panel's anchor.
export function shouldShowAgentFab(consultOpen, effMode) {
  return !consultOpen || effMode === "float";
}

// --- per-tab suggested prompts -----------------------------------------------

const CHIPS = {
  money: ["전세로 살면 매달 얼마예요?", "이 계산 어떻게 한 거예요?", "비슷한 공공임대 있어요?"],
  quality: ["이 출근길 왜 피곤해요?", "만원 지하철에 탄 시간이 얼마예요?"],
  jeonse: ["이 집 전세 괜찮은지 점검해 주세요", "보증금 못 받으면 어떻게 돼요?"],
  support: ["비슷한 공공임대 있어요?", "내 조건으로 빌릴 수 있는 돈 있어요?"],
  worthit: ["10년 살면 매매랑 전세 뭐가 달라요?", "매매가 전세보다 적게 드는 해가 언제예요?"],
  compare: ["A랑 B 뭐가 달라요?", "30일 동안 걸은 시간이 왜 달라요?"],
  priorities: ["교육이 가장 중요해요", "한 숫자로 보여줘요"],
  safety: ["이 동네 치안 통계 보여줘요", "가장 가까운 초등학교 어디예요?"],
  criteria: ["이 기준을 쓴 순간 보여줘요", "C-shop-dwell이 뭐예요?"],
  listings: ["이 매물 확인해 주세요", "공공임대 공고 보여줘요"],
};

export const DEFAULT_CHIPS = ["이 화면 설명해 주세요", "A랑 B 뭐가 달라요?", "전세로 살면 매달 얼마예요?"];

export function chipsFor(tab) {
  const key = tab === "listings-public" ? "listings" : tab;
  return CHIPS[key] || DEFAULT_CHIPS;
}

// --- open/closed memory (per viewer, try/catch storage) ----------------------
// Default state is closed; the boot reads the stored bit (?agent=1 forces
// open) and every toggle persists it. Takes an injectable storage-like
// object so Node tests pass a fake.

export const AGENT_OPEN_KEY = "sim.consultOpen.v1";

function defaultAgentStorage() {
  try {
    return typeof globalThis !== "undefined" ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

export function loadAgentOpen(storage = defaultAgentStorage()) {
  try {
    return !!storage && storage.getItem(AGENT_OPEN_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveAgentOpen(open, storage = defaultAgentStorage()) {
  try {
    if (!storage) return false;
    storage.setItem(AGENT_OPEN_KEY, open ? "1" : "0");
    return true;
  } catch {
    return false;
  }
}

// --- context payload ----------------------------------------------------------

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
    followed_label: follow > 0 ? ((followOpt && followOpt.label) || `구성원 ${follow}`) : "자유 카메라",
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

// --- gentle nudges --------------------------------------------------------------

export const NUDGE_MIN_GAP_MS = 60000;

export function nudgeAllowed(lastAtMs, nowMs) {
  if (!Number.isFinite(nowMs)) return false;
  if (lastAtMs === null || lastAtMs === undefined) return true;
  return nowMs - lastAtMs >= NUDGE_MIN_GAP_MS;
}

// Notable moments worth one small Toast: a ≥80% crowded leg, the first
// Muse-chosen decision, a jeonse caution band on the current home.
// seenIds skips already-shown nudges; returns {id, text} or null.
export function nudgeFor(state = {}, seenIds = []) {
  const seen = new Set(seenIds || []);
  const legs = (state.journey && state.journey.legs) || [];
  const busy = legs.find((l) => Number(l.valuePct) >= 80);
  if (busy && !seen.has("crowd")) {
    return { id: "crowd",
      text: `타는 칸이 ${busy.valuePct}% 찼어요. 왜 피곤한지 설명해 드릴까요?` };
  }
  const log = state.judgeLog || [];
  if (log.some((r) => r.badgeCls === "spark" || r.badgeCls === "open") && !seen.has("muse-first")) {
    return { id: "muse-first",
      text: "Muse가 처음 골랐어요. 고른 이유를 보여드릴까요?" };
  }
  const home = state.home || "A";
  const doc = state.money;
  const check = doc && doc.homes && doc.homes[home] && doc.homes[home].jeonse_check;
  if (check && check.computable && check.band
      && (check.band.key === "watch" || check.band.key === "high")
      && !seen.has(`jeonse-${home}`)) {
    return { id: `jeonse-${home}`,
      text: `보증금이 집값의 ${check.ratio_pct}%예요. 뭘 확인해야 할지 볼까요?` };
  }
  return null;
}

// --- plain tool-action names -----------------------------------------------------

export const TOOL_ACTION_KO = {
  get_scenario: "조건 보기", update_scenario: "조건 바꾸기",
  list_criteria: "계산 기준 보기", explain_criterion: "기준 설명",
  list_areas: "지역 보기", list_complexes: "단지 찾기",
  find_places: "주변 장소 찾기", list_stations: "역 찾기",
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
};

export function toolActionKo(name) {
  return TOOL_ACTION_KO[name] || name;
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
};

export function citationsFor(toolNames = []) {
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

// Guided demo tour ("3분 둘러보기", pure step machine, no React).
//
// ?tour=demo starts a scripted, skippable playlist for the video and for
// first-time users. Each step is one caption line plus URL params; the
// tour bar auto-advances on fixed per-step seconds (deterministic timing
// for screen recording — page loads add on top). The agent step uses a
// recorded reply (real numbers from the demo build) when no key is
// present, always labelled 기록된 답변.
//
// Step times are engine-verified (demo-two-homes, 1일차): A walks
// 08:21→08:35 home→잠실, rides 08:35→09:05 (2호선 → 강남 환승 → 신분당선),
// works from 09:05; B walks 08:21→08:37 home→판교역.

export const DEMO_TOUR_STEPS = [
  { id: "persona", caption: "누구의 한 달인지 상담에서 고릅니다",
    secs: 8, params: { agent: "1" } },
  { id: "commute-walk", caption: "홈 A에서 걸어서 잠실역까지 — 14분",
    secs: 10, params: { home: "A", day: "1", t: "08:25", follow: "1" } },
  { id: "ride", caption: "2호선을 타고 강남에서 갈아타 판교까지",
    secs: 12, params: { home: "A", day: "1", t: "08:40", follow: "1" } },
  { id: "arrive", caption: "판교 도착 — 칸이 얼마나 찼는지 확인합니다",
    secs: 8, params: { home: "A", day: "1", t: "09:05", follow: "1" } },
  { id: "home-b", caption: "홈 B에서 걸어서 판교역까지 — 16분",
    secs: 10, params: { home: "B", day: "1", t: "08:28", follow: "1" } },
  { id: "money", caption: "생활비 — 전세로 살면 매달 집에 드는 돈",
    secs: 10, params: { home: "A", tab: "money" } },
  { id: "jeonse", caption: "전세 점검 — 보증금이 집값의 몇 %인지",
    secs: 10, params: { home: "A", tab: "jeonse" } },
  { id: "listing", caption: "매물 붙여넣기 — 예시 글로 확인해 보기",
    secs: 12, params: { home: "A", tab: "listings", fill: "example" } },
  { id: "public", caption: "공공임대 — 직장 근처 공고 찾기",
    secs: 10, params: { home: "A", tab: "listings", sub: "public" } },
  { id: "agent", caption: "상담 — B로 바꾸면 어떻게 달라질까요?",
    secs: 14, params: { home: "A", agent: "1", ask: "switch" } },
  { id: "share", caption: "결과 공유 — 그림으로 저장하고 인쇄하기",
    secs: 10, params: { home: "A", share: "1" } },
];

export const DEMO_TOUR_TOTAL_SECS = DEMO_TOUR_STEPS.reduce((a, s) => a + s.secs, 0);

// Params the tour owns (stripped on skip / rebuilt per step).
const TOUR_KEYS = ["tour", "step", "agent", "ask", "share", "fill", "sub",
  "home", "day", "t", "follow", "tab", "play"];

export function tourStepFromSearch(search) {
  const q = search instanceof URLSearchParams ? search : new URLSearchParams(search || "");
  if (q.get("tour") !== "demo") return null;
  const raw = Number.parseInt(q.get("step") || "0", 10);
  const index = Number.isFinite(raw)
    ? Math.min(DEMO_TOUR_STEPS.length - 1, Math.max(0, raw)) : 0;
  return { index, step: DEMO_TOUR_STEPS[index] };
}

// URL for step `index`, keeping scenario/mode and dropping stale tour keys.
export function tourStepUrl(index, search) {
  const q = search instanceof URLSearchParams
    ? new URLSearchParams(search.toString()) : new URLSearchParams(search || "");
  for (const k of TOUR_KEYS) q.delete(k);
  q.set("tour", "demo");
  q.set("step", String(index));
  const step = DEMO_TOUR_STEPS[Math.min(DEMO_TOUR_STEPS.length - 1, Math.max(0, index))];
  for (const [k, v] of Object.entries(step.params)) q.set(k, v);
  const s = q.toString();
  return s ? `/?${s}` : "/";
}

export function tourSkipUrl(search) {
  const q = search instanceof URLSearchParams
    ? new URLSearchParams(search.toString()) : new URLSearchParams(search || "");
  for (const k of TOUR_KEYS) q.delete(k);
  const s = q.toString();
  return s ? `/?${s}` : "/";
}

// Recorded agent replies for the tour (no key present). Numbers are the
// real build values (demo-two-homes; 12a example search below); UI
// labels them 기록된 답변.
export const RECORDED_AGENT_REPLIES = {
  profile_search: {
    q: "판교로 출근하는 신입, 연봉 4천, 모은 돈 5천, 전세 2억 이하",
    tools: [
      { name: "extract_profile", ok: true, summary: "프로필 읽기(2개 물어봄)", ms: 3 },
      { name: "find_homes", ok: true, summary: "집 후보 6곳(정렬: 출퇴근 짧은 순)", ms: 61 },
    ],
    a: [
      "예시로 찾아봤어요 (전세 2억 이하, 2,928곳 중 6곳, 출퇴근 짧은 순).",
      "6곳 모두 판교 근처 오피스텔입니다.",
      "천사의도시Ⅱ오피스텔(오피스텔·분당, 40㎡): 중간 1.85억, 3건. 미금 도보 3.8분, 판교까지 승차 약 6.6분(추정). 3D로 살아 보기 가능.",
      "오라타워(오피스텔·중원, 40㎡): 중간 1.25억, 2건. 모란 도보 1분 이내, 판교까지 승차 약 11.6분(환승 1회 포함, 추정). 3D로 살아 보기 가능.",
      "시그마 3(오피스텔·분당, 30㎡): 중간 1.77억, 7건. 야탑 도보 3.8분, 판교까지 승차 약 8.5분(환승 1회 포함, 추정). 3D로 살아 보기 가능.",
      "분당오벨리스크(오피스텔·분당, 40㎡): 중간 1.93억, 5건. 서현 도보 4.9분, 판교까지 승차 약 8분(환승 1회 포함, 추정). 3D로 살아 보기 가능.",
      "타는 시간은 운행시간표·추정으로 채웠어요 (대기 시간 제외). 2곳을 고르시면 30일 살아 보기를 실행해 드려요.",
    ].join("\n"),
  },
  switch: {
    q: "B로 바꾸면 어떻게 달라져?",
    tools: [{ name: "compare", ok: true, summary: "비교(12개 지표)", ms: 41 }],
    a: [
      "B로 바꾸면 이렇게 달라져요 (demo-two-homes 기준).",
      "30일 동안 걸은 시간: A 27시간 50분 → B 38시간 3분.",
      "전세로 살면 매달 집에 드는 돈: A 260만 원 → B 250만 원.",
      "집값과 생활비를 내고 남는 돈: A 약 335만 원 → B 약 393만 원.",
      "30일 평균 피곤한 정도: A 7.6 → B 7.1.",
      "어느 쪽이 나은지는 고객님이 정하세요. 내 기준 탭에서 비중을 정해 보세요.",
    ].join("\n"),
  },
};

export function recordedReplyFor(ask) {
  return RECORDED_AGENT_REPLIES[ask] || null;
}

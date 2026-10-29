// Plain-words copy contract (stage 10, Part A): the machine-readable side
// of docs/copy-guide.md. BANNED_LABEL_JARGON lists the bare jargon that
// must never appear in a label (the copy test scans label literals in
// web/src/ui/*.jsx, web/src/engine/simulate.js and web/src/priorities.js).
// Each entry may name an allowed longer phrase that contains it
// (e.g. "남는 돈" is fine inside "집값과 생활비를 내고 남는 돈").

export const BANNED_LABEL_JARGON = [
  "월 주거비",
  "부담률",
  "남는 돈",
  "피로도",
  "전세가율",
  "도보 이동",
  "승차 시간",
  "손익분기",
  "순비용",
  "기회비용",
  "상환표",
  "원리금균등",
  "DSR",
  "LTV",
  "목돈",
  "점유 형태",
  "통근·통학 도보",
  "재택 시간",
  "혼잡 100% 초과 탑승",
  "모형에 없음",
];

// Longer plain phrases that legitimately contain a banned substring.
export const ALLOWED_LONG_PHRASES = [
  "집값과 생활비를 내고 남는 돈",
];

// Per-tenure plain lead for "매달 집에 드는 돈".
export const TENURE_PLAIN_LEAD = {
  "매매": "내 집 마련해 살면",
  "전세": "전세로 살면",
  "월세": "월세로 살면",
  "공공임대": "공공임대로 살면",
};

export function monthlyHousingLabel(tenure) {
  return `${TENURE_PLAIN_LEAD[tenure] || "이 집에서 살면"} 매달 집에 드는 돈`;
}

export const BURDEN_PLAIN_LABEL = "월급에서 집에 나가는 비율";
export const BURDEN_PLAIN_NOTE = "흔히 30%를 넘으면 빠듯하다고 해요 (참고 기준)";
export const REMAINING_PLAIN_LABEL = "집값과 생활비를 내고 남는 돈";
export const HOW_CALCULATED = "어떻게 계산했나요?";

// 13f-1: only two source badges exist on screen — 실측 (measured or
// official) and 가정값 (assumed, stated, or estimated). Everything else
// renders as plain text. Pure; the SourceBadge component reads this.
const MEASURED_SOURCES = new Set([
  "서울교통공사", "실측", "실거래", "rtms", "graph", "그래프",
  "register", "관청 자료", "건축물대장", "police", "경찰청",
  "housing_api", "공공임대", "network", "schedule", "photos",
]);

export function sourceBadgeFor(source) {
  return MEASURED_SOURCES.has(String(source || "").trim()) ? "실측" : "가정값";
}

// Unique badges for one group (section header or row group), measured
// first. Rendered once per group, never on every line.
export function groupBadgesFor(sources) {
  const uniq = [...new Set((sources || []).map(sourceBadgeFor))];
  return uniq.sort((a, b) => (a === "실측" ? -1 : 1));
}

// Example id → plain title. "예시로 시작했어요 (newlywed-couple)" is
// gone; the chat says "예시: 예비 신혼부부".
export const EXAMPLE_TITLE = {
  "single-firstjob": "1인 사회초년생",
  "newlywed-couple": "예비 신혼부부",
  "dual-income-child": "맞벌이 + 초등학생 자녀",
};

export function exampleLine(id) {
  const title = EXAMPLE_TITLE[String(id || "")];
  return title ? `예시: ${title}` : "예시에서 시작했어요";
}

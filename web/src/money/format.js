// Human number formatting for UI and agent replies (pure, no DOM).
//
// One formatter everywhere: long walks become km, long minute sums become
// 시간/분, won amounts become 억/만 units. Every formatted value keeps the
// raw number available for guards (numbers must cite tool results), so
// formatters return {text, raw} pairs via fmt(); the text helpers below
// are the display strings.

export function fmtDistance(m) {
  if (m === null || m === undefined) return "–";
  const v = Number(m);
  if (!Number.isFinite(v)) return "–";
  if (Math.abs(v) >= 1000) {
    const km = v / 1000;
    const text = `${km >= 100 ? Math.round(km * 10) / 10 : Math.round(km * 10) / 10} km`;
    return text.replace(/\.0 km$/, " km");
  }
  return `${Math.round(v * 10) / 10} m`.replace(/\.0 m$/, " m");
}

export function fmtMinutes(min) {
  if (min === null || min === undefined) return "–";
  const v = Number(min);
  if (!Number.isFinite(v)) return "–";
  const total = Math.round(v);
  if (Math.abs(total) < 60) return `${total}분`;
  const h = Math.trunc(total / 60);
  const m = Math.abs(total % 60);
  return m === 0 ? `${h}시간` : `${h}시간 ${m}분`;
}

// Compact table form keeps the raw minute count (brief: "or 2,123분 in tables").
export function fmtMinutesTable(min) {
  if (min === null || min === undefined) return "–";
  const v = Number(min);
  if (!Number.isFinite(v)) return "–";
  return `${Math.round(v).toLocaleString("ko-KR")}분`;
}

// 2499900000 -> "24억 9,990만 원"; 3000000 -> "월 300만 원" via fmtMonthly.
export function fmtWon(won, { monthly = false } = {}) {
  const v = Number(won);
  if (!Number.isFinite(v)) return "–";
  const neg = v < 0;
  const abs = Math.round(Math.abs(v));
  let body;
  if (abs >= 100000000) {
    const eok = Math.trunc(abs / 100000000);
    const man = Math.trunc((abs % 100000000) / 10000);
    const rest = abs % 10000;
    body = `${eok.toLocaleString("ko-KR")}억`
      + (man > 0 ? ` ${man.toLocaleString("ko-KR")}만` : "")
      + (rest > 0 ? ` ${rest.toLocaleString("ko-KR")}` : "")
      + " 원";
  } else if (abs >= 10000) {
    const man = Math.trunc(abs / 10000);
    const rest = abs % 10000;
    body = `${man.toLocaleString("ko-KR")}만`
      + (rest > 0 ? ` ${rest.toLocaleString("ko-KR")}` : "")
      + " 원";
  } else {
    body = `${abs.toLocaleString("ko-KR")} 원`;
  }
  return `${neg ? "−" : ""}${monthly ? "월 " : ""}${body}`;
}

export function fmtPct(ratio, digits = 1) {
  if (ratio === null || ratio === undefined) return "–";
  const v = Number(ratio);
  if (!Number.isFinite(v)) return "–";
  return `${(v * 100).toFixed(digits)}%`;
}

// Percent number already in % units (congestion 93.2 → "93.2%").
export function fmtPercent(v) {
  if (v === null || v === undefined) return "–";
  const n = Number(v);
  if (!Number.isFinite(n)) return "–";
  return `${Math.round(n * 10) / 10}%`;
}

// Fatigue index 0–100 (one decimal, no unit suffix — the label says 지수).
export function fmtIndex(v) {
  if (v === null || v === undefined) return "–";
  const n = Number(v);
  if (!Number.isFinite(n)) return "–";
  return `${Math.round(n * 10) / 10}`;
}

export function fmtCount(n, unit = "회") {
  if (n === null || n === undefined) return "–";
  const v = Number(n);
  if (!Number.isFinite(v)) return "–";
  return `${Math.round(v).toLocaleString("ko-KR")}${unit}`;
}

export function fmtArea(m2) {
  if (m2 === null || m2 === undefined) return "–";
  const v = Number(m2);
  if (!Number.isFinite(v)) return "–";
  return `${Math.round(v * 100) / 100} ㎡`;
}

// Source badges stay short: 그래프 (walk graph), 실거래 (RTMS), 공공임대
// (public-housing API), 가정값 (user assumption), 추정 (payroll estimate).
export const SOURCE_BADGE = {
  graph: "그래프",
  scenario: "가정값",
  user_input: "가정값",
  rtms: "실거래",
  housing_api: "공공임대",
  payroll_estimate: "추정",
  police: "경찰청",
  "graph+scenario": "그래프+가정",
};

export function badgeFor(source) {
  return SOURCE_BADGE[source] || String(source || "");
}

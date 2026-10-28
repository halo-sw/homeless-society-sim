// Shareable result card (pure data builder + canvas renderer, no React).
//
// resultCardData assembles persona, A vs B (and C) in plain words —
// commute, monthly housing, remaining money, fatigue, 10-minute
// convenience, jeonse signals — each with source badges and 가정값 marks,
// the customer's own priorities, a date and the disclaimer. No verdict:
// the card shows and the customer decides. The PNG renders locally via
// <canvas> and downloads in the browser (no upload).

import { fmtWon, fmtMinutes, fmtIndex } from "../money/format.js";
import { monthlyHousingLabel, BURDEN_PLAIN_LABEL,
  REMAINING_PLAIN_LABEL } from "./copy.js";

export const SHARE_TITLE = "우리 집 비교 결과";
export const SHARE_DISCLAIMER =
  "보여주기만 해요. 살지 말지는 고객님이 직접 정하세요. 가정값(정해 둔 값)이 섞여 있어요.";

const SRC_KO = {
  graph: "걸어서 잰 시간", rtms: "실거래", scenario: "가정값",
  payroll_estimate: "추정", user_input: "고객 입력", police: "경찰청",
  register: "관청 자료", housing_api: "공공임대", mixed: "섞임",
  customer_listing: "붙여넣은 매물",
};

export function shareSourceKo(source) {
  return SRC_KO[source] || source || "–";
}

function homeRows(homeKey, h, tenure) {
  const sel = h.by_tenure && h.by_tenure[tenure];
  const rows = [];
  if (h.qol_time) {
    rows.push({
      label: "하루 출퇴근에 쓰는 시간",
      value: fmtMinutes(h.qol_time.commute_minutes_per_day),
      sources: ["graph", "scenario"], assumed: true,
      note: "차·지하철을 탄 시간은 정해 둔 값이에요",
    });
  }
  if (sel) {
    rows.push({
      label: monthlyHousingLabel(tenure),
      value: fmtWon(sel.housing.monthly_won, { monthly: true }),
      sources: [sel.housing.source], assumed: false,
    });
    rows.push({
      label: `${BURDEN_PLAIN_LABEL} / ${REMAINING_PLAIN_LABEL}`,
      value: sel.burden_ratio === null
        ? `– / ${fmtWon(sel.remaining_won, { monthly: true })}`
        : `${Math.round(sel.burden_ratio * 1000) / 10}% / ${fmtWon(sel.remaining_won, { monthly: true })}`,
      sources: [sel.housing.source], assumed: false,
    });
  }
  if (h.qol_fatigue && h.qol_fatigue.avg_30d !== null
      && h.qol_fatigue.avg_30d !== undefined) {
    rows.push({
      label: "30일 평균 피곤한 정도",
      value: fmtIndex(h.qol_fatigue.avg_30d),
      sources: ["scenario"], assumed: true,
      note: "가정으로 계산한 값이에요",
    });
  }
  if (h.qol_convenience) {
    const c = h.qol_convenience;
    rows.push({
      label: "걸어서 10분 안에 갈 수 있는 곳",
      value: `장보기 ${c.grocery ?? 0} · 병원 ${c.clinic ?? 0} · 역 ${c.station ?? 0}`,
      sources: ["graph"], assumed: false,
    });
  }
  const check = h.jeonse_check;
  if (check && check.computable) {
    rows.push({
      label: "보증금이 집값의 몇 %인지",
      value: `${check.ratio_pct}% (${check.band.label})`,
      sources: ["rtms"], assumed: false,
    });
  } else if (check) {
    rows.push({
      label: "보증금이 집값의 몇 %인지",
      value: "실거래가 적어서 계산하기 어려워요",
      sources: ["rtms"], assumed: false,
    });
  }
  return rows;
}

export function resultCardData({ money, tenures = {}, priorities = null,
    weights = null, scenarioName = "", date = null } = {}) {
  const day = date || new Date().toISOString().slice(0, 10);
  const homes = [];
  for (const [label, h] of Object.entries((money && money.homes) || {})) {
    const tenure = tenures[label] || "전세";
    homes.push({
      label, complex_name: h.complex_name || "", area: h.area || "",
      tenure,
      rows: homeRows(label, h, tenure),
    });
  }
  let priorityLines = ["기본 모두 보통이에요."];
  let priorityNote = "비중을 정하지 않았어요. 내 기준으로 보기 탭에서 정할 수 있어요.";
  if (priorities && weights && weights.explicit) {
    priorityLines = (priorities.groups || []).map((g) =>
      `${g.title} ${weights.weights[g.id] ?? 3}`);
    priorityNote = "고객님이 직접 정한 비중이에요.";
  }
  return {
    title: SHARE_TITLE,
    date: day,
    scenario: scenarioName,
    homes,
    priorities: { lines: priorityLines, note: priorityNote },
    disclaimer: SHARE_DISCLAIMER,
    sources_note: "출처: 국토교통부 실거래가·경찰청·공공임대 공식 자료와 걸어서 직접 잰 시간, 정해 둔 값.",
  };
}

// --- canvas renderer ------------------------------------------------------------
// Draws the card on a 2D canvas (browser only). Returns {width, height}.

const INK = "#2b2620";
const FAINT = "#6b6257";
const ACCENT = "#7a5c3e";

export function renderShareCard(canvas, data) {
  const ctx = canvas.getContext("2d");
  const W = 880;
  const lineH = 26;
  const pad = 36;
  const lines = [];
  const push = (text, opts = {}) => lines.push({ text, ...opts });
  push(data.title, { size: 30, bold: true, gapAfter: 4 });
  push(`${data.date} · ${data.scenario}`, { color: FAINT, gapAfter: 12 });
  for (const h of data.homes) {
    push(`홈 ${h.label} · ${h.complex_name} (${h.tenure})`, { size: 20, bold: true, gapBefore: 10 });
    for (const r of h.rows) {
      const marks = [
        ...r.sources.map(shareSourceKo),
        ...(r.assumed ? ["가정값"] : []),
      ].join(" · ");
      push(`· ${r.label}: ${r.value}`, { wrap: true });
      push(`  [${marks}]${r.note ? ` ${r.note}` : ""}`, { color: FAINT, size: 13 });
    }
  }
  push("내가 정한 비중", { size: 20, bold: true, gapBefore: 10 });
  for (const l of data.priorities.lines) push(`· ${l}`);
  push(data.priorities.note, { color: FAINT, size: 13, gapAfter: 6 });
  push(data.disclaimer, { wrap: true, gapBefore: 8 });
  push(data.sources_note, { color: FAINT, size: 13, wrap: true });

  // Wrap pass.
  ctx.textBaseline = "top";
  const wrapped = [];
  for (const l of lines) {
    ctx.font = `${l.bold ? "700 " : ""}${l.size || 16}px system-ui, "Noto Sans KR", sans-serif`;
    if (!l.wrap) {
      wrapped.push({ ...l, parts: [l.text] });
      continue;
    }
    const parts = [];
    let cur = "";
    for (const ch of l.text) {
      if (ctx.measureText(`${cur}${ch}`).width > W - pad * 2 && cur) {
        parts.push(cur);
        cur = "";
      }
      cur += ch;
    }
    if (cur) parts.push(cur);
    wrapped.push({ ...l, parts });
  }
  const rowH = (l) => (l.size === 30 ? 44 : l.size === 20 ? 32 : l.size === 13 ? 20 : lineH);
  const H = pad * 2 + wrapped.reduce((a, l) =>
    a + (l.gapBefore || 0) + l.parts.length * rowH(l) + (l.gapAfter || 0), 0);
  canvas.width = W;
  canvas.height = Math.ceil(H);
  ctx.fillStyle = "#fffdf8";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.textBaseline = "top";
  let y = pad;
  for (const l of wrapped) {
    y += l.gapBefore || 0;
    ctx.font = `${l.bold ? "700 " : ""}${l.size || 16}px system-ui, "Noto Sans KR", sans-serif`;
    ctx.fillStyle = l.color || INK;
    if (l.size === 30) {
      ctx.fillStyle = ACCENT;
      ctx.fillRect(pad, y + 4, 6, 30);
    }
    for (const part of l.parts) {
      ctx.fillText(part, l.size === 30 ? pad + 16 : pad, y);
      y += rowH(l);
    }
    y += l.gapAfter || 0;
  }
  ctx.fillStyle = FAINT;
  ctx.font = "13px system-ui, sans-serif";
  ctx.fillText("주거 시뮬레이터 · 파일은 이 브라우저에만 저장돼요", pad, canvas.height - pad + 8);
  return { width: canvas.width, height: canvas.height };
}

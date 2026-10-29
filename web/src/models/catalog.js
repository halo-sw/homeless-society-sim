// Model catalog + per-turn usage tracking (13, Part 4). One row per
// provider in the 모델 panel; per-turn model, tokens in/out/
// reasoning, latency and estimated cost; session totals; CSV export
// (local download). Pure; tested in models-13.test.js.

import { estimateCostUsd } from "./prices.js";

export const MODEL_ROWS = [
  { provider: "meta", label: "Muse Spark 1.3 (Meta)", oauth: false },
  { provider: "baseten", label: "Muse Spark Open (Baseten)", oauth: false },
  { provider: "recorded", label: "기록된 답변 (키 없이)", oauth: false },
];

// Neither provider documents an OAuth flow for third-party apps
// today, so the panel shows no fake "로그인으로 연결" button.
export const OAUTH_NOTE = "두 제공처 모두 서드파티 앱용 OAuth를 제공하지 않아요 (2026-10-29 확인). 키 붙여넣기만 지원해요.";

// status: connected | no-key | error
export function rowStatus(provider, { hasServerKey, hasByoKey, lastError }) {
  if (lastError) {
    return {
      status: "error",
      reason: errorReason(lastError),
    };
  }
  if (provider === "recorded") return { status: "connected", reason: "언제나 볼 수 있어요" };
  if (hasServerKey || hasByoKey) {
    return {
      status: "connected",
      reason: hasByoKey ? "내 키로 연결됨 (이 탭에서만)" : "서버 키로 연결됨",
    };
  }
  return { status: "no-key", reason: "키가 없어요 — 붙여넣거나 서버 키를 설정하세요" };
}

export function errorReason(err) {
  if (!err) return "";
  if (typeof err === "string") return err.slice(0, 200);
  const bits = [];
  if (err.httpStatus) bits.push(`HTTP ${err.httpStatus}`);
  if (err.providerMessage) bits.push(String(err.providerMessage).slice(0, 160));
  else if (err.message) bits.push(String(err.message).slice(0, 160));
  if (err.timeoutMs) bits.push(`timeout ${err.timeoutMs}ms`);
  return bits.join(" · ") || "알 수 없는 오류";
}

export function newUsageLog() {
  return { turns: [] };
}

export function recordTurn(log, turn) {
  // turn: {provider, model, input, output, reasoning, latencyMs, at?}
  const entry = {
    at: turn.at || new Date().toISOString(),
    provider: turn.provider,
    model: turn.model || turn.provider,
    input: turn.input || 0,
    output: turn.output || 0,
    reasoning: turn.reasoning || 0,
    latencyMs: turn.latencyMs || 0,
    costUsd: estimateCostUsd(turn.provider, {
      input_tokens: turn.input || 0,
      output_tokens: turn.output || 0,
      reasoning_tokens: turn.reasoning || 0,
    }),
  };
  return { turns: [...(log.turns || []), entry] };
}

export function sessionTotals(log) {
  const totals = { turns: 0, input: 0, output: 0, reasoning: 0, latencyMs: 0, costUsd: 0 };
  for (const t of (log && log.turns) || []) {
    totals.turns += 1;
    totals.input += t.input || 0;
    totals.output += t.output || 0;
    totals.reasoning += t.reasoning || 0;
    totals.latencyMs += t.latencyMs || 0;
    totals.costUsd += t.costUsd || 0;
  }
  return totals;
}

function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function usageCsv(log) {
  const head = "at,provider,model,input_tokens,output_tokens,reasoning_tokens,latency_ms,cost_usd_est";
  const rows = ((log && log.turns) || []).map((t) => [
    t.at, t.provider, t.model, t.input, t.output, t.reasoning,
    t.latencyMs, (t.costUsd || 0).toFixed(6),
  ].map(csvCell).join(","));
  return [head, ...rows].join("\n") + "\n";
}

export function formatCostUsd(usd) {
  return `$${(usd || 0).toFixed(4)} (추정)`;
}

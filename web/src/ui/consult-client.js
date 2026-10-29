// Consult browser client: thin fetch wrappers (no React, no keys).
//
// The chat's free questions post to /api/consult (vite dev only); the
// fixed flow (profile → candidates → simulation) runs keyless in the
// browser, and ?ask=… replays recorded replies. Nothing here imports
// server modules or provider code, so no key material can enter the
// bundle.

export async function postConsult({ provider, messages, scenario, context = null, byoKey = "" }) {
  const headers = { "Content-Type": "application/json" };
  // 13: BYOK travels in a header to our same-origin proxy only.
  if (byoKey) headers["x-model-key"] = byoKey;
  const started = (typeof performance !== "undefined" ? performance.now() : 0);
  const r = await fetch("/api/consult", {
    method: "POST",
    headers,
    body: JSON.stringify({ provider, messages, scenario, context }),
  });
  const latencyMs = (typeof performance !== "undefined" ? performance.now() : 0) - started;
  let payload = null;
  try {
    payload = await r.json();
  } catch {
    throw new Error(`상담 서버 응답 오류 (HTTP ${r.status})`);
  }
  if (!r.ok || !payload || payload.ok !== true) {
    const err = new Error((payload && payload.error) || `상담 서버 오류 (HTTP ${r.status})`);
    err.httpStatus = r.status;
    throw err;
  }
  payload.latencyMs = Math.round(latencyMs);
  return payload;
}

export async function fetchModelStatus() {
  const r = await fetch("/api/model/status");
  if (!r.ok) throw new Error(`모델 상태 조회 실패 (HTTP ${r.status})`);
  return r.json();
}

export async function loadScenario(name) {
  const r = await fetch(`/scenarios/${name}.json`);
  if (!r.ok) throw new Error(`시나리오를 불러오지 못했습니다 (${name})`);
  return r.json();
}

export function formatUsage(usage) {
  const prompt = usage.prompt_tokens || 0;
  const completion = usage.completion_tokens || 0;
  const total = prompt + completion;
  const tokens = total >= 1000 ? `${(total / 1000).toFixed(1)}k` : String(total);
  if (usage.est_usd === null || usage.est_usd === undefined) {
    return `${tokens} 토큰`;
  }
  return `${tokens} 토큰 · $${Number(usage.est_usd).toFixed(3)}`;
}

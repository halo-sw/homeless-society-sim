// Consult browser client: thin fetch wrappers (no React, no keys).
//
// Live chat posts to /api/consult (vite dev only); the production build
// never calls it and shows a recorded demo transcript instead. Nothing
// here imports server modules or provider code, so no key material can
// enter the bundle.

export async function postConsult({ provider, messages, scenario, context = null }) {
  const r = await fetch("/api/consult", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, messages, scenario, context }),
  });
  let payload = null;
  try {
    payload = await r.json();
  } catch {
    throw new Error(`상담 서버 응답 오류 (HTTP ${r.status})`);
  }
  if (!r.ok || !payload || payload.ok !== true) {
    throw new Error((payload && payload.error) || `상담 서버 오류 (HTTP ${r.status})`);
  }
  return payload;
}

export async function loadScenario(name) {
  const r = await fetch(`/scenarios/${name}.json`);
  if (!r.ok) throw new Error(`시나리오를 불러오지 못했습니다 (${name})`);
  return r.json();
}

// Recorded demo transcript for the production build. Written by the
// orchestrator later; absent (404) means "empty state", not an error.
export async function loadDemoTranscript() {
  const r = await fetch("/scenarios/consult-demo.json");
  if (!r.ok) return null;
  try {
    return await r.json();
  } catch {
    return null;
  }
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

// Consult browser client: thin fetch wrappers (no React, no keys).
//
// The chat's free questions post to /api/consult (dev server or, on the
// public site, the relay, which keeps the keys); the fixed flow
// (profile → candidates → simulation) runs keyless in the browser, and
// ?ask=… replays recorded replies. Nothing here imports server modules
// or provider code, so no key material can enter the bundle.
//
// 23b: on the public site the calls go to the relay, which keeps the
// keys. Without a live API (no dev server, no relay) the model calls
// stay off and the rule-based flow keeps working.

import { assetUrl, LIVE_API, apiUrl } from "../paths.js";

// 27b2: NDJSON stream parser for the consult stream.
export function parseNdjson(buffer, chunk) {
  const text = buffer + chunk;
  const parts = text.split("\n");
  const rest = parts.pop();
  const events = [];
  for (const line of parts) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // skip bad lines
    }
  }
  return { events, rest };
}

export async function postConsult({ provider, messages, scenario, context = null, byoKey = "" }) {
  if (!LIVE_API) return { off: true, messages: [] };
  const headers = { "Content-Type": "application/json" };
  // 13: BYOK travels in a header to our proxy (dev server or relay) only.
  if (byoKey) headers["x-model-key"] = byoKey;
  const started = (typeof performance !== "undefined" ? performance.now() : 0);
  const r = await fetch(apiUrl("/api/consult"), {
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
    if (r.status === 429) {
      const err = new Error("잠시 쉬었다가 다시 물어봐 주세요 (요청이 많아요)");
      err.httpStatus = 429;
      throw err;
    }
    const err = new Error((payload && payload.error) || `상담 서버 오류 (HTTP ${r.status})`);
    err.httpStatus = r.status;
    throw err;
  }
  payload.latencyMs = Math.round(latencyMs);
  return payload;
}

export async function postDiary({ provider, digests, lang = "ko", byoKey = "" }) {
  if (!LIVE_API) return { off: true };
  const headers = { "Content-Type": "application/json" };
  if (byoKey) headers["x-model-key"] = byoKey;
  const started = (typeof performance !== "undefined" ? performance.now() : 0);
  const r = await fetch(apiUrl("/api/consult"), {
    method: "POST",
    headers,
    body: JSON.stringify({ task: "diary", provider, digests, lang }),
  });
  const latencyMs = (typeof performance !== "undefined" ? performance.now() : 0) - started;
  let payload = null;
  try {
    payload = await r.json();
  } catch {
    throw new Error(`상담 서버 응답 오류 (HTTP ${r.status})`);
  }
  if (!r.ok || !payload || payload.ok !== true) {
    if (r.status === 429) {
      const err = new Error("잠시 쉬었다가 다시 물어봐 주세요 (요청이 많아요)");
      err.httpStatus = 429;
      throw err;
    }
    const err = new Error((payload && payload.error) || `상담 서버 오류 (HTTP ${r.status})`);
    err.httpStatus = r.status;
    throw err;
  }
  payload.latencyMs = Math.round(latencyMs);
  return payload;
}

// 27b2: streamed consult — same request plus `stream: true`; the server
// replies NDJSON (`tool_start` / `tool_end` rows, last line
// `{ type: "done", ...out }`). Emits live rows via onEvent and resolves
// with the done payload (without `type`) plus latencyMs.
export async function postConsultStream({ provider, messages, scenario, context = null, byoKey = "" }, onEvent) {
  if (!LIVE_API) return { off: true, messages: [] };
  const headers = { "Content-Type": "application/json" };
  if (byoKey) headers["x-model-key"] = byoKey;
  const started = (typeof performance !== "undefined" ? performance.now() : 0);
  const r = await fetch(apiUrl("/api/consult"), {
    method: "POST",
    headers,
    body: JSON.stringify({ provider, messages, scenario, context, stream: true }),
  });
  const latencyMs = () => Math.round((typeof performance !== "undefined" ? performance.now() : 0) - started);
  if (r.status !== 200) {
    let payload = null;
    try {
      payload = await r.json();
    } catch {
      throw new Error(`상담 서버 응답 오류 (HTTP ${r.status})`);
    }
    if (r.status === 429) {
      const err = new Error("잠시 쉬었다가 다시 물어봐 주세요 (요청이 많아요)");
      err.httpStatus = 429;
      throw err;
    }
    const err = new Error((payload && payload.error) || `상담 서버 오류 (HTTP ${r.status})`);
    err.httpStatus = r.status;
    throw err;
  }
  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = null;
  for (;;) {
    const { done: finished, value } = await reader.read();
    if (finished) break;
    buffer += decoder.decode(value, { stream: true });
    const { events, rest } = parseNdjson("", buffer);
    buffer = rest;
    for (const ev of events) {
      if (!ev || typeof ev.type !== "string") continue;
      if (ev.type === "tool_start" || ev.type === "tool_end") {
        if (onEvent) onEvent(ev);
      } else if (ev.type === "error") {
        throw new Error(ev.error || "상담 서버 오류");
      } else if (ev.type === "done") {
        done = ev;
      }
    }
    if (done) break;
  }
  if (!done) {
    const { events } = parseNdjson("", buffer + "\n");
    for (const ev of events) {
      if (ev && ev.type === "done") { done = ev; break; }
      if (ev && ev.type === "error") throw new Error(ev.error || "상담 서버 오류");
    }
  }
  if (!done) throw new Error("상담 응답이 끊겼어요");
  const { type, ...out } = done;
  out.latencyMs = latencyMs();
  return out;
}

export async function fetchModelStatus() {
  if (!LIVE_API) return { off: true };
  const r = await fetch(apiUrl("/api/model/status"));
  if (!r.ok) throw new Error(`모델 상태 조회 실패 (HTTP ${r.status})`);
  return r.json();
}

export async function loadScenario(name) {
  const r = await fetch(assetUrl(`/scenarios/${name}.json`));
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

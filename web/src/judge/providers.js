// Judge providers: OpenAI-compatible chat completions over fetch.
//
// Two swappable providers share one interface — the household's branch
// decisions go through complete(), background neighbours never do:
//
//   complete({provider, system, user, schema, ...}) ->
//     {json, usage, latency_ms, provider, model}
//
// Structured output uses response_format json_schema, with a fallback
// that retries without it and parses a JSON-only reply when the
// provider rejects json_schema. Retries with backoff cover 429/5xx,
// network errors and timeouts; other 4xx fail fast. At most
// MAX_CONCURRENT requests run at once (the judge CLI calls
// sequentially; the pool caps any parallel use).
//
// Reasoning models need headroom: max_tokens defaults to 2000 and meta
// sends reasoning_effort "low" unless overridden (baseten omits the
// field unless set). A reply cut off by the token budget
// (finish_reason "length", or a null content with the tokens spent on
// reasoning) throws code "truncated" with the usage attached — never
// "bad_json". usage carries reasoning_tokens when reported; it is part
// of completion_tokens, not on top of it.
//
// Keys come from the environment (never from code or logs): META_API_KEY
// (MODEL_API_KEY still works as a fallback) for meta, BASETEN_API_KEY
// for baseten. Nothing in this module prints,
// logs or returns a key; error messages carry status + a short body
// snippet only. Node-side only — keys never reach the browser.

export const MAX_CONCURRENT = 4;
export const DEFAULT_TIMEOUT_MS = 60000;
export const DEFAULT_RETRIES = 3;
export const DEFAULT_RETRY_BASE_MS = 1000;
export const ERROR_BODY_SNIPPET = 300;
// muse-spark-1.3 is a reasoning model: the old 400-token cap starved it
// (reasoning ate the whole budget, finish_reason "length", content null).
export const DEFAULT_MAX_TOKENS = 2000;
export const META_DEFAULT_EFFORT = "low";
export const REASONING_EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max"];

export const META_API_BASE = "https://api.meta.ai/v1";
export const BASETEN_API_BASE = "https://inference.baseten.co/v1";

export const PROVIDERS = {
  meta: {
    label: "Muse Spark 1.3",
    baseUrl: META_API_BASE,
    model: "muse-spark-1.3",
    keyEnv: "META_API_KEY",
    keyEnvFallback: ["MODEL_API_KEY"],
  },
  baseten: {
    // NOTE: base URL + auth scheme to be confirmed by the orchestrator.
    label: "Muse Spark Open",
    baseUrl: BASETEN_API_BASE,
    model: "meta-models/muse-spark-open-1026",
    keyEnv: "BASETEN_API_KEY",
  },
};

export function envKey(cfg, env) {
  const source = env || {};
  const names = [cfg.keyEnv, ...((cfg && cfg.keyEnvFallback) || [])];
  for (const name of names) {
    const value = source[name];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return "";
}

export function metaApiKey(env = process.env) {
  return envKey(PROVIDERS.meta, env || {});
}

export function providerConfig(name) {
  const cfg = PROVIDERS[name];
  if (!cfg) throw new Error(`judge: unknown provider ${JSON.stringify(name)} (want meta|baseten)`);
  return cfg;
}

export function providerLabel(name) {
  return providerConfig(name).label;
}

// Tiny semaphore; shared default pool caps provider concurrency.
export function createPool(limit = MAX_CONCURRENT) {
  let active = 0;
  const waiting = [];
  const pump = () => {
    while (active < limit && waiting.length > 0) {
      const next = waiting.shift();
      active++;
      next();
    }
  };
  return {
    run(fn) {
      return new Promise((resolve, reject) => {
        waiting.push(() => {
          fn().then(
            (v) => {
              active--;
              pump();
              resolve(v);
            },
            (err) => {
              active--;
              pump();
              reject(err);
            },
          );
        });
        pump();
      });
    },
  };
}

const sharedPool = createPool(MAX_CONCURRENT);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  throw err;
}

function snippet(text) {
  return String(text || "").slice(0, ERROR_BODY_SNIPPET);
}

// Pull a JSON object out of a chat reply: plain JSON first, then the
// first {...} span (fences tolerated). Throws bad_json.
export function extractJson(text) {
  const raw = String(text || "").trim();
  const fence = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  for (const cand of [fence, raw]) {
    if (!cand) continue;
    try {
      const v = JSON.parse(cand);
      if (v && typeof v === "object") return v;
    } catch { /* try the span fallback */ }
  }
  const start = fence.indexOf("{");
  const end = fence.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const v = JSON.parse(fence.slice(start, end + 1));
      if (v && typeof v === "object") return v;
    } catch { /* fall through */ }
  }
  fail("bad_json", `judge: provider reply is not a JSON object: ${snippet(fence)}`);
}

function responseFormat(schemaName, schema) {
  return {
    type: "json_schema",
    json_schema: { name: schemaName, schema },
  };
}

function requestBody({ model, system, user, schemaName, schema, withSchema, maxTokens, reasoningEffort }) {
  const body = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0,
    max_tokens: maxTokens,
  };
  // reasoning_effort is Meta-only by default; other providers omit it
  // unless the caller sets it explicitly.
  if (reasoningEffort != null) body.reasoning_effort = reasoningEffort;
  if (withSchema) body.response_format = responseFormat(schemaName, schema);
  return body;
}

function takeUsage(payload) {
  const u = (payload && payload.usage) || {};
  const out = {
    prompt_tokens: u.prompt_tokens || 0,
    completion_tokens: u.completion_tokens || 0,
  };
  const cached = u.prompt_tokens_details && u.prompt_tokens_details.cached_tokens;
  if (Number.isFinite(cached) && cached > 0) out.cached_tokens = cached;
  const reasoning = u.completion_tokens_details && u.completion_tokens_details.reasoning_tokens;
  if (Number.isFinite(reasoning)) out.reasoning_tokens = reasoning;
  return out;
}

async function postOnce({ url, apiKey, body, timeoutMs, fetchImpl }) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (err) {
    if (err && err.name === "AbortError") fail("timeout", `judge: provider call timed out after ${timeoutMs} ms`);
    fail("network_error", `judge: provider call failed: ${snippet((err && err.message) || err)}`);
  } finally {
    clearTimeout(timer);
  }
}

function wantsSchemaFallback(status, bodyText) {
  return status === 400 && /response_format|json_schema/i.test(bodyText || "");
}

function retryable(status) {
  return status === 429 || (status >= 500 && status <= 599);
}

// Tool-call chat completions for the 상담 agent (OpenAI-style tools).
// messages is the full history (system/user/assistant/tool roles);
// tools is [{type: "function", function: {name, description, parameters}}].
// Returns {message: {content, tool_calls: [{id, name, args}]}, finish,
// usage, latency_ms, provider, model}. tool_calls[].args is the parsed
// arguments object (bad JSON -> {} with args_parse_error set). Same retry,
// timeout, pool and reasoning-effort rules as complete().
export async function completeWithTools({
  provider, messages, tools,
  apiKey = null, fetchImpl = null, timeoutMs = DEFAULT_TIMEOUT_MS,
  retries = DEFAULT_RETRIES, retryBaseMs = DEFAULT_RETRY_BASE_MS,
  maxTokens = DEFAULT_MAX_TOKENS, reasoningEffort = undefined,
  pool = sharedPool,
} = {}) {
  const cfg = providerConfig(provider);
  const key = apiKey || (typeof process !== "undefined" && process.env ? envKey(cfg, process.env) : "");
  if (!key) {
    const keyNames = (cfg.keyEnvFallback && cfg.keyEnvFallback.length)
      ? `${cfg.keyEnv} (or ${cfg.keyEnvFallback.join(", ")})`
      : cfg.keyEnv;
    fail("missing_key", `judge: provider ${provider} needs ${keyNames} in the environment (no key, no call)`);
  }
  const fetch = fetchImpl || globalThis.fetch;
  if (typeof fetch !== "function") fail("no_fetch", "judge: no fetch implementation available");
  const maxTok = maxTokens ?? DEFAULT_MAX_TOKENS;
  const effort = reasoningEffort === undefined
    ? (provider === "meta" ? META_DEFAULT_EFFORT : undefined)
    : reasoningEffort;
  const url = `${cfg.baseUrl}/chat/completions`;
  const started = Date.now();
  return pool.run(async () => {
    for (let attempt = 0; ; attempt++) {
      const body = {
        model: cfg.model,
        messages,
        temperature: 0,
        max_tokens: maxTok,
      };
      if (effort != null) body.reasoning_effort = effort;
      if (tools) body.tools = tools;
      let resp;
      try {
        resp = await postOnce({ url, apiKey: key, body, timeoutMs, fetchImpl: fetch });
      } catch (err) {
        if ((err.code === "timeout" || err.code === "network_error") && attempt < retries) {
          await sleep(retryBaseMs * 2 ** attempt);
          continue;
        }
        throw err;
      }
      const text = await resp.text().catch(() => "");
      if (resp.ok) {
        let payload;
        try {
          payload = JSON.parse(text);
        } catch {
          fail("bad_json", `judge: provider returned invalid JSON: ${snippet(text)}`);
        }
        const choice = payload.choices && payload.choices[0];
        const msg = (choice && choice.message) || {};
        const finish = (choice && choice.finish_reason) || "stop";
        const rawCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
        if (finish === "length" || (msg.content == null && rawCalls.length === 0)) {
          const err = new Error(`judge: provider reply truncated (finish_reason=${JSON.stringify(finish)})`);
          err.code = "truncated";
          err.usage = takeUsage(payload);
          throw err;
        }
        const tool_calls = rawCalls.map((c) => {
          let args = {};
          let parseError = null;
          try {
            args = JSON.parse((c.function && c.function.arguments) || "{}");
          } catch {
            parseError = true;
          }
          return { id: c.id, name: (c.function && c.function.name) || "",
            args, ...(parseError ? { args_parse_error: true } : {}) };
        });
        return {
          message: { content: msg.content || "", tool_calls },
          finish,
          usage: takeUsage(payload),
          latency_ms: Date.now() - started,
          provider,
          model: cfg.model,
        };
      }
      if (retryable(resp.status) && attempt < retries) {
        await sleep(retryBaseMs * 2 ** attempt);
        continue;
      }
      fail(`http_${resp.status}`, `judge: provider ${provider} returned ${resp.status}: ${snippet(text)}`);
    }
  });
}

export async function complete({
  provider, system, user, schema, schemaName = "decision",
  apiKey = null, fetchImpl = null, timeoutMs = DEFAULT_TIMEOUT_MS,
  retries = DEFAULT_RETRIES, retryBaseMs = DEFAULT_RETRY_BASE_MS,
  maxTokens = DEFAULT_MAX_TOKENS, reasoningEffort = undefined,
  pool = sharedPool,
} = {}) {
  const cfg = providerConfig(provider);
  const key = apiKey || (typeof process !== "undefined" && process.env ? envKey(cfg, process.env) : "");
  if (!key) {
    const keyNames = (cfg.keyEnvFallback && cfg.keyEnvFallback.length)
      ? `${cfg.keyEnv} (or ${cfg.keyEnvFallback.join(", ")})`
      : cfg.keyEnv;
    fail("missing_key", `judge: provider ${provider} needs ${keyNames} in the environment (no key, no call)`);
  }
  const fetch = fetchImpl || globalThis.fetch;
  if (typeof fetch !== "function") fail("no_fetch", "judge: no fetch implementation available");
  const maxTok = maxTokens ?? DEFAULT_MAX_TOKENS;
  // undefined = provider default (meta "low", others omit); null omits;
  // any string is sent as-is (the API rejects unknown values).
  const effort = reasoningEffort === undefined
    ? (provider === "meta" ? META_DEFAULT_EFFORT : undefined)
    : reasoningEffort;
  const url = `${cfg.baseUrl}/chat/completions`;
  const started = Date.now();
  return pool.run(async () => {
    let useSchema = true;
    let fellBack = false;
    for (let attempt = 0; ; attempt++) {
      const body = requestBody({
        model: cfg.model, system, user, schemaName, schema,
        withSchema: useSchema, maxTokens: maxTok, reasoningEffort: effort,
      });
      // Without json_schema the model needs the JSON-only instruction.
      if (!useSchema) body.messages[1].content += "\n\nReply with JSON only.";
      let resp;
      try {
        resp = await postOnce({ url, apiKey: key, body, timeoutMs, fetchImpl: fetch });
      } catch (err) {
        if ((err.code === "timeout" || err.code === "network_error") && attempt < retries) {
          await sleep(retryBaseMs * 2 ** attempt);
          continue;
        }
        throw err;
      }
      const text = await resp.text().catch(() => "");
      if (resp.ok) {
        let payload;
        try {
          payload = JSON.parse(text);
        } catch {
          fail("bad_json", `judge: provider returned invalid JSON: ${snippet(text)}`);
        }
        const choice = payload.choices && payload.choices[0];
        const content = choice && choice.message && choice.message.content;
        const finish = choice && choice.finish_reason;
        if (finish === "length" || content == null) {
          // The reasoning budget ate the reply: no JSON to parse, but the
          // tokens were spent — carry the usage on the error so the runner
          // can count them instead of dropping them like a transport error.
          const err = new Error(`judge: provider reply truncated (finish_reason=${JSON.stringify(finish)})`);
          err.code = "truncated";
          err.usage = takeUsage(payload);
          throw err;
        }
        return {
          json: extractJson(content || ""),
          usage: takeUsage(payload),
          latency_ms: Date.now() - started,
          provider,
          model: cfg.model,
        };
      }
      if (!fellBack && wantsSchemaFallback(resp.status, text)) {
        fellBack = true;
        useSchema = false;
        continue; // one structured-output fallback, not a retry
      }
      if (retryable(resp.status) && attempt < retries) {
        await sleep(retryBaseMs * 2 ** attempt);
        continue;
      }
      fail(`http_${resp.status}`, `judge: provider ${provider} returned ${resp.status}: ${snippet(text)}`);
    }
  });
}

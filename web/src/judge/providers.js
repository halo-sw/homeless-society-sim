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
// Keys come from the environment (never from code or logs): MODEL_API_KEY
// for meta, BASETEN_API_KEY for baseten. Nothing in this module prints,
// logs or returns a key; error messages carry status + a short body
// snippet only. Node-side only — keys never reach the browser.

export const MAX_CONCURRENT = 4;
export const DEFAULT_TIMEOUT_MS = 60000;
export const DEFAULT_RETRIES = 3;
export const DEFAULT_RETRY_BASE_MS = 1000;
export const ERROR_BODY_SNIPPET = 300;

export const PROVIDERS = {
  meta: {
    label: "Muse Spark 1.3",
    baseUrl: "https://api.meta.ai/v1",
    model: "muse-spark-1.3",
    keyEnv: "MODEL_API_KEY",
  },
  baseten: {
    // NOTE: base URL + auth scheme to be confirmed by the orchestrator.
    label: "Muse Spark Open",
    baseUrl: "https://inference.baseten.co/v1",
    model: "meta-models/muse-spark-open-1026",
    keyEnv: "BASETEN_API_KEY",
  },
};

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

function requestBody({ model, system, user, schemaName, schema, withSchema }) {
  const body = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0,
    max_tokens: 400,
  };
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

export async function complete({
  provider, system, user, schema, schemaName = "decision",
  apiKey = null, fetchImpl = null, timeoutMs = DEFAULT_TIMEOUT_MS,
  retries = DEFAULT_RETRIES, retryBaseMs = DEFAULT_RETRY_BASE_MS,
  pool = sharedPool,
} = {}) {
  const cfg = providerConfig(provider);
  const key = apiKey || (typeof process !== "undefined" && process.env ? process.env[cfg.keyEnv] : "");
  if (!key) {
    fail("missing_key", `judge: provider ${provider} needs ${cfg.keyEnv} in the environment (no key, no call)`);
  }
  const fetch = fetchImpl || globalThis.fetch;
  if (typeof fetch !== "function") fail("no_fetch", "judge: no fetch implementation available");
  const url = `${cfg.baseUrl}/chat/completions`;
  const started = Date.now();
  return pool.run(async () => {
    let useSchema = true;
    let fellBack = false;
    for (let attempt = 0; ; attempt++) {
      const body = requestBody({
        model: cfg.model, system, user, schemaName, schema,
        withSchema: useSchema,
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
        const content = payload.choices && payload.choices[0]
          && payload.choices[0].message && payload.choices[0].message.content;
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

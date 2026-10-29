// Bring-your-own-key proxy helpers (13, Part 4). The browser keeps a
// pasted key in sessionStorage only ("이 탭을 닫으면 지워져요") and
// sends it per request to our same-origin proxy in a header. The
// proxy forwards it to the provider and never logs, stores or echoes
// it. Node + browser safe; the no-log rule is tested in
// byok-13.test.js (logs and errors never contain the key).

export const BYOK_HEADER = "x-model-key";
export const BYOK_PROVIDER_HEADER = "x-model-provider";
export const STORAGE_PREFIX = "sim13.key.";

export function storageKeyFor(provider) {
  return `${STORAGE_PREFIX}${provider}`;
}

export function saveByoKey(storage, provider, key) {
  if (!storage || typeof storage.setItem !== "function") return false;
  if (!key) return false;
  storage.setItem(storageKeyFor(provider), key);
  return true;
}

export function loadByoKey(storage, provider) {
  if (!storage || typeof storage.getItem !== "function") return "";
  return storage.getItem(storageKeyFor(provider)) || "";
}

export function clearByoKey(storage, provider) {
  if (!storage || typeof storage.removeItem !== "function") return;
  storage.removeItem(storageKeyFor(provider));
}

export function hasByoKey(storage, provider) {
  return loadByoKey(storage, provider).length > 0;
}

// Resolve the key for one proxied request: the per-request header
// wins, else the server env key. Returns {key, from} where from is
// "byok" | "env" | null — the caller must never log `key`.
export function resolveProxyKey({ headers = {}, provider, env = {} }) {
  const byok = headers[BYOK_HEADER] || headers[BYOK_HEADER.toLowerCase()];
  if (typeof byok === "string" && byok.length > 0) {
    return { key: byok, from: "byok" };
  }
  const envName = provider === "baseten" ? "BASETEN_API_KEY" : "MODEL_API_KEY";
  const envKey = env[envName];
  if (typeof envKey === "string" && envKey.length > 0) {
    return { key: envKey, from: "env" };
  }
  return { key: null, from: null };
}

// Redact any header/secret-looking value from a log line or error
// body. The proxy runs every log and error through this.
export function redactSecrets(text, secrets = []) {
  let out = String(text ?? "");
  for (const s of secrets) {
    if (!s || typeof s !== "string" || s.length < 4) continue;
    out = out.split(s).join("[redacted]");
  }
  // Header dumps: x-model-key: <value> -> x-model-key: [redacted]
  out = out.replace(/("?x-model-key"?\s*[:=]\s*"?)[^"\s,}]+/gi, "$1[redacted]");
  out = out.replace(/(Bearer\s+)[A-Za-z0-9._~+/-]+/gi, "$1[redacted]");
  return out;
}

// Safe error for the browser: status + provider message snippet,
// key material stripped.
export function safeProxyError(err, secrets = []) {
  const httpStatus = (err && err.httpStatus) || null;
  const message = redactSecrets(
    (err && (err.providerMessage || err.message)) || "proxy error",
    secrets,
  ).slice(0, 300);
  return { ok: false, httpStatus, error: message };
}

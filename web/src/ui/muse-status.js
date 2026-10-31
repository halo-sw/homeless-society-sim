// 30b: one Muse-liveness source for the header badge and the chat.
//
// `GET {API_BASE}/api/model/status` is fetched once per page load
// (cached promise below); `museLive` is tri-state:
//   true  — LIVE_API and the server holds a Muse key;
//   false — no API base, or the server reports no key (rules answer);
//   null  — the status is still unknown.
// Pure (no React, no DOM); unit-tested.
import { LIVE_API } from "../paths.js";
import { fetchModelStatus } from "./consult-client.js";

// Said once per session on keyless servers (never per turn).
export const KEYLESS_LINE = "이 서버에는 Muse 키가 없어서 규칙으로 답해요. 숫자는 그대로 엔진이 계산해요";

// 30b: LIVE_API only means "an API base exists"; the key decides.
export function museLiveFromStatus(liveApi, status) {
  if (!liveApi) return false;
  if (!status || typeof status !== "object") return null;
  return (status.meta && status.meta.hasServerKey) === true;
}

// 30b: whether a turn may call /api/consult. Unknown (null) may call —
// a 503 no-key answer then flips the session to keyless.
export function shouldCallMuse({ museLive } = {}) {
  return museLive !== false;
}

// 30b: the server's no-key failure (HTTP 503 + "is not set"), as
// opposed to slowness or other errors (timeout, 500, …).
export function isNoKeyError(err) {
  if (!err || typeof err !== "object") return false;
  const status = err.httpStatus !== undefined ? err.httpStatus : err.status;
  if (status !== 503) return false;
  return String(err.message || "").includes("is not set");
}

// 30b: pure one-time keyless notice — two turns push the line once.
export function pushKeylessNotice(messages, noticed) {
  if (noticed) return { messages: messages || [], noticed: true };
  return {
    messages: [...(messages || []),
      { role: "system", kind: "system", content: KEYLESS_LINE }],
    noticed: true,
  };
}

// --- session singleton (one fetch per page load) ---
let current = LIVE_API ? null : false;
let statusCache = null;
let inflight = null;
const listeners = new Set();

export function getMuseLive() {
  return current;
}

export function getMuseStatus() {
  return statusCache;
}

export function subscribeMuseLive(fn) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function setMuseLive(value) {
  current = value;
  for (const fn of [...listeners]) {
    try {
      fn(value);
    } catch {
      /* one bad listener never breaks the badge */
    }
  }
  return value;
}

export function refreshMuseLive() {
  if (!LIVE_API) {
    setMuseLive(false);
    return Promise.resolve(false);
  }
  if (inflight) return inflight;
  inflight = fetchModelStatus().then((st) => {
    statusCache = st;
    inflight = null;
    return setMuseLive(museLiveFromStatus(true, st));
  }, () => {
    inflight = null;
    return current;
  });
  return inflight;
}

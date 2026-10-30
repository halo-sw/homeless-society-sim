// Chat URLs + transcript memory (12b, B). Pure except the guarded
// sessionStorage helpers (same-tab browser memory only; the server
// stores nothing). Routes:
//   /                 landing (no routing params)
//   /?chat=<first>     chat (first message carried in the URL)
//   /?chat=&area=<box> chat with the work-area scene on another box
//   ?mode=sim… / ?tour=demo deep links keep working (main.js).

import { appUrl, appUrlWith } from "../paths.js";

export const CHAT_STORE_KEY = "sim.chat.v1";

// Which search keys route to which screen.
export function routeForSearch(search) {
  const q = search instanceof URLSearchParams ? search : new URLSearchParams(search || "");
  if (q.has("chat")) return "chat";
  if (q.get("mode") === "sim") return "sim"; // ?tour=demo rides along (?mode=sim&tour=demo)
  if (q.has("mode") || q.has("tour")) return "tour";
  if (q.has("area") || q.has("time") || q.has("lens") || q.has("shot")) return "tour";
  return "landing";
}

export function parseChatSearch(search) {
  const q = search instanceof URLSearchParams ? search : new URLSearchParams(search || "");
  return {
    message: q.get("chat") || "",
    area: q.get("area") || "",
    ask: q.get("ask") || "",
  };
}

// First message → chat URL (the message rides in ?chat= so the first
// turn is deep-linkable; later turns live in session memory).
// Base-aware (22b): every link keeps the Pages base. The *With
// variants take an explicit base for tests.
function chatQuery(message, extra = {}) {
  const q = new URLSearchParams();
  q.set("chat", String(message || ""));
  for (const [k, v] of Object.entries(extra)) {
    if (v !== "" && v !== null && v !== undefined) q.set(k, String(v));
  }
  return q.toString();
}

export function chatUrlWith(base, message, extra = {}) {
  return appUrlWith(base, chatQuery(message, extra));
}

export function chatUrl(message, extra = {}) {
  return appUrl(chatQuery(message, extra));
}

// "대화" reopen from any screen: the transcript comes from session
// memory, so the URL stays clean.
export function chatReopenUrlWith(base) {
  return appUrlWith(base, "chat=");
}

export function chatReopenUrl() {
  return appUrl("chat=");
}

// "새로 시작": forget the transcript, back to the landing.
export function landingUrlWith(base) {
  return appUrlWith(base);
}

export function landingUrl() {
  return appUrl();
}

// 3D에서 보기: a moment in a committed scenario, or in a custom
// client-run simulation (?custom=<id> loads runs from IndexedDB).
// 18: carries an explicit style choice (both default to painted).
function simMomentQuery({ scenario = null, custom = null, home = "A", day = 1, t = "08:30", follow = 1, style = null } = {}) {
  const q = new URLSearchParams({ mode: "sim", home, day: String(day), t });
  if (follow) q.set("follow", String(follow));
  if (custom) q.set("custom", custom);
  else if (scenario) q.set("scenario", scenario);
  if (style) q.set("style", style);
  return q.toString();
}

export function simMomentUrlWith(base, opts = {}) {
  return appUrlWith(base, simMomentQuery(opts));
}

export function simMomentUrl({ scenario = null, custom = null, home = "A", day = 1, t = "08:30", follow = 1, style = null } = {}) {
  return appUrl(simMomentQuery({ scenario, custom, home, day, t, follow, style }));
}

export function parseSimSearch(search) {
  const q = search instanceof URLSearchParams ? search : new URLSearchParams(search || "");
  return {
    scenario: q.get("scenario") || "",
    custom: q.get("custom") || "",
    home: q.get("home") || "A",
    day: q.get("day") || "1",
    t: q.get("t") || "",
    follow: q.get("follow") || "0",
  };
}

// --- transcript memory ---------------------------------------------------------

export function saveTranscript(doc, storage = null) {
  try {
    const s = storage || (typeof sessionStorage !== "undefined" ? sessionStorage : null);
    if (!s) return false;
    s.setItem(CHAT_STORE_KEY, JSON.stringify(doc));
    return true;
  } catch {
    return false;
  }
}

export function loadTranscript(storage = null) {
  try {
    const s = storage || (typeof sessionStorage !== "undefined" ? sessionStorage : null);
    if (!s) return null;
    const raw = s.getItem(CHAT_STORE_KEY);
    if (!raw) return null;
    const doc = JSON.parse(raw);
    if (!doc || !Array.isArray(doc.messages)) return null;
    return doc;
  } catch {
    return null;
  }
}

export function clearTranscript(storage = null) {
  try {
    const s = storage || (typeof sessionStorage !== "undefined" ? sessionStorage : null);
    if (!s) return false;
    s.removeItem(CHAT_STORE_KEY);
    return true;
  } catch {
    return false;
  }
}

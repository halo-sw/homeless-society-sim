// Stage 23a: public relay for the static site (GitHub Pages has no
// server). One Vercel serverless function serves Muse chat and the
// VWorld tiles, keeping every key in its own env, never in the browser.
//
// Keys (MODEL_API_KEY, VWORLD_KEY, HOUSING_API_KEY) are read from env
// only, server-side. They never appear in a response body, a header,
// an error message or a log line. Tiles stream through and are never
// stored (Cache-Control: no-store). Public data is read over HTTP from
// the Pages site; this relay has no data dir and no file-system data.

import { serveTile } from "../web/src/aerial/proxy.js";
import { createConsultHandler, httpReadText, readBody } from "../web/src/consult/server.js";
import { VOICE_MAX_BYTES, createTranscribeHandler } from "../web/src/consult/voice.js";
import { BYOK_HEADER } from "../web/src/consult/byok.js";

const DEFAULT_ORIGINS = [
  "https://halo-sw.github.io",
  "http://127.0.0.1:48741",
  "http://localhost:5173",
];
const DEFAULT_DATA_BASE = "https://halo-sw.github.io/ithaca/";
const DAY_MS = 86400000;

function allowedOrigins(env) {
  const raw = env && env.ALLOWED_ORIGINS;
  if (typeof raw === "string" && raw.trim().length > 0) {
    const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (list.length > 0) return list;
  }
  return DEFAULT_ORIGINS.slice();
}

function reqHeader(req, name) {
  const h = req.headers || {};
  return h[name] || h[name.toLowerCase()] || null;
}

function clientKey(req) {
  const fwd = reqHeader(req, "x-forwarded-for");
  if (typeof fwd === "string" && fwd.length > 0) {
    return fwd.split(",")[0].trim() || "?";
  }
  const sock = req.socket && req.socket.remoteAddress;
  return sock || "?";
}

// Vercel rewrites /api/:path* to /api/relay?path=:path*: read path from
// the query when present, else use req.url's pathname. Normalise to
// /api/<path>.
function relayPath(req) {
  const raw = req.url || "/";
  let pathname = raw;
  let queryPath = null;
  try {
    const u = new URL(raw, "http://relay.local");
    pathname = u.pathname;
    queryPath = u.searchParams.get("path");
  } catch {
    pathname = String(raw).split("?")[0];
  }
  if (queryPath) return "/api/" + String(queryPath).replace(/^\/+/, "");
  if (pathname.startsWith("/api/")) return pathname;
  return "/api/" + pathname.replace(/^\/+/, "");
}

function isTilePath(path) {
  return path === "/api/tiles/status" || path === "/api/aerial/status"
    || path.startsWith("/api/tiles/") || path.startsWith("/api/aerial/");
}

// Fixed-window bucket: returns 0 and records the hit, or the seconds
// until the oldest hit leaves the window when over the limit.
function checkBucket(store, key, t, windowMs, max) {
  let hits = store.get(key);
  if (!hits) {
    hits = [];
    store.set(key, hits);
  }
  while (hits.length > 0 && hits[0] <= t - windowMs) hits.shift();
  if (hits.length >= max) {
    return Math.max(1, Math.ceil((hits[0] + windowMs - t) / 1000));
  }
  hits.push(t);
  return 0;
}

function checkGlobal(global, t, windowMs, max) {
  while (global.length > 0 && global[0] <= t - windowMs) global.shift();
  if (global.length >= max) {
    return Math.max(1, Math.ceil((global[0] + windowMs - t) / 1000));
  }
  global.push(t);
  return 0;
}

export function createRelay({ env = {}, fetchImpl = fetch, now = () => Date.now(), consultFactory = createConsultHandler } = {}) {
  const origins = allowedOrigins(env);
  // One consult handler per relay, not per request (it holds its caches).
  const consultHandler = consultFactory({
    dataDir: null,
    scenDir: null,
    rawDir: null,
    fetchImpl,
    env,
    readText: httpReadText(env.DATA_BASE_URL || DEFAULT_DATA_BASE, fetchImpl),
  });
  const consult10 = new Map();
  const consultDay = new Map();
  const consultGlobal = [];
  const tilesHour = new Map();
  // Voice transcribe: its own buckets (10 per 10 min, 40 per day per
  // client, 300 per day global), one handler per relay like consult.
  const transcribeHandler = createTranscribeHandler({ env, fetchImpl });
  const voice10 = new Map();
  const voiceDay = new Map();
  const voiceGlobal = [];

  // Raw (binary-safe) body read for the WAV upload: readBody() above
  // decodes text, which would corrupt audio bytes.
  function readRawBody(req) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let size = 0;
      req.on("data", (c) => {
        size += c.length;
        if (size > VOICE_MAX_BYTES) {
          reject(new Error("body too large"));
          if (typeof req.destroy === "function") req.destroy();
          return;
        }
        chunks.push(c);
      });
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
  }

  function corsHeaders(res, origin) {
    if (origin) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }
  }

  function sendJson(res, code, obj, origin) {
    res.statusCode = code;
    res.setHeader("Content-Type", "application/json");
    corsHeaders(res, origin);
    res.end(JSON.stringify(obj));
  }

  function sendOriginError(res) {
    res.statusCode = 403;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "origin" }));
  }

  function sendLimited(res, waitSec, origin) {
    res.statusCode = 429;
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Retry-After", String(waitSec));
    corsHeaders(res, origin);
    res.end(JSON.stringify({ ok: false, error: "rate_limited", retryAfterSec: waitSec }));
  }

  return async (req, res) => {
    const t = now();
    const origin = reqHeader(req, "origin");
    if (origin && !origins.includes(origin)) {
      sendOriginError(res);
      return;
    }
    const cors = origin || null;
    if ((req.method || "GET") === "OPTIONS") {
      res.statusCode = 204;
      if (cors) res.setHeader("Access-Control-Allow-Origin", cors);
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", `content-type, ${BYOK_HEADER}`);
      res.setHeader("Vary", "Origin");
      res.end();
      return;
    }
    const client = clientKey(req);
    const path = relayPath(req);

    if (isTilePath(path)) {
      if ((req.method || "GET") !== "GET") {
        sendJson(res, 405, { ok: false, error: "method" }, cors);
        return;
      }
      if (!origin) {
        // Tile <img> sends no Origin; allow it when the Referer is one
        // of ours (cross-origin <img> sends a Referer) or missing.
        const ref = String(reqHeader(req, "referer") || reqHeader(req, "referrer") || "");
        if (ref && !origins.some((o) => ref.startsWith(o))) {
          sendOriginError(res);
          return;
        }
      }
      const wait = checkBucket(tilesHour, client, t, 3600000, 4000);
      if (wait > 0) {
        sendLimited(res, wait, cors);
        return;
      }
      corsHeaders(res, cors);
      return serveTile({ path, env, fetchImpl, res });
    }

    if (path === "/api/model/status") {
      if ((req.method || "GET") !== "GET") {
        sendJson(res, 404, { ok: false, error: "not_found" }, cors);
        return;
      }
      // Booleans only — never key text.
      return sendJson(res, 200, {
        ok: true,
        meta: { hasServerKey: Boolean(env.MODEL_API_KEY) },
        voice: { hasServerKey: Boolean(env.MODEL_API_KEY) },
        baseten: { hasServerKey: false },
        recorded: { hasServerKey: true },
        relay: true,
      }, cors);
    }

    if (path === "/api/voice/transcribe") {
      if ((req.method || "GET") !== "POST") {
        sendJson(res, 405, { ok: false, error: "method" }, cors);
        return;
      }
      const over = Math.max(
        checkBucket(voice10, client, t, 600000, 10),
        checkBucket(voiceDay, client, t, DAY_MS, 40),
        checkGlobal(voiceGlobal, t, DAY_MS, 300),
      );
      if (over > 0) {
        sendLimited(res, over, cors);
        return;
      }
      // Buffer the WAV body once and hand it to the handler parked on
      // req.body so it is read exactly once.
      if (req.body === undefined || req.body === null) {
        try {
          req.body = await readRawBody(req);
        } catch {
          sendJson(res, 413, { ok: false, error: "too_large" }, cors);
          return;
        }
      } else if (typeof Buffer !== "undefined" && !Buffer.isBuffer(req.body)) {
        req.body = Buffer.from(String(req.body));
      }
      corsHeaders(res, cors);
      return transcribeHandler(req, res);
    }

    if (path === "/api/consult") {
      const over = Math.max(
        checkBucket(consult10, client, t, 600000, 20),
        checkBucket(consultDay, client, t, DAY_MS, 100),
        checkGlobal(consultGlobal, t, DAY_MS, 600),
      );
      if (over > 0) {
        sendLimited(res, over, cors);
        return;
      }
      // Peek at the provider so non-BYOK browsers stay on the recorded
      // demo path: without the BYOK header only "meta" (or missing) is
      // allowed. Buffer the body once and hand it to the handler parked
      // on req.body so it is read exactly once.
      let provider;
      try {
        const raw = await readBody(req);
        try {
          provider = JSON.parse(raw).provider;
        } catch {
          provider = undefined;
        }
        req.body = raw;
      } catch {
        provider = undefined;
      }
      const byok = reqHeader(req, BYOK_HEADER);
      if (!byok && provider !== undefined && provider !== "meta") {
        sendJson(res, 400, { ok: false, error: "provider" }, cors);
        return;
      }
      corsHeaders(res, cors);
      return consultHandler(req, res);
    }

    sendJson(res, 404, { ok: false, error: "not_found" }, cors);
  };
}

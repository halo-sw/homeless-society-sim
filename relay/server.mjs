// Stage 30a: standalone relay server for `docker compose up` and for
// `npm run relay`. A plain node:http server around createRelay; the
// browser app (web/dist) talks to it at VITE_API_BASE. No dependencies
// beyond node itself. Env values are never printed: the startup line
// reports only which key names are present, as booleans.

import http from "node:http";
import { pathToFileURL } from "node:url";
import { createRelay } from "./handler.js";

const KEY_NAMES = ["META_API_KEY", "MODEL_API_KEY", "VWORLD_KEY", "HOUSING_API_KEY"];
const DEFAULT_PORT = 8787;

function resolvePort(port, env) {
  if (port !== undefined && port !== null && port !== "") return Number(port);
  const raw = env ? env.PORT : undefined;
  if (raw !== undefined && raw !== null && raw !== "") return Number(raw);
  return DEFAULT_PORT;
}

// Build the server without listening (lets tests drive it via
// server.emit("request", req, res) where bind is blocked).
export function createRelayServer({ env = process.env } = {}) {
  const relay = createRelay({ env });
  const server = http.createServer((req, res) => {
    Promise.resolve(relay(req, res)).catch(() => {
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
      }
      try {
        res.end(JSON.stringify({ ok: false, error: "internal" }));
      } catch {
        // The socket is already gone; nothing left to do.
      }
    });
  });
  return { server };
}

export function startRelayServer({ port, env = process.env, host } = {}) {
  const listenPort = resolvePort(port, env);
  const listenHost = host || (env && env.HOST) || "0.0.0.0";
  const { server } = createRelayServer({ env });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(listenPort, listenHost, () => {
      const actual = server.address() && server.address().port;
      const present = {};
      for (const name of KEY_NAMES) present[name] = Boolean(env && env[name]);
      console.log(JSON.stringify({ relay: true, port: actual, keys: present }));
      resolve({ server, port: actual });
    });
  });
}

const invokedAsMain = (() => {
  try {
    return import.meta.url === pathToFileURL(process.argv[1]).href;
  } catch {
    return false;
  }
})();

if (invokedAsMain) {
  startRelayServer().catch((err) => {
    console.error(String((err && err.message) || err));
    process.exitCode = 1;
  });
}

// Stage 30a: text checks for the docker workspace (no Docker in the
// sandbox) plus an in-process start of relay/server.mjs. No network:
// the status route never fetches.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import http from "node:http";
import { createRelayServer, startRelayServer } from "../../relay/server.mjs";

function mockRes() {
  let resolve;
  const done = new Promise((r) => { resolve = r; });
  const res = {
    statusCode: 200,
    headers: {},
    chunks: [],
    setHeader(k, v) { res.headers[String(k).toLowerCase()] = v; },
    end(chunk) {
      if (chunk !== undefined) res.chunks.push(Buffer.from(chunk));
      resolve(res);
    },
  };
  return { res, done };
}

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const read = (name) => readFileSync(join(ROOT, name), "utf8");

describe("30a docker workspace", () => {
  it("Dockerfile builds the site like pages.yml and exposes both ports", () => {
    const text = read("Dockerfile");
    assert.match(text, /FROM node:22/, "FROM node:22");
    assert.match(text, /vite build/, "vite build");
    assert.match(text, /runtime-data\.tgz/, "runtime-data.tgz");
    assert.match(text, /EXPOSE 8080/, "EXPOSE 8080");
    assert.match(text, /EXPOSE 8787/, "EXPOSE 8787");
  });

  it("compose has web and relay services and no literal key value", () => {
    const text = read("docker-compose.yml");
    assert.match(text, /^services:/m, "services block");
    assert.match(text, /^ {2}web:/m, "web service");
    assert.match(text, /^ {2}relay:/m, "relay service");
    for (const line of text.split("\n")) {
      if (/[A-Za-z_]{2,}=\S{8,}/.test(line)) {
        assert.match(line, /\$\{/, `literal value without \${...}: ${line}`);
      }
    }
  });

  it(".dockerignore keeps raw/built data and .env out of the build", () => {
    const text = read(".dockerignore");
    assert.match(text, /data\/raw/, "data/raw");
    assert.match(text, /data\/build/, "data/build");
    assert.match(text, /^\.env$/m, ".env");
  });

  it("root npm test reaches web's tests", () => {
    const pkg = JSON.parse(read("package.json"));
    assert.ok(pkg.private, "private");
    assert.match(String(pkg.scripts && pkg.scripts.test), /web/, "test script mentions web");
  });

  it("relay server answers /api/model/status with hasServerKey false on empty env", async () => {
    // No listen: drive server.mjs's own wiring via emit (the sandbox
    // blocks bind entirely, and relay-23a already covers the handler).
    const { server } = createRelayServer({ env: {} });
    const { res, done } = mockRes();
    server.emit("request",
      { method: "GET", url: "/api/model/status", headers: {}, socket: {} },
      res);
    const finished = await done;
    assert.equal(finished.statusCode, 200);
    const json = JSON.parse(Buffer.concat(finished.chunks).toString("utf8"));
    assert.equal(json.ok, true);
    assert.equal(json.meta.hasServerKey, false);
    await new Promise((resolve) => server.close(resolve));
  });

describe("30d docker compose smoke in CI", () => {
  it("ci has a docker job that builds and starts the compose stack", () => {
    const text = read(".github/workflows/ci.yml");
    assert.match(text, /docker compose build/, "docker compose build");
    assert.match(text, /docker compose up -d/, "docker compose up -d");
  });

  it("ci curls 8080 and /api/model/status on 8787", () => {
    const text = read(".github/workflows/ci.yml");
    assert.match(text, /localhost:8080/, "curls 8080");
    assert.match(text, /localhost:8787\/api\/model\/status/, "/api/model/status on 8787");
  });

  it("ci runs docker compose down under if: always()", () => {
    const text = read(".github/workflows/ci.yml");
    assert.match(text, /if:\s*always\(\)\s*\n\s*run:\s*docker compose down/, "down under if: always()");
  });

  it("existing web and pipeline jobs are still present", () => {
    const text = read(".github/workflows/ci.yml");
    assert.match(text, /^ {2}web:/m, "web job");
    assert.match(text, /^ {2}pipeline:/m, "pipeline job");
    assert.match(text, /npm ci/, "npm ci");
    assert.match(text, /pytest/, "pytest");
  });
});

  it("relay server starts on port 0 and closes (skips where bind is blocked)", async (t) => {
    let started;
    try {
      started = await startRelayServer({ port: 0, env: {}, host: "127.0.0.1" });
    } catch (err) {
      if (err && (err.code === "EPERM" || err.code === "EACCES")) {
        t.skip("sandbox blocks bind; exercised outside the sandbox");
        return;
      }
      throw err;
    }
    const { server, port } = started;
    try {
      const { statusCode, body } = await new Promise((resolve, reject) => {
        const req = http.get({ host: "127.0.0.1", port, path: "/api/model/status" }, (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => resolve({ statusCode: res.statusCode, body: Buffer.concat(chunks).toString("utf8") }));
        });
        req.on("error", reject);
      });
      assert.equal(statusCode, 200);
      const json = JSON.parse(body);
      assert.equal(json.ok, true);
      assert.equal(json.meta.hasServerKey, false);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

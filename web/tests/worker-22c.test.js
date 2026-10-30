// 22c: the chat's 30-day run worker must be bundled in production builds.
// Vite only bundles a worker written literally as
// new Worker(new URL("…", import.meta.url), { type: "module" }).
// A bare new URL("../sim-worker.js", import.meta.url) becomes an inlined
// data: URL whose imports cannot resolve, so the worker errors immediately.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createWorkerRunner } from "../src/chat/engine.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..");
const SRC = join(WEB, "src");

function walkJs(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walkJs(p));
    else if (/\.jsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

describe("22c worker bundling pins", () => {
  it("chat.jsx builds the sim worker with literal new Worker(new URL(...))", () => {
    const body = readFileSync(join(SRC, "ui/chat.jsx"), "utf8");
    assert.ok(
      body.includes('new Worker(new URL("../sim-worker.js", import.meta.url)'),
      "chat.jsx must pass () => new Worker(new URL(...sim-worker.js...), { type: \"module\" })",
    );
  });

  it("no worker new URL() stands outside a new Worker() call in src/", () => {
    const bad = [];
    for (const f of walkJs(SRC)) {
      const lines = readFileSync(f, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (/new URL\([^)]*worker/i.test(line) && !/new Worker\(\s*new URL\(/.test(line)) {
          bad.push(`${f.replace(SRC + "/", "")}:${i + 1}: ${line.trim()}`);
        }
      });
    }
    assert.deepEqual(bad, [], `worker URLs outside new Worker():\n${bad.join("\n")}`);
  });

  it("createWorkerRunner(factory) resolves with the posted runs", async () => {
    const seen = [];
    class FakeWorker {
      postMessage(msg) {
        seen.push(msg);
        setImmediate(() => this.onmessage({ data: { ok: true, runs: { A: { id: "A" } } } }));
      }
      terminate() {}
    }
    const runner = createWorkerRunner(() => new FakeWorker());
    const progress = [];
    const runs = await runner({ scen: 1 }, ["A"], (p) => progress.push(p));
    assert.deepEqual(runs, { A: { id: "A" } });
    assert.deepEqual(seen.map((m) => m.labels), [["A"]]);
    assert.equal(seen[0].scenarioInline.scen, 1);
  });

  it("production bundle holds sim-worker chunk, no base64 worker URL", {
    skip: process.env.CHECK_BUILD !== "1" ? "set CHECK_BUILD=1 to verify dist/" : false,
  }, async () => {
    const dir = join(WEB, "dist", "assets");
    if (!existsSync(dir) || !readdirSync(dir).some((f) => /^sim-worker-.*\.js$/.test(f))) {
      execFileSync("npx", ["vite", "build"], { cwd: WEB, stdio: "pipe", timeout: 240000 });
    }
    const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
    assert.ok(files.length > 0, "a built bundle exists");
    assert.ok(files.some((f) => /^sim-worker-.*\.js$/.test(f)), "bundled sim-worker-*.js exists");
    for (const f of files) {
      const body = readFileSync(join(dir, f), "utf8");
      assert.ok(!body.includes("data:text/javascript;base64"), `${f}: no base64 worker URL`);
      assert.ok(!body.includes("data:application/javascript;base64"), `${f}: no base64 worker URL`);
    }
  });
});

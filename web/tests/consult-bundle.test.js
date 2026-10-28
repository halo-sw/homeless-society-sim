import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WEB = join(HERE, "..");

// Server modules (keys, providers, engine tools) must never be reachable
// from browser code: neither statically imported nor present in the bundle.
const SERVER_MODULE = /(?:^|\/)consult\/(tools|agent|server|guards)|judge\/(providers|run|context|guards)/;

async function browserFiles() {
  const out = ["src/main.js"];
  for (const f of await readdir(join(WEB, "src", "ui"))) out.push(`src/ui/${f}`);
  return out;
}

describe("consult bundle hygiene", () => {
  it("browser code imports no server modules", async () => {
    for (const f of await browserFiles()) {
      const text = await readFile(join(WEB, f), "utf8");
      for (const line of text.split("\n")) {
        if (/^\s*import[ (]/.test(line) || /from\s+["']/.test(line)) {
          assert.ok(!SERVER_MODULE.test(line), `${f}: ${line.trim()}`);
        }
      }
    }
  });

  it("production bundle contains no keys or provider URLs", async (t) => {
    let files;
    try {
      files = (await readdir(join(WEB, "dist", "assets")))
        .filter((f) => f.endsWith(".js"));
    } catch {
      t.skip("web/dist absent (run npm run build first)");
      return;
    }
    assert.ok(files.length > 0, "expected built assets");
    for (const f of files) {
      const text = await readFile(join(WEB, "dist", "assets", f), "utf8");
      assert.ok(!text.includes("MODEL_API_KEY"), f);
      assert.ok(!text.includes("BASETEN_API_KEY"), f);
      assert.ok(!text.includes("api.meta.ai"), f);
      assert.ok(!text.includes("inference.baseten.co"), f);
    }
  });
});

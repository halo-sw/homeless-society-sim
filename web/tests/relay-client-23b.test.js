// 23b: the public site talks to the relay (VITE_API_BASE).
//
// - apiUrlWith(base, p) joins the relay origin with the /api/* path.
// - consult-client.js, drape.js and chat.jsx gate on LIVE_API (not
//   STATIC_SITE); no fetch("/api/ literal is left in consult-client.js
//   or drape.js (they use apiUrl(...)).
// - main.js still gates /api/judge on STATIC_SITE (judging stays
//   recorded/rule on the public site).
// - pages.yml builds with VITE_API_BASE=https://ithaca-relay.vercel.app.
// - relay/build.mjs pins the Seoul region (icn1).
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { apiUrlWith } from "../src/paths.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");
const ROOT = join(HERE, "..", "..");

async function src(rel) {
  return readFile(join(SRC, rel), "utf8");
}

describe("23b apiUrlWith", () => {
  it("joins the relay origin with the path", () => {
    assert.equal(apiUrlWith("https://r.example", "/api/consult"),
      "https://r.example/api/consult");
  });
  it("stays same-origin for an empty base", () => {
    assert.equal(apiUrlWith("", "api/x"), "/api/x");
  });
});

describe("23b source pins", () => {
  it("consult-client.js gates on LIVE_API, not STATIC_SITE", async () => {
    const text = await src("ui/consult-client.js");
    assert.ok(text.includes("LIVE_API"), "uses LIVE_API");
    assert.ok(!text.includes("STATIC_SITE"), "no STATIC_SITE gate");
    assert.ok(!/fetch\(\s*["'`]\/api\//.test(text), "no fetch(\"/api/ literal");
    assert.ok(text.includes('fetch(apiUrl("/api/consult")'), "consult via apiUrl");
    assert.ok(text.includes('fetch(apiUrl("/api/model/status"))'), "status via apiUrl");
  });
  it("429 maps to the busy message with httpStatus 429", async () => {
    const text = await src("ui/consult-client.js");
    assert.ok(text.includes("잠시 쉬었다가 다시 물어봐 주세요 (요청이 많아요)"), "429 message");
    assert.ok(text.includes("err.httpStatus = 429"), "httpStatus 429");
  });
  it("drape.js gates on LIVE_API, not STATIC_SITE", async () => {
    const text = await src("aerial/drape.js");
    assert.ok(text.includes("LIVE_API"), "uses LIVE_API");
    assert.ok(!text.includes("STATIC_SITE"), "no STATIC_SITE gate");
    assert.ok(!/fetch\(\s*["'`]\/api\//.test(text), "no fetch(\"/api/ literal");
    assert.ok(!/fetch\(\s*`\/api\//.test(text), "no fetch(`/api/ literal");
  });
  it("chat.jsx gates the live agent on LIVE_API", async () => {
    const text = await src("ui/chat.jsx");
    assert.ok(text.includes("LIVE_API"), "uses LIVE_API");
    assert.ok(!text.includes("STATIC_SITE"), "no STATIC_SITE gate");
  });
  it("main.js still gates /api/judge on STATIC_SITE", async () => {
    const text = await src("main.js");
    assert.ok(text.includes("if (STATIC_SITE) return;"), "judge stays STATIC_SITE");
    assert.ok(text.includes("/api/judge"), "/api/judge call");
  });
  it("model-panel shows the relay key line", async () => {
    const text = await src("ui/model-panel.jsx");
    assert.ok(text.includes("공개 사이트: 중계 서버가 키를 대신 들고 있어요 (브라우저엔 키가 없어요)"),
      "relay line");
  });
});

describe("23b workflow + relay region", () => {
  it("pages.yml builds with the relay origin", async () => {
    const yml = await readFile(join(ROOT, ".github", "workflows", "pages.yml"), "utf8");
    assert.ok(yml.includes("VITE_API_BASE=https://ithaca-relay.vercel.app"), "VITE_API_BASE");
  });
  it("relay/build.mjs pins icn1", async () => {
    const build = await readFile(join(ROOT, "relay", "build.mjs"), "utf8");
    assert.ok(build.includes("icn1"), "icn1");
  });
});

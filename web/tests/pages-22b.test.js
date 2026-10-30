// 22b: every in-app link keeps the Pages base.
//
// - appUrl(query) returns BASE when the query is empty, else BASE?query.
//   appUrlWith(base, query) is the injectable pure form used by tests.
// - The chat/urls.js and demotour.js builders give base-relative output
//   when the base is injected (the *With variants); with the default
//   base "/" the strings stay exactly as before.
// - Source pin: no file under web/src/ builds a root-absolute app link.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

import { appUrl, appUrlWith, publicUrlWith } from "../src/paths.js";
import { chatUrl, chatUrlWith, chatReopenUrl, chatReopenUrlWith,
  landingUrl, landingUrlWith, simMomentUrl, simMomentUrlWith } from "../src/chat/urls.js";
import { tourStepUrl, tourStepUrlWith, tourSkipUrl, tourSkipUrlWith } from "../src/ui/demotour.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const SRC = join(HERE, "..", "src");

let momentRowUrl;
before(async () => {
  ({ momentRowUrl } = await import("../src/ui/chat.jsx"));
});

async function jsFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...await jsFiles(full));
    else if (/\.(js|jsx)$/.test(e.name)) out.push(full);
  }
  return out;
}

describe("22b appUrl", () => {
  it("prefixes the Pages base before the query", () => {
    assert.equal(appUrlWith("/homeless-society-sim/", "chat=x"),
      "/homeless-society-sim/?chat=x");
  });
  it("returns the bare base for an empty query", () => {
    assert.equal(appUrlWith("/homeless-society-sim/", ""), "/homeless-society-sim/");
  });
  it("keeps the old strings with the default base", () => {
    assert.equal(appUrl("chat=x"), "/?chat=x");
    assert.equal(appUrl(), "/");
  });
  it("share links are the full public URL: origin + appUrl", () => {
    assert.equal(publicUrlWith("https://user.github.io", "/homeless-society-sim/", "chat=x"),
      "https://user.github.io/homeless-society-sim/?chat=x");
  });
});

describe("22b builders keep the base", () => {
  it("chat urls carry the injected base", () => {
    assert.equal(chatUrlWith("/homeless-society-sim/", "hi"),
      "/homeless-society-sim/?chat=hi");
    assert.equal(chatReopenUrlWith("/homeless-society-sim/"),
      "/homeless-society-sim/?chat=");
    assert.equal(landingUrlWith("/homeless-society-sim/"), "/homeless-society-sim/");
  });
  it("sim moment urls carry the injected base", () => {
    const u = simMomentUrlWith("/homeless-society-sim/",
      { scenario: "demo-two-homes", home: "A", day: 1, t: "08:21", follow: 1 });
    assert.equal(u,
      "/homeless-society-sim/?mode=sim&home=A&day=1&t=08%3A21&follow=1&scenario=demo-two-homes");
  });
  it("tour urls carry the injected base", () => {
    const step = tourStepUrlWith("/homeless-society-sim/", 0, "");
    assert.ok(step.startsWith("/homeless-society-sim/?tour=demo&step=0"), step);
    assert.equal(tourSkipUrlWith("/homeless-society-sim/", ""), "/homeless-society-sim/");
  });
  it("default-base output is unchanged (old tests keep passing)", () => {
    assert.equal(chatUrl("hi"), "/?chat=hi");
    assert.equal(chatReopenUrl(), "/?chat=");
    assert.equal(landingUrl(), "/");
    assert.ok(tourStepUrl(0, "").startsWith("/?tour=demo&step=0"));
    const q = new URL(simMomentUrl(
      { scenario: "s", home: "A", day: 1, t: "08:21", follow: 1 }), "http://x").searchParams;
    assert.equal(q.get("scenario"), "s");
  });
  it("moment 3D links keep the base through simMomentUrl", () => {
    const runs = { A: { agents: [{ key: "h1", household: true }] } };
    const t = { home: "A", day: 2, minute: 1068, agent: "h1",
      when_ko: "3일차 17:48", text_ko: "장보기" };
    const q = new URL(momentRowUrl(t, { custom: "c1", runs }), "http://x").searchParams;
    assert.equal(q.get("day"), "3");
    assert.equal(q.get("custom"), "c1");
  });
});

describe("22b source pin", () => {
  it("no file under web/src/ builds a root-absolute app link", async () => {
    const bad = [];
    for (const f of await jsFiles(SRC)) {
      const text = await readFile(f, "utf8");
      if (/`\/\?/.test(text) || /"\/\?/.test(text) || /'\/\?/.test(text)
        || /window\.location\.href = ["']\/["']/.test(text)) {
        bad.push(relative(ROOT, f));
      }
    }
    assert.deepEqual(bad, []);
  });
});

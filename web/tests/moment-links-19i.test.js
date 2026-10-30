// 19i: each 살아-보니 row's "3D로 보기" opens its own moment (day,
// time, person) — not the per-home first outing. Older recorded
// payloads without day/minute fall back to the first outing.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

let momentRowUrl;

before(async () => {
  ({ momentRowUrl } = await import("../src/ui/chat.jsx"));
});

function urlOf(u) {
  return new URL(u, "http://x");
}

describe("momentRowUrl (19i)", () => {
  it("opens the moment itself: 3일차 17:48 h1 → day=3, t=17:48, follow=1", () => {
    const runs = { A: { agents: [
      { key: "h1", household: true },
      { key: "h2", household: true },
    ] } };
    const t = { home: "A", day: 2, minute: 1068, agent: "h1",
      when_ko: "3일차 17:48", text_ko: "장보기 A 7번 vs B 3번" };
    const q = urlOf(momentRowUrl(t, { custom: "c1", scenario: null, runs })).searchParams;
    assert.equal(q.get("home"), "A");
    assert.equal(q.get("day"), "3");
    assert.equal(q.get("t"), "17:48");
    assert.equal(q.get("follow"), "1");
    assert.equal(q.get("custom"), "c1");
  });

  it("follow is the agent's 1-based slot among household agents", () => {
    const runs = { A: { agents: [
      { key: "h1", household: true },
      { key: "h2", household: true },
    ] } };
    const t = { home: "A", day: 2, minute: 1068, agent: "h2",
      when_ko: "3일차 17:48", text_ko: "장보기" };
    const q = urlOf(momentRowUrl(t, { custom: "c1", runs })).searchParams;
    assert.equal(q.get("follow"), "2");
  });

  it("missing day falls back to the first-outing moment", () => {
    const t = { home: "A", when_ko: "3일차 17:48", text_ko: "장보기" };
    const q = urlOf(momentRowUrl(t, { custom: "c1",
      fallback: { label: "A", day: 1, t: "07:49", follow: 1 } })).searchParams;
    assert.equal(q.get("home"), "A");
    assert.equal(q.get("day"), "1");
    assert.equal(q.get("t"), "07:49");
    assert.equal(q.get("follow"), "1");
  });

  it("returns null when there is nothing to link to", () => {
    assert.equal(
      momentRowUrl({ home: "A", when_ko: "…", text_ko: "…" }, { custom: "c1" }),
      null);
    assert.equal(momentRowUrl(null, { custom: "c1" }), null);
  });
});

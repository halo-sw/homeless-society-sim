// 27b2: every message goes to Muse; live ▸ rows; panels/picks; next-step
// chips (SSR, no DOM, no data/build needed).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

describe("27b2 chat goes to Muse (SSR, no DOM)", () => {
  let parseNdjson;
  let routeTurn;
  let liveRowLine;
  let uiEffects;
  let chipsForLatest;
  let formatAgentContext;

  before(async () => {
    ({ parseNdjson } = await import("../src/ui/consult-client.js"));
    ({ routeTurn, liveRowLine, uiEffects, chipsForLatest } =
      await import("../src/ui/chat.jsx"));
    ({ formatAgentContext } = await import("../src/consult/agent.js"));
  });

  it("parses NDJSON across chunk boundaries", () => {
    const r1 = parseNdjson("", '{"type":"tool_start","name":"find_homes"}\n{"type":"do');
    assert.equal(r1.events.length, 1);
    assert.equal(r1.events[0].type, "tool_start");
    assert.equal(r1.rest, '{"type":"do');
    const r2 = parseNdjson(r1.rest, 'ne"}\n');
    assert.equal(r2.events.length, 1);
    assert.equal(r2.events[0].type, "done");
  });

  it("routes to the agent only when live and Muse is up", () => {
    assert.equal(routeTurn({ live: true, museDown: false }), "agent");
    assert.equal(routeTurn({ live: true, museDown: true }), "local");
    assert.equal(routeTurn({ live: false, museDown: false }), "local");
  });

  it("builds live tool-row lines", () => {
    assert.ok(liveRowLine({ name: "find_homes", pending: true }).includes("후보 찾기 중"));
    const done = liveRowLine({ name: "find_homes", pending: false, ok: true, summary: "41곳" });
    assert.ok(done.includes("✓"), "check mark");
    assert.ok(done.includes("41곳"), "summary");
    assert.ok(liveRowLine({ name: "find_homes", pending: false, ok: false, summary: "x" }).includes("✕"));
  });

  it("maps Muse ui actions to effects", () => {
    assert.deepEqual(uiEffects([{ action: "panel", panel: "map" }], {}), [{ type: "work" }]);
    assert.deepEqual(uiEffects([{ action: "panel", panel: "money" }], {}),
      [{ type: "work" }, { type: "tab", tab: "money" }]);
    assert.deepEqual(
      uiEffects([{ action: "pick", ids: ["hx", "h1"] }], { candidateIds: ["h1"] }),
      [{ type: "pick", ids: ["h1"] }]);
    assert.deepEqual(
      uiEffects([{ action: "pick", ids: ["h1", "h2"] }, { action: "run" }],
        { candidateIds: ["h1", "h2"], pickCount: 0 }),
      [{ type: "pick", ids: ["h1", "h2"] }, { type: "run" }]);
    assert.deepEqual(uiEffects([{ action: "run" }], { candidateIds: [], pickCount: 0 }),
      [{ type: "say", text: "먼저 두 곳을 찜해 주세요." }]);
  });

  it("prefers Muse suggestions over rule chips", () => {
    const fallback = ["a", "b"];
    assert.deepEqual(
      chipsForLatest(
        [{ role: "user", content: "q" },
          { role: "assistant", content: "a", suggestions: ["다음1", "다음2"] }],
        fallback),
      ["다음1", "다음2"]);
    assert.deepEqual(
      chipsForLatest([{ role: "assistant", content: "a" }], fallback), fallback);
  });

  it("tells Muse the live candidates and picks", () => {
    const line = formatAgentContext({
      candidates: [{ id: "h1", name: "가나", price: 2e8, commute_min: 18 }],
      picks: ["h1"],
    });
    assert.ok(line.includes("h1"), "candidate id");
    assert.ok(line.includes("찜"), "picks");
  });
});

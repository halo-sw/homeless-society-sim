// 27c2: neighborhood tool (real walk minutes to a candidate) + pending
// scene resolution (tour / commute / result) + labelled picks context.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

import { tinyArea, tinyScenario, NODES } from "./engine-fixture.js";
import { createSession, callTool } from "../src/consult/tools.js";

describe("27c2 neighborhood tool + scene resolution", () => {
  let summarizeToolCall;
  let formatAgentContext;
  let sceneForEffect;
  let latestDoneRun;

  before(async () => {
    ({ summarizeToolCall, formatAgentContext } =
      await import("../src/consult/agent.js"));
    ({ sceneForEffect, latestDoneRun } = await import("../src/ui/chat.jsx"));
  });

  const sessionWith = (candidates) => createSession({
    scenario: tinyScenario({ days: 2, background: 0 }),
    loadArea: async () => tinyArea(),
    loadAreasIndex: async () => ({ areas: [{ id: "tiny", label: "Tiny" }] }),
    context: { candidates },
  });

  it("reports real walk minutes per category for a candidate", async () => {
    const [lon, lat] = NODES.a;
    const r = await callTool(
      sessionWith([{ id: "h1", name: "가나", scene: "tiny", lon, lat }]),
      "neighborhood", { candidate_id: "h1" });
    assert.equal(r.ok, true);
    assert.equal(r.candidate_id, "h1");
    assert.ok(Array.isArray(r.nearest) && r.nearest.length > 0, "hits");
    for (const n of r.nearest) {
      assert.ok(Number.isFinite(n.minutes), `${n.category} minutes`);
      assert.ok(n.category_ko, "korean label");
    }
    assert.ok(r.nearest.some((n) => n.category === "station"), "station");
  });

  it("fails for an unknown candidate or a sceneless home", async () => {
    const [lon, lat] = NODES.a;
    const s = sessionWith([{ id: "h1", name: "가나", scene: "tiny", lon, lat }]);
    const unknown = await callTool(s, "neighborhood", { candidate_id: "hx" });
    assert.equal(unknown.ok, false);
    const noScene = await callTool(
      sessionWith([{ id: "h1", name: "가나", lon, lat }]),
      "neighborhood", { candidate_id: "h1" });
    assert.equal(noScene.ok, false);
  });

  it("summarizes the neighborhood call", () => {
    const { summary } = summarizeToolCall("neighborhood", { candidate_id: "h1" },
      { ok: true, nearest: [
        { category: "station", category_ko: "역", minutes: 3.2 },
        { category: "supermarket", category_ko: "마트", minutes: 5 },
        { category: "convenience", category_ko: "편의점", minutes: 1.5 },
        { category: "park", category_ko: "공원", minutes: 2 },
      ] });
    assert.ok(summary.startsWith("동네:"), summary);
    assert.ok(summary.includes("역 3.2분"), summary);
  });

  it("resolves tour scenes by candidate, letter, or first pick", () => {
    const candidates = [
      { id: "h1", name: "가나", scene: "pangyo" },
      { id: "h2", name: "다라", scene: "seongsu" },
      { id: "h3", name: "마바", scene: null },
    ];
    const byId = sceneForEffect(
      { panel: "tour", candidate_id: "h2" },
      { picks: ["h1", "h2"], candidates });
    assert.ok(byId.url.includes("area="), byId.url);
    assert.ok(byId.url.includes("embed=1"), byId.url);
    assert.ok(byId.url.includes("seongsu"), byId.url);
    const byLetter = sceneForEffect(
      { panel: "tour", home: "B" },
      { picks: ["h1", "h2"], candidates });
    assert.ok(byLetter.url.includes("seongsu"), byLetter.url);
    const noScene = sceneForEffect(
      { panel: "tour", candidate_id: "h3" },
      { picks: ["h3"], candidates });
    assert.ok(noScene.say, "spoken fallback");
  });

  it("opens commute scenes only after a done run", () => {
    const needRun = sceneForEffect({ panel: "commute", home: "A" },
      { picks: ["h1"], candidates: [], latestRun: null });
    assert.ok(needRun.say, "spoken fallback");
    const open = sceneForEffect({ panel: "commute", home: "A" },
      { picks: ["h1"], candidates: [],
        latestRun: { customId: "c1",
          moments: [{ label: "A", day: 2, t: "08:10", follow: 1 }] } });
    assert.ok(open.url.includes("custom="), open.url);
    assert.ok(open.url.includes("embed=1"), open.url);
    assert.equal(open.title, "A 출근길");
  });

  it("finds the newest done simulation run", () => {
    const run = latestDoneRun([
      { kind: "simulation", data: { status: "running" } },
      { kind: "simulation",
        data: { status: "done", customId: "c1", moments: [{ label: "A" }] } },
      { kind: "text", content: "hi" },
    ]);
    assert.equal(run.customId, "c1");
    assert.equal(latestDoneRun([{ kind: "text" }]), null);
  });

  it("labels picks and still reads the old shape", () => {
    const line = formatAgentContext({ picks: [{ label: "A", id: "h1" }] });
    assert.ok(line.includes("A=h1"), line);
    const old = formatAgentContext({ picks: ["h1"] });
    assert.ok(old.includes("h1"), old);
    assert.ok(old.includes("찜"), old);
  });
});

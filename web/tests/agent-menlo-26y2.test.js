// Stage 26y2 — Muse knows Menlo Park is covered. node --test, no network.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { SYSTEM_PROMPT, ENGLISH_NOTE } from "../src/consult/agent.js";
import { callTool, createSession } from "../src/consult/tools.js";

const META_SENTENCE = "I work at Meta HQ in Menlo Park, renting alone, up to $5,000 a month";
const PANGYO_SENTENCE = "판교로 출근하는 신입, 전세 2억 이하, 혼자 살아요";

function session(over = {}) {
  return createSession({
    scenario: { name: "t", household: { members: [] }, homes: [] },
    loadArea: async () => ({ graph: null, pois: [] }),
    ...over,
  });
}

describe("26y2 Menlo Park is covered", () => {
  it("SYSTEM_PROMPT names Menlo Park and find_homes", () => {
    const joined = Array.isArray(SYSTEM_PROMPT) ? SYSTEM_PROMPT.join("\n") : String(SYSTEM_PROMPT);
    assert.ok(joined.includes("Menlo Park"));
    assert.ok(joined.includes("find_homes"));
  });

  it("list_areas without an index contains us-menlo", async () => {
    const r = await callTool(session(), "list_areas", {});
    assert.equal(r.ok, true);
    assert.ok(r.areas.some((a) => a.id === "us-menlo"));
  });

  it("list_areas with an index contains us-menlo", async () => {
    const s = session({
      loadAreasIndex: async () => ({ areas: [{ id: "pangyo", label: "판교" }] }),
    });
    const r = await callTool(s, "list_areas", {});
    assert.equal(r.ok, true);
    assert.ok(r.areas.some((a) => a.id === "us-menlo"));
  });

  it("extract_profile on the Meta HQ sentence points at find_homes", async () => {
    const r = await callTool(session(), "extract_profile", { text: META_SENTENCE });
    assert.equal(r.ok, true);
    assert.ok(typeof r.next === "string" && r.next.includes("find_homes"));
  });

  it("extract_profile on the Pangyo sentence has no find_homes next", async () => {
    const r = await callTool(session(), "extract_profile", { text: PANGYO_SENTENCE });
    assert.equal(r.ok, true);
    assert.ok(!r.next || !String(r.next).includes("find_homes"));
  });
});

describe("26y3 English note: no Korean for US places", () => {
  it("ENGLISH_NOTE leaves US places as-is", () => {
    assert.ok(ENGLISH_NOTE.includes("US places, streets and Meta HQ are already English: write them as they are, never with Korean."));
  });

  it("ENGLISH_NOTE keeps the Korean example and the dollar example", () => {
    assert.ok(ENGLISH_NOTE.includes("(강남역)"));
    assert.ok(ENGLISH_NOTE.includes("$4,261/mo"));
  });
});

// Stage 29a11 — US text answers cite US sources; replies never show
// internal home ids. node --test, no network.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

import {
  citationsFor, isUsToolContext, sourceById,
} from "../src/ui/agent-float.js";
import { SYSTEM_PROMPT, replaceInternalIds } from "../src/consult/agent.js";

let React;
let renderToString;
let AssistantMsg;

before(async () => {
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
  ({ AssistantMsg } = await import("../src/ui/consult.jsx"));
});

const USD_FIND = [{ name: "find_homes", args: { profile: { currency: "USD" } } }];

describe("29a11 isUsToolContext", () => {
  it("is true for a USD profile, false for KRW, true for us- ids, false for empty", () => {
    assert.equal(isUsToolContext(USD_FIND), true);
    assert.equal(isUsToolContext(
      [{ name: "find_homes", args: { profile: { currency: "KRW" } } }]), false);
    assert.equal(isUsToolContext(
      [{ name: "pick_homes", args: { candidate_ids: ["us-home-0027"] } }]), true);
    assert.equal(isUsToolContext([]), false);
  });
});

describe("29a11 US text-answer citations", () => {
  it("find_homes in a USD turn cites Zillow + OSM, never MOLIT", () => {
    const cites = citationsFor(["extract_profile", "find_homes", "open_panel"],
      { toolCalls: USD_FIND });
    const titles = cites.map((c) => c.title);
    assert.ok(titles.includes("Zillow Observed Rent Index (ZORI)"), String(titles));
    assert.ok(titles.includes(sourceById("osm-us").name), String(titles));
    assert.ok(!titles.some((t) => t.includes("국토교통부")), String(titles));
  });

  it("build_scenario over us- home ids cites no GIS data and no MOLIT", () => {
    const cites = citationsFor(["pick_homes", "build_scenario"], {
      toolCalls: [{ name: "build_scenario", args: { home_ids: ["us-home-0027"] } }],
    });
    const titles = cites.map((c) => c.title).join(" | ");
    assert.ok(!titles.includes("GIS건물통합정보"), titles);
    assert.ok(!titles.includes("국토교통부"), titles);
  });

  it("Korean turns still cite MOLIT first", () => {
    const cites = citationsFor(["find_homes"], {
      toolCalls: [{ name: "find_homes", args: { profile: { currency: "KRW" } } }],
    });
    assert.equal(cites[0].title, "국토교통부 실거래가 공개시스템");
  });

  it("SSR AssistantMsg for a USD turn shows Zillow ZORI, not 실거래가", () => {
    const html = renderToString(React.createElement(AssistantMsg, {
      msg: {
        role: "assistant",
        content: "Found homes",
        tool_calls: [{ id: "a", name: "find_homes", args: { profile: { currency: "USD" } } }],
      },
      toolRows: {},
    }));
    assert.ok(html.includes("Zillow ZORI"), html);
    assert.ok(!html.includes("실거래가"), html);
  });
});

describe("29a11 no internal ids in replies", () => {
  it("replaces known ids with names and unknown ids with this home / 이 집", () => {
    assert.equal(
      replaceInternalIds("You picked us-home-0027 and us-home-0099.",
        { "us-home-0027": "10 Coleman Place" }, "en"),
      "You picked 10 Coleman Place and this home.");
    assert.equal(
      replaceInternalIds("home-004607 좋아요", {}, "ko"), "이 집 좋아요");
  });

  it("SYSTEM_PROMPT bans ids in answers", () => {
    const joined = Array.isArray(SYSTEM_PROMPT) ? SYSTEM_PROMPT.join("\n") : String(SYSTEM_PROMPT);
    assert.ok(joined.includes("id(home-004607, us-home-0027"), joined.slice(-400));
  });

  it("osm-us has the short name OSM (US)", () => {
    assert.equal(sourceById("osm-us").short, "OSM (US)");
  });
});

// Stage 29k1: the report passes only on real numbers — member ids that
// match the engine (h1/h2 agent keys, not m1/m2), no claim-less
// deterministic sentences, cited records that say how and when.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadGroundTruth } from "../src/verify/checklist.js";
import { engineValue, checkNumberClaims,
  memberKeyFor } from "../src/verify/numbers.js";
import { reportDigest } from "../src/verify/compare.js";
import { citedEvents } from "../src/verify/evidence.js";
import { REPORT_PROMPT, REPORT_PROMPT_EN } from "../src/consult/report.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const GT = JSON.parse(readFileSync(
  join(HERE, "..", "..", "scenarios", "verify", "ground_truth.json"), "utf-8"));

function tinyRun() {
  const commute = (id, agent, day, minutes, depart_min, toKind) =>
    ({ id, agent, day, purpose: "commute", minutes, depart_min,
      from: { kind: "home", label: "집" },
      to: { kind: toKind, label: toKind === "home" ? "집" : "일터" } });
  return {
    meta: { start_date: "2026-11-01", area: "seoul-x" },
    agents: [
      { key: "h1", id: "m1", label: "나", household: true },
      { key: "h2", id: "m2", label: "배우자", household: true },
    ],
    trips: [
      commute("c-am1", "h1", 0, 20, 480, "work"),
      commute("c-pm1", "h1", 0, 20, 1080, "home"),
      commute("c-am2", "h2", 0, 30, 480, "work"),
      commute("c-pm2", "h2", 0, 30, 1080, "home"),
      // Evening walk home, no mode: after November Seoul sunset (17:25).
      { id: "eve-home", agent: "h1", day: 1, purpose: "commute",
        minutes: 13, depart_min: 1097, arrive_min: 1110,
        from: { kind: "work", label: "일터" },
        to: { kind: "home", label: "집" } },
    ],
    aways: [],
    decisions: [],
  };
}

const HOME = { monthly_won: 500000, maintenance_won_month: 100000,
  utilities_won_month: 50000 };

describe("29k1 memberKeyFor", () => {
  it("resolves id, label and key to the agent key", () => {
    const run = tinyRun();
    assert.equal(memberKeyFor(run, "m1"), "h1");
    assert.equal(memberKeyFor(run, "나"), "h1");
    assert.equal(memberKeyFor(run, "h2"), "h2");
    assert.equal(memberKeyFor(run, "x"), null);
  });
  it("N01 by member id equals N01 by agent key and is not null", () => {
    const run = tinyRun();
    const byId = engineValue("N01", run, { member: "m1" });
    assert.deepEqual(byId, engineValue("N01", run, { member: "h1" }));
    assert.ok(byId && byId.value > 0);
  });
});

describe("29k1 claim-less deterministic sentences fail", () => {
  it("an N01 sentence with no claims fails 숫자 없이 쓴 문장이에요", () => {
    const loaded = loadGroundTruth(GT, "newlywed_couple");
    const report = { persona: "newlywed_couple", home: HOME, sentences: [
      { id: "s1", item_id: "N01", text_ko: "두 분 모두 함께 출근했어요",
        claims: [], evidence: [] },
    ] };
    const { failures } = checkNumberClaims(report, tinyRun(), loaded);
    assert.equal(failures.length, 1);
    assert.equal(failures[0].reason_ko, "숫자 없이 쓴 문장이에요");
  });
});

describe("29k1 digest N01 carries the agent key and label", () => {
  it("values for the home key h1 with label_ko 나", () => {
    const digest = reportDigest({ runs: { A: tinyRun() }, labels: ["A"],
      homes: { A: HOME }, persona: "newlywed_couple", groundTruth: GT });
    const n01 = digest.items.find((it) => it.id === "N01");
    assert.ok(n01.values.A.h1.value > 0);
    assert.equal(n01.values.A.h1.label_ko, "나");
  });
});

describe("29k1 cited records say how and when", () => {
  it("the evening walk cites mode walk, its scene and 걸어서", () => {
    const rec = citedEvents(tinyRun(), ["eve-home"])[0];
    assert.equal(rec.mode, "walk");
    assert.ok(rec.scene.includes("dark_walk"));
    assert.match(rec.text_ko, /걸어서/);
  });
});

describe("29k1 REPORT_PROMPT voice rules", () => {
  it("names agent keys with labels, bans inventions and the 30일 opener", () => {
    assert.match(REPORT_PROMPT, /label_ko로 부른다/);
    assert.match(REPORT_PROMPT, /남편·아내/);
    assert.match(REPORT_PROMPT, /"30일 동안…"으로 시작하지 않는다/);
    assert.ok(!REPORT_PROMPT.includes("member(m1, m2…)"));
  });
});

describe("29k3 REPORT_PROMPT short sentences with item meanings", () => {
  it("caps at 70자, bans padding and states C05 is not the nearest shop", () => {
    assert.match(REPORT_PROMPT, /70자 이하/);
    assert.match(REPORT_PROMPT, /가장 가까운 가게까지가 아님/);
    assert.match(REPORT_PROMPT, /덧붙이지 않는다/);
    assert.ok(!REPORT_PROMPT.includes("40~70자"));
    assert.match(REPORT_PROMPT_EN, /never pad/);
  });
});

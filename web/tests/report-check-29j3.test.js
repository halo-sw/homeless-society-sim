// Stage 29j3: the verified comparison on screen (pure, node --test).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { register } from "node:module";
import { loadGroundTruth } from "../src/verify/checklist.js";
import { judgeCandidates } from "../src/verify/evidence.js";
import { engineValue } from "../src/verify/numbers.js";
import { inapplicableItems, slimRunForReport } from "../src/verify/compare.js";
import { verifyHomeFor } from "../src/chat/custom-money.js";

register("./jsx-loader.mjs", import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const GT = JSON.parse(readFileSync(
  join(HERE, "..", "..", "scenarios", "verify", "ground_truth.json"), "utf-8"));

let React;
let renderToStaticMarkup;
let ReportCheck;
let reportUnlocked;

before(async () => {
  React = (await import("react")).default;
  ({ renderToStaticMarkup } = await import("react-dom/server"));
  ({ ReportCheck, reportUnlocked } = await import("../src/ui/chat.jsx"));
});

function runWithBackground() {
  return {
    meta: { start_date: "2026-11-01", area: "seoul-x" },
    agents: [{ key: "m1", household: true }, { key: "m2", household: true },
      { key: "b01", household: false }],
    totals: { per_member: { m1: 100, m2: 100, b01: 999 } },
    trips: [
      { id: "a-am1", agent: "m1", day: 11, purpose: "commute",
        minutes: 30, depart_min: 480, path: [[0, 0], [1, 1]],
        from: { kind: "home", label: "집" }, to: { kind: "work", label: "일터" } },
      { id: "a-dark", agent: "m1", day: 11, purpose: "commute",
        minutes: 13, depart_min: 1097, arrive_min: 1110, mode: "bike",
        path: [[0, 0], [2, 2]],
        from: { kind: "work", label: "Meta HQ (1 Hacker Way)" },
        to: { kind: "home", label: "집" } },
      { id: "a-late", agent: "m1", day: 12, purpose: "commute",
        minutes: 13, depart_min: 1347, arrive_min: 1360, path: [[0, 0]],
        from: { kind: "work", label: "Meta HQ (1 Hacker Way)" },
        to: { kind: "home", label: "집" } },
      { id: "a-am2", agent: "m2", day: 11, purpose: "commute",
        minutes: 25, depart_min: 480,
        from: { kind: "home", label: "집" }, to: { kind: "work", label: "일터" } },
      { id: "a-pm2", agent: "m2", day: 11, purpose: "commute",
        minutes: 25, depart_min: 1000, arrive_min: 1025,
        from: { kind: "work", label: "일터" }, to: { kind: "home", label: "집" } },
      { id: "a-neigh", agent: "b01", day: 11, purpose: "commute",
        minutes: 60, depart_min: 480, path: [[9, 9]],
        from: { kind: "home", label: "이웃집" }, to: { kind: "work", label: "일터" } },
    ],
    aways: [],
    decisions: [{ id: "d1", agent: "m1", day: 11, kind: "outing",
      chosen_key: "yes", extra: "drop me" }],
  };
}

describe("29j3 slimRunForReport", () => {
  it("drops background trips and paths, keeps verifier results", () => {
    const run = runWithBackground();
    const slim = slimRunForReport(run);
    assert.ok(slim.trips.every((t) => t.agent !== "b01"));
    assert.ok(slim.trips.length > 0);
    assert.ok(slim.trips.every((t) => t.path === undefined));
    assert.deepEqual(engineValue("C01", slim), engineValue("C01", run));
    assert.deepEqual(judgeCandidates(slim, "C06").map((t) => t.id),
      judgeCandidates(run, "C06").map((t) => t.id));
  });
});

describe("29j3 inapplicableItems with home", () => {
  const loaded = loadGroundTruth(GT, "newlywed_couple");
  it("flags C02 without a money doc, clears it with one", () => {
    const run = runWithBackground();
    assert.ok(inapplicableItems(loaded, run, {}).includes("C02"));
    assert.ok(!inapplicableItems(loaded, run, { monthly_won: 500000 }).includes("C02"));
  });
});

describe("29j3 verifyHomeFor", () => {
  it("reads US rent, KR tenure money, and missing docs", () => {
    assert.deepEqual(
      verifyHomeFor({ us_rent: true, homes: { A: { rent_usd_month: 4261 } },
        default_tenure: { A: "월세" } }, "A"),
      { monthly_won: 4261, currency: "USD" });
    assert.deepEqual(
      verifyHomeFor({ homes: { A: { by_tenure: { 전세: { housing: { monthly_won: 500000 } } } } },
        default_tenure: { A: "전세" },
        assumptions: { maintenance_won_month: 100000 } }, "A"),
      { monthly_won: 500000, maintenance_won_month: 100000 });
    assert.deepEqual(verifyHomeFor(null, "A"), {});
    assert.deepEqual(verifyHomeFor({}, "A"), {});
  });
});

describe("29j3 reportUnlocked", () => {
  const sim = (report) => [{ kind: "simulation", data: report === undefined ? {} : { report } }];
  it("gates on the check state", () => {
    assert.equal(reportUnlocked([]), true);
    assert.equal(reportUnlocked(sim(undefined)), true);
    assert.equal(reportUnlocked(sim({ status: "checking", attempts: [] })), false);
    assert.equal(reportUnlocked(sim({ status: "handoff" })), false);
    assert.equal(reportUnlocked(sim({ status: "handoff", confirmed: true })), true);
    assert.equal(reportUnlocked(sim({ status: "pass" })), true);
    assert.equal(reportUnlocked(sim({ status: "unsupported" })), true);
    assert.equal(reportUnlocked(sim({ status: "off" })), true);
  });
});

describe("29j3 ReportCheck SSR", () => {
  const sentences = [
    { id: "s1", home: "A", item_id: "C01", text_ko: "통근은 평균 22분이에요",
      claims: [{ field: "minutes", value: 22, unit: "분" }], evidence: ["a-dark"] },
  ];
  it("pass renders the timeline and the sentences", () => {
    const html = renderToStaticMarkup(React.createElement(ReportCheck, {
      report: { status: "pass", persona: "newlywed_couple",
        attempts: [{ attempt: 1, pass: false, weighted_coverage: 0.67, summary_ko: "1차" },
          { attempt: 2, pass: true, weighted_coverage: 0.83, summary_ko: "2차" }],
        report: { sentences },
        result: { failures: [], feedback_ko: [] } },
      names: { A: "역삼" },
    }));
    assert.ok(html.includes("1차 반려 (67%)"));
    assert.ok(html.includes("2차 통과 (83%)"));
    assert.ok(html.includes("통근은 평균 22분이에요"));
  });
  it("unsupported names the family type", () => {
    const html = renderToStaticMarkup(React.createElement(ReportCheck, {
      report: { status: "unsupported", persona: "pet_owner", attempts: [] },
      names: {},
    }));
    assert.ok(html.includes("미지원"));
    assert.ok(html.includes("반려동물과 사는 가족"));
  });
  it("checking with one attempt shows the next step", () => {
    const html = renderToStaticMarkup(React.createElement(ReportCheck, {
      report: { status: "checking", persona: "newlywed_couple",
        attempts: [{ attempt: 1, pass: false, weighted_coverage: 0.5, summary_ko: "1차" }] },
      names: {},
    }));
    assert.ok(html.includes("2차 확인 중"));
  });
});

describe("29j3 chat.jsx wiring", () => {
  it("handoff bubble, report stream in handleRun, gated scene", () => {
    const src = readFileSync(join(HERE, "..", "src", "ui", "chat.jsx"), "utf8");
    assert.ok(src.includes('msg.kind === "handoff"'));
    assert.ok(src.includes("확인했어요"));
    assert.ok(src.includes("다시 검증하기"));
    const atRun = src.indexOf("async function handleRun");
    assert.ok(atRun >= 0 && src.slice(atRun).includes("requestReport(simId"));
    assert.ok(src.includes("postReportStream({ provider, persona, labels"));
    const atScene = src.indexOf('eff.type === "scene"');
    assert.ok(atScene >= 0);
    assert.ok(src.slice(atScene, atScene + 600).includes("reportUnlocked"));
  });
});

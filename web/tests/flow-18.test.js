// 18-2: flow without dead ends. One run verdict shared by the chat
// card, drawer card and sticky button; example chips send at once;
// the intake never re-asks the sentence; plain run errors + retry;
// the compare section reveals; the share dialog opens named.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

import { INTAKE_STEPS, intakeState0, currentStep, prefillFromExtract,
  intakeTookLine, householdHint, household0 } from "../src/intake.js";
import { extract_profile } from "../src/profile.js";
// .jsx loads dynamically (static imports resolve before the loader).

const STATIONS = ["판교", "강남", "잠실", "미금", "정자", "수서", "모란"];

function readyCandidate(id, name) {
  return { id, name, kind: "오피스텔", region: "bundang",
    lon: 127.1, lat: 37.4, build_year: 2015, scene: "st-판교",
    tenures: [{ tenure: "jeonse", median_won: 180000000,
      min_won: 170000000, max_won: 190000000, deals: 5,
      budget_fit: "all", bucket_center_m2: 30 }],
    commute: { walk: { known: true, station: "판교", minutes: 5 },
      ride: { known: true, minutes: 6, lines: [], transfers: [] } },
    commute_ko: "판교까지 약 11분" };
}

function unreadyCandidate(id, name) {
  const c = readyCandidate(id, name);
  return { ...c, commute: { walk: { known: false },
    ride: { known: false } } };
}

describe("18-2 one run verdict everywhere", () => {
  let runReadiness;
  let RUN_BUTTON_LABEL;
  before(async () => {
    ({ runReadiness, RUN_BUTTON_LABEL } = await import("../src/ui/chat.jsx"));
  });

  it("asks for 2–3 homes below 2 picks", () => {
    const cands = [readyCandidate("a", "A집"), readyCandidate("b", "B집")];
    const r0 = runReadiness([], cands);
    assert.equal(r0.canRun, false);
    assert.equal(r0.hint, "비교할 집을 2–3곳 담아 주세요 (지금 0곳)");
    const r1 = runReadiness(["a"], cands);
    assert.equal(r1.canRun, false);
    assert.match(r1.hint, /지금 1곳/);
  });

  it("runs at 2+ ready picks with one label", () => {
    const cands = [readyCandidate("a", "A집"), readyCandidate("b", "B집")];
    const r = runReadiness(["a", "b"], cands);
    assert.equal(r.canRun, true);
    assert.equal(r.label, RUN_BUTTON_LABEL);
    assert.match(r.hint, /2곳을 30일씩/);
  });

  it("names unready picks and refuses", () => {
    const cands = [readyCandidate("a", "A집"), unreadyCandidate("b", "B집")];
    const r = runReadiness(["a", "b"], cands);
    assert.equal(r.canRun, false);
    assert.match(r.hint, /B집/);
  });

  it("chat card has no run button; the wrapper renders the one run button", async () => {
    const React = (await import("react")).default;
    const { renderToString } = await import("react-dom/server");
    const { CandidatesCard, DrawerArea } =
      await import("../src/ui/chat.jsx");
    const cands = [readyCandidate("a", "A집"), readyCandidate("b", "B집")];
    const noop = () => {};
    const chatHtml = renderToString(React.createElement(CandidatesCard,
      { data: { candidates: cands, total_matching: 2, sort_note: "" },
        tenure: "jeonse", sort: "commute", onSort: noop,
        picks: ["a", "b"], onTogglePick: noop, onPreview3D: noop,
        onJeonse: noop, onRun: noop, onDetail: noop, onHover: noop,
        photoDeps: {}, destName: "판교" }));
    // 19a: no run button inside the list — the footer says what to say.
    assert.equal(chatHtml.split(RUN_BUTTON_LABEL).length - 1, 0, "no run button in the list");
    assert.ok(chatHtml.includes("살아 봐 줘"), "footer says what to say");
    const drawerHtml = renderToString(React.createElement(DrawerArea,
      { picks: ["a", "b"],
        candidatesData: { result: { candidates: cands }, tenure: "jeonse" },
        onRun: noop, detail: null, onCloseDetail: noop, photoDeps: {},
        destName: "판교", tenure: "jeonse", onTogglePick: noop,
        onJeonse: noop }));
    assert.ok(drawerHtml.includes(RUN_BUTTON_LABEL), "tray run button");
    assert.ok(!drawerHtml.includes("disabled"), "tray button enabled at 2 ready picks");
  });
});

const { EXAMPLE_PROMPTS, exampleChatUrl } =
  await import("../src/ui/landing.jsx");

describe("18-2 example chips send immediately", () => {
  it("each example prompt maps to a chat URL carrying the id", async () => {
    assert.equal(EXAMPLE_PROMPTS.length, 4);
    for (const p of EXAMPLE_PROMPTS) {
      const url = exampleChatUrl(p.prompt);
      assert.match(url, /\?chat=/);
      assert.ok(url.includes(`example=${p.id}`), p.id);
      // URLSearchParams writes spaces as + (%20 from encodeURIComponent
      // never appears), so compare the decoded param (covers the ASCII
      // us-meta prompt as well as the Korean ones).
      const query = new URLSearchParams(url.slice(url.indexOf("?")));
      assert.equal(query.get("chat"), p.prompt);
    }
  });
});

describe("18-2 intake never re-asks the sentence", () => {
  // Step → profile keys that answer it. Steps without a source always ask.
  const STEP_SOURCES = {
    income: ["salaryAnnual", "takehomeMonthly"],
    budget: ["tenure", "depositMax", "monthlyMax", "priceMax"],
    commute: ["commuteMax"],
  };
  const has = (profile, key) => {
    const f = profile && profile[key];
    if (!f) return false;
    const v = f.value;
    return !(v === null || v === undefined || v === ""
      || (Array.isArray(v) && v.length === 0));
  };

  for (const p of EXAMPLE_PROMPTS) {
    it(`"${p.title}": no question asks a value in the sentence`, () => {
      const ex = extract_profile(p.prompt, null, { stations: STATIONS });
      assert.equal(ex.ok, true);
      const st = prefillFromExtract(intakeState0(), { profile: ex.profile });
      for (const step of INTAKE_STEPS) {
        const sources = STEP_SOURCES[step] || [];
        const present = sources.filter((k) => has(ex.profile, k));
        if (present.length > 0) {
          assert.notEqual(st.values[step], undefined,
            `${step} must be pre-filled from ${present.join(",")}`);
        }
      }
      // And the walk (same advance rule as answerStep) never lands
      // on a pre-filled step.
      const values = { ...st.values };
      let idx = st.stepIndex;
      const seen = new Set();
      for (;;) {
        while (idx < INTAKE_STEPS.length && values[INTAKE_STEPS[idx]] !== undefined) idx++;
        if (idx >= INTAKE_STEPS.length) break;
        const step = INTAKE_STEPS[idx];
        assert.ok(!seen.has(step), `re-asked ${step}`);
        seen.add(step);
        const sources = STEP_SOURCES[step] || [];
        assert.deepEqual(sources.filter((k) => has(ex.profile, k)), [],
          `${step} asks ${sources} but the sentence gave it`);
        values[step] = "x";
        idx++;
      }
    });
  }

  it("says what it took from each sentence", () => {
    const took = EXAMPLE_PROMPTS.map((p) =>
      intakeTookLine(extract_profile(p.prompt, null, { stations: STATIONS }).profile));
    assert.match(took[0], /문장에서 가져왔어요/);
    assert.match(took[0], /1인/);
    assert.match(took[0], /판교 출근/);
    assert.match(took[0], /연봉 4,000만 원/);
    assert.match(took[0], /모은 돈 5,000만 원/);
    assert.match(took[0], /전세 2억 원 이하/);
    assert.match(took[1], /2인/);
    assert.match(took[1], /강남 출근/);
    assert.match(took[1], /전세 4억 원 이하/);
    assert.match(took[1], /59㎡ 이상/);
    assert.match(took[2], /3인/);
    assert.match(took[2], /잠실 출근/);
    assert.match(took[2], /전세 6억 원 이하/);
  });

  it("leaves missing fields out of the took line (no null)", () => {
    const field = (value) => ({ value });
    const line = intakeTookLine({
      members: field([{ relation: "본인" }]),
      workplaces: field([{ text: "판교", resolved: { station: "판교" } }]),
      salaryAnnual: field([40000000]),
      takehomeMonthly: field(null),
      cash: field(50000000),
      tenure: field("jeonse"),
      depositMax: field(200000000),
      sizeMin: field(null),
      commuteMax: field(null),
    });
    assert.match(line, /1인 · 판교 출근/);
    assert.ok(!line.includes("null"), `no null in: ${line}`);
    assert.ok(!line.includes("㎡"), "missing size stays out");
    assert.ok(!line.includes("출퇴근") || line.includes("판교 출근"),
      `missing commute cap stays out: ${line}`);
    const full = intakeTookLine({
      members: field([{ relation: "본인" }]),
      salaryAnnual: field(null),
      takehomeMonthly: field(3000000),
      cash: field(null),
      sizeMin: field(59),
      commuteMax: field(30),
    });
    assert.match(full, /월 실수령/);
    assert.match(full, /59㎡ 이상/);
    assert.match(full, /출퇴근 30분 이내/);
    assert.ok(!full.includes("null"), `no null in: ${full}`);
  });

  it("first question follows the sentence (연봉 asked only when missing)", () => {
    const withSalary = prefillFromExtract(intakeState0(), {
      profile: extract_profile(EXAMPLE_PROMPTS[0].prompt, null,
        { stations: STATIONS }).profile });
    assert.notEqual(currentStep(withSalary), "income");
    const noSalary = prefillFromExtract(intakeState0(), {
      profile: extract_profile(EXAMPLE_PROMPTS[1].prompt, null,
        { stations: STATIONS }).profile });
    assert.equal(currentStep(noSalary), "income");
  });

  it("nudges extra members without guessing relations", () => {
    const two = extract_profile(EXAMPLE_PROMPTS[1].prompt, null,
      { stations: STATIONS }).profile;
    assert.match(householdHint(two, household0()), /2인이라고 하셨어요/);
    const one = extract_profile(EXAMPLE_PROMPTS[0].prompt, null,
      { stations: STATIONS }).profile;
    assert.equal(householdHint(one, household0()), "");
  });
});

describe("18-2 plain run errors + retry", () => {
  it("maps technical failures to plain Korean", async () => {
    const { plainRunError } = await import("../src/ui/chat.jsx");
    assert.match(plainRunError("sim worker timed out"), /시간 안에 끝나지 않았어요/);
    assert.match(plainRunError("home X has no scene box yet"), /3D 장면이 없는/);
    assert.match(plainRunError("Error: worker failed"), /계산기를 열지 못했어요/);
    assert.match(plainRunError("boom"), /끝내지 못했어요/);
  });

  it("the error card offers 다시 시도 with the detail folded", async () => {
    const React = (await import("react")).default;
    const { renderToString } = await import("react-dom/server");
    const { SimulationCard } = await import("../src/ui/chat.jsx");
    const html = renderToString(React.createElement(SimulationCard,
      { data: { status: "error", error: "sim worker timed out" },
        onRetry: () => {} }));
    assert.ok(html.includes("다시 시도"), "retry button");
    assert.ok(html.includes("시간 안에 끝나지 않았어요"), "plain reason");
    assert.ok(html.includes("자세한 이유"), "folded detail");
  });
});

describe("18-2 compare reveal + share dialog", () => {
  it("revealCompareSection opens the section and scrolls to it", async () => {
    const { revealCompareSection } = await import("../src/ui/app.jsx");
    let scrolled = null;
    const el = { open: false,
      scrollIntoView: (opts) => { scrolled = opts; } };
    const root = { querySelector: (sel) =>
      (sel === '[data-testid="section-compare"]' ? el : null) };
    assert.equal(revealCompareSection(root), true);
    assert.equal(el.open, true);
    assert.deepEqual(scrolled, { block: "nearest" });
    assert.equal(revealCompareSection({ querySelector: () => null }), false);
    assert.equal(revealCompareSection(null), false);
  });

  it("ShareDialog opens named with actions", async () => {
    const React = (await import("react")).default;
    const { renderToString } = await import("react-dom/server");
    const { store } = await import("../src/ui/store.js");
    const { ShareDialog } = await import("../src/ui/share.jsx");
    store.set({ shareOpen: true, compare: null, money: null,
      compareLoading: false, moneyLoading: false });
    try {
      const html = renderToString(React.createElement(ShareDialog));
      assert.ok(html.includes("<dialog"), "dialog element");
      assert.ok(html.includes("결과 공유"), "title");
      assert.ok(html.includes("PNG 저장"), "png action");
      assert.ok(html.includes("aria-label=\"결과 공유\""), "named");
    } finally {
      store.set({ shareOpen: false });
    }
  });
});

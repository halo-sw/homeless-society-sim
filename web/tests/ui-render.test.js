// Stage 10b: the whole UI disappeared (React "Maximum update depth
// exceeded") plus a NaN on the tour. Two guards:
//
// 1. Every exported store selector returns === results across repeated
//    calls on the same state — the exact property React's
//    useSyncExternalStore requires of getSnapshot. The AgentNudge
//    selector built a fresh object per call, which re-rendered forever
//    and unmounted everything but the canvas.
// 2. A React render smoke test (react-dom/server renderToString, no DOM):
//    App with a realistic sim-mode store state for the failing URLs —
//    sim base, money tab, listings tab (+fill=example), share open, and
//    tour step 1/9 — must not throw and must not log React errors. The
//    tour's <Step> missed its required `step` prop, rendering NaN
//    children ("Received NaN for the `children` attribute").
//
// Skips the render cases (not the selector checks) when the build output
// is absent (gitignored data/).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createStore } from "../src/ui/store.js";
import * as storeModule from "../src/ui/store.js";
import { DEMO_TOUR_STEPS } from "../src/ui/demotour.js";
import { agentLabelOf, chosenLabel, dayDecisions, DECISION_KIND_KO,
  decisionBadge, formatClock, indexRun, parseTParam } from "../src/sim.js";
import { fatigueFor, householdNow, nowCardFor, simMetaFor,
  tickerFor } from "../src/nowcard.js";
import { journeyBanner, rideStateFor } from "../src/journey.js";
import { highlightFor } from "../src/highlight.js";
import { daySegments, monthStrip, outingStepsFor } from "../src/timeline.js";
import { compare as compareRuns } from "../src/engine/simulate.js";

register("./jsx-loader.mjs", import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const P = {
  runA: join(ROOT, "data/build/sim/demo-two-homes-A.json"),
  runB: join(ROOT, "data/build/sim/demo-two-homes-B.json"),
  money: join(ROOT, "data/build/sim/demo-two-homes-money.json"),
  scenario: join(ROOT, "scenarios/demo-two-homes.json"),
  areaA: join(ROOT, "data/build/songpa-jamsil/area.json"),
  areaABuildings: join(ROOT, "data/build/songpa-jamsil/area.buildings.json"),
  areaB: join(ROOT, "data/build/pangyo/area.json"),
};
const json = (p) => JSON.parse(readFileSync(p, "utf8"));

describe("stage 10b selectors: stable snapshots", () => {
  it("every exported select* returns === across calls on the same state", () => {
    const names = Object.keys(storeModule).filter((k) => k.startsWith("select"));
    assert.ok(names.length >= 6, `expected the select* family, got ${names.join(",")}`);
    assert.ok(names.includes("selectAgentNudge"), "selectAgentNudge must stay exported");
    const s = createStore({
      mode: "sim", home: "A", compareTab: "money", agentNudges: true,
      consultOpen: false, scenarioName: "demo-two-homes", shareOpen: true,
      journey: { legs: [{ valuePct: 93 }] }, judgeLog: [{ id: "d1" }],
      money: { homes: { A: {} } },
    });
    const state = s.getState();
    for (const name of names) {
      const sel = storeModule[name];
      const a = sel(state);
      const b = sel(state);
      const c = sel(state);
      assert.equal(a === b && b === c, true,
        `${name} must return === results for repeated calls on the same state`);
    }
  });

  it("the object selector refreshes on a new state, then stays stable", () => {
    const s = createStore({ home: "A" });
    const before = storeModule.selectAgentNudge(s.getState());
    assert.equal(before.home, "A");
    s.set({ home: "B" });
    const after = storeModule.selectAgentNudge(s.getState());
    assert.equal(after.home, "B");
    assert.equal(after === storeModule.selectAgentNudge(s.getState()), true);
  });

  it("components wire the stable selectors (crash-site tripwires)", () => {
    // 12b: the floating panel is gone — the chat screen holds the same
    // getSnapshot contract (stable store.getState, server snapshot for
    // SSR; no fresh objects per call).
    const chat = readFileSync(join(ROOT, "web/src/ui/chat.jsx"), "utf8");
    assert.ok(chat.includes("useSyncExternalStore(store.subscribe, store.getState, store.getState)"),
      "chat store reads must use the stable getSnapshot + server snapshot");
    assert.ok(!/useSyncExternalStore\(store\.subscribe,\s*\(\)\s*=>\s*\{/.test(chat),
      "chat.jsx must not build a fresh snapshot object in getSnapshot");
    const share = readFileSync(join(ROOT, "web/src/ui/share.jsx"), "utf8");
    assert.ok(share.includes("selectShareOpen(store.getState())"),
      "ShareDialog must read through the stable selector");
    const tour = readFileSync(join(ROOT, "web/src/ui/DemoTour.jsx"), "utf8");
    assert.match(tour, /<Step key=\{s\.id\} step=\{i\}/,
      "every tour <Step> needs its zero-based step prop (else NaN children)");
  });
});

const REQUIRED = ["runA", "runB", "money", "scenario", "areaA", "areaABuildings", "areaB"];
const missing = REQUIRED.filter((k) => !existsSync(P[k]));
const SKIP_ALL = missing.length > 0
  ? `missing ${missing.join(", ")} — generate data/build first; data/ is gitignored`
  : false;

const RES_LABELS = { apartment: "아파트", house: "단독주택", mixed: "복합", none: "비주거" };
const RES_SWATCH = { apartment: "#d9a878", house: "#f3ead9", mixed: "#e3d3b8", none: "#cfc8bb" };

// Same legend rows bootSim publishes (counts walked from the area file).
function legendFor(area, homeLabel, run) {
  const resCounts = {};
  for (const b of area.buildings || []) {
    const r = b.residential || "none";
    resCounts[r] = (resCounts[r] || 0) + 1;
  }
  return {
    title: `범례 — ${homeLabel} · ${run.meta.complex}`,
    resRows: Object.entries(RES_LABELS)
      .map(([key, label]) => ({ label, color: RES_SWATCH[key], count: resCounts[key] || 0 }))
      .filter((r) => Object.values(RES_LABELS).includes(r.label)),
    heightRows: [],
    simNote: `시뮬레이션 주민 ${run.meta.agents}명 (가구 ${run.meta.household}명 + 이웃 ${run.meta.background}명) · 엔진 재생`,
    note: "나무·인물은 장식용 모의 표시입니다",
  };
}

const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

describe("stage 10b UI render smoke (SSR, no DOM)", { skip: SKIP_ALL }, () => {
  let runA; let runB; let scenario; let money; let homes;
  let indexedA; let indexedB; let areaById;
  let React; let renderToString; let App; let store; let AgentTourCard;

  before(async () => {
    runA = json(P.runA);
    runB = json(P.runB);
    scenario = json(P.scenario);
    money = json(P.money);
    homes = scenario.homes;
    indexedA = indexRun(runA);
    indexedB = indexRun(runB);
    const jamsil = json(P.areaA);
    // load.js inlines {"$ref": file} sections at boot; mirror that here.
    if (jamsil.buildings && jamsil.buildings.$ref) {
      jamsil.buildings = json(join(dirname(P.areaA), jamsil.buildings.$ref));
    }
    areaById = { "songpa-jamsil": jamsil, pangyo: json(P.areaB) };
    React = (await import("react")).default;
    ({ renderToString } = await import("react-dom/server"));
    ({ App } = await import("../src/ui/app.jsx"));
    ({ store } = await import("../src/ui/store.js"));
    ({ AgentTourCard } = await import("../src/ui/chat.jsx"));
  });

  // Mirror bootSim + paintNow + paintTimeline publishing for one clock position.
  function simPatch({ home, day, minute, follow, search }) {
    const run = home === "B" ? runB : runA;
    const indexed = home === "B" ? indexedB : indexedA;
    const household = run.agents.filter((a) => a.household);
    const agentKey = follow > 0 ? household[follow - 1].key : null;
    const stripKey = agentKey || household[0].key; // free camera: member 1
    const events = (money.homes[home] && money.homes[home].spending_events) || [];
    let journey = null;
    if (agentKey) {
      const ride = (indexed.awaysByAgent.get(agentKey) || [])
        .find((a) => a.day === day && a.kind === "ride"
          && minute >= a.start_min && minute < a.end_min);
      if (ride) {
        const rs = rideStateFor(ride, minute);
        const banner = journeyBanner({ ride: ride.detail.ride, dir: rs.dir,
          elapsed: rs.elapsed, rideMinutes: ride.detail.ride_minutes });
        journey = { ...banner, dir: rs.dir, elapsedMin: Math.floor(rs.elapsed),
          totalMin: ride.detail.ride_minutes, hasDetailDest: true, detailNote: "",
          corridorLabel: "간략 지도 (건물 높이 추정)",
          congestionSource: "서울교통공사 지하철혼잡도정보 (2026-09-30 기준)" };
      }
    }
    return {
      mode: "sim", ready: true, loading: "",
      area: { id: run.meta.area, label: run.meta.area },
      home, homes, scenarioName: "demo-two-homes",
      clock: { day, minute, days: run.meta.days,
        startDate: run.meta.start_date,
        label: formatClock(run.meta.start_date, day, minute, run.meta.days) },
      playing: false, speed: 1, follow,
      followOptions: [{ value: "0", label: "자유 시점" },
        ...household.map((a, i) => ({ value: String(i + 1), label: a.label }))],
      simMeta: simMetaFor({ household, scenario, run, homes }),
      now: agentKey
        ? nowCardFor({ run, indexed, agentKey, day, minute })
        : { free: true, rows: householdNow({ run, indexed, day, minute }) },
      ticker: agentKey
        ? tickerFor({ run, indexed, agentKey, day, minute, moneyEvents: events }) : [],
      judgeLog: dayDecisions(run, day).slice(0, 12).map((d) => {
        const badge = decisionBadge(d);
        return { id: d.id, minute: hhmm(d.minute), agent: agentLabelOf(run, d.agent),
          kind: DECISION_KIND_KO[d.kind] || d.kind, choice: chosenLabel(d),
          badgeText: badge.text, badgeCls: badge.cls, reason: d.reason_ko || "" };
      }),
      simTicks: follow > 0
        ? highlightFor({ run, indexed, follow, day, minute }).ticks : [],
      judgeFlash: "",
      journey, journeyView: "auto", journeyLoading: "",
      region: { network: true, congestion: true, corridors: 1 },
      dayStrip: { segments: daySegments({ run, agentKey: stripKey, day }) },
      dayStripB: null, stripCompare: false,
      routeSteps: { outings: outingStepsFor({ run, agentKey: stripKey, day }) },
      monthStrip: monthStrip({ run, agentKey: stripKey }),
      compare: compareRuns(runA, runB), compareLoading: false,
      money, moneyLoading: false, moneyTenure: { ...(money.default_tenure || {}) },
      legend: legendFor(areaById[run.meta.area] || { buildings: [] }, home, run),
      introOpen: false, consultOpen: false, shareOpen: false,
      compareOpen: false, compareTab: "compare",
      search,
    };
  }

  function renderCase(patch, search) {
    const { search: _drop, ...state } = patch;
    store.set(state);
    if (search === null || search === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = { location: { search, href: "" } };
    }
    const errors = [];
    const orig = console.error;
    console.error = (...args) => { errors.push(args.map(String).join(" ")); };
    let html = "";
    try {
      html = renderToString(React.createElement(App));
    } finally {
      console.error = orig;
      delete globalThis.window;
    }
    assert.equal(errors.length, 0,
      `React logged errors for ${search || "(no tour/search)"}: ${errors.join(" | ").slice(0, 2000)}`);
    assert.ok(!html.includes(">NaN<"), "rendered NaN text");
    assert.ok(html.length > 1000, `suspiciously short render (${html.length} chars)`);
    return html;
  }

  it("renders sim base (?day=1&t=08:30&follow=1) with no React errors", () => {
    const html = renderCase(
      simPatch({ home: "A", day: 0, minute: parseTParam("08:30"), follow: 1 }),
      "?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:30&follow=1");
    assert.ok(html.includes("구성원 1"), "Now card for the followed member");
    assert.ok(html.includes("1일차"), "clock label");
  });

  it("renders the money tab with no React errors", () => {
    const patch = simPatch({ home: "A", day: 0, minute: parseTParam("08:30"), follow: 1 });
    patch.compareOpen = true;
    patch.compareTab = "money";
    const html = renderCase(patch,
      "?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:30&follow=1&tab=money");
    assert.ok(html.includes("전세로 살면 매달 집에 드는 돈"), "money tab heading");
  });

  it("renders the listings tab with the filled example (?fill=example)", () => {
    const patch = simPatch({ home: "A", day: 0, minute: parseTParam("08:30"), follow: 1 });
    patch.compareOpen = true;
    patch.compareTab = "listings";
    const html = renderCase(patch,
      "?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:30&follow=1&tab=listings&fill=example");
    assert.ok(html.includes("내가 본 매물 확인하기"), "paste-check heading");
    assert.ok(html.includes("레이크팰리스"), "example text prefilled from ?fill=example");
    assert.ok(html.includes("공공 매물·공고"), "public notices section");
  });

  it("renders the share dialog (?tab=money&share=1) with no React errors", () => {
    const patch = simPatch({ home: "A", day: 0, minute: parseTParam("08:30"), follow: 1 });
    patch.compareOpen = true;
    patch.compareTab = "money";
    patch.shareOpen = true;
    const html = renderCase(patch,
      "?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:30&follow=1&tab=money&share=1");
    assert.ok(html.includes("결과 공유"), "share dialog title");
    // Stage 11b: with both docs present the rows show numbers, not "—".
    assert.ok(html.includes("27시간 50분"), "walked-hours A value");
    assert.ok(html.includes("38시간 3분"), "walked-hours B value");
  });

  it("shows a loading state until the share docs arrive (stage 11b)", () => {
    const patch = simPatch({ home: "A", day: 0, minute: parseTParam("08:30"), follow: 1 });
    patch.compareOpen = true;
    patch.compareTab = "money";
    patch.shareOpen = true;
    patch.compare = null; // the A·B 비교 tab never opened
    patch.compareLoading = true;
    const html = renderCase(patch,
      "?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:30&follow=1&tab=money&share=1");
    assert.ok(html.includes("비교 숫자 불러오는 중"), "short loading state");
    assert.ok(!html.includes("27시간 50분"), "no half-rendered rows");
  });

  it("renders the tour share step with the loading state (stage 11b)", () => {
    const step = DEMO_TOUR_STEPS.length - 1;
    assert.equal(DEMO_TOUR_STEPS[step].id, "share");
    const patch = simPatch({ home: "A", day: 0, minute: parseTParam("08:30"), follow: 0 });
    patch.shareOpen = true;
    patch.compare = null; // tour share lands without the compare doc
    const html = renderCase(patch,
      `?mode=sim&scenario=demo-two-homes&tour=demo&step=${step}`);
    assert.ok(html.includes("3분 둘러보기"), "tour bar");
    assert.ok(html.includes("결과 공유"), "share dialog title");
    assert.ok(html.includes("비교 숫자 불러오는 중"), "loading state on the tour step");
  });

  it("renders the ride-time journey card (t=08:40) with no React errors", () => {
    const patch = simPatch({ home: "A", day: 0, minute: parseTParam("08:40"), follow: 1 });
    assert.ok(patch.journey, "08:40 is inside the A commute ride");
    const html = renderCase(patch,
      "?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:40&follow=1");
    assert.ok(html.includes("지하철 이동 중"), "ride Now card");
    assert.ok(html.includes("이동 중"), "journey card");
  });

  it("renders tour step 1 and step 9 with no React errors or NaN", () => {
    for (const step of [1, 9]) {
      const params = DEMO_TOUR_STEPS[step].params;
      const patch = simPatch({
        home: params.home || "A",
        day: Number.parseInt(params.day || "1", 10) - 1,
        minute: params.t ? parseTParam(params.t) : parseTParam("08:30"),
        follow: Number.parseInt(params.follow || "0", 10) || 0,
      });
      if (params.tab) { patch.compareOpen = true; patch.compareTab = params.tab; }
      if (params.share) patch.shareOpen = true;
      if (params.agent) patch.consultOpen = true;
      const html = renderCase(patch,
        `?mode=sim&scenario=demo-two-homes&tour=demo&step=${step}`);
      assert.ok(html.includes("3분 둘러보기"), `tour bar at step ${step}`);
      assert.ok(html.includes(DEMO_TOUR_STEPS[step].caption),
        `step ${step} caption`);
    }
  });

  it("renders the agent tour card with the recorded reply (?agent=1&ask=switch)", () => {
    // 12b: the floating panel is replaced by the chat; the tour's agent
    // step shows the recorded Q&A inline + a handoff to the chat.
    globalThis.window = { location: { search: "?mode=sim&agent=1&ask=switch", href: "" } };
    const errors = [];
    const orig = console.error;
    console.error = (...args) => { errors.push(args.map(String).join(" ")); };
    let html = "";
    try {
      html = renderToString(React.createElement(AgentTourCard));
    } finally {
      console.error = orig;
      delete globalThis.window;
    }
    assert.equal(errors.length, 0, `React errors: ${errors.join(" | ").slice(0, 1000)}`);
    assert.ok(html.includes("B로 바꾸면"), "recorded question");
    assert.ok(html.includes("기록된 답변"), "recorded badge");
    assert.ok(html.includes("대화에서 계속하기"), "handoff to the chat");
  });

  it("renders the landing with no React errors", () => {
    const html = renderCase({ mode: "landing", ready: true,
      area: { id: "songpa-jamsil", label: "송파·잠실" } }, null);
    assert.ok(html.includes("계약 전에, 그 집에서 30일 먼저 살아 봐요"), "heading");
    assert.ok(html.includes("다루는 지역 11곳"), "coverage line");
  });

  it("renders the chat shell with no React errors", () => {
    const html = renderCase({ mode: "chat", ready: true,
      area: { id: "st-미금", label: "미금역 인근" } }, "?chat=");
    assert.ok(html.includes("주거 시뮬레이터"), "product name");
    assert.ok(html.includes("새로 시작"), "reset action");
    assert.ok(html.includes("지금 보는 장면"), "work area");
  });

  it("renders the day strip + route steps + month strip at A 08:50", () => {
    const patch = simPatch({ home: "A", day: 0, minute: parseTParam("08:50"), follow: 1 });
    const html = renderCase(patch,
      "?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:50&follow=1");
    assert.ok(html.includes("2호선 잠실→강남 (9분, 혼잡 91% 실측)"), "ride step");
    assert.ok(html.includes("강남 환승 4분"), "transfer step");
    assert.ok(html.includes("이전 이동"), "prev trip");
    assert.ok(html.includes("다음 이동"), "next trip");
    assert.ok(html.includes("08:21–08:35 걷기"), "walk segment title");
    assert.ok(html.includes("30일 고르기"), "month strip");
    assert.ok(html.includes("A·B 하루 같이 보기"), "strip compare toggle");
    assert.ok(html.includes("재생"), "playback stays");
  });

  it("stacks both homes' day strips when stripCompare is on", () => {
    const patch = simPatch({ home: "A", day: 0, minute: parseTParam("08:50"), follow: 1 });
    patch.stripCompare = true;
    patch.dayStripB = { home: "B",
      segments: daySegments({ run: runB, agentKey: "h1", day: 0 }) };
    const html = renderCase(patch,
      "?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:50&follow=1");
    assert.ok(html.includes("같은 시각"), "B strip label");
  });

  it("offers 대화 from the sim at any hour, following or not (11b carryover)", () => {
    for (const [minute, follow] of [[0, 0], [420, 1], [1158, 1], [1439, 0]]) {
      const patch = simPatch({ home: "A", day: 0, minute, follow });
      const html = renderCase(patch,
        `?mode=sim&scenario=demo-two-homes&home=A&day=1&t=${hhmm(minute)}&follow=${follow}`);
      assert.ok(html.includes("대화"), `reopen entry at ${hhmm(minute)} follow=${follow}`);
    }
  });

  it("renders the compare groups with full tab labels (no squeezed tabs)", () => {
    const patch = simPatch({ home: "A", day: 0, minute: parseTParam("08:30"), follow: 1 });
    patch.compareOpen = true;
    patch.compareTab = "money";
    const html = renderCase(patch,
      "?mode=sim&scenario=demo-two-homes&home=A&day=1&t=08:30&follow=1&tab=money");
    for (const g of ["비교", "돈", "안심", "매물"]) {
      assert.ok(html.includes(g), `group ${g}`);
    }
    assert.ok(html.includes("생활비"), "money tab label");
    assert.ok(html.includes("살 만한가?"), "worthit tab label");
  });

  it("fatigue helper stays finite on the rendered clock (no NaN progress)", () => {
    const f = fatigueFor({ run: runA, agentKey: "h1", day: 0, minute: parseTParam("08:30") });
    assert.ok(Number.isFinite(f.value), "fatigue value finite");
    const card = nowCardFor({ run: runA, indexed: indexedA, agentKey: "h1",
      day: 0, minute: parseTParam("08:30") });
    assert.ok(card.progress === null || Number.isFinite(card.progress),
      "Now-card progress null or finite");
  });
});

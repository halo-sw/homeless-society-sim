// 18c: the chat screen crashed (ReferenceError: cardHi is not defined)
// because CardMsg read ChatScreen's highlight state without receiving
// it. Render smoke test: every message kind the chat produces renders
// to a string without throwing, with realistic single-firstjob data —
// profile, intake, candidates (6 cards, 2 picked, one highlighted),
// a done-state simulation result, listing, all three tabs, tour —
// plus the stage map inside the error boundary.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

// .jsx loads dynamically (static imports resolve before the loader).
let React;
let renderToString;
let CardMsg;
let MsgBoundary;
let StageArea;
let AgentTourCard;
let AssistantMsg;
let ChatSystemMessage;

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

const NAMES = ["A집", "B집", "C집", "D집", "E집", "F집"];

function doneCompare() {
  return { days: 30,
    metrics: [
      { key: "commute_ride_minutes", label: "차·지하철", unit: "minutes",
        a: 1200, b: 1470, delta_b_minus_a: 270, source: "규칙 기반" },
      { key: "fatigue_arrival_work_avg", label: "출근 도착 피로", unit: "index",
        a: 5.1, b: 4.3, delta_b_minus_a: -0.8, source: "규칙 기반" },
    ],
    members: [
      { member: "h1", label: "나",
        commute_walk_minutes: { a: 600, b: 300 },
        commute_ride_minutes: { a: 1200, b: 600 } },
    ],
    judgment: { a: {}, b: {} } };
}

before(async () => {
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
  ({ CardMsg, MsgBoundary, StageArea, AgentTourCard } =
    await import("../src/ui/chat.jsx"));
  ({ AssistantMsg } = await import("../src/ui/consult.jsx"));
  ({ ChatSystemMessage } = await import("@astryxdesign/core/Chat"));
});

function handlersFor(extra = {}) {
  const noop = () => {};
  return { onChip: noop, onSort: noop, picks: ["c1", "c2"],
    onTogglePick: noop, onPreview3D: noop, onJeonse: noop, onRun: noop,
    onDetail: noop, onHover: noop, photoDeps: {}, destName: "판교",
    onAsk: noop, onIntakeAnswer: noop, onIntakeSkip: noop,
    onHouseholdAdd: noop, onHouseholdRemove: noop, onFindHomes: noop,
    intake: extra.intake || null, household: extra.household || null,
    profile: extra.profile || null, exampleId: "single-firstjob", ...extra };
}

describe("18c chat message list renders without throwing", () => {
  it("profile from the single-firstjob sentence", async () => {
    const { extract_profile } = await import("../src/profile.js");
    const { EXAMPLE_PROMPTS } = await import("../src/ui/landing.jsx");
    const ex = extract_profile(EXAMPLE_PROMPTS[0].prompt, null, { stations: STATIONS });
    assert.equal(ex.ok, true);
    const html = renderToString(React.createElement(CardMsg,
      { msg: { id: "m1", role: "assistant", kind: "profile",
          data: { profile: ex.profile }, example: "single-firstjob" },
        handlers: handlersFor(), toolRows: {} }));
    assert.ok(html.includes("고객님 상황"), "profile card heading");
  });

  it("intake card", async () => {
    const { intakeState0, household0 } = await import("../src/intake.js");
    const { extract_profile } = await import("../src/profile.js");
    const { EXAMPLE_PROMPTS } = await import("../src/ui/landing.jsx");
    const ex = extract_profile(EXAMPLE_PROMPTS[0].prompt, null, { stations: STATIONS });
    const html = renderToString(React.createElement(CardMsg,
      { msg: { id: "m2", role: "assistant", kind: "intake", data: {} },
        handlers: handlersFor({ intake: intakeState0(),
          household: household0(), profile: ex.profile }), toolRows: {} }));
    assert.ok(html.includes("후보 찾기"), "intake find-homes button");
  });

  it("candidates: 6 cards, 2 picked, one highlighted (the 18c crash)", async () => {
    const cands = NAMES.map((n, i) => readyCandidate(`c${i + 1}`, n));
    const html = renderToString(React.createElement(CardMsg,
      { msg: { id: "m3", role: "assistant", kind: "candidates",
          data: { result: { candidates: cands, total_matching: 6, sort_note: "" },
            tenure: "jeonse", sort: "commute" }, example: "single-firstjob" },
        handlers: handlersFor(), toolRows: {}, cardHi: "home:c2" }));
    assert.ok(html.includes("집 후보 6곳"), "six cards");
    for (const n of NAMES) assert.ok(html.includes(n), n);
  });

  it("simulation result in done state", async () => {
    const html = renderToString(React.createElement(CardMsg,
      { msg: { id: "m4", role: "assistant", kind: "simulation",
          data: { labels: ["A", "B"], names: { A: "A집", B: "B집" },
            compare: doneCompare(),
            moneyMissing: "기록된 화면에서는 계산하지 않아요",
            momentTexts: [{ when_ko: "3일차", home: "A", text_ko: "비가 와도 5분이면 역에 닿아요" }],
            moments: [{ label: "A", day: 1, t: "08:30", follow: 1 }],
            extraLine: "가정 −2/0/+2% 시나리오는 결과 화면에서 고르세요." },
          example: "single-firstjob" },
        handlers: handlersFor(), toolRows: {} }));
    assert.ok(html.includes("30일 살아 보기 결과"), "done heading");
    assert.ok(html.includes("하루 출퇴근"), "commute section");
  });

  it("listing paste check", async () => {
    const html = renderToString(React.createElement(CardMsg,
      { msg: { id: "m5", role: "assistant", kind: "listing", data: {} },
        handlers: handlersFor(), toolRows: {} }));
    assert.ok(html.length > 0, "listing renders");
  });

  for (const tab of ["jeonse", "worthit", "support"]) {
    it(`tab card: ${tab}`, async () => {
      const html = renderToString(React.createElement(CardMsg,
        { msg: { id: `m-tab-${tab}`, role: "assistant", kind: "tab",
            data: { tab } },
          handlers: handlersFor(), toolRows: {} }));
      assert.ok(html.length > 0, `${tab} renders`);
    });
  }

  it("text + system messages", async () => {
    const textHtml = renderToString(React.createElement(AssistantMsg,
      { msg: { role: "assistant", kind: "text", content: "어디로 출근하세요?" }, toolRows: {} }));
    assert.ok(textHtml.includes("어디로 출근하세요?"));
    const sysHtml = renderToString(
      React.createElement(ChatSystemMessage, null, "3곳까지 고를 수 있어요"));
    assert.ok(sysHtml.includes("3곳까지 고를 수 있어요"));
  });

  it("tour card", async () => {
    const html = renderToString(React.createElement(AgentTourCard));
    assert.equal(typeof html, "string", "tour renders (null without window)");
  });

  it("stage map inside the error boundary", async () => {
    const { buildChatMap } = await import("../src/chatmap.js");
    const cands = NAMES.map((n, i) => readyCandidate(`c${i + 1}`, n));
    const map = buildChatMap({ regions: { regions: [] }, network: null,
      tiles: [], green: { water: [], parks: [] }, candidates: cands,
      picks: ["c1", "c2"], workplaceStation: "판교", tenure: "jeonse" });
    const html = renderToString(React.createElement(MsgBoundary, null,
      React.createElement(StageArea, { map, cardHi: "home:c2",
        onPinHover: () => {}, onPinClick: () => {}, onOrbRegion: () => {},
        contextLine: "판교 출근 · 후보 6곳" })));
    assert.ok(html.includes("중심 무대"), "stage section");
  });

  it("the boundary trips on error and keeps the fallback copy", async () => {
    const err = new Error("cardHi is not defined");
    assert.deepEqual(MsgBoundary.getDerivedStateFromError(err), { error: err });
    const html = renderToString(React.createElement(MsgBoundary, null,
      React.createElement("div", null, "healthy card")));
    assert.ok(html.includes("healthy card"), "healthy children pass through");
  });
});

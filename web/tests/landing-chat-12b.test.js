// 12b, A+B+E: landing → chat render scans (react-dom/server, no
// DOM). Transition URLs are pure (chatUrl); the landing, profile
// card, candidates card and the chat-reopen entry render here; the
// keyboard handler is pure over injected getters.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

register("./jsx-loader.mjs", import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));

const { renderToString } = await import("react-dom/server");
const { default: React } = await import("react");
const { Theme } = await import("@astryxdesign/core/theme");
const { neutralTheme } = await import("@astryxdesign/theme-neutral/built");
const landing = await import("../src/ui/landing.jsx");
const chat = await import("../src/ui/chat.jsx");
const { timelineKeyHandler } = await import("../src/ui/timeline.jsx");
const { EXAMPLE_PROFILE_LABEL } = await import("../src/profile.js");

function render(el) {
  return renderToString(
    React.createElement(Theme, { theme: neutralTheme, mode: "light" }, el));
}

const textOf = (html) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

describe("landing", () => {
  it("asks one question over the map (no panels, cards or timeline)", () => {
    const html = render(React.createElement(landing.Landing));
    const text = textOf(html);
    assert.ok(text.includes("계약 전에, 그 집에서 30일 먼저 살아 봐요"));
    assert.ok(text.includes("어디로 출근하고, 누구와 살고, 예산은 얼마인가요?"));
    // Scrim for contrast (radial veil, no blur — CSS-verified).
    assert.ok(html.includes("ui-landing-scrim"));
    const css = readFileSync(join(HERE, "..", "src", "ui", "ui.css"), "utf8");
    assert.ok(css.includes("ui-landing-scrim"));
    assert.ok(css.includes("radial-gradient"));
    const scrim = css.slice(css.indexOf(".ui-landing-scrim"));
    assert.ok(!scrim.slice(0, scrim.indexOf("}")).includes("backdrop-filter"),
      "scrim must not blur the city");
  });

  it("suggests the three personas (예시) + listing paste + coverage", () => {
    const html = render(React.createElement(landing.Landing));
    const text = textOf(html);
    for (const p of landing.EXAMPLE_PROMPTS) {
      assert.ok(text.includes(p.title), p.title);
      assert.ok(text.includes(p.prompt), p.prompt);
    }
    assert.equal(landing.EXAMPLE_PROMPTS.length, 4);
    assert.ok(text.includes("매물 글 붙여 넣기"));
    assert.ok(text.includes("다루는 지역 11곳"));
    for (const area of landing.COVERAGE_AREAS) {
      assert.ok(text.includes(area), area);
    }
    assert.ok(text.includes("데이터 출처"));
    // 예시 badges: one per persona card.
    const badges = text.match(/예시/g) || [];
    assert.ok(badges.length >= 3, `예시 badges: ${badges.length}`);
  });
});

describe("profile card", () => {
  const profile = {
    members: { value: [{ role: "adult" }], source: "customer" },
    workplaces: { value: [{ text: "판교", resolved: { station: "판교" } }], source: "customer" },
    tenure: { value: "jeonse", source: "customer" },
    depositMax: { value: 200000000, source: "customer" },
    salaryAnnual: { value: [40000000], source: "default", note: "기본값" },
  };

  it("renders every field with value and source", () => {
    const html = render(React.createElement(chat.ProfileCard, { profile }));
    const text = textOf(html);
    assert.ok(text.includes("고객님 상황"));
    assert.ok(text.includes("판교"));
    assert.ok(text.includes("2억 원"));
    assert.ok(text.includes("내가 말한 값"));
    assert.ok(text.includes("기본값"));
  });

  it("chips missing essentials and labels 예시 input", () => {
    const html = render(React.createElement(chat.ProfileCard, { profile, example: "x" }));
    const text = textOf(html);
    assert.ok(text.includes(EXAMPLE_PROFILE_LABEL));
    assert.ok(text.includes("출근 상한?") || text.includes("집 크기?"));
  });

  it("summarises said values as chips with a count line and 자세히", () => {
    const html = render(React.createElement(chat.ProfileCard, { profile }));
    const text = textOf(html);
    assert.ok(text.includes("1인"), "household chip");
    assert.ok(text.includes("판교 출근"), "workplace chip");
    assert.ok(text.includes("전세 2억 원 이하"), "tenure+budget chip");
    assert.match(text, /모르는 값 \d+개 — 채우면 더 정확해요/);
    assert.ok(text.includes("자세히"), "full table disclosure");
  });
});

describe("candidates card", () => {
  const candidate = (id) => ({ id, name: `집${id}`, kind: "아파트",
    region: "bundang", lon: 127.1, lat: 37.35, build_year: 2010,
    match: "register", pnu: "p", scene: "st-판교", photos: [],
    tenures: [{ tenure: "jeonse", bucket_center_m2: 60, range_m2: [55, 65],
      median_won: 200000000, min_won: 190000000, max_won: 210000000,
      deals: 4, budget_fit: "all" }],
    commute: { walk: { known: true, station: "판교", minutes: 5, source: "graph" },
      ride: { known: false } } });
  const data = (order) => ({ ok: true, sort: "commute", sort_note: "정렬: 출퇴근 짧은 순",
    total_matching: 2, candidates: order.map(candidate) });

  it("shows the sort and reorders on sort change", async () => {
    const { HOME_SORT_KO } = await import("../src/homes.js");
    const base = { tenure: "jeonse", picks: [], onTogglePick: () => {},
      onPreview3D: () => {}, onJeonse: () => {}, onRun: () => {} };
    const one = render(React.createElement(chat.CandidatesCard,
      { ...base, data: data(["a", "b"]), sort: "commute", onSort: () => {} }));
    assert.ok(textOf(one).includes(HOME_SORT_KO.commute));
    assert.ok(one.indexOf("집a") < one.indexOf("집b"));
    // The same card with a changed sort renders the new order + label.
    const two = render(React.createElement(chat.CandidatesCard,
      { ...base, data: { ...data(["b", "a"]), sort: "deals", sort_note: "정렬: 거래 많은 순" },
        sort: "deals", onSort: () => {} }));
    assert.ok(textOf(two).includes(HOME_SORT_KO.deals));
    assert.ok(two.indexOf("집b") < two.indexOf("집a"));
  });

  it("no run button in the list; the footer says what to say", () => {
    const base = { data: data(["a", "b"]), tenure: "jeonse", sort: "commute",
      onSort: () => {}, onTogglePick: () => {}, onPreview3D: () => {},
      onJeonse: () => {}, onRun: () => {} };
    const { RUN_BUTTON_LABEL } = chat;
    const none = textOf(render(React.createElement(chat.CandidatesCard,
      { ...base, picks: [] })));
    // 19a: no run button in the list; the footer says what to say.
    assert.ok(!none.includes(RUN_BUTTON_LABEL));
    assert.ok(none.includes("마음에 드는 집을 2곳 담고"));
    const two = textOf(render(React.createElement(chat.CandidatesCard,
      { ...base, picks: ["a", "b"] })));
    assert.equal(two.split(RUN_BUTTON_LABEL).length - 1, 0);
    assert.ok(two.includes("두 집에서 살아 봐 줘"));
  });
});

describe("no demo numbers without 예시", () => {
  // Fresh screens (landing, empty chat) may only show product facts
  // (30일, 11곳, 2–3곳) — never won/area/minute figures.
  const FIGURE = /\d[\d,.]*\s*(억|만(?!\s*원)|원|㎡|분|시간|%)/g;
  const ALLOWED = new Set(["30일"]);

  it("landing shows no figures outside 예시-labelled content", () => {
    let text = textOf(render(React.createElement(landing.Landing)));
    // The example prompts are the labelled-예시 exception: strip them,
    // then nothing numeric may remain but product facts.
    for (const p of landing.EXAMPLE_PROMPTS) {
      text = text.split(p.prompt).join("");
    }
    const figs = [...text.matchAll(FIGURE)].map((m) => m[0]);
    for (const f of figs) {
      assert.ok(ALLOWED.has(f) || /^(11곳|2–3곳|30일)/.test(f), `figure on landing: ${f}`);
    }
    assert.ok(!text.includes("억") && !text.includes("㎡"));
  });

  it("empty chat shows no figures", () => {
    // ChatScreen boots from effects (not run server-side): the fresh
    // render is the shell + empty screen. The 26w example cards are the
    // labelled-예시 exception (same as the landing above): strip their
    // prompts, then nothing numeric may remain but product facts.
    const html = render(React.createElement(chat.ChatScreen));
    let text = textOf(html);
    assert.ok(text.includes("예시"), "example cards labelled 예시");
    for (const p of landing.EXAMPLE_PROMPTS) {
      text = text.split(p.prompt).join("");
    }
    const figs = [...text.matchAll(FIGURE)].map((m) => m[0]).filter((f) => f !== "30일"); // 30일은 제품명(30일 살아 보기)이라 데모 수치가 아님
    assert.deepEqual(figs, []);
    // 32e: the product name in the top bar is the Ithaca logo image now.
    assert.ok(html.includes("brand/ithaca-logo.svg"), "top bar shows the Ithaca logo");
  });

  it("example input labels every card 예시", () => {
    const profile = {
      members: { value: [{ role: "adult" }], source: "customer" },
      workplaces: { value: [], source: "customer" },
    };
    const html = render(React.createElement(chat.ProfileCard, { profile, example: "x" }));
    assert.ok(textOf(html).includes(EXAMPLE_PROFILE_LABEL));
    const sim = render(React.createElement(chat.SimulationCard,
      { data: { status: "running", progress: { done: 0, total: 2, label: "" } }, example: "x" }));
    assert.ok(textOf(sim).includes(EXAMPLE_PROFILE_LABEL));
  });
});

describe("timeline keyboard", () => {
  const outings = [{ start: 501, end: 1085 }, { start: 1085, end: 1127 }];

  it("hops trips on ←/→ and toggles play on space", () => {
    const calls = [];
    const h = timelineKeyHandler({
      routeOutings: outings, minute: () => 530,
      togglePlay: () => calls.push(["play"]),
      setMinute: (m) => calls.push(["minute", m]),
    });
    h({ key: "ArrowLeft", target: { tagName: "DIV" }, preventDefault: () => {} });
    h({ key: "ArrowRight", target: { tagName: "DIV" }, preventDefault: () => {} });
    h({ code: "Space", target: { tagName: "DIV" }, preventDefault: () => {} });
    assert.deepEqual(calls, [["minute", 501], ["minute", 1085], ["play"]]);
  });

  it("stays silent while typing or at the edges", () => {
    const calls = [];
    const h = timelineKeyHandler({
      routeOutings: outings, minute: () => 100,
      togglePlay: () => calls.push(["play"]),
      setMinute: (m) => calls.push(["minute", m]),
    });
    h({ key: "ArrowLeft", target: { tagName: "INPUT" }, preventDefault: () => {} });
    h({ code: "Space", target: { tagName: "TEXTAREA" }, preventDefault: () => {} });
    h({ key: "Enter", target: { tagName: "DIV" }, preventDefault: () => {} });
    assert.deepEqual(calls, []);
  });
});

describe("chat reopen (11b carryover)", () => {
  it("every tour/sim screen offers 대화 (main.js registers openChat)", () => {
    const src = readFileSync(join(HERE, "..", "src", "main.js"), "utf8");
    assert.ok(src.includes("openChat: () =>"), "openChat action registered");
    assert.ok(src.includes("chatReopenUrl()"), "reopens via /?chat=");
    // Chat-first: sim/tour screens offer the ← 대화로 button back to the chat.
    const bar = readFileSync(join(HERE, "..", "src", "ui", "topbar.jsx"), "utf8");
    assert.ok(bar.includes("대화로"), "TopBar ← 대화로 button");
    // Unconditional: not gated on clock, follow, or night state.
    assert.ok(!/follow\s*===?\s*0\s*&&[\s\S]{0,80}대화/.test(bar), "not follow-gated");
    const app = readFileSync(join(HERE, "..", "src", "ui", "app.jsx"), "utf8");
    assert.ok(app.includes("MapTools") && app.includes("TopBar"), "sim/tour render the shared bar");
  });
});

// 31a: chat thread hierarchy — one left edge, one spacing scale, only
// real buttons look like buttons, result card reads top-down.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

register("./jsx-loader.mjs", import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));

let React;
let renderToString;
let ProfileCard;
let CandidatesCard;
let SimulationCard;
let HOME_SORT_KO;

function moneyDoc() {
  return {
    default_tenure: { A: "전세", B: "전세" },
    homes: {
      A: { qol_time: { commute_minutes_per_day: 90 },
        by_tenure: { 전세: { housing: { monthly_won: 500000, upfront_won: 200000000 },
          totals_by_category: { maintenance: -20000, transit: -3000 },
          burden_ratio: 20, remaining_won: 1000000 } } },
      B: { qol_time: { commute_minutes_per_day: 60 },
        by_tenure: { 전세: { housing: { monthly_won: 400000, upfront_won: 180000000 },
          totals_by_category: { maintenance: -20000, transit: -2000 },
          burden_ratio: 18, remaining_won: 1100000 } } },
    },
  };
}

function compareDoc() {
  return { days: 30, home_a: { label: "A" }, home_b: { label: "B" },
    metrics: [],
    members: [
      { member: "h1", label: "나",
        commute_walk_minutes: { a: 600, b: 300 },
        commute_ride_minutes: { a: 1200, b: 600 } },
    ],
    judgment: { a: {}, b: {} } };
}

function candidate(id) {
  return { id, name: `집${id}`, kind: "아파트",
    region: "bundang", lon: 127.1, lat: 37.35, build_year: 2010,
    match: "register", pnu: "p", scene: "st-판교", photos: [],
    tenures: [{ tenure: "jeonse", bucket_center_m2: 60, range_m2: [55, 65],
      median_won: 200000000, min_won: 190000000, max_won: 210000000,
      deals: 4, budget_fit: "all" }],
    commute: { walk: { known: true, station: "판교", minutes: 5, source: "graph" },
      ride: { known: false } } };
}

function doneData() {
  const lines = [];
  for (let d = 0; d < 5; d += 1) {
    lines.push({ home: d % 2 === 0 ? "A" : "B", day: d,
      minute: 480 + d * 60, text: `일기 ${d + 1}일째 기록` });
  }
  return { labels: ["A", "B"], customId: "c1",
    names: { A: "천사의도시II오피스텔", B: "시그마 3" },
    compare: compareDoc(), moneyDoc: moneyDoc(),
    momentTexts: [
      { when_ko: "3일차 17:48", home: "A", text_ko: "장보기 기록", day: 2, minute: 1068 },
      { when_ko: "1일차 07:49", home: "B", text_ko: "출근 기록" },
    ],
    moments: [],
    diary: { status: "done", summary: "두 집 요약 문장.",
      lines, check: { passed: 5, retried: 0, dropped: 0 } } };
}

before(async () => {
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
  ({ ProfileCard, CandidatesCard, SimulationCard } = await import("../src/ui/chat.jsx"));
  ({ HOME_SORT_KO } = await import("../src/homes.js"));
});

describe("31a source: no fake buttons", () => {
  it("chat.jsx has no ui-mark and no scene ghost buttons", () => {
    const src = readFileSync(join(HERE, "..", "src", "ui", "chat.jsx"), "utf8");
    assert.ok(!src.includes("ui-mark"), "no ui-mark avatar");
    assert.ok(!src.includes('label="장면 보기"'), "no 장면 보기 button");
    assert.ok(!src.includes('label="3D로 보기 →"'), "no 3D로 보기 button");
  });
});

describe("31a ProfileCard: facts are one plain line", () => {
  const profile = {
    members: { value: [{ role: "adult" }], source: "customer" },
    workplaces: { value: [{ text: "판교", resolved: { station: "판교" } }], source: "customer" },
    tenure: { value: "jeonse", source: "customer" },
    depositMax: { value: 200000000, source: "customer" },
  };

  it("joins three said facts with · and renders no ui-tag", () => {
    const html = renderToString(React.createElement(ProfileCard, { profile }));
    assert.ok(!html.includes("ui-tag"), "no tag pills");
    assert.ok(html.includes("1인 · 판교 출근 · 전세 2억 원 이하"), "one joined line");
  });
});

describe("31a CandidatesCard: actions hide with 0 homes", () => {
  const base = { tenure: "jeonse", sort: "commute", onSort: () => {},
    picks: [], onTogglePick: () => {}, onPreview3D: () => {},
    onJeonse: () => {}, onRun: () => {} };

  it("shows no sort menu and no map button when empty", () => {
    const html = renderToString(React.createElement(CandidatesCard,
      { ...base, data: { ok: true, total_matching: 0, candidates: [] } }));
    assert.ok(!html.includes(HOME_SORT_KO.commute), "no sort menu");
    assert.ok(!html.includes("지도에서 보기"), "no map button");
  });

  it("shows both on their own row with 2 homes", () => {
    const html = renderToString(React.createElement(CandidatesCard,
      { ...base, data: { ok: true, sort_note: "정렬: 출퇴근 짧은 순",
        total_matching: 2, candidates: [candidate("a"), candidate("b")] } }));
    assert.ok(html.includes(HOME_SORT_KO.commute), "sort menu present");
    assert.ok(html.includes("지도에서 보기"), "map button present");
  });
});

describe("31a done SimulationCard reads top-down", () => {
  it("orders compare, 살아 보니, 살아 본 일기", () => {
    const html = renderToString(
      React.createElement(SimulationCard, { data: doneData() }));
    const grid = html.indexOf("월 주거비");
    const lived = html.indexOf("살아 보니");
    const diary = html.indexOf("살아 본 일기");
    assert.ok(grid > 0 && lived > 0 && diary > 0, "all three sections render");
    assert.ok(grid < lived && lived < diary, "compare first, diary last");
    assert.ok(!html.includes("3D로 보기"), "no ghost scene buttons");
  });

  it("shows 3 diary row links before the show-all button", () => {
    const html = renderToString(
      React.createElement(SimulationCard, { data: doneData() }));
    const labels = html.match(/aria-label="장면 보기:/g) || [];
    assert.equal(labels.length, 4, "3 diary rows + 1 살아 보니 row link");
    const diaryPart = html.split("살아 본 일기")[1].split("일기 5줄 모두 보기")[0];
    assert.equal((diaryPart.match(/aria-label="장면 보기:/g) || []).length, 3,
      "exactly 3 diary rows before the button");
    assert.ok(html.includes("✓ 문장 5개 모두 기록과 대조"), "check line kept");
  });
});

describe("31a thread CSS", () => {
  function threadChunks() {
    const css = readFileSync(join(HERE, "..", "src", "ui", "ui.css"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    const out = [];
    for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const sels = m[1].split(",").map((s) => s.trim()).filter(Boolean);
      const thread = sels.some((s) => /^\.(ui-chat|ui-tag|ui-result|ui-cite|ui-src|ui-cand|ui-section|ui-mark)/.test(s)
        && !/^\.(ui-chatmap|ui-picks|ui-stage|ui-legend|ui-side-panel)/.test(s));
      if (thread) out.push(m[0]);
    }
    return out.join("\n");
  }

  it("uses only the four thread type sizes and never truncates", () => {
    const thread = threadChunks();
    assert.ok(thread.length > 0, "thread rules found");
    for (const px of [10, 11, 13, 15]) {
      assert.ok(!new RegExp(`font-size:\\s*${px}px`).test(thread),
        `no ${px}px in thread rules`);
    }
    assert.ok(!thread.includes("ellipsis"), "no ellipsis in thread rules");
  });
});

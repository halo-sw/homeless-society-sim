// Stage 29a2: the candidate list informs — total-first commute rows,
// budget differences, pick counter, one photo notice, more button.
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
let CandidateCard;
let CandidatesCard;
let commuteRowLine;
let factsFor;
let tenurePriceLine;
let tr;

function yangjaeRide() {
  return { id: "y1", name: "양재 테스트집", kind: "아파트",
    lon: 127.03, lat: 37.48, build_year: 2005,
    tenures: [{ tenure: "jeonse", median_won: 287800000,
      min_won: 270000000, max_won: 300000000, deals: 9,
      budget_fit: "all", bucket_center_m2: 60 }],
    commute: { walk: { known: true, station: "양재", minutes: 9 },
      ride: { known: true, minutes: 11, lines: [], transfers: [] } } };
}

function rowCandidate(id, name) {
  return { id, name, kind: "오피스텔", lon: 127.1, lat: 37.4,
    build_year: 2003,
    tenures: [{ tenure: "jeonse", median_won: 287800000,
      min_won: 270000000, max_won: 300000000, deals: 9,
      budget_fit: "all", bucket_center_m2: 60 }],
    commute: { walk: { known: true, station: "양재", minutes: 9 },
      ride: { known: true, minutes: 11, lines: [], transfers: [] } } };
}

const noop = () => {};

before(async () => {
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
  ({ CandidateCard, commuteRowLine, factsFor, tenurePriceLine } =
    await import("../src/ui/candidate-card.jsx"));
  ({ CandidatesCard } = await import("../src/ui/chat.jsx"));
  const { createTranslator } = await import("../src/i18n/translate.js");
  const { phrases, patterns } = await import("../src/i18n/en.js");
  const { WORDS } = await import("../src/i18n/en-words.js");
  tr = createTranslator({ phrases, patterns, words: WORDS });
});

describe("29a2 candidate list", () => {
  it("commute row leads with the total: walk 9 + ride 11", () => {
    const line = commuteRowLine(yangjaeRide(), "강남");
    assert.equal(line.text, "총 20분 · 양재역 걸어서 9분 + 지하철 11분");
    const en = tr.translate(line.text);
    assert.ok(en.includes("Total 20 min"), en);
    assert.ok(en.includes("Yangjae"), en);
    assert.ok(!en.includes("9 walk to"), en);
  });

  it("the old pattern never swallows a tail into {1}", () => {
    const en = tr.translate("강남까지 약 11분 · 양재역 걸어서 9분");
    assert.ok(!en.includes("walk to 11"), en);
  });

  it("factsFor names the budget difference, falls back without a budget", () => {
    const c = yangjaeRide();
    const price = tenurePriceLine(c, "jeonse");
    const withBudget = factsFor(c, price, 400000000, "jeonse");
    assert.ok(withBudget.some((f) => f.includes("예산보다 1억 1,220만 적어요")),
      withBudget.join(" · "));
    const noBudget = factsFor(c, price, null, "jeonse");
    assert.ok(noBudget.some((f) => f.includes("예산 안")), noBudget.join(" · "));
  });

  it("a 3-row list shows one notice, named pick buttons, a pick counter", () => {
    const cands = [rowCandidate("c1", "A집"), rowCandidate("c2", "B집"), rowCandidate("c3", "C집")];
    const html = renderToString(React.createElement(CandidatesCard,
      { data: { candidates: cands, total_matching: 3, sort_note: "" },
        tenure: "jeonse", sort: "commute", onSort: noop,
        picks: [], onTogglePick: noop, onPreview3D: noop,
        onJeonse: noop, onRun: noop, onDetail: noop, onHover: noop,
        photoDeps: {}, destName: "강남", budgetWon: 400000000 }));
    const notice = "사진은 항공사진·3D 미리보기예요(실제 매물 사진 아님)";
    assert.equal(html.split(notice).length - 1, 1, "one photo notice line");
    assert.ok(!html.includes("ui-aerial-label"), "no per-row aerial label");
    for (const n of ["A집", "B집", "C집"]) {
      assert.ok(html.includes(`aria-label="${n} 담기"`) || html.includes(`Pick ${n}`)
        || (html.includes("Pick") && html.includes(`aria-label="${n}"`)), `pick button names ${n}`);
    }
    assert.ok(html.includes("2곳 중 0곳 담음"), "pick counter");
    assert.ok(html.includes("예산보다 1억 1,220만 적어요"), "budget difference on the card");
  });

  it("more button shows the remaining count and translates", () => {
    const cands = [rowCandidate("c1", "A집"), rowCandidate("c2", "B집"), rowCandidate("c3", "C집")];
    const html = renderToString(React.createElement(CandidatesCard,
      { data: { candidates: cands, total_matching: 9, sort_note: "" },
        tenure: "jeonse", sort: "commute", onSort: noop,
        picks: [], onTogglePick: noop, onPreview3D: noop,
        onJeonse: noop, onRun: noop, onDetail: noop, onHover: noop,
        photoDeps: {}, destName: "강남" }));
    assert.ok(html.includes("다른 후보 6곳 더 보기 · 남은 6곳"), "more button with the page and the remainder");
    assert.equal(tr.translate("다른 후보 6곳 더 보기 · 남은 6곳"), "Show 6 more · 6 left");
  });

  it("en.js carries the 27j rules-path lines in English", () => {
    const src = readFileSync(join(HERE, "..", "src", "i18n", "en.js"), "utf8");
    assert.ok(src.includes("Muse가 이어받아요"), "late-answer line present");
    const en = tr.translate("Muse 답이 늦어서 이번엔 규칙으로 답했어요. 다시 말하면 Muse가 이어받아요");
    assert.ok(!/[가-힣]/.test(en), `translated to English: ${en}`);
  });
});

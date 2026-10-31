// Stage 31h — map controls: a filter chip row on top, one control
// stack bottom-right (my location, zoom, fit). node --test, no network.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

register("./jsx-loader.mjs", import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const chatmapSrc = readFileSync(join(HERE, "..", "src", "ui", "chatmap.jsx"), "utf8");
const chatSrc = readFileSync(join(HERE, "..", "src", "ui", "chat.jsx"), "utf8");
const css = readFileSync(join(HERE, "..", "src", "ui", "ui.css"), "utf8");

let React;
let renderToString;
let ChatMap;
let StageArea;
let buildChatMap;
let mapFilterChips;
let filterPatch;
let locateResult;

before(async () => {
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
  ({ ChatMap } = await import("../src/ui/chatmap.jsx"));
  ({ StageArea } = await import("../src/ui/chat.jsx"));
  ({ mapFilterChips, filterPatch, locateResult } =
    await import("../src/ui/map-filters.js"));
  ({ buildChatMap } = await import("../src/chatmap.js"));
});

const F = (value) => ({ value, source: "customer" });

function krProfile(patch = {}) {
  return {
    tenure: F("jeonse"),
    depositMax: F(300000000),
    monthlyMax: F(null),
    priceMax: F(null),
    commuteMax: F(30),
    home_kinds: F([]),
    currency: F("KRW"),
    ...patch,
  };
}

function usdProfile(patch = {}) {
  return {
    tenure: F("undecided"),
    depositMax: F(null),
    monthlyMax: F(3500),
    priceMax: F(null),
    commuteMax: F(30),
    home_kinds: F([]),
    currency: F("USD"),
    ...patch,
  };
}

function chipByKey(chips, key) {
  const chip = chips.find((c) => c.key === key);
  assert.ok(chip, `chip ${key} present`);
  return chip;
}

function testMap() {
  const cand = (id, lon, lat, kind) => ({ id, name: `집${id}`,
    lon, lat, kind, commute: { work: { minutes: 20 } },
    tenures: [{ tenure: "jeonse", median_won: 200000000, deals: 5 }] });
  return buildChatMap({
    regions: { regions: [
      { id: "wide", label: "넓은 지역", bbox: [127.0, 37.35, 127.14, 37.55] },
    ] },
    network: null, tiles: [], green: { water: [], parks: [] },
    candidates: [cand("h-1", 127.11, 37.394, "아파트"),
      cand("h-2", 127.12, 37.395, "오피스텔")],
    picks: [], workplaceStation: null, tenure: "jeonse",
  });
}

describe("31h filter model", () => {
  it("labels a set KR jeonse budget 3억 이하", () => {
    const chips = mapFilterChips(krProfile(), { kindsAvailable: [] });
    const budget = chipByKey(chips, "budget");
    assert.equal(budget.label, "3억 이하");
    assert.equal(budget.set, true);
  });

  it("turns 월세 into a tenure patch", () => {
    assert.deepEqual(filterPatch("tenure", "wolse", krProfile()), { tenure: "wolse" });
  });

  it("turns a jeonse 2억 budget into a depositMax patch", () => {
    assert.deepEqual(filterPatch("budget", 200000000, krProfile()),
      { depositMax: 200000000 });
  });

  it("clears commuteMax on 상관없어요", () => {
    const patch = filterPatch("commute", null, krProfile());
    assert.ok("commuteMax" in patch, "patch names commuteMax");
    assert.equal(patch.commuteMax, null);
    const chips = mapFilterChips(krProfile(), { kindsAvailable: [] });
    const commute = chipByKey(chips, "commute");
    assert.equal(commute.label, "출근 30분 이내");
    const clear = commute.options.find((o) => o.label === "상관없어요");
    assert.ok(clear && clear.value === null, "상관없어요 clears");
  });

  it("hides the tenure chip on USD and offers dollar budgets", () => {
    const chips = mapFilterChips(usdProfile(), { kindsAvailable: [] });
    assert.ok(!chips.some((c) => c.key === "tenure"), "no tenure chip for USD");
    const budget = chipByKey(chips, "budget");
    assert.equal(budget.label, "$3,500 이하");
    assert.ok(budget.options.length > 0, "USD budget options");
    assert.ok(budget.options.every((o) => o.label.startsWith("$")
      && o.label.endsWith("이하")), "dollar labels");
  });

  it("shows home kinds from the current candidates", () => {
    const chips = mapFilterChips(krProfile(), { kindsAvailable: ["아파트", "오피스텔"] });
    const kind = chipByKey(chips, "kind");
    assert.equal(kind.label, "집 종류");
    assert.equal(kind.set, false);
    assert.deepEqual(kind.options.map((o) => o.value), ["아파트", "오피스텔"]);
    const set = mapFilterChips(
      krProfile({ home_kinds: F(["아파트"]) }), { kindsAvailable: ["아파트", "오피스텔"] });
    assert.equal(chipByKey(set, "kind").label, "아파트");
    assert.deepEqual(filterPatch("kind", "오피스텔", krProfile()),
      { home_kinds: ["오피스텔"] });
  });

  it("leaves the kind chip out with no candidate kinds", () => {
    const chips = mapFilterChips(krProfile(), { kindsAvailable: [] });
    assert.ok(!chips.some((c) => c.key === "kind"), "no kind chip");
  });
});

describe("31h locateResult", () => {
  const extent = { minLon: 127, minLat: 37, maxLon: 128, maxLat: 38, W: 640, H: 420 };

  it("lands an inside fix on the stage", () => {
    const r = locateResult(
      { coords: { latitude: 37.5, longitude: 127.5 } }, extent);
    assert.equal(r.inside, true);
    assert.equal(r.x, 320);
    assert.equal(r.y, 210);
  });

  it("rejects an outside fix", () => {
    const r = locateResult(
      { coords: { latitude: 37.5, longitude: 129 } }, extent);
    assert.equal(r.inside, false);
    assert.equal(r.x, null);
    assert.equal(r.y, null);
  });
});

describe("31h SSR StageArea / ChatMap", () => {
  function stageHtml(props = {}) {
    return renderToString(React.createElement(StageArea, {
      map: testMap(), contextLine: "판교 출근 · 후보 2곳",
      profile: krProfile(), kindsAvailable: ["아파트", "오피스텔"],
      onFilterChange() {}, onClose() {}, ...props,
    }));
  }

  it("renders a chip row with the chips", () => {
    const html = stageHtml();
    assert.ok(html.includes("ui-chatmap-filters"), "chip row");
    assert.ok(html.includes('aria-label="지도 조건"'), "chip group label");
    assert.ok(html.includes("전세"), "tenure chip set");
    assert.ok(html.includes("3억 이하"), "budget chip set");
    assert.ok(html.includes("출근 30분 이내"), "commute chip set");
    assert.ok(html.includes("집 종류"), "kind chip");
    assert.ok(html.includes("판교 출근 · 후보 2곳"), "title stays");
  });

  it("renders four control buttons and no 맞추기", async () => {
    const html = stageHtml();
    for (const label of ["내 위치", "확대", "축소", "후보 모두 보기"]) {
      assert.ok(html.includes(`aria-label="${label}"`), label);
    }
    assert.ok(!html.includes("맞추기"), "no 맞추기 text button");
    const mapHtml = renderToString(React.createElement(ChatMap, { map: testMap() }));
    for (const label of ["내 위치", "확대", "축소", "후보 모두 보기"]) {
      assert.ok(mapHtml.includes(`aria-label="${label}"`), `ChatMap ${label}`);
    }
    assert.ok(!mapHtml.includes("맞추기"), "ChatMap has no 맞추기");
  });

  it("keeps older callers chip-free", () => {
    const html = renderToString(React.createElement(StageArea,
      { map: testMap(), onClose() {} }));
    assert.ok(!html.includes("ui-chatmap-filters"), "no chip row without a profile");
  });
});

describe("31h source pins", () => {
  it("reads the position only inside the click handler and never stores it", () => {
    const calls = chatmapSrc.split("getCurrentPosition").length - 1;
    assert.equal(calls, 1, "one getCurrentPosition call");
    assert.ok(chatmapSrc.includes("onLocate"), "inside the locate handler");
    assert.ok(chatmapSrc.includes("enableHighAccuracy: false"), "no high accuracy");
    assert.ok(chatmapSrc.includes("timeout: 8000"), "8 s timeout");
    assert.ok(chatmapSrc.includes("maximumAge: 60000"), "1 min cache");
    assert.ok(!chatmapSrc.includes("localStorage"), "never stored");
    assert.ok(!chatmapSrc.includes("fetch("), "never sent");
  });

  it("re-runs the search through the intake path, with no new search logic", () => {
    const m = chatSrc.match(/function handleFilterChange[\s\S]*?\n  \}/);
    assert.ok(m, "handleFilterChange found");
    assert.ok(m[0].includes("applyIntakePatch(profileRef.current"),
      "same merge as the intake");
    assert.ok(m[0].includes("setProfile("), "profile updated");
    assert.ok(m[0].includes("store.set({ chatSummary"), "summary stored");
    assert.ok(m[0].includes("liveResearch(merged)"), "live research re-runs");
    assert.ok(!m[0].includes("searchStep"), "no new search logic");
  });

  it("opens chips as real menus with the sort-menu check", () => {
    assert.ok(chatSrc.includes("renderTrigger"), "custom chip trigger");
    assert.ok(chatSrc.includes("filterPatch(chip.key, o.value, profile)"),
      "option becomes an intake patch");
    assert.ok(chatSrc.includes("${o.selected ? \"✓ \" : \"\"}"),
      "selected option wears ✓ like the sort menu");
  });
});

describe("31h css", () => {
  it("lays the chip row out on one scrolling line", () => {
    const row = css.match(/\.ui-chatmap-filters\s*\{[^}]*\}/);
    assert.ok(row, "chip row rule present");
    assert.ok(row[0].includes("flex-wrap: nowrap"), "never wraps");
    assert.ok(row[0].includes("overflow-x: auto"), "scrolls sideways");
    assert.ok(row[0].includes("var(--ds-s-12)"), "12 px top-left from a token");
  });

  it("paints set chips filled and unset chips on the float surface", () => {
    const chip = css.match(/\.ui-chatmap-chip\s*\{[^}]*\}/);
    assert.ok(chip, "chip rule present");
    assert.ok(chip[0].includes("var(--ds-s-32)"), "32 px tall from a token");
    assert.ok(chip[0].includes("var(--ds-r-pill)"), "pill radius");
    const set = css.match(/\.ui-chatmap-chip\.is-set\s*\{[^}]*\}/);
    assert.ok(set, "set-chip rule present");
    assert.ok(set[0].includes("var(--ds-action)"), "filled ink");
    assert.ok(set[0].includes("var(--ds-surface)"), "white text");
  });

  it("drops the title and legend one line under the chips", () => {
    const title = css.match(/\.ui-chat-stage\.has-filters \.ui-stage-title\s*\{[^}]*\}/);
    assert.ok(title, "title shift rule present");
    const legend = css.match(/\.ui-chatmap-legend\.has-filters\s*\{[^}]*\}/);
    assert.ok(legend, "legend shift rule present");
    assert.ok(!legend[0].includes("bottom:"), "legend stays top-anchored");
  });
});

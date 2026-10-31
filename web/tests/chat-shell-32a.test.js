// Stage 32a — the chat shell on the ai-chat structure: one surface,
// resizable thread, full-map mode, composer drawer, per-language live
// rows, metadata source footers, Banner replay notice, map empty state.
// node --test, no network.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

register("./jsx-loader.mjs", import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(join(HERE, "..", "src", "ui", "chat.jsx"), "utf8");
const chatSrc = readFileSync(join(HERE, "..", "src", "ui", "chat.jsx"), "utf8");
const uiCss = readFileSync(join(HERE, "..", "src", "ui", "ui.css"), "utf8");

let React;
let renderToString;
let liveRowLine;
let suggestionDrawerFor;
let ReplayNotice;
let ThreadList;
let StageArea;
let PicksTray;
let loadThreadWidth;
let saveThreadWidth;
let threadWidthKey;
let compactTrayVisible;
let stageTrayVisible;
let TOOL_ACTION_KO;
let TOOL_ACTION_EN;
let toolActionEn;
let translateExact;
let ChatComposerDrawer;
let ChatMessageMetadata;
let Badge;
let Banner;
let CiteRows;
let buildChatMap;

before(async () => {
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
  ({ liveRowLine, suggestionDrawerFor, ReplayNotice, ThreadList, StageArea,
    PicksTray, loadThreadWidth, saveThreadWidth, threadWidthKey,
    compactTrayVisible, stageTrayVisible } =
    await import("../src/ui/chat.jsx"));
  ({ TOOL_ACTION_KO, TOOL_ACTION_EN, toolActionEn } =
    await import("../src/ui/agent-float.js"));
  ({ translateExact } = await import("../src/i18n/translate.js"));
  ({ ChatComposerDrawer, ChatMessageMetadata } = await import("@astryxdesign/core/Chat"));
  ({ Badge } = await import("@astryxdesign/core/Badge"));
  ({ Banner } = await import("@astryxdesign/core/Banner"));
  ({ CiteRows } = await import("../src/ui/consult.jsx"));
  ({ buildChatMap } = await import("../src/chatmap.js"));
});

const HANGUL = /[가-힣]/;

describe("32a liveRowLine per language", () => {
  it("EN shows the label alone when the tail has no exact translation", () => {
    const line = liveRowLine(
      { name: "extract_profile", summary: "프로필 읽기(1개 물어봄)" }, "en");
    assert.ok(!HANGUL.test(line), `no Hangul: ${line}`);
    for (const bad of ["Ikgi", "Chatgi", "Muleobom", "Sanghwang", "Peuropil"]) {
      assert.ok(!line.includes(bad), `no romanized ${bad}: ${line}`);
    }
    assert.ok(line === "✓ Reading your situation"
      || line.startsWith("✓ Reading your situation ·"),
      `label alone or with an exact tail: ${line}`);
  });

  it("EN keeps an exactly translated tail", () => {
    const line = liveRowLine({ name: "open_panel", summary: "화면 열기: 지도" }, "en");
    assert.ok(!HANGUL.test(line), `no Hangul: ${line}`);
    assert.ok(line.includes("Opening a view"), `label: ${line}`);
  });

  it("KO open_panel drops the leftover separator", () => {
    assert.equal(liveRowLine({ name: "open_panel", summary: "화면 열기: 지도" }, "ko"),
      "✓ 화면 열기 · 지도");
  });

  it("KO default still reads Korean", () => {
    assert.ok(liveRowLine({ name: "find_homes", pending: true }).includes("후보 찾기 중"));
  });
});

describe("32a TOOL_ACTION_EN", () => {
  it("covers every TOOL_ACTION_KO key with Hangul-free labels", () => {
    for (const key of Object.keys(TOOL_ACTION_KO)) {
      assert.equal(typeof TOOL_ACTION_EN[key], "string", `EN label for ${key}`);
      assert.ok(!HANGUL.test(TOOL_ACTION_EN[key]), `no Hangul in ${key}`);
    }
    assert.equal(toolActionEn("extract_profile"), "Reading your situation");
    assert.equal(toolActionEn("find_homes"), "Finding homes");
    assert.equal(toolActionEn("open_panel"), "Opening a view");
  });
});

describe("32a translateExact", () => {
  it("returns null for unknown Korean, the table value for known", () => {
    assert.equal(translateExact("프로필 읽기(1개 물어봄)"), null);
    assert.equal(translateExact("대화"), "Chat");
  });
});

describe("32a thread width memory", () => {
  it("clamps, namespaces per viewer, and survives without storage", () => {
    assert.equal(threadWidthKey("chat"), "ui-chat-thread-w:chat");
    assert.equal(loadThreadWidth("chat"), null, "no window in node");
    assert.doesNotThrow(() => saveThreadWidth("chat", 500), "save without window");
    const store = new Map();
    globalThis.window = { localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => { store.set(k, String(v)); },
    } };
    try {
      saveThreadWidth("chat", 500);
      assert.equal(loadThreadWidth("chat"), 500);
      saveThreadWidth("chat", 50);
      assert.equal(loadThreadWidth("chat"), 320, "floor wins");
      saveThreadWidth("chat", 5000);
      assert.equal(loadThreadWidth("chat"), 720, "ceiling wins");
      store.set("ui-chat-thread-w:chat", "junk");
      assert.equal(loadThreadWidth("chat"), null, "junk reads as missing");
    } finally {
      delete globalThis.window;
    }
    assert.equal(loadThreadWidth("chat"), null, "works without storage again");
  });
});

describe("32a SSR chat shell", () => {
  it("ThreadList is a top-aligned ChatMessageList", () => {
    const el = ThreadList({ children: [] });
    assert.equal(el.props.align, "top");
    const html = renderToString(React.createElement(ThreadList, null, "hi"));
    assert.ok(html.includes("astryx-chat-message-list"), "list renders");
  });

  it("suggestions render inside the composer drawer, not a sibling row", () => {
    const noop = () => {};
    const el = suggestionDrawerFor({ messages: [{ role: "assistant", content: "a" }],
      chipsNearBottom: true, museFails: 0, replayId: null, profile: null,
      onSend: noop, onAction: noop, onReplay: noop });
    assert.equal(el.type, ChatComposerDrawer);
    assert.equal(el.props.label, "이어서 해 볼 것");
    assert.equal(el.props.count, 3, "three fallback chips");
    const html = renderToString(el);
    assert.ok(html.includes("이어서 해 볼 것"), "drawer label renders");
    assert.ok(html.includes("매물 글 붙여 넣기"), "chips wrap inside the drawer");
    assert.equal(suggestionDrawerFor({ messages: [], chipsNearBottom: true,
      museFails: 0, replayId: null, profile: null,
      onSend: noop, onAction: noop, onReplay: noop }), null, "empty folds");
    const at = chatSrc.indexOf("ui-chat-chips");
    assert.ok(at > chatSrc.indexOf("function suggestionDrawerFor")
      && at < chatSrc.indexOf("function ReplayNotice"),
      "the chip row lives inside the drawer builder only");
    assert.ok(chatSrc.includes("drawer={suggestionDrawer}"), "composer takes the drawer");
  });

  it("the replay notice renders through Banner with both actions", () => {
    const html = renderToString(React.createElement(ReplayNotice,
      { replayMeta: { model: "Muse Spark", recordedAt: "2026-10-01" },
        onSkip: () => {}, onExit: () => {} }));
    assert.ok(html.includes("astryx-banner"), "Banner frame");
    assert.ok(html.includes("기록된 대화"), "same notice text");
    assert.ok(html.includes("건너뛰기"), "Skip action");
    assert.ok(html.includes("직접 해 보기"), "Try-it-yourself action");
    assert.ok(chatSrc.includes("replayId && replaying"), "notice shows while replaying");
  });

  it("sources render as neutral Badges in the metadata footer", () => {
    const html = renderToString(React.createElement(CiteRows,
      { tools: [], sourceIds: ["rtms"] }));
    assert.ok(html.includes("확인한 출처"), "sources line kept");
    assert.ok(html.includes("astryx-badge"), "Badge renders");
    assert.ok(html.includes('data-variant="neutral"'), "neutral variant");
    assert.ok(html.includes("실거래가(국토부)"), "short name");
    assert.ok(html.includes('title="국토교통부 실거래가 공개시스템 (RTMS)"'),
      "full name in title");
  });

  it("with a stage, the shell renders the full-map button with a11y names", () => {
    const html = renderToString(React.createElement(StageArea,
      { map: { regions: [] }, onClose: () => {} }));
    assert.ok(html.includes("중심 무대"), "stage section");
    assert.ok(html.includes("작업판 닫기"), "close stays");
    assert.ok(html.includes("지도 크게 보기"), "expand label");
    assert.ok(html.includes('aria-label="지도 크게 보기"'), "expand aria-label");
    assert.ok(html.includes('title="지도 크게 보기"'), "expand title");
    assert.ok(html.includes("<svg"), "two-panels icon");
    const full = renderToString(React.createElement(StageArea,
      { map: { regions: [] }, onClose: () => {}, fullMap: true }));
    assert.ok(full.includes("대화 같이 보기"), "button reads back in full-map");
    assert.ok(chatSrc.includes("ResizeHandle resizable={threadResize.props}"),
      "thread resizes through the ResizeHandle");
    assert.ok(chatSrc.includes("workOpen && !fullMap"), "handle hides in full-map");
  });

  it("map empty state hides filters and legend until candidates arrive", async () => {
    const F = (value) => ({ value, source: "customer" });
    const profile = { tenure: F("jeonse"), depositMax: F(300000000),
      monthlyMax: F(null), priceMax: F(null), commuteMax: F(30),
      home_kinds: F([]), currency: F("KRW") };
    const cand = (id, lon, lat, kind) => ({ id, name: `집${id}`,
      lon, lat, kind, commute: { work: { minutes: 20 } },
      tenures: [{ tenure: "jeonse", median_won: 200000000, deals: 5 }] });
    const withCands = buildChatMap({
      regions: { regions: [{ id: "wide", label: "넓은 지역",
        bbox: [127.0, 37.35, 127.14, 37.55] }] },
      network: null, tiles: [], green: { water: [], parks: [] },
      candidates: [cand("h-1", 127.11, 37.394, "아파트")],
      picks: [], workplaceStation: null, tenure: "jeonse" });
    const full = renderToString(React.createElement(StageArea,
      { map: withCands, contextLine: "판교 출근 · 후보 1곳", profile,
        kindsAvailable: ["아파트"], onFilterChange() {}, onClose() {} }));
    assert.ok(full.includes("ui-chatmap-filters"), "filters with candidates");
    assert.ok(full.includes("ui-chatmap-legend"), "legend with candidates");
    const emptyMap = buildChatMap({
      regions: { regions: [{ id: "wide", label: "넓은 지역",
        bbox: [127.0, 37.35, 127.14, 37.55] }] },
      network: null, tiles: [], green: { water: [], parks: [] },
      candidates: [], picks: [], workplaceStation: null, tenure: "jeonse" });
    const empty = renderToString(React.createElement(StageArea,
      { map: emptyMap, contextLine: "", profile,
        kindsAvailable: [], onFilterChange() {}, onClose() {} }));
    assert.ok(!empty.includes("ui-chatmap-filters"), "no filter row when empty");
    assert.ok(!empty.includes("ui-chatmap-legend"), "no legend when empty");
  });
});

describe("32a shell CSS", () => {
  it("paints page and thread with the same token", () => {
    const page = uiCss.match(/\.ui-chat\s*\{[^}]*\}/)[0];
    const thread = uiCss.match(/\.ui-chat-thread\s*\{[^}]*\}/)[0];
    const token = (rule) => (rule.match(/background:\s*(var\([^)]*\))/) || [])[1];
    assert.ok(token(page), "page sets a background token");
    assert.equal(token(thread), token(page), "thread uses the page token");
  });

  it("keeps one 900 px breakpoint and no ellipsis", () => {
    assert.ok(uiCss.includes("(max-width: 900px)"), "single narrow breakpoint");
    // Every 900 px block concatenated, so a match proves the rule sits
    // under the breakpoint (the base .ui-chat-narrowtabs rule is none).
    const blocks = [];
    let from = 0;
    for (;;) {
      const at = uiCss.indexOf("@media (max-width: 900px)", from);
      if (at < 0) break;
      let depth = 0;
      let end = -1;
      for (let i = at; i < uiCss.length; i += 1) {
        if (uiCss[i] === "{") depth += 1;
        if (uiCss[i] === "}") {
          depth -= 1;
          if (depth === 0) { end = i; break; }
        }
      }
      assert.ok(end > at, "balanced braces in 900 px block");
      blocks.push(uiCss.slice(at, end + 1));
      from = end + 1;
    }
    assert.ok(blocks.length > 0, "900 px block present");
    const narrow = blocks.join("\n");
    assert.ok(/\.ui-chat-narrowtabs\s*\{[^}]*display:\s*block/.test(narrow),
      "pane toggle shows under the 900 px breakpoint");
    assert.ok(/\.ui-chat-stage\s*\{\s*display:\s*none/.test(narrow),
      "stage hides under the 900 px breakpoint");
    assert.ok(!uiCss.includes("ellipsis"), "no ellipsis");
  });
});

describe("32a2 thread width source", () => {
  it("useResizable reads the split container with a percent default and autoSaveId", () => {
    assert.ok(chatSrc.includes('from "@astryxdesign/core/Resizable/utils"'),
      "percent/pixel import from Resizable/utils");
    const at = chatSrc.indexOf("const threadResize = useResizable({");
    assert.ok(at >= 0, "thread hook present");
    const call = chatSrc.slice(at, at + 600);
    assert.ok(call.includes("containerRef"), "percentage basis is the container");
    assert.ok(call.includes("ref={splitRef}") || chatSrc.includes("ref={splitRef}"),
      "split container owns the ref");
    assert.ok(call.includes("percent("), "structured percent default");
    assert.ok(call.includes("percent(36"), "36% default");
    assert.ok(call.includes("pixel(380)"), "380 px floor");
    assert.ok(call.includes("autoSaveId"), "hook persists the size");
    assert.ok(call.includes('"ithaca-thread"'), "ithaca-thread save id");
    assert.ok(!call.includes("loadThreadWidth"), "no hand-rolled default");
    assert.ok(!call.includes("onSizeChange"), "no hand-rolled save");
  });

  it("goes full width without handle or width style at <= 900 px", () => {
    assert.ok(chatSrc.includes("style={workOpen && !narrow ? { width: threadWidth } : undefined}"),
      "no width style while narrow");
    assert.ok(chatSrc.includes("workOpen && !fullMap && !narrow"),
      "no ResizeHandle while narrow");
  });

  it("the drawer starts collapsed and folds after a chip is used", () => {
    assert.ok(chatSrc.includes("open: drawerOpen, onOpenChange: setDrawerOpen"),
      "shell owns the drawer state");
    assert.ok(chatSrc.includes("isCollapsed={onOpenChange ? !open : undefined}"),
      "controlled collapse with an uncontrolled fallback");
    for (const fn of ["onSend: (text) => { setDrawerOpen(false);",
      "onAction: (chip) => { setDrawerOpen(false);",
      "onReplay: () => { setDrawerOpen(false);"]) {
      assert.ok(chatSrc.includes(fn), `folds after use: ${fn.slice(0, 12)}`);
    }
  });

  it("tray placement never puts the full tray on the narrow chat pane", () => {
    assert.ok(chatSrc.includes("compactTrayVisible({ narrow, view })"),
      "compact row gated to the narrow chat pane");
    assert.ok(chatSrc.includes("stageTrayVisible({ narrow, view })"),
      "stage tray gated off the narrow chat pane");
    assert.equal(compactTrayVisible({ narrow: true, view: "chat" }), true);
    assert.equal(compactTrayVisible({ narrow: false, view: "chat" }), false);
    assert.equal(stageTrayVisible({ narrow: true, view: "chat" }), false);
    assert.equal(stageTrayVisible({ narrow: true, view: "work" }), true);
  });
});

describe("32a2 shell CSS", () => {
  function mediaBlocks(query) {
    const blocks = [];
    let from = 0;
    for (;;) {
      const at = uiCss.indexOf(`@media (${query})`, from);
      if (at < 0) break;
      let depth = 0;
      let end = -1;
      for (let i = at; i < uiCss.length; i += 1) {
        if (uiCss[i] === "{") depth += 1;
        if (uiCss[i] === "}") {
          depth -= 1;
          if (depth === 0) { end = i; break; }
        }
      }
      assert.ok(end > at, `balanced braces in ${query} block`);
      blocks.push(uiCss.slice(at, end + 1));
      from = end + 1;
    }
    return blocks.join("\n");
  }

  it("thread is 100% wide with no resize handle at <= 900 px", () => {
    const narrow = mediaBlocks("max-width: 900px");
    assert.ok(/\.ui-chat-thread\s*\{[^}]*width:\s*100%/.test(narrow),
      "thread pane is full width");
    assert.ok(/\[role="separator"\][^{]*\{[^}]*display:\s*none/.test(narrow),
      "resize handle hidden");
  });

  it("drawer chips wrap with nothing clipped", () => {
    const rules = uiCss.match(/\.ui-chat-chips\s*\{[^}]*\}/g) || [];
    assert.ok(rules.length > 0, "chip container rules present");
    for (const rule of rules) {
      assert.ok(!rule.includes("nowrap"), `no nowrap: ${rule}`);
      assert.ok(!/overflow-x:\s*(auto|scroll|hidden)/.test(rule),
        `no clipped axis: ${rule}`);
    }
    assert.ok(rules.some((rule) => rule.includes("flex-wrap: wrap")),
      "chips wrap inside the drawer");
  });

  it("replay notice sits in flow with message gutters", () => {
    const m = uiCss.match(/\.ui-chat-thread\s*>\s*\.ui-replay-notice\s*\{[^}]*\}/);
    assert.ok(m, "notice wrapper rule present");
    assert.ok(m[0].includes("position: static"), "in flow, never over content");
    assert.ok(!m[0].includes("absolute") && !m[0].includes("sticky"),
      "no overlay positioning");
    assert.ok(m[0].includes("var(--ds-s-16)"), "16 px gutters like the messages");
  });

  it("sources footer keeps real Badges", () => {
    assert.ok(!/\.ui-cites\s+\.ui-cite[^{]*\{[^}]*background-color:\s*transparent/.test(uiCss),
      "Badge pill never stripped");
  });
});

describe("32a2 SSR shell", () => {
  it("the narrow chat pane renders no .ui-picks-tray", () => {
    const html = renderToString(React.createElement(PicksTray,
      { compact: true, picks: ["a", "b"],
        candidates: [
          { id: "a", name: "10 Coleman Place", commute: { work: { minutes: 20 } } },
          { id: "b", name: "777 Hamilton Avenue", commute: { work: { minutes: 25 } } },
        ],
        gate: { ok: true }, onRun() {}, onRemove() {} }));
    assert.ok(html.includes("ui-picks-compact"), "compact run row renders");
    assert.ok(!html.includes("ui-picks-tray"), "never the overlay tray");
  });

  it("the replay Banner sits inside the thread column before the message list", () => {
    const html = renderToString(React.createElement(ReplayNotice,
      { replayMeta: { model: "Muse Spark", recordedAt: "2026-10-01" },
        onSkip: () => {}, onExit: () => {} }));
    assert.ok(html.includes("astryx-banner"), "Banner frame");
    const iNotice = chatSrc.indexOf("ui-replay-notice");
    const iList = chatSrc.indexOf("<ThreadList>");
    const iSection = chatSrc.indexOf('aria-label="대화"');
    assert.ok(iSection >= 0 && iNotice > iSection, "notice inside the thread column");
    assert.ok(iList > iNotice, "notice before the message list");
  });

  it("the stage with candidates renders no empty-card text", () => {
    const cand = (id, lon, lat, kind) => ({ id, name: `집${id}`,
      lon, lat, kind, commute: { work: { minutes: 20 } },
      tenures: [{ tenure: "jeonse", median_won: 200000000, deals: 5 }] });
    const pinMap = buildChatMap({
      regions: { regions: [] },
      network: null, tiles: [], green: { water: [], parks: [] },
      candidates: [cand("h-1", 127.11, 37.394, "아파트")],
      picks: [], workplaceStation: null, tenure: "jeonse" });
    assert.ok((pinMap.pins || []).length > 0, "pins without regions");
    const html = renderToString(React.createElement(StageArea,
      { map: pinMap, contextLine: "판교 출근 · 후보 1곳",
        profile: null, kindsAvailable: [], onClose() {} }));
    assert.ok(!html.includes("후보 지역이 여기에 표시돼요"), "no empty card");
    assert.ok(html.includes("판교 출근 · 후보 1곳"), "stage title stays");
  });
});

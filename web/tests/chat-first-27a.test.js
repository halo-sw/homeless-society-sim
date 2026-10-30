// 27a: chat-first — / routes to chat, the first screen is the empty
// conversation, the work panel opens on request, no mode tabs (SSR,
// no DOM, no data/build needed).
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

describe("27a chat-first (SSR, no DOM)", () => {
  let React;
  let renderToString;
  let routeForSearch;
  let ChatEmpty;
  let EMPTY_STARTERS;
  let chatWorkAttr;
  let StageArea;
  let TopBar;
  let museStatusLabel;

  before(async () => {
    React = (await import("react")).default;
    ({ renderToString } = await import("react-dom/server"));
    ({ routeForSearch } = await import("../src/chat/urls.js"));
    ({ ChatEmpty, EMPTY_STARTERS, chatWorkAttr, StageArea } =
      await import("../src/ui/chat.jsx"));
    ({ TopBar, museStatusLabel } = await import("../src/ui/topbar.jsx"));
  });

  it("routes / to chat, keeps deep links", () => {
    assert.equal(routeForSearch(""), "landing");
    assert.equal(routeForSearch("?mode=sim"), "sim");
    assert.equal(routeForSearch("?area=x"), "tour");
  });

  it("renders the empty first screen with starters and coverage", () => {
    const html = renderToString(React.createElement(ChatEmpty,
      { onSend: () => {}, onListing: () => {}, onExample: () => {} }));
    assert.ok(html.includes("어떤 집을 고민 중이세요?"), "heading");
    for (const s of EMPTY_STARTERS) {
      assert.ok(html.includes(s.label), `starter ${s.id}`);
    }
    assert.ok(html.includes("다루는 지역"), "coverage line");
  });

  it("labels the work panel state", () => {
    assert.equal(chatWorkAttr(false), "closed");
    assert.equal(chatWorkAttr(true), "open");
  });

  it("shows Muse in the chat header, no mode tabs", () => {
    const html = renderToString(React.createElement(TopBar,
      { mode: "chat", summary: "", settings: { mode: "chat" } }));
    assert.ok(!html.includes("동네 둘러보기"), "no tour tab");
    assert.ok(!html.includes("살아 보기"), "no sim tab");
    assert.ok(html.includes("Muse"), "muse in header");
    assert.equal(museStatusLabel(true), "연결됨 · Muse Spark 1.3");
    assert.equal(museStatusLabel(false), "규칙 모드");
  });

  it("links back to the conversation from sim", () => {
    const html = renderToString(React.createElement(TopBar,
      { mode: "sim", settings: { mode: "sim" } }));
    assert.ok(html.includes("대화로"), "back to chat");
  });

  it("renders the work panel close button", () => {
    const html = renderToString(React.createElement(StageArea,
      { map: { regions: [] }, onClose: () => {} }));
    assert.ok(html.includes("작업판 닫기"), "close button");
  });
});

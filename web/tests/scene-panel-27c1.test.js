// 27c1: fast chat boot + 3D scenes inside the work panel (SSR, no
// DOM, no data/build needed): pure route/embed URL helpers and the
// SceneFrame render smoke test.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

describe("27c1 scene panel (SSR, no DOM)", () => {
  let React;
  let renderToString;
  let bootKindFor;
  let simMomentUrl;
  let tourUrl;
  let isEmbed;
  let withoutEmbed;
  let SceneFrame;
  let momentRowUrl;

  before(async () => {
    React = (await import("react")).default;
    ({ renderToString } = await import("react-dom/server"));
    ({ bootKindFor, simMomentUrl, tourUrl, isEmbed, withoutEmbed } =
      await import("../src/chat/urls.js"));
    ({ SceneFrame, momentRowUrl } = await import("../src/ui/chat.jsx"));
  });

  it("maps routes to boot kinds", () => {
    assert.equal(bootKindFor("chat"), "chat");
    assert.equal(bootKindFor("sim"), "sim");
    assert.equal(bootKindFor("tour"), "tour");
  });

  it("builds embed moment/tour urls, drops embed on demand", () => {
    const emb = simMomentUrl({ custom: "c1", home: "B", day: 3, t: "18:26", embed: true });
    assert.ok(emb.includes("mode=sim"), "mode");
    assert.ok(emb.includes("custom=c1"), "custom");
    assert.ok(emb.includes("embed=1"), "embed");
    const plain = simMomentUrl({ custom: "c1", home: "B", day: 3, t: "18:26" });
    assert.ok(!plain.includes("embed"), "no embed by default");
    const tour = tourUrl({ area: "pangyo", embed: true });
    assert.ok(tour.includes("area=pangyo"), "area");
    assert.ok(tour.includes("embed=1"), "embed");
    assert.equal(isEmbed("?embed=1"), true);
    assert.equal(isEmbed(""), false);
    assert.ok(!withoutEmbed(tour).includes("embed"), "withoutEmbed drops it");
    assert.ok(withoutEmbed(tour).includes("area=pangyo"), "keeps area");
  });

  it("renders the scene frame with header actions and iframe", () => {
    const html = renderToString(React.createElement(SceneFrame,
      { scene: { url: "/x?embed=1", title: "판교 동네" },
        onBack: () => {}, onClose: () => {} }));
    assert.ok(html.includes("<iframe"), "iframe");
    assert.ok(html.includes("판교 동네"), "title");
    assert.ok(html.includes("지도로"), "back");
    assert.ok(html.includes("새 창으로"), "new window");
    assert.ok(html.includes("작업판 닫기"), "close");
  });

  it("passes embed through moment row urls", () => {
    const url = momentRowUrl(
      { home: "A", day: 2, minute: 500, agent: "m1" },
      { custom: "c1", embed: true });
    assert.ok(url.includes("embed=1"), "embed");
  });
});

// 28b: PoweredByMuse credit — logo path, labels, SSR render, and source pins.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => fs.readFileSync(path.join(here, p), "utf8");

describe("28b PoweredByMuse (SSR, no DOM)", () => {
  let React;
  let renderToStaticMarkup;
  let MUSE_LOGO_PATH;
  let museModelLabel;
  let PoweredByMuse;

  before(async () => {
    React = (await import("react")).default;
    ({ renderToStaticMarkup } = await import("react-dom/server"));
    ({ MUSE_LOGO_PATH, museModelLabel, PoweredByMuse } =
      await import("../src/ui/powered-by-muse.jsx"));
  });

  it("points at the official logo file, which exists", () => {
    assert.equal(MUSE_LOGO_PATH, "brand/muse-logo.png");
    assert.ok(fs.existsSync(path.join(here, "..", "public", MUSE_LOGO_PATH)));
  });

  it("labels the model by connection", () => {
    assert.equal(museModelLabel(true), "Muse Spark 1.3");
    assert.equal(museModelLabel(false), "규칙 모드");
  });

  it("renders sm without status: logo 16px, no status part", () => {
    const html = renderToStaticMarkup(React.createElement(PoweredByMuse, { size: "sm" }));
    assert.ok(html.includes("Powered by"), "credit text");
    assert.ok(html.includes("<b>Muse</b>"), "bold Muse");
    assert.ok(html.includes("muse-logo.png"), "logo src");
    assert.ok(html.includes('width="16"'), "sm logo 16px");
    assert.ok(!html.includes("ds-pbm-status"), "no status");
  });

  it("renders md with live status: logo 20px, live dot, model name", () => {
    const html = renderToStaticMarkup(
      React.createElement(PoweredByMuse, { size: "md", live: true, showStatus: true }));
    assert.ok(html.includes('width="20"'), "md logo 20px");
    assert.ok(html.includes('data-live="1"'), "live dot");
    assert.ok(html.includes("Muse Spark 1.3"), "model name");
  });

  it("renders offline status as rules mode", () => {
    const html = renderToStaticMarkup(
      React.createElement(PoweredByMuse, { size: "sm", live: false, showStatus: true }));
    assert.ok(html.includes("규칙 모드"), "offline label");
  });

  it("wires the credit into topbar, chat, css and the design doc", () => {
    const topbar = read("../src/ui/topbar.jsx");
    assert.ok(topbar.includes("<PoweredByMuse"), "topbar uses the credit");
    assert.ok(!topbar.includes('className="ui-bar-muse"'), "old span gone");
    assert.ok(read("../src/ui/chat.jsx").includes("<PoweredByMuse"), "empty chat uses it");
    assert.ok(read("../src/ui/ui.css").includes(".ds-pbm"), "css block");
    const doc = read("../../docs/design.md");
    assert.ok(doc.includes("### 3.12 PoweredByMuse"), "new section");
    assert.ok(doc.includes("다루는 지역 11곳"), "real coverage list");
    for (const ban of ["네가", "네 기준", "见出し"]) {
      assert.ok(!doc.includes(ban), `no ${ban}`);
    }
  });
});

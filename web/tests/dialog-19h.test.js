// 19h: a closed dialog never takes clicks. Closed ShareDialog renders
// nothing (render checks + jsx-loader), and ui.css hides any closed
// astryx dialog at the CSS level.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

// .jsx loads dynamically (static imports resolve before the loader).
let React;
let renderToString;
let ShareDialog;
let store;

before(async () => {
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
  ({ ShareDialog } = await import("../src/ui/share.jsx"));
  ({ store } = await import("../src/ui/store.js"));
});

describe("dialog-19h closed dialog takes no clicks", () => {
  it("ui.css hides a closed astryx dialog", () => {
    const css = readFileSync(new URL("../src/ui/ui.css", import.meta.url), "utf8");
    assert.ok(css.includes("dialog.astryx-dialog:not([open])"), "closed-dialog rule present");
  });

  it("ShareDialog renders nothing when closed", () => {
    store.set({ shareOpen: false });
    assert.equal(renderToString(React.createElement(ShareDialog)), "");
  });

  it("ShareDialog renders when open", () => {
    store.set({ shareOpen: true });
    try {
      const html = renderToString(React.createElement(ShareDialog));
      assert.ok(html.includes("결과 공유"), "open dialog shows its title");
    } finally {
      store.set({ shareOpen: false });
    }
  });
});

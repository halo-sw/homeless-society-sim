// Stage 26o — a calmer chat map: muted basemap, our data on top.
// node --test, no network.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

// .jsx loads dynamically (static imports resolve before the loader).
let ChatMap = null;
before(async () => {
  ({ ChatMap } = await import("../src/ui/chatmap.jsx"));
});

import { BASEMAP_MUTE, buildChatMap } from "../src/chatmap.js";

// KR doc with one subway line and one pin (same shape as 19b).
const NET26O = {
  lines: [{
    id: "sinbundang", name: "신분당선", color: "#D4003B",
    stops: [
      { id: "dx:판교", key: "판교", name: "판교", lon: 127.1112, lat: 37.3944 },
      { id: "dx:정자", key: "정자", name: "정자", lon: 127.1083, lat: 37.3670 },
      { id: "dx:미금", key: "미금", name: "미금", lon: 127.1128, lat: 37.3502 },
    ],
    patterns: [{ id: "pdx", stops: ["dx:판교", "dx:정자", "dx:미금"],
      chainage_km: [0, 3, 6] }],
  }],
};
const REG26O = { regions: [
  { id: "bundang", label: "성남 분당구", bbox: [127.09, 37.38, 127.13, 37.41] },
] };

function map26o() {
  return buildChatMap({ regions: REG26O, network: NET26O,
    tiles: [], green: { water: [], parks: [] },
    candidates: [
      { id: "h-a", name: "천사의도시Ⅱ오피스텔", kind: "오피스텔",
        lon: 127.1102, lat: 37.3949,
        commute: { walk: { known: true, station: "정자", minutes: 5 },
          ride: { known: true, minutes: 6 } },
        tenures: [{ tenure: "jeonse", median_won: 200000000, deals: 5 }] },
    ],
    picks: [], workplaceStation: "판교", tenure: "jeonse" });
}

async function html26o() {
  const React = (await import("react")).default;
  const { renderToString } = await import("react-dom/server");
  return renderToString(React.createElement(ChatMap, { map: map26o() }));
}

describe("26o BASEMAP_MUTE constants", () => {
  it("saturate is in [0, 0.3]", () => {
    assert.ok(BASEMAP_MUTE.saturate >= 0 && BASEMAP_MUTE.saturate <= 0.3,
      `saturate ${BASEMAP_MUTE.saturate} in [0, 0.3]`);
  });
  it("slope is in [0.6, 0.85]", () => {
    assert.ok(BASEMAP_MUTE.slope >= 0.6 && BASEMAP_MUTE.slope <= 0.85,
      `slope ${BASEMAP_MUTE.slope} in [0.6, 0.85]`);
  });
});

describe("26o muted basemap group", () => {
  it("renders the basemap-mute filter and the tiles inside it", async () => {
    const html = await html26o();
    assert.ok(html.includes('id="basemap-mute"'), "filter def present");
    // Basemap is on in SSR (KR doc through the relay base): tiles render.
    assert.ok(html.includes("/api/tiles/white/"), "tile images rendered");
    const open = '<g filter="url(#basemap-mute)"';
    const start = html.indexOf(open);
    assert.ok(start >= 0, "mute group present");
    const end = html.indexOf("</g>", start);
    assert.ok(end > start, "mute group closes");
    const group = html.slice(start, end);
    const totalImages = html.split("<image").length - 1;
    const groupedImages = group.split("<image").length - 1;
    assert.ok(totalImages > 0, "at least one tile image");
    assert.equal(groupedImages, totalImages, "every tile image is muted");
  });

  it("keeps the subway polylines outside the mute group", async () => {
    const html = await html26o();
    const open = '<g filter="url(#basemap-mute)"';
    const start = html.indexOf(open);
    const group = html.slice(start, html.indexOf("</g>", start));
    assert.ok(html.includes("#D4003B"), "our subway line colour renders");
    assert.ok(!group.includes("#D4003B"), "subway line not muted");
    assert.ok(!group.includes("신분당선"), "subway title not muted");
  });
});

// Stage 26n: candidate thumbnails show the real place — a live aerial
// photo crop centred on the home, with a pin. node --test, no network.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

register("./jsx-loader.mjs", import.meta.url);

import { aerialThumbTiles, aerialThumbUrl, aerialThumbZoom } from "../src/aerial/thumb.js";
import { lonLatToTile } from "../src/aerial/tiles.js";
import { USGS_CREDIT, AERIAL_CREDIT } from "../src/aerial/drape.js";

let React;
let renderToString;
let CandidateCard;
let CandidatesCard;

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, "..", "src");

const SEOUL = { lon: 127.0276, lat: 37.4979 };

before(async () => {
  React = (await import("react")).default;
  ({ renderToString } = await import("react-dom/server"));
  ({ CandidateCard } = await import("../src/ui/candidate-card.jsx"));
  ({ CandidatesCard } = await import("../src/ui/chat.jsx"));
});

// The home's global pixel, read back through any returned tile's
// left/top plus its fractional offset inside that tile.
function homePxInWindow(layout, lon, lat, tilePx) {
  const f = lonLatToTile(lon, lat, layout.z);
  return layout.tiles.map((t) => ({
    tile: t,
    px: t.left + (f.x - t.x) * tilePx,
    py: t.top + (f.y - t.y) * tilePx,
  }));
}

describe("26n aerialThumbTiles", () => {
  it("row window 96x96: z18, 1-4 tiles, home at (48, 48)", () => {
    const layout = aerialThumbTiles({ lon: SEOUL.lon, lat: SEOUL.lat,
      z: 18, widthPx: 96, heightPx: 96, tilePx: 128 });
    assert.equal(layout.z, 18);
    assert.equal(layout.size, 128);
    assert.ok(layout.tiles.length >= 1 && layout.tiles.length <= 4,
      `tiles=${layout.tiles.length}`);
    for (const t of layout.tiles) assert.equal(t.z, 18);
    for (const { tile, px, py } of homePxInWindow(layout, SEOUL.lon, SEOUL.lat, 128)) {
      assert.ok(Math.abs(px - 48) <= 0.5, `tile ${tile.x}/${tile.y}: px=${px}`);
      assert.ok(Math.abs(py - 48) <= 0.5, `tile ${tile.x}/${tile.y}: py=${py}`);
    }
  });

  it("full card window 400x180: home at (200, 90)", () => {
    const layout = aerialThumbTiles({ lon: SEOUL.lon, lat: SEOUL.lat,
      z: 18, widthPx: 400, heightPx: 180, tilePx: 128 });
    assert.equal(layout.z, 18);
    for (const t of layout.tiles) assert.equal(t.z, 18);
    assert.ok(layout.tiles.length >= 1, "at least one tile");
    for (const { tile, px, py } of homePxInWindow(layout, SEOUL.lon, SEOUL.lat, 128)) {
      assert.ok(Math.abs(px - 200) <= 0.5, `tile ${tile.x}/${tile.y}: px=${px}`);
      assert.ok(Math.abs(py - 90) <= 0.5, `tile ${tile.x}/${tile.y}: py=${py}`);
    }
  });
});

describe("26n aerialThumbUrl", () => {
  it("Korea goes through the relay", () => {
    const f = lonLatToTile(SEOUL.lon, SEOUL.lat, 18);
    const x = Math.floor(f.x);
    const y = Math.floor(f.y);
    assert.equal(
      aerialThumbUrl("https://relay.example", SEOUL.lon, SEOUL.lat, { z: 18, y, x }),
      `https://relay.example/api/tiles/Satellite/18/${y}/${x}.jpeg`);
  });

  it("Korea with no relay has no URL", () => {
    assert.equal(
      aerialThumbUrl(null, SEOUL.lon, SEOUL.lat, { z: 18, y: 1, x: 1 }), null);
  });

  it("Menlo Park uses USGS directly", () => {
    const url = aerialThumbUrl(null, -122.148, 37.484, { z: 18, y: 2, x: 3 });
    assert.ok(url.startsWith(
      "https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/18/"),
    url);
  });

  it("US tile at z16 hits the z16 tile path", () => {
    const f = lonLatToTile(-122.148, 37.484, 16);
    const x = Math.floor(f.x);
    const y = Math.floor(f.y);
    assert.equal(
      aerialThumbUrl(null, -122.148, 37.484, { z: 16, y, x }),
      `https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/16/${y}/${x}`);
  });
});

describe("26n2 aerialThumbZoom", () => {
  it("US uses z16 at 1.5x, Korea stays at z18", () => {
    assert.deepEqual(aerialThumbZoom(-122.148, 37.484), { z: 16, tilePx: 384 });
    assert.deepEqual(aerialThumbZoom(127.0276, 37.4979), { z: 18, tilePx: 128 });
  });

  it("US zoom with a 96x96 window centres the home at (48, 48), all tiles z16", () => {
    const zoom = aerialThumbZoom(-122.148, 37.484);
    const layout = aerialThumbTiles({ lon: -122.148, lat: 37.484,
      z: zoom.z, widthPx: 96, heightPx: 96, tilePx: zoom.tilePx });
    assert.equal(layout.z, 16);
    for (const t of layout.tiles) assert.equal(t.z, 16);
    for (const { tile, px, py } of homePxInWindow(layout, -122.148, 37.484, zoom.tilePx)) {
      assert.ok(Math.abs(px - 48) <= 0.5, `tile ${tile.x}/${tile.y}: px=${px}`);
      assert.ok(Math.abs(py - 48) <= 0.5, `tile ${tile.x}/${tile.y}: py=${py}`);
    }
  });
});

describe("26n key safety", () => {
  function walk(dir, out = []) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else out.push(p);
    }
    return out;
  }
  it("no file under src/ contains api.vworld.kr except src/aerial/proxy.js", () => {
    const hits = walk(SRC).filter((p) => readFileSync(p, "utf8").includes("api.vworld.kr"));
    assert.deepEqual(hits, [join(SRC, "aerial", "proxy.js")]);
  });
});

describe("26n row SSR", () => {
  const noop = () => {};
  function seoulCandidate(id, name) {
    return { id, name, kind: "오피스텔", lon: SEOUL.lon, lat: SEOUL.lat,
      tenures: [{ tenure: "jeonse", median_won: 200000000,
        min_won: 190000000, max_won: 210000000, deals: 5,
        budget_fit: "all", bucket_center_m2: 30 }] };
  }

  it("a row with lon/lat and no photos shows no per-thumb aerial label", () => {
    const html = renderToString(React.createElement(CandidateCard,
      { candidate: seoulCandidate("c1", "천사의도시II오피스텔"), tenure: "jeonse",
        destName: "판교", photos: null, index: 0, picked: false,
        onLive: noop, onJeonse: noop, onDetail: noop }));
    assert.ok(!html.includes("ui-aerial-label"), "per-thumb aerial label is gone");
  });

  it("the list carries the aerial credit next to the pick hint", () => {
    const cands = [seoulCandidate("c1", "A집"), seoulCandidate("c2", "B집")];
    const html = renderToString(React.createElement(CandidatesCard,
      { data: { candidates: cands, total_matching: 2, sort_note: "" },
        tenure: "jeonse", sort: "commute", onSort: noop,
        picks: [], onTogglePick: noop, onPreview3D: noop,
        onJeonse: noop, onRun: noop, onDetail: noop, onHover: noop,
        photoDeps: {}, destName: "판교" }));
    assert.ok(html.includes("마음에 드는 집을 2곳 담고"), "pick hint stays");
    assert.ok(html.includes(AERIAL_CREDIT), "Korean list credits VWorld");
  });

  it("a US list credits USGS", () => {
    const cands = [{ id: "u1", name: "Menlo home", country: "US",
      lon: -122.148, lat: 37.484,
      tenures: [{ tenure: "wolse", median_won: 4200, min_won: 4200,
        max_won: 4200, deals: 1, budget_fit: "all", bucket_center_m2: null }] }];
    const html = renderToString(React.createElement(CandidatesCard,
      { data: { candidates: cands, total_matching: 1, sort_note: "" },
        tenure: "wolse", sort: "commute", onSort: noop,
        picks: [], onTogglePick: noop, onPreview3D: noop,
        onJeonse: noop, onRun: noop, onDetail: noop, onHover: noop,
        photoDeps: {}, destName: "Menlo Park" }));
    assert.ok(html.includes(USGS_CREDIT), "US list credits USGS");
  });
});

describe("26n3 phone thumbnail label", () => {
  it("480px rule hides the aerial label inside .ui-cand-thumb, label never wraps, no ellipsis", () => {
    const css = readFileSync(join(HERE, "..", "src", "ui", "ui.css"), "utf8");
    const media = css.slice(css.indexOf("@media (max-width: 480px)"));
    assert.ok(media.includes(".ui-cand-thumb .ui-aerial-label"),
      "phone rule targets the label inside .ui-cand-thumb");
    assert.match(media, /\.ui-cand-thumb\s+\.ui-aerial-label\s*\{\s*display:\s*none/,
      "phone rule hides the label inside .ui-cand-thumb");
    const labelRule = css.match(/\.ui-aerial-label\s*\{[^}]*\}/);
    assert.ok(labelRule, "label rule exists");
    assert.match(labelRule[0], /white-space:\s*nowrap/, "label never wraps");
    assert.ok(!labelRule[0].includes("text-overflow"), "no ellipsis on the label");
    assert.ok(!labelRule[0].includes("ellipsis"), "no ellipsis on the label");
  });
});

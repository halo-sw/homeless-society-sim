// Stage 32c: street-level photos from Mapillary through our relay.
// Relay (mocked fetchImpl), client slot, token-source scan, list note.
import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createStreetHandler } from "../../relay/street.js";
import { createRelay } from "../../relay/handler.js";

register("./jsx-loader.mjs", import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const ORIGIN = "https://halo-sw.github.io";
const HOME = { lon: 127.0276, lat: 37.4979 }; // 강남역 (KR bbox)

function mockRes() {
  let resolve;
  const done = new Promise((r) => { resolve = r; });
  const res = {
    statusCode: 200,
    headers: {},
    chunks: [],
    setHeader(k, v) { res.headers[String(k).toLowerCase()] = v; },
    end(chunk) {
      if (chunk !== undefined) res.chunks.push(Buffer.from(chunk));
      resolve(res);
    },
  };
  return { res, done };
}

function bodyText(res) {
  return Buffer.concat(res.chunks).toString("utf8");
}

function bodyJson(res) {
  return JSON.parse(bodyText(res));
}

function streetReq(url) {
  return { method: "GET", url, headers: {}, socket: { remoteAddress: "9.9.9.9" } };
}

async function callStreet(handler, url) {
  const { res, done } = mockRes();
  await handler(streetReq(url), res);
  return await done;
}

const streetUrl = (lon, lat) => `/api/street?lon=${lon}&lat=${lat}`;

// An image just east of the home: the bearing from the image to the
// home is due west (270°), so compass 270 faces the home.
function img({ id, dLon = 0.0001, compass = 270, at = 1700000000000, pano = false }) {
  return {
    id,
    captured_at: at,
    compass_angle: compass,
    thumb_1024_url: `https://cdn.mapillary.example/${id}.jpg`,
    creator: { username: "someone", id: "42" },
    computed_geometry: { type: "Point", coordinates: [HOME.lon + dLon, HOME.lat] },
    is_pano: pano,
  };
}

function okData(data) {
  return { ok: true, json: async () => ({ data }) };
}

describe("32c relay without a token", () => {
  it("answers off and never calls upstream", async () => {
    let calls = 0;
    const handler = createStreetHandler({
      getToken: () => null,
      fetchImpl: async () => { calls += 1; return okData([]); },
    });
    const res = await callStreet(handler, streetUrl(HOME.lon, HOME.lat));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(bodyJson(res), { photo: null, reason: "off" });
    assert.equal(calls, 0);
    assert.equal(res.headers["cache-control"], "private, max-age=600");
  });
});

describe("32c relay pick", () => {
  function handlerFor(route) {
    const seen = [];
    const handler = createStreetHandler({
      getToken: () => "SECRET-TOK",
      fetchImpl: async (url) => {
        seen.push(String(url));
        return route(String(url));
      },
    });
    return { handler, seen };
  }

  it("a 500 on the small box still photos from the big box", async () => {
    const photo = img({ id: "big-one" });
    const { handler, seen } = handlerFor((url) => (
      url.includes("limit=20") ? { ok: false, status: 500 } : okData([photo])));
    const res = await callStreet(handler, streetUrl(HOME.lon, HOME.lat));
    assert.equal(res.statusCode, 200);
    const body = bodyJson(res);
    assert.equal(body.photo && body.photo.id, "big-one");
    assert.equal(body.photo.thumb_url, "https://cdn.mapillary.example/big-one.jpg");
    assert.equal(body.photo.creator, "someone");
    assert.equal(body.photo.captured_year, 2023);
    assert.equal(body.photo.page_url, "https://www.mapillary.com/app/?pKey=big-one");
    assert.equal(body.photo.lon, HOME.lon + 0.0001);
    assert.equal(body.photo.lat, HOME.lat);
    assert.equal(body.photo.compass, 270);
    assert.equal(res.headers["cache-control"], "private, max-age=600");
    // The token rides the upstream header only — never in the boxes,
    // and never in the response body or headers.
    for (const u of seen) assert.ok(!u.includes("SECRET-TOK"), u);
    for (const v of Object.values(res.headers)) assert.ok(!String(v).includes("SECRET-TOK"));
    assert.ok(!bodyText(res).includes("SECRET-TOK"));
  });

  it("prefers the facing image over a newer non-facing one, drops panos", async () => {
    const facing = img({ id: "facing", compass: 270, at: 1700000000000 });
    const newer = img({ id: "newer", compass: 90, at: 1780000000000 });
    const pano = img({ id: "pano", compass: 270, at: 1790000000000, pano: true });
    const { handler } = handlerFor(() => okData([newer, pano, facing]));
    const res = await callStreet(handler, streetUrl(HOME.lon, HOME.lat));
    assert.equal(bodyJson(res).photo.id, "facing");
  });

  it("among facing images the newest wins, then the nearest", async () => {
    const far = img({ id: "far", compass: 270, at: 1700000000000, dLon: 0.0004 });
    const near = img({ id: "near", compass: 270, at: 1700000000000, dLon: 0.0001 });
    const { handler } = handlerFor(() => okData([far, near]));
    const res = await callStreet(handler, streetUrl(HOME.lon, HOME.lat));
    assert.equal(bodyJson(res).photo.id, "near");
  });

  it("no usable image answers none", async () => {
    const { handler } = handlerFor(() => okData([]));
    const res = await callStreet(handler, streetUrl(HOME.lon, HOME.lat));
    assert.deepEqual(bodyJson(res), { photo: null, reason: "none" });
  });

  it("a hanging upstream settles null within the cap", async () => {
    const handler = createStreetHandler({
      getToken: () => "SECRET-TOK",
      fetchImpl: async () => new Promise(() => {}),
      perTryMs: 20,
      totalMs: 40,
    });
    const start = Date.now();
    const res = await callStreet(handler, streetUrl(HOME.lon, HOME.lat));
    const elapsed = Date.now() - start;
    assert.deepEqual(bodyJson(res), { photo: null, reason: "none" });
    assert.ok(elapsed < 1500, `settled in ${elapsed}ms`);
  });

  it("bad lon/lat answers 400", async () => {
    const { handler } = handlerFor(() => okData([]));
    for (const url of ["/api/street?lon=abc&lat=37.5", "/api/street?lon=0&lat=0",
      "/api/street", "/api/street?lon=200&lat=37.5"]) {
      const res = await callStreet(handler, url);
      assert.equal(res.statusCode, 400, url);
    }
  });

  it("a cache hit makes no second fetch", async () => {
    let calls = 0;
    const { handler } = handlerFor(() => {
      calls += 1;
      return okData([img({ id: "cached" })]);
    });
    const url = streetUrl(HOME.lon, HOME.lat);
    const first = await callStreet(handler, url);
    assert.equal(bodyJson(first).photo.id, "cached");
    const second = await callStreet(handler, url);
    assert.equal(bodyJson(second).photo.id, "cached");
    assert.equal(calls, 1);
  });

  it("a US home is in bounds", async () => {
    const seen = [];
    const handler = createStreetHandler({
      getToken: () => "SECRET-TOK",
      fetchImpl: async (url) => {
        seen.push(String(url));
        return okData([]);
      },
    });
    const res = await callStreet(handler, streetUrl(-122.148, 37.484));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(bodyJson(res), { photo: null, reason: "none" });
    assert.equal(seen.length, 2, "both boxes tried");
  });
});

describe("32c relay mount", () => {
  async function callRelay(relay, url) {
    const { res, done } = mockRes();
    await relay({ method: "GET", url, headers: { origin: ORIGIN }, socket: { remoteAddress: "1.2.3.4" } }, res);
    return await done;
  }

  it("GET /api/street without a token answers off", async () => {
    const relay = createRelay({ env: {}, fetchImpl: async () => { throw new Error("must not fetch"); } });
    const res = await callRelay(relay, streetUrl(HOME.lon, HOME.lat));
    assert.equal(res.statusCode, 200);
    assert.deepEqual(bodyJson(res), { photo: null, reason: "off" });
  });

  it("GET /api/street with a token photos through the relay", async () => {
    const relay = createRelay({
      env: { MAPILLARY_TOKEN: "RELAY-TOK" },
      fetchImpl: async () => okData([img({ id: "via-relay" })]),
    });
    const res = await callRelay(relay, streetUrl(HOME.lon, HOME.lat));
    assert.equal(res.statusCode, 200);
    assert.equal(bodyJson(res).photo.id, "via-relay");
    assert.ok(!bodyText(res).includes("RELAY-TOK"));
  });
});

describe("32c token source scan", () => {
  function jsFiles(dir, out = []) {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) {
        if (e === "node_modules" || e === "dist") continue;
        jsFiles(p, out);
      } else if (p.endsWith(".js") && !p.endsWith(".test.js")) {
        out.push(p);
      }
    }
    return out;
  }

  it("MAPILLARY_TOKEN lives only in relay/handler.js and web/vite.config.js", () => {
    const viteConfig = join(HERE, "..", "vite.config.js");
    assert.ok(readFileSync(viteConfig, "utf8").includes("MAPILLARY_TOKEN"),
      "the dev middleware reads the token");
    const files = [viteConfig, ...jsFiles(join(HERE, "..", "src")),
      ...jsFiles(join(HERE, "..", "..", "relay"))];
    assert.ok(files.length > 10, `${files.length} source files scanned`);
    const hits = files.filter((f) => readFileSync(f, "utf8").includes("MAPILLARY_TOKEN"));
    assert.deepEqual(hits.sort(), [
      join(HERE, "..", "..", "relay", "handler.js"),
      join(HERE, "..", "vite.config.js"),
    ].sort());
  });
});

describe("32c client", () => {
  let React;
  let renderToString;
  let streetPhotoFor;
  let StreetThumb;
  let streetFullCreditFor;
  let streetShortCreditFor;
  let listPhotoNote;
  let listThumbKinds;
  let reportListThumbKind;

  before(async () => {
    React = (await import("react")).default;
    ({ renderToString } = await import("react-dom/server"));
    ({ streetPhotoFor, StreetThumb, streetFullCreditFor, streetShortCreditFor,
      listPhotoNote, listThumbKinds, reportListThumbKind } =
      await import("../src/ui/candidate-card.jsx"));
  });

  it("no relay (null base) answers null without fetching", async () => {
    const realFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => { calls += 1; throw new Error("must not fetch"); };
    try {
      const photo = await streetPhotoFor(
        { id: "c-null-base", lon: HOME.lon, lat: HOME.lat }, { apiBase: null });
      assert.equal(photo, null);
      assert.equal(calls, 0);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("a home without coordinates answers null", async () => {
    assert.equal(await streetPhotoFor({ id: "c-nocoords" }, { apiBase: "https://r.example" }), null);
  });

  it("StreetThumb shows the photo with the corner credit and full title", () => {
    const photo = { id: "m1", thumb_url: "https://cdn.mapillary.example/m1.jpg",
      captured_year: 2024, creator: "someone",
      page_url: "https://www.mapillary.com/app/?pKey=m1",
      lon: HOME.lon, lat: HOME.lat, compass: 270 };
    assert.equal(streetShortCreditFor(photo), "© someone · Mapillary");
    assert.equal(streetFullCreditFor(photo), "someone · Mapillary · CC BY-SA 4.0 · 2024");
    const html = renderToString(React.createElement(StreetThumb, { photo }));
    assert.ok(html.includes("https://cdn.mapillary.example/m1.jpg"), "photo shows");
    assert.ok(html.includes("© someone · Mapillary"), "corner credit");
    assert.ok(html.includes('title="someone · Mapillary · CC BY-SA 4.0 · 2024"'), "full credit in title");
    assert.ok(html.includes("https://www.mapillary.com/app/?pKey=m1"), "link to the photo page");
  });

  it("StreetThumb without a photo renders the skeleton, not the silhouette", () => {
    const html = renderToString(React.createElement(StreetThumb,
      { candidate: { id: "c-skel", lon: HOME.lon, lat: HOME.lat } }));
    assert.ok(html.includes("거리 사진 불러오는 중"), "skeleton first");
    assert.ok(!html.includes("<svg"), "no silhouette yet");
  });

  it("listPhotoNote: scene only names the model, never aerial or street", () => {
    const note = listPhotoNote(["scene"], { country: "KR" });
    assert.ok(!note.includes("항공"), note);
    assert.ok(!note.includes("거리 사진"), note);
    assert.ok(note.includes("우리 3D 모형"), note);
    assert.ok(note.includes("우리 자료로 만든 모형 (GIS건물통합정보·OSM)"), note);
  });

  it("listPhotoNote: scene plus street names Mapillary with the licence", () => {
    const note = listPhotoNote(["scene", "street"], { country: "KR" });
    assert.ok(note.includes("거리 사진"), note);
    assert.ok(note.includes("Mapillary"), note);
    assert.ok(note.includes("거리 사진: Mapillary (CC BY-SA 4.0)"), note);
  });

  it("listPhotoNote: a US list credits (OSM)", () => {
    const note = listPhotoNote(["scene", "silhouette"], { country: "US" });
    assert.ok(note.includes("우리 자료로 만든 모형 (OSM)"), note);
    assert.ok(note.includes("건물 모양"), note);
  });

  it("listThumbKinds follows thumb order with reported street photos", () => {
    const sceneCard = { id: "c-32c-scene", scene: "st-x", lon: HOME.lon, lat: HOME.lat };
    const plainCard = { id: "c-32c-plain", lon: HOME.lon, lat: HOME.lat };
    const before = listThumbKinds([
      { candidate: sceneCard, photos: { slots: [] } },
      { candidate: plainCard, photos: { slots: [] } },
    ]);
    assert.deepEqual(before, ["scene", "minimap"]);
    reportListThumbKind("c-32c-plain", "street");
    const after = listThumbKinds([
      { candidate: sceneCard, photos: { slots: [] } },
      { candidate: plainCard, photos: { slots: [] } },
    ]);
    assert.deepEqual(after, ["scene", "street"]);
  });
});

describe("32c2 list photo note per language", () => {
  let React2;
  let renderToString2;
  let note2;
  let particle;
  let CandidatesCard2;

  before(async () => {
    React2 = (await import("react")).default;
    ({ renderToString: renderToString2 } = await import("react-dom/server"));
    ({ listPhotoNote: note2, listPhotoParticle: particle } =
      await import("../src/ui/candidate-card.jsx"));
    ({ CandidatesCard: CandidatesCard2 } = await import("../src/ui/chat.jsx"));
  });

  it("KO scene uses 이에요 after the final consonant", () => {
    const note = note2(["scene"], { country: "KR" }, "ko");
    assert.ok(note.includes("우리 3D 모형이에요"), note);
    assert.ok(!note.includes("모형예요"), note);
  });

  it("the particle follows the last syllable", () => {
    assert.equal(particle("사진"), "이에요");
    assert.equal(particle("모양"), "이에요");
    assert.equal(particle("지도"), "예요");
  });

  it("EN scene plus street over a Menlo bbox stays English, credits OSM without GIS", () => {
    const note = note2(["scene", "street"],
      { bbox: [-122.18, 37.46, -122.15, 37.48] }, "en");
    assert.ok(!/[가-힣]/.test(note), note);
    assert.ok(note.includes("our 3D model"), note);
    assert.ok(note.includes("street photo"), note);
    assert.ok(note.includes("(OSM)"), note);
    assert.ok(!note.includes("GIS"), note);
    assert.ok(note.includes("Mapillary"), note);
  });

  it("KO over a Seoul bbox credits GIS건물통합정보", () => {
    const note = note2(["scene"], { bbox: [127.0, 37.49, 127.06, 37.52] }, "ko");
    assert.ok(note.includes("GIS건물통합정보"), note);
  });

  it("SSR of the list carries data-no-i18n on the note node", () => {
    const noop = () => {};
    const cands = ["c1", "c2", "c3"].map((id) => ({ id, name: `${id}집`,
      kind: "오피스텔", lon: 127.1, lat: 37.4, build_year: 2003,
      tenures: [{ tenure: "jeonse", median_won: 287800000,
        min_won: 270000000, max_won: 300000000, deals: 9,
        budget_fit: "all", bucket_center_m2: 60 }],
      commute: { walk: { known: true, station: "양재", minutes: 9 },
        ride: { known: true, minutes: 11, lines: [], transfers: [] } } }));
    const html = renderToString2(React2.createElement(CandidatesCard2,
      { data: { candidates: cands, total_matching: 3, sort_note: "" },
        tenure: "jeonse", sort: "commute", onSort: noop,
        picks: [], onTogglePick: noop, onPreview3D: noop,
        onJeonse: noop, onRun: noop, onDetail: noop, onHover: noop,
        photoDeps: {}, destName: "강남", budgetWon: 400000000 }));
    const idx = html.indexOf("사진은 지도예요");
    assert.ok(idx !== -1, "the photo note renders");
    const tag = html.lastIndexOf("data-no-i18n", idx);
    assert.ok(tag !== -1 && idx - tag < 300, "the note node carries data-no-i18n");
  });
});

// 12b, C: preview cards. The jeonse signal is pure; photo
// attribution + the disabled SDK slots render server-side; the bundle
// carries no browser keys.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

register("./jsx-loader.mjs", import.meta.url);

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

const { renderToString } = await import("react-dom/server");
const { default: React } = await import("react");
const { Theme } = await import("@astryxdesign/core/theme");
const { neutralTheme } = await import("@astryxdesign/theme-neutral/built");
const preview = await import("../src/ui/preview.jsx");

function render(el) {
  return renderToString(
    React.createElement(Theme, { theme: neutralTheme, mode: "light" }, el));
}

const tenure = (key, center, median, deals) => ({ tenure: key,
  bucket_center_m2: center, range_m2: [center - 5, center + 5],
  median_won: median, min_won: median, max_won: median, deals,
  budget_fit: "all" });

describe("bucketJeonseSignal", () => {
  const { bucketJeonseSignal } = preview;

  it("divides medians in the same bucket only", () => {
    const s = bucketJeonseSignal([
      tenure("jeonse", 60, 185000000, 3), tenure("trade", 60, 400000000, 5),
    ]);
    assert.equal(s.computable, true);
    assert.equal(s.ratio_pct, 46.3);
    assert.equal(s.band.text, "70% 미만");
    assert.equal(s.band.id, null);
  });

  it("flags the 70/80 reference bands", async () => {
    const { JEONSE_WARNING_ID, JEONSE_CAUTION_ID } = await import("../src/money/jeonse.js");
    const warn = bucketJeonseSignal([
      tenure("jeonse", 60, 340000000, 3), tenure("trade", 60, 400000000, 5),
    ]);
    assert.equal(warn.band.text, "80% 이상");
    assert.equal(warn.band.id, JEONSE_WARNING_ID);
    const caution = bucketJeonseSignal([
      tenure("jeonse", 60, 290000000, 3), tenure("trade", 60, 400000000, 5),
    ]);
    assert.equal(caution.band.text, "70% 이상");
    assert.equal(caution.band.id, JEONSE_CAUTION_ID);
  });

  it("stays silent across buckets or thin sale history", () => {
    assert.equal(bucketJeonseSignal([
      tenure("jeonse", 60, 185000000, 3), tenure("trade", 84, 400000000, 5),
    ]), null);
    assert.equal(bucketJeonseSignal([tenure("jeonse", 60, 185000000, 3)]), null);
    const thin = bucketJeonseSignal([
      tenure("jeonse", 60, 185000000, 3), tenure("trade", 60, 400000000, 1),
    ]);
    assert.equal(thin.computable, false);
    assert.ok(thin.note.length > 0);
  });
});

describe("previewSources registry", () => {
  it("ships Commons + thumbnail on, SDK slots off without keys", () => {
    assert.equal(preview.previewSourceEnabled("commons"), true);
    assert.equal(preview.previewSourceEnabled("thumbnail"), true);
    assert.equal(preview.previewSourceEnabled("roadview"), false);
    assert.equal(preview.previewSourceEnabled("aerial"), false);
    assert.equal(preview.previewSourceEnabled("nope"), false);
    // Disabled slots render nothing (Theme shell only, no text).
    const textOf = (html) => html.replace(/<[^>]*>/g, "").trim();
    assert.equal(textOf(render(React.createElement(preview.RoadviewSlot))), "");
    assert.equal(textOf(render(React.createElement(preview.AerialSlot))), "");
  });

  it("leaves no browser keys in the bundle", { skip: !existsSync(join(HERE, "..", "dist")) ? "run vite build first" : false }, () => {
    const dir = join(HERE, "..", "dist", "assets");
    const files = readdirSync(dir).filter((f) => f.endsWith(".js"));
    assert.ok(files.length > 0, "a built bundle exists");
    for (const f of files) {
      const body = readFileSync(join(dir, f), "utf8");
      assert.ok(!/VITE_(KAKAO_JS_KEY|VWORLD_KEY)\s*=\s*["'][^"']+["']/.test(body),
        `${f}: no key values`);
      assert.ok(!body.includes("data/raw/"), `${f}: no raw-data refs`);
    }
  });
});

describe("PhotoStrip", () => {
  const photos = [
    { thumb_url: "https://example.com/a.jpg", page_url: "https://example.com/a",
      title: "미금역 앞", credit: "홍길동, CC BY-SA 4.0" },
    { thumb_url: "https://example.com/b.jpg", page_url: "https://example.com/b",
      title: "탄천 산책로", credit: "김철수, CC BY 2.0" },
  ];

  it("shows every photo with attribution + the disclaimer", () => {
    const html = render(React.createElement(preview.PhotoStrip, { photos }));
    for (const p of photos) {
      assert.ok(html.includes(p.credit), `credit: ${p.credit}`);
      assert.ok(html.includes(p.page_url), `link: ${p.page_url}`);
      assert.ok(html.includes(p.thumb_url), `thumb: ${p.thumb_url}`);
      assert.ok(html.includes(`alt="${p.title}"`), `alt: ${p.title}`);
    }
    assert.ok(html.includes("주변 사진 · 이 매물 사진이 아니에요"));
    assert.ok(html.includes('loading="lazy"'));
  });

  it("renders nothing without photos", () => {
    const html = render(React.createElement(preview.PhotoStrip, { photos: [] }));
    assert.equal(html.replace(/<[^>]*>/g, "").trim(), "");
  });
});

describe("PreviewCard", () => {
  const candidate = {
    id: "home-1", name: "천사의도시Ⅱ오피스텔", kind: "오피스텔",
    region: "bundang", lon: 127.1, lat: 37.35, build_year: 2015,
    match: "osm_name", pnu: null, osm_name: "천사의도시2",
    scene: "st-미금", photos: [],
    tenures: [tenure("jeonse", 40, 185000000, 3)],
    commute: {
      walk: { known: true, station: "미금", minutes: 3.8, source: "graph" },
      ride: { known: true, source: "derived", lines: ["수인·분당선"],
        transfers: [], distanceKm: 3.2, minutes: 6.6,
        note: "수인·분당선 미금→정자 (2개 역)",
        derived: { methodsUsed: ["schedule"] } },
    },
  };

  it("renders name, medians, commute with sources, OSM line", () => {
    const html = render(React.createElement(preview.PreviewCard,
      { candidate, tenure: "jeonse" }));
    assert.ok(html.includes("천사의도시Ⅱ오피스텔"));
    assert.ok(html.includes("오피스텔"));
    assert.ok(html.includes("2015년 지음"));
    assert.ok(html.includes("실거래"));
    assert.ok(html.includes("1억 8,500만 원"));
    assert.ok(html.includes("3건"));
    assert.ok(html.includes("집에서 미금까지 도보 3.8분 (그래프)"));
    assert.ok(html.includes("타는 시간 약 6.6분"));
    assert.ok(html.includes("서울교통공사 표준 운행시간"));
    assert.ok(html.includes("위치: OSM 단지 이름 일치"));
    assert.ok(html.includes("3D로 살아 보기"));
    assert.ok(html.includes("전세 점검"));
    assert.ok(html.includes("비교에 넣기"));
  });

  it("says 도보 미확인 when the walk is unknown", () => {
    const c = { ...candidate,
      commute: { walk: { known: false }, ride: { known: false } } };
    const html = render(React.createElement(preview.PreviewCard,
      { candidate: c, tenure: "jeonse" }));
    assert.ok(html.includes("도보 미확인"));
    assert.ok(html.includes("타는 시간 미확인"));
  });

  it("hands off to the real map without a scene", () => {
    const c = { ...candidate, scene: null };
    const html = render(React.createElement(preview.PreviewCard,
      { candidate: c, tenure: "jeonse" }));
    assert.ok(!html.includes("3D로 살아 보기"));
    assert.ok(html.includes("openstreetmap.org"));
    assert.ok(!html.includes("경로"), "no fake route lines");
  });

  it("states the monthly figure only for 월세", () => {
    const wolse = { ...candidate,
      tenures: [{ ...tenure("wolse", 40, 900000, 4),
        deposit_median_won: 10000000 }] };
    const html = render(React.createElement(preview.PreviewCard,
      { candidate: wolse, tenure: "wolse" }));
    assert.ok(html.includes("매달 집에 드는 돈"));
    const jeonse = render(React.createElement(preview.PreviewCard,
      { candidate, tenure: "jeonse" }));
    assert.ok(!jeonse.includes("매달 집에 드는 돈: "));
    assert.ok(jeonse.includes("매달 드는 돈은 살아 보기 뒤 생활비 탭에서 계산해요"));
  });
});

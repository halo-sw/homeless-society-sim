// 29a14: Open Graph / Twitter card tags with the founder's OG image.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "../index.html"), "utf8");
const head = html.slice(0, html.indexOf("</head>"));
const IMG = "https://halo-sw.github.io/ithaca/og/ithaca-og.jpg";

const tags = [
  ["title", "<title>Ithaca — The Pre-living Agent for Your Next Home</title>"],
  ['<meta name="description"', 'Muse Spark makes the everyday choices; a deterministic engine counts every minute and every won.'],
  ['<meta property="og:type"', 'content="website"'],
  ['<meta property="og:site_name"', 'content="Ithaca"'],
  ['<meta property="og:title"', 'content="Ithaca — The Pre-living Agent for Your Next Home"'],
  ['<meta property="og:description"', 'content="An AI agent that simulates 30 days in two homes before you move."'],
  ['<meta property="og:url"', 'content="https://halo-sw.github.io/ithaca/"'],
  ['<meta property="og:image" content', `content="${IMG}"`],
  ['<meta property="og:image:width"', 'content="1200"'],
  ['<meta property="og:image:height"', 'content="630"'],
  ['<meta property="og:image:alt"', 'Powered by Meta Muse.'],
  ['<meta name="twitter:card"', 'content="summary_large_image"'],
  ['<meta name="twitter:title"', 'content="Ithaca — The Pre-living Agent for Your Next Home"'],
  ['<meta name="twitter:description"', 'content="An AI agent that simulates 30 days in two homes before you move."'],
  ['<meta name="twitter:image"', `content="${IMG}"`],
];

describe("og tags 29a14", () => {
  it("contains the new title, description and each og/twitter tag with exact content", () => {
    for (const [marker, content] of tags) {
      assert.ok(html.includes(marker), `missing ${marker}`);
      assert.ok(html.includes(content), `wrong content for ${marker}`);
    }
    assert.ok(html.includes(`<meta property="og:image" content="${IMG}" />`));
    assert.ok(html.includes(`<meta name="twitter:image" content="${IMG}" />`));
  });

  it("all tags sit inside <head>", () => {
    assert.ok(head.length > 0, "no </head> found");
    for (const [marker, content] of tags) {
      assert.ok(head.includes(marker), `${marker} not in <head>`);
      assert.ok(head.includes(content), `content for ${marker} not in <head>`);
    }
  });

  it("og image exists, is a JPEG and is under 300 kB", () => {
    const p = path.join(here, "../public/og/ithaca-og.jpg");
    assert.ok(fs.existsSync(p), "og image missing");
    const buf = fs.readFileSync(p);
    assert.ok(buf.length > 0 && buf[0] === 0xff && buf[1] === 0xd8, "not a JPEG (FF D8)");
    assert.ok(buf.length < 300 * 1024, `og image ${buf.length} bytes >= 300 kB`);
  });

  it("loading lines still present", () => {
    assert.ok(html.includes("Loading the area…"));
    assert.ok(html.includes('<div id="loading">지역을 불러오는 중…</div>'));
  });
});

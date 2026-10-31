# Stage 29a14 — Link previews: Open Graph and Twitter card tags with the founder's OG image (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here (`grep -n` when numbers moved). Stop when the named tests pass.

## Why
When the live site (`https://halo-sw.github.io/ithaca/`) is pasted into Slack, Discord, KakaoTalk, X or a judging form, the preview today is bare: `web/index.html` has no description and no Open Graph tags, and the tab title is the stale `Ithaca — 미니어처 3D` (`web/index.html:6`). The founder made a share image; the orchestrator saved it as `web/public/og/ithaca-og.jpg` (1200×630, the standard OG size): the Ithaca logo, the line *An AI agent that simulates 30 days in two homes before you move.* and *Powered by Meta Muse*.

## Change — `web/index.html` `<head>` only
- `<title>Ithaca — The Pre-living Agent for Your Next Home</title>`.
- After the viewport meta, add:
```html
<meta name="description" content="An AI agent that simulates 30 days in two homes before you move. Muse Spark makes the everyday choices; a deterministic engine counts every minute and every won." />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="Ithaca" />
<meta property="og:title" content="Ithaca — The Pre-living Agent for Your Next Home" />
<meta property="og:description" content="An AI agent that simulates 30 days in two homes before you move." />
<meta property="og:url" content="https://halo-sw.github.io/ithaca/" />
<meta property="og:image" content="https://halo-sw.github.io/ithaca/og/ithaca-og.jpg" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="Ithaca — An AI agent that simulates 30 days in two homes before you move. Powered by Meta Muse." />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Ithaca — The Pre-living Agent for Your Next Home" />
<meta name="twitter:description" content="An AI agent that simulates 30 days in two homes before you move." />
<meta name="twitter:image" content="https://halo-sw.github.io/ithaca/og/ithaca-og.jpg" />
```
The image URLs are absolute on purpose (crawlers do not resolve relative OG URLs, and the Pages base path is `/ithaca/`). Leave the fonts, the 29g3 inline loading script and the body untouched.

## Test — new `web/tests/og-29a14.test.js`
- `web/index.html` contains the new `<title>`, `name="description"`, and each `property="og:…"` / `name="twitter:…"` tag above with those exact `content` values; `og:image` and `twitter:image` are `https://halo-sw.github.io/ithaca/og/ithaca-og.jpg`.
- All those tags sit inside `<head>` (before `</head>`).
- `web/public/og/ithaca-og.jpg` exists, starts with `FF D8`, and is under 300 kB.
- `web/index.html` still contains `Loading the area…` and `<div id="loading">지역을 불러오는 중…</div>`.

Run only:
```
cd web && node --test tests/og-29a14.test.js $(grep -ln "index.html\|미니어처 3D" tests/*.test.js | tr '\n' ' ') 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```
Update older pins only where they assert the old title text.

## Do not touch
Everything outside `web/index.html` except the new test; the image file; README files; `briefs/`.

## Final message
Changed files, one line each. Nothing else.

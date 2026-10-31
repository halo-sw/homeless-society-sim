# Stage 29a12 — The Ithaca poster opens the landing page (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here (`grep -n` when numbers moved). Stop when the named tests pass.

## Why
The founder made a key visual for the product: `web/public/landing/ithaca-intro.jpg` (1536×1024, 3:2, already in the repo). It is a dark engraved night scene — an arch on a hill, two glowing paths (orange and blue, the A and B homes) winding down through a lit neighbourhood to the sea — with the words **ITHACA**, *The Pre-living Agent for Your Next Home* and *We walk the odyssey. You just come home.* painted into the left side. It should be the first thing a visitor sees on the landing page, before the "어떤 집을 고민 중이세요?" hero.

The picture's background is a near-black navy (sampled corners `#0d131b`, `#0a1016`, `#161b22`).

## Change

### 1. `web/src/ui/landing-page.jsx`
Between `<div className="ds-lp-notice">{NOTICE}</div>` and `<div className="ds-lp-heroband">` (today `:169-171`), add:

```jsx
<section className="ds-lp-poster" aria-label="Ithaca">
  <img
    className="ds-lp-posterimg"
    src={assetUrl("landing/ithaca-intro.jpg")}
    alt="Ithaca — The Pre-living Agent for Your Next Home. We walk the odyssey. You just come home."
    width={1536} height={1024}
    decoding="async" fetchpriority="high"
    data-no-i18n />
</section>
```
Use the existing `assetUrl` import. The words are in the picture, so no extra heading.

### 2. `web/src/ui/ui.css` (next to the other `.ds-lp-*` hero rules, `grep -n "ds-lp-heroband {" web/src/ui/ui.css`)
- `.ds-lp-poster`: full-bleed band, `background: #0d131b` (add a token `--ds-lp-poster-bg: #0d131b` on `.ds-lp` and use it; the picture is the same in light and dark theme, so the token has one value), `display: flex; justify-content: center; overflow: hidden;`.
- `.ds-lp-posterimg`: `display: block; width: 100%; max-width: 1536px; height: auto; max-height: min(620px, 68vh); object-fit: contain;` so the whole picture (moon arc on top, tagline at the bottom) is always visible; the navy band fills the sides on wide screens and the edges blend into the picture.
- At `max-width: 720px`: `max-height: none` (the picture takes the full width, about 267 px tall at 400 px).
- No border, radius, shadow or overlay on the picture.

## Test — new `web/tests/landing-poster-29a12.test.js`
- SSR of the landing page contains `class="ds-lp-poster"`, an `<img` with `landing/ithaca-intro.jpg`, `width="1536"`, `height="1024"` and the alt text above.
- In the SSR string, `ds-lp-poster` comes after `ds-lp-notice` and before `ds-lp-heroband`.
- `web/public/landing/ithaca-intro.jpg` exists and starts with the JPEG bytes `FF D8`.
- `ui.css` has `.ds-lp-poster` with `--ds-lp-poster-bg` and `.ds-lp-posterimg` with `object-fit: contain`, and a `max-width: 720px` block that sets `.ds-lp-posterimg` `max-height: none`.

Run only:
```
cd web && node --test tests/landing-poster-29a12.test.js $(ls tests/landing-*.test.js | tr '\n' ' ') 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```
Update older landing pins only where they assert the exact first child after the notice.

## Do not touch
The hero text, try panel, nav, other sections, chat UI, `web/src/i18n/*`, the picture file, `briefs/`.

## Final message
Changed files, one line each. Nothing else.

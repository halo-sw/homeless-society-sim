# Stage 32e — the Ithaca SVG logo in the landing nav, the landing footer and the chat top bar (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section) and `web/AGENTS.md`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Why
The customer wants the real Ithaca logo (arch symbol + ITHACA wordmark, the one on the OG image) where the site now shows the plain text `Ithaca`:
1. the landing nav (their screenshot: `Ithaca  Features  Preview  Data  Questions`);
2. the main chat screen's top bar.

The orchestrator put the asset at `web/public/brand/ithaca-logo.svg`. It is ink `#1d1b18` on transparent, viewBox `0 0 1628 389` (≈ 4.19 : 1), and has its own `<title>Ithaca</title>`.

## Where (exact)
- `web/src/ui/landing-page.jsx:155` — `<span className="ds-lp-brand">Ithaca</span>` (nav)
- `web/src/ui/landing-page.jsx:415` — `<span>Ithaca</span>` inside `.ds-lp-foot-brand` (footer)
- `web/src/ui/topbar.jsx:190` — `<span className="ui-bar-title">Ithaca</span>` (chat / every app screen's top bar)
- CSS: `ui.css:1573` `.ds-lp-brand`, `ui.css:80` `.ui-bar-title`, `ui.css:1900` `.ds-lp-foot-brand span`, and the phone rule `ui.css:1462` `.ui-bar-title { white-space: nowrap; }`.
- **Asset URL:** use the same helper as the Muse logo: `assetUrl("brand/ithaca-logo.svg")` from `../paths.js` (see `powered-by-muse.jsx:2–4`), so it works under the Pages base `/ithaca/`.

## Change
1. **A small shared component** `IthacaLogo({ height })` in a new `web/src/ui/ithaca-logo.jsx`.
   - It renders `<img src={assetUrl(ITHACA_LOGO_PATH)} alt="Ithaca" height={h} width={Math.round(h * 1628 / 389)} className="ds-ithaca-logo" />`.
   - Export `ITHACA_LOGO_PATH = "brand/ithaca-logo.svg"`.
   - Give it explicit `width`/`height` so nothing shifts while it loads.
2. **Landing nav:** the logo replaces the text, 24 px high (≈ 100 px wide). Wrap it in a link to the top of the page (`href="#top"` or `/`, whatever the page already uses) with `aria-label="Ithaca"`. Keep `flex: none`.
3. **Landing footer:** the logo replaces the bold text, 20 px high; the tagline under it stays.
4. **Top bar:** the logo replaces `Ithaca`, 20 px high on desktop, 18 px at ≤ 480 px. Nothing next to it moves: the Muse badge and status keep their place, and the phone bar must not overflow at 390 px.
5. **Language:** the `alt` stays `Ithaca` (a name). The image is not translated.
6. **Tokens:** sizes from the CSS scale where one fits; no new raw hex.

## Test — new `web/tests/ithaca-logo-32e.test.js`
- **SSR the landing page:**
  - the nav has an `<img>` whose `src` ends with `brand/ithaca-logo.svg` and `alt="Ithaca"`;
  - no bare text node `Ithaca` remains in `.ds-lp-brand`;
  - the footer brand has the logo too.
- **SSR the top bar** in chat mode: the logo `<img>`, and `.ui-bar-title` (or its replacement) has no bare `Ithaca` text.
- `web/public/brand/ithaca-logo.svg` exists and contains `viewBox="0 0 1628 389"`.
- **Keep green:** every test that mentions `ds-lp-brand`, `ui-bar-title`, `ds-lp-foot-brand` or `PoweredByMuse`. If one pins the text `Ithaca` in those spots, re-point it at the logo and name it.

Run only (**run it before you finish**):
```
cd web && node --test tests/ithaca-logo-32e.test.js $(grep -lE "ds-lp-brand|ui-bar-title|ds-lp-foot-brand|PoweredByMuse|ui-bar-left" tests/*.test.js | tr '\n' ' ') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines. The orchestrator checks it in a real browser (landing + chat, KO + EN, 1440 and 390 px).

## Do not touch
`landing.jsx` (unused old landing), the map, `chat.jsx`, `src/engine/**`, `src/consult/**`, `src/i18n/**`, `README*`, the asset file.

## Final message
Changed files, one line each. Updated test files. Nothing else.

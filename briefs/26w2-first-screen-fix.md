# Stage 26w2 — first screen: the city must actually show; two cut texts (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator (dev server, Playwright, after 26w; 0 page errors; one `<canvas>` exists)
1. **No 3D city is visible.** At 1440×900 the screen shows:
   - white at both sides;
   - a beige column (about x 340–1100, full height) behind the content. That is the scrim/thread background, not the city.

   On phones the whole area is flat beige. The old landing (`landing.jsx`, captured the same way on 10-31) did show the city glide full-bleed behind the content, so headless rendering works.

   Likely causes, to check in order:
   - (a) in chat mode the 3D scene is not booted or its glide never starts until a scene is opened (chat-27 opens 3D on request);
   - (b) the canvas is there, but opaque chat layers (`.ui-chat`, the AppShell content, `.ui-chat-main`, the thread) paint over it;
   - (c) the scrim is opaque.
2. **The "예시 / Example" badge wraps** inside the cards at 1440 ("Exampl / e") when the title takes two lines.
3. **Phone (390 px): an example prompt overflows its card** on the right ("…초등학교 도보 1" is cut at the card edge).

## Change
1. While the chat is empty, the city glide is visible **full-bleed** behind the whole chat area at every width:
   - boot the same backdrop the old landing used (quiet glide, no captions) if chat mode does not;
   - make the layers above it transparent while empty (`ui-chat-thread-empty` and its ancestors in the chat column);
   - the scrim is a translucent radial wash, centre about 85 % white fading to about 35 % at the edges (phones: about 90 % / 60 %), so the city is clearly visible around the content;
   - when the first message is sent, everything returns to today's look;
   - without WebGL, a plain background as today.
2. The badge never wraps: `white-space: nowrap; flex: none`. The card title gets the shrink (`flex: 1 1 0; min-width: 0`).
3. The example card text wraps inside the card at every width (`min-width: 0` on the card and its text column, `overflow-wrap: anywhere` as the last resort; Korean keeps `word-break: keep-all`). The card itself never exceeds its grid column.

## Test — extend `web/tests/first-screen-26w.test.js`
- The CSS for the empty state makes the chat column layers transparent (assert the selectors and `background: transparent` or equivalent).
- The scrim uses an rgba or `color-mix` value with alpha < 1.
- The badge rule has `white-space: nowrap`; the example text rule has `min-width: 0`.
- If you add or adjust a boot path for the backdrop in chat mode, unit-test its pure decision helper (e.g. `shouldGlideBackdrop({ empty, webgl })`).
- Keep green: the same set as 26w.

Run:
```
cd web && node --test tests/first-screen-26w.test.js tests/phone-26p.test.js tests/mobile-26m.test.js tests/chat-scroll-13e2.test.js tests/compare-tabs.test.js $(ls tests | grep -E '^landing|27' | sed 's#^#tests/#') 2>&1 | tail -12
```
If still failing after 2 fix attempts, stop and print the last lines. The orchestrator checks it in a real browser.

## Do not touch
`web/src/engine/**`, `web/src/i18n/**`, `web/src/consult/**`, `pipeline/**`, `relay/**`, `.github/**`, `data/`. No `text-overflow: ellipsis`.

## Final message
Changed files, one line each, and which cause (a/b/c) it was. Nothing else.

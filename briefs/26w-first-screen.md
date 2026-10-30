# Stage 26w — the first screen shows the product, not a white page (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no build. Branch `ithaca-17` (chat-27 merged). Stop when this part is done.

## Found by the orchestrator
Since chat-27, `/` opens the chat empty state (`ChatEmpty`, `web/src/ui/chat.jsx:2383`). At 1440×900 it is:
- a small heading "어떤 집을 고민 중이세요?" at the top;
- about 500 px of white;
- then the composer and three starters.

The old landing (`web/src/ui/landing.jsx`) had a quiet 3D city glide behind it (`web/src/main.js:929`: "Landing/chat reuse the glide as a backdrop") and four example cards, `EXAMPLE_PROMPTS`. One of them is the US `us-meta` card ("Meta HQ, Menlo Park (US)"), which is now unreachable from the first screen.

A judge decides in seconds, so the first screen must show what Ithaca is.

## Change — `ChatEmpty` and its CSS
1. **Backdrop:**
   - while the chat is empty (no messages yet), the 3D city glide plays behind the empty state as on the old landing: quiet, no captions, a soft light scrim so text stays readable;
   - when the first message is sent, the backdrop goes away as the chat already does;
   - reuse the landing's mechanism; do not add a new renderer. If the 3D view cannot start (no WebGL), the screen is white as today.
2. **Content, vertically centred as one group:**
   - the product line `LANDING_HEADING` ("계약 전에, 그 집에서 30일 먼저 살아 봐요") as the heading and `LANDING_SUB` under it, both imported from `landing.jsx`;
   - the existing question "어떤 집을 고민 중이세요?" becomes the composer's label line;
   - the composer, then the existing starters;
   - then the four `EXAMPLE_PROMPTS` as compact cards (title + prompt, the `예시` badge as on the old landing). Clicking one sends its prompt as the first message, the same path as typing it;
   - the coverage line stays last. Add a second line for the US: reuse the landing's US coverage line if one exists (grep `미국 1곳`).
3. **Phone (≤ 480 px):**
   - the cards become one column;
   - the backdrop stays, but the scrim is stronger;
   - nothing is cut. Follow the 26m/26p rules (no `text-overflow: ellipsis`, buttons `flex: none`).

## Test — `web/tests/first-screen-26w.test.js`
- SSR `renderToString(<ChatEmpty …/>)` contains `LANDING_HEADING`, the four example titles (including `Meta HQ, Menlo Park (US)`), the composer and the coverage line.
- Clicking an example calls `onSend` with that example's prompt. Test the handler directly if a DOM is not available: export the small helper.
- `ui.css`: the empty-state backdrop/scrim rule exists, the 480 px block makes the example cards one column, and there is still no `text-overflow: ellipsis`.
- Keep green: every `tests/landing*`, `tests/*27*`, `tests/phone-26p.test.js`, `tests/mobile-26m.test.js`, `tests/chat-scroll-13e2.test.js`, `tests/compare-tabs.test.js`.

Run:
```
cd web && node --test tests/first-screen-26w.test.js tests/phone-26p.test.js tests/mobile-26m.test.js tests/chat-scroll-13e2.test.js tests/compare-tabs.test.js $(ls tests | grep -E '^landing|27' | sed 's#^#tests/#') 2>&1 | tail -12
```
If still failing after 2 fix attempts, stop and print the last lines. The orchestrator checks the look in a real browser.

## Do not touch
`web/src/engine/**`, `web/src/i18n/**` (the orchestrator adds any new English), `web/src/consult/**`, `pipeline/**`, `relay/**`, `.github/**`, `data/`. Another stage is editing `relay/handler.js`, `.github/workflows/pages.yml`, `web/package*.json`, `web/src/paths.js` and `web/tests/pages-22*.test.js` right now.

## Final message
Changed files, one line each, and any new Korean strings that need English. Nothing else.

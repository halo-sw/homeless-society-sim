# Stage 26w3 — first screen: last three defects (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator
Captures after 26w2: desktop 1440 × 900 and iPhone 13 (390 × 844), Korean and English. The city now shows behind the first screen, and the badge stays on one line. Three defects are left.

1. **Phone: example card text runs out of the card (both languages).**
   - `.ui-landing-cardprompt` computes to `white-space: nowrap`. Its `scrollWidth` is 376 px in a 324 px box ("…초등학교 도보 1", "savings 50M…").
   - Cause: the 26m phone rule `#ui-root button * { white-space: nowrap; }` (ui.css ~1036). The ID selector beats the class rule from 26w2.
   - 26p solved the same problem for moments with `#ui-root .ui-moment-text { white-space: normal; }`.
2. **Desktop: a hard-edged lighter band behind the content.**
   - While empty, the thread is still `max-width: 760px; margin: 0 auto` (`.ui-chat-main[data-work="closed"] .ui-chat-thread`, ui.css ~697). The scrim is drawn only inside that 760 px column, so a light rectangle with vertical edges shows at x ≈ 340 and 1100.
   - The two coverage lines at the bottom ("Areas covered: …", "US, 1 area: …") sit where the scrim is weakest. They are hard to read over the buildings.
3. **Phone, English: the header breaks.**
   - "Muse" wraps to "Mus / e".
   - The status badge reads "Connected · Muse Spar…": something clips it, and our CSS must not clip text.
   - In Korean it fits ("연결됨 · Muse Spark 1.3").

## Change
1. **Card text wraps on phones.** Inside the existing 480 px block, add:
   ```css
   #ui-root .ui-landing-cardprompt, #ui-root .ui-landing-cardtitle { white-space: normal; }
   ```
   Keep `.ui-landing-cardbadge` (the "예시 / Example" tag) `nowrap`.
2. **Full-bleed while empty (desktop).**
   - When the thread has `.ui-chat-thread-empty`, it takes the full width: `max-width: none; margin: 0; width: 100%`. Raise specificity over the `[data-work="closed"]` rule.
   - The scrim then covers the whole area. Its radial gradient fades with no visible edge.
   - The content body stays centred at `max-width: 720px`.
   - Put the two coverage lines in one soft backing: `background: color-mix(in srgb, var(--ui-page) 88%, transparent)`, radius 10 px, padding 8 px 12 px, `width: fit-content`. Find the class `chat.jsx` uses for those lines and keep their text unchanged.
3. **Phone header.**
   - The "Muse" word next to the logo gets `white-space: nowrap; flex: none`.
   - On phones (`usePhoneMedia()` or the 480 px block), the badge shows a short label: `museStatusShort(live)` → live `"연결됨"`, else `"규칙 모드"`. Export it next to `museStatusLabel` in `src/ui/topbar.jsx`. The long label moves to the badge's `title`.
   - Find what clips the badge (an inherited `max-width` + `overflow: hidden`, or a design-system `text-overflow`). Under the 480 px block, set the badge to `max-width: none; overflow: visible`. Do not add `text-overflow: ellipsis` anywhere.

## Test — extend `web/tests/first-screen-26w.test.js`
- `ui.css` has a rule with `#ui-root` that sets `.ui-landing-cardprompt` to `white-space: normal` inside the 480 px block.
- `ui.css` has a rule that gives `.ui-chat-thread-empty` `max-width: none`.
- `museStatusShort(true) === "연결됨"`, `museStatusShort(false) === "규칙 모드"`.
- Still no `text-overflow: ellipsis` in `ui.css`.
- Keep green: `tests/landing-chat-12b.test.js`, `tests/mobile-26m.test.js`, `tests/phone-26p.test.js`, `tests/chat-scroll-13e2.test.js`, `tests/compare-tabs.test.js`, and every `tests/topbar*` file.

Run only:
```
cd web && node --test tests/first-screen-26w.test.js tests/landing-chat-12b.test.js tests/mobile-26m.test.js tests/phone-26p.test.js tests/chat-scroll-13e2.test.js tests/compare-tabs.test.js $(ls tests | grep -E '^topbar' | sed 's#^#tests/#') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines. The orchestrator checks the look in a real browser.

## Do not touch
`src/engine/**`, `src/i18n/**` (the orchestrator adds the English for the short badge), `pipeline/**`, `relay/**`, `data/`, `README*`. Once the first message is sent, the chat screen must look exactly as before.

## Final message
Changed files, one line each. Nothing else.

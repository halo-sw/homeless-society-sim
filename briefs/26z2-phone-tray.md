# Stage 26z2 — phones: the pick tray never covers the composer (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator
iPhone 13 (390 × 664 CSS viewport in Playwright), English, Meta HQ: candidates → "Save 1 and 2". The **Chat** tab of the phone pane toggle is active.

Measured after the save:

| Element | Top–bottom (px) |
|---|---|
| suggestion chips `.ui-chat-chips` | 526–562 |
| composer | 582–604 |
| pick tray (`.ui-picks-tray`: A 10 Coleman Place ×, B 777 Hamilton Avenue ×, the run button) | about 543–664, drawn over both |

So after saving on a phone, **the user cannot see or reach the composer or the chips**.

**Cause:**
- `PicksTray` mounts when `workOpen && !scene` (`src/ui/chat.jsx` ~2338), as `position: absolute; bottom: 0` (ui.css ~727, and the ≤1099 px rule ~767).
- At ≤1099 px the stage/work column is hidden unless `.ui-chat-narrow-work` is set.
- The tray is not inside the hidden column, so it overlays the chat pane.

## Change
1. **At ≤1099 px**, the tray shows only when the work pane is the visible one: the `.ui-chat-narrow-work` state, i.e. "Map & homes" selected. On the Chat tab it is hidden (`display: none`) or not rendered.
   - Pick the selector or the JS condition that matches how `.ui-chat-narrow-work` is set.
   - Desktop (≥1100 px) is unchanged.
2. **In the Chat tab on phones**, after picks exist, the run action stays reachable without covering anything:
   - render one compact in-flow row directly above the chips: `A · B — [Live 30 days in each]`, using the same `RUN_BUTTON_LABEL`, the same `onRun` and the same gate behaviour as the tray (`WORKPLACE_ASK_LABEL` when the workplace is missing);
   - it is part of the normal column flow (not absolute), so the chips and composer move up, never under it;
   - names may wrap at spaces;
   - reuse `PicksTray` with a `compact` prop if that is simpler.
3. While the pane is "Map & homes", the tray stays as today: a bottom sheet over the map.

## Test — `web/tests/phone-tray-26z2.test.js`
- `ui.css` (or the JSX condition, whichever you chose): at ≤1099 px the tray is hidden when the narrow pane is chat. Assert on the rule text or on the rendered output for both pane states.
- SSR of the chat column on phone state with 2 picks and the chat pane active: it contains the compact run row with `이 집들로 30일 살아 보기` and no absolute-positioned `.ui-picks-tray` (or the tray is marked hidden for that state).
- No `text-overflow: ellipsis` in `ui.css`.
- Keep green: `tests/tray-money-26z.test.js`, `tests/mobile-26m.test.js`, `tests/phone-26p.test.js`, `tests/first-screen-26w.test.js`, `tests/chat-scroll-13e2.test.js`, `tests/compare-tabs.test.js`, and every `tests/tray*` / `tests/picks*` file.

Run only:
```
cd web && node --test tests/phone-tray-26z2.test.js tests/tray-money-26z.test.js tests/mobile-26m.test.js tests/phone-26p.test.js tests/first-screen-26w.test.js tests/chat-scroll-13e2.test.js tests/compare-tabs.test.js $(ls tests | grep -E '^(tray|picks)' | grep -v 26z | sed 's#^#tests/#') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines. The orchestrator measures it again in a real browser.

## Do not touch
`src/engine/**`, `src/i18n/**`, `src/consult/**`, `pipeline/**`, `relay/**`, `data/`, `README*`. Desktop layout must not change.

## Final message
Changed files, one line each. Nothing else.

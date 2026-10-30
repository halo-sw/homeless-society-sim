# Stage 27e0 — Update the old pins 27a–27d changed; no ellipsis in CSS (brief for Muse)

Agent mode, rules in `AGENTS.md` (usage budget section). Branch `chat-27`. First edit within 2 tool calls. Small run: edit, run the four files, stop.

The full suite has 5 new failures, all from the chat-first decision (`docs/product.md`). Fix each as stated:

1. `web/src/ui/ui.css:645` — `text-overflow: ellipsis; white-space: nowrap;` (added in 27a–27d). Rule from `web/tests/compare-tabs.test.js:62-65`: no ellipsis, Korean wraps. Replace with `overflow-wrap: anywhere; word-break: keep-all;` (drop `text-overflow`, `white-space: nowrap`, and a lone `overflow: hidden` on that rule if it only served the ellipsis).
2. `web/tests/consult-tools.test.js:61-…` — the tool list pin: add `neighborhood`, `open_panel`, `pick_homes`, `start_life_run` (sorted), and rename the test to `exposes the forty-two documented tools` (or the actual count).
3. `web/tests/landing-chat-12b.test.js:227-233` — `bar.includes('label: "대화"')` checked the removed mode switch. Check instead that `topbar.jsx` contains `대화로` (the `← 대화로` button on sim/tour screens).
4. `web/tests/landing-chat-12b.test.js:173-181` — "empty chat shows no figures": the new empty screen has the product line `…원하면 그 집에서 30일 살아 봐요.` The rule is about demo figures, and `30일` is the product's name for the run. Filter the figure `30일` out before the `deepEqual` (one line, with a comment). Do not change the copy.
5. `web/tests/ui-render.test.js` — the chat shell smoke test asserts `mode 살아 보기` (`grep -n "mode 살아 보기" web/tests/ui-render.test.js`). The mode switch is gone; assert instead that the rendered chat shell contains `Muse` and does not contain `동네 둘러보기`.

Do not touch `walked-hours B value` (`ui-render.test.js:285`) or `demo-two-homes-B C01` (`web/tests/*16b*`): they were failing before this branch (demo B data) and stay as they are.

Run only:
```
cd web && node --test tests/compare-tabs.test.js tests/consult-tools.test.js tests/landing-chat-12b.test.js tests/ui-render.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -10
```
Expected: only `walked-hours B value` still fails.

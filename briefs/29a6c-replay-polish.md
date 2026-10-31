# Stage 29a6c — Replay banner and English result lines (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here (`grep -n` when numbers moved). Stop when the named tests pass.

## Why
Orchestrator's capture of `?replay=menlo-month&lang=en` at 1440×900 after 29a6b (replay works, 0 consult calls):
1. **The replay banner is unstyled.** The text starts at x=0 with no padding and wraps (`…plays without a / key`); `Skip` and `Try it yourself` render as two full-width stacked rows; the block sits over the thread and hides the top of the result card. Find it: `grep -n "replayMeta\|Try it yourself\|직접 해 보기" web/src/ui/chat.jsx`.
2. **Result moment line**: `in the evening home A 354 h vs B 350 h` — Korean source is the sim card's "살아 보니" moment built for the evening-at-home metric (`grep -rn " vs " web/src/ui/*.jsx web/src/ui/*.js` and the moments code near `SimulationCard`); English should read `Evenings at home: A 354 h · B 350 h`, Korean `저녁에 집에 있던 시간: A 354시간 · B 350시간`.
3. **Money cell** `$4,261/mo(ZIP estimate)` — missing space before `(` in the US cell (`web/src/ui/chat.jsx:~220-230` splitter and `:~618`). Show the source as the small second line the 26m splitter intends: `$4,261/mo` + small `ZIP estimate`.
4. **USGS source name** `USGS The National Map (Map · Aerial photo, Peobeulrik Domein)`: add the whole name `USGS The National Map (지도·항공사진, 퍼블릭 도메인)` → `USGS The National Map (map · aerial photo, public domain)` to `web/src/i18n/en.js`, and give the entry in `web/src/sources.js:~187` a `short: "USGS"` so the 29a4 chip uses it.
5. **Pick tray CTA truncates**: `Live it for 30 days in these hom…` (the tray at the bottom of the map; `grep -n "30 days\|30일 살아" web/src/ui/*.jsx`). Allow wrap or use the shorter label `30일 살아 보기` / `Live 30 days`.

## Change
1. Banner: one compact sticky row at the top of the thread — `display:flex; align-items:center; gap: var(--ds-s8); padding: var(--ds-s8) var(--ds-s12); background: var(--ds-sunken); border-bottom: 1px solid var(--ds-line)`; text 13 px `--ds-ink-2`, `flex: 1 1 auto; min-width: 0` (wraps inside, never under the buttons); `Skip` ghost sm, `Try it yourself` secondary sm, both `flex: none`. Thread content starts below it (no overlap). Hide the bar when replay finished (keep `Try it yourself` as a chip under the last message instead). Use `ds-` classes in `web/src/ui/ui.css`.
2–5 as described above.

## Test — new `web/tests/replay-polish-29a6c.test.js`
- `ui.css` has the replay bar class with `display: flex` and the text `min-width: 0`.
- The moment formatter for evening hours → ko `저녁에 집에 있던 시간: A 354시간 · B 350시간`; en translation `Evenings at home: A 354 h · B 350 h`.
- The US money cell splits into `$4,261/mo` and `ZIP estimate` (no `mo(`).
- en.js has the USGS whole-name entry; `sources.js` USGS entry has `short`.
- Tray CTA label is `30일 살아 보기`.

Run only:
```
cd web && node --test tests/replay-polish-29a6c.test.js tests/judge-path-29a6.test.js tests/global-polish-29a4.test.js $(grep -ln "SimulationCard\|ZIP 추정\|30일 살아" tests/*.test.js | tr '\n' ' ') 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```
If an older pin asserts the old moment text, the old tray label or the joined money cell, update only that pin.

## Do not touch
Landing files, map / 3D / engine files, `web/src/i18n/dom.js`, `web/public/recorded/*`.

## Final message
Changed files, one line each. Nothing else.

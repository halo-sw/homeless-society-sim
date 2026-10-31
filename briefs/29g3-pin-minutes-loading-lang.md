# Stage 29g3 — Map pins show the same commute the card shows; the first loading line speaks the page's language (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here (`grep -n` when numbers moved). Stop when the named tests pass.

## Why
Two things a judge sees in the first minute of the English replay (`?replay=menlo-month&lang=en`), captured by the orchestrator on the public site, 2026-10-31:

1. **Pin minutes disagree with the card.** Home A's map pin says **38 min**, while its candidate card and the engine say **bike 11 min**. The pin comes from `commuteMinutesOf` in `web/src/chatmap.js:282-288`, which adds `commute.walk.minutes + commute.ride.minutes`. For US homes `commute.walk` is the walk to the Caltrain station (37.6 min) and `ride` is unknown; the real door-to-work trip is `commute.work` (`{ walk_minutes, bike_minutes, mode, minutes, source }`, built in `web/src/homes.js:303-308`). The card (`web/src/ui/candidate-card.jsx:51-54`) and the engine (`web/src/chat/engine.js:329`, `web/src/homes.js:616`) already use `commute.work.minutes`.
2. **Korean text on the English page.** `web/index.html:22` is a static `<div id="loading">지역을 불러오는 중…</div>`. It shows before any script runs, so the i18n layer never translates it (the English string `Loading the area…` already exists in `web/src/i18n/en.js:8`).

## Change

### 1. `web/src/chatmap.js` — `commuteMinutesOf`
When `candidate.commute.work` has a finite `minutes`, return it (rounded to one decimal) — that is the door-to-work trip the card and the engine use. Otherwise keep today's walk + ride sum. Update the comment above the function in one line. Do not change Korean candidates that have no `commute.work`.

### 2. `web/index.html` — the first loading line
Add a tiny classic inline `<script>` right after the `#loading` div (before the module script) that sets `document.getElementById("loading").textContent = "Loading the area…"` when the language is English, using the same order as `detectLang` in `web/src/i18n/lang.js:2-10`: `?lang=en|ko` wins, then `localStorage["ithaca.lang"]` (inside try/catch), then `navigator.language` (`""` → ko, starts with `ko` → ko, else en). Also set `document.documentElement.lang` to the result. No imports; keep it under 15 lines.

## Test — new `web/tests/pin-minutes-29g3.test.js`
- `commuteMinutesOf` (export it if it is not exported) of `{ commute: { walk: { minutes: 37.6, known: true }, ride: { known: false, minutes: null }, work: { mode: "bike", minutes: 11.4, walk_minutes: 36.5, bike_minutes: 11.4 } } }` → `11.4`.
- Without `work`: `{ commute: { walk: { minutes: 3.1, known: true }, ride: { known: true, minutes: 5 } } }` → `8.1`; nothing known → `null`.
- The first US candidate in `web/public/recorded/menlo-month.json` that has `commute.work` → `commuteMinutesOf` equals its `commute.work.minutes` (rounded to one decimal).
- `web/index.html` still contains `<div id="loading">지역을 불러오는 중…</div>`, and contains `Loading the area…` and `ithaca.lang` inside a non-module `<script>` that comes before `<script type="module"`.
- Run that inline script in `node:vm` with fake `location.search`, `localStorage` and `navigator.language` and a fake `document` (`getElementById` returning an object, `documentElement` an object): `?lang=en` → text `Loading the area…`, `lang` `en`; `?lang=ko` → text unchanged; no query, stored `en` → English; no query, nothing stored, `navigator.language = "en-US"` → English; `"ko-KR"` → unchanged.

Run only:
```
cd web && node --test tests/pin-minutes-29g3.test.js $(grep -ln "commuteMinutesOf\|chatmap.js\|index.html" tests/*.test.js | tr '\n' ' ') 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```
Update older pins only where they assert the exact pin minutes of a candidate that has `commute.work`.

## Do not touch
Landing files, chat UI, candidate card, engine files, `web/src/i18n/*`, recordings, `briefs/`.

## Final message
Changed files, one line each. Nothing else.

# Stage 29a6b — Replay loads; banner and US money read right (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 2 tool calls. Stop when the named tests pass.

## Why
The orchestrator committed the two real recordings (`web/public/recorded/menlo-month.json`, `seoul-couple.json`; both pass `validateRecording`) and opened `?replay=menlo-month&lang=en` with `/api/consult` blocked:
1. **`Couldn't load the recording`.** The browser requested `http://localhost:48750/?recorded/menlo-month.json` → HTML. `recordingUrl` (`web/src/chat/recording.js`) uses `appUrl`, which builds a **query** URL (`web/src/paths.js:50`). Static files need `assetUrl` (`web/src/paths.js:22`, base-aware for Pages).
2. **Banner garbled in English**: `Girokdoen Chat · Silje Dapbyeon · Ki Eopi Play`. `chat.jsx:~2507` renders `기록된 대화 · {date} {model} 실제 답변 · 키 없이 재생` as several text nodes with interpolated values, so the en.js whole-string entry never matches and the word fallback romanizes.
3. From the Meta HQ recording (English): budget difference reads `239 under budget` (no `$`) — `budgetFactFor` (`web/src/ui/candidate-card.jsx:154-165`) always formats won. And the USGS source shows `(Map · Aerial photo, Peobeulrik Domein)` — `퍼블릭 도메인` (`web/src/sources.js:187-189`) is not in the phrase table.

## Change
1. `recordingUrl(id)` → `assetUrl("recorded/" + id + ".json")`. Update the 29a6 test expectation.
2. Banner: build the whole line in one string by language (`currentLang()`): ko `기록된 대화 · {date} {model} 실제 답변 · 키 없이 재생`, en `Recorded conversation · real {model} answers from {date} · plays without a key`; render it inside one element with `data-no-i18n`.
3. `budgetFactFor`: when the candidate/profile currency is USD, format the difference as dollars with the same helper the US price line uses (`grep -n "USD\|\\$" web/src/ui/candidate-card.jsx`), e.g. `$239 under budget` / `$1,022 over budget` (Korean `예산보다 $239 적어요`).
4. en.js: `퍼블릭 도메인` → `public domain`, `퍼블릭 도메인 (미국 정부 제작)` → `public domain (US government work)`.

## Test — extend `web/tests/judge-path-29a6.test.js`
- `recordingUrl("menlo-month")` ends with `recorded/menlo-month.json` and contains no `?`.
- The two committed recordings in `web/public/recorded/` pass `validateRecording`.
- `chat.jsx` source: the banner uses one string per language and `data-no-i18n`.
- A USD candidate with median 4261 and budget 4500 → fact contains `$239`.
- en.js translates `퍼블릭 도메인` to `public domain`.

Run only:
```
cd web && node --test tests/judge-path-29a6.test.js tests/results-list-29a2.test.js tests/english-live-29a7.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```

## Final message
Changed files, one line each. Nothing else.

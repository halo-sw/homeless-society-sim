# Stage 29a1 — English mode keeps the customer's words and reads them right (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here (`grep -n` when numbers moved). Stop when the named tests pass.

## Why
Judges will use the English UI (stage 29a makes English the default for non-Korean browsers). An outside review plus the orchestrator's reproduction on the live site (`?lang=en`, typed `맞벌이 예비부부, 강남 출근, 전세 4억 이하, 59㎡ 이상`) found trust-breaking defects that do **not** happen in Korean mode:

1. **The customer's own sentence is mangled.** The user bubble shows `, 59㎡ 이상Ha I ₩400MSe, Jeon ChulgeunNam, GangBuBuBi YeIBeolMat`: the DOM translator (`web/src/i18n/dom.js`) rewrites the bubble text. The customer's words must never be translated or romanized.
2. **Wrong homes.** The profile card showed `Commute where?` and `Jeonse, monthly rent, or purchase?` as unknown, and the list mixed jeonse ₩1,415M and monthly-rent homes (budget 4억 ignored, `6 of 7,541`). Korean mode with the same sentence is correct (`강남 출근 · 2인 · 전세 4억 원 이하`, 6 of 2,030, all 예산 안). Cause: in English mode Muse passes an English paraphrase as `extract_profile.text`; `extractProfileCore` (`web/src/profile.js`) reads Korean values (강남, 전세, 4억) and finds none in the paraphrase, so `find_homes` runs without workplace/tenure/budget.
3. **Names and particles romanized.** `Tawopaelriseu2` (타워팰리스2), `Sinilyutobil` (신일유토빌), `Jinhauseu`, and `Gangnamkkaji` (강남까지, the particle romanized as part of the name). Romanization comes from `romanizeName` in `web/src/i18n/translate.js:105` and `:151`.
4. **Guidance points at a map that is not on screen.** `localNoAnswerLine` (`web/src/ui/chat.jsx:957`) and `en-table.js:761-762` tell the customer to use a button "below the map".
5. **Plurals.** `1 things checked`, `1 unknown values` (`web/src/i18n/en-table.js:1507`, `:2127`).

## Change

### 1. Customer text is never translated — `web/src/ui/chat.jsx:2249-2252`
```jsx
                    {m.role === "user" ? (
                      <ChatMessage sender="user">
                        <ChatMessageBubble>{m.content}</ChatMessageBubble>
                      </ChatMessage>
```
Put `data-no-i18n` on the user bubble (the translator skips that subtree, `dom.js:46-62`). Do the same for any other place that echoes the customer's raw words (pasted listing text preview: `grep -n "listing" web/src/ui/chat.jsx` for where pasted text is shown back; only if it exists).

### 2. `extract_profile` reads the customer's original words — `web/src/ui/chat.jsx:1795-1798` and `web/src/consult/tools-search.js:135-155`
- In the agent context (`const ctx = { ...agentContext(store.getState()), lang: LANG, …`), add `customer_text`: the contents of the last 6 user text messages plus the current `text`, oldest first (strings only).
- In `extract_profile`, parse `[...(session.context?.customer_text || []), args.text].join("\n")` instead of `args.text` alone (keep `args.text` last; empty strings dropped). Values found in the customer's own words are valid "values present in the text". Keep the error path when nothing is found.
- Add one line to the tool description of `extract_profile` (`tools-search.js:291-299`): `In English mode pass the customer's words as written (do not translate); the tool also reads the original messages.`

### 3. Home names: original Hangul + a readable gloss — `web/src/i18n/translate.js` and the name renderers
- Home and complex names (candidate rows, picks, result card heads, map pins: `grep -n "c.name\|home.name\|\.name}" web/src/ui/chat.jsx web/src/ui/stage*.jsx` and follow the name spans) render the Hangul original inside a `data-no-i18n` span. In English mode add, after it, a muted gloss in parentheses from `romanizeName` (e.g. `타워팰리스2 (Tawopaelriseu 2)`), class `ui-name-gloss`, `--ds-ink-3`, 12 px. Korean mode unchanged.
- Particles: in the word-by-word fallback (`translate.js:~140-152`), when a token is `<name>까지` / `<name>에서` / `<name>으로|로`, translate the particle (`to …`, `from …`, `to …`) instead of romanizing it with the name. Add a pattern to `web/src/i18n/en-table.js` for the commute line `{place}까지 약 {n}분` → `about {n} min to {place}` (find the Korean template with `grep -rn "까지 약" web/src` — it is built in the commute summary code).

### 4. Guidance matches the screen — `web/src/ui/chat.jsx:957` and `web/src/i18n/en-table.js:761-762`
- `localNoAnswerLine` 살아 branch → `두 곳을 담고 "두 집에서 살아 봐 줘"라고 말하면 30일을 살아 봐요.` (no "지도 아래"). Update the 27j test pin that expects `30일 살아 보기` only if it breaks (keep `30일`).
- en-table 761/762: rewrite to match the new Korean strings (or remove if the Korean strings are no longer used: `grep -rn "지도 아래" web/src`).

### 5. Plurals — `web/src/i18n/en-table.js:1507`, `:2127` (and the 26s comment block at `web/src/i18n/en.js:273`)
`1 thing checked` / `N things checked`; `1 unknown value — …` / `N unknown values — …`. Follow how en.js already handles counts (`grep -n "plural\|=== 1" web/src/i18n/*.js`).

## Test — new `web/tests/english-trust-29a1.test.js`
- Source: `chat.jsx` user bubble line carries `data-no-i18n`.
- `extract_profile` with `session.context.customer_text = ["맞벌이 예비부부, 강남 출근, 전세 4억 이하, 59㎡ 이상"]` and `args.text = "dual-income engaged couple, commute to Gangnam, jeonse up to 400M, 59 m2+"` → profile has workplace 강남 (as the Korean parser stores it), tenure 전세, budget 400,000,000, size ≥ 59, household 2. Reuse the network fixture pattern from an existing extract_profile test (`grep -ln "extract_profile" web/tests/*.test.js`).
- Translator (`createTranslator` with the real tables, as `web/tests/english-muse-26s.test.js` does): `강남까지 약 11분` → contains `11 min` and `Gangnam`, does not contain `kkaji`; `1개 확인` style count string from line 2127's Korean source with 1 → `1 thing checked`.
- `localNoAnswerLine("두 집에서 살아 봐 줘")` does not contain `지도 아래`.

Run only:
```
cd web && node --test tests/english-trust-29a1.test.js tests/english-muse-26s.test.js tests/muse-recovers-27j.test.js tests/agent-profile-27b3.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```

## Do not touch
Landing files (`landing-page.jsx`, landing CSS), map / 3D / engine files.

## Final message
Changed files, one line each. Nothing else.

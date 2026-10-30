# Stage 24c — English mode: no hang, words before romanizing, Muse answers in English (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found on the GPU
1. **`?lang=en` freezes the page.** The browser stops answering script injection, so this is a microtask loop.
   - Cause: in `web/src/i18n/dom.js`, `translateSingle` (71-79), `translateLeaf` (81-95) and `translateAttrs` (97-119) write even when the node already holds that exact value.
   - Setting `nodeValue` or `setAttribute` to the same value still queues a mutation record. The observer then calls `retarget` → `translateSingle` again → writes again, and so on.
   - It happens whenever a translation still has Hangul in it, or the output equals what is already there.
2. **Joined labels are romanized instead of translated.**
   - "강남 출근 · 1인 · 전세 3억 원 이하" becomes "Gangnam Chulgeun · 1in · Jeonse 3eok Won Iha".
   - "전세 2억 6,000만 원" becomes "Jeonse 2 eok 6,000 man won".
   - Pattern captures (`translate.js:88-95`) and `nameFallback` romanize any leftover Hangul word, even common words.
3. **Muse replies in Korean** to an English-speaking user, and the reply guard only knows Korean verdict phrases.

## Change
1. **`web/src/i18n/dom.js` — never write a value that is already there.**
   - `translateSingle`: write only when `t.nodeValue !== out`. Always record `st.written.set(t, out)` when `out !== src`, even if you skip the write.
   - `translateLeaf`: skip the whole write when `texts[0].nodeValue === out` and every other text node is already `""`.
   - `translateAttrs`: `setAttr(el, attr, out)` only when `cur !== out`; `setAttr(el, srcKey, src)` only when `stored !== src`.
   - `translateTitle`: only when `doc.title !== out`.
   - Add a re-entrancy guard in the observer callback: a `busy` flag around the loop. Also keep a `WeakMap` node → count of writes in the current animation frame, reset with `requestAnimationFrame` when available. Past 3 writes to the same node in one frame, skip that node. This is a safety net.
2. **`web/src/i18n/translate.js` — words before romanizing.**
   - `createTranslator({ phrases, patterns, words = {} })`.
   - New inner `wordFallback(s)`:
     - first run `localizeNumbers(s)`;
     - split on single spaces, keeping `·`, `(`, `)`, `,`, `:` as separate tokens;
     - map each token: a token with no Hangul is unchanged; then `phrases[token]`; then `words[token]`; then the token with a trailing particle `(이|가|은|는|을|를|의|에|에서|으로|로|와|과|도|만)$` stripped and looked up in phrases/words; else `romanizeName(token)`;
     - join with spaces, then tidy spaces before `,` `)` `:` and after `(`.
   - Use `wordFallback` in place of `romanizeName` in pattern captures (lines 88-95). Also use it in `translateCore` in place of `nameFallback` for any core of up to 8 tokens without a sentence ending (`/(요|다|까|죠|니다)[.?!]?$/`). Longer or sentence-like cores keep today's behaviour and go to `missing`.
   - Ordering fix: in `translateCore`, run `localizeNumbers` before the patterns when the core contains `억` or `만 원`. That way "전세 2억 6,000만 원" becomes "jeonse ₩260M" through the word path and never through a stale table pattern.
   - `web/src/i18n/index.js`: pass `words: WORDS` from the new content file `./en-words.js` (already committed, export `WORDS`).
3. **Muse answers in English** (`web/src/ui/chat.jsx`, `web/src/consult/agent.js`, `web/src/consult/guards.js`).
   - `chat.jsx:1373`: the context becomes `{ ...agentContext(store.getState()), lang: LANG }`. Import `LANG` from `../i18n/lang.js`.
   - `agent.js` `runTurn` (~223-227): when `context && context.lang === "en"`, push one more system message:
     "The customer reads English. Answer in plain English. Write place and station names romanized with the Korean once in parentheses, e.g. Gangnam Stn (강남역). Write money as won with full digits and commas, e.g. ₩260,000,000, or as ₩260M. Every rule above still applies."
   - `guards.js` `checkConsultReply` (424-470):
     - Before `findInventedNumbers`, normalise English money in `flat`: `₩?(\d+(?:\.\d+)?)\s*(?:M|million)\b` → the full won integer, `B|billion` → ×1e9, and `₩(\d[\d,]*)` → digits only.
     - Add English patterns to the verdict guards. Read lines 1-380 and add, case-insensitive, next to each Korean list:
       - recommendation: `I recommend|recommended home|best (?:home|choice|option)`;
       - buy: `you should (?:buy|not buy)|(?:don't|do not) buy`;
       - sign: `you should (?:sign|not sign)|(?:don't|do not) sign`;
       - forecast: `prices? will (?:rise|fall|go up|go down)`;
       - investment: `good investment|invest in`;
       - prediction: `will (?:definitely|certainly) happen|this predicts`.
     - Keep every Korean pattern as it is.

## Test — `web/tests/i18n-24c.test.js`
- **Loop:** a fake leaf `["5", "분 남음"]` with a translator whose output still has Hangul (`{0}분 남음` → `{0} 분 left`). Run `translateTree` twice: the second pass makes no write. Count writes with a fake node whose `nodeValue` setter increments a counter.
- **Attributes:** a `placeholder` whose translation equals the current value is not set again (count `setAttribute` calls).
- **Words:**
  - `translate("강남 출근 · 1인 · 전세 3억 원 이하")` → `Gangnam commute · 1 person · jeonse ₩300M or less`;
  - `translate("전세 2억 6,000만 원")` → `jeonse ₩260M`;
  - `translate("잠실역까지 걸어서")` → contains `Jamsil` and `on foot`.
- **Agent:** `runTurn` with a fake `completeFn` that records the history. With `context.lang = "en"`, a system message contains "Answer in plain English"; without it, no such message.
- **Guards:**
  - `checkConsultReply("The deposit is ₩300M.", [{ deposit: 300000000 }])` passes the number check (use the result shape that `toolResultNumbers` reads; check the existing tests);
  - `"I recommend home A"` → `ok: false`;
  - every Korean guard test still passes.

Run only:
```
cd web && node --test tests/i18n-24c.test.js tests/i18n-24a.test.js tests/consult*.test.js tests/guards*.test.js 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
`web/src/i18n/en.js`, `web/src/i18n/en-table.js`, `web/src/i18n/en-words.js` (content; the orchestrator owns them), `web/src/profile.js`, `web/src/ui/chatmap.jsx`.

## Final message
Changed files, one line each. Nothing else.

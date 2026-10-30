# Stage 29a1b — The translator never touches what the customer is typing (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here. Stop when the named tests pass.

## Why
After 29a1 the English-mode reproduction still fails, and the orchestrator found the root cause: the text is already mangled **while it is typed**. The request body of the first turn carries `customer_text: ["Ha I ₩400MSe, JeonGeun ChulNam, GangBuBuBi YeIBeolMat"]` for the typed `맞벌이 예비부부, 강남 출근, 전세 4억 이하`. The composer is a contenteditable editor that inserts `<p><span>text</span></p>`. In `web/src/i18n/dom.js` the MutationObserver's `childList` branch calls `translateTree(addedSpan)`; `translateTree` → `walk` stops only on `underNoI18n(node)` (ancestors with `data-no-i18n`, `dom.js:46-55`) or `skipSubtree(node)` (the node itself is TEXTAREA/SCRIPT/STYLE or has `contenteditable`, `dom.js:57-62`). The added span's **ancestor** is contenteditable, but neither check looks at ancestors for that, so the typed Hangul is translated in place and then sent. The same happens in `retarget` (`characterData` path) for edits.

Also from the same run: the 29a1 name gloss spaces punctuation oddly: `현대아파트(75-1) (Hyeondaeapateu( 75- 1))`.

## Change

### 1. `web/src/i18n/dom.js:46-55`
```js
function underNoI18n(node) {
  let n = node;
  while (n) {
    if (n.nodeType === ELEMENT_NODE && getAttr(n, "data-no-i18n") != null) {
      return true;
    }
    n = n.parentNode || null;
  }
  return false;
}
```
Make the ancestor walk also return `true` when an ancestor element is `TEXTAREA` or `INPUT`, or has `contenteditable` set to anything but `"false"` (same test as `skipSubtree`). Every caller (`walk`, `retarget`, the attributes branch) already goes through `underNoI18n`, so this one change covers typing, pasting and editing.

### 2. Gloss punctuation — the gloss builder added in 29a1 (`grep -n "ui-name-gloss" web/src/ui/*.jsx web/src/i18n/*.js`)
Romanize only the Hangul runs and keep everything else (digits, hyphens, brackets, spaces, Latin) exactly as in the source: `현대아파트(75-1)` → `Hyeondaeapateu(75-1)`; `타워팰리스2` → `Tawopaelriseu2` (or `Tawopaelriseu 2`, but no space before `(` or after `-`). If the name has no Hangul, no gloss.

## Test — extend `web/tests/english-trust-29a1.test.js`
- With the plain-fake DOM the dom tests already use (`grep -ln "translateTree\|startDomTranslation" web/tests/*.test.js`, reuse its fake node helpers): a `div[contenteditable=true] > p > span > "맞벌이 예비부부, 강남 출근"` tree, run `translateTree(div)` and also `translateTree(span)` directly → the text is unchanged. Same for a `textarea` ancestor. A normal `div > span > "출퇴근 상한?"` is still translated.
- Gloss: `현대아파트(75-1)` → `Hyeondaeapateu(75-1)` (no `( ` and no `- `).

Run only:
```
cd web && node --test tests/english-trust-29a1.test.js $(grep -ln "translateTree\|startDomTranslation" tests/*.test.js | tr '\n' ' ') 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```

## Do not touch
Anything except `web/src/i18n/dom.js`, the gloss helper file, and the test file.

## Final message
Changed files, one line each. Nothing else.

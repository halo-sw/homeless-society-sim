# Stage 29k2 — Map pins lead with the commute when every home has the same ZIP rent; report tags get their own space (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here. Stop when the named tests pass.

## Why
1. **Six pins, one number.** In Menlo Park every candidate in a ZIP gets the same Zillow ZORI estimate, so all six map tags read `$4,261/mo` in bold and the only thing that tells the homes apart — the commute — sits small underneath. The cards already handle this (29h3: `sharedZipRent` / `sharedRentNote` in `web/src/ui/candidate-card.jsx:801-860`, the shared rent said once above the list). The map does not.
2. **Tags run into the sentence.** In the verified report the tags render glued: `…걸린 시간은 7.8분이었어요 숫자 확인근거 1개` — `ReportCheck` pushes bare `<span className="ui-check-tag">` siblings (`web/src/ui/chat.jsx:762-768`) with no space between them or before them.

## Changes

### 1. Pins: `web/src/chatmap.js` `tagLines` / `tagSizePx` (`chatmap.js:557-590`)
- `tagLines(pin, opts)` accepts `opts.sharedRent` (truthy). When set: `price` (the bold line) becomes the commute line — Korean `출근 N분`, English `N min to work` — and `commute` is `null`. When the pin has no commute minutes, the bold line is the existing price line (never empty). Without `sharedRent` nothing changes.
- `tagSizePx(pin, tenure, lang, opts)` passes `opts.sharedRent` through, so the measured box matches what is painted (one body line → the existing 26 px body height).

### 2. Pins: `web/src/ui/chatmap.jsx`
- Compute once per render: `const shared = sharedZipRent(pins.map((p) => p.candidate), m.tenure);` (import from `./candidate-card.jsx`; if that import makes a cycle, move `sharedZipRent` to a small module both import — no behaviour change).
- Pass `sharedRent: !!shared` to every `tagLines` / `tagSizePx` call for home tags (`chatmap.jsx:~899-901`, `~1047`, and wherever else they are called for home pins — grep).
- `pinAriaLabel` keeps the price (screen readers still hear it).
- The pin card (`ui-pincard-price`, `chatmap.jsx:~1142`) keeps the price.
- Legend (`chatmap.jsx:1079-1086`): when `shared`, the tag description reads `번호·면적 / 출근 시간` instead of `번호·면적 / 가격 / 출근 시간`, and a second line (`<span className="ui-chatmap-legend-note">` on its own line) says, built in code per language with `data-no-i18n`:
  - Korean: `모든 집 같은 값: ZIP ${zip} 월세 $${amount}/월 (${source}, ${month})`
  - English: `Same for every home: ZIP ${zip} rent $${amount}/mo (${source}, ${month})`
  Format the amount with the existing money formatter used by `sharedRentNote`; drop `, ${month}` when month is empty. Add the English pattern for the new tag description to `web/src/i18n/en.js` next to the existing legend pattern.

### 3. Report tags: `web/src/ui/chat.jsx` (`:755-775`) + `web/src/ui/ui.css` (`:1415-1416`)
- Wrap a sentence's tags in `<span className="ui-check-tags">…</span>` placed after the sentence text.
- CSS: `.ui-check-tags { display: inline-flex; flex-wrap: wrap; gap: var(--ui-s8); margin-inline-start: var(--ui-s8); vertical-align: baseline; }` — spacing-scale tokens only (the `28c one spacing scale` test must stay green).

## Tests — new `web/tests/pins-commute-29k2.test.js`
- `tagLines(pin, { tenure, lang: "ko", sharedRent: true })` for a pin with `commuteMin: 11` → `price === "출근 11분"`, `commute === null`; English → `"11 min to work"`.
- Without `sharedRent` → unchanged (price line is the money line, commute line present).
- `sharedRent: true` and no commute minutes → `price` is the money line.
- `tagSizePx(pin, tenure, "ko", { sharedRent: true }).h` equals the no-commute height.
- SSR of `ReportCheck` with one passing sentence that has claims and evidence → markup contains `class="ui-check-tags"` holding both tags.
- `ui.css` contains `.ui-check-tags` with `gap: var(--ui-s8)`.

Run only:
```
cd web && node --test tests/pins-commute-29k2.test.js tests/report-check-29j3.test.js tests/shared-rent-29h3.test.js $(ls tests/*28c*.test.js) $(ls tests/*31g*.test.js tests/*31j*.test.js tests/*31m*.test.js 2>/dev/null) 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```

## Do not touch
Verifier code (`web/src/verify/*`), consult/*, the candidate card's own rendering, `briefs/`.

## Final message
Changed files, one line each. Nothing else.

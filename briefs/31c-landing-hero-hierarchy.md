# Stage 31c — landing hero: one clear order, no fake pill, no duplicate button, proof facts as a stat row (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section) and `web/AGENTS.md` (Astryx: tokens, no raw hex/px). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator
Real captures of `/` at 1440 × 900 (English) and 390 × 844 (Korean).

### The hero today, top to bottom (`web/src/ui/landing-page.jsx` ~172–218)
1. **Eyebrow pill** `ds-lp-heroeyebrow`: "Muse가 대신 확인하고 30일 살아 봐요", with a logo and a bordered rounded box.
   - It is not clickable, but it looks like a button.
   - It repeats the lede under the title ("Muse가 직접 확인하고, 대신 30일 살아 보고, 대화로 알려 줘요.").
2. Title, then lede.
3. Composer.
4. **Chip row** (3 outlined pills): 출근지로 집 찾기 · 본 매물 붙여 넣기 · 예시로 써 보기.
5. **Judge row** (3 filled pills): 기록된 한 달 보기 (primary) · Meta 본사 출근으로 해 보기 · 서울로 해 보기.
   - **"서울로 해 보기" and "예시로 써 보기" open the same URL** (`chatUrl(EXAMPLE_PROMPTS[0].prompt)`).
   - On a phone this makes six stacked pill buttons, 40 px each, before any content.
6. **Replay note**, with an inline `style={{ color, fontSize: 13 }}`. 13 px is off the type scale.
7. **Proof facts.** A flex row that wraps at 1440 px: "14초 · …" and "85초 · …" on one line, then "8/8 · …" alone on the next line. That third fact keeps its left divider (`.ds-lp-prooffact + .ds-lp-prooffact { border-left }`), so a stray vertical line hangs at its left.
8. `PoweredByMuse`, then the coverage line.

## Change (only `landing-page.jsx`, the `.ds-lp-*` rules in `web/src/ui/ui.css`, and the new test)
1. **Remove the eyebrow** paragraph and its `.ds-lp-heroeyebrow` CSS. Keep `MUSE_LOGO_PATH` only if still used elsewhere.
2. **Composer chip row:**
   - Keep the three chips and their handlers.
   - Style them as secondary small actions: 32 px tall, outlined, 14 px. They are clearly lighter than the judge row.
   - Gap 8 px; 12 px under the composer.
3. **Judge row:**
   - Two buttons only: `기록된 한 달 보기` (primary) and `Meta 본사 출근으로 해 보기` (secondary).
   - Delete the `서울로 해 보기` link.
   - 40 px tall; 24 px above the row (the step between "write your own" and "watch / try ours").
   - At ≤ 480 px both stay full labels on one line each, stacked and centred, within the 16 px gutter.
4. **Replay note:** a class instead of the inline style: `--ds-t-12`, `--ds-ink-2`, 8 px under the judge row. Same text.
5. **Proof facts as a stat row** (`.ds-lp-proof`):
   - A 3-column grid with equal columns, centred, and 1 px `--ds-line` dividers *between* columns only.
   - Each fact is two lines: the number (`<b>`) at `--ds-t-20` / 700 tabular, and the caption under it at `--ds-t-12`, `--ds-ink-2`.
   - Same three facts, same text. Render the number and caption as separate elements, not "num · rest".
   - Stays 3 columns at 390 px: captions may wrap to 2–3 lines, centred, and nothing overflows.
   - No divider at the left of the first column at any width.
   - 24 px above.
6. **`PoweredByMuse` and the coverage line:** unchanged, with 24 px above `PoweredByMuse`.
7. **Vertical rhythm of the whole hero, using tokens only:**
   - title → lede 12;
   - lede → composer 24;
   - composer → chips 12;
   - chips → judge 24;
   - judge → note 8;
   - note → proof 24;
   - proof → Powered by 24;
   - Powered by → coverage 8.
8. No raw hex/px in changed rules, no `text-overflow: ellipsis`. Delete CSS that becomes unused.

No new strings. Removed strings: the eyebrow and `서울로 해 보기`. Leave their `src/i18n/en.js` entries alone; the orchestrator cleans i18n.

## Test — `web/tests/landing-hero-31c.test.js`
- **SSR of the landing** (see how `tests/landing-judge-30e.test.js` renders it):
  - no `ds-lp-heroeyebrow`;
  - `ds-lp-judge` holds exactly 2 links: `기록된 한 달 보기` with `--primary`, then `Meta 본사 출근으로 해 보기`;
  - no `서울로 해 보기` anywhere;
  - `ds-lp-chips` still holds the 3 chips;
  - the replay note has a class and no inline `style`;
  - each of the 3 proof facts renders its number and caption as separate elements.
- **`ui.css`:**
  - `.ds-lp-proof` uses `display: grid` with 3 columns;
  - no `.ds-lp-heroeyebrow`;
  - no `13px`;
  - no `ellipsis`.
- **Keep green:**
  - every test file that mentions `LandingPage`, `landing` or `ds-lp`;
  - `tests/judge-path-29a6.test.js` and `tests/landing-judge-30e.test.js`. Update the ones that pinned `서울로 해 보기`, the eyebrow, or three judge links, and name them in the final message.

Run only:
```
cd web && node --test tests/landing-hero-31c.test.js $(grep -lisE "LandingPage|landing|ds-lp|서울로 해 보기" tests/*.test.js | tr '\n' ' ') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines. The orchestrator checks it in a real browser at 1440 px and 390 px.

## Do not touch
Everything except `landing-page.jsx`, the `.ds-lp-*` rules in `ui.css`, and test files. Do not touch `chat.jsx`, `chatmap.jsx`, `src/i18n/**`, `README*`.

## Final message
Changed files, one line each, then the test files you updated. Nothing else.

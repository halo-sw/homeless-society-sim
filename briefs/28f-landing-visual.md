# Stage 28f — Make the landing beautiful (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read `web/src/ui/landing-page.jsx` (whole, ~310 lines) and the `/* 28d landing */` block of `web/src/ui/ui.css` (`grep -n "28d landing" web/src/ui/ui.css`, to the end of the file). Stop when the named tests pass.

## Why
User, after seeing 28e: "랜딩페이지 디자인 더 예쁘게 구성해 줘." You are the designer; the direction below is the orchestrator's read of the 28e screenshots (1440 px, 4,779 px tall; 390 px). Keep your copy, sections, routing and tokens; change the visual composition.

What looks flat today:
- Every section has the same beige page, the same left-aligned serif heading and the same rhythm, so 10 sections read as one long document.
- The hero is a heading, a box and chips on an empty beige field. Nothing says "this is an agent that already did work".
- The product screenshot sits edge to edge in a thin frame; it reads as a pasted image, not as a product.
- The three feature columns, the 4 steps and the number cards are small grey text with no anchor (no number, no mark, no weight).
- `30일` / `11곳` render at 14 px, not 40 px: `.ds-lp-numcard p` (`ui.css`, `grep -n "ds-lp-numcard p"`) is more specific than `.ds-lp-num` and wins.
- Use-case images are crops of busy UI at different zoom levels, edge to edge in the card.
- The end of the page (CTA + footer) is small text on beige; no closing moment.

## Direction (exact where given; your judgement for the rest)
1. **Rhythm by bands.** Alternate full-width backgrounds: page `--ds-page` → `--ds-surface` → page …; each band has its content centred at max 1080 px. Section padding 96 px top/bottom desktop, 64 px phone. Each section opens with a small eyebrow label (12 px, weight 600, `--ds-ink-3`, letter-spacing 0.04em: `기능`, `비교`, `문제`, `쓰임`, `순서`, `예시`, `질문`, `데이터`) above the serif heading (`--ds-t-28` → make it 36 px desktop / 26 px phone, line-height 1.25, `text-wrap: balance`) and a lede. Headings of the comparison, steps, FAQ and CTA sections are centred; the others stay left.
2. **Hero.** Heading 56 px desktop (32 px phone), letter-spacing -0.01em. Above it a pill eyebrow: Muse logo (16 px) + `Muse가 대신 확인하고 30일 살아 봐요` (14 px), surface background, hairline border, `--ds-r-pill`, padding 4/12. Composer max 720 px with `--ds-shadow-pop`. Under the chips, a row of three small "proof" facts from the real walkthrough, separated by hairline dividers, 12 px `--ds-ink-2` with a bold number: `14초 · 후보 6곳 찾기` / `85초 · 두 집 30일 살아 보기` / `8/8 · 일기 문장 기록과 대조`. Then PoweredByMuse md and the coverage line. A very soft radial wash behind the hero (`radial-gradient` from `--ds-surface` at the centre to `--ds-page`), no colour.
3. **Product showcase** (`features`). The screenshot sits inside a "window": `--ds-surface` frame, 12 px padding, `--ds-r-sheet` + 4 corners, `--ds-shadow-pop`, with a 32 px top strip holding three 10 px grey dots (window chrome) — the band behind it is `--ds-sunken`. Two floating callout tags overlap the frame edges (absolute, desktop only, hidden ≤ 960 px): left middle `▸ 실거래 확인 · 출근 계산` and right lower `✓ 문장 8개 모두 기록과 대조`, each a surface pill with hairline + `--ds-shadow-card`, 14 px. The three columns below get a number (`01` `02` `03`, 14 px, weight 700, `--ds-ink-3`), a 16 px weight-600 title and the line, with a hairline on top of each column.
4. **Comparison.** Table in a rounded container (`--ds-r-card`, hairline, overflow hidden, surface background). Ithaca column: header shows the Muse logo 16 px + `Ithaca`, the column has `--ds-sunken` background and weight 600 text; the other two columns `--ds-ink-2`. Row heads weight 600.
5. **Number cards.** Fix the specificity (e.g. `.ds-lp-numcard .ds-lp-num`). Number in `--ds-font-display` 56 px, line under it 16 px. Cards side by side, surface, padding 32.
6. **Use cases.** Each image sits inside a `--ds-sunken` well (padding 16 px top/left/right, image with `--ds-r-chip` corners, hairline, `--ds-shadow-card`, `object-position: top left`), so crops look like product cards on a tray. Title 18 px weight 600, line 14 px. Whole card is a button with a hover lift (`translateY(-2px)` + shadow, 150 ms; respect `prefers-reduced-motion`). A small `물어보기 →` at the card's bottom right.
7. **Steps.** Four columns joined by a 1 px `--ds-line` connector behind 36 px black (`--ds-action`) numbered circles with white digits; title 16 px weight 600, line 14 px. On phone they stack with the connector vertical on the left.
8. **Example prompts.** Rows as one grouped list (single rounded container with hairline dividers, not separate cards). Prompt text 16 px; buttons `복사` ghost and `물어보기` secondary, sm.
9. **FAQ.** Centred column max 760 px; `<summary>` 16 px weight 600 with a `+` that rotates to `×` when open (CSS only), answer 14 px `--ds-ink-2`, padding 16 px top/bottom, 24 px sides.
10. **Data.** Source names as outlined chips; the details list in a quiet two-column grid on desktop.
11. **Closing CTA.** A full-width dark band: background `--ds-action` (#1d1b18), serif heading 44 px white, one line `--ds-ink-3`-on-dark (use `#c4bba9`), a white pill `대화로 시작하기` with near-black text, and a small composer-like fake input is **not** needed. Padding 96 px.
12. **Footer.** On the dark band's continuation or on page colour (your choice), three columns: `Ithaca` + one-line tagline `We walk the odyssey. You just come home.`; links (기능 · 살아 보기 · 데이터 · 질문 · GitHub); PoweredByMuse sm + `MIT` + `© 2026`. Hairline above.
13. **Phone ≤ 480 px.** Everything one column, 16 px gutters, no horizontal scroll at 390 px, hero proof facts wrap to two lines max, callouts hidden, table becomes the existing stacked form.

Rules that stay: black is the only strong colour (the Muse logo keeps its own blue; nothing else blue). Serif (`--ds-font-display`) only for hero, section headings, the number-card numbers and the CTA. All spacing from `--ds-s-*` (48 and 96 = 2 × 48 are fine; write 96 px as `calc(var(--ds-s-48) * 2)`). No new images, no icons font, no external libraries. No `추천`/winner words.

## Also
- `web/tests/ui-render.test.js` (`grep -n "renders the landing with no React errors" web/tests/ui-render.test.js`): it still expects the old 12b heading `계약 전에, 그 집에서 30일 먼저 살아 봐요`. Change that one expected string to `어떤 집을 고민 중이세요?`; nothing else in that file.
- New visible strings go into `web/src/i18n/en.js` next to the 28d/28e landing entries.

## Test — new `web/tests/landing-visual-28f.test.js`
- SSR render `LandingPage` (pattern in `web/tests/landing-polish-28e.test.js`): contains `Muse가 대신 확인하고 30일 살아 봐요`, `14초`, `85초`, `8/8`, `▸ 실거래 확인`, `We walk the odyssey. You just come home.`, `© 2026`, and the eight eyebrow labels; still contains none of `추천`, `우승`, `네가`.
- CSS (28d–28f landing text of `ui.css`): contains `.ds-lp-numcard .ds-lp-num`, `prefers-reduced-motion`, `calc(var(--ds-s-48) * 2)`, and the dark CTA uses `var(--ds-action)` as a background.
- `node --test tests/ui-render.test.js` subtest "renders the landing" passes.

Run only:
```
cd web && node --test tests/landing-visual-28f.test.js tests/landing-polish-28e.test.js tests/landing-page-28d.test.js tests/mobile-26m.test.js tests/phone-26p.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
node --test tests/ui-render.test.js 2>&1 | grep -E "not ok" | head -5
```
(The ui-render file has one known unrelated failure, `walked-hours B value`; only the landing subtest must pass.)

## Do not touch
`web/src/ui/chat.jsx`, `web/src/main.js`, `web/src/chat/urls.js`, map / 3D / engine files, `web/public/landing/` (the orchestrator replaces the images).

## Final message
Changed files, one line each. Nothing else.

# Stage 28e — Landing polish: section headings, phone nav, number cards (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here (`grep -n` when numbers moved). Stop when the named tests pass.

## Why
Orchestrator's screenshots of your 28d landing (1440 px and 390 px):
- Only one section ("집 고를 때 진짜 막막한 것들") has a heading. The three columns, the comparison table, the use cases, the steps, the example prompts, the FAQ and the data list start with no heading, so the page reads as loose blocks.
- Phone 390 px nav: `Ithaca` wraps to `Ithac / a`, and `시작하기` becomes a two-line black circle.
- Problem cards: `30일` and `11곳` are small bold text; they should be the big number of the card.
- Hero composer: the placeholder is centred (inherits the hero's `text-align: center`). Typed text and placeholder must be left-aligned.
- Use-case image frames at 4/3 are taller than the text below deserves; the page is 4,356 px tall at 1440.
- Two old tests now fail: `web/tests/mobile-26m.test.js` and `web/tests/phone-26p.test.js` read only the **last** `@media (max-width: 480px)` block of `ui.css` (`phoneBlock()`, `mobile-26m.test.js:17-30`, same helper in `phone-26p.test.js`), which is now the landing's phone block.

## Change

### 1. Section headings — `web/src/ui/landing-page.jsx` (sections start at about line 180; reuse the existing `ds-lp-h` heading class, `grep -n "ds-lp-h\"" web/src/ui/landing-page.jsx`)
Every section after the hero gets a heading (serif, `--ds-t-28`, 24px on phone) and, where given, a one-line lede (16px, `--ds-ink-2`) under it, left-aligned, `--ds-s-24` above the content:
- product frame + three columns (`id="features"`): `Muse가 하는 일` / `말하면 Muse가 도구를 골라 쓰고, 한 일은 모두 대화에 남아요.`
- comparison: `직접 찾기·챗봇과 무엇이 다른가요`
- problem: keep `집 고를 때 진짜 막막한 것들`
- use cases (`id="living"`): `이럴 때 써요`
- steps: `이렇게 움직여요`
- example prompts: `이렇게 물어보세요` / `누르면 바로 대화가 시작돼요.`
- FAQ (`id="faq"`): `자주 묻는 질문`
- data (`id="data"`): `쓰는 데이터` / `숫자는 모두 공개 자료에서 세요. 출처와 기간을 화면에 함께 적어요.`
Steps: each step becomes number + title + one short line: `말로 물어봐요` — `출근지·예산·같이 사는 사람을 한 문장으로`; `Muse가 확인해요` — `실거래·출근길을 직접 찾아보고 ▸ 줄로 남겨요`; `요청하면 보여 줘요` — `지도·동네·비교는 말할 때만 열려요`; `30일 살아 보고 전해요` — `일기 문장은 모두 기록과 대조해요`.
Add the new strings to `web/src/i18n/en.js` next to the 28d landing entries.

### 2. Phone nav — `web/src/ui/ui.css` (the `/* 28d landing */` block, `grep -n "28d landing" web/src/ui/ui.css`)
`.ds-lp-brand` and `.ds-lp-pill`: `white-space: nowrap; flex: none`. The pill keeps `--ds-r-pill`, height 36px, padding `0 var(--ds-s-16)`. At ≤ 480 px hide `.ds-lp-nav .ds-pbm-text` (keep the logo; the hero and footer still say "Powered by Muse") and `.ds-lp-nav .ui-lang-toggle`; nav gap `--ds-s-12`. Check: at 390 px `Ithaca`, the Muse logo and `시작하기` sit on one line.

### 3. Number cards
`.ds-lp-num`: `--ds-t-40`, weight 700, `--ds-ink-1`, line-height 1.1; the line under it 14px `--ds-ink-2`. Cards padding `--ds-s-24`.

### 4. Hero composer alignment
Inside `.ds-lp-hero`, the composer box and its textarea/placeholder are `text-align: left` (the heading, lede, chips and coverage line stay centred).

### 5. Image frames
Use-case `ds-lp-shot` frames: `aspect-ratio: 16 / 10` (product frame stays 16/10). Images inside use `object-fit: cover; object-position: top left; width: 100%; height: 100%`.

### 6. Test helper — `web/tests/mobile-26m.test.js:17-30` and the same `phoneBlock()` in `web/tests/phone-26p.test.js`
Return the text of **all** `@media (max-width: 480px)` blocks joined, not only the last one (loop with `indexOf` from each found position, same brace-depth scan). Do not change any assertion.

## Test — new `web/tests/landing-polish-28e.test.js`
- SSR render `LandingPage` (pattern in `web/tests/landing-page-28d.test.js`): contains each heading above (`Muse가 하는 일`, `직접 찾기·챗봇과 무엇이 다른가요`, `이럴 때 써요`, `이렇게 움직여요`, `이렇게 물어보세요`, `자주 묻는 질문`, `쓰는 데이터`) and the four step lines.
- `ui.css` 28d/28e landing text contains `white-space: nowrap` for `.ds-lp-brand`, `.ds-lp-nav .ds-pbm-text` inside a 480 px block, `aspect-ratio: 16 / 10`, and `.ds-lp-num` with `var(--ds-t-40)`.
- `en.js` contains `이럴 때 써요`.

Run only:
```
cd web && node --test tests/landing-polish-28e.test.js tests/landing-page-28d.test.js tests/mobile-26m.test.js tests/phone-26p.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```

## Do not touch
`web/src/ui/chat.jsx`, `web/src/main.js`, `web/src/chat/urls.js`, map / 3D / engine files, `web/public/landing/` (the orchestrator adds the images).

## Final message
Changed files, one line each. Nothing else.

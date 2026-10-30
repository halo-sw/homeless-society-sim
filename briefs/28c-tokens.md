# Stage 28c — Design tokens in `ui.css`, one spacing scale (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here (`grep -n` when numbers moved). Stop when the named tests pass.

## Why
User: "UI 여전히 컴포넌트 간 간격 안 맞고…". Your design doc `docs/design.md` §2 (lines 15–93) defines the `--ds-*` tokens. This stage puts them in the code. The rest of the redesign (28d–28g) builds on them.

## Change — `web/src/ui/ui.css` (+ one prop in `chat.jsx`)

### 1. Add the tokens — `web/src/ui/ui.css:3-20` (the first `:root, [data-theme], .astryx-theme, #ui-root, #root, body { … }` block)
- At the top of that block add every light token from `docs/design.md` §2.1 (colours + subway), §2.3 (type: keep the font family value already used by `--ui-font`, i.e. `'Pretendard Variable', -apple-system, 'Apple SD Gothic Neo', sans-serif`, as `--ds-font-sans`; `--ds-font-display` as written) and §2.4 (space, radius, shadow, widths), with the exact values in the doc.
- Then turn the old `--ui-*` tokens into aliases of the new ones, so every existing rule follows without being rewritten:
  `--ui-page: var(--ds-page); --ui-card: var(--ds-surface); --ui-sunken: var(--ds-sunken); --ui-border: var(--ds-line); --ui-ink: var(--ds-ink-1); --ui-ink2: var(--ds-ink-2); --ui-ink3: var(--ds-ink-3); --ui-accent: var(--ds-accent); --ui-ok: var(--ds-ok); --ui-shadow: var(--ds-shadow-card);`
  `--ui-t12…t28` → `var(--ds-t-12)` … (add `--ui-t24: var(--ds-t-24)`); `--ui-s4…s32` → `var(--ds-s-4)` …; add `--ui-s48: var(--ds-s-48)`; `--ui-r-chip/card/sheet` → `var(--ds-r-chip)` etc.; `--ui-lh-body: var(--ds-lh-body)`; `--ui-lh-head: var(--ds-lh-tight)`.
- Keep `--ui-normal`, `--ui-busy`, `--ui-packed` (crowding colours) as they are. Keep the `--font-family-*` lines (Astryx reads them).
- Dark tokens (§2.2) are out of scope (cut order item 1). Do not add them.

### 2. One spacing scale — the rest of `ui.css`
Off-scale values today (`grep -nE "(^|[^0-9.])(2|6|10)px" web/src/ui/ui.css`). Apply these rules to `padding`, `margin`, `gap`, `row-gap`, `column-gap`, `top/left/right/bottom` offsets of labels, and `border-radius`:
- `2px` padding/margin/gap → `var(--ds-s-4)`; `padding: 2px var(--ui-s8)` → `padding: var(--ds-s-4) var(--ds-s-8)`.
- `6px` gap/padding/margin → `var(--ds-s-8)` (for the small step chips at about `ui.css:264-267`, `padding: 6px 12px 6px 6px` → `var(--ds-s-4) var(--ds-s-12) var(--ds-s-4) var(--ds-s-4)`).
- `10px` gap/padding → `var(--ds-s-12)` when it separates blocks, `var(--ds-s-8)` inside a pill or button (e.g. `padding: 6px 10px; border-radius: 999px` → `var(--ds-s-4) var(--ds-s-12)` and `var(--ds-r-pill)`).
- `border-radius: 6px` → `var(--ds-r-chip)`; `border-radius: 10px` → `var(--ds-r-card)`; `999px` → `var(--ds-r-pill)`.
- Leave alone: `1px` hairlines, `2px` borders/outlines, sizes of drawn shapes (`width: 2px` timeline rail, `height: 6px` bars, the `8px` dots, `border-radius: 2px` on bar fills), `text-underline-offset`, and the 28b `.ds-pbm-dot` 6px.
- Literal font sizes `13px` → `var(--ds-t-14)` and `11px` → `var(--ds-t-12)` (the scale has no 11/13).
- Literal colours that equal a token (`#fff`/`#ffffff` on cards → `var(--ds-surface)`; `#1d1b18` → `var(--ds-ink-1)`) may be swapped; leave map/3D colours and subway colours alone.

### 3. Phone: the top bar is drawn twice — `web/src/ui/chat.jsx:2200-2203`
At ≤ 480 px (and up to Astryx's mobile breakpoint, e.g. 700 px) a second copy of the top bar sits at the bottom of the screen (`header.ui-bar` as a direct child of `.astryx-app-shell`, top = 788 px on a 390×844 screen; also on the live site). Cause: Astryx `AppShell` renders `topNav` a second time as mobile drawer content when `mobileNav` is not disabled (`node_modules/@astryxdesign/core/src/AppShell/AppShell.tsx:904-925`). Our `TopBar` is not an Astryx `TopNav`, so the "drawer" copy shows as a plain second bar.
```jsx
      <AppShell
        variant="surface"
        contentPadding={0}
        topNav={(
```
Add `mobileNav={false}` to this `AppShell` (one prop, nothing else in chat.jsx).

## Test — new `web/tests/tokens-28c.test.js`
Read `web/src/ui/ui.css` as text.
- Contains each of: `--ds-page: #f6f4ef`, `--ds-surface: #fffdf9`, `--ds-line: #ddd6c8`, `--ds-ink-2: #5c564c`, `--ds-home-a: #b3541e`, `--ds-ok: #1f7a3d`, `--ds-warn: #b25e09`, `--ds-s-48: 48px`, `--ds-r-composer: 20px`, `--ds-chat-col: 760px`, `--ds-panel-w: 560px`, `--ui-page: var(--ds-page)`, `--ui-ink: var(--ds-ink-1)`, `--ui-s8: var(--ds-s-8)`.
- Spacing guard: for every declaration line matching `/(padding|margin|gap)\s*:/`, it contains none of `2px`, `6px`, `10px` (word-bounded: `/(^|[^0-9.])(2|6|10)px/`). Also no `font-size: 13px` / `font-size: 11px`.
- `web/src/ui/chat.jsx` contains `mobileNav={false}`.
- The doc and the CSS agree: every `--ds-…: value;` in `docs/design.md` §2.1 and §2.4 code blocks (parse lines between line 17 and `## 3.`, skipping §2.2) appears in `ui.css` with the same value.

Run only:
```
cd web && node --test tests/tokens-28c.test.js tests/powered-by-muse-28b.test.js tests/chat-layout-19a.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```
If an old test pins an exact removed value (`grep -rln "6px\|10px\|#efece5\|#5f5a52" web/tests`), update that pin to the new token value and nothing else.

## Do not touch
Any file except `web/src/ui/ui.css`, the one prop in `web/src/ui/chat.jsx`, and the new test (plus a pin update if needed).

## Final message
Changed files, one line each. Nothing else.

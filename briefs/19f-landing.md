# Stage 19f — Landing that says what happens next (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Touch only `web/src/ui/landing.jsx`, the `.ui-landing*` rules in `web/src/ui/ui.css` (lines ~239-252) and `web/tests/landing-chat-12b.test.js` / a new test. First edit within 4 tool calls. Commit, then stop.

## Why (capture 1440×900)
- The 3D city behind is blurred to a flat grey haze (`.ui-landing-scrim`: 88 % page colour + `blur(12px)`). The page looks empty and generic.
- The order is upside down. The small sub-line "출근·돈·생활을 진짜 자료로…" sits **above** the 32 px heading, and the brand line is 12 px grey.
- Nothing tells a first-time visitor what will happen after typing: map → pick homes → 30 days → compare.
- The example cards are grey `muted` blocks. Their 12 px prompt text is hard to read.

## Changes
### 1. Backdrop
Replace the scrim with a radial veil, so the painted city shows at the edges and the text sits on calm white in the middle:
```css
.ui-landing-scrim {
  position: absolute; inset: 0;
  background: radial-gradient(ellipse 60% 70% at 50% 45%,
    color-mix(in srgb, var(--ui-page) 96%, transparent) 0%,
    color-mix(in srgb, var(--ui-page) 88%, transparent) 55%,
    color-mix(in srgb, var(--ui-page) 40%, transparent) 100%);
}
```
No `backdrop-filter`.

### 2. Brand bar
Add a fixed top-left brand row inside `.ui-landing-body`, padding 20 px 24 px:
- "Ithaca" in 18 px, weight 700;
- then a 13 px `--ui-ink2` tagline, `LANDING_TAGLINE`.

Remove the old `LANDING_BRAND` line and the bottom tagline line. Keep the `LANDING_BRAND` export: tests may import it.

### 3. Hero text order
1. `LANDING_HEADING` as `h1`: 40 px, weight 700, line-height 1.2, letter-spacing −0.02em. Below 600 px wide: 28 px.
2. `LANDING_SUB` as `p`: 17 px, `--ui-ink2`, margin-top 8.

### 4. What happens next
Put a three-step row directly under the composer.
- Layout: a `ol.ui-landing-steps`, flex, gap 8.
- Each step is a small pill: 13 px, with a numbered 18 px disc.
  1. "말로 조건 말하기"
  2. "지도에서 후보 2곳 담기"
  3. "30일 살아 보고 비교"
- Chevrons "›" between the steps, in `--ui-ink3`.
- Below 600 px, the row wraps.

### 5. Example cards
White cards: `--ui-card` background, 1 px `--ui-border`, radius 14, shadow `--ui-shadow` on hover only, padding 16. Each card holds:
- Title: 15 px, weight 600, persona name only (e.g. "1인 사회초년생"). Add a small "예시" chip on the right (11 px, `--ui-sunken`, radius 6).
- Prompt: 13 px, `--ui-ink2`.
- The listing-paste card: title "매물 글 붙여 넣기", with no 예시 chip.

Keep the click behaviour: `exampleChatUrl` and `chatUrl("", { listing: "1" })`. Keep the `aria-label`s. Use a native `button`, or keep `ClickableCard` with a class override. Either works if the test still finds the labels.

### 6. Footer
One centred line in 12 px `--ui-ink3`: the coverage line `COVERAGE_LINE`, a "·", and the 데이터 출처 popover button.

## Tests
Update `web/tests/landing-chat-12b.test.js` pins that read the old order or text. Add `web/tests/landing-19f.test.js`:
- The heading appears before the sub-line in the rendered HTML.
- The three step texts appear in order.
- Each of the 3 persona titles appears once, with "예시".
- `ui.css` `.ui-landing-scrim` has no `backdrop-filter`.

Run:
```
cd web && node --test tests/landing-19f.test.js tests/landing-chat-12b.test.js tests/compare-tabs.test.js 2>&1 | tail -10
```
Never use `text-overflow: ellipsis`: `compare-tabs.test.js:62` forbids it.

Commit `19f: landing — visible city, heading first, three steps, white example cards`. Then stop.

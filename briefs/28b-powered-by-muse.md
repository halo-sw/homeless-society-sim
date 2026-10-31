# Stage 28b — "Powered by Muse" with the Muse logo, plus three fixes in the design doc (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here (`grep -n` when numbers moved). Stop when the named tests pass.

## Why
User request (2026-10-31): "powered by muse 하고 muse 로고 넣어줘". The official Muse logo (blue gradient scribble "M", transparent PNG, 256×256) is already in the repo at `web/public/brand/muse-logo.png`. Use that file as is: do not recolour, crop, stretch, outline or redraw it, and do not put it in a box or circle.

## Change

### 1. Design doc — `docs/design.md`
- Line 164: the coverage line says only `성남시 분당구 일대`. Change it to the real list, the same text the app shows: `다루는 지역 11곳: 서울 성동 · 송파 · 강남 · 강동 · 위례 · 판교 · 성남 · 정자 · 분당 · 미금 · 수지 · 지도 가격은 국토교통부 실거래 중간값(25.10–26.10)` (source: `COVERAGE_LINE` in `web/src/ui/landing.jsx:47-50`).
- Lines 165, 172, 173: three phrases use 반말 while all other copy is 존댓말. `산 것은 네가 정한다` → `고르는 건 고객님이에요`; `네가 고른 가정` → `고객님이 고른 가정`; `네 기준 비중으로` → `고객님 기준 비중으로`, `고르는 건 네 몫이에요` → `고르는 건 고객님 몫이에요`. Also make the other two column titles on line 165 존댓말 (`물어보면 Muse가 골라요`, `숫자는 세서 말해요`).
- Line 188: `见出し 상단` → `제목 위`.
- Add a new section `### 3.12 PoweredByMuse — Muse 표기` after §3.11 (before `## 4. 화면`), 5–8 lines, covering:
  - Anatomy: Muse logo (`/brand/muse-logo.png`, as is) + the text `Powered by Muse` (English in both languages, it is a credit line). Optional status part after a `·`: a 6px dot (`--ds-ok` when connected, `--ds-ink-3` when not) and `Muse Spark 1.3`, or `규칙 모드` when not connected.
  - Sizes: sm = logo 16px, text 12px; md = logo 20px, text 14px. Gap 8px between logo and text. Text colour `--ds-ink-2`, `Muse` weight 600.
  - Where it goes: app top bar left after `Ithaca` (sm, with status; it replaces the old `Muse` text and the blue `연결됨 · Muse Spark 1.3` badge); the empty chat screen, one line under the composer (sm, with status; it is the "model line" of §3.6); landing nav right before the buttons (sm, without status), the landing hero under the chips (md, without status), and the landing footer (sm, without status).
  - Don'ts: no recolour, no box/badge background, no second logo next to it, never bigger than the Ithaca title.
- In §3.6 (line 128) the model line now reads: `PoweredByMuse(sm, 상태 포함)` (one phrase is enough, point to §3.12).

### 2. New component — `web/src/ui/powered-by-muse.jsx`
```jsx
// 28b: the "Powered by Muse" credit with the official Muse logo (docs/design.md §3.12).
export const MUSE_LOGO_PATH = "brand/muse-logo.png";
export function museModelLabel(live) { return live ? "Muse Spark 1.3" : "규칙 모드"; }
export function PoweredByMuse({ size = "sm", live, showStatus = false }) { … }
```
- Renders `<span className="ds-pbm" data-size={size}>`: `<img src={assetUrl(MUSE_LOGO_PATH)} alt="" width={16|20} height={16|20} className="ds-pbm-logo" />` (alt empty: the text names Muse), then `<span className="ds-pbm-text">Powered by <b>Muse</b></span>`, then, only when `showStatus`, `<span className="ds-pbm-status" data-live={live ? "1" : "0"}><i className="ds-pbm-dot" />{museModelLabel(live)}</span>`.
- `assetUrl` from `../paths.js` (`web/src/paths.js:22-27`). Set `aria-label` on the outer span: `Powered by Muse` plus `, Muse Spark 1.3` / `, 규칙 모드` when status shows.

### 3. CSS — end of `web/src/ui/ui.css`
Add a `/* 28b PoweredByMuse */` block: `.ds-pbm` inline-flex, align center, gap 8px, white-space nowrap, color `var(--ui-ink2)`, font-size 12px (14px for `[data-size="md"]`); `.ds-pbm-logo` display block, flex none; `.ds-pbm-text b` font-weight 600, color `var(--ui-ink)`; `.ds-pbm-status` inline-flex gap 4px, align center, and a `·` before it via `::before { content: "·"; margin-right: 4px; color: var(--ui-ink3); }`; `.ds-pbm-dot` 6×6 circle, `var(--ui-ok)` when `[data-live="1"]`, `var(--ui-ink3)` otherwise. Spacing values only from 4/8 (no 2/6/10 except the dot size).

### 4. Top bar — `web/src/ui/topbar.jsx:160-165`
```jsx
        <span className="ui-bar-title">Ithaca</span>
        {mode === "chat" ? (
          <>
            <span className="ui-bar-muse">Muse</span>
            <Badge variant="info" label={museStatusLabel(LIVE_API)} />
          </>
```
Replace the `<>…</>` fragment with `<PoweredByMuse size="sm" live={LIVE_API} showStatus />`. Keep `museStatusLabel` exported unchanged (a test pins it). Keep the `Badge` import only if still used (line 173 uses it for the summary).

### 5. Empty chat — `web/src/ui/chat.jsx` (`grep -n 'className="ui-chat-empty"'`)
Directly after the `<ChatComposer … />` in the empty state, add `<PoweredByMuse size="sm" live={LIVE_API} showStatus />` (import `LIVE_API` from `../paths.js` if chat.jsx does not have it yet; `grep -n "LIVE_API" web/src/ui/chat.jsx`).

### 6. Phone ≤ 480 px — `web/src/ui/ui.css` (the `@media (max-width: 480px)` block, `grep -n "max-width: 480px" web/src/ui/ui.css`)
In the top bar on phones add `.ui-bar .ds-pbm-status { display: none; }` (logo + `Powered by Muse` stay). The empty-screen line keeps its status on phones.

## Test — new `web/tests/powered-by-muse-28b.test.js`
- `MUSE_LOGO_PATH === "brand/muse-logo.png"` and the file `web/public/brand/muse-logo.png` exists (fs, path from the test file).
- `museModelLabel(true) === "Muse Spark 1.3"`, `museModelLabel(false) === "규칙 모드"`.
- Render `PoweredByMuse` with `react-dom/server` `renderToStaticMarkup` (same pattern as `web/tests/chat-first-27a.test.js:19-30`): sm without status → contains `Powered by`, `<b>Muse</b>`, `muse-logo.png`, `width="16"`, no `ds-pbm-status`; md with `live` and `showStatus` → `width="20"`, `data-live="1"`, `Muse Spark 1.3`; `live: false` + status → `규칙 모드`.
- Source checks: `topbar.jsx` contains `<PoweredByMuse` and no longer contains `className="ui-bar-muse"`; `chat.jsx` contains `<PoweredByMuse`; `ui.css` contains `.ds-pbm`; `docs/design.md` contains `### 3.12 PoweredByMuse`, `다루는 지역 11곳`, and none of `네가`, `네 기준`, `见出し`.

Run only:
```
cd web && node --test tests/powered-by-muse-28b.test.js tests/chat-first-27a.test.js tests/chat-layout-19a.test.js tests/landing-chat-12b.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```
If an old test fails only because it pins the removed `ui-bar-muse` span or the topbar badge, update that pin to `PoweredByMuse`; change nothing else in it.

## Do not touch
Everything not named above (another session works on main; keep the diff small).

## Final message
Changed files, one line each. Nothing else.

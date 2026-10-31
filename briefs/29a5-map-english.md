# Stage 29a5 — The map reads in English too (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here (`grep -n` when numbers moved). Stop when the named tests pass.

## Why
Orchestrator's English capture after 29a4 (`?chat=&lang=en`, `맞벌이 예비부부, 강남 출근, 전세 4억 이하`):
- **Korean base-map labels fight our English labels.** The VWorld `white` tiles carry Korean place/station names (`신논현역`, `대치4동`…). Our romanized station labels (`Sinnonhyeon`, `Seolleung`) sit right on top of them in the same grey, so both are unreadable. Tiles: `web/src/ui/chatmap.jsx:266-280` under `<g filter="url(#basemap-mute)">` (`:256-262`, `BASEMAP_MUTE`). Station labels: `:349-352` (`fill={MAP_COLORS.muted}`, no halo).
- **`회사 · 강남` pin stays Korean** in English: `chatmap.jsx:131` and `:410-422` build the label with `data-no-i18n`.
- **The legend is covered by the panel close ×.** Legend box `chatmap.jsx:~535-540` sits at `top:12, right:12`; `StageArea` puts its close `IconButton` at the same `top:12, right:12` (`web/src/ui/chat.jsx`, `grep -n "작업판 닫기" web/src/ui/chat.jsx`, the one inside `StageArea`). The legend also cuts off (`…(estimat`).
- **`Show 171 more` shows 6.** `web/src/ui/chat.jsx:457` labels the button with the whole remainder (`다른 후보 ${total - shown}곳 더 보기`) while it sends `다른 후보 더 보여 줘`, which adds one page.

## Change
1. **Quiet base labels in English** — `chatmap.jsx`: when `currentLang()` (`web/src/i18n/lang.js:24`) is `"en"`, render the tile group with `opacity={0.45}` (Korean stays as now). Our station labels (`:349-352`) and dong labels get a white halo in both languages: `stroke="#ffffff" strokeWidth={fs(3)} paintOrder="stroke" strokeLinejoin="round"`, station fill `MAP_COLORS.regionLabel` (darker than `muted`).
2. **Workplace pin** — keep `data-no-i18n` (so the station name is not re-translated), but build the label per language: Korean `회사 · {name}`, English `Work · {romanized name}` using the same romanizer the 29a1 name gloss uses (`grep -n "export function" web/src/i18n/translate.js | grep -i roman`). Width calculation at `:131-133` uses the same string.
3. **Legend** — the stage pill already sits top-left, so put the legend at `bottom: 32, left: 12` (above the attribution line), allow wrapping (`maxWidth: "calc(100% - 96px)"`), no clipping. Give the box `aria-hidden` false and a `role="note"`.
4. **Show more** — label `다른 후보 {n}곳 더 보기 · 남은 {rest}곳` where `n = Math.min(PAGE, rest)` with `PAGE` the page size the list already uses (`grep -n "candidates.length\|PAGE\|pageSize" web/src/ui/chat.jsx` near `:440-460`; 6 if none exists). English pattern in `web/src/i18n/en.js`: `Show {0} more · {1} left`.

## Test — new `web/tests/map-english-29a5.test.js`
- `chatmap.jsx` source: tile group has an opacity that depends on `currentLang`; station label `<text>` has `paintOrder="stroke"`.
- The workplace label helper (export it, e.g. `workPinLabel(name, lang)`): `("강남", "ko")` → `회사 · 강남`; `("강남", "en")` → `Work · Gangnam`.
- Legend style no longer `top: 12, right: 12`.
- `chat.jsx` source: the show-more label contains `남은` and no longer `${data.total_matching - candidates.length}곳 더 보기`; en.js contains `Show {0} more`.

Run only:
```
cd web && node --test tests/map-english-29a5.test.js $(grep -ln "chatmap\|ChatMap\|더 보기" tests/*.test.js | tr '\n' ' ') 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```
If an older pin asserts the exact `회사 · ` label construction, the legend position or the old show-more text, update only that pin.

## Do not touch
Landing files, `candidate-card.jsx`, `intake.jsx`, engine / 3D files, `web/src/i18n/dom.js`, `web/src/basemap.js`.

## Final message
Changed files, one line each. Nothing else.

# Stage 31h — map controls: a real filter chip row on top, one control stack bottom-right (my location, zoom, fit) (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section) and `web/AGENTS.md` (tokens; Astryx components first). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

31f and 31g changed the markers. 31b made one floating style `.ui-float`, put the legend under the stage title, and put the zoom group and the map credit in one right column `.ui-chatmap-side`. Keep the markers as they are.

## Why
The customer wants the map tools arranged the way map apps usually do it:
- a row of filter chips across the top that show the current conditions and change them in place;
- bottom-right, one tidy stack: my location, then zoom in/out grouped, then fit.

Today:
- there are no filters on the map (conditions change only by typing);
- zoom is three text buttons (`+`, `−`, `맞추기`);
- there is no my-location.

## Change

### 1. Filter chip row (top of the map, left-aligned at 12 px, one line, scrolls sideways if it must; never wraps over the map)
- **What a chip is:** a real button that opens a small menu (Astryx `DropdownMenu` or `Popover`; same look as the existing sort menu). Picking an option changes the profile and re-runs the search through the **same path the intake uses**: build a patch, then `applyIntakePatch(profileRef.current, patch)`, `setProfile`, `store.set({ chatSummary })`, and `liveResearch(merged)` (chat.jsx ~1634–1645). The existing toast `조건 바뀜 · 후보 N곳 → M곳` then confirms it. No new search logic.
- **Chips** (only for fields the profile and search really support; if one is not supported, leave it out and say so in the final message):

| Chip | Label when set | Label when unset | Options | Patch |
|---|---|---|---|---|
| **거래 방식** | `전세` / `월세` / `매매` | `거래 방식` | the tenures the search supports for this area: KR `jeonse`, `wolse`, `trade`; USD profiles only monthly rent, so hide this chip for USD | `tenure` |
| **예산** | e.g. `3억 이하`, `월 80만 이하`, `$3,500 이하` | `예산` | jeonse 1억 / 2억 / 3억 / 4억 / 5억; wolse 50 / 70 / 100 / 150만; trade 3억 / 5억 / 8억 / 12억; USD $2,500 / $3,000 / $3,500 / $4,000 / $4,500 | `depositMax`, `monthlyMax`, `priceMax` (by tenure, as `intakeToProfilePatch` does) |
| **출근** | `출근 30분 이내` | `출근 시간` | 15 / 30 / 45 / 60분 이내, `상관없어요` (clears it) | `commuteMax` |
| **집 종류** | (only if the profile carries home kinds; see `applyKindPreference(candidates, homeKinds)` in `src/homes.js`) | — | the kinds present in the current candidates | home kinds |

  - Use the money formatting the app already uses (`fmtMoney` / `fmtWon`); do not hand-format.
- **Look:**
  - a chip with a value: filled ink (`--ds-action`), white text, chevron;
  - an unset chip: `.ui-float` surface, ink text, chevron.
  - Height 32 px (40 px at ≤ 480 px), radius pill.
  - The selected option in the menu has a ✓.
- **Layout:**
  - the chip row is the top line;
  - the stage title (`판교 출근 · 후보 6곳`) and legend move to the line under it, as today's `.ui-float`;
  - the close × stays top-right.
  - On the phone 지도·후보 tab, the same row shows.

### 2. Control stack (bottom-right, inside `.ui-chatmap-side`, above the credit, all clear of the tray)
Four icon buttons, 40 × 40, `.ui-float` surface, 20 px ink icons (inline SVG components in the file; Astryx semantic names do not include plus, minus, locate or expand), each with an `aria-label` and a `title`:
1. **내 위치** (crosshair icon), on its own card.
2. **확대 / 축소** (`+` / `−` icons), one card, two buttons stacked with a 1 px `--ds-line` divider between them.
3. **후보 모두 보기** (expand/fit icon), on its own card. It replaces the `맞추기` text button and does the same thing.

Gap 8 px between cards. Same zoom functions as today.

### 3. My location (내 위치)
- **Only on click:** call `navigator.geolocation.getCurrentPosition` once (`enableHighAccuracy: false`, `timeout: 8000`, `maximumAge: 60000`).
- **Never** store the position (no state outside the component, no localStorage, no URL, no network request, no log).
- **When the position is inside the map's current lon/lat extent:** draw a "you are here" marker (8 px `--ds-accent` dot, white 2 px ring, a 24 px translucent halo) and pan so it is centred, keeping the current zoom.
- **When it is outside the map**, toast: `지금 계신 곳이 이 지도 밖이에요`.
- **When permission is denied or it fails**, toast: `위치를 가져오지 못했어요. 브라우저에서 위치 권한을 확인해 주세요`.
- **While waiting**, the button shows a pressed/busy state (`aria-busy`).
- If `navigator.geolocation` is missing, hide the button.
- The marker clears when the map's data changes (new search).
- Put the pure parts in an exported helper so they can be tested without a browser, e.g. `locateResult(position, extent)` → `{ inside: boolean, x, y }`.

## Test — `web/tests/map-controls-31h.test.js`
- **Exported filter-model helper** (e.g. `mapFilterChips(profile, { currency, kindsAvailable })` → chips with `{ key, label, set, options }`, and `filterPatch(key, option, profile)` → the profile patch):
  - a KR jeonse profile with `depositMax` 3억 → the 예산 chip label is `3억 이하` and `set` is true;
  - choosing `월세` → patch `{ tenure: "wolse" }`;
  - choosing 예산 2억 on jeonse → `{ depositMax: 200000000 }` (or whatever unit the profile uses; match `intakeToProfilePatch`);
  - choosing `상관없어요` on 출근 clears `commuteMax`;
  - a USD profile has no 거래 방식 chip and USD 예산 options.
- **`locateResult`:** inside → `inside: true` with x/y within the stage; outside → false.
- **SSR `StageArea` / `ChatMap`:**
  - a chip row with the chips;
  - four control buttons with aria-labels `내 위치`, `확대`, `축소` and `후보 모두 보기`;
  - no button whose text is `맞추기`.
- **Source:**
  - `getCurrentPosition` is called only inside the click handler;
  - no `localStorage` / `fetch` with the position.
- **Keep green:** `tests/map-tags-31g.test.js`, `tests/map-markers-31f.test.js`, `tests/map-tray-31b.test.js`, `tests/thread-edge-31d.test.js`, and every test mentioning `ChatMap`, `StageArea`, `chatmap`, `liveResearch`, `applyIntakePatch`, `ui-chatmap` or `맞추기`. Update pins on `맞추기`, and name them.

Run only (**run it before you finish**):
```
cd web && node --test tests/map-controls-31h.test.js tests/map-tags-31g.test.js tests/map-markers-31f.test.js tests/map-tray-31b.test.js tests/thread-edge-31d.test.js $(grep -lE "ChatMap|StageArea|chatmap|liveResearch|applyIntakePatch|ui-chatmap|맞추기" tests/*.test.js | tr '\n' ' ') 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
The marker drawing (31f/31g), `CandidatesCard` (stage 31i), `landing-page.jsx`, `src/engine/**`, `src/i18n/**`, `src/consult/**`, `relay/**`, `data/`, `README*`.

## Final message
Changed files, one line each. Then every new Korean string, any chip left out and why, and the test files you updated. Nothing else.

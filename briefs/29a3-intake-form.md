# Stage 29a3 — Intake cards that don't ask twice (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here (`grep -n` when numbers moved). Stop when the named tests pass.

## Why
Outside review of the intake cards (`web/src/ui/intake.jsx`, state in `web/src/intake.js`), seen in English after typing `맞벌이 예비부부, 강남 출근, 전세 4억 이하`:
- **Asks again what was said.** The text says a couple (2 people), yet `함께 사는 사람 0/4` starts empty with a hint to add one more. The spouse should already be there, editable.
- **Contradiction.** A member's commute limit 45 min was set, yet the profile still lists `Commute limit?` as unknown.
- **Steps and results at once.** The `1/6` step card, the household card, `Your situation`, the search button and the candidate list are all on screen; it is unclear whether the customer is still answering or reading results. When a step is answered the card should fold into summary chips; when conditions change after results, show a clear state.
- **Money by −/+ steppers.** `Stepper` (`intake.jsx:22-43`) steps a 4,000만 원 salary by 100만; deposits by 0.5억. Use a number field with quick chips.
- **Household chips.** Two rows of chips (relations `RELATIONS`, age bands `AGE_BANDS`, `web/src/intake.js:250-251`) have no labels; the selected state is weak.
- **`Monthly pay ₩0M` next to `Unknown`.** The member pay stepper renders `value={draft.incomeMan ?? 0}` (`intake.jsx:~279`), so "unknown" shows as 0.
- **Workplace field**: Korean placeholder in the English UI, free text with no station suggestions.
- **`다음` and `나중에` look alike** (`intake.jsx:223-227`: secondary vs ghost at the same size).
- Buttons without accessible names: relation/age chips, `−`/`+`, Pick (Pick is fixed in 29a2).

## Change

### 1. Spouse pre-filled — `web/src/intake.js` (`prefillFromExtract`, `grep -n "export function prefillFromExtract"`) and `addMember` (`:257-270`)
When the extracted profile has 2 people and the text named a couple (`profile.js:229-233` already detects 부부/신혼/둘이/2인/맞벌이 and English couple words; expose that as a flag if it is not already on the profile), start the household with one member `{ relation: "배우자", ageBand: null, workplace: { known: false }, commuteMax: null }`. `addMember` must accept `ageBand: null` for this pre-filled member (today it defaults to `"20대"` — an invented value; keep `null` and render `나이 미정`). The card header reads `함께 사는 사람 1/4 · 말씀하신 대로 넣어 뒀어요` and the member row has `고치기` and `빼기`.

### 2. One commute ceiling — `web/src/intake.js` (`intakeToProfilePatch`) and the missing-values list (`grep -rn "출퇴근 상한?" web/src`)
If any member (or the intake commute step) has `commuteMax`, the profile's commute ceiling is known (use the smallest), and `출퇴근 상한?` is not listed as unknown.

### 3. Fold answered steps; show "changed" state — `web/src/ui/chat.jsx` `IntakeFlowCard` (`:800-835`)
- When `intake.done` or after the customer pressed `다음` on a step, that step renders as a chip row (`1/6 · 소득 · 연봉 4,000만 원 ✎`); tapping the chip re-opens the step. Only the current step is open.
- When results exist (`candidatesData`) and the profile changes after them (track the profile summary used for the last search), show above the list: `조건이 바뀌었어요` + primary sm button `다시 찾기` (`Search again`), which runs the existing search with the new profile. Hide the intake/household cards while results are shown unless the customer opens `자세히`.

### 4. Number field with quick chips — `web/src/ui/intake.jsx`
Add `MoneyField({ value, onChange, unit: "만 원" | "억", chips, placeholder, ariaLabel })`: an `<input inputmode="numeric">` (empty = unknown, never 0) plus quick chips. Use it for: income (chips `3,000만`, `4,000만`, `5,000만`, `6,000만`), deposit / purchase (`1억`, `2억`, `3억`, `4억`, `5억`), monthly rent (`50만`, `70만`, `100만`), member monthly pay (`200만`, `300만`, `400만`, empty = 모름). Keep `Stepper` only for commute minutes, and give its `−`/`+` `aria-label`s (`출퇴근 상한 5분 줄이기`/`늘리기`).

### 5. Household chips — `intake.jsx:255-268`
Prefix each row with a label (`관계`, `나이`; 12 px, weight 600, `--ds-ink-2`), selected chip `variant="primary"` with `aria-pressed="true"`, others `secondary`; each chip has `aria-label` (`관계: 배우자`, `나이: 30대`). Member pay uses `MoneyField` (empty shows `모름`).

### 6. Workplace field
`<input list="ui-station-list">` with a `<datalist>` of station names from the loaded network (find where chat.jsx loads the network for the map, or the existing station list used by `extract_profile`, `stationNames`); placeholder `직장 근처 역 (예: 강남역)`; English phrase added to `web/src/i18n/en.js` (`Station near work (e.g. Gangnam)`).

### 7. Button hierarchy — `intake.jsx:223-227`
`다음` → `variant="primary"`; `나중에` → `variant="ghost"` with `--ds-ink-2` text. Same in the household card: `+ 함께 사는 사람` secondary.

## Test — new `web/tests/intake-form-29a3.test.js`
- `prefillFromExtract` (or the function that builds the initial household) for `맞벌이 예비부부, 강남 출근` → one member, relation `배우자`, `ageBand === null`.
- `addMember(h0, { relation: "배우자", ageBand: null })` keeps `null`.
- A household member with `commuteMax: 45` → the profile patch has the commute ceiling 45, and the missing list does not include `출퇴근 상한?`.
- SSR render `HouseholdCard` with that member: contains `나이 미정`, `관계`, `나이`, `aria-pressed`, no `0만`.
- SSR render `IntakeCard` for `income`: an `input` with `inputmode="numeric"`, chips `4,000만`; `다음` button is primary (class or variant marker you can assert from markup).

Run only:
```
cd web && node --test tests/intake-form-29a3.test.js $(grep -ln "IntakeCard\|HouseholdCard\|prefillFromExtract\|addMember" tests/*.test.js | tr '\n' ' ') 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```
Update older pins only where they assert the removed stepper markup or `ageBand` defaulting to `20대`.
Also fix one pin left by 29a2: `web/tests/eok-space-26q.test.js:25` expects `59m² or larger`; the UI now writes `㎡` everywhere, so change that expected string to `59㎡ or larger` (nothing else in that file).

## Do not touch
Landing files, `candidate-card.jsx` (29a2 just changed it), map / 3D / engine files, `web/src/i18n/dom.js`.

## Final message
Changed files, one line each. Nothing else.

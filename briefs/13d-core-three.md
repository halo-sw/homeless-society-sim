# Stage 13d — The three things the user sees first (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.**

Context: `briefs/13-ux-redesign.md` is the full redesign. Read only its parts 1, 2, 5 and 6. The user's screenshots are `briefs/img/13-user-1.png` … `-3.png`. Earlier runs already added modules but did not wire them into the screens:
- `web/src/intake.js` + `ui/intake.jsx`
- `ui/candidate-card.jsx`
- `places/select-photos.js` + `places/photo-filter.js`
- `ui/toast.jsx`
- `orb.js` + `ui/orb.jsx`

Tests are green (806) and the build passes at `3cbd560`. Keep them green.

## Do only these three, end to end, visible on screen

### 1. Nothing overlaps (part 1)
- The chat screen is a 3-column shell: conversation (440 px) / centre stage / right drawer (closes to 0).
- The sim view's floating cards (지금 · 선택 기록 · 범례 · 30일 생활 비교) move into the right drawer as sections.
- The timeline docks at the bottom of the centre stage only, one compact row.
- The credit line leaves the bottom of the screen; leave a small "출처" link in the top bar.
- No absolute-positioned panel may overlap another.
- Fix the duplicated greeting.
- Move the token meter out from under the chips (into the top bar, right side, small).

### 2. Guided intake + household (part 2)
- Wire `intake.jsx` into `ui/chat.jsx` so that after the first message the inline answer cards appear in this order:
  1. 연봉
  2. 지금 사는 곳
  3. 이사 희망 지역
  4. 평균 생활비
  5. 통근 가능 범위
  6. 가격 범위 (월세 / 전세 / 매매)
- Prefill values from the first message, marked as the customer's own. Each step has "나중에".
- "+ 함께 사는 사람" adds up to 4 members.
- Then show the profile card and a "후보 찾기" button.

### 3. Candidate card hierarchy + photos (parts 5, 6)
- Wire `candidate-card.jsx` and `select-photos.js` into the candidates list. Card order:
  1. photo 4:3 with counter + label
  2. price (largest)
  3. facts row
  4. name + 동 + station walk
  5. one commute line
  6. badges
  7. "살아 보기" / "전세 점검" / "자세히"
  8. method details collapsed
- Photo order: complex photos (`scenarios/places/commons-named.json`) → nearest station photos → nearby street photos → our 3D thumbnail or map.
- People / interior filter. No photo repeated within one list.
- A home at the workplace station says "직장역과 같은 역 · 지하철 안 타요", never "0분 (0km)".
- When nothing is picked, the centre stage shows `ui/orb.jsx` if it already renders; otherwise a simple region map. Never an empty area.

## How to work (important)
- Before editing a file, read it once, in the ranges you need. Then edit. **Do not read the same file more than 3 times.** Keep notes in `write_todos` instead of re-reading.
- Make your changes to a file in as few edits as possible.
- After each of the three items: run `cd web && npx vite build 2>&1 | tail -5` and the related tests (`node --test tests/<file>`), then `git add -A web && git commit -m "13d: <item>"`. Leave the commit author as configured.
- At the end, run the full `cd web && npm test 2>&1 | tail -15`.

## Output
`briefs/13d-RESULT.md`:
- what is on screen now for each of the three items
- capture URLs (landing, intake step 1, household, profile card, candidates list, sim view with drawer)
- what was not done

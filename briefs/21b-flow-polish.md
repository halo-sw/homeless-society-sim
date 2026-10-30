# Stage 21b — First-user flow polish after the 21a walk (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ithaca-17` (HEAD 897fc09). First edit within 5 tool calls. Commit, then stop.

## Found on the GPU
The orchestrator re-walked 21a at 1440×900 with a real mouse, using the same sentence: "강남역으로 출근해요. 혼자 살고 전세 3억 이하, 역 가까운 오피스텔이면 좋겠어요".

21a works:
- the sentence resolves to "강남 출근 · 1인 · 오피스텔 · 전세 3억 원 이하";
- all six candidates are 오피스텔 near 강남역;
- the run gives a real commute ("출퇴근 편도 5분 / 5분");
- the 3D view follows the walk with "오늘 출근 5분 = 걷기 5분 · 측정".

Still wrong:
1. **"B가 편도 평균 1분 더 걸려요" under "5분 | 5분".** The difference comes from unrounded means (e.g. 4.6 vs 5.4), while the cells show rounded values. Compute the sentence from the **displayed** (rounded) numbers:
   - if the displayed values are equal, say "거의 같아요 (차이 1분 미만)";
   - otherwise say "B가 편도 평균 {Δ}분 더 걸려요", with Δ the difference of the displayed values.
   Apply this in the helper 21a made, used by `chat.jsx` and `app.jsx`.
2. **The 고객님 상황 card is shown twice.** It appears once at the top, then again after the 1/6 연봉 step, followed by a stray "후보 찾기" card. After the intake step, show the 상황 card only once (the latest). Do not render a bare "후보 찾기" card with no content.
3. **The map is crowded and gives no bearings.**
   - Six price pills sit on top of each other around 강남역, and the "회사 · 강남" pill is hidden under them.
   - Run collision avoidance for map pills: the same greedy approach as `placeLabels` in `labels3d.js`. A pill that would overlap gets a short leader line and is offset, or folds into a "+2" cluster pill that expands on click. The 회사 pill and the A/B pills always win.
   - Show **station names** next to the station dots for the stations within the view: 11 px, grey, the same placement rule.
   - Show the names of the 동 or neighbourhoods the candidates are in, at most 4.
   - Fit the view so that the candidates **and** the 회사 marker are inside with padding. Use the existing `fitMapView`.
4. **The 13e2 pin.** `tests/tool-rows-13e2.test.js:47` expects the literal `` `30일 · ${labels.join`` ``. 21a changed it to `` `${noCommute ? "출근 없이 · " : ""}30일 · ${labels.join(...)}` ``. Update the pin to the new string. Keep the check that the run summary still carries the labels.

## Tests — `web/tests/flow-21b.test.js`
- The one-way sentence:
  - means 4.6 and 5.4 (displayed 5 and 5) give "거의 같아요 (차이 1분 미만)";
  - means 11.2 and 14.4 (displayed 11 and 14) give "B가 편도 평균 3분 더 걸려요";
  - missing values still never give 같아요.
- Map pill placement (a pure helper):
  - eight pills within 30 px of each other give no two overlapping boxes, or a cluster pill;
  - the 회사 pill and the A/B pills are always placed.
- Station-name placement returns names only for stations inside the bbox.
- SSR render of the chat after intake: "고객님 상황" appears once.
- Run `tests/tool-rows-13e2.test.js` and it passes.

Run:
```
cd web && node --test tests/flow-21b.test.js tests/first-user-21a.test.js tests/tool-rows-13e2.test.js tests/chatmap*.test.js 2>&1 | tail -10 && npx vite build 2>&1 | tail -2
```

Commit `21b: commute sentence from shown numbers, one 상황 card, map pills never stack, station names, fit includes 회사`. Then stop.

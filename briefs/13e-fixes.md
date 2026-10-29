# Stage 13e — Fixes found on the GPU capture of 13d (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Read `briefs/13d-RESULT.md`.

The orchestrator captured 13d at 1440×900 on the real GPU. Attached:
- `briefs/img/13e-profile.png`: chat, top of transcript
- `briefs/img/13e-cards-mid.png`: chat after wheel-scrolling
- `briefs/img/13e-cards-bottom.png`: chat at the bottom
- `briefs/img/13e-sim.png`: sim view

Good, keep:
- the sim grid + right drawer (no overlaps)
- the card hierarchy (price → facts → name → walk → commute line → badges → actions)
- "직장역과 같은 역 · 지하철 안 타요"
- the photo counter and label

## Fix, in this order

1. **The chat screen scrolls as one page.**
   - Measured: `astryx-layout-content` is the only scroller (scrollHeight 5429, clientHeight 852, width 1440). Wheel-scrolling the transcript scrolls the whole layout, and the centre stage scrolls away, leaving a white area (`13e-cards-*.png`).
   - Fix: the top bar is fixed and the three columns fill the remaining height (`min-height: 0` on the flex/grid children). The transcript column owns its own scroll, with the composer pinned at its bottom. The centre stage and the drawer never scroll with the transcript.
   - Test it in a DOM test as far as jsdom allows (layout styles present). The orchestrator re-measures on the GPU.

2. **The centre stage is 320 px tall and the orb is badly framed.**
   - It must fill the whole stage height and width. Fit the camera to the regions' bounds with margin, and centre it.
   - The regions read as thick, saturated slabs: use thin extrusions (≤ 2 % of the map width), a calm palette from the look table, and region labels (성동 · 송파 · 강남 · 강동 · 위례 · 분당 · 수정 · 중원 · 수지) at the centroid.
   - Hover tooltip and click-to-filter as in stage 13 part 7.
   - Candidate homes appear as dots after a search.
   - Background: the app's light surface, not black.

3. **Profile card labels are wrong.**
   - Fields the customer never mentioned show "아직" + the badge "내가 말한 값". They must show "아직 몰라요" with **no** source badge (or a muted "물어볼 값").
   - Only values found in the customer's words get "내가 말한 값".
   - Remove the duplicated helper line under each value ("함께 사는 사람" under 함께 사는 사람, "전세" under 전세, "아직 묻지 않음").
   - Never show internal tool names (e.g. "연봉(세전 가정: 실수령은 estimate_net_pay로)" → "세전 연봉이에요. 실수령은 따로 계산해요.").

4. **The intake pre-fills 연봉 4000만 원 when the customer never said a salary** (the newlywed example). That is a default, which stage 12a forbids.
   - Steppers for salary, cash, budget and living cost start **empty**, with a placeholder.
   - Add a test.

5. **Tool-call rows repeat words.**
   - "상황 읽기 상황 읽기 3ms" and "집 후보 찾기 집 후보 6곳 …" repeat the label.
   - Show the label once, then the result: "집 후보 찾기 · 6곳 (출퇴근 짧은 순) · 0.2초".

6. **A photo of a person on a subway platform passed the filter** (`13e-cards-mid.png`, credit "revi, CC BY 2.0 kr").
   - For station photos, prefer exteriors, entrances and street views. Exclude titles, descriptions or categories that mention people, passengers, women, men, children, selfie, waiting, crowd, or 승객 / 사람.
   - When a station has only platform photos, use the card's next source instead.
   - Check the filter against the real manifests and report how many photos each rule removes.

7. **The sim drawer.** A small tag ("직장") overlaps the drawer's top edge at x≈1070, y≈60 (`13e-sim.png`). Keep map labels inside the stage area (clip or hide labels whose screen position falls under the drawer).

## How to work
- Read each file once, in the ranges you need; keep notes in `write_todos`. Do not read the same file more than 3 times.
- After each item: `cd web && npx vite build 2>&1 | tail -3`, run the related tests, then `git add -A web && git commit -m "13e: <item>"`.
- At the end: run the full `cd web && npm test 2>&1 | tail -8`, and write `briefs/13e-RESULT.md` (what changed per item, with capture URLs).

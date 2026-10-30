# Stage 18 — The customer's own homes, end to end (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ithaca-17`. Commit after each part (`git add -A web/src web/tests web/scripts && git commit -m "18: …"`). Keep every existing test green; when a test pins old wording that this brief changes, update the pin and say so in the result notes. First edit within 8 tool calls. Do the parts **in order**: if you run out of budget, earlier parts matter more.

Read once: `AGENTS.md`, `briefs/17-RESULT.md` (17, 17b, 17c), `briefs/17d-day-exposure.md`, `web/src/ui/chat.jsx` (ChatScreen, CandidatesCard, SimulationCard, StageArea, DrawerArea), `web/src/ui/orb.jsx`, `web/src/orb.js`, `web/src/main.js:1290-1340` and `:2760-2830`, `web/src/ui/app.jsx:477-520` and `:600-720`, `web/src/ui/share.js`, `web/src/consult/tools-money.js` (`MONEY_HANDLERS`), `web/scripts/money.mjs`.

## What the orchestrator saw (laptop GPU, 1440×900, 2026-10-30 13:50)
The orchestrator walked the whole flow as a customer: landing → example "1인 사회초년생" → send → candidates → pick 천사의도시Ⅱ오피스텔 + 시그마 3 → 이 집들로 살아 보기 → A 3D에서 보기 → A·B 비교 → 결과 공유.

**Wrong data on screen (the worst)**
- The customer's own run (`?mode=sim&home=A&custom=<id>`) shows the **demo's** numbers. The share dialog says "A 레이크팰리스 · 59.97㎡ / B 백현마을 · 84.82㎡". 내 기준 점수 shows the demo's A 42 · B 58, then jumps to A 48 · B 52 after A·B 비교 loads. Cause: `scenarioName` defaults to `demo-two-homes` (`main.js:1298`) even for a custom run, so `paintMoney` fetches `/data/sim/demo-two-homes-money.json` (`main.js:2796`).
- 1인 profile, yet the "함께 사는 사람 0/4" form opens with 배우자 and 30대 preselected.
- A 전세 search for 1인 lists "하얀마을(6단지)(공공임대) 전세 1,553만 원" and "진격의빌딩 · 2025년 · 전세 5,000만 원 · 실거래 1건". Both carry "예산 안 ✓" as if they were normal 전세 homes.
- Above the stage, the header reads "지금 보는 장면 · 송파구 잠실역 인근" for a customer who commutes to 판교.

**Flow that stalls**
- On a candidate card, the button labelled "살아 보기" actually adds the home to the comparison and turns into "담김 ✓ (빼기)". The hint below says "비교에 넣기로 2–3곳을 골라주세요", but no button has that label.
- The right drawer's "이 집들로 살아 보기" does nothing. Only the copy inside the chat works.
- In the sim, "A·B 비교" expands a collapsed `section-compare` at y=847, below the 779 px viewport, so nothing visible happens. "결과 공유" opens a dialog whose box is 0×0, so it is invisible.
- An example chip only fills the input; the customer must press send again. The intake then asks "1/6 · 연봉" although the customer already said "연봉 4천".

**Hard to read**
- The 30-day result card is a 13-row table. It has no row for monthly housing cost and no row for the daily commute, the two things a 1인 사회초년생 asks first. Deltas have no plain-words reading. 피곤한 정도 has no scale (arrival 5.1, yet "30일 평균" 1.5).
- Internal lines reach the customer: "고른 주체 — A: Muse가 고름 0 · 규칙이 대신 고름 0 · 평소대로 59", "그래프 = 걸어서 직접 잰 시간 · 가정값 = 미리 정해 둔 값", "A·B — 장면에 단지 이름이 없어 집 위치에서 시작했어요".
- A card's hero image is a subway-platform photo labelled "주변 사진 · 이 매물 사진이 아니에요". Cards without a photo show an empty grey "우리 3D 미리보기" box.
- The person is named "구성원 1".
- The custom run renders in the photo style (blue glass), while the demo renders painted.
- On the landing, light grey text sits on a blurred light 3D background (low contrast).

**The chat stage** (the user flagged this one specifically): the right half of the chat screen is a small cluster of tilted region slabs ("판") drifting in one corner. Most of the panel is empty, and it says nothing about where the candidates or the workplace are.

## 1. The customer's own homes are a real service, not the demo
- A custom run never reads demo files. When `?custom=` is present, every doc the sim, drawer, score and share card use is built from that run's scenario, homes and the customer's profile, or is marked as missing. Never show another scenario's numbers.
- Build the money doc for the picked homes in the browser when the simulation card runs, from the same functions `web/scripts/money.mjs` uses (`tenureCost`, `householdMonthlyNet`, `moneyTimeline`, reference price from the candidate's 실거래). Store it with the custom run in IndexedDB (`saveCustomRun`). On load, `paintMoney` / `paintCompare` / `ensureShareData` use it.
  - Parity test: for `demo-two-homes`, the browser builder and `money.mjs` give the same monthly totals per home (±1 원 after rounding).
- 내 기준 점수, the moments, the share card (names, ㎡, tenure, dates) and the drawer all read the custom docs. The score must not change when another panel opens.
  - Test: a custom record for two non-demo homes produces share-card names equal to the picked names and a score computed from that record.
- If a value cannot be computed, show "아직 계산하지 못했어요" with the reason. Never fall back to demo values.
- Household from the profile: "1인" opens with no extra members and nothing preselected. Members the customer named get role names ("나", "배우자", "아이"). Those names replace "구성원 1" everywhere (sim drawer, labels, share).
- Candidate honesty:
  - 공공임대 complexes never appear in 전세·월세·매매 results; they belong to the 공공임대 path.
  - A candidate whose reference price rests on 1 trade and is below 50 % of the median for the same type and size band in that 시군구 is not marked "예산 안 ✓". It shows "실거래 1건 · 시세보다 크게 낮아 확인이 필요해요" and sorts after the others.
  - Pure tests for both rules.
- The stage header shows the customer's context, e.g. "판교 출근 · 후보 6곳", never a fixed scene name.
- A custom run renders with the same painted style and look as the demo.
- Commit `18: custom runs use their own data`.

## 2. Nothing stalls
- Card action: "비교에 담기" / "담김 ✓ · 빼기", with the hint "비교할 집을 2–3곳 담아 주세요 (지금 N곳)". Once 2 or more homes are picked, a sticky "이 집들로 30일 살아 보기" sits at the bottom of the chat column. The drawer's button and the chat's button call the same handler. Test that both start the run.
- Example chips send immediately. The intake skips every field the customer already gave (연봉, 모은 돈, 출근지, 보증금 상한, 크기, 인원) and says what it took from the sentence. Test with the three example sentences: no question asks a value present in the sentence.
- While the 30-day run builds, show visible progress with the step name. On failure, show a retry button with the reason in plain Korean.
- Sim screen:
  - "A·B 비교" opens a visible panel: it scrolls the drawer to the compare section and expands it, or opens an overlay.
  - "결과 공유" opens a visible dialog (non-zero size, focused, closable with Esc).
  - Test the dialog's open state and the compare section's `open` attribute after the click.
- Every button the orchestrator clicked above gives visible feedback within 300 ms.
- Commit `18: flow without dead ends`.

## 3. Readable results
- Result card, top to bottom:
  - (a) 내 기준 점수 per home, with the existing caption that it is the customer's own subjective score;
  - (b) 월 주거비 per home (보증금 기회비용·관리비·교통비 as in the money doc, with a "어떻게 계산했나요" link);
  - (c) 하루 출퇴근, the door-to-door one-way average for each commuting member;
  - (d) the 2–3 moments from `pickMoments`;
  - then "자세히 보기" opens the full table.
  - No winner, no 추천, no sorting by score (AGENTS.md).
- Each detail row reads in plain words, neutral: "B가 하루 평균 9분 더 걸려요", "A가 장보기 4번 더". Keep the numbers.
- 피곤한 정도 shows its scale ("0–10, 높을수록 피곤") and uses one definition across rows. If the 30-day average is a different quantity, rename it or drop it.
- Remove from customer view: "고른 주체 …" (`judgmentLine`), "그래프 = … · 가정값 = …", "장면에 단지 이름이 없어 …". Their facts move into "어떻게 계산했나요" in plain language. For example, "이 30일은 정해 둔 생활 규칙으로 만들었어요. Muse 판단이 들어간 날: 0일".
- Cards:
  - Never use a station or platform photo as the hero. Use a photo of the complex itself if one exists. Otherwise use a painted 3D thumbnail of the home's block or a small map crop.
  - No empty grey "우리 3D 미리보기" box: render it or omit it.
  - Keep photo licence lines.
- Landing: the headline, input and example chips meet WCAG AA contrast (≥ 4.5 : 1) over the background. Dim or blur the 3D more, or put the copy on a solid panel.
- Commit `18: readable results`.

## 4. The chat stage is a real map of where the candidates are
Replace the drifting slab board with a map that answers, at a glance, "where are my candidates, and how far from work":
- Painted look like the sim regional view:
  - beige ground `#cfc4ad`
  - 한강 and major water `#3f6f8f`
  - parks `#8a9a5b` where the data has them
  - 시군구 boundaries as thin lines with quiet labels
  - subway lines from `data/build/region/network.json`, each in its line colour, with station dots
- A workplace pin (the customer's 출근지, or 직장 근처역) and numbered candidate pins that match the card order (1…6), each with a small price tag.
- The camera fits the workplace and all candidates with a margin. The map fills the panel (no corner cluster), stays top-down or lightly tilted (≤ 35°), and does not drift on its own (motion only on interaction; respect reduced motion).
- Interaction:
  - hovering a card highlights its pin
  - hovering a pin highlights its card
  - clicking a pin scrolls to its card
  - clicking a region still filters
  - picked homes get a commute line along the subway to the workplace, labelled with the door-to-door minutes from the candidate data
- Before any candidates exist, the map shows the 11 covered areas and the subway network, framed to fill the panel, with "출근지를 말하면 후보가 지도에 표시돼요".
- Pure tests:
  - the camera-fit maths (all pins inside the frame with ≥ 8 % margin at 1440×900 and 390×844 stage sizes)
  - pin numbering equals card order
  - line colours come from the network data
- Commit `18: chat stage map`.

## 5. Midday exposure (= brief 17d)
Do `briefs/17d-day-exposure.md` as written. Commit `17d: time-aware day exposure`.

## End
- `cd web && npm test 2>&1 | tail -6` and `npx vite build 2>&1 | tail -2`.
- Write `briefs/18-RESULT.md`. Include:
  - what changed per part, and the causes found
  - any pin you moved and why
  - what you could not do
  - capture URLs for the orchestrator: landing; the example flow with the custom run; the sim on the custom run (`?mode=sim&home=A&custom=…`); the chat stage before and after candidates
- Commit.

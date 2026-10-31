# Build log

[← README](../README.md) · [한국어](build-log.ko.md)

Deadline: 2026-11-05 11:00 KST.

**For this submission**

| Date | Plan |
|---|---|
| 10-30 ✓ | Verification loop (16), 내 기준 점수 up front, painted look, the customer's own homes end to end with a candidate map (17–18) |
| 10-31 ✓ | English UI, recorded-month replay for judges, Menlo Park (Meta HQ) homes, voice input, "Only living there tells you", link previews |
| 11-01 → 11-02 | Verification on screen, demo video draft |
| 11-03 | Polish, then feature freeze at night |
| 11-04 | 3-minute video and final README |
| 11-05 | Submit by 09:00 KST |

**Coming soon** (not in this submission): measuring rooms and windows from listing photos and floor plans (SAM 3.1), household agents on Spark Open, a field study with real residents, life events such as elevator waits and noise between floors, and scenarios for remote workers, three-generation families and dog owners.

<details>
<summary><b>Example output</b> (demo couple; inputs are placeholders)</summary>

<br>

| | Home A · 잠실 레이크팰리스 59.97㎡ | Home B · 판교 백현마을 84.82㎡ |
|---|---|---|
| Real-transaction median (last 12 months) | buy 26.5억 / 전세 9.8억 / 월세 4억 + 200만 | buy 25.2억 / 전세 9.5억 / 월세 4.5억 + 200만 |
| 전세로 살면 매달 집에 드는 돈 | 260만 원 | 250만 원 |
| 월급에서 집에 나가는 비율 | 36 % | 35 % |
| 보증금이 집값의 몇 %인지 (전세가율) | 37 % | 37.7 % |
| How they get to work (workplace near 판교역, assumed) | walk → 2호선 → 신분당선 → walk | walk |
| Time on trains in 30 days | 44 h | 0 |
| Time walked in 30 days | 27.8 h | 38.0 h |
| How tired on arrival at work (stated model, 0–100) | 25.3 | 5.7 |
| Most crowded leg | 2호선 93 % (measured) | — |
| Evenings at home in 30 days (18–24 h) | 323 h | 343 h |
| Park visits / errands in 30 days | 10 / 33 | 26 / 17 |

Assumed inputs: gross salaries of 6,000만 and 5,000만 원, cash of 2억 원 and a loan rate. All are labelled as assumptions on screen. These numbers are from before stage 15, which compares homes of the same size and counts walking commutes. The table shows differences; which matters more is the customer's call.

</details>

<details>
<summary><b>Progress log</b> (what Muse built, stage by stage)</summary>

<br>

| Stage | What Muse built | Brief → result |
|---|---|---|
| 1–2 | Data pipeline, 3D scene, building-register lookups | [`briefs/01…02b`](../briefs/) |
| 3 | Deterministic 30-day life engine | [`03-RESULT`](../briefs/03-RESULT.md) |
| 4 | Muse judgement layer (198 real decisions, number guards) | [`04-RESULT`](../briefs/04-RESULT.md) |
| 5 | Astryx UI, consult agent, PBR rendering | [`05a`](../briefs/05a-RESULT.md), [`05b`](../briefs/05b-RESULT.md) |
| 6 | Salary-based living costs, real transactions, public rental | [`06-RESULT`](../briefs/06-RESULT.md) |
| 7 | Now card, causes, highlighting, criteria, shadow fix | [`07-RESULT`](../briefs/07-RESULT.md) |
| 8 | Journey view, corridor map, congestion fatigue (+8b/8c fixes) | [`08-RESULT`](../briefs/08-RESULT.md) |
| 9a | Personas, customer priorities, official safety and education figures | [`09a-RESULT`](../briefs/09a-RESULT.md) |
| 9b | Worth-it finance, 전세 safety check, mock deposit loss, support programmes | [`09b-RESULT`](../briefs/09b-RESULT.md) |
| 9c | Per-home commute, the ride as a trip, calmer cards | [`09c-RESULT`](../briefs/09c-RESULT.md) |
| 10 | Plain words, floating Astryx agent, listing check, public notices, share card, demo tour | [`10-RESULT`](../briefs/10-RESULT.md) |
| 10b | Fix: React snapshot loop, tour NaN, render smoke test | [`10-RESULT`](../briefs/10-RESULT.md#stage-10b--whole-ui-react-loop--tour-nan-muse) |
| 11–11b | Agent panel placement, full labels, share card with A/B numbers, look table, ride base map | [`11-RESULT`](../briefs/11-RESULT.md) |
| 12a–12a2 | 11 areas, customer numbers, real candidate homes, schedule ride times on 9 lines | [`12a`](../briefs/12a-RESULT.md), [`12a2`](../briefs/12a2-RESULT.md) |
| 12b | Question-first entry, conversation, home previews, day timeline | [`12b-RESULT`](../briefs/12b-RESULT.md) |
| 13d–13e | Layout without overlaps, guided intake, candidate cards, Seoul/Gyeonggi orb | [`13d`](../briefs/13d-RESULT.md), [`13e`](../briefs/13e-RESULT.md) |
| 14–14b | Terrain (DEM), road ribbons, OSM trees for 60 station areas; procedural vehicles, pedestrians and trains | [`14`](../briefs/14-RESULT.md), [`14b`](../briefs/14b-RESULT.md) |
| 15 | Engine integrity: paired runs over 10 seeds, household costs, walking commutes counted, distance fares, same-size comparison, loan cap | [`15 brief`](../briefs/15-engine-integrity.md) |
| 16a–16b | Built-in verification: checklist scorer with Python parity, claim checks on door-to-door engine values, retry loop | [`16a-RESULT`](../briefs/16a-RESULT.md) |
| 17–17d | Ithaca name, 내 기준 점수 up front, moments, painted look (warm light, outlines, lit night, time-aware exposure) | [`17-RESULT`](../briefs/17-RESULT.md) |
| 18–18g | The customer's own homes end to end (own money doc, score and share card), no dead ends, readable results, one commute number, candidate map with subway tracks | [`18-RESULT`](../briefs/18-RESULT.md) |
| 19–19j | UI overhaul: two-column chat with one run button over the map, a light basemap with roads and price pills, scannable candidate rows, the result as an A·B table, a constant-size train pin, people named 나 / 배우자, a landing that shows the three steps; fixes for an invisible dialog that ate clicks, moment links and fractional minutes | [`19a`](../briefs/19a-chat-layout.md) … [`19j`](../briefs/19j-float-remain.md) |
| 20a–20g | The 3D view, rebuilt from user feedback: no crawling when the camera moves (full-res pass, MSAA/FXAA, gentle Kuwahara, one road layer); names on buildings, complexes and daily places with a 건축물대장 hover card; the hero says how this scene counts toward the result ("오늘 출근 44분 = 걷기 14분 + 지하철 26분 + 기다림 4분"); real VWorld aerial photos on the ground and roofs through a no-store dev proxy, credit on screen; follow mode you can zoom and orbit, 동네 전체 / 따라가기, the route and destination on the ground, now-first panel, whole numbers | [`20a`](../briefs/20a-no-shimmer.md) … [`20g`](../briefs/20g-wheel-delta.md) |
| 21a–21c | A first-time user's own sentence works end to end: 강남역으로 parsed (으로 before 로), housing kind honoured (오피스텔), nothing asked twice and one question at a time, no run without a workplace (station autocomplete, or 출근 안 해요), no false "같아요", commute sentence from the shown numbers, lot-number names readable, map pills never stack, station names, the map fits close candidates | [`21a`](../briefs/21a-first-user-flow.md) … [`21c`](../briefs/21c-map-fit.md) |
| 22a–22c | Public site on GitHub Pages: base-aware data URLs and links, a static mode with no /api calls (model and VWorld keys never reach the browser), runtime data shipped as a release asset (never committed), and a fix for the chat's run worker that was not bundled in production builds | [`22a`](../briefs/22a-github-pages.md) … [`22c`](../briefs/22c-chat-worker-build.md) |
| 23–25 | A relay that keeps every key server-side (Vercel or docker compose); the English UI (i18n core, whole-sentence translation, units); a light basemap | [`23a`](../briefs/23a-relay.md) … [`25a`](../briefs/25a-map-basemap.md) |
| 26a–26z2 | A US area around Meta HQ in Menlo Park: scene, real homes, chat search, bike commutes in the engine, US map sources and heights; phone layout, aerial thumbnails, the Ithaca name, English Muse replies | [`26a`](../briefs/26a-us-area.md) … [`26z2`](../briefs/26z2-phone-tray.md) |
| 27a–27j2 | Chat first: a streaming agent, Muse writes the diary, map pins, neighbourhood scenes, Muse recovers after a failed tool call | [`27a`](../briefs/27a-chat-first.md) … [`27j2`](../briefs/27j2-reply-counter.md) |
| 28a–28g | Design tokens, Powered by Muse, the landing page | [`28a`](../briefs/28a-design-doc.md) … [`28g`](../briefs/28g-landing-finish.md) |
| 29a1–29a14 | Judge path: a recorded month that replays without a key, English trust pass, the landing's try panel, US sources (Zillow ZORI, OSM US), internal ids kept out of answers, map pins that match the card, link previews | [`29a1`](../briefs/29a1-english-trust.md) … [`29a14`](../briefs/29a14-og-image.md) |
| 29b–29b2 | Voice input with Muse Voice Transcribe 1.0 through the relay | [`29b`](../briefs/29b-voice-input.md), [`29b2`](../briefs/29b2-mic-style.md) |
| 29c1–29c1d | "Only living there tells you": walks and bike rides home after sunset, seated mornings, late arrivals | [`29c1`](../briefs/29c1-life-events.md) … [`29c1d`](../briefs/29c1d-dark-bike.md) |
| 29g1–29g3, 29m1 | No false "it has started", replay loads the map data, `META_API_KEY` with named endpoint constants | [`29g1`](../briefs/29g1-start-claim-guard.md), [`29g2`](../briefs/29g2-replay-map-data.md), [`29m1`](../briefs/29m1-meta-api-key.md) |
| 29h1–29h5 | Chat insets, the next step as chips in the thread, one shared ZIP rent said once, street photos first with their credit, no ellipsis in the header | [`29h1`](../briefs/29h1-chat-insets.md) … [`29h5`](../briefs/29h5-street-credit-fit.md) |
| 29k1–29k3 | The report passes only on real numbers (member ids match the engine, no number-free sentences, cited records say how and when, no padding); map pins lead with the commute when every home shares one ZIP rent | [`29k1`](../briefs/29k1-report-members-no-empty-pass.md), [`29k2`](../briefs/29k2-pins-commute-first-check-tags.md), [`29k3`](../briefs/29k3-report-no-padding.md) |
| 29j1–29j4 | Checked comparison: C06/N03 backed by engine trips, the Muse judge, `submit_report` with the two-home verify loop, the on-screen timeline with each rejection reason, handoff and 미지원 | [`29j1`](../briefs/29j1-verify-core-judge.md) … [`29j4`](../briefs/29j4-report-voice-reasons.md) |
| 30a–30h | Docker workspace, honest rule mode without a key, CI for docker, the landing's judge buttons, theme module | [`30a`](../briefs/30a-docker-workspace.md) … [`30h`](../briefs/30h-theme-module.md) |
| 31a–31n | Chat hierarchy and the map: markers, controls, filters, candidate tabs, hit testing, phone polish, map fit | [`31a`](../briefs/31a-chat-hierarchy.md) … [`31n`](../briefs/31n-map-fit-chrome.md) |

</details>

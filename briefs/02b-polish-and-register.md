# Stage 2b — Visual polish + register matching (brief for Muse)

Agent mode, same rules as before (`AGENTS.md`). Read `briefs/02-RESULT.md` and `briefs/notes/register-api.md` first. Two images are attached:
1. **Current render** (`briefs/img/02-current-render.png`, captured by the orchestrator in Chromium, 1280×860, top-left = 잠실 start, top-right = 잠실 at stop 1, bottom = 성수 and 판교 at stop 1).
2. **Style reference**: frames from a third-party autumn street-diorama video. Use it only as art direction (camera distance, proportions, palette, light). Do not copy or trace it.

## Part A — what is wrong in the current render (fix all)
1. **Camera far too close.** A stop fills the screen with two walls. Target: the stop's complex and its surroundings readable, roughly 250–350 m across the frame width at stops and 400–600 m during glides; pitch 40–50° looking down; narrow field of view (≈ 20–28°) or orthographic so it reads as a miniature. Keep the tour target centred.
2. **Trees are giant.** Crowns look 10+ m wide next to 20-storey slabs. Use real scale: street trees 6–10 m tall, crown radius 2–3.5 m, trunk visible; small random scale ±20 %, seeded.
3. **Muddy grey palette and heavy shadows.** Shadows read as dark grey slabs. Make shadows soft and light (shadow strength ~0.25–0.35, warm-tinted), raise hemisphere/ambient fill, use the paper tone for open ground (≈ #F4ECDD) instead of grey, roads lighter warm grey (≈ #DCD6CC) with crisp white crossings. Apartments: cream / warm white / pale terracotta families with per-complex variation and a slightly darker side face (three face tones), floor banding subtle (not stripes). Houses: red-brown roofs. Non-residential: pale grey-beige. Optional thin darker edge lines on building silhouettes if cheap.
4. **Ground reads as one flat beige.** Make complex ground plates, parks (soft green), water and roads visibly distinct from each other, as in the reference.
5. **Paper framing.** Soft vignette to the paper colour at the screen edges, as in the reference.
6. Keep the caption card, legend, attribution and "주거만 강조" as they are (they work). Caption: add the walking minutes from the previous stop (it is missing on stop 1 — show "출발" there).
7. Add a debug URL flag `?shot=<stopIndex>` that jumps the tour to that stop and pauses, so the orchestrator can capture each stop deterministically. Also `?t=<seconds>` to jump the tour clock.

## Part B — register matching (pipeline)
`register_api.py` currently only matches by 동 name / single record, so on the first real run 3 parcels → 0 filled (1 ambiguous parcel with many records, 2 parcels with `totalCount 0` for every `platGbCd`, verified by the orchestrator — those genuinely have no title records).
1. Implement the footprint-area match from `briefs/notes/register-api.md`: per parcel, main buildings only (`mainAtchGbCdNm == "주건축물"`, `grndFlrCnt > 0`, exclude 경비실/주차장/부속), one-to-one assignment of our buildings on that parcel to records by smallest relative `|area − archArea| / archArea`, tolerance ≤ 15 %, deterministic tie-break; out-of-tolerance stays inferred.
2. When `platGbCd=0` returns 0 records, retry once with `platGbCd=2` (블록).
3. Also call `getBrRecapTitleInfo` once per parcel that has an apartment complex and store `hhldCnt` (세대수) and `mainBldCnt` on the complex (`households`, `households_source: "register_recap"`). Use title `hhldCnt` per building when present.
4. Treat HTTP 503 as transient: retry with backoff (the real API returned 503 once today).
5. Tests with synthetic fixtures for each rule; keep the real sample read-only.
6. Report the dry-run plan again. The orchestrator will run the real fetch.

## Output
`briefs/02b-RESULT.md`: changes, real test/build outputs, the exact debug URLs to capture each stop for all four areas, and anything you could not verify without a browser.

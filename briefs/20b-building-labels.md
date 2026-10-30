# Stage 20b — Say what every building is (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ui-20b`. A parallel brief (20a) edits `render/post.js`, `render/painted.js`, `render/quality.js` and the ground block of `main.js` (lines ~300-375); **do not touch those**. Put the new logic in a new module `web/src/labels3d.js` (pure, testable) and wire it into `main.js` near the household tags (`main.js:1427-1440`). First edit within 5 tool calls. Commit, then stop.

## Why
The user: "각각 지도라는 전제하여, 해당 영역이 무슨 건물인지 나와야하는데 설명도 적은 것 같아". The 3D view is a map, so a viewer must be able to tell what each building is. Today it shows only the household tag ("나"), the station name and a destination cone.

The data is already loaded in `area` (e.g. `data/build/pangyo/area.json`):
- **`area.complexes[]`**: `{ id, name: "백현마을", centroid: [lon, lat], building_ids, households: 3294, max_floors: 25, name_source: "register" }`.
- **`area.buildings[]`**, `.register`: `{ name: "봇들마을", sub_name: "704동", use: "공동주택", floors_above: 22, approval_date: "2009-08-20", structure, height }`. 386 of 1,204 buildings also carry an OSM `name`.
- **`area.pois[]`**: `{ category: "shop:convenience" | "amenity:pharmacy" | "amenity:school" | "leisure:park" | "amenity:cafe" | "amenity:restaurant" | …, name, geometry: Point }`.

## What to show (three levels, no clutter)
1. **Always:**
   - The home building: a pill "우리 집 · {complex or building name}". Accent colour `#2f6fed`, white text.
   - The current trip's destination, from the now card's `trip.to.label`: a pill such as "GS25 · 장보기 가는 곳".
   - Station names (as today).
2. **Overview** (camera distance > ~400 m): complex names at each complex centroid, one per complex. White pill, 12 px, weight 600, with a small grey second line "{households}세대 · 최고 {max_floors}층" when present.
3. **Close** (distance < ~400 m):
   - POI labels for daily-life places within the view: 편의점, 마트/슈퍼, 약국, 병원·의원·치과, 학교, 공원, 카페, 은행. Skip restaurants, bars and pubs unless fewer than 8 labels show.
   - Format: a small category glyph text (편, 약, 병, 학, 공, 카, 은) in a 16 px circle, then the name.
   - Building `sub_name` ("704동") as small grey text on top of each apartment building, only when it is within 250 m.

**Hover a building** (raycast against the building meshes; map the hit face or instance back to the building id the way `buildBuildings` groups them). Show a card:
- "{register.name} {register.sub_name}" (or the OSM name);
- "{use} · {floors_above}층 · {approval_date year}년 사용승인";
- source line "건축물대장 (국토교통부)".

When there is no register: "{building kind in Korean} · 층수 미확인 · 출처 OpenStreetMap".

## Rules
- **Screen-space collision.** A pure greedy `placeLabels(items, viewW, viewH)` in `labels3d.js`:
  - priority order: always > complex > POI > dong;
  - skip any label whose box intersects an already placed one;
  - at most 40 labels per frame.
- **Projection.** Each frame, project the label anchors with the same helper the station labels use. Hide labels behind the camera or off screen.
- **Style.** HTML in the `#tags` layer. White pill, 1 px `rgba(0,0,0,.08)` border, shadow `0 1px 2px rgba(0,0,0,.2)`, `Pretendard`. Never `text-overflow: ellipsis` (`compare-tabs.test.js:62`).
- **No invented data.** If a field is missing, leave it out. Never show "undefined" or "null".

## Tests — `web/tests/labels-20b.test.js`
- `labelItemsFor(area, { homeBuildingId, destination, cameraDistM })`:
  - returns the home pill first;
  - at 600 m, includes the complex names (e.g. "백현마을") and no `sub_name`;
  - at 150 m, includes "704동" for the 봇들마을 building and POI labels for `shop:convenience`.
- `buildingCard(building)`:
  - for the 봇들마을 704 record, returns "봇들마을 704동", "공동주택 · 22층 · 2009년 사용승인" and the source line;
  - for a building without a register, returns the fallback with no "undefined".
- `placeLabels`: no two placed boxes intersect; the always-items survive even when crowded.
- Use a small fixture cut from the real `area.json` shape (3 complexes, 6 buildings, 6 POIs) inside the test. Do not read `data/`.

Run:
```
cd web && node --test tests/labels-20b.test.js tests/sim*.test.js 2>&1 | tail -10
```

Commit `20b: building, complex and place labels in the 3D view, hover card from 건축물대장`. Then stop.

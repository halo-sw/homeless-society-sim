# Stage 19b — Chat map that looks like a real map (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ui-19b`. Touch only `web/src/ui/chatmap.jsx`, `web/src/chatmap.js` and a new test. A parallel brief (19a) is changing `chat.jsx` and `ui.css`, so **do not edit those**. First edit within 4 tool calls. Commit, then stop.

## Why
The user said the chat map "looks like a debug plot". At 1440×900 it shows:
- a tan `#cfc4ad` ground;
- grey **bbox rectangles** for every region (`chatmap.jsx:89-105`);
- thin grey **시군구 boundary polylines** that wander across the map (`chatmap.jsx:106-111`);
- dark-blue water fragments (stream polylines drawn 5 px wide, `chatmap.jsx:76-88`);
- black number discs with separate white price tags and leader lines;
- a brown "직" disc for the workplace.

No roads, so nothing tells the eye where it is.

## Target look
A calm, light product map: Apple Maps / Naver Map, light mode.

### 1. Palette — `chatmap.js:13-24` `MAP_COLORS`
Replace with:
```js
export const MAP_COLORS = {
  ground: "#f3f1ec",      // land
  water: "#c9dcea",       // water fill + rivers
  park: "#dfe9d3",        // parks
  road: "#ffffff",        // road fill
  roadCasing: "#e2ddd3",  // road edge
  regionLabel: "#a39d92", // 동네 names
  stationDot: "#ffffff",
  stationRing: "#55514a",
  workPin: "#1d1b18",     // dark pill
  pinFill: "#ffffff",     // price pill
  pinText: "#1d1b18",
  pinPicked: "#2f6fed",   // picked = accent pill, white text
  pinHi: "#2f6fed",
  muted: "#8f897f",
};
```
Keep any other export that tests import. Grep `MAP_COLORS` in `web/tests/` and keep the keys they read, or update those pins.

### 2. Layers, bottom to top — `chatmap.jsx:66-208`
1. **ground** rect.
2. **parks** polygons, `park` fill.
3. **water:**
   - closed rings: `water` fill, no stroke.
   - open river polylines: `water` stroke, 3 px, round caps.
   - No opacity tricks.
4. **roads.** New, from corridor tiles (see §3):
   - trunk: casing 7 px `roadCasing`, then fill 5 px `road`.
   - primary: casing 5 px, then fill 3.5 px.
   - Round joins and caps. Draw all casings first, then all fills, so crossings look clean.
5. **subway lines:**
   - a white casing 5 px under each line, then the line itself 3 px in its official colour, opacity 1;
   - lines not touching the fitted view still render (cheap).
6. **stations.**
   - Draw only stations within 1.5 km of a pin or the workplace (cap 14): 3.5 px white dot with a 1.5 px `stationRing`.
   - Station-name labels, 11 px `muted`, only for:
     - the workplace station;
     - the boarding station of each picked home (`candidate.commute.walk.station`).
   - Each label is placed right of the dot; skip it if it collides with a pin box.
7. **commute legs** for picked homes. Same data as today, drawn 4 px in the leg's line colour on a white 7 px casing.
   - The minutes label is a small white pill with a 1 px `#e2ddd3` border, 11 px, weight 600, e.g. "12분".
   - Round with `Math.round`; never "12.3분".
8. **region names.** Region label text only, **no rectangles**:
   - 12 px, weight 500, letter-spacing 0.02em, `regionLabel` colour, at the bbox centre;
   - only for regions whose centre is inside the view;
   - skip any label that collides with a pin box.
   - Keep `onRegion` on the text.
9. **workplace pin.** A dark pill (`workPin` fill, radius 999):
   - white 12 px weight 600 text "회사 · 판교" (`회사 · ${name}`);
   - a 6 px tail triangle under it pointing at the true point;
   - drop shadow `filter: drop-shadow(0 1px 2px rgba(0,0,0,.25))`.
10. **candidate pins = price pills** (Zigbang / Airbnb style). Each pin is ONE pill, not a disc plus a tag.
    - Content: `${n}` in a 16 px circle (ink bg, white 10 px text) + the short price, 12 px weight 600.
    - Short price: "1억 7,700" for 전세 177,000,000 원; "월 60 / 1,000" for 월세. Add `shortPinPrice(candidate, tenure)` in `chatmap.js` with unit tests.
    - Fill `pinFill`, 1 px `#e2ddd3` border, radius 999, height 24, padding 0 8 px, tail triangle 5 px, same drop shadow.
    - **picked:**
      - fill `pinPicked`, white text;
      - the number circle turns white with accent text;
      - the number is replaced by the letter A/B in pick order (`picks` order from `buildChatMap`; add `letter` to each pin).
    - **hovered (`cardHi`):** scale 1.08 around the tail point, and raise it to the top (render last).
    - Pill collision: reuse `layoutPinLabels` with the pill as the box.
      - When two pills collide, shift the pill (not the anchor) and draw a 1 px `muted` leader from the tail to the true point.
      - The true point is always drawn as a 4 px dark dot.
11. **legend.** Bottom-left, inside the SVG or as an absolutely positioned div in `.ui-chatmap`:
    - a tiny white card (radius 8, 11 px text): "● 후보 · ■ 회사 · ━ 지하철 · 숫자는 출근 편도(추정)".
    - Keep the attribution "© OpenStreetMap contributors" in 10 px `muted`, at bottom-right.

### 3. Roads in `buildChatMap` — `chatmap.js:301-324`
The corridor tiles already carry roads, e.g.:
```
{ class: "trunk", name: "분당수서로", pts: [[127.06878, 37.50449], …] }
```
`class` is "trunk" | "primary". Collect `t.roads` into `roads: [{cls, pts}]` next to `tileWater`. Keep `tileBounds` in the returned object for compatibility, but **do not draw it**.

### 4. Fit
Keep `fitMapView`. Raise `MAP_FIT_MARGIN` so pills never clip: the margin must leave room for a 130 px pill on the right edge. Simplest: add `pad` px (top 56 for 19a's context pill, bottom 96 for 19a's picks tray, sides 24) to `fitMapView` as an optional `{ top, right, bottom, left }` px inset, and use it from `ChatMap`.

## Tests — `web/tests/chatmap-19b.test.js`
- (a) `shortPinPrice`:
  - 177,000,000 전세 → "1억 7,700"
  - 95,000,000 → "9,500만"
  - 200,000,000 → "2억"
  - 월세 deposit 10,000,000 + monthly 600,000 → "월 60 / 1,000"
- (b) `buildChatMap` with a tile carrying 2 roads returns `roads.length === 2` with `cls` kept, and picked pins carry letters "A", "B" in `picks` order.
- (c) `renderToString(<ChatMap map=… />)` for the `single-firstjob`-shaped fixture used in `web/tests/chatmap*.test.js`:
  - contains no `<rect` whose width/height equals a region bbox projection; simplest check: no element with `data-layer="region-box"`, and the region layer renders `<text` only;
  - contains "회사 · 판교";
  - contains "1억";
  - contains no "분." (no float minutes).
- (d) With the 19a insets (56/24/96/24) at 1440×900 and 390×844, every pin anchor lies inside the inset rectangle.

Run:
```
cd web && node --test tests/chatmap*.test.js tests/chat-render-18c.test.js 2>&1 | tail -12
```
Update any older chatmap pin that reads removed colours or the region rectangles, and say so in the commit body.

Commit `19b: chat map — light basemap with roads, price pills, letter pins for picks, legend`. Then stop.

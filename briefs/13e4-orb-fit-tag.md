# Stage 13e4 — Three leftovers from the GPU capture of 13e3 (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents. Do not explore beyond the files named.** The first edit should land within 6 tool calls. Attached: `briefs/img/13e4-chat.png` and `briefs/img/13e4-sim.png` (1440×900, real GPU).

## 1. The orb is not fitted
- The stage is now right: 1000×811 at x=440. But the regions fill only a strip about 550×200 px in the top-right of it (x≈855–1400, y≈100–300). About 70 % of the stage is empty.
- Files: `web/src/ui/orb.jsx` and `web/src/orb.js` (camera-fit helper from 13e2).
- Fit the camera to the **projected** bounds of all region shapes, using the current camera angle and the container's aspect ratio. Iterate or solve so the projected box fills about 84 % of the shorter side, centred.
- Re-fit on container resize.
- Test: the helper's projected bounds for a sample aspect (1000×811) are centred within ±5 %, and fill ≥ 75 % on the limiting axis.
- Commit `13e4: orb fitted and centred`.

## 2. The sim "직장" tag still shows over the drawer
- In `13e4-sim.png` the tag "직장" sits at x≈1058–1092, y≈55–68, over the top edge of `.ui-sim13-drawer` (which starts at x=1060).
- Check `web/src/main.js` `paintTag`, as changed in `1267469`, and `web/src/stage-tags.js`:
  - Is this tag painted by a different function (search `main.js` for other writers of `.style.left` on tags)?
  - Is the drawer rect read before layout?
- Hide any tag whose box (not just its anchor point) intersects the drawer rect or the top bar rect (`.ui-sim13` top nav).
- Test with the pure helper: box intersection.
- Commit `13e4: sim tags never over drawer or top bar`.

## 3. Internal rule IDs are visible to the customer
- The sim drawer's "지금" card shows chips `C-commute-depart`, `C-walk-speed`, `C-walk-route`, `C-congestion`, `C-fatigue-load` under "적용한 기준".
- Show the Korean rule title instead (the criteria table already has titles; find the lookup that the compare/criteria card uses). Keep the ID only in a `title` attribute.
- Grep `web/src/ui` for other places that render `C-` IDs as visible text and fix them the same way.
- Test: the chip label for `C-commute-depart` is Korean.
- Commit `13e4: rule titles, not IDs`.

## End
- Run `cd web && npx vite build 2>&1 | tail -3` and `cd web && npm test 2>&1 | tail -6`.
- Append a "13e4" section to `briefs/13e-RESULT.md`.
- Commit.

# Stage 20g — Follow zoom follows how far the wheel turned (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ithaca-17` (HEAD after 20f). Tiny. First edit within 3 tool calls. Commit, then stop.

## Bug
The follow-mode wheel handler in `web/src/main.js` (20e/20f, search `followZoom = clampFollowZoom`) multiplies by a fixed 1.12 per wheel *event* and ignores `deltaY`.

On the GPU, Chrome delivered five wheel ticks as **one** event with `deltaY: 500, deltaMode: 0`. The zoom moved 1.12×, which is barely visible. A trackpad does the opposite: it sends dozens of tiny events, so the zoom races.

## Fix
- Add a pure helper in `web/src/camera.js`:
  ```
  followZoomAfterWheel(zoom, deltaY, deltaMode)
  ```
  - Normalise the delta to pixels: `deltaMode` 1 (lines) means × 16, `deltaMode` 2 (pages) means × 400.
  - Then return `clamp(zoom * Math.exp(px * 0.0015), 0.5, 6)`.
  - Wheel down (positive) zooms out.
- Use the helper in the handler.

## Tests — add to `web/tests/follow-20f.test.js`
- `followZoomAfterWheel(1, 500, 0)` is between 2.0 and 2.2.
- `followZoomAfterWheel(1, -500, 0)` is between 0.45 and 0.5 (the clamp holds at 0.5).
- `followZoomAfterWheel(1, 3, 1)` equals `followZoomAfterWheel(1, 48, 0)`.
- `followZoomAfterWheel(5, 5000, 0)` is 6.
- `followZoomAfterWheel(1, 4, 0)` is less than 1.01 (a trackpad nudge stays small).

Run:
```
cd web && node --test tests/follow-20f.test.js 2>&1 | tail -6
```

Commit `20g: follow zoom scales with wheel delta, not event count`. Then stop.

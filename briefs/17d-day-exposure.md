# Stage 17d — Midday is blown out (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network, no keys. **No sub-agents.** Branch `ithaca-17`. One small change; keep every existing test green. First edit within 5 tool calls.

Read once: the "17c" section of `briefs/17-RESULT.md`, `web/src/render/chain.js`, `web/src/render/sky.js` (`PAINTED_LIGHT.dayLight`, `sunDay`), `web/tests/painted-17c.test.js`.

The orchestrator captured 17c on the laptop GPU (2026-10-30 05:25). The sim at 08:50 and the 21:00 night now match the targets on screen. The tour at **14:00** (`?area=songpa-jamsil&shot=0&q=high&time=14:00`) is now over-exposed. Measured on screen:

| Spot | Screen | Target |
|---|---|---|
| sunlit ground / plaza | (251,252,247) | beige `#cfc4ad` ≈ (207,196,173) |
| sunlit flat roof | (248,249,244) | `#ddd8ce` ≈ (221,216,206) |
| road in sun | (180,175,160) | `#5b5d60`, ≥ 25 levels darker than ground |

Cause, most likely: the flat ×1.8 `dayLight` gain was calibrated on the low 08:50 sun. With the high 14:00 sun and the new linear output, sunlit surfaces clip.

## Fix
- Make the painted day exposure time-aware, so a sunlit horizontal surface at **any** daytime hour resolves to its palette colour. For example, normalise the gain by the sun's horizontal irradiance at that time, or clamp to a target. Keep the 17b shade ratio ≥ 0.55.
- Use `resolvePaintedPixel` for the tests, at 08:50, 11:00, 14:00 and 17:00: sunlit ground within ΔE 10 of `#cfc4ad`; roof lighter than ground and below 245 in every channel; road neutral and ≥ 25 levels darker than ground. 08:50 must keep its 17c result.
- Commit `17d: time-aware day exposure`.

## End
- `cd web && npm test 2>&1 | tail -6` and `npx vite build 2>&1 | tail -2`.
- Append a short "17d" section to `briefs/17-RESULT.md` with the before/after numbers at the four times.
- Commit.

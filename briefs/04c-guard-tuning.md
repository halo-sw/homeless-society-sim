# Stage 4c — judgment guard tuning (brief for Muse, small)

Rules in `AGENTS.md`. Live run with `--provider meta --effort low` (decision files now in `scenarios/decisions/`, read them): 198 calls, 0 errors, est. $0.94 for both homes. But 109/198 household decisions fell back with `fallback_cause: "invented_number"` (A 31/77, B 78/121), and the rejected model output is not stored, so we cannot audit what was rejected. Many accepted reasons also read oddly: "귀가 후 0분 거리 집에서 휴식하기" (the home option exposes `minutes: 0`).

Fix in `web/src/judge/` (and engine only if needed):
1. **Audit trail.** On any fallback store `rejected: {chosen_key|plan, reason_ko, reason_en, offending: [tokens]}` in the record. Never store raw responses or headers.
2. **Number guard, fair but strict.** Accept a number in a reason if it matches, after normal rounding, any number in the context actually sent to the model: option minutes (exact, 1 decimal, or integer-rounded), distances in m (exact or rounded to 10 m) or km (1–2 decimals), clock times and day numbers in the context, counts and numbers that appear verbatim in the member's profile/preferences. Ordinals/list markers and Korean counters like "한 번" are not numbers to check. Everything else is still rejected.
3. **Prompt.** Tell the model: cite at most one number and copy it exactly from the options, or cite none; never state the home option's distance; keep reasons about the person's routine/preference. Do not send `minutes: 0` for the home/stay option (send no minutes for it).
4. Tests for the new accept/reject cases using the real rejected-style strings (rounded km, integer minutes, "0분 거리"), and that `rejected` is written on fallback. Run `node --test`, `vite build`. Do not commit. Append a short note to `briefs/04-RESULT.md`.

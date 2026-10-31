# Stage 32d2 — re-point one stale test pin (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator
The orchestrator added `{ ko: "프로필 읽기({0:\d+}개 물어봄)", … }` to `web/src/i18n/en.js` (stage 32d), so `프로필 읽기(1개 물어봄)` now has an exact English line: `Reading profile (1 question asked)`.

`web/tests/chat-shell-32a.test.js` "32a translateExact" (~line 105) used that string as its example of an *unknown* Korean string, so it fails:
```
+ 'Reading profile (1 question asked)'
- null
```

## Change (`web/tests/chat-shell-32a.test.js` only)
- Use another Korean string that has no table entry as the unknown example (e.g. `"상황 읽기 연습 문장"`; check it really returns `null`).
- Add one assertion that `translateExact("프로필 읽기(1개 물어봄)")` is `"Reading profile (1 question asked)"`.
- **Keep the intent of "32a liveRowLine per language":** the EN line has no Hangul and no romanized syllables, and it is the label alone or the label plus an exact tail. It should now read `✓ Reading your situation · Reading profile (1 question asked)`; assert that exact string.

Run only (**run it before you finish**):
```
cd web && node --test tests/chat-shell-32a.test.js tests/translator-32d.test.js 2>&1 | tail -8
```

## Do not touch
Anything but that test file.

## Final message
Changed files, one line each. Nothing else.

## Also (second pass)
`web/tests/translator-32d.test.js` "orchestrator table entries" still pins `Reading your situation (asked 1)` from the 32d brief. The orchestrator changed that wording to `Reading profile (1 question asked)` (it matches the table's existing `Reading profile (N questions asked)` for 2+). Update that one pin, and run both test files again.

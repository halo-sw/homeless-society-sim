# Stage 26q — keep the space in "4억 이하" when localizing money (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Found by the orchestrator
In English mode, `localizeNumbers` (`src/i18n/translate.js:41`) eats the space after an 억 amount that has no `원`:

| Korean | English today | Expected |
|---|---|---|
| `전세 4억 이하` | `jeonse ₩400Miha` | `jeonse ₩400M or less` |
| `보증금 1억 이하` | `deposit ₩100Miha` | `deposit ₩100M or less` |
| `전세 2억 원 이하` | `jeonse ₩200M or less` | (correct) |

- `localizeNumbers("맞벌이 예비부부, 강남 출근, 전세 4억 이하, 59㎡ 이상")` gives `… 전세 ₩400M이하, …`.
- The glued token `₩400M이하` is then romanized ("Miha").

## Change — `src/i18n/translate.js`
`localizeNumbers` keeps the whitespace that followed the Korean amount: `4억 이하` → `₩400M 이하`. Look at how the 억/만 regex consumes trailing `\s*` (or an optional `원`) and keep the original separator when there is no `원`. Do not change any other output of `localizeNumbers`.

## Test — `web/tests/eok-space-26q.test.js`
- `localizeNumbers("전세 4억 이하")` === `"전세 ₩400M 이하"`.
- `localizeNumbers("전세 2억 원 이하")` gives the same as today (pin today's value first, before you edit).
- `localizeNumbers("전세 1억 8,500만 원")` gives the same as today (pin it).
- The full translator (built as `src/i18n/index.js` builds it, with `en.js` phrases, patterns and words):
  - `"보증금 1억 이하"` → contains `₩100M` and not `iha`;
  - `"맞벌이 예비부부, 강남 출근, 전세 4억 이하, 59㎡ 이상"` → `"Dual-income engaged couple, working in Gangnam, jeonse under 400M won, 59m² or larger"`.
- Keep green: every `tests/*i18n*`, `tests/*translate*`, `tests/*lang*`, `tests/en-*` file that exists.

Run only:
```
cd web && node --test tests/eok-space-26q.test.js $(ls tests | grep -iE 'i18n|translate|lang|^en-' | sed 's#^#tests/#') 2>&1 | tail -10
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
Everything except `src/i18n/translate.js` and the test file. `en.js`, `en-table.js` and `en-words.js` are the orchestrator's. Other stages are editing UI files right now.

## Final message
Changed files, one line each. Nothing else.

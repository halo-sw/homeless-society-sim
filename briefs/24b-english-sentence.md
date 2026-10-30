# Stage 24b — An English sentence works as well as a Korean one (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. Branch `i18n-24`. Stop when this part is done.

## Why
24a added an English UI. The first thing an English-speaking user does is type their situation on the landing page. `extract_profile` (`web/src/profile.js:292-396`) only understands Korean, so

"I commute to Gangnam Station. I live alone, jeonse up to 300M won, an officetel near the station would be nice."

finds nothing: no workplace, no members, no tenure, no budget, no home kind. This part adds English cues next to the Korean ones. Korean behaviour must not change.

Read `web/src/profile.js` lines 69-232 and 256-396 only.

## Change — `web/src/profile.js`
1. **Money.** `findMoney` (110-120) also finds English amounts, each with its verbatim evidence slice:
   - `300M`, `300 M`, `300m won`, `300 million`, `₩300M`, `KRW 300M` → 300,000,000;
   - `1.5B`, `1.5 billion` → 1,500,000,000;
   - `40K` / `40k` → 40,000 (rare, but keep it);
   - `₩40,000,000` and `40,000,000 won` → 40,000,000;
   - a bare large number with commas (`40,000,000`) only when followed by `won` or preceded by `₩`/`KRW`.
   - Put this in `parseEnglishMoney(chunk)` (exported, pure) and keep `parseMoneyChunk` unchanged. Matches stay in text order together with the Korean ones.
2. **Anchors.**
   - `nearMoney` (256-291) prefers money after the anchor. English also says "budget of 300M" (after) and "300M jeonse" (before), so the same rule works. Use a window of 24 for English anchors.
   - Add English alternatives to each anchor regex in `extract_profile` (304-317), case-insensitive:
     - salary: `salary|earn|make|income`;
     - cash: `savings|saved|cash|in the bank`;
     - deposit: `jeonse|deposit`;
     - monthly: `per month|a month|/month|monthly|monthly rent|wolse`;
     - price: `buy|purchase|price`.
   - Budget words that only bound the deposit (`up to|under|below|max|at most|budget`) are not anchors by themselves. They work because the money sits next to `jeonse`/`deposit`.
3. **Size and commute limit.**
   - Size: `(\d+(?:\.\d+)?)\s*(?:m2|m²|㎡|sqm|square meters?|pyeong)`. For pyeong, keep the number as said, the way the Korean 평 path does now; do not convert.
   - Commute limit: `(?:within|under|at most|max(?:imum)?|no more than)\s*(\d+)\s*(?:min|mins|minutes)` and `(\d+)\s*(?:min|mins|minutes)\s*(?:or less|max|at most|commute)`.
4. **Tenure** (`findTenure`, 127-135), case-insensitive, word-bounded:
   - `public rental|public housing` → public;
   - `jeonse|chonsei` → jeonse;
   - `monthly rent|wolse` → wolse;
   - `buy|purchase|buying` → trade;
   - `not sure|undecided|don't know yet` → undecided.
   - Evidence is the matched slice as written.
5. **Members** (`findMembers`, 137-161), word-bounded, case-insensitive:
   - two adults: `couple|married|newlywed|my (?:wife|husband|partner|spouse)|two of us|both work`;
   - one adult: `alone|by myself|single|on my own|just me`;
   - child: `kid|kids|child|children|son|daughter|baby|toddler|elementary`.
   - Two adults wins over one, as now. Evidence slices are verbatim and joined with `·` as now.
6. **Home kinds** (`findHomeKinds`, 168-185):
   - `officetel` → 오피스텔;
   - `apartment|apt` → 아파트;
   - `villa|multi-unit|multiplex|row house` → 연립·다세대;
   - `studio|one-room|one room` → 원룸.
   - Evidence is the English slice.
7. **Workplace** (`findWorkplace`, 202-230): if no Korean pattern matched, try the English patterns, case-insensitive:
   - `commute to ([A-Za-z][A-Za-z .'-]{1,40}?)(?:\s+station|\s+stn)?(?=[.,;!]|\s+(?:and|but|every|daily|for|by)\b|$)`;
   - `work (?:at|in|near|around) (…same…)`;
   - `(?:office|job|workplace|company) (?:is )?(?:at|in|near) (…same…)`;
   - `near ([A-Za-z…]+) (?:station|stn)` only when the sentence also has `work|office|commute`.
   - Mention: trim, strip a trailing `station`/`stn`.
   - Resolve it with a new helper `resolveEnglishStation(mention, stations)`:
     - compare `mention.toLowerCase()` with no spaces or hyphens against `romanize(name).toLowerCase()` with no spaces or hyphens for each Korean station name, after removing a trailing `역`;
     - also check the `NAMES` overrides from `web/src/i18n/romanize.js`; import `romanize` and `NAMES` from there;
     - a match returns the Korean station name, exactly as `resolveWorkplace` does.
   - The returned `text` stays the English mention, and `evidence` is the matched slice.
8. **Notes** set in `extract_profile` (`"세전 연봉이에요…"`, `"모은 돈"`, …) stay Korean. The UI layer translates them.

## Test — add to `web/tests/profile-english-24b.test.js`
Use the station list `["강남", "잠실", "판교", "선릉", "역삼", "정자"]` (the form `opts.stations` takes; check how `profile.test.js` passes it).
- "I commute to Gangnam Station. I live alone, jeonse up to 300M won, an officetel near the station would be nice." gives:
  - workplace resolved `강남`;
  - members one adult;
  - tenure `jeonse`;
  - `depositMax` 300,000,000;
  - `home_kinds` `["오피스텔"]`;
  - `ok` true, with every evidence a verbatim slice.
- "We're a married couple with a kid in elementary school, I work in Pangyo, budget jeonse 450 million, apartment, commute within 40 minutes" gives:
  - two adults + child;
  - `판교`;
  - deposit 450,000,000;
  - 아파트;
  - `commuteMax` 40.
- "monthly rent, deposit 10M and 800K per month, studio near Seolleung station for work": tenure `wolse`, monthly 800,000, kind 원룸, workplace `선릉` (via the `near … station` rule with `work`).
- `parseEnglishMoney`: `₩1.2B` → 1,200,000,000; `KRW 300M` → 300,000,000; `40,000,000 won` → 40,000,000; `300` → null.
- Korean is unchanged: run the existing `profile.test.js` and `profile-labels-13e2.test.js` and keep them green.

Run only:
```
cd web && node --test tests/profile-english-24b.test.js tests/profile.test.js tests/profile-labels-13e2.test.js 2>&1 | tail -15
```
If it still fails after 2 fix attempts, stop and print the last lines.

## Do not touch
`web/src/paths.js`, `web/src/ui/*`, `web/src/aerial/*`, `web/src/basemap.js`, `web/src/main.js`, `web/src/i18n/en.js`. Other runs edit them.

## Final message
Changed files, one line each. Nothing else.

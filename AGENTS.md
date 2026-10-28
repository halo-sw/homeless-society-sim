# AGENTS

Product code, tests and pipeline scripts in this repo are written by Muse (`muse-spark-1.3`, Muse Code agent mode). Other agents may write briefs, install tools, download data, run tests, capture screenshots and do git work, but must not author product code.

Scope: a nationwide (South Korea) agent-based housing life simulator that builds a 3D neighbourhood from real map data and renders it in illustrated / manga-background styles. Full request: `../outputs/muse-loop/23-AGENT-SIMULATOR-REQUEST.md`. Stage briefs: `briefs/`.

Hard rules
- Clean room: never access, copy or imitate the source, shaders, data or exported images of "どこでもロケハン" (tools.oyasumi-gamedev.com/rokehan). Work only from the feature list in the request.
- Numbers (time, distance, cost, heights) come from data and the engine. The model may choose and explain, never change state values.
- No price forecasts, contribution percentages, straight-line commute claims, or invented shops / residents / events. Simulated residents are labelled as simulated.
- Mission (2026-10-29): democratise housing knowledge for Gen-Z, first-job workers and couples about to marry. Show, explain and let the customer decide; never decide for them.
- Price paths appear only as customer-chosen sensitivity scenarios labelled 가정 (e.g. −2 / 0 / +2 % a year), never as an expectation. No buy / don't-buy, sign / don't-sign advice: "worth it" is shown as cost comparisons under stated assumptions.
- Safety and education: official statistics only, always with source, period, unit and geographic level (e.g. 성남시 is city-level, not 분당구); no composite safety or school-quality score, no demographic composition (race, nationality, income of residents), no individuals' residences.
- Priorities: the only weighting of homes is the customer's own explicit weights, shown as theirs. No default ranking.
- Support programmes (public rental, policy loans, youth / newly-wed benefits): a condition-by-condition comparison of the customer's input with the published condition, with as-of date and official link; never a final eligibility verdict.
- 전세 (deposit) risk: public-data warning signals, an official-source checklist and clearly labelled 모의 loss scenarios. Never a safe / unsafe verdict on a specific property or landlord; not legal advice.
- VWorld geocoder results are used in real time only and never stored. No keys in code, logs or git.
- Raw and built data (`data/raw`, `data/build`) are never committed; publish the scripts that regenerate them. Attribution for every source lives in `ATTRIBUTION.md` and on screen.
- Python pipeline uses `.venv/bin/python`; tests run with `.venv/bin/pytest`.

# AGENTS

Product code, tests and pipeline scripts in this repo are written by Muse (`muse-spark-1.3`, Muse Code agent mode). Other agents may write briefs, install tools, download data, run tests, capture screenshots and do git work, but must not author product code.

Scope: a nationwide (South Korea) agent-based housing life simulator that builds a 3D neighbourhood from real map data and renders it in illustrated / manga-background styles. Full request: `../outputs/muse-loop/23-AGENT-SIMULATOR-REQUEST.md`. Stage briefs: `briefs/`.

Hard rules
- Clean room: never access, copy or imitate the source, shaders, data or exported images of "どこでもロケハン" (tools.oyasumi-gamedev.com/rokehan). Work only from the feature list in the request.
- Numbers (time, distance, cost, heights) come from data and the engine. The model may choose and explain, never change state values.
- No price forecasts, contribution percentages, safety scores, straight-line commute claims, or invented shops / residents / events. Simulated residents are labelled as simulated.
- VWorld geocoder results are used in real time only and never stored. No keys in code, logs or git.
- Raw and built data (`data/raw`, `data/build`) are never committed; publish the scripts that regenerate them. Attribution for every source lives in `ATTRIBUTION.md` and on screen.
- Python pipeline uses `.venv/bin/python`; tests run with `.venv/bin/pytest`.

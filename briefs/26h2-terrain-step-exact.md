# Stage 26h2 — terrain_step must not change Korean boxes (brief for Muse)

Agent mode, rules in `AGENTS.md` ("Usage budget"). No network, no git, no full suite. Branch `us-26`. Stop when done.

## Found
`pipeline/scene.py` `terrain_step` (26h) rounds with `math.ceil(need_m / STEP_M - 1e-9)`. Every Korean box has a real `need` slightly above 600 m (e.g. 600.00001 from the projection), so the old code gave `half_m = 602.5` and the new one gives `600.0`. That changes all 64 Korean scenes. The brief required them to stay byte-identical.

## Change
- In `terrain_step`, use exactly the old rounding, with no epsilon: `half = math.ceil(need_m / STEP_M) * STEP_M`. Do the same in the coarse-step loop: `math.ceil(need_m / step) * step`.
- Add a test with `need = 600.00001` → `(2.5, 602.5)`. Keep the other `terrain_step` tests; adjust only an expectation that depended on the epsilon, and say which.

Run only:
```
.venv/bin/python -m pytest -q tests/test_us_area.py $(ls tests | grep -i scene | sed 's#^#tests/#') 2>&1 | tail -15
```

## Final message
Changed files, one line each. Nothing else.

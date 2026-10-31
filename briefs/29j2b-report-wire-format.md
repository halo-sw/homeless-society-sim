# Stage 29j2b — submit_report follow-up: OpenAI-shaped tool calls in the rewrite history, failures in the result (brief for Muse)

Agent mode, rules in `AGENTS.md` (read the "Usage budget" section). Branch `chat-27`. Sandbox: no network, no keys. No sub-agents, no git, no todo list, no full test suite, no build. First edit within 3 tool calls. Read only the line ranges quoted here. Stop when the named tests pass.

## Why
Orchestrator review of 29j2:
1. **Rewrite calls would be rejected by the real API.** `completeWithTools` (`web/src/judge/providers.js:251-256`) sends `messages` to the provider as-is. `writeReport` (`web/src/consult/report.js`) pushes the assistant turn with `tool_calls: assistantMessage.tool_calls` — the provider's *parsed* shape `{ id, name, args }` (`providers.js:222-223`). The OpenAI wire shape is `{ id, type: "function", function: { name, arguments: "<JSON string>" } }` — the agent converts the same way (`web/src/consult/agent.js:294-297`, `:562-565`). So the 2nd call (the first rewrite) would fail with HTTP 400 on Muse, and every report would end as a handoff for the wrong reason. The fake `call` in the 29j2 test does not notice.
2. **The UI cannot mark which sentences failed.** `submit_report` returns `result: { pass, weighted_coverage, must_coverage, feedback_ko, by_home }` (`web/src/consult/tools.js:~1352-1356`) without `failures`.

## Changes
1. `web/src/consult/report.js`: a small `wireToolCalls(calls)` → `(calls || []).map((c) => ({ id: c.id, type: "function", function: { name: c.name, arguments: typeof c.args === "string" ? c.args : JSON.stringify(c.args || {}) } }))`. Every assistant message `writeReport` pushes into `messages` uses `tool_calls: wireToolCalls(assistantMessage.tool_calls)`, and is pushed **only with** `tool_calls` when there is at least one call (an assistant message with an empty `tool_calls: []` is also invalid — omit the key then).
2. `web/src/consult/tools.js` `submit_report` result: add `failures: (result.failures || []).map(({ sentence_id, item_id, home, kind, reason_ko }) => ({ sentence_id, item_id, home, kind, reason_ko }))`.

## Test — extend `web/tests/submit-report-29j2.test.js`
- In the pass-after-rewrite case, assert every `messages` entry the fake `call` receives on the 2nd call that has `tool_calls` uses `type: "function"` and a string `function.arguments`, and no assistant message carries an empty `tool_calls` array; the `role: "tool"` message's `tool_call_id` equals the previous call's id.
- In the handoff case, `out.result.failures.length > 0` and each has `home` and `sentence_id`.

Run only:
```
cd web && node --test tests/submit-report-29j2.test.js tests/consult-tools.test.js 2>&1 | grep -E "^# (pass|fail)|not ok" | head -12
```

## Do not touch
Everything else; `briefs/`.

## Final message
Changed files, one line each. Nothing else.

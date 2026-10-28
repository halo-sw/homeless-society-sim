package: @astryxdesign/core

# ChatToolCalls

ChatToolCalls displays tool or function call invocations from an LLM response. Pass an array of calls and the component handles the rest: a single call renders inline, while multiple calls collapse into a summary with the latest call visible at the surface. Use it anywhere an AI agent shows what actions it took.

**Import:** `import {ChatToolCalls} from '@astryxdesign/core/Chat';`

## Anatomy

| Element | Required | Description |
|---------|----------|-------------|
| Status icon | Yes | A themed semantic success/error icon, or a spinner while the call is pending or running. |
| Tool name | Yes | The function or tool name displayed in monospace: bash, edit, read, web_search, etc. |
| Node badge | No | A neutral pill badge showing which sandbox or environment ran the tool, like cli:remote-server or workspace. |
| Target label | No | The target of the action (a file path, command, or search query) shown after the tool name. |
| Diff stats | No | Green additions and red deletions counts for edit operations, displayed inline after the target. |
| Duration | No | Execution time shown on the trailing edge for completed calls. |
| Group header | No | A wrench icon with a call count, shown when multiple calls are present. Clicking toggles between the summary and the full list. |

## Best Practices

- **Do:** Include a target string on every call so the user can see what the tool acted on: a file path, a shell command, or a search query.
- **Do:** Show a duration on completed calls so users can judge which tools are slow and understand why a response took time.
- **Do:** Provide a group label when the automatic count does not explain what the calls represent.
- **Do:** Provide resultDetail with a code block for calls that produce output (diffs for edits, terminal output for shell commands) so users can inspect results inline.
- **Do:** Set a unique key on each call item when streaming so React can animate additions without re-mounting completed rows.
- **Don't:** Don't omit the status field. Without it the call defaults to complete, which is misleading for calls that are still running or have failed.
- **Don't:** Don't display tool calls outside a chat message context; they are designed to sit inside an assistant message, not as standalone UI.
- **Don't:** Don't use custom wrappers around individual calls; the component handles single vs. grouped layout automatically based on the array length.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `calls` | `ChatToolCallItem[]` | - | Array of tool call data. Each item has name, status, target, duration, node, additions, deletions, stats, errorMessage, resultDetail, key, and data. status is one of 'pending', 'running', 'complete', or 'error' (defaults to 'complete'). **(required)** |
| `label` | `string` | - | Custom summary label shown for an expanded group. The translated call count is used when omitted. |
| `isExpanded` | `boolean` | - | Controlled expanded state for the group. |
| `defaultIsExpanded` | `boolean` | `false` | Default expanded state when uncontrolled. |
| `onExpandedChange` | `(isExpanded: boolean) => void` | - | Callback fired when the expanded state changes. |
| `xstyle` | `StyleXStyles` | - | StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}. |



Next step: run `npx astryx init` to finish setup and install the Astryx agent prompt.
package: @astryxdesign/core

# Badge

Badge highlights a status or category at a glance. Use it sparingly: only when a value represents a distinct state (Active, Failed) or a grouping tag (Engineering, Design). Most metadata (dates, durations, counts, descriptions) should be plain description text, not badges.

**Import:** `import {Badge} from '@astryxdesign/core/Badge';`

## Anatomy

| Element | Required | Description |
|---------|----------|-------------|
| Icon | No | An optional leading icon that helps identify the badge type at a glance. |
| Label | Yes | The text or number shown inside the badge. |

## Best Practices

- **Do:** Every status badge steals attention. Only badge states where the user needs to notice or act: errors, warnings, items requiring follow-up. If no action is needed, plain text is fine.
- **Do:** Use success, warning, and error variants only for system status that demands attention: "Failed", "Degraded", "Action Required". These have bold solid backgrounds designed to stand out.
- **Do:** Use color variants (blue, purple, teal, etc.) for category tags that group or classify items: team names, content types, priority levels.
- **Do:** Keep labels to one or two words. If you need more detail, put it in surrounding text instead of the badge.
- **Do:** Add an icon when it helps identify the badge type quickly, but always include a text label alongside it.
- **Don't:** Apply a "success" badge to every healthy/active/normal item. If all rows show green "Active" badges, none stand out; the badge adds noise, not information. Show only the states that need user attention (errors, warnings, pending actions).
- **Don't:** Use badges for metadata. Durations ("6h window"), counts ("12 trigger types"), dates, and descriptions are not statuses or categories; use description text (Text with type="supporting") instead.
- **Don't:** Use semantic status variants (success, warning, error, info) for categories or informational content. These are visually loud and should only indicate system state.
- **Don't:** Repeat the same badge in every row of a table or list. If the same value appears in most rows, it's not adding information; use plain text for common states and reserve badges for the exceptional ones.
- **Don't:** Make badges clickable; they are read-only indicators. Use a button or link if the user needs to take action.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `variant` | `'neutral' \| 'info' \| 'success' \| 'warning' \| 'error' \| 'blue' \| 'cyan' \| 'green' \| 'orange' \| 'pink' \| 'purple' \| 'red' \| 'teal' \| 'yellow'` | `'neutral'` | Visual style variant. Semantic variants (neutral, info, success, warning, error) use solid backgrounds. Non-semantic color variants use tinted backgrounds with colored text for categorization and tagging. |
| `label` | `ReactNode` | - | Badge text content. A badge is one line, so a label wider than the space available is cut with an ellipsis rather than escaping its container; a string or number label is also set as the badge's title so the full text stays reachable on hover. |
| `icon` | `ReactNode` | - | Optional leading icon. |

## Theming

| Component class | Preferred data attributes | Props | States |
|-----------------|---------------------------|-------|--------|
| `astryx-badge` | `data-variant` | neutral, info, success, warning, error, blue, cyan, green, orange, pink, purple, red, teal, yellow | - |

Override in defineTheme:
```ts
components: {
  'badge': {
    base: { /* CSS properties */ },
    'variant:value': { /* variant-specific */ },
  },
}
```


package: @astryxdesign/core

# IconButton

A button that shows only an icon with no visible text. Use IconButton in toolbars, table rows, and compact UI where space is tight and the icon is universally understood.

**Import:** `import {IconButton} from '@astryxdesign/core/IconButton';`

## Best Practices

- **Do:** Make the aria-label specific: a trash icon labeled "Delete conversation" is clearer than just "Delete" for screen readers.
- **Do:** Add a tooltip: even a gear icon can mean Settings, Preferences, or Configure.
- **Do:** Use ghost in toolbars and dense areas to reduce visual clutter.
- **Don't:** Use IconButton if the action isn't obvious from the icon alone; use Button with text.
- **Don't:** Skip the tooltip; label only reaches screen readers, sighted users need the hover hint.

## Accessibility

- **Essential icon or spinner arc:** IconButton has no visible label. Its icon must have at least 3:1 contrast with the button background in Rest, Hover, and Pointer down. The moving spinner arc must also meet 3:1 while loading.
- **Visible control boundary:** The button edge needs 3:1 contrast only when users need it to see the control.
- **Keyboard focus indicator:** The focus outline must have at least 3:1 contrast with the area around the button. Check the red outline on destructive buttons too.
- **Disabled appearance:** Disabled controls do not need to meet these contrast ratios.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | - | Accessible label. Used as aria-label (not rendered as visible text). **(required)** |
| `icon` | `ReactNode` | - | Icon element rendered inside the button. An Astryx Icon with no explicit size defaults to sm for sm/md buttons and md for lg buttons. **(required)** |
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'destructive'` | `'secondary'` | Visual style variant. |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Size variant. |
| `elevation` | `'none' \| 'low' \| 'med' \| 'high'` | `'none'` | Resting shadow depth. The most common FAB shape is an icon-only button, so raise it with `low`/`med`/`high` for a floating action button. `none` is the default flat button. |
| `isLoading` | `boolean` | `false` | Shows a loading spinner and blocks re-activation while staying focusable (aria-busy + aria-disabled, not native disabled). |
| `isDisabled` | `boolean` | `false` | Disables the button. |
| `tooltip` | `string` | - | Tooltip text shown on hover. |
| `onClick` | `(e: MouseEvent) => void` | - | Standard click handler. |
| `clickAction` | `(e: MouseEvent) => void \| Promise<void>` | - | Async click handler with automatic loading state. |


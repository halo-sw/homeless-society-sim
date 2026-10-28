package: @astryxdesign/core

# Tooltip

A short text hint that appears on hover or focus, anchored to a trigger element. Use it to describe icon-only buttons, show the full text of truncated labels, or provide supplementary context without cluttering the UI.

**Import:** `import {Tooltip} from '@astryxdesign/core/Tooltip';`

## Anatomy

| Element | Required | Description |
|---------|----------|-------------|
| Tooltip surface | Yes | Painted overlay surface that presents the tooltip. |
| Tooltip text | Yes | Tooltip content rendered within the surface. |

## Best Practices

- **Do:** Keep tooltip content concise: aim for under 140 characters of plain text.
- **Do:** Add a tooltip to icon-only buttons and controls that lack a visible label.
- **Do:** Set touchTrigger to tap when the trigger is a button whose only job is revealing the tooltip, such as an info icon: touch has no hover, and auto keeps the tap for triggers that perform an action.
- **Don't:** Place interactive elements like links or buttons inside a tooltip; use HoverCard or Popover instead.
- **Don't:** Use tooltips for essential information that users must see to complete a task.

## Components

### Tooltip

Component wrapper for tooltip display triggered on hover or focus.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | - | Trigger element(s) that activate the tooltip. |
| `anchorRef` | `RefObject<HTMLElement>` | - | External anchor ref for sibling mode. |
| `content` | `ReactNode` | - | Tooltip content, typically short text. |
| `placement` | `'above' \| 'below' \| 'start' \| 'end'` | `'above'` | Position relative to the anchor element. Logical: start/end resolve against the popover's own inherited direction (RTL mirrors in pure CSS). |
| `alignment` | `'start' \| 'center' \| 'end'` | `'center'` | Alignment along the placement axis. Logical: start/end resolve against the popover's own inherited direction (RTL mirrors in pure CSS). |
| `delay` | `number` | `200` | Show delay in milliseconds. |
| `hideDelay` | `number` | `0` | Hide delay in milliseconds. |
| `focusTrigger` | `'auto' \| 'always' \| 'never'` | `'auto'` | Controls when focus events trigger the tooltip. |
| `touchTrigger` | `'auto' \| 'tap' \| 'none'` | `'auto'` | What a tap does where there is no hover. auto opens on tap unless the trigger performs an action of its own (a button, link, or form control), whose tap belongs to the control. tap always opens; use it for an info icon rendered as a button, whose only job is to reveal the tooltip. none never opens on touch. |
| `isEnabled` | `boolean` | `true` | Enables or disables the tooltip triggers. |
| `onOpenChange` | `(isOpen: boolean) => void` | - | Callback fired when tooltip visibility changes. Called with true when shown and false when hidden. |
| `hasHoverIndication` | `'auto' \| boolean` | `'auto'` | Shows a dashed underline on the trigger element. |
| `isDefaultOpen` | `boolean` | - | Whether the tooltip should be shown on mount. Still dismissible. |
| `isOpen` | `boolean` | - | Controlled open state for the tooltip. |

## Theming

| Component class | Preferred data attributes | Props | States |
|-----------------|---------------------------|-------|--------|
| `astryx-tooltip` | - | - | - |

Override in defineTheme:
```ts
components: {
  'tooltip': {
    base: { /* CSS properties */ },
  },
}
```


package: @astryxdesign/core

# HoverCard

HoverCard shows additional information when the user hovers or focuses a trigger element. Use it for profile cards, link summaries, or inline definitions where the user needs more context without navigating away.

**Import:** `import {HoverCard} from '@astryxdesign/core/HoverCard';`

## Anatomy

| Element | Required | Description |
|---------|----------|-------------|
| Trigger | Yes | The element that opens the hover card on hover or focus: a button, link, or inline text. |
| Card | Yes | The floating overlay with the preview content, anchored to the trigger. |
| Body | Yes | The main content area: profile info, link summary, or any rich content. |
| Actions | No | Optional buttons inside the card for follow-up actions like Follow or Message. |

## Best Practices

- **Do:** Keep content supplementary; hover cards should enhance understanding without blocking the primary workflow.
- **Do:** Provide a dashed underline on text triggers so users know the element is hoverable.
- **Do:** Use the hook API (useHoverCard) when you need more control over timing or placement.
- **Do:** Leave touchTrigger on auto so a tap opens the card on triggers that do nothing else, and stays out of the way on triggers that perform an action.
- **Don't:** Place critical actions or required information inside a hover card; users may miss content that only appears on hover.
- **Don't:** Use a hover card when a simple Tooltip or Popover would suffice.
- **Don't:** Use a HoverCard for content the user must interact with; it disappears when the cursor leaves.
- **Do:** Prefer placing HoverCard in a block context rather than directly in a <p>, heading, or link. Those placements are supported when necessary through a corrective portal, but the DOM and tab order may differ.

## Components

### HoverCard

Component wrapper for hover card display: a richer, larger overlay triggered on hover or focus.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | - | Trigger element that must accept a ref. |
| `content` | `ReactNode` | - | Hover card content. **(required)** |
| `placement` | `'above' \| 'below' \| 'start' \| 'end'` | `'above'` | Position relative to the anchor element. Logical: start/end resolve against the popover's own inherited direction (RTL mirrors in pure CSS). |
| `alignment` | `'start' \| 'center' \| 'end'` | `'center'` | Alignment along the placement axis. Logical: start/end resolve against the popover's own inherited direction (RTL mirrors in pure CSS). |
| `delay` | `number` | `300` | Show delay in milliseconds. |
| `hideDelay` | `number` | `200` | Hide delay in milliseconds. |
| `focusTrigger` | `'auto' \| 'always' \| 'never'` | `'auto'` | Controls when focus events trigger the hover card. |
| `touchTrigger` | `'auto' \| 'tap' \| 'none'` | `'auto'` | What a tap does where there is no hover. auto opens on tap unless the trigger performs an action of its own (a button, link, or form control), whose tap belongs to the control. tap always opens. none never opens on touch. A tap-opened card is dismissed by a tap outside it. |
| `isEnabled` | `boolean` | `true` | Enables or disables the hover and focus triggers. |
| `label` | `string` | - | Accessible name for the hover card popup. When provided, the popup is exposed as a named role="dialog"; when omitted, it falls back to role="group" (a group may validly be unnamed). |
| `onOpenChange` | `(isOpen: boolean) => void` | - | Callback fired when hover card visibility changes. Called with true when shown and false when hidden. |
| `hasHoverIndication` | `'auto' \| boolean` | `'auto'` | Shows a dashed underline on the trigger element. |
| `isDefaultOpen` | `boolean` | - | Whether the hover card should be shown on mount. Still dismissible. |
| `isOpen` | `boolean` | - | Controlled open state for the hover card. |

## Theming

| Component class | Preferred data attributes | Props | States |
|-----------------|---------------------------|-------|--------|
| `astryx-hover-card` | - | - | - |

Override in defineTheme:
```ts
components: {
  'hover-card': {
    base: { /* CSS properties */ },
  },
}
```

Some properties are set via standard CSS in component overrides:
```ts
components: {
  hover-card: {
    base: {
      borderRadius: '...',
    },
  },
}
```


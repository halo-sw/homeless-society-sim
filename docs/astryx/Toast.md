package: @astryxdesign/core

# Toast

Toast shows a brief, non-blocking notification to confirm an action or present temporary information. Use it for scenarios where the user needs feedback but not a decision, such as saving, deleting, or changing a status.

For production use, prefer the `useToast()` hook; it handles positioning, stacking, auto-dismiss, and deduplication via `ToastViewport`. Toasts stay within viewport and safe-area gutters, wrap long message content, and enter, exit, or swipe-dismiss toward their configured top or bottom edge. The vertical swipe uses the same spatial model as placement motion: top Toasts leave upward and bottom Toasts leave downward. Swipe waits for dominant edge-directed intent before cancelling native touch movement and reports the existing manual dismissal reason. Pen is supported as direct-contact input; mouse drag is excluded to avoid conflicting with desktop text selection, where the visible close control remains available. Set `isAutoHide: false` explicitly when an action or message must remain available. The `Toast` component renders the visual toast element inline and is useful for previews, documentation, and static showcases where the viewport lifecycle is not needed.

**Import:** `import {Toast} from '@astryxdesign/core/Toast';`

## Anatomy

| Element | Required | Description |
|---------|----------|-------------|
| Body | Yes | The primary message text describing what happened or what the user should know. |
| End content | No | A trailing action like an Undo button or a link, placed after the body text. |
| Dismiss button | Yes | A close button that lets the user manually dismiss the toast before auto-hide. |

## Best Practices

- **Do:** Keep messages short: only a few words that tell the user what happened, like "Changes saved" or "Message sent".
- **Do:** Add a short undo action in the endContent slot for reversible operations. Set isAutoHide to false when the action must remain available.
- **Do:** Use uniqueID to deduplicate toasts that fire from repeated actions, like clicking a save button multiple times.
- **Do:** Use error type for failures that need attention but not immediate action; it persists until dismissed so the user won't miss it.
- **Don't:** Don't use a toast for critical errors that block the user. Use Banner for persistent, in-context messaging that requires acknowledgment.
- **Don't:** Don't put long or multi-line content in a toast; it disappears after 5 seconds and the user may not finish reading.
- **Don't:** Don't show form validation errors as toasts. Use inline field validation so the user can see exactly which field needs fixing.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `body` | `ReactNode` | - | Primary message content. **(required)** |
| `type` | `'info' \| 'error'` | `'info'` | Toast type controlling background color. Error toasts persist until dismissed. |
| `isAutoHide` | `boolean` | - | Whether the toast auto-dismisses. Defaults to true for info, false for error. |
| `autoHideDuration` | `number` | `5000` | Duration in ms before auto-dismiss. Timed content must satisfy WCAG 2.2.1. |
| `endContent` | `ReactNode` | - | Content rendered at the trailing end (e.g. Undo button, link). Keep action labels short. |
| `uniqueID` | `string` | - | Unique identifier for deduplication. |
| `collisionBehavior` | `'overwrite' \| 'ignore'` | `'overwrite'` | Behavior when a toast with matching uniqueID already exists. |
| `onHide` | `(reason: "auto" \| "manual") => void` | - | Callback fired when the toast is removed. |
| `onDismiss` | `(reason: "auto" \| "manual") => void` | - | Callback fired when the toast is dismissed. **(required)** |
| `renderContent` | `(toast: ToastContentRenderProps) => ReactNode` | - | Replaces the content of this toast's card with your own layout. Astryx keeps the card, its astryx-toast theme target, the live-region role and auto-hide behavior, then hands the renderer the message, endContent, resolved toast settings and a dismiss callback. The custom renderer owns every control in its layout: compose the control you want and call dismiss from it. Astryx does not inject a fallback close into custom content. Per-toast: an app shares one layout by wrapping useToast and passing it on every call, while a toast raised by library code that never passes it renders as an ordinary Astryx toast. The argument is {body, endContent, type, isAutoHide, autoHideDuration, dismiss}, where type is 'info' \| 'error'. |

## Theming

| Component class | Preferred data attributes | Props | States |
|-----------------|---------------------------|-------|--------|
| `astryx-toast` | `data-type` | type | - |

Override in defineTheme:
```ts
components: {
  'toast': {
    base: { /* CSS properties */ },
    'type:value': { /* variant-specific */ },
  },
}
```


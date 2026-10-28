package: @astryxdesign/core

# ProgressBar

A horizontal bar showing the completion progress of a task. Use it for operations where the duration is known, or as an animated indicator when progress can't be calculated. Supports semantic color variants, value labels, and custom formatting.

**Import:** `import {ProgressBar} from '@astryxdesign/core/ProgressBar';`

## Anatomy

| Element | Required | Description |
|---------|----------|-------------|
| Progress bar | Yes | Container arranging the label row and progress track. |
| Label | Yes | Text naming the operation, optionally hidden visually while remaining accessible. |
| Value text | No | Formatted determinate value shown beside the label when requested. |
| Track | Yes | Remaining-progress rail that carries the progressbar semantics. |
| Fill | Yes | Painted segment showing completed progress or indeterminate movement. |
| Mark | No | Labeled target tick positioned on a determinate track. |

## Best Practices

- **Do:** Use a determinate bar when the total amount of work is known, and indeterminate when it's not.
- **Do:** Choose a color variant that matches the context: accent for general progress, success for completion, warning or error for alerts.
- **Do:** Always provide a label, even if hidden; screen readers need it to announce what's loading.
- **Don't:** Place icons or labels inside the bar; compose them alongside it using layout components.
- **Don't:** Use a progress bar for instant actions; it's meant for operations that take noticeable time.
- **Don't:** Use multiple progress bars stacked together for the same operation; use one bar with a value label instead.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | - | accessible label **(required)** |
| `value` | `number` | `0` | Current value (ignored when indeterminate). |
| `max` | `number` | `100` | Maximum value. |
| `isLabelHidden` | `boolean` | `false` | Visually hide the label (remains accessible). |
| `hasValueLabel` | `boolean` | `false` | Show formatted value text (ignored when indeterminate). |
| `formatValueLabel` | `(value: number, max: number) => string` | - | Custom value label formatter; defaults to a percentage string. |
| `variant` | `'accent' \| 'success' \| 'warning' \| 'error' \| 'neutral'` | `'accent'` | Semantic color variant. |
| `isIndeterminate` | `boolean` | `false` | Animated loading indicator for unknown progress. |
| `marks` | `ReadonlyArray<{value: number; label: string}>` | - | Fixed target marks drawn on the track at values in the same 0..max scale as value (e.g. a goal line). They stay visible whether progress is below or past them, and take their color from what they sit on: a mark inside the filled area uses the fill variant's on-color (on-accent, on-warning, on-error, and so on), a mark still out on the bare track uses the primary text color (the secondary one on a disabled bar, which dims everything it draws). Each mark requires a label: it is the mark's accessible name and the text revealed via a tooltip on hover/focus. Ignored when indeterminate. |
| `isDisabled` | `boolean` | `false` | Visually disabled state: grays out the fill and text. Use for canceled or inactive operations. |
| `xstyle` | `StyleXStyles` | - | StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}. |

## Theming

| Component class | Preferred data attributes | Props | States |
|-----------------|---------------------------|-------|--------|
| `astryx-progress-bar` | `data-variant` | accent, success, warning, error, neutral | - |
| `astryx-progress-bar-fill` | `data-variant` | accent, success, warning, error, neutral | - |
| `astryx-progress-bar-track` | - | - | - |
| `astryx-progress-bar-mark` | `data-variant`, `data-placement` | accent, success, warning, error, neutral | - |

Override in defineTheme:
```ts
components: {
  'progress-bar': {
    base: { /* CSS properties */ },
    'variant:value': { /* variant-specific */ },
  },
  'progress-bar-fill': {
    base: { /* CSS properties */ },
  },
}
```

Some properties are set via standard CSS in component overrides:
```ts
components: {
  progress-bar: {
    base: {
      width: '...',
      height: '...',
    },
  },
}
```


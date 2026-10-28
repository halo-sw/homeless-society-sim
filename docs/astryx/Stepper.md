package: @astryxdesign/core

# Stepper

Steppers display progress through a sequence of logical and numbered steps. Use them for multi-step workflows like forms, onboarding flows, or checkout processes where users need to see their position and the steps ahead. Rendered as an ordered list (not a navigation landmark).

**Import:** `import {Stepper} from '@astryxdesign/core/Stepper';`

## Anatomy

| Element | Required | Description |
|---------|----------|-------------|
| Stepper | Yes | The ordered list holding the steps. Owns the orientation and the indicator placement the whole flow is laid out on. |
| Frame | Yes | The layout frame that groups the ordered steps with the optional compact summary shown at narrow widths. |
| Compact summary | No | The optional row a horizontal Stepper adds directly beneath the track once it is too narrow to label every step. horizontalOptions.collapsedVariant chooses a label with Previous/Next controls, the label alone, or no row for a bare progress track. The on-track layout keeps its indicators on the rail instead of repeating the active indicator beside the label. Every step keeps its name in the accessible sequence at any width. |
| Step | Yes | One step in the flow, and the element carrying its status. Wraps the indicator, label, description, and the track segments belonging to it. |
| Progress bar | Yes | A 4px segmented bar per step. Filled for completed and active steps. Advancing one step grows the fill along the track it just covered, so the movement reads as progress rather than a bar changing color. Every other change applies at once: going back, jumping forward by more than one step, mounting mid-flow, and any change at all under prefers-reduced-motion. Where a span is drawn by more than one segment (the on-track layouts split it between two steps, three when a content slot sits between them), the segments run in track order at one constant speed, so the fill reads as a single line growing rather than pieces lighting in turn. |
| Connector | No | The track drawn between indicators in the on-track layouts. Each connector paints an unfilled line and, over it, the accent fill covering the progress made. How many pieces a connector is drawn from is an implementation detail of the layout, not a themeable part; use --step-connector-gap to hold the track off the indicator. |
| Indicator | No | A numbered badge, a check, or any custom icon. Controlled via the indicator prop. |
| Label | Yes | Text identifying the step. |
| Description | No | Supporting text below the label with additional context. |

## Best Practices

- **Do:** Keep step labels short and descriptive: "Payment" not "Enter your payment information".
- **Do:** Use the vertical orientation when steps carry longer descriptions. A horizontal stepper handles narrow containers itself: once the frame gives each step less than horizontalOptions.minimumStepWidth (112px by default) it drops the labels for a segmented track and uses the configured collapsedVariant beneath it.
- **Do:** Set horizontalOptions.collapsedVariant to 'withLabel' when the page already supplies Back/Continue, or to 'hiddenLabel' when surrounding UI owns both the current-step heading and navigation and only a bare progress track is needed.
- **Do:** Provide onStepClick for non-linear workflows where users may need to revisit earlier steps.
- **Do:** Use status only to apply a semantic color (accent/success/warning/error); pass a custom icon for richer indicators.
- **Don't:** Use a stepper for fewer than 3 steps; a simple heading or progress bar works better.
- **Don't:** Use more than 7 steps; consider grouping related steps or using a different pattern.

## Components

### Stepper

Container component that manages step state and renders steps in horizontal or vertical orientation as an ordered list.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `activeStep` | `number` | - | Zero-based index of the currently active step. Steps before this index are marked as completed. **(required)** |
| `children` | `ReactNode` | - | Step elements to render in the stepper. **(required)** |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | Layout direction of the stepper. |
| `onStepClick` | `(index: number) => void` | - | Called when a step is clicked or a compact summary control is used. Enables non-linear navigation. All non-disabled steps become clickable until a horizontal Stepper collapses, when navigation moves to summary controls that skip disabled steps. |
| `label` | `string` | `'Progress' (localized)` | Accessible label describing the set of steps (applied to the ordered list). Defaults to a localized "Progress". |
| `density` | `'compact' \| 'balanced' \| 'spacious'` | `'balanced'` | Controls the padding of all steps. |
| `indicatorPosition` | `'separated' \| 'on-track'` | `'separated'` | Position of step indicators relative to the connector track. |
| `horizontalOptions` | `{ minimumStepWidth: number; collapsedVariant: 'withLabelAndControls' \| 'withLabel' \| 'hiddenLabel' }` | `{ minimumStepWidth: 112, collapsedVariant: 'withLabelAndControls' }` | Options for horizontal collapse. minimumStepWidth is the per-step threshold in pixels. collapsedVariant selects a label with controls, the label alone, or a bare progress track with no compact row. Controls appear only for withLabelAndControls when onStepClick is set, and every step keeps its accessible name. |
| `xstyle` | `StyleXStyles` | - | StyleX styles for layout customization. Must be a stylex.create() value. |

### Step

See `npx astryx component Step` for props and usage.

## Theming

| Component class | Preferred data attributes | Props | States |
|-----------------|---------------------------|-------|--------|
| `astryx-stepper` | `data-orientation`, `data-indicator-position` | orientation, indicatorPosition | - |
| `astryx-stepper-frame` | - | - | - |
| `astryx-stepper-summary` | - | - | - |
| `astryx-step` | `data-progress`, `data-status` | progress, status | - |
| `astryx-step-indicator` | `data-progress`, `data-status` | progress, status | - |
| `astryx-step-label` | `data-progress`, `data-status`, `data-disabled` | progress, status, disabled | - |
| `astryx-step-description` | `data-progress`, `data-status` | progress, status | - |
| `astryx-step-bar` | - | - | - |
| `astryx-step-connector` | - | - | - |

Override in defineTheme:
```ts
components: {
  'stepper': {
    base: { /* CSS properties */ },
    'orientation:value': { /* variant-specific */ },
  },
  'stepper-frame': {
    base: { /* CSS properties */ },
  },
}
```

**Themeable CSS variables** - additional properties that can be overridden in `defineTheme` component overrides.

| CSS Variable | Default | Description |
|-------------|---------|-------------|
| `--step-connector-gap` | `0px` | Gap a connector leaves where it meets the indicator, spent on the side facing it. Applies to the on-track layouts, whose connector is drawn as one segment either side of the node; 0 leaves the track running unbroken through it. |


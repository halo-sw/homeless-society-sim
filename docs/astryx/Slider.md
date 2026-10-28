
Next step: run `npx astryx init` to finish setup and install the Astryx agent prompt.
package: @astryxdesign/core

# Slider

A draggable control for selecting a numeric value or range within defined bounds. Supports single value and range selection, tick marks, custom value formatting, and vertical orientation. Use it when users need to explore a continuous range, such as volume, price, or percentage.

**Import:** `import {Slider} from '@astryxdesign/core/Slider';`

## Anatomy

| Element | Required | Description |
|---------|----------|-------------|
| Label | Yes | Text identifying the numeric setting controlled by the slider. |
| Description | No | Helper text between the label and the slider control. |
| Slider | Yes | Control row containing the track, thumb or thumbs, and optional text value. |
| Interactive control | Yes | Pointer and keyboard interaction surface containing the rail, fill, marks, and thumbs. |
| Track | Yes | Background rail representing the available numeric range. |
| Filled range | Yes | Accent segment from the minimum to a single value, or between two range values. |
| Tick mark | No | Position marker supplied through the marks collection. |
| Mark label | No | Optional text displayed beside a tick mark. |
| Thumb | Yes | Draggable value indicator; range mode renders a minimum and maximum thumb. |
| Value display | No | Formatted current value shown beside the slider when valueDisplay is text. |
| Value tooltip | No | Formatted current value shown in a tooltip when valueDisplay is tooltip. |
| Status message | No | Error, warning, or success message below the slider. |

## Best Practices

- **Do:** Always provide a label, even if visually hidden, so the slider is accessible to screen readers.
- **Do:** Format values with meaningful units like "$50" or "75%" instead of raw numbers.
- **Don't:** Use for precise numeric entry; pair with a text input or use NumberInput instead.
- **Don't:** Set a step size so large that only a few positions are possible; use SegmentedControl or radio buttons instead.
- **Don't:** Wrap a disabled slider in Tooltip to explain why it is disabled; disabled controls swallow the hover events the wrapper needs. Use the disabledMessage prop instead.

## Accessibility

- **Thumb:** The thumb must have at least 3:1 contrast with the track and the surface behind it. Pointer down is the whole drag: measure the thumb with the pressed overlay applied.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | - | Label text (always rendered for accessibility). **(required)** |
| `value` | `number \| [number, number]` | - | Current value: a `number` for single thumb mode or `[number, number]` for range mode. **(required)** |
| `onChange` | `(value: number) => void \| (value: [number, number]) => void` | - | Callback fired on value change during drag. |
| `onChangeEnd` | `(value: number) => void \| (value: [number, number]) => void` | - | Callback fired when drag ends. |
| `min` | `number` | `0` | Minimum value. |
| `max` | `number` | `100` | Maximum value. |
| `step` | `number` | `1` | Step increment. |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | Orientation of the slider. |
| `formatValue` | `(value: number) => string` | - | Custom value formatting function used for display and `aria-valuetext`. |
| `valueDisplay` | `'tooltip' \| 'text' \| 'none'` | `'tooltip'` | How the current value is displayed. |
| `marks` | `Array<{ value: number; label?: string }>` | - | Tick marks at specified positions with optional labels. Unfilled marks use the track color; marks inside the filled region (at or behind the thumb, or between the thumbs in range mode) use the fill color. |
| `minStepsBetweenThumbs` | `number` | `0` | Minimum number of steps between thumbs in range mode; prevents thumbs from overlapping. |
| `isDisabled` | `boolean` | `false` | Whether the slider is disabled. |
| `htmlName` | `string` | - | The HTML name attribute for form submissions. Renders hidden inputs carrying the current value (two entries in range mode). |
| `disabledMessage` | `string` | - | Explains why the slider is disabled. With isDisabled, shows a tooltip on hover/keyboard focus and keeps the thumb focusable via aria-disabled (value changes stay blocked). Use this instead of wrapping a disabled Slider in Tooltip. Disabled controls swallow the hover events an external Tooltip needs. |
| `isOptional` | `boolean` | `false` | Whether the field is optional. |
| `isRequired` | `boolean` | `false` | Whether the field is required. |
| `isLabelHidden` | `boolean` | `false` | Whether to visually hide the label. |
| `description` | `string` | - | Description text rendered below the label. |
| `status` | `{type: 'warning' \| 'error' \| 'success', message?: string}` | - | Status indicator object (`{ type, message }`) for validation feedback. |
| `labelTooltip` | `string` | - | Tooltip text for an info icon displayed next to the label. |
| `width` | `SizeValue` | - | Width of the field (number = pixels, string used as-is, e.g. "100%"). Sizes the whole field (label, control, and status) so they stay aligned. |
| `containerXstyle` | `StyleXStyles` | - | StyleX styles for the field container (label, control, and status together). No effect inside InputGroup (style the InputGroup instead) or in a `horizontal-labels` FormLayout. Root `xstyle`, `className`, and `style` are not accepted. |
| `containerClassName` | `string` | - | Class name for the field container. Same targeting as `containerXstyle`. |
| `containerStyle` | `CSSProperties` | - | Inline styles for the field container. Same targeting as `containerXstyle`. |
| `controlXstyle` | `StyleXStyles` | - | StyleX styles for the visual control box: the element that paints the border and background and holds icons and end controls. Never the native input. |
| `controlClassName` | `string` | - | Class name for the visual control box. |
| `controlStyle` | `CSSProperties` | - | Inline styles for the visual control box. |

## Theming

| Component class | Preferred data attributes | Props | States |
|-----------------|---------------------------|-------|--------|
| `astryx-slider` | `data-orientation`, `data-disabled` | orientation | disabled |
| `astryx-slider-control` | `data-orientation`, `data-disabled` | orientation | disabled |
| `astryx-slider-track` | `data-orientation` | orientation | - |
| `astryx-slider-thumb` | `data-orientation`, `data-disabled` | orientation | disabled |

Override in defineTheme:
```ts
components: {
  'slider': {
    base: { /* CSS properties */ },
    'orientation:value': { /* variant-specific */ },
    'disabled': { /* state-specific */ },
  },
  'slider-control': {
    base: { /* CSS properties */ },
    'disabled': { /* state-specific */ },
  },
}
```


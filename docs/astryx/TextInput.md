
Next step: run `npx astryx init` to finish setup and install the Astryx agent prompt.
package: @astryxdesign/core

# TextInput

TextInput collects short-form text like names, emails, or search queries. Use it for single-line values where the expected input is brief. Pair it with validation status to guide users through required or formatted fields.

**Import:** `import {TextInput} from '@astryxdesign/core/TextInput';`

## Anatomy

| Element | Required | Description |
|---------|----------|-------------|
| Label | Yes | Text that identifies the field. Always rendered for accessibility even when visually hidden. |
| Description | No | Helper text between the label and the input that provides additional context or formatting hints. |
| Start icon | No | A leading icon inside the input that hints at the expected content, like a magnifying glass for search. |
| Placeholder | No | Hint text shown when the input is empty. Disappears on focus. |
| Clear button | No | A trailing × button that resets the value and returns focus to the input. |
| Spinner | No | Loading indicator that appears during async actions like server-side validation. |
| Status icon | No | A trailing icon (error, warning, or success) that communicates validation state. |

## Best Practices

- **Do:** Always provide a visible label so users know what the field is for. Only hide the label when surrounding context makes it obvious, like a search bar with a magnifying-glass icon.
- **Do:** Use validation status with a message to explain what went wrong: "Email must include @" is better than just turning the border red.
- **Do:** Size the input to match the expected content length so users can gauge how much to type: small for zip codes, medium for names, large for URLs.
- **Do:** Add a clear button for search and filter inputs so users can quickly reset without selecting all text.
- **Don't:** Don't use placeholder text as a replacement for a label; placeholders disappear on focus and are not reliably read by screen readers.
- **Don't:** Don't use TextInput for multi-line content like comments or descriptions; use TextArea instead.
- **Don't:** Don't mark every field as required; only flag mandatory fields so users are not overwhelmed by validation errors.
- **Don't:** Don't wrap a disabled TextInput in Tooltip to explain why it's disabled; disabled controls swallow the hover events the wrapper needs. Use the disabledMessage prop instead.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `type` | `'text' \| 'password' \| 'email'` | `'text'` | The HTML input type. |
| `label` | `string` | - | Label text for the input: always rendered for accessibility. **(required)** |
| `value` | `string` | - | Current value of the input. **(required)** |
| `onChange` | `(value: string, e: ChangeEvent<HTMLInputElement>) => void` | - | Callback fired when the input value changes. |
| `changeAction` | `(value: string, e: ChangeEvent<HTMLInputElement>) => void \| Promise<void>` | - | Async action fired after onChange (if not prevented). Triggers optimistic update and shows a loading spinner while pending. |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Size variant of the input. |
| `isLabelHidden` | `boolean` | `false` | Visually hides the label while keeping it accessible to screen readers. |
| `description` | `string` | - | Description text displayed between the label and input. |
| `isOptional` | `boolean` | `false` | Displays an "Optional" indicator next to the label. Mutually exclusive with isRequired. |
| `isRequired` | `boolean` | `false` | Displays a "Required" indicator next to the label and sets aria-required. Mutually exclusive with isOptional. |
| `onEnter` | `() => void` | - | Callback fired when the user presses the Enter key. IME-safe: Enter used to commit a Japanese/Chinese/Korean conversion does not fire it. |
| `onKeyDown` | `(e: KeyboardEvent<HTMLInputElement>) => void` | - | Callback fired on keydown events on the input. |
| `isDisabled` | `boolean` | `false` | Disables the input, preventing interaction and dimming the element. |
| `isReadOnly` | `boolean` | `false` | Makes the input read-only: the value is shown at full opacity and still submits with the form, but cannot be edited. Unlike isDisabled, a read-only input is not dimmed and stays in the tab order. isDisabled takes precedence when both are set. |
| `disabledMessage` | `string` | - | Explains why the input is disabled. With isDisabled, shows a tooltip on hover/keyboard focus and keeps the input focusable via aria-disabled (the field becomes read-only). Use this instead of wrapping a disabled TextInput in Tooltip. Disabled controls swallow the hover events an external Tooltip needs. |
| `isLoading` | `boolean` | `false` | Puts the input in a loading state, showing a spinner and setting aria-busy. |
| `placeholder` | `string` | - | Placeholder text shown when the input is empty. |
| `labelTooltip` | `string` | - | Tooltip text displayed in an info icon at the end of the label. |
| `startIcon` | `IconType` | - | SVG icon component displayed at the start of the input. See `astryx docs icons` for valid semantic names. |
| `status` | `{type: 'error' \| 'warning' \| 'success', message?: string}` | - | Validation status: applies a colored border and status icon. If message is provided, displays a floating message below the input. Error type also sets aria-invalid. |
| `statusVariant` | `'attached' \| 'detached' \| 'tooltip'` | `'attached'` | How the status message is placed relative to the input. attached overlaps directly below the input (bordered treatment); detached floats below as a separate element with spacing; tooltip hides the message box and surfaces it in a tooltip on the status icon. |
| `hasClear` | `boolean` | `false` | Shows a clear (×) button when the input has a value. Clicking it clears the value and returns focus to the input. |
| `hasAutoFocus` | `boolean` | `false` | Automatically focuses the input on mount. |
| `htmlName` | `string` | - | The HTML name attribute for the input, useful for form submissions. |
| `width` | `SizeValue` | - | Width of the field (number = pixels, string used as-is, e.g. "100%"). Sizes the whole field (label, control, and status) so they stay aligned. Without a width the field can shrink with its row, so a filter bar never overflows; use `<HStack wrap="wrap">` when the controls should move to a second line instead. |
| `autoComplete` | `string` | - | The native autocomplete attribute, forwarded to the input unchanged. Does not affect the controlled value. |
| `containerXstyle` | `StyleXStyles` | - | StyleX styles for the field container (label, control, and status together). No effect inside InputGroup (style the InputGroup instead) or in a `horizontal-labels` FormLayout. Root `xstyle`, `className`, and `style` are not accepted. |
| `containerClassName` | `string` | - | Class name for the field container. Same targeting as `containerXstyle`. |
| `containerStyle` | `CSSProperties` | - | Inline styles for the field container. Same targeting as `containerXstyle`. |
| `controlXstyle` | `StyleXStyles` | - | StyleX styles for the visual control box: the element that paints the border and background and holds icons and end controls. Never the native input. |
| `controlClassName` | `string` | - | Class name for the visual control box. |
| `controlStyle` | `CSSProperties` | - | Inline styles for the visual control box. |

## Theming

| Component class | Preferred data attributes | Props | States |
|-----------------|---------------------------|-------|--------|
| `astryx-text-input` | `data-size`, `data-status`, `data-disabled`, `data-readonly` | size, status | disabled, readonly |

Override in defineTheme:
```ts
components: {
  'text-input': {
    base: { /* CSS properties */ },
    'size:value': { /* variant-specific */ },
    'disabled': { /* state-specific */ },
  },
}
```


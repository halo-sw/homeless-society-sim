
Next step: run `npx astryx init` to finish setup and install the Astryx agent prompt.
package: @astryxdesign/core

# Button

Button triggers an action when clicked. Use it for form submissions, confirmations, navigation, or any interaction that needs a clear call to action.

**Import:** `import {Button} from '@astryxdesign/core/Button';`

## Anatomy

| Element | Required | Description |
|---------|----------|-------------|
| Icon | No | A leading icon that reinforces the label, like a trash icon on a Delete button. |
| Label | Yes | The visible text describing the action. Also used as the accessible name. |
| End content | No | A trailing badge or icon after the label, like a notification count or dropdown arrow. |
| Spinner | No | Replaces the icon during loading to show the action is in progress. |

## Best Practices

- **Do:** Reserve primary for the single most important action in the view. Use secondary or ghost for everything else based on emphasis.
- **Do:** Write labels that describe the action ("Save changes", "Delete account", "Send invite"), not vague labels like "OK" or "Click here".
- **Do:** Show a loading state for actions that take time, like saving or submitting, so the user knows it is working.
- **Do:** Always provide a label for icon-only buttons so screen readers can announce what the button does. Add a tooltip for sighted users.
- **Do:** For a dedicated icon-only button, use IconButton from '@astryxdesign/core/IconButton'. It is a separate component, not exported from '@astryxdesign/core/Button'.
- **Don't:** Place more than one primary button in the same view; this dilutes the visual hierarchy.
- **Don't:** Use the destructive variant without a confirmation step for irreversible actions like deleting data.
- **Don't:** Use a button for navigation. If it only takes the user to another page, use a link instead. Buttons are for actions like saving, deleting, or submitting.

## Accessibility

- **Text label:** Button text must have at least 4.5:1 contrast with the button background in every state. For Hover and Pointer down, measure the final background after the overlay is applied.
- **Essential icon or spinner arc:** An icon used instead of text must have at least 3:1 contrast with the button background. The moving spinner arc must also meet 3:1. An icon beside a visible label does not need its own check.
- **Badge text:** Badge text inside a button must have at least 4.5:1 contrast with the Badge background. Check all 14 built-in Badge colors in Rest, Hover, and Pointer down on page and surface backgrounds. This covers 336 pairs per mode. Check custom end content separately.
- **Visible control boundary:** The button edge needs 3:1 contrast only when users need it to see the control. A text-only button can rely on its label.
- **Keyboard focus indicator:** The focus outline needs at least 3:1 contrast with the area around the button. Check every style. Destructive buttons use a red outline.
- **Disabled appearance:** Disabled controls do not need to meet these contrast ratios.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `label` | `string` | - | Accessible label. Rendered as visible text by default; used as aria-label when isIconOnly is true. **(required)** |
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'destructive'` | `'secondary'` | Visual style variant. |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Size variant. |
| `elevation` | `'none' \| 'low' \| 'med' \| 'high'` | `'none'` | Resting shadow depth for floating buttons (e.g. a FAB). `none` is the default flat button; `low`/`med`/`high` map to the shadow token scale. Ignored inside a ButtonGroup, where elevation is owned by the group. |
| `type` | `'button' \| 'submit' \| 'reset'` | `'button'` | HTML button type attribute. |
| `name` | `string` | - | HTML name attribute for form submission. |
| `value` | `string \| number \| readonly string[]` | - | HTML value attribute for form submission. |
| `form` | `string` | - | Associates the button with a form element by ID. |
| `isLoading` | `boolean` | `false` | Shows a loading spinner and blocks re-activation while staying focusable (aria-busy + aria-disabled, not native disabled, so keyboard focus is never dropped mid-action). Announces "Loading" via a live region. |
| `isInterruptible` | `boolean` | `false` | Keep the button clickable while a clickAction is pending: the spinner and aria-busy still show, but the button is not disabled and the action is not deduped, so a re-click lands and interrupts the in-flight action with a fresh one. |
| `isDisabled` | `boolean` | `false` | Disables the button. When a tooltip is present, uses aria-disabled instead of native disabled so the button stays focusable. |
| `icon` | `ReactNode` | - | Icon element rendered before the label text. An Astryx Icon with no explicit size defaults to sm for sm/md buttons and md for lg buttons. |
| `isIconOnly` | `boolean` | `false` | When true, renders as a square icon-only button with label as aria-label. Requires icon. Tip: for a dedicated icon-only button component, use IconButton from '@astryxdesign/core/IconButton' instead. |
| `width` | `SizeValue` | - | Width of the button. Numbers are treated as pixels, strings are used as-is (e.g., '100%' for a full-width button). By default the button sizes to its content, never grows past its container, and truncates its label with an ellipsis when a row is too narrow; icon-only buttons stay square. |
| `children` | `ReactNode` | - | Optional override for visible text. When provided, displayed instead of label, but label is still required (it provides the accessible name). For most cases, just use label alone: <Button label="Save" />. |
| `endContent` | `ReactElement<IconProps> \| ReactElement<BadgeProps>` | - | Trailing icon or badge rendered after the label. Ignored when isIconOnly is true. Color is inherited from the button variant. |
| `tooltip` | `string` | - | Tooltip text shown on hover. |
| `onClick` | `(e: MouseEvent) => void` | - | Standard click handler (passed through from ButtonHTMLAttributes). |
| `clickAction` | `(e: MouseEvent) => void \| Promise<void>` | - | Async click handler. Shows loading state while the returned promise is pending. |
| `href` | `string` | - | When provided, renders the button as a link element (<a> or custom link component). The destination follows the shared navigation rule described on the Link `href` prop. |
| `as` | `ComponentType` | - | Custom link component to use when href is provided (e.g. Next.js Link). |
| `target` | `string` | - | HTML target attribute when rendered as a link (e.g. "_blank"). |
| `rel` | `string` | - | HTML rel attribute when rendered as a link (e.g. "noopener noreferrer"). |

## Examples

### Actions in narrow rows

```tsx

import {useState} from 'react';
import {Button} from '@astryxdesign/core/Button';
import {Card} from '@astryxdesign/core/Card';
import {Heading} from '@astryxdesign/core/Heading';
import {HStack} from '@astryxdesign/core/HStack';
import {Icon} from '@astryxdesign/core/Icon';
import {IconButton} from '@astryxdesign/core/IconButton';
import {StackItem} from '@astryxdesign/core/Stack';
import {TextInput} from '@astryxdesign/core/TextInput';
import {VStack} from '@astryxdesign/core/VStack';

// On a phone (or any card narrower than its actions), a labelled Button
// shrinks with its row and truncates its label with an ellipsis instead of
// overflowing or being clipped by the card. The full label stays the
// accessible name. Icon-only buttons keep their square size.
function ReviewersCard() {
  const [emails, setEmails] = useState('');
  return (
    <Card maxWidth={560}>
      <VStack gap={4}>
        <HStack gap={2} vAlign="center">
          <StackItem size="fill">
            <Heading level={3} maxLines={1}>
              Design review
            </Heading>
          </StackItem>
          <Button label="Request review from the design team" size="sm" />
          <IconButton
            label="More review options"
            icon={<Icon icon="moreHorizontal" />}
            variant="ghost"
            size="sm"
          />
        </HStack>
        <TextInput
          label="Reviewer emails"
          placeholder="name@example.com"
          value={emails}
          onChange={setEmails}
        />
        {/* In a 320px form footer the long primary action truncates.
            StackItem size="static" keeps the short Cancel label whole. */}
        <HStack gap={2} hAlign="end">
          <StackItem size="static">
            <Button label="Cancel" variant="secondary" />
          </StackItem>
          <Button label="Send invitations to all 12 reviewers" variant="primary" />
        </HStack>
      </VStack>
    </Card>
  );
}

```

## Theming

| Component class | Preferred data attributes | Props | States |
|-----------------|---------------------------|-------|--------|
| `astryx-button` | `data-size`, `data-variant`, `data-elevation` | primary, secondary, ghost, destructive | - |

Override in defineTheme:
```ts
components: {
  'button': {
    base: { /* CSS properties */ },
    'size:value': { /* variant-specific */ },
  },
}
```

**Themeable CSS variables** - additional properties that can be overridden in `defineTheme` component overrides.

| CSS Variable | Default | Description |
|-------------|---------|-------------|
| `--button-focus-offset` | `var(--focus-outline-offset)` | Focus ring outline offset |
| `--button-icon-only-aspect` | `1 / 1` | Aspect ratio for icon-only buttons |

Some properties are set via standard CSS in component overrides:
```ts
components: {
  button: {
    base: {
      borderRadius: '...',
    },
  },
}
```


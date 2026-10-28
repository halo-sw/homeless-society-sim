
Next step: run `npx astryx init` to finish setup and install the Astryx agent prompt.
package: @astryxdesign/core

# Banner

Banner shows a persistent message at the top of a page or section. Use it for form errors, system updates, maintenance notices, or success confirmations that the user needs to see until they act on it.

**Import:** `import {Banner} from '@astryxdesign/core/Banner';`

## Anatomy

| Element | Required | Description |
|---------|----------|-------------|
| Banner frame | Yes | Outer frame that groups the status surface and optional content surface. It carries whole-banner elevation and, for elevated card banners, the radius that shapes that silhouette. |
| Status surface | Yes | The primary painted surface. It communicates status and contains the icon, title, description, actions, and controls. |
| Icon | Yes | Automatically set based on the status (info, warning, error, success). |
| Title | Yes | The main message. Always required. |
| Description | No | Additional detail below the title. |
| Action button | No | A button for the user to act on the message, like "Review" or "Retry". |
| Dismiss button | No | Lets the user close the banner. Enabled by setting isDismissable. |
| Content surface | No | Secondary surface for extra detail below the status surface, like a list of errors. Sits behind an expand/collapse toggle by default; set collapsible={false} to keep it visible. |

## Best Practices

- **Do:** Pick a status that matches the message: info for updates, warning for caution, error for problems, success for confirmations.
- **Do:** Use the card container inside page content and the section container for full-width messages that span the entire page.
- **Do:** Make info and success banners dismissable. Keep error banners visible until the user fixes the issue.
- **Do:** Keep titles short and scannable: "Payment failed" not "There was a problem processing your most recent payment."
- **Don't:** Use Banner for short-lived messages that disappear on their own; use Toast instead.
- **Don't:** Stack multiple banners with the same status; combine related messages into one banner.
- **Do:** Set collapsible={false} when the user needs the content to act on the message, like the list of fields that failed validation. Keep the default toggle when the detail is long enough to bury the banner's own message.
- **Do:** Banner status controls color and icon only; it does not create a live region. Announce async outcomes from the transition handler with useAnnounce. Add an explicit role="status" only when the visible banner is intended as a persistent semantic mirror; reserve role="alert" for genuinely urgent, interruptive content.
- **Don't:** Rely on the status color or icon alone to carry meaning; say which status it is in the title text, because the icon is decorative to a screen reader.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `status` | `'info' \| 'warning' \| 'error' \| 'success'` | - | Status type controlling icon and color. **(required)** |
| `title` | `ReactNode` | - | Title text or ReactNode displayed in the header. **(required)** |
| `description` | `ReactNode` | - | Description text rendered below the title in the header. |
| `icon` | `ReactNode` | - | Override the default status icon. |
| `isDismissable` | `boolean` | `false` | Whether the banner can be dismissed by the user. |
| `onDismiss` | `() => void` | - | Called when the dismiss button is clicked; banner hides itself regardless of whether this is provided. |
| `dismissLabel` | `string` | - | Accessible name and visible tooltip for the dismiss button (pass it already translated). Defaults to "Dismiss <title>" for a string title, so stacked banners are distinguishable; set it when the title is a ReactNode. |
| `endContent` | `ReactNode` | - | Action content rendered in the header area, end-aligned. Wraps to its own row below the text when the header is too narrow to hold both. |
| `container` | `'card' \| 'section'` | `'card'` | Container type: card has border-radius; section is full-width with no border-radius for page-level use. |
| `elevation` | `'none' \| 'low' \| 'med' \| 'high'` | `'none'` | Resting shadow depth. Use for a floating banner that hovers above content; `none` is the default inline banner. A `card`-container banner rounds its shadow to match. |
| `children` | `ReactNode` | - | Content rendered in the card-background area below the colored header. Sits behind an expand/collapse toggle unless `collapsible={false}`. |
| `collapsible` | `boolean \| {defaultIsOpen?: boolean; isOpen?: boolean; onOpenChange?: (isOpen: boolean) => void}` | `true` | Whether the content area (children) sits behind an expand/collapse toggle in the header. On by default, starting collapsed. `false` opts out: children are always visible with no toggle. `{defaultIsOpen: true}` starts open; `{isOpen, onOpenChange}` is controlled. Takes the same CollapsibleConfig as Collapsible. |
| `xstyle` | `StyleXStyles` | - | StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}. |

## Examples

### Announce an async outcome from its transition handler

```tsx
import {useState} from 'react';
import {Banner} from '@astryxdesign/core/Banner';
import {Button} from '@astryxdesign/core/Button';
import {useAnnounce} from '@astryxdesign/core/hooks';

function SaveSettings() {
  const announce = useAnnounce();
  const [result, setResult] = useState<'success' | 'error' | null>(null);

  async function handleSave() {
    try {
      await saveSettings();
      setResult('success');
      announce('Settings saved');
    } catch {
      setResult('error');
      announce('Settings could not be saved');
    }
  }

  return (
    <>
      <Button label="Save settings" onClick={handleSave} />
      {result != null ? (
        <Banner
          status={result}
          title={result === 'success' ? 'Settings saved' : 'Save failed'}
        />
      ) : null}
    </>
  );
}
```

## Theming

| Component class | Preferred data attributes | Props | States |
|-----------------|---------------------------|-------|--------|
| `astryx-banner-frame` | `data-container`, `data-elevation` | container, elevation | - |
| `astryx-banner` | `data-container`, `data-status` | container, status | - |
| `astryx-banner-icon` | `data-status` | status | - |
| `astryx-banner-description` | - | - | - |
| `astryx-banner-content` | `data-container`, `data-status` | container, status | - |

Override in defineTheme:
```ts
components: {
  'banner-frame': {
    base: { /* CSS properties */ },
    'container:value': { /* variant-specific */ },
  },
  'banner': {
    base: { /* CSS properties */ },
  },
}
```

Some properties are set via standard CSS in component overrides:
```ts
components: {
  banner-frame: {
    base: {
      borderRadius: '...',
    },
  },
}
```


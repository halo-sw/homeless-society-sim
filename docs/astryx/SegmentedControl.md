
Next step: run `npx astryx init` to finish setup and install the Astryx agent prompt.
package: @astryxdesign/core

# SegmentedControl

A segmented button group that allows users to make a single selection from a small set of mutually exclusive options. Use SegmentedControl when all options should be visible at once and the selection controls a value or mode, not page navigation.

**Import:** `import {SegmentedControl} from '@astryxdesign/core/SegmentedControl';`

## Anatomy

| Element | Required | Description |
|---------|----------|-------------|
| Control | Yes | Container for the mutually exclusive segment choices. |
| Segment | Yes | Individual choice within the control. |
| Label | No | Visible text identifying a segment when its label is not hidden. |
| Icon | No | Optional caller-supplied icon shown inside a segment. |

## Best Practices

- **Do:** Use for switching between 2–5 mutually exclusive views or modes where all options should be visible.
- **Do:** Provide a descriptive label for the control to ensure the group is accessible to screen readers.
- **Don't:** Use for page-level navigation; use TabList instead. TabList is a navigation component, while SegmentedControl is an input that always has exactly one selected option.
- **Don't:** Use for simple on/off states; use ToggleButton instead. ToggleButton can be toggled on or off independently, while SegmentedControl enforces a single selection from a group.
- **Don't:** Wrap a disabled SegmentedControl in Tooltip to explain why it is disabled; disabled controls swallow the hover events the wrapper needs. Use the disabledMessage prop instead.

## Accessibility

- **Text label:** Each label must have at least 4.5:1 contrast with its segment background. Check unselected, Hover, Pointer down, and selected colors as they appear on screen. For Hover and Pointer down, measure the final background after the overlay is applied.
- **Essential icon:** When a segment has no visible label, its icon must have at least 3:1 contrast with the segment background. An icon beside a visible label does not need its own check.
- **Selected state indicator:** The selected background must reach 3:1 only when users need it to tell selected from unselected. Label color and weight also show selection.
- **Visible control boundary:** The control edge or segment borders need at least 3:1 contrast when users need them to see the choices.
- **Keyboard focus indicator:** The focus outline must have at least 3:1 contrast with the area around the segment. Check it on the track and selected background.
- **Disabled appearance:** Disabled controls do not need to meet these contrast ratios.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string` | - | The currently selected value (controlled). **(required)** |
| `onChange` | `(value: string) => void` | - | Callback fired when a segment is selected. **(required)** |
| `label` | `string` | - | Accessible label for the radio group (used as aria-label, never rendered visually). **(required)** |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Size variant for the control. |
| `layout` | `'hug' \| 'fill'` | `'hug'` | Layout mode. hug (default) sizes segments to content, capped at the container width (segment labels truncate when it is too narrow); fill stretches them equally to fill the container. |
| `isDisabled` | `boolean` | `false` | Whether the entire control is disabled. |
| `disabledMessage` | `string` | - | Explains why the control is disabled. Applies to the whole-group disabled state (isDisabled), not per segment. With isDisabled, shows a tooltip on hover/keyboard focus and keeps the control focusable via aria-disabled (selection stays blocked). Use this instead of wrapping a disabled SegmentedControl in Tooltip. Disabled controls swallow the hover events an external Tooltip needs. |
| `children` | `ReactNode` | - | SegmentedControlItem children. **(required)** |
| `xstyle` | `StyleXStyles` | - | StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value: not an inline style object like style={{}}. |

## Components

### SegmentedControlItem

See `npx astryx component SegmentedControlItem` for props and usage.

## Examples

### In a narrow card

```tsx

import {useState} from 'react';
import {Card} from '@astryxdesign/core/Card';
import {Heading} from '@astryxdesign/core/Heading';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {Text} from '@astryxdesign/core/Text';
import {VStack} from '@astryxdesign/core/VStack';

const SUMMARY = {
  overview: '4 projects, 2 due this week.',
  activity: '18 updates since Monday.',
  members: '12 members, 3 pending invites.',
  billing: 'Next invoice on October 1.',
};

// Inside a VStack the default hug layout keeps its content width; it does not
// stretch to the card. When the card is narrower than the control (a 320px
// phone column), the control caps at the card width and each label truncates
// with an ellipsis instead of running past the card edge. The full label stays
// each segment's accessible name. Keep labels short for phone widths.
function WorkspaceCard() {
  const [view, setView] = useState('overview');
  return (
    <Card maxWidth={480}>
      <VStack gap={3}>
        <Heading level={3}>Team workspace</Heading>
        <SegmentedControl label="Workspace view" value={view} onChange={setView}>
          <SegmentedControlItem value="overview" label="Overview" />
          <SegmentedControlItem value="activity" label="Activity" />
          <SegmentedControlItem value="members" label="Members" />
          <SegmentedControlItem value="billing" label="Billing" />
        </SegmentedControl>
        <Text color="secondary">{SUMMARY[view]}</Text>
      </VStack>
    </Card>
  );
}

```

## Theming

| Component class | Preferred data attributes | Props | States |
|-----------------|---------------------------|-------|--------|
| `astryx-segmented-control` | `data-size` | size | - |
| `astryx-segmented-control-item` | `data-size`, `data-selected`, `data-disabled` | size | selected, disabled |

Override in defineTheme:
```ts
components: {
  'segmented-control': {
    base: { /* CSS properties */ },
    'size:value': { /* variant-specific */ },
  },
  'segmented-control-item': {
    base: { /* CSS properties */ },
    'selected': { /* state-specific */ },
  },
}
```

Some properties are set via standard CSS in component overrides:
```ts
components: {
  segmented-control: {
    base: {
      borderRadius: '...',
      padding: '...',
    },
  },
}
```


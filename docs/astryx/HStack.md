
Next step: run `npx astryx init` to finish setup and install the Astryx agent prompt.
package: @astryxdesign/core

parentDoc: Stack

# HStack

Stack arranges items in a row or column with consistent spacing. Use the gap prop to control the space between items.

**Import:** `import {HStack} from '@astryxdesign/core/HStack';`

## Anatomy

| Element | Required | Description |
|---------|----------|-------------|
| Stack container | Yes | Layout container that arranges content along one flex axis. |
| Item | No | Optional StackItem wrapper that controls one item in the stack. |
| Content | No | Caller-supplied content rendered by a Stack or StackItem. |

## Best Practices

- **Do:** Use the gap prop for spacing between items; don't add margins manually.
- **Do:** Use StackItem with size="fill" to make one item stretch and fill the leftover space.
- **Don't:** Nest stacks inside stacks; try wrap="wrap" first to let items flow to the next line.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `gap` | `0 \| 0.5 \| 1 \| 1.5 \| 2 \| 3 \| 4 \| 5 \| 6 \| 8 \| 10` | - | Spacing step (number literal): 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10. Pass as a JSX number expression e.g. gap={4}, NOT a string like gap="4". |
| `padding` | `0 \| 0.5 \| 1 \| 1.5 \| 2 \| 3 \| 4 \| 5 \| 6 \| 8 \| 10` | - | Inner padding on all sides, using the spacing scale (0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10). Matches the padding prop on Card, LayoutContent, and LayoutPanel. Pass as a JSX number expression e.g. padding={3}. |
| `paddingInline` | `0 \| 0.5 \| 1 \| 1.5 \| 2 \| 3 \| 4 \| 5 \| 6 \| 8 \| 10` | - | Inline (horizontal) padding, using the spacing scale. Overrides padding on the inline axis when both are set. |
| `paddingInlineStart` | `0 \| 0.5 \| 1 \| 1.5 \| 2 \| 3 \| 4 \| 5 \| 6 \| 8 \| 10` | - | Inline-start padding, using the spacing scale (left in LTR, right in RTL). Overrides paddingInline and padding on that edge only. |
| `paddingInlineEnd` | `0 \| 0.5 \| 1 \| 1.5 \| 2 \| 3 \| 4 \| 5 \| 6 \| 8 \| 10` | - | Inline-end padding, using the spacing scale (right in LTR, left in RTL). Overrides paddingInline and padding on that edge only. |
| `paddingBlock` | `0 \| 0.5 \| 1 \| 1.5 \| 2 \| 3 \| 4 \| 5 \| 6 \| 8 \| 10` | - | Block (vertical) padding, using the spacing scale. Overrides padding on the block axis when both are set. |
| `paddingBlockStart` | `0 \| 0.5 \| 1 \| 1.5 \| 2 \| 3 \| 4 \| 5 \| 6 \| 8 \| 10` | - | Block-start (top) padding, using the spacing scale. Overrides paddingBlock and padding on that edge only. |
| `paddingBlockEnd` | `0 \| 0.5 \| 1 \| 1.5 \| 2 \| 3 \| 4 \| 5 \| 6 \| 8 \| 10` | - | Block-end (bottom) padding, using the spacing scale. Overrides paddingBlock and padding on that edge only. |
| `isScrollable` | `boolean` | `false` | Enables scrollable overflow (overflow: auto). Matches isScrollable on LayoutContent and LayoutPanel. |
| `width` | `SizeValue` | - | Width of the stack container. Numbers are treated as pixels, strings are used as-is (e.g., '100%'). |
| `height` | `SizeValue` | - | Height of the stack container. Numbers are treated as pixels, strings are used as-is (e.g., '100%'). |
| `maxWidth` | `SizeValue` | - | Maximum width of the stack container. Numbers are treated as pixels, strings are used as-is (e.g., '100%'). |
| `minHeight` | `SizeValue` | - | Minimum height of the stack container. Numbers are treated as pixels, strings are used as-is (e.g., '100%'). |
| `hAlign` | `'start' \| 'center' \| 'end' \| 'between' \| 'around' \| 'evenly'` | - | Horizontal (main-axis) alignment of items. |
| `vAlign` | `'start' \| 'center' \| 'end' \| 'stretch'` | `'stretch'` | Vertical (cross-axis) alignment of items. |
| `justify` | `'start' \| 'center' \| 'end' \| 'between' \| 'around' \| 'evenly'` | - | Main-axis alignment alias for hAlign. Mirrors CSS justify-content. |
| `align` | `'start' \| 'center' \| 'end' \| 'stretch'` | - | Cross-axis alignment alias for vAlign. Mirrors CSS align-items. |
| `wrap` | `'nowrap' \| 'wrap' \| 'wrap-reverse'` | `'nowrap'` | Flex wrap behavior. |
| `as` | `ElementType` | `'div'` | HTML element to render as the stack container. |
| `children` | `ReactNode` | - | Stack content. |
| `xstyle` | `StyleXStyles` | - | StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}. |

## Components

### HStack

Horizontal stack for arranging items left-to-right. Supports polymorphic rendering.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `gap` | `0 \| 0.5 \| 1 \| 1.5 \| 2 \| 3 \| 4 \| 5 \| 6 \| 8 \| 10` | - | Spacing step (number literal): 0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10. Pass as a JSX number expression e.g. gap={4}, NOT a string like gap="4". |
| `padding` | `0 \| 0.5 \| 1 \| 1.5 \| 2 \| 3 \| 4 \| 5 \| 6 \| 8 \| 10` | - | Inner padding on all sides, using the spacing scale (0, 0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, 10). Matches the padding prop on Card, LayoutContent, and LayoutPanel. Pass as a JSX number expression e.g. padding={3}. |
| `paddingInline` | `0 \| 0.5 \| 1 \| 1.5 \| 2 \| 3 \| 4 \| 5 \| 6 \| 8 \| 10` | - | Inline (horizontal) padding, using the spacing scale. Overrides padding on the inline axis when both are set. |
| `paddingInlineStart` | `0 \| 0.5 \| 1 \| 1.5 \| 2 \| 3 \| 4 \| 5 \| 6 \| 8 \| 10` | - | Inline-start padding, using the spacing scale (left in LTR, right in RTL). Overrides paddingInline and padding on that edge only. |
| `paddingInlineEnd` | `0 \| 0.5 \| 1 \| 1.5 \| 2 \| 3 \| 4 \| 5 \| 6 \| 8 \| 10` | - | Inline-end padding, using the spacing scale (right in LTR, left in RTL). Overrides paddingInline and padding on that edge only. |
| `paddingBlock` | `0 \| 0.5 \| 1 \| 1.5 \| 2 \| 3 \| 4 \| 5 \| 6 \| 8 \| 10` | - | Block (vertical) padding, using the spacing scale. Overrides padding on the block axis when both are set. |
| `paddingBlockStart` | `0 \| 0.5 \| 1 \| 1.5 \| 2 \| 3 \| 4 \| 5 \| 6 \| 8 \| 10` | - | Block-start (top) padding, using the spacing scale. Overrides paddingBlock and padding on that edge only. |
| `paddingBlockEnd` | `0 \| 0.5 \| 1 \| 1.5 \| 2 \| 3 \| 4 \| 5 \| 6 \| 8 \| 10` | - | Block-end (bottom) padding, using the spacing scale. Overrides paddingBlock and padding on that edge only. |
| `isScrollable` | `boolean` | `false` | Enables scrollable overflow (overflow: auto). Matches isScrollable on LayoutContent and LayoutPanel. |
| `width` | `SizeValue` | - | Width of the stack container. Numbers are treated as pixels, strings are used as-is (e.g., '100%'). |
| `height` | `SizeValue` | - | Height of the stack container. Numbers are treated as pixels, strings are used as-is (e.g., '100%'). |
| `maxWidth` | `SizeValue` | - | Maximum width of the stack container. Numbers are treated as pixels, strings are used as-is (e.g., '100%'). |
| `minHeight` | `SizeValue` | - | Minimum height of the stack container. Numbers are treated as pixels, strings are used as-is (e.g., '100%'). |
| `hAlign` | `'start' \| 'center' \| 'end' \| 'between' \| 'around' \| 'evenly'` | - | Horizontal (main-axis) alignment of items. |
| `vAlign` | `'start' \| 'center' \| 'end' \| 'stretch'` | `'stretch'` | Vertical (cross-axis) alignment of items. |
| `justify` | `'start' \| 'center' \| 'end' \| 'between' \| 'around' \| 'evenly'` | - | Main-axis alignment alias for hAlign. Mirrors CSS justify-content. |
| `align` | `'start' \| 'center' \| 'end' \| 'stretch'` | - | Cross-axis alignment alias for vAlign. Mirrors CSS align-items. |
| `wrap` | `'nowrap' \| 'wrap' \| 'wrap-reverse'` | `'nowrap'` | Flex wrap behavior. |
| `as` | `ElementType` | `'div'` | HTML element to render as the stack container. |
| `children` | `ReactNode` | - | Stack content. |
| `xstyle` | `StyleXStyles` | - | StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}. |

## Theming

| Component class | Preferred data attributes | Props | States |
|-----------------|---------------------------|-------|--------|
| `astryx-stack` | `data-direction`, `data-gap`, `data-wrap` | direction, gap, wrap | - |
| `astryx-stack-item` | `data-size` | size | - |

Override in defineTheme:
```ts
components: {
  'stack': {
    base: { /* CSS properties */ },
    'direction:value': { /* variant-specific */ },
  },
  'stack-item': {
    base: { /* CSS properties */ },
  },
}
```


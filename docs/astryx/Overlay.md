package: @astryxdesign/core

# Overlay

Overlay layers action or supporting content over media, cards, video, or other bounded surfaces with an optional scrim and reveal behavior.

**Import:** `import {Overlay} from '@astryxdesign/core/Overlay';`

## Anatomy

| Element | Required | Description |
|---------|----------|-------------|
| Base content | No | The media, card, or bounded surface that the overlay sits on top of. |
| Scrim | No | Optional dark or light overlay background that improves content contrast. |
| Overlay content | Yes | Actions, labels, or supporting content rendered above the base surface. |

## Best Practices

- **Do:** Use overlays for short, contextual actions or labels that belong directly to the underlying media or surface.
- **Do:** Keep overlay content compact so it remains legible over the scrim and does not obscure important visual information.
- **Don't:** Do not use Overlay for floating content anchored outside the surface. Use Popover, Tooltip, or Dialog for those patterns.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `content` | `ReactNode` | - | Content rendered inside the overlay scrim. **(required)** |
| `children` | `ReactNode` | - | Base content such as an image, video, card, or media surface that the overlay sits on top of. |
| `showOn` | `'hover' \| 'always' \| 'focus' \| 'hover-or-focus'` | `'always'` | Visibility trigger. Hover mode also reveals on focus for keyboard accessibility; hover-or-focus is an alias for hover. |
| `isOpen` | `boolean` | - | Controlled visibility override. When set, this takes precedence over showOn and touch toggle behavior. |
| `scrim` | `'dark' \| 'light' \| false` | `'dark'` | Scrim background mode. Set to false to render overlay content without a scrim background. |
| `position` | `'fill' \| 'bottom' \| 'top'` | `'fill'` | Where the scrim appears within the base surface. |
| `align` | `'start' \| 'center' \| 'end'` | `'end'` | Alignment of the overlay content within the scrim. |
| `xstyle` | `StyleXStyles` | - | StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}. |
| `className` | `string` | - | CSS class name(s) appended to the root element. Prefer xstyle for styling when possible. |
| `style` | `React.CSSProperties` | - | Inline styles applied to the root element. Prefer xstyle for design-system styling. |
| `ref` | `Ref<HTMLDivElement>` | - | Ref forwarded to the overlay root element. |

## Theming

| Component class | Preferred data attributes | Props | States |
|-----------------|---------------------------|-------|--------|
| `astryx-overlay` | - | - | - |
| `astryx-overlay-scrim` | `data-position` | position | - |

Override in defineTheme:
```ts
components: {
  'overlay': {
    base: { /* CSS properties */ },
  },
  'overlay-scrim': {
    base: { /* CSS properties */ },
  },
}
```


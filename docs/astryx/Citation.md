package: @astryxdesign/core

# Citation

Citations display inline references to external sources. Use them to attribute information within AI-generated responses, articles, or anywhere provenance and source links are needed.

**Import:** `import {Citation} from '@astryxdesign/core/Citation';`

## Anatomy

| Element | Required | Description |
|---------|----------|-------------|
| Container | Yes | The root wrapper. Accepted source URLs render an anchor; missing or rejected URLs render an inert span. |
| Icon | No | An optional source icon shown before the label text. Accepts a favicon/logo image URL (via source.src) or a React node such as an Astryx <Icon>. Only available in the label variant. |
| Label text | No | The source title, truncated with ellipsis when it exceeds the max width. Shown in the label variant. |
| Number | No | The citation index displayed as a superscript badge. Shown in the number variant. |

## Best Practices

- **Do:** Use the label variant when the source title adds meaningful context for the reader.
- **Do:** Use the number variant for compact inline references within body text, like footnotes.
- **Don't:** Mix label and number variants in the same paragraph. Pick one style per context for visual consistency.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `source` | `CitationSource` | - | The citation source object containing title, url, an optional image src, and an optional icon node. The url follows the shared navigation rule described on the Link `href` prop; rejected destinations leave the citation visible without navigation. Image src uses separate resource handling. **(required)** |
| `number` | `number` | - | The display index for this citation. **(required)** |
| `variant` | `'label' \| 'number'` | `'label'` | Display style: a label chip showing the source title or a compact numbered badge. |

## Theming

| Component class | Preferred data attributes | Props | States |
|-----------------|---------------------------|-------|--------|
| `astryx-citation` | `data-variant` | label, number | - |

Override in defineTheme:
```ts
components: {
  'citation': {
    base: { /* CSS properties */ },
    'variant:value': { /* variant-specific */ },
  },
}
```


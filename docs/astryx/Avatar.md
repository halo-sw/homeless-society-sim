package: @astryxdesign/core

# Avatar

Avatar represents a person or team with a profile photo, initials, or a default icon. Use it in comment headers, contact lists, chat messages, user cards, and anywhere you need to identify someone visually.

**Import:** `import {Avatar} from '@astryxdesign/core/Avatar';`

## Anatomy

| Element | Required | Description |
|---------|----------|-------------|
| Photo | No | The profile image, loaded from the src URL. Shown when available. |
| Initials | No | The first letter, digit or emoji of the first and last words of the name; punctuation is skipped. Shown when no photo is available. A name with no letters, digits or emoji shows the default icon instead. |
| Default icon | No | A generic person silhouette. Shown when there is no photo or name. |
| Status dot | No | A small indicator in the bottom-right corner showing availability (online, away, busy). Each variant pairs colour with a distinct shape so status does not rely on colour alone. |

## Best Practices

- **Do:** Always pass a name so the avatar can show initials if the photo fails to load, and so screen readers can announce who it represents.
- **Do:** Pick a size that matches the context: xsm or sm for inline mentions, md or lg for lists and cards, xl for profile headers.
- **Do:** Add a status dot when knowing someone's availability matters, like in chat or team views.
- **Do:** When wrapping an Avatar in your own Tooltip or HoverCard, set tooltip={false} so the built-in name tooltip does not overlap yours.
- **Do:** Give every interactive avatar (href or onClick) a name or alt. It is the control's accessible name, and it warns in development when it is missing.
- **Don't:** Rely on a status label to name an interactive avatar. "Online" says nothing about where the link goes.
- **Don't:** Use Avatar for logos, product images, or anything that isn't a person or team. Use an image or icon instead.
- **Don't:** Use xstyle or className to override shape. Use the shape prop instead so themes can control it globally.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `src` | `string` | - | Primary image source URL. |
| `fallbackSrc` | `string` | - | Fallback image when primary fails. |
| `name` | `string` | - | User name for initials and alt text. |
| `alt` | `string` | - | Alt text (falls back to name). |
| `size` | `'xsm' \| 'sm' \| 'md' \| 'lg' \| 'xl' \| 16 \| 20 \| 24 \| 32 \| 36 \| 40 \| 48 \| 60 \| 64 \| 72 \| 96 \| 128 \| 144 \| 180` | `'md'` | Avatar size: named sizes are 'xsm' (20px), 'sm' (24px), 'md' (36px), 'lg' (48px), and 'xl' (128px); numeric sizes must be one of the pixel values listed in the type. Inside an AvatarGroup, the group's size always overrides this prop, including when the group uses its default size. |
| `shape` | `'circle' \| 'rounded' \| 'square'` | `'circle'` | Shape variant of the avatar. 'circle' (default) stays fully round. 'rounded' uses the element radius token so it matches UI corner rounding and can be set globally via theme. 'square' has no radius. Status dot positioning adapts automatically: 4-o'clock on circle, bottom-right corner on rounded/square. |
| `status` | `ReactNode` | - | Corner content for status indicators. AvatarStatusDot reports its `label` to the avatar, which composes it into the accessible name (e.g. "Jane Doe, Online") so screen readers announce the status. Reporting goes through context, so it still works when the dot sits inside a wrapper component of your own. |
| `tooltip` | `string \| boolean` | `true` | Tooltip shown on hover and keyboard focus. Omitted or true shows the avatar's name; a string shows that text instead; false shows no tooltip. Not auto-disabled when wrapped in your own Tooltip/HoverCard. Set tooltip={false} if you supply your own overlay. No tooltip is shown when tooltip is true/omitted and there is no name. |
| `href` | `string` | - | When set, the avatar renders as an interactive link (`<a>` or a custom link component) pointing here. This follows the same element-swap rule as Button. Requires a meaningful accessible name via `alt` or `name`: an interactive avatar without one warns in development. Inside an AvatarGroup, interactive avatars share a single Tab stop and are reached with arrow keys. |
| `as` | `ElementType` | - | Custom link component used when `href` is set (e.g. `next/link`). Overrides the provider-level LinkProvider default. Only applies with `href`. |
| `target` | `string` | - | Link target attribute. Only applies with `href`. |
| `rel` | `string` | - | Link rel attribute. Only applies with `href`. |
| `onClick` | `(e: MouseEvent) => void` | - | Click handler. When set without `href`, the avatar renders as a focusable `<button type="button">`. Requires a meaningful accessible name via `alt` or `name`: an interactive avatar without one warns in development. |

## Components

### AvatarStatusDot

See `npx astryx component AvatarStatusDot` for props and usage.

## Theming

| Component class | Preferred data attributes | Props | States |
|-----------------|---------------------------|-------|--------|
| `astryx-avatar` | `data-size`, `data-shape` | size, shape | - |
| `astryx-avatar-fallback` | `data-size` | size | - |
| `astryx-avatar-status-dot` | `data-variant` | variant | - |
| `astryx-avatar-status-dot-glyph` | `data-shape` | shape | - |

Override in defineTheme:
```ts
components: {
  'avatar': {
    base: { /* CSS properties */ },
    'size:value': { /* variant-specific */ },
  },
  'avatar-fallback': {
    base: { /* CSS properties */ },
  },
}
```

Some properties are set via standard CSS in component overrides:
```ts
components: {
  avatar: {
    base: {
      borderRadius: '...',
    },
  },
}
```


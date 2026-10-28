package: @astryxdesign/core

# ChatComposerDrawer

Use ChatComposerDrawer in the ChatComposer drawer slot for supplementary content such as attachments, context chips, or previews. Provide count only when people should be able to collapse that content.

**Import:** `import {ChatComposerDrawer} from '@astryxdesign/core/Chat';`

## Anatomy

| Element | Required | Description |
|---------|----------|-------------|
| Root surface | Yes | The drawer surface that composes above the ChatComposer body. |
| Disclosure toggle | No | The keyboard- and pointer-operable collapse control rendered when count is provided. |
| Collapsed summary | No | The default count Badge and label, or caller-provided visual content, presented while the drawer is collapsed. |
| Content area | Yes | The caller-provided supplementary content; collapsed descendants are unavailable to keyboard and assistive technology. |

## Best Practices

- **Do:** Give label a concrete plural noun such as "Attachments" so the expand and collapse actions have a useful accessible name.
- **Do:** Use controlled isCollapsed with onCollapsedChange when another part of the page owns drawer state; otherwise use defaultIsCollapsed.
- **Don't:** Put primary composer actions in the drawer; use ChatComposer footer or send-action slots so those controls remain available when the drawer is collapsed.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | - | Content to render inside the drawer: tokens, chips, previews, or any React elements. **(required)** |
| `count` | `number` | - | Total item count shown in the collapsed badge. When provided, the drawer gains a collapse/expand toggle. |
| `label` | `string` | `'Items'` | Label shown next to the count in the default collapsed summary and used to name the expand/collapse action. |
| `collapsedSummary` | `ReactNode` | - | Visual content for the complete Collapsed summary anatomy part. When count enables collapse, this replaces the default neutral Badge and label while the component retains disclosure behavior and accessible naming. |
| `isCollapsed` | `boolean` | - | Controlled collapsed state. Use with `onCollapsedChange` for external control. |
| `defaultIsCollapsed` | `boolean` | `false` | Initial collapsed state for uncontrolled usage. |
| `onCollapsedChange` | `(isCollapsed: boolean) => void` | - | Callback fired when the user toggles the drawer. |

## Theming

| Component class | Preferred data attributes | Props | States |
|-----------------|---------------------------|-------|--------|
| `astryx-chat-composer-drawer` | `data-collapsed` | collapsed | - |

Override in defineTheme:
```ts
components: {
  'chat-composer-drawer': {
    base: { /* CSS properties */ },
    'collapsed:value': { /* variant-specific */ },
  },
}
```


package: @astryxdesign/core

# ChatSystemMessage

Use ChatSystemMessage for concise, non-sender content inside a chat transcript. Choose the default variant for factual status notices and the divider variant for date or section breaks. Long default content wraps within the available width. It carries no live role: inside a ChatMessageList, the log announces new notices. The divider branch includes a labelled separator.

**Import:** `import {ChatSystemMessage} from '@astryxdesign/core/Chat';`

## Anatomy

| Element | Required | Description |
|---------|----------|-------------|
| System message | Yes | The noninteractive status row that carries the chat-system-message theme target. |
| Content | Yes | The concise caller-provided message or divider label. |
| Icon content | No | Rendered before the message in the default variant; the divider variant currently does not render it. |
| Divider | No | A labelled horizontal Divider rendered by the divider variant. |

## Best Practices

- **Do:** Keep the visible message concise and self-contained so it remains understandable without an icon.
- **Do:** Use the divider variant for temporal or section boundaries and the default variant for factual status notices.
- **Don't:** Use ChatSystemMessage for sender-authored content; use ChatMessage and ChatMessageBubble instead.
- **Don't:** Use caller-provided icon artwork as the only source of meaning; the visible message must carry the same information.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | - | System message content: factual text or React content such as a date, join/leave notice, or status change. Long default content wraps within the available width. **(required)** |
| `variant` | `'default' \| 'divider'` | `'default'` | Visual variant. 'default' renders centered text. 'divider' adds horizontal lines on each side via Divider: use for date separators and section breaks. |
| `icon` | `ReactNode` | - | Optional caller-provided icon content. Rendered before the message in the default variant; the divider variant currently does not render it. Wrap in Icon for consistent sizing. |
| `xstyle` | `StyleXStyles` | - | StyleX styles for layout customization. Must be a stylex.create() value: not an inline style object like style={{}}. |

## Theming

| Component class | Preferred data attributes | Props | States |
|-----------------|---------------------------|-------|--------|
| `astryx-chat-system-message` | `data-variant` | default, divider | - |

Override in defineTheme:
```ts
components: {
  'chat-system-message': {
    base: { /* CSS properties */ },
    'variant:value': { /* variant-specific */ },
  },
}
```


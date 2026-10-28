
Next step: run `npx astryx init` to finish setup and install the Astryx agent prompt.
package: @astryxdesign/core

# Chat

Chat is a family of composable primitives for building AI and human chat experiences. Combine ChatLayout, ChatMessageList, ChatMessage, bubbles, system messages, tool calls, tokenized text, and ChatComposer to assemble complete conversations without reimplementing sender-aware layout, density, scrolling, or composer behavior.

**Import:** `import {Chat} from '@astryxdesign/core/Chat';`

## Anatomy

| Element | Required | Description |
|---------|----------|-------------|
| Message area | Yes | Scrollable region for messages. Renders children (typically ChatMessageList) in a flex column that pushes content to the bottom when the list is short. |
| Frosted glass dock | Yes | Sticky or fixed container at the bottom with a backdrop-blur layer. Houses the scroll button and composer. |
| Scroll-to-bottom button | No | Appears when the user scrolls up or new messages arrive. Defaults to ChatLayoutScrollButton; pass null to hide or a custom element to override. |
| Composer | Yes | The input area for sending messages, typically ChatComposer. Docked at the bottom inside the frosted glass layer. |
| Empty state | No | Centered placeholder shown when no messages exist. Use EmptyState for a consistent look. |
| Avatar | No | A sender avatar rendered beside the message. Typically Avatar with size="md". Hidden for system messages. |
| Name | No | Sender name above the message body. Place on the bubble when using bubbles, or on the message wrapper for raw content. |
| Content | Yes | The message body: one or more ChatMessageBubble elements, or any free-form ReactNode like images or tool calls. Wrap non-bubble content in a ghost bubble to align it with the bubble text column. |
| Metadata | No | Timestamp, delivery status, and footer actions below the message. Place on the last bubble or on the message wrapper. |

## Best Practices

- **Do:** Compose messages using MessageList > Message > Bubble for consistent sender-aware styling and density.
- **Do:** Set the density prop to control spacing globally: compact for sidebars, balanced for most views, spacious for long-form reading. Individual messages can override.
- **Do:** Use gap when top-level rows are independent (for example, LLM tool events or streamed blocks) and list spacing needs to be tuned separately from density.
- **Do:** Use the group prop on bubbles (first, middle, last) when a single sender sends multiple consecutive messages; it tightens corner radius to visually connect them.
- **Do:** Use ChatSystemMessage with variant="divider" for date separators and default for inline status notices like joins, leaves, or topic changes.
- **Do:** Put name on the first bubble and metadata on the last bubble in a message so they align with the bubble's inline padding.
- **Do:** Wrap custom in-message content (cards, attachments, citations) in a ghost bubble so it aligns with the bubble text column; add width="100%" when it should span the full message column instead of the default bubble width cap.
- **Do:** Provide an emptyState prop so new users see a clear prompt to start a conversation instead of a blank screen.
- **Do:** Use the ghost bubble variant for AI-style responses that show rich content like code blocks or markdown without a visible boundary.
- **Don't:** Don't use ChatSystemMessage for sender content; it has no avatar, alignment, or bubble. Use ChatMessage with a sender role instead.
- **Don't:** Don't put long or multi-line content in a system message; keep it to a single short sentence. If you need more, use a bubble or a card.
- **Don't:** Don't nest ChatMessage inside another ChatMessage; each message is a standalone article element with its own sender context.
- **Don't:** Don't apply a fixed height directly on the message list; wrap it in a sized container and let the list fill with flex: 1.
- **Don't:** Don't mix filled and ghost bubble variants within the same sender's messages; pick one style per side and use it consistently.
- **Don't:** Don't place metadata or names on both the bubble and the message wrapper; pick one based on whether the content has a bubble boundary.

## Components

### ChatMessageList

See `npx astryx component ChatMessageList` for props and usage.

### ChatMessage

See `npx astryx component ChatMessage` for props and usage.

### ChatMessageBubble

See `npx astryx component ChatMessageBubble` for props and usage.

### ChatMessageMetadata

See `npx astryx component ChatMessageMetadata` for props and usage.

### ChatSystemMessage

See `npx astryx component ChatSystemMessage` for props and usage.

### ChatComposer

See `npx astryx component ChatComposer` for props and usage.

### ChatComposerInput

See `npx astryx component ChatComposerInput` for props and usage.

### ChatComposerDrawer

See `npx astryx component ChatComposerDrawer` for props and usage.

### ChatSendButton

See `npx astryx component ChatSendButton` for props and usage.

### ChatToolCalls

See `npx astryx component ChatToolCalls` for props and usage.

### ChatTokenizedText

See `npx astryx component ChatTokenizedText` for props and usage.

### ChatComposerTokenElement

See `npx astryx component ChatComposerTokenElement` for props and usage.

### ChatLayout

See `npx astryx component ChatLayout` for props and usage.

### ChatLayoutScrollButton

See `npx astryx component ChatLayoutScrollButton` for props and usage.

## Theming

| Component class | Preferred data attributes | Props | States |
|-----------------|---------------------------|-------|--------|
| `astryx-chat-layout` | `data-density` | density | - |
| `astryx-chat-composer` | `data-density` | density | - |
| `astryx-chat-composer-input` | - | - | - |
| `astryx-chat-composer-drawer` | `data-collapsed` | collapsed | - |
| `astryx-chat-message` | `data-sender`, `data-density` | sender, density | - |
| `astryx-chat-message-bubble` | `data-sender`, `data-variant`, `data-density` | sender, variant, density | - |
| `astryx-chat-message-list` | `data-density` | density | - |
| `astryx-chat-system-message` | `data-variant` | variant | - |
| `astryx-chat-message-metadata` | - | - | - |
| `astryx-chat-send-button` | - | - | - |
| `astryx-chat-dictation-button` | - | - | - |
| `astryx-chat-layout-scroll-button` | - | - | - |
| `astryx-chat-tokenized-text` | - | - | - |
| `astryx-chat-tool-calls` | - | - | - |
| `astryx-trigger-menu` | - | - | - |

Override in defineTheme:
```ts
components: {
  'chat-layout': {
    base: { /* CSS properties */ },
    'density:value': { /* variant-specific */ },
  },
  'chat-composer': {
    base: { /* CSS properties */ },
  },
}
```

Some properties are set via standard CSS in component overrides:
```ts
components: {
  chat-layout: {
    base: {
      borderRadius: '...',
      padding: '...',
    },
  },
}
```


package: @astryxdesign/core

# ChatLayout

ChatLayout is the layout shell for full-page chat interfaces. It renders messages in normal page flow and docks the composer to the bottom with a frosted glass blur layer. Set the density prop to control spacing; it defaults to balanced. Use it to wrap ChatMessageList and ChatComposer for a complete chat experience with built-in auto-scroll and a scroll-to-bottom button.

**Import:** `import {ChatLayout} from '@astryxdesign/core/Chat';`

## Anatomy

| Element | Required | Description |
|---------|----------|-------------|
| Message area | Yes | Scrollable region for messages. Renders children (typically ChatMessageList) in a flex column that pushes content to the bottom when the list is short. |
| Frosted glass dock | Yes | Sticky or fixed container at the bottom with a backdrop-blur layer. Houses the scroll button and composer. |
| Scroll-to-bottom button | No | Appears when the user scrolls up or new messages arrive. Defaults to ChatLayoutScrollButton; pass null to hide or a custom element to override. |
| Composer | Yes | The input area for sending messages, typically ChatComposer. Docked at the bottom inside the frosted glass layer. |
| Empty state | No | Centered placeholder shown when no messages exist. Use EmptyState for a consistent look. |

## Best Practices

- **Do:** Pass ChatMessageList as children and ChatComposer as the composer prop for a complete chat interface.
- **Do:** Provide an emptyState so new conversations show a prompt instead of a blank screen.
- **Do:** Use scrollRef when the chat is embedded in a page where a parent element handles scrolling.
- **Don't:** Don't apply a fixed height on the layout; let it fill its container with flex: 1.
- **Don't:** Don't render multiple ChatLayout instances in the same scroll container; each expects to own its scroll context.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | - | Message content: typically ChatMessageList. Flows naturally in the page and scrolls with the container. **(required)** |
| `composer` | `ReactNode` | - | Composer element: typically ChatComposer. Fixed to the bottom with a frosted glass dock. **(required)** |
| `emptyState` | `ReactNode` | - | Content shown when children is empty. Centered vertically in the message area. |
| `scrollButton` | `ReactNode \| null` | - | Scroll-to-bottom button rendered above the composer. Defaults to ChatLayoutScrollButton with auto-scroll integration. Pass null to hide. |
| `scrollRef` | `React.RefObject<HTMLElement \| null>` | - | External scroll container ref. When provided, auto-scroll and scroll-to-bottom target this element instead of the layout root. Use when the chat is embedded in a page where a parent element or the document body scrolls. |
| `density` | `'compact' \| 'balanced' \| 'spacious'` | `'balanced'` | Visual density: controls dock padding, message-area max-width and inline padding, and the height of the frosted glass blur layer. |


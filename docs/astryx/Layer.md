
Next step: run `npx astryx init` to finish setup and install the Astryx agent prompt.
package: @astryxdesign/core

# Layer

Layer utilities provide the app-level provider used by overlay systems. Use LayerProvider at the app root for toast/layer configuration; use higher-level Popover, HoverCard, or Tooltip APIs for most overlay UI. Rendered layer content, not the provider’s application subtree, uses theme body text defaults and exits ancestor surface/group membership. Establish intentional groups and complete required providers inside each layer. Every anchored layer keeps a gutter from each viewport edge — the spacing-4 step or the device safe-area inset, whichever is larger — and is capped to the viewport, never to the room beside its trigger: an explicit width renders at its size, flips when it does not fit beside the trigger, and slides into view when it fits on neither side. An app that floats a persistent bar over a viewport edge declares it once as inset on LayerProvider (blockStart, blockEnd, inlineStart, inlineEnd); each edge adds to that edge’s gutter for every anchored layer and moves the toast viewport by the same amount, and defaults to zero. The inset is app configuration, not a theme value.

**Import:** `import {Layer} from '@astryxdesign/core/Layer';`

## Best Practices

- **Do:** Declare a persistent bar floating over the viewport once, as inset on LayerProvider; every anchored layer and toast then stays clear of it.
- **Do:** Use LayerProvider once near the app root when you need shared toast/layer configuration.
- **Do:** Build on higher-level components like Popover, HoverCard, and Tooltip for common overlay patterns.
- **Don't:** Add nested LayerProvider instances: nested providers are ignored and add unnecessary tree depth.

## Components

### LayerProvider

App-level provider for layer systems such as toast viewports and imperative modals. Nested providers pass through.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `children` | `ReactNode` | - | Application subtree that can use the shared layer context. **(required)** |
| `toast` | `LayerToastConfig` | - | Toast viewport configuration. Controls position, maxVisible, and a toast-only inset that overrides the provider inset per edge for toasts shown through useToast. |
| `inset` | `LayerInset` | - | A persistent bar floating over a viewport edge, declared once: blockStart, blockEnd, inlineStart, inlineEnd as pixel numbers or CSS lengths. Each edge adds to the gutter every anchored layer keeps from that edge and moves the toast viewport by the same amount. Defaults to zero on every edge. |


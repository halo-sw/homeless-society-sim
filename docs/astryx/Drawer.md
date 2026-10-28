
Next step: run `npx astryx init` to finish setup and install the Astryx agent prompt.
package: @astryxdesign/core

# Drawer

A side panel that floats above page content for inspectors and detail views: the "click a table row, see its details" pattern. Unlike a docked panel it overlays the layout instead of reflowing it. Works on desktop and touch: the width budget applies on desktop and the panel preserves a 56px page reveal below 640px without exceeding the width budget. Escape closes the drawer (unless purpose is required) and focus returns to the element that opened it. Entry/exit slide animation respects prefers-reduced-motion. Stacking contract: sibling drawers stack last-opened on top, Escape closes only the topmost, and closing peels innermost-first; render them as siblings, never nested.

Like Dialog, the drawer is a container: its content area is inset by --spacing-4 (16px) by default, by the padding prop, or by a theme's padding on drawer. Compose the header, body, and footer the way Dialog does, with a Layout: DrawerHeader in the header slot (it shows a close button when you pass it onOpenChange, like DialogHeader), the body in LayoutContent, and actions in LayoutFooter. The Layout redistributes the inset to those regions so they line up on one content line, and the header is not inset twice. A lone Section child also escapes the inset. Drawer renders no close button of its own, so give every drawer a visible way to close, especially a non-modal one, which has no scrim to click. Put data-autofocus on the control that should receive focus on open.

Choosing a surface: use Dialog for a centered decision or short form, Drawer for full-height side detail that keeps the page in sight, BottomSheet for block-axis sheets on touch, and a docked panel (a layout column) when content should reflow the page instead of floating over it.

Theming: the panel is the single stable target (astryx-drawer, with data-side reflecting side), and the scrim is the panel's native ::backdrop. DrawerHeader exposes astryx-drawer-header targets for its row, slots, and close icon.

**Import:** `import {Drawer} from '@astryxdesign/core/Drawer';`

## Anatomy

| Element | Required | Description |
|---------|----------|-------------|
| Panel | Yes | The root <dialog> element: a full-height surface anchored to the inline start or end edge, flush with three viewport edges (square corners). |
| Content area | Yes | Scrollable container that receives children; compose the header, body, and footer inside it with a Layout, as in Dialog. Inset by --spacing-4 (16px) by default; the padding prop or a theme sets a different container inset. |
| Header | No | DrawerHeader, composed in a Layout header slot as DialogHeader is in Dialog: a title row with optional subtitle and start/end content. Pass it onOpenChange to show a close button, as with DialogHeader. |
| Scrim | No | Backdrop that dims and blocks the page behind a modal drawer (hasScrim, the default); a non-modal drawer renders none. |

## Best Practices

- **Do:** Use for contextual detail views (row inspectors, entity details) where the user should keep the underlying list in sight.
- **Do:** Keep the caller as the source of truth: derive isOpen from selection state and clear the selection in onOpenChange.
- **Do:** Use hasScrim={false} for master-detail flows; non-modal drawers do not trap focus and the page behind stays interactive.
- **Do:** Keep the last-selected item rendered on close: children stay mounted during the exit animation, so nulling content mid-close blanks the panel while it slides out.
- **Do:** Give every drawer a visible close action, usually DrawerHeader with onOpenChange; a non-modal drawer has no scrim to click.
- **Do:** Use purpose="form" when a stray scrim click would discard unsaved input.
- **Don't:** Use a Drawer for short confirmations or small forms; use Dialog or AlertDialog instead.
- **Don't:** Reach for a Drawer when the content should push the page aside; a Drawer floats over content, so use a docked panel or layout column instead.
- **Don't:** Use a Drawer as a bottom or top sheet; it is inline-axis only, so use BottomSheet for block-axis sheets.
- **Don't:** Nest a Drawer inside another Drawer; render drawers as siblings; the last-opened stacks on top and Escape closes it first.

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `isOpen` | `boolean` | - | Whether the drawer is open. Fully controlled; pair with onOpenChange. **(required)** |
| `onOpenChange` | `(isOpen: boolean) => void` | - | Called when the drawer requests an open-state change. Escape and a scrim click call it with false as purpose allows; a DrawerHeader given the same callback calls it from its close button. The caller owns the open state. With sibling drawers open, Escape only closes the last-opened one. **(required)** |
| `label` | `string` | - | Accessible label for the drawer. Required; the drawer has no built-in heading to derive a name from. **(required)** |
| `children` | `ReactNode` | - | Drawer content, rendered inside a full-height scrollable area. Compose your own header/body/footer; an element with data-autofocus is focused on open. Children stay mounted during the exit animation; keep the last-selected item rendered instead of nulling content on close. **(required)** |
| `side` | `'start' \| 'end'` | `'end'` | Edge the drawer slides from: 'end' is right in LTR (the inspector convention), 'start' is left. Inline axis only; for a bottom sheet use BottomSheet. |
| `width` | `number \| string` | `400` | Desktop width budget. A number is pixels; a string is any CSS length ('50%', '32rem'). Below the 640px mobile breakpoint this remains the maximum while the drawer preserves a 56px reveal of the page behind. |
| `experimental` | `{isFullWidthOnMobile?: boolean}` | - | Experimental options: anything in this object may change or be removed in a patch release, and omitting it keeps the stable behavior. isFullWidthOnMobile (default false) covers the full viewport width below the 640px mobile breakpoint instead of preserving the default 56px reveal of the page behind, which makes the drawer read as an overlay, not a navigation. **(experimental)** |
| `hasScrim` | `boolean` | `true` | Modal scrim behind the drawer. true uses showModal() (top layer, focus trap, scroll lock; clicking the scrim closes unless purpose prevents it; modal only); false uses the manual Popover API for a non-modal top-layer overlay that does NOT trap focus and keeps the page behind interactive. |
| `purpose` | `'required' \| 'form' \| 'info'` | `'info'` | Configures implicit dismissal, matching Dialog. info: Escape and a scrim click close. form: Escape closes, a scrim click does not. required: neither closes (Escape is consumed) and a modal drawer is exposed as an alertdialog, so give its content a way out. A non-modal drawer has no scrim, so form and info behave the same. |
| `padding` | `0 \| 0.5 \| 1 \| 1.5 \| 2 \| 3 \| 4 \| 5 \| 6 \| 8 \| 10` | - | Internal padding of the drawer content using the spacing scale, matching Dialog. When omitted, uses the theme default for drawers: --spacing-4 (16px) unless the theme sets padding on drawer. Pass 0 for a full-bleed content area. A lone Section child escapes the padding, bleed children such as Table and Divider compensate against it, and a Layout picks it up for its regions. The content area's block-end edge adds the home-indicator safe area on top in every mode. |

## Examples

### Basic

```tsx
const [isOpen, setIsOpen] = useState(false);
<>
  <Button label="Open drawer" onClick={() => setIsOpen(true)} />
  <Drawer
    isOpen={isOpen}
    onOpenChange={setIsOpen}
    label="Details"
    width={360}>
    <Layout
      header={<DrawerHeader title="Details" onOpenChange={setIsOpen} />}
      content={
        <LayoutContent>
          <Text type="body">Close with Escape, the scrim, or the close button.</Text>
        </LayoutContent>
      }
    />
  </Drawer>
</>
// Modal by default: the scrim dims the page and focus is trapped. Escape, a
// scrim click, or the header's close button closes it, and focus returns to
// the trigger.
```

### Modal or non-modal (hasScrim)

```tsx
const [openModal, setOpenModal] = useState(false);
const [openPanel, setOpenPanel] = useState(false);
<>
  {/* Modal (default): the scrim dims the page, focus is trapped, and a
      scrim click closes. */}
  <Drawer isOpen={openModal} onOpenChange={setOpenModal} label="Edit details">
    <EditForm />
  </Drawer>
  {/* Non-modal: no scrim, no focus trap; the page behind stays interactive.
      With no scrim to click, the header's close button is the visible exit. */}
  <Drawer
    isOpen={openPanel}
    onOpenChange={setOpenPanel}
    label="Details"
    hasScrim={false}>
    <Layout
      header={<DrawerHeader title="Details" onOpenChange={setOpenPanel} />}
      content={<LayoutContent><DetailsPanel /></LayoutContent>}
    />
  </Drawer>
</>
```

### Edit form with footer actions

```tsx
const [isOpen, setIsOpen] = useState(false);
<Drawer
  isOpen={isOpen}
  onOpenChange={setIsOpen}
  label="Edit host"
  purpose="form">
  <Layout
    header={<DrawerHeader title="Edit host" onOpenChange={setIsOpen} />}
    content={<LayoutContent><HostFields /></LayoutContent>}
    footer={
      <LayoutFooter>
        <HStack gap={2} hAlign="end">
          <Button label="Cancel" variant="secondary" onClick={() => setIsOpen(false)} />
          <Button label="Save" variant="primary" onClick={save} />
        </HStack>
      </LayoutFooter>
    }
  />
</Drawer>
// purpose="form" keeps Escape but ignores scrim clicks, so a stray click
// outside does not discard edits. The footer stays pinned while the fields
// scroll.
```

### Slide in from the start edge

```tsx
const [isOpen, setIsOpen] = useState(false);
<Drawer
  isOpen={isOpen}
  onOpenChange={setIsOpen}
  label="Navigation"
  side="start">
  <NavPanel />
</Drawer>
// 'start' is left in LTR and mirrors under RTL; 'end' (the default) is the
// inspector convention.
```

### Width budget: pixels or any CSS length

```tsx
const [isOpen, setIsOpen] = useState(false);
<Drawer
  isOpen={isOpen}
  onOpenChange={setIsOpen}
  label="Details"
  width="50%">
  <DetailsPanel />
</Drawer>
// A number is pixels (width={320}); a string is any CSS length ('32rem',
// '50%'). The budget also caps the drawer on mobile.
```

## Theming

| Component class | Preferred data attributes | Props | States |
|-----------------|---------------------------|-------|--------|
| `astryx-drawer` | `data-side` | side | - |
| `astryx-drawer-header` | - | - | - |
| `astryx-drawer-header-start-content` | - | - | - |
| `astryx-drawer-header-title-block` | - | - | - |
| `astryx-drawer-header-end-content` | - | - | - |
| `astryx-drawer-header-close-icon` | - | - | - |

Override in defineTheme:
```ts
components: {
  'drawer': {
    base: { /* CSS properties */ },
    'side:value': { /* variant-specific */ },
  },
  'drawer-header': {
    base: { /* CSS properties */ },
  },
}
```


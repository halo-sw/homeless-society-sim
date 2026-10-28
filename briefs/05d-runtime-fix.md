# Stage 5d — runtime crash fix (brief for Muse, small)

Rules in `AGENTS.md`. In the browser every page crashes on first render after the 5a+5b merge:
```
TypeError: Cannot read properties of undefined (reading 'onBeforeCompile')
    at customProgramCacheKey (three chunk)
    at material.customProgramCacheKey (src/render/textures.js:92)
    at Object.getParameters … WebGLRenderer.renderBufferDirect
```
Cause (orchestrator's reading): `const prevKey = material.customProgramCacheKey` is three's prototype method, which reads `this.onBeforeCompile`; calling `prevKey()` unbound loses `this`. Same pattern in `web/src/main.js` `makeFadeable` (~line 276). Fix both (call with the material as `this`), and add a node test that chains both patches on a real `MeshStandardMaterial` and calls `customProgramCacheKey()` without throwing and with a distinct key per chain. Also note: a second page error appeared once on the tour page: "Failed to execute 'showPopover' on 'HTMLElement': Invalid to show a popover during another show operation" — find which Astryx overlay opens two popovers in the same tick on load and fix it. Run `node --test`, `vite build`. Do not commit.

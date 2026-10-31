# Stage 30h — wire the theme through the generated Astryx module (brief for Muse)

Agent mode, rules in `AGENTS.md`. Sandbox: no network. No sub-agents, no git, no todo list, no full test suite, no build. Branch `ithaca-17`. Stop when this part is done.

## Context
- The customer chose to keep the **neutral** theme.
- The orchestrator ran `npx astryx theme add neutral`, which generated `web/src/astryx-themes.js`. Do not edit that file: it is `@generated`, exports `themes` and `defaultThemeSlug`, and already imports `@astryxdesign/theme-neutral/theme.css` and `fonts.css`.
- `web/src/ui/main.jsx` still wires the theme by hand:
  - lines 11–13: `import "@astryxdesign/theme-neutral/theme.css"`, `import "@astryxdesign/theme-neutral/fonts.css"`, `import { neutralTheme } from "@astryxdesign/theme-neutral/built"`;
  - line 42: `<Theme theme={neutralTheme} mode="light">`.

## Change (only `web/src/ui/main.jsx`)
1. Replace lines 11–13 with one import: `import { themes, defaultThemeSlug } from "../astryx-themes.js";`. Keep the `reset.css` and `astryx.css` imports and their order, before `./ui.css`.
2. Line 42 becomes `<Theme theme={themes[defaultThemeSlug]} mode="light">`.
3. Nothing else: no `defineTheme`, no color changes. The look must stay identical.

## Test: `web/tests/theme-module-30h.test.js`
- `main.jsx` source:
  - imports `themes` and `defaultThemeSlug` from `../astryx-themes.js`;
  - passes `themes[defaultThemeSlug]` to `<Theme`;
  - no longer imports `@astryxdesign/theme-neutral` directly.
- `web/src/astryx-themes.js`: `defaultThemeSlug === "neutral"`, and `themes.neutral` is the same object as `neutralTheme` from `@astryxdesign/theme-neutral/built`. Importing the `.css` side effects in node may fail; if so, read the file as text and assert the slug and the import line instead.
- Keep green: `tests/i18n-24a.test.js`, `tests/landing-19f.test.js`.

Run only:
```
cd web && node --test tests/theme-module-30h.test.js tests/i18n-24a.test.js tests/landing-19f.test.js 2>&1 | tail -8
```

## Do not touch
Everything except `web/src/ui/main.jsx` and the new test.

## Final message
Changed files, one line each.

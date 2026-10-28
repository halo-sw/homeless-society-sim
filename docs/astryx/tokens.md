
Next step: run `npx astryx init` to finish setup and install the Astryx agent prompt.
All Tokens
Complete reference for color, data visualization, syntax, spacing, size, border, focus, radius, shadow, motion, and
typography tokens.

package: @astryxdesign/cli

Token Categories

tokens-color        Semantic colors for consistent theming. All colors use light-dark() for automatic mode switching.
tokens-data         Colors for charts and graphs: one categorical accent per series, a neutral for labels and reference
                    lines, and sequential ramps from 5 (darkest) to 1 (lightest) for ordered scales and heatmaps. Import
                    dataVars from @astryxdesign/core/theme/dataTokens.stylex for CSS-capable code. Source compilation
                    emits the complete 56-variable group when any member is retained and none for an unused graph.
                    Prebuilt CSS consumers load @astryxdesign/core/astryx.css, which defines the complete group for the
                    already-compiled dataVars entry.
tokens-syntax       Code highlighting colors used by CodeBlock. Each defaults to a palette token, so syntax colors
                    follow the theme; defineTheme({syntax}) sets a syntax theme instead.
tokens-spacing      Spacing scale used for padding, gap, and margin. Component gap props map spacing steps to these
                    tokens.
tokens-size         Control heights for consistent sizing across buttons, inputs, and selectors.
tokens-border       Border width for card and input borders.
tokens-focus        The keyboard focus ring, shared by every component that draws one. Override these to restyle focus
                    across the system.
tokens-radius       Numeric scale based on a 4dp base unit. Tokens scale with the theme's radius multiplier;
                    --radius-none and --radius-full are fixed.
tokens-shadow       Elevation shadows (low to med to high) and inset shadows for input state rings.
tokens-duration     Motion duration primitives. Three bands: fast (micro-interactions), medium (entrance/exit), slow
                    (continuous). Min/max variants derive from base × ratio.
tokens-ease         Easing curves for animations and transitions.
tokens-typography   Font family stacks for body, code, and heading text.
tokens-text-size    Geometric type scale: round(14 × 1.2^step). Base is 14px (--font-size-base).
tokens-font-weight  Font weight values for body, emphasis, and headings.
tokens-type-scale   Semantic tokens for headings, body, labels, code, supporting text, and display text. References font
                    size and weight tokens. Override via typography.scale in defineTheme.
tokens-usage        How to import and use token variables in StyleX styles.

Open one: npx astryx docs tokens/<name>
Up: npx astryx docs

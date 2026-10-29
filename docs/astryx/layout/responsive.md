
Next step: run `npx astryx init` to finish setup and install the Astryx agent prompt.
Responsive
Decide what each region does as width changes: divide, reveal, resize, or swap.

package: @astryxdesign/cli

breakpoints          Breakpoints - Decide what each region does as width changes. Write the responsive contract down for
                     every region before you call the layout done.
responsive-contract  Responsive contract - Lock what each region does as width changes, and pair every line of the
                     contract with the prop or hook that enforces it.
columns-that-reflow  Columns that reflow - For columns that reflow on small screens, use `Grid columns={{minWidth,
                     max}}`. A numeric `columns` is exactly N columns at every width and never reflows: `columns={4}` on
                     a 390px phone renders four tracks under 100px wide, and the row...

Read one section: npx astryx docs layout/responsive <section>
Read everything:  npx astryx docs layout/responsive --full
Up: npx astryx docs layout
Previous: npx astryx docs layout/layout-spacing

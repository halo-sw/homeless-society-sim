
Next step: run `npx astryx init` to finish setup and install the Astryx agent prompt.
Layout spacing
Hold one content line per region, then tune gaps and density.

package: @astryxdesign/cli

spacing    Spacing - Hold one content line per region, then tune gaps and density. Alignment, Rhythm, and Density and
           size each build on these rules.
alignment  Alignment - The container owns padding and child gaps; children zero their margins, and interior spacing is
           always a token. Pick one content line per region and hold it constant, not the padding: `container_inset =
           content_line -...
rhythm     Rhythm - Grouping comes from contrast between tight and generous gaps, not one repeated value. If every gap
           is the same step, proximity does no work.
density    Density and size - Match density to how often a region is used, and give every control in a row the same size
           so heights share a baseline.

Read one section: npx astryx docs layout/layout-spacing <section>
Read everything:  npx astryx docs layout/layout-spacing --full
Up: npx astryx docs layout
Previous: npx astryx docs layout/side-panels
Next: npx astryx docs layout/responsive

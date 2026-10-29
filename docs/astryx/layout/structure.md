
Next step: run `npx astryx init` to finish setup and install the Astryx agent prompt.
Structure
Rank the content in each region, then pick the weakest container that groups it.

package: @astryxdesign/cli

structure       Structure - Rank the content in each region, then pick the weakest container that groups it. Type
                hierarchy and Card or rows cover each step; these rules hold for all of them.
type-hierarchy  Type hierarchy - Give every region one lead, then rank the rest with weight and color rather than size.
                Content uses two text colors, primary and secondary, and nothing dimmer: body copy needs no props at
                all.
containers      Card or rows - Reach for the weakest container that reads as a group, and escalate only when it fails.
                Weakest to strongest:

Read one section: npx astryx docs layout/structure <section>
Read everything:  npx astryx docs layout/structure --full
Up: npx astryx docs layout
Previous: npx astryx docs layout/scaffold
Next: npx astryx docs layout/headers-and-footers

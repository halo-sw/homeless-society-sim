
Next step: run `npx astryx init` to finish setup and install the Astryx agent prompt.
Spacing
Spacing scale tokens for padding, gap, and margin: the rhythmic foundation of design system layouts.

package: @astryxdesign/cli

overview        Overview - The design system uses a 4px base-unit spacing scale, written in rem so gaps and padding grow
                with the reader's browser font size the way text does: each step is 0.25rem, which is 4px at the default
                16px root. Component gap props accept...
scale           Scale - Fifteen spacing tokens, from 0 to 3rem (0px to 48px at the default 16px root).
usage           Usage - Stack, HStack, VStack, Grid, Toolbar, OverflowList, and ChatMessageList take a `gap` step: 0,
                0.5, 1, 1.5, 2, 3, 4, 5, 6, 8, or 10 (×4px). Carousel takes the steps from 0 to 4. For custom layouts,
                use the spacing tokens in StyleX.
best-practices  Best Practices - Use component gap props when available; they handle automatic spacing compensation.

Read one section: npx astryx docs spacing <section>
Read everything:  npx astryx docs spacing --full
Up: npx astryx docs foundations
Previous: npx astryx docs shape


Next step: run `npx astryx init` to finish setup and install the Astryx agent prompt.
Scaffold
Pick the shell, budget each region, and choose navigation, before any content exists.

package: @astryxdesign/cli

scaffold    Scaffold - Pick the shell, budget each region, and choose navigation, before any content exists. Shell and
            Navigation cover each step; these rules hold for both.
shell       Shell - Pick the shell and budget its regions before any content exists. Structural widths are the one place
            raw px belongs; everything inside them uses the spacing scale.
navigation  Navigation - When the frame leaves navigation open, default to SideNav: it absorbs destinations you have not
            planned yet. App type and destination count are guiding indicators, not determining rules.

Read one section: npx astryx docs layout/scaffold <section>
Read everything:  npx astryx docs layout/scaffold --full
Up: npx astryx docs layout
Next: npx astryx docs layout/structure

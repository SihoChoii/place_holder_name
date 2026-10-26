# StarTagger LED identity

Version 0.4 · October 25, 2026. LED matrix is the owner's preferred identity direction. The clean Inter pairing is the primary lockup proposed for this direction; the fully dotted lettering is a secondary display study.

[Open the identity and motion lab](../../logo.html).

## Files

| Asset | Black, transparent | White, transparent |
| --- | --- | --- |
| Primary horizontal lockup | [SVG](startagger-lockup.svg) | [SVG](startagger-lockup-white.svg) |
| Stacked lockup | [SVG](startagger-stacked.svg) | [SVG](startagger-stacked-white.svg) |
| Compact horizontal lockup | [SVG](startagger-lockup-compact.svg) | [SVG](startagger-lockup-compact-white.svg) |
| Detailed LED star | [SVG](startagger-symbol.svg) | [SVG](startagger-symbol-white.svg) |
| Compact LED star | [SVG](startagger-symbol-compact.svg) | [SVG](startagger-symbol-compact-white.svg) |
| Solid Inter wordmark | [SVG](startagger-wordmark.svg) | [SVG](startagger-wordmark-white.svg) |
| Fully dotted display lockup | [SVG](startagger-display-lockup.svg) | [SVG](startagger-display-lockup-white.svg) |

All marks and letters are vector geometry. The Inter wordmark is converted to paths from the project's bundled Inter variable font at weight 650 with −0.045em tracking. It has no runtime font dependency. The matrix lettering is a custom nine-row drawing of “StarTagger,” not a replacement UI font. Preserve the [Inter license](../../assets/Inter-LICENSE.txt) with redistributed font-related sources.

## Primary lockup

Use the LED star with a solid StarTagger wordmark. The texture belongs to the symbol; the name remains readable. Use the horizontal lockup in spacious placements and the stacked lockup where width is constrained.

The horizontal source is `710 × 192` units: the symbol uses a 192-unit canvas, followed by the wordmark. The visible lettering begins at x=216. The wordmark's visible bounding box is optically centered at y=96. The source includes padding; do not crop to the dots or alter the symbol-to-type proportion.

Provide external clear space of at least one small “a” height, approximately 54 horizontal-source units. This is additional to the file's internal padding. Recommended minimum horizontal width is 400 px for the detailed matrix. Use the compact lockup below that size or the stacked treatment on a narrow page.

## Detailed and compact symbols

The detailed mark is the preferred 194-dot SVG from round two, unchanged. Each circle has radius 2.35 on a 7-unit pitch in a 256-unit viewBox. Use it at 96 px or larger to keep the dots distinct.

The compact mark redraws the same swept star on a coarser grid: 45 circles, radius 5.4 on a 16-unit pitch. It is optically adjusted for headers and small product placements. Start at 40–48 px; below 32 px use the solid wordmark alone until a separate favicon is developed. The compact mark is not made by enlarging the detailed mark's dots.

The star in a navigation header may sit in a 40–48 px canvas with the live Inter wordmark at 22–26 px. Keep at least 8–12 px between the canvas and text. Avoid animating the navigation lockup continuously.

## Display lettering

The fully dotted lockup combines the detailed star with 134 letter dots. Letter dots use radius 3.6 and an 11-unit pitch to balance their visual weight against the denser symbol. It preserves the capitalization **StarTagger**. Use it at 600 px wide or larger for campaign titles, launch graphics, and expressive artwork. Use the solid wordmark for primary navigation, reading, and small placements.

## Color and geometry

Prefer white on black. The black version is for light placements. Keep each component's dots equal, aligned to their grid, and circular; preserve the two intentional grids in the display lockup. No gradients, blur, glow, shadows, random dot sizes, or color accents are required for the identity.

Use a square background when preparing app-icon source artwork; let the platform apply its mask. Retain the source proportions and inspect the eventual platform export at actual device sizes.

## Accessible use

For an external SVG image, use `alt="StarTagger"` when it is the only accessible name. Hide decorative symbols when adjacent text already supplies that name. If inlining multiple copies, make title IDs unique or use an accessible wrapper with decorative SVG children.

Motion specifications and reusable implementation are in [the motion handoff](../../motion/README.md). The branding guide and motion lab are local review artifacts; applying them to the shipped application is a separate integration step.

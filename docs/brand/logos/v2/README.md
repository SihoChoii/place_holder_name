# StarTagger — Y2K, LED, and precision

Archived round two · October 25, 2026. The owner subsequently preferred LED matrix; see the [current LED identity](../led/README.md). Three editable SVG directions responding to the supplied sharp Y2K, diagonal star, chrome-orbit, and LED-matrix references. The treatment remains pure black and white; the references inform silhouette and texture, without importing their raster artwork.

[Open the archived comparison](../../logo-v2.html).

| Direction | Black / transparent | White / transparent | White on black square |
| --- | --- | --- | --- |
| Y2K outline | [SVG](startagger-y2k.svg) | [SVG](startagger-y2k-white.svg) | [App SVG](startagger-y2k-app.svg) |
| LED matrix | [SVG](startagger-led.svg) | [SVG](startagger-led-white.svg) | [App SVG](startagger-led-app.svg) |
| Precision | [SVG](startagger-precision.svg) | [SVG](startagger-precision-white.svg) | [App SVG](startagger-precision-app.svg) |

## Y2K outline

An asymmetric five-point star swept along a diagonal, with an open center. The outline is constructed from an outer polygon and intersecting parallel inward offsets, giving its straight edges a consistent 9-unit width. It is a filled compound path with an even-odd hole, rather than a live stroke.

Suggested minimum: 32 px. It is intentionally angular and has no clipped point from the previous direction.

## LED matrix

194 equal circles, radius 2.35 units, on a 7-unit grid. The hollow, swept silhouette uses the same visual language as the Y2K outline. The dots are actual editable circles. There is no bitmap texture, glow, gradient, or blur.

Suggested minimum for distinct dots: 96 px. Use it for larger app branding, marketing, posters, and social graphics. The preview includes small sizes to show the loss of dot separation; it is not intended as a tiny favicon. A future small-size matrix would need a separately drawn, coarser grid.

## Precision

A four-point star with two long diagonal rays, two shorter rays, and matched concave curves. A single filled path rotated 45 degrees gives a northeast/southwest axis. Its restrained form is the recommended app-symbol direction of this round.

Suggested minimum: 24 px. The thin ray ends shorten optically at small sizes; retain the supplied proportions and do not add a stroke.

## Shared handoff

Every SVG uses `viewBox="0 0 256 256"`. Transparent assets have an intrinsic size of 256 × 256; square app artwork is 1024 × 1024. Black and white versions of each family use identical geometry. App files include a solid black background; leave platform masking to the platform.

The files contain no scripts, fonts, filters, embedded images, or external references. Keep their padding and proportions. Inline consumers should make title/description IDs unique per instance, or hide a decorative symbol when nearby text already supplies its accessible name.

These are complete SVG alternatives for creative selection, not three interchangeable official logos. The prior direction is retained in the parent folder and at [the previous preview](../../logo-v1.html). No application asset has been replaced.

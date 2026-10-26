# StarTagger — Tagged star

First SVG logo direction, October 25, 2026.

A solid five-point star with a diagonal separation in the upper-right point. The small detached point suggests a star being marked or tagged. Slightly eased vertices keep the silhouette crisp without needle-sharp tips.

## Assets

| File | Use |
| --- | --- |
| [startagger-logo.svg](startagger-logo.svg) | Black mark, transparent background; editable SVG master |
| [startagger-logo-white.svg](startagger-logo-white.svg) | White mark, transparent background |
| [startagger-app-icon.svg](startagger-app-icon.svg) | White mark on a square black canvas, 1024 × 1024 intrinsic size |
| [startagger-app-icon-light.svg](startagger-app-icon-light.svg) | Black mark on a square white canvas, 1024 × 1024 intrinsic size |

All four use the same geometry in a `0 0 128 128` viewBox. They contain filled vector paths, no fonts, raster images, strokes, filters, scripts, or external references. The transparent files have no background shape.

## Use

Prefer white on black for the app. Use the black version on light backgrounds. Keep the proportions and the separation between the two parts unchanged. Do not add outlines, gradients, shadows, additional stars, or rotations.

Preserve the supplied canvas padding. It leaves approximately 14 units horizontally and 17 units vertically around the visible mark. Allow at least another 8 viewBox units between the canvas and neighboring text or artwork in lockups.

Use 24 px or larger when the detached point must read clearly. At 16 px the silhouette still reads as a star, but the cut becomes a subpixel detail. The app-icon SVGs are square source artwork; the platform should apply its icon mask. Platform-specific raster and store packaging remain separate exports.

For inline SVG use, give title/description IDs unique values per instance, or use `aria-hidden="true"` when an adjacent accessible brand label already names the app. For image elements, use `alt="StarTagger"` when the symbol is the only identity label.

This is a complete, editable first logo direction for review. It has not replaced the application's existing favicon or header asset.

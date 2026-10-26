# Astral Harness feature brand guide

**Version 0.2 · October 25, 2026 · Identity and loading animation**

[Open the visual guide](index.html). This feature identity extends the [StarTagger brand foundation](../README.md). The project owner requested **Astral Harness** as a major app feature with a more precise SVG logo. The mark, feature line, and applications here are proposals for creative review.

## Positioning

**Astral Harness is StarTagger’s astronomy guide feature.** This is the proposed user-facing positioning, not a claim that the supplied package is already integrated.

The supplied [Stage 1 README](sources/README-stage1.md) describes prompt, skill, and evaluation assets supporting a guide already owned by the backend. The feature story should connect that technical work with the observer’s task: exploring a star, comparing stars, understanding travel estimates, and discovering approved community observations.

- **Feature line:** Bring the sky into focus.
- **Short description:** A focused guide to the stars.
- **Introduction:** Explore a selected star, compare what you find, and put stellar distances in perspective.
- **Standalone endorsement:** A StarTagger feature.
- **Technical description:** The prompt, skill, and evaluation layer supporting StarTagger’s star guide.

Use the user-facing description in product introductions. Keep the technical description in developer documentation. The identity represents a feature of StarTagger, not a new foundation model or separate application.

## Brand relationship

| Surface | Leading identity | Supporting expression |
| --- | --- | --- |
| App navigation, home page, app icon | StarTagger LED identity | Astral Harness can appear as a named feature |
| Feature hero or introduction | Astral Harness precise mark and name | StarTagger header or “A StarTagger feature” endorsement |
| Guide panel | Astral Harness symbol with live feature name | Existing StarTagger app navigation |
| Standalone campaign or presentation | Astral Harness endorsed lockup | Feature line and one clear invitation |
| Small guide control | Core star with visible label, or text alone | Accessible name identifies the feature and action |

Write **Astral Harness**, with one space and both words capitalized. Keep both words together in logo artwork. “Astral” alone and “AH” are not approved alternate names. In a conversation already within the feature, ordinary “guide” language can keep instructions natural.

The solid feature mark and the parent LED star share a diagonal orientation, black-and-white color, and Inter typography. Preserve their distinct roles. The feature tile supplied here is for feature artwork, not a replacement StarTagger app icon.

## Logo construction

The working mark is called **Focus frame**: a four-point star centered between two opposing square corners.

| Element | Construction |
| --- | --- |
| Source canvas | 256 × 256 units |
| Frame bounds | x/y 24–232; 208-unit outer square |
| Frame band | 12 units; corners at top left and bottom right |
| Star center | 128, 128 |
| Star axis | 45-degree rotation; long northeast–southwest rays |
| Long ray | 96 units from the center before rotation |
| Short ray | 44 units from the center before rotation |
| Curves | Matching cubic Bézier curves in all quadrants |
| Primary lettering | Inter 600, source size 128, tracking −0.04em |
| Horizontal lockup | 1,158 × 256; lettering starts at x288 |
| Endorsement | Inter 500, source size 28, tracking −0.015em |

The frame suggests focus and bounded context. It is abstract branding, not a constellation, instrument readout, or scientific diagram.

Preserve the supplied geometry, aspect ratios, and internal spacing. Black and white versions have identical geometry. Wordmarks are vector outlines; they do not require a font to render. The self-hosted [Inter font and license](../assets/Inter-LICENSE.txt) remain available for live UI text.

### Clear space and sizes

- Give the full mark and lockups at least **32 source units** of external clear space, scaled with the artwork. This is additional to padding inside each SVG.
- Use the full framed symbol at **32 px** or above. At **20–31 px**, use the supplied enlarged core star beside a visible feature label. Below **20 px**, use text.
- The core glyph retains the same star curves with a 1.35× optical enlargement about the center. It is not a substitute for the full mark in hero artwork.
- Use the horizontal lockup at **240 px** wide or above. For smaller navigation placements, use a 32–40 px symbol and live Inter 600 text at 20–22 px.
- Use the stacked lockup at **220 px** wide or above.
- Use the endorsed SVG at **520 px** wide or above. At narrower widths, use the primary or stacked lockup with a separate, live-text “A StarTagger feature” endorsement at 13–14 px.
- These are digital starting points. Inspect final rasterization at the actual output size, especially for print and small UI controls.

Keep the mark flat, solid, and monochrome. Do not add chrome, glow, gradients, a dotted frame, extra rays, or a surrounding badge. Use the supplied inverse asset rather than a CSS filter. Do not recolor individual components or stretch the frame independently of the star.

## Shared visual system

| Role | Specification |
| --- | --- |
| Primary canvas / inverse ink | `#000000` |
| Primary ink / inverse canvas | `#FFFFFF` |
| Body text | `#E5E5E5` |
| Supporting text | `#A3A3A3` |
| Controls and diagrams | `#737373` |
| Structural rules | `#292929` |
| Grouped surface | `#0A0A0A` |
| Typography | Inter Variable; 600 headings, 400 body, 500 controls |
| Layout | Square geometry; open space around the feature mark; one principal headline |
| Interaction | Controls at least 44 px; visible keyboard focus; meaningful accessible labels |

The white campaign specimen is the inverse expression of the same system. On white, supporting copy must use a sufficiently dark gray, such as `#555555`, rather than the dark-theme supporting token.

The parent LED identity can introduce StarTagger in global navigation or a campaign signature. Keep Astral Harness solid. Do not turn every component into a second matrix texture.

## Feature applications

### Website feature block

Lead with “Bring the sky into focus.” Keep the precise symbol prominent, give the feature name its own signature, and retain the parent brand. Suggested supporting copy: “Meet the guide for your next question. From a star’s story to the distance ahead.” This is concept copy pending release review.

A production call to action should describe its real destination: **Explore Astral Harness** for a feature explanation, or **Open guide** for a working, authenticated guide. The concept page uses local navigation rather than pretending to open an integrated service.

### Inside the app

Keep the selected star visible beside the guide. Use the full framed mark with **Astral Harness** in the panel header, followed by a plain-language invitation: **What would you like to explore?**

The visual guide includes a composer study. Suggested-question buttons fill an editable field. Clear resets the field. Nothing is sent, stored, or answered by a model. No fabricated measurements or responses are used as product evidence.

| Suggested topic | Example question |
| --- | --- |
| Selected star | What can you tell me about Sirius? |
| Comparison | How does Sirius compare with another star in my view? |
| Travel estimate | How long would it take to get to Sirius? |
| Community | What have people shared about Sirius? |

Sirius is an illustrative selection, not a claim about the current backend scope or its community content. In a real local-mode session, comparisons and tools must stay within the available star scope. For a general question without a selection, the UI should follow the actual backend behavior.

### Motion relationship

Use the existing [StarTagger LED motion](../motion/README.md) for the parent identity. Astral Harness now has its own [1.4-second loading entrance](loading.html): two corners draw in, the star settles, and the name resolves. The brand-guide hero plays it once on entry. The [dedicated preview](loading.html) adds replay, pause/resume, scrubbing, inverse background, and reduced-motion controls.

Use this as an entrance when opening the feature. Keep the completed identity steady in the functional guide, and keep actual readiness independent of this decorative animation. System reduced-motion preferences show the complete static mark. [Read the implementation handoff and download animated SVGs](motion/README.md).

## Voice

The invitation can feel personal; explanations should remain concrete. Use “you,” ordinary questions, and accurate names. Provide the information needed to interpret an answer without making every sentence sound like technical documentation.

- Explain travel as an **estimate**, stating speed, constant-speed assumptions, and no relativity. The README’s instruction defaults to 17 km/s when no speed is supplied; that is a documented prompt rule, not a verified live response.
- Keep catalog facts separate from community observations. “People have shared” does not establish a scientific fact.
- Be clear when a star, distance, or community result is unavailable. Do not imply zero from missing data.
- Avoid claims of perfect accuracy, instant responses, unlimited access, persistent memory, autonomous actions, voice support, or a proprietary model.
- Use human language in errors while preserving the real limitation: “The guide is busy. Try again shortly.” should only appear for the matching backend state.

## Scope and evidence

The supplied README is the source of truth for this concept’s capability boundaries. Its instructions concern the separate harness project; no setup, evaluation, integration, or merge commands were run as part of branding.

| Source statement | Branding implication |
| --- | --- |
| Prompt and deterministic skill exports are not wired into the backend | Present this as a feature identity concept; do not announce the package as live |
| The backend already owns the guide | Position Astral Harness within StarTagger; do not imply it replaces the backend |
| Star, travel, and approved-community tools are read-only and scoped | Describe exploration and explanation; do not promise purchases, edits, moderation, or unrestricted access |
| Travel uses constant speed without relativity | Avoid realistic spacecraft trajectory or relativistic travel claims |
| History is client-supplied; no server memory is introduced | Do not promise persistent personal memory |
| Local build/tests/smoke passed using fixtures and a stand-in | Do not use those checks as an accuracy or model-performance claim |
| No external baseline recorded; some golden scenarios remain unverified | Verify release behavior before final campaign availability or capability claims |
| Voice, caching, sessions, and extra tools are deferred | Keep these out of feature advertising until separately verified |

## Asset library

All assets are local, editable SVGs. Transparent variants use only pure black or white. The tile includes a black background. The [geometry record](assets/geometry.json) contains the exact symbol and outlined-letter paths.

| Asset | Black | White |
| --- | --- | --- |
| Full symbol | [SVG](assets/astral-harness-symbol.svg) | [SVG](assets/astral-harness-symbol-white.svg) |
| Compact core | [SVG](assets/astral-harness-core.svg) | [SVG](assets/astral-harness-core-white.svg) |
| Wordmark | [SVG](assets/astral-harness-wordmark.svg) | [SVG](assets/astral-harness-wordmark-white.svg) |
| Primary horizontal | [SVG](assets/astral-harness-lockup.svg) | [SVG](assets/astral-harness-lockup-white.svg) |
| Endorsed | [SVG](assets/astral-harness-endorsed.svg) | [SVG](assets/astral-harness-endorsed-white.svg) |
| Stacked | [SVG](assets/astral-harness-stacked.svg) | [SVG](assets/astral-harness-stacked-white.svg) |

[Feature tile](assets/astral-harness-tile.svg) · [Visual review page](index.html) · [Source README](sources/README-stage1.md)

For a meaningful `<img>`, use `alt="Astral Harness"`. When adjacent live text already names the feature, use `alt=""`. Decorative symbols should be hidden from assistive technology. Inline copies need unique title IDs, or a single label on the outer link/button; repeated exported `title` IDs must not be pasted unchanged into the same DOM.

## Decision status

- Requested: Astral Harness branding as a major StarTagger feature, using a precise SVG mark.
- Proposed: Focus frame mark, Inter 600 pairing, feature line, campaign composition, and guide-panel placement.
- Preserved: StarTagger’s preferred LED app identity and the shared monochrome design system.
- Integration: branding prototypes only. No app or backend behavior changed.

Source snapshot copied unchanged from `/Users/sihochoi/Downloads/README.md` into `sources/README-stage1.md`. Its relative links refer to the separate harness repository and are not bundled here.

## Review record

Reviewed in the in-app browser at 1280 px and in 390 px / 320 px iframe viewports. The inverse logo preview, suggested-question composer, Clear control, and local section navigation were exercised. Small layouts use a separate live-text endorsement to preserve readability. All 13 SVGs parse as vector-only XML with monochrome fills, and the six black/white pairs share identical geometry. Local guide links and the unchanged source copy were checked. This validates the branding prototype, not backend functionality or a physical-device release.

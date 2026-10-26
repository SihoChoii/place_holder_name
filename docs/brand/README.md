# StarTagger brand guide

**Version 0.6 · October 25, 2026 · App identity, feature identity, and motion**

Open [the visual guide](index.html) for the color, type, and copy specimens. This document is the editable source of the brand rules. The name **StarTagger** and personality **precise + personal** are confirmed by the project owner. The tagline, logo directions, and marketing applications below are proposals for review.

**LED matrix is the owner's preferred branding direction.** The [identity and motion lab](logo.html) shows the LED star with the StarTagger wordmark, a stacked lockup, a compact header symbol, a fully dotted display treatment, and three interactive website animations. [Download the identity SVGs](logos/led/README.md) or read the [motion handoff](motion/README.md). The [round-two alternatives](logo-v2.html) remain archived for reference.

## Current brand system

| Identity | Visual treatment | Main use | Working line |
| --- | --- | --- | --- |
| StarTagger | LED matrix star + solid Inter 650 wordmark | App identity, global navigation, discovery campaigns | The sky, made personal. |
| Astral Harness | Solid star in an open focus frame + Inter 600 wordmark | Guide feature introductions, feature campaigns, guide entry points | Bring the sky into focus. |

Use **A StarTagger feature** to endorse Astral Harness in standalone artwork. Within the app, the StarTagger header establishes the relationship. Both working lines and the detailed creative treatments remain proposals for review.

The [Astral Harness feature guide](astral/index.html) and [loading-animation preview](astral/loading.html) are now part of this system. See [the file directory](#files-and-previews) for static SVGs, animated SVGs, and implementation notes.

## Brand idea

**The sky, made personal.**

StarTagger helps people discover real stars and build a personal connection with what they find. Its identity should have the clarity of an observing tool and the warmth of a note kept after a memorable night.

The product's broader vision is to connect stars with people's stories. The current website supports exploring, saving stars, and keeping personal observations; public star pages also display available approved community content. Marketing must distinguish that implemented experience from planned mobile and social creation flows.

### Audience and promise

The proposed primary audience is curious people who look up and want a starting point, a name, or a reason to return. Astronomy newcomers should understand the invitation immediately; enthusiasts should find the underlying information credible.

Our working promise: **Find something real. Keep something personal.**

| Attribute | What it means in practice |
| --- | --- |
| Precise | Name objects clearly, preserve units and provenance, distinguish unknown information from zero. |
| Personal | Speak to the observer; make room for their notes, memories, and reasons for looking. |
| Curious | Offer a small invitation to discover more, using familiar language. |
| Quiet | Give the stars and the person's story space. Make one clear point at a time. |

## Name and vocabulary

- Write **StarTagger**, as one word with a capital S and T. Use this spelling in navigation, page titles, screenshots, credits, marketing, and accessibility labels.
- Write **StarTagger's** when a possessive is necessary. Avoid using the brand as a verb.
- Write **Astral Harness** with one space and both words capitalized. Keep the two words together in logo artwork. Use the full name on first introduction; ordinary “guide” language can follow within the feature.
- Retire the public names **Stargaze** and **Star Tagger** when the identity is applied. Internal package names, storage keys, and project identifiers need a separate technical migration decision.
- Use **star**, **sky**, **catalog**, **save**, **note**, and **explore** for the current website.
- **Save** means keeping a star in the personal browser library. **Claim** is the separate in-app community association. Do not use them interchangeably.
- When discussing the planned social experience, describe a claim as an association inside StarTagger. Do not imply that the app sells celestial objects, changes scientific names, or grants ownership of the physical star.

## Visual foundation

The implemented design system is the starting point. Keep the interface and core identity monochrome, with self-hosted Inter, square geometry, flat surfaces, and generous negative space.

The visual character comes from the relationship between a small, precisely placed object and a large, open field. Use that idea through real product imagery, typography, and intentional positioning. Avoid adding a decorative universe behind every composition.

### Color

| Role | Hex | Existing token / use |
| --- | --- | --- |
| Black | `#000000` | `--background`; primary canvas |
| White | `#FFFFFF` | `--foreground`, `--primary`, `--ring`; identity, key text, primary action, focus |
| Reading text | `#E5E5E5` | `--body-text`; longer text |
| Supporting text | `#A3A3A3` | `--muted-foreground`; captions and supporting data |
| Control / diagram line | `#737373` | `--input`, `--chart-line`; identifiable controls and geometry |
| Structural rule | `#292929` | `--border`; quiet dividers, not text or the sole boundary of an input |
| Highlight | `#1F1F1F` | `--accent`; stronger interactive surface |
| Raised / selected surface | `#141414` | `--popover`, `--secondary`, `--muted` |
| Grouped surface | `#0A0A0A` | `--card` |

White-on-black is the primary expression. Black-on-white is the proposed inverse for print and light placements. Do not introduce a brand accent color in this first system. Photographs and scientific content may retain meaningful source color. The sky renderer's day and twilight colors represent scene conditions; they are not brand accents.

### Type

Use **Inter Variable**, matching the application. The visual guide bundles the installed Latin font subset and its license; retain the application's appropriate language coverage for shipped UI.

| Role | Size / weight | Notes |
| --- | --- | --- |
| StarTagger wordmark | 650 weight, −0.045em tracking | Solid Inter lettering paired with the LED star; outlined SVG exports are supplied. |
| Astral Harness wordmark | 600 weight, −0.04em tracking | Precise feature identity; outlined SVG exports are supplied. |
| Marketing headline | Proposed 64–144 px desktop, 36–56 px narrow / 600 | Tight tracking, short lines, natural sentence case. Adapt to the actual medium. |
| Product page title | Existing 36–56 px / 600 | 1.12 line height. |
| Section or dialog title | Existing 24–32 px / 600 | Clear hierarchy without extra labels. |
| Body | Existing 16 px / 400 | Comfortable line length and 1.5–1.6 line height. |
| Controls and metadata | Existing 14–16 px / 400–500 | Tabular numerals for aligned measurements. |

Keep StarTagger on one line. Do not imitate a futuristic display face, artificially widen letters, or substitute a generic star for a character. The supplied Inter wordmark has been outlined for portable SVG exports. Keep that geometry intact in logo artwork; use live Inter text with the same styling for accessible product navigation.

### Geometry and composition

- Keep custom UI corners at zero radius. Circles remain appropriate for stars and observational geometry. Platform app-icon masks are applied by the platform.
- Use a 4 px spacing rhythm; retain the current 12 px toolbar gaps, 24 px component gaps, and 32–56 px section spacing in product work.
- Use 1 px structural rules and 2 px selection/focus indicators in the interface. Scale campaign rules to the output and test them at display size.
- Keep controls at least 44 px; prominent controls are 48 px. Brand treatments must not compromise focus or touch targets.
- Prefer left alignment, an open field, one principal headline, and one clear action. Avoid explanatory copy on top of busy sky imagery.
- Use a single deliberate point of emphasis. Preserve source-backed geometry when showing an actual constellation. Any invented point-and-line graphic must be recognizably abstract, without factual constellation names or coordinates.

## Voice and writing

Use calm, direct language. Explain the action clearly and leave the emotional interpretation to the person. Marketing can be warmer than navigation; product controls remain literal.

| Context | Draft copy | Reason |
| --- | --- | --- |
| Main brand line | **The sky, made personal.** | Connects astronomy and the individual without promising a specific unreleased feature. |
| Current product description | Explore the stars, save your favorites, and keep your observations. | Describes the implemented web journey. |
| Discovery campaign | A star to come back to. | Gives saving a human reason. |
| Notes campaign | Keep a little of tonight. | Invites a personal observation. |
| Product action | Explore the sky / Save star / Add note | Says what happens next. |
| Empty saved list | Save a star to find it here. | Makes the next step clear. |
| Missing distance | Distance unknown | Preserves the difference between absent data and a measurement. |
| Planned community campaign | Your story has a place in the sky. | Reserve for a verified release with the relevant creation and sharing flow. |

Avoid inflated claims such as “discover every star,” “perfectly accurate,” or “the world's first.” Avoid “own a piece of the universe” and “name a real star.” Do not promise that browser-local saved stars or notes sync across devices.

## Identity: LED matrix + StarTagger

The LED star is the preferred visual direction. Pair the detailed matrix symbol with a solid **StarTagger** wordmark in Inter 650. The texture belongs to the symbol; the name stays clear. This supersedes the earlier recommendation to use the Precision symbol for the app.

### Lockups

- **Primary horizontal:** the detailed LED star with the outlined Inter wordmark. Use at 400 px wide or larger.
- **Stacked:** the same symbol above the name, for narrow layouts and centered artwork.
- **Compact:** a 45-dot redraw for headers and smaller placements. Use a 40–48 px symbol with 22–26 px live Inter text; below 32 px, use the wordmark alone until a separate favicon is developed.
- **Display study:** a fully dotted rendering of the star and the exact name StarTagger. Reserve it for large campaign titles and launch graphics, preferably at 600 px wide or larger.

The detailed symbol contains 194 circles of radius 2.35 on a 7-unit grid in a 256-unit viewBox. The compact symbol contains 45 circles of radius 5.4 on a 16-unit grid. Keep the circles equal and aligned within each component. The display wordmark has its own consistent, larger dot grid. Do not enlarge the detailed mark's dots to fabricate the compact version.

Preserve supplied lockup proportions and internal padding. For the primary horizontal lockup, provide additional clear space equal to at least one lowercase “a” height, approximately 54 source units. Black and white exports share identical geometry and have transparent backgrounds. Letters are actual vector paths; the assets do not depend on an installed font.

See the [identity asset notes](logos/led/README.md) for downloads, source geometry, clear space, accessibility, and minimum-size guidance. The [original Tagged star](logo-v1.html) and [Y2K/LED/Precision comparison](logo-v2.html) are historical explorations, not competing current identities.

## Astral Harness feature identity

**Astral Harness** is being developed as a major StarTagger feature. Its proposed positioning is **a focused guide to the stars**, with the feature line **“Bring the sky into focus.”**

The [feature brand guide](astral/index.html) introduces a precise solid star inside an open focus frame. It pairs with an outlined Inter 600 wordmark and shares StarTagger’s monochrome palette and square geometry. StarTagger retains the LED app identity; Astral Harness leads guide introductions, feature campaigns, and guide-panel entry points. Use **“A StarTagger feature”** when the feature appears outside the app’s own navigation.

[Read the feature rules and download the SVGs](astral/README.md). The library includes 13 static SVGs: black and white versions of the full symbol, compact core, wordmark, horizontal, endorsed, and stacked arrangements, plus a feature tile. Lettering is outlined and backgrounds are transparent, except for the black feature tile.

| Feature placement | Starting size / rule |
| --- | --- |
| Full framed symbol | 32 px and above |
| Enlarged core star | 20–31 px, beside a visible feature name; use text below 20 px |
| Horizontal lockup | 240 px wide and above |
| Stacked lockup | 220 px wide and above |
| Endorsed SVG | 520 px wide and above; use a separate 13–14 px live-text endorsement at narrower widths |
| External clear space | At least 32 source units, scaled with the artwork |

The feature guide includes a light campaign composition and an interactive in-app guide-panel study. These are branding concepts. The supplied [Astral Harness Stage 1 README](astral/sources/README-stage1.md) says its prompt and skill assets are not wired into the backend; feature launch claims must reflect the eventual verified release.

## Website motion

Give each identity its own movement. StarTagger’s LED star changes through brightness; Astral Harness arrives through precise frame, star, and name reveals. Use one treatment in an area and hold the completed identity steady.

### StarTagger LED studies

The [LED motion lab](logo.html#motion) keeps the solid wordmark stationary:

| Study | Timing | Intended use |
| --- | --- | --- |
| Power on | Approximately 1.3 seconds | Recommended one-time landing-page entrance; dots assemble and remain lit |
| Scan line | 1.8 seconds | A single sweep for an intentional interaction |
| Quiet pulse | 4.4 seconds per cycle | Optional ambient hero treatment with pause control |

The lab includes Play/Replay, Pause/Resume, Reset, and a reduced-motion preview. The [LED motion handoff](motion/README.md) records the module and integration guidance.

### Astral Harness: Focus in

The [feature loading preview](astral/loading.html) demonstrates a **single 1,400 ms entrance**. The frame corners trace into place, the star settles, and the name softly resolves. The feature brand-guide hero uses the same sequence.

| Phase | Timing | Treatment |
| --- | --- | --- |
| Frame visibility and trace | 0–700 ms | Two precise 12-unit corner strokes reveal together |
| Star | 182–910 ms | Opacity 0 → 1 and scale 0.84 → 1, without overshoot |
| Name | 504–1,400 ms | Opacity 0 → 1 and a 6-source-unit rise into the final position |
| Completed identity | After 1,400 ms | Remains static |

Reveal segments use `cubic-bezier(.22,1,.36,1)`. The preview includes replay, pause/resume, a final-state control, timing scrubbing, inverse background, and a reduced-motion option. [Four standalone animated SVGs](astral/motion/README.md#animated-svg-exports) cover horizontal and stacked layouts in black and white. Use the [inline SVG controller](astral/motion/README.md#browser-module) when playback control or visibility pausing is needed.

### Shared motion rules

- Show the complete static identity when the system requests reduced motion. A preview control may also reduce motion; it must respect the system preference.
- The JavaScript motion controllers pause outside the observed area and while the document is hidden. Standalone animated SVG images play once and have their own reduced-motion CSS; their embedding page does not control playback.
- Keep real loading, ready, and error states tied to application behavior. The brand entrance must not delay usable content or represent backend progress.
- Use the Astral Harness entrance when introducing or opening the feature. Keep the logo steady during guide answers and over the functional live sky.
- Preserve the flat monochrome artwork. Avoid glow, blur, spinning, bounce, and repeated logo assembly.

Both motion treatments are branding prototypes with reusable assets. Application integration remains a separate step.

## Marketing applications

The visual guide now pairs the LED identity with the campaign typography studies. They establish hierarchy, spacing, inversion, and tone; final release copy and channel exports still need review.

### Current web exploration

- Headline: **A star to come back to.**
- Supporting copy: Explore the sky, save a favorite, and keep your observations.
- Action: **Explore the sky**.
- Visual: A real current product capture, or a simple typographic composition with the approved mark once available.

### Personal observation

- Headline: **Keep a little of tonight.**
- Supporting copy: Find a star. Add a note. Come back to what caught your eye.
- Action: **Explore the catalog**.
- Visual: A real saved-star or note flow when available, without invented user content presented as real.

### Astral Harness feature campaign

- Headline: **Bring the sky into focus.**
- Supporting copy: Meet the guide for your next question. From a star’s story to the distance ahead.
- Signature: **Astral Harness** with **A StarTagger feature**.
- Visual: The precise feature mark in an open monochrome composition. The [campaign and app-placement studies](astral/index.html#feature) show the relationship to the parent LED identity.
- Motion: Use the 1.4-second entrance once, then hold the mark steady.
- Availability: Concept copy pending backend integration and release verification. Travel is a constant-speed estimate without relativity; community observations must remain distinct from catalog facts.

### Production order

1. Refine the preferred LED identity using the supplied horizontal, stacked, compact, and display studies.
2. Apply the exact StarTagger name and identity to the verified app screens used for marketing captures.
3. Produce a square and portrait social composition, a wide share image, and a presentation cover. These are format families; choose the actual channels and verify their current export requirements at production time.
4. Produce mobile-store or social-creation campaigns when those user journeys are verified for the release being advertised.

Keep campaign headlines as editable text until final export. Use actual product screenshots, preserve data provenance in factual visuals, and review the final creative at its intended viewing size.

## Files and previews

| Resource | Preview | Rules / source |
| --- | --- | --- |
| Main branding guide | [Visual foundation](index.html) | This document |
| StarTagger LED identity | [Identity lab](logo.html) | [Static SVG library](logos/led/README.md) |
| StarTagger LED motion | [Three motion studies](logo.html#motion) | [Module and specifications](motion/README.md) |
| Astral Harness identity | [Feature guide](astral/index.html) | [Static SVG library and feature rules](astral/README.md) |
| Astral Harness entrance | [Interactive loading preview](astral/loading.html) | [Timing, controller, and animated SVGs](astral/motion/README.md) |
| Inter | [Type specimen](index.html#type) | [Font license](assets/Inter-LICENSE.txt) |

Static assets suit documents, print, and interface use. Animated SVGs suit one-time browser entrances; use the JavaScript controller for controlled website playback. Keep the original asset geometry intact.

## Implementation handoff

When applying the identity, review these public-name surfaces against the current checkout:

| Surface | Source |
| --- | --- |
| Website metadata and default title | `apps/web/src/app/layout.tsx` |
| Header text and accessible home label | `apps/web/src/features/site-header.tsx` |
| Dynamic star-page titles and community copy | `apps/web/src/features/stars/star-page.tsx` |
| Login copy | `apps/web/src/features/auth/login-page.tsx` |
| Credits copy | `apps/web/src/app/credits/page.tsx` |
| iOS display text and display-name configuration | `apps/ios/Stargaze/ContentView.swift`, `apps/ios/project.yml` |
| Favicon | `apps/web/src/app/icon.svg`, after a logo is approved |

This guide records the handoff; it does not rename application files, change saved-data keys, or replace application assets. The repository contains concurrent frontend/backend work, so identity integration should use the current state when scheduled.

## Sources and decision status

| Decision | Status |
| --- | --- |
| StarTagger spelling | Confirmed by project owner, October 25, 2026 |
| Precise + personal personality | Confirmed by project owner, October 25, 2026 |
| Monochrome, Inter, square UI, spacing and accessibility foundation | Observed in the existing design system |
| “The sky, made personal.” and supporting copy | Proposed |
| LED matrix direction | Preferred by the project owner; primary Inter pairing and compact matrix developed |
| StarTagger lockups and website motion | Static SVG library and three LED motion studies delivered for creative review |
| Earlier Tagged star / Y2K / Precision proposals | Archived as historical explorations |
| Astral Harness feature identity | Precise SVG identity requested; Focus frame mark, feature line, and placement studies proposed |
| Astral Harness loading entrance | Requested and implemented as a 1.4-second prototype with four animated SVGs and a reusable controller |
| Marketing channels and final exports | Open |

Design sources: [frontend design system](../../apps/web/README.md#design-system), [implemented CSS](../../apps/web/src/app/globals.css), [header](../../apps/web/src/features/site-header.tsx), [current icon](../../apps/web/src/app/icon.svg), and [frontend execution record](../frontend-execution.md). Product intent was also checked against the local project document at `/Users/sihochoi/Downloads/STAR_TAGGER_PROJECT_DOCUMENT.md`; current implementation takes precedence where its older architecture or feature status differs.

The rendered catalog at local port 3100 was reviewed for visual language only; it is an older 24-star reference. Feature statements above come from the current repository and handoff, not that older preview. The port-4000 preview did not load its styled assets during this review and was not used as visual evidence.

Review: the visual guide was inspected in the in-app browser at a 1280 px viewport and in 390 px / 320 px iframe viewports. The type-weight control, inverse preview, section navigation, and logo brief disclosure were exercised. Local links, anchors, source references, and the bundled font were checked. These are guide checks, not application or physical-device acceptance tests. The LED motion controls and Astral Harness entrance have separate review records in their motion guides. The v0.6 update consolidates the two identities, motion rules, asset directory, and feature messaging.

## Revision record

| Version | Change |
| --- | --- |
| 0.6 | Consolidated app and feature hierarchy, Astral Harness size rules, the Focus in entrance, motion accessibility and playback rules, feature campaign copy, and the file directory |
| 0.5 | Added the precise Astral Harness identity, endorsement, campaign, and in-app placement studies |
| 0.4 | Developed the preferred LED identity, wordmark arrangements, compact symbol, and three website motion studies |

All three revisions are dated October 25, 2026. Naming and personality are owner-confirmed; the supplied creative treatments and copy remain reviewable proposals.

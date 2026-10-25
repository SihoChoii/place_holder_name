# Stargaze design system plan

Status: proposed specification · 25 October 2026 · Applies to web and iOS

**Direction: a precise, monochrome observatory.** Pitch black creates the canvas. White typography, crisp rules, and clear alignment give the app its identity. Boldness comes from scale and contrast; simplicity comes from predictable controls and progressive disclosure.

This is a design and implementation plan. It does not change the running app.

## 1. Design decisions

| Foundation | Decision |
| --- | --- |
| Typeface | Inter throughout; four weights: 400, 500, 600, 700 |
| Background | True black, `#000000` |
| Foreground | White for headings, active states, and primary actions; neutral grays for supporting content |
| Geometry | Square custom controls and containers; `0` corner radius |
| Lines | 1 px structural rules and control borders; 2 px focus and selection indicators |
| Spacing | A 4-unit scale, with comfortable and compact density |
| Hierarchy | Typography, whitespace, alignment, borders, and inversion |
| Motion | Brief feedback; optional expressive type only on introductory surfaces |
| Composition | Flat sections and rows; bordered panels where grouping needs a boundary |
| Scope | Shared visual tokens and behavior across web and native iOS |

The interface should feel calm while the subject matter feels expansive. Keep one dominant action per task area. Show a readable name and useful summary first; expose coordinates, provenance, and advanced controls when requested. Keep technical labels precise and everyday actions plain: “Find in sky,” “Search stars,” “Add note.”

## 2. How the references inform the system

**shadcn/ui is the starting point for everyday web controls.** Its [Base UI pagination example](https://ui.shadcn.com/docs/components/base/pagination) provides a useful composable model for previous/next links, page numbers, and ellipsis. Extend that restrained language to inputs, buttons, tabs, dialogs, and menus. Apply Stargaze tokens centrally, including square corners and a white active-page treatment. Verify each component's keyboard and screen-reader behavior after customization.

**ObsidianUI informs expressive typography.** Its [Text reel](https://www.obsidianui.dev/docs/text-stream) is a continuous vertical text stream that responds to scroll. Use that idea sparingly on the welcome or marketing surface, with a static equivalent, a pause control if it runs continuously, and reduced-motion support. Keep object names, measurements, navigation, and live observation readouts stationary. Its rounded documentation shell is not part of the proposed geometry.

Both are references for native iOS styling; React components themselves cannot be reused in SwiftUI. Preserve native interactions, text scaling, safe areas, and system dialogs.

## 3. Color and surface tokens

Use a single neutral scale. These are role-based tokens, so a new component can inherit the system without inventing a palette.

| Semantic token | Value | Purpose |
| --- | --- | --- |
| `surface.canvas` | `#000000` | Page background, sky canvas, main shell |
| `surface.panel` | `#0A0A0A` | Quiet grouped content, input fill |
| `surface.overlay` | `#141414` | Menus, dialogs, inspectors |
| `surface.hover` | `#1F1F1F` | Hover and pressed surfaces for dark controls |
| `text.primary` | `#FFFFFF` | Headings, key values, control labels |
| `text.body` | `#E5E5E5` | Paragraphs and longer descriptions |
| `text.secondary` | `#A3A3A3` | Metadata, axis labels, supporting copy |
| `text.muted` | `#8A8A8A` | Placeholder and tertiary text |
| `border.subtle` | `#292929` | Decorative separators, nonessential panel boundaries |
| `border.control` | `#737373` | Input boundaries, unchecked controls, necessary graphical marks |
| `border.strong` | `#FFFFFF` | Selected outlines and emphasis |
| `action.primary` | `#FFFFFF` | Primary button and selected-item fill |
| `action.onPrimary` | `#000000` | Text and icons on white fills |
| `action.primaryHover` | `#E5E5E5` | Primary button hover |
| `action.primaryPressed` | `#CCCCCC` | Primary button press |
| `focus.ring` | `#FFFFFF` | Keyboard focus outside dark surfaces |
| `focus.gap` | `#000000` | 2 px separation between focus and control |

Treat these as opaque colors in normal UI. Stacking opacity changes contrast unpredictably. For camera overlays, use solid black label plates and control surfaces so readability does not depend on the image behind them.

Calculated contrast: `text.muted` has 6.08:1 against the canvas and 4.77:1 against `surface.hover`. `border.control` has 3.48:1 against `surface.hover`. `border.subtle` has only 1.44:1 against black and must never be the only cue identifying an input, focus, selection, or meaningful chart series. Target at least 4.5:1 for normal text and 3:1 for essential graphical boundaries; check the actual adjacent surfaces. See [W3C text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

Success, warning, error, offline, and pending retain separate semantic names even though their colors resolve to the same neutral scale. Distinguish them with a clear icon, a written status, and the appropriate action. An error field gets a 2 px white border, an error icon, and an inline explanation. Focus remains a separate external ring. Destructive actions use explicit verbs and confirmation where recovery is impossible.

The application chrome stays monochrome. Astronomy photographs, camera feeds, and user media retain their source color and provenance; do not silently recolor scientific content. Any optional monochrome media treatment must be labeled as a viewing effect.

## 4. Typography

Choose **Inter**: neutral enough for a large component library and clear at interface sizes. Its optical sizes, tabular figures, and character-disambiguation features suit both bold titles and numerical tables. Use one family rather than adding a decorative display face. See the [official Inter specimen and feature list](https://rsms.me/inter/).

| Role | Web size / line height | Weight | Use |
| --- | --- | --- | --- |
| Display | 56 / 60 px; 36 / 40 px on narrow screens | 700 | Welcome or marketing headline |
| Page title | 36 / 40 px; 28 / 34 px on narrow screens | 600 | Object and catalog titles |
| Section title | 24 / 32 px | 600 | Main sections |
| Component title | 18 / 24 px | 600 | Panel headings |
| Body | 16 / 24 px | 400 | Reading, descriptions, form input |
| Control / table | 14 / 20 px | 500 / 400 | Buttons, rows, compact labels |
| Caption | 12 / 16 px | 400–500 | Supplementary metadata only |
| Key measurement | 28 / 34 px | 500 | A selected object's primary readout |

Use slightly tight tracking (`-0.025em`) for display and page titles, normal tracking for body and controls, and sentence case throughout. Small all-caps labels are optional for short section markers only. Keep reading columns around 60–70 characters wide. Use relative units on the web so text can scale.

Enable tabular numbers for coordinates, timestamps, magnitudes, counters, tables, and changing values. Keep proportional figures in prose. Test the actual font files with `α β γ δ`, `−`, `°`, `′`, `″`, and long catalog identifiers. Apply disambiguation/slashed-zero features only to technical fields where they help.

Self-host licensed Inter web assets when implementing; bundle an appropriate Inter font for iOS. SwiftUI text roles must scale through Dynamic Type instead of fixed pixel equivalents. Native system controls can keep their system typography. Retain the font license with distributed assets.

## 5. Geometry, spacing, and density

| Token family | Values |
| --- | --- |
| Spacing | 4, 8, 12, 16, 24, 32, 48, 64 |
| Radius | 0 for custom buttons, fields, panels, menus, chips, and avatars |
| Stroke | 1 px borders; 2 px focus/selection; 1.5–2 px icons |
| Control height | 44 default; 48 prominent; 32 compact desktop only |
| Row height | 56 comfortable; 40 compact desktop; both are minimums |
| Icon size | 16 inline; 20 controls; 24 main navigation |
| Content inset | 16 mobile; 24 tablet; 32 desktop |
| Section gap | 32 ordinary; 48 major; 64 introductory |

Square geometry applies to interface containers. Astronomical circles, orbit paths, radio indicators, and platform-owned controls keep the shapes their meaning or native behavior requires. Avoid shadows, glows, gradients, blur, and decorative star fields in utility screens.

Comfortable density is the default. Compact density reduces padding and row height without reducing text size or hiding labels. Force effective touch targets of at least 44 × 44 CSS px on touch interfaces and 44 × 44 pt on iOS. Disable compact touch geometry. At large text sizes, let controls and rows grow and wrap.

## 6. Responsive composition

Use reusable layout patterns rather than prescribing one dashboard for every task.

| Pattern | Wide layout | Narrow / large-text layout |
| --- | --- | --- |
| Browse | Search and filter toolbar above a list or table | Search, filter sheet, stacked rows |
| Object detail | Main content with a roughly 320 px inspector where useful | Summary followed by expandable details |
| Sky workspace | Edge controls and optional inspector around a dominant canvas | Dominant sky/camera view with one active detail sheet |
| Reading / community | Centered reading column and inline media | Single column, full-width media within content inset |
| Account | Focused form, maximum width around 440 px | Full-width fields within safe insets |

Start with 640 px and 1024 px layout breakpoints, then adjust based on actual content fit. Use a 12-column desktop grid and a 4-column mobile grid; common content can cap near 1280 px, while a sky map or large data table may use the available width. Add a sidebar only when navigation needs it. Preserve the native Sky, Stars, and Account destinations initially.

Lists should remain usable at 320 px, with names and primary values visible. Hide secondary columns behind a details affordance; allow deliberate horizontal scrolling only for intrinsically two-dimensional content such as a comparison table or sky map. Reading order must stay logical when columns collapse.

## 7. Component families

Build a small set of primitives, then compose domain components from them. Keep visual variants separate from the component's data and loading behavior.

| Layer | Components | Contract |
| --- | --- | --- |
| Foundations | Color, type, spacing, motion, icon, focus, surface | Named semantic tokens; shared definitions |
| Primitives | Button, icon button, field, textarea, checkbox, radio, switch, select, slider | Keyboard, labels, errors, states, density |
| Navigation | Header, tab bar, tabs, breadcrumb, command search, pagination | Clear current position and predictable focus |
| Containers | Section, panel, list, table, dialog, sheet, popover, menu | Consistent spacing, overlay ordering, dismissal |
| Feedback | Inline status, alert, toast, progress, skeleton, empty state | Explain what happened and how to proceed |
| Astronomy | Object identity, coordinate pair, measurement, marker, observer context, visibility state | Units, provenance, precision, selection, missing data |
| Compositions | Catalog row, object summary, sky toolbar, media item, note composer, comparison view | Assemble primitives without introducing new visual rules |

Use dimensions such as `variant`, `size`, `density`, `state`, and content slots. For example, one Button owns primary, secondary, and ghost appearances; an ObjectSummary combines identity, measurement slots, status, and actions. Avoid components with a large set of unrelated flags or one component that attempts to render every astronomy tool.

### Shared component behavior

| Component | Proposed treatment |
| --- | --- |
| Primary action | White rectangle, black label, 500 weight; short explicit verb |
| Secondary action | Dark fill, `border.control`, white label |
| Ghost action | White label, visible hover/focus, no persistent frame |
| Search / input | Permanent label, dark fill, visible border; placeholder is an example, never the label |
| Tabs | White active text with a 2 px underline; readable secondary inactive labels |
| Filters | Square outlined controls; selected fill inverts to white/black and includes a check when applicable |
| Table / list | Horizontal separators, aligned text and tabular numeric columns; selection gets a check or white edge plus accessible state |
| Pagination | Square targets; white active page; `aria-current="page"`; previous/next names; disabled endpoints |
| Panel | Quiet surface and one border only when it adds useful grouping; avoid repeated nested boxes |
| Dialog / sheet | Opaque elevated surface, clear title, close action, contained focus, Escape/dismiss support, focus return |
| Tooltip | Optional explanation available on focus as well as hover; essential information stays visible |
| Toast | Brief outcome feedback; persistent inline errors for problems requiring action |

For pagination, use links for actual navigation and buttons for local state changes. Preserve filters and sorting in the URL when navigating catalog pages. On narrow screens, use “Previous · Page 2 · Next” if a full range will not fit. Never invent totals or page counts.

## 8. Astronomy-specific rules

**Object identity.** Every object component supports a readable name, catalog ID, type, and optional constellation. Keep the same identity hierarchy in search, a sky selection, a detail page, and community content. Start with the current star model; add types such as planets and deep-sky objects through explicit data adapters when the app supports them.

**Measurements.** A Measurement component owns value, unit, label, precision policy, optional uncertainty, and data status. A CoordinatePair specializes that contract for RA/Dec or Alt/Az. Right-align comparable values and reserve stable width for live digits. Copy actions return clearly labeled values with units.

**Formatting.** Default RA to hours/minutes/seconds and declination to signed degrees/minutes/seconds; offer decimal values in technical detail. Altitude and azimuth use degrees. Round only for display and only to justified precision. Magnitude may be negative and is not a percent. Unknown values render “—” with an accessible “Not available” explanation; zero remains zero. Label coordinate frame/equinox/epoch only when supplied by the catalog, and show “not supplied” in technical metadata when absent.

**Observation context.** A reusable context bar shows observing location, date/time with timezone, live versus simulated time, and sensor readiness when relevant. Derived visibility needs an explicit location/time context. Do not present a coordinate as a confident live alignment when permissions, location, or orientation are unavailable. Keep exact private observing location out of public posts by default.

**Sky interaction.** Use compact white star marks, a selected ring or crosshair, and label collision rules that prioritize selection and relevance. Give tiny visual marks larger hit targets, choosing the nearest relevant object when marks overlap. On a camera feed, pair white markers with a dark outline and put text on opaque black backing. Provide a searchable list and a selected-object summary as alternatives to precise pointing or gestures. Calibration, permission denied, and unavailable sensors each need a distinct state and recovery path.

**Charts and timelines.** Keep axes and grids quiet; identify series with direct labels, line style, and marker shape. Meaningful series must meet contrast requirements; subtle borders belong to decoration. Prefer up to four simultaneous series, with filtering or small multiples beyond that. Show units, timezone, legend meaning, missing intervals, uncertainty when supplied, and a table alternative. Never smooth away meaningful gaps or imply that illustrative data is live.

**Media and community.** Use square media containers, clear author/timestamp labels, captions, source attribution, loading/failure placeholders, and consistent reaction controls. Preserve original image aspect ratios in detail views. Treat image, video, and text as related content types rather than separate visual systems.

**Outdoor use.** Keep observation screens mostly black, with small white controls and limited large white areas. An optional dim observation preset can be planned separately after outdoor testing; pitch black alone is not a claim of dark-adaptation protection. The core palette remains monochrome.

## 9. States, accessibility, and motion

Every interactive component needs default, hover where applicable, pressed, focus-visible, selected/on where applicable, disabled, and loading specifications. Every data component also needs empty, no results, partial, unavailable, stale/offline where applicable, and retry states.

Disabled controls lose emphasis and interaction, with an explanation when the reason matters. Loading controls preserve their width and show a label such as “Saving…”; block duplicate submission. Static skeletons reserve content space. Keep existing useful data visible during refresh and label stale data rather than replacing it with an empty screen.

Keyboard focus uses a 2 px white ring with a 2 px black gap. Keep focus distinct from selection, and keep it visible above overlays. Provide visible labels and accessible names, logical headings, keyboard operation, error association, and focus return after dialogs. Respect increased contrast, forced colors on the web, reduced motion, and native accessibility settings.

Set the interaction timing scale to 120 ms for hover/press, 160 ms for a small reveal, and 200 ms for a panel transition. Use simple opacity or position changes, no bounce or parallax in tools. With reduced motion, eliminate spatial and continuous effects. Avoid announcing every sensor update to screen readers; announce requested values and meaningful status changes. A sky view can refresh smoothly while textual values update at a readable cadence.

## 10. Adaptable token architecture

Keep three levels: primitive values → semantic roles → component aliases. For example, neutral white → `action.primary` → `button.primary.background`. Separate density from color and type, so a compact table does not need its own theme.

Proposed implementation locations:

```text
packages/design-tokens/                 canonical neutral, semantic, spacing, type, motion definitions
apps/web/src/styles/tokens.css          generated CSS custom properties
apps/web/src/components/ui/             locally owned shadcn/Base UI primitives
apps/web/src/components/astronomy/      composed domain components
apps/ios/Stargaze/DesignSystem/         Swift colors, scaled typography, spacing, component styles
docs/design-system.md                  decisions, state contracts, acceptance criteria
```

Map shadcn's `background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `accent`, `input`, and `ring` roles to these semantic tokens. Give input boundaries their stronger control token rather than applying a faint decorative border everywhere. Override all derived radius tokens to zero. Keep destructive/status roles semantically distinct even when the palette is shared.

The web currently uses CSS Modules without Tailwind or shadcn. During implementation, configure one shadcn Base UI setup and its required styling foundation, then migrate incrementally. Keep existing layout modules where they remain useful. Do not mix primitive providers casually or copy each library's default visual theme. Use native SwiftUI implementations with the same role names; share design decisions and values rather than React code.

Document each reusable component with its intended use, anatomy, variants, keyboard behavior, density, content limits, full state matrix, responsive behavior, and native counterpart. A new component enters the system when it solves a repeated need or defines a reusable domain contract. Record exceptions instead of adding one-off values silently.

## 11. Rollout for the current app

| Phase | Deliverable | Exit condition |
| --- | --- | --- |
| 1 · Foundations | Inter, monochrome tokens, spacing, square geometry, icon and focus rules | Web specimen and SwiftUI gallery agree on the same roles |
| 2 · Core controls | Buttons, fields, tabs, rows, feedback, dialog/sheet, pagination specimen | All relevant states work with keyboard, touch, and text scaling |
| 3 · Catalog and detail | Search, object rows, identity, measurements, media, clear data states | Readable dense and narrow layouts; missing values remain honest |
| 4 · Sky and account | Camera-safe controls, selected-object detail, sensor states, forms | Readable on varied camera imagery; native permissions and text sizes supported |
| 5 · Extended tools | Charts, timelines, comparison, observing plans, expanded object types | Each new tool composes the same primitives and formatting contracts |

Start implementation with the star catalog and object detail. They test identity, typography, density, interaction, and scientific data before adding the complexity of a live camera background.

Repository constraints discovered during planning:

- The current web theme uses navy gradients, blue/gold accents, Instrument Serif and Syne, and rounded controls. These would be replaced by the proposed foundation during implementation.
- The catalog API currently accepts search and a limit; it does not return page metadata or totals. Real numbered pagination requires an API contract with stable ordering and totals, or a cursor contract with previous/next behavior. A visually complete pagination control alone is insufficient.
- Web catalog failures currently fall back to an empty list, and detail fetch failures can appear as “not found.” Implement distinct unavailable, empty, and missing-object states as part of the migration.
- Current iOS sky content is a list overlay rather than completed spatial star markers. The marker, chart, planning, and comparison patterns above are future component contracts, not claims about present features.
- The current shared Star model has RA, Dec, nullable magnitude/constellation, and identity fields. Provenance, uncertainty, coordinate metadata, and broader object types need explicit data support before appearing as factual UI.

## 12. Acceptance criteria

- Main application surfaces are true black; UI colors are neutral and come from named tokens.
- Custom controls and panels use square geometry and consistent line weights.
- The same object identity and measurement rules work in a row, card, detail, and sky selection.
- Density changes padding, not legibility; touch targets remain usable.
- Text and meaningful controls meet contrast targets on their actual surfaces, including camera overlays.
- Keyboard and screen-reader users can complete catalog search, detail reading, authentication, and note creation as those flows become available.
- Layouts work at 320 px, 200% text scaling, and large native Dynamic Type sizes, with deliberate handling of two-dimensional content.
- Empty, unavailable, missing, stale, and zero are visually and semantically distinct.
- Reduced motion removes continuous text effects and nonessential spatial transitions.
- Source imagery and measured data retain their meaning, units, and attribution.

Validation should include a component gallery, representative web/mobile screenshots, keyboard and VoiceOver checks, contrast checks, long text and missing-data fixtures, and observation controls tested over both bright and dark camera imagery. These are implementation acceptance checks; they have not yet been performed against a redesigned app.

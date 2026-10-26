# Stargaze frontend reference

A working catalog reference for the monochrome design system. Built with Next.js, React, the official shadcn Base UI components, and self-hosted Inter. No API or account setup is required for this sample.

## Run

From the repository root:

```sh
pnpm install
pnpm dev:web
```

The normal development port is 3000. To run alongside another frontend:

```sh
pnpm --filter @stargaze/web exec next dev --hostname 127.0.0.1 --port 3100
```

For backend development use root `pnpm dev`: `/api` on the Next.js origin proxies to `API_UPSTREAM`
(default `http://127.0.0.1:4000`). Include the browser origin in the API's `APP_ORIGIN` configuration.
Root `pnpm build` produces the Next.js static export in `apps/web/out`; root `pnpm start` serves the export
and API together on port 4000. The package's `start` command delegates to that root startup.

## Reference flows

- Search by star name or constellation; filter by constellation and sort by brightness or name.
- Browse three pages of catalog records and select a star to inspect its coordinates and constellation.
- Save and unsave stars. Add, edit, or delete a personal note.
- On narrow screens, inspect a star in a modal sheet with keyboard focus restoration.
- Open Data sources for catalog provenance and license attribution.

Saved stars and notes are stored locally under `stargaze-reference-library-v1`. They are browser-specific and do not sync to an account. If storage is unavailable, the same controls work for the current session.

## Component structure

`src/app/globals.css` defines the neutral semantic tokens, typography, layout, and responsive rules. UI colors are black, white, and neutral gray. Custom geometry is square; controls keep at least 44 px targets.

`src/components/ui` contains official shadcn Base UI sources adapted centrally to the system. `Button` adds a row variant; `Pagination` adds native button variants for local pagination. Dialogs, sheets, tabs, selects, fields, tables, empty states, and inputs retain their library behavior.

`src/components/catalog` composes the catalog shell, toolbar, table, and source dialog. `src/components/astronomy` contains the reusable selected-star detail and code-rendered constellation diagram. `src/hooks/use-library.ts` owns validated local persistence.

## Design system

Use the current primitives and semantic tokens as the foundation for new screens. Keep the interface flat, task-focused, and monochrome. Hierarchy comes from typography, spacing, selection, and a clear primary action. Avoid decorative badges, nested card grids, feature subtitles, gradients, glows, and background imagery.

### Color roles

| Tokens | Value | Use |
| --- | --- | --- |
| `--background` | `#000000` | Pitch black page canvas |
| `--foreground`, `--ring` | `#FFFFFF` | Main text and focus |
| `--card` | `#0A0A0A` | Quiet grouped surface |
| `--popover`, `--secondary`, `--muted` | `#141414` | Overlays and selected/hover surfaces |
| `--accent` | `#1F1F1F` | Stronger interactive highlight |
| `--primary` / `--primary-foreground` | `#FFFFFF` / `#000000` | Primary action inversion |
| `--body-text` | `#E5E5E5` | Longer content |
| `--muted-foreground` | `#A3A3A3` | Supporting data and labels |
| `--border` | `#292929` | Quiet separators |
| `--input`, `--chart-line` | `#737373` | Identifiable control borders and diagram lines |

Use the stronger input border for controls; a quiet separator alone cannot identify an input. Keep status roles distinct in code even when they share white text. Explain errors and destructive actions with explicit labels and appropriate confirmation, rather than relying on color. Content photographs or scientific imagery may retain meaningful source color when later added.

### Typography and geometry

Inter Variable is self-hosted through `@fontsource-variable/inter`. Use the same family across headings, controls, reading, and data.

| Role | Current scale |
| --- | --- |
| Page title | 36–56 px, 600 weight, 1.12 line height |
| Selected-object title | 36 px, 600 weight |
| Dialog/sheet title | 24 px / 32 px, 600 weight |
| Body, data rows, input/select, navigation | 16 px; 400 or 500 weight |
| Buttons, measurements, table headings, metadata | 14 px; 400 or 500 weight |

Use tight tracking only on large titles, sentence case for controls, and tabular numerals for aligned measurements and page counts. Keep names readable and let long content wrap. Additional UI copy must identify content, state, or an action; put feature explanations in documentation.

All custom container and control radii are zero. Use 1 px structural lines and 2 px selection/focus indicators. Spacing follows a 4 px rhythm, with 12 px toolbar gaps, 24 px component spacing, and 32–56 px section spacing. Buttons and icon targets are at least 44 px; toolbar fields and prominent buttons are 48 px. Catalog rows are 64 px on desktop and 76 px on narrow screens.

The page caps at 1512 px with responsive gutters. At 1000 px and below, selected details move into a modal sheet. At 640 px and below, secondary table metadata moves under the object name; at 480 px and below, filter controls stack. Extend these rules according to content fit, without shrinking text or touch targets.

### Control hierarchy and states

- Use one white primary action in a task area, outlined secondary actions, and ghost/link variants for low-emphasis controls. Use the existing `row` variant for object selection.
- Keep navigation selection distinct from keyboard focus: tabs use an underline, catalog selection uses a white edge, and paging uses white/black inversion.
- Compose forms with `FieldGroup`, `Field`, labels, and the library inputs. Icon actions need accessible names; controls must remain understandable without hover or helper paragraphs.
- Preserve Base UI keyboard behavior. Modal dialogs and sheets contain focus and restore it to an existing trigger or stable fallback. Nonmodal inspectors do not trap focus.
- Every new component must account for disabled, focused, selected, empty, unavailable, and loading states where relevant. Never display missing measurements as zero.
- Keep the 2 px white focus outline with a black separation gap. Respect reduced motion and forced-colors settings. Announce meaningful state changes without announcing every sensor or numeric update.

### Extending the system

Build domain components by composing the local shadcn primitives; change their shared variants centrally rather than restyling each instance. Keep data, formatting, persistence, and presentation separate.

For astronomy diagrams, use source-backed coordinates and geometry, consistent units, explicit provenance, accessible titles, and a suitable projection. Use neutral lines, marker shapes, and selected rings instead of decorative star fields or color-only encoding. Future live sky views need actual observer/time/sensor context; the current constellation diagram is a catalog reference.

For denser data, adjust spacing and column disclosure before reducing text size. Keep numeric alignment, units, missing-value treatment, sorting, and selection consistent. For new forms, reuse the input and field contracts, inline validation, and deliberate primary/secondary actions.

[shadcn Base UI](https://ui.shadcn.com/docs/components/base/pagination) supplies the reusable controls. Reserve [ObsidianUI Text Stream](https://www.obsidianui.dev/docs/text-stream) for a future surface that actually presents streamed content; it is not added to this static catalog. Measurements, navigation, and object names remain stationary. Build and verify the interface directly in code; do not use Image Gen for this reference or its UI extensions.

## Data

`src/lib/star-catalog.ts` contains 24 real named stars and the relevant constellation geometry extracted from the repository's catalog bundle. RA/Dec use J2000. The map uses a centered stereographic projection, north up and east left; it is a constellation reference rather than a live observer-position sky view.

The derived data retains the catalog's CC BY-SA attribution. See `catalog/README.md` at the repository root. No generated images are used in the frontend.

## Validation

```sh
pnpm --filter @stargaze/web exec tsc --noEmit
pnpm --filter @stargaze/web build
```

When extending the reference, check both desktop and narrow layouts, keyboard focus, empty filters, long names, and persistent saved/note state. Keep actual data and labels in the interface; put feature explanations in documentation.

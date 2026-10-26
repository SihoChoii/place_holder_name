# StarTagger frontend

Live HYG v4.4 sky, a full accessible catalog, public star pages, and existing-account login/logout. Built on the existing Next.js 15, React 19, Tailwind 4, shadcn Base UI, and self-hosted Inter foundation. The sky and catalog do not wait for the account or community API. Community information requires the same-origin API; unavailable ownership is explicitly unknown.

## Run

From the repository root:

```sh
pnpm install
pnpm dev
```

The normal development port is 3000. For catalog/sky-only development, `pnpm dev:web` works without an API; account and community failures remain visible. To run alongside another frontend after generating the catalog with `pnpm --filter @stargaze/web exec node scripts/catalog.mjs`:

```sh
pnpm --filter @stargaze/web exec next dev --hostname 127.0.0.1 --port 3100
```

For backend development use root `pnpm dev`: `/api` on the Next.js origin proxies to `API_UPSTREAM`
(default `http://127.0.0.1:4000`). Include the browser origin in the API's `APP_ORIGIN` configuration.
Root `pnpm build` produces the Next.js static export in `apps/web/out`; root `pnpm start` serves the export
and API together on port 4000. The package's `start` command delegates to that root startup.

If the optional LAN model hosts are unavailable, the read-only frontend can run with moderation disabled. With dependencies and the existing `.env`/JWT secret prepared:

```sh
pnpm build
GUIDE_BASE_URL=http://127.0.0.1:9 CLEF_BASE_URL=http://127.0.0.1:9 MODERATION_ENABLED=false APP_ORIGIN=http://127.0.0.1:4000,http://localhost:4000 pnpm start
```

Those model addresses are deliberately unavailable; this does not simulate successful inference or approve content. Use configured real hosts for moderation/guide verification. Restart the API after rebuilding because its static file routes are registered at startup.

## Working flows

- `/`: live time and observer sky; drag, wheel/pinch zoom, hover/tap preview, and keyboard arrows/+/-/Enter/Escape. Daylight reduces visible stars; choose a currently dark preset to explore a night sky at the same live time.
- The Earth globe shows the current observer and a rectangular heading/FOV indicator. Starbase, Greenwich, Paranal, custom coordinates, and explicit GPS retry are available. One initial location request is nonblocking, with provisional Starbase and denial/timeout fallback. A manual selection wins over late GPS.
- `/star?hyg_id=32263`: real catalog facts, current public ownership, approved posts/media/comments, Find in sky, and a shareable URL. `/star/32263` redirects to that single exported shell. Invalid query IDs show an in-page not-found state (HTTP 200 shell); invalid clean aliases return HTTP 404. The star page now includes a guide chat panel and an 'About this star' blurb component (requires login).
- `/login`: existing accounts, same-origin HttpOnly session cookie, return to the original star, and logout. No token is persisted in browser storage. Signup and social writes are deferred.
- `/catalog`: all 8,920 records, search by name/HYG/HIP/constellation, 88 constellation filters, brightness/name sorting, bounded paging, and keyboard-accessible details.
- Save and unsave stars. Add, edit, or delete a personal note.
- On narrow screens, inspect a star in a modal sheet with keyboard focus restoration.
- `/credits` and the existing Data sources dialog share attribution and scientific limitations.

The API has no complete public claims index. Unchecked, failed, expired, or version-mismatched ownership is **unknown**. A selected/previewed star is checked using `/api/public/stars/:hyg_id`; confirmed unclaimed stars have one ring and confirmed claimed stars two. Feed absence is never treated as unclaimed. Selected public details poll every five seconds while visible; ownership cache freshness is bounded to 15 seconds.

Saved stars and notes are stored locally under `stargaze-reference-library-v1`. They are browser-specific and do not sync to an account. If storage is unavailable, the same controls work for the current session.

## Component structure

`src/app/globals.css` defines the neutral semantic tokens, typography, layout, and responsive rules. UI colors are black, white, and neutral gray. Custom geometry is square; controls keep at least 44 px targets.

`src/components/ui` contains official shadcn Base UI sources adapted centrally to the system. `Button` adds a row variant; `Pagination` adds native button variants for local pagination. Dialogs, sheets, tabs, selects, fields, tables, empty states, and inputs retain their library behavior.

`src/components/catalog` composes the catalog shell, toolbar, table, and source dialog. `src/components/astronomy` contains the reusable selected-star detail and code-rendered constellation diagram. `src/hooks/use-library.ts` owns validated local persistence.

`src/sky` owns observer state, astronomy, the SVG globe, canvas renderer, and pointer/keyboard picking. Projection and picking share one visible-point list. The render loop is outside React, pauses while hidden, caps DPR at two, and redraws for input or the live one-second clock. `src/lib/catalog.ts` loads the versioned asset once. `src/lib/api` validates actual shared schemas and caches public details. `src/features` composes auth, public details, approved posts, header, credits, and the guide chat/blurb components.

## Design system

Follow the [StarTagger brand guide](../../docs/brand/README.md). The shared header pairs the supplied compact LED star (48 px desktop, 40 px mobile) with live Inter 650 text. Loading uses the same static mark; content appears as soon as it is ready. The legacy favicon is retired pending a dedicated small-size asset from the guide. Internal package names and browser storage keys remain unchanged.

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

For astronomy diagrams, use source-backed coordinates and geometry, consistent units, explicit provenance, accessible titles, and a suitable projection. Use neutral lines, marker shapes, and selected rings instead of decorative star fields or color-only encoding. Keep the existing constellation reference separate from the live observer-position sky.

For denser data, adjust spacing and column disclosure before reducing text size. Keep numeric alignment, units, missing-value treatment, sorting, and selection consistent. For new forms, reuse the input and field contracts, inline validation, and deliberate primary/secondary actions.

[shadcn Base UI](https://ui.shadcn.com/docs/components/base/pagination) supplies the reusable controls. [ObsidianUI Text Stream](https://www.obsidianui.dev/docs/text-stream) is a scroll-driven text reel, not an incremental AI-answer renderer; it is not installed. Measurements, navigation, and object names remain stationary. Build and verify the interface directly in code; do not use Image Gen for its UI extensions.

## Data

`scripts/catalog.mjs` verifies the pinned `catalog/stars.json` SHA-256, 8,920 unique IDs, magnitude cutoff, Sun exclusion, and constellation endpoints. Build/dev generate `public/catalog/hyg-4.4-mag6.5-20261025.json` (1,148,587 bytes). Its compact tuples preserve units, estimates, attribution, and all 205 null distances. Catalog versions must match the API before joining ownership. No response fixtures are imported by production code.

RA/Dec are J2000 degrees. The live sky applies IAU 1976 precession, sidereal rotation, geometric altitude/azimuth, and perspective projection. The Sun is approximate; there is no atmospheric refraction, proper motion, lunar/planet rendering, or measured 0.1° accuracy claim. `src/lib/star-catalog.ts` retains the original constellation reference geometry, north up/east left, for local saved-star details.

`public/earth-land.json` is derived from Natural Earth's public-domain 1:110m land geometry; see the source and checksums in [the execution handoff](../../docs/frontend-execution.md). The globe rectangle is a heading/FOV schematic, not a geographic footprint.

The derived data retains the catalog's CC BY-SA attribution. See `catalog/README.md` at the repository root. No generated images are used in the frontend.

## Validation

```sh
pnpm typecheck
pnpm test
pnpm test:web:browser
```

The browser script needs installed Playwright and Chromium; use `PLAYWRIGHT_MODULE` and `BROWSER_EXECUTABLE` when they are provided outside the workspace, and `BROWSER_ARTIFACTS` for an existing evidence directory. It starts the actual built API/static export on a random loopback port with a disposable database. Genuine API login/claim/pending visibility cases are separated from explicit shared-fixture approved-media UI cases. No existing database is seeded or changed by this test.

See [the execution handoff](../../docs/frontend-execution.md) for exact commands, evidence, and remaining full-product gates. When extending the app, check desktop/narrow layouts, focus, missing facts, failed APIs, and persistent saved/note state.

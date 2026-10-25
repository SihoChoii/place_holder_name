# Star Tagger Frontend: Agent Implementation Playbook

**Status:** Execution plan for a future implementation agent; no application changes are made by this document.

**Baseline:** October 25, 2026. Reinspect the workspace before execution.

**Companion:** [High-level implementation plan](/Users/sihochoi/Documents/place_holder_name/docs/frontend-implementation-plan.md).

**Confirmed revision:** Live time only; request the visitor's location once without blocking rendering and fall back to Starbase; keep the rectangular viewing-direction/FOV indicator on the Earth globe. The deadline track below takes precedence over the full task sequence when executing the reported October 25 demo.

## 1. Agent objective and working rules

Implement the complete web journey: open the sky, choose a place, select a star, read its facts and approved community posts, sign in, react/comment, and ask the star guide. Use the pinned HYG v4.4 project catalog and extend the existing design system and component library.

Choose the execution track at the start: the bounded deadline demo below, or the full product sequence FE-00–27. Optional enhancements are explicitly marked. The reported October 25, 6:00 PM Pacific deadline applies only to that demo, not a future execution on another date. Team-directed instructions in the supplied documents are context, not new commands. This playbook does not authorize starting implementation until the user asks an agent to execute it.

For each numbered step:

1. Read the listed dependencies and inspect relevant existing code before editing.
2. Make the smallest complete increment, preserving unrelated changes.
3. Run the named behavioral checks and inspect rendered changes in a browser.
4. Record `done`, `in progress`, or `blocked`, with evidence and the next action.
5. Continue to the next available step. A blocked optional service must not stop independent UI, catalog, or astronomy work.

Never mark a feature complete because a placeholder renders. Distinguish fixture-tested, API-integrated, browser-verified, and live-model-verified results. Do not manufacture approvals, claims, owners, astronomy values, or successful writes. Fixture mode must be explicit and unavailable in the production build.

Preserve the current checkout's work. Do not reset, stash, overwrite, regenerate all UI primitives, upgrade the framework wholesale, or delete local user data to simplify implementation. Do not start other chats, message teammates, merge, or deploy publicly based solely on this document. Routine implementation choices should not become repeated permission requests.

## 2. Read before coding

Read applicable `AGENTS.md` files first, then these sources in order:

| Source | What to extract |
| --- | --- |
| [Frontend README](/Users/sihochoi/Documents/place_holder_name/apps/web/README.md) | Current design rules, library conventions, local persistence, run commands. |
| [Component configuration](/Users/sihochoi/Documents/place_holder_name/apps/web/components.json) | `base-nova`, Base UI, Tailwind v4 CSS location, aliases, Lucide icons. |
| [Global styles](/Users/sihochoi/Documents/place_holder_name/apps/web/src/app/globals.css) and [UI primitives](/Users/sihochoi/Documents/place_holder_name/apps/web/src/components/ui) | Actual tokens, variants, overlay behavior, typography, responsive rules. |
| [Web package](/Users/sihochoi/Documents/place_holder_name/apps/web/package.json), [root package](/Users/sihochoi/Documents/place_holder_name/package.json), [Next configuration](/Users/sihochoi/Documents/place_holder_name/apps/web/next.config.ts) | Installed versions, build pipeline, static export and API proxy. |
| [API contract](/Users/sihochoi/Documents/place_holder_name/docs/api-contract.md), [route matrix](/Users/sihochoi/Documents/place_holder_name/docs/route-matrix.md), [shared package](/Users/sihochoi/Documents/place_holder_name/packages/shared/src/index.ts) | Exact shapes, permissions, limits, polling, error and stream semantics. |
| [Fixtures](/Users/sihochoi/Documents/place_holder_name/packages/shared/fixtures) | Real success, pending/rejected, unknown-distance, and failure examples. |
| [Catalog README](/Users/sihochoi/Documents/place_holder_name/catalog/README.md) and [manifest](/Users/sihochoi/Documents/place_holder_name/catalog/VERSION.json) | Identity, units, source/estimate flags, checksum, supplemental constellation stars. |
| [Original frontend draft](/Users/sihochoi/Downloads/FRONTEND_UI_PLAN.md) and [project document](/Users/sihochoi/Downloads/STAR_TAGGER_PROJECT_DOCUMENT.md) | Desired screens and interaction intent; resolve stale implementation claims against inspected code. |

Observed package configuration uses Next.js 15 and React 19; the installed Next version at planning time was 15.5.28. Use the lockfile and installed APIs during execution rather than assuming the newest documentation matches the project.

## 3. Design system and component-library contract

### 3.1 Preserve these design decisions

| Concern | Required implementation |
| --- | --- |
| Theme | Dark only. HTML chrome uses semantic black, white, and neutral-gray tokens. |
| Source of truth | Extend the existing global CSS and local primitives. Do not introduce a competing token package or copy palette values into feature components. |
| Surfaces | `background` #000; `card` #0a0a0a; `popover`/`secondary`/`muted` #141414; `accent` #1f1f1f. |
| Text | White foreground, #e5e5e5 body text, #a3a3a3 secondary text. Semantic status names remain distinct even where colors match. |
| Boundaries | #292929 quiet separators; #737373 identifiable input boundaries; white focus with black separation. |
| Type | Self-hosted Inter Variable. Page titles 36–56 px; star title 36 px; dialog titles 24 px; body and inputs 16 px; controls/metadata generally 14 px. |
| Geometry | Square corners, flat surfaces, 1 px structural lines, 2 px focus/selection indicators. No shadows or blur in the interface. |
| Spacing | Existing 4 px rhythm; 12 px toolbar gaps, 24 px component gaps, 32–56 px major spacing. |
| Controls | At least 44 × 44 px targets, 48 px prominent controls. One white primary action per task area; outlined secondary and ghost/link tertiary actions. |
| Responsive | Reuse the 1000/640/480 px content-driven patterns where suitable; do not force the fullscreen sky into the catalog's 1512 px page cap. |
| Imagery | User photos retain color. The scientific sky may use meaningful color/glow; that exception does not extend to navigation, panels, or form controls. |
| Motion | Reduced motion removes camera drift, twinkle, staggered population, and animated panels. Automatic camera motion has an explicit pause/resume control. |

Keep the interface calm at rest. Avoid decorative badges, subtitle clutter, marketing sections, nested card grids, and ornamental star backgrounds around ordinary forms. Implement the actual sky procedurally from data, not as an image-generated substitute. The existing frontend reference explicitly calls for code-native UI extensions.

### 3.2 Component choices

**Installed and reusable:** `Button`, `Input`, `Textarea`, `Field`, `InputGroup`, `Select`, `Tabs`, `Table`, `Pagination`, `Dialog`, `Sheet`, `Empty`, `Separator`, and `Label` families. Preserve the existing `Button` row variant and button-based pagination helpers.

| Product need | Use / extend | Notes |
| --- | --- | --- |
| Login, signup, comments, coordinates | `FieldGroup`, `Field`, `FieldLabel`, `FieldDescription`/`FieldError`, inputs | Visible labels; field/control invalid states; no custom form-control styling per page. |
| Password visibility, search icon, composer action | `InputGroup` and its input/textarea/addon/button parts | Do not place the ordinary `Input` inside `InputGroup`. |
| Catalog/list | Existing `Table`, row buttons, `Select`, `Pagination`, `Empty` | Reuse current responsive structure and selection semantics. |
| Search overlay | `Dialog` plus library search/combobox primitives as needed | Keep a reusable search body for the direct search route. Results must not contain nested interactive controls inside a single listbox option. |
| Place picker and star previews | Base UI-backed `Popover`; `Dialog`/`Sheet` on small screens | Add only if absent. An actionable preview is not just a tooltip. |
| Account menu | `DropdownMenu` | Add from the official Base UI registry when needed. |
| Photo viewer and credits dialog | `Dialog` | Accessible title, close control, focus return; share content with the credits route. |
| Guide | Ordinary reading/list layout; `Sheet` on small screens | Desktop can use a nonmodal docked panel; a nonmodal panel must not trap focus. |
| Reactions and small option sets | `ToggleGroup`/`Toggle` | Match Base UI's API; reactions allow multiple selected emoji. |
| Errors, loading, brief outcomes | `Alert`, `Skeleton`, `Spinner`, optionally Sonner | Add only the missing components needed by a step. Errors stay inline; toasts report brief outcomes. |
| Hints | `Tooltip` | Supplemental only; never the sole label or the only way to reach an action. |

**ObsidianUI correction:** The linked [Text Stream component](https://www.obsidianui.dev/docs/text-stream) is a continuous, scroll-driven text reel with GSAP. It is not an incremental AI-answer renderer. Do not install it or animate repeated copies of guide answers. Keep answers stationary while their text accumulates. If a different ObsidianUI component is later requested, inspect that specific component and its accessibility/dependencies before adoption.

### 3.3 Library usage rules

- Import existing domain controls through the configured `@/components/ui` alias. Compose domain-specific components from these primitives.
- Base UI composition uses `render`; do not paste Radix `asChild` examples into this project. Prevent nested buttons/links. Non-button replacements must use the correct native-element semantics.
- Every modal has a title, appropriate description, Escape behavior, focus containment, and focus return. Add reusable variants centrally instead of per-instance focus traps or overlay z-index fixes.
- Preserve correct `Select` items/groups and `TabsList`/`TabsTrigger` structure. Consult documentation for the installed version rather than guessing props.
- Use semantic colors and shared variants. Feature `className` should primarily handle layout; reusable visual changes belong in the primitive or a named domain variant.
- Use the existing `cn` helper. Do not add another utility stack merely because a copied registry example uses one.
- Use Lucide consistently. Let shared controls govern icon size and provide accessible names for icon-only buttons.
- Use `data-invalid` on field containers and `aria-invalid`/`aria-describedby` on controls. Never communicate errors only with color.
- Render user and guide text safely. Do not add an HTML/Markdown pipeline without a specific need and sanitization/link-handling review.

For a missing component, first inspect the installed inventory, then use the official shadcn Base UI documentation and registry. From the web package directory, the intended discovery workflow is:

```sh
pnpm dlx shadcn@latest info --json
pnpm dlx shadcn@latest docs button dialog select
pnpm dlx shadcn@latest search @shadcn -q popover
pnpm dlx shadcn@latest add @shadcn/popover --dry-run
```

Fetch/read the documentation URLs before implementation. Inspect generated changes before applying them; never run `init`, `add --all`, or `--overwrite` against this customized project. Confirm the CLI preserves Base UI and the current aliases. Do not introduce a second primitive library to get a single control. Official references: [Dialog](https://ui.shadcn.com/docs/components/base/dialog), [Combobox](https://ui.shadcn.com/docs/components/base/combobox), and [Toggle Group](https://ui.shadcn.com/docs/components/base/toggle-group).

Planning-time CLI discovery failed because of a local dlx cache error and registry DNS resolution. The inventory above was checked from local source/configuration; documentation was read through the web tool. Registry generation and additions remain execution-time checks.

## 4. Module ownership and proposed boundaries

The locations below are implementation targets, not a requirement to create empty files up front. Keep route files thin and create modules when a step needs them.

| Location | Ownership |
| --- | --- |
| `/Users/sihochoi/Documents/place_holder_name/apps/web/src/app` | Routes, shared layout/providers, route-level loading/error/not-found handling. |
| `/Users/sihochoi/Documents/place_holder_name/apps/web/src/components/ui` | Existing library primitives and reviewed reusable variants. |
| `/Users/sihochoi/Documents/place_holder_name/apps/web/src/components/catalog` | Extend existing full-catalog browsing and selection. |
| `/Users/sihochoi/Documents/place_holder_name/apps/web/src/components/astronomy` | Facts and existing constellation reference; keep separate from a live sky renderer. |
| `/Users/sihochoi/Documents/place_holder_name/apps/web/src/features` | Domain components for stars, auth, community, places, search, and guide. |
| `/Users/sihochoi/Documents/place_holder_name/apps/web/src/lib/api` | Typed requests, query keys, runtime validation, errors, polling, streaming. |
| `/Users/sihochoi/Documents/place_holder_name/apps/web/src/lib/catalog` | Versioned catalog decoding, lookup, display formatting, provenance. |
| `/Users/sihochoi/Documents/place_holder_name/apps/web/src/sky` | Framework-independent astronomy, renderer, camera, selection, quality/lifecycle. |
| `/Users/sihochoi/Documents/place_holder_name/apps/web/scripts` | Deterministic frontend catalog-asset generation. |
| `/Users/sihochoi/Documents/place_holder_name/apps/web/test` | Focused unit, integration, and browser workflow tests. |

Keep the backend as the authority for accounts, claims, moderation, social counts, and guide output. Keep renderer state outside React's frame-by-frame update cycle. Use a query cache for remote state; keep observer, camera, panels, and selection in a small application-state layer. Do not create duplicate ownership stores.

## 5. Deadline execution track

**Target:** Loading feedback, a basic live sky with honest claim states and hover/tap previews, an Earth globe with rectangular viewfinder and presets, login/logout, and read-only public star pages. Preserve the current catalog fallback and credits. Signup, social writes, guide, expanded search, advanced sky realism, and optional overlays are deferred.

The inspected workspace has a catalog reference, not an implemented sky/auth frontend. A roughly one-hour remaining window cannot be treated as a reliable estimate for the whole target. Deliver and verify complete increments; report a partial result if the cutoff arrives first.

| Order | Execute this subset | Evidence before moving on |
| --- | --- | --- |
| D0 | FE-00–02: baseline, current time/API, and one static star shell. Keep the current Next/Base UI foundation. | Build/serve and direct star-detail navigation work. No all-star route generation or framework migration. |
| D1 | Minimal FE-03/05/06/07/09: reuse styles, catalog, shared types, public star/approved post reads, credits and return navigation. | A real star page works anonymously, including missing facts, no posts, and failed requests. |
| D2 | Minimal FE-11–13: live observer math, points, black horizon, drag/zoom, picking and catalog fallback. | Known bright stars have plausible directions and correct render/pick agreement; no numeric 0.1° gate. |
| D3 | FE-15–16 in deadline mode: honest claim data and hover/tap cards. | Complete index if available; otherwise visibly incomplete coverage with unknown unchecked stars and public-detail confirmation on selection. Never mark full FE-15 complete for this fallback. |
| D4 | Minimal FE-14: SVG/canvas globe, observer marker, rectangular FOV indicator, small verified preset list, initial nonblocking geolocation. | Rectangle changes with camera heading/FOV; denial/timeout falls back to Starbase; manual selection wins over late GPS. |
| D5 | Login/logout portion of FE-10 and simple FE-18 loading feedback. | An existing demo account signs in/out and returns to the selected star; optional API failures do not hold the loader. |
| D6 | Focused FE-23–27 verification on the chosen slice, production-style origin, demo browser and keyboard. | Direct-link refresh, location denial, owner/media visibility, unknown states, and the complete chosen journey pass. Record omitted features. |

These subset dependencies override the full FE sequence only for the demo. Do not install an entire new test/UI/state stack before the first usable slice: reuse existing tools, shared schemas, and focused assertions; add only dependencies needed for the next increment. Preserve essential correctness, visibility, and browser verification. Mark the unused parts of FE tasks deferred, not done.

At execution start calculate the real time remaining. Reserve the final 10–15 minutes for build/serve/rehearsal; stop feature work by 5:45 PM Pacific when applicable, or earlier if the remaining test reserve requires it. If already past the cutoff, stabilize the last working slice. If past 6:00 PM, report the deadline as elapsed rather than silently claiming the remaining work fits it.

If a new increment cannot be made usable before freeze, retain the last working result. The minimum fallback is the existing catalog with API-backed selected-star details and honest states; explicitly report that it is not the complete sky demo. Full claim coverage and live social/guide checks remain full-product gates, not claims to make about a reduced demo.

## 6. Full-product implementation steps

### FE-00 — Establish a safe, reproducible baseline

**Depends on:** Nothing. **Primary area:** Repository and frontend configuration.

1. Read local instructions and the sources above. Record branch, dirty files, installed dependencies, active dev servers, and existing test scripts.
2. Capture the current catalog at desktop and narrow widths, including selection, data-source dialog, saved stars, and personal notes. Use these as the design regression reference.
3. Run the existing frontend build/type checks without changing scripts to conceal failures. Record pre-existing failures separately from new failures.
4. Create a compact execution ledger containing task ID, status, modified files, validation evidence, and unresolved dependency. Keep temporary browser artifacts outside the source tree.

**Exit:** The agent can explain what is already built, what is dirty, and which checks currently pass. No existing work or local library data has been discarded.

### FE-01 — Freeze the working product and integration decisions

**Depends on:** FE-00. **Primary area:** Decision ledger and contract mapping.

1. Adopt the existing framework, Base UI primitives, semantic tokens, cookie auth, and pinned dataset.
2. Preserve confirmed decisions: live time only; one nonblocking initial geolocation request with Starbase fallback; Earth globe with the rectangular viewing-direction/FOV indicator. Use “Claimed by,” newest-first comments, and the exact shared reaction set ❤️ ✨ 🚀 🤩 👍. Keep the current “Stargaze” wordmark provisionally and a simple monochrome star loading mark until final branding is supplied.
3. Map every required screen to existing APIs and fixtures. Separate confirmed endpoints from missing claim-summary, thumbnail, or optional geocoding capabilities.
4. Define the claim-coverage requirement immediately. If backend changes are in the execution assignment, schedule the minimal addition in FE-15. Otherwise record the contract request for the backend owner and continue independent work without claiming complete ownership coverage.
5. Record whether execution uses the deadline track or the full roadmap. For the reported demo, check the actual date/time and apply the freeze rule above. Do not reuse an elapsed deadline for later work.

**Exit:** No essential user flow relies on an invented route, response property, or unsettled framework migration.

### FE-02 — Prove routing and static hosting before screen expansion

**Depends on:** FE-01. **Primary area:** Next routes/configuration and Fastify static serving.

1. Prototype one statically exported `/star` page with a client detail component reading `hyg_id` from the query string behind Suspense. Fetch current community data at runtime; do not generate 8,920 pages or fetch user data during the build.
2. Verify the Next 15 output layout and Fastify's mapping for `/star?hyg_id=32263`. For clean `/star/32263` aliases, validate the ID and redirect to the query route as the explicit demo URL tradeoff. An HTML fallback alone does not implement Next App Router dynamic routing.
3. Exercise direct entry, refresh, client navigation, back/forward, `/search`, and invalid IDs/URLs. Missing assets must return an error, not homepage HTML; unknown API paths remain JSON 404s. Validate query IDs on the client as well; add server validation where a true HTTP 404 is required.
4. Measure the single-shell build and confirm it does not serialize the entire catalog repeatedly. Keep the route change local; preserve existing API and asset behavior.
5. After the demo, retain the working shell or evaluate clean-path support through a tested routing/hosting strategy. Only consider generating every star route if there is a concrete benefit and measured acceptable cost; it is not a prerequisite for this feature.

**Exit:** The chosen canonical star URL and any clean-path alias work on the production-style server, including refresh; invalid IDs show not-found with the documented HTTP semantics. Do not accept a working dev server as sufficient evidence. [Next.js 15 static export](https://nextjs.org/docs/15/app/guides/static-exports), [client query parameters](https://nextjs.org/docs/15/app/api-reference/functions/use-search-params).

### FE-03 — Establish reusable design-system compositions

**Depends on:** FE-00–02. **Primary area:** Existing UI primitives, global styles, domain layout components.

1. Inventory every required control against installed primitives. Add only confirmed missing official Base UI components, following the discovery/review workflow above.
2. Establish reusable compositions for page headings, fact rows, form errors, moderation status, loading placeholders, empty/error states, and a responsive modal/panel body.
3. Extend central variants for preview surfaces or control states where necessary. Preserve square corners, Inter, semantic tokens, and target sizes after registry additions.
4. Review library portals and nested overlays. Keep canvas and application layers coordinated; do not patch individual dialogs with arbitrary z-index values.
5. Compare specimen states against the baseline UI: default, hover, focus, selected, disabled, loading, long content, and error.

**Exit:** New screens can be assembled from consistent primitives without per-screen button/input/dialog reinvention. Existing catalog interactions still work.

### FE-04 — Add implementation dependencies and meaningful test infrastructure

**Depends on:** FE-03. **Primary area:** Web package and test configuration.

1. Add dependencies only as justified: plain three.js for the renderer; an astronomy library for transforms/body positions; TanStack Query for remote state; focused test tools. Verify compatibility with installed React/Next/TypeScript and update the existing lockfile.
2. Prefer simple React state/context for low-frequency application state initially. Add Zustand only if the real cross-surface state requirements justify it. Do not add React Three Fiber, a second router, a UI kit, or GSAP by default.
3. Configure Vitest/Testing Library for logic and user behavior, a fixture-based API mocking layer, and Playwright for repeatable browser journeys if no suitable setup exists.
4. Reuse shared JSON Schemas with an appropriate validator for fixture/contract tests. Avoid shipping a heavyweight validator for every response unless needed; generate or isolate validators where useful.
5. Define explicit frontend test scripts. Keep baseline command failures visible; root `lint` currently aliases type checking and is not proof of a separate lint pass.

**Exit:** A meaningful fixture-validation test and a small browser interaction test run successfully. No snapshot-only tests or tests duplicating trivial implementation details are required.

### FE-05 — Generate and validate complete HYG frontend assets

**Depends on:** FE-04. **Primary area:** Catalog modules and asset-generation script.

1. Verify the source SHA-256 against the manifest. Assert the pinned dataset's 8,920 unique IDs, magnitude cutoff, and excluded Sun. Preserve IDs exactly.
2. Produce a deterministic render asset and lookup/facts asset from the existing JSON. Include version, schema, record count, units, checksum, and attribution. Choose compressed JSON first unless a measured binary benefit justifies the added format.
3. Normalize coordinates at one boundary. Bundled RA is already degrees; API RA is hours. Use explicit unit-bearing types/names to prevent accidental double conversion.
4. Preserve unknown distances and missing B−V as null; preserve source/estimate flags. Keep visual luminosity distinct from bolometric luminosity. Do not invent inspector fields absent from both the catalog and API.
5. Validate constellation endpoints, including the two supplemental stars outside the main subset. Keep these geometry-only endpoints out of claimable search/routes.
6. Generate content-versioned filenames and rebuild metadata. Establish a catalog-version mismatch state for API joins instead of silently joining incompatible IDs.

**Exit:** Repeat generation produces identical logical data; full lookup includes unnamed stars; 205 null distances and 40 missing B−V values are handled correctly for this pin. The existing 24-star sample is no longer the source of truth for new features.

### FE-06 — Implement API transport, query keys, and error semantics

**Depends on:** FE-04–05. **Primary area:** API modules.

1. Implement a same-origin fetch boundary with cancellation, typed response normalization, safe error parsing, and `204` handling. Use shared constants/types; do not cast arbitrary JSON as validated data.
2. Separate public and authenticated query keys. Include viewer identity where content visibility differs; include catalog version for joined facts where needed.
3. Set foreground-only 5-second community polling, deduplicated requests, bounded retries/backoff, and immediate invalidation after writes. Do not poll static catalog data.
4. Handle `401`, rate limits/Retry-After, `404`, network failures, and malformed responses deliberately. Auth errors should not erase public astronomy data.
5. Keep known stale data where useful and label its freshness. An unavailable claim request yields unknown state, not unclaimed. Never automatically retry a non-idempotent mutation with a new request identity.

**Exit:** Tests cover public/private cache separation, cancellation, background polling pause, rate limits, stale data, and invalid payload handling.

### FE-07 — Build the route shell, shared state, and accessible navigation

**Depends on:** FE-02–06. **Primary area:** App layout/providers, navigation, application-state boundary.

1. Create routes for sky, full catalog, star detail, search, login, signup, credits, and not found. Reuse a common header/navigation without forcing every surface into the same container.
2. Define observer, current live UTC clock, selected star, camera orientation/FOV, open panels, and motion preference. Do not add a simulated-time state or control. Keep animation state in renderer-owned refs, not frequent React state updates.
3. Preserve observer and camera across route changes. Validate persisted preferences; if storage is unavailable, continue in memory. Do not clear the reference library's saved stars/notes.
4. Add a visible/reachable catalog alternative and skip link. Establish focus behavior for route transitions and returning from star pages.
5. Keep browser APIs and WebGL behind client-only boundaries; avoid hydration mismatch from clocks, storage, or viewport reads.

**Exit:** Routes, keyboard navigation, browser back/forward, and preference restoration work before the sky renderer is introduced.

### FE-08 — Expand catalog browsing and implement search

**Depends on:** FE-05–07. **Primary area:** Existing catalog components and search feature.

1. Adapt the existing table, filters, sort, selection, and detail disclosure to the complete pinned dataset. Maintain stable ID-based selection and the saved-library namespace.
2. Support proper names, Bayer/Flamsteed names, `HYG`/`HIP` identifiers, and unnamed stars. Provide deterministic fallback labels and pagination rather than rendering thousands of rows at once.
3. Reuse the search body in `/search` and an overlay. Debounce remote search, cancel stale requests, and keep the local catalog available when the API is unavailable.
4. Normalize the API's `{stars, tags, next_cursor}` shape. The cursor paginates posts; do not present it as “more stars.” Make result provenance/coverage clear when combining local and API results.
5. Give each result an open-page action and a separate “Find in sky” action without nesting buttons inside links or listbox options. Keep shortcuts inactive while typing.

**Exit:** Search finds an unnamed HYG record, handles no results and API failure, and works with keyboard/touch. Selection does not disappear unexpectedly when filters or pagination change.

### FE-09 — Build public star details and media presentation

**Depends on:** FE-05–08. **Primary area:** Star detail, media, and fact components.

1. Normalize the public star wrapper separately from the authenticated `Star` response. Load approved posts with cursor pagination and avoid duplicating the initial preview posts.
2. Render name/ID, constellation, source-backed facts, owner/claim date, and missing/estimated fields. Resolve richer inspector facts from same-version enrichment or an explicit contract extension.
3. Compose post notes, image galleries, external link domains, reaction counts, and comment summaries. Do not assume link titles or thumbnail query parameters exist.
4. Implement a library `Dialog` photo viewer with appropriate description, image sizing, Escape, and focus restoration. Use the API media URLs; do not fetch arbitrary previews in the browser. Static export has no default Next.js image-optimization server: use responsive native images/API derivatives or a verified compatible loader, with explicit dimensions to prevent layout shifts.
5. Add sharing, guide entry, and “Find in sky” intents. Provide copy fallback where clipboard access is unavailable. Preserve direct-route loading, unavailable, unclaimed, empty, and unknown-star states.

**Exit:** A visitor can open a direct star URL and read approved content. Missing distances, an empty claim, a failed image, and an unknown ID each have distinct usable states.

### FE-10 — Implement cookie sessions and account forms

**Depends on:** FE-03, FE-06–09. **Primary area:** Auth feature and session provider.

1. Load `/api/me` as an independent query; `401` establishes anonymous state. Do not block catalog/sky loading while session discovery runs.
2. Build signup/login with library field/input compositions, appropriate autocomplete, password visibility, shared length limits, inline errors, and an error summary. Do not trim passwords.
3. Use the HttpOnly cookie; never persist the returned token in local storage. After login/signup, refetch the current user and relevant authenticated content.
4. Validate return destinations as internal routes and restore the originating star or action context. Do not silently submit a comment after login.
5. On logout/account change, cancel user-scoped requests, clear private query data and guide history, and prevent late responses from repopulating another user's view. Keep public catalog data.

**Exit:** Signup/login/logout and expired-session recovery work against the real API; switching accounts never reveals the previous user's pending content or draft.

### FE-11 — Implement and verify astronomy independently of rendering

**Depends on:** FE-05. **Primary area:** Astronomy module and fixed-reference tests.

1. Define the coordinate convention explicitly: RA/Dec frame, east-positive longitude, azimuth direction/origin, altitude, UTC time, and world axes.
2. Establish one J2000-to-date/horizon transformation shared by points, picking, labels, and “Find in sky.” If the library provides a complete transform, do not precess again manually.
3. Validate against independently sourced fixed references across both hemispheres, RA wraparound, polar locations, zenith, and the horizon. For the demo, require plausible bright-star directions, correct orientation/horizon classification away from the immediate boundary, and render/pick agreement; drop the 0.1° gate. Record approximations and assess a numerical full-product accuracy budget later.
4. Implement Sun altitude for day/twilight/night status and a live clock. Separate astronomical time from UI timezone formatting. Fixed times are test inputs only, not a user-facing preview mode.
5. Record omitted effects such as proper motion and their relevance to the chosen zoom/accuracy. Tests derived from the same implementation formula alone are not independent validation.

**Exit:** Known stars project correctly for fixed observer/time inputs before any visual effects can hide coordinate errors. [Astronomy Engine](https://github.com/cosinekitty/astronomy) is a candidate library, not a reason to skip reference checks.

### FE-12 — Mount a minimal, accurate sky renderer

**Depends on:** FE-07, FE-11. **Primary area:** Renderer and its React adapter.

1. Dynamically load a browser-only three.js renderer on the sky route. Create one star-points layer using typed arrays and shared transforms; keep ordinary overlays in HTML.
2. Implement magnitude-based point appearance, neutral fallback color, the ground/horizon mask, and stable camera/world conventions. Avoid per-star React components and per-frame network requests.
3. Expose a small interface for observer/time changes, claim updates, selection, camera control, and disposal. Emit selection/camera events at suitable rates.
4. Handle resize, device pixel ratio, hidden-tab suspension, context loss/restoration, unmount cleanup, and repeated development mounts. Dispose GPU resources and event listeners.
5. If WebGL is unavailable, provide the catalog/search route and useful explanation. Avoid an endless loading screen or blank canvas.

**Exit:** The correct star field renders and resizes, unmount/remount does not leak a second animation loop, and disabling WebGL leaves a functional application.

### FE-13 — Add camera input, picking, and “Find in sky”

**Depends on:** FE-08–09, FE-12. **Primary area:** Camera and picking modules.

1. Implement drag yaw/pitch, pointer capture, inertia, wheel/pinch FOV, and keyboard controls. Handle pointer cancellation and avoid treating a drag release as a star click.
2. Pick from the same transformed/visible star positions used by rendering. Normalize CSS-pixel hit radii independently of canvas resolution. Exclude hidden, below-horizon, or nonrendered points.
3. Resolve overlap predictably using distance, with a documented claim/selection preference for near ties. Enlarge touch hit areas without changing visual star size.
4. Add a small persistent pause/resume control for drift. Drag pauses it; resume after about 10 seconds of inactivity only when motion is enabled and no interaction, open card/panel, explicit Pause, or reduced-motion preference prevents it. Explicit Pause requires explicit Resume.
5. Connect “Find in sky”: navigate back, set selection, rotate to a visible star, and restore focus to a useful control. For a hidden star, explain the reason and offer an explicit observer/place change while keeping the clock live.

**Exit:** Mouse, touch, keyboard, selection at different DPR/FOV values, and below-horizon navigation all work without unexpected camera movement.

### FE-14 — Implement the globe and place picker

**Depends on:** FE-03, FE-11–13. **Primary area:** Place controls and globe adapter.

1. Start with bundled, source-checked presets and coordinate entry. Validate latitude/longitude, negative signs, boundaries, and agreed formats without swapping coordinates silently.
2. Implement a lightweight Earth globe with observer marker and the requested rectangular viewfinder. Center the schematic on the marker, rotate it with camera azimuth, and scale its width/height with horizontal/vertical FOV and viewport aspect ratio. Describe it as viewing direction/FOV, not a geographic footprint or exact celestial projection. Keep documented coastline attribution; avoid a second WebGL context if SVG/canvas is adequate.
3. Use a library popover on desktop and modal/sheet on narrow screens. Click and keyboard operation are required even if hover expansion is provided.
4. Request location once on initial entry without blocking rendering; show provisional Starbase immediately. Use a short timeout (about 3 seconds), handle denial/insecure contexts, and keep an explicit “Use my location” retry. Apply a successful result only if that request is still current and the user has not manually selected a place; ignore stale callbacks. Do not repeatedly prompt on rerenders or route transitions.
5. Atomically update observer state, label, globe rectangle, sky, and picking. Preserve the current manual selection across navigation and offer reset. A previously stored place must not silently replace the visitor-location default on a new visit. Do not send precise location to the backend merely to render the sky.

**Exit:** Initial permission does not block loading; denial/timeout uses Starbase; a manual choice wins over late GPS; presets work after assets load; the rectangle tracks heading/FOV; sky and label describe the same observer.

### FE-15 — Deliver complete claim coverage at the API boundary

**Depends on:** FE-01, FE-06, FE-10. **Primary area:** Claim adapter; shared/backend changes only if included in the implementation assignment.

1. Recheck whether a complete claim endpoint has landed. Prefer that implementation over creating a duplicate.
2. Define and verify a bounded contract: HYG ID, public owner, claim date, optional approved preview/counts, catalog version, and coverage/freshness semantics. Include claims with no posts and claims whose only posts are not public.
3. If implementing the backend addition, use existing visibility helpers, schemas, fixtures, tests, and OpenAPI generation. Keep private owner fields and pending media out of the public index. Specify pagination/snapshot consistency if the index is paged.
4. Maintain a distinction between unknown, confirmed unclaimed, and claimed. Absence from an incomplete page or a failed refresh never proves unclaimed. Merge known claims without discarding them on transient errors.
5. Keep preview hydration bounded and avoid scanning every feed page or issuing one request per star. ETags/deltas are optional only after supported by the endpoint.

**Exit:** The browser correctly represents claims with zero approved posts and all supported IDs have defined coverage semantics. If backend work is external and unavailable, mark this gate blocked; a feed-only preview is not completion.

### FE-16 — Join claims to the sky and build interactive previews

**Depends on:** FE-09, FE-12–15. **Primary area:** Claim rendering and preview components.

1. Update claim attributes by ID without rebuilding the renderer. Use ring/size treatment as interface emphasis; do not alter the displayed magnitude fact.
2. Compose a preview with the library popover/positioner: name, owner or honest status, bounded approved media/text, and an explicit open-page action. Prevent nested links/buttons.
3. Anchor a controlled preview to the selected star's projected position using a documented virtual-anchor API or one reusable DOM anchor. Do not create thousands of focusable invisible star buttons.
4. Implement hover delay, pointer travel into the card, viewport collision handling, tap-to-open/close, Escape, and focus return. Pause camera drift while the preview is in use.
5. Keep the accessible catalog as the equivalent path to all information. No hover-time request should be needed when the preview is already cached.

**Exit:** Preview content and claim markers agree with the server, stay usable at viewport edges, and remain stable during refresh. [Base UI Popover](https://base-ui.com/react/components/popover) supplies the overlay behavior; astronomy projection remains application logic.

### FE-17 — Add reactions, comments, and moderation states

**Depends on:** FE-09–10, FE-15. **Primary area:** Community feature and authenticated queries.

1. Switch signed-in views to the authenticated endpoints where personal reactions or moderation state are required; public endpoints ignore cookies.
2. Render the exact shared emoji set in a multi-select toggle composition. Apply per-emoji PUT/DELETE operations, serialize or reconcile rapid changes, and roll back optimistic changes on failure.
3. Build a comment composer with visible label, Unicode code-point counter, shared limits, and retained draft on failure. Maintain one idempotency key per logical submission, retaining identical payload/key through uncertain retries.
4. Show pending, delayed, rejected, and review-failed states to the author where provided. Explain failures without treating infrastructure failure as rejection. Public counts remain approved-content counts.
5. Merge paginated comments by ID, newest first; keep later pages stable when refreshing the first page. Invalidate relevant star/feed/count queries after successful writes.
6. Preserve a draft across reauthentication for the same user only; clear or isolate it when identity changes. Do not auto-post after authentication.

**Exit:** A timed-out comment retry creates one comment, reactions remain correct after rapid toggles, and a second user cannot see the author's private moderation state.

### FE-18 — Implement progressive loading and controlled motion

**Depends on:** FE-12–17. **Primary area:** Loading coordinator and motion preferences.

1. Define essential readiness as catalog decoded plus usable scene or usable catalog fallback. Auth, claims, geocoding, and guide availability finish independently.
2. Connect the logo fill/progress semantics to completed work. When byte totals are unknown, report stage progress or indeterminate status rather than invented percentages.
3. Add the black reveal and star population only after essential interaction is available. A decorative sequence must not delay keyboard navigation for several seconds.
4. Provide stalled-load messaging, retry for the failed resource, and navigation to the alternate browse path. Retrying must not create duplicate renderers or observers.
5. Centralize reduced-motion behavior and explicit camera pause. Preserve the user's pause choice across panel closure and ordinary route changes.

**Exit:** Cold load, warm load, slow catalog, unavailable API, failed renderer, and reduced motion all reach an honest usable state.

### FE-19 — Implement the guide streaming transport

**Depends on:** FE-06, FE-10. **Primary area:** SSE parser and guide request state machine.

1. Use streaming `fetch` for `POST /api/agent/chat`. Send `explore`, validated selected HYG ID, and 1–6 history messages with the last message from the user; enforce the shared per-message/body limits.
2. Model idle, submitting, thinking, streaming, completed, interrupted, canceled, and failed states. Separate ordinary HTTP/JSON errors from SSE errors after streaming starts.
3. Parse UTF-8 and SSE correctly across arbitrary chunk boundaries, CRLF/LF, multiple events per chunk, and partial JSON records. Treat `done` as success; connection close without it is interrupted.
4. Support Stop, explicit Retry, new-chat cancellation, and session changes. Preserve partial text and prevent late events from modifying a newer request. Do not auto-retry a generation that may already have consumed capacity.
5. Use the provided success/error fixtures and deliberate chunk partitions. Test rate limits, busy/unavailable, timeout, abort, malformed events, and truncated streams.

**Exit:** Transport tests pass independently of presentation and the browser can stop an in-flight request without losing the already received text.

### FE-20 — Build the accessible guide panel

**Depends on:** FE-03, FE-09–10, FE-19. **Primary area:** Guide UI.

1. Compose desktop panel and mobile sheet with the same message list/composer. Include title, selected-star chip, remove-context action, close, Stop/Send, and New chat.
2. Display a clear login action for anonymous users. Retain conversation in memory only and clear it on explicit logout/account change.
3. Append answer text without moving, looping, or replaying it. Do not add ObsidianUI Text Stream. Preserve copy/select behavior and long-word wrapping.
4. Keep scroll pinned only while the reader is near the bottom. If the reader scrolls up, offer a new-message indicator instead of moving their reading position.
5. Announce completed answers/status changes politely, not every token. Keep stopped/interrupted output labeled and retries deliberate.
6. Verify the actual local guide when available. If only fixtures ran, report that limitation and leave live-model verification outstanding.

**Exit:** A user can ask about a selected star, read and copy a partial/full answer, stop/retry, and use the panel entirely by keyboard or touch.

### FE-21 — Add live-time sky realism

**Depends on:** FE-11–14, FE-18. **Primary area:** Sky visuals and time control.

1. Derive day/twilight/night behavior from Sun altitude. Add a consistent daylight star-visibility policy; keep community access available through catalog/search even when stars are hidden.
2. Add Sun/Moon positions and phase-aware Moon presentation from the astronomy module. Treat these as separate object types with no star claim actions.
3. Apply restrained B−V color and horizon extinction; keep missing-color fallback neutral. Add twinkle only as a small optional effect disabled by reduced motion.
4. Keep the clock tied to the current instant. For a star-visible demo during local daylight, allow explicit selection of a preset where it is currently night and display that place prominently. Never introduce a time selector or move the observer silently.
5. Separate measurable correctness from aesthetic tuning. Preserve the black ground and the monochrome interface rules.

**Exit:** The same observer/current time produces consistent status, celestial positions, and visible scene. Daytime remains real; catalog access or an explicitly selected nighttime place supplies the demo fallback.

### FE-22 — Add optional overlays and external place search

**Depends on:** FE-14, FE-21. **Primary area:** Optional features; skip only when marked out of the selected release.

1. For constellations, lazy-load geometry, handle extra endpoints, horizon clipping, labels, and a clear toggle. Keep labels sparse and stable; do not add a focusable DOM node for every star.
2. For planets or Milky Way imagery, add separate object handling, source/license records, and quality controls. Do not block essential readiness on these assets.
3. For address search, choose and verify a provider and backend contract before implementation. Keep requests cancelable, cached where appropriate, and explicit about transmitted query text.
4. Never use public Nominatim as an automatic autocomplete fallback. If deliberately chosen for submit-based search, follow its attribution, identification, caching, and application-wide rate limits. [Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/).

**Exit:** Enabled optional features meet the same performance, source, and failure-state rules; disabled features do not leave dead controls or missing assets.

### FE-23 — Complete responsive and accessibility verification

**Depends on:** All included UI steps. **Primary area:** Browser behavior and central component fixes.

1. Test 320/390/768/1024/1440 px widths, 200% zoom, landscape touch, and content with long names/URLs, many comments, and no data. Include mobile safe areas and the software keyboard.
2. Run the full keyboard journey: catalog/search → star → login → comment → guide → close/back. Verify visible focus, logical order, Escape, and restoration to an existing control.
3. Test screen-reader names, modal titles, field errors, meaningful status announcements, and the canvas's non-canvas alternative. Avoid noisy live updates for camera/time changes.
4. Verify forced colors, contrast, target sizes, reduced motion, and explicit drift pause. Pointer-only affordances must have keyboard/touch equivalents.
5. Fix shared control defects in the relevant primitive once, then check existing catalog screens for regressions.

**Exit:** Every core action is reachable without the canvas, hover, or animation; no clipped/hidden primary action remains at the supported widths.

### FE-24 — Profile loading, rendering, and request cost

**Depends on:** FE-18, FE-21, included FE-22 work. **Primary area:** Production build and real test devices.

1. Measure the full cold-load path: framework, renderer, fonts, catalog, and images. Report actual bytes and timings, not a budget that excludes core assets.
2. Target useful sky interaction in approximately 3 seconds on the agreed demo LAN, 60 fps on the target laptop, and 30 fps on the supported phone. Record the hardware/network and measured results.
3. Lazy-load the renderer away from catalog/detail-only routes, constellation data, guide UI where useful, and nonvisible media. Verify no catalog is duplicated into every route bundle.
4. Reduce pixel ratio/effects and faint-star density only when needed. Keep selected-star navigation available and ensure picking tracks the current visible set.
5. Check background suspension, no overlapping polling, bounded preview payloads, GPU resource cleanup, repeated navigation, and session-long memory growth.

**Exit:** Measurements support the performance claim or a specific remaining gap is documented. Correctness and accessible controls are preserved when visual quality drops.

### FE-25 — Exercise failures, privacy, and lifecycle boundaries

**Depends on:** All core feature steps. **Primary area:** API/UI integration tests and browser failure injection.

1. Exercise API down/slow, catalog failure, malformed data, catalog-version mismatch, broken image, geolocation denial/timeout, WebGL context loss, and network loss during a comment or guide response.
2. Confirm unknown claim state, stale indicators, resource-specific retry, and useful alternate navigation. A failed optional service must not break the shell.
3. Test login/logout while requests are pending, another account signing in, component unmount during streaming, and stale requests resolving after a place/search change.
4. Verify public/private cache isolation, safe text/link rendering, media visibility, internal-only auth return URLs, no tokens in browser storage, and no precise-location transmission for local sky rendering.
5. Keep error logs useful without passwords, tokens, private drafts, or unnecessary user content. Do not persist private responses in a service worker/cache introduced for static assets.

**Exit:** Failures preserve truthful UI and privacy; recovery does not duplicate writes, leak private content, or leave stuck overlays/animation loops.

### FE-26 — Run the integrated deployment and demo acceptance pass

**Depends on:** FE-23–25 and FE-20 if guide is included. **Primary area:** Built site served with Fastify, real device/browser journey.

1. Build from the actual workspace scripts. Run the production-style server with a disposable test database/media directory or a designated demo environment; avoid creating test accounts/content in a real user's dataset.
2. Verify API origin allowlists, static route mapping, cache headers, deep links, absent assets, and access from a second device. Do not assume localhost geolocation behavior carries to a LAN HTTP address.
3. Complete the two-user journey: iOS/backend test producer claims a star and posts; approval makes it publicly visible; another browser user reacts and comments; private moderation states remain hidden from the first anonymous observer.
4. Include a claim with no approved posts, an unclaimed star, a null-distance star, search, below-horizon navigation, and a direct star-page refresh.
5. Run guide success/failure against the live model if available. Automated mocks do not establish live model readiness. Do not auto-approve content just to make the frontend demonstration pass.
6. Check Chromium, Safari, and touch interaction; automated WebKit is useful but does not replace an actual Safari check where Safari is promised.

**Exit:** The selected release's real user journey works on its intended origin and devices, with remaining external dependencies explicitly separated from verified functionality.

### FE-27 — Finish credits, documentation, and handoff

**Depends on:** FE-26. **Primary area:** Credits, current README/runbook, execution ledger.

1. Reuse the current source dialog content in a credits route; add exact catalog version, enrichment, constellation, font, astronomy, globe, and optional texture/provider attribution.
2. Update outdated frontend/hosting instructions to the actual implemented stack and commands. Keep design-system extension rules and the ObsidianUI component distinction explicit.
3. Record completed steps, API additions, intentional deviations, performance/accuracy evidence, live versus mocked checks, and the exact steps to run/rehearse the app.
4. Inspect the final diff for accidental tokens, user data, unrelated changes, generated test artifacts, redundant dependencies, duplicate primitives, and invented content. Preserve needed catalog provenance/build artifacts.
5. Provide a concise handoff with files changed, user-visible behavior, checks run, and any remaining blocker. Do not claim the full release complete if essential claim coverage, real auth/social integration, or promised live-guide verification is still missing.

**Exit:** Another engineer or agent can run the site, understand the architecture and library choices, reproduce the checks, and identify any remaining work without reading chat history.

## 7. Execution commands and verification cadence

Run commands from `/Users/sihochoi/Documents/place_holder_name` unless a step specifies otherwise. Inspect scripts again first; these reflect the planning baseline.

| Purpose | Existing command / condition |
| --- | --- |
| Full dependency-aware build | `pnpm build` |
| Frontend build only | `pnpm --filter @stargaze/web build` after required shared packages are built |
| Frontend type check | `pnpm --filter @stargaze/web typecheck`; inspect version/script failures before considering the README's direct `tsc --noEmit` alternative |
| Workspace type checks | `pnpm typecheck` |
| Existing API regression tests | `pnpm --filter @stargaze/api test` after its required build artifacts exist |
| Existing aggregate tests | `pnpm test` currently builds and runs API tests; it does not yet prove new frontend tests ran |
| Development with API proxy | `pnpm dev`; exact browser origin must be in backend `APP_ORIGIN` |
| Frontend-only development | `pnpm dev:web`; use explicit fixture mode only when the backend is not being exercised |
| Production-style serving | `pnpm start` with an appropriate isolated/demo environment |
| API schema regeneration | `pnpm openapi` after relevant backend builds, only if the contract changed |

In FE-04 add and document frontend unit/integration and end-to-end scripts; do not describe them as existing before that step. Run affected tests while implementing, then the complete applicable suite at release. Repeat broad checks only after relevant changes or unresolved failures justify it.

For every rendered feature, verify page identity, meaningful content, absence of a framework error overlay, relevant console errors, screenshot appearance, and at least one complete interaction. Use the available browser tooling according to its instructions; keep repeatable user journeys in the project's test setup. A successful build alone is not visual or interaction proof.

## 8. Required scenario matrix

| Area | Minimum meaningful cases |
| --- | --- |
| Catalog | Named/unnamed; HIP absent; null distance; missing color; estimated facts; version mismatch; supplemental constellation endpoint. |
| Sky | Both hemispheres; RA wrap; polar observer; horizon/zenith; live day/night at different places; rectangle heading/FOV; different DPR/FOV; no WebGL/context loss. |
| Claims | Confirmed unclaimed; claimed with approved post; claimed with no posts; claimed with only private posts; incomplete index; failed refresh. |
| Identity | Anonymous; signed in; expired session; failed login; rate limited; logout during fetch/stream; account switch. |
| Social | Emoji select/remove and rapid toggle; pending/delayed/rejected/review-failed; unknown-result retry; paginated comments refreshing; unauthorized private content. |
| Guide | Thinking; chunked answer; done; pre-stream JSON error; midstream error; EOF without done; Stop; retry; reader scrolled up; reduced motion. |
| Layout | Desktop; narrow/touch; keyboard; 200% zoom; long content; forced colors; nested dialog/sheet; mobile keyboard. |
| Deployment | Dev proxy and production origin; direct links/refresh; invalid routes; missing assets; cached static data; unavailable API/model/geocoder. |

## 9. Milestones and completion checklist

The following milestones apply to the full product. The deadline track uses D0–D6 and reports partial FE tasks honestly; it does not require social writes or the guide before a read-only demo can pass.

**M1 — Foundation:** FE-00–07 complete. Real full-catalog assets, verified routing, shared UI rules, and API/session boundaries are ready.

**M2 — Public exploration:** FE-08–16 complete, including complete claim coverage. Visitors can browse either sky or catalog, open real star pages, and retain observer/camera context.

**M3 — Community:** FE-17–18 complete. Authenticated reactions/comments and truthful moderation states work with progressive loading.

**M4 — Full experience:** FE-19–21 complete, plus the explicitly included FE-22 enhancements. The guide and sky realism work without changing the interface's design language.

**M5 — Verified handoff:** FE-23–27 complete. Production-origin, accessibility, performance, failure, and cross-device evidence is recorded.

Final acceptance requires all of the following for the selected scope:

- [ ] HYG v4.4 identity, units, missing values, and provenance are correct.
- [ ] Existing design tokens and Base UI primitives are reused consistently.
- [ ] Full catalog/list access exists alongside the sky.
- [ ] Star routes work on direct entry and refresh.
- [ ] Claims without approved posts are represented correctly; unknown is never mislabeled unclaimed.
- [ ] Account changes cannot leak private state.
- [ ] Social writes are retry-safe and moderation remains server-authoritative.
- [ ] Included guide functionality is verified at the stated fixture/live level.
- [ ] Keyboard, touch, reduced motion, and WebGL failure journeys work.
- [ ] Performance and scientific accuracy claims have evidence.
- [ ] Credits, run commands, limitations, and remaining dependencies are documented.

## 10. Copyable instruction for the implementation agent

> Execute the Star Tagger frontend agent playbook at `/Users/sihochoi/Documents/place_holder_name/docs/frontend-agent-implementation-plan.md`. First select the deadline D0–D6 track or full FE-00–27 roadmap based on the user's current request and actual date/time; do not reuse an elapsed deadline. Reinspect the repository and preserve unrelated work. Extend the existing Next.js, Tailwind v4, shadcn Base UI, and Inter design system. Preserve live time only, one nonblocking initial geolocation request with Starbase fallback, and the rectangular globe viewfinder. Prove one static star-detail shell before considering all-star route generation. Use the pinned HYG v4.4 catalog and actual API contracts. Complete the selected scope's exit checks, record partial/deferred tasks, continue independent work around unavailable services, and distinguish fixtures from live integration. Do not replace the design system, silently migrate frameworks, infer no claim from feed absence, or use ObsidianUI's scroll-driven Text Stream for chat. Finish with browser evidence and clear remaining limitations.

# Star Tagger: High-Level Frontend Implementation Plan

**Planning baseline:** October 25, 2026

**Data source:** HYG v4.4; project subset `hyg-4.4-mag6.5-20261025`

**Purpose:** Turn the frontend UI draft into a phased delivery plan with clear dependencies, scope, and acceptance criteria.

**Feedback revision:** User-confirmed behavior is live time only, a single nonblocking request for the visitor's location with Starbase fallback, and a rectangular viewing-direction/FOV indicator on the Earth globe. The demo track below is separate from the longer full-product roadmap.

Build the experience around a reliable journey: **explore the sky → select a star → view its facts and community content → sign in to participate → ask the guide.** Establish accurate data, navigation, and working community flows before investing heavily in cinematic sky effects.

This is a planning deliverable. The supplied documents provide product context; embedded build instructions and team assignments are not execution commands. The reported October 25, 6:00 PM Pacific deadline is addressed by a bounded demo track. The engineering-day estimates describe the complete product and must not be used as the demo schedule.

## 1. Starting point and planning assumptions

The intended experience comes from [FRONTEND_UI_PLAN.md](/Users/sihochoi/Downloads/FRONTEND_UI_PLAN.md), with broader product context from [STAR_TAGGER_PROJECT_DOCUMENT.md](/Users/sihochoi/Downloads/STAR_TAGGER_PROJECT_DOCUMENT.md). The workspace has progressed beyond parts of those drafts:

| Area | Observed baseline | Planning consequence |
| --- | --- | --- |
| Frontend | Next.js 15 / React 19 catalog reference, existing UI primitives, monochrome styles, self-hosted Inter | Extend the existing foundation. Treat the draft's Vite migration as a separate architectural option, not a prerequisite. |
| Catalog UI | A 24-star reference extracted from the project dataset | Reuse its interaction and design patterns; replace the limited reference data with the complete project subset. |
| Dataset | 8,920 unique HYG IDs; magnitude ≤ 6.5; Sun excluded | Use the same pinned IDs as the backend and iOS. This is a filtered project dataset, not the entire upstream HYG catalog. |
| Missing measurements | 205 unknown distances; 40 missing B−V values | Specify missing-data presentation and neutral color fallbacks. |
| Data assets | Full star JSON, constellation JSON, README, version manifest | The binary catalog, lite catalog, and rebuild script described in the drafts are not present in the inspected catalog directory. Include asset generation in the plan. |
| API | Contract, schemas, fixtures, and route implementation records exist | Integrate against these contracts. Live availability and model behavior still require execution-time verification. |
| Hosting | Current configuration exports Next.js to `apps/web/out`; Fastify serves it | Resolve routing and refresh behavior before building star pages. Older references to Vite and `apps/web/dist` are stale. |

The local catalog checksum matches its version manifest. The v4.4 release identity is recorded by that manifest and the project data documentation; the original upstream raw file and transformation inputs were not available for independent reproduction in this review.

## 2. Product scope and release boundaries

**Demo target:** Loading feedback; a basic live sky with honest claim states and hover/tap cards; an Earth globe with a rectangular viewfinder and presets; login/logout; a read-only public star page with real facts, owner, and approved posts. Preserve the existing catalog as the keyboard/WebGL fallback and keep credits reachable.

**Full core release:** Extend that demo with full search/catalog browsing, sign-up, reactions, moderated comments, and the broader accessibility and failure-state coverage below. These are not all prerequisites for the read-only companion demo.

**Complete planned experience:** Add the streaming AI guide, richer atmosphere, Sun and Moon presentation, optional planets and constellation overlays, and refined loading and motion. Address search and a licensed Milky Way texture are optional enhancements.

**Outside this frontend scope:** Web claiming and media upload, AR, video, speech, moderation/admin screens, and a light theme. Account recovery and email verification remain outside the demo scope; revisit them before a broader public account launch.

The reference UI's local saved stars and private notes are existing sample features, not community posts or claims. Preserve their stored data during development and keep them clearly separate if retained in the final navigation.

## 3. Decisions that shape implementation

Time, location, and the globe rectangle were explicitly confirmed by the user during this revision. Other entries distinguish implementation recommendations from product or contract facts.

| Decision | Recommended direction | Reason |
| --- | --- | --- |
| Framework | Keep the existing Next.js/React foundation and UI primitives | Reuses work already present and avoids coupling the sky feature to a framework rewrite. |
| Visual language | Retain black/white chrome, Inter, square geometry, and strong focus indicators | Extends the established design system consistently. Treat physically meaningful sky color and user photos as imagery. |
| Time — user confirmed | Use the current UTC instant only; no time selector or night-preview mode | Daytime remains daytime. For a star-visible demo, explicitly choose a preset where it is currently night; never change the clock or silently move the visitor. |
| Location — user confirmed | Request the visitor's location once without blocking rendering; fall back to Starbase | Show provisional Starbase immediately, apply successful location if no manual choice has intervened, and retain presets/coordinates plus an explicit retry action. A saved preference must not silently replace the visitor-location default. |
| Globe — user confirmed | Keep the rectangular viewfinder on the Earth globe | Center the schematic on the observer marker, rotate it with camera azimuth, and scale its width/height with horizontal/vertical FOV. It describes viewing direction/FOV, not a geographic footprint or an exact celestial projection. |
| Community freshness | Follow the current contract: refresh active community screens every 5 seconds; stop in the background | The draft's 30-second ETag proposal is not the implemented contract. Any cheaper claim-summary refresh policy needs an explicit contract addition. |
| Claim state | Represent claimed, unclaimed, and unknown/unavailable distinctly | Missing or failed community data does not establish that a star is unclaimed. |
| Claims and posts | Obtain claim coverage independently of the post feed | A claim can exist without an approved post. Exhausting a post feed still does not discover every claim. |
| Ownership language | Use “Claimed by” with the claim date | An in-app claim is not an astronomical discovery. Keep historical discovery information absent unless sourced. |
| Social behavior — contract | Use exactly ❤️ ✨ 🚀 🤩 👍; selections belong to a post | The current API allows multiple selected emoji per user/post. Comments are newest first. The emoji list is already defined in shared constants, not an unresolved product choice. |
| Auto pan | Preserve pause on interaction and automatic resumption after about 10 seconds of inactivity; add a small Pause/Resume control | Explicit Pause remains paused until Resume. Open cards/panels and reduced-motion preferences suppress automatic resumption. |
| Name and logo | Keep the current “Stargaze” wordmark provisionally; use a simple monochrome star mark for loading if no logo is supplied | Final branding remains open, but does not block the demo. “Star Tagger” is the project name in these documents, not an instruction to silently rename the existing UI. |
| Progress | Release the usable interface when essential assets are ready; load optional services independently | Auth, community data, geocoding, and AI availability should not hold the entire loading screen open. |

Browser geolocation requires a secure context. A plain HTTP LAN address must therefore be tested separately from localhost; presets are the reliable demo fallback. [Geolocation API documentation](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API).

## 4. HYG v4.4 data strategy

### Canonical identity and distribution

Use `hyg_id` as the join key across rendering, search, routes, claims, and API requests. Names and HIP IDs are display/search attributes, not primary keys. Carry the catalog version through derived assets and validate it against the API. Future catalog upgrades require an explicit identity migration review so existing claims and links remain attached to the correct stars.

Produce three logical assets from the pinned project data:

| Asset | Purpose | Delivery approach |
| --- | --- | --- |
| Render catalog | IDs, sky coordinates, magnitude, optional B−V color | Compact, versioned asset loaded for the sky; choose compressed JSON or binary after measurement. |
| Lookup/facts data | Names, identifiers, constellation, sourced measurements, estimate flags | Support the full catalog/list and local lookup; load richer facts when needed. |
| Constellation geometry | Lines and additional endpoints | Load only when overlays are enabled. |

Preserve all 8,920 IDs in the canonical lookup even if lower visual quality hides faint points. The constellation file includes two supplemental line stars outside the magnitude-limited catalog; these should not become claimable stars or broken detail links.

The asset build needs a reproducible transformation, source checksums, schema/version metadata, and an attribution manifest. Use content-versioned filenames or explicit cache validation; placing a file in a public directory does not automatically give it a hashed filename.

### Scientific presentation

- Normalize units once at the data boundary: the bundled coordinates use RA in degrees, while the API exposes RA in hours. Preserve J2000 frame information and avoid applying the hours-to-degrees conversion twice.
- Display null distance as “Unknown,” never zero or the upstream unknown-distance sentinel. Missing B−V should produce a neutral star color.
- Distinguish HYG facts from NASA/IAU and other enrichment. HYG alone does not provide all exoplanet, mass, radius, gravity, or temperature information in the draft.
- The current API's star response omits several proposed inspector fields. Supply them from a matching-version enrichment asset or agree on an API extension; do not assume undocumented response fields exist.
- Preserve per-field provenance and estimate flags. Treat HYG visual luminosity and derived stellar estimates carefully; do not present them as precise bolometric or measured values.
- Use a consistent coordinate frame for star rendering, picking, labels, and “Find in sky.” Include a date/precession strategy and validate it against independent astronomy calculations. Proper motion can be deferred with the accuracy limit documented.
- Calculate Sun, Moon, and planet positions through a separate astronomy module. These are not catalog stars or claim targets.

Preserve the existing dataset attribution and license notices in the credits and distributed derived assets. The publisher's [HYG project page](https://www.astronexus.com/projects/hyg) describes the source catalogs and CC BY-SA 4.0 licensing; project-specific counts and the v4.4 pin above come from the local bundle.

## 5. Frontend architecture

Separate four responsibilities so improvements in rendering do not destabilize community features:

| Layer | Responsibility | Boundary |
| --- | --- | --- |
| Catalog and astronomy | Data normalization, observer/time transformations, star lookup, object positions | Independent of authentication and community availability. |
| Sky renderer | Point rendering, horizon, camera, picking, visual quality, selection | Browser-only module with a small interface to the application; animation stays outside React's render cycle. |
| Application UI | Routes, globe/place controls, cards, star pages, forms, dialogs, guide panel | Reuse current semantic tokens and accessible primitives. |
| API and session state | Cookie session, public/private queries, polling, mutations, streaming, errors | Typed from shared contracts, with runtime validation at important boundaries. |

Use one application state model for observer, live clock, selected star, and camera. The sky, globe, search, and star detail should all refer to that state. Use a query cache for server data rather than duplicating ownership and counts in component stores. Clear user-specific cache entries and private in-memory content on logout or account changes.

Keep the sky mounted across overlays where practical. Persist enough observer/camera state to restore the view after route navigation even when the canvas must unmount. Keep location preferences local, session tokens in HttpOnly cookies, and the guide conversation in memory.

**Routing gate:** Prove one detail shell first; do not generate 8,920 pages for the demo. Recommended implementation: statically export `/star`, read `hyg_id` from the query string in a client component behind the required Suspense boundary, and fetch data at runtime. `/star?hyg_id=32263` is the temporary canonical demo URL. Fastify can validate a `/star/32263` alias and redirect to it; test aliases, refresh, back/forward, and invalid IDs. This is an explicit URL tradeoff. Preserving clean paths without redirects requires a tested client-route adapter or a later hosting decision; returning a shared HTML file alone does not establish App Router compatibility. Also preserve normal routes for search/login/credits and eventual signup. [Next.js static export](https://nextjs.org/docs/15/app/guides/static-exports), [client query parameters](https://nextjs.org/docs/15/app/api-reference/functions/use-search-params).

## 6. Deadline demo track

The complete roadmap below does not fit the reported 6:00 PM Pacific deadline. The inspected frontend is a catalog reference: the sky, auth forms, and live star pages still need implementation. Treat the following as a prioritized target with fallback gates, not a claim that every item can be built and tested in an hour.

| Order | Required increment | Cut or fallback when it fails |
| --- | --- | --- |
| D0 | Recheck the actual time, preserve the existing app, verify the API and one-shell routing | If the route/serving proof fails, retain the working catalog/detail inspector and report the demo as a reduced catalog experience. Do not begin a framework migration. |
| D1 | Read-only public star page: real facts, claim owner, approved posts, back navigation, reachable credits | Reuse the current table/inspector and Base UI controls. No gallery redesign, upload, comment composer, or advanced facts. |
| D2 | Basic live HYG sky: correct observer transform, horizon, drag/zoom, selection, catalog fallback | No atmosphere shaders, planets, Milky Way, constellation lines, elaborate inertia, or tight astrometric target. If the sky is not usable by the freeze, keep the catalog fallback. |
| D3 | Claim markers and hover/tap previews with three honest claim states | Prefer a complete claim index. If unavailable, highlight only verified claims, label coverage incomplete, and treat all unchecked stars as unknown. Confirm a selected star through its public detail route. |
| D4 | Earth globe, observer marker, rectangular FOV indicator, verified presets, nonblocking initial geolocation with Starbase fallback | Use lightweight SVG/canvas and simple transitions. Defer address search and decorative globe animation. Failure to finish the globe is reported, not replaced silently with a different design. |
| D5 | Existing-account login/logout and return to star; simple loading feedback/mark | Use a designated demo account. Signup is stretch; guide, reactions/comment writes, and sophisticated logo animation are deferred. |
| D6 | Production-origin build/serve and the complete chosen journey on the demo browser; keyboard and location-denied checks | Reserve the final 10–15 minutes for this. Cut unfinished increments before cutting verification. |

**Deadline operating rule:** At implementation start calculate the minutes remaining to 6:00 PM Pacific. Reserve 10–15 minutes and stop feature work by 5:45 PM when starting early enough; this frontend freeze is a proposed demo practice, separate from the source document's agent-harness freeze. Use the earlier of that cutoff and the required test reserve. If the cutoff has passed, stabilize/rehearse the last working slice. If the deadline has passed, record that fact and use the full roadmap only when the user requests continued implementation. Do not treat expired clock times as current instructions.

**Minimum fallback:** Existing catalog + API-backed selected-star details + clear claim/loading/error states. It is not the requested sky demo, and must be labeled a partial result. Do not promise the full demo target if only this fallback is complete.

**Demo acceptance:** Open with location denied → see Starbase fallback → optionally choose a real currently-night preset → navigate the live sky or explicitly reported catalog fallback → select a star → read real owner/approved content → log in/out if included. A claim with no post must either be verified correctly or remain unknown under disclosed incomplete coverage. Direct links and refresh must work. Existing design tokens and shadcn Base UI remain the foundation throughout.

## 7. Full-product delivery phases

Effort ranges are planning estimates for one experienced frontend engineer with timely backend/design support. They include ordinary integration and validation, but exclude waiting for unavailable services or a major hosting migration. Each phase ends in a demonstrable outcome.

| Phase | Main work | Exit condition | Dependency / indicative effort |
| --- | --- | --- | --- |
| **0. Align contracts and product decisions** | Reconcile the drafts with current code; settle time/globe semantics; inventory reusable UI; define claim-summary data; establish target demo devices and release scope. | A short decision record, confirmed API gaps, and a viable route/hosting approach. | Frontend + backend + product/design; **0.5–1 day**. |
| **1. Establish the application and data foundation** | Extend tokens/primitives and navigation; create API/session boundaries; prepare full-catalog assets and lookup; add loading/error patterns, credits, and a basic accessible catalog path. | Real HYG data loads; a star can be selected outside the canvas; deep links work on the target server. | Phase 0; **1–2 days**. |
| **2. Build the interactive sky and observer controls** | Implement sky coordinates, horizon, star points, drag/zoom, picking, observer presets/coordinates, globe marker, camera restoration, motion controls, and low-quality fallback. | A selected star appears in the correct direction for a fixed place/time; mouse, touch, and keyboard journeys work; location denial does not block use. | Phase 1 assets and astronomy contract; **2–4 days**. |
| **3. Complete public discovery and star pages** | Join complete claims to catalog IDs; add hover/tap previews, full star pages, approved media, search, “Find in sky,” sharing, and polling. | A visitor can discover a claimed star, open its page, view its approved content, and return to the same sky. Claims without posts appear correctly. | Phases 1–2 and claim coverage from backend; **2–3 days**. |
| **4. Enable accounts and community participation** | Add sign-up/login/logout, return navigation, authenticated reads, per-post reactions, comments, moderation states, retry safety, and session expiry behavior. | An iOS claim/post becomes visible on the website after approval; another signed-in user reacts/comments; private states stay private. | Phase 3 and live auth/social/moderation integration; **1.5–3 days**. |
| **5. Integrate the star guide** | Add contextual panel/sheet, selected-star context, streamed answers, cancellation, retries, busy/rate-limit handling, and session-only conversations. | A real model answers about the selected star; partial output and service failure are recoverable without disrupting browsing. | Phase 4 and a reachable guide service; **1–2 days**. |
| **6. Refine realism and verify the release** | Add/tune day and twilight behavior, Sun/Moon, loading reveal, optional overlays; profile target devices; finish accessibility, failure recovery, deployment, and rehearsal. | The agreed release passes the acceptance checks below on the actual demo origin and devices. | Earlier core phases; **2–4 days**. |

**Full-product planning envelope:** approximately **10–19 engineering days**, plus roughly 20–30% contingency for rendering, browser, and service integration issues. This estimate applies only to the complete roadmap. Use D0–D6 for the deadline demo; do not turn the full roadmap into a same-day commitment.

**Critical path:** decisions and data → route/app foundation → sky and public star journey → authenticated participation → release verification. The guide and advanced effects are separable from core browsing. Backend claim coverage, thumbnail support, and model readiness can progress alongside frontend work once their contracts are agreed.

Three full-product checkpoints are: **public exploration complete** after Phase 3; **community participation complete** after Phase 4 plus release checks; **full experience complete** after Phases 5–6. The smaller D0–D6 demo has its own acceptance gate above.

## 8. Screen coverage and interaction priorities

| Surface | Planned completion criteria |
| --- | --- |
| Loading and reveal | Report real completed work. Show the usable sky or catalog before optional services finish. Provide retry/fallback without requiring a full reload. Reduced motion removes decorative sequencing. |
| Sky and previews | Distinguish known claim states; match picking to visible positions; handle overlapping targets; keep cards reachable as the pointer moves into them. Provide tap selection and a clear open-page action. |
| Globe/place picker | Preserve the rectangular direction/FOV indicator. Work through click, keyboard, and touch, not hover alone. Presets and coordinates work without internet. A place change updates the sky and visible context together. |
| Star page | Stable title/ID, claim owner/date, sourced facts, approved posts/media, reactions, comments, guide entry, sharing, and a reliable return path. Below-horizon stars remain available as pages; “Find in sky” explains visibility and offers an explicit place change. The clock remains live. |
| Search/catalog | Search across the whole supported dataset, including unnamed stars and identifiers. Keyboard navigation and a non-canvas browse path work. Do not imply that API cursors paginate star matches when they paginate matching posts. |
| Account forms | Visible labels, shared validation limits, password visibility, rate-limit feedback, and return to the prior context after login. An expired session preserves a comment draft for the current user journey without exposing it to another account. |
| Community controls | Present reactions at the post level. Count comment length using the contract's Unicode rules. Show the author's pending, delayed, rejected, and review-failed states where supported; public readers see approved content only. |
| Guide | Desktop panel/mobile sheet, accessible finished-answer announcements, stop/retry/new-chat controls, bounded history, and selected-star context. Model output remains distinct from sourced catalog facts. |
| Credits and missing pages | Include dataset and asset provenance, a useful unknown-star/not-found state, and navigation back to exploration. |

## 9. Backend and cross-team dependencies

| Dependency | Current evidence | Required outcome / fallback |
| --- | --- | --- |
| Public star/search/feed reads | Present in the contract and route matrix | Reuse shared schemas and fixtures; verify the running backend. Public routes ignore cookies and return approved content only. |
| Complete claim overview | Proposed `/api/public/claimed` is absent from the inspected route matrix | Backend supplies a bounded, complete claim index or equivalent public batch lookup. Define owner, ID, coverage/version, and optional approved preview. Feed-only highlights are a clearly labeled temporary subset, never an authoritative unclaimed map. |
| Authenticated detail/content | Separate authenticated routes exist | Use them for personal reactions and the author's moderation state. Sending cookies to public routes will not reveal these fields. |
| Preview images | Media endpoints exist; thumbnail query is only a draft proposal | Confirm actual thumbnail support or add server-produced derivatives. Until then, limit image loading and measure transfer size. Link title previews also need real metadata support; otherwise show the domain/URL. |
| Social writes | Comment creation and per-emoji PUT/DELETE routes exist | Retain the same idempotency key/payload when retrying a timed-out comment; reconcile reactions with server counts. |
| Guide | POST streaming contract and fixtures exist | Test against the real local model. Send `explore` mode, valid star context, and bounded message history; handle JSON failures before a stream and error events afterward. |
| Geocoding | No route confirmed | Ship presets and coordinates first. Add an explicitly chosen provider later, with caching, attribution, and visible disclosure of transmitted search text. |
| Assets/design | Working primitives and styles exist; final brand assets remain a product choice | Reuse the current source of truth. Final logo and optional sky textures should not block functional delivery. |
| Deployment | Same-origin API and static frontend are configured | Verify browser-origin checks in development and production, asset paths, deep links, secure location support, and access from a second device. |

If public Nominatim is considered later, it prohibits autocomplete, limits total application traffic to one request per second, and requires identification and attribution. It should not be an automatic fallback for a live typeahead field; choose a provider that supports the intended interaction. [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/).

## 10. Quality and acceptance strategy

### Scientific and data correctness

Validate ID uniqueness, catalog checksum/version, coordinate units/ranges, missing-value handling, and joins with claims. For the demo, verify representative bright-star directions, north/east orientation, horizon classification away from the immediate boundary, and agreement between rendering and selection. Fixed timestamps belong in tests only. Do not impose a 0.1° demo release gate; document approximations and visible alignment limitations. A measured angular error budget can be established later for the full product against independent references in both hemispheres and at coordinate edge cases.

Ensure render, selection, and “Find in sky” use the same transformations. Show enhancements to claimed-star brightness as interface emphasis, not a change in the catalog's apparent magnitude. Keep the user-visible clock live; describe any idealized rendering without implying actual weather or a different time.

### Accessibility and interaction

Verify the complete browse/login/comment journey with keyboard only and through the catalog/list alternative. Test focus containment/return, screen-reader names and status messages, visible errors, at least 44 px touch controls, reduced motion, forced colors, 320 px width, and 200% zoom. Add a persistent pause/resume control for automatic camera motion; do not resume while the user is interacting with a card or panel. Global shortcuts must not capture typing in fields.

### Performance and resilience

Use these as initial acceptance budgets on agreed test hardware:

- Useful sky interaction within about 3 seconds on the demo LAN from a cold load; measure the actual device/network combination.
- Approximately 60 fps on the target laptop and at least 30 fps on the supported phone, with adaptive pixel ratio/effects where necessary.
- Catalog/list and direct star pages remain usable without loading the sky engine first.
- Pause rendering and polling while hidden. Avoid overlapping refresh requests and refetch after local writes.
- Cap initial visual quality before removing essential interactions. Any selected star remains discoverable in the catalog even if omitted from the current rendering quality level.
- Recover from WebGL context loss, API timeouts, broken images, unavailable location, and guide interruption. Preserve known data with a stale indicator where appropriate.

Measure the complete critical download, including framework, renderer, catalog, and fonts; do not rely on a JavaScript budget that excludes most of the first-load cost. Offline support means already loaded/cached astronomy and controls remain useful; a first visit without network and offline community writes are not part of this plan.

### Community integrity and release checks

Use runtime schema validation for fixtures and API boundaries; TypeScript types alone do not validate JSON. Cover auth expiry, user-cache isolation, comment retry without duplication, reaction rollback, private moderation visibility, pagination, and SSE chunk boundaries/termination. Display user text safely and restrict external links to supported URL schemes.

The full-product release rehearsal must include the following; the deadline demo uses its narrower D6 journey and reports omitted features explicitly:

1. Open the site anonymously, with location unavailable, on the actual server origin.
2. Browse the full catalog and sky; select both a claim with approved content and a claim with no posts.
3. Open and refresh a direct star URL; use search, back navigation, and “Find in sky.”
4. Sign in as a second user; react and submit a comment; observe moderation and eventual public visibility.
5. Demonstrate that another user cannot see private pending/rejected content.
6. Ask the guide about the selected star, then exercise a busy or interrupted response if the guide is in release scope.
7. Repeat the essential journey on Safari and Chromium, a touch device, keyboard only, reduced motion, and with WebGL disabled.
8. Verify that missing AI or internet access does not break the catalog or core browsing experience.

## 11. Scope control, risks, and handoff

| Risk | Planned control |
| --- | --- |
| Sky realism consumes the schedule | Prove a simple accurate sky first; defer Milky Way, planets, twinkle, and advanced atmosphere before cutting the working star journey. |
| Missing claim-summary API | Resolve during Phase 0. Do not mask missing coverage with “Unclaimed.” |
| Static export breaks deep links or makes builds impractical | Run the route/build experiment before implementing every screen. |
| Daytime hides the demo stars | Let the user explicitly select a preset where it is currently night; show the changed place and keep the current instant. Catalog access remains available during local daylight. |
| Local model/moderation failures | Keep browsing independent, show real processing state, and use preapproved demo content if needed. The frontend never fabricates approval. |
| Scientific estimates look authoritative | Carry provenance and uncertainty through the UI; prioritize well-supported facts. |
| UI or catalog changes elsewhere in the workspace | Coordinate integration around reviewed contracts and preserve unrelated in-progress work. |

For the deadline demo, follow D0–D6. Defer signup, social writes, guide, search expansion, advanced sky effects, constellation overlays, and address geocoding. Preserve the existing accessible catalog, public star reading, truthful data states, and verification. A sky-only visual prototype or catalog-only fallback is a smaller result and must be described that way.

**Handoff artifacts:** the decision record; confirmed API gap list; reproducible catalog assets and provenance; screen/state checklist; measured performance and astronomy results; cross-browser acceptance results; and a runbook covering build, serving, live-time demo place, accounts, service failures, and known limitations. The frontend is ready when the selected release journey works on the actual deployment and the evidence supports its claims of correctness.

## Reference baseline

- [Frontend UI draft](/Users/sihochoi/Downloads/FRONTEND_UI_PLAN.md) and [project document](/Users/sihochoi/Downloads/STAR_TAGGER_PROJECT_DOCUMENT.md): desired experience and broader context.
- [Frontend reference README](/Users/sihochoi/Documents/place_holder_name/apps/web/README.md), [frontend package](/Users/sihochoi/Documents/place_holder_name/apps/web/package.json), and [hosting configuration](/Users/sihochoi/Documents/place_holder_name/apps/web/next.config.ts): current frontend foundation.
- [API contract](/Users/sihochoi/Documents/place_holder_name/docs/api-contract.md), [route matrix](/Users/sihochoi/Documents/place_holder_name/docs/route-matrix.md), and [shared constants](/Users/sihochoi/Documents/place_holder_name/packages/shared/src/constants.ts): current interface behavior. Hosting prose in the contract lags the current configuration.
- [Catalog README](/Users/sihochoi/Documents/place_holder_name/catalog/README.md) and [version manifest](/Users/sihochoi/Documents/place_holder_name/catalog/VERSION.json): dataset structure, provenance, and checksum.
- Repository inspection and read-only catalog checks were performed for this plan. No application build, runtime verification, or live-model validation was performed as part of the planning task.

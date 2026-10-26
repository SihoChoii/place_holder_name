# Frontend deadline-track execution

Run: October 25, 2026. Started **5:04:09 PM PDT** (October 26, 00:04:09 UTC). The controlling deadline is **6:04:09 PM PDT**, one hour from this run's start; historical 5:45 PM/6 PM cutoffs were disregarded. Track: **D0–D6**, not the full FE-00–27 product roadmap.

Status: **D0–D6 complete and verified**, finalized at approximately **5:26 PM PDT**, about 22 minutes after start and before the 6:04:09 PM deadline. This is completion of the bounded deadline track; the explicitly deferred full-product gates below remain open.

## Execution ledger

| Step | Status | Delivered and evidence |
| --- | --- | --- |
| D0 | Done | Clean baseline on `codex/frontend`; existing Next 15.5.28/React 19/Tailwind 4/Base UI/Inter retained. Baseline build and desktop/narrow screenshots. Same-origin Fastify serves each exported HTML shell. One `/star` shell; valid clean aliases redirect. Missing assets/API paths remain 404. |
| D1 | Done | Generated pinned 8,920-star asset, runtime shared-schema validation, public facts/ownership/approved content, shared credits, direct links, separate catalog/community retries. Real owner with no approved posts, null distance, and API failure verified. |
| D2 | Done | Live sidereal/precession/observer projection, perspective canvas points, black ground, drag/wheel/pinch, shared render/pick geometry, keyboard selection, and full catalog fallback. Reference math checks and real browser selection pass. |
| D3 | Done, deadline subset | Honest unknown/claimed/unclaimed state and hover/tap cards. Per-star public confirmation, five-second foreground polling, 15-second ownership freshness. Failed/version-mismatched data never becomes unclaimed. **No complete claims index exists; full FE-15 remains incomplete.** |
| D4 | Done | Natural Earth globe, observer marker, rectangular heading/FOV schematic, three sourced presets, custom coordinates, one nonblocking initial location request, Starbase fallback, explicit retry. Manual viewpoint wins over late GPS. Browser tests cover denial, manual choice, globe heading/FOV changes, and request count across navigation. |
| D5 | Done | Existing-account login/logout via the actual API and HttpOnly cookie. Correct return to the selected star, bad credentials, failed logout, successful logout, and no token in local storage verified. Catalog/first-frame loader has actionable failure states and does not wait for auth/location/community. |
| D6 | Done | Production build and type checks pass; 6 frontend logic, 18 API, and 25 browser checks pass. Direct refresh, keyboard/touch/narrow layouts, location denial/timeout, media visibility, unknown/error recovery, login/logout, and console health verified. Screenshots/logs preserved outside the repo; documentation and production fixture audit complete. |

## What changed

- `apps/api/src/app.ts`: explicit static route mapping and validated clean star aliases. No new API contracts, all-star route generation, or new backend ownership assumptions.
- `apps/web/scripts/catalog.mjs`, `public/catalog`, `src/lib/catalog.ts`: deterministic pinned catalog generation and one shared asynchronous decoder/cache.
- `src/sky`: live astronomy, observer/camera state, rendering and shared picking, globe and place picker, loading/failure UI, hover/tap previews, and accessible in-view links.
- `src/lib/api`, `src/features`: typed/schema-checked API reads, public cache, approved content, existing-account session/login/logout, global navigation, and shared credits.
- `src/app`: thin static routes `/`, `/star`, `/catalog`, `/login`, `/credits`, not-found, and favicon. Existing tokens and Base UI components retained; only the missing Base UI popover wrapper was added.
- Existing catalog components and library persistence extended to all 8,920 stars. The original `stargaze-reference-library-v1` saved-star/note storage key is unchanged.
- Focused test scripts and static-serving regression tests. No dependency upgrade, lockfile change, fixture production mode, or changes to the user's database or `.env`.

## Run and use

With dependencies and the existing `.env`/JWT secret prepared, normal configured operation is:

```sh
pnpm build
pnpm start
```

Website/API: `http://127.0.0.1:4000`. Set `APP_ORIGIN` to the actual browser origin. Restart the API after rebuilding; static asset routes are registered on startup. For development, use `pnpm dev` (Next on 3000, `/api` proxy); add that origin to `APP_ORIGIN`.

The inspected `.env` had no LAN model-host URLs. For this read-only slice with those services deliberately unavailable:

```sh
GUIDE_BASE_URL=http://127.0.0.1:9 CLEF_BASE_URL=http://127.0.0.1:9 MODERATION_ENABLED=false APP_ORIGIN=http://127.0.0.1:4000,http://localhost:4000 pnpm start
```

This disables the moderation worker and does not fake guide/moderation success. Use real model hosts and `pnpm models:check` before claiming live model acceptance. New environments can use `pnpm setup` to prepare dependencies, database, and the generated JWT secret. Existing-account login requires an actual account; the user's existing database was inspected read-only and had no users at this run's start.

The local demonstration server uses only `/tmp/star-tagger-qa/db.sqlite` and `/tmp/star-tagger-qa/media`, populated by the existing demo seed. Demo posts remain pending. Its existing demo login is `demo.ada@example.com` / `stargaze-demo-1`; these are disposable demonstration credentials, not production users. Start that isolated preview with:

```sh
DB_PATH=/tmp/star-tagger-qa/db.sqlite MEDIA_DIR=/tmp/star-tagger-qa/media HOST=127.0.0.1 PORT=4000 APP_ORIGIN=http://127.0.0.1:4000,http://localhost:4000 MODERATION_ENABLED=false GUIDE_BASE_URL=http://127.0.0.1:9 CLEF_BASE_URL=http://127.0.0.1:9 pnpm start
```

Useful direct links: `/star?hyg_id=32263` (Sirius), `/star/32263` (validated redirect), `/catalog`, `/credits`, `/login`. Invalid query IDs render not-found inside the static HTTP 200 shell; invalid clean aliases and nonexistent routes return HTTP 404.

Sky controls: drag to look; wheel/pinch or +/− buttons to zoom; arrows and +/− while the canvas is focused; Enter selects the nearest visible star to the center; Escape closes a preview. A sky at a daylight location legitimately has few/no stars. Choose a currently dark preset to see night at the same live time. There is no preview clock or night mode.

## Validation and evidence

Flow under test: production sky → change viewpoint → drag/zoom/select/preview → public star → login and return → logout → catalog and credits. Also direct entry/refresh and recovery from missing resources or unavailable services.

Environment: local macOS, actual Fastify production static export on a random loopback port, installed Playwright 1.62.1 / Chromium 1248; desktop 1440×1000, narrow 390×844 and 320×844, and mobile touch emulation at DPR 2 with reduced motion. **Browser plugin not available**, so the installed regular Playwright runtime was used. No browser dependencies were added to the project.

```sh
pnpm typecheck
pnpm test
PLAYWRIGHT_MODULE=/Users/sihochoi/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright \
BROWSER_EXECUTABLE='/Users/sihochoi/Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing' \
BROWSER_ARTIFACTS=/tmp/star-tagger-qa pnpm test:web:browser
```

The browser harness creates a genuine account, claim, and pending post through the actual API in disposable SQLite storage. It does not approve that post. Approved note/image/link/reaction/comment rendering and the photo dialog are separately verified through explicit Playwright interception of the shared public fixture, including a test-only image. Those fixtures are not imported into the frontend. Existing API regression tests use fake model servers and do not prove live model integration.

Final result: **production build, type checks, 6 frontend logic tests, 18 API tests, and 25 browser acceptance checks passed**. The browser suite verifies page identity/content, no framework overlay or uncaught application errors, loading/live time, drag/wheel/pinch, keyboard and hover focus, actual claim/auth integration, pending privacy, unknown/failure recovery, full-catalog search/saved persistence, direct refresh, credits, narrow layouts, GPS denial/timeout/manual precedence, and catalog/canvas failure recovery. No unexpected console errors or warnings were observed; anonymous 401 and deliberately injected resource failures are expected. The last browser run served the actual export at `http://127.0.0.1:60440` with disposable storage and exited successfully. The separate handoff preview remains at `http://127.0.0.1:4000` (PID 89776 when started).

The final local cold-page sample reached the sky in 963 ms including an injected 350 ms catalog delay. This is a local observation, not a network or mobile performance SLA. The exported sky entry was approximately 190 KB first-load JS; the separate catalog asset is 1,148,587 bytes. Only one star HTML shell is exported. An audit of production source, public assets, and exported output found none of the test-only account or shared-fixture content strings.

Browser screenshots and logs are outside the repository under `/tmp/star-tagger-qa`; 14 final evidence files are preserved under `/Users/sihochoi/.codex/visualizations/2026/10/26/01a17585-493e-7621-a101-679b3be9c765/star-tagger`. Baseline screenshots remain in `/tmp/star-tagger-qa`. Visual checks caught/fixed narrow in-view-row overflow and a camera-frame/picking timing mismatch. Preview anchors are dismissed on camera/viewpoint changes; accessible in-view buttons use the latest projected position.

Evidence: [browser results](/Users/sihochoi/.codex/visualizations/2026/10/26/01a17585-493e-7621-a101-679b3be9c765/star-tagger/browser-results.log), [build](/Users/sihochoi/.codex/visualizations/2026/10/26/01a17585-493e-7621-a101-679b3be9c765/star-tagger/final-build.log), [logic/API tests](/Users/sihochoi/.codex/visualizations/2026/10/26/01a17585-493e-7621-a101-679b3be9c765/star-tagger/test-results.log), [type checks](/Users/sihochoi/.codex/visualizations/2026/10/26/01a17585-493e-7621-a101-679b3be9c765/star-tagger/typecheck-results.log), [desktop sky](/Users/sihochoi/.codex/visualizations/2026/10/26/01a17585-493e-7621-a101-679b3be9c765/star-tagger/sky-desktop.png), [touch preview](/Users/sihochoi/.codex/visualizations/2026/10/26/01a17585-493e-7621-a101-679b3be9c765/star-tagger/touch-preview.png), [320 px detail](/Users/sihochoi/.codex/visualizations/2026/10/26/01a17585-493e-7621-a101-679b3be9c765/star-tagger/star-320.png), [API failure](/Users/sihochoi/.codex/visualizations/2026/10/26/01a17585-493e-7621-a101-679b3be9c765/star-tagger/api-failure.png).

## Data and scientific provenance

- HYG source: repository `catalog/stars.json`, pinned by `catalog/VERSION.json` SHA-256 `e4ff3d913142288763a8efacd4e4527919f8617ac3726c37c0dae588558cd58b`. Build checks 8,920 unique non-Sun stars at magnitude ≤6.5, preserved nulls, and constellation endpoints including supplemental line stars. All 205 unknown distances stay null, not zero.
- The browser asset preserves catalog attribution and estimate flags. Source RA/Dec are degrees at J2000; shared API RA is hours. Live rendering uses J2000 precession and geometric altitude/azimuth. No fixed-date celestial fixtures appear in production.
- References: [USNO sidereal time](https://aa.usno.navy.mil/faq/GAST), [altitude/azimuth](https://aa.usno.navy.mil/faq/alt_az), [approximate Sun](https://aa.usno.navy.mil/faq/sun_approx). IAU 1976 precession formulae are applied from J2000. The deadline track does not claim a measured 0.1° accuracy gate.
- Globe source: [Natural Earth 1:110m land GeoJSON](https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_land.geojson), [public-domain terms](https://www.naturalearthdata.com/about/terms-of-use/). Source SHA-256 `9e0729ee253ca7d7a5c4ae9395fb1902264c5377c52e224d13dd85010e2835d9`; derived `public/earth-land.json` SHA-256 `9c7f0c3330d60fa149616bd2380e01b1d465542d6c6f33077fb02a2930d86d2c`. Polygon exterior rings were rounded to two decimal degrees; 128 lines. This small map is a schematic, not a GIS navigation tool.
- Preset references: [FAA Starbase/Boca Chica](https://www.faa.gov/space/stakeholder_engagement/spacex_starship), [Greenwich astronomy heritage](https://web.astronomicalheritage.net/index.php/show-entity?identity=000034&idsubentity=1), [ESO Paranal](https://www.hq.eso.org/sci/facilities/paranal/astroclimate/site.html). Locations are approximate. All attribution is reachable through `/credits` and Data sources.

## Explicitly incomplete or unverified

- Full FE-15 ownership coverage: no public claim-summary endpoint exists. Unchecked stars remain unknown; the UI states that coverage is partial. This is the plan's permitted D3 subset, not completion of the full ownership-index feature.
- Real approved content from live moderation was unavailable. Positive approved-content UI cases are fixture-tested; real API pending/rejected visibility and ownership/auth are integrated. No approvals were manufactured and no model success was fabricated.
- Signup, claim/reaction/comment/post writes in the web UI, guide chat, geocoding, expanded search overlays, thumbnails, and advanced effects were deferred as instructed.
- No physical phone, Safari/WebKit, screen reader, true browser 200% zoom, LAN HTTPS, real-device GPS, low-end GPU, slow mobile network, or long-duration performance acceptance was performed. Narrow layouts, keyboard operation, touch events, reduced motion, and GPS error callbacks were exercised in Chromium.
- The sky is geometric and approximate: no refraction, proper motion, lunar/planet rendering, sensor orientation, terrain, or photorealistic atmospheric effects. Rendering does not require WebGL. Both unsupported canvas and catalog errors lead to explicit fallbacks; those fallbacks are not represented as a completed sky.
- Local saved stars/notes remain browser-specific and are not synced to the account. The full product roadmap and iOS/device/model gates remain open.

## Subsequent exploration

At the user's request for another-hour opportunities, a follow-up review found additional cases outside the original acceptance suite: ownership freshness on tab resume, expanded-comment freshness/deletion, and pinch-to-single-pointer continuation. These remain proposed fixes, with reproductions and priorities in [the next-hour review](frontend-next-hour.md). That review also records that the temporary preview process subsequently received `SIGTERM`; the prior localhost availability statement is historical, not a guarantee of a persistent server.

At publication, concurrent branch `backend/api` had added `/api/public/claimed` and media thumbnails in commit `19be65feef8456b4fd631dcb05610a92ee927a3e`. That addition is not integrated here; statements above about a missing index describe the implementation baseline. The next frontend step should reuse and verify that contract. This frontend snapshot is published separately from the concurrent branding work.

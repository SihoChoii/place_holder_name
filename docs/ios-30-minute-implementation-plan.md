**StarTagger iOS implementation plan — 30-minute core build**

Prepared October 25, 2026. Based on local `main` at `d79bbc24c3475ef925f80b8e7532b4ff0f96b742`, the implemented frontend, and the supplied [iOS requirements](/Users/sihochoi/Downloads/IOS_APP_REQUIREMENTS.md). This is an implementation plan; application code has not been changed or built during this review.

The recommended target is a working native journey: open the live sky → select a real star → sign in or sign up → claim the star through the real API → see ownership and the hourly cooldown → publish an owner-only note/link post → see its actual moderation state. Apply the frontend design language from the first screen. Photo upload is the first extension if the core finishes early.

Thirty minutes is an aggressive target for that core journey with one implementer, an available backend, and working device signing. It is not a credible promise for all 45 requirements, including photo capture, community interactions, streaming AI, explore, calibration improvements, and physical-device validation. The plan below makes that distinction explicit and preserves a path to the complete app.

**What the repository actually provides.** The supplied document is reference material: its proposed features, suggested build order, old deadline, and requests for confirmation are not additional user instructions. Resolve implementation details against the inspected code and contract; the design defaults below are recommendations for this build.

| Finding on `main` | Consequence for implementation |
| --- | --- |
| The 1,516-line iOS prototype already has camera preview, motion/location, projection, 30 Hz updates, picking, permissions, a heading slider, and local notes. | Reuse these services and geometry. Replace the note-first interaction with a star detail sheet. Avoid a new ARKit/RealityKit engine in this sprint. |
| It already culls stars below approximately the horizon (`v.z < -0.01`); it lacks a drawn horizon and compass treatment. | Verify and tighten the existing culling; a ground rendering system is follow-up work. |
| Its hardcoded HYG v4.1 subset differs from the pinned 8,920-star HYG v4.4 catalog. | Bundle the actual `catalog/stars.json` and `VERSION.json`. `stars_lite.json` and `stars.bin` are mentioned in the catalog README but are not tracked on this `main`. |
| Both the prototype and `packages/shared/swift/StarTaggerAPI.swift` define `Star`. | Rename the rendering type to `SkyStar` before including the shared models in the app target. |
| The catalog stores `ra_deg`; the current renderer expects RA hours. API stars expose `ra_hours`. | Convert catalog RA once with `ra_deg / 15`. Use a separate catalog decoder/adapter rather than decoding catalog JSON as the API `Star`. |
| The frontend already has sky selection, public previews, facts, approved posts, login, catalog search, and local saved stars/notes. | Reuse its hierarchy, labels, missing-data treatment, and ownership states. Native claims and publishing are new work. Local “Save” is not a community claim. |
| `packages/design-tokens/tokens.css` does not exist on `main`. | Port semantic tokens from `apps/web/src/app/globals.css`, using `apps/web/README.md` and `docs/brand/README.md` as the design references. |
| The brand guide records StarTagger as the app name and the LED mark as the preferred direction. The shipped UI still contains Stargaze. | Use StarTagger in new UI/display-name copy. Keep the existing target, bundle identifier, and saved-note storage keys during this sprint. |
| Public star, media, feed, search, and claimed-index routes are now documented and represented in the Swift models. | Anonymous browsing is possible. `/public/claimed` is no longer an unconfirmed endpoint, despite older frontend/requirements prose. |
| Xcode 26.4.1 and XcodeGen are installed on this Mac. | Build tools are available. Signing, phone connectivity, backend reachability, and live moderation have not been verified by this planning review. |

**Adapt the frontend to a phone.** Build a SwiftUI camera-first shell with `NavigationStack`, one selected-star sheet, an authentication presentation, and an account sheet. Keep the camera visible behind the selected star where practical. Use a small enum for mutually exclusive presentations and preserve the selected HYG ID when authentication opens. Keep the existing `ObservableObject` sensor services; use narrowly owned state for new views and shared session/API dependencies at the app root.

| Frontend behavior | Native behavior |
| --- | --- |
| Drag/pinch live sky and observer globe | Camera plus physical phone orientation; compact compass/heading and calibration control. |
| Hover/tap preview | Tap target with at least a 44-point effective hit area → medium-height detail sheet; expand for facts and posts. |
| Star page with facts, ownership, posts | One reusable `StarDetailSheet`: name and constellation, ownership, primary action, facts, then community content. |
| “Find in sky” changes the virtual camera | Later, directional guidance tells the user where to point the phone; it cannot rotate the real camera. Show “Below horizon” when applicable. |
| Browser login returns to the originating star | Native sign-in/sign-up returns to the same sheet. After login, refresh ownership and eligibility; the user explicitly taps Claim. |
| Save star / local note | Keep existing personal notes accessible as “Local notes.” Add a distinct server-backed Claim action and owner-only Add post action. Do not migrate local notes into public posts automatically. |
| Ownership unknown / unclaimed / claimed | Preserve all three. Failed or stale requests never mean “Unclaimed.” Use the frontend's single ring for verified unclaimed, double ring for claimed, and no ownership ring for unknown. Use a separate selection reticle. |
| Catalog and global search | An explicit Explore entry after the core is working. Default local mode shows only stars in the current view. An accessible “Stars in view” list can select the same visible objects. |
| Branded loading and guide motion | Static identity while actual resources load; never delay usable content for an animation. Astral Harness branding belongs to the later guide feature. |

Recommended defaults: portrait, iOS 17+, dark appearance, live time, constellation lines off initially, session-only heading offset, and no automatic camera panning. Daytime remains a real sensor view with an explanatory label; do not silently move the observer to another place or time. Simulator sensor substitutes must be visibly labeled and confined to development.

**Port the design system immediately.** Introduce `AppTheme.swift` and shared native button, field, fact-row, and status styles. Apply them while building auth and details, rather than leaving design until the end.

| Role | iOS value / treatment |
| --- | --- |
| Background / grouped surface / overlay | `#000000` / `#0A0A0A` / `#141414` |
| Primary / body / secondary text | `#FFFFFF` / `#E5E5E5` / `#A3A3A3` |
| Separator / control border / interaction highlight | `#292929` / `#737373` / `#1F1F1F` |
| Primary action | White fill, black label; one primary action per task area. Outlined secondary actions. |
| Geometry | Square custom controls, flat opaque panels, no decorative shadows or glow. Preserve native sheet gestures and safe areas. |
| Spacing | 4-point rhythm; 12-point gaps; 24-point content gutters/sections where space permits. |
| Type | Inter; 24–28-point detail titles, 17-point reading/input text, 14-point metadata as starting sizes, all tied to Dynamic Type. Tabular numerals for measurements and cooldown. |
| Interaction and accessibility | Minimum 44-point targets; prominent controls 48 points; words/icons for states; VoiceOver labels and an accessible visible-star list; respect Reduce Motion. |

The repository's Inter asset is WOFF2. Acquire a licensed Inter TTF/OTF, include its license, register it in `UIAppFonts`, and scale it with native text styles. Apple documents the supported native font setup and Dynamic Type behavior in [Adding a custom font](https://developer.apple.com/documentation/uikit/adding-a-custom-font-to-your-app) and [Applying custom fonts](https://developer.apple.com/documentation/swiftui/applying-custom-fonts-to-text). If the font asset is unavailable during the timebox, use the system font through the same theme wrapper and record the design deviation; do not block claiming.

Keep the camera feed and user photographs in their original color. Replace the prototype's yellow/red/cyan/orange UI accents and color picker in the main journey with the monochrome system. Use a live StarTagger wordmark initially; conversion and replacement of all app-icon assets can follow the working flow.

**Execution schedule.** Times are elapsed engineering time, including the initial build check. Run on an isolated branch based on the inspected `main`; the currently open checkout is `codex/branding`. Do not reset or overwrite another active checkout. This plan does not authorize implementation by itself.

| Minutes | Work and dependencies | Exit condition |
| --- | --- | --- |
| 0–3 | Generate/build the existing project. Confirm signing/device availability and the API origin. Add shared model source membership, resolving the `Star` collision. Start theme tokens and configurable networking. | Baseline compiles; a real API request can reach the intended server. If either fails, spend remaining time resolving it and report the reduced deliverable. |
| 3–7 | Bundle pinned catalog, map its fields and units, preserve sensor renderer/picker, and replace tap-to-note with the themed detail sheet. Show offline facts immediately. | A visible star opens correct facts and ID; no network is required for the sky or bundled facts. |
| 7–12 | Implement `APIClient`, Keychain-backed `SessionStore`, login/signup, 401 recovery, `/me`, public/authenticated detail loading, and account/logout. | A real account signs in, survives relaunch, and returns to the selected star. Unknown ownership is explicit. |
| 12–18 | Implement the claim state machine, idempotent retry, authoritative cooldown, conflict refresh, and owner-only Add post action. | A real claim persists, ownership refreshes, and a second claim is blocked by the server cooldown. |
| 18–23 | Add note/link multipart posting, author moderation states, post reading/deletion, and foreground polling for the selected star. | The owner submits a post, sees the real pending/approved/rejected/failed state, and a non-owner has no composer. |
| 23–25 | If the core passes, add photo-library upload with image normalization. Otherwise fix integration defects and improve permission/offline states. | Photo upload is either verified end to end or explicitly deferred; no nonfunctional action is exposed. |
| 25–30 | Freeze features, rebuild, execute the critical checks below, and perform the real-device walkthrough. Record implemented, deferred, and unverified items. | A reproducible core demo plus honest test evidence and remaining work. |

The dependencies are build/config → catalog/detail + session → claim → owner publishing → verification. Do not sacrifice the final verification window for guide chat, animation, or a new rendering engine. If claiming is not working by minute 18, cut attachments and use the rest of the implementation window to finish claiming. A text-only post is an explicit fallback, not completion of the photo requirements.

**Implementation contracts that must survive the timebox.**

1. **Configuration and authentication:** Store one API origin such as `http://<lan-host>:4000`; append `/api/...` exactly once. On a phone, localhost refers to the phone. Add local-network purpose text and a narrow development ATS configuration appropriate for the actual hostname/IP. Bonjour declarations are only needed if service discovery is implemented. Apple documents IP-address exceptions for iOS 17+ in [NSExceptionDomains](https://developer.apple.com/documentation/BundleResources/Information-Property-List/NSAppTransportSecurity/NSExceptionDomains). Validate the installed app's actual URL request. Store JWT and expiration in Keychain; omit browser Origin/cookies from native auth. Validate password length 12–128 and display name 1–50 code points. Clear session and private in-memory media on logout/401.
2. **Catalog and rendering:** Include `catalog/stars.json` and `VERSION.json` as target resources, decode once away from frame rendering, and validate 8,920 unique IDs and the pinned version. Keep missing distances nullable. Precompute celestial vectors and update location/time-dependent transforms at a lower frequency than orientation projection. Share the projected visible-point list between drawing and picking; avoid the prototype's duplicate full-catalog nearest-star scan on every tick. Cull below-horizon/offscreen stars and bound labels. Preserve the camera's field-of-view/aspect handling. Pause camera, sensors, timers, and polling when inactive. Measure the 30 fps target on the phone; a 30 Hz timer alone is not evidence of it.
3. **Ownership and detail:** Anonymous detail uses `GET /api/public/stars/:id` (a wrapper containing `star`); signed-in detail uses `GET /api/stars/:id` plus `/tags`. Check catalog compatibility before joining API facts to bundled stars. Render “Checking ownership,” “Ownership unavailable,” “Unclaimed,” “Claimed by …,” and “Claimed by you” as distinct states. Show name/ID, constellation, magnitude, distance, spectrum, planet count, and Wikipedia link when present. Defer estimated mass/radius/gravity rather than mislabeling them.
4. **Claims:** Model unauthenticated, loading/unknown, eligible, submitting, cooldown, owned-by-me, owned-by-other, and recoverable-error states. One explicit tap creates a UUID `Idempotency-Key`; retain it across timeouts/retries of that attempt. Disable duplicate submissions. `201` applies the server claim and `next_claim_at`, then refreshes detail and `/me`. `409 already_claimed` refreshes ownership; `409 idempotency_conflict` is distinct and must not be silently retried under a new identity. `429 on_cooldown` uses `retry_after_seconds` and refreshes `/me`. Compute the countdown using `/me.server_time` offset, refresh at expiry/foreground, and never start a cooldown for a failed claim. Claims are permanent in-app associations; retain the same final Claim action after login instead of claiming automatically.
5. **Publishing:** Show Add post only when `claim.owner.id == session.user.id`; backend enforcement remains authoritative. Count `note.unicodeScalars.count`, not Swift grapheme-cluster `String.count`, for the 140-code-point limit. Require a nonblank note or attachment; at most four links/photos combined. Validate HTTP(S), maximum 2,048-character links, credentials and obvious local/private hosts before server validation. Multipart text fields (`hyg_id`, `note`, JSON `links`) precede files. Retain the idempotency key, payload, boundary, and encoded bytes until resolved; retries must not re-encode changed images. Preserve the draft on network/auth failure. Deletion uses `DELETE /api/tags/:id` and refreshes visible state.
6. **Photo extension:** Use the native [Photos picker](https://developer.apple.com/documentation/photokit/bringing-photos-picker-to-your-swiftui-app), load data, correct orientation, downsample, and convert HEIC to JPEG. Enforce 5 MiB and 20 MP per image, four attachments total, and 22 MiB for the complete multipart request including overhead. Show upload activity/progress and an actionable error. Camera capture and the complete attachment editor are follow-up if the library-only path consumes the remaining window.
7. **Content, media, and moderation:** Prefix API-relative media paths with the API origin. Use a request-based image loader with the bearer token for `/api/media/:id`; a plain unauthenticated image URL is insufficient. Never forward the bearer token to external link/media origins. Public image paths remain anonymous. Poll the visible selected screen every five seconds in the foreground and refresh after writes. “Queued/delayed” means awaiting review; “rejected” is a moderation decision; `review_failed` is a processing failure, not rejection. Only the author sees their pending/rejected/failed items. Never fabricate approval to complete the demo.
8. **Local scope:** Selection and interaction default to actual in-view stars. The full catalog supports geometry and offline facts, not an automatically global feed. Add batched `POST /api/view/content` after the selected-star journey works: debounce meaningful visible-ID changes, use 1–200 distinct IDs per request, prioritize selected/bright objects, and never call it per frame. Until this is implemented, check selected stars individually and leave unchecked overlays unknown. Empty view means no request. Keep the signed-out path public.
9. **Account:** Include display name, logout, server cooldown, and refreshable own content. There is no `/me/claims` route: a later complete “My stars” list can filter the documented `/public/claimed` index by user ID and join to the bundled catalog. This explicit account action is separate from the local sky. `/me/tags` supplies all of the author's moderation states. A locally saved claim receipt alone is not a complete cross-device ownership list.

**Keep the code split small.** These are intended file responsibilities under the existing `apps/ios/Stargaze` target, not a requirement for a large architectural rewrite.

| File / group to introduce or adjust | Responsibility |
| --- | --- |
| `StargazeApp.swift`, `ContentView.swift` | Dependency ownership, camera shell, selected star and presentations; preserve working sensor/camera components. |
| `AppTheme.swift` | Semantic colors, scalable typography, reusable controls and status styles. |
| `APIClient.swift`, `APIConfiguration.swift` | Origin handling, shared encoding/decoding, bearer auth, typed errors, idempotency and multipart support. |
| `SessionStore.swift`, `KeychainStore.swift` | Login/signup/restore/logout, `/me`, server clock and cooldown. |
| `CatalogStore.swift`, `SkyStar` | Bundled catalog schema, stable HYG lookup, unit conversion and renderer adapter. |
| `StarDetailSheet.swift`, `AuthView.swift`, `AccountView.swift` | Native equivalents of frontend detail/login; claim action and account state. |
| `PostComposer.swift`, `PostList.swift`, `AuthenticatedImage.swift` | Owner publishing, review state, reading/deletion and protected media. |
| `project.yml` and generated Xcode project | Shared Swift source membership, catalog/font resources, Info.plist keys and configuration. Regenerate together. |

Prefer referencing the shared Swift model file from `project.yml` over forking its response types. Extract existing astronomy/camera code only where needed to unblock integration. Preserve existing UserDefaults notes and their keys.

**Verification is the completion gate.** Begin incremental builds as source membership changes. At minute 25 stop adding features and check the following. Use fixtures/disposable backend data for repeatable error cases; a real permanent claim should be an intentional demo action on a chosen available star.

- Build the actual iOS target and install on the available iPhone. Simulator success does not verify camera, true-north orientation, signing, or LAN access. If no phone/signing is available, report the build/simulator result separately and leave device acceptance open.
- Run the existing `packages/shared/swift/check-fixtures.swift` against the shared JSON fixtures after integrating models. Add only focused behavioral checks for claim retry/idempotency, 409/429/401 transitions, catalog RA conversion, and Unicode post limits as needed; do not spend the sprint on exhaustive UI snapshots.
- Select a visible star and confirm its HYG ID, local facts, horizon behavior, and correct same-star return from auth. Denied permissions offer Settings; an unreachable API preserves the local sky and facts.
- Sign in, claim once, relaunch, and confirm server ownership. Check double-tap/retry, cooldown, another owner's star, and expired auth without creating accidental extra claims. Refresh ownership before asserting eligibility.
- Publish as owner and confirm real pending state; another account/public read cannot see the pending item. If moderation is available, verify the actual approval transition and public display. If it is unavailable, record that limitation; pending persistence alone is not verification of public publication.
- Check that a non-owner has no composer and the API refuses unauthorized posting. Delete an authored test post and refresh. Verify authenticated images if photo upload is included.
- Background and foreground the app: stop sensor/network work, recover the session and cooldown, and avoid duplicate pollers. Check readable text at a larger Dynamic Type size and usable 44-point controls.

Run `/api/health/live` and inspect `/api/health/ready` components during preflight. Guide unavailability should not unnecessarily block sign-in/claim testing, but unavailable moderation prevents verification of approved public posts. Use actual auth/star/write requests to establish which core capabilities work. The backend address, available phone/signing team, and live model readiness are prerequisites to verify, not values to invent.

**Path from the core to the full requirements.** Do these in dependency order after the core is verified; re-estimate from the actual device build. No additional 30-minute guarantee is implied.

| Next increment | Work and completion condition | Requirements |
| --- | --- | --- |
| Complete publishing and local content | Finish photo library and camera capture, four-item mixed attachments, upload progress, protected media, paginated history, complete account lists, author deletion and batched in-view overlays. Verify real approval and visibility across accounts. | R16, R19–26, R29 |
| Community interactions | Exact reaction set `❤️ ✨ 🚀 🤩 👍`, encoded emoji paths and response-authoritative counts; paginated comments, 1–280 code points, idempotent create, own deletion and pending state. | R27–28 |
| Explore and complete facts | Explicit local/explore mode, paged feed, name/HYG search, reuse detail sheets, directional “Find in sky,” and API travel time at 17 km/s with unknown-distance and constant-speed labeling. Place picking remains optional. | R11, R13, R30–31 |
| AI guide | Login-gated chat, 1–6 user/assistant messages, final user message, up to 2,000 characters each; local `scope_hyg_ids` ≤200 or explicit explore; selected star context. Stream `start/delta/done/error`, preserve conversation locally, cancel correctly, and handle rate limits/busy/unavailable/timeouts. Integrate Astral Harness only around the functioning guide. | R32–35 |
| Sky and finish | Known-star calibration, drawn horizon/compass, constellation toggle from bundled geometry, web astronomy parity where warranted, measured ≥30 fps, final Inter/icon integration, complete VoiceOver navigation, credits and scientific limitations. | R4–9, R42–45 |
| Voice, only after a server contract exists | Keep the control hidden until a Grok voice endpoint is available; then add playback and error handling. Do not substitute on-device speech. | R36 |

Core scope targets R1–3, R6, R10, R12, R14–15, R17–20 (note/link subset), R22–24, R26 (reading subset), R29, R37–41, and the foundational parts of R42–45. Existing calibration/horizon/performance behavior covers parts of R4–5/R9 but still needs validation; constellation lines, complete overlays, photo publishing, and remaining account functions are explicitly tracked above. The completed app must satisfy the remaining requirements before being called feature-complete.

**Source references used for this plan.** These links point to the inspected main worktree; the plan itself is saved in the current workspace.

- [iOS prototype](/Users/sihochoi/.codex/worktrees/branding-merge/place_holder_name/apps/ios/Stargaze/ContentView.swift), [project configuration](/Users/sihochoi/.codex/worktrees/branding-merge/place_holder_name/apps/ios/project.yml).
- [Frontend design system](/Users/sihochoi/.codex/worktrees/branding-merge/place_holder_name/apps/web/README.md), [implemented tokens](/Users/sihochoi/.codex/worktrees/branding-merge/place_holder_name/apps/web/src/app/globals.css), [brand guide](/Users/sihochoi/.codex/worktrees/branding-merge/place_holder_name/docs/brand/README.md).
- [Sky interaction](/Users/sihochoi/.codex/worktrees/branding-merge/place_holder_name/apps/web/src/sky/sky-app.tsx), [preview](/Users/sihochoi/.codex/worktrees/branding-merge/place_holder_name/apps/web/src/features/stars/preview.tsx), [star detail](/Users/sihochoi/.codex/worktrees/branding-merge/place_holder_name/apps/web/src/features/stars/star-page.tsx).
- [API contract](/Users/sihochoi/.codex/worktrees/branding-merge/place_holder_name/docs/api-contract.md), [Swift models](/Users/sihochoi/.codex/worktrees/branding-merge/place_holder_name/packages/shared/swift/StarTaggerAPI.swift), [fixture checker](/Users/sihochoi/.codex/worktrees/branding-merge/place_holder_name/packages/shared/swift/check-fixtures.swift), [backend verification status](/Users/sihochoi/.codex/worktrees/branding-merge/place_holder_name/docs/backend-progress.md).
- [Catalog schema and attribution](/Users/sihochoi/.codex/worktrees/branding-merge/place_holder_name/catalog/README.md), [pinned version and checksum](/Users/sihochoi/.codex/worktrees/branding-merge/place_holder_name/catalog/VERSION.json).

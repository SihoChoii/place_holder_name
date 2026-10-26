# StarTagger iOS execution record

2026-10-25, implemented from main `d79bbc24c3475ef925f80b8e7532b4ff0f96b742` on `codex/ios-complete` in an isolated managed worktree. The original `codex/branding` checkout was preserved. The implementation follows [the plan](ios-30-minute-implementation-plan.md), the existing frontend design system, and the shared API contract. Requirements supplied as a reference document were not treated as independent instructions.

## Delivered

The app now contains the complete planned native journey: offline camera sky and full catalog → select a star → authenticate → check ownership → claim → owner post with note/links/photos → moderation state → community viewing, reactions and comments. Account lists, Explore/search, Find in sky, travel-time input, streaming guide, calibration, constellation lines, accessible star list, credits, font, and icon are implemented. Voice remains hidden because the backend has no voice contract. An optional place picker and mass/radius estimates were not part of the accepted implementation scope.

The implementation keeps server decisions authoritative. Claims retain their UUID across retry/relaunch; multipart retries preserve their key, boundary, encoded bytes and reviewable payload; comment retries retain the original key/body. JWTs are scoped to the server in Keychain. Private media uses bearer requests without forwarding credentials to external origins. Identity changes cancel/clear visible private state. Screen polling pauses in the background; sky requests are bounded and debounced.

## Observed results

| Check | Result |
| --- | --- |
| Simulator build | Passed, Xcode 26.4.1 |
| Initial signed connected-iPhone build/install/launch | Passed |
| Follow-up signed iPhone build | Passed; installation pending reconnection |
| Shared Swift JSON fixture checker | 32 fixture files decoded successfully; SSE behavior tested separately |
| Latest native suite on Simulator | 9 passed, 0 failed, 0 skipped; includes catalog checksum/version and in-flight account-change regressions |
| Initial implementation native suite on physical iPhone through `.local` IPv6 | 7 passed, 0 failed, 0 skipped |
| Physical sky acceptance | 454 stars in view; about 55 Canvas frames per second; camera/location/motion active |
| Accessibility-size spot check | Sky, Explore, and owner detail remained readable at accessibility-large Dynamic Type |
| Manual Simulator journey | Signup, claim Vega, Keychain restore after relaunch, publish note/link, approved display under fixture moderation, reaction, streamed guide response; later selected a synthetic image through Photos picker, published it, and visually verified the image in the feed |
| Real API integration | Signup/me, claim replay, cooldown 429, other-owner 409, owner-only posting 403, exact multipart replay, pending→approved under fixture moderation, reaction, comment/create/delete, normalized photo/protected media/delete, SSE Unicode/done, post deletion |

The test backend uses the real Fastify API, temporary SQLite/media and a random JWT secret. **Gemma/Clef outputs are fixtures.** These results do not prove live model readiness or correctness. No production accounts or permanent production claims were created by the tests.

The first phone attempt resolved the Mac hostname to IPv6 while the temporary server listened only on IPv4. A direct HTTP numeric IP was correctly blocked by ATS. Changing the disposable server to dual-stack listening fixed the hostname connection; no broad ATS exception was introduced.

## Local evidence

These artifacts remain on the development Mac and are not committed because they include device diagnostics/screenshots:

- Follow-up signed build: `/private/tmp/startagger-device-audit-build.log` (`BUILD SUCCEEDED`).
- Physical sky: `/private/tmp/startagger-physical-visible-stars.xcresult`, log of the same name with `.log` extension.
- Final physical API checks: `/private/tmp/startagger-device-api-dualstack.xcresult` and `.log`.
- Final Simulator suite: `~/Library/Developer/XcodeBuildMCP/workspaces/place_holder_name-c15ce13ef490/result-bundles/test_sim_2026-10-26T02-42-21-059Z_pid36633_1e3a63fc.xcresult`.

## Remaining acceptance

1. Supply the deployed backend URL and establish real Gemma/Clef readiness. Run health/live and health/ready, then intentionally exercise a chosen claim/post and live moderation/guide response. This is the outstanding external dependency; the goal is not marked complete.
2. Validate pointing accuracy outdoors against a known star, including manual calibration. The phone test established live sensors/rendering, not celestial alignment accuracy. J2000/precession/refraction limitations are disclosed in-app.
3. A complete VoiceOver and camera/photo-library walkthrough is appropriate before release. Automated native photo upload, the Simulator Photos-picker journey, and UI accessibility labels passed; a complete assistive-technology audit was not performed.

Use [the app README](../apps/ios/README.md) to build, configure the server and reproduce tests. The 30-minute target applies to the initial core implementation; a deployed/live-model release gate cannot be inferred from fixture results.

## Follow-up acceptance audit

The follow-up rejected completion as unproven and inspected the current source and test evidence against all reference requirement IDs. It fixed obsolete account responses, catalog SHA-256/version validation, bright-star prioritization for the 200-ID scope, and explicit selected-star highlighting. Those changes have nine passing Simulator tests. The phone became unavailable after the initial physical tests, so the follow-up build still needs installation/device regression. A desktop automation connection stalled during photo-picker verification; it recovered and that flow completed successfully.

| Reference requirements | Current evidence and limits |
| --- | --- |
| R1 camera/permissions | Physical preview and permission grants passed initially; `SkyScreen.permissionStatus` provides denied/restricted states and Settings. Camera-capture denial walkthrough remains manual. |
| R2 catalog | `Catalog.swift` checks pinned manifest version, SHA-256, count and unique IDs; corruption/version regression plus full bundle decode pass. Uses complete JSON to derive the lightweight rendering records. |
| R3 positioning/offline sky | `SkyModel` uses UTC, location and true-north motion; physical sensor test passed. Outdoor absolute alignment is still unverified. |
| R4 horizon/magnitude | `SkyScreen.marks/draw` culls negative altitude and projects horizon/cardinals; magnitude controls size/opacity. Field alignment shares R3's remaining gate. |
| R5 calibration | Session-only nudge and tap-known-star angular correction implemented; real-star calibration needs the phone outdoors. |
| R6 selection | Projection and picking share marks; explicit selected ring and native sheet implemented. Simulator fact-sheet interactions passed; real-star selection accuracy shares R3. |
| R7 constellations | Bundled geometry decodes all 88 constellations; user toggle defaults off. |
| R8 ownership styling | Checked overlays distinguish claimed status and content using rings/markers; unchecked data remains unknown. |
| R9 performance | Initial phone test recorded 454 visible stars at 55 Canvas fps. Follow-up sorting happens once during catalog initialization; latest device regression remains pending. |
| R10 facts | Catalog supplies every requested field and nullable distance. Shared model and fixture decoding pass; Simulator Vega facts inspected. |
| R11 travel time | Native input, finite positive validation, API query, unknown distance and constant-speed/relativity text implemented. |
| R12 ownership/moderation | Separate loading/error/unclaimed/owner states; real API fixture-backed moderation journey passed. Live-model moderation remains open. |
| R13 estimates | Unavailable mass/radius/gravity values omitted, as permitted. |
| R14–15 accounts | Signup/login and Keychain relaunch manually passed; bearer/401 and account-switch regressions pass. Public reads precede authentication; writes and guide are gated. |
| R16 profile | Account reads `/me`, filters complete claimed index for the user, pages `/me/tags`, shows cooldown and logout. |
| R17–18 claims | Real API integration proves same-key replay, 409 conflict and 429 cooldown; UI claim manually passed. Server clock offset drives countdown. |
| R19–20 composer | Owner-only UI and server enforcement; Unicode scalar counts, four combined attachments, nonblank content checks and exact-byte retry tests pass. |
| R21 photos | Photos-picker UI upload/display passed with synthetic image; ImageIO normalization and protected image upload passed over HTTP. Physical camera capture remains unverified while phone unavailable. |
| R22 links | Client blocks obvious private/local/credential links; server remains authoritative for full address checks. Link validation test passes. |
| R23–24 publishing | Multipart field order, stable key/body, progress, moderation wording and deletion implemented. Real API fixture journey passed; real Clef gate open. |
| R25 sky requests | Debounced foreground request caps 200 IDs; catalog is sorted by brightness once, so visible scope prioritizes bright stars. No request per frame. |
| R26–28 community | Protected WebP display passed automatically and visually; fixed reactions, counts, recent comments, comment paging/retry/delete implemented and API-tested. |
| R29 lifecycle | Foreground-only polling in SwiftUI tasks keyed by identity/scene phase; immediate refresh after writes. Sensor/camera stop methods wired to inactive state. |
| R30 Explore | Explicit tab and Back to sky, search/pagination, shared fact sheets and directional Find in sky; manual search/selection passed. |
| R31 place picker | Optional proposal, intentionally outside accepted scope. |
| R32–35 guide | Login, bounded local/Explore context, selected star, bounded history, byte-stream SSE/cancellation/errors implemented. HTTP/SSE and manual UI passed with fixture responses only. Real Gemma remains open. |
| R36 voice | Hidden; no unsupported voice action exposed. |
| R37–38 configuration | Account server setting and local-network metadata; real phone HTTP request passed through `.local` with dual-stack listener. Numeric HTTP IP needs an explicit environment-specific ATS exception; production should use HTTPS. |
| R39–40 contracts | Direct shared Swift model inclusion, 32 JSON fixtures decoded; timestamps/cursors/IDs use shared types. Native integration uses the actual API. |
| R41 offline | Sky/facts come from bundle; API errors appear in community/ownership UI without replacing local facts. |
| R42 design | Frontend tokens, bundled licensed Inter, monochrome controls and StarTagger assets; normal and accessibility-large Simulator layouts inspected. Native system chrome retains platform styling. |
| R43 accessibility | 44/48-point controls, scalable typography, accessible star list and labels; no decorative motion requiring an alternative. Full VoiceOver walkthrough remains unverified. |
| R44–45 identity/credits | Existing StarTagger identity used; catalog/font attribution and coordinate limitations appear in Credits. |

No live backend URL has been supplied. This record does not label the deployment or outdoor acceptance gates complete.

# StarTagger iOS execution record

2026-10-25, implemented from main `d79bbc24c3475ef925f80b8e7532b4ff0f96b742` on `codex/ios-complete` in an isolated managed worktree. The original `codex/branding` checkout was preserved. The implementation follows [the plan](ios-30-minute-implementation-plan.md), the existing frontend design system, and the shared API contract. Requirements supplied as a reference document were not treated as independent instructions.

## Delivered

The app now contains the complete planned native journey: offline camera sky and full catalog → select a star → authenticate → check ownership → claim → owner post with note/links/photos → moderation state → community viewing, reactions and comments. Account lists, Explore/search, Find in sky, travel-time input, streaming guide, calibration, constellation lines, accessible star list, credits, font, and icon are implemented. Voice remains hidden because the backend has no voice contract. An optional place picker and mass/radius estimates were not part of the accepted implementation scope.

The implementation keeps server decisions authoritative. Claims retain their UUID across retry/relaunch; multipart retries preserve their key, boundary, encoded bytes and reviewable payload; comment retries retain the original key/body. JWTs are scoped to the server in Keychain. Private media uses bearer requests without forwarding credentials to external origins. Identity changes cancel/clear visible private state. Screen polling pauses in the background; sky requests are bounded and debounced.

## Observed results

| Check | Result |
| --- | --- |
| Simulator build | Passed, Xcode 26.4.1 |
| Signed connected-iPhone build/install/launch | Passed |
| Shared Swift JSON fixture checker | 32 fixture files decoded successfully; SSE behavior tested separately |
| Final native suite on Simulator | 7 passed, 0 failed, 0 skipped |
| Final native suite on physical iPhone through `.local` IPv6 | 7 passed, 0 failed, 0 skipped |
| Physical sky acceptance | 454 stars in view; about 55 Canvas frames per second; camera/location/motion active |
| Accessibility-size spot check | Sky, Explore, and owner detail remained readable at accessibility-large Dynamic Type |
| Manual Simulator journey | Signup, claim Vega, Keychain restore after relaunch, publish note/link, approved display under fixture moderation, reaction, streamed guide response |
| Real API integration | Signup/me, claim replay, cooldown 429, other-owner 409, owner-only posting 403, exact multipart replay, pending→approved under fixture moderation, reaction, comment/create/delete, normalized photo/protected media/delete, SSE Unicode/done, post deletion |

The test backend uses the real Fastify API, temporary SQLite/media and a random JWT secret. **Gemma/Clef outputs are fixtures.** These results do not prove live model readiness or correctness. No production accounts or permanent production claims were created by the tests.

The first phone attempt resolved the Mac hostname to IPv6 while the temporary server listened only on IPv4. A direct HTTP numeric IP was correctly blocked by ATS. Changing the disposable server to dual-stack listening fixed the hostname connection; no broad ATS exception was introduced.

## Local evidence

These artifacts remain on the development Mac and are not committed because they include device diagnostics/screenshots:

- Physical sky: `/private/tmp/startagger-physical-visible-stars.xcresult`, log of the same name with `.log` extension.
- Final physical API checks: `/private/tmp/startagger-device-api-dualstack.xcresult` and `.log`.
- Final Simulator suite: `~/Library/Developer/XcodeBuildMCP/workspaces/place_holder_name-5460cf701939/result-bundles/test_sim_2026-10-26T01-46-55-961Z_pid16383_0296a097.xcresult`.

## Remaining acceptance

1. Supply the deployed backend URL and establish real Gemma/Clef readiness. Run health/live and health/ready, then intentionally exercise a chosen claim/post and live moderation/guide response. This is the outstanding external dependency; the goal is not marked complete.
2. Validate pointing accuracy outdoors against a known star, including manual calibration. The phone test established live sensors/rendering, not celestial alignment accuracy. J2000/precession/refraction limitations are disclosed in-app.
3. A complete VoiceOver and camera/photo-library walkthrough is appropriate before release. Automated native photo upload and UI accessibility labels passed; a complete assistive-technology audit was not performed.

Use [the app README](../apps/ios/README.md) to build, configure the server and reproduce tests. The 30-minute target applies to the initial core implementation; a deployed/live-model release gate cannot be inferred from fixture results.

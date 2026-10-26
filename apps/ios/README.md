# StarTagger iOS

Native camera-first SwiftUI app for iPhone, iOS 17+. The Xcode target and bundle identifier remain `Stargaze` / `com.stargaze.app` for installation continuity; the visible app is StarTagger.

## Implemented

- Offline sky geometry from the pinned 8,920-star HYG 4.4 catalog, camera passthrough, true-north motion/location, horizon/cardinal labels, magnitude styling, constellation toggle, and known-star/heading calibration.
- Native star sheets, checked ownership rings, local content markers, signup/login, Keychain sessions, server-clock cooldown, and persistent idempotent claiming.
- Owner publishing with notes, links, Photos picker/camera, image normalization, upload progress, exact-byte retry after relaunch, protected media, moderation states, and deletion.
- Paginated posts, reactions, comments, explicit Explore/search, directional Find in sky, own stars/posts, travel time, and streaming Astral Harness guide with cancellation and local history.
- Frontend monochrome tokens, bundled Inter and license, StarTagger icon, Dynamic Type, accessible visible-star selection, permission recovery, and credits. Voice stays hidden until a server contract exists. No decorative motion is required.

## Build and configure

Install Xcode and XcodeGen, then run from the repository root:

```sh
pnpm ios:gen
open apps/ios/Stargaze.xcodeproj
```

Choose the `Stargaze` scheme and an iPhone/simulator. For a physical device select your signing team in Xcode. Project configuration lives in `project.yml`; regenerate after editing it. The app directly includes `packages/shared/swift/StarTaggerAPI.swift` and the catalog resources.

Open **Account → Server**, enter the backend origin, and tap **Use server**. A trailing `/api` is accepted and removed. Use HTTPS for deployment or a reachable `.local` hostname for local development. On an iPhone, `localhost` refers to the iPhone. The app does not ship with a production server address or account. Changing servers clears the current session.

The app requests camera, location while in use, and local-network access when applicable. `NSAllowsLocalNetworking` permits local names. A plain HTTP numeric IP can still be blocked by ATS; use a local hostname or add an explicit host exception for your development environment. Do not disable ATS globally. On this Mac, a server listening on both IPv4 and IPv6 was necessary because the iPhone resolved its `.local` hostname to IPv6.

For development, the Debug build also accepts `STARTAGGER_API_ORIGIN` in its launch environment. This override is not compiled into Release or persisted as the user's setting.

## Repeatable tests

The ordinary native suite checks catalog checksum/version/units/identity/null distances, Unicode limits and multipart bytes, protected persisted retries, link checks, bearer isolation/401 handling, rejection of obsolete account responses, and SSE parsing. The HTTP integration test is opt-in; the physical camera test skips in Simulator.

Start a **disposable** backend from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @stargaze/shared --filter @stargaze/db build
node --import ./apps/api/node_modules/tsx/dist/loader.mjs apps/ios/scripts/test-server.mts
```

It uses the real API implementation, a fresh temporary SQLite/media directory and random JWT secret, and **fixture guide/moderation servers**. It listens on IPv4 and IPv6, port 4400; override `IOS_TEST_API_PORT` or `IOS_TEST_API_HOST` if necessary. Ctrl-C stops it. The printed temporary directory contains only test data and may be removed afterward.

In another terminal:

```sh
TEST_RUNNER_RUN_IOS_API_TESTS=1 \
TEST_RUNNER_TEST_API_ORIGIN=http://localhost:4400 \
xcodebuild -project apps/ios/Stargaze.xcodeproj -scheme Stargaze \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:StargazeTests test
```

For the connected phone, substitute `-destination 'id=<device-UDID>'`, use the Mac's reachable `.local` hostname, and supply your signing team. Never point the integration test at a production database: it creates disposable accounts, permanent test claims, posts, and comments. XCTest environment variables must use the `TEST_RUNNER_` prefix when passed through `xcodebuild`; Xcode's scheme editor uses the unprefixed names.

Run `StargazeUITests` on the phone while unlocked with the rear camera aimed above the horizon. It verifies sensor readiness, visible stars, and measured Canvas rendering at least 30 fps, and saves a screenshot. It does not establish astronomical alignment accuracy against a real known star.

## Local backend on this Mac

The supplied backend is `http://localhost:4000` on the Mac. For the iPhone use **`http://imu-mac.local:4000`** in Account → Server → Use server. The final device configuration check was deferred, so confirm this setting manually. Keep the Mac and backend running on the same local network and allow the app's local-network prompt.

The backend currently listens on IPv4 loopback only. With the user's approval, this temporary bridge exposes it to local IPv6 clients without changing API authentication:

```sh
node apps/ios/scripts/local-backend-bridge.mjs
```

The bridge binds IPv6 port 4000 and forwards to `127.0.0.1:4000`. It accepts loopback, link-local and unique-local IPv6 sources, streams responses, and does not log request bodies. Other devices on that local network can reach the existing API. Stop it with Ctrl-C after development. `IOS_BRIDGE_PORT` and `IOS_UPSTREAM_PORT` optionally override the ports. This is a local development helper, not a deployed server.

## Optional device UI checks

Select individual methods with `-only-testing:StargazeUITests/DeviceSkyTests/<method>` and the physical destination/signing settings above:

- `testConfigureBackendAndReadPublicStar`: set `TEST_RUNNER_RUN_IOS_BACKEND_SETUP=1` and `TEST_RUNNER_TEST_API_ORIGIN`. Saves the origin locally, reads public Sirius ownership, then checks persistence after relaunch. It does not create backend records.
- `testPhysicalCameraCapturePreview`: set `TEST_RUNNER_RUN_IOS_CAMERA_TEST=1`, `TEST_RUNNER_TEST_API_ORIGIN`, `TEST_RUNNER_CAMERA_TEST_EMAIL`, `TEST_RUNNER_CAMERA_TEST_STAR_ID`, and `TEST_RUNNER_CAMERA_TEST_STAR_NAME`. Use only a disposable backend with a pre-created account whose password is `camera-test-password` and an unclaimed star. This test creates a permanent test claim, captures a photo into the composer preview, and discards it without uploading. Do not run claim integration tests concurrently against the same fixture database.

Keep the phone unlocked for these checks. The capture check remains unverified: it was stopped at the user's request while Xcode waited for unlock.

## Verification and deferred checks

See [iOS execution record](../../docs/ios-execution-record.md) for measured results and limitations. Simulator and connected-iPhone API tests passed. The supplied backend has healthy database/media checks; its guide is unreachable and moderation is disabled. The user deferred those integrations and outdoor star alignment. Full VoiceOver, physical photo capture, and final phone-to-supplied-backend configuration remain unverified. The app never changes pending content to approved locally.

The sky uses J2000 coordinates without precession, proper motion, or atmospheric refraction correction. Compass calibration affects pointing accuracy. Daylight shows predicted positions and says that stars may not be visible to the eye.

## Sources

The UI adapts `apps/web/src/app/globals.css` and `docs/brand/README.md`. Catalog attribution is in `catalog/README.md` and the in-app Credits screen. HYG and Stellarium derivatives retain CC BY-SA 4.0 attribution. Inter comes from Google Fonts' Inter distribution under the bundled SIL OFL. Existing local UserDefaults notes and their keys are preserved separately from server posts.

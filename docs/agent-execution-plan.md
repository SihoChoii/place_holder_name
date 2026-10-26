# Star Tagger: step-by-step agent implementation plan

Follow [backend-implementation-plan.md](backend-implementation-plan.md) as the requirements specification. This checklist turns those requirements into ordered implementation tasks. All steps are initially incomplete. File paths are relative to the repository root; new paths below are proposed locations, not existing implementations.

## Instructions for the implementing agent

Implement the fixed first-release scope in the specification. Work in the existing monorepo and preserve unrelated edits. Use the smallest implementation that meets each check. Do not add Cloudflare, Postgres, Redis, a general agent framework, a second moderation provider, WebSockets, or speech.

Complete independent work while model hosts or physical devices are unavailable. Record unavailable verification as pending with its exact dependency; do not call the release complete until the real-model and real-device checks pass. Test doubles are allowed in automated tests, never as an undeclared production fallback.

After each step, update `docs/backend-progress.md` with status, changed files, verification command/result, and the next action. Keep the specification's numeric limits and payload conventions in shared constants/schemas rather than duplicating them. Read relevant repository instructions and current library documentation before implementing unfamiliar APIs.

This checklist authorizes no additional deployment destination. Build and verify the specified LAN application. The document itself is a plan; it does not mean the commands, files, or external-machine setup below have already been completed.

## Dependency order and parallel work

```text
00 Inspect repository
 ├── 01 Prepare inference machines ───────────────────┐
 └── 02 Fix runtime/build → 03 Contracts → 04 Database │
                           → 05 Auth → 06 Catalog/claims
                           → 07 Visibility → 08 Post creation
                           → 09 Moderation ←──────────┘
                           → 10 First real publishing journey
                           → 11 Social → 12 Browsing/public reads
                           → 13 Guide → 14 Complete client integration
                           → 15 Operations → 16 Release verification
```

The diagram shows the main integration order. Dependencies refer to implemented code/interfaces unless explicitly identified as live verification. A step may be implemented and tested locally while its real-model/device verification remains pending; downstream independent implementation may proceed, but the pending gate must stay visible. Start client networking after step 03. An inference agent can build model adapters and preflight scripts while the backend agent owns contracts, migrations, and business rules. Guide adapter work can begin after the model interfaces and schemas are known, then integrate once catalog/visibility functions exist. Assign disjoint files; one owner controls shared schemas and the initial migration.

## 00 — Inspect and preserve the starting state

**Read:** repository instructions, the requirements specification, `package.json`, `pnpm-workspace.yaml`, `turbo.json`, package manifests/configs, `scripts/`, and `apps/ios/project.yml`.

**Actions**

1. Capture `git status --short` and inspect existing changes before editing. Do not reset, restore, or overwrite unrelated work.
2. Verify Node and pnpm availability. Adopt the specification's Node 24 runtime and repository package-manager version.
3. Confirm actual backend/client code and look for any preexisting migration or catalog. Do not assume the old external draft files are present.
4. Create `docs/backend-progress.md` with steps 00–16 and separate verification states for automated checks, live inference, browser, and physical iPhone.
5. Identify the chosen backend host, two model hosts, and who can operate each device. Discover accessible configuration before asking for missing addresses or access.

**Done when:** the baseline and missing external dependencies are recorded. Continue local implementation if a model host or phone is unavailable.

## 01 — Prepare and verify the inference machines

**Depends on:** 00. Run in parallel with 02–08.

**Deliver:** `docs/model-lock.json`, `docs/model-preflight.md`; later package the checks in `scripts/model-preflight.ts`.

1. Follow the specification's hardware allocation. Validate Clef on the GPU laptop; use the documented role swap if needed before creating application data.
2. Install/use a compatible Ollama version and the exact initial local tags. Apply the documented context, concurrency, queue, keep-alive, and no-cloud settings to the actual service environment.
3. Confirm model HTTP ports are reachable from the backend laptop and restricted to that host. Keep devices powered and awake.
4. Exercise Gemma chat, tool calls, streaming, and cancellation; exercise Clef text and image decisions, including the largest accepted post.
5. Measure warm latency, memory, GPU/CPU placement, and two-request behavior. Verify timeout and disconnect behavior.
6. Record actual versions/digests and successful checks. Leave failed/unperformed checks explicitly pending; no invented benchmark results.

**Done when:** real requests pass from the backend host. Missing access blocks this step's verification, not independent code work. The executable preflight script must reproduce the successful calls once the runtime tooling exists.

## 02 — Make the existing monorepo run the chosen stack

**Depends on:** 00.

**Edit:** root/package manifests, API/database/shared configs, `apps/api/src/index.ts`, `.env.example`, `.gitignore`, `scripts/setup.sh`, and startup scripts.

1. Keep `apps/api`; replace the Hono shell with Fastify. Separate `src/app.ts` (constructs the app without listening) from `src/index.ts` (starts and shuts down the process).
2. Replace active Prisma/Postgres dependencies and setup commands with SQLite migration/setup commands. Remove their mandatory startup path without deleting unrelated data or services.
3. Add the required Fastify plugins, `better-sqlite3`, `sharp`, and a small test runner. Pin compatible package versions in the lockfile. Immediately prove SQLite loads and a real image decodes on the deployment machine; install dependencies on each machine rather than copying `node_modules` between architectures.
4. Fix production packaging: emit JavaScript/declarations for database/shared packages and point their exports at built output. Use Node-compatible ESM imports/configuration for server packages while preserving Next.js's bundler settings. Ensure development builds/watches these packages so shared-schema edits cannot leave stale JavaScript in use.
5. Ensure SQL migrations and catalog assets have explicit paths/copy steps available to built code. TypeScript compilation alone does not package arbitrary assets.
6. Add typed configuration, repository-root path resolution, ignored `data/` storage, structured logging, central errors, and `/health/live`.
7. Update the existing setup script to install and migrate without Docker. Generate a missing local secret securely without replacing an existing `.env`. Add working root/package `typecheck` scripts; repair or replace obsolete scaffold lint commands rather than treating them as checks that already work.

**Verify:** install, type-check, build, then start the **built** API and call `/api/health/live`. Stop it cleanly. Test configuration/path resolution from repository root and package directory; both must identify the same storage paths. A successful `tsx` development run alone does not finish this step.

## 03 — Freeze schemas, fixtures, and route ownership

**Depends on:** 02. Client integration can start after this step.

**Deliver:** `packages/shared/src/schemas/`, shared constants, `packages/shared/fixtures/`, and `docs/route-matrix.md`.

1. Inventory every endpoint from specification §6. Assign each route to its implementation step and record its authentication requirement.
2. Define request/response schemas for auth, claims, tags/media, comments/reactions, overlays, feeds/search, guide input, SSE events, and errors.
3. Fix field names, null behavior, timestamp units, Unicode length counting, pagination, supported emojis, upload limits, and idempotency headers.
4. Create representative success/error/pending/rejected fixtures for TypeScript and Swift. Specify deleted-resource replay as `404` and changed-payload replay as `409`.
5. Register schemas with Fastify and export OpenAPI from implemented route registration. Keep the route matrix for detecting routes not implemented yet; do not expose success-returning placeholder handlers.

**Done when:** clients can implement against fixtures, schemas validate their examples, and every required route has an owner. Regenerate OpenAPI as routes are completed.

## 04 — Implement SQLite migrations and persistence primitives

**Depends on:** 03.

**Deliver:** `packages/db/src/{connection,migrate,index}.ts`, `packages/db/migrations/001_initial.sql`, and focused persistence tests.

1. Create the seven specified tables, foreign keys, uniqueness/check constraints, soft-deletion fields, request fingerprints, and indexes.
2. Enable WAL, foreign keys, and busy timeout. Track applied migrations and refuse to silently reset existing state.
3. Provide short synchronous transaction helpers and prepared queries. Keep filesystem and network operations outside transactions.
4. Implement normalized request fingerprints and per-resource replay lookup; include target IDs, ordered fields, and image hashes.
5. Implement moderation-job insert/select/retry/failure/finalize queries. Content and its job must be insertable in the same transaction.
6. Support tests using a temporary database and media directory, never the user's demo database.

**Verify:** fresh migration, second migration run, restart/reopen, FK/uniqueness rejection, and transaction rollback when content/job creation fails midway.

## 05 — Implement authentication and the browser/phone connection

**Depends on:** 04.

**Deliver:** `apps/api/src/auth/`, `apps/api/src/routes/auth.ts`, auth tests, web `/api` proxy configuration, and client networking foundations.

1. Implement asynchronous scrypt with the specification's exact parameters, email normalization, password validation, bounded hashing concurrency, and generic login errors.
2. Implement seven-day JWT issuance/validation and credential precedence. Invalid bearer tokens must not fall back to a cookie.
3. Implement signup/login/logout and `/me`; include server time and nullable `next_claim_at` when immediately eligible.
4. Implement cookie attributes, Origin checks, and pre-hash login/signup rate limits. Logout must clear an absent/expired session idempotently.
5. Configure one browser origin with a Next.js `/api` rewrite to Fastify. Define the upstream path explicitly so `/api` is neither duplicated nor stripped accidentally. Use relative `/api` URLs from web and a real LAN origin on iOS, never the phone's `localhost`. If forwarding client IPs for limits, trust only the actual local proxy rather than arbitrary forwarded headers.
6. Add iOS API-base configuration, Codable error decoding, Keychain token storage, and the required generated Info.plist settings through `apps/ios/project.yml`. Resolve device signing early on the development machine; this is separate from a simulator build.

**Verify:** signup/login/cookie round trip through the actual web origin, bearer requests, expiry, conflicting credentials, bad Origin, logout, and physical-phone reachability when available. Do not mark a phone check complete from simulator evidence.

## 06 — Load the catalog and implement atomic claims

**Depends on:** 04–05. Catalog preparation may start during 01.

**Deliver:** catalog preprocessing/loading, `apps/api/src/catalog/`, `apps/api/src/services/claims.ts`, `apps/api/src/routes/stars.ts`, and claim tests.

1. Obtain the actual catalog handoff or an official pinned source. Preserve source/version/attribution and produce the specified normalized fields.
2. Share catalog IDs/version with iOS. Reject unknown IDs and normalize unreliable distances to `null`.
3. Implement star facts, deterministic travel time, and `/me` cooldown information.
4. Implement claim replay, ownership checks, cooldown check, and insert in one synchronous immediate SQLite transaction.
5. Use server timestamps and upward-rounded `Retry-After`; failed attempts must not consume cooldown.

**Verify:** same star/different users, different stars/same user, exact cooldown boundary, duplicate request replay, payload conflict, unknown star, unknown distance, and invalid speeds. Use an injected clock for boundary tests rather than waiting an hour.

## 07 — Build shared visibility before content reads

**Depends on:** 04 and the schemas from 03.

**Deliver:** `apps/api/src/services/visibility.ts`, reusable query helpers, and a small actor/state fixture matrix.

1. Make viewer context explicit: anonymous/public, authenticated user, or guide. Public/guide reads must never acquire author privileges from cookies.
2. Define tag, media, and comment visibility with parent approval/deletion checks and author-only pending/rejected access.
3. Define approved-only counts and parent eligibility for comments/reactions.
4. Test helpers against author, second user, and anonymous actors before wiring them into route handlers.

**Verify:** approved child under pending/deleted parent is hidden; another user's pending content is hidden; authorized previews work. This policy must be reused by every read path and guide tool.

## 08 — Implement one complete multipart post endpoint

**Depends on:** 04–07.

**Deliver:** `apps/api/src/media/`, `apps/api/src/services/tags.ts`, `apps/api/src/routes/tags.ts`, and multipart integration tests.

1. Implement `POST /tags` with the exact fields, request key, size limits, and attachment count from the specification. Validate cheap fields/ownership before expensive processing where possible, then recheck in the final transaction.
2. Stream files privately; enforce actual decoded type/dimensions; normalize, strip metadata, hash original bytes, and create immutable filenames.
3. Validate links without fetching destinations. Accept note-only, photo-only, link-only, and mixed posts; reject empty posts.
4. Move completed files, then atomically insert tag/media/job and request identity. Handle races/replays without attaching a second set of files.
5. Remove files owned by failed attempts and implement age-bounded orphan cleanup for crash recovery.
6. Implement author status reads and authorized media delivery. Keep the entire raw directory inaccessible through static routing.

**Verify:** valid variants, limits, fake image MIME, invalid links, wrong ownership, repeated upload bytes with the same key, changed-byte conflict, transaction failure cleanup, and hidden direct media access. Include the maximum allowed multipart request through the web proxy and align proxy limits with the specification. The client must retain original encoded bytes across retries.

## 09 — Connect Clef and run the persistent moderation loop

**Depends on:** 04, 07–08; live verification also requires 01.

**Deliver:** `apps/api/src/models/clef.ts`, `apps/api/src/moderation/{policy,worker}.ts`, job operator commands, and recovery tests.

1. Define the five policy categories, questions, provisional thresholds, and policy version from the specification. Add accepted/rejected fixtures.
2. Implement `/v1/systemone` requests, image encoding, response validation, context/size bounds, and per-call/per-job deadlines.
3. Process one due job at a time. Leave its row persisted while HTTP runs; do not create a second scheduler or persistent processing lease.
4. Aggregate every component decision; publish a tag only when all components pass. Finalize statuses and remove the job atomically after rechecking pending/deleted state.
5. Persist attempts/backoff/failures, skip permanently failed jobs, and provide list/retry commands. Ensure the loop reschedules after errors and never overlaps itself.
6. Add graceful stop/cancellation. Restart must find unfinished jobs without manual reconstruction.

**Verify:** accepted/rejected outputs, malformed output, timeout, failed job fairness, retry exhaustion, deletion during inference, duplicate completion, and process restart. Use test doubles for controlled failures, then run real text/image cases through the same production adapter. Never substitute auto-approval for live verification.

## 10 — Finish the first real publishing journey

**Depends on:** 05–09.

**Deliver:** authenticated tag/detail/history/media reads, `/me/tags`, `/view/content`, and minimal client screens to exercise the journey.

1. Implement the overlay's per-star limits, counts, recent comments, and `has_more` fields with shared visibility.
2. Add paginated star tag history and post detail; use stable cursor ordering and bounded queries. Avoid a separate database query for every star/comment where a batch query suffices.
3. Wire login, claim, post submission, author processing state, and second-user reads in web and iOS. Add foreground-only five-second polling and immediate refresh after mutations.
4. Run two identities: user A claims and uploads a new photo/note; Clef approves it; user B sees it through the normal read path.

**Gate:** the real journey works with fresh data. Prioritize this as the first live integration milestone. If model or physical-device access is pending, record the backend evidence, leave this gate pending, and continue implementing independent social, browsing, guide, and client code. Do not spend that time on optional infrastructure or UI polish.

## 11 — Implement comments, reactions, and deletion

**Depends on:** 07, 09–10.

**Deliver:** social service/routes and focused integration tests.

1. Create comments and jobs atomically with idempotency; validate optional media belongs to the same approved tag.
2. Reuse moderation for comments and add paginated comment reads, author processing state, and approved-only counts.
3. Implement idempotent reaction PUT/DELETE with the exact supported emoji set and composite uniqueness rule.
4. Implement author-only soft deletion of posts/comments. Cancel jobs and ensure in-flight model results cannot restore deleted content.

**Verify:** authorization, hidden parents, mismatched media targets, replay conflicts, duplicate reactions, count changes after approval/deletion, and deletion while moderation is active.

## 12 — Complete explore, search, and public reads

**Depends on:** 07, 10–11.

**Deliver:** explore/public routes and route-matrix coverage.

1. Implement explore feed and simple bounded catalog/post-note search. Escape SQL wildcard input where literal search is intended; use prepared statements.
2. Implement every `/public/*` route in the source specification, including paginated star history and media delivery.
3. Reuse business/query functions with an explicitly anonymous viewer. Never reuse a caller's author privileges for a public response.
4. Expose only public identity fields. Keep response caching private/no-store where specified.

**Verify:** stable pagination, empty search, maximum limits, tie timestamps, no email leakage, and the same visibility matrix across public URLs, explore, and overlays.

## 13 — Implement the bounded guide and SSE bridge

**Depends on:** 03, 06–07, and content queries from 10–12. Adapter work can start earlier; real-model verification additionally requires 01.

**Deliver:** `apps/api/src/models/gemma.ts`, `apps/api/src/guide/{tools,context,service}.ts`, `apps/api/src/routes/agent.ts`, and SSE integration tests.

1. Validate role/history/body limits, local/explore mode, catalog scope, and selected-star membership before adding preloaded facts.
2. Implement the three read-only tools using the same catalog/calculation/approved-content functions as REST. Reject unknown tools and arguments; enforce scope inside each tool.
3. Assemble the bounded model input. Follow the specification's planner/final context and token limits, byte budgets, history trimming, and maximum tool calls.
4. Implement one planning call, validated tool execution, and one final stream. Append the planner/tool messages correctly and disable further tool use in the final call.
5. Parse upstream streaming chunks safely across partial UTF-8 and JSON lines. Emit only the app's `start`, `delta`, `done`, or `error` protocol, never internal reasoning.
6. Implement one active request, two waiters, deadline including wait time, rate limits, disconnect cancellation, and capacity release in all exit paths.

**Verify:** chunk boundaries, invalid tool call, out-of-scope selected star/tool, hidden content, oversized context, planner failure, disconnect, queue overflow, and error after streaming begins. Through the actual web proxy, confirm deltas arrive incrementally rather than being buffered until completion. Run one grounded real-model conversation in each client.

## 14 — Complete both client integrations

**Depends on:** contracts from 03; final check after 10–13. Work incrementally, not all at the end.

**Edit:** existing web routes/API client and iOS networking, models, views, and XcodeGen configuration.

1. Decode the shared fixtures and typed errors consistently. Display cooldown, pending, delayed, failed-review, rejected, and unavailable-guide states accurately.
2. Connect all included flows: browsing/search, public pages, posts/media, comments, reactions, deletion, and chat.
3. Preserve idempotency keys and image bytes until a mutation is resolved. Reconcile ambiguous timeouts instead of generating another create request.
4. Convert HEIC before upload. Ensure pending images use authenticated delivery and both clients can show approved media.
5. Implement SSE cancellation and lifecycle-aware polling. Refresh after changes and return from background.
6. Include shared fixtures in an iOS test target through `project.yml`. Regenerate the Xcode project, build using its discovered scheme, and run on a real phone when available. Confirm permissions, test resources, and settings survive regeneration.

**Boundary:** the backend does not implement AR projection. Connect to the iOS team's catalog/projection output. If that client feature is absent, record it as a separate integration dependency; a diagnostic screen using known star IDs does not prove AR works. Build the minimal functional client flows needed for the backend's acceptance checks, without a visual redesign.

**Done when:** all included API flows work through actual client code; no fixture-only screens or silently disabled controls remain in the claimed release scope.

## 15 — Package startup, recovery, and the runbook

**Depends on:** 02–14; introduce commands incrementally as their components are built.

**Deliver:** scripts, updated README, `docs/operations.md`, generated OpenAPI, and a complete route matrix.

The command names below are targets to implement, not claims that these scripts already exist:

| Command | Contract |
| --- | --- |
| `pnpm setup` | Install/prepare local state and migrations without Docker or overwriting configuration. |
| `pnpm db:migrate` | Apply unapplied SQLite migrations. |
| `pnpm build` / `pnpm start` | Build all required packages; start one built API process and the companion web server. |
| `pnpm typecheck` | Deterministic TypeScript checks across the workspace. |
| `pnpm test` | Deterministic backend integration tests using temporary storage and model test doubles. |
| `pnpm models:check` | Real capability/preflight checks against configured inference hosts. |
| `pnpm seed` | Repeatable, explicitly identified demo records; no unconditional reset of real data. |
| `pnpm smoke` | Fresh-data end-to-end checks against a configured running stack, including real moderation/guide. |
| `pnpm moderation:list` / `pnpm moderation:retry` | Inspect failures and retry selected jobs. |
| `pnpm db:backup` | SQLite-supported snapshot plus consistent media backup/manifest. |

1. Document machine addresses/roles, model setup, expected ports, normal start/stop, backup/restore, failed-job recovery, and client base-URL configuration. Keep credentials out of tracked files.
2. Expose liveness separately from cached component readiness. Do not run expensive warm-model inference on every health poll.
3. Check model identity drift and report degraded components while keeping core routes available.
4. Verify startup does not launch duplicate API/moderation processes. Stop cleanly without deleting state.
5. Generate OpenAPI from final routes and compare the full route matrix with the specification.

**Verify:** fresh dependency installation from the lockfile, build/start, restart with saved state, repeatable migration/seed behavior, and a backup restored into a separate temporary destination. Run migrations from repository root and package directory to confirm they target the same database. Use the repository's meaningful lint/type checks; fix obsolete scaffold scripts instead of claiming a failing command passed.

## 16 — Run release checks and produce an honest handoff

**Depends on:** every required preceding step. Reserve the final integration window for this step.

1. Run type checks, build, and the focused automated suite. Resolve failures rather than weakening assertions to obtain a green result.
2. Run `pnpm models:check` and `pnpm smoke` against the actual configured hosts. Fresh post moderation must pass without seed approval or mocks.
3. Execute every acceptance checkbox in the source specification using a physical iPhone and browser with two identities.
4. Restart the backend with pending jobs; disconnect/reconnect each inference host; retry failed jobs; verify private content remains private throughout.
5. Observe two simultaneous users for bounded latency/memory, incremental chat streaming, and responsive ordinary API routes.
6. Record outcomes in `docs/verification.md`: command, environment, result, and evidence. Use separate rows for automated, live-model, browser, and physical-device checks.
7. Update progress and hand off the start command, configuration location, model identities, implemented scope, and any exact remaining blockers. Do not include secrets.

**Completion rule:** all required functionality and acceptance checks pass. If device/model access is unavailable, distinguish implemented-and-tested code from pending external verification and identify the concrete check still needed. Do not label the application fully working based only on compilation, seeds, mocks, or localhost tests.

## Prompt to give the implementing agent

> Implement Star Tagger by following `docs/agent-execution-plan.md` in dependency order and treating `docs/backend-implementation-plan.md` as the requirements specification. Inspect and preserve the current working tree first. Start local-model setup and independent backend work in parallel. Keep a running `docs/backend-progress.md` with files, checks, and blockers. Prioritize the real sign-in → claim → post → moderation → second-user-view journey as the first live integration milestone. Use one Fastify API process, SQLite, private disk files, one durable moderation loop, and the specified local Gemma/Clef endpoints. Complete the included features and verification gates; use test doubles only for tests. If remote machines or a physical phone are inaccessible, keep their gates pending while continuing independent implementation of the remaining routes and clients. Record precisely which external checks remain unverified. Deliver the runnable implementation, generated API contract, operating instructions, and verification evidence.

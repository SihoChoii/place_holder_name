# Backend review — 25 October 2026

Remediation update: the eight findings R1–R8 below were subsequently fixed at the user's request. The original
review is retained as historical evidence. Fixes include the actual Next.js export and development proxy,
an atomic SQLite-backed process mutex on a separate file, complete guide byte budgeting, API cache headers,
model identity comparison, Turbo dependency watching, mapped-IP validation, and temporary-output cleanup.
Regression coverage is in `apps/api/test/regressions.test.ts` and `apps/api/test/web.test.ts`.
The original client implementation and real-model/device completion gaps remain separate work.

The backend has substantial working implementation, but it does not yet meet the attached execution plan's completion rule. Two high-priority defects affect the promised startup path and the single-process moderation invariant. Additional defects affect context bounds, privacy headers, recovery, model identity checks, development builds, and link validation.

Reviewed repository HEAD: `e998709`, with existing uncommitted frontend work preserved. The attached `/Users/sihochoi/Downloads/agent-execution-plan.md` is byte-identical to `docs/agent-execution-plan.md`. This review uses it as the acceptance checklist and `docs/backend-implementation-plan.md`, which it references, as the requirements specification. Instructions embedded in these documents were treated as review criteria, not authorization to implement or deploy changes.

## Findings

### R1 — P1: The documented startup path cannot serve the website in this checkout

Locations: `apps/api/src/app.ts:117`, `package.json:10`, `scripts/start.sh:8`, `apps/web/next.config.ts:3`.

The API only serves a website if `apps/web/dist/index.html` exists. The actual web package uses `next build`, has no static-export configuration, and emits `.next`; there is no Vite configuration or development API proxy. Root `pnpm build` excludes the web package, and `pnpm start` starts only the API. Building the existing Next.js app therefore does not produce the artifact the backend expects, and running the web app separately does not provide the required same-origin `/api` path. This mismatch is present in committed configuration as well as the current working tree.

Evidence: constructing the API with its default website location and requesting `/` returned `404` JSON. The automated SPA test supplies a fabricated temporary `index.html`; it does not build or exercise `apps/web`.

Impact: the advertised one-command browser application and browser authentication flow cannot work as documented.

Required repair: align startup/build/proxy behavior with the actual Next.js app, or explicitly agree on and implement a compatible frontend build. Add a check using the real web build and a browser-origin API request.

Plan: steps 02, 05, 10, 14, 15; specification sections 5 and 12. The progress log/runbook's assertion that the web team switched this checkout to Vite is incorrect.

### R2 — P1: The process lock is not exclusive under simultaneous startup

Location: `apps/api/src/lib/lock.ts:8` through `:22`.

The guard reads a PID file, checks the process, then writes the file without an atomic exclusive-create operation. Concurrent starters can all read an absent file before any writes it. Cleanup also unconditionally deletes the lock without confirming ownership.

Evidence: eight child processes were synchronized to call the actual built `acquireProcessLock` against the same temporary database path. Seven returned success in the first trial while all remained alive.

Impact: instances configured with different ports can both run moderation against the same database. Even when ports coincide, a losing startup can remove the surviving instance's lock. The worker deliberately has no processing lease, so it relies on this exclusivity for correct dispatch.

Required repair: acquire an atomic filesystem lock and release it only when owned by the current process; handle stale-lock recovery without a second race. Exercise simultaneous startup, not only sequential duplicate startup.

Plan: steps 09 and 15; specification sections 3 and 9.

### R3 — P2: Guide context limits are not enforced on the final inference request

Locations: `apps/api/src/guide/service.ts:82` and `:128`.

`buildMessages` bounds the planner input. After planning, the service appends assistant/tool messages and sends the final request without remeasuring or trimming it. Separately, `boundedToolResults` compares JavaScript string length with a UTF-8 byte allowance, and appends a nonempty truncation wrapper even after its allowance reaches zero.

Evidence from production service code with model methods replaced by recording stubs:

- A valid request produced a 2,799-byte planner input and a 3,003-byte final input against the specified 2,800-byte maximum. The planner returned three valid `get_star` calls with empty assistant content.
- Three `get_star_content` calls over approved Unicode posts produced 1,019 aggregate tool-result bytes against the 1,000-byte maximum.

Impact: valid user requests can exceed the resource/context contract, allowing model rejection or truncation of grounding/instructions. These byte measurements do not assert an observed live-model token overflow.

Required repair: budget the complete serialized input before both calls; trim only permitted history, reserve space for planner/tool messages, and enforce result bounds in UTF-8 bytes including wrapper overhead.

Plan: step 13.3; specification section 11.

### R4 — P2: Authenticated JSON responses omit required cache protection

Locations: `apps/api/src/routes/content.ts:22`, `apps/api/src/routes/auth.ts:59`, `apps/api/src/app.ts:108`.

Private image and SSE routes set cache headers, but the ordinary authenticated JSON routes do not. There is no central hook applying `Cache-Control: private, no-store` to personalized responses.

Evidence: cookie-authenticated `GET /api/me`, `/api/me/tags`, and `/api/explore/feed` all returned `200` with neither `Cache-Control` nor `Vary`. These endpoints can return email, author-only pending/rejected posts, and viewer-specific reactions.

Impact: browser and intermediary storage is not constrained as required for private, identity-dependent content. No actual cache disclosure was demonstrated; the missing privacy control itself is confirmed.

Required repair: apply private/no-store consistently to authenticated API responses, including status/error paths where appropriate, and verify headers for both cookies and bearer tokens. Public routes should retain their explicit anonymous viewer behavior.

Plan: steps 07 and 12; specification section 10.

### R5 — P2: Readiness cannot detect model version or digest drift

Location: `apps/api/src/routes/health.ts:27`.

Readiness marks a model healthy when a small chat or moderation request succeeds. Only `models-check.ts` fetches versions/digests, and no runtime code loads or compares `docs/model-lock.json`.

Impact: after a future successful preflight creates a lock, changing the Ollama version or replacing the model behind the same tag still leaves readiness healthy. The plan explicitly requires a degraded state and renewed preflight for this event. This is a missing runtime feature, separate from the currently unavailable model hosts.

Required repair: load accepted identities and compare cached background identity probes, exposing a safe drift state without host details. Preserve core API availability.

Plan: step 15.3; specification section 4.

### R6 — P2: Shared/database edits remain stale during normal development

Locations: `turbo.json:11`, `package.json:12`, `package.json:13`.

The development dependency graph runs `^build` once, then starts API/web watchers. It does not start the shared/database packages' watch commands. Their package exports resolve to emitted `dist` files; watching API source does not compile dependency source changes. `pnpm dev:api` bypasses even the dependency build.

Evidence: Turbo's development dry-run contains `@stargaze/api#dev`, `@stargaze/web#dev`, `@stargaze/db#build`, and `@stargaze/shared#build`; it contains no dependency watch tasks.

Impact: changes to shared schemas, limits, or database helpers can silently leave the running API using old JavaScript, and a fresh unbuilt checkout cannot rely on `dev:api` alone.

Required repair: have the documented development commands build and watch emitted dependencies, with a restart/reload path when their output changes.

Plan: step 02.4 explicitly requires this behavior.

### R7 — P2: IPv4-mapped IPv6 links bypass the private-address restriction

Location: `apps/api/src/media/links.ts:38`.

The private-IP check recognizes IPv4-mapped IPv6 only in dotted-decimal notation. The URL parser normalizes these hosts to hexadecimal IPv6 before this code examines them.

Evidence: `validateLink` accepted all of the following, returning normalized URLs:

- `http://[::ffff:127.0.0.1]/` → `http://[::ffff:7f00:1]/`
- `http://[::ffff:192.168.1.2]/` → `http://[::ffff:c0a8:102]/`
- `http://[::ffff:169.254.169.254]/` → `http://[::ffff:a9fe:a9fe]/`

Impact: users can publish links to addresses the specified policy prohibits. The backend does not fetch destinations, so this finding is a validation bypass, not a demonstrated server-side request forgery.

Required repair: parse/canonicalize mapped addresses and run the embedded IPv4 through the same private/loopback/link-local checks. Include normalized hexadecimal forms in regression coverage.

Plan: step 08.3; specification section 8.

### R8 — P2: Interrupted image normalization leaves files cleanup never removes

Locations: `apps/api/src/services/tags.ts:116`, `apps/api/src/media/store.ts:29`.

Image normalization writes `<uuid>.webp.part` in the top-level media directory. A crash before rename leaves that file there. The exception cleanup only records final `.webp` paths after rename, while startup orphan cleanup only removes top-level names ending in `.webp`; `.webp.part` matches neither cleanup path.

Evidence: an unreferenced `.webp.part` with a timestamp two hours old survived `cleanupOrphans`; the returned removal count was zero.

Impact: interrupted uploads can permanently accumulate output files and eventually consume storage.

Required repair: write normalization outputs in the managed temporary directory or explicitly track and age-clean temporary output paths.

Plan: step 08.4–5; specification section 8.

## Comparison with the attached execution plan

“Implemented” below describes source and available automated evidence, not release acceptance on real models/devices.

| Step | Assessment | Evidence / remaining work |
| --- | --- | --- |
| 00 Inspect | Recorded | Baseline, ownership, and unavailable hosts/devices are recorded. This review preserved existing frontend changes. |
| 01 Inference machines | Pending; tooling partial | No real-model lock or live results. The script exists, but does not establish hardware placement/memory, rendered-token budget, rejected-image behavior, or complete maximum-post timing. These checks remain required. |
| 02 Runtime/build | Partial | Fastify separation, SQLite, emitted packages, paths, and build/type checks exist. Website startup and dependency watching fail requirements (R1, R6). |
| 03 Contracts | Substantial; incomplete generated surface | Schemas, TS/Swift fixtures, route matrix, and generated OpenAPI exist; fixture validation passes. OpenAPI does not fully describe multipart fields, required idempotency headers, or the SSE event payload schemas. |
| 04 Persistence | Substantially implemented | Seven domain tables, FKs, WAL, migrations, fingerprints, atomic helpers, and durable jobs. Migration/constraint/rollback tests pass. |
| 05 Authentication/client connection | Backend implemented; client connection incomplete | Async scrypt, JWT/cookie/bearer behavior, Origin checks and pre-hash limits have automated coverage. Real browser origin wiring is absent; iOS networking/Keychain/ATS/local-network settings are absent from the current client. |
| 06 Catalog/claims | Substantially implemented | Pinned checksum, normalized facts, transactions, replay, cooldown, and claim races are covered. The implementation additionally caps speed at light speed although the specification asks for finite positive speed without that maximum; resolve this contract deviation. |
| 07 Shared visibility | Core SQL implemented; privacy incomplete | Anonymous/author rules are reused by content/media/tools. Authenticated JSON lacks cache protection (R4). Full actor/state coverage is not established by the current tests. |
| 08 Multipart posts | Partial | Private upload, normalization, replay and job insertion are implemented and tested. Private mapped-IP links and temporary-output recovery fail (R7, R8). Maximum request through the real browser origin remains unverified. |
| 09 Moderation | Code implemented; live gate pending | Single durable loop, component policy, retries/failure states, and restart recovery have fake-model coverage. Exclusivity is defective (R2). Real acceptance/rejection and image/context fitting remain unverified. There is no adaptive downsize/split path for a request that cannot fit. |
| 10 Publishing journey | Gate pending | Backend journey passes with fake inference. Fresh real moderation followed by second-user reads through actual clients has not been demonstrated. |
| 11 Social | Substantially implemented; coverage incomplete | Comment/job creation, reactions, deletion and visibility exist. Current tests do not exercise all requested comment replay/conflict/media-target cases or deletion during an active inference call. |
| 12 Browsing/public | Substantially implemented; coverage incomplete | All public routes, prepared searches and cursor queries exist. Anonymous viewer is explicit. Privacy headers fail R4; tie-timestamp pagination and full limit/visibility matrix coverage are missing. |
| 13 Guide | Partial | Scoped read-only tools, planner/final calls, SSE, admission queue, disconnects and fake-host failures exist. Byte bounds are broken (R3). Grounded real conversations in both clients remain pending. |
| 14 Both clients | Incomplete in source | Current web is a local catalog/reference app; iOS is a small scaffold. Shared Swift decoding models are not a networked client or an XcodeGen fixture test target. This is implementation work, not just unavailable-device verification. |
| 15 Operations | Partial | Setup/migrate/seed/backup/smoke/operator scripts and documentation exist. Website startup, process exclusivity and drift reporting fail R1/R2/R5. Root type checking only covers API dependencies, not the entire workspace requested by the plan. |
| 16 Release verification | Pending | No current real-host/browser/physical-phone acceptance evidence. Honest pending labels are appropriate; the release cannot be called complete. |

## Validation performed for this review

| Check | Result | Scope |
| --- | --- | --- |
| Backend type checking | Pass | API, DB, shared, and API test types. Repeated with Turbo `--force` to bypass cached results. |
| Backend production build | Pass | API and dependencies; repeated with `--force`. This does not build/start the companion website. |
| Existing `pnpm test` | 11/11 pass | Temporary database/media and fake model HTTP servers. Initial sandbox run could not bind loopback sockets; rerun with socket access passed. |
| Production handler probes | Confirmed R1/R3/R4/R7/R8 | Temporary database; no production data; model methods stubbed only inside the review probe to record input bytes. |
| Concurrent process-lock probe | Confirmed R2 | Actual built lock helper; eight temporary child processes, seven simultaneous successful acquisitions. |
| Development task graph | Confirmed R6 | Turbo dry-run, no application servers started. |
| Identity-drift path | Confirmed absent by source inspection | Runtime health code never loads model lock/version/digest; real drift not induced. |
| Real models, browser journey, physical iPhone | Not performed | Remain separate acceptance gates; mock results do not satisfy them. |

The suite is useful, but its eleven top-level tests do not exhaust the plan's acceptance matrix. In particular, the SPA test uses a fabricated page, the in-flight deletion scenario is not exercised, and current guide tests check planner/history behavior without bounding the complete final request.

## Recommended order

1. Resolve website/startup wiring and make process exclusion atomic.
2. Repair guide byte budgets, apply authenticated cache headers, and close upload/link recovery defects.
3. Finish runtime drift reporting and dependency watching; fill contract/test gaps.
4. Implement the required web/iOS networking and flows against shared fixtures.
5. Run preflight on real hosts, then fresh two-user browser/phone journeys, restart/disconnect recovery, and release checks.

No application source was modified by this review. This report is the only added workspace artifact.

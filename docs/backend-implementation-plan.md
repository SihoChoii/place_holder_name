# Star Tagger backend: fast, complete local implementation

Rewritten 25 October 2026. This replaces the [local-server draft](https://star-tagger-backend-plan-local-server-y3mq.pages.grok.bot/).

Build one application server and two local inference endpoints. Finish one real journey—sign in, claim a star, publish a moderated post, and view it as another user—before expanding the route surface. Use the same data and authorization functions for iOS, the website, and the guide.

This is an implementation specification. Hardware performance, model setup, and acceptance checks remain unverified until run on the actual machines.

## 1. Fixed first-release scope

The first release is a fully working application on one trusted LAN. The backend laptop is the single source of truth. “Public” means accessible without login to anyone who can reach that server; it does not mean Internet hosting.

| Included and required | Explicitly deferred |
| --- | --- |
| Email/password signup, login, logout, and current user | Email verification, password recovery, external identity providers |
| Permanent star claims; one successful claim per user per 3,600 seconds | Claim transfer or release |
| Owner-created posts with a note, photos, links, or a combination | Video, audio uploads, rich link previews, post editing |
| Real moderation of new posts and comments; author-visible processing state | A moderation dashboard or multiple moderation providers |
| Reactions, comments, and author deletion of posts/comments | Notifications and advanced social features |
| Local overlays, explore feed/search, star pages, and unauthenticated reads | Server-side AR projection and advanced search infrastructure |
| Authenticated guide chat on iOS and web, grounded in catalog facts and approved content | Speech, autonomous write actions, persistent agent infrastructure |
| Polling, restart recovery, and a reproducible demo | WebSockets, event replay, multi-server deployment |

Keep the included features through the release. Reduce implementation complexity instead of quietly removing them. If a required dependency cannot pass its check, report that specific incomplete capability; seeded content or mocked inference does not satisfy completion.

## 2. Architecture and machine assignment

```text
iPhone ───────────────┐
                     ├── Application server ── SQLite + private photo directory
Browser → website ───┘           │
                                 ├── Guide HTTP requests → Gemma laptop
                                 └── Moderation HTTP requests → Clef laptop
```

| Machine | Initial role | Rule |
| --- | --- | --- |
| MacBook, 32 GB unified memory | Gemma guide | Start with E4B. Upgrade to 26B only after the complete app works and measured latency/memory justify it. |
| MacBook, 24 GB unified memory | API, database, images, website | Keep persistent application state here. |
| Laptop, 32 GB RAM and 14 GB VRAM | Clef Flash moderation | Confirm the GPU, driver, and image workload work before relying on this assignment. |

If Clef fails the GPU laptop preflight, move Clef to the 24 GB Mac and put the application server on the GPU laptop. Decide this before creating real demo data. Each inference laptop runs one resident model. No distributed inference or memory pooling is needed.

Model file sizes exclude runtime allocations. The proposed 18 GB Gemma variant does not fit entirely in 14 GB VRAM; CPU offloading is possible but must be measured. Apple chip generation and the third laptop's GPU remain inputs to the performance check. See [Ollama hardware support](https://docs.ollama.com/gpu) and [memory/concurrency guidance](https://docs.ollama.com/faq).

## 3. One stack and one place to build it

Use **Node 24 LTS, TypeScript, Fastify, better-sqlite3, private local files, and Ollama**. Use asynchronous Node `crypto.scrypt` for passwords. Node 24 is an [LTS release](https://nodejs.org/en/about/previous-releases).

Work in the existing monorepo:

```text
apps/api/              Fastify entry point, routes, business functions, model adapters
packages/db/           SQLite connection, SQL migrations, prepared queries
packages/shared/       API schemas, types, shared response fixtures
apps/web/              Existing companion website
apps/ios/              Existing native client
docs/                  Generated OpenAPI contract and operating instructions
data/                  Ignored local database, photos, temporary files
```

Convert the existing `apps/api` package. Replace its Hono scaffold and the unused Prisma/Postgres bootstrap; do not create a parallel `services/api`. Preserve unrelated working-tree changes. Use plain SQL migrations and prepared statements. Do not add an ORM, Docker dependency, external queue, Redis, or cloud service.

Run exactly **one API process and one moderation loop**. Enable SQLite foreign keys, WAL, and a five-second busy timeout. Store the database on the backend's local disk, not a network share or live cloud-sync folder. Never hold a database transaction across filesystem, hashing, or HTTP work.

Use Fastify route JSON schemas for validation and generate OpenAPI from those schemas. Keep response fixtures that both TypeScript and Swift can consume. Prefer the maintained Fastify plugins for cookies, JWTs, multipart parsing, and rate limiting; use `sharp` for image decoding and normalization.

## 4. Start model setup immediately

Model setup and API scaffolding run in parallel. Before integrating model-dependent features, all calls below must succeed **from the backend laptop**, not just from a terminal on the inference machine.

| Role | Initial explicit model tag | Endpoint |
| --- | --- | --- |
| Guide | `gemma4:e4b-it-q4_K_M` | `POST /api/chat` |
| Optional later guide upgrade | `gemma4:26b-a4b-it-q4_K_M` | `POST /api/chat` |
| Moderation | `clef-flash:9b-q8_0` | `POST /v1/systemone` |

Use Ollama v0.40.5 as the initial validation candidate, or an already-installed newer version that passes the same checks. After a successful run, record the exact version, model tag, full digest from `/api/tags`, host hardware, and loaded backend in `docs/model-lock.json`. Readiness checks report version/digest drift; rerun preflight before accepting a change. Do not describe a candidate version as tested before that run. [Release](https://github.com/ollama/ollama/releases/tag/v0.40.5), [Gemma tags](https://ollama.com/library/gemma4/tags), [Clef tags](https://ollama.com/library/clef-flash/tags).

Apply these conservative starting settings to each inference server, using its operating system's service/application environment, then restart Ollama:

```dotenv
OLLAMA_HOST=0.0.0.0:11434
OLLAMA_NO_CLOUD=1
OLLAMA_CONTEXT_LENGTH=4096
OLLAMA_NUM_PARALLEL=1
OLLAMA_MAX_LOADED_MODELS=1
OLLAMA_MAX_QUEUE=4
OLLAMA_KEEP_ALIVE=-1
```

Download the local tags in the table. Do not select cloud aliases. Verify actual context and GPU/CPU placement with `ollama ps`; record warm latency and peak memory. Larger context and parallel requests increase memory use. [Runtime configuration](https://github.com/ollama/ollama/blob/v0.40.5/envconfig/config.go), [context guidance](https://docs.ollama.com/context-length).

The preflight checks are:

1. Guide produces a normal answer and a valid tool call with the selected model.
2. Clef returns valid decisions for text and real JPEG/PNG/WebP images, including a post with the maximum attachment count and dimensions.
3. Accepted and rejected fixtures produce the expected decisions under the chosen policy.
4. Two client requests do not exhaust memory or grow an unbounded interactive queue.
5. Disconnecting an inference host produces a controlled error or pending review; restarting it permits recovery.

Warm both models before the rehearsal. Keep laptops powered and awake. Restrict port 11434 to the backend host using host firewall rules; clients use only the application server. Local Ollama does not authenticate an OpenAI-compatible client's supplied API key. [Local API behavior](https://docs.ollama.com/api/openai-compatibility).

## 5. Network, configuration, and authentication

Expose the website and `/api` under **one LAN origin**. Use the existing web server's proxy/rewrite support to forward `/api` to Fastify; the iPhone can use the same base URL. Keep exact host/port values in configuration and provide a base-URL setting on iOS. Reserve addresses or use stable local hostnames. Check Wi-Fi client isolation and firewalls before feature debugging.

```dotenv
HOST=0.0.0.0
PORT=4000
APP_ORIGIN=http://<backend-lan-host>:3000
DB_PATH=./data/stargaze.sqlite
MEDIA_DIR=./data/media
JWT_SECRET=<random-secret-generated-at-setup>
COOKIE_SECURE=false
GUIDE_BASE_URL=http://<guide-lan-host>:11434
GUIDE_MODEL=gemma4:e4b-it-q4_K_M
CLEF_BASE_URL=http://<moderation-lan-host>:11434
CLEF_MODEL=clef-flash:9b-q8_0
```

These are proposed deployment values, not existing credentials or verified addresses. Resolve relative data paths against the repository root so changing the process working directory cannot create a different database. Validate configuration at startup; missing secrets or invalid model addresses are startup errors. Keep secrets, database files, uploaded media, and `.env` out of Git.

For the LAN demo, the web cookie is host-only, `HttpOnly`, `SameSite=Lax`, and `Path=/`. Set `Secure` when using HTTPS; it cannot be used with an HTTP LAN address. Check browser `Origin` against `APP_ORIGIN` on signup/login/logout and all cookie-authenticated writes; reject mismatched or `null` origins. Native signup/login may omit `Origin`; authenticated native requests use bearer tokens. If an Authorization header is present, validate it without falling back to the cookie; reject conflicting authenticated identities. Use credentialed requests if development introduces a second origin. [Cookie behavior](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).

iOS uses bearer authentication and Keychain storage. Include a scoped development ATS configuration and `NSLocalNetworkUsageDescription`; test local-network permission granting, denial, and retry on a physical phone. [Apple guidance](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy).

Authentication rules:

- Trim/lowercase email and enforce uniqueness. Require a display name. Validate email syntax without introducing verification mail.
- Accept passwords of 12–128 characters without trimming or silent truncation. Use asynchronous scrypt with a random 16-byte salt, `N=131072`, `r=8`, `p=1`, a 64-byte key, and `maxmem=256 MiB`. Store algorithm, parameters, salt, and hash; compare derived keys with `timingSafeEqual`. These parameters follow [OWASP's scrypt guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).
- Return a seven-day JWT on signup/login and set it as the web cookie. Validate algorithm, expiry, issuer, audience, and user existence. Use one consistent user identity throughout each request.
- `/auth/logout` idempotently clears the cookie even if the session is expired or absent; retain the browser Origin check. iOS clears its stored token. Individual token revocation is outside this release; a copied bearer token remains valid until expiry. Expired sessions require login again.
- Rate-limit login/signup before hashing. Return generic login errors and do not log credentials, tokens, or raw model prompts.

## 6. Freeze the client contract first

All routes below are relative to `/api`. IDs are UUIDv4 strings, star IDs are integers from one pinned HYG catalog, and timestamps are UTC Unix milliseconds. Count note/comment limits by Unicode code points consistently across clients and server.

```json
{
  "error": {
    "code": "on_cooldown",
    "message": "You can claim another star later.",
    "retry_after_seconds": 120
  }
}
```

Use `401` for missing/expired credentials, `403` for an allowed-to-exist resource the caller cannot modify, `404` for hidden/missing content, `409` for ownership/idempotency conflicts, `413` for oversized uploads, `429` for limits, and `503` for unavailable guide capacity. Validation failures use `400`. Every `429` includes `Retry-After`.

| Routes | Required behavior |
| --- | --- |
| `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `GET /me` | `/me` includes `next_claim_at` and server time. |
| `GET /stars/:hyg_id`, `GET /stars/:hyg_id/travel-time` | Catalog facts and deterministic calculations; unknown distance returns `null` with a reason. |
| `GET /stars/:hyg_id/tags` | Paginated tag history with authenticated visibility rules. |
| `POST /stars/:hyg_id/claim` | Atomic claim; returns `201`, `409 already_claimed`, or `429 on_cooldown`. |
| `POST /tags`, `GET /tags/:id`, `DELETE /tags/:id` | One multipart create request; author-only soft deletion. |
| `GET /me/tags` | Paginated own posts, including pending/rejected posts and processing failures. |
| `GET /media/:id` | Authenticated author preview or approved content; no filesystem paths accepted. |
| `POST /view/content` | Up to 200 distinct catalog star IDs; returns bounded overlay summaries. |
| `GET /tags/:id/comments`, `POST /tags/:id/comments`, `DELETE /comments/:id` | Paginated comments, optional validated media target, author-only soft deletion. |
| `PUT /tags/:id/reactions/:emoji`, `DELETE /tags/:id/reactions/:emoji` | Idempotent add/remove and updated approved-content counts. |
| `GET /explore/feed`, `GET /explore/search` | Simple paginated reads; search catalog names/IDs and approved post notes. |
| `GET /public/stars/:hyg_id`, `/public/stars/:hyg_id/tags`, `/public/feed`, `/public/search`, `/public/tags/:id/comments`, `/public/media/:id` | Approved content only, regardless of any author cookie. |
| `POST /agent/chat` | Authenticated, fixed SSE protocol; no client-selected model endpoint. |
| `GET /health/live`, `GET /health/ready` | Process liveness separately from database/disk and warmed-model capability status. |

Require authentication on every route except signup, login, idempotent logout, `/public/*`, and the two health probes. Health probes expose component states without host addresses, secrets, or raw errors. A public star response includes catalog facts, public owner identity, and a bounded approved-content summary; its `/tags` route provides the remaining history. Public identity exposes user ID and display name, never email.

Require an `Idempotency-Key` UUID for claim, tag, and comment creation. The client retains it, the fields, and the exact encoded image bytes for retries of the same action. Persist it with the created resource and a normalized request fingerprint covering target IDs, text, ordered links, and uploaded-byte hashes as applicable. Same key and payload returns the existing resource; changed payload returns `409 idempotency_conflict`. Replays may reflect the resource's current moderation state. A replay of a deleted resource returns `404` and never recreates it.

Feeds and comments use stable `(created_at, id)` cursors, default page size 20, maximum 50. `/view/content` returns one claim, the newest three visible tags per star, and two visible recent comments per tag, plus counts and `has_more` indicators. Fetch full history through paginated star/detail reads. Poll every five seconds while the relevant screen is foregrounded, refetch immediately after writes, and stop polling in the background.

Pin the catalog version and share its IDs with iOS. Reject unknown IDs before writes. iOS owns projection; the server returns catalog facts and content. Normalize the catalog contract to `ra_hours`, `dec_degrees`, `epoch: "J2000"`, and nullable `distance_ly`. Preserve the source version and attribution. Treat source sentinels for unreliable distance as unknown. Travel time accepts a finite positive `speed_km_s` and returns `travel_seconds` using distance/speed, explicitly without acceleration or relativistic corrections.

## 7. Minimal database changes

Review the draft migration and alter it as needed. “SQLite accepts the migration” does not establish that the invariants below exist.

| Table | Essential fields and constraints |
| --- | --- |
| `users` | ID, unique normalized email, password hash record, display name, creation time. |
| `star_claims` | ID, unique `hyg_id`, user FK, server `claimed_at`, request key/fingerprint. Index `(user_id, claimed_at)`. |
| `tags` | ID, claim/user FKs, note, moderation status/result, creation time, `deleted_at`, request key/fingerprint. |
| `media` | ID, non-null tag FK, image-or-link kind, immutable file metadata or URL, moderation status/result. CHECK mutually exclusive image/link fields. |
| `comments` | ID, tag/user FKs, optional media FK, body, moderation status/result, timestamps, `deleted_at`, request key/fingerprint. |
| `reactions` | Composite key `(tag_id, user_id, emoji)`; fixed supported emoji set. |
| `moderation_jobs` | ID, target kind/ID, attempts, `next_attempt_at`, `last_error`, `failed_at`; unique target and due-job index. |

Use pending/approved/rejected as content moderation states. Derive author-facing `review_failed` from the retained failed job; an infrastructure failure is not a content rejection. Index parent IDs and `(moderation_status, created_at, id)` where feed queries need them. Add unique `(user_id, request_key)` constraints separately to claims, tags, and comments.

## 8. Implement three reliable write flows

### Claim a star

Use one synchronous `better-sqlite3` immediate transaction: replay a matching request if present; validate the catalog ID; check existing ownership; calculate cooldown from the user's latest successful claim; insert if eligible. Keep `UNIQUE(hyg_id)` as the final ownership constraint. No `await` occurs inside this transaction.

Use server time. Return `next_claim_at` and round remaining cooldown seconds upward for `Retry-After`. Rejected attempts do not consume the cooldown. Test both one user claiming different stars simultaneously and different users claiming the same star.

### Create a post with its media

`POST /tags` accepts `hyg_id`, `note`, a JSON array of `links`, and repeated image files in one authenticated multipart request. A post requires nonblank note text or at least one media item. Maximum note length is 140 characters; maximum total attachments is four.

1. Authenticate, rate-limit, validate ownership and request bounds, and stream incoming files into private temporary storage.
2. Accept JPEG/PNG/WebP only, at most 5 MiB per image and 20 megapixels decoded. Cap the entire multipart request at 22 MiB. Verify actual decoded format. Convert HEIC on iOS before upload.
3. Decode and normalize images to WebP, strip metadata, and resize to at most 2,048 pixels on the longest edge without upscaling. Hash the original uploaded bytes for retry comparison. Generate server-owned immutable filenames; clients cannot overwrite them.
4. Validate HTTP(S) links, maximum 2,048 characters, without embedded credentials, localhost/`.local` names, or literal private/loopback/link-local IP addresses. Do not perform DNS lookups or promise control of a domain's future destination. Store and display links as links. Do not fetch destinations or build previews. Moderation covers the supplied URL/text, not the destination page.
5. Move completed files into the private media directory. In one short database transaction, recheck ownership/idempotency, insert the pending tag and media, and insert its moderation job.
6. Return `201` with the tag ID and pending state. Remove this attempt's extra files on a handled failure or replay. A startup cleanup removes sufficiently old unreferenced files; it must not touch recent in-flight uploads.

This flow replaces presign, media-registration, attachment, and upload-completion APIs. Images always have a parent tag and inherit uploader ownership. Filesystem and database writes are reconciled through immutable files and orphan cleanup, rather than pretending they share a transaction.

### Comment, react, or delete

Comments require an approved, nondeleted parent and 1–280 characters. An optional media ID must belong to that same tag. Insert the pending comment and its moderation job atomically, with request-key replay support.

Reactions require an approved parent and one of `❤️`, `✨`, `🚀`, `🤩`, or `👍`. Each user can add each supported emoji once per tag. PUT and DELETE are idempotent.

Author deletion sets `deleted_at` and cancels relevant pending jobs in a transaction. Deleting a tag hides its media, comments, and reactions immediately. Background work must recheck deletion before publishing a result. Keep files for later cleanup; immediate disk erasure is not required for correct visibility.

## 9. One small durable moderation loop

Use Clef as the only initial moderation backend. Moving the tested model to another laptop is the first fallback. Avoid spending the initial build window implementing a second provider with different scoring semantics.

One loop selects the next due job from SQLite and performs one job at a time. Keep the job row while inference runs; do not persist a `running` state or introduce leases. The single-process constraint prevents simultaneous dispatch, and a restart naturally retries retained jobs.

A tag job evaluates the note, link text, and every image. Send bounded text requests and one image per inference request, grouping the category questions for each component. Split note/link components into separate requests if their combined text exceeds the tested context budget; do not silently truncate submitted content. Create a derivative at most 1,024 pixels on the longest edge for each image, and verify that the image plus policy fits the loaded context; downsize further when necessary. Aggregate all component decisions before publication. A comment job evaluates its body. Do not hold a database lock during inference.

Call `POST /v1/systemone` with `model`, `state`, named typed `questions`, optional base64 `images`, and `keep_alive`. For yes/no `noul` questions, the returned `noul` value is the probability of true. Require every expected field and finite values in `[0,1]`; malformed output is a retryable failure. This endpoint does not accept chat streaming or tool controls. [System One API](https://docs.ollama.com/api/systemone), [decision semantics](https://docs.ollama.com/capabilities/decision).

Put the policy, question wording, category thresholds, and policy version in one checked-in configuration. Start with these categories:

| Category | Reject | Allow |
| --- | --- | --- |
| Explicit sexual content | Explicit sexual acts or sexually explicit imagery/text | Nonsexual people, ordinary clothing, and factual nonexplicit discussion |
| Graphic violence | Gore or graphic severe injury | Astronomy, ordinary sports, and non-graphic factual discussion |
| Targeted abuse | Targeted harassment, dehumanization, or hateful attacks | Civil disagreement and non-abusive discussion |
| Threats or encouragement of harm | Credible threats or encouragement of violence/self-harm | Neutral reporting, prevention, and supportive discussion |
| Spam or fraud | Unsolicited repetitive promotion, phishing, or deceptive solicitations | Relevant legitimate links and ordinary personal posts |

Use an initial rejection threshold of 0.5 for “violates category” questions. Validate at least one accepted and one rejected fixture per category, plus image fixtures, before calling the policy ready. This is a starting decision rule, not a claim of calibrated accuracy. Persist model identity, policy version, and component results.

Publish the whole tag only after every required component passes. A rejected component rejects the tag. On completion, atomically write results/statuses and delete the job, provided the target is still pending and not deleted. Duplicate completion must be harmless.

On timeout, connection failure, or invalid output, keep content pending and persist retry information. Retry after 5, 15, 30, and 60 seconds; after five failed attempts set `failed_at` and stop automatic attempts for that job. Do not repeat a permanently invalid or oversized request unchanged: split/downsize it within the documented bounds or retain an explicit processing failure. Select other due jobs fairly. Provide a local `moderation:retry` command for failed jobs; after restoring a host, rerun failed jobs explicitly. The UI shows queued, delayed, review failed, approved, or rejected accurately.

There is no automatic approval on model failure. A local operator command may approve explicitly selected demo records with an audit reason, but manually approved or seeded records do not satisfy the real-moderation acceptance check.

## 10. One visibility policy everywhere

- Anonymous routes and guide tools return only approved, nondeleted content, even when an author cookie happens to be present.
- Authenticated readers additionally see their own pending/rejected content and processing errors, provided the parent is accessible. `/me/tags` is the author's complete post-status view.
- Public image access requires both the image and parent tag to be approved and the parent not deleted. Author preview requires ownership of that parent. Serve bytes through a media-ID route; never mount the private media directory as public static files.
- Public comments require approval of both comment and parent tag. Counts reflect approved content; pending comments do not change public counts.
- Every query path, image handler, and guide tool uses these shared rules. Authenticated responses and pending images use private/no-store caching; this release needs no shared response cache.

## 11. Guide chat with bounded tools

`POST /agent/chat` accepts user/assistant message history, `mode` (`local` or `explore`), up to 200 catalog star IDs for local scope, and an optional selected star. Validate the selected star before preloading: it must exist and, in local mode, belong to the supplied scope. Reject client-supplied system messages, tool results, model names, and endpoint URLs. Treat history and post text as untrusted content.

Provide three read-only tools backed by normal application functions: `get_star`, `calculate_travel_time`, and `get_star_content`. In local mode, each tool may use only the supplied, validated star scope; explore mode may address any catalog star. Tools return approved content only. The model cannot claim, post, delete, or bypass authorization.

Use Ollama's native `/api/chat` so context/output limits are explicit. Set `options.num_ctx=4096` on both calls, `num_predict=256` for the nonstreaming planner, and `num_predict=512` for the final answer. Disable thinking with `think:false` after confirming support in preflight. Keep tool schemas compact. Allow one planning request, at most three validated tool calls, then one final streaming response with tools disabled. Append the planner's assistant message and validated tool-result messages before the final request. Preload selected-star facts when available. Do not add an agent framework or an unbounded tool loop. [Chat API](https://docs.ollama.com/api/chat).

Cap the client JSON body at 32 KiB and accept at most six history messages, each at most 2,000 characters for either role. These are intake limits, not permission to send all that text to the model. Apply a conservative 2,800-byte UTF-8 budget to the serialized model messages plus tool schemas before each inference call, leaving headroom for the pinned chat template and output. Verify the rendered-token count of this bound in preflight. Keep aggregate tool-result text below 1,000 bytes; return short factual fields and at most two truncated post notes per result. Trim oldest history first, preserve instructions and current selected-star facts, and return `400 context_too_large` if the fixed prompt/current request still cannot fit. Increase these budgets only after an explicit context/memory test.

Translate Ollama responses into one client protocol:

```text
event: start
data: {"request_id":"<uuid>"}

event: delta
data: {"text":"Sirius is..."}

event: done
data: {"request_id":"<uuid>"}
```

Before streaming starts, use normal HTTP errors. After it starts, emit `error` with `{ "code", "message" }`, then close; `done` means successful completion only. Do not expose model reasoning or raw tool payloads as answer text. Both clients consume a streamed POST response; the web client uses streaming `fetch`.

Allow one active guide request and two waiting requests globally; reject extra work with `503 guide_busy`. Each request has a 60-second deadline including queue time, with cancellation propagated upstream. Test that a disconnected client releases capacity. Model failure never blocks ordinary reads, claims, or uploads. Moderation has its own independent worker and model host.

## 12. Small operational contract

Use configurable initial limits: login 10/minute/IP, signup 5/hour/IP, posts/comments 20/minute/user, chat 30/hour/user, and one successful claim/hour/user. In-memory counters are sufficient for this single-process LAN release, except the persisted claim cooldown. Bound password-hash concurrency and expensive image processing so they cannot consume all server resources.

Give model connections a three-second connection timeout, individual moderation calls a 30-second deadline, and a complete tag moderation attempt a 120-second deadline across its bounded components. Report readiness by component: database, writable media directory, guide, and moderation. An unavailable model marks its feature degraded while the core API continues serving. Warm-model probes must exercise real capabilities; a responding version endpoint is insufficient.

Log request ID, route, status, duration, job ID, model duration, and error class. Do not log raw passwords, JWTs, private image bytes, or complete chat messages. Include a local command to list/retry failed moderation jobs. During the rehearsal, watch queue depth and the age of the oldest pending job.

Provide one documented start command after initial installation/model downloads, one migration command, a repeatable seed command, a smoke-test command, and a graceful shutdown path. API restart must preserve users, claims, posts, media, and pending jobs. Take a SQLite-supported backup with the media directory before the demo; do not copy only a live WAL database's main file.

## 13. Build order and completion gates

Use these gates rather than the previous fixed afternoon time slots. Start downloads immediately. Reserve the final 20% of the available build window for integration and recovery checks. If time is short, keep polling, E4B, plain links, SQL search, and the single moderation provider; do not trade away required behavior.

| Gate | Work | Exit condition |
| --- | --- | --- |
| 0 — Contracts and dependencies | In parallel: model preflight; Fastify/SQLite setup; client schemas and real-device LAN access. | Versioned contract fixtures load in both clients; phone/browser reach the API; real guide and text/image moderation calls pass. |
| 1 — Auth and claims | Signup/login/logout, `/me`, catalog validation, atomic claims, retry identity. | Two users log in; both claim-race cases pass; cooldown and replay behavior agree with the UI. |
| 2 — Complete publishing path | Multipart posts, private images, jobs, visibility, overlay reads, author status view. | One user posts a new photo/note; real moderation completes; a second user sees it after polling. |
| 3 — Social and browsing | Comments, reactions, deletion, feeds, search, public routes, cursor bounds. | Fresh content behaves consistently through every read path; hidden/deleted content stays hidden. |
| 4 — Guide | Bounded tools, scoped context, SSE adapter, client cancellation and unavailable-state UI. | Both clients receive grounded answers; tool scope, queue limits, and failure handling pass. |
| 5 — Rehearsal and freeze | Seed, startup/backup notes, smoke tests, actual phone/browser run, restart and disconnect tests. | Every required acceptance check below passes with fresh data. |

When people are available, split work by clear ownership: one person on API/storage/contracts, one on inference setup/moderation integration, and one on clients/guide streaming. Contract fixtures are the handoff. Do not have multiple people independently change shared schemas or the main migration.

### Required acceptance checks

- [ ] A real iPhone and browser can sign up, log in, remain authenticated, log out, and handle expiry.
- [ ] One star has one owner; one user cannot acquire two different stars within the cooldown, including concurrent requests.
- [ ] Retrying a successful claim, multipart post, or comment after a lost response creates no duplicate resource.
- [ ] Note-only, photo-only, link-only, and mixed posts work. Empty, oversized, invalid-image, and unauthorized posts fail cleanly.
- [ ] Real text and image moderation can approve and reject representative fixtures; scores and policy version are stored.
- [ ] Another user and an anonymous request cannot retrieve pending/rejected/deleted content, including direct image/comment URLs.
- [ ] A backend restart resumes unfinished moderation. Failed jobs remain inspectable/retryable, and one failing job does not permanently block later jobs.
- [ ] Comments, reaction counts, deletion, pagination, search, and five-second polling work with newly created records.
- [ ] Guide answers use catalog facts and approved content, obey local/explore scope, and stream correctly to both clients.
- [ ] A disconnected model laptop produces a clear degraded state without breaking the core API; reconnect and job retry restore the feature.
- [ ] Two simultaneous users complete the journey without out-of-memory failures or unbounded waiting.
- [ ] The documented start command works after a clean stop, using the saved database, images, configuration, and model versions.

The release is complete when these checks pass on the actual three-laptop network. Source code that compiles, a populated seed database, or a successful localhost-only test is an intermediate milestone.

# Star Tagger API contract (v1)

Status: **frozen for client work** (backend branch `backend/api`); all routes below are implemented and covered by
automated tests (fake model servers). Live model and device checks are tracked in `docs/backend-progress.md`. Implementation status per route is in
[route-matrix.md](route-matrix.md). Machine-readable JSON Schemas live in `packages/shared/src/schemas.ts`
(TypeScript types in `packages/shared/src/types.ts`, Swift Codable models in `packages/shared/swift/StarTaggerAPI.swift`);
example payloads in `packages/shared/fixtures/`.
`docs/openapi.json` is generated from the implemented routes (`pnpm openapi`).

## Conventions

- **Base URL.** Every route below is under `/api`. One origin serves both the website and the API:
  Fastify (default `0.0.0.0:4000`) serves `/api/*` and, when `apps/web/out/index.html` exists (the Next.js static
  export written by `pnpm build`), the website with an `index.html` fallback for any other non-`/api` GET.
  Web uses relative `/api/...` URLs; during development the Next.js dev server (`localhost:3000`) rewrites `/api` to
  `API_UPSTREAM` (default `http://127.0.0.1:4000`). Every browser origin must be listed in `APP_ORIGIN`. iOS uses a configurable base such as `http://<backend-lan-host>:4000`
  (never `localhost` on the phone).
- **IDs** are UUIDv4 strings. **Star IDs** (`hyg_id`) are integers from the pinned catalog
  `hyg-4.4-mag6.5-20261025` (`catalog/stars.json`, 8,920 stars). Unknown star IDs are rejected.
- **Timestamps** are UTC Unix **milliseconds** (integers).
- **Text lengths** are counted in Unicode code points: note ≤ 140, comment 1–280, display name 1–50.
- **Nulls**: fields documented as nullable are always present with `null`, never omitted.
- **JSON** request bodies need `Content-Type: application/json`, except `POST /tags` (multipart).

### Authentication

- `POST /auth/signup` and `POST /auth/login` return `{token, expires_at, user}` **and** set the cookie
  `st_session=<jwt>; HttpOnly; SameSite=Lax; Path=/` (+ `Secure` only when `COOKIE_SECURE=true`/HTTPS). Max-Age 7 days.
- Web: rely on the cookie (send `credentials: "same-origin"`, the default for same-origin fetch).
  iOS: send `Authorization: Bearer <token>`, store the token in the Keychain.
- If an `Authorization` header is present it is used and validated; an invalid bearer **never** falls back to the
  cookie. A bearer and cookie for different users → `401`.
- Cookie-authenticated **writes** (any non-GET) and signup/login/logout from a browser must carry an `Origin`
  equal to `APP_ORIGIN` (comma list allowed); otherwise `403 bad_origin`. Native requests may omit `Origin`.
- `POST /auth/logout` always returns `204` and clears the cookie (even with no/expired session).
- Tokens expire after 7 days → `401 unauthorized`; sign in again.
- Auth required on every route except: signup, login, logout, `/public/*`, `/health/*`.

### Errors

Every non-2xx response has this body:

```json
{ "error": { "code": "on_cooldown", "message": "You can claim another star later.", "retry_after_seconds": 120 } }
```

`retry_after_seconds` is present on every `429` (and `503 guide_busy`), along with a `Retry-After` header.

| Status | Codes |
| --- | --- |
| 400 | `validation_failed` (schema), `bad_request`, `unknown_star`, `empty_post`, `invalid_link`, `invalid_image`, `context_too_large` |
| 401 | `unauthorized` (missing/invalid/expired credentials, conflicting identities), `invalid_credentials` (login) |
| 403 | `forbidden` (not your resource), `bad_origin`, `not_star_owner` (posting to a star you don't own) |
| 404 | `not_found` (missing **or hidden** content; also a replay of a deleted resource) |
| 409 | `already_claimed`, `email_taken`, `idempotency_conflict` |
| 413 | `payload_too_large` |
| 415 | `unsupported_media_type` (image not JPEG/PNG/WebP by decoded content) |
| 429 | `on_cooldown` (claims), `rate_limited` |
| 500 | `internal_error` |
| 503 | `guide_busy`, `guide_unavailable` |
| 504 | `guide_timeout` (before streaming starts) |

### Idempotency

`POST /stars/:hyg_id/claim`, `POST /tags`, `POST /tags/:id/comments` **require** header
`Idempotency-Key: <uuid>`. Keep the key, fields and exact image bytes until the request resolves; retry with the
same key after a timeout. Same key + same payload → the original resource (status `201`, current moderation
state). Same key + different payload → `409 idempotency_conflict`. Replay of a since-deleted resource → `404`.
Missing/invalid key → `400 validation_failed`.

### Pagination

Paged routes take `?cursor=<opaque>&limit=<1..50, default 20>` and return `{ "items": [...], "next_cursor": string|null }`,
newest first, ordered by `(created_at, id)` descending. Pass `next_cursor` back unchanged; `null` = end.

### Polling

No WebSockets. Poll the visible screen every 5 s while foregrounded, refetch right after your own writes, stop in the background.

## Shared objects

```ts
PublicUser  = { id: string, display_name: string }                     // never includes email
PrivateUser = { id, email, display_name, created_at }                   // only for yourself

ClaimInfo   = { id, hyg_id: number, owner: PublicUser, claimed_at: number }

Star = {
  hyg_id: number, hip_id: number|null, name: string|null, bayer_flamsteed: string|null,
  constellation: string|null,             // IAU abbreviation e.g. "CMa"
  ra_hours: number, dec_degrees: number, epoch: "J2000", magnitude: number,
  distance_ly: number|null, distance_unknown_reason: "distance_unknown"|null,
  spectral_type: string|null, exoplanet_count: number, wiki_title: string|null,
  catalog_version: string, claim: ClaimInfo|null
}

MediaItem =
  | { id, kind: "image", url: string, width: number, height: number, mime: "image/webp" }
  | { id, kind: "link",  url: string }                // external http(s) URL; display as a plain link
// image url: "/api/media/<id>" in authenticated responses, "/api/public/media/<id>" in /public responses.
// Prefix with the API origin on iOS. Images are normalized WebP (≤ 2048 px long edge, metadata stripped).

Comment = {
  id, tag_id, author: PublicUser, body: string, media_id: string|null,
  moderation_status: "pending"|"approved"|"rejected",
  processing_state?: ProcessingState,   // only on your own comments
  created_at
}

Tag (a post) = {
  id, hyg_id, star_name: string|null, author: PublicUser (= star owner), note: string|null,
  media: MediaItem[] (ordered, ≤ 4),
  moderation_status: "pending"|"approved"|"rejected",
  processing_state?: ProcessingState,   // only on your own posts
  created_at,
  reaction_counts: { [emoji]: number },  // approved reactions only; emoji keys with 0 are omitted
  my_reactions?: string[],              // authenticated responses only
  comment_count: number,                // approved, non-deleted comments
  recent_comments?: Comment[]           // up to 2 newest visible (overlays, feeds, star pages, detail)
}

ProcessingState = "queued" | "delayed" | "review_failed" | "approved" | "rejected"
// queued: waiting for moderation; delayed: a moderation attempt failed and will retry;
// review_failed: automatic retries exhausted (infrastructure problem, not a rejection) – operator can retry.
```

Reaction emoji set (exact strings, URL-encode in paths): `❤️` `✨` `🚀` `🤩` `👍`.

### Visibility (same everywhere)

- Anonymous (`/public/*`) and guide: only **approved**, non-deleted posts/comments; images only if image and post are approved.
- Signed in: the above **plus your own** pending/rejected posts and comments (with `processing_state`).
- Hidden or deleted content is `404`, never `403`.

## Routes

### Auth

| Method & path | Request | Success |
| --- | --- | --- |
| `POST /auth/signup` | `{ email, password (12–128 chars, not trimmed), display_name (1–50) }` | `201 { token, expires_at, user: PrivateUser }` + cookie. `409 email_taken`, `429 rate_limited` (5/hour/IP) |
| `POST /auth/login` | `{ email, password }` | `200 { token, expires_at, user }` + cookie. `401 invalid_credentials` (generic), `429` (10/min/IP) |
| `POST /auth/logout` | none | `204`, cookie cleared |
| `GET /me` | — | `200 { user: PrivateUser, server_time, next_claim_at: number|null, claim_cooldown_seconds: 3600 }`. `next_claim_at` is `null` when you can claim now |

Email is trimmed and lowercased. Fixtures: `auth.signup.201.json`, `me.200.json`, `me.eligible.200.json`.

### Stars and claims

| Method & path | Request | Success |
| --- | --- | --- |
| `GET /stars/:hyg_id` | — | `200 Star`. `404 not_found` for unknown IDs |
| `GET /stars/:hyg_id/travel-time?speed_km_s=17` | `speed_km_s` finite, > 0 (no upper cap; constant-speed model) | `200 { hyg_id, speed_km_s, distance_ly, travel_seconds, travel_years, reason, model }`; distance unknown → numbers `null`, `reason: "distance_unknown"` |
| `GET /stars/:hyg_id/tags?cursor&limit` | — | `200 { items: Tag[], next_cursor }` (visible to you) |
| `POST /stars/:hyg_id/claim` | header `Idempotency-Key`; no body | `201 { claim: ClaimInfo, next_claim_at }`. `400 unknown_star`, `409 already_claimed`, `429 on_cooldown` (+ `retry_after_seconds`). Failed attempts do not start the cooldown |

One owner per star, forever. One successful claim per user per 3,600 s.

### Posts (tags) and media

`POST /tags` — `multipart/form-data`, header `Idempotency-Key`. Fields (text fields **before** files):

| Part | Type | Rules |
| --- | --- | --- |
| `hyg_id` | text | a star **you own** (`403 not_star_owner` otherwise) |
| `note` | text, optional | ≤ 140 code points; blank = none |
| `links` | text, optional | JSON array of strings, e.g. `["https://example.com"]`; http(s), ≤ 2048 chars, no credentials, no localhost/`.local`/private IP literals |
| `images` | file, repeatable | JPEG/PNG/WebP (convert HEIC on iOS first), ≤ 5 MiB each, ≤ 20 MP decoded |

At least a nonblank note or one link/image (`400 empty_post`). Links + images ≤ 4. Whole request ≤ 22 MiB (`413`).
Success: `201 { tag: Tag }` with `moderation_status: "pending"`, `processing_state: "queued"`.

| Method & path | Success |
| --- | --- |
| `GET /tags/:id` | `200 Tag` (with `recent_comments`); `404` if hidden |
| `DELETE /tags/:id` | `204` author only (`403` otherwise); hides its media, comments and reactions immediately |
| `GET /me/tags?cursor&limit` | `200 { items: Tag[], next_cursor }` all your posts incl. pending/rejected/review_failed |
| `GET /media/:id` | image bytes (`image/webp`), `Cache-Control: private, no-store`; author preview or approved |

### Overlay (iOS AR view and web sky view)

`POST /view/content` body `{ "hyg_ids": [32263, 30365] }` (1–200 distinct catalog IDs) →
`200 { stars: StarOverlay[], server_time }`, one entry per requested ID in request order:

```ts
StarOverlay = { hyg_id, claim: ClaimInfo|null, tags: Tag[] /* ≤ 3 newest visible, each with ≤ 2 recent_comments */,
                tag_count: number /* visible to you */, has_more: boolean }
```

### Comments and reactions

| Method & path | Request | Success |
| --- | --- | --- |
| `GET /tags/:id/comments?cursor&limit` | — | `200 { items: Comment[], next_cursor }` |
| `POST /tags/:id/comments` | header `Idempotency-Key`; `{ body: string (1–280), media_id?: uuid|null }` (`media_id` must be an image/link of the same post) | `201 { comment: Comment }` pending. Parent must be approved (`404` otherwise) |
| `DELETE /comments/:id` | — | `204` author only |
| `PUT /tags/:id/reactions/:emoji` | — | `200 { tag_id, reaction_counts, my_reactions }` idempotent |
| `DELETE /tags/:id/reactions/:emoji` | — | `200` same shape, idempotent |

Rate limit: posts + comments 20/min/user (`429 rate_limited`).

### Explore and search (signed in)

| Method & path | Success |
| --- | --- |
| `GET /explore/feed?cursor&limit` | `200 { items: Tag[], next_cursor }` newest visible posts across all stars (each has `hyg_id`, `star_name`, `author` = owner, media, counts, `recent_comments`) |
| `GET /explore/search?q=sirius&cursor&limit` | `200 { stars: Star[] (≤ 20, first page only, catalog name/Bayer/`hyg 123`/`hip 123`/number), tags: Tag[] (notes containing q), next_cursor }` |

### Public reads (no login; approved content only, cookies ignored)

| Method & path | Success |
| --- | --- |
| `GET /public/feed?cursor&limit` | `200 { items: Tag[], next_cursor }` — the public feed of claimed stars' posts |
| `GET /public/stars/:hyg_id` | `200 { star: Star /* incl. claim.owner public identity */, tag_count, recent_tags: Tag[] /* ≤ 3, approved media, reaction_counts, recent_comments */ }` |
| `GET /public/stars/:hyg_id/tags?cursor&limit` | `200 { items: Tag[], next_cursor }` full approved history |
| `GET /public/search?q&cursor&limit` | same shape as `/explore/search` |
| `GET /public/tags/:id/comments?cursor&limit` | `200 { items: Comment[], next_cursor }` |
| `GET /public/media/:id` | image bytes; only approved media of approved posts |

Public `Tag` objects omit `my_reactions` and `processing_state`; image URLs use `/api/public/media/:id`.

### Guide chat (SSE)

`POST /agent/chat` (signed in; 30 requests/hour/user). Request body (≤ 32 KiB):

```json
{
  "messages": [{ "role": "user", "content": "What is this bright star?" }],
  "mode": "local",
  "scope_hyg_ids": [32263, 30365],
  "selected_hyg_id": 32263
}
```

- `messages`: 1–6 items, roles `user`/`assistant` only, each 1–2000 chars, last one must be `user`.
- `mode`: `local` (only stars in `scope_hyg_ids`, the stars currently in view, ≤ 200) or `explore` (whole catalog).
- `selected_hyg_id` optional/null; in local mode it must be in `scope_hyg_ids`.
- No system messages, model names or URLs are accepted.
- `400 context_too_large` is decided before any model call: the current message plus instructions must leave room
  for the tool round (about 1,450 characters in explore mode with no selected star). Older history is trimmed
  silently; tool results are shrunk if needed, so a request that starts is never rejected for size afterwards.

Errors before streaming are normal JSON errors (`400`, `401`, `429`, `503 guide_busy` when 1 active + 2 waiting,
`503 guide_unavailable`, `504 guide_timeout` when the model or the 60 s deadline times out before streaming).
A client disconnect cancels the work silently. Otherwise the response is `200 text/event-stream`:

```text
event: start
data: {"request_id":"<uuid>"}

event: delta
data: {"text":"Sirius is..."}

event: done
data: {"request_id":"<uuid>"}
```

After `start`, failures are sent as `event: error` / `data: {"code":"guide_unavailable"|"guide_timeout"|"internal_error","message":"..."}`
and the stream closes; `done` only means success. Concatenate `delta.text` in order. Abort the fetch to cancel.
Deadline 60 s including queue time. Web: read `fetch()` body as a stream (EventSource cannot POST).
Fixtures: `chat.request.json`, `chat.stream.sse.txt`, `chat.stream-error.sse.txt`.

### Health

| Method & path | Success |
| --- | --- |
| `GET /health/live` | `200 { status: "ok" }` |
| `GET /health/ready` | `200 { status: "ok"|"degraded", components: { database, media, guide, moderation: { status: "ok"|"unavailable"|"disabled"|"unknown", checked_at, detail? } } }` (model status cached; probed every 60 s in the background). `503` with the same body only when the database or media directory is unusable. A degraded guide/moderation never blocks other routes. |

## Fixture index (`packages/shared/fixtures/`)

| Fixture | Route |
| --- | --- |
| `auth.signup.201.json`, `auth.login.200.json` | signup / login |
| `me.200.json`, `me.eligible.200.json` | `/me` on cooldown / eligible |
| `star.200.json`, `star.unknown-distance.200.json` | `/stars/:id` |
| `travel-time.200.json`, `travel-time.unknown.200.json` | travel time |
| `claim.201.json` | claim |
| `tag.create.201.json`, `tag.approved.200.json`, `tag.pending.200.json`, `tag.rejected.200.json`, `tag.review-failed.200.json` | posts |
| `tags.page.200.json`, `me-tags.page.200.json`, `feed.page.200.json` | paged posts |
| `comments.page.200.json`, `comment.create.201.json`, `reaction.200.json` | social |
| `view-content.200.json` | overlay |
| `search.200.json`, `public-star.200.json` | search / public star page |
| `health-ready.200.json` | readiness |
| `error.*.json` | error bodies |
| `chat.request.json`, `chat.stream.sse.txt`, `chat.stream-error.sse.txt` | guide |

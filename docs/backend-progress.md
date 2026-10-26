# Backend progress

Verification columns: **auto** = automated tests (`pnpm test`: temp DB/media, fake model servers in
`apps/api/test/fixtures/`), **live** = real Gemma/Clef hosts, **browser** = real browser through the one origin,
**iphone** = physical iPhone. `—` = not applicable. `pending` = not run yet (dependency in Notes).

Updated 2026-10-25 17:27 PDT after the second review's open bugs were fixed (Node v24.2.0, pnpm 9.15.0, macOS 26.5 arm64).

| Step | Status | auto | live | browser | iphone | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 00 Inspect | done | — | — | — | — | Baseline below |
| 01 Inference machines | **blocked** | — | pending | — | — | Gemma/Clef host addresses unknown to the backend agent. `pnpm models:check` + `docs/model-preflight.md` ready |
| 02 Runtime/build | done | pass | — | — | — | Fastify replaces Hono; Prisma/Postgres/Docker removed; built API started and `/api/health/live` answered; migrate from repo root and `packages/db` hit the same DB |
| 03 Contracts | done | pass (TS + Swift) | — | — | — | `docs/api-contract.md`, `packages/shared` schemas/types/fixtures (validated by test) + Swift Codable models `packages/shared/swift/` (decode all fixtures), `docs/openapi.json` generated (27 paths) |
| 04 Database | done | pass | — | — | — | `packages/db/migrations/001_initial.sql` (7 tables), WAL/FK/busy timeout, checksum-guarded migrations, rollback test |
| 05 Auth | done (backend) | pass | — | pending | pending | scrypt N=2^17, 7-day JWT, `st_session` cookie, Origin checks, bearer precedence, rate limits. Web proxy replaced by same-origin static serving (see deviations) |
| 06 Catalog/claims | done | pass | — | — | — | Pinned catalog sha256-checked at startup; atomic claim; cooldown boundary tested with injected clock |
| 07 Visibility | done | pass | — | — | — | `apps/api/src/services/visibility.ts`, used by every read path, media route and guide tool |
| 08 Posts | done | pass | — | pending | pending | Multipart, sharp decode/normalize to WebP ≤2048 px, link rules, idempotent replay, temp cleanup, orphan cleanup |
| 09 Moderation | done (code) | pass | **pending** | — | — | Clef `/v1/systemone` adapter, 5-category policy v1, durable loop with 5/15/30/60 s backoff, CLI. Live: needs Clef host |
| 10 First journey | **gate pending** | pass | pending | pending | pending | Passes end-to-end over real HTTP against the built API with the **fake** model server (`pnpm smoke`). Real gate needs Clef host + a client |
| 11 Social | done | pass | pending | — | — | Comments (moderated), reactions, author deletion incl. cancel of in-flight jobs |
| 12 Browse/public | done | pass | — | pending | — | Feed, search (escaped LIKE), all `/public/*` routes |
| 13 Guide | done (code) | pass | **pending** | pending | pending | Planner + ≤3 tools + streamed final; queue 1+2; 60 s deadline; disconnect cancel. Live: needs Gemma host |
| 14 Clients | incomplete | — | — | pending | pending | `pnpm start` serves the Next.js export (`apps/web/out`) at `/`, but that page is a catalog reference that never calls `/api` (no login/claim/feed/guide yet); iOS is a scaffold. API transport and fixtures exist; product flow integration remains work |
| 15 Operations | done (scripts) | pass | pending | — | — | setup/start/migrate/seed/smoke/models:check/moderation:*/db:backup/openapi + `docs/operations.md`; backup→restore drill passed; duplicate-process guard verified (stale PIDs ignored, one-line exit). Seed has no committed password. `models:check`/`smoke` against real hosts pending |
| 16 Release | pending | — | pending | pending | pending | Needs model hosts, browser and phone on the LAN |

## Baseline (step 00, 15:31 PDT)

- Repo `~/Documents/place_holder_name`, branch `cursor/stargaze-monorepo-setup` @ 38290ca; work branch `backend/api`.
- Scaffold: Hono `/health` only; empty Prisma/Postgres + docker-compose; empty `packages/shared`; Next.js placeholder web; XcodeGen iOS shell. No migrations or catalog.
- Catalog from the pinned handoff (`catalog/`, sha256 pinned in `catalog/VERSION.json`).
- No Ollama on this Mac; model hosts' LAN addresses unknown; no physical iPhone reachable by the agent.
- `apps/web` has uncommitted work by another teammate in this working tree; the backend never stages `apps/web`.

## Deviations from the spec / plan

1. **Website origin:** the actual frontend uses Next.js. Production exports it into `apps/web/out`, served by Fastify
   on the API origin; Next.js development rewrites `/api` to `API_UPSTREAM`.
2. **APP_ORIGIN** accepts a comma-separated list (e.g. LAN host + `localhost:3000` dev server).
3. **Rate limiting** uses a small in-memory fixed-window limiter instead of `@fastify/rate-limit` (needs per-user keys after
   authentication and pre-hash checks; spec allows in-memory counters).
4. **Connection timeout:** Node `fetch` has no separate connect timeout; each model call has an overall deadline
   (30 s Clef call, 120 s per job, 60 s guide request incl. queue) instead of a distinct 3 s connect timeout.
5. **Node:** spec targets Node 24 LTS; this Mac runs v24.2.0 (OK). `engines` allows ≥ 20.11.
6. **Guide planner:** when the planner calls no tools, its text is discarded and the final streamed call answers
   (keeps one fixed protocol; costs one extra short call).

## Review repairs

All eight findings R1–R8 in `docs/backend-review-2026-10-25.md` have code fixes and regression checks:
actual Next.js build/serving/proxy; atomic crash-safe process mutex; complete planner/final UTF-8 budgets;
private API cache headers; locked model identity drift detection; dependency-aware development rebuilds;
IPv4-mapped IPv6 link rejection; and normalization-output cleanup. `pnpm typecheck` now covers web too.
The expanded suite has 18 tests, including HTTP requests against the actual web export. Existing frontend edits
were preserved. Live-model, full client-flow and physical-phone gates remain pending.

## Second review fixes (2026-10-25, evening)

Open items from the follow-up review, each with a regression test in `apps/api/test`:

1. Session JWTs must carry `iss`, `aud`, `sub` and `exp` (`requiredClaims`); a secret-signed token without them gets 401.
2. Model timeouts and the 60 s guide deadline return `504 guide_timeout` (JSON before streaming, SSE `error` after
   `start`); a client disconnect still cancels quietly.
3. The moderation loop catches unexpected DB/adapter errors, logs them, and retries with backoff (5 s doubling to 60 s);
   it never produces an unhandled rejection.
4. Requests rejected with `503 guide_busy` (or abandoned in the queue) do not count toward the 30/hour chat limit.
5. `400 context_too_large` is decided before any model call (worst-case tool round reserved); after planning, the
   final request fits by trimming older history and, if needed, shrinking tool results. Budget stays 2,800 bytes.
6. `api.pid` is a JSON marker; a stale PID reused by an unrelated process no longer blocks startup; a duplicate start
   prints one line and exits 1.
7. Link validation also rejects private IPv4 embedded in IPv4-compatible (`[::127.0.0.1]`), NAT64
   (`[64:ff9b::7f00:1]`, `64:ff9b:1::/48`) and 6to4 (`2002::/16`) literals; public embedded addresses stay allowed.
8. Travel time accepts any finite positive speed (light-speed cap removed; `Infinity` rejected).
9. `pnpm seed` uses `SEED_PASSWORD` (12–128 chars) or prints a random `generated_password` once.
10. Contract/docs: the website is the Next.js export in `apps/web/out` (no Vite, no `apps/web/dist`); `.env.example`
    `APP_ORIGIN` lists the LAN origin placeholder, `localhost:4000` and `localhost:3000`.

Still not verified: real Gemma/Clef hosts, a browser journey with a wired web client, and the iPhone app.

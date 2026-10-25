# Backend progress

Verification columns: **auto** = automated tests (`pnpm test`: temp DB/media, fake model servers in
`apps/api/test/fixtures/`), **live** = real Gemma/Clef hosts, **browser** = real browser through the one origin,
**iphone** = physical iPhone. `—` = not applicable. `pending` = not run yet (dependency in Notes).

Last updated 2026-10-25 ~16:00 PDT on Siho's Mac (Node v24.2.0, pnpm 9.15.0, macOS 26.5 arm64).

| Step | Status | auto | live | browser | iphone | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 00 Inspect | done | — | — | — | — | Baseline below |
| 01 Inference machines | **blocked** | — | pending | — | — | Gemma/Clef host addresses unknown to the backend agent. `pnpm models:check` + `docs/model-preflight.md` ready |
| 02 Runtime/build | done | pass | — | — | — | Fastify replaces Hono; Prisma/Postgres/Docker removed; built API started and `/api/health/live` answered; migrate from repo root and `packages/db` hit the same DB |
| 03 Contracts | done | pass | — | — | — | `docs/api-contract.md`, `packages/shared` schemas/types/fixtures (fixtures validated by test), `docs/openapi.json` generated (27 paths) |
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
| 14 Clients | not started by backend | — | — | — | — | Web = Vite SPA owned by Frontend Engineer (branch `web/app`); iOS owned by iOS Developer. Contract + fixtures delivered |
| 15 Operations | done (scripts) | partial | — | — | — | setup/start/migrate/seed/smoke/models:check/moderation:*/db:backup/openapi + `docs/operations.md`. Backup restore drill not yet run |
| 16 Release | pending | — | pending | pending | pending | Needs model hosts, browser and phone on the LAN |

## Baseline (step 00, 15:31 PDT)

- Repo `~/Documents/place_holder_name`, branch `cursor/stargaze-monorepo-setup` @ 38290ca; work branch `backend/api`.
- Scaffold: Hono `/health` only; empty Prisma/Postgres + docker-compose; empty `packages/shared`; Next.js placeholder web; XcodeGen iOS shell. No migrations or catalog.
- Catalog from the pinned handoff (`catalog/`, sha256 pinned in `catalog/VERSION.json`).
- No Ollama on this Mac; model hosts' LAN addresses unknown; no physical iPhone reachable by the agent.
- `apps/web` has uncommitted work by another teammate in this working tree; the backend never stages `apps/web`.

## Deviations from the spec / plan

1. **Website origin:** the web team switched to a Vite SPA (branch `web/app`). Instead of a Next.js `/api` rewrite, Fastify
   serves `apps/web/dist` (when present) with `index.html` fallback; the Vite dev server proxies `/api` in development.
2. **APP_ORIGIN** accepts a comma-separated list (e.g. LAN host + `localhost:5173` dev server).
3. **Rate limiting** uses a small in-memory fixed-window limiter instead of `@fastify/rate-limit` (needs per-user keys after
   authentication and pre-hash checks; spec allows in-memory counters).
4. **Connection timeout:** Node `fetch` has no separate connect timeout; each model call has an overall deadline
   (30 s Clef call, 120 s per job, 60 s guide request incl. queue) instead of a distinct 3 s connect timeout.
5. **Node:** spec targets Node 24 LTS; this Mac runs v24.2.0 (OK). `engines` allows ≥ 20.11.
6. **Guide planner:** when the planner calls no tools, its text is discarded and the final streamed call answers
   (keeps one fixed protocol; costs one extra short call).

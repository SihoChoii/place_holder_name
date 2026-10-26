# Stargaze / Star Tagger

Point an iPhone at the sky, claim a star, post a note/photo/link on it, and let friends react and comment.
A companion website shows the same content; an AI star guide answers questions on both.

The implemented website deadline slice includes a live HYG sky, drag/zoom and star previews, observer presets/GPS fallback, public star details, existing-account login/logout, and a full accessible catalog. Signup, social writes, and the guide UI remain deferred. See the [frontend handoff](docs/frontend-execution.md) and [frontend runbook](apps/web/README.md).

```
apps/
  api/     Fastify API (TypeScript, Node 24) — auth, claims, posts, moderation loop, guide SSE; serves the built website
  web/     Next.js website (static export in apps/web/out is served by the API)
  ios/     Native iOS app (XcodeGen)
packages/
  db/      SQLite (better-sqlite3): connection, SQL migrations, moderation-job queries
  shared/  API JSON Schemas, TypeScript types, limits, and response fixtures (TS + Swift)
catalog/   Pinned HYG star catalog (8,920 stars ≤ mag 6.5) + attribution
docs/      API contract, route matrix, OpenAPI, operations, progress/verification
data/      (ignored) database, private photos, backups
```

## Architecture

One API process on the backend laptop (SQLite + private photo directory, one moderation loop) talks to two
LAN inference hosts running Ollama: **Gemma** for the guide (`/api/chat`) and **Clef Flash** for moderation
(`/v1/systemone`). Website and API share one origin (`http://<backend-host>:4000`); the iPhone uses the same base URL.

## Quick start (backend laptop)

Prerequisites: Node 24 LTS (≥ 20 works), pnpm 9 (`corepack enable`). No Docker.

```bash
pnpm setup            # .env (+ generated JWT_SECRET, never overwritten), install, build, migrate
# edit .env: GUIDE_BASE_URL, CLEF_BASE_URL, APP_ORIGIN=http://<backend-lan-host>:4000
pnpm models:check     # real preflight against both model hosts
pnpm start            # API + exported website on 0.0.0.0:4000
pnpm smoke            # fresh end-to-end check against the running stack (real moderation + guide)
```

Docs: [API contract](docs/api-contract.md) · [route matrix](docs/route-matrix.md) · [OpenAPI](docs/openapi.json) ·
[operations runbook](docs/operations.md) · [model preflight](docs/model-preflight.md) · [progress](docs/backend-progress.md) ·
[verification](docs/verification.md) · [spec](docs/backend-implementation-plan.md) · [execution plan](docs/agent-execution-plan.md)

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm setup` | Install/prepare `.env`, dependencies, build, migrations (no Docker, never overwrites `.env`) |
| `pnpm build` / `pnpm start` | Build shared/db/api and export Next.js; start one built API process serving `apps/web/out` and `/api` |
| `pnpm dev:api` | API in watch mode (tsx) |
| `pnpm dev` / `pnpm dev:api` | Turbo watches dependency sources, rebuilds emitted packages, then restarts affected development servers |
| `pnpm typecheck` | TypeScript checks for shared, db, api (incl. tests), and web |
| `pnpm test` | Build the actual website, frontend astronomy/contract tests, then API regression tests using temp DB/media and fake model servers |
| `pnpm test:web` | Focused frontend astronomy and shared-contract checks |
| `pnpm test:web:browser` | Playwright acceptance against the production export and real API in disposable storage; separately identified fixture UI cases |
| `pnpm db:migrate` | Apply unapplied SQLite migrations (same DB from any working directory) |
| `pnpm models:check [--write-lock]` | Real Gemma/Clef capability checks; `--write-lock` records digests in `docs/model-lock.json` |
| `pnpm seed` | Demo users/claims/posts (`demo.*@example.com`); posts stay pending until real moderation |
| `pnpm smoke [url]` | Fresh-data journey against a running stack |
| `pnpm moderation:list` / `moderation:retry <id|--all-failed>` / `moderation:approve <tag> --reason …` | Inspect/retry jobs; audited manual approval |
| `pnpm db:backup [dir]` | SQLite online backup + media copy + manifest |
| `pnpm openapi` | Regenerate `docs/openapi.json` |
| `pnpm ios:gen` | Regenerate the Xcode project |

Catalog data: HYG Database v4.4 (CC BY-SA 4.0), Stellarium constellation lines (CC BY-SA 4.0), IAU WGSN names,
NASA Exoplanet Archive, Wikidata — see `catalog/README.md` and `catalog/VERSION.json`.

Development uses Next.js on port 3000 with `/api` proxied to `API_UPSTREAM` (default `http://127.0.0.1:4000`).
Include that browser origin in `APP_ORIGIN`; custom upstreams can be set with `API_UPSTREAM=http://127.0.0.1:4100 pnpm dev`.
Production serves both website and API on port 4000. Static export is the supported web build; server-only Next.js features require a different hosting arrangement.

Readiness reports models as `unverified` until `pnpm models:check --write-lock` succeeds, and `drift` if a locked
model tag/digest or Ollama version changes. Core API routes remain available. The bounded web D0–D6 slice has its own browser evidence in the frontend handoff. Full ownership-index coverage, remaining web/iOS product flows, and real-model/physical-device acceptance remain separate incomplete gates.

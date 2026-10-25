# Stargaze / Star Tagger

Point an iPhone at the sky, claim a star, post a note/photo/link on it, and let friends react and comment.
A companion website shows the same content; an AI star guide answers questions on both.

```
apps/
  api/     Fastify API (TypeScript, Node 24) — auth, claims, posts, moderation loop, guide SSE; serves the built website
  web/     Website (Vite SPA, owned by the web team; built output in apps/web/dist is served by the API)
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
pnpm start            # API (+ website if apps/web/dist exists) on 0.0.0.0:4000
pnpm smoke            # fresh end-to-end check against the running stack (real moderation + guide)
```

Docs: [API contract](docs/api-contract.md) · [route matrix](docs/route-matrix.md) · [OpenAPI](docs/openapi.json) ·
[operations runbook](docs/operations.md) · [model preflight](docs/model-preflight.md) · [progress](docs/backend-progress.md) ·
[verification](docs/verification.md) · [spec](docs/backend-implementation-plan.md) · [execution plan](docs/agent-execution-plan.md)

## Scripts

| Command | What it does |
| --- | --- |
| `pnpm setup` | Install/prepare `.env`, dependencies, build, migrations (no Docker, never overwrites `.env`) |
| `pnpm build` / `pnpm start` | Build shared/db/api; start one built API process (serves `apps/web/dist` when present) |
| `pnpm dev:api` | API in watch mode (tsx) |
| `pnpm typecheck` | TypeScript checks for shared, db, api (incl. tests) |
| `pnpm test` | Automated integration tests: temp DB/media, fake model servers (test fixtures only) |
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

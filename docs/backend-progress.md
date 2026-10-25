# Backend progress

Verification columns: **auto** = automated tests (temp DB, fake model servers), **live** = real Gemma/Clef hosts,
**browser** = real browser via the one origin, **iphone** = physical iPhone. `—` = not applicable, `pending` = not yet run.

| Step | Status | auto | live | browser | iphone | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 00 Inspect | done | — | — | — | — | See baseline below |
| 01 Inference machines | blocked | — | pending | — | — | Gemma/Clef host addresses unknown; adapters + `models:check` built against fakes |
| 02 Runtime/build | in progress | pending | — | — | — | |
| 03 Contracts | done (v1) | pending | — | — | — | `docs/api-contract.md`, `packages/shared` |
| 04 Database | in progress | pending | — | — | — | |
| 05 Auth | planned | | | | | |
| 06 Catalog/claims | planned | | | | | |
| 07 Visibility | planned | | | | | |
| 08 Posts | planned | | | | | |
| 09 Moderation | planned | | | | | |
| 10 First journey | planned | | | | | |
| 11 Social | planned | | | | | |
| 12 Browse/public | planned | | | | | |
| 13 Guide | planned | | | | | |
| 14 Clients | out of backend scope | | | | | Web is a Vite SPA owned by Frontend Engineer (`web/app`); iOS owned by iOS Developer |
| 15 Operations | planned | | | | | |
| 16 Release | planned | | | | | |

## 00 baseline (2026-10-25 15:31 PDT)

- Machine: Siho's Mac (arm64, macOS 26.5), Node v24.2.0, pnpm 9.15.0, Xcode 26.4.1, xcodegen present, no Ollama.
- Repo `~/Documents/place_holder_name`, branch `cursor/stargaze-monorepo-setup` @ 38290ca, clean except untracked `docs/`
  (the two plan files). Work branch `backend/api` created from it. `origin` push access confirmed (dry run).
- Scaffold: Hono `/health` only; empty Prisma/Postgres + docker-compose; empty `packages/shared`; Next.js placeholder web; XcodeGen iOS shell.
  No migrations or catalog existed. Catalog taken from the pinned handoff (`catalog/`, sha256 pinned in `catalog/VERSION.json`).
- Model hosts: Gemma and Clef laptops' LAN addresses not known yet → step 01 blocked; physical iPhone not available to this agent.
- Change of plan from the spec: the website is a Vite SPA (Frontend Engineer). Fastify serves `apps/web/dist`
  on the same origin instead of a Next.js `/api` rewrite.

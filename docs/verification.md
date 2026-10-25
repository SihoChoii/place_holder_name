# Verification log

Separate rows per evidence type. Nothing below is a live-model, browser, or physical-iPhone result unless the
"Type" column says so.

| When (PDT, approx.) | Type | Command / action | Environment | Result |
| --- | --- | --- | --- | --- |
| 10-25 15:55 | automated | `pnpm typecheck` | Mac, Node 24.2.0 | pass (shared, db, api + tests) |
| 10-25 15:55 | automated | `pnpm build` | Mac | pass |
| 10-25 15:58 | automated | `pnpm test` (11 tests, incl. concurrent claims and SSE over real HTTP with client-disconnect release; fixtures/schemas, SPA serving, migrations/constraints/rollback, guide SSE/tools/scope/limits/failures, guide queue, first journey, post validation, moderation retry/restart, auth) | temp dirs, fake Ollama fixture | 11/11 pass |
| 10-25 15:52 | automated | `pnpm setup`; `pnpm db:migrate` from repo root and from `packages/db` | Mac, real `data/` | same DB path; second run applied nothing |
| 10-25 15:52 | automated | built API `node apps/api/dist/index.js`; `curl /api/health/live`, `/api/health/ready`; SIGTERM | model URLs pointed at a closed port | live ok; ready `degraded` (guide/moderation `unreachable`), core up; clean shutdown |
| 10-25 15:57 | automated | second API on the same data dir | Mac | refused: "Another Star Tagger API (pid …) is already using …" |
| 10-25 15:57 | rehearsal (fake models) | `pnpm smoke http://127.0.0.1:4100` against the built API + `test/fixtures/run-fake-ollama.ts` | temp DB, fake Gemma/Clef | 8/8 steps pass over real HTTP (multipart upload, moderation loop, overlay, public media, SSE) |
| 10-25 15:58 | automated | backup/restore drill: smoke data → `pnpm db:backup` → restore into a separate temp dir → start API on it | temp dirs, fake models | restored post listed in `/api/public/feed`; restored image served (200 image/webp) |
| 10-25 15:58 | automated | `pnpm seed` twice | temp DB | 3 posts first run, 0 second run (repeatable); posts left pending with jobs |
| 10-25 15:59 | automated | Swift: `packages/shared/swift/StarTaggerAPI.swift` decodes all 33 JSON fixtures (`check-fixtures.swift`) | Mac, Xcode 26.4.1 swiftc | all fixtures decode |
| — | live-model | `pnpm models:check` | real Gemma + Clef hosts | **not run** — host addresses unknown |
| — | live-model | `pnpm smoke` with real hosts | — | **not run** |
| 10-25 review fixes | automated | `pnpm typecheck`; `pnpm test` (includes workspace build) | Mac, Node 24.2.0; temporary storage; fake inference hosts | all workspace types/builds pass; 18/18 tests pass, including simultaneous process exclusion/crash recovery, final/Unicode context budgets, private cache headers, identity drift, mapped-IP links, orphan cleanup, and the actual Next.js export over HTTP |
| 10-25 review fixes | browser | root `pnpm dev`, Next.js `/api` rewrite; browser `fetch` signup + cookie `/me`; search Sirius | Bundled Playwright with existing cached Chromium; localhost:3000 → API :4141; temporary storage; desktop 1440×1000 and mobile 390×844 | page title/content correct; signup 201, `/me` 200 with private/no-store; search narrows to Sirius; no browser runtime/console errors; screenshots in `/private/tmp/stargaze-fixed-dev*.png` |
| 10-25 review fixes | browser | actual root `pnpm start`; same-origin website/assets + cookie API; search Sirius | Built Next.js export served by Fastify at 127.0.0.1:4142; temporary storage; cached Chromium | page/assets and interaction pass; signup 201, `/me` 200; no browser errors; screenshots in `/private/tmp/stargaze-fixed-production*.png`. Browser plugin unavailable; bundled Playwright used |
| 10-25 review fixes | development | edit shared constant, observe rebuild/restart and changed API response; restore original; edit DB source marker and restore | `pnpm dev` and `pnpm dev:api`; temporary DBs | changed JWT TTL observed from running API without manual build; DB output rebuilt and API restarted; all temporary source changes restored |
| — | browser | complete application sign-in → claim → post → real moderation → second-user UI journey | — | **not run** — web product flows and real models still required; browser transport checks above do not establish full client integration |
| — | physical iPhone | any | — | **not run** |

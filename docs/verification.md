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
| — | browser | sign-up/login/cookie through the one origin | — | **not run** (web SPA on another branch) |
| — | physical iPhone | any | — | **not run** |

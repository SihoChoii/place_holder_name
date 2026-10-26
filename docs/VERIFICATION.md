# Verification — Stage 1 cutover

Observed locally on Node v26.12.0 (package requirement: Node >=24).

| Check | Observed result | Boundary |
| --- | --- | --- |
| `npm run build` | Pass | TypeScript includes source, evaluator, smoke, and tests |
| `npm test` | 13 tests passed | Skill selection; SSE framing/terminal rules; scenario isolation; simulated planner failure; evidence reset; malformed corrective retry/native answer stream; error vs successful Sirius tool results |
| `npm run smoke` | Pass | Actual loopback HTTP through evaluator protocol endpoint and native Ollama stand-in; tool-result observations and simulated g10 503 |
| `node dist/scripts/smoke.js` | Pass | Compiled tooling follows the same protocol path |
| Compiled package exports | Pass; prompt 56 words, travel instruction selected | Node imported `astral-harness` and `astral-harness/skills` |
| `npm run eval:golden` without configuration | All 12 cases reported blocked | No backend contacted; API_BASE_URL absent |

The smoke endpoint is explicitly a protocol fixture, **not** a backend implementation. It forwards a scripted tool result and proves the tooling can observe that exchange; it does not prove production scope authorization, travel calculations, content visibility, or prompt behavior.

## Corrections found during verification

- Initial integration build found the legacy smoke imports after evaluation files were created outside the repository; files were moved into the intended checkout.
- First HTTP smoke exposed a missing closing brace in its multiline JSON SSE fixture; corrected, then smoke passed.
- Tool evidence no longer counts the stand-in's planner suggestions as backend execution. A tool result must actually return to the model; unknown result names remain unverified.
- Evidence is cleared per case to prevent stale observations from passing a later run. No observed model request is not proof that an empty-scope request offered no tools.
- Golden 6 now scripts malformed responses on both planner attempts, then provides facts on the answer stream. Exactly one non-streaming corrective retry is required.
- Golden 10 requires observed planner failure when using stand-in evidence, not merely a successful Sirius answer.
- The CLI exits unsuccessfully for blocked/unverified results as well as failures; partial evidence is not a green baseline.
- Independent review identified stopped-model evidence availability, named-tool errors, Canopus's catalog ID, loose phrase matching, missing runner deadlines, and remote stand-in binding. Corrected each; smoke also proves unavailable evidence does not prevent the HTTP request.

## External baseline: blocked, not recorded

No nearby backend checkout or authoritative `packages/shared/fixtures/chat.*` files were available. `API_BASE_URL`, `EVAL_COOKIE`, `EVAL_AUTHORIZATION`, `GUIDE_BASE_URL`, and `GEMMA_BASE_URL` were not configured. No authenticated shipped-guide request or real Gemma request was made. No production SSE recordings were fabricated.

Supply the target backend revision, reachable API, dedicated login credentials, seeded catalog/community fixtures, and model address to record the required baseline. Stage 1 expectations deliberately include approval-gated Stage 2 behavior; failures on today's backend are expected baseline information, not permission to wire changes.

## Interpretation limits

The runner separates text/stream checks from execution evidence. Whole-word/phrase checks are signals, not full answer-quality judgments. Cases 2, 3, 7, 8, and 11 remain unverified even with named tool execution until authoritative backend result/fixture assertions establish, respectively: actual 17 km/s calculation, approved-only posts, both comparison stars and numeric provenance, an actual scope denial, and malicious-post exposure without instruction following. The backend result schemas and seed fixtures are not in this checkout; guessing them would create false passes. Cases 4/5 require a named, parseable, non-error get_star result with top-level Sirius name or HYG 32263; unfamiliar result envelopes remain unverified.

A live Gemma run without the stand-in evidence endpoint leaves tool assertions unverified. A real stopped-model golden 10 also needs operator/backend failure evidence; the local simulated 503 is labeled separately. No 12/12 backend acceptance claim is made.

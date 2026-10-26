# Deployment and evaluation

## Backend, not plugin deployment

Do not register an Astral Fastify plugin or apply an Astral schema. Stage 1 is standalone review assets and HTTP evaluation tooling. The existing backend serves the authenticated `POST /api/agent/chat` route and owns all configuration, limits, tools, moderation, and persistence.

Backend configuration from the updated plan:

```sh
GUIDE_BASE_URL=http://<model-host>:11434
GUIDE_MODEL=gemma4:e4b-it-q4_K_M
GUIDE_TIMEOUT_MS=<backend-approved-timeout>
```

Use the native Ollama origin, **not** a `/v1` root. The backend appends `/api/chat`; `GEMMA_*` aliases and `GUIDE_THINK` are backend-owned. Keep Clef configuration with the backend moderation service; this harness does not call it. Confirm exact defaults against the target backend revision.

Model services must remain server-only: clients call the authenticated API, never the model port. Restrict model-host network access to the backend machine and keep credentials out of request bodies, recordings, and committed documentation.

## Build and check local assets

```sh
npm ci
npm run build
npm test
npm run smoke
```

The local smoke checks the evaluation protocol and stand-in, not an implementation of the production guide. It cannot establish shipped-backend acceptance. Native stand-in requests are deterministic fixtures, not measurements of Gemma quality.

## Evaluation commands

```sh
# Terminal 1: loopback-only native Ollama stand-in.
npm run eval:standin

# Configure the separately running backend with
# GUIDE_BASE_URL=http://127.0.0.1:11555, then evaluate its real HTTP route.
API_BASE_URL=http://127.0.0.1:3000 \
EVAL_COOKIE='<dedicated-user-session-cookie>' \
STANDIN_EVIDENCE_URL=http://127.0.0.1:11555 \
EVAL_ENVIRONMENT='backend-<actual-commit>-standin' \
npm run eval:golden
```

`API_BASE_URL` is the backend origin. Authentication can instead use
`EVAL_AUTHORIZATION='Bearer <token>'`; credentials are evaluation-process
environment variables, never golden request fields. Avoid storing shell
history containing real credentials; inject them through your secret manager.

For real Gemma, point the backend at the real model and omit
`STANDIN_EVIDENCE_URL`. Tool assertions without observations remain
**unverified** even when the text looks correct.

`EVAL_RECORD_DIR` opts into sanitized result recordings; use the ignored
`harness/evals/recordings/` directory. No recordings means no persistent
baseline artifact. `EVAL_ENVIRONMENT` labels the target, not proof of its
identity. `PORT` changes the stand-in port (default 11555).
`STANDIN_G10_MODE=503` enables explicitly simulated planner failure;
`STANDIN_SCENARIOS=1,2` limits the stand-in's selected scenarios.
`EVAL_GOLDEN=10` selects only golden 10 (any single ID from 1 through 12 is
accepted). Use this when testing a stopped model; keep the API running.
`STANDIN_HOST` optionally binds a specific private interface when the backend
is on another host. Default is loopback; restrict that interface's port to
the backend and evaluator, never the public internet.
Chat requests/streams have a 70-second runner deadline; evidence calls have
a five-second deadline. Missing evidence does not prevent the HTTP check.
Blocked, failed, or unverified cases produce a nonzero CLI exit status.


## External baseline prerequisites

A real baseline needs all of the following:
1. A running backend revision identified by its actual commit, with catalog data including the scenario stars.
2. A login session or authorization credential for a dedicated evaluation user. Twelve cases consume twelve of the user's thirty hourly requests; repeated full runs will hit the rate limit.
3. For scripted cases, the backend configured to use the stand-in's native Ollama URL and accessible from the backend host.
4. Approved and non-approved community content, including the injection scenario, seeded through the backend's existing fixtures/admin process. This repository neither writes application data nor creates a migration.
5. Backend model traces, or stand-in observations of actual tool results, for assertions that cannot be established from final text.

The stand-in's default listener must not be exposed publicly. Fixture/control endpoints are local evaluation infrastructure, never production model APIs. Do not share a scripted stand-in between concurrent baseline runs.

For golden 10, stop the stand-in while leaving the backend running, unset `STANDIN_EVIDENCE_URL`, and run with `EVAL_GOLDEN=10`. This verifies the text/stream path; tool/failure evidence remains unverified. For observable simulated failure, restart with `STANDIN_G10_MODE=503` and keep the evidence URL configured. A normal stand-in does not inject an outage, so golden 10 is unverified in that configuration. Stage 1's existing backend may return `guide_unavailable` rather than the Stage 2 template; record that as a failure, not a successful template baseline.

## Merge gates

Siho reviews Stage 1 text and decides merges. Do not wire these assets into `apps/api/src/guide/service.ts` before explicit Stage 2 approval and rebasing on `backend/api` after the other agent's fixes have been pushed. No old backend snapshot is an approved integration base.

Blurb caches, sessions, new audio routes/events, and per-user concurrency limits remain deferred. The requested Wikipedia and xAI voice helpers are now available as opt-in package exports, without modifying the backend or its frozen protocol. Computer 3 needs outbound internet access to Wikipedia and xAI; Gemma still runs over Tailscale using the native Ollama origin. Configure `XAI_API_KEY` only on the server. See [summary skills](SUMMARY_SKILLS.md) for the full setup and audio delivery contract.

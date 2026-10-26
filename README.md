# Astral Harness

Stage 1 assets for **Star Tagger Place: Custom Harness Design Plan**, revised October 25, 2026, 4:50 PM PDT. The backend already owns the guide. This repository does **not** register routes, create tables, moderate posts, or replace the backend.

## Scope

- `src/guide/prompt.ts`: standalone prompt text, not wired into the backend.
- `src/guide/skills.ts`: one deterministic regex-selected travel, community, comparison, or default instruction, not wired.
- `harness/evals/`: twelve HTTP golden scenarios, an Ollama-native stand-in, stream fixtures, and evaluation tooling.

The superseded Fastify plugin, OpenAI-compatible model client, extra SSE events, memory/cache, draft tools, moderation pipeline, and prewarming were removed. Old plugin imports and commands are intentionally unsupported. There is no compatibility shim and no backend migration.

## Local verification

Requires Node 24 or newer.

```sh
npm ci
npm run build
npm test
npm run smoke
```

The smoke uses local protocol fixtures and the stand-in. It is **not** a baseline against the shipped backend or proof of Gemma performance. See [verification evidence](docs/VERIFICATION.md) for observed results and missing prerequisites.

## Frozen backend contract

Clients authenticate with the existing backend and call `POST /api/agent/chat`:

```json
{
  "messages": [{ "role": "user", "content": "What is this bright star?" }],
  "mode": "local",
  "scope_hyg_ids": [32263, 30365],
  "selected_hyg_id": 32263
}
```

`messages` has 1–6 user/assistant messages, 1–2,000 characters each, ending in a user message. Body limit: 32 KiB. Unknown fields are rejected. `mode` is required. Local scope contains at most 200 star IDs; a local selected star must be in scope. Explore mode uses the whole catalog and does not send local scope. No client type, model name, URL, system message, or feature flags belong in the body.

Only `start`, `delta`, `done`, and `error` SSE events exist. `start` and `done` carry the same `request_id`; `delta` carries `text`. `done` means success, never recovery after an error. Before streaming, errors are JSON: 400, 401, 429, 503 (`guide_busy`/`guide_unavailable`), or 504 (`guide_timeout`). After start, errors use `guide_unavailable`, `guide_timeout`, or `internal_error`. Cards come from REST, not SSE.

The backend owns a global queue of one active plus two waiting, a 60-second deadline including queue time, disconnect cancellation, and 30 requests per user per hour. No per-user one-at-a-time cap is added here.

The three read-only tools are `get_star`, `calculate_travel_time` (km/s, constant speed, no relativity), and `get_star_content` (two approved posts, anonymous viewer). At most three calls in one round. Local tools reject out-of-scope stars. Conversation history remains client-supplied; no server memory is introduced.

## Integration boundary

Stage 1 files are reviewable deliverables, not active backend behavior. Siho decides what merges. Stage 2 must be based on `backend/api` **after** the competing fixes have been pushed, with Siho's approval—not the old `e998709` or master `c395a75` snapshots.

Stage 2 only: wire prompt/skills into `buildMessages`, repair leaked/string tool calls, make one corrective retry, strip template tokens safely across stream chunks, offer no tools for an empty local scope, and add a selected-star catalog template on planner failure. None of those changes is wired here. Golden failures in these cases are meaningful baseline results, not a reason to weaken expectations.

Deferred: blurb cache, sessions, xAI voice/speak routes, extra SSE events, extra/draft tools, relativistic travel, per-user concurrency cap. Moderation remains the backend's durable Clef job queue responsibility.

See [architecture](docs/ARCHITECTURE.md) and [deployment/evaluation](docs/DEPLOYMENT.md).

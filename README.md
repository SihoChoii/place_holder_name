# Astral Harness

Stage 1 assets for **Star Tagger Place: Custom Harness Design Plan**, revised October 25, 2026, 4:50 PM PDT. The backend already owns the guide. This repository does **not** register routes, create tables, moderate posts, or replace the backend.

## Scope

- `src/guide/prompt.ts`: standalone prompt text, not wired into the backend.
- `src/guide/skills.ts`: deterministic speech, Wikipedia, travel, community, comparison, or default instructions; the host opts into the new tools explicitly.
- `harness/evals/`: twelve HTTP golden scenarios, an Ollama-native stand-in, stream fixtures, and evaluation tooling.
- `src/guide/summaries.ts`: executable Wikipedia lookup, Gemma blurb rewriting, and xAI MP3 synthesis helpers, exported as `astral-harness/summaries`.

The superseded Fastify plugin, OpenAI-compatible model client, extra SSE events, memory/cache, draft tools, moderation pipeline, and prewarming were removed. Old plugin imports and commands are intentionally unsupported. There is no compatibility shim and no backend migration.

## Local verification

Requires Node 24 or newer.

```sh
npm ci
npm run build
npm test
npm run smoke
npm run smoke:summary
```

The smoke uses local protocol fixtures and the stand-in. It is **not** a baseline against the shipped backend or proof of Gemma performance. See [verification evidence](docs/VERIFICATION.md) for observed results and missing prerequisites.

Verified locally on Node v24.22.1: the build, all 34 tests, the original HTTP protocol smoke, and the new summary HTTP smoke (source and compiled) pass. The compiled Wikipedia helper also fetched the live Vega article successfully. Gemma rewriting and xAI audio were exercised with local HTTP fixtures, not live model/voice credentials.

## Prompt and skill exports

After building, the package exposes the review assets:

```ts
import { SYSTEM_PROMPT } from 'astral-harness';
import { skillFor } from 'astral-harness/skills';

const instruction = skillFor('How long to get there?');
```

The system prompt is unchanged. After registering the new handlers, enable their instructions with `skillFor(message, { summaryTools: true })`: explicit speech and Wikipedia/blurb requests then take precedence over travel → community → compare → default. Without that opt-in, the original topic selection remains unchanged and never instructs the model to call unavailable summary tools. Travel still uses 17 km/s and states constant speed without relativity.

## Wikipedia blurbs and spoken summaries

```ts
import { createSummaryTools, summaryOptionsFromEnv } from 'astral-harness/summaries';

const tools = createSummaryTools(summaryOptionsFromEnv());
const result = await tools.summarize_star('Vega', { audio: true });
console.log(result.blurb, result.source.url);
// result.audio is { bytes: Uint8Array, mimeType: 'audio/mpeg' }, or null.
// The host delivers these bytes to its client; no new HTTP/SSE route is installed.
```

`get_wikipedia_summary(name)` returns the Wikipedia extract; the model rewrites it, rather than the lookup tool pretending to generate a blurb. `speak_summary(text)` calls the paid xAI voice API with the finished text. `summarize_star` connects the steps, defaults to text-only, and preserves the blurb if requested audio fails. No content-verification or trust-processing pipeline is added for this demo.

See [summary skills](docs/SUMMARY_SKILLS.md) for configuration, direct helper calls, tool declarations, audio delivery, and errors.


## HTTP golden evaluations

Start the native Ollama stand-in in one terminal:

```sh
npm run eval:standin
```

It listens on `http://127.0.0.1:11555` by default. Configure the separately running backend with that `GUIDE_BASE_URL`—not a `/v1` URL—then evaluate the backend's authenticated route:

```sh
API_BASE_URL=http://127.0.0.1:3000 \
STANDIN_EVIDENCE_URL=http://127.0.0.1:11555 \
EVAL_ENVIRONMENT=local-backend-standin \
npm run eval:golden
```

Supply a dedicated user's session through `EVAL_COOKIE`, or an authorization header through `EVAL_AUTHORIZATION`, using your secret manager. Neither credential belongs in the request fixture or committed files. A full run makes twelve chat requests against the backend's thirty-per-hour user limit.

The twelve scenarios cover selected-star answers, travel, approved community content, leaked and malformed tool calls, comparison, scope denial, empty scope, planner failure, post injection, and app-only claiming. `EVAL_GOLDEN=10` selects a single case; `EVAL_RECORD_DIR=harness/evals/recordings` opts into sanitized result summaries.

The runner checks SSE framing and answer text separately from tool observations. Planner suggestions do not count as executed tools, and evidence resets before each case. Missing or unreachable evidence does not prevent the HTTP check. Any failed, blocked, or unverified case produces a nonzero exit status.

**No external baseline has been recorded:** the backend URL, login credentials, model address, and authoritative backend fixtures were unavailable. Cases 2, 3, 7, 8, and 11 remain unverified even with tool execution observed until backend fixture/result assertions establish their full semantics. A successful text check alone is not a golden acceptance pass.

For golden 10, either:

- Start the stand-in with `STANDIN_G10_MODE=503` and retain the evidence URL for an observable, explicitly simulated planner failure.
- Stop the stand-in, keep the backend running, unset `STANDIN_EVIDENCE_URL`, and run with `EVAL_GOLDEN=10`. Text/stream checks still run, but failure evidence remains unverified.

A normal stand-in does not inject an outage, so golden 10 is unverified in that configuration. For real Gemma, point the backend at the real model and omit the stand-in evidence URL. See [deployment/evaluation](docs/DEPLOYMENT.md) for configuration, remote binding, recording limits, and baseline prerequisites.

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

Deferred: blurb cache, sessions, voice/speak HTTP routes, extra SSE events, draft tools, relativistic travel, per-user concurrency cap. The requested Wikipedia/voice helpers now exist as opt-in executable exports; registering them in the separately owned backend remains an explicit host integration. Moderation remains the backend's durable Clef job queue responsibility.

See [architecture](docs/ARCHITECTURE.md) and [deployment/evaluation](docs/DEPLOYMENT.md).

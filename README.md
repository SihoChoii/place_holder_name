# Astral Harness

`astral-harness` is the bounded TypeScript agent harness for Star Tagger. It is a Fastify plugin, not a standalone server. The host application owns authentication, SQLite, catalog and application reads; the harness owns request validation, routing, tool authorization, model calls, persistence of agent state, and the SSE response.

The package requires Node 24 or newer. It speaks to an OpenAI-compatible Guide endpoint (Gemma through Ollama) and can optionally call a Clef System One endpoint for moderation and skill selection. Speech is **script-only** in the current harness: the terminal `speech` SSE event always has `audio_url: null`. Clients render or speak the `script`; no `/agent/speak`, audio cache, or xAI integration is provided here.

## Local verification

```sh
npm ci
npm run build
npm test
npm run smoke
npm run eval:mock
```

These commands cover the package build, unit suite, HTTP smoke path, and deterministic 20-case fixture evaluation. They do not start a production server: a host must register the plugin and supply its backend dependencies.

The operational runners below are checked-in local tooling. Running one is not evidence of a deployed model or an end-to-end client integration.

```sh
# Requires a trusted local BackendReads/SQLite adapter. The default export must
# be PrewarmOptions: { db, backend, config, fetch?, wikipedia?, limit? }.
npm run prewarm -- --adapter /absolute/path/to/backend-agent-adapter.js

# Deterministic 20-case golden evaluation using fixture backend and mock models.
npm run eval:mock

# Fixture backend with a real Guide endpoint from the environment.
GUIDE_BASE_URL=http://<computer-1-tailscale-ip>:11434/v1 \
GUIDE_MODEL=<served-model> \
npm run eval:live

# Or evaluate through a trusted local adapter whose default export satisfies
# AgentOptions: db, backend, authenticate, getUserId, config, plus optional
# fetch, now, headersForUser, and close.
npm run eval:live -- --adapter /absolute/path/to/backend-agent-adapter.js

# Create sanitized fixture recordings, then replay the newest recording.
AGENT_RECORD=true npm run eval:mock
npm run eval:replay

# Clef is an origin, not a /v1 URL.
CLEF_BASE_URL=http://<computer-2-tailscale-ip>:11434 \
CLEF_MODEL=clef-flash \
npm run check:clef
```

`AGENT_RECORD=true` is permitted only for fixture-backed `eval:mock` without an adapter. The live evaluator reports valid allowed-tool-call cases over cases that expect a tool call, and exits unsuccessfully below 85%. The replay runner consumes the newest sanitized JSONL recording under `src/agent/evals/recordings/`. See [Known integration gaps](#known-integration-gaps).

## Registering the plugin

Register the plugin once on the Fastify instance that owns the backend. The plugin's internal route is `POST /agent/chat`; registering with `prefix: '/api'` exposes `POST /api/agent/chat`.

```ts
import Fastify from 'fastify';
import Database from 'better-sqlite3';
import {
  agentRoutes,
  configFromEnv,
  type BackendReads,
} from 'astral-harness';

const app = Fastify();
const db = new Database('star-tagger.sqlite');

// Implement every read below against the host's authenticated data layer.
const backend: BackendReads = createBackendReads();

await app.register(agentRoutes, {
  prefix: '/api',
  db,
  backend,
  authenticate: app.authenticate,
  // `user` is the host application's authenticated request decoration.
  getUserId: (request) => request.user.id,
  config: configFromEnv(),
});
```

`authenticate` is a Fastify `preHandler` hook. `getUserId` must return the authenticated principal's stable user ID, never a client-supplied ID. The `request.user` decoration in the example is host-specific; adapt that line to the host's authentication type. The plugin loads the catalog during registration, so `backend.catalog()` must be usable at startup.

## BackendReads contract

The host MUST provide all methods below. Each is read-only, receives the request abort signal as its final argument, and MUST honor that signal. The host enforces data visibility: return approved content plus only the caller's own pending content. The harness applies additional local-view filtering after a tool returns.

| Method | Required behavior and return shape |
| --- | --- |
| `starFacts(hygId, userId, signal)` | Return `StarFacts` or `null`: core card data (`hyg_id`, `name`, `mag`, `distance_ly`, `claim_state`), optional owner/display and claim dates, plus optional `spectral_type` and scalar `facts`. Do not expose `owner_user_id` to a client. |
| `travelTime(hygId, speedC, userId, signal)` | Return `Travel` or `null`: `speed_c`, `earth_years`, `ship_years`, and `years_lost`. |
| `viewContent(hygIds, userId, signal)` | Return `StarContent[]`, each `{ hyg_id, tags }`; each tag is `{ id, author_id, display_name, note, status }` and follows caller visibility. |
| `exploreSearch(q, limit, userId, signal)` | Return `StarSummary[]`, each `{ hyg_id, name, mag }`. |
| `starDetail(hygId, userId, signal)` | Return `StarDetail` or `null`: `{ facts: StarFacts, content: StarContent }`. |
| `nextClaimAt(userId, signal)` | Return an epoch-millisecond timestamp or `null`. |
| `listComments(tagId, userId, limit, signal)` | Return `Comment[]`: `id`, `tag_id`, `author_id`, `display_name`, `body`, `status` (`approved`, `pending`, or `rejected`), and `created_at`. |
| `communityFeed(limit, signal)` | Return approved `CommunityItem[]`: `tag_id`, `hyg_id`, `display_name`, `note`, `created_at`, and `status: 'approved'`. This call has no user ID. |
| `tagTarget(tagId, userId, signal)` | Return `{ hyg_id }` or `null`; it authorizes tag-scoped local-view checks before a tool uses the tag. |
| `catalog(signal)` | Return the complete read-only `CatalogStar[]` at startup and for prewarming: `StarSummary` plus `ra_deg`, `dec_deg`, `distance_ly`, and optional `spectral_type`, `luminosity_solar`, and `exoplanets`. |
| `claimedStars(userId, limit, signal)` | Return the caller's `StarSummary[]` for prompt context. |

All timestamps are epoch milliseconds. `hyg_id` values are non-negative integers. `limit` values are controlled by harness schemas; implementations should still defensively bound them. A missing catalog, an unavailable read, an unchecked user ID, or a helper that ignores cancellation is an integration error, not a reason to substitute invented data.

## HTTP and SSE protocol

Send `POST /api/agent/chat` when registered as above (otherwise `POST /agent/chat`). The request body is strict: unknown fields are rejected. Only the final `user` message is used; conversational context is loaded from harness memory.

```json
{
  "messages": [{ "role": "user", "content": "How far is Vega?" }],
  "context": {
    "client": "ios",
    "mode": "local",
    "hyg_id": 91262,
    "hyg_ids": [91262, 69451],
    "lat": 37.77,
    "lon": -122.42,
    "ts_ms": 1761431400000,
    "demo": false
  }
}
```

`messages` allows at most 50 entries; each content string allows at most 2,000 characters. `hyg_ids` allows at most 200 unique non-negative integers. Local mode requires `hyg_ids`, and a local `hyg_id` must be in that array. A web client is always normalized to `explore` mode.

The server emits SSE frames as `event: <name>` followed by JSON `data`:

| Event | Data |
| --- | --- |
| `start` | `{ request_id }`; emitted first by the HTTP route. |
| `meta` | `{ request_id, mode, client, skill, queued_position }`. |
| `tool` | `{ name, status }`, where status is `start`, `end`, or `blocked`. |
| `card` | A fact card or a draft card. A fact card has card fields plus `source: 'live' | 'cache' | 'template'`. A draft card is `{ kind: 'draft', action: 'claim' | 'tag' | 'comment', hyg_id, requires_confirmation: true }` with action-specific optional `tag_id`, `note`, `body`, `state`, `retry_after_seconds`, and moderation `verdict`. Drafts are proposals only; they do not write application data. |
| `delta` | `{ text }`; terminal text is chunked for display. |
| `speech` | `{ speech_id, script, voice, audio_url: null }`; script-only by design. |
| `error` | `{ code, message, retry_after_seconds? }`; supported codes are `model_unavailable`, `timeout`, `rate_limited`, `in_flight`, `queue_full`, and `bad_context`. |
| `done` | `{ reason: 'complete' | 'fallback' }`; terminal stream event. |

Before streaming, the route may return HTTP `400` (`bad_context`), `409` (`in_flight`), `429` (`rate_limited`, with `Retry-After` and `retry_after_seconds`), or `503` (`queue_full`). Authentication behavior is supplied by the host's hook.

## Configuration

| Variable | Required | Meaning |
| --- | --- | --- |
| `GUIDE_BASE_URL` | Yes | Absolute HTTP(S) OpenAI-compatible root, ending exactly in `/v1`; for example `http://<computer-1-tailscale-ip>:11434/v1`. Do not include `/chat/completions`. |
| `GUIDE_MODEL` | Yes | Non-empty served Guide model name. |
| `CLEF_BASE_URL` | No | Absolute HTTP(S) Clef **origin** with no path; for example `http://<computer-2-tailscale-ip>:11434`. The client appends `/v1/systemone`. Unset means rule moderation remains available and model moderation returns `pending`. |
| `CLEF_MODEL` | No | Clef model name; defaults to `clef-flash`. |
| `AGENT_MAX_TOKENS` | No | Integer 1–4096; defaults to 220. |
| `GEMMA_TIMEOUT_MS` | No | Integer 1–120000; defaults to 20000. |
| `AGENT_QUEUE_DEPTH` | No | Integer 1–64; defaults to 8. |
| `AGENT_TOOL_TIMEOUT_MS` | No | Integer 1–30000; defaults to 2000. |
| `AGENT_CONCURRENCY` | No | May only be `1`; any other configured value is rejected. |

## Known integration gaps

- This repository does not include the host backend, its catalog implementation, a production SQLite database, or concrete `BackendReads` adapters.
- No actual computer-1 or computer-2 Tailscale IPs, hostnames, or serving ports are committed here. Supply them through deployment configuration; do not publish them to browser, iOS, or public configuration.
- The source contains a script-only `speech` event. `/agent/speak`, audio URLs, audio caching, xAI credentials, and a TTS transport are not implemented by this package.
- The checked-in prewarm CLI requires a trusted local module whose default export is `PrewarmOptions`; it cannot infer the host database or `BackendReads` implementation. Live eval can use the fixture backend with environment-provided Guide settings or a trusted `AgentOptions` adapter.
- Clef routing is optional. When configured, the plugin asks Clef to choose among eligible authored skills within its routing deadline; an unavailable, invalid, or timed-out choice falls back to deterministic routing. `check:clef` tests Clef moderation and direct routing classification, not a complete host deployment.
- No deployed endpoint, live model check, prewarm, eval, or Tailscale reachability result is claimed by these docs.

For internal flow, cancellation, and deployment boundaries, see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

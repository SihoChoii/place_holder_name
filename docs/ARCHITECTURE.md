# Architecture

## Boundary and request flow

The harness is a Fastify plugin. It deliberately has no HTTP server, authentication implementation, catalog client, or application mutation API. The host supplies SQLite, `BackendReads`, an authentication pre-handler, and a way to obtain the authenticated user ID.

On `POST /agent/chat`, the plugin:

1. strictly parses the request body and normalizes web requests to `explore` mode;
2. rejects a second in-flight request from the same user and applies the per-user sliding-window limit;
3. creates one request-scoped `AbortController`, builds `RequestCtx`, and selects a skill with deterministic safety/mode precedence plus an optional bounded Clef choice among eligible authored skills;
4. sends `start`, then streams the async generator as SSE;
5. closes the raw response and releases all per-request state in `finally`.

The host normally registers with an `/api` prefix, so clients use `/api/agent/chat`; the plugin itself defines `/agent/chat`.

## Queueing and bounded loop

The plugin has two FIFO limiters, each with concurrency fixed at one and configurable queue depth:

- **Admission limiter.** A request that needs a model skill reserves a ticket before SSE begins. If no ticket is available, the route returns `503 queue_full`. Cache-only taps, deterministic routes, and demo requests avoid admission.
- **Guide limiter.** The model client serializes Guide calls independently. A ticket is acquired immediately before the loop's model work and released on every exit path.

The loop yields `meta`, eagerly reads a tapped star when applicable, and can emit its live or cached card before narration. It then assembles prompt context and executes at most four model rounds. Calls are capped across eager and model-requested tools. The final round removes tools and asks the model to answer using what it already has. The Guide call is non-streaming; response text is chunked into `delta` events after a terminal answer is accepted.

A malformed model response gets one repair prompt. A second malformed response, unavailable model, timeout, failed prompt assembly, invalid numeric provenance, or exhausted loop produces a fallback card/text and `done: fallback` rather than an unbounded retry.

## Guard and tool authority

The model never receives direct access to backend methods. The registry publishes only tools allowed by all of:

- the selected skill;
- the request mode (`local` or `explore`);
- the client (`ios` or `web`); and
- non-internal access.

Every attempted model tool call passes the guard. The guard increments the request call budget, finds the allowlisted tool, validates arguments with the tool schema, applies a per-tool deadline, and caches successful read results for the same normalized arguments. For local mode it checks every declared star ID against `context.hyg_ids`; tag-scoped tools first resolve `tagTarget` and then apply the same in-view constraint. A blocked, invalid, timed-out, or failing tool becomes a compact error result for the model, not an exception that opens a new access path.

The backend is a second authorization layer. `BackendReads` receives the authenticated user ID and must enforce application visibility, including approved content and only the caller's own pending content. Draft cards are proposals with `requires_confirmation: true`; the harness has no autonomous write path. Web requests are forced to `explore`, and web-visible tool sets exclude draft operations.

## Provenance and untrusted data

Facts come from registered tools and backend reads. Tool output is copied, compacted to a bounded model payload, and added to a numeric ledger. Before the loop emits model text, the ledger checks quantitative claims against known tool values. A mismatch fails closed to fallback rather than presenting model-invented measurements.

Prompts label user and application-derived text as untrusted data. The harness does not fetch user-provided URLs. The prewarm path may retrieve Wikipedia summaries only for catalog names and stores those as static knowledge; the live agent reads stored knowledge rather than fetching web content.

## Memory

All memory is SQLite in the backend-owned database; there is no vector store.

- `agent_sessions` and `agent_messages` preserve scoped conversational turns. Scope is `web`, `local`, `explore`, or `star:<hyg_id>`. Local retrieval only uses messages whose referenced stars remain in the current view.
- `user_prefs` supplies units, speed, language, and voice. `user_recent_stars` provides recent context.
- `star_knowledge` stores static catalog-derived facts and optional prefetched Wikipedia text. `star_blurbs` stores generated fallback narration.
- `speech_scripts` stores the emitted text script (at most 600 characters). There is no audio table in the checked-in schema.
- `community_digest` supports approved community summaries.

Terminal successful answers save only the user message, assistant text, selected-star references, and bounded session data. Tool results themselves are not persisted as conversation turns. Fallback answers do not update session memory.

## Moderation and fail-closed behavior

Draft comment moderation runs deterministic rules first. A rules rejection is immediately rejected. If no Clef endpoint is configured, if Clef times out, or if Clef returns an unusable transport/protocol result, the result is `pending`, not approved. This preserves the host's review boundary while still allowing the client to show a pending draft.

The request path also fails closed:

- invalid request shape becomes pre-stream `400 bad_context`;
- per-user concurrency becomes `409 in_flight`;
- rate saturation becomes `429 rate_limited` with retry information;
- queue saturation becomes `503 queue_full`;
- model/tool failures become an `error` event when applicable, followed by cache/template fallback;
- a tool cannot expand its scope after a model request;
- speech is rendered as a script with `audio_url: null`, so no hidden TTS side effect occurs.

## Cancellation and shutdown

The route attaches its controller to both request abort and raw-response close. It passes the same signal into routing, backend reads, tool deadlines, and Guide calls. If a client disconnects, the generator stops writing, queued model admission is cancelled/released, and the per-user active entry is removed in `finally`.

Backpressure is respected: an SSE frame waits for the raw response `drain` event rather than buffering arbitrary output. On Fastify shutdown, the plugin aborts every active controller, clears the active map, stops the digest job, and permits a future registration on another Fastify instance. No terminal SSE event is fabricated after a disconnected client.

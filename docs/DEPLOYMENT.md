# Deployment

## Three-computer topology

| Computer | Role | Network exposure |
| --- | --- | --- |
| **Computer 1** | Runs Ollama and the Guide/Gemma model. | Accept model requests only from computer 3 over Tailscale. |
| **Computer 2** | Runs Ollama and the Clef model. | Accept Clef System One requests only from computer 3 over Tailscale. |
| **Computer 3** | Runs the Fastify backend, this plugin, SQLite, and client-facing `/api` routes. | Receives authenticated client traffic. It is the only computer that initiates Guide and Clef model requests. |

Clients—iOS, web browsers, and other untrusted devices—MUST call computer 3's authenticated backend. They MUST NOT receive a model-host Tailscale URL, a model port, or an Ollama service credential/configuration value.

The actual Tailscale machine names, IPs, and model service ports are deployment inputs; none are recorded in this repository. Replace the placeholders below with operator-controlled values.

## Operator prerequisite: least privilege first

Before starting the backend, the Tailscale operator MUST:

1. verify all three machines are in the intended tailnet and record the computer-1 and computer-2 Tailscale IPs;
2. create or verify ACL/grant rules permitting **only computer 3** to reach computer 1 and computer 2 on the selected Ollama TCP port (normally `11434`);
3. deny direct model-port access from web clients, iOS devices, guest devices, and the public internet;
4. avoid broad `0.0.0.0` binding for a model service when a Tailscale-address binding is available; and
5. make the backend's client-facing authentication and network policy independent of the model-host ACLs.

Do not use a Tailscale `serve` or public funnel for either model host. These model URLs are server-only configuration.

## Bind Ollama to the Tailscale interface

On each model computer, find its own Tailscale IP and bind Ollama to that address. For example, on computer 1:

```sh
tailscale ip -4
OLLAMA_HOST=<computer-1-tailscale-ip>:11434 ollama serve
```

Use the equivalent binding on computer 2:

```sh
tailscale ip -4
OLLAMA_HOST=<computer-2-tailscale-ip>:11434 ollama serve
```

If Ollama is managed by systemd or another supervisor, set `OLLAMA_HOST` in that service's environment rather than only in an interactive shell, then restart through the operator's normal service procedure. Confirm that the bound address is the machine's Tailscale address—not a public or all-interface bind—before allowing computer 3.

## Configure computer 3

The Guide client and Clef client intentionally use different URL shapes:

```sh
# OpenAI-compatible root; MUST end in /v1.
export GUIDE_BASE_URL=http://<computer-1-tailscale-ip>:11434/v1
export GUIDE_MODEL=<guide-model-served-by-ollama>

# Clef origin; MUST contain no path. The client appends /v1/systemone.
export CLEF_BASE_URL=http://<computer-2-tailscale-ip>:11434
export CLEF_MODEL=clef-flash

# Optional harness limits; shown with their defaults.
export AGENT_MAX_TOKENS=220
export GEMMA_TIMEOUT_MS=20000
export AGENT_QUEUE_DEPTH=8
export AGENT_TOOL_TIMEOUT_MS=2000
export AGENT_CONCURRENCY=1
```

`GUIDE_BASE_URL` is valid only as an absolute HTTP(S) URL ending in `/v1`; do not append `/chat/completions`. `CLEF_BASE_URL` is valid only as a bare origin; do not append `/v1`, `/v1/systemone`, credentials, queries, or fragments. `AGENT_CONCURRENCY` is intentionally fixed to one and is rejected if set to another value.

Register the Fastify plugin with the backend's `/api` prefix. The plugin defines `/agent/chat`, yielding the externally served `POST /api/agent/chat`. Computer 3 supplies the same SQLite database and authenticated `BackendReads` implementation used by the application. The catalog must be available during plugin registration.

## Operational commands

Run commands from the `astral-harness` directory. These are integration commands, not proof that a deployment or model is available.

### Build and local tests

```sh
npm ci
npm run build
npm test
```

### Prewarm

Prewarming requires a trusted local adapter that provides the backend database and complete `BackendReads` implementation; it is not safe to point a browser at this task.

```sh
npm run prewarm -- --adapter /absolute/path/to/backend-agent-adapter.js
```

The adapter module's default export MUST be `PrewarmOptions`:

```ts
{
  db,             // better-sqlite3 database
  backend,        // BackendReads
  config,         // AgentConfig, including Guide URL and model
  fetch?,         // optional fetch implementation
  wikipedia?,     // optional boolean
  limit?,         // optional number
}
```

The runner populates trusted static knowledge and narration cache from the host catalog. It prints `{ requested, cached, failed }`; it does not synthesize audio.

### Evals

```sh
# Deterministic 20-case golden fixtures with mock Guide and Clef servers.
npm run eval:mock

# Fixture backend against a real Guide endpoint from the environment.
GUIDE_BASE_URL=http://<computer-1-tailscale-ip>:11434/v1 \
GUIDE_MODEL=<guide-model-served-by-ollama> \
npm run eval:live

# Or use a trusted host adapter. Its default export satisfies AgentOptions:
# db, backend, authenticate, getUserId, config; optionally fetch, now,
# headersForUser, and close.
npm run eval:live -- --adapter /absolute/path/to/backend-agent-adapter.js

# Fixture-only sanitized recording, followed by replay of its newest JSONL file.
AGENT_RECORD=true npm run eval:mock
npm run eval:replay
```

The live evaluator reports valid allowed-tool-call cases divided by cases expecting a tool call, and exits unsuccessfully below 85%. `AGENT_RECORD=true` is allowed only for `eval:mock` without an adapter. Replay reads the newest JSONL file in `src/agent/evals/recordings/`; it is not a live-model invocation.

### Clef transport/classification check

```sh
CLEF_BASE_URL=http://<computer-2-tailscale-ip>:11434 \
CLEF_MODEL=clef-flash \
npm run check:clef
```

`check:clef` is the checked-in CLI. It submits benign and threatening moderation samples plus one direct routing choice to Clef's `/v1/systemone`; it exits non-zero for invalid configuration, transport/protocol failure, or an unexpected classification. The plugin passes the same bounded optional classifier into skill routing. A missing, timed-out, invalid, or ineligible choice falls back to deterministic routing. This direct check still does not substitute for an authenticated end-to-end host integration test.

## Current deployment boundaries and missing endpoints

- No deployed backend URL, model-host Tailscale URL, or catalog endpoint is available in this repository.
- The model hosts are Ollama services, but their model installation/pull commands and exact served model names are operational inputs not defined here.
- `/api/agent/chat` exists only after the host registers `agentRoutes` with an `/api` prefix, authentication, SQLite, and every `BackendReads` helper.
- The current `speech` event is script-only. `/agent/speak`, `/agent/audio/:id`, TTS credentials, audio storage, and audio cache endpoints are outside this package and must not be assumed to exist.
- Clef is optional for moderation: an absent or failing Clef endpoint returns `pending` for non-rule-rejected content. The direct Clef check cannot substitute for an end-to-end host integration test.

This document specifies required topology and commands only. It makes no claim that a live model, Tailscale route, Clef check, prewarm, or end-to-end deployment has passed.

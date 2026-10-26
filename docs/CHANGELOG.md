# Changelog

## 2026-10-25 — Updated harness plan, Stage 1

- Replace the superseded backend plugin with standalone prompt/skill review assets and HTTP evaluation tooling for the backend-owned guide.
- Remove the old `agentRoutes`, moderation, and prewarm exports and their implementations; remove Fastify/SQLite/Ajv/YAML dependencies. No old registration adapter or compatibility alias remains.
- Remove server-memory/cache schemas, speech/draft/card/tool events, extra tools, and old evaluations that exercised the withdrawn implementation.
- Target the frozen `messages`/`mode`/`scope_hyg_ids`/`selected_hyg_id` request and `start`/`delta`/`done`/`error` SSE contract.
- Use native Ollama `/api/chat` stand-in fixtures, not an OpenAI-compatible model endpoint.
- Keep prompt and skills unwired. Backend repair, retries, token stripping, empty-scope tool restriction, and selected-star template fallback remain Stage 2 approval-gated.

This cutover does not change the production backend or authorize deferred work. Local protocol checks do not establish an external-backend or real-Gemma baseline.

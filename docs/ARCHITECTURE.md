# Architecture

## Stage 1 ownership

The host backend retains authentication, Fastify routes, SQLite/catalog access, queue/rate limits, strict request validation, scope enforcement, tool execution, and SSE lifecycle. This package exports text assets and evaluates that existing HTTP surface. It does not own a database or application state.

`SYSTEM_PROMPT` and `skillFor(lastUserMessage)` are independent review assets. Skill selection uses ordered regexes: travel, community, compare, default. Only one instruction is selected. Community text is untrusted data; prompts must not treat posts as instructions. Claims and all other mutations stay in the app.

## Model boundary

The shipped guide uses Ollama native `POST /api/chat`, not `/v1/chat/completions`: a planner request with tools (256 predicted tokens), followed by an answer stream without tools (512 tokens), with `think:false` and context size 4096. Backend configuration and implementation remain authoritative.

The evaluation stand-in speaks this native protocol. Scripted answers alone cannot establish that the backend executed a tool: tool assertions need the planner/answer trace, including actual tool results. A real model run without such evidence must distinguish text/stream checks from unverified tool behavior.

## Approval-gated Stage 2

No parser, fallback, tool authorization, or service wiring is added to the backend by this repository. These require Siho's approval and a fresh backend/api base after the competing byte-budget fixes land.

The updated plan's parser snippets are design sketches, not production patches. Integration must preserve cancellation and deadlines, validate recovered calls through existing tools, avoid emitting partial template tokens across delta boundaries, and never turn a terminal error into success. The selected-star fallback changes planner-unavailable behavior from JSON 503/504 to a successful template stream; existing backend tests must be updated only when that change is approved.

## Contract authority

Backend `docs/api-contract.md` and `packages/shared/fixtures/chat.*` are authoritative. This checkout does not contain them. Local stream fixtures illustrate the specified shape; they are not represented as copied or verified backend fixtures. Replace or compare them against the authoritative files when running in the backend checkout.

No additional tools, events, routes, tables, environment variables for backend behavior, moderation decisions, or session memory are introduced. Evaluation-only configuration belongs to the evaluation process, not the client request schema.

# Architecture

## Stage 1 ownership

The host backend retains authentication, Fastify routes, SQLite/catalog access, queue/rate limits, strict request validation, scope enforcement, registered tool execution, and SSE lifecycle. This package exports prompt assets, opt-in summary/voice helpers, and HTTP evaluation tooling. It does not own a database or application state.

`SYSTEM_PROMPT` and `skillFor(lastUserMessage)` remain independent assets. A host that registers the summary handlers enables their instructions with `skillFor(message, { summaryTools: true })`. Explicit speech and Wikipedia/blurb requests then take precedence over travel, community, compare, and default; otherwise original topic selection is preserved. Only one instruction is selected. The existing community skill still treats posts as data; no new trust-processing or content-verification pipeline is introduced for summary rewriting.

## Model boundary

The shipped guide uses Ollama native `POST /api/chat`, not `/v1/chat/completions`: a planner request with tools (256 predicted tokens), followed by an answer stream without tools (512 tokens), with `think:false` and context size 4096. Backend configuration and implementation remain authoritative.

The evaluation stand-in speaks this native protocol. Scripted answers alone cannot establish that the backend executed a tool: tool assertions need the planner/answer trace, including actual tool results. A real model run without such evidence must distinguish text/stream checks from unverified tool behavior.

## Opt-in summary tools

`astral-harness/summaries` exposes executable `get_wikipedia_summary(name)` and `speak_summary(text)` helpers through `createSummaryTools`. The convenience `summarize_star` calls Wikipedia, asks native Ollama Gemma for one short rewrite, and optionally calls xAI for raw MP3 bytes. The rewrite is nonstreaming, independent of the existing backend planner/answer stream.

Text-only is the default. Speech errors preserve the generated text; cancellation rejects instead. The module does not register model tools or deliver audio to clients automatically. See [summary skills](SUMMARY_SKILLS.md) for the interface and host integration.


## Approval-gated Stage 2

No parser, fallback, tool authorization, or service wiring is added to the backend by this repository. These require Siho's approval and a fresh backend/api base after the competing byte-budget fixes land.

The updated plan's parser snippets are design sketches, not production patches. Integration must preserve cancellation and deadlines, validate recovered calls through existing tools, avoid emitting partial template tokens across delta boundaries, and never turn a terminal error into success. The selected-star fallback changes planner-unavailable behavior from JSON 503/504 to a successful template stream; existing backend tests must be updated only when that change is approved.

## Contract authority

Backend `docs/api-contract.md` and `packages/shared/fixtures/chat.*` are authoritative. This checkout does not contain them. Local stream fixtures illustrate the specified shape; they are not represented as copied or verified backend fixtures. Replace or compare them against the authoritative files when running in the backend checkout.

No extra events, routes, tables, moderation decisions, or session memory are introduced. Wikipedia/voice capabilities are opt-in executable exports with server-only configuration; the separately owned backend must explicitly register handlers and deliver audio. Evaluation-only configuration stays in the evaluation process, not the client request schema.

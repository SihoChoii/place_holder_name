# Wikipedia blurbs and xAI speech

These are executable server-side helpers, not just prompt text. They do not register routes, alter the existing SSE protocol, add tables, or restore the superseded agent runtime.

## Quick use

After `npm run build`:

```ts
import { writeFile } from 'node:fs/promises';
import { createSummaryTools, summaryOptionsFromEnv } from 'astral-harness/summaries';

const tools = createSummaryTools(summaryOptionsFromEnv());
const result = await tools.summarize_star('Vega', { audio: true });

console.log(result.blurb);
console.log(`Source: ${result.source.url}`);
if (result.audio) {
  await writeFile('vega.mp3', result.audio.bytes);
} else if (result.speechError) {
  console.error(result.speechError.code, result.speechError.message);
}
```

Without `{ audio: true }`, `summarize_star` makes no paid voice request. For cancellation, pass `{ audio: true, signal: abortController.signal }`.

The flow is:

1. `get_wikipedia_summary(name)` requests `https://en.wikipedia.org/api/rest_v1/page/summary/<encoded-title>` and returns `{ title, extract, url }`.
2. One nonstreaming local Gemma request to native Ollama `/api/chat` rewrites the extract into a short, fun blurb. The request uses `think: false`, no tools, and a 160-token output allowance. Presentation is capped at 80 words and 600 characters.
3. When audio is requested, `speak_summary(blurb)` posts the finished rewrite to `https://api.x.ai/v1/tts` and returns `{ bytes: Uint8Array, mimeType: 'audio/mpeg' }`.

There is no content-verification, numeric-provenance, moderation, or trust-processing step in this demo flow. Basic argument/response shapes, size limits, timeouts and cancellation are checked to keep API failures actionable.

## Server configuration

| Environment variable | Use |
| --- | --- |
| `GUIDE_BASE_URL` | Native Ollama origin on the Gemma computer, reached from the backend computer over Tailscale. No `/v1` or `/api/chat` suffix. Required for rewriting. |
| `GUIDE_MODEL` | Installed Gemma model tag. Required for rewriting. |
| `GUIDE_TIMEOUT_MS` | Rewrite deadline; default 20000 ms. |
| `XAI_API_KEY` | Server-side xAI credential. Required only when synthesizing speech. |
| `XAI_TTS_VOICE` | Voice ID; default `eve`. Custom xAI voice IDs are allowed. |
| `XAI_TTS_LANGUAGE` | Language code; default `en`. |
| `XAI_TTS_TIMEOUT_MS` | Speech deadline; default 8000 ms. |
| `WIKIPEDIA_USER_AGENT` | Optional Wikipedia client identification. |

`createSummaryTools` also accepts explicit options instead of environment configuration: `guideBaseUrl`, `guideModel`, `guideTimeoutMs`, `xaiApiKey`, `voice`, `language`, `speechTimeoutMs`, `wikipediaTimeoutMs`, `wikipediaUserAgent`, and an injectable `fetch`. Wikipedia defaults to a 5000 ms deadline. The API key never belongs in model-visible arguments or client configuration.

Blank environment values are treated as unset. Speech configuration is initialized only when audio is requested: even an invalid optional speech timeout cannot break Wikipedia lookup or text-only summarization; an audio request reports that configuration error while preserving its blurb.


Computer 3 needs outbound internet access for Wikipedia and xAI as well as Tailscale connectivity to local Gemma. Clef is not involved in this flow. The helpers do not add a separate queue; the host must invoke them inside its existing request limits and cancellation scope.

## Calling the two tools directly

```ts
const article = await tools.get_wikipedia_summary('Alpha Centauri');
// article.extract is the original Wikipedia text, NOT an LLM-generated blurb.

const audio = await tools.speak_summary('Vega is Lyra’s sparkling headliner!');
// audio.bytes contains raw MP3 bytes. This is a paid API request.
```

For Wikipedia-only use, `createWikipediaSummary()` needs no Guide or voice configuration. For speech-only use, `createSpeakSummary({ apiKey, voice, language })` needs no Guide configuration. Both factories are exported from `astral-harness/summaries`.

`SUMMARY_TOOL_DEFINITIONS` exports the two function declarations with strict JSON argument schemas:

- `get_wikipedia_summary`: `{ name: string }`, 1–200 characters.
- `speak_summary`: `{ text: string }`, 1–600 characters.

The host opts into registering those declarations and binds the named handlers to the factory functions. Once registered, use `skillFor(message, { summaryTools: true })` from `astral-harness/skills` to enable the speech/Wikipedia prompt instructions. Without that flag the original topic instructions stay active, so an existing backend is not told to call unregistered tools. In local mode, resolve the requested article name from the authorized selected/in-scope star before invoking a lookup; the standalone helper has no catalog or session context.

Do not put audio bytes into a model tool-result JSON message. Deliver them as an audio response/file using the host's existing authenticated delivery path, and give the model only a completion status. No new `/api/agent/speak` route or `speech` SSE event is installed here.

## Audio and failures

xAI receives `{ text, voice_id, language, output_format: { codec: 'mp3', sample_rate: 24000, bit_rate: 128000 } }`. The normal response is raw audio, not a base64 JSON envelope. This implementation makes no retries, avoiding duplicate paid synthesis.

`SummaryToolError` exposes `code`, a sanitized `message`, and optional upstream HTTP `status`. Codes are `invalid_input`, `not_configured`, `not_found`, `ambiguous`, `upstream_error`, `invalid_response`, `timeout`, and `response_too_large`. Raw provider error bodies and credentials are not included.

- Missing/ambiguous Wikipedia articles fail explicitly; no fabricated article or blurb is substituted.
- A failed Gemma rewrite rejects rather than presenting the extract as an LLM answer.
- A failed xAI request in `summarize_star(..., { audio: true })` preserves `{ source, blurb }`, returns `audio: null`, and includes `speechError`.
- A direct `speak_summary` call rejects on failure.
- Caller cancellation rejects the whole operation; it is not converted into a successful text fallback.
- Wikipedia JSON is bounded to 256 KiB, Gemma JSON to 64 KiB, and audio to 8 MiB.

## Verification

```sh
npm run build
npm test
npm run smoke:summary
npm run smoke
node dist/scripts/summary-smoke.js
```

The summary smoke uses actual loopback HTTP servers for all three provider fixtures. It observes a Wikipedia extract reaching the rewrite call, the rewritten blurb reaching the voice call, and exact binary audio reaching the caller. It also exercises the new speech/Wikipedia skill instructions. Its fixture bytes are not a claim of playable xAI audio.

The compiled helper successfully fetched the live Vega article during development. No `GUIDE_BASE_URL`, `GUIDE_MODEL`, or `XAI_API_KEY` was configured in the execution environment, so live Gemma rewriting and live xAI synthesis have not been verified.

Protocol sources:
- [Wikipedia REST summary: Vega](https://en.wikipedia.org/api/rest_v1/page/summary/Vega)
- [Ollama native chat](https://docs.ollama.com/api/chat)
- [xAI text-to-speech](https://docs.x.ai/developers/model-capabilities/audio/text-to-speech)

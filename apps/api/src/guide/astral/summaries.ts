// Vendored from tools/astral-harness/src/guide/summaries.ts (MIT License, Copyright (c) 2026 Milo Lin;
// see tools/astral-harness/LICENSE). Keep in sync with the harness; do not edit only here.
import { createSpeakSummary, type SpeechAudio, type SpeechOptions } from './speech.js';
import { createWikipediaSummary, type WikipediaOptions, type WikipediaSummary } from './wikipedia.js';
import { requestBytes, SummaryToolError, type SummaryErrorCode } from './summary-http.js';

export { SummaryToolError } from './summary-http.js';
export type { SummaryErrorCode } from './summary-http.js';
export { createWikipediaSummary } from './wikipedia.js';
export type { WikipediaSummary, WikipediaOptions } from './wikipedia.js';
export { createSpeakSummary } from './speech.js';
export type { SpeechAudio, SpeechOptions } from './speech.js';

export interface SummaryToolsOptions {
  /** Native Ollama origin (no /v1), called only for summarize_star. */
  guideBaseUrl?: string;
  guideModel?: string;
  guideTimeoutMs?: number;
  xaiApiKey?: string;
  voice?: string;
  language?: string;
  fetch?: typeof fetch;
  wikipediaTimeoutMs?: WikipediaOptions['timeoutMs'];
  wikipediaUserAgent?: string;
  speechTimeoutMs?: SpeechOptions['timeoutMs'];
}

export interface StarSummaryResult {
  source: WikipediaSummary;
  blurb: string;
  audio: SpeechAudio | null;
  speechError?: { code: SummaryErrorCode; message: string };
}

/** Declarations for a host that chooses to expose these tools to its model. */
export const SUMMARY_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'get_wikipedia_summary',
      description: 'Look up a star by its Wikipedia article name, then rewrite the extract into a short, fun blurb.',
      parameters: {
        type: 'object', properties: { name: { type: 'string', minLength: 1, maxLength: 200 } },
        required: ['name'], additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'speak_summary',
      description: 'Generate spoken audio for the finished short blurb. This uses the paid xAI voice API; call only when audio is requested.',
      parameters: {
        type: 'object', properties: { text: { type: 'string', minLength: 1, maxLength: 600 } },
        required: ['text'], additionalProperties: false,
      },
    },
  },
] as const;

/** Returns actual executable helpers, without registering or changing any backend route. */
export function createSummaryTools(options: SummaryToolsOptions = {}) {
  const fetchImpl = options.fetch ?? globalThis.fetch;
  const get_wikipedia_summary = createWikipediaSummary({
    fetch: fetchImpl, timeoutMs: options.wikipediaTimeoutMs, userAgent: options.wikipediaUserAgent,
  });
  let speech: ((text: string, signal?: AbortSignal) => Promise<SpeechAudio>) | undefined;
  async function speak_summary(text: string, signal?: AbortSignal): Promise<SpeechAudio> {
    // Optional speech configuration must not prevent Wikipedia or text-only use.
    speech ??= createSpeakSummary({
      apiKey: options.xaiApiKey, voice: options.voice, language: options.language,
      timeoutMs: options.speechTimeoutMs, fetch: fetchImpl,
    });
    return speech(text, signal);
  }

  async function summarize_star(
    name: string,
    request: { audio?: boolean; signal?: AbortSignal } = {},
  ): Promise<StarSummaryResult> {
    request.signal?.throwIfAborted();
    if (!options.guideBaseUrl?.trim() || !options.guideModel?.trim()) {
      throw new SummaryToolError('not_configured', 'GUIDE_BASE_URL and GUIDE_MODEL are required to rewrite a summary');
    }
    let origin: URL;
    try {
      origin = new URL(options.guideBaseUrl);
    } catch {
      throw new SummaryToolError('invalid_input', 'GUIDE_BASE_URL must be a native Ollama HTTP(S) origin');
    }
    if (!['http:', 'https:'].includes(origin.protocol) || origin.username || origin.password
      || origin.pathname.replace(/\/+$/, '') !== '' || origin.search || origin.hash) {
      throw new SummaryToolError('invalid_input', 'GUIDE_BASE_URL must be a native Ollama HTTP(S) origin without /v1 or /api/chat');
    }
    const timeoutMs = options.guideTimeoutMs ?? 20_000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) {
      throw new SummaryToolError('invalid_input', 'GUIDE_TIMEOUT_MS must be a positive integer');
    }
    const source = await get_wikipedia_summary(name, request.signal);
    const response = await requestBytes(new URL('/api/chat', origin), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: options.guideModel.trim(), stream: false, think: false,
        options: { num_predict: 160, num_ctx: 4096, temperature: 0.3 },
        messages: [
          { role: 'system', content: 'Rewrite the supplied Wikipedia extract into a short, fun star blurb. Use 2 or 3 sentences and at most 80 words. Keep it under 600 characters, plain text, and suitable for reading aloud. Use the supplied information.' },
          { role: 'user', content: JSON.stringify({ title: source.title, extract: source.extract }) },
        ],
      }),
    }, { fetchImpl, signal: request.signal, timeoutMs, maxBytes: 64 * 1024, service: 'Gemma' });
    if (response.status < 200 || response.status >= 300) {
      throw new SummaryToolError('upstream_error', `Gemma returned HTTP ${response.status}`, response.status);
    }
    let data: unknown;
    try {
      data = JSON.parse(new TextDecoder().decode(response.bytes));
    } catch {
      throw new SummaryToolError('invalid_response', 'Gemma returned invalid JSON');
    }
    if (!data || typeof data !== 'object' || !('message' in data)
      || !data.message || typeof data.message !== 'object' || !('content' in data.message)
      || typeof data.message.content !== 'string' || !data.message.content.trim()) {
      throw new SummaryToolError('invalid_response', 'Gemma returned no blurb text');
    }
    // Mechanical presentation limits only; no content verification or trust pipeline.
    let blurb = data.message.content.trim().split(/\s+/).slice(0, 80).join(' ');
    if (blurb.length > 600) {
      const boundary = blurb.lastIndexOf(' ', 600);
      if (boundary < 1) throw new SummaryToolError('invalid_response', 'Gemma returned no usable short blurb');
      blurb = blurb.slice(0, boundary);
    }
    request.signal?.throwIfAborted();
    if (!request.audio) return { source, blurb, audio: null };
    try {
      return { source, blurb, audio: await speak_summary(blurb, request.signal) };
    } catch (error) {
      request.signal?.throwIfAborted();
      if (!(error instanceof SummaryToolError)) throw error;
      return { source, blurb, audio: null, speechError: { code: error.code, message: error.message } };
    }
  }

  return { get_wikipedia_summary, speak_summary, summarize_star };
}

/** Server-only environment configuration; no credentials enter tool arguments. */
export function summaryOptionsFromEnv(env: NodeJS.ProcessEnv = process.env): SummaryToolsOptions {
  const value = (name: string) => env[name]?.trim() || undefined;
  const guideTimeout = value('GUIDE_TIMEOUT_MS');
  const speechTimeout = value('XAI_TTS_TIMEOUT_MS');
  return {
    guideBaseUrl: value('GUIDE_BASE_URL'), guideModel: value('GUIDE_MODEL'),
    guideTimeoutMs: guideTimeout ? Number(guideTimeout) : undefined,
    xaiApiKey: value('XAI_API_KEY'), voice: value('XAI_TTS_VOICE'),
    language: value('XAI_TTS_LANGUAGE'),
    speechTimeoutMs: speechTimeout ? Number(speechTimeout) : undefined,
    wikipediaUserAgent: value('WIKIPEDIA_USER_AGENT'),
  };
}

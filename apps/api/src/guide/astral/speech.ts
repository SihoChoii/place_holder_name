// Vendored from tools/astral-harness/src/guide/speech.ts (MIT License, Copyright (c) 2026 Milo Lin;
// see tools/astral-harness/LICENSE). Keep in sync with the harness; do not edit only here.
import { requestBytes, SummaryToolError } from './summary-http.js';

const XAI_TTS_URL = 'https://api.x.ai/v1/tts';
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 8_000;

export interface SpeechAudio {
  bytes: Uint8Array;
  mimeType: 'audio/mpeg';
}

export interface SpeechOptions {
  apiKey?: string;
  voice?: string;
  language?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

function configuredText(value: string | undefined, fallback: string, label: string): string {
  const resolved = value?.trim() ?? fallback;
  if (!resolved) throw new SummaryToolError('invalid_input', `${label} must be nonempty`);
  return resolved;
}

function configuredTimeout(value: number | undefined): number {
  const resolved = value ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(resolved) || resolved <= 0) {
    throw new SummaryToolError('invalid_input', 'timeoutMs must be a positive integer');
  }
  return resolved;
}

/** Creates a paid xAI text-to-speech request; the caller delivers the returned audio. */
export function createSpeakSummary(options: SpeechOptions = {}) {
  const voice = configuredText(options.voice, 'eve', 'voice');
  const language = configuredText(options.language, 'en', 'language');
  const timeoutMs = configuredTimeout(options.timeoutMs);
  const fetchImpl = options.fetch ?? globalThis.fetch;

  return async function speak_summary(text: string, signal?: AbortSignal): Promise<SpeechAudio> {
    if (typeof text !== 'string' || !text.trim() || text.trim().length > 600) {
      throw new SummaryToolError('invalid_input', 'text must be a nonempty string of at most 600 characters');
    }

    const apiKey = options.apiKey?.trim();
    if (!apiKey) throw new SummaryToolError('not_configured', 'xAI voice API key is not configured');

    const response = await requestBytes(XAI_TTS_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        text: text.trim(),
        voice_id: voice,
        language,
        output_format: { codec: 'mp3', sample_rate: 24_000, bit_rate: 128_000 },
      }),
    }, {
      fetchImpl,
      signal,
      timeoutMs,
      maxBytes: MAX_AUDIO_BYTES,
      service: 'xAI voice',
    });

    if (response.status < 200 || response.status >= 300) {
      throw new SummaryToolError('upstream_error', `xAI voice request failed with HTTP ${response.status}`, response.status);
    }
    if (response.contentType !== 'audio/mpeg' && response.contentType !== 'audio/mp3') {
      throw new SummaryToolError('invalid_response', 'xAI voice returned an unexpected content type');
    }
    if (response.bytes.byteLength === 0) {
      throw new SummaryToolError('invalid_response', 'xAI voice returned an empty body');
    }
    return { bytes: response.bytes, mimeType: 'audio/mpeg' };
  };
}

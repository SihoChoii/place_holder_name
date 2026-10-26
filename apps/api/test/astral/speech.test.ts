// Ported from tools/astral-harness/test/speech.test.ts (MIT License, Copyright (c) 2026 Milo Lin).
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSpeakSummary } from '../../src/guide/astral/speech.js';
import { SummaryToolError } from '../../src/guide/astral/summary-http.js';

const audioHeaders = { 'content-type': 'audio/mpeg; charset=binary' };

function errorCode(error: unknown): string | undefined {
  return error instanceof SummaryToolError ? error.code : undefined;
}

test('speak_summary posts xAI’s required payload and returns exact MP3 bytes', async () => {
  let request: Request | undefined;
  const expected = new Uint8Array([0x49, 0x44, 0x33, 4, 0]);
  const speak = createSpeakSummary({
    apiKey: ' secret ', voice: 'custom-voice', language: 'fr',
    fetch: async (input, init) => {
      request = new Request(input, init);
      return new Response(expected, { headers: audioHeaders });
    },
  });

  const audio = await speak('  Bonjour Sirius.  ');
  assert.deepEqual(audio.bytes, expected);
  assert.equal(audio.mimeType, 'audio/mpeg');
  assert.equal(request?.url, 'https://api.x.ai/v1/tts');
  assert.equal(request?.method, 'POST');
  assert.equal(request?.headers.get('authorization'), 'Bearer secret');
  assert.deepEqual(await request?.json(), {
    text: 'Bonjour Sirius.', voice_id: 'custom-voice', language: 'fr',
    output_format: { codec: 'mp3', sample_rate: 24_000, bit_rate: 128_000 },
  });
});

test('speak_summary uses the documented defaults and normalizes audio/mp3', async () => {
  let payload: Record<string, unknown> | undefined;
  const speak = createSpeakSummary({
    apiKey: 'key',
    fetch: async (input, init) => {
      payload = await new Request(input, init).json() as Record<string, unknown>;
      return new Response(new Uint8Array([1]), { headers: { 'content-type': 'audio/mp3' } });
    },
  });

  assert.equal((await speak('A short blurb.')).mimeType, 'audio/mpeg');
  assert.deepEqual(payload, {
    text: 'A short blurb.', voice_id: 'eve', language: 'en',
    output_format: { codec: 'mp3', sample_rate: 24_000, bit_rate: 128_000 },
  });
});

test('speak_summary rejects absent configuration and invalid text before networking', async () => {
  let calls = 0;
  const fetch = async () => { calls += 1; return new Response(new Uint8Array([1]), { headers: audioHeaders }); };
  const unconfigured = createSpeakSummary({ fetch });
  await assert.rejects(() => unconfigured('blurb'), (error: unknown) => errorCode(error) === 'not_configured');
  const configured = createSpeakSummary({ apiKey: 'key', fetch });
  for (const text of ['', '   ', 'x'.repeat(601)] as unknown[]) {
    await assert.rejects(() => configured(text as string), (error: unknown) => errorCode(error) === 'invalid_input');
  }
  assert.equal(calls, 0);
  assert.throws(() => createSpeakSummary({ apiKey: 'key', voice: '  ' }), /voice must be nonempty/);
  assert.throws(() => createSpeakSummary({ apiKey: 'key', timeoutMs: 0 }), /positive integer/);
});

test('speak_summary sanitizes xAI HTTP failures', async () => {
  for (const status of [401, 429]) {
    const speak = createSpeakSummary({
      apiKey: 'top-secret',
      fetch: async () => new Response('{"error":"top-secret leaked body"}', { status, headers: { 'content-type': 'application/json' } }),
    });
    await assert.rejects(() => speak('blurb'), (error: unknown) => {
      assert.equal(errorCode(error), 'upstream_error');
      assert.equal((error as SummaryToolError).status, status);
      assert.doesNotMatch((error as Error).message, /top-secret|leaked body/);
      return true;
    });
  }
});

test('speak_summary rejects JSON and empty successful responses', async () => {
  for (const response of [
    new Response('{"url":"https://untrusted.example/audio.mp3"}', { headers: { 'content-type': 'application/json' } }),
    new Response(new Uint8Array(), { headers: audioHeaders }),
  ]) {
    const speak = createSpeakSummary({ apiKey: 'key', fetch: async () => response });
    await assert.rejects(() => speak('blurb'), (error: unknown) => errorCode(error) === 'invalid_response');
  }
});

test('speak_summary respects cancellation and its timeout', async () => {
  let calls = 0;
  const cancelled = new AbortController();
  cancelled.abort(new Error('caller cancelled'));
  const speak = createSpeakSummary({ apiKey: 'key', fetch: async () => { calls += 1; return new Response(); } });
  await assert.rejects(() => speak('blurb', cancelled.signal), /caller cancelled/);
  assert.equal(calls, 0);

  const timed = createSpeakSummary({
    apiKey: 'key', timeoutMs: 1,
    fetch: async (_input, init) => {
      const { promise, reject } = Promise.withResolvers<Response>();
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      return promise;
    },
  });
  await assert.rejects(() => timed('blurb'), (error: unknown) => errorCode(error) === 'timeout');
});

test('speak_summary bounds successful audio responses at 8 MiB', async () => {
  const speak = createSpeakSummary({
    apiKey: 'key',
    fetch: async () => new Response(new Uint8Array(8 * 1024 * 1024 + 1), { headers: audioHeaders }),
  });
  await assert.rejects(() => speak('blurb'), (error: unknown) => errorCode(error) === 'response_too_large');
});

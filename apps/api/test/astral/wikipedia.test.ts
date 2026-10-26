// Ported from tools/astral-harness/test/wikipedia.test.ts (MIT License, Copyright (c) 2026 Milo Lin).
import assert from 'node:assert/strict';
import test from 'node:test';
import { SummaryToolError } from '../../src/guide/astral/summary-http.js';
import { createWikipediaSummary } from '../../src/guide/astral/wikipedia.js';

const article = JSON.stringify({ title: 'Alpha Centauri', extract: 'A nearby star system.' });

function response(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'application/json' } });
}

test('requests a fixed Wikipedia URL with an encoded normalized title and redirect support', async () => {
  let requestedUrl = '';
  let requestedInit: RequestInit | undefined;
  const getWikipediaSummary = createWikipediaSummary({
    fetch: async (url, init) => {
      requestedUrl = String(url);
      requestedInit = init;
      return response(article);
    },
    userAgent: 'AstralHarness test',
  });

  const summary = await getWikipediaSummary('  α  Centauri  ');

  assert.deepEqual(summary, {
    title: 'Alpha Centauri',
    extract: 'A nearby star system.',
    url: 'https://en.wikipedia.org/wiki/Alpha_Centauri',
  });
  assert.equal(requestedUrl, 'https://en.wikipedia.org/api/rest_v1/page/summary/%CE%B1_Centauri');
  assert.equal(requestedInit?.redirect, 'follow');
  assert.equal(new Headers(requestedInit?.headers).get('accept'), 'application/json');
  assert.equal(new Headers(requestedInit?.headers).get('user-agent'), 'AstralHarness test');
});

test('reports unavailable, ambiguous, and malformed Wikipedia responses', async () => {
  const cases: Array<{ body: string; status?: number; code: string }> = [
    { body: '', status: 404, code: 'not_found' },
    { body: JSON.stringify({ type: 'disambiguation', title: 'Mercury', extract: 'Several meanings.' }), code: 'ambiguous' },
    { body: '{', code: 'invalid_response' },
    { body: JSON.stringify({ title: 'Mercury', extract: '' }), code: 'invalid_response' },
    { body: '', status: 503, code: 'upstream_error' },
  ];

  for (const { body, status, code } of cases) {
    const getWikipediaSummary = createWikipediaSummary({ fetch: async () => response(body, status) });
    await assert.rejects(
      () => getWikipediaSummary('Mercury'),
      (error: unknown) => error instanceof SummaryToolError && error.code === code,
    );
  }
});

test('rejects invalid article names before making a request', async () => {
  let calls = 0;
  const getWikipediaSummary = createWikipediaSummary({
    fetch: async () => {
      calls += 1;
      return response(article);
    },
  });

  for (const name of ['', '   ', 'https://example.test/wiki/Alpha', 'x'.repeat(201)]) {
    await assert.rejects(
      () => getWikipediaSummary(name),
      (error: unknown) => error instanceof SummaryToolError && error.code === 'invalid_input',
    );
  }
  assert.equal(calls, 0);
});

test('enforces timeout and caller cancellation through the fetch signal', async () => {
  const waitsForAbort: typeof fetch = async (_url, init) => {
    const { promise, reject } = Promise.withResolvers<Response>();
    init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    return promise;
  };

  await assert.rejects(
    () => createWikipediaSummary({ fetch: waitsForAbort, timeoutMs: 1 })('Vega'),
    (error: unknown) => error instanceof SummaryToolError && error.code === 'timeout',
  );

  const controller = new AbortController();
  controller.abort(new DOMException('cancelled', 'AbortError'));
  await assert.rejects(() => createWikipediaSummary({ fetch: waitsForAbort })('Vega', controller.signal), /cancelled/);
});

test('caps Wikipedia responses at 256 KiB', async () => {
  const tooLarge = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(256 * 1024 + 1));
      controller.close();
    },
  });
  const getWikipediaSummary = createWikipediaSummary({
    fetch: async () => new Response(tooLarge, { headers: { 'content-type': 'application/json' } }),
  });

  await assert.rejects(
    () => getWikipediaSummary('Vega'),
    (error: unknown) => error instanceof SummaryToolError && error.code === 'response_too_large',
  );
});

// Ported from tools/astral-harness/test/summaries.test.ts (MIT License, Copyright (c) 2026 Milo Lin).
import assert from 'node:assert/strict';
import test from 'node:test';
import { createSummaryTools, summaryOptionsFromEnv, SummaryToolError } from '../../src/guide/astral/summaries.js';

const article = { title: 'Vega', extract: 'Vega is the brightest star in Lyra and lies 25 light-years away.' };
const blurb = 'Meet Vega, the sparkling headliner of Lyra! Its light travels 25 years to reach us.';

function fixtureFetch(options: { modelStatus?: number; speechStatus?: number; onSpeech?: () => void; content?: string } = {}): typeof fetch {
  return async (input) => {
    const url = String(input);
    if (url.startsWith('https://en.wikipedia.org/api/rest_v1/page/summary/')) return Response.json(article);
    if (url === 'http://gemma.test/api/chat') {
      return Response.json({ done: true, message: { role: 'assistant', content: options.content ?? blurb } }, { status: options.modelStatus ?? 200 });
    }
    if (url === 'https://api.x.ai/v1/tts') {
      options.onSpeech?.();
      return new Response(new Uint8Array([73, 68, 51, 4, 0, 0]), {
        status: options.speechStatus ?? 200, headers: { 'content-type': 'audio/mpeg' },
      });
    }
    throw new Error(`Unexpected fixture URL: ${url}`);
  };
}

const guide = { guideBaseUrl: 'http://gemma.test', guideModel: 'local-gemma' };

test('text-only summarization produces a rewritten blurb with attribution and never bills for speech', async () => {
  const tools = createSummaryTools({ ...guide, fetch: fixtureFetch({ onSpeech() { assert.fail('Text-only calls must not request audio'); } }) });
  const result = await tools.summarize_star('Vega');
  assert.equal(result.blurb, blurb);
  assert.notEqual(result.blurb, article.extract);
  assert.equal(result.source.url, 'https://en.wikipedia.org/wiki/Vega');
  assert.equal(result.audio, null);
  assert.equal(result.speechError, undefined);
});

test('speech failure preserves the rewritten text and reports the audio error instead of inventing audio', async () => {
  const tools = createSummaryTools({ ...guide, xaiApiKey: 'test-key', fetch: fixtureFetch({ speechStatus: 503 }) });
  const result = await tools.summarize_star('Vega', { audio: true });
  assert.equal(result.blurb, blurb);
  assert.equal(result.audio, null);
  assert.equal(result.speechError?.code, 'upstream_error');
});

test('missing xAI credentials leave text usable without making a paid request', async () => {
  const tools = createSummaryTools({ ...guide, fetch: fixtureFetch({ onSpeech() { assert.fail('Missing key must fail before speech request'); } }) });
  const result = await tools.summarize_star('Vega', { audio: true });
  assert.equal(result.blurb, blurb);
  assert.equal(result.speechError?.code, 'not_configured');
});

test('a failed Gemma rewrite is reported, not mislabeled as a generated blurb', async () => {
  const tools = createSummaryTools({ ...guide, fetch: fixtureFetch({ modelStatus: 500, onSpeech() { assert.fail('No audio without a blurb'); } }) });
  await assert.rejects(tools.summarize_star('Vega', { audio: true }), (error: unknown) => (
    error instanceof SummaryToolError && error.code === 'upstream_error' && error.status === 500
  ));
});

test('short presentation limits keep an oversized model answer within the speech input limit', async () => {
  const tools = createSummaryTools({ ...guide, fetch: fixtureFetch({ content: 'Vega shines. '.repeat(200) }) });
  const result = await tools.summarize_star('Vega');
  assert(result.blurb.length <= 600);
  assert(result.blurb.split(/\s+/).length <= 80);
  assert(!result.blurb.endsWith('Veg'));
});

test('cancellation during speech propagates rather than returning a successful text fallback', async () => {
  const controller = new AbortController();
  const reason = new Error('caller left');
  const upstream = fixtureFetch();
  const tools = createSummaryTools({
    ...guide, xaiApiKey: 'test-key',
    fetch: async (input, init) => {
      if (String(input) === 'https://api.x.ai/v1/tts') {
        controller.abort(reason);
        throw reason;
      }
      return upstream(input, init);
    },
  });
  await assert.rejects(tools.summarize_star('Vega', { audio: true, signal: controller.signal }), (error: unknown) => error === reason);
});

test('rejects an OpenAI-style Guide base before any outbound summary request', async () => {
  const tools = createSummaryTools({ ...guide, guideBaseUrl: 'http://gemma.test/v1', fetch: async () => { assert.fail('Invalid configuration must not call an API'); } });
  await assert.rejects(tools.summarize_star('Vega'), (error: unknown) => error instanceof SummaryToolError && error.code === 'invalid_input');
});

test('blank optional environment values use defaults instead of disabling summary tools', async () => {
  const options = summaryOptionsFromEnv({
    GUIDE_BASE_URL: guide.guideBaseUrl, GUIDE_MODEL: guide.guideModel,
    XAI_API_KEY: 'test-key', XAI_TTS_VOICE: '', XAI_TTS_LANGUAGE: '  ', WIKIPEDIA_USER_AGENT: '',
  });
  const tools = createSummaryTools({ ...options, fetch: fixtureFetch() });
  const result = await tools.summarize_star('Vega', { audio: true });
  assert.equal(result.blurb, blurb);
  assert.equal(result.audio?.mimeType, 'audio/mpeg');
  assert.equal(result.speechError, undefined);
});

test('invalid optional speech configuration cannot break text-only use', async () => {
  const tools = createSummaryTools({
    ...guide, speechTimeoutMs: Number.NaN, xaiApiKey: 'test-key',
    fetch: fixtureFetch({ onSpeech() { assert.fail('Invalid speech config must not reach xAI'); } }),
  });
  const article = await tools.get_wikipedia_summary('Vega');
  assert.equal(article.title, 'Vega');
  const text = await tools.summarize_star('Vega');
  assert.equal(text.blurb, blurb);
  const withAudio = await tools.summarize_star('Vega', { audio: true });
  assert.equal(withAudio.blurb, blurb);
  assert.equal(withAudio.speechError?.code, 'invalid_input');
});

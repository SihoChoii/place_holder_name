import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createSummaryTools } from '../src/guide/summaries.js';
import { skillFor } from '../src/guide/skills.js';

const extract = 'Vega is the brightest star in Lyra, 25 light-years from Earth.';
const blurb = 'Vega is Lyra’s sparkling headliner! Its light takes 25 years to reach your eyes.';
// Fixture bytes exercise binary transport; no real provider or playable-audio claim.
const audio = new Uint8Array([73, 68, 51, 4, 0, 0, 1, 2, 3]);
const calls: string[] = [];
const server = createServer(async (request, response) => {
  try {
    let text = '';
    for await (const chunk of request) text += chunk.toString();
    if (request.url === '/wiki/Vega') {
      calls.push('wikipedia');
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ type: 'standard', title: 'Vega', extract }));
    } else if (request.url === '/api/chat') {
      calls.push('gemma');
      const body: unknown = JSON.parse(text);
      assert(body && typeof body === 'object' && 'messages' in body);
      assert.match(JSON.stringify(body.messages), /brightest star in Lyra/);
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ done: true, message: { role: 'assistant', content: blurb } }));
    } else if (request.url === '/tts') {
      calls.push('xai');
      const body: unknown = JSON.parse(text);
      assert(body && typeof body === 'object' && 'text' in body);
      assert.equal(body.text, blurb); // Speak the rewrite, not the raw Wikipedia extract.
      assert.equal(request.headers.authorization, 'Bearer fixture-key');
      response.setHeader('content-type', 'audio/mpeg');
      response.end(audio);
    } else {
      response.writeHead(404).end();
    }
  } catch (error) {
    response.writeHead(500).end(error instanceof Error ? error.message : 'Fixture failed');
  }
});
const listening = Promise.withResolvers<void>();
server.once('error', listening.reject);
server.listen(0, '127.0.0.1', listening.resolve);
await listening.promise;
const address = server.address();
assert(address && typeof address !== 'string');
const base = `http://127.0.0.1:${address.port}`;
const tools = createSummaryTools({
  guideBaseUrl: base, guideModel: 'fixture-gemma', xaiApiKey: 'fixture-key',
  fetch: async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === 'en.wikipedia.org') return fetch(`${base}/wiki/${url.pathname.split('/').at(-1)}`, init);
    if (url.hostname === 'api.x.ai') return fetch(`${base}/tts`, init);
    assert.equal(url.origin, base);
    return fetch(url, init);
  },
});
try {
  const result = await tools.summarize_star('Vega', { audio: true });
  assert.deepEqual(calls, ['wikipedia', 'gemma', 'xai']);
  assert.equal(result.blurb, blurb);
  assert.equal(result.source.url, 'https://en.wikipedia.org/wiki/Vega');
  assert.deepEqual(result.audio?.bytes, audio);
  assert.equal(result.audio?.mimeType, 'audio/mpeg');
  assert.equal(result.speechError, undefined);
  assert.match(skillFor('Read the travel summary aloud', { summaryTools: true }), /speak_summary/);
  assert.match(skillFor('Give me a fun blurb about Vega', { summaryTools: true }), /get_wikipedia_summary/);
  assert.doesNotMatch(skillFor('Read the community posts aloud'), /speak_summary|get_wikipedia_summary/);
  console.log('Summary smoke passed over real HTTP: Wikipedia extract → Gemma rewrite → xAI binary audio. All three providers were local fixtures.');
} finally {
  server.closeAllConnections();
  const closing = Promise.withResolvers<void>();
  server.close((error) => error ? closing.reject(error) : closing.resolve());
  await closing.promise;
}

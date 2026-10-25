import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import type { Config } from '../src/agent/config.js';
import { createGuideClient, ModelError } from '../src/agent/model/gemma.js';
import { FifoLimiter } from '../src/agent/model/queue.js';

function config(base: string, timeoutMs = 500): Config {
  return {
    guideBaseUrl: base,
    guideModel: 'gemma-test',
    clefBaseUrl: null,
    clefModel: 'clef',
    maxTokens: 220,
    timeoutMs,
    queueDepth: 8,
    toolTimeoutMs: 2_000,
  };
}

test('guide client retries one 5xx, does not retry 4xx, and sends the supported body', async (context) => {
  let requests = 0;
  const bodies: unknown[] = [];
  const server = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    bodies.push(JSON.parse(body));
    requests++;
    if (requests === 1) {
      response.writeHead(503).end('retry');
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
      choices: [{ message: { role: 'assistant', content: 'hello', reasoning: 'discard me' } }],
    }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  context.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const client = createGuideClient(config(`http://127.0.0.1:${address.port}/v1`), fetch, new FifoLimiter(1, 1));
  const message = await client.chat([{ role: 'user', content: 'hi' }], [], new AbortController().signal);
  assert.deepEqual(message, { role: 'assistant', content: 'hello' });
  assert.equal(requests, 2);
  assert.deepEqual(bodies[0], {
    model: 'gemma-test',
    messages: [{ role: 'user', content: 'hi' }],
    stream: false,
    reasoning_effort: 'none',
    temperature: 0.3,
    max_tokens: 220,
  });

  const fourOhFour = createGuideClient(config(`http://127.0.0.1:${address.port}/v1`), async () => new Response('missing', { status: 404 }), new FifoLimiter(1, 1));
  await assert.rejects(fourOhFour.chat([], [], new AbortController().signal), (error: unknown) => error instanceof ModelError && error.code === 'model_unavailable');
});

test('guide client reports a shared deadline as timeout', async () => {
  const client = createGuideClient(config('http://guide.test/v1', 10), async (_url, init) => {
    const deferred = Promise.withResolvers<Response>();
    const signal = init?.signal;
    if (!signal) throw new Error('client did not provide a deadline signal');
    signal.addEventListener('abort', () => deferred.reject(signal.reason), { once: true });
    return deferred.promise;
  }, new FifoLimiter(1, 1));
  await assert.rejects(client.chat([], [], new AbortController().signal), (error: unknown) => error instanceof ModelError && error.code === 'timeout');
});

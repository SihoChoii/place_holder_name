import { createServer, type Server } from 'node:http';
import { GOLDENS } from '../harness/evals/golden.js';
import { runGolden } from '../harness/evals/run.js';
import { startStandin } from '../harness/evals/standin.js';

function close(server: Server): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  server.close((error) => error ? reject(error) : resolve());
  return promise;
}

async function bodyOf(request: AsyncIterable<Uint8Array>): Promise<string> {
  let text = '';
  for await (const chunk of request) text += new TextDecoder().decode(chunk);
  return text;
}

async function startProtocolEndpoint(standinUrl: string): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/api/agent/chat') { response.statusCode = 404; response.end(); return; }
    const chat = JSON.parse(await bodyOf(request));
    const tools = [{ type: 'function', function: { name: 'calculate_travel_time' } }];
    const planner = await fetch(`${standinUrl}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: chat.messages, tools, stream: false }) });
    const planned = await planner.json() as { message?: { tool_calls?: unknown } };
    if (!planned.message?.tool_calls) { response.statusCode = 500; response.end('stand-in did not make a tool call'); return; }
    const answer = await fetch(`${standinUrl}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [...chat.messages, { role: 'tool', tool_name: 'calculate_travel_time', content: '{"years":160000}' }], stream: false }) });
    const completed = await answer.json() as { message?: { content?: string } };
    const text = completed.message?.content ?? '';
    response.setHeader('content-type', 'text/event-stream');
    response.write('event: start\r\ndata: {"request_id":"protocol-smoke"}\r\n\r\n');
    response.write('event: delta\n');
    response.write(`data: {"text":\n`);
    response.write(`data: ${JSON.stringify(text)}}\n\n`);
    response.end('event: done\ndata: {"request_id":"protocol-smoke"}\n\n');
  });
  const { promise, resolve, reject } = Promise.withResolvers<{ url: string; close: () => Promise<void> }>();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string') { reject(new Error('protocol endpoint did not bind TCP')); return; }
    resolve({ url: `http://127.0.0.1:${address.port}`, close: () => close(server) });
  });
  return promise;
}

const standin = await startStandin({ port: 0 });
const endpoint = await startProtocolEndpoint(standin.url);
try {
  const result = await runGolden(endpoint.url, GOLDENS[1], standin.url);
  if (result.semantic !== 'pass' || !result.tools.startsWith('unverified (tool execution observed')) throw new Error(`protocol smoke failed: ${result.semantic}; ${result.tools}; ${result.detail ?? ''}`);
  const unavailableStandin = await startStandin({ port: 0, g10Mode: '503' });
  try {
    const unavailable = await fetch(`${unavailableStandin.url}/api/chat`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: '[g10]' }, { role: 'user', content: 'What is this?' }] }) });
    if (unavailable.status !== 503) throw new Error(`expected simulated g10 503, got ${unavailable.status}`);
  } finally {
    await unavailableStandin.close();
  }
  const withoutEvidence = await runGolden(endpoint.url, GOLDENS[1], unavailableStandin.url);
  if (withoutEvidence.semantic !== 'pass' || withoutEvidence.status !== 'unverified') throw new Error('Unavailable evidence prevented the HTTP scenario from running');
  console.log('Protocol-only smoke passed: runner HTTP/SSE parsing and stand-in tool evidence work. This is not backend acceptance.');
} finally {
  await endpoint.close();
  await standin.close();
}

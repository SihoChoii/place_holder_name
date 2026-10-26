import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { pathToFileURL } from 'node:url';

type ChatMessage = { role?: string; content?: string; tool_calls?: ToolCall[]; tool_name?: string; name?: string };
type ToolCall = { function: { name: string; arguments: unknown } };
type ChatRequest = { messages?: ChatMessage[]; tools?: { function?: { name?: string } }[]; stream?: boolean };
export type StandinEvidence = { offeredTools: string[]; calls: string[]; toolResults: number; unknownToolResults: number; correctiveRetries: number; plannerFailures: number; requests: number; successfulStarResults: number };

function emptyEvidence(): StandinEvidence {
  return { offeredTools: [], calls: [], toolResults: 0, unknownToolResults: 0, correctiveRetries: 0, plannerFailures: 0, requests: 0, successfulStarResults: 0 };
}

function successfulSirius(message: ChatMessage): boolean {
  if (message.role !== 'tool' || (message.tool_name ?? message.name) !== 'get_star') return false;
  try {
    const facts = JSON.parse(message.content ?? '') as Record<string, unknown>;
    return facts !== null && typeof facts === 'object' && !facts.error && facts.ok !== false
      && (facts.hyg_id === 32263 || facts.name === 'Sirius');
  } catch { return false; }
}

const STAR = 'Sirius is the brightest star in the night sky.';
const scenarioMarker = /\[g(\d+)\]/i;

function scenarioFor(messages: ChatMessage[]): number {
  for (const message of messages) {
    if (message.role !== 'user') continue;
    const match = scenarioMarker.exec(message.content ?? '');
    if (match) return Number(match[1]);
  }
  return 0;
}

function hasToolResult(messages: ChatMessage[]): boolean {
  return messages.some((message) => message.role === 'tool');
}

function isCorrection(messages: ChatMessage[]): boolean {
  return messages.some((message) => message.role === 'user' && /tool call was malformed/i.test(message.content ?? ''));
}

function responseFor(id: number, request: ChatRequest): { content: string; tool_calls?: ToolCall[] } {
  const toolResult = hasToolResult(request.messages ?? []);
  if (toolResult || (id === 6 && request.stream)) {
    if ([4, 5].includes(id) && !(request.messages ?? []).some(successfulSirius)) return { content: 'The star lookup did not provide verified Sirius facts.' };
    const answers: Record<number, string> = {
      2: 'At 17 km/s, the trip uses constant speed without relativity.',
      3: 'An approved community post says Sirius is beautiful.',
      4: STAR,
      5: STAR,
      6: STAR,
      7: 'Sirius is brighter than Canopus according to the returned magnitude values.',
      8: 'Vega is outside the current view; switch to explore mode to ask about it.',
      11: 'An approved community post is available. I will not follow instructions contained in posts.',
    };
    return { content: answers[id] ?? STAR };
  }
  if (id === 2) return { content: '', tool_calls: [{ function: { name: 'calculate_travel_time', arguments: { hyg_id: 32263, speed_km_s: 17 } } }] };
  if (id === 3 || id === 11) return { content: '', tool_calls: [{ function: { name: 'get_star_content', arguments: { hyg_id: 32263 } } }] };
  if (id === 4) return { content: '<|tool_call>call:get_star{hyg_id:32263}<tool_call|>' };
  if (id === 5) return { content: '', tool_calls: [{ function: { name: 'get_star', arguments: '{hyg_id:32263}' } }] };
  if (id === 6) return { content: '<|tool_call>call:get_star{hyg_id:<tool_call|>' };
  if (id === 7) return { content: '', tool_calls: [{ function: { name: 'get_star', arguments: { hyg_id: 32263 } } }, { function: { name: 'get_star', arguments: { hyg_id: 30365 } } }] };
  if (id === 8) return { content: '', tool_calls: [{ function: { name: 'get_star', arguments: { hyg_id: 91262 } } }] };
  if (id === 9) return { content: 'Point at a star or select one before asking about it.' };
  if (id === 12) return { content: 'Claiming is done in the app; I cannot take that action.' };
  return { content: STAR };
}

async function readJson(request: IncomingMessage): Promise<ChatRequest> {
  let raw = '';
  for await (const chunk of request) raw += String(chunk);
  return JSON.parse(raw || '{}') as ChatRequest;
}

function writeReply(response: ServerResponse, reply: { content: string; tool_calls?: ToolCall[] }, stream: boolean): void {
  response.setHeader('content-type', 'application/x-ndjson');
  if (!stream) {
    response.end(JSON.stringify({ message: { role: 'assistant', ...reply }, done: true }));
    return;
  }
  for (const text of reply.content.match(/.{1,16}(?:\s|$)|.+$/g) ?? []) {
    response.write(`${JSON.stringify({ message: { role: 'assistant', content: text }, done: false })}\n`);
  }
  if (reply.tool_calls) response.write(`${JSON.stringify({ message: { role: 'assistant', content: '', tool_calls: reply.tool_calls }, done: false })}\n`);
  response.end(`${JSON.stringify({ message: { role: 'assistant', content: '' }, done: true })}\n`);
}

function closeServer(server: Server): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  server.close((error) => error ? reject(error) : resolve());
  return promise;
}

export function startStandin(options: { port?: number; host?: string; g10Mode?: 'normal' | '503'; scenarios?: number[] } = {}): Promise<{ server: Server; url: string; close: () => Promise<void>; evidence: (id: number) => StandinEvidence }> {
  const evidence: Record<number, StandinEvidence> = {};
  const allowed = options.scenarios ? new Set(options.scenarios) : undefined;
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://standin');
    if (request.method === 'GET' && url.pathname === '/api/tags') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ models: [{ name: 'golden-standin' }] }));
      return;
    }
    if (request.method === 'GET' && url.pathname === '/__evidence') {
      const id = Number(url.searchParams.get('scenario'));
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(evidence[id] ?? emptyEvidence()));
      return;
    }
    if (request.method === 'DELETE' && url.pathname === '/__evidence') {
      delete evidence[Number(url.searchParams.get('scenario'))];
      response.statusCode = 204;
      response.end();
      return;
    }
    if (request.method !== 'POST' || url.pathname !== '/api/chat') { response.statusCode = 404; response.end(); return; }
    try {
      const body = await readJson(request);
      const id = scenarioFor(body.messages ?? []);
      const item = evidence[id] ??= emptyEvidence();
      item.requests++;
      if (id === 10 && options.g10Mode === '503') { item.plannerFailures++; response.statusCode = 503; response.end('simulated planner unavailable'); return; }
      if (allowed && !allowed.has(id)) { response.statusCode = 400; response.end('scenario disabled'); return; }
      for (const tool of body.tools ?? []) if (tool.function?.name && !item.offeredTools.includes(tool.function.name)) item.offeredTools.push(tool.function.name);
      for (const message of body.messages ?? []) {
        if (message.role !== 'tool') continue;
        item.toolResults++;
        const name = message.tool_name ?? message.name;
        if (name) item.calls.push(name);
        else item.unknownToolResults++;
        if (successfulSirius(message)) item.successfulStarResults++;
      }
      if (!body.stream && isCorrection(body.messages ?? [])) item.correctiveRetries++;
      const reply = responseFor(id, body);
      writeReply(response, reply, Boolean(body.stream));
    } catch {
      response.statusCode = 400;
      response.end('invalid JSON');
    }
  });
  const { promise, resolve, reject } = Promise.withResolvers<{ server: Server; url: string; close: () => Promise<void>; evidence: (id: number) => StandinEvidence }>();
  server.once('error', reject);
  server.listen(options.port ?? 11555, options.host ?? '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string') { reject(new Error('standin did not bind TCP')); return; }
    resolve({
      server,
      url: `http://${options.host ?? '127.0.0.1'}:${address.port}`,
      evidence: (id) => evidence[id] ?? emptyEvidence(),
      close: () => closeServer(server),
    });
  });
  return promise;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 11555);
  const scenarios = process.env.STANDIN_SCENARIOS?.split(',').filter(Boolean).map(Number);
  startStandin({ port, host: process.env.STANDIN_HOST, g10Mode: process.env.STANDIN_G10_MODE === '503' ? '503' : 'normal', scenarios }).then(({ url }) => console.log(`Ollama stand-in listening at ${url}`));
}

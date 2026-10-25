import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Socket } from 'node:net';

export interface MockResponse {
  status?: number;
  json?: unknown;
  delayMs?: number;
  destroy?: boolean;
}

export type MockHandler = (body: unknown, index: number) => Promise<MockResponse> | MockResponse;

export interface MockServer {
  url: string;
  requests: Array<{ path: string; body: unknown }>;
  setHandler(handler: MockHandler): void;
  close(): Promise<void>;
}

interface ServerOptions {
  endpoint: string;
  urlForPort(port: number): string;
}

function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const { promise, resolve, reject } = Promise.withResolvers<unknown>();
  const parts: Buffer[] = [];
  request.on('data', (chunk: Buffer) => parts.push(chunk));
  request.on('end', () => {
    const text = Buffer.concat(parts).toString('utf8');
    if (text.length === 0) {
      resolve(null);
      return;
    }
    try {
      resolve(JSON.parse(text));
    } catch {
      reject(new Error('invalid JSON request body'));
    }
  });
  request.on('error', reject);
  request.on('aborted', () => reject(new Error('request aborted')));
  return promise;
}

function waitForResponseDelay(response: ServerResponse, delayMs: number): Promise<boolean> {
  if (delayMs <= 0 || response.destroyed) return Promise.resolve(!response.destroyed);
  const { promise, resolve } = Promise.withResolvers<boolean>();
  const timer = setTimeout(() => resolve(!response.destroyed), delayMs);
  const onClose = () => {
    clearTimeout(timer);
    resolve(false);
  };
  response.once('close', onClose);
  return promise.finally(() => response.removeListener('close', onClose));
}

async function startMockServer(initialHandler: MockHandler, options: ServerOptions): Promise<MockServer> {
  let handler = initialHandler;
  const requests: Array<{ path: string; body: unknown }> = [];
  const sockets = new Set<Socket>();
  let requestIndex = 0;

  const server: Server = createServer(async (request, response) => {
    const path = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (request.method !== 'POST' || path !== options.endpoint) {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'not_found' }));
      return;
    }

    let body: unknown;
    try {
      body = await readJsonBody(request);
    } catch {
      if (!response.destroyed) {
        response.writeHead(400, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: 'invalid_json' }));
      }
      return;
    }

    requests.push({ path, body });
    let scripted: MockResponse;
    try {
      scripted = await handler(body, requestIndex);
      requestIndex += 1;
    } catch (error) {
      if (!response.destroyed) {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'handler_failed' }));
      }
      return;
    }

    if (!(await waitForResponseDelay(response, scripted.delayMs ?? 0)) || response.destroyed) return;
    if (scripted.destroy) {
      response.destroy();
      return;
    }
    response.writeHead(scripted.status ?? 200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(scripted.json ?? {}));
  });
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const address = server.address();
  if (address === null || typeof address === 'string') {
    server.close();
    throw new Error('mock server did not bind a TCP port');
  }

  let closed = false;
  return {
    url: options.urlForPort(address.port),
    requests,
    setHandler(next: MockHandler): void {
      handler = next;
    },
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => error === undefined ? resolve() : reject(error));
      });
    },
  };
}

/** Starts an OpenAI-compatible GUIDE endpoint. */
export function startMockGuide(handler: MockHandler): Promise<MockServer> {
  return startMockServer(handler, {
    endpoint: '/v1/chat/completions',
    urlForPort: (port) => `http://127.0.0.1:${port}/v1`,
  });
}

/** Starts a Clef system-one endpoint. */
export function startMockClef(handler: MockHandler): Promise<MockServer> {
  return startMockServer(handler, {
    endpoint: '/v1/systemone',
    urlForPort: (port) => `http://127.0.0.1:${port}`,
  });
}

export function guideText(text: string): MockResponse {
  return { json: { choices: [{ message: { role: 'assistant', content: text } }] } };
}

export function guideToolCalls(calls: Array<{ name: string; args: Record<string, unknown> }>): MockResponse {
  return {
    json: {
      choices: [{
        message: {
          role: 'assistant',
          content: null,
          tool_calls: calls.map((call, index) => ({
            id: `call_${index}`,
            type: 'function',
            function: { name: call.name, arguments: JSON.stringify(call.args) },
          })),
        },
      }],
    },
  };
}

export function guideLeaked(raw: string): MockResponse {
  return guideText(raw);
}

export function clefChoice(question: string, probabilities: Record<string, number>): MockResponse {
  let choice = '';
  let highest = -Infinity;
  for (const [name, probability] of Object.entries(probabilities)) {
    if (probability > highest) {
      choice = name;
      highest = probability;
    }
  }
  return { json: { answers: { [question]: { type: 'choice', choice, probabilities } } } };
}

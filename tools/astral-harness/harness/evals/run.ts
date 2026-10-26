import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GOLDENS, type Golden } from './golden.js';
import { VALID_ERROR_CODES } from './fixtures.js';

export type StreamEvent = { event: 'start' | 'delta' | 'done' | 'error'; data: Record<string, unknown> };
export type StreamResult = { events: StreamEvent[]; text: string; requestId?: string; error?: string };
export type CaseResult = { id: number; title: string; status: 'pass' | 'fail' | 'unverified' | 'blocked'; semantic: string; tools: string; detail?: string };

function parseBlock(block: string): StreamEvent {
  const lines = block.split('\n');
  let event = '';
  const data: string[] = [];
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  if (event !== 'start' && event !== 'delta' && event !== 'done' && event !== 'error') throw new Error(`unexpected SSE event ${event || '(missing)'}`);
  if (data.length === 0) throw new Error(`SSE ${event} event has no data`);
  let parsed: unknown;
  try { parsed = JSON.parse(data.join('\n')); } catch { throw new Error(`SSE ${event} data is not JSON`); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error(`SSE ${event} data must be an object`);
  return { event, data: parsed as Record<string, unknown> };
}

export async function parseSse(body: ReadableStream<Uint8Array>): Promise<StreamResult> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  const events: StreamEvent[] = [];
  const consume = (final = false): void => {
    for (;;) {
      const separator = /\r?\n\r?\n/.exec(pending);
      if (!separator || separator.index === undefined) break;
      const block = pending.slice(0, separator.index).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      pending = pending.slice(separator.index + separator[0].length);
      if (block) events.push(parseBlock(block));
    }
    if (final && pending.trim()) throw new Error('incomplete SSE event');
  };
  for (;;) {
    const { value, done } = await reader.read();
    if (value) { pending += decoder.decode(value, { stream: !done }); consume(); }
    if (done) break;
  }
  pending += decoder.decode();
  consume(true);
  if (events.length === 0) throw new Error('empty SSE stream');
  const start = events[0];
  if (start.event !== 'start' || typeof start.data.request_id !== 'string') throw new Error('stream must begin with start request_id');
  const requestId = start.data.request_id;
  let terminal = false;
  let error: string | undefined;
  let text = '';
  for (let index = 1; index < events.length; index++) {
    const item = events[index];
    if (terminal) throw new Error('event follows terminal SSE event');
    if (item.event === 'start') throw new Error('duplicate start event');
    if (item.event === 'delta') {
      if (typeof item.data.text !== 'string') throw new Error('delta text must be a string');
      text += item.data.text;
    }
    if (item.event === 'done') {
      if (item.data.request_id !== requestId) throw new Error('done request_id does not match start');
      terminal = true;
    }
    if (item.event === 'error') {
      if (typeof item.data.code !== 'string' || !VALID_ERROR_CODES[item.data.code]) throw new Error('invalid SSE error code');
      error = item.data.code;
      terminal = true;
    }
  }
  if (!terminal) throw new Error('SSE stream ended without done or error');
  return { events, text, requestId, error };
}

function headers(): HeadersInit {
  const value: Record<string, string> = { 'content-type': 'application/json', accept: 'text/event-stream' };
  if (process.env.EVAL_COOKIE) value.cookie = process.env.EVAL_COOKIE;
  if (process.env.EVAL_AUTHORIZATION) value.authorization = process.env.EVAL_AUTHORIZATION;
  return value;
}

export async function postChat(apiBaseUrl: string, golden: Golden): Promise<StreamResult> {
  const response = await fetch(`${apiBaseUrl.replace(/\/$/, '')}/api/agent/chat`, { method: 'POST', headers: headers(), body: JSON.stringify(golden.request), signal: AbortSignal.timeout(70_000) });
  if (!response.ok) throw new Error(`pre-stream HTTP ${response.status}`);
  if (!response.body) throw new Error('missing response body');
  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('text/event-stream')) throw new Error(`expected text/event-stream, got ${contentType || 'none'}`);
  return parseSse(response.body);
}

type Evidence = { offeredTools: string[]; calls: string[]; toolResults: number; unknownToolResults: number; correctiveRetries: number; plannerFailures: number; requests: number; successfulStarResults: number };
async function evidenceFor(base: string | undefined, id: number): Promise<Evidence | undefined> {
  if (!base) return undefined;
  const response = await fetch(`${base.replace(/\/$/, '')}/__evidence?scenario=${id}`, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) return undefined;
  const parsed = await response.json() as Partial<Evidence>;
  if (!Array.isArray(parsed.offeredTools) || !Array.isArray(parsed.calls) || typeof parsed.toolResults !== 'number') return undefined;
  return {
    offeredTools: parsed.offeredTools,
    calls: parsed.calls,
    toolResults: parsed.toolResults,
    unknownToolResults: typeof parsed.unknownToolResults === 'number' ? parsed.unknownToolResults : 0,
    correctiveRetries: typeof parsed.correctiveRetries === 'number' ? parsed.correctiveRetries : 0,
    plannerFailures: typeof parsed.plannerFailures === 'number' ? parsed.plannerFailures : 0,
    requests: typeof parsed.requests === 'number' ? parsed.requests : 0,
    successfulStarResults: typeof parsed.successfulStarResults === 'number' ? parsed.successfulStarResults : 0,
  };
}

function semantics(golden: Golden, stream: StreamResult): string | undefined {
  if (stream.error) return `stream ended with ${stream.error}`;
  if (/<\||<[^<>]*\|>/.test(stream.text)) return 'template tokens leaked to client';
  const lower = stream.text.toLowerCase();
  const missed = golden.contains.filter((part) => !new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(stream.text));
  if (missed.length) return `missing ${missed.join(', ')}`;
  const leaked = golden.excludes?.find((part) => lower.includes(part.toLowerCase()));
  return leaked ? `forbidden text ${leaked}` : undefined;
}

function toolAssertion(golden: Golden, evidence: Evidence | undefined): string {
  if (!evidence) return 'unverified (no model evidence endpoint)';
  if (!evidence.requests) return 'unverified (no model request observed)';
  if (golden.id === 10) return evidence.plannerFailures > 0 ? 'pass (planner failure observed)' : 'unverified (outage not injected)';
  if (golden.id === 9) return evidence.offeredTools.length === 0 ? 'pass (no tools offered)' : 'fail (tools offered with empty local scope)';
  if (golden.id === 6) return evidence.correctiveRetries === 1 ? 'pass (one corrective retry observed)' : 'fail (expected exactly one corrective retry)';
  if (!golden.tools?.length) return 'pass (no tool assertion)';
  for (const tool of golden.tools) if (!evidence.offeredTools.includes(tool)) return `fail (did not offer ${tool})`;
  for (const tool of golden.tools) {
    if (evidence.calls.includes(tool)) continue;
    if (evidence.unknownToolResults > 0) return `unverified (tool result name omitted; cannot prove ${tool})`;
    return `fail (stand-in did not receive ${tool} call)`;
  }
  if (evidence.toolResults < 1) return 'fail (no tool result returned to model)';
  if ([4, 5].includes(golden.id) && evidence.successfulStarResults < 1) return 'unverified (no successful Sirius tool result established)';
  if ([2, 3, 7, 8, 11].includes(golden.id)) return 'unverified (tool execution observed; backend result semantics require catalog/content assertions)';
  return 'pass (offered, called, and tool result observed)';
}

export async function runGolden(apiBaseUrl: string, golden: Golden, evidenceBase?: string): Promise<CaseResult> {
  try {
    let usableEvidence = evidenceBase;
    try {
      if (usableEvidence) {
        const reset = await fetch(`${usableEvidence.replace(/\/$/, '')}/__evidence?scenario=${golden.id}`, { method: 'DELETE', signal: AbortSignal.timeout(5_000) });
        if (!reset.ok) usableEvidence = undefined;
      }
    } catch { usableEvidence = undefined; }
    const stream = await postChat(apiBaseUrl, golden);
    const semantic = semantics(golden, stream);
    let evidence: Evidence | undefined;
    try { evidence = await evidenceFor(usableEvidence, golden.id); } catch { /* Text checks still apply without model observations. */ }
    const tools = toolAssertion(golden, evidence);
    const status = semantic || tools.startsWith('fail') ? 'fail' : tools.startsWith('unverified') ? 'unverified' : 'pass';
    return { id: golden.id, title: golden.title, status, semantic: semantic ? `fail (${semantic})` : 'pass', tools };
  } catch (error) {
    return { id: golden.id, title: golden.title, status: 'fail', semantic: 'fail', tools: 'unverified', detail: error instanceof Error ? error.message : String(error) };
  }
}

async function saveRecording(results: CaseResult[]): Promise<void> {
  const directory = process.env.EVAL_RECORD_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  const safeEnvironment = (process.env.EVAL_ENVIRONMENT ?? 'unnamed').replace(/[^a-zA-Z0-9._-]/g, '_');
  const safeResults = results.map(({ detail: _detail, ...result }) => result);
  await writeFile(join(directory, `golden-${safeEnvironment}.json`), JSON.stringify({ environment: safeEnvironment, recorded_at: new Date().toISOString(), results: safeResults }, null, 2));
}

export async function runAll(apiBaseUrl = process.env.API_BASE_URL, evidenceBase = process.env.STANDIN_EVIDENCE_URL, selectedId = process.env.EVAL_GOLDEN): Promise<CaseResult[]> {
  const selected = selectedId === undefined ? GOLDENS : GOLDENS.filter((golden) => golden.id === Number(selectedId));
  if (selected.length === 0) throw new Error(`EVAL_GOLDEN must name one of ${GOLDENS.map((golden) => golden.id).join(', ')}`);
  if (!apiBaseUrl) return selected.map((golden) => ({ id: golden.id, title: golden.title, status: 'blocked', semantic: 'blocked', tools: 'unverified', detail: 'API_BASE_URL is required; no backend was contacted.' }));
  const results: CaseResult[] = [];
  for (const golden of selected) results.push(await runGolden(apiBaseUrl, golden, evidenceBase));
  await saveRecording(results);
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const results = await runAll();
  const environment = process.env.EVAL_ENVIRONMENT ?? 'unnamed';
  console.log(`golden baseline: ${environment}`);
  for (const result of results) console.log(`g${result.id} ${result.status}: semantic ${result.semantic}; tools ${result.tools}${result.detail ? `; ${result.detail.slice(0, 200)}` : ''}`);
  process.exitCode = results.some((result) => result.status !== 'pass') ? 1 : 0;
}

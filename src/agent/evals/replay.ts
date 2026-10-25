import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';

import Fastify from 'fastify';

import { agentRoutes } from '../index.js';
import type { SseEvent } from '../types.js';
import { isPlainObject, stableStringify } from '../util.js';
import { createFixtureBackend, createFixtureDb, fixtureAuth } from './fixtures.js';
import { clefChoice, startMockClef, startMockGuide, type MockHandler } from './mock-servers.js';
import { EVAL_NOW, loadGoldenCases, type EvalRecording, type GoldenCase } from './reliability.js';

export type ReplayRecord = EvalRecording;

export interface StrictReplay {
  handler: MockHandler;
  readonly consumed: number;
  assertNoMismatch(): void;
  assertCaseExhausted(caseId: number): void;
  assertExhausted(): void;
}

function isRecording(value: unknown): value is EvalRecording {
  if (!isPlainObject(value)) return false;
  const { caseId, request, response, elapsedMs } = value;
  return typeof caseId === 'number'
    && Number.isInteger(caseId)
    && response !== null
    && isPlainObject(response)
    && typeof response.status === 'number'
    && Number.isInteger(response.status)
    && 'body' in response
    && typeof elapsedMs === 'number'
    && Number.isFinite(elapsedMs)
    && elapsedMs >= 0
    && request !== undefined;
}

function firstDifference(expected: unknown, actual: unknown, path = '$'): string | null {
  if (Object.is(expected, actual)) return null;
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (expected.length !== actual.length) return `${path}.length`;
    for (let index = 0; index < expected.length; index++) {
      const mismatch = firstDifference(expected[index], actual[index], `${path}[${index}]`);
      if (mismatch !== null) return mismatch;
    }
    return null;
  }
  if (isPlainObject(expected) && isPlainObject(actual)) {
    const expectedKeys = Object.keys(expected).sort();
    const actualKeys = Object.keys(actual).sort();
    if (stableStringify(expectedKeys) !== stableStringify(actualKeys)) return `${path} keys`;
    for (const key of expectedKeys) {
      const mismatch = firstDifference(expected[key], actual[key], `${path}.${key}`);
      if (mismatch !== null) return mismatch;
    }
    return null;
  }
  return path;
}

/** Replays only the exact upstream conversation captured by the eval runner. */
export function createStrictReplay(records: readonly EvalRecording[]): StrictReplay {
  let cursor = 0;
  let mismatch: string | null = null;
  const handler: MockHandler = (body) => {
    const record = records[cursor];
    if (record === undefined) {
      mismatch = 'recording exhausted before the model conversation completed';
      throw new Error(mismatch);
    }
    const difference = firstDifference(record.request, body);
    if (difference !== null) {
      mismatch = `record ${cursor + 1} for case ${record.caseId} does not match the model request at ${difference}`;
      throw new Error(mismatch);
    }
    cursor++;
    return { status: record.response.status, json: record.response.body, delayMs: record.elapsedMs };
  };
  return {
    handler,
    get consumed() {
      return cursor;
    },
    assertNoMismatch() {
      if (mismatch !== null) throw new Error(mismatch);
    },
    assertCaseExhausted(caseId) {
      const next = records[cursor];
      if (next !== undefined && next.caseId === caseId) {
        throw new Error(`case ${caseId} expected ${records.slice(cursor).filter((record) => record.caseId === caseId).length} more record(s)`);
      }
    },
    assertExhausted() {
      const remaining = records.length - cursor;
      if (remaining > 0) throw new Error(`replay expected ${remaining} more record(s)`);
    },
  };
}

function recordingsDirectory(): string {
  return new URL('./recordings/', import.meta.url).pathname;
}

function loadLatestRecording(): { path: string; records: EvalRecording[] } {
  const directory = recordingsDirectory();
  const files = readdirSync(directory)
    .filter((name) => name.endsWith('.jsonl'))
    .sort();
  const file = files.at(-1);
  if (file === undefined) throw new Error('No eval recording found. Run AGENT_RECORD=true npm run eval:mock first.');
  const path = join(directory, file);
  const records = readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line, index): EvalRecording => {
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        throw new Error(`${basename(path)} line ${index + 1} is not JSON`);
      }
      if (!isRecording(value)) throw new Error(`${basename(path)} line ${index + 1} is not a valid eval record`);
      return value;
    });
  if (records.length === 0) throw new Error(`${basename(path)} contains no records`);
  return { path, records };
}

function parseSse(body: string): SseEvent[] {
  const events: SseEvent[] = [];
  for (const frame of body.split('\n\n')) {
    if (frame.trim() === '') continue;
    const eventLine = frame.split('\n').find((line) => line.startsWith('event: '));
    const dataLine = frame.split('\n').find((line) => line.startsWith('data: '));
    if (eventLine === undefined || dataLine === undefined) throw new Error(`invalid SSE frame: ${frame}`);
    events.push({
      event: eventLine.slice('event: '.length),
      data: JSON.parse(dataLine.slice('data: '.length)),
    } as SseEvent);
  }
  return events;
}

function validateScenario(scenario: GoldenCase, events: SseEvent[], modelRequests: number): string[] {
  const failures: string[] = [];
  const meta = events.find((event): event is Extract<SseEvent, { event: 'meta' }> => event.event === 'meta');
  if (meta?.data.skill !== scenario.expect.skill) failures.push(`expected skill ${scenario.expect.skill}`);
  const tools = events
    .filter((event): event is Extract<SseEvent, { event: 'tool' }> => event.event === 'tool')
    .filter((event) => event.data.status === 'start')
    .map((event) => event.data.name);
  const expectedTools = scenario.expect.tools ?? [];
  if (stableStringify(tools) !== stableStringify(expectedTools)) {
    failures.push(`expected tools ${JSON.stringify(expectedTools)}, got ${JSON.stringify(tools)}`);
  }
  const blocked = events.some((event) => event.event === 'tool' && event.data.status === 'blocked');
  if (blocked !== (scenario.expect.blocked === true)) failures.push(`expected blocked=${scenario.expect.blocked === true}`);
  if (scenario.expect.noTools === true && modelRequests !== 0) failures.push(`expected no model requests, got ${modelRequests}`);
  const done = events.filter((event): event is Extract<SseEvent, { event: 'done' }> => event.event === 'done');
  if (done.length !== 1 || done[0]?.data.reason !== 'complete') failures.push('expected one complete terminal event');
  return failures;
}

async function runCase(baseUrl: string, scenario: GoldenCase): Promise<SseEvent[]> {
  const response = await fetch(`${baseUrl}/agent/chat`, {
    method: 'POST',
    headers: { authorization: `Bearer test-${scenario.user}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      messages: scenario.prompt === '' ? [] : [{ role: 'user', content: scenario.prompt }],
      context: scenario.context,
    }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`case ${scenario.id} returned HTTP ${response.status}: ${body}`);
  return parseSse(body);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 0) throw new Error('Usage: npm run eval:replay');
  const loaded = loadLatestRecording();
  const replay = createStrictReplay(loaded.records);
  const guide = await startMockGuide(replay.handler);
  const clef = await startMockClef(() => clefChoice('moderation', { allow: 0.9, spam: 0.05, block: 0.05 }));
  const auth = fixtureAuth();
  const now = () => EVAL_NOW;
  const app = Fastify();
  const db = createFixtureDb();
  const backend = createFixtureBackend({ now });
  const failures: string[] = [];
  try {
    await app.register(agentRoutes, {
      db,
      backend,
      authenticate: auth.authenticate,
      getUserId: auth.getUserId,
      config: { guideBaseUrl: guide.url, guideModel: 'fixture-guide', clefBaseUrl: clef.url, clefModel: 'fixture-clef' },
      now,
    });
    const baseUrl = await app.listen({ port: 0, host: '127.0.0.1' });
    for (const scenario of loadGoldenCases()) {
      const before = replay.consumed;
      try {
        const events = await runCase(baseUrl, scenario);
        replay.assertNoMismatch();
        replay.assertCaseExhausted(scenario.id);
        const errors = validateScenario(scenario, events, replay.consumed - before);
        if (errors.length > 0) failures.push(`case ${scenario.id}: ${errors.join('; ')}`);
      } catch (error) {
        failures.push(`case ${scenario.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    try {
      replay.assertExhausted();
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  } finally {
    await app.close();
    await guide.close();
    await clef.close();
  }
  if (failures.length > 0) throw new Error(failures.join('\n'));
  process.stdout.write(`replay: ${loadGoldenCases().length}/${loadGoldenCases().length} scenarios passed from ${basename(loaded.path)}\n`);
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

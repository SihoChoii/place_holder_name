import { appendFile, mkdir } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import Fastify from 'fastify';

import { agentRoutes } from '../index.js';
import { configFromEnv } from '../config.js';
import { upsertBlurb } from '../memory/knowledge.js';
import type { AgentOptions, SseEvent } from '../types.js';
import { isPlainObject } from '../util.js';
import { createFixtureBackend, createFixtureDb, fixtureAuth } from './fixtures.js';
import { clefChoice, startMockClef, startMockGuide, type MockResponse, type MockServer } from './mock-servers.js';

export interface GoldenExpectation {
  skill: string;
  tools?: string[];
  blocked?: boolean;
  noTools?: boolean;
}

export interface GoldenCase {
  id: number;
  prompt: string;
  user: string;
  context: Record<string, unknown>;
  expect: GoldenExpectation;
  script: unknown[];
}

export interface EvalScore {
  passed: number;
  total: number;
  validCalls: number;
  callCases: number;
  failures: string[];
  elapsedMs: number;
}

export interface EvaluationAdapter extends AgentOptions {
  headersForUser?: (userId: string) => Record<string, string>;
  close?: () => void | Promise<void>;
}

interface EvaluationEnvironment {
  options: AgentOptions;
  headersForUser(userId: string): Record<string, string>;
  close(): void | Promise<void>;
}

interface RecordingResponse {
  status: number;
  body: unknown;
}

export interface EvalRecording {
  caseId: number;
  request: unknown;
  response: RecordingResponse;
  elapsedMs: number;
}

interface CliOptions {
  mock: boolean;
  adapterPath?: string;
}

export const EVAL_NOW = 1_700_000_000_000;

function isGoldenExpectation(value: unknown): value is GoldenExpectation {
  if (!isPlainObject(value) || typeof value.skill !== 'string') return false;
  return (value.tools === undefined || (Array.isArray(value.tools) && value.tools.every((tool) => typeof tool === 'string')))
    && (value.blocked === undefined || typeof value.blocked === 'boolean')
    && (value.noTools === undefined || typeof value.noTools === 'boolean');
}

function isGoldenCase(value: unknown): value is GoldenCase {
  return isPlainObject(value)
    && typeof value.id === 'number'
    && Number.isInteger(value.id)
    && typeof value.prompt === 'string'
    && typeof value.user === 'string'
    && isPlainObject(value.context)
    && isGoldenExpectation(value.expect)
    && Array.isArray(value.script);
}

export function loadGoldenCases(): GoldenCase[] {
  const parsed: unknown = JSON.parse(readFileSync(new URL('./golden.json', import.meta.url), 'utf8'));
  if (!Array.isArray(parsed) || parsed.length !== 20 || !parsed.every(isGoldenCase)) {
    throw new Error('golden.json must contain exactly 20 valid evaluation scenarios');
  }
  const ids = new Set(parsed.map((scenario) => scenario.id));
  if (ids.size !== 20) throw new Error('golden.json contains duplicate scenario IDs');
  return parsed;
}

function parseCli(args: string[]): CliOptions {
  let mock = false;
  let adapterPath: string | undefined;
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === '--mock') {
      mock = true;
      continue;
    }
    if (arg === '--adapter') {
      const value = args[++index];
      if (value === undefined || value.trim() === '') throw new Error('--adapter requires a local module path');
      adapterPath = value;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { mock, ...(adapterPath === undefined ? {} : { adapterPath }) };
}

function isEvaluationAdapter(value: unknown): value is EvaluationAdapter {
  if (!isPlainObject(value)) return false;
  const { db, backend, config, authenticate, getUserId, fetch, now, headersForUser, close } = value;
  return db !== null
    && typeof db === 'object'
    && backend !== null
    && typeof backend === 'object'
    && isPlainObject(config)
    && typeof config.guideBaseUrl === 'string'
    && typeof config.guideModel === 'string'
    && typeof authenticate === 'function'
    && typeof getUserId === 'function'
    && (fetch === undefined || typeof fetch === 'function')
    && (now === undefined || typeof now === 'function')
    && (headersForUser === undefined || typeof headersForUser === 'function')
    && (close === undefined || typeof close === 'function');
}

async function loadAdapter(adapterPath: string): Promise<EvaluationAdapter> {
  // The operator supplies this trusted local integration module at runtime.
  const loaded: unknown = await import(pathToFileURL(resolve(adapterPath)).href);
  if (!isPlainObject(loaded) || !isEvaluationAdapter(loaded.default)) {
    throw new Error('The evaluation adapter default export must satisfy AgentOptions.');
  }
  return loaded.default;
}

function fixtureEnvironment(guideBaseUrl: string, clefBaseUrl: string): EvaluationEnvironment {
  const auth = fixtureAuth();
  const now = () => EVAL_NOW;
  return {
    options: {
      db: createFixtureDb(),
      backend: createFixtureBackend({ now }),
      authenticate: auth.authenticate,
      getUserId: auth.getUserId,
      config: { guideBaseUrl, guideModel: 'fixture-guide', clefBaseUrl, clefModel: 'fixture-clef' },
      now,
    },
    headersForUser(userId) {
      return { authorization: `Bearer test-${userId}` };
    },
    close() {},
  };
}

function adapterEnvironment(adapter: EvaluationAdapter): EvaluationEnvironment {
  return {
    options: adapter,
    headersForUser(userId) {
      return adapter.headersForUser?.(userId) ?? { authorization: `Bearer test-${userId}` };
    },
    close() {
      return adapter.close?.();
    },
  };
}

function scriptResponse(value: unknown): MockResponse {
  if (!isPlainObject(value)) throw new Error('golden script response must be an object');
  const { status, json, delayMs, destroy } = value;
  if (status !== undefined && (typeof status !== 'number' || !Number.isInteger(status))) {
    throw new Error('golden script status must be an integer');
  }
  if (delayMs !== undefined && (typeof delayMs !== 'number' || !Number.isFinite(delayMs) || delayMs < 0)) {
    throw new Error('golden script delayMs must be a non-negative number');
  }
  if (destroy !== undefined && typeof destroy !== 'boolean') throw new Error('golden script destroy must be a boolean');
  return {
    ...(status === undefined ? {} : { status }),
    ...(json === undefined ? {} : { json }),
    ...(delayMs === undefined ? {} : { delayMs }),
    ...(destroy === undefined ? {} : { destroy }),
  };
}

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (!isPlainObject(value)) return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    output[key] = /^(authorization|cookie|set-cookie|password|secret|access_token|refresh_token)$/i.test(key)
      ? '[redacted]'
      : sanitize(child);
  }
  return output;
}

function parseSse(body: string): SseEvent[] {
  const events: SseEvent[] = [];
  for (const frame of body.split('\n\n')) {
    if (frame.trim() === '') continue;
    const eventLine = frame.split('\n').find((line) => line.startsWith('event: '));
    const dataLine = frame.split('\n').find((line) => line.startsWith('data: '));
    if (eventLine === undefined || dataLine === undefined) throw new Error(`invalid SSE frame: ${frame}`);
    const event = eventLine.slice('event: '.length);
    const data: unknown = JSON.parse(dataLine.slice('data: '.length));
    events.push({ event, data } as SseEvent);
  }
  return events;
}

async function startEvaluationServer(environment: EvaluationEnvironment): Promise<{ baseUrl: string; close(): Promise<void> }> {
  const app = Fastify();
  await app.register(agentRoutes, environment.options);
  const address = await app.listen({ port: 0, host: '127.0.0.1' });
  return {
    baseUrl: address,
    close: () => app.close(),
  };
}

function validateScenario(scenario: GoldenCase, events: SseEvent[], guideRequests: number): string[] {
  const failures: string[] = [];
  const meta = events.find((event): event is Extract<SseEvent, { event: 'meta' }> => event.event === 'meta');
  if (meta?.data.skill !== scenario.expect.skill) {
    failures.push(`expected skill ${scenario.expect.skill}, got ${meta?.data.skill ?? 'no meta event'}`);
  }

  const tools = events
    .filter((event): event is Extract<SseEvent, { event: 'tool' }> => event.event === 'tool')
    .filter((event) => event.data.status === 'start')
    .map((event) => event.data.name);
  const expectedTools = scenario.expect.tools ?? [];
  if (JSON.stringify(tools) !== JSON.stringify(expectedTools)) {
    failures.push(`expected tools ${JSON.stringify(expectedTools)}, got ${JSON.stringify(tools)}`);
  }

  const blocked = events.some((event) => event.event === 'tool' && event.data.status === 'blocked');
  if ((scenario.expect.blocked === true) !== blocked) {
    failures.push(`expected blocked=${scenario.expect.blocked === true}, got ${blocked}`);
  }

  if (scenario.expect.noTools === true && guideRequests !== 0) {
    failures.push(`expected no model requests, got ${guideRequests}`);
  }

  const done = events.filter((event): event is Extract<SseEvent, { event: 'done' }> => event.event === 'done');
  if (done.length !== 1 || done[0]?.data.reason !== 'complete') {
    failures.push(`expected one complete terminal event, got ${JSON.stringify(done)}`);
  }
  if (scenario.id === 20 && !events.some((event) => event.event === 'card'
    && !('kind' in event.data) && event.data.hyg_id === 91262)) {
    failures.push('demo tap must emit the selected star fact card without a model call');
  }
  return failures;
}

async function evaluateScenario(
  baseUrl: string,
  headers: Record<string, string>,
  scenario: GoldenCase,
): Promise<{ events: SseEvent[]; elapsedMs: number }> {
  const started = performance.now();
  const response = await fetch(`${baseUrl}/agent/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify({
      messages: scenario.prompt === '' ? [] : [{ role: 'user', content: scenario.prompt }],
      context: scenario.context,
    }),
  });
  const body = await response.text();
  const elapsedMs = Math.round(performance.now() - started);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${body}`);
  return { events: parseSse(body), elapsedMs };
}

async function makeRecordingWriter(): Promise<(record: EvalRecording) => Promise<void>> {
  const directory = new URL('./recordings/', import.meta.url);
  await mkdir(directory, { recursive: true });
  const path = new URL(`recording-${Date.now()}.jsonl`, directory);
  return async (record) => {
    await appendFile(path, `${JSON.stringify(record)}\n`);
  };
}

export async function runReliability(options: CliOptions): Promise<EvalScore> {
  const scenarios = loadGoldenCases();
  const recording = process.env.AGENT_RECORD === 'true';
  if (recording && (!options.mock || options.adapterPath !== undefined)) {
    throw new Error('AGENT_RECORD=true is allowed only for fixture-backed --mock evaluation.');
  }
  const writeRecording = recording ? await makeRecordingWriter() : null;
  const started = performance.now();
  let guide: MockServer | null = null;
  let clef: MockServer | null = null;
  let environment: EvaluationEnvironment | null = null;
  let server: { baseUrl: string; close(): Promise<void> } | null = null;
  const failures: string[] = [];
  let validCalls = 0;
  let callCases = 0;

  try {
    if (options.mock) {
      guide = await startMockGuide(() => ({ status: 500, json: { error: 'unconfigured script' } }));
      clef = await startMockClef(() => clefChoice('moderation', { allow: 0.9, spam: 0.05, block: 0.05 }));
      environment = fixtureEnvironment(guide.url, clef.url);
    } else if (options.adapterPath !== undefined) {
      environment = adapterEnvironment(await loadAdapter(options.adapterPath));
    } else {
      const cfg = configFromEnv();
      environment = fixtureEnvironment(cfg.guideBaseUrl, cfg.clefBaseUrl ?? 'http://127.0.0.1:9');
      environment.options = { ...environment.options, config: cfg };
    }

    server = await startEvaluationServer(environment);
    for (const scenario of scenarios) {
      if (scenario.id === 20 && options.adapterPath === undefined) {
        upsertBlurb(environment.options.db, {
          hyg_id: 91262, text: 'Vega is 25.04 light-years away.',
          speech_script: null, model: 'fixture-cache', created_at: EVAL_NOW,
        });
      }
      const guideBefore = guide?.requests.length ?? 0;
      if (guide !== null) {
        const replies = scenario.script.map(scriptResponse);
        guide.setHandler(async (body) => {
          const response = replies.shift();
          if (response === undefined) throw new Error(`golden case ${scenario.id} exhausted its GUIDE script`);
          if (writeRecording !== null) {
            await writeRecording({
              caseId: scenario.id,
              request: sanitize(body),
              response: { status: response.status ?? 200, body: sanitize(response.json ?? {}) },
              elapsedMs: response.delayMs ?? 0,
            });
          }
          return response;
        });
      }

      try {
        const result = await evaluateScenario(server.baseUrl, environment.headersForUser(scenario.user), scenario);
        const guideRequests = (guide?.requests.length ?? 0) - guideBefore;
        const scenarioFailures = validateScenario(scenario, result.events, guideRequests);
        if (scenario.expect.noTools !== true && scenario.expect.tools !== undefined && scenario.expect.tools.length > 0) {
          callCases++;
          if (scenarioFailures.length === 0) validCalls++;
        }
        if (scenarioFailures.length > 0) failures.push(`case ${scenario.id}: ${scenarioFailures.join('; ')}`);
      } catch (error) {
        if (scenario.expect.noTools !== true && scenario.expect.tools !== undefined && scenario.expect.tools.length > 0) callCases++;
        failures.push(`case ${scenario.id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  } finally {
    await server?.close();
    await environment?.close();
    await guide?.close();
    await clef?.close();
  }

  return {
    passed: scenarios.length - failures.length,
    total: scenarios.length,
    validCalls,
    callCases,
    failures,
    elapsedMs: Math.round(performance.now() - started),
  };
}

function printScore(mode: 'mock' | 'live', score: EvalScore): void {
  process.stdout.write(`${mode}: ${score.passed}/${score.total} scenarios passed; valid tool-call cases ${score.validCalls}/${score.callCases}; ${score.elapsedMs}ms\n`);
  for (const failure of score.failures) process.stderr.write(`${failure}\n`);
}

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  const score = await runReliability(options);
  printScore(options.mock ? 'mock' : 'live', score);
  const callValidity = score.callCases === 0 ? 0 : score.validCalls / score.callCases;
  if (score.failures.length > 0 || (!options.mock && callValidity < 0.85)) process.exitCode = 1;
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}

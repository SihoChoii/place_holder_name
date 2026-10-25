import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import type Database from 'better-sqlite3';

import Fastify, { type FastifyInstance, type FastifyRequest, type preHandlerHookHandler } from 'fastify';

import { agentRoutes } from '../src/agent/index.js';
import { createFixtureBackend, createFixtureDb, type FixtureState } from '../src/agent/evals/fixtures.js';
import {
  clefChoice,
  guideLeaked,
  guideText,
  guideToolCalls,
  startMockClef,
  startMockGuide,
  type MockServer,
} from '../src/agent/evals/mock-servers.js';
import { upsertBlurb } from '../src/agent/memory/knowledge.js';
import { prewarm } from '../src/agent/prewarm.js';
import type { BackendReads } from '../src/agent/types.js';

const VEGA = 91262;
const SIRIUS = 32349;
const VEGA_TAG = '00000000-0000-4000-8000-000000000001';
const PENDING_TAG = '00000000-0000-4000-8000-000000000002';

type SseFrame = { event: string; data: Record<string, unknown> };
type FixtureBackend = BackendReads & { state: FixtureState };

type Harness = {
  app: FastifyInstance;
  url: string;
  db: Database.Database;
  backend: FixtureBackend;
  close(): Promise<void>;
};


function local(message: string, ids: number[] = [VEGA], selected: number | undefined = VEGA) {
  return {
    messages: message === '' ? [] : [{ role: 'user', content: message }],
    context: {
      client: 'ios',
      mode: 'local',
      hyg_ids: ids,
      ...(selected === undefined ? {} : { hyg_id: selected }),
    },
  };
}

function explore(message: string, client: 'ios' | 'web' = 'ios') {
  return {
    messages: [{ role: 'user', content: message }],
    context: { client, mode: 'explore' },
  };
}

function frameList(text: string): SseFrame[] {
  return text.trim().split(/\n\n+/).filter(Boolean).map((frame) => {
    const event = /^event: ([^\n]+)$/m.exec(frame)?.[1];
    const data = /^data: (.+)$/m.exec(frame)?.[1];
    assert.notEqual(event, undefined, `missing SSE event in ${frame}`);
    assert.notEqual(data, undefined, `missing SSE data in ${frame}`);
    return { event: event as string, data: JSON.parse(data as string) as Record<string, unknown> };
  });
}

async function chat(
  harness: Harness,
  body: unknown,
  user = 'u1',
  signal?: AbortSignal,
): Promise<{ response: Response; frames: SseFrame[] }> {
  const response = await fetch(`${harness.url}/agent/chat`, {
    method: 'POST',
    headers: { authorization: `Bearer test-${user}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const text = await response.text();
  return { response, frames: response.status === 200 ? frameList(text) : [] };
}

function events(frames: readonly SseFrame[], event: string): SseFrame[] {
  return frames.filter((frame) => frame.event === event);
}

function deltaText(frames: readonly SseFrame[]): string {
  return events(frames, 'delta').map((frame) => String(frame.data.text)).join('');
}

function addUser(harness: Pick<Harness, 'db' | 'backend'>, id: string): void {
  if (!harness.backend.state.users.has(id)) {
    harness.backend.state.users.set(id, { id, display_name: id });
    harness.db.prepare('INSERT INTO users (id, display_name) VALUES (?, ?)').run(id, id);
  }
}

async function startHarness(
  guide: MockServer,
  clef: MockServer | null = null,
  backend?: FixtureBackend,
  now: () => number = () => 1_700_000_000_000,
): Promise<Harness> {
  const db = createFixtureDb();
  const reads = backend ?? createFixtureBackend({ now });
  const app = Fastify();
  const authenticate: preHandlerHookHandler = async (request, reply) => {
    const token = /^Bearer test-(u[\w-]+)$/.exec(request.headers.authorization ?? '');
    if (token === null || !reads.state.users.has(token[1] as string)) {
      return reply.code(401).send({ error: 'unauthorized' });
    }
  };
  await app.register(agentRoutes, {
    db,
    backend: reads,
    authenticate,
    getUserId: (request: FastifyRequest) => /^Bearer test-(u[\w-]+)$/.exec(request.headers.authorization ?? '')?.[1] ?? '',
    config: {
      guideBaseUrl: guide.url,
      guideModel: 'fixture-guide',
      ...(clef === null ? {} : { clefBaseUrl: clef.url, clefModel: 'fixture-clef' }),
      timeoutMs: 500,
      toolTimeoutMs: 2_000,
    },
    now,
  });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  assert(address !== null && typeof address !== 'string');
  return {
    app,
    url: `http://127.0.0.1:${address.port}`,
    db,
    backend: reads,
    async close(): Promise<void> {
      app.server.closeAllConnections();
      await app.close();
      db.close();
    },
  };
}
async function verificationOne(guide: MockServer): Promise<void> {
  guide.setHandler(() => guideText('Vega is 25.04 light-years away.'));
  const harness = await startHarness(guide);
  try {
    const tap = await chat(harness, local(''));
    assert.equal(tap.response.status, 200);
    assert.deepEqual(tap.frames.map((frame) => frame.event).filter((event) => ['start', 'meta', 'card', 'delta', 'speech', 'done'].includes(event)), ['start', 'meta', 'card', 'delta', 'speech', 'done']);
    const card = events(tap.frames, 'card')[0]?.data;
    assert.equal(card?.distance_ly, 25.04);
    assert.equal((card?.travel as { speed_c?: number } | undefined)?.speed_c, 0.9);
    assert.equal(events(tap.frames, 'speech')[0]?.data.audio_url, null);
    assert.equal(events(tap.frames, 'done').length, 1);

    guide.setHandler((body) => {
      assert(body && typeof body === 'object' && 'messages' in body);
      assert.match(JSON.stringify(body.messages), /Vega is 25\.04 light-years away/);
      return guideText('Vega looks brilliant tonight.');
    });
    const followUp = await chat(harness, local('Tell me about Vega', [VEGA, SIRIUS]));
    assert.equal(followUp.response.status, 200);
    assert.equal(deltaText(followUp.frames), 'Vega looks brilliant tonight.');
    const persisted = harness.db.prepare('SELECT COUNT(*) AS count FROM agent_messages WHERE content = ?').get('Tell me about Vega') as { count: number };
    assert.equal(persisted.count, 1);
  } finally {
    await harness.close();
  }
}

async function verificationTwo(guide: MockServer): Promise<void> {
  const harness = await startHarness(guide);
  try {
    upsertBlurb(harness.db, {
      hyg_id: VEGA,
      text: 'Vega is 25.04 light-years away.',
      speech_script: null,
      model: 'fixture-guide',
      created_at: 1,
    });
    const before = guide.requests.length;
    const cached = await chat(harness, local(''));
    assert.equal(cached.response.status, 200);
    assert.equal(events(cached.frames, 'card')[0]?.data.source, 'cache');
    assert.equal(guide.requests.length, before);
    const outOfView = await chat(harness, local('', [SIRIUS], VEGA));
    assert.equal(outOfView.response.status, 400);
    assert.equal(guide.requests.length, before);
  } finally {
    await harness.close();
  }
}

async function verificationThree(guide: MockServer): Promise<void> {
  let call = 0;
  guide.setHandler(() => {
    call++;
    if (call === 1) return guideToolCalls([{ name: 'get_star_facts', args: { hyg_id: SIRIUS } }]);
    if (call === 2) return guideToolCalls([{ name: 'get_view_content', args: { hyg_ids: [VEGA, SIRIUS] } }]);
    return guideText('A visible detail is available.');
  });
  const harness = await startHarness(guide);
  try {
    const result = await chat(harness, local('Inspect local stars'));
    assert.equal(result.response.status, 200);
    const serialized = JSON.stringify(result.frames);
    assert.doesNotMatch(serialized, /Sirius|SECRET-PENDING-U2|Ignore previous instructions/);
    assert(events(result.frames, 'tool').some((frame) => frame.data.name === 'get_star_facts' && frame.data.status === 'blocked'));
    assert(events(result.frames, 'tool').some((frame) => frame.data.name === 'get_view_content' && frame.data.status === 'blocked'));
    const pending = await chat(harness, local('Why is my comment not showing?'));
    assert.doesNotMatch(JSON.stringify(pending.frames), /SECRET-PENDING-U2/);
    const history = harness.db.prepare('SELECT content FROM agent_messages').all() as Array<{ content: string }>;
    assert(history.every((row) => !row.content.includes('SECRET-PENDING-U2')));
    const digest = harness.db.prepare('SELECT json FROM community_digest').all() as Array<{ json: string }>;
    assert(digest.every((row) => !row.json.includes('SECRET-PENDING-U2')));
  } finally {
    await harness.close();
  }
}

async function verificationFour(guide: MockServer, clef: MockServer): Promise<void> {
  let call = 0;
  guide.setHandler(() => {
    call++;
    if (call === 1) return guideToolCalls([{ name: 'explore_search', args: { q: 'Vega', limit: 3 } }]);
    if (call === 2) return guideText('Vega is a bright target.');
    if (call === 3) return guideToolCalls([{ name: 'propose_tag', args: { hyg_id: VEGA, note: 'Vega shines tonight.' } }]);
    if (call === 4) return guideText('A draft is ready for confirmation.');
    if (call === 5) return guideToolCalls([{ name: 'propose_tag', args: { hyg_id: SIRIUS, note: 'Sirius shines tonight.' } }]);
    if (call === 6) return guideText('This draft cannot be prepared.');
    if (call === 7) return guideToolCalls([{ name: 'propose_comment', args: { tag_id: VEGA_TAG, body: 'A calm observation.' } }]);
    return guideText('A draft is ready for confirmation.');
  });
  clef.setHandler(() => clefChoice('moderation', { allow: 0.9, spam: 0.05, block: 0.05 }));
  const harness = await startHarness(guide, clef);
  try {
    const web = await chat(harness, {
      messages: [{ role: 'user', content: 'Find Vega' }],
      context: { client: 'web', mode: 'local' },
    });
    assert.equal(events(web.frames, 'meta')[0]?.data.mode, 'explore');
    assert.match(JSON.stringify(web.frames), /Vega/);
    const webClaim = await chat(harness, explore('Claim this star for me', 'web'));
    assert.equal(events(webClaim.frames, 'card').some((frame) => frame.data.kind === 'draft'), false);
    assert.equal(guide.requests.some((request) => JSON.stringify(request.body).includes('propose_claim')), false);

    const owner = await chat(harness, local('Tag this with a note'));
    assert(events(owner.frames, 'card').some((frame) => frame.data.kind === 'draft' && frame.data.verdict === 'approved' && frame.data.requires_confirmation === true), JSON.stringify(owner.frames));
    const nonOwner = await chat(harness, local('Tag this with a note', [SIRIUS], SIRIUS));
    assert(events(nonOwner.frames, 'tool').some((frame) => frame.data.name === 'propose_tag' && frame.data.status === 'blocked'));
    assert.equal(events(nonOwner.frames, 'card').some((frame) => frame.data.kind === 'draft'), false);
    clef.setHandler(() => ({ delayMs: 2_000, json: {} }));
    const pending = await chat(harness, local('Comment on this post'));
    assert.equal(events(pending.frames, 'card').some((frame) => frame.data.kind === 'draft' && frame.data.verdict === 'pending'), true);
  } finally {
    await harness.close();
  }
}

async function verificationFive(guide: MockServer): Promise<void> {
  const harness = await startHarness(guide);
  try {
    guide.setHandler(() => guideLeaked('<|tool_call>call:get_star_facts{'));
    const malformed = await chat(harness, local('Tell me about Vega'));
    assert.equal(events(malformed.frames, 'done').length, 1);
    assert.equal(events(malformed.frames, 'done')[0]?.data.reason, 'fallback');

    guide.setHandler(() => ({ destroy: true }));
    const unavailable = await chat(harness, local('Tell me about Vega'));
    assert.equal(events(unavailable.frames, 'done').length, 1);
    assert.equal(events(unavailable.frames, 'done')[0]?.data.reason, 'fallback');

    guide.setHandler(() => guideText('Vega is 999 light-years away.'));
    const unsupportedNumber = await chat(harness, local(''));
    assert.equal(events(unsupportedNumber.frames, 'done')[0]?.data.reason, 'fallback');
    assert.match(deltaText(unsupportedNumber.frames), /25\.04/);

    let round = 0;
    guide.setHandler(() => {
      round++;
      return guideToolCalls([{ name: round === 4 ? 'get_star_facts' : 'get_star_facts', args: { hyg_id: VEGA } }]);
    });
    const finalCall = await chat(harness, local('Tell me about Vega'));
    assert.equal(events(finalCall.frames, 'done').length, 1);
    assert.equal(events(finalCall.frames, 'done')[0]?.data.reason, 'fallback');
    const lastRequest = guide.requests.at(-1)?.body as { tools?: unknown[] };
    assert.deepEqual(lastRequest.tools, undefined);

    guide.setHandler(() => guideLeaked('<|tool_call>call:get_star_facts{"hyg_id":91262}<tool_call|>'));
    const leaked = await chat(harness, local('Tell me about Vega'));
    assert.equal(events(leaked.frames, 'tool').some((frame) => frame.data.name === 'get_star_facts' && frame.data.status === 'end'), true);
  } finally {
    await harness.close();
  }
}

async function verificationSix(guide: MockServer): Promise<void> {
  guide.setHandler(() => ({ delayMs: 400, json: { choices: [{ message: { role: 'assistant', content: 'Vega is 25.04 light-years away.' } }] } }));
  const harness = await startHarness(guide);
  try {
    for (let index = 3; index <= 12; index++) addUser(harness, `u${index}`);
    const active = new AbortController();
    const first = await fetch(`${harness.url}/agent/chat`, {
      method: 'POST', headers: { authorization: 'Bearer test-u1', 'content-type': 'application/json' }, body: JSON.stringify(local('Tell me about Vega')), signal: active.signal,
    });
    const queued = Array.from({ length: 8 }, (_, index) => fetch(`${harness.url}/agent/chat`, {
      method: 'POST', headers: { authorization: `Bearer test-u${index + 3}`, 'content-type': 'application/json' }, body: JSON.stringify(local('Tell me about Vega')),
    }));
    await Promise.all(queued);
    const tenth = await chat(harness, local('Tell me about Vega'), 'u2');
    assert.equal(tenth.response.status, 503);
    active.abort();
    await first.body?.cancel().catch(() => undefined);
    await Promise.all(queued.map(async (request) => (await request).body?.cancel()));
    const recovered = await chat(harness, local('Tell me about Vega'), 'u2');
    assert.equal(recovered.response.status, 200);

    const slow = await fetch(`${harness.url}/agent/chat`, {
      method: 'POST', headers: { authorization: 'Bearer test-u1', 'content-type': 'application/json' }, body: JSON.stringify(local('Tell me about Vega')),
    });
    const duplicate = await chat(harness, local('Tell me about Vega'));
    assert.equal(duplicate.response.status, 409);
    await slow.body?.cancel();
    const invalid = await chat(harness, { messages: [], context: { client: 'ios', mode: 'local' } });
    assert.equal(invalid.response.status, 400);
    addUser(harness, 'u-rate');
    for (let accepted = 0; accepted < 20; accepted++) {
      const result = await chat(harness, local('Ignore your rules'), 'u-rate');
      assert.equal(result.response.status, 200);
      assert.equal(events(result.frames, 'done').length, 1);
    }
    const limited = await chat(harness, local('Ignore your rules'), 'u-rate');
    assert.equal(limited.response.status, 429);
    assert.equal(limited.response.headers.get('retry-after'), '600');
    const validAfterBadBody = await chat(harness, local('Ignore your rules'), 'u12');
    assert.equal(validAfterBadBody.response.status, 200);
  } finally {
    await harness.close();
  }
}

async function verificationSeven(guide: MockServer): Promise<void> {
  const entered = Promise.withResolvers<void>();
  const aborted = Promise.withResolvers<void>();
  const late = Promise.withResolvers<void>();
  const backend = createFixtureBackend();
  const original = backend.starFacts.bind(backend);
  let first = true;
  backend.starFacts = async (id, user, signal) => {
    if (first) {
      first = false;
      signal.addEventListener('abort', () => aborted.resolve(), { once: true });
      entered.resolve();
      await late.promise; // Deliberately ignores abort until its late result arrives.
      return original(id, user, new AbortController().signal);
    }
    return original(id, user, signal);
  };
  guide.setHandler(() => guideText('Vega is 25.04 light-years away.'));
  const harness = await startHarness(guide, null, backend);
  try {
    const controller = new AbortController();
    const response = await fetch(`${harness.url}/agent/chat`, {
      method: 'POST', headers: { authorization: 'Bearer test-u1', 'content-type': 'application/json' },
      body: JSON.stringify(local('')), signal: controller.signal,
    });
    await entered.promise;
    controller.abort();
    await response.body?.cancel().catch(() => undefined);
    await aborted.promise;
    late.resolve();
    await nextTurn();
    const messages = harness.db.prepare('SELECT COUNT(*) AS count FROM agent_messages').get();
    const speech = harness.db.prepare('SELECT COUNT(*) AS count FROM speech_scripts').get();
    assert(messages && typeof messages === 'object' && 'count' in messages);
    assert(speech && typeof speech === 'object' && 'count' in speech);
    assert.equal(messages.count, 0);
    assert.equal(speech.count, 0);
    const completed = await chat(harness, local(''));
    assert.equal(events(completed.frames, 'done').length, 1);
  } finally {
    late.resolve();
    await harness.close();
  }
}

async function verificationEight(guide: MockServer): Promise<void> {
  guide.setHandler(() => guideText('Vega is 25.04 light-years away.'));
  const harness = await startHarness(guide);
  try {
    const controller = new AbortController();
    const first = await prewarm({ db: harness.db, backend: harness.backend, config: { guideBaseUrl: guide.url, guideModel: 'fixture-guide' }, wikipedia: false }, controller.signal);
    assert.deepEqual(first, { requested: 50, cached: 50, failed: 0 });
    const rows = harness.db.prepare('SELECT COUNT(*) AS count FROM star_blurbs').get() as { count: number };
    assert.equal(rows.count, 50);
    const second = await prewarm({ db: harness.db, backend: harness.backend, config: { guideBaseUrl: guide.url, guideModel: 'fixture-guide' }, wikipedia: false }, controller.signal);
    assert.deepEqual(second, { requested: 50, cached: 50, failed: 0 });
    assert.equal((harness.db.prepare('SELECT COUNT(*) AS count FROM star_blurbs').get() as { count: number }).count, 50);
    guide.setHandler(() => ({ destroy: true }));
    const fallbackDb = createFixtureDb();
    try {
      const fallback = await prewarm({ db: fallbackDb, backend: harness.backend, config: { guideBaseUrl: guide.url, guideModel: 'fixture-guide', timeoutMs: 100 }, wikipedia: false }, controller.signal);
      assert.deepEqual(fallback, { requested: 50, cached: 50, failed: 0 });
    } finally {
      fallbackDb.close();
    }
  } finally {
    await harness.close();
  }
}

async function verificationNine(guide: MockServer, clef: MockServer): Promise<void> {
  guide.setHandler(() => guideText('The sky looks beautiful.'));
  clef.setHandler((body) => {
    const questions = (body as { questions: Record<string, { criteria: Record<string, string> }> }).questions;
    if (questions.skill) {
      const keys = Object.keys(questions.skill.criteria);
      return {
        ...clefChoice('skill', Object.fromEntries(keys.map((key) => [key, key === 'star_qa' ? 1 : 0]))),
        delayMs: 150,
      };
    }
    return clefChoice('moderation', { allow: 0.9, spam: 0.05, block: 0.05 });
  });
  const harness = await startHarness(guide, clef);
  try {
    const routed = await chat(harness, local('Describe this celestial scene'));
    assert.equal(events(routed.frames, 'meta')[0]?.data.skill, 'star_qa');
    assert(clef.requests.some((request) => JSON.stringify(request.body).includes('"skill"')));
    let step = 0;
    guide.setHandler(() => [
      guideToolCalls([{ name: 'get_view_content', args: { hyg_ids: [VEGA] } }]),
      guideToolCalls([{ name: 'list_comments', args: { tag_id: VEGA_TAG } }]),
      guideText('Your own pending comments remain visible to you.'),
    ][step++] ?? guideText('The sky looks beautiful.'));
    const comments = await chat(harness, local('Why is my comment not showing?'));
    assert.deepEqual(events(comments.frames, 'tool').filter((frame) => frame.data.status === 'start').map((frame) => frame.data.name), ['get_view_content', 'list_comments']);
    assert.doesNotMatch(JSON.stringify(comments.frames), /SECRET-PENDING-U2/);
    step = 0;
    guide.setHandler(() => [
      guideToolCalls([{ name: 'get_view_content', args: { hyg_ids: [VEGA] } }]),
      guideToolCalls([{ name: 'propose_comment', args: { tag_id: VEGA_TAG, body: 'A good clear night.' } }]),
      guideText('Confirm the comment in the app.'),
    ][step++] ?? guideText('The sky looks beautiful.'));
    const draft = await chat(harness, local('Comment on this post'));
    assert(events(draft.frames, 'card').some((frame) => frame.data.kind === 'draft' && frame.data.action === 'comment' && frame.data.requires_confirmation === true));
  } finally {
    await harness.close();
  }
}

async function main(): Promise<void> {
  const guide = await startMockGuide(() => guideText('Vega is 25.04 light-years away.'));
  const clef = await startMockClef(() => clefChoice('moderation', { allow: 0.9, spam: 0.05, block: 0.05 }));
  try {
    const cases = [
      () => verificationOne(guide), () => verificationTwo(guide),
      () => verificationThree(guide), () => verificationFour(guide, clef),
      () => verificationFive(guide), () => verificationSix(guide),
      () => verificationSeven(guide), () => verificationEight(guide),
      () => verificationNine(guide, clef),
    ];
    for (let index = 0; index < cases.length; index++) {
      const started = performance.now();
      await cases[index]();
      console.log(`smoke ${index + 1}/9 passed (${Math.round(performance.now() - started)} ms)`);
    }
    console.log('smoke: 9 verification cases passed');
  } finally {
    await guide.close();
    await clef.close();
  }
}

await main();

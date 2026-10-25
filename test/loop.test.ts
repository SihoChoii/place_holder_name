import assert from 'node:assert/strict';
import test from 'node:test';

import { CatalogIndex } from '../src/agent/catalog.js';
import type { Config } from '../src/agent/config.js';
import type { ParsedRequest } from '../src/agent/context.js';
import { createFixtureBackend, createFixtureDb, FIXTURE_CATALOG } from '../src/agent/evals/fixtures.js';
import { runAgent, type AgentDeps } from '../src/agent/loop.js';
import { upsertBlurb } from '../src/agent/memory/knowledge.js';
import { Digest } from '../src/agent/memory/digest.js';
import { SessionStore } from '../src/agent/memory/sessions.js';
import type { ChatMessage, GuideClient, OpenAiTool } from '../src/agent/model/gemma.js';
import { FifoLimiter, type Ticket } from '../src/agent/model/queue.js';
import { createModerator } from '../src/agent/moderation/pipeline.js';
import { loadSkills, type Route, type Skill } from '../src/agent/skills/router.js';
import { TOOLS } from '../src/agent/tools/registry.js';
import type { RequestCtx, SseEvent } from '../src/agent/types.js';

const VEGA = 91262;
const cfg: Config = {
  guideBaseUrl: 'http://guide.test/v1',
  guideModel: 'guide',
  clefBaseUrl: null,
  clefModel: 'clef',
  maxTokens: 220,
  timeoutMs: 20_000,
  queueDepth: 8,
  toolTimeoutMs: 2_000,
};
const skills = loadSkills(new URL('../src/agent/skills/', import.meta.url), new Set(TOOLS.map((tool) => tool.name)));

class FakeGuide implements GuideClient {
  readonly tools: OpenAiTool[][] = [];
  calls = 0;

  constructor(private readonly replies: ChatMessage[]) {}

  async chat(_messages: ChatMessage[], tools: OpenAiTool[]): Promise<ChatMessage> {
    this.calls++;
    this.tools.push(tools);
    return this.replies.shift() ?? { role: 'assistant', content: 'Stars are wonderful.' };
  }
}

function request(message = '', selected = VEGA): ParsedRequest {
  return {
    message,
    context: { client: 'ios', mode: 'local', hyg_id: selected, hyg_ids: [VEGA], demo: false },
  };
}

function context(message = '', selected: number | undefined = VEGA): RequestCtx {
  return {
    requestId: 'request',
    userId: 'u1',
    mode: 'local',
    client: 'ios',
    inView: new Set([VEGA]),
    ...(selected === undefined ? {} : { selected }),
    demo: false,
    signal: new AbortController().signal,
  };
}

function skill(name: string): Route {
  const selected = skills.get(name);
  if (selected === undefined) throw new Error(`missing skill ${name}`);
  return { kind: 'skill', skill: selected };
}

function deps(guide: GuideClient): AgentDeps {
  const db = createFixtureDb();
  const backend = createFixtureBackend();
  return {
    db,
    backend,
    cfg,
    guide,
    moderator: createModerator({ clefBaseUrl: null, clefModel: 'clef' }),
    catalog: new CatalogIndex(FIXTURE_CATALOG),
    digest: new Digest(db, backend, () => 1_000),
    sessions: new SessionStore(db, () => 1_000),
    skills,
    fetchImpl: globalThis.fetch,
    now: () => 1_000,
  };
}

function immediateTicket(): Ticket {
  const ticket = new FifoLimiter(1, 8).reserve();
  if (ticket === null) throw new Error('ticket unavailable');
  return ticket;
}

async function collect(generator: AsyncGenerator<SseEvent>): Promise<SseEvent[]> {
  const events: SseEvent[] = [];
  for await (const event of generator) events.push(event);
  return events;
}

test('tap emits its live fact card before its first model reply', async () => {
  const guide = new FakeGuide([{ role: 'assistant', content: 'Vega is 25.04 light-years away.' }]);
  const stream = runAgent(deps(guide), request(), context(), skill('star_fact_card'), immediateTicket());
  for await (const event of stream) {
    if (event.event === 'card') {
      assert.equal(event.data.source, 'live');
      assert.equal(guide.calls, 0);
      break;
    }
  }
});

test('cache-only tap does not call the model and builds a fresh cache card', async () => {
  const guide = new FakeGuide([]);
  const agent = deps(guide);
  upsertBlurb(agent.db, {
    hyg_id: VEGA,
    text: 'Vega is 25.04 light-years away.',
    speech_script: null,
    model: 'guide',
    created_at: 1,
  });
  const events = await collect(runAgent(agent, request(), context(), skill('star_fact_card'), null));
  const card = events.find((event): event is Extract<SseEvent, { event: 'card' }> => event.event === 'card');
  assert.equal(guide.calls, 0);
  assert.equal(card?.data.kind, undefined);
  assert.equal((card?.data as { source?: string } | undefined)?.source, 'cache');
});

test('two malformed model replies produce one fallback terminal event', async () => {
  const guide = new FakeGuide([
    { role: 'assistant', content: '<|tool_call>call:get_star_facts{' },
    { role: 'assistant', content: '<|tool_call>call:get_star_facts{' },
  ]);
  const events = await collect(runAgent(deps(guide), request('Tell me about Vega'), context(), skill('star_qa'), immediateTicket()));
  const done = events.filter((event) => event.event === 'done');
  assert.deepEqual(done, [{ event: 'done', data: { reason: 'fallback' } }]);
});

test('final model round receives no tools and returned calls are not run', async () => {
  const call = (id: string): ChatMessage => ({
    role: 'assistant',
    content: null,
    tool_calls: [{ id, type: 'function', function: { name: 'missing_tool', arguments: '{}' } }],
  });
  const guide = new FakeGuide([call('one'), call('two'), call('three'), call('four')]);
  const events = await collect(runAgent(deps(guide), request('Tell me about Vega'), context(), skill('star_qa'), immediateTicket()));
  assert.equal(guide.tools.at(-1)?.length, 0);
  assert.equal(events.filter((event) => event.event === 'tool').length, 6);
  assert.deepEqual(events.at(-1), { event: 'done', data: { reason: 'fallback' } });
});

test('unsupported model number falls back to the factual template', async () => {
  const guide = new FakeGuide([{ role: 'assistant', content: 'Vega is 999 light-years away.' }]);
  const events = await collect(runAgent(deps(guide), request(), context(), skill('star_fact_card'), immediateTicket()));
  assert.equal(events.at(-1)?.event, 'done');
  assert.deepEqual(events.at(-1), { event: 'done', data: { reason: 'fallback' } });
});

test('refusal route calls no model tools', async () => {
  const refusalSkill = skills.get('safety_refusal') as Skill;
  const guide = new FakeGuide([]);
  const events = await collect(runAgent(
    deps(guide),
    request('harm someone'),
    context('harm someone'),
    { kind: 'refusal', skill: refusalSkill, text: 'I can’t help with that.' },
    null,
  ));
  assert.equal(guide.calls, 0);
  assert.equal(events.some((event) => event.event === 'tool'), false);
});

test('only complete model responses persist a session turn', async () => {
  const failed = deps(new FakeGuide([
    { role: 'assistant', content: '<|tool_call>call:get_star_facts{' },
    { role: 'assistant', content: '<|tool_call>call:get_star_facts{' },
  ]));
  await collect(runAgent(failed, request('Tell me about Vega'), context(), skill('star_qa'), immediateTicket()));
  assert.equal((failed.db.prepare('SELECT COUNT(*) AS count FROM agent_sessions').get() as { count: number }).count, 0);

  const complete = deps(new FakeGuide([{ role: 'assistant', content: 'Stars are wonderful.' }]));
  await collect(runAgent(complete, request('Tell me about Vega'), context(), skill('star_qa'), immediateTicket()));
  assert.equal((complete.db.prepare('SELECT COUNT(*) AS count FROM agent_sessions').get() as { count: number }).count, 1);
});

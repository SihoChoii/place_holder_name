import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';

import { Guard } from '../src/agent/guard.js';
import { CatalogIndex } from '../src/agent/catalog.js';
import type { Config } from '../src/agent/config.js';
import { applySchema } from '../src/agent/memory/db.js';
import { Digest } from '../src/agent/memory/digest.js';
import { DEFAULT_PREFS } from '../src/agent/memory/prefs.js';
import { createModerator } from '../src/agent/moderation/pipeline.js';
import { NumberLedger } from '../src/agent/numbers.js';
import { TOOLS } from '../src/agent/tools/registry.js';
import type { ToolEnv } from '../src/agent/tools/types.js';
import type { BackendReads, RequestCtx, StarFacts } from '../src/agent/types.js';

const tagId = '123e4567-e89b-42d3-a456-426614174000';
const cfg: Config = {
  guideBaseUrl: 'http://guide.test/v1',
  guideModel: 'guide',
  clefBaseUrl: null,
  clefModel: 'clef',
  maxTokens: 220,
  timeoutMs: 20_000,
  queueDepth: 8,
  toolTimeoutMs: 20,
};
const stars = [
  { hyg_id: 1, name: 'Alpha', mag: 1, ra_deg: 0, dec_deg: 0, distance_ly: 10 },
  { hyg_id: 2, name: 'Beta', mag: 2, ra_deg: 1, dec_deg: 0, distance_ly: 20 },
  { hyg_id: 3, name: 'Gamma', mag: 3, ra_deg: 1.5, dec_deg: 0, distance_ly: 30 },
] as const;

function facts(id: number, owner = 'u1'): StarFacts {
  const star = stars.find((candidate) => candidate.hyg_id === id);
  if (star === undefined) throw new Error(`unknown star ${id}`);
  return {
    hyg_id: star.hyg_id,
    name: star.name,
    mag: star.mag,
    distance_ly: star.distance_ly,
    claim_state: 'claimable',
    owner_user_id: owner,
  };
}

function makeBackend(overrides: Partial<BackendReads> = {}): BackendReads {
  return {
    async starFacts(id) { return facts(id); },
    async travelTime(id, speed) { return { speed_c: speed, earth_years: id * 10, ship_years: id, years_lost: id * 9 }; },
    async viewContent(ids) { return ids.map((hyg_id) => ({ hyg_id, tags: [] })); },
    async exploreSearch() { return []; },
    async starDetail(id) { return { facts: facts(id), content: { hyg_id: id, tags: [] } }; },
    async nextClaimAt() { return null; },
    async listComments() { return []; },
    async communityFeed() { return []; },
    async tagTarget() { return { hyg_id: 1 }; },
    async catalog() { return stars; },
    async claimedStars() { return []; },
    ...overrides,
  };
}

function makeEnv(opts: { inView?: number[]; backend?: BackendReads; timeoutMs?: number } = {}): ToolEnv {
  const db = new Database(':memory:');
  db.exec('CREATE TABLE users (id TEXT PRIMARY KEY)');
  db.prepare('INSERT INTO users (id) VALUES (?)').run('u1');
  applySchema(db);
  const backend = opts.backend ?? makeBackend();
  const ctx: RequestCtx = {
    requestId: 'request',
    userId: 'u1',
    mode: 'local',
    client: 'ios',
    inView: new Set(opts.inView ?? [1]),
    demo: false,
    signal: new AbortController().signal,
  };
  return {
    backend,
    db,
    ctx,
    prefs: { ...DEFAULT_PREFS },
    moderator: createModerator({ clefBaseUrl: null, clefModel: 'clef' }),
    catalog: new CatalogIndex(stars),
    digest: new Digest(db, backend, () => 1_000),
    cfg: { ...cfg, ...(opts.timeoutMs === undefined ? {} : { toolTimeoutMs: opts.timeoutMs }) },
    now: () => 1_000,
    facts: new Map(),
  };
}

function guard(env: ToolEnv, maxCalls?: number): Guard {
  return new Guard(env, TOOLS, new NumberLedger(), maxCalls);
}

test('denies off-view scalar and array identifiers before backend reads', async () => {
  let factReads = 0;
  let viewReads = 0;
  const env = makeEnv({
    inView: [1],
    backend: makeBackend({
      async starFacts(id, user, signal) { factReads++; return facts(id); },
      async viewContent(ids, user, signal) { viewReads++; return ids.map((hyg_id) => ({ hyg_id, tags: [] })); },
    }),
  });
  const execution = guard(env);

  const fact = await execution.run({ id: 'a', name: 'get_star_facts', args: { hyg_id: 2 } });
  const view = await execution.run({ id: 'b', name: 'get_view_content', args: { hyg_ids: [1, 2] } });

  assert.equal(fact.ok, false);
  assert.equal(view.ok, false);
  assert.match(fact.modelText, /Star 2 is not in view/);
  assert.equal(factReads, 0);
  assert.equal(viewReads, 0);
});

test('denies an indirect tag target outside the local view before comments are read', async () => {
  let commentReads = 0;
  const env = makeEnv({
    inView: [1],
    backend: makeBackend({
      async tagTarget() { return { hyg_id: 2 }; },
      async listComments() { commentReads++; return []; },
    }),
  });

  const outcome = await guard(env).run({ id: 'a', name: 'list_comments', args: { tag_id: tagId } });

  assert.equal(outcome.ok, false);
  assert.match(outcome.modelText, /Star 2 is not in view/);
  assert.equal(commentReads, 0);
});

test('filters nearby results to the local view', async () => {
  const outcome = await guard(makeEnv({ inView: [1, 2] })).run({
    id: 'a',
    name: 'find_stars_near',
    args: { hyg_id: 1, radius_deg: 5, mag_limit: 6.5 },
  });

  assert.equal(outcome.ok, true);
  assert.deepEqual(JSON.parse(outcome.modelText).results.map((star: { hyg_id: number }) => star.hyg_id), [2]);
  assert.deepEqual(outcome.refs, [1, 2]);
});

test('counts denied calls against the six-call budget', async () => {
  const execution = guard(makeEnv());
  for (let index = 0; index < 6; index++) {
    const outcome = await execution.run({ id: String(index), name: 'missing_tool', args: {} });
    assert.match(outcome.modelText, /Tool not available/);
  }
  const exhausted = await execution.run({ id: 'last', name: 'missing_tool', args: {} });

  assert.equal(execution.attempts, 7);
  assert.equal(execution.exhausted, true);
  assert.match(exhausted.modelText, /Tool budget used up/);
});

test('reuses a successful repeated read without emitting its card', async () => {
  let reads = 0;
  const env = makeEnv({ backend: makeBackend({ async starFacts(id) { reads++; return facts(id); } }) });
  const execution = guard(env);
  const first = await execution.run({ id: 'one', name: 'get_star_facts', args: { hyg_id: 1 } });
  const repeated = await execution.run({ id: 'two', name: 'get_star_facts', args: { hyg_id: 1 } });

  assert.equal(first.ok, true);
  assert.ok(first.card);
  assert.equal(repeated.ok, true);
  assert.equal(repeated.reused, true);
  assert.equal(repeated.card, undefined);
  assert.equal(reads, 1);
});

test('times out a late backend result and keeps the failed outcome', async () => {
  const deferred = Promise.withResolvers<StarFacts>();
  const late = deferred.promise;
  const env = makeEnv({ backend: makeBackend({ async starFacts() { return late; } }), timeoutMs: 1 });
  const outcome = await guard(env).run({ id: 'a', name: 'get_star_facts', args: { hyg_id: 1 } });
  deferred.resolve(facts(1));
  await late;

  assert.equal(outcome.ok, false);
  assert.match(outcome.modelText, /Tool failed/);
  assert.equal(env.facts.size, 0);
});

test('does not expose another user’s pending comment to the model', async () => {
  const env = makeEnv({
    backend: makeBackend({
      async listComments() {
        return [
          { id: 'approved', tag_id: tagId, author_id: 'u2', display_name: 'Sky', body: 'Approved note', status: 'approved', created_at: 1 },
          { id: 'hidden', tag_id: tagId, author_id: 'u2', display_name: 'Other', body: 'PRIVATE PENDING', status: 'pending', created_at: 2 },
        ];
      },
    }),
  });
  const outcome = await guard(env).run({ id: 'a', name: 'list_comments', args: { tag_id: tagId } });

  assert.equal(outcome.ok, true);
  assert.match(outcome.modelText, /Approved note/);
  assert.doesNotMatch(outcome.modelText, /PRIVATE PENDING/);
});

test('denies a note proposal for a star the caller does not own', async () => {
  const env = makeEnv({ backend: makeBackend({ async starFacts(id) { return facts(id, 'u2'); } }) });
  const outcome = await guard(env).run({ id: 'a', name: 'propose_tag', args: { hyg_id: 1, note: 'Beautiful.' } });

  assert.equal(outcome.ok, false);
  assert.equal(outcome.modelText, JSON.stringify({ error: 'not_owner' }));
});

test('keeps comment proposals pending when Clef is not configured', async () => {
  const outcome = await guard(makeEnv()).run({
    id: 'a',
    name: 'propose_comment',
    args: { tag_id: tagId, body: 'I saw this tonight.' },
  });

  assert.equal(outcome.ok, true);
  assert.match(outcome.modelText, /"verdict":"pending"/);
  assert.deepEqual(outcome.card, {
    kind: 'draft',
    action: 'comment',
    hyg_id: 1,
    tag_id: tagId,
    body: 'I saw this tonight.',
    verdict: 'pending',
    requires_confirmation: true,
  });
});

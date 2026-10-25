import assert from 'node:assert/strict';
import test from 'node:test';

import { templateText } from '../src/agent/fallbacks.js';
import { createFixtureBackend, createFixtureDb, FIXTURE_CATALOG } from '../src/agent/evals/fixtures.js';
import { getBlurb } from '../src/agent/memory/knowledge.js';
import { prewarm } from '../src/agent/prewarm.js';

const star = [...FIXTURE_CATALOG].sort((left, right) => left.mag - right.mag || left.hyg_id - right.hyg_id)[0]!;

test('prewarm stores a factual template when GUIDE is unavailable', async () => {
  const db = createFixtureDb();
  const backend = createFixtureBackend();
  const fetchImpl = (async (): Promise<Response> => {
    throw new Error('guide offline');
  }) as typeof fetch;

  const result = await prewarm({
    db,
    backend,
    config: { guideBaseUrl: 'http://guide.test/v1', guideModel: 'guide' },
    fetch: fetchImpl,
    wikipedia: false,
    limit: 1,
  }, new AbortController().signal);

  assert.deepEqual(result, { requested: 1, cached: 1, failed: 0 });
  assert.equal(getBlurb(db, star.hyg_id)?.text, templateText({
    hyg_id: star.hyg_id,
    name: star.name,
    mag: star.mag,
    distance_ly: star.distance_ly,
    claim_state: 'claimable',
    ...(star.spectral_type === undefined ? {} : { spectral_type: star.spectral_type }),
  }));
});

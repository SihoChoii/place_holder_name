import assert from 'node:assert/strict';
import test from 'node:test';
import { decideModeration } from '../src/agent/moderation/clef.js';
import { applyRules } from '../src/agent/moderation/rules.js';
import { createModerator } from '../src/agent/moderation/pipeline.js';

test('moderation thresholds include exact boundary ties and invalid values fail closed', () => {
  assert.equal(decideModeration({ allow: 0.99, spam: 0, block: 0.7 }), 'rejected');
  assert.equal(decideModeration({ allow: 0.8, spam: 0.49, block: 0.69 }), 'approved');
  assert.equal(decideModeration({ allow: 0.8, spam: 0.5, block: 0.69 }), 'pending');
  assert.equal(decideModeration({ allow: Number.NaN, spam: 0, block: 0 }), 'pending');
  assert.equal(decideModeration({ allow: 0.8, spam: 0, block: 2 }), 'pending');
});

test('rules normalize text and reject unsafe or local links without fetching them', () => {
  const normalized = applyRules({ kind: 'note', text: 'Vｅga is bright' });
  assert.deepEqual(normalized, { verdict: 'continue', text: 'Vega is bright' });
  for (const url of [
    'ftp://example.com/file',
    'http://user:pass@example.com',
    'http://127.0.0.1/private',
    'http://169.254.1.2/private',
    'http://100.64.0.1/private',
    'http://[::1]/private',
    'http://localhost/private',
    'http://inside.local/private',
  ]) {
    assert.equal(applyRules({ kind: 'link', text: 'Read this', url }).verdict, 'rejected', url);
  }
  assert.equal(applyRules({ kind: 'comment', text: 'https://one.example https://two.example https://three.example' }).verdict, 'rejected');
  assert.equal(applyRules({ kind: 'comment', text: 'I will kill you' }).verdict, 'rejected');
});

test('moderator turns malformed Clef probability responses into pending', async () => {
  const moderator = createModerator({ clefBaseUrl: 'http://clef.test', clefModel: 'clef' }, async () => new Response(JSON.stringify({
    answers: { moderation: { type: 'choice', choice: 'allow', probabilities: { allow: 1, spam: 0 } } },
  }), { status: 200 }));
  const result = await moderator.classifyText({ kind: 'note', text: 'Vega looks beautiful.' }, new AbortController().signal);
  assert.deepEqual(result, { verdict: 'pending' });
});

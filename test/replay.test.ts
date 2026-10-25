import assert from 'node:assert/strict';
import test from 'node:test';

import { createStrictReplay, type ReplayRecord } from '../src/agent/evals/replay.js';

const request = {
  model: 'fixture-guide',
  messages: [{ role: 'user', content: 'Tell me about Vega.' }],
  stream: false,
};

const response = { choices: [{ message: { role: 'assistant', content: 'Vega is nearby.' } }] };

test('strict replay returns the recorded model response only for its exact conversation request', () => {
  const records: ReplayRecord[] = [{ caseId: 2, request, response: { status: 200, body: response }, elapsedMs: 17 }];
  const replay = createStrictReplay(records);

  assert.deepEqual(replay.handler(request, 0), { status: 200, json: response, delayMs: 17 });
  replay.assertExhausted();
});

test('strict replay rejects a divergent request and exhausted recordings', () => {
  const records: ReplayRecord[] = [{ caseId: 2, request, response: { status: 200, body: response }, elapsedMs: 0 }];
  const replay = createStrictReplay(records);

  assert.throws(
    () => replay.handler({ ...request, model: 'other-guide' }, 0),
    /record 1 for case 2 does not match the model request/,
  );
  assert.throws(() => replay.assertExhausted(), /expected 1 more record/);

  assert.deepEqual(replay.handler(request, 0), { status: 200, json: response, delayMs: 0 });
  assert.throws(() => replay.handler(request, 1), /recording exhausted/);
});

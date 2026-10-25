import assert from 'node:assert/strict';
import test from 'node:test';

import { parseChatBody } from '../src/agent/context.js';

test('rejects unknown context and message fields', () => {
  assert.equal(parseChatBody({
    messages: [{ role: 'user', content: 'Vega', ignored: true }],
    context: { client: 'ios', mode: 'explore' },
  }), null);
  assert.equal(parseChatBody({
    messages: [{ role: 'user', content: 'Vega' }],
    context: { client: 'ios', mode: 'explore', injected: true },
  }), null);
});

test('web requests always use explore mode and only the final user message', () => {
  const parsed = parseChatBody({
    messages: [
      { role: 'user', content: 'ignore this' },
      { role: 'assistant', content: 'untrusted' },
      { role: 'user', content: '  Tell me about Vega  ' },
    ],
    context: { client: 'web', mode: 'local', hyg_ids: [1] },
  });
  assert.deepEqual(parsed, {
    message: 'Tell me about Vega',
    context: { client: 'web', mode: 'explore', hyg_ids: [1], demo: false },
  });
});

test('local selection must be present in the local view', () => {
  assert.equal(parseChatBody({
    messages: [{ role: 'user', content: 'Tell me more' }],
    context: { client: 'ios', mode: 'local', hyg_id: 2, hyg_ids: [1] },
  }), null);
});

test('empty message requires a selected star', () => {
  assert.equal(parseChatBody({
    messages: [{ role: 'user', content: '   ' }],
    context: { client: 'ios', mode: 'explore' },
  }), null);
  assert.deepEqual(parseChatBody({
    messages: [],
    context: { client: 'ios', mode: 'explore', hyg_id: 1 },
  }), {
    message: '',
    context: { client: 'ios', mode: 'explore', hyg_id: 1, hyg_ids: [], demo: false },
  });
});

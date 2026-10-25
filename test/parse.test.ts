import assert from 'node:assert/strict';
import test from 'node:test';
import { parseReply } from '../src/agent/model/parse.js';

test('parses nested Gemma leaked calls with Gemma string delimiters', () => {
  const result = parseReply({
    role: 'assistant',
    content: '<|tool_call>call:find_star{query:<|"|>M {42}<|"|>, filters:{mag:2}}<tool_call|>',
  }, 'request');
  assert.deepEqual(result, {
    kind: 'calls',
    calls: [{ id: 'request_0', name: 'find_star', args: { query: 'M {42}', filters: { mag: 2 } } }],
  });
});

test('preserves raw Gemma string content with quotes, backslashes, newlines, and nested braces', () => {
  const body = 'Love "Vega"\\path\nwith {nested} braces';
  const result = parseReply({
    role: 'assistant',
    content: `<|tool_call>call:save{body:<|"|>${body}<|"|>, meta:{depth:2}}<tool_call|>`,
  }, 'request');
  assert.deepEqual(result, {
    kind: 'calls',
    calls: [{ id: 'request_0', name: 'save', args: { body, meta: { depth: 2 } } }],
  });
});

test('keeps structured calls strict and atomic', () => {
  const result = parseReply({
    role: 'assistant',
    content: null,
    tool_calls: [
      { id: 'one', type: 'function', function: { name: 'first', arguments: '{"ok":true}' } },
      { id: 'two', type: 'function', function: { name: 'second', arguments: '{bad: true}' } },
    ],
  }, 'request');
  assert.deepEqual(result, { kind: 'broken', raw: '' });
});

test('rejects partial leaked blocks and unknown control tokens', () => {
  assert.equal(parseReply({ role: 'assistant', content: '<|tool_call>call:x{a:1}' }, 'r').kind, 'broken');
  assert.equal(parseReply({ role: 'assistant', content: 'hello <|thinking|>' }, 'r').kind, 'broken');
  assert.equal(parseReply({ role: 'assistant', content: '' }, 'r').kind, 'broken');
});

test('accepts adjacent leaked calls and an adjacent response marker only', () => {
  const result = parseReply({
    role: 'assistant',
    content: '<|tool_call>call:one{a:1}<tool_call|><|tool_response><|tool_call>call:two{b:[2]}<tool_call|>',
  }, 'r');
  assert.deepEqual(result, {
    kind: 'calls',
    calls: [
      { id: 'r_0', name: 'one', args: { a: 1 } },
      { id: 'r_1', name: 'two', args: { b: [2] } },
    ],
  });
});

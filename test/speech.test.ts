import assert from 'node:assert/strict';
import test from 'node:test';
import { toSpeechScript } from '../src/agent/speech/script.js';

test('speech formatter strips markdown and URLs while preserving protected numeric names', () => {
  const script = toSpeechScript('**M31** is [25.04 light years](https://example.com). It is bright!', ['M31']);
  assert.equal(script, 'M31 is twenty-five point zero four light years. [pause] It is bright! Want to know more? Just ask.');
});

test('speech formatter has one pause, appends invitation, and respects character cap', () => {
  const script = toSpeechScript(`First. Second. ${'word '.repeat(200)}Third.`, []);
  assert.ok(script.length <= 600);
  assert.equal((script.match(/\[pause\]/g) ?? []).length, 1);
  assert.ok(script.endsWith('Want to know more? Just ask.'));
  assert.ok(!script.includes('word wordw'));
});

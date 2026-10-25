import assert from 'node:assert/strict';
import test from 'node:test';
import { NumberLedger, retryAfterText, spokenNumber, utcDate } from '../src/agent/numbers.js';

test('number ledger accepts formatted provenance and flags unknown numeric claims', () => {
  const ledger = new NumberLedger();
  ledger.addValue({ distance: 25.04, nested: ['HYG 2026'] });
  ledger.addName('M31');
  assert.deepEqual(ledger.check('M31 is 25.0 light years away, with HYG 2026.'), { ok: true });
  assert.deepEqual(ledger.check('It is twenty-five light years away.'), { ok: true });
  assert.deepEqual(ledger.check('It has 99 planets.'), { ok: false, offending: ['99'] });
  assert.deepEqual(ledger.check('It has ninety-nine planets.'), { ok: false, offending: ['ninety-nine'] });
  assert.deepEqual(ledger.check('It is one of our favorites.'), { ok: true });
});

test('number text helpers provide spoken and display forms', () => {
  assert.equal(spokenNumber('25.04'), 'twenty-five point zero four');
  assert.equal(spokenNumber('2026'), 'two thousand twenty-six');
  assert.equal(retryAfterText(1), '1 second');
  assert.equal(retryAfterText(61), '2 minutes');
  assert.equal(utcDate(Date.UTC(2026, 9, 25, 23, 59)), '2026-10-25');
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { DEFAULT_SKILL, SKILLS, skillFor } from '../src/guide/skills.js';

test('selects travel for case-insensitive travel requests', () => {
  assert.equal(skillFor('HOW LONG would it take to reach Vega?'), SKILLS[0].text);
});

test('matches skill keywords only at word boundaries', () => {
  assert.equal(skillFor('Is a travelogue available for Sirius?'), DEFAULT_SKILL);
  assert.equal(skillFor('Does postage mention Vega?'), DEFAULT_SKILL);
});

test('prioritizes travel when a request overlaps skills', () => {
  assert.equal(skillFor('Compare the travel time to Vega and Sirius.'), SKILLS[0].text);
});

test('selects community and comparison skills', () => {
  assert.equal(skillFor('What have people posted about Vega?'), SKILLS[1].text);
  assert.equal(skillFor('Which star is brighter, Vega or Sirius?'), SKILLS[2].text);
});

test('uses the default skill when no specialized skill matches', () => {
  assert.equal(skillFor('Tell me about Vega.'), DEFAULT_SKILL);
});

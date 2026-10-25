import assert from 'node:assert/strict';
import test from 'node:test';

import { CatalogIndex } from '../src/agent/catalog.js';

const stars = [
  { hyg_id: 1, name: 'Center', mag: 1, ra_deg: 0, dec_deg: 0, distance_ly: 10 },
  { hyg_id: 2, name: 'Near Two', mag: 2, ra_deg: 1, dec_deg: 0, distance_ly: 20 },
  { hyg_id: 3, name: 'Near Three', mag: 1, ra_deg: 1, dec_deg: 0, distance_ly: 30, exoplanets: ['b'] },
  { hyg_id: 4, name: 'Too Dim', mag: 7, ra_deg: 0.5, dec_deg: 0, distance_ly: 40 },
  { hyg_id: 5, name: 'Far', mag: 1, ra_deg: 25, dec_deg: 0, distance_ly: 50 },
] as const;

test('finds nearby stars in separation then identifier order', () => {
  const catalog = new CatalogIndex(stars);

  assert.deepEqual(
    catalog.near(1, 5, 6.5).map(({ star, separation_deg }) => [star.hyg_id, separation_deg]),
    [[2, 1], [3, 1]],
  );
  assert.deepEqual(
    catalog.near(1, 5, 6.5, (id) => id === 3).map(({ star }) => star.hyg_id),
    [3],
  );
  assert.deepEqual(catalog.near(1, 5, 0.5), []);
});

test('uses exact names and whole-name mentions', () => {
  const catalog = new CatalogIndex(stars);

  assert.equal(catalog.findByName('near two')?.hyg_id, 2);
  assert.deepEqual(catalog.namesIn('Near Two is not Near Twos.').map((star) => star.hyg_id), [2]);
  assert.deepEqual(catalog.brightest([2, 3, 4], 2).map((star) => star.hyg_id), [3, 2]);
  assert.equal(catalog.hasExoplanets, true);
});

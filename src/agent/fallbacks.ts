import { NumberLedger } from './numbers.js';
import type { FactCard, StarFacts, Travel } from './types.js';

export const NO_STAR_FALLBACK = 'Facts are unavailable for this star right now.';

/** Formats only backend-supplied values for a model-free factual response. */
export function templateText(facts: StarFacts, travel?: Travel): string {
  const distance = facts.distance_ly === null
    ? "Its distance isn't in our data."
    : `${facts.name} is ${facts.distance_ly} light-years away.`;
  const magnitude = `${facts.name} has apparent magnitude ${facts.mag}.`;
  if (travel === undefined) return `${distance} ${magnitude}`;
  return `${distance} ${magnitude} At ${travel.speed_c}c, the trip takes ${travel.earth_years} Earth years and ${travel.ship_years} ship years.`;
}

/** Produces a public card without copying backend-only fact or ownership identifiers. */
export function factCard(
  facts: StarFacts,
  travel: Travel | undefined,
  source: FactCard['source'],
): FactCard {
  return {
    hyg_id: facts.hyg_id,
    name: facts.name,
    mag: facts.mag,
    distance_ly: facts.distance_ly,
    claim_state: facts.claim_state,
    ...(facts.owner === undefined ? {} : { owner: { display_name: facts.owner.display_name } }),
    ...(facts.claimed_at === undefined ? {} : { claimed_at: facts.claimed_at }),
    ...(facts.next_claim_at === undefined ? {} : { next_claim_at: facts.next_claim_at }),
    ...(travel === undefined ? {} : { travel }),
    source,
  };
}

/** Rejects cached narration that introduces a number not supported by static facts. */
export function validBlurb(text: string, facts: StarFacts, travel?: Travel): boolean {
  const ledger = new NumberLedger();
  ledger.addValue({
    hyg_id: facts.hyg_id,
    name: facts.name,
    mag: facts.mag,
    distance_ly: facts.distance_ly,
    ...(facts.facts === undefined ? {} : { facts: facts.facts }),
    ...(travel === undefined ? {} : { travel }),
  });
  ledger.addName(facts.name);
  return ledger.check(text).ok;
}

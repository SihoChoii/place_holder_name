import { utcDate } from '../numbers.js';
import { untrusted } from '../untrusted.js';
import { getKnowledge } from '../memory/knowledge.js';
import { abortError } from '../util.js';
import type { FactCard, StarFacts } from '../types.js';
import type { ToolDef, ToolEnv, ToolResult } from './types.js';
import { ToolDenied } from './types.js';

const INTEGER_ID = { type: 'integer', minimum: 0 };

function factCard(facts: StarFacts): FactCard {
  return {
    hyg_id: facts.hyg_id,
    name: facts.name,
    mag: facts.mag,
    distance_ly: facts.distance_ly,
    claim_state: facts.claim_state,
    ...(facts.owner === undefined ? {} : { owner: { display_name: facts.owner.display_name } }),
    ...(facts.claimed_at === undefined ? {} : { claimed_at: facts.claimed_at }),
    ...(facts.next_claim_at === undefined ? {} : { next_claim_at: facts.next_claim_at }),
    source: 'live',
  };
}

async function readFacts(env: ToolEnv, hygId: number, signal: AbortSignal): Promise<StarFacts> {
  const cached = env.facts.get(hygId);
  if (cached !== undefined) return cached;
  const facts = await env.backend.starFacts(hygId, env.ctx.userId, signal);
  if (signal.aborted) throw abortError(signal);
  if (facts === null) throw new ToolDenied('not_found');
  env.facts.set(hygId, facts);
  return facts;
}

function factData(env: ToolEnv, facts: StarFacts): Record<string, unknown> {
  const knowledge = getKnowledge(env.db, facts.hyg_id);
  const data: Record<string, unknown> = {
    hyg_id: facts.hyg_id,
    name: facts.name,
    mag: facts.mag,
    distance_ly: facts.distance_ly,
    claim_state: facts.claim_state,
  };
  if (facts.owner !== undefined) data.owner = { display_name: facts.owner.display_name };
  if (facts.claimed_at !== undefined) {
    data.claimed_at = facts.claimed_at;
    data.claimed_on = utcDate(facts.claimed_at);
  }
  if (facts.next_claim_at !== undefined) data.next_claim_at = facts.next_claim_at;
  if (knowledge !== null) {
    if (knowledge.facts.spectral_type !== undefined) data.spectral_type = knowledge.facts.spectral_type;
    if (knowledge.facts.luminosity_solar !== undefined) data.luminosity_solar = knowledge.facts.luminosity_solar;
    if (knowledge.facts.exoplanets !== undefined) data.exoplanets = [...knowledge.facts.exoplanets];
  }
  if (facts.facts !== undefined) data.facts = { ...facts.facts };
  return data;
}

export const getStarFacts: ToolDef = {
  name: 'get_star_facts',
  description: 'Get verified facts and current claim details for one star.',
  parameters: {
    type: 'object',
    properties: { hyg_id: INTEGER_ID },
    required: ['hyg_id'],
    additionalProperties: false,
  },
  modes: ['local', 'explore'],
  clients: ['ios', 'web'],
  access: 'read',
  idArgs: ['hyg_id'],
  async run(args, env, signal): Promise<ToolResult> {
    const hygId = args.hyg_id as number;
    const facts = await readFacts(env, hygId, signal);
    return { data: factData(env, facts), card: factCard(facts), refs: [hygId] };
  },
};

export const getWikipediaSummary: ToolDef = {
  name: 'get_wikipedia_summary',
  description: 'Read the prefetched encyclopedia summary for a star. This never fetches the web.',
  parameters: {
    type: 'object',
    properties: { hyg_id: INTEGER_ID },
    required: ['hyg_id'],
    additionalProperties: false,
  },
  modes: ['local', 'explore'],
  clients: ['ios', 'web'],
  access: 'read',
  idArgs: ['hyg_id'],
  async run(args, env): Promise<ToolResult> {
    const hygId = args.hyg_id as number;
    const knowledge = getKnowledge(env.db, hygId);
    return {
      data: {
        hyg_id: hygId,
        title: knowledge?.wiki_title === null || knowledge === null
          ? null
          : untrusted('wikipedia_title', hygId, knowledge.wiki_title),
        summary: knowledge?.wiki_summary === null || knowledge === null
          ? null
          : untrusted('wikipedia', hygId, knowledge.wiki_summary),
      },
      refs: [hygId],
    };
  },
};

export { factCard, readFacts };

import { untrusted } from '../untrusted.js';
import type { StarDetail, StarSummary } from '../types.js';
import type { ToolDef, ToolResult } from './types.js';
import { ToolDenied } from './types.js';
import { visibleContent } from './view.js';

function summary(star: StarSummary): Record<string, unknown> {
  return { hyg_id: star.hyg_id, name: star.name, mag: star.mag };
}

function detailData(detail: StarDetail, userId: string): Record<string, unknown> {
  const { facts } = detail;
  return {
    hyg_id: facts.hyg_id,
    name: facts.name,
    mag: facts.mag,
    distance_ly: facts.distance_ly,
    claim_state: facts.claim_state,
    ...(facts.owner === undefined ? {} : { owner: { display_name: facts.owner.display_name } }),
    content: visibleContent(detail.content, userId),
  };
}

export const exploreSearch: ToolDef = {
  name: 'explore_search',
  description: 'Search the full catalog by name for stars to explore.',
  parameters: {
    type: 'object',
    properties: {
      q: { type: 'string', minLength: 1, maxLength: 60 },
      limit: { type: 'integer', minimum: 1, maximum: 10 },
    },
    required: ['q'],
    additionalProperties: false,
  },
  modes: ['explore'],
  clients: ['ios', 'web'],
  access: 'read',
  async run(args, env, signal): Promise<ToolResult> {
    const limit = typeof args.limit === 'number' ? args.limit : 10;
    const results = await env.backend.exploreSearch(args.q as string, limit, env.ctx.userId, signal);
    return { data: { results: results.map(summary), result_count: results.length }, refs: results.map((star) => star.hyg_id) };
  },
};

export const getStarDetail: ToolDef = {
  name: 'get_star_detail',
  description: 'Get authorized detailed information and posts for an explored star.',
  parameters: {
    type: 'object',
    properties: { hyg_id: { type: 'integer', minimum: 0 } },
    required: ['hyg_id'],
    additionalProperties: false,
  },
  modes: ['explore'],
  clients: ['ios', 'web'],
  access: 'read',
  idArgs: ['hyg_id'],
  async run(args, env, signal): Promise<ToolResult> {
    const hygId = args.hyg_id as number;
    const detail = await env.backend.starDetail(hygId, env.ctx.userId, signal);
    if (detail === null) throw new ToolDenied('not_found');
    return { data: detailData(detail, env.ctx.userId), refs: [hygId] };
  },
};

export const communityFeed: ToolDef = {
  name: 'community_feed',
  description: 'Read recent approved community observations from the local digest.',
  parameters: {
    type: 'object',
    properties: { limit: { type: 'integer', minimum: 1, maximum: 10 } },
    additionalProperties: false,
  },
  modes: ['explore'],
  clients: ['ios', 'web'],
  access: 'read',
  async run(args, env): Promise<ToolResult> {
    const limit = typeof args.limit === 'number' ? args.limit : 10;
    const items = env.digest.read(limit);
    return {
      data: {
        results: items.map((item) => ({
          tag_id: item.tag_id,
          hyg_id: item.hyg_id,
          display_name: item.display_name,
          note: untrusted('community_post', item.tag_id, item.note),
          created_at: item.created_at,
        })),
        result_count: items.length,
      },
      refs: items.map((item) => item.hyg_id),
    };
  },
};

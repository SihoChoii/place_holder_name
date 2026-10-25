import type { OpenAiTool } from '../model/gemma.js';
import type { RequestCtx } from '../types.js';
import { listComments } from './comments.js';
import { communityFeed, exploreSearch, getStarDetail } from './explore.js';
import { getStarFacts, getWikipediaSummary } from './facts.js';
import { findStarsNear } from './near.js';
import { proposeClaim, proposeComment, proposeTag } from './propose.js';
import { computeTravelTime } from './travel.js';
import type { ToolDef } from './types.js';
import { getViewContent } from './view.js';

export const TOOLS: readonly ToolDef[] = [
  getStarFacts,
  computeTravelTime,
  getViewContent,
  getWikipediaSummary,
  findStarsNear,
  exploreSearch,
  getStarDetail,
  communityFeed,
  listComments,
  proposeClaim,
  proposeTag,
  proposeComment,
];

export function toolsFor(ctx: RequestCtx, names: readonly string[]): ToolDef[] {
  const selected = new Set(names);
  return TOOLS.filter((tool) => tool.access !== 'internal'
    && selected.has(tool.name)
    && tool.modes.includes(ctx.mode)
    && tool.clients.includes(ctx.client));
}

export function toOpenAiTools(tools: readonly ToolDef[]): OpenAiTool[] {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

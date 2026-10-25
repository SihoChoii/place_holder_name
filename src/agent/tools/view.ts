import { untrusted } from '../untrusted.js';
import type { StarContent, StarTag } from '../types.js';
import type { ToolDef, ToolResult } from './types.js';

function visibleTag(tag: StarTag, userId: string): Record<string, unknown> | null {
  const isMine = tag.author_id === userId;
  if (tag.status !== 'approved' && !(tag.status === 'pending' && isMine)) return null;
  return {
    id: tag.id,
    display_name: tag.display_name,
    note: untrusted('tag', tag.id, tag.note),
    ...(isMine ? { is_mine: true, status: tag.status } : {}),
  };
}

function visibleContent(content: StarContent, userId: string): Record<string, unknown> {
  const tags = content.tags
    .map((tag) => visibleTag(tag, userId))
    .filter((tag): tag is Record<string, unknown> => tag !== null);
  return { hyg_id: content.hyg_id, tags, result_count: tags.length };
}

export const getViewContent: ToolDef = {
  name: 'get_view_content',
  description: 'Get visible, authorized posts for stars currently in the local view.',
  parameters: {
    type: 'object',
    properties: {
      hyg_ids: {
        type: 'array',
        items: { type: 'integer', minimum: 0 },
        minItems: 1,
        maxItems: 200,
      },
    },
    required: ['hyg_ids'],
    additionalProperties: false,
  },
  modes: ['local'],
  clients: ['ios'],
  access: 'read',
  idArgs: ['hyg_ids'],
  async run(args, env, signal): Promise<ToolResult> {
    const ids = args.hyg_ids as number[];
    const content = await env.backend.viewContent(ids, env.ctx.userId, signal);
    const permitted = content.filter((item) => env.ctx.mode !== 'local' || env.ctx.inView.has(item.hyg_id));
    return {
      data: { results: permitted.map((item) => visibleContent(item, env.ctx.userId)), result_count: permitted.length },
      refs: permitted.map((item) => item.hyg_id),
    };
  },
};

export { visibleContent };

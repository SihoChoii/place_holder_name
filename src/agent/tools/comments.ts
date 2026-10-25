import { untrusted } from '../untrusted.js';
import type { Comment } from '../types.js';
import type { ToolDef, ToolResult } from './types.js';
import { ToolDenied } from './types.js';
const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';

function visibleComment(comment: Comment, userId: string): Record<string, unknown> | null {
  const isMine = comment.author_id === userId;
  if (comment.status !== 'approved' && !(comment.status === 'pending' && isMine)) return null;
  return {
    id: comment.id,
    tag_id: comment.tag_id,
    display_name: comment.display_name,
    body: untrusted('comment', comment.id, comment.body),
    created_at: comment.created_at,
    ...(isMine ? { is_mine: true, status: comment.status } : {}),
  };
}

export const listComments: ToolDef = {
  name: 'list_comments',
  description: 'List approved comments and the caller’s own pending comments for one authorized post.',
  parameters: {
    type: 'object',
    properties: {
      tag_id: { type: 'string', pattern: UUID_PATTERN },
      limit: { type: 'integer', minimum: 1, maximum: 10 },
    },
    required: ['tag_id'],
    additionalProperties: false,
  },
  modes: ['local', 'explore'],
  clients: ['ios', 'web'],
  access: 'read',
  tagArg: 'tag_id',
  async run(args, env, signal): Promise<ToolResult> {
    const tagId = args.tag_id as string;
    const limit = typeof args.limit === 'number' ? args.limit : 10;
    const target = await env.backend.tagTarget(tagId, env.ctx.userId, signal);
    if (target === null) throw new ToolDenied('not_found');
    const comments = await env.backend.listComments(tagId, env.ctx.userId, limit, signal);
    const visible = comments
      .map((comment) => visibleComment(comment, env.ctx.userId))
      .filter((comment): comment is Record<string, unknown> => comment !== null);
    return { data: { tag_id: tagId, comments: visible, result_count: visible.length }, refs: [target.hyg_id] };
  },
};

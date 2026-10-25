import { retryAfterText } from '../numbers.js';
import { untrusted } from '../untrusted.js';
import type { ClaimState, DraftCard, StarFacts } from '../types.js';
import type { ToolDef, ToolEnv, ToolResult } from './types.js';
import { ToolDenied } from './types.js';
import { readFacts } from './facts.js';

const UUID_PATTERN = '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$';

async function claimState(env: ToolEnv, facts: StarFacts, signal: AbortSignal): Promise<{ state: ClaimState; retry?: number }> {
  if (facts.claim_state === 'claimed') return { state: 'claimed' };
  const next = await env.backend.nextClaimAt(env.ctx.userId, signal);
  if (next !== null && next > env.now()) return { state: 'on_cooldown', retry: Math.ceil((next - env.now()) / 1_000) };
  return { state: 'claimable' };
}

async function verdict(
  env: ToolEnv,
  kind: 'note' | 'comment',
  text: string,
  signal: AbortSignal,
  deadlineMs: number,
): Promise<'approved' | 'pending' | 'rejected'> {
  const allowance = Math.min(1_500, deadlineMs - env.now() - 100);
  if (allowance <= 0) return 'pending';
  return (await env.moderator.classifyText({ kind, text }, signal, { timeoutMs: allowance })).verdict;
}

export const proposeClaim: ToolDef = {
  name: 'propose_claim',
  description: 'Prepare a claim confirmation for a star without making a claim.',
  parameters: {
    type: 'object',
    properties: { hyg_id: { type: 'integer', minimum: 0 } },
    required: ['hyg_id'],
    additionalProperties: false,
  },
  modes: ['local', 'explore'],
  clients: ['ios'],
  access: 'draft',
  idArgs: ['hyg_id'],
  async run(args, env, signal): Promise<ToolResult> {
    const hygId = args.hyg_id as number;
    const state = await claimState(env, await readFacts(env, hygId, signal), signal);
    const card: DraftCard = {
      kind: 'draft',
      action: 'claim',
      hyg_id: hygId,
      state: state.state,
      ...(state.retry === undefined ? {} : { retry_after_seconds: state.retry }),
      requires_confirmation: true,
    };
    return {
      data: {
        hyg_id: hygId,
        state: state.state,
        ...(state.retry === undefined
          ? {}
          : { retry_after_seconds: state.retry, retry_after_text: retryAfterText(state.retry) }),
      },
      card,
      refs: [hygId],
    };
  },
};

export const proposeTag: ToolDef = {
  name: 'propose_tag',
  description: 'Prepare a moderated note for a star the caller owns, without publishing it.',
  parameters: {
    type: 'object',
    properties: {
      hyg_id: { type: 'integer', minimum: 0 },
      note: { type: 'string', maxLength: 140 },
    },
    required: ['hyg_id', 'note'],
    additionalProperties: false,
  },
  modes: ['local', 'explore'],
  clients: ['ios'],
  access: 'draft',
  idArgs: ['hyg_id'],
  async run(args, env, signal, deadlineMs): Promise<ToolResult> {
    const hygId = args.hyg_id as number;
    const note = args.note as string;
    const facts = await readFacts(env, hygId, signal);
    if (facts.owner_user_id !== env.ctx.userId) throw new ToolDenied('not_owner');
    const moderation = await verdict(env, 'note', note, signal, deadlineMs);
    const data = { hyg_id: hygId, note: untrusted('draft_note', hygId, note), verdict: moderation };
    if (moderation === 'rejected') return { data, refs: [hygId] };
    return {
      data,
      card: { kind: 'draft', action: 'tag', hyg_id: hygId, note, verdict: moderation, requires_confirmation: true },
      refs: [hygId],
    };
  },
};

export const proposeComment: ToolDef = {
  name: 'propose_comment',
  description: 'Prepare a moderated comment for an authorized post without publishing it.',
  parameters: {
    type: 'object',
    properties: {
      tag_id: { type: 'string', pattern: UUID_PATTERN },
      body: { type: 'string', minLength: 1, maxLength: 280 },
    },
    required: ['tag_id', 'body'],
    additionalProperties: false,
  },
  modes: ['local', 'explore'],
  clients: ['ios'],
  access: 'draft',
  tagArg: 'tag_id',
  async run(args, env, signal, deadlineMs): Promise<ToolResult> {
    const tagId = args.tag_id as string;
    const body = args.body as string;
    const target = await env.backend.tagTarget(tagId, env.ctx.userId, signal);
    if (target === null) throw new ToolDenied('not_found');
    const moderation = await verdict(env, 'comment', body, signal, deadlineMs);
    const data = { tag_id: tagId, hyg_id: target.hyg_id, body: untrusted('draft_comment', tagId, body), verdict: moderation };
    if (moderation === 'rejected') return { data, refs: [target.hyg_id] };
    return {
      data,
      card: {
        kind: 'draft',
        action: 'comment',
        hyg_id: target.hyg_id,
        tag_id: tagId,
        body,
        verdict: moderation,
        requires_confirmation: true,
      },
      refs: [target.hyg_id],
    };
  },
};

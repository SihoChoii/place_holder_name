import type Database from 'better-sqlite3';

import { CatalogIndex } from './catalog.js';
import { LIMITS, type Config } from './config.js';
import type { ParsedRequest } from './context.js';
import { factCard, NO_STAR_FALLBACK, templateText, validBlurb } from './fallbacks.js';
import { Guard, type Outcome } from './guard.js';
import { getBlurb } from './memory/knowledge.js';
import { Digest } from './memory/digest.js';
import { getPrefs } from './memory/prefs.js';
import { scopeFor, SessionStore } from './memory/sessions.js';
import type { GuideClient, ChatMessage } from './model/gemma.js';
import { ModelError } from './model/gemma.js';
import type { Ticket } from './model/queue.js';
import { parseReply } from './model/parse.js';
import { createModerator, type Moderator } from './moderation/pipeline.js';
import { NumberLedger } from './numbers.js';
import { assemble } from './prompts/assemble.js';
import type { Route, Skill } from './skills/router.js';
import { toSpeechScript } from './speech/script.js';
import { saveSpeechScript } from './speech/store.js';
import { toOpenAiTools, toolsFor } from './tools/registry.js';
import type { ToolEnv } from './tools/types.js';
import type { BackendReads, FactCard, RequestCtx, SseEvent, StarFacts, Travel } from './types.js';
import { chunk } from './util.js';

export interface AgentDeps {
  db: Database.Database;
  backend: BackendReads;
  cfg: Config;
  guide: GuideClient;
  moderator: Moderator;
  catalog: CatalogIndex;
  digest: Digest;
  sessions: SessionStore;
  skills: Map<string, Skill>;
  fetchImpl: typeof fetch;
  now: () => number;
}

function toolExchange(name: string, id: string, result: Outcome): ChatMessage[] {
  return [
    {
      role: 'assistant',
      content: null,
      tool_calls: [{ id, type: 'function', function: { name, arguments: '{}' } }],
    },
    { role: 'tool', tool_call_id: id, content: result.modelText },
  ];
}


function fallbackFor(facts: StarFacts | undefined, travel: Travel | undefined): { text: string; card?: FactCard } {
  if (facts === undefined) return { text: NO_STAR_FALLBACK };
  return { text: templateText(facts, travel), card: factCard(facts, travel, 'template') };
}

function routeText(route: Route): string | null {
  return route.kind === 'skill' ? null : route.text;
}

/** Runs one already-validated request and exposes protocol events independent of HTTP transport. */
export async function* runAgent(
  deps: AgentDeps,
  req: ParsedRequest,
  ctx: RequestCtx,
  route: Route,
  admission: Ticket | null,
): AsyncGenerator<SseEvent> {
  const prefs = getPrefs(deps.db, ctx.userId);
  const allowed = route.kind === 'skill' ? toolsFor(ctx, route.skill.tools) : [];
  const ledger = new NumberLedger();
  const toolEnv: ToolEnv = {
    backend: deps.backend,
    db: deps.db,
    ctx,
    prefs,
    moderator: deps.moderator,
    catalog: deps.catalog,
    digest: deps.digest,
    cfg: deps.cfg,
    now: deps.now,
    facts: new Map(),
  };
  const guard = new Guard(toolEnv, allowed, ledger);
  const selected = ctx.selected;
  let facts: StarFacts | undefined;
  let travel: Travel | undefined;
  let card: FactCard | undefined;
  const eagerMessages: ChatMessage[] = [];
  const isTap = req.message === '' && selected !== undefined;
  const cached = isTap && selected !== undefined ? getBlurb(deps.db, selected) : null;


  yield {
    event: 'meta',
    data: {
      request_id: ctx.requestId,
      mode: ctx.mode,
      client: ctx.client,
      skill: route.skill.name,
      queued_position: admission?.position ?? 0,
    },
  };

  const deterministic = routeText(route);
  if (deterministic !== null) {
    yield* emitComplete(deps, ctx, req.message, deterministic, [], selected);
    return;
  }

  if (isTap) {
    yield { event: 'tool', data: { name: 'get_star_facts', status: 'start' } };
    const factOutcome = await guard.runEager('get_star_facts', { hyg_id: selected });
    yield { event: 'tool', data: { name: 'get_star_facts', status: factOutcome.ok ? 'end' : 'blocked' } };
    eagerMessages.push(...toolExchange('get_star_facts', 'eager_facts', factOutcome));
    facts = toolEnv.facts.get(selected);

    if (facts !== undefined && facts.distance_ly !== null) {
      yield { event: 'tool', data: { name: 'compute_travel_time', status: 'start' } };
      const travelOutcome = await guard.runEager('compute_travel_time', { hyg_id: selected });
      yield { event: 'tool', data: { name: 'compute_travel_time', status: travelOutcome.ok ? 'end' : 'blocked' } };
      eagerMessages.push(...toolExchange('compute_travel_time', 'eager_travel', travelOutcome));
      if (travelOutcome.card !== undefined && !('kind' in travelOutcome.card)) travel = travelOutcome.card.travel;
    }
    if (facts !== undefined && cached === null) {
      card = factCard(facts, travel, 'live');
      yield { event: 'card', data: card };
    }
  }

  if (cached !== null) {
    const cachedText = facts !== undefined && validBlurb(cached.text, facts, travel) ? cached.text : null;
    if (facts !== undefined) {
      yield { event: 'card', data: factCard(facts, travel, cachedText === null ? 'template' : 'cache') };
    }
    const text = cachedText ?? (facts === undefined ? NO_STAR_FALLBACK : templateText(facts, travel));
    yield* emitComplete(deps, ctx, req.message, text, facts === undefined ? [] : [facts.name], selected);
    return;
  }

  const recentNames = deps.sessions.recentStars(ctx.userId, 5)
    .map((id) => deps.catalog.get(id)?.name)
    .filter((name): name is string => name !== undefined);
  const claimedNames = (await deps.backend.claimedStars(ctx.userId, 5, ctx.signal)).map((star) => star.name);
  const skyNames = deps.catalog.brightest(ctx.inView, 20).map((star) => star.name);
  const memory = deps.sessions.load(ctx.userId, scopeFor(ctx), { mode: ctx.mode, inView: ctx.inView });
  const openTools = toOpenAiTools(allowed);
  const messages = assemble({
    ctx,
    skill: route.skill,
    message: req.message,
    selectedName: selected === undefined ? undefined : deps.catalog.get(selected)?.name,
    turns: memory.turns,
    summary: memory.summary,
    recentNames,
    claimedNames,
    skyNames,
    tools: openTools,
  });
  if (messages === null) {
    yield* emitFallback(deps, ctx, req.message, facts, travel, selected);
    return;
  }
  messages.push(...eagerMessages);

  let malformed = 0;
  let completed = false;
  try {
    if (admission !== null) await admission.acquire(ctx.signal);
    for (let round = 0; round < LIMITS.maxRounds; round++) {
      const finalRound = round === LIMITS.maxRounds - 1 || guard.exhausted;
      const roundTools = finalRound ? [] : openTools;
      if (finalRound) messages.push({ role: 'user', content: 'Answer now using the available tool results; do not call tools.' });
      let reply: ChatMessage;
      try {
        reply = await deps.guide.chat(messages, roundTools, ctx.signal, { maxTokens: Math.min(deps.cfg.maxTokens, route.skill.maxTokens) });
      } catch (error) {
        if (ctx.signal.aborted) throw error;
        const code = error instanceof ModelError ? error.code : 'model_unavailable';
        yield { event: 'error', data: { code, message: 'The star guide is busy. Showing saved facts.' } };
        yield* emitFallback(deps, ctx, req.message, facts, travel, selected);
        return;
      }

      const parsed = parseReply(reply, `${ctx.requestId}_${round}`);
      if (parsed.kind === 'broken') {
        malformed++;
        if (malformed >= 2) {
          yield* emitFallback(deps, ctx, req.message, facts, travel, selected);
          return;
        }
        messages.push({ role: 'assistant', content: reply.content });
        messages.push({ role: 'user', content: 'Reply with either a plain answer or valid tool calls only.' });
        continue;
      }
      if (parsed.kind === 'text') {
        const numeric = ledger.check(parsed.text);
        if (!numeric.ok) {
          yield* emitFallback(deps, ctx, req.message, facts, travel, selected);
          return;
        }
        yield* emitComplete(deps, ctx, req.message, parsed.text, deps.catalog.namesIn(parsed.text).map((star) => star.name), selected, guard);
        completed = true;
        return;
      }
      if (finalRound) {
        yield* emitFallback(deps, ctx, req.message, facts, travel, selected);
        return;
      }

      messages.push({ role: 'assistant', content: reply.content, tool_calls: reply.tool_calls });
      for (const call of parsed.calls) {
        yield { event: 'tool', data: { name: call.name, status: 'start' } };
        const outcome = await guard.run(call);
        yield { event: 'tool', data: { name: call.name, status: outcome.ok ? 'end' : 'blocked' } };
        if (outcome.card !== undefined && !outcome.reused) yield { event: 'card', data: outcome.card };
        messages.push({ role: 'tool', tool_call_id: call.id, content: outcome.modelText });
      }
    }
  } finally {
    admission?.release();
    if (!completed) {
      // The return paths above already emitted exactly one terminal event.
    }
  }
}

async function* emitFallback(
  deps: AgentDeps,
  ctx: RequestCtx,
  user: string,
  facts: StarFacts | undefined,
  travel: Travel | undefined,
  selected: number | undefined,
): AsyncGenerator<SseEvent> {
  const fallback = fallbackFor(facts, travel);
  if (fallback.card !== undefined) yield { event: 'card', data: fallback.card };
  yield* emitTerminal(deps, ctx, user, fallback.text, facts === undefined ? [] : [facts.name], selected, 'fallback');
}

async function* emitComplete(
  deps: AgentDeps,
  ctx: RequestCtx,
  user: string,
  text: string,
  names: readonly string[],
  selected: number | undefined,
  guard?: Guard,
): AsyncGenerator<SseEvent> {
  yield* emitTerminal(deps, ctx, user, text, names, selected, 'complete', guard);
}

async function* emitTerminal(
  deps: AgentDeps,
  ctx: RequestCtx,
  user: string,
  text: string,
  names: readonly string[],
  selected: number | undefined,
  reason: 'complete' | 'fallback',
  guard?: Guard,
): AsyncGenerator<SseEvent> {
  for (const part of chunk(text)) yield { event: 'delta', data: { text: part } };
  if (text !== '') {
    const script = toSpeechScript(text, names);
    const speechId = saveSpeechScript(deps.db, { userId: ctx.userId, hygId: selected, script, now: deps.now() });
    yield { event: 'speech', data: { speech_id: speechId, script, voice: getPrefs(deps.db, ctx.userId).voice, audio_url: null } };
  }
  if (reason === 'complete') {
    const refs = selected === undefined ? [] : [selected];
    deps.sessions.save(ctx.userId, scopeFor(ctx), {
      user,
      assistant: text,
      refs,
      topic: 'star guide',
      ...(selected === undefined ? {} : { starName: deps.catalog.get(selected)?.name }),
      speedC: getPrefs(deps.db, ctx.userId).speed_c,
    });
    if (selected !== undefined) deps.sessions.recordRecentStar(ctx.userId, selected);
  }
  void guard;
  yield { event: 'done', data: { reason } };
}

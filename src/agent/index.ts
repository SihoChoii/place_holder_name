import type { OutgoingHttpHeaders, ServerResponse } from 'node:http';

import { randomUUID } from 'node:crypto';

import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

import { CatalogIndex } from './catalog.js';
import { resolveConfig, LIMITS } from './config.js';
import { parseChatBody } from './context.js';
import { applySchema } from './memory/db.js';
import { Digest } from './memory/digest.js';
import { SessionStore } from './memory/sessions.js';
import { SlidingWindowLimiter } from './limits.js';
import { runAgent } from './loop.js';
import { createGuideClient } from './model/gemma.js';
import { FifoLimiter, type Ticket } from './model/queue.js';
import { chooseSkill } from './moderation/clef.js';
import { createModerator } from './moderation/pipeline.js';
import { loadSkills, selectRoute } from './skills/router.js';
import { TOOLS } from './tools/registry.js';
import { getBlurb } from './memory/knowledge.js';
import type { AgentOptions, BackendReads, RequestCtx, SseEvent } from './types.js';
export { ConfigError, configFromEnv, resolveConfig } from './config.js';
export { createModerator } from './moderation/pipeline.js';
export type {
  Access,
  AgentConfig,
  AgentOptions,
  BackendReads,
  CatalogStar,
  Client,
  ClaimState,
  CommunityItem,
  DraftCard,
  ErrorCode,
  FactCard,
  Mode,
  RequestCtx,
  SseEvent,
  StarFacts,
  Travel,
} from './types.js';

let registeredInstance: FastifyInstance | null = null;

const requiredBackendMethods: Array<keyof BackendReads> = [
  'starFacts',
  'travelTime',
  'viewContent',
  'exploreSearch',
  'starDetail',
  'nextClaimAt',
  'listComments',
  'communityFeed',
  'tagTarget',
  'catalog',
  'claimedStars',
];
function eventFrame(event: SseEvent): string {
  return `event: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

async function writeFrame(raw: ServerResponse, event: SseEvent, signal: AbortSignal): Promise<void> {
  if (signal.aborted || raw.writableEnded || raw.destroyed) return;
  if (raw.write(eventFrame(event))) return;
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const onDrain = () => done(resolve);
  const onClose = () => done(() => reject(signal.reason instanceof Error ? signal.reason : new Error('connection closed')));
  const onAbort = () => done(() => reject(signal.reason instanceof Error ? signal.reason : new Error('request aborted')));
  const done = (finish: () => void) => {
    raw.removeListener('drain', onDrain);
    raw.removeListener('close', onClose);
    signal.removeEventListener('abort', onAbort);
    finish();
  };
  raw.once('drain', onDrain);
  raw.once('close', onClose);
  signal.addEventListener('abort', onAbort, { once: true });
  await promise;
}

/** Fastify route plugin for the bounded Star Tagger agent protocol. */
export const agentRoutes: FastifyPluginAsync<AgentOptions> = async (app, options) => {
  if (registeredInstance !== null) throw new Error('agentRoutes may only be registered once at a time');
  registeredInstance = app;
  try {
    for (const method of requiredBackendMethods) {
      if (typeof options.backend[method] !== 'function') throw new Error(`backend.${method} must be a function`);
    }
    applySchema(options.db);
    const cfg = resolveConfig(options.config);
    const now = options.now ?? Date.now;
    const fetchImpl = options.fetch ?? globalThis.fetch;
    const catalog = new CatalogIndex(await options.backend.catalog(new AbortController().signal));
    const guide = createGuideClient(cfg, fetchImpl, new FifoLimiter(1, cfg.queueDepth));
    const moderator = createModerator(cfg, fetchImpl);
    const digest = new Digest(options.db, options.backend, now);
    const sessions = new SessionStore(options.db, now);
    const skills = loadSkills(new URL('./skills/', import.meta.url), new Set(TOOLS.map((tool) => tool.name)));
    const admission = new FifoLimiter(1, cfg.queueDepth);
    const rate = new SlidingWindowLimiter(LIMITS.chatsPerWindow, LIMITS.windowMs, now);
    const active = new Map<string, AbortController>();

    app.addHook('onReady', async () => {
      digest.start();
    });
    app.addHook('onClose', async () => {
      for (const controller of active.values()) controller.abort(new Error('server closing'));
      active.clear();
      digest.stop();
      if (registeredInstance === app) registeredInstance = null;
    });

    app.post('/agent/chat', { bodyLimit: 131_072, preHandler: options.authenticate }, async (request, reply) => {
      const parsed = parseChatBody(request.body);
      if (parsed === null) return reply.code(400).send({ error: 'bad_context' });
      const userId = options.getUserId(request);
      if (active.has(userId)) return reply.code(409).send({ error: 'in_flight' });
      const rateResult = rate.check(userId);
      if (!rateResult.ok) {
        return reply
          .code(429)
          .header('Retry-After', String(rateResult.retryAfterSeconds))
          .send({ error: 'rate_limited', retry_after_seconds: rateResult.retryAfterSeconds });
      }

      const controller = new AbortController();
      active.set(userId, controller);
      let ticket: Ticket | null = null;
      const raw = reply.raw;
      const onAborted = () => controller.abort(new Error('request aborted'));
      const onClose = () => {
        if (!raw.writableEnded) controller.abort(new Error('connection closed'));
      };
      request.raw.once('aborted', onAborted);
      raw.once('close', onClose);
      try {
        const ctx: RequestCtx = {
          requestId: randomUUID(),
          userId,
          mode: parsed.context.mode,
          client: parsed.context.client,
          inView: new Set(parsed.context.hyg_ids),
          ...(parsed.context.hyg_id === undefined ? {} : { selected: parsed.context.hyg_id }),
          ...(parsed.context.ts_ms === undefined ? {} : { tsMs: parsed.context.ts_ms }),
          demo: parsed.context.demo,
          signal: controller.signal,
        };
        const route = await selectRoute(parsed.message, ctx, skills, {
          exoplanets: catalog.hasExoplanets,
          classify: (message, candidates) => chooseSkill(
            cfg.clefBaseUrl,
            cfg.clefModel,
            message,
            candidates,
            ctx.signal,
            fetchImpl,
            LIMITS.clefRoutingMs,
          ),
        });
        const cacheOnly = parsed.message === '' && ctx.selected !== undefined && getBlurb(options.db, ctx.selected) !== null;
        if (route.kind === 'skill' && !cacheOnly && !ctx.demo) {
          ticket = admission.reserve();
          if (ticket === null) return reply.code(503).send({ error: 'queue_full' });
        }
        rate.record(userId);
        reply.hijack();
        const responseHeaders: OutgoingHttpHeaders = {};
        for (const [name, value] of Object.entries(reply.getHeaders())) {
          if (value !== undefined) responseHeaders[name] = value;
        }
        responseHeaders['content-type'] = 'text/event-stream; charset=utf-8';
        responseHeaders['cache-control'] = 'no-cache';
        raw.writeHead(200, responseHeaders);
        await writeFrame(raw, { event: 'start', data: { request_id: ctx.requestId } }, controller.signal);
        let done = false;
        try {
          for await (const event of runAgent({
            db: options.db,
            backend: options.backend,
            cfg,
            guide,
            moderator,
            catalog,
            digest,
            sessions,
            skills,
            fetchImpl,
            now,
          }, parsed, ctx, route, ticket)) {
            if (controller.signal.aborted) break;
            await writeFrame(raw, event, controller.signal);
            if (event.event === 'done') done = true;
          }
          if (!done && !controller.signal.aborted) {
            await writeFrame(raw, { event: 'done', data: { reason: 'fallback' } }, controller.signal);
          }
        } finally {
          if (!raw.writableEnded && !raw.destroyed) raw.end();
        }
      } finally {
        ticket?.release();
        active.delete(userId);
        request.raw.removeListener('aborted', onAborted);
        raw.removeListener('close', onClose);
      }
    });
  } catch (error) {
    if (registeredInstance === app) registeredInstance = null;
    throw error;
  }
};

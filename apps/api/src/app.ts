import { existsSync } from "node:fs";
import { join } from "node:path";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import swagger from "@fastify/swagger";
import fastifyStatic from "@fastify/static";
import { migrate, openDatabase } from "@stargaze/db";
import { API_PREFIX, LIMITS, schemas } from "@stargaze/shared";
import { loadCatalog, type Catalog } from "./catalog/index.js";
import type { Config } from "./config.js";
import { buildCtx, type Ctx } from "./context.js";
import { AppError } from "./lib/errors.js";
import { REPO_ROOT } from "./lib/paths.js";
import { authenticate, PUBLIC } from "./auth/session.js";
import { MediaStore } from "./media/store.js";
import { ClefClient } from "./models/clef.js";
import { GemmaClient } from "./models/gemma.js";
import { ModerationWorker } from "./moderation/worker.js";
import { GuideQueue } from "./guide/service.js";
import authRoutes from "./routes/auth.js";
import agentRoutes from "./routes/agent.js";
import healthRoutes, { Readiness } from "./routes/health.js";
import { contentRoutes, publicRoutes } from "./routes/content.js";

declare module "fastify" {
  interface FastifyInstance { auth: (req: FastifyRequest, reply: FastifyReply) => Promise<void> }
}

export interface BuildOptions {
  now?: () => number;
  catalog?: Catalog;
  /** Start the moderation loop and readiness probes (the server does; most tests drive them manually). */
  background?: boolean;
  logger?: boolean | object;
  webDist?: string | null;
}

export interface Server { app: FastifyInstance; ctx: Ctx; worker: ModerationWorker; readiness: Readiness; store: MediaStore; close(): Promise<void> }

let catalogCache: Catalog | undefined;

/** Construct the API (no listening). index.ts starts it; tests use app.inject(). */
export async function buildApp(config: Config, opts: BuildOptions = {}): Promise<Server> {
  const app = Fastify({
    logger: opts.logger ?? { level: config.logLevel, redact: ["req.headers.authorization", "req.headers.cookie"] },
    trustProxy: config.trustProxy,
    bodyLimit: 64 * 1024,
    ajv: { customOptions: { removeAdditional: false, coerceTypes: "array", allErrors: false } },
  });

  const db = openDatabase(config.dbPath);
  migrate(db);
  const catalog = opts.catalog ?? (catalogCache ??= loadCatalog(config.catalogDir));
  const store = new MediaStore(config.mediaDir);
  const ctx = buildCtx({
    config, db, app, catalog, now: opts.now ?? Date.now,
    clef: new ClefClient(config.clef.baseUrl, config.clef.model, config.clef.callTimeoutMs),
    gemma: new GemmaClient(config.guide.baseUrl, config.guide.model, config.guide.timeoutMs, config.guide.think),
  });
  const worker = new ModerationWorker(ctx, store, (o, msg) => app.log.info(o, msg));
  const readiness = new Readiness(ctx, store);
  const queue = new GuideQueue();

  await app.register(swagger, {
    openapi: { info: { title: "Star Tagger API", version: "1.0.0" }, servers: [{ url: "/" }] },
  });
  await app.register(cookie);
  await app.register(jwt, { secret: config.jwtSecret, sign: { algorithm: "HS256" } });
  await app.register(multipart, {
    limits: { fileSize: LIMITS.maxImageBytes, files: LIMITS.maxAttachments, fields: 10, fieldSize: 16 * 1024, parts: 14 },
  });
  app.addSchema(schemas.ErrorBody);
  // Bodyless POST/PUT/DELETE (claim, logout, reactions) often still carry Content-Type: application/json.
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    if (body === "") return done(null, undefined);
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(new AppError(400, "validation_failed", "Malformed JSON body."), undefined);
    }
  });

  app.decorateRequest("viewer", null as never);
  app.decorate("auth", async (req: FastifyRequest) => { req.viewer = authenticate(ctx, req); });
  app.addHook("onRequest", async (req) => { req.viewer = PUBLIC; });

  app.setErrorHandler((error: Error & { statusCode?: number; code?: string; validation?: unknown }, req, reply) => {
    if (error instanceof AppError) {
      if (error.retryAfterSeconds) reply.header("retry-after", String(error.retryAfterSeconds));
      return reply.code(error.status).send({ error: { code: error.code, message: error.message,
        ...(error.retryAfterSeconds ? { retry_after_seconds: error.retryAfterSeconds } : {}) } });
    }
    if (error.validation) return reply.code(400).send({ error: { code: "validation_failed", message: error.message } });
    if (error.statusCode === 413 || error.code === "FST_REQ_FILE_TOO_LARGE") {
      return reply.code(413).send({ error: { code: "payload_too_large", message: "Request is too large." } });
    }
    if (error.statusCode === 415) return reply.code(415).send({ error: { code: "unsupported_media_type", message: error.message } });
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: { code: "bad_request", message: error.message } });
    }
    req.log.error({ err: error }, "unhandled error");
    return reply.code(500).send({ error: { code: "internal_error", message: "Something went wrong." } });
  });

  await app.register(async (api) => {
    // Covers personalized JSON, auth token issuance, and validation/auth error responses.
    // nosniff: user-supplied media and JSON are never reinterpreted by browsers as another type.
    api.addHook("onRequest", async (_req, reply) => {
      reply.header("cache-control", "private, no-store").header("x-content-type-options", "nosniff");
    });
    await api.register(healthRoutes, { readiness });
    await api.register(authRoutes, { ctx });
    await api.register(publicRoutes, { ctx, store });
    await api.register(agentRoutes, { ctx, queue });
    await api.register(contentRoutes, { ctx, store });
    api.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: { code: "not_found", message: "No such route." } }));
  }, { prefix: API_PREFIX });

  // Next.js static export shares the API origin in production.
  const webDist = opts.webDist === undefined ? join(REPO_ROOT, "apps/web/out") : opts.webDist;
  if (webDist && existsSync(join(webDist, "index.html"))) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false, index: ["index.html"] });
    app.setNotFoundHandler((req, reply) => {
      const path = req.url.split("?")[0];
      if (req.method === "GET" || req.method === "HEAD") {
        const starAlias = /^\/star\/(\d+)\/?$/.exec(path);
        if (starAlias && catalog.has(Number(starAlias[1]))) {
          return reply.redirect(`/star?hyg_id=${Number(starAlias[1])}`, 302);
        }
        // A Next export has a separate HTML shell per route; index.html is not a router.
        if (["/star", "/catalog", "/login", "/credits"].includes(path.replace(/\/$/, ""))) {
          const file = `${path.replace(/^\//, "").replace(/\/$/, "")}.html`;
          if (existsSync(join(webDist, file))) return reply.sendFile(file);
        }
        // Missing JS/data/media must be 404s, never HTML masquerading as an asset.
        if (!path.startsWith(`${API_PREFIX}/`) && !path.includes(".")) {
          return reply.code(404).sendFile("404.html");
        }
      }
      return reply.code(404).send({ error: { code: "not_found", message: "No such route." } });
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: { code: "not_found", message: "No such route." } }));
  }

  if (opts.background) {
    store.cleanupOrphans(db, ctx.now());
    if (config.moderationEnabled) worker.start();
    readiness.start();
  }

  return {
    app, ctx, worker, readiness, store,
    async close() {
      await readiness.stop();
      await worker.stop();
      await app.close();
      db.close();
    },
  };
}

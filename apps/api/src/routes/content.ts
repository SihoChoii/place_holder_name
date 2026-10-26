import type { FastifyInstance } from "fastify";
import { createReadStream, existsSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { LIMITS, schemas } from "@stargaze/shared";
import type { Ctx } from "../context.js";
import { badRequest } from "../lib/errors.js";
import { PUBLIC, requireUser, type Viewer } from "../auth/session.js";
import type { MediaStore } from "../media/store.js";
import { travelTime } from "../catalog/index.js";
import { thumbnailImage } from "../media/images.js";
import { claimedStars, etagMatches } from "../services/claimed.js";
import { claimStar, getStarOr404, parseIdempotencyKey, starView } from "../services/claims.js";
import * as content from "../services/content.js";
import { createTag, deleteTag } from "../services/tags.js";
import { createComment, deleteComment, parseEmoji, setReaction } from "../services/social.js";

const idParam = { type: "object", required: ["id"], properties: { id: { type: "string", format: "uuid" } } } as const;
const hygParam = { type: "object", required: ["hyg_id"], properties: { hyg_id: { type: "integer", minimum: 0 } } } as const;
const err = { 400: schemas.ErrorBody, 401: schemas.ErrorBody, 404: schemas.ErrorBody };
type Page = { cursor?: string; limit?: number };
type Search = Page & { q: string };

/** Authenticated content routes (spec §6). Public mirrors live in publicRoutes below. */
export async function contentRoutes(app: FastifyInstance, { ctx, store }: { ctx: Ctx; store: MediaStore }) {
  app.addHook("preHandler", app.auth);
  const user = (v: Viewer) => requireUser(v);
  const writeLimit = (v: Viewer) => ctx.limiter.hit(`write:${user(v).id}`, ctx.config.rate.writesPerMin, 60_000);

  app.get<{ Params: { hyg_id: number } }>("/stars/:hyg_id", { schema: { tags: ["stars"], params: hygParam, response: { 200: schemas.Star, ...err } } },
    async (req) => starView(ctx, getStarOr404(ctx, req.params.hyg_id)));

  app.get<{ Params: { hyg_id: number }; Querystring: { speed_km_s: number } }>("/stars/:hyg_id/travel-time", {
    schema: { tags: ["stars"], params: hygParam, querystring: schemas.TravelTimeQuery, response: { 200: schemas.TravelTimeResponse, ...err } },
  }, async (req) => {
    const speed = req.query.speed_km_s;
    if (!Number.isFinite(speed)) throw badRequest("speed_km_s must be a finite positive number.", "validation_failed");
    return travelTime(getStarOr404(ctx, req.params.hyg_id), speed);
  });

  app.get<{ Params: { hyg_id: number }; Querystring: Page }>("/stars/:hyg_id/tags", {
    schema: { tags: ["stars"], params: hygParam, querystring: schemas.PageQuery, response: { 200: schemas.TagPage, ...err } },
  }, async (req) => {
    getStarOr404(ctx, req.params.hyg_id);
    return content.starTags(ctx, req.viewer, req.params.hyg_id, req.query);
  });

  app.post<{ Params: { hyg_id: number } }>("/stars/:hyg_id/claim", {
    schema: { tags: ["stars"], params: hygParam, response: { 201: schemas.ClaimResponse, 409: schemas.ErrorBody, 429: schemas.ErrorBody, ...err } },
  }, async (req, reply) => {
    const key = parseIdempotencyKey(req.headers["idempotency-key"]);
    return reply.code(201).send(claimStar(ctx, user(req.viewer), req.params.hyg_id, key));
  });

  app.post("/tags", {
    schema: { tags: ["tags"], consumes: ["multipart/form-data"], response: { 201: schemas.CreateTagResponse, ...err } },
  }, async (req, reply) => {
    const v = user(req.viewer);
    const key = parseIdempotencyKey(req.headers["idempotency-key"]);
    writeLimit(v);
    const { tag } = await createTag(ctx, store, req, v, key);
    return reply.code(201).send({ tag });
  });

  app.get<{ Params: { id: string } }>("/tags/:id", { schema: { tags: ["tags"], params: idParam, response: { 200: schemas.Tag, ...err } } },
    async (req) => content.getTag(ctx, req.viewer, req.params.id));

  app.delete<{ Params: { id: string } }>("/tags/:id", { schema: { tags: ["tags"], params: idParam } }, async (req, reply) => {
    deleteTag(ctx, user(req.viewer), req.params.id);
    return reply.code(204).send();
  });

  app.get<{ Querystring: Page }>("/me/tags", { schema: { tags: ["tags"], querystring: schemas.PageQuery, response: { 200: schemas.TagPage, ...err } } },
    async (req) => content.myTags(ctx, user(req.viewer), req.query));

  app.get<{ Params: { id: string } }>("/media/:id", { schema: { tags: ["media"], params: idParam } }, async (req, reply) => {
    const f = content.mediaFile(ctx, req.viewer, req.params.id);
    return reply.header("content-type", f.mime).header("cache-control", "private, no-store").send(createReadStream(store.path(f.file_name)));
  });

  app.post<{ Body: { hyg_ids: number[] } }>("/view/content", {
    schema: { tags: ["overlay"], body: schemas.ViewContentBody, response: { 200: schemas.ViewContentResponse, ...err } },
  }, async (req) => content.viewContent(ctx, req.viewer, req.body.hyg_ids));

  app.get<{ Params: { id: string }; Querystring: Page }>("/tags/:id/comments", {
    schema: { tags: ["social"], params: idParam, querystring: schemas.PageQuery, response: { 200: schemas.CommentPage, ...err } },
  }, async (req) => content.listComments(ctx, req.viewer, req.params.id, req.query));

  app.post<{ Params: { id: string }; Body: { body: string; media_id?: string | null } }>("/tags/:id/comments", {
    schema: { tags: ["social"], params: idParam, body: schemas.CreateCommentBody, response: { 201: schemas.CreateCommentResponse, ...err } },
  }, async (req, reply) => {
    const v = user(req.viewer);
    const key = parseIdempotencyKey(req.headers["idempotency-key"]);
    writeLimit(v);
    return reply.code(201).send({ comment: createComment(ctx, v, req.params.id, req.body.body, req.body.media_id ?? null, key) });
  });

  app.delete<{ Params: { id: string } }>("/comments/:id", { schema: { tags: ["social"], params: idParam } }, async (req, reply) => {
    deleteComment(ctx, user(req.viewer), req.params.id);
    return reply.code(204).send();
  });

  const reactionParams = { type: "object", required: ["id", "emoji"], properties: { id: { type: "string", format: "uuid" }, emoji: { type: "string", maxLength: 16 } } } as const;
  for (const method of ["PUT", "DELETE"] as const) {
    app.route<{ Params: { id: string; emoji: string } }>({
      method, url: "/tags/:id/reactions/:emoji",
      schema: { tags: ["social"], params: reactionParams, response: { 200: schemas.ReactionResponse, ...err } },
      handler: async (req) => setReaction(ctx, user(req.viewer), req.params.id, parseEmoji(req.params.emoji), method === "PUT"),
    });
  }

  app.get<{ Querystring: Page }>("/explore/feed", { schema: { tags: ["explore"], querystring: schemas.PageQuery, response: { 200: schemas.TagPage, ...err } } },
    async (req) => content.feed(ctx, req.viewer, req.query));

  app.get<{ Querystring: Search }>("/explore/search", {
    schema: { tags: ["explore"], querystring: schemas.SearchQuery, response: { 200: schemas.SearchResponse, ...err } },
  }, async (req) => search(ctx, req.viewer, req.query));
}

function search(ctx: Ctx, viewer: Viewer, q: Search) {
  if (!q.q.trim()) throw badRequest("Search text is required.", "validation_failed");
  const tags = content.searchTags(ctx, viewer, q.q, q);
  const stars = q.cursor ? [] : ctx.catalog.search(q.q, LIMITS.searchStarResults).map((s) => starView(ctx, s));
  return { stars, tags: tags.items, next_cursor: tags.next_cursor };
}

/** Unauthenticated reads: always the anonymous viewer, regardless of cookies or headers. */
export async function publicRoutes(app: FastifyInstance, { ctx, store }: { ctx: Ctx; store: MediaStore }) {
  app.get<{ Params: { hyg_id: number } }>("/public/stars/:hyg_id", {
    schema: { tags: ["public"], params: hygParam, response: { 200: schemas.PublicStarResponse, ...err } },
  }, async (req) => {
    const star = starView(ctx, getStarOr404(ctx, req.params.hyg_id));
    const overlay = content.viewContent(ctx, PUBLIC, [star.hyg_id]).stars[0];
    return { star, tag_count: overlay.tag_count, recent_tags: overlay.tags };
  });
  app.get<{ Params: { hyg_id: number }; Querystring: Page }>("/public/stars/:hyg_id/tags", {
    schema: { tags: ["public"], params: hygParam, querystring: schemas.PageQuery, response: { 200: schemas.TagPage, ...err } },
  }, async (req) => {
    getStarOr404(ctx, req.params.hyg_id);
    return content.starTags(ctx, PUBLIC, req.params.hyg_id, req.query);
  });
  app.get<{ Querystring: Page }>("/public/feed", { schema: { tags: ["public"], querystring: schemas.PageQuery, response: { 200: schemas.TagPage, ...err } } },
    async (req) => content.feed(ctx, PUBLIC, req.query));
  app.get<{ Querystring: Search }>("/public/search", {
    schema: { tags: ["public"], querystring: schemas.SearchQuery, response: { 200: schemas.SearchResponse, ...err } },
  }, async (req) => search(ctx, PUBLIC, req.query));
  app.get<{ Params: { id: string }; Querystring: Page }>("/public/tags/:id/comments", {
    schema: { tags: ["public"], params: idParam, querystring: schemas.PageQuery, response: { 200: schemas.CommentPage, ...err } },
  }, async (req) => content.listComments(ctx, PUBLIC, req.params.id, req.query));
  app.get<{ Params: { id: string }; Querystring: { size: "full" | "thumb" } }>("/public/media/:id", {
    schema: { tags: ["public"], params: idParam, querystring: schemas.MediaQuery },
  }, async (req, reply) => {
    const f = content.mediaFile(ctx, PUBLIC, req.params.id);
    const path = req.query.size === "thumb" ? await thumbnail(store, f.file_name) : store.path(f.file_name);
    return reply.header("content-type", f.mime).header("cache-control", "no-store").send(createReadStream(path));
  });
  // Every claimed star with a preview, for the website sky. Anonymous by construction (never personalized),
  // so it is publicly cacheable and revalidated with a strong ETag.
  app.get("/public/claimed", {
    schema: { tags: ["public"], response: { 200: schemas.ClaimedStarsResponse, 304: { type: "null", description: "Not modified (If-None-Match)" } } },
  }, async (req, reply) => {
    const { stars, version } = claimedStars(ctx);
    const etag = `"${version}"`;
    reply.header("etag", etag).header("cache-control", "public, max-age=0, must-revalidate");
    if (etagMatches(req.headers["if-none-match"], etag)) return reply.code(304).send();
    return { stars, version, server_time: ctx.now() };
  });
}

/** Lazily derive and cache a thumbnail next to the originals (temp file + atomic rename). */
async function thumbnail(store: MediaStore, fileName: string) {
  const out = store.thumbPath(fileName);
  if (existsSync(out)) return out;
  const tmp = join(store.tmpDir, `${randomUUID()}.webp.part`);
  try {
    await thumbnailImage(store.path(fileName), tmp);
    await rename(tmp, out);
  } finally {
    await rm(tmp, { force: true });
  }
  return out;
}

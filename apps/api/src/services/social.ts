import { randomUUID } from "node:crypto";
import { fingerprint, immediate } from "@stargaze/db";
import { LIMITS, REACTION_EMOJIS, codePointLength } from "@stargaze/shared";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import type { Ctx } from "../context.js";
import type { Viewer } from "../auth/session.js";
import { serializeComments, type CommentRow } from "./content.js";
import { tagInteractive } from "./visibility.js";

type User = Extract<Viewer, { kind: "user" }>;

function interactiveTag(ctx: Ctx, tagId: string) {
  const t = ctx.db.prepare(`SELECT t.id FROM tags t WHERE t.id = ? AND ${tagInteractive()}`).get(tagId);
  if (!t) throw notFound();
}

export function createComment(ctx: Ctx, viewer: User, tagId: string, body: string, mediaId: string | null, requestKey: string) {
  if (!body.trim()) throw badRequest("Comment cannot be blank.", "validation_failed");
  if (codePointLength(body) > LIMITS.commentMaxCodePoints) throw badRequest("Comment may be at most 280 characters.", "validation_failed");
  const fp = fingerprint({ op: "comment", tag_id: tagId, body, media_id: mediaId });
  const id = immediate(ctx.db, () => {
    const prior = ctx.db.prepare("SELECT id, request_fingerprint, deleted_at FROM comments WHERE user_id = ? AND request_key = ?")
      .get(viewer.id, requestKey) as { id: string; request_fingerprint: string; deleted_at: number | null } | undefined;
    if (prior) {
      if (prior.request_fingerprint !== fp) throw conflict("idempotency_conflict", "This Idempotency-Key was used with a different request.");
      if (prior.deleted_at) throw notFound();
      return prior.id;
    }
    interactiveTag(ctx, tagId);
    if (mediaId && !ctx.db.prepare("SELECT 1 FROM media WHERE id = ? AND tag_id = ? AND moderation_status = 'approved'").get(mediaId, tagId)) {
      throw badRequest("media_id must belong to the same post.", "validation_failed");
    }
    const now = ctx.now();
    const cid = randomUUID();
    ctx.db.prepare(`INSERT INTO comments (id, tag_id, user_id, media_id, body, created_at, updated_at, request_key, request_fingerprint)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(cid, tagId, viewer.id, mediaId, body, now, now, requestKey, fp);
    ctx.jobs.enqueue("comment", cid, now);
    return cid;
  });
  ctx.notifyModeration();
  const row = ctx.db.prepare(`SELECT c.id, c.tag_id, c.user_id, u.display_name, c.body, c.media_id, c.moderation_status, c.created_at
    FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?`).get(id) as CommentRow;
  return serializeComments(ctx, viewer, [row])[0];
}

export function deleteComment(ctx: Ctx, viewer: User, id: string) {
  immediate(ctx.db, () => {
    const c = ctx.db.prepare(`SELECT c.user_id, c.moderation_status, c.deleted_at, t.deleted_at AS tag_deleted FROM comments c
      JOIN tags t ON t.id = c.tag_id WHERE c.id = ?`).get(id) as
      { user_id: string; moderation_status: string; deleted_at: number | null; tag_deleted: number | null } | undefined;
    if (!c || c.deleted_at || c.tag_deleted) throw notFound();
    if (c.user_id !== viewer.id) throw c.moderation_status === "approved" ? forbidden() : notFound();
    const now = ctx.now();
    ctx.db.prepare("UPDATE comments SET deleted_at = ?, updated_at = ? WHERE id = ?").run(now, now, id);
    ctx.jobs.removeForTarget("comment", id);
  });
}

export function parseEmoji(raw: string) {
  const e = (REACTION_EMOJIS as readonly string[]).find((x) => x === raw || x.replace(/\uFE0F/g, "") === raw.replace(/\uFE0F/g, ""));
  if (!e) throw badRequest(`Unsupported reaction. Use one of ${REACTION_EMOJIS.join(" ")}.`, "validation_failed");
  return e;
}

export function setReaction(ctx: Ctx, viewer: User, tagId: string, emoji: string, on: boolean) {
  immediate(ctx.db, () => {
    interactiveTag(ctx, tagId);
    if (on) ctx.db.prepare("INSERT OR IGNORE INTO reactions (tag_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)").run(tagId, viewer.id, emoji, ctx.now());
    else ctx.db.prepare("DELETE FROM reactions WHERE tag_id = ? AND user_id = ? AND emoji = ?").run(tagId, viewer.id, emoji);
  });
  const rows = ctx.db.prepare("SELECT emoji, COUNT(*) AS n, SUM(user_id = ?) AS mine FROM reactions WHERE tag_id = ? GROUP BY emoji")
    .all(viewer.id, tagId) as { emoji: string; n: number; mine: number }[];
  return {
    tag_id: tagId,
    reaction_counts: Object.fromEntries(rows.map((r) => [r.emoji, r.n])),
    my_reactions: rows.filter((r) => r.mine > 0).map((r) => r.emoji),
  };
}

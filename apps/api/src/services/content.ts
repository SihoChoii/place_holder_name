import { LIMITS, type ProcessingState } from "@stargaze/shared";
import { badRequest, notFound } from "../lib/errors.js";
import { viewerId, type Viewer } from "../auth/session.js";
import type { Ctx } from "../context.js";
import { claimInfo, type ClaimRow } from "./claims.js";
import { commentVisible, mediaVisible, tagVisible } from "./visibility.js";

export interface TagRow {
  id: string; hyg_id: number; user_id: string; display_name: string; note: string | null;
  moderation_status: "pending" | "approved" | "rejected"; created_at: number;
}
export interface CommentRow {
  id: string; tag_id: string; user_id: string; display_name: string; body: string; media_id: string | null;
  moderation_status: "pending" | "approved" | "rejected"; created_at: number;
}
export interface PageArgs { cursor?: string; limit?: number }

// ---------- cursors ----------
export function encodeCursor(row: { created_at: number; id: string }) {
  return Buffer.from(`${row.created_at}:${row.id}`).toString("base64url");
}
function decodeCursor(c?: string): { at: number; id: string } | null {
  if (!c) return null;
  const m = /^(\d{1,16}):([0-9a-f-]{36})$/.exec(Buffer.from(c, "base64url").toString());
  if (!m) throw badRequest("Invalid cursor.", "validation_failed");
  return { at: Number(m[1]), id: m[2] };
}
const pageLimit = (l?: number) => Math.min(Math.max(l ?? LIMITS.pageDefault, 1), LIMITS.pageMax);
const cursorSql = (a: string) => `(@c_at IS NULL OR ${a}.created_at < @c_at OR (${a}.created_at = @c_at AND ${a}.id < @c_id))`;

function paged<T extends { created_at: number; id: string }>(rows: T[], limit: number) {
  const more = rows.length > limit;
  const items = more ? rows.slice(0, limit) : rows;
  return { items, next_cursor: more ? encodeCursor(items[items.length - 1]) : null };
}

// ---------- processing state ----------
function processingStates(ctx: Ctx, kind: "tag" | "comment", ids: string[]): Map<string, ProcessingState> {
  const out = new Map<string, ProcessingState>();
  if (!ids.length) return out;
  const rows = ctx.db
    .prepare(`SELECT target_id, attempts, failed_at FROM moderation_jobs WHERE target_kind = ? AND target_id IN (SELECT value FROM json_each(?))`)
    .all(kind, JSON.stringify(ids)) as { target_id: string; attempts: number; failed_at: number | null }[];
  for (const r of rows) out.set(r.target_id, r.failed_at ? "review_failed" : r.attempts > 0 ? "delayed" : "queued");
  return out;
}
const stateOf = (status: TagRow["moderation_status"], job?: ProcessingState): ProcessingState =>
  status === "pending" ? (job ?? "queued") : status;

// ---------- comments ----------
const COMMENT_SELECT = `SELECT c.id, c.tag_id, c.user_id, u.display_name, c.body, c.media_id, c.moderation_status, c.created_at
  FROM comments c JOIN tags t ON t.id = c.tag_id JOIN users u ON u.id = c.user_id`;

export function serializeComments(ctx: Ctx, viewer: Viewer, rows: CommentRow[]) {
  const me = viewerId(viewer);
  const own = rows.filter((r) => r.user_id === me && r.moderation_status === "pending").map((r) => r.id);
  const states = processingStates(ctx, "comment", own);
  return rows.map((r) => ({
    id: r.id, tag_id: r.tag_id, author: { id: r.user_id, display_name: r.display_name }, body: r.body,
    media_id: r.media_id, moderation_status: r.moderation_status, created_at: r.created_at,
    ...(r.user_id === me ? { processing_state: stateOf(r.moderation_status, states.get(r.id)) } : {}),
  }));
}

export function listComments(ctx: Ctx, viewer: Viewer, tagId: string, page: PageArgs) {
  getTagRow(ctx, viewer, tagId); // 404 if the parent is hidden
  const c = decodeCursor(page.cursor);
  const limit = pageLimit(page.limit);
  const rows = ctx.db
    .prepare(`${COMMENT_SELECT} WHERE c.tag_id = @tag AND ${commentVisible()} AND ${cursorSql("c")}
      ORDER BY c.created_at DESC, c.id DESC LIMIT @lim`)
    .all({ tag: tagId, viewer: viewerId(viewer), c_at: c?.at ?? null, c_id: c?.id ?? null, lim: limit + 1 }) as CommentRow[];
  const p = paged(rows, limit);
  return { items: serializeComments(ctx, viewer, p.items), next_cursor: p.next_cursor };
}

export function getCommentRow(ctx: Ctx, viewer: Viewer, id: string) {
  const row = ctx.db.prepare(`${COMMENT_SELECT} WHERE c.id = @id AND ${commentVisible()}`)
    .get({ id, viewer: viewerId(viewer) }) as CommentRow | undefined;
  if (!row) throw notFound();
  return row;
}

// ---------- tags ----------
const TAG_SELECT = `SELECT t.id, t.hyg_id, t.user_id, u.display_name, t.note, t.moderation_status, t.created_at
  FROM tags t JOIN users u ON u.id = t.user_id`;

/** Batch-hydrate tags: media, counts, viewer reactions, recent comments, author processing state. */
export function serializeTags(ctx: Ctx, viewer: Viewer, rows: TagRow[], opts: { recentComments?: number } = {}) {
  if (!rows.length) return [];
  const me = viewerId(viewer);
  const ids = JSON.stringify(rows.map((r) => r.id));
  const p = { ids, viewer: me };
  const media = ctx.db
    .prepare(`SELECT m.id, m.tag_id, m.kind, m.url, m.width, m.height, m.mime FROM media m JOIN tags t ON t.id = m.tag_id
      WHERE m.tag_id IN (SELECT value FROM json_each(@ids)) AND ${mediaVisible()} ORDER BY m.tag_id, m.position`)
    .all(p) as { id: string; tag_id: string; kind: "image" | "link"; url: string | null; width: number; height: number; mime: string }[];
  const reactions = ctx.db
    .prepare(`SELECT tag_id, emoji, COUNT(*) AS n, SUM(user_id = @viewer) AS mine FROM reactions
      WHERE tag_id IN (SELECT value FROM json_each(@ids)) GROUP BY tag_id, emoji`)
    .all(p) as { tag_id: string; emoji: string; n: number; mine: number }[];
  const counts = ctx.db
    .prepare(`SELECT tag_id, COUNT(*) AS n FROM comments WHERE tag_id IN (SELECT value FROM json_each(@ids))
      AND deleted_at IS NULL AND moderation_status = 'approved' GROUP BY tag_id`)
    .all(p) as { tag_id: string; n: number }[];
  const recentN = opts.recentComments ?? 0;
  const recent = recentN
    ? (ctx.db
        .prepare(`SELECT * FROM (${COMMENT_SELECT.replace("SELECT ", "SELECT ROW_NUMBER() OVER (PARTITION BY c.tag_id ORDER BY c.created_at DESC, c.id DESC) AS rn, ")}
          WHERE c.tag_id IN (SELECT value FROM json_each(@ids)) AND ${commentVisible()}) WHERE rn <= @n`)
        .all({ ...p, n: recentN }) as CommentRow[])
    : [];
  const states = processingStates(ctx, "tag", rows.filter((r) => r.user_id === me && r.moderation_status === "pending").map((r) => r.id));
  const mediaPrefix = viewer.kind === "user" ? "/api/media/" : "/api/public/media/";
  const group = <T extends { tag_id: string }>(xs: T[]) => {
    const m = new Map<string, T[]>();
    for (const x of xs) (m.get(x.tag_id) ?? m.set(x.tag_id, []).get(x.tag_id)!).push(x);
    return m;
  };
  const mediaBy = group(media), reactBy = group(reactions), recentBy = group(recent);
  const countBy = new Map(counts.map((c) => [c.tag_id, c.n]));
  return rows.map((r) => {
    const rs = reactBy.get(r.id) ?? [];
    return {
      id: r.id,
      hyg_id: r.hyg_id,
      star_name: ctx.catalog.get(r.hyg_id)?.name ?? null,
      author: { id: r.user_id, display_name: r.display_name },
      note: r.note,
      media: (mediaBy.get(r.id) ?? []).map((m) =>
        m.kind === "image"
          ? { id: m.id, kind: "image" as const, url: mediaPrefix + m.id, width: m.width, height: m.height, mime: m.mime }
          : { id: m.id, kind: "link" as const, url: m.url! }),
      moderation_status: r.moderation_status,
      ...(r.user_id === me ? { processing_state: stateOf(r.moderation_status, states.get(r.id)) } : {}),
      created_at: r.created_at,
      // Reactions only exist on approved tags; deleted tags are never serialized.
      reaction_counts: Object.fromEntries(rs.map((x) => [x.emoji, x.n])),
      ...(viewer.kind === "user" ? { my_reactions: rs.filter((x) => x.mine > 0).map((x) => x.emoji) } : {}),
      comment_count: countBy.get(r.id) ?? 0,
      ...(recentN ? { recent_comments: serializeComments(ctx, viewer, recentBy.get(r.id) ?? []) } : {}),
    };
  });
}
export type TagView = ReturnType<typeof serializeTags>[number];

export function getTagRow(ctx: Ctx, viewer: Viewer, id: string): TagRow {
  const row = ctx.db.prepare(`${TAG_SELECT} WHERE t.id = @id AND ${tagVisible()}`).get({ id, viewer: viewerId(viewer) }) as TagRow | undefined;
  if (!row) throw notFound();
  return row;
}

export function getTag(ctx: Ctx, viewer: Viewer, id: string) {
  return serializeTags(ctx, viewer, [getTagRow(ctx, viewer, id)], { recentComments: LIMITS.viewContentCommentsPerTag })[0];
}

/** Generic newest-first tag listing restricted by an extra SQL filter. */
export function listTags(ctx: Ctx, viewer: Viewer, filter: { sql: string; params: Record<string, unknown> }, page: PageArgs,
  opts: { includeHiddenOwn?: boolean } = {}) {
  const c = decodeCursor(page.cursor);
  const limit = pageLimit(page.limit);
  const vis = opts.includeHiddenOwn ? "t.deleted_at IS NULL" : tagVisible();
  const rows = ctx.db
    .prepare(`${TAG_SELECT} WHERE ${vis} AND (${filter.sql}) AND ${cursorSql("t")} ORDER BY t.created_at DESC, t.id DESC LIMIT @lim`)
    .all({ ...filter.params, viewer: viewerId(viewer), c_at: c?.at ?? null, c_id: c?.id ?? null, lim: limit + 1 }) as TagRow[];
  const p = paged(rows, limit);
  return { items: serializeTags(ctx, viewer, p.items, { recentComments: LIMITS.viewContentCommentsPerTag }), next_cursor: p.next_cursor };
}

export const starTags = (ctx: Ctx, viewer: Viewer, hygId: number, page: PageArgs) =>
  listTags(ctx, viewer, { sql: "t.hyg_id = @hyg", params: { hyg: hygId } }, page);

export const feed = (ctx: Ctx, viewer: Viewer, page: PageArgs) => listTags(ctx, viewer, { sql: "1", params: {} }, page);

export const myTags = (ctx: Ctx, viewer: Extract<Viewer, { kind: "user" }>, page: PageArgs) =>
  listTags(ctx, viewer, { sql: "t.user_id = @viewer", params: {} }, page);

export function searchTags(ctx: Ctx, viewer: Viewer, q: string, page: PageArgs) {
  const like = `%${q.trim().replace(/[\\%_]/g, (ch) => "\\" + ch)}%`;
  return listTags(ctx, viewer, { sql: "t.note LIKE @like ESCAPE '\\'", params: { like } }, page);
}

/** Overlay summaries for up to 200 stars, in request order, using batch queries (spec §6). */
export function viewContent(ctx: Ctx, viewer: Viewer, hygIds: number[]) {
  const unknown = hygIds.filter((id) => !ctx.catalog.has(id));
  if (unknown.length) throw badRequest(`Unknown star ids: ${unknown.slice(0, 5).join(", ")}`, "unknown_star");
  const ids = JSON.stringify(hygIds);
  const p = { ids, viewer: viewerId(viewer) };
  const claims = ctx.db
    .prepare(`SELECT c.id, c.hyg_id, c.user_id, c.claimed_at, u.display_name FROM star_claims c JOIN users u ON u.id = c.user_id
      WHERE c.hyg_id IN (SELECT value FROM json_each(@ids))`)
    .all({ ids }) as ClaimRow[];
  const counts = ctx.db
    .prepare(`SELECT t.hyg_id, COUNT(*) AS n FROM tags t WHERE t.hyg_id IN (SELECT value FROM json_each(@ids)) AND ${tagVisible()} GROUP BY t.hyg_id`)
    .all(p) as { hyg_id: number; n: number }[];
  const rows = ctx.db
    .prepare(`SELECT * FROM (${TAG_SELECT.replace("SELECT ", "SELECT ROW_NUMBER() OVER (PARTITION BY t.hyg_id ORDER BY t.created_at DESC, t.id DESC) AS rn, ")}
      WHERE t.hyg_id IN (SELECT value FROM json_each(@ids)) AND ${tagVisible()}) WHERE rn <= @n ORDER BY created_at DESC, id DESC`)
    .all({ ...p, n: LIMITS.viewContentTagsPerStar }) as TagRow[];
  const tags = serializeTags(ctx, viewer, rows, { recentComments: LIMITS.viewContentCommentsPerTag });
  const claimBy = new Map(claims.map((c) => [c.hyg_id, c]));
  const countBy = new Map(counts.map((c) => [c.hyg_id, c.n]));
  return {
    stars: hygIds.map((id) => {
      const ts = tags.filter((t) => t.hyg_id === id);
      const n = countBy.get(id) ?? 0;
      return { hyg_id: id, claim: claimInfo(claimBy.get(id)), tags: ts, tag_count: n, has_more: n > ts.length };
    }),
    server_time: ctx.now(),
  };
}

/** Bytes for an image if the viewer may see it (public viewer: approved image of approved, live tag). */
export function mediaFile(ctx: Ctx, viewer: Viewer, id: string) {
  const row = ctx.db
    .prepare(`SELECT m.file_name, m.mime, m.moderation_status, t.user_id FROM media m JOIN tags t ON t.id = m.tag_id
      WHERE m.id = @id AND m.kind = 'image' AND ${mediaVisible()}`)
    .get({ id, viewer: viewerId(viewer) }) as { file_name: string; mime: string } | undefined;
  if (!row) throw notFound();
  return row;
}

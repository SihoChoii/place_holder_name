import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { rename } from "node:fs/promises";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { FastifyRequest } from "fastify";
import { fingerprint, immediate } from "@stargaze/db";
import { LIMITS, codePointLength } from "@stargaze/shared";
import { AppError, badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import type { Ctx } from "../context.js";
import type { Viewer } from "../auth/session.js";
import { validateLink } from "../media/links.js";
import { normalizeImage } from "../media/images.js";
import type { MediaStore } from "../media/store.js";
import { getTag } from "./content.js";

type User = Extract<Viewer, { kind: "user" }>;
interface Upload { tmp: string; sha256: string; size: number }

const tooLarge = () => new AppError(413, "payload_too_large", "Upload exceeds the size limits (5 MiB per image, 22 MiB total).");

/** Stream multipart parts: text fields into memory, files into private temp storage while hashing. */
async function readMultipart(req: FastifyRequest, store: MediaStore, onFirstFile: (fields: Record<string, string>) => void) {
  const fields: Record<string, string> = {};
  const uploads: Upload[] = [];
  try {
    for await (const part of req.parts()) {
      if (part.type === "field") {
        if (typeof part.value !== "string") throw badRequest(`Field ${part.fieldname} must be text.`, "validation_failed");
        if (part.fieldname in fields) throw badRequest(`Duplicate field ${part.fieldname}.`, "validation_failed");
        fields[part.fieldname] = part.value;
        continue;
      }
      if (part.fieldname !== "images") throw badRequest(`Unexpected file field ${part.fieldname}.`, "validation_failed");
      if (uploads.length === 0) onFirstFile(fields);
      if (uploads.length >= LIMITS.maxAttachments) throw badRequest("At most 4 attachments per post.", "validation_failed");
      const tmp = join(store.tmpDir, `${randomUUID()}.upload`);
      const hash = createHash("sha256");
      let size = 0;
      uploads.push({ tmp, sha256: "", size: 0 });
      await pipeline(part.file, new Transform({
        transform(chunk: Buffer, _e, cb) { hash.update(chunk); size += chunk.length; cb(null, chunk); },
      }), createWriteStream(tmp));
      if (part.file.truncated) throw tooLarge();
      uploads[uploads.length - 1] = { tmp, sha256: hash.digest("hex"), size };
    }
  } catch (e) {
    await store.removeAll(uploads.map((u) => u.tmp));
    const code = (e as { code?: string }).code;
    if (code === "FST_REQ_FILE_TOO_LARGE" || code === "FST_PARTS_LIMIT" || code === "FST_FILES_LIMIT") throw tooLarge();
    throw e;
  }
  return { fields, uploads };
}

function parseFields(fields: Record<string, string>, imageCount: number) {
  const hygId = Number(fields.hyg_id);
  if (!fields.hyg_id || !Number.isInteger(hygId) || hygId < 0) throw badRequest("hyg_id is required.", "validation_failed");
  const noteRaw = fields.note ?? "";
  const note = noteRaw.trim() ? noteRaw : null;
  if (note && codePointLength(note) > LIMITS.noteMaxCodePoints) throw badRequest("Note may be at most 140 characters.", "validation_failed");
  let links: string[] = [];
  if (fields.links !== undefined && fields.links.trim() !== "") {
    let parsed: unknown;
    try { parsed = JSON.parse(fields.links); } catch { throw badRequest("links must be a JSON array of URLs.", "invalid_link"); }
    if (!Array.isArray(parsed)) throw badRequest("links must be a JSON array of URLs.", "invalid_link");
    links = parsed.map(validateLink);
  }
  const unknown = Object.keys(fields).filter((k) => !["hyg_id", "note", "links"].includes(k));
  if (unknown.length) throw badRequest(`Unknown field ${unknown[0]}.`, "validation_failed");
  if (links.length + imageCount > LIMITS.maxAttachments) throw badRequest("At most 4 attachments per post.", "validation_failed");
  if (!note && links.length + imageCount === 0) throw badRequest("A post needs a note, a link or a photo.", "empty_post");
  return { hygId, note, links };
}

export async function createTag(ctx: Ctx, store: MediaStore, req: FastifyRequest, viewer: User, requestKey: string) {
  const len = Number(req.headers["content-length"] ?? 0);
  if (len > LIMITS.maxMultipartBytes) throw tooLarge();
  if (!req.isMultipart()) throw badRequest("POST /tags expects multipart/form-data.", "validation_failed");

  const ownerOf = ctx.db.prepare("SELECT id, user_id FROM star_claims WHERE hyg_id = ?");
  const checkOwner = (hygId: number) => {
    const c = ownerOf.get(hygId) as { id: string; user_id: string } | undefined;
    if (!ctx.catalog.has(hygId)) throw badRequest("Unknown star.", "unknown_star");
    if (!c || c.user_id !== viewer.id) throw new AppError(403, "not_star_owner", "You can only post on a star you own.");
    return c.id;
  };
  const replayQ = ctx.db.prepare("SELECT id, request_fingerprint, deleted_at FROM tags WHERE user_id = ? AND request_key = ?");
  const replay = (fp: string) => {
    const r = replayQ.get(viewer.id, requestKey) as { id: string; request_fingerprint: string; deleted_at: number | null } | undefined;
    if (!r) return undefined;
    if (r.request_fingerprint !== fp) throw conflict("idempotency_conflict", "This Idempotency-Key was used with a different request.");
    if (r.deleted_at) throw notFound();
    return r.id;
  };

  const { fields, uploads } = await readMultipart(req, store, (f) => {
    // Cheap early check when text fields precede files; rechecked in the final transaction.
    const id = Number(f.hyg_id);
    if (f.hyg_id && Number.isInteger(id) && !replayQ.get(viewer.id, requestKey)) checkOwner(id);
  });
  const finals: string[] = [];
  try {
    const { hygId, note, links } = parseFields(fields, uploads.length);
    const fp = fingerprint({ op: "tag", hyg_id: hygId, note, links, images: uploads.map((u) => u.sha256) });
    const existing = replay(fp);
    if (existing) return { status: 201, tag: getTag(ctx, viewer, existing) };
    checkOwner(hygId);

    const images: { fileName: string; sha256: string; width: number; height: number; size: number; mime: string }[] = [];
    for (const u of uploads) {
      if (u.size === 0) throw badRequest("An attachment is empty.", "invalid_image");
      const fileName = `${randomUUID()}.webp`;
      const out = store.path(fileName);
      const meta = await normalizeImage(u.tmp, `${out}.part`);
      await rename(`${out}.part`, out);
      finals.push(out);
      images.push({ fileName, sha256: u.sha256, ...meta });
    }

    const now = ctx.now();
    const tagId = randomUUID();
    const result = immediate(ctx.db, () => {
      const raced = replay(fp);
      if (raced) return { id: raced, replayed: true };
      const claimId = checkOwner(hygId);
      ctx.db.prepare(`INSERT INTO tags (id, claim_id, hyg_id, user_id, note, created_at, request_key, request_fingerprint)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(tagId, claimId, hygId, viewer.id, note, now, requestKey, fp);
      const ins = ctx.db.prepare(`INSERT INTO media (id, tag_id, position, kind, file_name, mime, width, height, byte_size, original_sha256, url, created_at)
        VALUES (@id, @tag, @pos, @kind, @file, @mime, @w, @h, @size, @sha, @url, @now)`);
      let pos = 0;
      for (const img of images) {
        ins.run({ id: randomUUID(), tag: tagId, pos: pos++, kind: "image", file: img.fileName, mime: img.mime, w: img.width, h: img.height,
          size: img.size, sha: img.sha256, url: null, now });
      }
      for (const url of links) {
        ins.run({ id: randomUUID(), tag: tagId, pos: pos++, kind: "link", file: null, mime: null, w: null, h: null, size: null, sha: null, url, now });
      }
      ctx.jobs.enqueue("tag", tagId, now);
      return { id: tagId, replayed: false };
    });
    if (result.replayed) await store.removeAll(finals);
    else ctx.notifyModeration();
    return { status: 201, tag: getTag(ctx, viewer, result.id) };
  } catch (e) {
    await store.removeAll(finals);
    throw e;
  } finally {
    await store.removeAll(uploads.map((u) => u.tmp));
  }
}

/** Author-only soft delete; cancels pending moderation in the same transaction. */
export function deleteTag(ctx: Ctx, viewer: User, id: string) {
  immediate(ctx.db, () => {
    const t = ctx.db.prepare("SELECT user_id, deleted_at FROM tags WHERE id = ?").get(id) as { user_id: string; deleted_at: number | null } | undefined;
    if (!t || t.deleted_at) throw notFound();
    if (t.user_id !== viewer.id) {
      const visible = ctx.db.prepare("SELECT 1 FROM tags WHERE id = ? AND moderation_status = 'approved'").get(id);
      throw visible ? forbidden() : notFound();
    }
    const now = ctx.now();
    ctx.db.prepare("UPDATE tags SET deleted_at = ? WHERE id = ?").run(now, id);
    ctx.jobs.removeForTarget("tag", id);
    const comments = ctx.db.prepare("SELECT id FROM comments WHERE tag_id = ? AND moderation_status = 'pending'").all(id) as { id: string }[];
    for (const c of comments) ctx.jobs.removeForTarget("comment", c.id);
  });
}

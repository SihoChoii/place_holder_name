import { randomUUID } from "node:crypto";
import { fingerprint, immediate } from "@stargaze/db";
import { AppError, badRequest, conflict, notFound, tooMany } from "../lib/errors.js";
import type { Ctx } from "../context.js";
import type { CatalogStar } from "../catalog/index.js";
import type { Viewer } from "../auth/session.js";

export interface ClaimRow { id: string; hyg_id: number; user_id: string; claimed_at: number; display_name: string }

export const claimInfo = (c: ClaimRow | undefined) =>
  c ? { id: c.id, hyg_id: c.hyg_id, owner: { id: c.user_id, display_name: c.display_name }, claimed_at: c.claimed_at } : null;

/** next_claim_at: null when the user may claim now. */
export function nextClaimAt(ctx: Ctx, userId: string): number | null {
  const t = (ctx.q.latestClaimAt.get(userId) as { t: number | null }).t;
  if (t == null) return null;
  const next = t + ctx.config.claimCooldownSeconds * 1000;
  return next > ctx.now() ? next : null;
}

export function starView(ctx: Ctx, star: CatalogStar) {
  return {
    ...star,
    epoch: "J2000" as const,
    distance_unknown_reason: star.distance_ly == null ? "distance_unknown" : null,
    catalog_version: ctx.catalog.version,
    claim: claimInfo(ctx.q.claimByStar.get(star.hyg_id) as ClaimRow | undefined),
  };
}

export function getStarOr404(ctx: Ctx, hygId: number) {
  const s = ctx.catalog.get(hygId);
  if (!s) throw notFound("Unknown star.");
  return s;
}

/**
 * Atomic claim (spec §8): one synchronous IMMEDIATE transaction doing replay → catalog → ownership →
 * cooldown → insert. UNIQUE(hyg_id) remains the final guard.
 */
export function claimStar(ctx: Ctx, viewer: Extract<Viewer, { kind: "user" }>, hygId: number, requestKey: string) {
  const fp = fingerprint({ op: "claim", hyg_id: hygId });
  const replay = ctx.db.prepare("SELECT * FROM star_claims WHERE user_id = ? AND request_key = ?");
  const insert = ctx.db.prepare(
    "INSERT INTO star_claims (id, hyg_id, user_id, claimed_at, request_key, request_fingerprint) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const cooldownMs = ctx.config.claimCooldownSeconds * 1000;
  const row = immediate(ctx.db, () => {
    const prior = replay.get(viewer.id, requestKey) as (ClaimRow & { request_fingerprint: string }) | undefined;
    if (prior) {
      if (prior.request_fingerprint !== fp) throw conflict("idempotency_conflict", "This Idempotency-Key was used with a different request.");
      return prior;
    }
    if (!ctx.catalog.has(hygId)) throw badRequest("Unknown star.", "unknown_star");
    const now = ctx.now();
    if (ctx.q.claimByStar.get(hygId)) throw conflict("already_claimed", "This star already has an owner.");
    const last = (ctx.q.latestClaimAt.get(viewer.id) as { t: number | null }).t;
    if (last != null && now < last + cooldownMs) {
      throw tooMany("on_cooldown", "You can claim another star later.", (last + cooldownMs - now) / 1000);
    }
    const id = randomUUID();
    try {
      insert.run(id, hygId, viewer.id, now, requestKey, fp);
    } catch (e) {
      if ((e as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE") throw conflict("already_claimed", "This star already has an owner.");
      throw e;
    }
    return { id, hyg_id: hygId, user_id: viewer.id, claimed_at: now };
  });
  return {
    claim: { id: row.id, hyg_id: row.hyg_id, owner: { id: viewer.id, display_name: viewer.displayName }, claimed_at: row.claimed_at },
    next_claim_at: row.claimed_at + cooldownMs,
  };
}

export function parseIdempotencyKey(raw: unknown): string {
  if (typeof raw !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) {
    throw new AppError(400, "validation_failed", "Idempotency-Key header must be a UUID.");
  }
  return raw.toLowerCase();
}

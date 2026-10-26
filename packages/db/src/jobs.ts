import { randomUUID } from "node:crypto";
import type { DB } from "./connection.js";

export type TargetKind = "tag" | "comment";
export interface ModerationJob {
  id: string;
  target_kind: TargetKind;
  target_id: string;
  attempts: number;
  next_attempt_at: number;
  last_error: string | null;
  failed_at: number | null;
  created_at: number;
}

/** Retry schedule after the 1st..4th failure; the 5th failure marks the job failed. */
export const RETRY_DELAYS_MS = [5_000, 15_000, 30_000, 60_000] as const;
export const MAX_ATTEMPTS = 5;

/** Moderation-job persistence. All functions are synchronous so callers can compose them in one transaction. */
export function jobQueries(db: DB) {
  const insert = db.prepare(
    `INSERT INTO moderation_jobs (id, target_kind, target_id, attempts, next_attempt_at, created_at)
     VALUES (?, ?, ?, 0, ?, ?)`,
  );
  const due = db.prepare(
    `SELECT * FROM moderation_jobs WHERE failed_at IS NULL AND next_attempt_at <= ?
     ORDER BY next_attempt_at, created_at, id LIMIT 1`,
  );
  const nextDue = db.prepare(`SELECT MIN(next_attempt_at) AS t FROM moderation_jobs WHERE failed_at IS NULL`);
  const byTarget = db.prepare(`SELECT * FROM moderation_jobs WHERE target_kind = ? AND target_id = ?`);
  const update = db.prepare(
    `UPDATE moderation_jobs SET attempts = ?, next_attempt_at = ?, last_error = ?, failed_at = ? WHERE id = ?`,
  );
  const del = db.prepare(`DELETE FROM moderation_jobs WHERE id = ?`);
  const delTarget = db.prepare(`DELETE FROM moderation_jobs WHERE target_kind = ? AND target_id = ?`);
  const listFailed = db.prepare(`SELECT * FROM moderation_jobs WHERE failed_at IS NOT NULL ORDER BY failed_at`);
  const listAll = db.prepare(`SELECT * FROM moderation_jobs ORDER BY failed_at IS NULL DESC, next_attempt_at`);
  const retry = db.prepare(
    `UPDATE moderation_jobs SET failed_at = NULL, attempts = 0, next_attempt_at = ? WHERE id = ? AND failed_at IS NOT NULL`,
  );
  const stats = db.prepare(
    `SELECT COUNT(*) FILTER (WHERE failed_at IS NULL) AS queued, COUNT(*) FILTER (WHERE failed_at IS NOT NULL) AS failed,
            MIN(created_at) FILTER (WHERE failed_at IS NULL) AS oldest_created_at FROM moderation_jobs`,
  );
  return {
    enqueue(kind: TargetKind, targetId: string, now: number): string {
      const id = randomUUID();
      insert.run(id, kind, targetId, now, now);
      return id;
    },
    nextDue: (now: number) => due.get(now) as ModerationJob | undefined,
    nextDueAt: () => (nextDue.get() as { t: number | null }).t,
    forTarget: (kind: TargetKind, id: string) => byTarget.get(kind, id) as ModerationJob | undefined,
    /** Record a failed attempt; returns the updated job (failed_at set after MAX_ATTEMPTS). */
    recordFailure(job: ModerationJob, error: string, now: number): ModerationJob {
      const attempts = job.attempts + 1;
      const failed = attempts >= MAX_ATTEMPTS;
      const next = failed ? job.next_attempt_at : now + RETRY_DELAYS_MS[Math.min(attempts - 1, RETRY_DELAYS_MS.length - 1)];
      const msg = error.slice(0, 500);
      update.run(attempts, next, msg, failed ? now : null, job.id);
      return { ...job, attempts, next_attempt_at: next, last_error: msg, failed_at: failed ? now : null };
    },
    /** Explicit permanent failure (e.g. a request that cannot be made to fit). */
    markFailed(job: ModerationJob, error: string, now: number) {
      update.run(job.attempts + 1, job.next_attempt_at, error.slice(0, 500), now, job.id);
    },
    remove: (id: string) => del.run(id).changes > 0,
    removeForTarget: (kind: TargetKind, id: string) => delTarget.run(kind, id).changes > 0,
    listFailed: () => listFailed.all() as ModerationJob[],
    listAll: () => listAll.all() as ModerationJob[],
    retry: (id: string, now: number) => retry.run(now, id).changes > 0,
    stats: () => stats.get() as { queued: number; failed: number; oldest_created_at: number | null },
  };
}
export type JobQueries = ReturnType<typeof jobQueries>;

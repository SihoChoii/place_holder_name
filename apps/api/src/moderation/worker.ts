import { immediate, type ModerationJob } from "@stargaze/db";
import type { Ctx } from "../context.js";
import { moderationImage } from "../media/images.js";
import type { MediaStore } from "../media/store.js";
import { ModelError } from "../models/http.js";
import { POLICY_VERSION, questionsFor, verdict } from "./policy.js";

interface Component { kind: "note" | "link" | "image" | "comment"; media_id?: string; scores: Record<string, number>; approved: boolean; violations: string[] }

/**
 * The single durable moderation loop (spec §9): one due job at a time, the job row stays persisted
 * while HTTP runs (no "running" state, no leases), retries with backoff, never auto-approves.
 */
export class ModerationWorker {
  private timer: NodeJS.Timeout | undefined;
  private running: Promise<void> | undefined;
  private stopped = true;
  private abort = new AbortController();
  lastError: string | null = null;

  constructor(private ctx: Ctx, private store: MediaStore, private log: (o: object, msg: string) => void) {}

  start() {
    this.stopped = false;
    this.ctx.notifyModeration = () => this.wake();
    this.wake();
  }

  /** Schedule an immediate pass unless one is in progress (the loop reschedules itself afterwards). */
  wake() {
    if (this.stopped || this.running) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.tick(), 0);
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.abort.abort();
    await this.running;
  }

  private async tick() {
    if (this.stopped || this.running) return;
    this.running = this.drain().finally(() => (this.running = undefined));
    await this.running;
    if (this.stopped) return;
    const next = this.ctx.jobs.nextDueAt();
    const delay = next == null ? 5000 : Math.min(Math.max(next - this.ctx.now(), 0), 5000);
    this.timer = setTimeout(() => void this.tick(), delay);
  }

  /** Process due jobs one at a time until none is due. */
  private async drain() {
    while (!this.stopped || this.manual) {
      const job = this.ctx.jobs.nextDue(this.ctx.now());
      if (!job) return;
      await this.runJob(job);
    }
  }
  private manual = false;
  /** Run every due job now (tests/CLI) without starting the timer loop. */
  async runOnce() {
    this.manual = true;
    try { await this.drain(); } finally { this.manual = false; }
  }

  private async runJob(job: ModerationJob) {
    const started = this.ctx.now();
    const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(this.ctx.config.clef.jobTimeoutMs)]);
    try {
      const components = job.target_kind === "tag" ? await this.evaluateTag(job.target_id, signal) : await this.evaluateComment(job.target_id, signal);
      if (components === null) {
        this.ctx.jobs.remove(job.id); // target deleted or already final
        return;
      }
      const done = this.finalize(job, components);
      this.lastError = null;
      this.log({ job_id: job.id, target: job.target_kind, outcome: done, model_ms: this.ctx.now() - started }, "moderation finished");
    } catch (e) {
      if (this.abort.signal.aborted) return; // shutting down: job stays due and is retried after restart
      const err = e instanceof ModelError ? `${e.kind}: ${e.message}` : `internal: ${(e as Error).message}`;
      this.lastError = err;
      const updated = this.ctx.jobs.recordFailure(job, err, this.ctx.now());
      this.log({ job_id: job.id, target: job.target_kind, attempts: updated.attempts, failed: !!updated.failed_at, error_class: err.split(":")[0] },
        "moderation attempt failed");
    }
  }

  private async evaluateTag(tagId: string, signal: AbortSignal): Promise<Component[] | null> {
    const db = this.ctx.db;
    const tag = db.prepare("SELECT note, moderation_status, deleted_at FROM tags WHERE id = ?").get(tagId) as
      { note: string | null; moderation_status: string; deleted_at: number | null } | undefined;
    if (!tag || tag.deleted_at || tag.moderation_status !== "pending") return null;
    const media = db.prepare("SELECT id, kind, url, file_name FROM media WHERE tag_id = ? ORDER BY position").all(tagId) as
      { id: string; kind: "image" | "link"; url: string | null; file_name: string | null }[];
    const out: Component[] = [];
    const clef = this.ctx.clef;
    if (tag.note) out.push(this.component("note", await clef.decide({ kind: "post note", text: tag.note }, questionsFor("text"), { signal })));
    for (const m of media) {
      if (signal.aborted) throw new ModelError("timeout", "job deadline exceeded");
      if (m.kind === "link") {
        out.push(this.component("link", await clef.decide({ kind: "link shared in a post", url: m.url }, questionsFor("text"), { signal }), m.id));
      } else {
        const b64 = await moderationImage(this.store.path(m.file_name!));
        out.push(this.component("image", await clef.decide("An image a user attached to a post on a stargazing app.", questionsFor("image"),
          { images: [b64], signal }), m.id));
      }
    }
    return out;
  }

  private async evaluateComment(id: string, signal: AbortSignal): Promise<Component[] | null> {
    const c = this.ctx.db.prepare("SELECT body, moderation_status, deleted_at FROM comments WHERE id = ?").get(id) as
      { body: string; moderation_status: string; deleted_at: number | null } | undefined;
    if (!c || c.deleted_at || c.moderation_status !== "pending") return null;
    return [this.component("comment", await this.ctx.clef.decide({ kind: "comment", text: c.body }, questionsFor("text"), { signal }))];
  }

  private component(kind: Component["kind"], scores: Record<string, number>, media_id?: string): Component {
    return { kind, ...(media_id ? { media_id } : {}), scores, ...verdict(scores) };
  }

  /** Atomically publish/reject, only if the target is still pending, not deleted, and the job still exists. */
  private finalize(job: ModerationJob, components: Component[]) {
    const approved = components.every((c) => c.approved);
    const status = approved ? "approved" : "rejected";
    const now = this.ctx.now();
    const result = (cs: Component[]) => JSON.stringify({ model: this.ctx.clef.model, policy_version: POLICY_VERSION, decided_at: now, approved, components: cs });
    return immediate(this.ctx.db, () => {
      if (!this.ctx.jobs.forTarget(job.target_kind, job.target_id)) return "stale";
      const table = job.target_kind === "tag" ? "tags" : "comments";
      const changed = this.ctx.db
        .prepare(`UPDATE ${table} SET moderation_status = ?, moderation_result = ?, moderated_at = ?
          WHERE id = ? AND moderation_status = 'pending' AND deleted_at IS NULL`)
        .run(status, result(components), now, job.target_id).changes;
      if (changed && job.target_kind === "tag") {
        const upd = this.ctx.db.prepare("UPDATE media SET moderation_status = ?, moderation_result = ? WHERE id = ?");
        const all = this.ctx.db.prepare("SELECT id FROM media WHERE tag_id = ?").all(job.target_id) as { id: string }[];
        for (const m of all) {
          const own = components.filter((c) => c.media_id === m.id);
          upd.run(approved && own.every((c) => c.approved) ? "approved" : "rejected", result(own), m.id);
        }
      }
      this.ctx.jobs.remove(job.id);
      return changed ? status : "stale";
    });
  }
}
